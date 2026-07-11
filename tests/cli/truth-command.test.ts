// Hermetic tests for the `deckent truth` surface (born-640b, Task 404-002):
// CLI helpers (table / --json / --check ratchet) + MCP `deckent_truth` parity.
//
// All fixtures live under a fresh tmpdir (os.tmpdir()) — no project root / HOME
// / gitignored state is read. The pure CLI helpers take an injected config; the
// MCP handler calls loadConfig(process.cwd()) internally, so loadConfig is
// mocked and the handler is exercised with process.chdir into the fixture root.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock only loadConfig — spread the real module so its other exports (pulled in
// transitively) stay defined. Mirrors tests/mcp/server.test.ts.
vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/config.js')>()),
  loadConfig: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { FEATURES_MANIFEST_FILE } from '../../src/core/constants.js';
import {
  loadTruthManifest,
  collectTruthDefs,
  computeTruth,
  renderTruthTable,
  renderHalfWireSection,
  truthToJson,
  loadBaseline,
  writeBaseline,
  diffRatchet,
  runRatchet,
  truthMessage,
  TRUTH_BASELINE_FILE,
  type TruthManifestEntry,
} from '../../src/cli/commands/truth.js';
import { registerTruthTool } from '../../src/mcp/tools/truth.js';
import type { FeatureTruthContext } from '../../src/core/feature-truth.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'truth-cmd-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeFixtureFile(rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function writeManifest(truth: TruthManifestEntry[]): void {
  writeFixtureFile(
    FEATURES_MANIFEST_FILE,
    JSON.stringify({ _meta: { version: 'test' }, truth, active: [], lightly_used: [], dormant: [], dead: [] }, null, 2),
  );
}

const fixtureConfig = { demo: { enabled: true } };

function ctx(): FeatureTruthContext {
  return { config: fixtureConfig, projectRoot: root, now: new Date('2026-07-11T00:00:00.000Z') };
}

/**
 * Standard fixture: one genuinely-wired feature (code+wired+enabled+proof all
 * green) and one orphan (code-ok, no call-site → half-wire candidate).
 */
function buildStandardFixture(): TruthManifestEntry[] {
  writeFixtureFile('src/wired-exporter.ts', 'export const wiredThing = () => {};\n');
  writeFixtureFile('src/caller.ts', 'import { wiredThing } from "./wired-exporter.js";\n\nwiredThing();\n');
  writeFixtureFile('src/orphan-exporter.ts', 'export const orphanThing = () => {};\n');
  writeFixtureFile('.deckent/proof.txt', 'ok');
  const truth: TruthManifestEntry[] = [
    {
      id: 'wired-feature',
      label: 'Wired Feature',
      entryModule: 'src/wired-exporter.ts',
      exportName: 'wiredThing',
      prodCallsitePattern: 'wiredThing\\(',
      flagPath: 'demo.enabled',
      proof: { kind: 'artifact-file', ref: '.deckent/proof.txt' },
    },
    {
      id: 'orphan-feature',
      label: 'Orphan Feature',
      entryModule: 'src/orphan-exporter.ts',
      exportName: 'orphanThing',
      prodCallsitePattern: 'orphanThing\\(',
    },
  ];
  writeManifest(truth);
  return truth;
}

// ─── Manifest → defs ─────────────────────────────────────────────────────────

describe('loadTruthManifest / collectTruthDefs', () => {
  it('returns null when the manifest is absent', () => {
    expect(loadTruthManifest(root)).toBeNull();
  });

  it('returns [] when the manifest exists but declares no truth-blocks', () => {
    writeFixtureFile(FEATURES_MANIFEST_FILE, JSON.stringify({ _meta: {} }));
    expect(loadTruthManifest(root)).toEqual([]);
  });

  it('returns the truth array when present', () => {
    const truth = buildStandardFixture();
    expect(loadTruthManifest(root)).toEqual(truth);
  });

  it('maps label→title and omits undefined optional keys', () => {
    const defs = collectTruthDefs([{ id: 'x', entryModule: 'src/x.ts' }]);
    expect(defs[0]).toEqual({ id: 'x', title: 'x', entryModule: 'src/x.ts' });
  });

  it('carries every declared field through to the def', () => {
    const [def] = collectTruthDefs([
      {
        id: 'y',
        label: 'Y feature',
        entryModule: 'src/y.ts',
        exportName: 'yFn',
        prodCallsitePattern: 'yFn\\(',
        flagPath: 'y.enabled',
        proof: { kind: 'smoke-cmd', cmd: 'deckent y' },
      },
    ]);
    expect(def).toEqual({
      id: 'y',
      title: 'Y feature',
      entryModule: 'src/y.ts',
      exportName: 'yFn',
      prodCallsitePattern: 'yFn\\(',
      flagPath: 'y.enabled',
      proof: { kind: 'smoke-cmd', cmd: 'deckent y' },
    });
  });
});

// ─── computeTruth ────────────────────────────────────────────────────────────

describe('computeTruth', () => {
  it('resolves the wired feature green and flags the orphan as half-wire', () => {
    const truth = buildStandardFixture();
    const run = computeTruth(truth, ctx());

    const wired = run.results.find((r) => r.id === 'wired-feature')!;
    expect(wired.code).toBe('ok');
    expect(wired.wired).toBe('ok');
    expect(wired.enabled).toBe('on');
    expect(wired.proof).toBe('ok');

    const orphan = run.results.find((r) => r.id === 'orphan-feature')!;
    expect(orphan.code).toBe('ok');
    expect(orphan.wired).toBe('none');

    expect(run.halfWireCandidates).toEqual(['orphan-feature']);
    expect(run.labels['wired-feature']).toBe('Wired Feature');
  });

  it('never reimplements the engine — undefined prodCallsitePattern → wired=undefined, not half-wire', () => {
    writeFixtureFile('src/script-gate.ts', 'export const gateMain = () => {};\n');
    const truth: TruthManifestEntry[] = [
      { id: 'gate', label: 'Gate', entryModule: 'src/script-gate.ts', exportName: 'gateMain' },
    ];
    const run = computeTruth(truth, ctx());
    expect(run.results[0]!.wired).toBe('undefined');
    expect(run.halfWireCandidates).toEqual([]);
  });
});

// ─── Render ──────────────────────────────────────────────────────────────────

describe('renderTruthTable / renderHalfWireSection', () => {
  it('renders headers + status cells with no ANSI under NO_COLOR', () => {
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    try {
      const run = computeTruth(buildStandardFixture(), ctx());
      const table = renderTruthTable(run, 'en');
      expect(table).toContain('feature');
      expect(table).toContain('code');
      expect(table).toContain('Wired Feature');
      expect(table).toContain('ok');
      expect(table).toContain('none');
      expect(table).not.toContain('\x1b['); // NO_COLOR-clean
    } finally {
      if (prev === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = prev;
    }
  });

  it('empty run → "no truth-blocks" message', () => {
    const run = computeTruth([], ctx());
    expect(renderTruthTable(run, 'en')).toContain('no truth-blocks');
  });

  it('half-wire section lists the candidate; reports none when all wired', () => {
    const run = computeTruth(buildStandardFixture(), ctx());
    const section = renderHalfWireSection(run, 'en');
    expect(section).toContain('HALF-WIRE');
    expect(section).toContain('orphan-feature');

    writeFixtureFile('src/only-wired.ts', 'export const onlyWired = () => {};\n');
    writeFixtureFile('src/only-caller.ts', 'onlyWired();\n');
    const cleanRun = computeTruth(
      [{ id: 'w', label: 'W', entryModule: 'src/only-wired.ts', exportName: 'onlyWired', prodCallsitePattern: 'onlyWired\\(' }],
      ctx(),
    );
    expect(cleanRun.halfWireCandidates).toEqual([]);
    expect(renderHalfWireSection(cleanRun, 'en')).toContain('none');
  });
});

// ─── --json ──────────────────────────────────────────────────────────────────

describe('truthToJson', () => {
  it('projects features + halfWireCandidates + summary', () => {
    const run = computeTruth(buildStandardFixture(), ctx());
    const json = truthToJson(run) as {
      features: Array<{ id: string; wired: string }>;
      halfWireCandidates: string[];
      summary: { total: number; halfWire: number };
    };
    expect(json.summary).toEqual({ total: 2, halfWire: 1 });
    expect(json.halfWireCandidates).toEqual(['orphan-feature']);
    expect(json.features.map((f) => f.id).sort()).toEqual(['orphan-feature', 'wired-feature']);
  });
});

// ─── i18n (en + tr) ──────────────────────────────────────────────────────────

describe('truthMessage i18n', () => {
  it('returns en + tr variants and interpolates {vars}', () => {
    expect(truthMessage('truth.ratchet_ok', 'en', { count: '3' })).toContain('RATCHET OK');
    const tr = truthMessage('truth.ratchet_ok', 'tr', { count: '3' });
    expect(tr).toContain('RATCHET TAMAM');
    expect(tr).toContain('3');
  });

  it('every key defines both en and tr', () => {
    // Sample the ratchet/table keys exercised by the command surface.
    for (const key of ['truth.header_title', 'truth.col_feature', 'truth.halfwire_header', 'truth.baseline_missing', 'truth.ratchet_new']) {
      expect(truthMessage(key, 'en')).not.toBe(key);
      expect(truthMessage(key, 'tr')).not.toBe(key);
    }
  });
});

// ─── --check ratchet (all three exit codes 0/1/2 + --write) ──────────────────

describe('ratchet (--check)', () => {
  it('diffRatchet computes new + resolved sets', () => {
    expect(diffRatchet(['a', 'b'], { halfWireCandidates: ['b', 'c'] })).toEqual({
      newCandidates: ['a'],
      resolved: ['c'],
    });
  });

  it('exit 2 — no baseline present → propose creation', () => {
    const run = computeTruth(buildStandardFixture(), ctx());
    const outcome = runRatchet(run, null, 'en', { write: false, root, nowIso: '2026-07-11T00:00:00.000Z' });
    expect(outcome.exitCode).toBe(2);
    expect(outcome.lines.join('\n')).toContain('--check --write');
    expect(outcome.lines.join('\n')).toContain('orphan-feature');
  });

  it('exit 1 — a NEW half-wire candidate not in the baseline', () => {
    const run = computeTruth(buildStandardFixture(), ctx());
    const outcome = runRatchet(run, { halfWireCandidates: [] }, 'en', { write: false, root, nowIso: 'x' });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.lines.join('\n')).toContain('orphan-feature');
  });

  it('exit 0 — baseline matches the live candidate set', () => {
    const run = computeTruth(buildStandardFixture(), ctx());
    const outcome = runRatchet(run, { halfWireCandidates: ['orphan-feature'] }, 'en', { write: false, root, nowIso: 'x' });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.lines.join('\n')).toContain('RATCHET OK');
  });

  it('--write pins the baseline (sorted), then a re-check passes (exit 0)', () => {
    const run = computeTruth(buildStandardFixture(), ctx());
    const written = runRatchet(run, null, 'en', { write: true, root, nowIso: '2026-07-11T00:00:00.000Z' });
    expect(written.exitCode).toBe(0);
    expect(existsSync(join(root, TRUTH_BASELINE_FILE))).toBe(true);

    const loaded = loadBaseline(root)!;
    expect(loaded.halfWireCandidates).toEqual(['orphan-feature']);

    const recheck = runRatchet(run, loadBaseline(root), 'en', { write: false, root, nowIso: 'x' });
    expect(recheck.exitCode).toBe(0);
  });

  it('malformed baseline degrades to empty set (fail-soft), not "everything is new"', () => {
    writeFixtureFile(TRUTH_BASELINE_FILE, '{ not valid json');
    const loaded = loadBaseline(root);
    expect(loaded).toEqual({ halfWireCandidates: [] });
  });
});

