import devServer from '@hono/vite-dev-server'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type ViteDevServer } from 'vite'

/**
 * `@hono/vite-dev-server` mounts the Hono app in front of Vite's own middleware
 * stack, so `/` is answered by Hono and never reaches Vite's HTML transform.
 * We hand the running dev server to the Hono app (via the plugin's `env`) so it
 * can run `transformIndexHtml` itself and keep HMR + React Fast Refresh working.
 */
let viteDevServer: ViteDevServer | undefined

export default defineConfig({
  plugins: [
    {
      name: 'expose-vite-dev-server',
      configureServer(server) {
        viteDevServer = server
      },
    },
    devServer({
      entry: 'src/server/index.ts',
      env: () => ({ viteDevServer }),
    }),
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
