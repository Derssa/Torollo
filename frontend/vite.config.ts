import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

import fs from 'fs'
import path from 'path'

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version)
  },
  server: {
    port: 23232,
    strictPort: true
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts']
  }
})
