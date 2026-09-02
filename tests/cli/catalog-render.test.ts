/**
 * TERM-CAT (Sprint 357, Task 357-002) — catalog-render hermetic tests.
 *
 * renderCatalog() is a pure render function: no fs/network I/O, no imported
 * i18n keys. Proves: category grouping is deterministic (first-appearance
 * order), trust-badge + risk-marker glyphs are pulled entirely from the
 * injected `labels` parameter (label-injection swap with a structurally
 * identical TR fixture changes only the text, never the structure/order),
 * and NO_COLOR (both via options.noColor and the NO_COLOR env var) strips
 * all ANSI escape codes while the default path emits them.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  renderCatalog,
  type CatalogRenderEntry,
  type CatalogRenderLabels,
} from '../../src/cli/helpers/catalog-render.js';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[/;

// ─── Fixtures ────────────────────────────────────────────────────────────

const ENTRIES: CatalogRenderEntry[] = [
  { id: 'core-read', category: 'fs', labelKey: 'tool.core_read', trustTier: 'Core', riskLevel: 'low' },
  { id: 'core-write', category: 'fs', labelKey: 'tool.core_write', trustTier: 'Core', riskLevel: 'medium' },
  { id: 'proj-script', category: 'project', labelKey: 'tool.proj_script', trustTier: 'Project', riskLevel: 'low' },
  { id: 'mcp-canva', category: 'mcp', labelKey: 'tool.mcp_canva', trustTier: 'MCP', riskLevel: 'medium' },
  { id: 'ent-sso', category: 'mcp', labelKey: 'tool.ent_sso', trustTier: 'Enterprise', riskLevel: 'high' },
  { id: 'danger-rm', category: 'fs', labelKey: 'tool.danger_rm', trustTier: 'Danger', riskLevel: 'critical' },
];

const EN_ENTRY_NAMES: Record<string, string> = {
  'tool.core_read': 'Read File',
  'tool.core_write': 'Write File',
  'tool.proj_script': 'Run Project Script',
  'tool.mcp_canva': 'Canva Design',
  'tool.ent_sso': 'Enterprise SSO Sync',
  'tool.danger_rm': 'Delete Recursively',
};

const EN_CATEGORY_NAMES: Record<string, string> = {
  fs: 'Filesystem',
  project: 'Project',
  mcp: 'MCP',
};

const EN_LABELS: CatalogRenderLabels = {
  categoryName: (category) => EN_CATEGORY_NAMES[category] ?? category,
  entryName: (labelKey) => EN_ENTRY_NAMES[labelKey] ?? labelKey,
  tierBadge: { Core: 'C', Project: 'P', MCP: 'M', Enterprise: 'E', Danger: '!' },
  riskMarker: { low: '', medium: '', high: '(risky)', critical: '(DANGER)' },
  emptyState: 'No tools available.',
};

const TR_ENTRY_NAMES: Record<string, string> = {
  'tool.core_read': 'Dosya Oku',
  'tool.core_write': 'Dosya Yaz',
  'tool.proj_script': 'Proje Betiği Çalıştır',
  'tool.mcp_canva': 'Canva Tasarım',
  'tool.ent_sso': 'Kurumsal SSO Senkronu',
  'tool.danger_rm': 'Özyinelemeli Sil',
};

const TR_CATEGORY_NAMES: Record<string, string> = {
  fs: 'Dosya Sistemi',
  project: 'Proje',
  mcp: 'MCP',
};

// Structurally identical to EN_LABELS (same interface, same keys) — only the
// returned/mapped strings differ. Proves label-injection, not a parallel impl.
const TR_LABELS: CatalogRenderLabels = {
  categoryName: (category) => TR_CATEGORY_NAMES[category] ?? category,
  entryName: (labelKey) => TR_ENTRY_NAMES[labelKey] ?? labelKey,
  tierBadge: { Core: 'C', Project: 'P', MCP: 'M', Enterprise: 'E', Danger: '!' },
  riskMarker: { low: '', medium: '', high: '(riskli)', critical: '(TEHLİKE)' },
  emptyState: 'Kullanılabilir araç yok.',
};

let origNoColor: string | undefined;
let origForceColor: string | undefined;
function saveEnv(): void {
  origNoColor = process.env['NO_COLOR'];
  origForceColor = process.env['FORCE_COLOR'];
}
function restoreEnv(): void {
  if (origNoColor === undefined) delete process.env['NO_COLOR']; else process.env['NO_COLOR'] = origNoColor;
  if (origForceColor === undefined) delete process.env['FORCE_COLOR']; else process.env['FORCE_COLOR'] = origForceColor;
}
afterEach(restoreEnv);

// ─── Deterministic grouping + fixed output shape ────────────────────────────

describe('renderCatalog — deterministic category grouping', () => {
  it('groups entries by category in first-appearance order, preserving entry order within a group', () => {
    saveEnv();
    process.env['NO_COLOR'] = '1';
    const out = renderCatalog(ENTRIES, EN_LABELS);
    const expected = [
      'Filesystem',
      '  C Read File',
      '  C Write File',
      '  ! Delete Recursively (DANGER)',
      '',
      'Project',
      '  P Run Project Script',
      '',
      'MCP',
      '  M Canva Design',
      '  E Enterprise SSO Sync (risky)',
    ].join('\n');
    expect(out).toBe(expected);
  });

  it('is deterministic across repeated calls with the same fixture', () => {
    saveEnv();
    process.env['NO_COLOR'] = '1';
    const first = renderCatalog(ENTRIES, EN_LABELS);
    const second = renderCatalog(ENTRIES, EN_LABELS);
    expect(first).toBe(second);
  });

  it('suppresses the risk marker entirely for low/medium risk (empty label string)', () => {
    saveEnv();
    process.env['NO_COLOR'] = '1';
    const out = renderCatalog(ENTRIES, EN_LABELS);
    expect(out).not.toContain('Read File (');
    expect(out).not.toContain('Write File (');
    expect(out).not.toContain('Run Project Script (');
  });

  it('returns labels.emptyState verbatim when entries is empty', () => {
    expect(renderCatalog([], EN_LABELS)).toBe('No tools available.');
    expect(renderCatalog([], TR_LABELS)).toBe('Kullanılabilir araç yok.');
  });
});

// ─── Label injection (string-free mechanism) ────────────────────────────────

describe('renderCatalog — label injection', () => {
  it('renders entirely different visible text for a structurally identical TR labels fixture', () => {
    saveEnv();
    process.env['NO_COLOR'] = '1';
    const en = renderCatalog(ENTRIES, EN_LABELS);
    const tr = renderCatalog(ENTRIES, TR_LABELS);

    expect(en).toContain('Filesystem');
    expect(en).toContain('Read File');
    expect(en).toContain('(DANGER)');

    expect(tr).toContain('Dosya Sistemi');
    expect(tr).toContain('Dosya Oku');
    expect(tr).toContain('(TEHLİKE)');

    expect(tr).not.toContain('Filesystem');
    expect(tr).not.toContain('Read File');
  });

  it('preserves identical line/category structure across label fixtures (same line count)', () => {
    saveEnv();
    process.env['NO_COLOR'] = '1';
    const en = renderCatalog(ENTRIES, EN_LABELS);
    const tr = renderCatalog(ENTRIES, TR_LABELS);
    expect(en.split('\n')).toHaveLength(tr.split('\n').length);
  });
});

// ─── NO_COLOR handling ───────────────────────────────────────────────────────

describe('renderCatalog — NO_COLOR handling', () => {
  it('emits no ANSI escape codes when options.noColor=true', () => {
    const out = renderCatalog(ENTRIES, EN_LABELS, { noColor: true });
    expect(out).not.toMatch(ANSI_RE);
  });

  it('emits no ANSI escape codes when the NO_COLOR env var is set (auto-detect path)', () => {
    saveEnv();
    process.env['NO_COLOR'] = '1';
    const out = renderCatalog(ENTRIES, EN_LABELS);
    expect(out).not.toMatch(ANSI_RE);
  });

  it('emits ANSI color codes by default when NO_COLOR is unset (proves the color path is reachable)', () => {
    saveEnv();
    delete process.env['NO_COLOR'];
    const out = renderCatalog(ENTRIES, EN_LABELS, { noColor: false });
    expect(out).toMatch(ANSI_RE);
  });

  // TERMINAL-TOOLS-003 — the auto-detect default follows the project color
  // SSOT chain (theme.ts shouldUseColor: --no-color > FORCE_COLOR > NO_COLOR >
  // TTY), so a piped `/help` is deterministic machine-safe text. Real-binary
  // evidence (2026-09-02): `printf '/help\n' | deckent` emitted 78 SGR codes.
  it('emits no ANSI by default when stdout is not a TTY (pipe / redirect determinism)', () => {
    saveEnv();
    delete process.env['NO_COLOR'];
    delete process.env['FORCE_COLOR'];
    expect(process.stdout.isTTY).not.toBe(true); // vitest workers run piped
    expect(renderCatalog(ENTRIES, EN_LABELS)).not.toMatch(ANSI_RE);
  });

  it('FORCE_COLOR=1 re-enables color off-TTY by default (same precedence as theme.ts)', () => {
    saveEnv();
    delete process.env['NO_COLOR'];
    process.env['FORCE_COLOR'] = '1';
    expect(renderCatalog(ENTRIES, EN_LABELS)).toMatch(ANSI_RE);
  });

  it('colored and non-colored renders carry the same visible text once ANSI is stripped', () => {
    const colored = renderCatalog(ENTRIES, EN_LABELS, { noColor: false });
    const plain = renderCatalog(ENTRIES, EN_LABELS, { noColor: true });
    // eslint-disable-next-line no-control-regex
    const stripped = colored.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped).toBe(plain);
  });
});
