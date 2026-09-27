import {
  keyAudioUrl,
  parseKey,
  quizPool,
  type QuizAnswer,
  type QuizItem,
  type QuizQuestion,
  type QuizRound,
} from '../shared/quiz.ts'
import type { QuizStorage } from './storage/types.ts'

/** Questions per round. */
const ROUND_SIZE = 20

/** How many previously-missed items a round folds back in. */
const RETRY_MAX = 8

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

function question(item: QuizItem, id: number, isRetry: boolean): QuizQuestion {
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

export async function createRound(storage: QuizStorage, session: string): Promise<QuizRound> {
  const pool = quizPool()
  const byKey = new Map(pool.map((item) => [item.key, item]))

  // Avoid items asked in recent rounds (last 2-3 rounds) for high freshness
  const recentAskedKeys = new Set(await storage.getRecentAskedKeys(session, 3))
  const missed = await storage.getMissedItems(session)

  // Track key uniqueness (strictly 1 key per round) and syllable frequency (max 2 per syllable)
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

  // 1. Pick retry items (missed previously)
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

  // 3. Fill the remaining spots with fresh items (preferring items not asked recently)
  const unaskedFresh = shuffled(
    pool.filter((item) => !usedKeys.has(item.key) && !recentAskedKeys.has(item.key)),
  )

  const fresh: QuizItem[] = []
  const neededFreshCount = ROUND_SIZE - (retry.length + funSelected.length)
  for (const item of unaskedFresh) {
    if (!canAdd(item)) continue
    fresh.push(item)
    add(item)
    if (fresh.length >= neededFreshCount) break
  }

  // If still need items, fall back to any eligible items in pool
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


  const roundId = await storage.createRound(session, new Date().toISOString())
  const retryKeys = new Set(retry.map((item) => item.key))

  const questions: QuizQuestion[] = []
  for (let position = 0; position < chosen.length; position++) {
    const item = chosen[position]
    const isRetry = retryKeys.has(item.key)
    const id = await storage.insertQuestion(roundId, position, item.key, isRetry)
    questions.push(question(item, id, isRetry))
  }

  return {
    roundId,
    total: chosen.length,
    questions,
  }
}

export async function answerQuestion(
  storage: QuizStorage,
  session: string,
  roundId: number,
  questionId: number,
  choice: number,
): Promise<QuizAnswer | null> {
  const found = await storage.getQuestion(questionId, roundId, session)
  if (!found) return null

  const item = parseKey(found.item)
  if (!item) return null

  if (found.choice === null) {
    await storage.updateQuestionAnswer(
      questionId,
      choice,
      choice === item.tone,
      new Date().toISOString(),
    )
  }

  const correct = await storage.getQuestionCorrect(questionId)
  const score = await storage.getRoundScore(roundId)

  return {
    correct: correct === true,
    answer: item.tone,
    score,
    isRetry: found.is_retry === 1,
  }
}

export async function getHistory(storage: QuizStorage, session: string) {
  return await storage.getRoundHistory(session, 10)
}