// ─── MCP deckent_truth parity ────────────────────────────────────────────────

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

function captureTruthTool(): { name: string; handler: ToolHandler } {
  let name = '';
  let handler: ToolHandler | undefined;
  const stub = {
    registerTool: (n: string, _cfg: unknown, h: ToolHandler) => {
      name = n;
      handler = h;
      return {};
    },
  } as unknown as Parameters<typeof registerTruthTool>[0];
  registerTruthTool(stub);
  return { name, handler: handler! };
}

describe('deckent_truth MCP tool', () => {
  let prevCwd: string;

  beforeEach(() => {
    prevCwd = process.cwd();
    vi.mocked(loadConfig).mockResolvedValue(fixtureConfig as never);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    vi.mocked(loadConfig).mockReset();
  });

  it('registers a tool named deckent_truth (real registration, not a claim)', () => {
    const { name } = captureTruthTool();
    expect(name).toBe('deckent_truth');
  });

  it('handler returns the same engine results as the CLI computeTruth (parity)', async () => {
    buildStandardFixture();
    process.chdir(root);
    const { handler } = captureTruthTool();
    const result = await handler({});
    const payload = JSON.parse(result.content[0]!.text) as {
      summary: { total: number; halfWire: number };
      halfWireCandidates: string[];
      features: Array<{ id: string; wired: string; enabled: string }>;
    };
    expect(payload.summary).toEqual({ total: 2, halfWire: 1 });
    expect(payload.halfWireCandidates).toEqual(['orphan-feature']);
    const wired = payload.features.find((f) => f.id === 'wired-feature')!;
    expect(wired.wired).toBe('ok');
    expect(wired.enabled).toBe('on');
  });

  it('check=true includes a read-only ratchet diff vs the pinned baseline', async () => {
    buildStandardFixture();
    writeBaseline(root, [], '2026-07-11T00:00:00.000Z'); // empty baseline → orphan is new
    process.chdir(root);
    const { handler } = captureTruthTool();
    const result = await handler({ check: true });
    const payload = JSON.parse(result.content[0]!.text) as {
      ratchet: { baseline: string; newCandidates: string[] };
    };
    expect(payload.ratchet.baseline).toBe('present');
    expect(payload.ratchet.newCandidates).toEqual(['orphan-feature']);
  });

  it('reports isError when the manifest is missing', async () => {
    process.chdir(root); // fixture not built → no manifest
    const { handler } = captureTruthTool();
    const result = await handler({});
    expect(result.isError).toBe(true);
  });
});
