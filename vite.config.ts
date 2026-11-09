import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]

// https://vite.dev/config/
export default defineConfig({
  base: repo ? `/${repo}/` : './',
  plugins: [react()],
})
