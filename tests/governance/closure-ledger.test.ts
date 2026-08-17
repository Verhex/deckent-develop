import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { openSync, closeSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// The Closure OS ledger mechanism is exercised through its CLI (the real
// production surface) via subprocess, NOT by importing its .mjs/.ts modules — the
// hermetic-lint test-graph resolver overflows when a *.test.ts imports a brand-new
// module. Testing the CLI is also the truer contract: the gate CLI is what
// `lint:gates` runs.
//
// Codex phase-4.4 req-1 root cause of the cross-provider "2 pass / 7 fail;
// subprocess stdout empty": under the hermetic runtime guard a PIPED child's
// stdout/stderr can be captured as EMPTY even on a clean exit (a trivial
// `node -e "process.stdout.write('X')"` returns exit 0 + empty streams there) — so
// the earlier PATH/`process.execPath` theory was wrong; the problem is pipe
// capture. `runNode` therefore redirects the child's stdout/stderr to real files
// opened on OS file descriptors in a tmpdir (`stdio: ['ignore', outFd, errFd]`),
// which is immune to pipe interception. Async spawn only — no shell, no
// spawnSync/execFileSync. error/signal/non-zero exit/timeout are surfaced as typed
// throws; nothing is ever silently swallowed to empty output. The stdout/stderr
// assertions are NOT weakened to exit-code-only.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const GATE = join(ROOT, 'scripts/lint-closure-dispositions.mjs');
const PROJECT = join(ROOT, 'scripts/closure-ledger/project.mjs');
const SCAN = join(ROOT, 'scripts/closure-classification-scan.mjs');
const TYPES = join(ROOT, 'src/core/closure-ledger-types.ts');
const SCHEMA_PATH = join(ROOT, 'src/core/closure-classification-schema.json');

// One suite-level tmpdir; per-call output files (`<n>.out`/`<n>.err`) + any fixtures.
// Removed once in afterAll (hermetic cleanup).
const IO_DIR = mkdtempSync(join(tmpdir(), 'closure-io-'));
let ioSeq = 0;
afterAll(() => { try { rmSync(IO_DIR, { recursive: true, force: true }); } catch { /* best-effort */ } });

interface RunResult { code: number; stdout: string; stderr: string; }

async function runNode(script: string, args: string[] = []): Promise<RunResult> {
  const n = ioSeq++;
  const outPath = join(IO_DIR, `${n}.out`);
  const errPath = join(IO_DIR, `${n}.err`);
  const outFd = openSync(outPath, 'w');
  const errFd = openSync(errPath, 'w');
  let fdsClosed = false;
  const closeFds = (): void => {
    if (fdsClosed) return;
    fdsClosed = true;
    try { closeSync(outFd); } catch { /* already closed */ }
    try { closeSync(errFd); } catch { /* already closed */ }
  };
  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, stdio: ['ignore', outFd, errFd] });
      const timer = setTimeout(() => finish(() => { child.kill('SIGKILL'); reject(new Error(`subprocess '${script}' timed out after 30s`)); }), 30000);
      let settled = false;
      function finish(fn: () => void): void { if (settled) return; settled = true; clearTimeout(timer); fn(); }
      child.on('error', (err) => finish(() => reject(new Error(`subprocess '${script}' failed to spawn: ${err.message}`))));
      child.on('close', (code, signal) => finish(() => resolve({ code, signal })));
    });
    closeFds(); // flush the child's writes to disk BEFORE reading
    const stdout = readFileSync(outPath, 'utf8');
    const stderr = readFileSync(errPath, 'utf8');
    if (result.signal) throw new Error(`subprocess '${script}' killed by signal ${result.signal} — stderr=[${stderr}]`);
    return { code: result.code ?? 1, stdout, stderr };
  } finally {
    closeFds(); // idempotent — guarantees the fds are closed even on reject/throw
  }
}

describe('closure-ledger gate — --self-check (full mechanism + canonical + Codex fixtures)', () => {
  it('passes every in-process assertion (clean exit, no stderr)', async () => {
    const r = await runNode(GATE, ['--self-check']);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/assertions passed/);
    expect(r.code).toBe(0);
  });
});

describe('closure-ledger projections — --self-check', () => {
  it('passes every projection assertion (clean exit, no stderr)', async () => {
    const r = await runNode(PROJECT, ['--self-check']);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/assertions passed/);
    expect(r.code).toBe(0);
  });
});

