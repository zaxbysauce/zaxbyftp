import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Must use relative base so asset paths work under the WebView2
  // virtual host (https://ftpclient.local/) after ZIP extraction.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
