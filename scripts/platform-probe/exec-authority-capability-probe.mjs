#!/usr/bin/env node
/**
 * exec-authority-capability-probe.mjs — W2 (PLATFORM-EXEC-AUTH-W2-PROBE-001)
 *
 * MEASUREMENT, NOT A GATE. Runs on real macOS/Windows CI runners and records
 * the platform facts the W3/W4 adapter designs depend on
 * (docs/analysis/platform-execution-authority-adapters-2026-08-05.md §5 W2).
 * Always exits 0 when the probe itself ran; every capability result is a
 * recorded observation ('supported' | 'unsupported' | 'error:<code>'), never
 * an assertion. The JSON artifact is the deliverable.
 */

import { spawnSync } from 'node:child_process';
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const results = {
  schemaVersion: 1,
  probe: 'exec-authority-capability-probe',
  workId: 'PLATFORM-EXEC-AUTH-W2-PROBE-001',
  platform: process.platform,
  release: process.getSystemVersion?.() ?? null,
  arch: process.arch,
  node: process.version,
  measuredAt: new Date().toISOString(),
  capabilities: {},
};

function record(name, fn) {
  try {
    results.capabilities[name] = fn();
  } catch (error) {
    results.capabilities[name] = `error:${error?.code ?? error?.message ?? 'unknown'}`;
  }
}

const scratch = mkdtempSync(join(tmpdir(), 'exec-auth-probe-'));

// ── 1. fd-stable directory traversal via /dev/fd (darwin) or /proc (linux) ──
record('fdStableDirTraversal', () => {
  const dir = join(scratch, 'trav');
  mkdirSync(dir);
  writeFileSync(join(dir, 'child.txt'), 'probe\n');
  const base = process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd';
  if (!existsSync(base)) return `unsupported:no-${base.replaceAll('/', '-')}`;
  const fd = openSync(dir, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
  try {
    const stable = join(base, String(fd));
    const out = { base };
    try {
      out.readdir = JSON.stringify(readdirSync(stable));
    } catch (e) { out.readdir = `error:${e?.code ?? 'unknown'}`; }
    try {
      out.childRead = readFileSync(join(stable, 'child.txt'), 'utf8').trim() === 'probe'
        ? 'supported' : 'mismatch';
    } catch (e) { out.childRead = `error:${e?.code ?? 'unknown'}`; }
    try {
      writeFileSync(join(stable, 'via-fd.txt'), 'w\n');
      out.childWrite = existsSync(join(dir, 'via-fd.txt')) ? 'supported' : 'mismatch';
    } catch (e) { out.childWrite = `error:${e?.code ?? 'unknown'}`; }
    try {
      unlinkSync(join(stable, 'child.txt'));
      out.childUnlink = !existsSync(join(dir, 'child.txt')) ? 'supported' : 'mismatch';
    } catch (e) { out.childUnlink = `error:${e?.code ?? 'unknown'}`; }
    try {
      const identity = fstatSync(fd, { bigint: true });
      const viaPath = statSync(stable, { bigint: true });
      out.identityEquality =
        identity.dev === viaPath.dev && identity.ino === viaPath.ino
          ? 'supported' : 'mismatch';
    } catch (e) { out.identityEquality = `error:${e?.code ?? 'unknown'}`; }
    return out;
  } finally {
    closeSync(fd);
  }
});

// ── 2. POSIX delete semantics (delete-while-open, name gone immediately) ────
record('posixDeleteSemantics', () => {
  const file = join(scratch, 'posix-delete.txt');
  writeFileSync(file, 'x\n');
  const fd = openSync(file, fsConstants.O_RDONLY);
  try {
    unlinkSync(file);
    return existsSync(file) ? 'legacy-pending-delete' : 'supported';
  } finally {
    closeSync(fd);
  }
});

// ── 3. dev+ino (VolumeSerial+FileIndex) stability across reopen and rename ──
record('fileIdentityStability', () => {
  const file = join(scratch, 'identity.txt');
  writeFileSync(file, 'id\n');
  const before = lstatSync(file, { bigint: true });
  const renamed = join(scratch, 'identity-renamed.txt');
  renameSync(file, renamed);
  const after = lstatSync(renamed, { bigint: true });
  const reopened = (() => {
    const fd = openSync(renamed, fsConstants.O_RDONLY);
    try { return fstatSync(fd, { bigint: true }); } finally { closeSync(fd); }
  })();
  return {
    devStable: before.dev === after.dev && after.dev === reopened.dev ? 'supported' : 'mismatch',
    inoStableAcrossRename: before.ino === after.ino ? 'supported' : 'mismatch',
    inoStableAcrossReopen: after.ino === reopened.ino ? 'supported' : 'mismatch',
    inoNonZero: after.ino > 0n ? 'supported' : 'mismatch',
  };
});

// ── 4. O_NOFOLLOW / O_DIRECTORY flag truth ──────────────────────────────────
record('openFlagTruth', () => ({
  oNoFollow: typeof fsConstants.O_NOFOLLOW === 'number' && fsConstants.O_NOFOLLOW !== 0
    ? 'supported' : 'unsupported',
  oDirectory: typeof fsConstants.O_DIRECTORY === 'number' && fsConstants.O_DIRECTORY !== 0
    ? 'supported' : 'unsupported',
}));

// ── 5. host/boot identity sources ───────────────────────────────────────────
record('hostBootIdentitySources', () => {
  const out = {};
  if (process.platform === 'darwin') {
    for (const [key, args] of [
      ['kernUuid', ['-n', 'kern.uuid']],
      ['kernBoottime', ['-n', 'kern.boottime']],
    ]) {
      const r = spawnSync('sysctl', args, { encoding: 'utf8', timeout: 5000 });
      out[key] = r.status === 0 && r.stdout.trim() ? 'supported' : `unsupported:${r.status}`;
    }
  } else if (process.platform === 'win32') {
    const r = spawnSync('reg', [
      'query', String.raw`HKLM\SOFTWARE\Microsoft\Cryptography`, '/v', 'MachineGuid',
    ], { encoding: 'utf8', timeout: 5000 });
    out.machineGuid = r.status === 0 && /MachineGuid/u.test(r.stdout)
      ? 'supported' : `unsupported:${r.status}`;
  } else {
    out.machineId = existsSync('/etc/machine-id') ? 'supported' : 'unsupported';
    out.bootId = existsSync('/proc/sys/kernel/random/boot_id') ? 'supported' : 'unsupported';
  }
  return out;
});

rmSync(scratch, { recursive: true, force: true });

const artifactDir = process.env.PROBE_ARTIFACT_DIR ?? process.cwd();
const artifactPath = join(artifactDir, `exec-auth-probe-${process.platform}-${process.arch}.json`);
writeFileSync(artifactPath, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log(`\n[probe] artifact: ${artifactPath}`);
