import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      react: path.resolve(__dirname, '../../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
    },
  },
  test: {
    root: path.resolve(__dirname, '../..'),
    include: ['tests/dashboard/**/*.test.{ts,tsx}'],
    testTimeout: 10000,
  },
});
