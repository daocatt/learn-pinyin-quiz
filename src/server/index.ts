import { readFile } from 'node:fs/promises'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { ViteDevServer } from 'vite'
import { chartData } from '../shared/chart.ts'
import { answerQuestion, createRound } from './quiz.ts'

/**
 * The application. It is used twice:
 *  - in development, mounted inside the Vite dev server by @hono/vite-dev-server
 *  - in production, wrapped by `src/server/serve.ts`
 *
 * @hono/vite-dev-server requires a default export.
 */
export const app = new Hono()

/**
 * This is a private study aid, not a public site. `robots.txt` only binds
 * crawlers that choose to obey it, so the header is what actually enforces it —
 * search engines honour `X-Robots-Tag` even on responses they already fetched.
 * `index.html` carries the same directive as a meta tag.
 */
app.use('*', async (c, next) => {
  await next()
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex')
})

/** Served from `public/`, so it also needs a route in dev (see the catch-all below). */
app.get('/robots.txt', serveStatic({ root: './public' }))

app.get('/api/chart', (c) => c.json(chartData))

app.get('/api/health', (c) => c.json({ ok: true }))

/** Start a fresh round of 20 questions. */
app.post('/api/quiz/round', (c) => c.json(createRound()))

/** Grade one answer. Locked after the first submission. */
app.post('/api/quiz/answer', async (c) => {
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

  const result = answerQuestion(roundId, questionId, choice)
  if (!result) return c.json({ error: 'no such question in this round' }, 404)
  return c.json(result)
})

/** Syllable recordings live in `public/audio` as `{syllable}{tone}.mp3`. */
app.use(
  '/audio/*',
  serveStatic({
    root: './public',
    onFound: (_path, c) => {
      c.header('Cache-Control', 'public, max-age=31536000, immutable')
    },
  }),
)

/**
 * In development this app is mounted in front of the Vite middleware stack, so
 * nothing else answers `/`. Vite's dev server is handed to us through `c.env`
 * (see vite.config.ts) so we can run the real `transformIndexHtml`, which keeps
 * HMR and React Fast Refresh working.
 */
if (process.env.NODE_ENV !== 'production') {
  app.get('*', async (c) => {
    const html = await readFile('./index.html', 'utf-8')
    const vite = (c.env as { viteDevServer?: ViteDevServer }).viteDevServer
    return c.html(vite ? await vite.transformIndexHtml(c.req.path, html) : html)
  })
}

export default app
