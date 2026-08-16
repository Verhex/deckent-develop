import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import {
  openSync, closeSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, statSync, symlinkSync,
} from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// The genesis trust-anchor provisioning tool is exercised through its CLI (the real
// ceremony surface) via subprocess, NOT by importing its .mjs (the hermetic-lint
// test-graph resolver overflows importing a brand-new module — see closure-ledger.test.ts).
// Real-fd stdio (`stdio: ['ignore', outFd, errFd]`) is used because under the hermetic
// runtime guard a PIPED child's stdout can be captured EMPTY on a clean exit. Async
// spawn only. The adversarial forgery corpus lives in the tool's own `--self-check`;
// this file additionally proves the fail-closed filesystem contract (no overwrite,
// O_EXCL, 0600, symlink/repo-local rejection) and the adopt-public-key path.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const TOOL = join(ROOT, 'scripts/closure-ledger/genesis-anchor.mjs');
const POSIX = process.platform !== 'win32';

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

// Helpers to fabricate public keys the way a hardware/KMS export would.
function ed25519PublicPem(path: string): string {
  const pem = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }) as string;
  writeFileSync(path, pem, 'utf8');
  return pem;
}
function ecPublicPem(path: string): string {
  const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ type: 'spki', format: 'pem' }) as string;
  writeFileSync(path, pem, 'utf8');
  return pem;
}

