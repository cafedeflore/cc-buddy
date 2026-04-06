import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { cpSync, existsSync, createReadStream, mkdirSync, statSync } from 'fs'

// Serve src-tauri/resources/videos/* at /videos/* in dev mode,
// and copy the same files into dist/videos for packaged builds.
function serveResourceVideos() {
  const videosDir = resolve(__dirname, 'src-tauri/resources/videos')
  return {
    name: 'serve-resource-videos',
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use((req: { url?: string }, res: { setHeader: Function; statusCode: number; end: Function }, next: Function) => {
        if (!req.url?.startsWith('/videos/')) return next()
        const filePath = resolve(videosDir, req.url.slice('/videos/'.length))
        if (!existsSync(filePath)) return next()
        res.setHeader('Content-Type', 'video/webm')
        res.setHeader('Content-Length', statSync(filePath).size)
        createReadStream(filePath).pipe(res as any)
      })
    },
    closeBundle() {
      const distVideosDir = resolve(__dirname, 'dist/videos')
      mkdirSync(distVideosDir, { recursive: true })
      cpSync(videosDir, distVideosDir, { recursive: true, force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveResourceVideos()],
  server: {
    port: 1420,
    strictPort: true,
  },
  clearScreen: false,
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
