import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app } from './index.ts'

// Built client bundle (JS/CSS) and the copied public assets.
app.use('/*', serveStatic({ root: './dist/client' }))

// SPA fallback.
app.get('*', serveStatic({ path: './dist/client/index.html' }))

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`拼音学习图 → http://localhost:${info.port}`)
})
