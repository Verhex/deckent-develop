import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/dashboard/**', 'node_modules'],
    testTimeout: 10000,
    // CI-CD stability (Sprint 214): the Coverage job ran on a 2-core GitHub
    // runner; after all tests PASS, every fork serialises v8 coverage data back
    // to the main process at teardown. With unbounded forks competing for 2
    // cores, that teardown RPC starved and tripped vitest's "Timeout calling
    // onTaskUpdate" → exit 1 (the months-long Coverage-job failure that blocked
    // coverage report + build from ever running). Bounding forks to the core
    // count under CI gives each fork CPU to finish its teardown RPC. Local dev
    // keeps full parallelism (maxForks undefined).
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: process.env.CI ? 2 : undefined },
    },
    teardownTimeout: 30000,
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
