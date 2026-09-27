import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { chartData } from '../shared/chart.ts'
import { answerQuestion, createRound } from './quiz.ts'
import { getStorage } from './storage/index.ts'
import type { D1Database } from './storage/d1.ts'

export type Bindings = {
  DB?: D1Database
  // R2 bucket binding reserve (as alternative/future option for audios)
  PINYIN_AUDIOS?: {
    get(key: string): Promise<{ body: ReadableStream; headers: Headers } | null>
  }
}

export const cfApp = new Hono<{
  Bindings: Bindings
  Variables: { session: string }
}>()

const SESSION_COOKIE = 'pinyin_sid'
const SESSION_MAX_AGE = 60 * 60 * 24 * 365
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

cfApp.use('*', async (c, next) => {
  const existing = getCookie(c, SESSION_COOKIE)
  const session = existing && UUID.test(existing) ? existing : crypto.randomUUID()
  if (session !== existing) {
    setCookie(c, SESSION_COOKIE, session, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: SESSION_MAX_AGE,
    })
  }
  c.set('session', session)
  await next()
})

cfApp.get('/api/chart', (c) => c.json(chartData))

cfApp.get('/api/health', (c) => c.json({ ok: true, platform: 'cloudflare' }))

/** Start a round of questions */
cfApp.post('/api/quiz/round', async (c) => {
  const storage = await getStorage(c.env?.DB)
  const round = await createRound(storage, c.get('session'))
  return c.json(round)
})

/** Grade one answer */
cfApp.post('/api/quiz/answer', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    roundId?: unknown
    questionId?: unknown
    choice?: unknown
  } | null

  const roundId = Number(body?.roundId)
  const questionId = Number(body?.questionId)
  const choice = Number(body?.choice)
  if (!Number.isInteger(roundId) || !Number.isInteger(questionId) || !Number.isInteger(choice)) {
    return c.json({ error: 'roundId, questionId and choice must be integers' }, 400)
  }
  if (choice < 1 || choice > 4) {
    return c.json({ error: 'choice must be a tone between 1 and 4' }, 400)
  }

  const storage = await getStorage(c.env?.DB)
  const result = await answerQuestion(storage, c.get('session'), roundId, questionId, choice)
  if (!result) return c.json({ error: 'no such question in this round' }, 404)
  return c.json(result)
})

/** Round history */
cfApp.get('/api/quiz/history', async (c) => {
  const storage = await getStorage(c.env?.DB)
  const history = await storage.getRoundHistory(c.get('session'), 15)
  return c.json(history)
})

/**
 * Optional R2 audio fallback route:
 * If an R2 bucket is bound to PINYIN_AUDIOS, serve from R2;
 * Otherwise, Cloudflare Static Assets will handle /audio/*.mp3 directly.
 */
cfApp.get('/audio/:filename', async (c) => {
  const filename = c.req.param('filename')
  if (c.env?.PINYIN_AUDIOS) {
    const object = await c.env.PINYIN_AUDIOS.get(filename)
    if (object) {
      c.header('Content-Type', 'audio/mpeg')
      c.header('Cache-Control', 'public, max-age=31536000, immutable')
      return c.body(object.body)
    }
  }
  return c.notFound()
})

export default cfApp
