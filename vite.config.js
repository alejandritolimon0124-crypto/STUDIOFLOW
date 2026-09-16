import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const excelPath = require.resolve('exceljs/dist/exceljs.min.js')

// Keep this URL available across deployments for already-open installed apps.
const excelRuntime = {
  name: 'excel-runtime',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'vendor/exceljs.js', source: readFileSync(excelPath) })
  },
  configureServer(server) {
    server.middlewares.use('/vendor/exceljs.js', (_request, response) => {
      response.setHeader('Content-Type', 'application/javascript')
      response.setHeader('Cache-Control', 'no-cache')
      response.end(readFileSync(excelPath))
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3 },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 2 },
            { name: 'vendor', test: /node_modules/, priority: 1 },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    excelRuntime,
  ],
})