describe('closure genesis trust-anchor provisioning tool', () => {
  it('--self-check: the adversarial conformance/forgery suite passes', async () => {
    const r = await runNode(['--self-check']);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/assertions passed/);
  });

  it('--generate: writes the private key OUTSIDE the repo and emits a conformant public anchor + fingerprint', async () => {
    const priv = join(IO_DIR, 'g-private.pem');
    const anchors = join(IO_DIR, 'g-anchors.json');
    const manifest = join(IO_DIR, 'g-manifest.json');
    const r = await runNode(['--generate', '--key-id', 'closure-owner-genesis-v1', '--tenant-id', 'main', '--project-id', 'deckent', '--private-out', priv, '--anchors-out', anchors, '--fingerprint-out', manifest]);
    expect(r.code).toBe(0);
    expect(existsSync(priv)).toBe(true);
    expect(readFileSync(priv, 'utf8')).toMatch(/BEGIN PRIVATE KEY/);
    expect(r.stdout).not.toMatch(/PRIVATE KEY/);            // secret never printed
    expect(r.stderr).toMatch(/software-key bootstrap/);      // honest mode label
    const anchorDoc = JSON.parse(readFileSync(anchors, 'utf8'));
    expect(anchorDoc.anchors[0].publicKeyPem).toMatch(/BEGIN PUBLIC KEY/);
    expect(JSON.stringify(anchorDoc)).not.toMatch(/PRIVATE KEY/);
    const fp = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(fp.genesis).toBe(true);
    expect(fp.predecessor).toBeNull();
    expect(fp.anchors[0].fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it.skipIf(!POSIX)('--generate: private key mode is exactly 0600 (POSIX)', async () => {
    const priv = join(IO_DIR, 'mode-private.pem');
    const r = await runNode(['--generate', '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p', '--private-out', priv]);
    expect(r.code).toBe(0);
    expect(statSync(priv).mode & 0o777).toBe(0o600);
  });

  it('GUARD: existing --private-out is refused byte-identical (fail-closed, no overwrite)', async () => {
    const sentinel = join(IO_DIR, 'sentinel-private.pem');
    writeFileSync(sentinel, 'DO-NOT-OVERWRITE', 'utf8');
    const before = readFileSync(sentinel, 'utf8');
    const r = await runNode(['--generate', '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p', '--private-out', sentinel]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/reasonCode=GENESIS_PRIVATE_OUT_EXISTS/);
    expect(readFileSync(sentinel, 'utf8')).toBe(before);
  });

  it('GUARD: existing --anchors-out is refused and NO private key is created', async () => {
    const priv = join(IO_DIR, 'na-private.pem');
    const anchors = join(IO_DIR, 'existing-anchors.json');
    writeFileSync(anchors, '{"pre":"existing"}', 'utf8');
    const r = await runNode(['--generate', '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p', '--private-out', priv, '--anchors-out', anchors]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/reasonCode=GENESIS_ANCHORS_OUT_EXISTS/);
    expect(existsSync(priv)).toBe(false);                    // preflight fails BEFORE keygen
    expect(readFileSync(anchors, 'utf8')).toBe('{"pre":"existing"}');
  });

  it('GUARD: existing --fingerprint-out is refused and NO private key is created', async () => {
    const priv = join(IO_DIR, 'nf-private.pem');
    const anchors = join(IO_DIR, 'nf-anchors.json');
    const manifest = join(IO_DIR, 'existing-manifest.json');
    writeFileSync(manifest, '{"pre":"existing"}', 'utf8');
    const r = await runNode(['--generate', '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p', '--private-out', priv, '--anchors-out', anchors, '--fingerprint-out', manifest]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/reasonCode=GENESIS_FINGERPRINT_OUT_EXISTS/);
    expect(existsSync(priv)).toBe(false);
    expect(existsSync(anchors)).toBe(false);
  });

  it.skipIf(!POSIX)('GUARD: a symlink at --private-out is refused (O_EXCL) and its target is untouched', async () => {
    const target = join(IO_DIR, 'sym-target');
    const link = join(IO_DIR, 'sym-private.pem');
    writeFileSync(target, 'SYMTARGET', 'utf8');
    symlinkSync(target, link);
    const r = await runNode(['--generate', '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p', '--private-out', link]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/reasonCode=GENESIS_PRIVATE_OUT_EXISTS/);
    expect(readFileSync(target, 'utf8')).toBe('SYMTARGET');
  });

  it('GUARD: a repo-local --private-out is refused (no key written)', async () => {
    const inRepo = join(ROOT, 'docs', 'governance', 'genesis-guard-should-not-exist.key');
    const r = await runNode(['--generate', '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p', '--private-out', inRepo]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/reasonCode=GENESIS_PRIVATE_OUT_IN_REPO/);
    expect(existsSync(inRepo)).toBe(false);
  });

  it('--adopt-public-key: emits anchor + fingerprint with ZERO private artifact', async () => {
    const pub = join(IO_DIR, 'hw-pub.pem');
    ed25519PublicPem(pub);
    const anchors = join(IO_DIR, 'adopt-anchors.json');
    const manifest = join(IO_DIR, 'adopt-manifest.json');
    const r = await runNode(['--adopt-public-key', pub, '--key-id', 'closure-owner-genesis-v1', '--tenant-id', 'main', '--project-id', 'deckent', '--anchors-out', anchors, '--fingerprint-out', manifest]);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/NO private material/);
    expect(existsSync(anchors)).toBe(true);
    expect(existsSync(manifest)).toBe(true);
    // No file named like a private key anywhere in the io dir from this run.
    const anchorDoc = JSON.parse(readFileSync(anchors, 'utf8'));
    expect(JSON.stringify(anchorDoc)).not.toMatch(/PRIVATE KEY/);
    expect(r.stdout).not.toMatch(/PRIVATE KEY/);
  });

  it('--adopt-public-key: rejects a non-ed25519 (P-256) key with a typed reasonCode', async () => {
    const pub = join(IO_DIR, 'ec-pub.pem');
    ecPublicPem(pub);
    const r = await runNode(['--adopt-public-key', pub, '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/reasonCode=GENESIS_PUBLIC_KEY_NOT_ED25519/);
  });

  it('--adopt-public-key: rejects a malformed public key with a typed reasonCode', async () => {
    const pub = join(IO_DIR, 'garbage-pub.pem');
    writeFileSync(pub, 'not a pem at all', 'utf8');
    const r = await runNode(['--adopt-public-key', pub, '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/reasonCode=GENESIS_PUBLIC_KEY_INVALID/);
  });

  it('--verify: strict-validates a generated anchor and recomputes the identical fingerprint', async () => {
    const priv = join(IO_DIR, 'v-private.pem');
    const anchors = join(IO_DIR, 'v-anchors.json');
    const manifest = join(IO_DIR, 'v-manifest.json');
    const gen = await runNode(['--generate', '--key-id', 'k', '--tenant-id', 't', '--project-id', 'p', '--private-out', priv, '--anchors-out', anchors, '--fingerprint-out', manifest]);
    expect(gen.code).toBe(0);
    const emittedFp = JSON.parse(readFileSync(manifest, 'utf8')).anchors[0].fingerprint;
    const v = await runNode(['--verify', anchors]);
    expect(v.code).toBe(0);
    expect(JSON.parse(v.stdout).anchors[0].fingerprint).toBe(emittedFp);
  });

  it('--verify: rejects a non-conformant anchor with a typed TRUST_ANCHOR_* code', async () => {
    const bad = join(IO_DIR, 'bad-anchors.json');
    writeFileSync(bad, JSON.stringify({ schemaVersion: 2, anchors: [] }), 'utf8');
    const r = await runNode(['--verify', bad]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/TRUST_ANCHOR_SCHEMA/);
  });
});