describe('closure-ledger projector CLI', () => {
  it('--dry-run emits a deterministic unsigned-manifest digest (writes nothing)', async () => {
    const a = await runNode(PROJECT, ['--dry-run']);
    const b = await runNode(PROJECT, ['--dry-run']);
    expect(a.code).toBe(0);
    expect(a.stderr).toBe('');
    expect(a.stdout).toMatch(/unsignedManifestDigest/);
    expect(a.stdout).toBe(b.stdout); // deterministic
  });
  it('--check on the live non-empty ledger is OK and writes nothing', async () => {
    const r = await runNode(PROJECT, ['--check']);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/--check OK/);
  });
});

describe('closure-ledger gate — CLI plumbing', () => {
  it('an empty/absent ledger validates OK (exit 0, no stderr)', async () => {
    const emptyPath = join(IO_DIR, 'empty.jsonl');
    const absentPath = join(IO_DIR, 'absent.jsonl');
    writeFileSync(emptyPath, '');

    for (const path of [emptyPath, absentPath]) {
      const r = await runNode(GATE, [path]);
      expect(r.code).toBe(0);
      expect(r.stderr).toBe('');
      expect(r.stdout).toMatch(/nothing to validate/);
    }
  });
  it('a malformed ledger line is a typed HOLD (exit 1, LEDGER_PARSE) — fixture in tmpdir', async () => {
    const p = join(IO_DIR, 'malformed.jsonl');
    writeFileSync(p, '{ this is not valid json }\n');
    const r = await runNode(GATE, [p]);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(''); // typed HOLD prints to stdout; nothing leaks to stderr
    expect(r.stdout).toMatch(/LEDGER_PARSE/);
  });
});

describe('report ↔ disk parity (staleness gate — no tracked-worktree write)', () => {
  it('scan --check reports the committed owner-proposal.md is in sync (writes nothing)', async () => {
    const r = await runNode(SCAN, ['--check']);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/--check OK/);
    expect(r.code).toBe(0);
  });
});

describe('TS ↔ schema drift-guard (EXACT equality, no import)', () => {
  const typesSrc = readFileSync(TYPES, 'utf8');
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const arr = (name: string): string[] => {
    const m = typesSrc.match(new RegExp(`export const ${name} = (\\[[\\s\\S]*?\\]) as const`));
    if (!m) throw new Error(`${name} not found as an 'as const' array in closure-ledger-types.ts`);
    return JSON.parse(m[1].replace(/'/g, '"').replace(/,(\s*])/g, '$1'));
  };
  it('LEVELS/LANES/PRIORITIES/ADMISSION_DISPOSITIONS/DECISION_KINDS deep-equal the schema arrays', () => {
    expect(arr('LEVELS')).toEqual(schema.levels.values);
    expect(arr('LANES')).toEqual(schema.lanes.values);
    expect(arr('PRIORITIES')).toEqual(schema.priorities.values);
    expect(arr('ADMISSION_DISPOSITIONS')).toEqual(schema.admissionDispositions.values);
    expect(arr('DECISION_KINDS')).toEqual(schema.decisionKinds.values);
  });
  it('ROWREF_FIELDS is the FOUR-part rowRef SSOT and exactly equals schema.rowRef.requiredFields', () => {
    // RowRef is a mapped type DERIVED from ROWREF_FIELDS (`{ [K in (typeof ROWREF_FIELDS)[number]]: string }`),
    // so it can never drift from this array; pinning ROWREF_FIELDS === schema here therefore
    // transitively pins the whole TS RowRef SHAPE to the schema SSOT (enum parity alone is
    // insufficient). The gate ↔ schema half is asserted in the gate --self-check (ALLOWED_ROWREF == this array).
    expect(arr('ROWREF_FIELDS')).toEqual(schema.rowRef.requiredFields);
    expect(arr('ROWREF_FIELDS')).toContain('batchManifestDigest');
    expect(arr('ROWREF_FIELDS')).toHaveLength(4);
  });
  it('HOLD_LANE equals schema.lanes.holdState', () => {
    const m = typesSrc.match(/export const HOLD_LANE = '([^']+)' as const/);
    expect(m?.[1]).toBe(schema.lanes.holdState);
  });
});
