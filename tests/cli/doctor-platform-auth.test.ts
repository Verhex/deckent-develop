// Task 368-002 (ONB-2-DILIM-3) — doctor windows-native platform profile +
// config-based auth-state probe.
//
// Hermetic: mocks node:fs (readFileSync/existsSync) and node:os (platform) so
// win32/linux/WSL/darwin/unknown scenarios are all reproducible without
// touching the real host. buildAuthStateReport is exercised with an injected
// env object (never real process.env) and mocked .deck reads — no network, no
// subprocess, no real credentials file.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (same pattern as tests/cli/doctor-backend-aware.test.ts) ───

vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs')>(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  accessSync: vi.fn(),
  constants: { W_OK: 2 },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    platform: vi.fn().mockReturnValue('linux'),
  };
});

import { readFileSync, existsSync } from 'node:fs';
import { platform } from 'node:os';
import {
  buildPlatformProfileReport,
  formatPlatformProfileLines,
  buildAuthStateReport,
  formatAuthStateLines,
} from '../../src/cli/commands/doctor.js';

function throwFor(path: string): never {
  throw new Error(`ENOENT: no such file — ${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(readFileSync).mockImplementation((p: unknown) => throwFor(String(p)));
  delete process.env['WSL_DISTRO_NAME'];
  delete process.env['WSL_INTEROP'];
});

// ─── buildPlatformProfileReport ────────────────────────────────────────

describe('buildPlatformProfileReport — WSL/linux/win32 detection', () => {
  it('win32: label is "Windows (native)" and 3 adapted checks are honestly disclosed', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const report = buildPlatformProfileReport('en');
    expect(report.platform).toBe('win32');
    expect(report.isWSL).toBe(false);
    expect(report.label).toBe('Windows (native)');
    expect(report.adaptedChecks).toHaveLength(3);
    expect(report.adaptedChecks.map(c => c.name)).toEqual(['tmux', 'Write Permissions', 'Path Separators']);
    for (const c of report.adaptedChecks) {
      expect(c.note.length).toBeGreaterThan(0);
    }
  });

  it('win32: adapted-check notes are localized to Turkish', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const report = buildPlatformProfileReport('tr');
    expect(report.label).toBe('Windows (native)');
    const tmuxNote = report.adaptedChecks.find(c => c.name === 'tmux')!.note;
    expect(tmuxNote).toContain('Windows');
    expect(tmuxNote).not.toBe(buildPlatformProfileReport('en').adaptedChecks[0]!.note);
  });

  it('linux (no WSL signal): isWSL=false, no adapted checks, honest empty disclosure', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => throwFor(String(p)));
    const report = buildPlatformProfileReport('en');
    expect(report.platform).toBe('linux');
    expect(report.isWSL).toBe(false);
    expect(report.label).toBe('Linux (fully supported)');
    expect(report.adaptedChecks).toEqual([]);
  });

  it('linux + WSL_DISTRO_NAME env var: isWSL=true, WSL label', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    process.env['WSL_DISTRO_NAME'] = 'Ubuntu-22.04';
    const report = buildPlatformProfileReport('en');
    expect(report.isWSL).toBe(true);
    expect(report.label).toBe('WSL2/Linux (fully supported)');
    expect(report.adaptedChecks).toEqual([]);
  });

  it('linux + /proc/version microsoft signature: isWSL=true', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if (String(p) === '/proc/version') return 'Linux version 5.15.0-microsoft-standard-WSL2';
      return throwFor(String(p));
    });
    const report = buildPlatformProfileReport('en');
    expect(report.isWSL).toBe(true);
  });

  it('darwin: macOS label, no adapted checks', () => {
    vi.mocked(platform).mockReturnValue('darwin' as NodeJS.Platform);
    const report = buildPlatformProfileReport('en');
    expect(report.label).toBe('macOS (fully supported)');
    expect(report.adaptedChecks).toEqual([]);
  });

  it('unknown platform: honest "untested" label naming the actual platform value', () => {
    vi.mocked(platform).mockReturnValue('freebsd' as NodeJS.Platform);
    const report = buildPlatformProfileReport('en');
    expect(report.label).toContain('freebsd');
    expect(report.label).toMatch(/untested/i);
    expect(report.adaptedChecks).toEqual([]);
  });
});

// ─── formatPlatformProfileLines ────────────────────────────────────────

describe('formatPlatformProfileLines', () => {
  it('renders header + platform/label line', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    const report = buildPlatformProfileReport('en');
    const lines = formatPlatformProfileLines(report, 'en');
    expect(lines[0]).toBe('Platform Profile:');
    expect(lines.some(l => l.includes('linux') && l.includes('Linux (fully supported)'))).toBe(true);
  });

  it('win32: renders the adapted-checks disclosure with all 3 entries', () => {
    vi.mocked(platform).mockReturnValue('win32' as NodeJS.Platform);
    const report = buildPlatformProfileReport('en');
    const lines = formatPlatformProfileLines(report, 'en');
    expect(lines.some(l => l.includes('adaptations'))).toBe(true);
    expect(lines.some(l => l.includes('tmux:'))).toBe(true);
    expect(lines.some(l => l.includes('Write Permissions:'))).toBe(true);
    expect(lines.some(l => l.includes('Path Separators:'))).toBe(true);
  });

  it('non-win32: no adapted-checks disclosure section (nothing to silently hide)', () => {
    vi.mocked(platform).mockReturnValue('darwin' as NodeJS.Platform);
    const report = buildPlatformProfileReport('en');
    const lines = formatPlatformProfileLines(report, 'en');
    expect(lines.some(l => l.includes('adaptations'))).toBe(false);
  });

  it('localizes the header to Turkish', () => {
    vi.mocked(platform).mockReturnValue('linux' as NodeJS.Platform);
    const report = buildPlatformProfileReport('tr');
    const lines = formatPlatformProfileLines(report, 'tr');
    expect(lines[0]).toBe('Platform Profili:');
  });
});

// ─── buildAuthStateReport ───────────────────────────────────────────────

describe('buildAuthStateReport — config-based, network-free 3-state probe', () => {
  it('env var present (native SDK key) → connected', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const results = buildAuthStateReport('/mock/root', { ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(results.find(r => r.provider === 'claude')?.state).toBe('connected');
  });

  it('env var present (deckent alias key) → connected', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const results = buildAuthStateReport('/mock/root', { DECKENT_OPENAI_API_KEY: 'sk-xxx' });
    expect(results.find(r => r.provider === 'codex')?.state).toBe('connected');
  });

  it('gemini via GOOGLE_API_KEY → connected', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const results = buildAuthStateReport('/mock/root', { GOOGLE_API_KEY: 'goog-xxx' });
    expect(results.find(r => r.provider === 'gemini')?.state).toBe('connected');
  });

  it('no env + no .deck file → missing for all 3 default providers', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const results = buildAuthStateReport('/mock/root', {});
    expect(results).toHaveLength(3);
    expect(results.every(r => r.state === 'missing')).toBe(true);
  });

  it('no env + .deck file with a matching key → connected via deck source, others missing', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if (String(p).endsWith('.deck')) return 'DECKENT_CLAUDE_API_KEY=sk-ant-from-deck\n';
      return throwFor(String(p));
    });
    const results = buildAuthStateReport('/mock/root', {});
    expect(results.find(r => r.provider === 'claude')?.state).toBe('connected');
    expect(results.find(r => r.provider === 'codex')?.state).toBe('missing');
    expect(results.find(r => r.provider === 'gemini')?.state).toBe('missing');
  });

  it('empty-string env var does NOT count as connected (falls through to .deck/missing)', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const results = buildAuthStateReport('/mock/root', { ANTHROPIC_API_KEY: '   ' });
    expect(results.find(r => r.provider === 'claude')?.state).toBe('missing');
  });

  it('an unsupported provider name → unknown (honest, never guessed — same convention as probeProviderAuth)', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const results = buildAuthStateReport('/mock/root', {}, ['claude', 'ollama']);
    expect(results.find(r => r.provider === 'claude')?.state).toBe('missing');
    expect(results.find(r => r.provider === 'ollama')?.state).toBe('unknown');
  });

  it('env var short-circuits before the .deck lookup even when unrelated providers are unknown', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const results = buildAuthStateReport('/mock/root', { OPENAI_API_KEY: 'sk-xxx' }, ['codex', 'unsupported-name']);
    expect(results.find(r => r.provider === 'codex')?.state).toBe('connected');
    expect(results.find(r => r.provider === 'unsupported-name')?.state).toBe('unknown');
  });
});

// ─── formatAuthStateLines ───────────────────────────────────────────────

describe('formatAuthStateLines', () => {
  it('renders one localized line per provider (en)', () => {
    const lines = formatAuthStateLines(
      [
        { provider: 'claude', state: 'connected' },
        { provider: 'codex', state: 'missing' },
        { provider: 'gemini', state: 'unknown' },
      ],
      'en',
    );
    expect(lines[0]).toBe('Auth State (config-based, no network):');
    expect(lines.some(l => l.includes('Claude') && l.includes('connected'))).toBe(true);
    expect(lines.some(l => l.includes('Codex') && l.includes('missing'))).toBe(true);
    expect(lines.some(l => l.includes('Gemini') && l.includes('unknown'))).toBe(true);
  });

  it('renders localized Turkish states', () => {
    const lines = formatAuthStateLines(
      [
        { provider: 'claude', state: 'connected' },
        { provider: 'codex', state: 'missing' },
        { provider: 'gemini', state: 'unknown' },
      ],
      'tr',
    );
    expect(lines.some(l => l.includes('bağlı'))).toBe(true);
    expect(lines.some(l => l.includes('eksik'))).toBe(true);
    expect(lines.some(l => l.includes('bilinmiyor'))).toBe(true);
  });
});
