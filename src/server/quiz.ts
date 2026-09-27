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
  const retry = missed
    .map((row) => byKey.get(row.item))
    .filter((item): item is QuizItem => item !== undefined)
    .slice(0, RETRY_MAX)
  const retryKeys = new Set(retry.map((item) => item.key))

  const fresh = shuffled(
    pool.filter((item) => !retryKeys.has(item.key) && !askedLastRound.has(item.key)),
  )
  const chosen = shuffled([...retry, ...fresh.slice(0, ROUND_SIZE - retry.length)])

  const roundId = await storage.createRound(session, new Date().toISOString())

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
