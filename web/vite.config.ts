import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from "node:fs"
import path from "path"

// The FastAPI server in ../medlab serves this build at the domain root and mounts /assets there,
// so the base defaults to "/". Set MEDBASE_BASE to host it under a sub-path instead.
const base = process.env.MEDBASE_BASE ?? '/'
// The lab API. Production is same-origin; dev and preview forward /api to it.
const apiTarget = process.env.MEDLAB_API ?? 'http://localhost:8000'
const proxy = { '/api': { target: apiTarget, changeOrigin: true } }

// A static host may not send unknown paths to the app, so each top-level route gets its own real
// page. 404.html covers deeper links such as /conditions/tb on hosts that honour it.
const STATIC_ROUTES = ['trials', 'home', 'lab', 'anatomy', 'evidence', 'methods', 'funding']
const staticPages = (): Plugin => ({
  name: 'static-pages',
  apply: 'build',
  closeBundle() {
    const dist = path.resolve(__dirname, process.env.MEDBASE_OUT_DIR ?? 'dist')
    const html = fs.readFileSync(path.join(dist, 'index.html'))
    fs.writeFileSync(path.join(dist, '404.html'), html)
    for (const route of STATIC_ROUTES) {
      fs.mkdirSync(path.join(dist, route), { recursive: true })
      fs.writeFileSync(path.join(dist, route, 'index.html'), html)
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), staticPages()],
  build: { outDir: process.env.MEDBASE_OUT_DIR ?? 'dist' },
  // A module worker, because the engine worker imports Pyodide from its CDN at run time.
  worker: { format: 'es' },
  server: { proxy },
  preview: { proxy },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
} as Parameters<typeof defineConfig>[0])
