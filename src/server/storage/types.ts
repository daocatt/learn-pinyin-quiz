/**
 * Storage interface for quiz database operations.
 * Allows transparent switching between local SQLite (DatabaseSync) and Cloudflare D1.
 */
export interface QuizStorage {
  init(): Promise<void>
  getLastRound(session: string): Promise<{ id: number } | null>
  getRoundQuestions(roundId: number): Promise<{ item: string }[]>
  getRecentAskedKeys(session: string, roundLimit?: number): Promise<string[]>
  getMissedItems(session: string): Promise<{ item: string; missed_at: string }[]>
  createRound(session: string, createdAt: string): Promise<number>
  insertQuestion(
    roundId: number,
    position: number,
    item: string,
    isRetry: boolean,
  ): Promise<number>
  getQuestion(
    questionId: number,
    roundId: number,
    session: string,
  ): Promise<{ item: string; is_retry: number; choice: number | null } | null>
  updateQuestionAnswer(
    questionId: number,
    choice: number,
    correct: boolean,
    answeredAt: string,
  ): Promise<void>
  getQuestionCorrect(questionId: number): Promise<boolean | null>
  getRoundScore(roundId: number): Promise<number>
  getRoundHistory(session: string, limit?: number): Promise<
    Array<{
      id: number
      createdAt: string
      total: number
      score: number
    }>
  >
  cleanupExpiredRounds(retentionDays?: number): Promise<{ deletedRounds: number }>
}

