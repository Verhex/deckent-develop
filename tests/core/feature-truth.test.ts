import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveTruth,
  classifyHalfWire,
  type FeatureTruthDef,
  type FeatureTruthContext,
  type FeatureTruthResult,
} from '../../src/core/feature-truth.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'feature-truth-test-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

/** Write a fixture file under projectRoot, creating parent directories as needed. */
function writeFixture(relPath: string, content: string): void {
  const full = join(projectRoot, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function ctx(overrides: Partial<FeatureTruthContext> = {}): FeatureTruthContext {
  return {
    config: overrides.config ?? {},
    projectRoot,
    now: overrides.now ?? new Date('2026-07-11T00:00:00.000Z'),
  };
}

function resolveSingle(def: FeatureTruthDef, c: FeatureTruthContext): FeatureTruthResult {
  const [result] = resolveTruth([def], c);
  return result;
}

// ─── L1-CODE ────────────────────────────────────────────────────────────────

describe('L1-CODE', () => {
  it('missing entryModule file -> code=missing', () => {
    const result = resolveSingle(
      { id: 'f1', title: 'F1', entryModule: 'src/does-not-exist.ts' },
      ctx(),
    );
    expect(result.code).toBe('missing');
    expect(result.evidence.exportFound).toBe(false);
  });

  it('entryModule exists, no exportName requested -> code=ok', () => {
    writeFixture('src/plain.ts', 'export const anything = 1;\n');
    const result = resolveSingle({ id: 'f2', title: 'F2', entryModule: 'src/plain.ts' }, ctx());
    expect(result.code).toBe('ok');
  });

  it.each([
    ['export function', 'export function doThing() { return 1; }'],
    ['export async function', 'export async function doThing() { return 1; }'],
    ['export class', 'export class doThing {}'],
    ['export const', 'export const doThing = () => 1;'],
    ['export interface', 'export interface doThing { x: number }'],
    ['export type', 'export type doThing = number;'],
    ['export default function', 'export default function doThing() { return 1; }'],
    ['export brace list', 'function doThing() {}\nexport { doThing };'],
    ['export brace alias', 'function inner() {}\nexport { inner as doThing };'],
  ])('recognizes %s declarations via source-text scan (no require)', (_label, source) => {
    writeFixture('src/exporter.ts', source);
    const result = resolveSingle(
      { id: 'f3', title: 'F3', entryModule: 'src/exporter.ts', exportName: 'doThing' },
      ctx(),
    );
    expect(result.code).toBe('ok');
    expect(result.evidence.exportFound).toBe(true);
  });

  it('exportName not present in module -> code=missing', () => {
    writeFixture('src/exporter.ts', 'export const somethingElse = 1;\n');
    const result = resolveSingle(
      { id: 'f4', title: 'F4', entryModule: 'src/exporter.ts', exportName: 'doThing' },
      ctx(),
    );
    expect(result.code).toBe('missing');
    expect(result.evidence.exportFound).toBe(false);
  });
});

// ─── L2-WIRED ───────────────────────────────────────────────────────────────

describe('L2-WIRED', () => {
  it('no prodCallsitePattern declared -> wired=undefined (undefined-honesty)', () => {
    writeFixture('src/exporter.ts', 'export function doThing() {}\n');
    const result = resolveSingle(
      { id: 'f5', title: 'F5', entryModule: 'src/exporter.ts', exportName: 'doThing' },
      ctx(),
    );
    expect(result.wired).toBe('undefined');
  });

  it('call-site found in a non-test src file -> wired=ok with file:line evidence', () => {
    // Arrow-const form deliberately avoids "doThing(" appearing in the declaration
    // itself (`doThing = (` has a space before the paren) so the only match is the
    // real call-site below — keeps the exact-evidence assertion meaningful.
    writeFixture('src/exporter.ts', 'export const doThing = () => {};\n');
    writeFixture('src/caller.ts', 'import { doThing } from "./exporter.js";\n\ndoThing();\n');
    const result = resolveSingle(
      {
        id: 'f6',
        title: 'F6',
        entryModule: 'src/exporter.ts',
        exportName: 'doThing',
        prodCallsitePattern: 'doThing\\(',
      },
      ctx(),
    );
    expect(result.wired).toBe('ok');
    expect(result.evidence.callsites).toEqual([{ file: 'src/caller.ts', line: 3 }]);
  });

  it('no call-site anywhere under src/ -> wired=none', () => {
    writeFixture('src/exporter.ts', 'export const doThing = () => {};\n');
    const result = resolveSingle(
      {
        id: 'f7',
        title: 'F7',
        entryModule: 'src/exporter.ts',
        exportName: 'doThing',
        prodCallsitePattern: 'doThing\\(',
      },
      ctx(),
    );
    expect(result.wired).toBe('none');
    expect(result.evidence.callsites).toEqual([]);
  });

  it('call-site present only under tests/ -> excluded -> wired=none', () => {
    writeFixture('src/exporter.ts', 'export const doThing = () => {};\n');
    writeFixture('tests/exporter.test.ts', 'import { doThing } from "../src/exporter.js";\ndoThing();\n');
    const result = resolveSingle(
      {
        id: 'f8',
        title: 'F8',
        entryModule: 'src/exporter.ts',
        exportName: 'doThing',
        prodCallsitePattern: 'doThing\\(',
      },
      ctx(),
    );
    expect(result.wired).toBe('none');
  });
});

// ─── L3-ENABLED ─────────────────────────────────────────────────────────────

describe('L3-ENABLED', () => {
  it('no flagPath declared -> enabled=no-flag', () => {
    const result = resolveSingle({ id: 'f9', title: 'F9', entryModule: 'src/x.ts' }, ctx());
    expect(result.enabled).toBe('no-flag');
  });

  it('flagPath resolves to true -> enabled=on', () => {
    const result = resolveSingle(
      { id: 'f10', title: 'F10', entryModule: 'src/x.ts', flagPath: 'features.thing.enabled' },
      ctx({ config: { features: { thing: { enabled: true } } } }),
    );
    expect(result.enabled).toBe('on');
    expect(result.evidence.flagValue).toBe(true);
  });

  it('flagPath resolves to false -> enabled=off', () => {
    const result = resolveSingle(
      { id: 'f11', title: 'F11', entryModule: 'src/x.ts', flagPath: 'features.thing.enabled' },
      ctx({ config: { features: { thing: { enabled: false } } } }),
    );
    expect(result.enabled).toBe('off');
  });

  it('flagPath not present in config -> enabled=no-flag (honest, not a crash)', () => {
    const result = resolveSingle(
      { id: 'f12', title: 'F12', entryModule: 'src/x.ts', flagPath: 'features.missing.enabled' },
      ctx({ config: {} }),
    );
    expect(result.enabled).toBe('no-flag');
  });
});

// ─── L4-LIVE-PROOF ──────────────────────────────────────────────────────────

describe('L4-LIVE-PROOF', () => {
  it('no proof declared -> proof=undefined', () => {
    const result = resolveSingle({ id: 'f13', title: 'F13', entryModule: 'src/x.ts' }, ctx());
    expect(result.proof).toBe('undefined');
  });

  it('artifact-file exists and non-empty -> proof=ok', () => {
    writeFixture('.deckent/proof.txt', 'proof-content');
    const result = resolveSingle(
      {
        id: 'f14',
        title: 'F14',
        entryModule: 'src/x.ts',
        proof: { kind: 'artifact-file', ref: '.deckent/proof.txt' },
      },
      ctx(),
    );
    expect(result.proof).toBe('ok');
  });

  it('artifact-file missing -> proof=missing', () => {
    const result = resolveSingle(
      {
        id: 'f15',
        title: 'F15',
        entryModule: 'src/x.ts',
        proof: { kind: 'artifact-file', ref: '.deckent/nope.txt' },
      },
      ctx(),
    );
    expect(result.proof).toBe('missing');
  });

  it('artifact-file exists but empty -> proof=missing', () => {
    writeFixture('.deckent/empty.txt', '');
    const result = resolveSingle(
      {
        id: 'f16',
        title: 'F16',
        entryModule: 'src/x.ts',
        proof: { kind: 'artifact-file', ref: '.deckent/empty.txt' },
      },
      ctx(),
    );
    expect(result.proof).toBe('missing');
  });

  it('journal-recent last entry within maxAgeDays -> proof=ok', () => {
    writeFixture(
      '.deckent/traces/journal.jsonl',
      [
        JSON.stringify({ ts: '2026-07-01T00:00:00.000Z', event: 'old' }),
        JSON.stringify({ ts: '2026-07-10T12:00:00.000Z', event: 'recent' }),
      ].join('\n') + '\n',
    );
    const result = resolveSingle(
      {
        id: 'f17',
        title: 'F17',
        entryModule: 'src/x.ts',
        proof: { kind: 'journal-recent', ref: '.deckent/traces/journal.jsonl', maxAgeDays: 7 },
      },
      ctx({ now: new Date('2026-07-11T00:00:00.000Z') }),
    );
    expect(result.proof).toBe('ok');
    expect(result.evidence.proofCheckedAt).toBe('2026-07-10T12:00:00.000Z');
  });

  it('journal-recent last entry older than maxAgeDays -> proof=stale', () => {
    writeFixture(
      '.deckent/traces/journal.jsonl',
      JSON.stringify({ ts: '2026-06-01T00:00:00.000Z', event: 'ancient' }) + '\n',
    );
    const result = resolveSingle(
      {
        id: 'f18',
        title: 'F18',
        entryModule: 'src/x.ts',
        proof: { kind: 'journal-recent', ref: '.deckent/traces/journal.jsonl', maxAgeDays: 7 },
      },
      ctx({ now: new Date('2026-07-11T00:00:00.000Z') }),
    );
    expect(result.proof).toBe('stale');
  });

  it('journal-recent missing file -> proof=missing', () => {
    const result = resolveSingle(
      {
        id: 'f19',
        title: 'F19',
        entryModule: 'src/x.ts',
        proof: { kind: 'journal-recent', ref: '.deckent/traces/nope.jsonl', maxAgeDays: 7 },
      },
      ctx(),
    );
    expect(result.proof).toBe('missing');
  });

  it('journal-recent torn/unparseable last line -> proof=missing (fail-soft, no throw)', () => {
    writeFixture('.deckent/traces/journal.jsonl', '{"ts": "2026-07-10T00:00:00.000Z"}\n{"ts": "2026-07-11T00:00');
    const result = resolveSingle(
      {
        id: 'f20',
        title: 'F20',
        entryModule: 'src/x.ts',
        proof: { kind: 'journal-recent', ref: '.deckent/traces/journal.jsonl', maxAgeDays: 7 },
      },
      ctx(),
    );
    expect(result.proof).toBe('missing');
  });

  it("smoke-cmd is never executed here -> proof=declared", () => {
    const result = resolveSingle(
      {
        id: 'f21',
        title: 'F21',
        entryModule: 'src/x.ts',
        proof: { kind: 'smoke-cmd', cmd: 'node dist/cli/entry.js truth --check' },
      },
      ctx(),
    );
    expect(result.proof).toBe('declared');
  });
});

// ─── classifyHalfWire ───────────────────────────────────────────────────────

describe('classifyHalfWire', () => {
  it('code-ok + wired-none -> half-wire candidate (canonical export-var + no-callsite case)', () => {
    writeFixture('src/orphan.ts', 'export const orphanHelper = () => 1;\n');
    const result = resolveSingle(
      {
        id: 'orphan',
        title: 'Orphan Helper',
        entryModule: 'src/orphan.ts',
        exportName: 'orphanHelper',
        prodCallsitePattern: 'orphanHelper\\(',
      },
      ctx(),
    );
    const classification = classifyHalfWire(result);
    expect(classification.isHalfWireCandidate).toBe(true);
  });

  it('code-ok + wired-ok -> not a half-wire candidate', () => {
    writeFixture('src/exporter.ts', 'export function doThing() {}\n');
    writeFixture('src/caller.ts', 'doThing();\n');
    const result = resolveSingle(
      {
        id: 'wired-ok',
        title: 'Wired OK',
        entryModule: 'src/exporter.ts',
        exportName: 'doThing',
        prodCallsitePattern: 'doThing\\(',
      },
      ctx(),
    );
    expect(classifyHalfWire(result).isHalfWireCandidate).toBe(false);
  });

  it('code-missing + wired-none -> not a half-wire candidate (nothing shipped at all)', () => {
    const result = resolveSingle(
      {
        id: 'nothing',
        title: 'Nothing Shipped',
        entryModule: 'src/does-not-exist.ts',
        prodCallsitePattern: 'neverMatches\\(',
      },
      ctx(),
    );
    expect(result.code).toBe('missing');
    expect(classifyHalfWire(result).isHalfWireCandidate).toBe(false);
  });
});

// ─── 6-vaka mini-vault (synthetic, named after the historical half-wire family) ────
//
// Each fixture below represents a distinct *shape* of the code-ok+wired-none pattern
// that motivated born-640 (see DIRECTIVES.md sprint-404 Task 1 + born-backlog #640/#641).
// All 6 are still flagged half-wire candidates by classifyHalfWire, but for different
// mechanical reasons — this both documents the historical vaka family by name and
// exercises the distinct engine code-paths that let each one slip through un-caught
// before the compiler existed.

describe('6-vaka mini-vault (classifyHalfWire regression vault)', () => {
  function buildVaultDefs(): FeatureTruthDef[] {
    // 1. tool_surface-a778151a — total orphan: export exists, zero callsites anywhere.
    //    Arrow-const form deliberately avoids "registerToolSurface(" appearing in its
    //    own declaration (space before the paren) — a `function name(` declaration
    //    would otherwise self-match a `name\(` call-site pattern on its own line.
    writeFixture('src/tool-surface.ts', 'export const registerToolSurface = () => {};\n');

    // 2. recordSprintWorkerTrace — export exists; name only appears in a comment
    //    (not an actual invocation) so the invocation-syntax pattern must not match it.
    writeFixture(
      'src/trace-recorder.ts',
      'export const recordSprintWorkerTrace = (_e: unknown) => {};\n',
    );
    writeFixture(
      'src/output-collector.ts',
      '// TODO: wire this up to call recordSprintWorkerTrace eventually\nexport function collect() {}\n',
    );

    // 3. runEvaluatePhase-config — flag genuinely resolves 'on' (L3), but nothing
    //    calls the function (L2 still none) — enabled and wired are independent axes.
    writeFixture('src/evaluate-phase.ts', 'export const runEvaluatePhaseConfig = () => {};\n');

    // 4. registerCodexParityModels — a sibling export IS called from prod code, but
    //    the target export itself never is — proves pattern specificity, not just
    //    "this file is imported somewhere".
    writeFixture(
      'src/model-registry.ts',
      'export const registerCodexParityModels = () => {};\nexport const registerBaselineModels = () => {};\n',
    );
    writeFixture(
      'src/bootstrap.ts',
      'import { registerBaselineModels } from "./model-registry.js";\nregisterBaselineModels();\n',
    );

    // 5. docker-envelope — proof.kind='smoke-cmd' (declared, not run) + zero callsites —
    //    shows the proof axis is independent of the wired axis.
    writeFixture('src/docker-envelope.ts', 'export const buildDockerEnvelope = () => {};\n');

    // 6. gate-BLOCK-CLI-only — call-site exists ONLY inside tests/ — the mandatory
    //    tests/ exclusion must still resolve this to wired=none (exclusion regression).
    writeFixture('src/gate.ts', 'export const gateBlockCliOnly = () => {};\n');
    writeFixture(
      'tests/gate.test.ts',
      'import { gateBlockCliOnly } from "../src/gate.js";\ngateBlockCliOnly();\n',
    );

    return [
      {
        id: 'tool_surface-a778151a',
        title: 'tool_surface-a778151a (total orphan)',
        entryModule: 'src/tool-surface.ts',
        exportName: 'registerToolSurface',
        prodCallsitePattern: 'registerToolSurface\\(',
      },
      {
        id: 'recordSprintWorkerTrace',
        title: 'recordSprintWorkerTrace (comment-only mention)',
        entryModule: 'src/trace-recorder.ts',
        exportName: 'recordSprintWorkerTrace',
        prodCallsitePattern: 'recordSprintWorkerTrace\\(',
      },
      {
        id: 'runEvaluatePhase-config',
        title: 'runEvaluatePhase-config (enabled but unwired)',
        entryModule: 'src/evaluate-phase.ts',
        exportName: 'runEvaluatePhaseConfig',
        prodCallsitePattern: 'runEvaluatePhaseConfig\\(',
        flagPath: 'evaluatePhase.enabled',
      },
      {
        id: 'registerCodexParityModels',
        title: 'registerCodexParityModels (sibling export called instead)',
        entryModule: 'src/model-registry.ts',
        exportName: 'registerCodexParityModels',
        prodCallsitePattern: 'registerCodexParityModels\\(',
      },
      {
        id: 'docker-envelope',
        title: 'docker-envelope (declared proof, no callsite)',
        entryModule: 'src/docker-envelope.ts',
        exportName: 'buildDockerEnvelope',
        prodCallsitePattern: 'buildDockerEnvelope\\(',
        proof: { kind: 'smoke-cmd', cmd: 'node dist/cli/entry.js docker-envelope --smoke' },
      },
      {
        id: 'gate-BLOCK-CLI-only',
        title: 'gate-BLOCK-CLI-only (callsite only under tests/)',
        entryModule: 'src/gate.ts',
        exportName: 'gateBlockCliOnly',
        prodCallsitePattern: 'gateBlockCliOnly\\(',
      },
    ];
  }

  it('flags all 6 historical half-wire shapes as candidates', () => {
    const defs = buildVaultDefs();
    const results = resolveTruth(defs, ctx({ config: { evaluatePhase: { enabled: true } } }));
    expect(results).toHaveLength(6);

    for (const result of results) {
      expect(result.code, `${result.id}: code should be ok`).toBe('ok');
      expect(result.wired, `${result.id}: wired should be none`).toBe('none');
      expect(classifyHalfWire(result).isHalfWireCandidate, `${result.id}`).toBe(true);
    }

    const byId = new Map(results.map(r => [r.id, r]));
    expect(byId.get('runEvaluatePhase-config')?.enabled).toBe('on');
    expect(byId.get('docker-envelope')?.proof).toBe('declared');
  });
});

// ─── Fail-soft (born-641 lesson: no throw, no silent swallow) ─────────────────

describe('fail-soft', () => {
  it('invalid regex in prodCallsitePattern -> per-def error, siblings unaffected, no throw', () => {
    writeFixture('src/good.ts', 'export function goodFn() {}\n');
    writeFixture('src/caller.ts', 'goodFn();\n');
    writeFixture('src/bad.ts', 'export function badFn() {}\n');

    const defs: FeatureTruthDef[] = [
      {
        id: 'good',
        title: 'Good',
        entryModule: 'src/good.ts',
        exportName: 'goodFn',
        prodCallsitePattern: 'goodFn\\(',
      },
      {
        id: 'bad',
        title: 'Bad regex',
        entryModule: 'src/bad.ts',
        exportName: 'badFn',
        prodCallsitePattern: '(unterminated[', // throws at `new RegExp()`
      },
    ];

    let results: FeatureTruthResult[] = [];
    expect(() => {
      results = resolveTruth(defs, ctx());
    }).not.toThrow();

    expect(results).toHaveLength(2);
    const good = results.find(r => r.id === 'good');
    const bad = results.find(r => r.id === 'bad');

    expect(good?.error).toBeUndefined();
    expect(good?.wired).toBe('ok');

    expect(bad?.error).toBeTruthy();
    expect(bad?.code).toBe('missing');
    expect(bad?.wired).toBe('undefined');
    expect(bad?.enabled).toBe('no-flag');
    expect(bad?.proof).toBe('undefined');
  });

  it('malformed def reaching a runtime boundary -> error field, no throw, batch continues', () => {
    writeFixture('src/good.ts', 'export function goodFn() {}\n');

    const malformed = { id: 'malformed', title: 'Malformed' } as unknown as FeatureTruthDef;
    const defs: FeatureTruthDef[] = [
      { id: 'good', title: 'Good', entryModule: 'src/good.ts', exportName: 'goodFn' },
      malformed,
    ];

    let results: FeatureTruthResult[] = [];
    expect(() => {
      results = resolveTruth(defs, ctx());
    }).not.toThrow();

    expect(results).toHaveLength(2);
    expect(results.find(r => r.id === 'good')?.code).toBe('ok');
    // malformed def: entryModule is undefined -> resolveCode treats it as missing,
    // no throw is expected here since the guard is `if (!def.entryModule) return 'missing'`.
    const malformedResult = results.find(r => r.id === 'malformed');
    expect(malformedResult?.code).toBe('missing');
    expect(malformedResult?.error).toBeUndefined();
  });
});

// ─── Purity / hermeticity ───────────────────────────────────────────────────

describe('purity', () => {
  it('never reports a callsite from outside projectRoot/src (scan is scoped, not global)', () => {
    writeFixture('src/exporter.ts', 'export const doThing = () => {};\n');
    // A file OUTSIDE src/ (at project root) that also matches the pattern must be ignored.
    writeFixture('doThing-caller.ts', 'doThing();\n');
    const result = resolveSingle(
      {
        id: 'scoped',
        title: 'Scoped',
        entryModule: 'src/exporter.ts',
        exportName: 'doThing',
        prodCallsitePattern: 'doThing\\(',
      },
      ctx(),
    );
    expect(result.wired).toBe('none');
  });

  it('evidence paths are posix-normalized regardless of platform path.sep', () => {
    writeFixture('src/nested/deep/exporter.ts', 'export const doThing = () => {};\n');
    writeFixture('src/nested/deep/caller.ts', 'doThing();\n');
    const result = resolveSingle(
      {
        id: 'nested',
        title: 'Nested',
        entryModule: 'src/nested/deep/exporter.ts',
        exportName: 'doThing',
        prodCallsitePattern: 'doThing\\(',
      },
      ctx(),
    );
    expect(result.evidence.callsites?.[0]?.file).toBe('src/nested/deep/caller.ts');
    expect(result.evidence.callsites?.[0]?.file).not.toContain('\\');
  });
});
