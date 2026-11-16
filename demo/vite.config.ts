import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// A static page: the data is the stored evaluation output in src/data, so there is no server and no API key.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [react()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
})
