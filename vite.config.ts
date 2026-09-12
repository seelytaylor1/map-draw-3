import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    rollupOptions: {
      external: ['@tauri-apps/plugin-opener'],
    },
  },
  test: {
    environment: 'node',
  },
})
