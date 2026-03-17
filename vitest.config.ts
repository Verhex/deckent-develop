import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/dashboard/**', 'node_modules'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/agents/index.ts',
        'src/core/index.ts',
        'src/monitor/index.ts',
        'src/orchestra/index.ts',
        'src/cli/index.ts',
        'src/mcp/tools/index.ts',
        'src/mcp/resources/index.ts',
        'src/dashboard/**',
      ],
    },
  },
});
