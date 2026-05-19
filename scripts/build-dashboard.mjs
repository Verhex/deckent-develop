#!/usr/bin/env node
// Resilient dashboard build — closes the "published package ships an empty
// dist/dashboard" gap (src/dashboard is a separate workspace whose deps are
// NOT installed by a root `npm install`, so `vite build` failed silently and
// every user got a broken dashboard).
//
// Behavior:
//   1. Ensure src/dashboard deps are present (install only if vite missing).
//   2. Run `vite build --outDir ../../dist/dashboard`.
//
// Invoked by package.json `build:dashboard` (and transitively by `postbuild`
// / `build:all` / `prepublishOnly`).

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dashDir = join(repoRoot, 'src', 'dashboard');

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    // npm/vite resolve through .cmd wrappers on Windows; POSIX stays shell-free.
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error(`\n[build-dashboard] \`${cmd} ${args.join(' ')}\` failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(dashDir)) {
  console.error(`[build-dashboard] src/dashboard not found at ${dashDir}`);
  process.exit(1);
}

// 1. Ensure deps — install only when the build toolchain is absent.
const viteBin = join(dashDir, 'node_modules', 'vite');
if (!existsSync(viteBin)) {
  console.log('[build-dashboard] Installing src/dashboard dependencies…');
  run('npm', ['install', '--no-audit', '--no-fund'], dashDir);
}

// 2. Build into the package's dist/dashboard (shipped via package.json files).
console.log('[build-dashboard] Building dashboard → dist/dashboard');
run('npx', ['vite', 'build', '--outDir', '../../dist/dashboard', '--emptyOutDir'], dashDir);
console.log('[build-dashboard] Done.');
