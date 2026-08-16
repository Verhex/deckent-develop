import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { openSync, closeSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// The Closure OS genesis trust-anchor provisioning tool is exercised through its
// CLI (the real ceremony surface) via subprocess, NOT by importing its .mjs — the
// hermetic-lint test-graph resolver overflows when a *.test.ts imports a brand-new
// module (see tests/governance/closure-ledger.test.ts). Real-fd stdio
// (`stdio: ['ignore', outFd, errFd]`) is used because under the hermetic runtime
// guard a PIPED child's stdout can be captured EMPTY even on a clean exit. Async
// spawn only — no shell, no spawnSync. The adversarial forgery corpus lives in the
// tool's own `--self-check` (single source, mirrors the gate's --self-check
// convention); this file asserts it passes and that the ceremony round-trips.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const TOOL = join(ROOT, 'scripts/closure-ledger/genesis-anchor.mjs');

const IO_DIR = mkdtempSync(join(tmpdir(), 'closure-genesis-io-'));
let ioSeq = 0;
afterAll(() => { try { rmSync(IO_DIR, { recursive: true, force: true }); } catch { /* best-effort */ } });

interface RunResult { code: number; stdout: string; stderr: string; }

async function runNode(args: string[] = []): Promise<RunResult> {
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
      const child = spawn(process.execPath, [TOOL, ...args], { cwd: ROOT, stdio: ['ignore', outFd, errFd] });
      const timer = setTimeout(() => finish(() => { child.kill('SIGKILL'); reject(new Error('genesis-anchor subprocess timed out after 30s')); }), 30000);
      let settled = false;
      function finish(fn: () => void): void { if (settled) return; settled = true; clearTimeout(timer); fn(); }
      child.on('error', (err) => finish(() => reject(new Error(`genesis-anchor failed to spawn: ${err.message}`))));
      child.on('close', (code, signal) => finish(() => resolve({ code, signal })));
    });
    closeFds();
    const stdout = readFileSync(outPath, 'utf8');
    const stderr = readFileSync(errPath, 'utf8');
    if (result.signal) throw new Error(`genesis-anchor killed by signal ${result.signal} — stderr=[${stderr}]`);
    return { code: result.code ?? 1, stdout, stderr };
  } finally {
    closeFds();
  }
}

describe('closure genesis trust-anchor provisioning tool', () => {
  it('--self-check: the adversarial conformance/forgery suite passes', async () => {
    const r = await runNode(['--self-check']);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/assertions passed/);
  });

  it('--generate: writes the private key OUTSIDE the repo and emits a conformant public anchor + fingerprint', async () => {
    const priv = join(IO_DIR, 'genesis-private.pem');
    const anchors = join(IO_DIR, 'closure-trust-anchors.json');
    const manifest = join(IO_DIR, 'closure-trust-anchors.fingerprints.json');
    const r = await runNode([
      '--generate', '--key-id', 'closure-owner-genesis-test', '--tenant-id', 'tnt', '--project-id', 'prj',
      '--private-out', priv, '--anchors-out', anchors, '--fingerprint-out', manifest,
    ]);
    expect(r.code).toBe(0);
    // The private key exists on disk (outside the repo tmpdir) as PKCS8 PEM, and is
    // NEVER echoed to stdout/stderr — only its path and the fingerprint are.
    expect(existsSync(priv)).toBe(true);
    const privText = readFileSync(priv, 'utf8');
    expect(privText).toMatch(/BEGIN PRIVATE KEY/);
    expect(r.stdout).not.toMatch(/PRIVATE KEY/);
    expect(r.stderr).toMatch(/VERIFY THIS FINGERPRINT/);
    // The emitted public anchor carries only the SPKI public key, no private material.
    const anchorDoc = JSON.parse(readFileSync(anchors, 'utf8'));
    expect(anchorDoc.schemaVersion).toBe(1);
    expect(anchorDoc.anchors[0].keyId).toBe('closure-owner-genesis-test');
    expect(anchorDoc.anchors[0].publicKeyPem).toMatch(/BEGIN PUBLIC KEY/);
    expect(JSON.stringify(anchorDoc)).not.toMatch(/PRIVATE KEY/);
    // The fingerprint manifest is genesis-shaped and recomputable.
    const fp = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(fp.genesis).toBe(true);
    expect(fp.predecessor).toBeNull();
    expect(fp.fingerprintAlgorithm).toBe('sha256-spki-der');
    expect(fp.anchors[0].fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('--verify: strict-validates a generated anchor and recomputes the identical fingerprint', async () => {
    const priv = join(IO_DIR, 'g2-private.pem');
    const anchors = join(IO_DIR, 'g2-anchors.json');
    const manifest = join(IO_DIR, 'g2-manifest.json');
    const gen = await runNode(['--generate', '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p', '--private-out', priv, '--anchors-out', anchors, '--fingerprint-out', manifest]);
    expect(gen.code).toBe(0);
    const emittedFp = JSON.parse(readFileSync(manifest, 'utf8')).anchors[0].fingerprint;
    const v = await runNode(['--verify', anchors]);
    expect(v.code).toBe(0);
    const recomputed = JSON.parse(v.stdout);
    expect(recomputed.anchors[0].fingerprint).toBe(emittedFp);
  });

  it('GUARD: refuses to write the private key inside the repository (no key file created)', async () => {
    const inRepo = join(ROOT, 'docs', 'governance', 'genesis-guard-should-not-exist.key');
    const r = await runNode(['--generate', '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p', '--private-out', inRepo]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/refusing to write the owner private key inside the repository/);
    expect(existsSync(inRepo)).toBe(false);
  });

  it('--verify: rejects a non-conformant anchor with a typed TRUST_ANCHOR_* code', async () => {
    const bad = join(IO_DIR, 'bad-anchors.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(bad, JSON.stringify({ schemaVersion: 2, anchors: [] }), 'utf8');
    const r = await runNode(['--verify', bad]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/TRUST_ANCHOR_SCHEMA/);
  });
});
