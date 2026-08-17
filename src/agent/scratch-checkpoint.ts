import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

export interface CheckpointCounters {
  readonly [name: string]: number;
}

export interface ScratchCheckpointPayload {
  schemaVersion: 1;
  objective: string;
  findings: string[];
  evidenceRefs: string[];
  decisions: string[];
  unresolved: string[];
  nextActions: string[];
  inspectedAreas: string[];
  toolResultDigests: string[];
  cumulativeCounters: CheckpointCounters;
  createdAt: string;
}

export interface CheckpointReceipt { path: string; digest: string }
export type CheckpointReadResult =
  | { status: 'empty' }
  | { status: 'ok'; payload: ScratchCheckpointPayload; receipt: CheckpointReceipt }
  | { status: 'corrupt'; path: string; reason: string };

export interface ScratchStoreInfo {
  root: string;
  modeProtection: 'posix-enforced' | 'windows-best-effort';
  retention: number;
}

export interface ScratchStore {
  readonly info: ScratchStoreInfo;
  writeCheckpoint(payload: ScratchCheckpointPayload): CheckpointReceipt;
  readLatestCheckpoint(): CheckpointReadResult;
  close(options: { policy: 'delete' | 'keep-for-recovery'; recoveryWindowMs?: number }): void;
}

const RETENTION = 5;
const CHECKPOINT_RE = /^checkpoint-(\d+)-([a-f0-9]{64})\.json$/;

function safePart(value: string, name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value) || value === '.' || value === '..') {
    throw new Error(`invalid ${name}`);
  }
  return value;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertContained(root: string, candidate: string): void {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.includes(`${sep}..${sep}`)) {
    throw new Error('scratch path escaped its session root');
  }
  let cursor = dirname(candidate);
  while (resolve(cursor) !== resolve(root)) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('scratch path contains a symlink');
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error('scratch path escaped its session root');
    cursor = parent;
  }
  if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink()) throw new Error('scratch target is a symlink');
}

function parsePayload(value: unknown): ScratchCheckpointPayload | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const arrays = ['findings', 'evidenceRefs', 'decisions', 'unresolved', 'nextActions', 'inspectedAreas', 'toolResultDigests'];
  if (v.schemaVersion !== 1 || typeof v.objective !== 'string' || typeof v.createdAt !== 'string') return undefined;
  if (!arrays.every((key) => Array.isArray(v[key]) && (v[key] as unknown[]).every((item) => typeof item === 'string'))) return undefined;
  if (!v.cumulativeCounters || typeof v.cumulativeCounters !== 'object' || Array.isArray(v.cumulativeCounters)) return undefined;
  if (!Object.values(v.cumulativeCounters as object).every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return undefined;
  return v as unknown as ScratchCheckpointPayload;
}

export function openScratchStore(ids: { tenantId: string; projectId: string; sessionId: string }): ScratchStore {
  const prefix = `deckent-${safePart(ids.tenantId, 'tenantId')}-${safePart(ids.projectId, 'projectId')}-${safePart(ids.sessionId, 'sessionId')}-`;
  const root = mkdtempSync(join(tmpdir(), prefix));
  if (process.platform !== 'win32') chmodSync(root, 0o700);
  const checkpointDir = join(root, 'checkpoints');
  mkdirSync(checkpointDir, { mode: 0o700 });
  let sequence = 0;

  const files = (): string[] => readdirSync(checkpointDir)
    .filter((name) => CHECKPOINT_RE.test(name))
    .sort((a, b) => Number(CHECKPOINT_RE.exec(a)![1]) - Number(CHECKPOINT_RE.exec(b)![1]));

  return {
    info: { root, modeProtection: process.platform === 'win32' ? 'windows-best-effort' : 'posix-enforced', retention: RETENTION },
    writeCheckpoint(payload): CheckpointReceipt {
      if (!parsePayload(payload)) throw new Error('invalid checkpoint payload');
      const body = JSON.stringify(payload);
      const checksum = digest(body);
      const envelope = JSON.stringify({ checksum, payload });
      const name = `checkpoint-${String(++sequence).padStart(8, '0')}-${checksum}.json`;
      const target = join(checkpointDir, name);
      const temporary = join(checkpointDir, `.${name}.${process.pid}.tmp`);
      assertContained(root, target);
      assertContained(root, temporary);
      writeFileSync(temporary, envelope, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      renameSync(temporary, target);
      if (process.platform !== 'win32') chmodSync(target, 0o600);
      for (const stale of files().slice(0, -RETENTION)) {
        const stalePath = join(checkpointDir, basename(stale));
        assertContained(root, stalePath);
        rmSync(stalePath);
      }
      return { path: target, digest: checksum };
    },
    readLatestCheckpoint(): CheckpointReadResult {
      const latest = files().at(-1);
      if (!latest) return { status: 'empty' };
      const path = join(checkpointDir, basename(latest));
      try {
        assertContained(root, path);
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as { checksum?: unknown; payload?: unknown };
        const payload = parsePayload(parsed.payload);
        if (!payload || typeof parsed.checksum !== 'string') return { status: 'corrupt', path, reason: 'invalid schema' };
        const actual = digest(JSON.stringify(payload));
        if (actual !== parsed.checksum || !latest.endsWith(`-${actual}.json`)) return { status: 'corrupt', path, reason: 'checksum mismatch' };
        return { status: 'ok', payload, receipt: { path, digest: actual } };
      } catch (error) {
        return { status: 'corrupt', path, reason: error instanceof Error ? error.message : String(error) };
      }
    },
    close({ policy, recoveryWindowMs = 0 }): void {
      if (policy === 'keep-for-recovery' && recoveryWindowMs > 0) return;
      assertContained(dirname(root), root);
      if (lstatSync(root).isSymbolicLink()) throw new Error('scratch root is a symlink');
      rmSync(root, { recursive: true });
    },
  };
}
