import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const testMode = mode === 'test';
  return {
    root: testMode ? '.' : 'web',
    plugins: [vue()],
    build: {
      outDir: testMode ? 'dist/client' : '../dist/client',
      emptyOutDir: true,
    },
    server: { proxy: { '/api': 'http://localhost:3210' } },
  };
});
