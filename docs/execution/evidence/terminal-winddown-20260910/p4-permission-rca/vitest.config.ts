import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['docs/execution/evidence/terminal-winddown-20260910/p4-permission-rca/**/*.test.ts'],
  },
});
