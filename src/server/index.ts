import { readFile } from 'node:fs/promises'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { ViteDevServer } from 'vite'
import { chartData } from '../shared/chart.ts'

/**
 * The application. It is used twice:
 *  - in development, mounted inside the Vite dev server by @hono/vite-dev-server
 *  - in production, wrapped by `src/server/serve.ts`
 *
 * @hono/vite-dev-server requires a default export.
 */
export const app = new Hono()

/**
 * Header directives for search engines.
 */
app.use('*', async (c, next) => {
  await next()
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex')
})

/** Served from `public/`, so it also needs a route in dev (see the catch-all below). */
app.get('/robots.txt', serveStatic({ root: './public' }))

app.get('/api/chart', (c) => c.json(chartData))

app.get('/api/health', (c) => c.json({ ok: true }))

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
