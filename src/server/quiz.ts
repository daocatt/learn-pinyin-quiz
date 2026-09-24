import { DatabaseSync } from 'node:sqlite'
import {
  keyAudioUrl,
  parseKey,
  quizPool,
  type QuizAnswer,
  type QuizItem,
  type QuizQuestion,
  type QuizRound,
} from '../shared/quiz.ts'

/**
 * Quiz rounds are persisted so a new round can avoid the previous one's items
 * and can fold back the items the learner got wrong.
 *
 * `node:sqlite` ships with Node 24, so this needs no dependency; it is still
 * flagged experimental, which is why it is wrapped behind `database()`.
 */
const DB_PATH = 'data/quiz.db'

/** Questions per round. */
const ROUND_SIZE = 20

/** How many previously-missed items a round folds back in. */
const RETRY_MAX = 8

let handle: DatabaseSync | undefined

/**
 * Rounds are scoped to a browser session so that several people can use one
 * deployment without sharing a mistake pool. `session` is nullable because it
 * was added after the table existed — rows from before it carry NULL and simply
 * belong to nobody, so they never show up in anyone's history.
 */
function database(): DatabaseSync {
  if (handle) return handle
  const db = new DatabaseSync(DB_PATH)
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
  `)

  // `CREATE TABLE IF NOT EXISTS` is a no-op on a database that predates the
  // column, so add it explicitly — and before the index that names it, or the
  // index creation fails with "no such column: session". SQLite cannot add a
  // NOT NULL column without a default, hence the nullable column above.
  const columns = db.prepare('PRAGMA table_info(rounds)').all() as { name: string }[]
  if (!columns.some((column) => column.name === 'session')) {
    db.exec('ALTER TABLE rounds ADD COLUMN session TEXT')
  }
  db.exec('CREATE INDEX IF NOT EXISTS rounds_session ON rounds(session)')

  // Only publish the handle once setup has actually finished. Assigning it first
  // would leave a half-migrated singleton behind, and every later request would
  // skip the migration and fail on the missing column instead.
  handle = db
  return handle
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = out[i]
    out[i] = out[j]
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
    // Every pool item comes from HANZI, so it always has a recording.
    audio: { target: target ?? '', word },
  }
}

/**
 * Start a round for one session: up to RETRY_MAX items that session missed
 * earlier and has not yet redeemed, plus enough fresh items to fill it. Fresh
 * items are drawn from what that session's previous round did not ask about, so
 * two consecutive rounds cannot overlap — except for the retries, which are
 * carried over on purpose. The whole set is then shuffled so the retries are not
 * always the first questions.
 *
 * Every query here is filtered by `session`. Without that, a round would be
 * deduplicated against whoever happened to create a round last, and the retry
 * pool would be shared by everyone using the deployment.
 */
export function createRound(session: string): QuizRound {
  const db = database()
  const pool = quizPool()
  const byKey = new Map(pool.map((item) => [item.key, item]))

  const previous = db
    .prepare('SELECT id FROM rounds WHERE session = ? ORDER BY id DESC LIMIT 1')
    .get(session) as { id: number } | undefined
  const askedLastRound = new Set(
    previous
      ? (
          db.prepare('SELECT item FROM questions WHERE round_id = ?').all(previous.id) as {
            item: string
          }[]
        ).map((row) => row.item)
      : [],
  )

  // Missed at some point and never answered correctly since, within this
  // session. Most recent first, so a round revisits whatever is freshest in the
  // learner's memory.
  const missed = db
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

  const retry = missed
    .map((row) => byKey.get(row.item))
    .filter((item): item is QuizItem => item !== undefined)
    .slice(0, RETRY_MAX)
  const retryKeys = new Set(retry.map((item) => item.key))

  // The pool is ~1250 items against 20 questions, so the draw always fills.
  const fresh = shuffled(pool.filter((item) => !retryKeys.has(item.key) && !askedLastRound.has(item.key)))
  const chosen = shuffled([...retry, ...fresh.slice(0, ROUND_SIZE - retry.length)])

  const roundId = Number(
    db
      .prepare('INSERT INTO rounds (session, created_at) VALUES (?, ?)')
      .run(session, new Date().toISOString()).lastInsertRowid,
  )
  const insert = db.prepare(
    'INSERT INTO questions (round_id, position, item, is_retry) VALUES (?, ?, ?, ?)',
  )

  return {
    roundId,
    total: chosen.length,
    questions: chosen.map((item, position) => {
      const isRetry = retryKeys.has(item.key)
      const id = Number(insert.run(roundId, position, item.key, isRetry ? 1 : 0).lastInsertRowid)
      return question(item, id, isRetry)
    }),
  }
}

function scoreOf(roundId: number): number {
  const row = database()
    .prepare('SELECT COUNT(*) AS n FROM questions WHERE round_id = ? AND correct = 1')
    .get(roundId) as { n: number }
  return row.n
}

/**
 * Grade an answer. The first answer is final: re-submitting returns the stored
 * result and never scores twice, so the UI can safely retry a failed request.
 *
 * Returns null when the question is not part of the round — and, because the
 * lookup joins `rounds`, also when the round belongs to a different session.
 * That keeps one browser from grading, or reading the score of, another's round.
 */
export function answerQuestion(
  session: string,
  roundId: number,
  questionId: number,
  choice: number,
): QuizAnswer | null {
  const db = database()
  const found = db
    .prepare(
      `SELECT q.item, q.is_retry, q.choice
         FROM questions q
         JOIN rounds r ON r.id = q.round_id
        WHERE q.id = ? AND q.round_id = ? AND r.session = ?`,
    )
    .get(questionId, roundId, session) as
    | { item: string; is_retry: number; choice: number | null }
    | undefined
  if (!found) return null

  const item = parseKey(found.item)
  if (!item) return null

  if (found.choice === null) {
    db.prepare('UPDATE questions SET choice = ?, correct = ?, answered_at = ? WHERE id = ?').run(
      choice,
      choice === item.tone ? 1 : 0,
      new Date().toISOString(),
      questionId,
    )
  }

  const stored = db.prepare('SELECT correct FROM questions WHERE id = ?').get(questionId) as {
    correct: number
  }
  return {
    correct: stored.correct === 1,
    answer: item.tone,
    score: scoreOf(roundId),
    isRetry: found.is_retry === 1,
  }
}
