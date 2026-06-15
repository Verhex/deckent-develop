// scripts/clean.mjs — clean dist/ EXCEPT the vite-built dashboard bundle.
//
// Footgun this closes: the old `clean` was `rm -rf dist`, so a plain
// `npm run build` (tsc + copy-assets, NO dashboard) WIPED dist/dashboard and
// left `deckent serve` with no static files ("Bundled dashboard not found").
// Only `build:dashboard`/`build:all` regenerate it, so every TS-only build broke
// the served dashboard until the next full build.
//
// Fix: a TS-only `npm run build` now preserves dist/dashboard (kept from the last
// `build:all`), so serve keeps working. `build:all` runs this clean too, then
// rebuilds the dashboard on top — so the full build is byte-identical to before.
//
// Portable (node fs, no shell) to match copy-assets.mjs / build-dashboard.mjs.

import { rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const PRESERVE = new Set(['dashboard']);

if (!existsSync(DIST)) {
  process.exit(0);
}

let removed = 0;
for (const entry of readdirSync(DIST)) {
  if (PRESERVE.has(entry)) continue;
  rmSync(join(DIST, entry), { recursive: true, force: true });
  removed += 1;
}

console.log(`[clean] dist cleaned — ${removed} entr${removed === 1 ? 'y' : 'ies'} removed, dist/dashboard preserved`);
