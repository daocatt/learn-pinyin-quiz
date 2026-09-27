import type { QuizStorage } from './types.ts'

/**
 * Minimal interface representing Cloudflare D1 Database binding
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(query: string): Promise<D1ExecResult>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  run<T = unknown>(): Promise<D1Response<T>>
  all<T = unknown>(): Promise<D1Result<T>>
}

export interface D1Response<T = unknown> {
  success: boolean
  meta: {
    last_row_id?: number
    changes?: number
    duration?: number
    served_by?: string
  }
  results?: T[]
}

export interface D1Result<T = unknown> {
  results?: T[]
  success: boolean
}

export interface D1ExecResult {
  count: number
  duration: number
}

export class D1QuizStorage implements QuizStorage {
  private d1: D1Database

  constructor(d1: D1Database) {
    this.d1 = d1
  }

  async init(): Promise<void> {
    await this.d1.exec(`
      CREATE TABLE IF NOT EXISTS rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round_id INTEGER NOT NULL REFERENCES rounds(id),
        position INTEGER NOT NULL,
        item TEXT NOT NULL,
        is_retry INTEGER NOT NULL DEFAULT 0,
        choice INTEGER,
        correct INTEGER,
        answered_at TEXT
      );
      CREATE INDEX IF NOT EXISTS questions_item ON questions(item);
      CREATE INDEX IF NOT EXISTS rounds_session ON rounds(session);
    `)
  }

  async getLastRound(session: string): Promise<{ id: number } | null> {
    const row = await this.d1
      .prepare('SELECT id FROM rounds WHERE session = ? ORDER BY id DESC LIMIT 1')
      .bind(session)
      .first<{ id: number }>()
    return row ?? null
  }

  async getRoundQuestions(roundId: number): Promise<{ item: string }[]> {
    const res = await this.d1
      .prepare('SELECT item FROM questions WHERE round_id = ?')
      .bind(roundId)
      .all<{ item: string }>()
    return res.results ?? []
  }

  async getMissedItems(session: string): Promise<{ item: string; missed_at: string }[]> {
    const res = await this.d1
      .prepare(
        `SELECT q.item, MAX(q.answered_at) AS missed_at
           FROM questions q
           JOIN rounds r ON r.id = q.round_id
          WHERE r.session = ?
            AND q.correct = 0
            AND q.item NOT IN (
                  SELECT q2.item
                    FROM questions q2
                    JOIN rounds r2 ON r2.id = q2.round_id
                   WHERE r2.session = ? AND q2.correct = 1
                )
          GROUP BY q.item
          ORDER BY missed_at DESC`,
      )
      .bind(session, session)
      .all<{ item: string; missed_at: string }>()
    return res.results ?? []
  }

  async createRound(session: string, createdAt: string): Promise<number> {
    const res = await this.d1
      .prepare('INSERT INTO rounds (session, created_at) VALUES (?, ?)')
      .bind(session, createdAt)
      .run()
    return Number(res.meta.last_row_id)
  }

  async insertQuestion(
    roundId: number,
    position: number,
    item: string,
    isRetry: boolean,
  ): Promise<number> {
    const res = await this.d1
      .prepare(
        'INSERT INTO questions (round_id, position, item, is_retry) VALUES (?, ?, ?, ?)',
      )
      .bind(roundId, position, item, isRetry ? 1 : 0)
      .run()
    return Number(res.meta.last_row_id)
  }

  async getQuestion(
    questionId: number,
    roundId: number,
    session: string,
  ): Promise<{ item: string; is_retry: number; choice: number | null } | null> {
    const row = await this.d1
      .prepare(
        `SELECT q.item, q.is_retry, q.choice
           FROM questions q
           JOIN rounds r ON r.id = q.round_id
          WHERE q.id = ? AND q.round_id = ? AND r.session = ?`,
      )
      .bind(questionId, roundId, session)
      .first<{ item: string; is_retry: number; choice: number | null }>()
    return row ?? null
  }

  async updateQuestionAnswer(
    questionId: number,
    choice: number,
    correct: boolean,
    answeredAt: string,
  ): Promise<void> {
    await this.d1
      .prepare('UPDATE questions SET choice = ?, correct = ?, answered_at = ? WHERE id = ?')
      .bind(choice, correct ? 1 : 0, answeredAt, questionId)
      .run()
  }

  async getQuestionCorrect(questionId: number): Promise<boolean | null> {
    const row = await this.d1
      .prepare('SELECT correct FROM questions WHERE id = ?')
      .bind(questionId)
      .first<{ correct: number | null }>()
    if (!row || row.correct === null) return null
    return row.correct === 1
  }

  async getRoundScore(roundId: number): Promise<number> {
    const row = await this.d1
      .prepare('SELECT COUNT(*) AS n FROM questions WHERE round_id = ? AND correct = 1')
      .bind(roundId)
      .first<{ n: number }>()
    return row?.n ?? 0
  }

  async getRoundHistory(session: string, limit = 10): Promise<
    Array<{
      id: number
      createdAt: string
      total: number
      score: number
    }>
  > {
    const res = await this.d1
      .prepare(
        `SELECT r.id, r.created_at,
                COUNT(q.id) as total,
                SUM(CASE WHEN q.correct = 1 THEN 1 ELSE 0 END) as score
           FROM rounds r
           LEFT JOIN questions q ON q.round_id = r.id
          WHERE r.session = ?
          GROUP BY r.id
          ORDER BY r.id DESC
          LIMIT ?`,
      )
      .bind(session, limit)
      .all<{
        id: number
        created_at: string
        total: number
        score: number | null
      }>()
    return (res.results ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      total: r.total,
      score: r.score ?? 0,
    }))
  }
}
