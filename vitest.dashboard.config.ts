import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/dashboard/setup.ts'],
    include: ['tests/dashboard/**/*.test.tsx', 'tests/dashboard/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': './src/dashboard/src',
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
    },
  },
});
