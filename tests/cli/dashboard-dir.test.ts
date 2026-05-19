import { describe, it, expect } from 'vitest';

import { dashboardDirFromModuleUrl } from '../../src/cli/helpers/dashboard-dir.js';

// The dashboard is built to <pkg>/dist/dashboard (vite --outDir ../../dist/dashboard).
// This helper lives at <pkg>/dist/cli/helpers/dashboard-dir.js at runtime, so it
// must resolve ../../dashboard relative to its own module URL — correct both in
// the repo and in an installed npm package (where `root` = user's project ≠ pkg).

describe('dashboardDirFromModuleUrl', () => {
  it('resolves to the package dist/dashboard from a dist/cli/helpers module url', () => {
    const out = dashboardDirFromModuleUrl('file:///opt/app/dist/cli/helpers/dashboard-dir.js');
    expect(out).toBe('/opt/app/dist/dashboard');
  });

  it('is independent of the user project cwd (installed-package safe)', () => {
    const out = dashboardDirFromModuleUrl(
      'file:///home/u/.npm/_npx/abc/node_modules/deckent/dist/cli/helpers/dashboard-dir.js',
    );
    expect(out).toBe('/home/u/.npm/_npx/abc/node_modules/deckent/dist/dashboard');
  });
});
