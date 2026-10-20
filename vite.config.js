import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.js',
    include: ['src/**/*.test.{js,jsx}'], // e2e/ is run by Playwright
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/tests/**', 'src/i18n/**', 'src/main.jsx'],
    },
  },
  css: {
    postcss: './postcss.config.js',
  },
})