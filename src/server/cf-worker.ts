import { Hono } from 'hono'
import { chartData } from '../shared/chart.ts'

export type Bindings = {
  // R2 bucket binding reserve (as alternative/future option for audios)
  PINYIN_AUDIOS?: {
    get(key: string): Promise<{ body: ReadableStream; headers: Headers } | null>
  }
}

export const cfApp = new Hono<{
  Bindings: Bindings
}>()

cfApp.onError((err, c) => {
  console.error('CF Worker Error:', err)
  return c.json({ error: err.message, stack: err.stack }, 500)
})

cfApp.get('/api/chart', (c) => c.json(chartData))

cfApp.get('/api/health', (c) => c.json({ ok: true, platform: 'cloudflare' }))

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
