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
// Link previews need an absolute address for the share image. Set VITE_SITE_URL when hosting elsewhere.
process.env.VITE_SITE_URL ??= 'https://zade06079-medbase-virtual-trials-lab.static.hf.space'

// A static host may not send unknown paths to the app, so each top-level route gets its own real
// page. 404.html covers deeper links such as /conditions/tb on hosts that honour it.
const STATIC_ROUTES = ['trials', 'copilot', 'home', 'lab', 'anatomy', 'evidence', 'methods', 'funding']
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

// A static host gives no control of headers, so the policy travels in the page. Workers are not covered by this tag.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityPolicy = (): Plugin => ({
  name: 'security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head-prepend' },
  ],
})

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), staticPages(), securityPolicy()],
  build: { outDir: process.env.MEDBASE_OUT_DIR ?? 'dist' },
  // A module worker, because the engine worker imports Pyodide from its CDN at run time.
  worker: { format: 'es' },
  // PGlite finds its WebAssembly beside its own script, which the dependency optimiser would break.
  optimizeDeps: { exclude: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector'] },
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
