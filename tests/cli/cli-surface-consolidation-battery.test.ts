/**
 * 563-003 — CLI surface consolidation battery.
 *
 * Consolidates four verification points spanning 563-001 (stale-ADR
 * catalog cleanup), 563-002 (`web` command removal) and the
 * scripts/lint-i18n-hardcode.mjs ratchet added by this task:
 *
 *   (a) catalog-wide numeric-ADR ratchet — every MESSAGES key (not just the
 *       `cli.*` subset 563-001's own test scoped to), 0 hits beyond the one
 *       pinned grandfathered key.
 *   (b) `web` stays unregistered and produces no suggestion.
 *   (c) top-level command count is scan-derived, never a literal in this
 *       file (the actually-observed count is reported via the task .result,
 *       not hardcoded here).
 *   (d) scripts/lint-cli-mcp-parity.mjs stays green on the real repo.
 *
 * Hermetic except for (d), which spawns a real child process against the
 * checked-out repo tree (no fixture, no mutation) — the same "gerçek repo"
 * proof pattern used by tests/scripts/lint-cli-surface.test.ts.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { buildProgram } from '../../src/cli/index.js';
import { MESSAGE_KEYS, getMessage } from '../../src/cli/helpers/messages.js';

const PARITY_LINT_SRC = fileURLToPath(new URL('../../scripts/lint-cli-mcp-parity.mjs', import.meta.url));

function runScript(scriptPath: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

const LANGS = ['en', 'tr'] as const;
/** Same numeric-ADR class as the ratchet added to lint-i18n-hardcode.mjs (563-003). */
const STALE_ADR_CLASS_RE = /ADR-\d{2,3}\b/g;
/** The one 563-001/563-003-pinned mechanism-text key (generated worker contract, not user-facing). */
const GRANDFATHERED_KEYS = ['workspace.worker.contract'];

describe('(a) catalog-wide numeric-ADR ratchet — beyond 563-001\'s cli.-only test scope', () => {
  it('zero numeric-ADR hits across every MESSAGES key, excluding the one pinned mechanism-text key', () => {
    const offenders: string[] = [];
    for (const key of MESSAGE_KEYS) {
      if (GRANDFATHERED_KEYS.includes(key)) continue;
      for (const lang of LANGS) {
        const hits = getMessage(key, lang).match(STALE_ADR_CLASS_RE) ?? [];
        if (hits.length > 0) offenders.push(`${key} [${lang}]: ${hits.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the grandfathered key is the sole survivor — pinned, not silently growing', () => {
    const leaking = [
      ...new Set(
        MESSAGE_KEYS.filter((key) =>
          LANGS.some((lang) => (getMessage(key, lang).match(STALE_ADR_CLASS_RE) ?? []).length > 0),
        ),
      ),
    ].sort();
    expect(leaking).toEqual(GRANDFATHERED_KEYS);
  });
});

describe('(b) `web` stays unregistered + suggestion behavior', () => {
  let program: Command;
  let commandNames: string[];

  beforeAll(() => {
    program = buildProgram();
    commandNames = program.commands.map((c) => c.name());
  });

  it('does not register a `web` command', () => {
    expect(commandNames).not.toContain('web');
  });

  it('typed `web` gets no "Did you mean" suggestion (too far from any surviving command)', () => {
    const p = buildProgram();
    p.exitOverride();
    let stderr = '';
    p.configureOutput({ writeOut: () => {}, writeErr: (s: string) => { stderr += s; } });
    try {
      p.parse(['node', 'deckent', 'web']);
    } catch {
      // commander.unknownCommand — expected
    }
    expect(stderr).toContain("unknown command 'web'");
    expect(stderr).not.toContain('Did you mean');
  });
});

describe('(c) top-level command count is scan-derived, not hardcoded', () => {
  it('buildProgram() yields a positive, scan-derived top-level command count with no duplicates', () => {
    const commandNames = buildProgram().commands.map((c) => c.name());
    // No literal count is asserted here by design (563-003 instruction: the
    // number must not be hardcoded into code). The actually-observed count
    // is captured at verification time and reported in the task .result.
    expect(commandNames.length).toBeGreaterThan(0);
    expect(Number.isInteger(commandNames.length)).toBe(true);

    const duplicates = commandNames.filter((name, i) => commandNames.indexOf(name) !== i);
    expect(duplicates).toEqual([]);
  });
});

describe('(d) CLI<->MCP parity lint stays green', () => {
  it('scripts/lint-cli-mcp-parity.mjs exits 0 against the real repo', async () => {
    const result = await runScript(PARITY_LINT_SRC);
    expect(result.code, result.stdout + result.stderr).toBe(0);
  });
});
