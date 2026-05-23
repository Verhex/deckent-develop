import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/dashboard/**', 'node_modules'],
    testTimeout: 10000,
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
      // Sprint 189 (WrongStack WS-Z1): coverage gate aktif. Floors mevcut
      // baseline'dan -5% kalibre — sprint başına ~1% ratchet (CONTRIBUTING.md).
      // Baseline (sprint-189 2026-05-22): lines 87.96 | functions 94.61 |
      // branches 85.19 | statements 87.96. Threshold violation = exit 1.
      thresholds: {
        lines: 82,
        functions: 89,
        branches: 80,
        statements: 82,
      },
      // reportOnFailure: test fail durumunda da coverage raporu yazılsın
      // (yoksa vitest erken çıkar ve threshold gate hiç değerlendirilmez).
      reportOnFailure: true,
    },
  },
});
