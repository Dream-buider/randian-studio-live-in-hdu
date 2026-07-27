import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3210' } },
});
