import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export const API_PROXY_KEY = '^/api(?:/|$)';

export default defineConfig(({ mode }) => {
  const testMode = mode === 'test';
  const publicTrialMode = mode === 'public-trial';
  return {
    root: testMode ? '.' : 'web',
    plugins: [vue()],
    build: {
      outDir: testMode
        ? 'dist/client'
        : publicTrialMode
          ? '../dist/public-trial-client'
          : '../dist/client',
      emptyOutDir: true,
    },
    server: { proxy: { [API_PROXY_KEY]: 'http://localhost:3210' } },
  };
});
