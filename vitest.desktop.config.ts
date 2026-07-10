/**
 * DESK-1 (born-496) — desktop sub-package unit tests, run from the repo root
 * (`npm run test:desktop`), sibling of vitest.dashboard.config.ts.
 *
 * Scope: src/desktop/tests/** only — plain-Node, Electron-FREE logic by
 * design (daemon-lifecycle, meta-client, profile-store are kept free of
 * `import 'electron'` precisely so they test hermetically here). The
 * Playwright-Electron e2e smoke (src/desktop/tests-e2e/) is a separate,
 * xvfb-gated job and never part of this config.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/desktop/tests/**/*.test.ts'],
    environment: 'node',
  },
});
