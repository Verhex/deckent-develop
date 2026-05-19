// ─── Dashboard static dir resolver ───────────────────────────────────────
// The web dashboard is built to <pkg>/dist/dashboard
// (`vite build --outDir ../../dist/dashboard`). At runtime this helper lives
// at <pkg>/dist/cli/helpers/dashboard-dir.js, so it resolves the dashboard
// relative to ITS OWN module URL — correct both in-repo and in an installed
// npm package, where the user's project root is NOT the deckent package dir.
// (Previous bug: web.ts/serve.ts used join(projectRoot, 'src/dashboard/dist').)

import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';

/** Pure: given a module URL at dist/cli/helpers/, return the package's
 *  dist/dashboard absolute path. */
export function dashboardDirFromModuleUrl(moduleUrl: string): string {
  return fileURLToPath(new URL('../../dashboard', moduleUrl));
}

/** Resolve the bundled dashboard static dir for the running deckent install. */
export function getDashboardStaticDir(): string {
  return dashboardDirFromModuleUrl(import.meta.url);
}

/** True when the bundled dashboard exists and has content (was built/shipped). */
export function dashboardIsBuilt(dir: string = getDashboardStaticDir()): boolean {
  try {
    return existsSync(dir) && readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}
