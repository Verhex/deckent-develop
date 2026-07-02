// ─── Sprint 358 Task 358-012 — REFDOCS-ADR-REGEX ───────────────────────────────
// born-461: ADR_FILE_RE/ADR_HEADING_RE only recognized the legacy `NNN-slug.md` /
// `# ADR-NNN:` naming. Real docs/adr/*.md is the post-2026-06-30 `adr-(g|d)-NNN-slug.md`
// / `# ADR-(G|D)-NNN:` taxonomy (ADR-G-019), so `parseAdrs` returned 0 entries and
// `docs:ref` could never regenerate docs/adr/README.md.
//
// Hermetic: tmpdir fixtures for the regex-behavior unit assertions (never touch repo
// state); the real-repo assertions below only read committed docs/adr/*.md (git-tracked,
// present on a fresh checkout — no gitignored state). Async `spawn` only, never spawnSync.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  parseAdrs,
  collectGenerations,
  // @ts-expect-error — .mjs script lacks a .d.ts; import works at runtime
} from '../../scripts/gen-reference-docs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const GEN_SCRIPT = join(REPO_ROOT, 'scripts', 'gen-reference-docs.mjs');

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'refdocs-adr-regen-test-'));
});

afterEach(() => {
  if (tmpRoot && existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── async spawn wrapper (no spawnSync — hermeticity rule) ─────────────────────

interface CmdResult { exitCode: number; stdout: string; stderr: string }

function runCheck(cwd: string, timeoutMs = 15000): Promise<CmdResult> {
  return new Promise((res, rej) => {
    const proc = spawn(process.execPath, [GEN_SCRIPT, '--check'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', rej);
    proc.on('close', (code) => res({ exitCode: code ?? 1, stdout, stderr }));
  });
}

// ─── parseAdrs — new adr-(g|d)-NNN taxonomy ────────────────────────────────────

describe('parseAdrs — new ADR-G/ADR-D taxonomy', () => {
  it('recognizes adr-g-NNN-*.md and adr-d-NNN-*.md filenames + class-prefixed headings', () => {
    const adrDir = join(tmpRoot, 'docs/adr');
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(
      join(adrDir, 'adr-d-001-build-baseline.md'),
      '# ADR-D-001: Build Baseline\n\n**Status:** accepted\n',
    );
    writeFileSync(
      join(adrDir, 'adr-g-016-product-vision.md'),
      '# ADR-G-016: Product Vision\n\n**Status:** accepted\n',
    );
    const adrs = parseAdrs(adrDir);
    expect(adrs).toHaveLength(2);
    const byId = Object.fromEntries(adrs.map((a: { id: string }) => [a.id, a]));
    expect(byId['ADR-D-001'].title).toBe('Build Baseline');
    expect(byId['ADR-G-016'].title).toBe('Product Vision');
  });

  it('sorts ADR-D-* before ADR-G-*, numeric ascending within each class', () => {
    const adrDir = join(tmpRoot, 'docs/adr');
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(join(adrDir, 'adr-g-002-b.md'), '# ADR-G-002: B\n\n**Status:** accepted\n');
    writeFileSync(join(adrDir, 'adr-d-002-d.md'), '# ADR-D-002: D\n\n**Status:** accepted\n');
    writeFileSync(join(adrDir, 'adr-g-001-a.md'), '# ADR-G-001: A\n\n**Status:** accepted\n');
    writeFileSync(join(adrDir, 'adr-d-001-c.md'), '# ADR-D-001: C\n\n**Status:** accepted\n');
    const adrs = parseAdrs(adrDir);
    expect(adrs.map((a: { id: string }) => a.id)).toEqual([
      'ADR-D-001', 'ADR-D-002', 'ADR-G-001', 'ADR-G-002',
    ]);
  });

  it('still recognizes legacy NNN-slug.md filenames + non-class headings (backward compat)', () => {
    const adrDir = join(tmpRoot, 'docs/adr');
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(join(adrDir, '001-typescript-esm.md'), '# ADR-001: TypeScript + ESM\n\n**Status:** accepted\n');
    const adrs = parseAdrs(adrDir);
    expect(adrs).toHaveLength(1);
    expect(adrs[0].id).toBe('ADR-001');
  });

  it('skips README.md and other non-ADR markdown regardless of taxonomy', () => {
    const adrDir = join(tmpRoot, 'docs/adr');
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(join(adrDir, 'README.md'), '# ADR Index\n\nNot a real ADR.\n');
    writeFileSync(join(adrDir, 'adr-g-001-a.md'), '# ADR-G-001: A\n\n**Status:** accepted\n');
    const adrs = parseAdrs(adrDir);
    expect(adrs).toHaveLength(1);
    expect(adrs[0].id).toBe('ADR-G-001');
  });

  it('does not descend into archive/ (old-numeric archived ADRs stay excluded)', () => {
    const adrDir = join(tmpRoot, 'docs/adr');
    mkdirSync(join(adrDir, 'archive'), { recursive: true });
    writeFileSync(join(adrDir, 'archive', '005-synchronous-i-o.md'), '# ADR-005: Old\n\n**Status:** superseded\n');
    writeFileSync(join(adrDir, 'adr-g-001-a.md'), '# ADR-G-001: A\n\n**Status:** accepted\n');
    const adrs = parseAdrs(adrDir);
    expect(adrs).toHaveLength(1);
    expect(adrs[0].id).toBe('ADR-G-001');
  });
});

// ─── collectGenerations — trailing hand-written content preserved ─────────────

describe('collectGenerations — fresh-mode preserves trailing content after AUTOGEN:END', () => {
  it('round-trips a hand-written trailer note (e.g. docs/adr/README.md "Archived" note)', () => {
    const adrDir = join(tmpRoot, 'docs/adr');
    const refDir = join(tmpRoot, 'docs/reference');
    mkdirSync(adrDir, { recursive: true });
    mkdirSync(refDir, { recursive: true });
    mkdirSync(join(tmpRoot, 'src/mcp/tools'), { recursive: true });
    mkdirSync(join(tmpRoot, 'src/mcp/resources'), { recursive: true });
    mkdirSync(join(tmpRoot, 'src/cli/commands'), { recursive: true });
    mkdirSync(join(tmpRoot, '.deckent/agents'), { recursive: true });
    writeFileSync(join(adrDir, 'adr-g-001-a.md'), '# ADR-G-001: A\n\n**Status:** accepted\n');

    const trailer = '\n> **Archived (superseded, historical record only):** see archive/.\n';
    const existingReadme = [
      '# Architecture Decision Records — Index',
      '',
      '<!-- AUTOGEN:START id="adr-index" -->',
      'stale body',
      '<!-- AUTOGEN:END id="adr-index" -->',
      trailer,
    ].join('\n');
    writeFileSync(join(adrDir, 'README.md'), existingReadme);

    const gens = collectGenerations({ root: tmpRoot });
    const adrGen = gens.find((g: { id: string }) => g.id === 'adr-index');
    expect(adrGen).toBeDefined();
    expect(adrGen.content).toContain('Archived (superseded, historical record only)');
    expect(adrGen.content).toContain('ADR-G-001');
  });
});

// ─── real repo — proves the regex + trailer fix against committed docs/adr ────

describe('real docs/adr/*.md — regen is content-equivalent (diff-minimal proof)', () => {
  it('collectGenerations reports 41 ADRs with zero drift against the committed README', () => {
    const gens = collectGenerations({ root: REPO_ROOT });
    const adrGen = gens.find((g: { id: string }) => g.id === 'adr-index');
    expect(adrGen).toBeDefined();
    expect(adrGen.count).toBe(41);
    expect(adrGen.drift).toBe(false);
  });

  it('`node scripts/gen-reference-docs.mjs --check` reports docs/adr/README.md in sync with 41 entries', async () => {
    const result = await runCheck(REPO_ROOT);
    expect(result.stdout).toMatch(/docs\/adr\/README\.md — in sync \(41 entries\)/);
  });
});
