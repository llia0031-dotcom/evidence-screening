import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// A static site: the data is the stored evaluation output in src/data, so there is no server and no API key.
// Three pages: the demo (index.html), the about page and the page GitHub Pages serves for a missing address (404.html).
// A local build uses relative paths; the published build sets VITE_BASE to the site's path, so the 404 page finds its
// files from any depth.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), about: resolve(__dirname, 'about.html'), notFound: resolve(__dirname, '404.html') } },
  },
})
