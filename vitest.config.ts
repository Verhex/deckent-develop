import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/dashboard/**', 'node_modules'],
    testTimeout: 10000,
    // CI-CD stability (Sprint 214): the Coverage job ran on a 2-core GitHub
    // runner; after all tests PASS, every fork serialises v8 coverage data back
    // to the main process at teardown. With unbounded forks competing for 2
    // cores, that teardown RPC starved and tripped vitest's "Timeout calling
    // onTaskUpdate" → exit 1 (the months-long Coverage-job failure that blocked
    // coverage report + build from ever running). Bounding forks to the core
    // count under CI gives each fork CPU to finish its teardown RPC.
    //
    // Memory cap (Alperen, 2026-06-28): local runs MUST stay ≤16GB. Unbounded
    // local forks meant one fork per core (e.g. 20 cores → ~40GB peak), which
    // OOM-crashed WSL and starved VS Code. Budget ~3.5GB/fork → 4 forks ≈ 14GB
    // locally (under the 16GB ceiling, with headroom for the editor); CI runners
    // (16GB, 2-core) stay at 2. Override with VITEST_MAX_FORKS=N on machines
    // with different headroom (e.g. VITEST_MAX_FORKS=2 for a tighter cap).
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: process.env.VITEST_MAX_FORKS
          ? Math.max(1, Number(process.env.VITEST_MAX_FORKS))
          : (process.env.CI ? 2 : 4),
        minForks: 1,
      },
    },
    teardownTimeout: 30000,
    coverage: {
      provider: 'v8',
      // Default v8 reporters omit json-summary; `scripts/update-readme-stats.mjs`
      // reads coverage/coverage-summary.json to render the README coverage badge,
      // so emit it explicitly alongside the human-facing text/html reports.
      reporter: ['text', 'html', 'clover', 'json', 'json-summary'],
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
