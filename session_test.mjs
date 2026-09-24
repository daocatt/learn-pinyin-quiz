/**
 * Session isolation check.
 *
 * Two browsers sharing one deployment must not share a mistake pool, and must
 * not be able to grade or read the score of each other's questions.
 *
 * This is a pure API test — no browser, just two cookie jars — so it runs in a
 * couple of seconds. It needs a server already running:
 *
 *   node session_test.mjs                          # http://localhost:5188
 *   BASE=http://localhost:3100 node session_test.mjs
 *
 * The "B has no retries of its own" assertion is the one that catches the
 * original bug: before rounds were scoped to a session, the retry query scanned
 * every round in the database, so A's mistake came back as B's 重做.
 */
import { DatabaseSync } from 'node:sqlite'

const BASE = process.env.BASE ?? 'http://localhost:5188'
const DB = process.env.DB ?? 'data/quiz.db'

const failures = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}`)
}
const checkThat = (label, ok, detail = '') => {
  if (!ok) failures.push(`${label} ${detail}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

/** A cookie jar is just name -> value. */
const newJar = () => ({})
const header = (jar) =>
  Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')

function absorb(jar, response) {
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(';')[0]
    const eq = pair.indexOf('=')
    jar[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
}

async function post(path, jar, body) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (Object.keys(jar).length) headers.cookie = header(jar)
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const setCookie = response.headers.getSetCookie()
  absorb(jar, response)
  return { status: response.status, json: await response.json().catch(() => null), setCookie }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The server holds the only write handle, so read through a second connection.
const db = new DatabaseSync(DB)
const rowOf = (questionId) => db.prepare('SELECT item FROM questions WHERE id = ?').get(questionId)
const toneOf = (questionId) => {
  const row = rowOf(questionId)
  return row ? Number(row.item.slice(-1)) : null
}

/**
 * A round's questions carry a syllable, but the pool holds several items per
 * syllable — `ru2`, `ru3`, `ru4` all read "ru". So a round has to be matched on
 * the item key, not the syllable, or a fresh question for a different tone of
 * the same syllable passes for the carried-over one.
 */
const itemOf = (questionId) => rowOf(questionId)?.item ?? null

/**
 * Rounds written before the `session` column existed keep NULL on purpose —
 * they belong to nobody. So the "nobody writes a sessionless round" check has
 * to count only what this run writes, or it would report every legacy row as a
 * failure on a database that has just been upgraded.
 *
 * Two states have to be tolerated here. Opening this connection is what creates
 * the file, so on a first run there is no `rounds` table at all yet — the server
 * builds it on its first quiz request, i.e. the POST below. And on a database
 * that has not been upgraded yet the table exists but `session` does not. Either
 * way `MAX(id)` answers without naming the new column; only the table needs
 * guarding.
 */
const hasRounds =
  db
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'rounds'")
    .get().n > 0
const baseline = hasRounds ? db.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM rounds').get().n : 0

console.log('--- the cookie ---')
const a = newJar()
const roundA = await post('/api/quiz/round', a)
check('POST /api/quiz/round succeeds', roundA.status, 200)
check('round has 20 questions', roundA.json.questions.length, 20)
checkThat('a session cookie was issued', 'pinyin_sid' in a, JSON.stringify(Object.keys(a)))
const issued = roundA.setCookie.find((line) => line.startsWith('pinyin_sid=')) ?? ''
checkThat('cookie is HttpOnly', /HttpOnly/i.test(issued), issued)
checkThat('cookie is SameSite=Lax', /SameSite=Lax/i.test(issued), issued)
checkThat('cookie has a long Max-Age', /Max-Age=\d{6,}/i.test(issued), issued)

const again = await post('/api/quiz/round', a)
check('the same jar is not re-minted a cookie', again.setCookie.length, 0)
check('A keeps one session', Object.keys(a).length, 1)

console.log('\n--- A gets a question wrong ---')
const target = roundA.json.questions[0]
const correct = toneOf(target.id)
checkThat('read the correct tone from the database', correct !== null, `tone=${correct}`)
const wrong = correct === 1 ? 2 : 1
const graded = await post('/api/quiz/answer', a, {
  roundId: roundA.json.roundId,
  questionId: target.id,
  choice: wrong,
})
check('A is graded', graded.status, 200)
check('A answered wrongly', graded.json.correct, false)
check('the score does not move', graded.json.score, 0)

console.log('\n--- B is a different person ---')
const b = newJar()
const roundB = await post('/api/quiz/round', b)
check('B gets its own round', roundB.status, 200)
checkThat('B has a different session', b.pinyin_sid !== a.pinyin_sid, `${a.pinyin_sid} vs ${b.pinyin_sid}`)
checkThat(
  "B's round is a different round",
  roundB.json.roundId !== roundA.json.roundId,
  `A=${roundA.json.roundId} B=${roundB.json.roundId}`,
)
// This is the assertion the original bug fails.
check('B has no retries of its own', roundB.json.questions.filter((q) => q.isRetry).length, 0)
// A's mistake may still turn up in B's round as an ordinary fresh question —
// that is a fair draw from the pool, not a leak. What must not happen is the
// server handing it to B as a carry-over.
const missed = itemOf(target.id)
checkThat(
  "A's mistake is not carried into B's round",
  !roundB.json.questions.some((q) => itemOf(q.id) === missed && q.isRetry),
  `item=${missed}`,
)

console.log('\n--- B cannot touch A\'s round ---')
const cross = await post('/api/quiz/answer', b, {
  roundId: roundA.json.roundId,
  questionId: target.id,
  choice: correct,
})
check("grading A's question as B is rejected", cross.status, 404)
// That rejected request must not have disturbed A's row. The row's `item` is
// what `toneOf` reads, so a missing row would show up as a changed tone; the
// answer itself is checked on the next line, straight out of the table.
check("A's question is still there", toneOf(target.id) === correct ? 'stored' : 'missing', 'stored')
const stored = db.prepare('SELECT choice, correct FROM questions WHERE id = ?').get(target.id)
check('A still has the wrong answer on record', [stored.choice, stored.correct], [wrong, 0])

console.log('\n--- A\'s own retry still works ---')
const roundA2 = await post('/api/quiz/round', a)
const carried = roundA2.json.questions.find((q) => itemOf(q.id) === missed)
checkThat('A\'s missed item comes back', carried !== undefined, missed)
check('and it is flagged as a retry', carried?.isRetry, true)

console.log('\n--- hygiene ---')
const sessions = db
  .prepare('SELECT COUNT(DISTINCT session) AS n FROM rounds WHERE session IS NOT NULL')
  .get().n
checkThat('rounds are stored with a session', sessions >= 2, `${sessions} distinct sessions`)
const nulls = db
  .prepare('SELECT COUNT(*) AS n FROM rounds WHERE id > ? AND session IS NULL')
  .get(baseline).n
check('no round this run wrote is missing a session', nulls, 0)

// Leave the database as we found it: drop the rounds this test created.
db.prepare('DELETE FROM questions WHERE round_id IN (SELECT id FROM rounds WHERE session IN (?, ?))').run(
  a.pinyin_sid,
  b.pinyin_sid,
)
db.prepare('DELETE FROM rounds WHERE session IN (?, ?)').run(a.pinyin_sid, b.pinyin_sid)

await sleep(0)
console.log(`\n${failures.length ? `${failures.length} FAILURE(S)` : 'all checks passed'}`)
for (const f of failures) console.log('  -', f)
process.exitCode = failures.length ? 1 : 0
