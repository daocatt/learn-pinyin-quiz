import {
  keyAudioUrl,
  parseKey,
  quizPool,
  type QuizAnswer,
  type QuizItem,
  type QuizQuestion,
  type QuizRound,
} from '../../shared/quiz.ts'

const ROUND_SIZE = 20
const RETRY_MAX = 8

const STORAGE_MISSED_KEY = 'pinyin_quiz_missed_v1'
const STORAGE_RECENT_KEY = 'pinyin_quiz_recent_keys_v1'
const MAX_MISSED_STORED = 200
const MAX_RECENT_KEYS = 60

export interface MissedItemRecord {
  item: string
  missedAt: string
}

export function getLocalMissedItems(): MissedItemRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_MISSED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveLocalMissedItems(items: MissedItemRecord[]): void {
  try {
    localStorage.setItem(STORAGE_MISSED_KEY, JSON.stringify(items.slice(0, MAX_MISSED_STORED)))
  } catch {
    // Ignore storage errors
  }
}

export function getLocalRecentKeys(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveLocalRecentKeys(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_RECENT_KEY, JSON.stringify(keys.slice(-MAX_RECENT_KEYS)))
  } catch {
    // Ignore storage errors
  }
}

function recordAnswerInStorage(key: string, correct: boolean): void {
  const missedList = getLocalMissedItems()
  if (correct) {
    // If answered correctly, remove from missed items
    const filtered = missedList.filter((m) => m.item !== key)
    if (filtered.length !== missedList.length) {
      saveLocalMissedItems(filtered)
    }
  } else {
    // If answered incorrectly, record or update missed timestamp
    const filtered = missedList.filter((m) => m.item !== key)
    const updated: MissedItemRecord[] = [
      { item: key, missedAt: new Date().toISOString() },
      ...filtered,
    ]
    saveLocalMissedItems(updated)
  }
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

function buildQuestion(item: QuizItem, id: number, isRetry: boolean): QuizQuestion {
  const target = keyAudioUrl(item.key)
  const word = (item.wordKeys ?? []).map(keyAudioUrl).filter((url) => url !== null)
  return {
    id,
    syllable: item.syllable,
    ...(item.word ? { word: item.word } : {}),
    isRetry,
    isFun: item.isFun,
    audio: { target: target ?? '', word },
  }
}

// In-memory state for current round
interface ActiveRoundState {
  roundId: number
  items: Map<number, { item: QuizItem; isRetry: boolean }>
  score: number
  answered: Set<number>
}

let activeRound: ActiveRoundState | null = null

/**
 * Generate a fresh round of 20 questions purely client-side using localStorage.
 */
export function createClientRound(): QuizRound {
  const pool = quizPool()
  const byKey = new Map(pool.map((item) => [item.key, item]))

  const recentKeys = new Set(getLocalRecentKeys())
  const missed = getLocalMissedItems()

  const usedKeys = new Set<string>()
  const syllableCounts = new Map<string, number>()

  const canAdd = (item: QuizItem): boolean => {
    if (usedKeys.has(item.key)) return false
    const count = syllableCounts.get(item.syllable) ?? 0
    return count < 2
  }

  const add = (item: QuizItem): void => {
    usedKeys.add(item.key)
    syllableCounts.set(item.syllable, (syllableCounts.get(item.syllable) ?? 0) + 1)
  }

  // 1. Pick retry items (previously missed)
  const retry: QuizItem[] = []
  for (const row of missed) {
    const item = byKey.get(row.item)
    if (!item) continue
    if (!canAdd(item)) continue
    retry.push(item)
    add(item)
    if (retry.length >= RETRY_MAX) break
  }

  // 2. Pick 2-3 fun / tongue-twisting challenge words
  const funSelected: QuizItem[] = []
  const funCandidates = shuffled(pool.filter((i) => i.isFun && !usedKeys.has(i.key)))
  for (const item of funCandidates) {
    if (!canAdd(item)) continue
    funSelected.push(item)
    add(item)
    if (funSelected.length >= 3 || retry.length + funSelected.length >= ROUND_SIZE) break
  }

  // 3. Fill remaining spots with fresh items (preferring items not asked recently)
  const unaskedFresh = shuffled(
    pool.filter((item) => !usedKeys.has(item.key) && !recentKeys.has(item.key)),
  )

  const fresh: QuizItem[] = []
  const neededFreshCount = ROUND_SIZE - (retry.length + funSelected.length)
  for (const item of unaskedFresh) {
    if (!canAdd(item)) continue
    fresh.push(item)
    add(item)
    if (fresh.length >= neededFreshCount) break
  }

  // Fallback if needed
  if (retry.length + funSelected.length + fresh.length < ROUND_SIZE) {
    const fallbackCandidates = shuffled(pool.filter((item) => !usedKeys.has(item.key)))
    for (const item of fallbackCandidates) {
      if (!canAdd(item)) continue
      fresh.push(item)
      add(item)
      if (retry.length + funSelected.length + fresh.length >= ROUND_SIZE) break
    }
  }

  const chosen = shuffled([...retry, ...funSelected, ...fresh])
  const retryKeys = new Set(retry.map((item) => item.key))
  const roundId = Date.now()

  const itemsMap = new Map<number, { item: QuizItem; isRetry: boolean }>()
  const questions: QuizQuestion[] = []

  for (let position = 0; position < chosen.length; position++) {
    const item = chosen[position]
    const isRetry = retryKeys.has(item.key)
    const id = position + 1
    itemsMap.set(id, { item, isRetry })
    questions.push(buildQuestion(item, id, isRetry))
  }

  // Update recent keys in localStorage
  saveLocalRecentKeys([...Array.from(recentKeys), ...chosen.map((c) => c.key)])

  // Store active round in memory
  activeRound = {
    roundId,
    items: itemsMap,
    score: 0,
    answered: new Set(),
  }

  return {
    roundId,
    total: chosen.length,
    questions,
  }
}

/**
 * Grade one answer client-side and update localStorage missed-items.
 */
export function gradeClientAnswer(
  roundId: number,
  questionId: number,
  choice: number,
): QuizAnswer | null {
  if (!activeRound || activeRound.roundId !== roundId) {
    return null
  }

  const entry = activeRound.items.get(questionId)
  if (!entry) return null

  const { item, isRetry } = entry
  const parsed = parseKey(item.key)
  if (!parsed) return null

  const isCorrect = choice === parsed.tone

  if (!activeRound.answered.has(questionId)) {
    activeRound.answered.add(questionId)
    if (isCorrect) {
      activeRound.score += 1
    }
    recordAnswerInStorage(item.key, isCorrect)
  }

  return {
    correct: isCorrect,
    answer: parsed.tone,
    score: activeRound.score,
    isRetry,
  }
}
