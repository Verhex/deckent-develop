#!/usr/bin/env node
// smoke-deck-lifecycle.mjs — SEC-01 proof-of-function for the .deck secret lifecycle
// (createDeckTemplate DECK-OVERWRITE-GUARD + atomic 0600 write, task 411-001).
//
// Imports the REAL src/core/deck-file.ts module directly (Node's native TypeScript
// type-stripping — no build step, no dist/ dependency, no mirrored reimplementation).
// deck-file.ts has zero relative imports (only node:fs / node:child_process / node:os
// / node:path), so it is safe to import straight from src/ in any Node >=22.6 runtime.
//
// Flow: tmpdir -> template -> sentinel yaz -> template tekrar -> sentinel korunmus +
// (POSIX) stat mode 600 -> 'SMOKE OK' basar, aksi exit 1.
//
// Run directly: node scripts/smoke-deck-lifecycle.mjs

import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DECK_FILE_MODULE = join(REPO_ROOT, 'src', 'core', 'deck-file.ts');

export async function runSmoke() {
  const { createDeckTemplate, DECK_FILE_NAME } = await import(DECK_FILE_MODULE);

  const failures = [];
  const check = (label, cond) => {
    if (!cond) failures.push(label);
  };

  // ─── Scenario 1: existing .deck with a sentinel secret survives re-init ────
  const dirA = mkdtempSync(join(tmpdir(), 'deckent-deck-smoke-'));
  try {
    const deckPath = join(dirA, DECK_FILE_NAME);
    const sentinel = 'DECKENT_CLAUDE_API_KEY=sk-live-sentinel-do-not-erase\n# user comment\n';
    writeFileSync(deckPath, sentinel, 'utf-8');

    createDeckTemplate(dirA);

    const afterFirstReinit = readFileSync(deckPath, 'utf-8');
    check('sentinel .deck survives 1st createDeckTemplate call byte-identical', afterFirstReinit === sentinel);

    // template tekrar — a second re-init call must also stay a no-op
    createDeckTemplate(dirA);
    const afterSecondReinit = readFileSync(deckPath, 'utf-8');
    check('sentinel .deck survives 2nd createDeckTemplate call byte-identical', afterSecondReinit === sentinel);

    check('no leftover .deck.tmp after no-op re-init', !existsSync(`${deckPath}.tmp`));
  } finally {
    rmSync(dirA, { recursive: true, force: true });
  }

  // ─── Scenario 2: brand-new .deck is created with 0600 (POSIX) ──────────────
  const dirB = mkdtempSync(join(tmpdir(), 'deckent-deck-smoke-'));
  try {
    const deckPath = join(dirB, DECK_FILE_NAME);
    createDeckTemplate(dirB);

    check('fresh .deck file was created', existsSync(deckPath));
    check('fresh .deck contains known template keys', readFileSync(deckPath, 'utf-8').includes('DECKENT_CLAUDE_API_KEY='));
    check('no leftover .deck.tmp after fresh create', !existsSync(`${deckPath}.tmp`));

    if (platform() !== 'win32') {
      const mode = statSync(deckPath).mode & 0o777;
      check(`fresh .deck has owner-only 0600 permissions (got ${mode.toString(8)})`, mode === 0o600);
    }
  } finally {
    rmSync(dirB, { recursive: true, force: true });
  }

  return { pass: failures.length === 0, failures };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSmoke()
    .then((result) => {
      if (result.pass) {
        process.stdout.write('SMOKE OK\n');
        process.exit(0);
      } else {
        process.stderr.write(`SMOKE FAIL:\n${result.failures.map((f) => `  - ${f}`).join('\n')}\n`);
        process.exit(1);
      }
    })
    .catch((err) => {
      process.stderr.write(`SMOKE FAIL: ${err instanceof Error ? err.stack || err.message : String(err)}\n`);
      process.exit(1);
    });
}
