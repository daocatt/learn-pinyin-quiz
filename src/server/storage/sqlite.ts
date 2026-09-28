import { DatabaseSync } from 'node:sqlite'
import type { QuizStorage } from './types.ts'

export class SqliteQuizStorage implements QuizStorage {
  private db: DatabaseSync | null = null
  private readonly dbPath: string

  constructor(dbPath = 'data/quiz.db') {
    this.dbPath = dbPath
  }

  async init(): Promise<void> {
    if (this.db) return
    const db = new DatabaseSync(this.dbPath)
    db.exec(`
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
      CREATE INDEX IF NOT EXISTS idx_questions_round_id ON questions(round_id);
    `)

    const columns = db.prepare('PRAGMA table_info(rounds)').all() as { name: string }[]
    if (!columns.some((column) => column.name === 'session')) {
      db.exec('ALTER TABLE rounds ADD COLUMN session TEXT')
    }
    db.exec('CREATE INDEX IF NOT EXISTS rounds_session ON rounds(session)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_rounds_created_at ON rounds(created_at)')

    this.db = db
  }

  private getDb(): DatabaseSync {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.')
    }
    return this.db
  }

  async getLastRound(session: string): Promise<{ id: number } | null> {
    const db = this.getDb()
    const row = db
      .prepare('SELECT id FROM rounds WHERE session = ? ORDER BY id DESC LIMIT 1')
      .get(session) as { id: number } | undefined
    return row ?? null
  }

  async getRoundQuestions(roundId: number): Promise<{ item: string }[]> {
    const db = this.getDb()
    return db
      .prepare('SELECT item FROM questions WHERE round_id = ?')
      .all(roundId) as { item: string }[]
  }

  async getRecentAskedKeys(session: string, roundLimit: number = 3): Promise<string[]> {
    const db = this.getDb()
    const rows = db
      .prepare(
        `SELECT DISTINCT q.item
           FROM questions q
           JOIN rounds r ON r.id = q.round_id
          WHERE r.session = ?
            AND r.id IN (SELECT id FROM rounds WHERE session = ? ORDER BY id DESC LIMIT ?)`,
      )
      .all(session, session, roundLimit) as { item: string }[]
    return rows.map((r) => r.item)
  }

  async getMissedItems(session: string): Promise<{ item: string; missed_at: string }[]> {
    const db = this.getDb()
    return db
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
      .all(session, session) as { item: string; missed_at: string }[]
  }

  async createRound(session: string, createdAt: string): Promise<number> {
    const db = this.getDb()
    const result = db
      .prepare('INSERT INTO rounds (session, created_at) VALUES (?, ?)')
      .run(session, createdAt)
    return Number(result.lastInsertRowid)
  }

  async insertQuestion(
    roundId: number,
    position: number,
    item: string,
    isRetry: boolean,
  ): Promise<number> {
    const db = this.getDb()
    const result = db
      .prepare(
        'INSERT INTO questions (round_id, position, item, is_retry) VALUES (?, ?, ?, ?)',
      )
      .run(roundId, position, item, isRetry ? 1 : 0)
    return Number(result.lastInsertRowid)
  }

  async getQuestion(
    questionId: number,
    roundId: number,
    session: string,
  ): Promise<{ item: string; is_retry: number; choice: number | null } | null> {
    const db = this.getDb()
    const row = db
      .prepare(
        `SELECT q.item, q.is_retry, q.choice
           FROM questions q
           JOIN rounds r ON r.id = q.round_id
          WHERE q.id = ? AND q.round_id = ? AND r.session = ?`,
      )
      .get(questionId, roundId, session) as
      | { item: string; is_retry: number; choice: number | null }
      | undefined
    return row ?? null
  }

  async updateQuestionAnswer(
    questionId: number,
    choice: number,
    correct: boolean,
    answeredAt: string,
  ): Promise<void> {
    const db = this.getDb()
    db.prepare('UPDATE questions SET choice = ?, correct = ?, answered_at = ? WHERE id = ?').run(
      choice,
      correct ? 1 : 0,
      answeredAt,
      questionId,
    )
  }

  async getQuestionCorrect(questionId: number): Promise<boolean | null> {
    const db = this.getDb()
    const row = db.prepare('SELECT correct FROM questions WHERE id = ?').get(questionId) as
      | { correct: number | null }
      | undefined
    if (!row || row.correct === null) return null
    return row.correct === 1
  }

  async getRoundScore(roundId: number): Promise<number> {
    const db = this.getDb()
    const row = db
      .prepare('SELECT COUNT(*) AS n FROM questions WHERE round_id = ? AND correct = 1')
      .get(roundId) as { n: number }
    return row.n
  }

  async getRoundHistory(session: string, limit = 10): Promise<
    Array<{
      id: number
      createdAt: string
      total: number
      score: number
    }>
  > {
    const db = this.getDb()
    const rows = db
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
      .all(session, limit) as Array<{
        id: number
        created_at: string
        total: number
        score: number | null
      }>
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      total: r.total,
      score: r.score ?? 0,
    }))
  }

  async cleanupExpiredRounds(retentionDays = 90): Promise<{ deletedRounds: number }> {
    const db = this.getDb()
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    db.prepare(
      `DELETE FROM questions WHERE round_id IN (
         SELECT id FROM rounds WHERE created_at < ?
       )`,
    ).run(cutoff)

    const res = db.prepare('DELETE FROM rounds WHERE created_at < ?').run(cutoff) as {
      changes?: number
    }
    return { deletedRounds: res?.changes ?? 0 }
  }
}

