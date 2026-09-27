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
    const swap = out[i]
    out[j] = swap
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

  const previous = await storage.getLastRound(session)
  const askedLastRound = new Set(
    previous ? (await storage.getRoundQuestions(previous.id)).map((row) => row.item) : [],
  )

  const missed = await storage.getMissedItems(session)

  // 1. Pick retry items (ensuring distinct syllables)
  const retry: QuizItem[] = []
  const usedSyllables = new Set<string>()
  const usedKeys = new Set<string>()

  for (const row of missed) {
    const item = byKey.get(row.item)
    if (!item) continue
    if (usedSyllables.has(item.syllable)) continue
    retry.push(item)
    usedSyllables.add(item.syllable)
    usedKeys.add(item.key)
    if (retry.length >= RETRY_MAX) break
  }

  // 2. Pick 2-3 fun / tongue-twisting challenge words (with distinct syllables)
  const funSelected: QuizItem[] = []
  const funCandidates = shuffled(pool.filter((i) => i.isFun && !usedKeys.has(i.key)))
  for (const item of funCandidates) {
    if (usedSyllables.has(item.syllable)) continue
    funSelected.push(item)
    usedSyllables.add(item.syllable)
    usedKeys.add(item.key)
    if (funSelected.length >= 3 || retry.length + funSelected.length >= ROUND_SIZE) break
  }

  // 3. Fill the remaining spots with fresh items (distinct syllables, avoid last round)
  const freshCandidates = shuffled(
    pool.filter(
      (item) => !usedKeys.has(item.key) && !askedLastRound.has(item.key),
    ),
  )

  const fresh: QuizItem[] = []
  const neededFreshCount = ROUND_SIZE - (retry.length + funSelected.length)
  for (const item of freshCandidates) {
    if (usedSyllables.has(item.syllable)) continue
    fresh.push(item)
    usedSyllables.add(item.syllable)
    usedKeys.add(item.key)
    if (fresh.length >= neededFreshCount) break
  }

  // Safety fallback: if pool somehow doesn't have enough unique syllables, fill up to ROUND_SIZE
  if (retry.length + funSelected.length + fresh.length < ROUND_SIZE) {
    for (const item of freshCandidates) {
      if (usedKeys.has(item.key)) continue
      fresh.push(item)
      usedKeys.add(item.key)
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
