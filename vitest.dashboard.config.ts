import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/dashboard/setup.ts'],
    include: ['tests/dashboard/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': './src/dashboard/src',
    },
  },
});
