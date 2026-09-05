import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      commonjsOptions: { include: [/node_modules/, /shared[/\\]release-notes\.cjs$/] },
      lib: { entry: resolve(__dirname, 'electron/main/index.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve(__dirname, 'electron/preload/index.ts') }
    }
  },
  renderer: {
    root: resolve(__dirname),
    plugins: [react()],
    server: {
      watch: { ignored: ['**/release/**', '**/out/**'] }
    },
    build: {
      rollupOptions: { input: resolve(__dirname, 'index.html') }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  }
})
