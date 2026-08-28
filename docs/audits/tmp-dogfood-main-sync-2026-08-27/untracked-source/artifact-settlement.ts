import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { BacklogEntry, BacklogFile } from './backlog-types.js';
import { createExecutionAuthorityError } from '../../core/errors.js';

export type ArtifactSettlementDisposition = 'READY' | 'HOLD' | 'DEDUPLICATED' | 'ARCHIVED';

export interface ArtifactSettlementFile {
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly device: number;
  readonly inode: number;
  readonly modifiedMs: number;
}

export interface AutonomousArtifactSettlementPlan {
  readonly schemaVersion: 1;
  readonly disposition: 'READY' | 'HOLD';
  readonly projectRoot: string;
  readonly backlogPath: string;
  readonly entryId: string | null;
  readonly taskId: string | null;
  readonly attemptId: string | null;
  readonly files: readonly ArtifactSettlementFile[];
  readonly preserved: readonly { name: string; reason: string }[];
  readonly holdReasons: readonly string[];
  readonly planDigest: string;
}

export interface AutonomousArtifactSettlementReceipt {
  readonly schemaVersion: 1;
  readonly disposition: 'ARCHIVED' | 'DEDUPLICATED' | 'HOLD';
  readonly planDigest: string;
  readonly entryId: string | null;
  readonly taskId: string | null;
  readonly attemptId: string | null;
  readonly archived: readonly ArtifactSettlementFile[];
  readonly preserved: readonly { name: string; reason: string }[];
  readonly holdReasons: readonly string[];
  readonly archivePath?: string;
}

function hash(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function within(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep));
}

function digestPlan(plan: Omit<AutonomousArtifactSettlementPlan, 'planDigest'>): string {
  return hash(canonical(plan));
}

export function planAutonomousArtifactSettlement(input: {
  projectRoot: string;
  backlogPath?: string;
  entryId?: string;
  tasksDir?: string;
}): AutonomousArtifactSettlementPlan {
  const projectRoot = realpathSync(input.projectRoot);
  const backlogPath = resolve(input.backlogPath ?? join(projectRoot, '.deckent', 'autonomous', 'backlog.json'));
  const tasksDir = resolve(projectRoot, input.tasksDir ?? '.tasks');
  const holdReasons: string[] = [];
  const preserved: { name: string; reason: string }[] = [];
  let entry: BacklogEntry | undefined;
  let selected: BacklogEntry | undefined;
  try {
    if (!within(projectRoot, backlogPath) || lstatSync(backlogPath).isSymbolicLink()) {
      throw createExecutionAuthorityError('BACKLOG_PATH_UNSAFE');
    }
    const backlog = JSON.parse(readFileSync(backlogPath, 'utf8')) as BacklogFile;
    const eligible = backlog.entries.filter((candidate) =>
      (candidate.status === 'done' || candidate.status === 'failed')
      && candidate.lastResult?.taskLineage !== undefined);
    if (input.entryId !== undefined) {
      selected = backlog.entries.find(candidate => candidate.id === input.entryId);
      if (!selected) {
        holdReasons.push('ENTRY_NOT_FOUND');
      } else if (selected.status !== 'done' && selected.status !== 'failed') {
        holdReasons.push('ENTRY_NOT_TERMINAL');
      } else if (selected.lastResult?.taskLineage === undefined) {
        holdReasons.push('LINEAGE_EVIDENCE_INCOMPLETE');
      } else {
        entry = selected;
      }
    } else if (eligible.length === 1) {
      selected = eligible[0];
      entry = selected;
    } else {
      holdReasons.push(
        eligible.length === 0
          ? 'NO_ELIGIBLE_TERMINAL_LINEAGE'
          : 'MULTIPLE_ELIGIBLE_LINEAGES',
      );
    }
  } catch (error: unknown) {
    holdReasons.push(error instanceof Error ? error.message : 'BACKLOG_READ_FAILED');
  }
  const lineage = entry?.lastResult?.taskLineage;
  const taskId = lineage?.taskId ?? null;
  const attemptId = lineage?.settlementRef?.attemptId ?? null;
  if (entry && !attemptId) holdReasons.push('SETTLEMENT_AUTHORITY_MISSING');
  const files: ArtifactSettlementFile[] = [];
  if (existsSync(tasksDir)) {
    for (const name of readdirSync(tasksDir).sort()) {
      const path = join(tasksDir, name);
      if (!taskId || (name !== `task-${taskId}.json` && !name.startsWith(`task-${taskId}.`))) {
        preserved.push({ name, reason: 'FOREIGN_OR_UNKNOWN_OWNER' });
        continue;
      }
      try {
        const lst = lstatSync(path);
        if (lst.isSymbolicLink() || !lst.isFile() || !within(tasksDir, realpathSync(path))) {
          holdReasons.push(`UNSAFE_ARTIFACT:${name}`);
          continue;
        }
        const bytes = readFileSync(path);
        const after = statSync(path);
        if (after.dev !== lst.dev || after.ino !== lst.ino || after.size !== lst.size || after.mtimeMs !== lst.mtimeMs) {
          holdReasons.push(`IDENTITY_CHANGED:${name}`);
          continue;
        }
        files.push({ name, bytes: bytes.byteLength, sha256: hash(bytes), device: lst.dev, inode: lst.ino, modifiedMs: lst.mtimeMs });
      } catch {
        holdReasons.push(`ARTIFACT_READ_FAILED:${name}`);
      }
    }
  }
  if (entry && files.length === 0) holdReasons.push('OWNED_ARTIFACTS_MISSING');
  const base = {
    schemaVersion: 1 as const,
    disposition: holdReasons.length === 0 ? 'READY' as const : 'HOLD' as const,
    projectRoot,
    backlogPath,
    entryId: selected?.id ?? null,
    taskId,
    attemptId,
    files,
    preserved,
    holdReasons,
  };
  return { ...base, planDigest: digestPlan(base) };
}

function syncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function applyAutonomousArtifactSettlement(
  planned: AutonomousArtifactSettlementPlan,
  expectedPlanDigest: string,
): AutonomousArtifactSettlementReceipt {
  if (planned.entryId && planned.attemptId) {
    const priorPath = join(planned.projectRoot, '.deckent', 'archive', 'autonomous',
      planned.entryId, planned.attemptId, 'receipt.json');
    if (existsSync(priorPath)) {
      try {
        const prior = JSON.parse(readFileSync(priorPath, 'utf8')) as AutonomousArtifactSettlementReceipt;
        if (prior.planDigest === expectedPlanDigest && planned.planDigest === expectedPlanDigest) {
          return { ...prior, disposition: 'DEDUPLICATED' };
        }
      } catch { /* fresh planning below returns typed evidence */ }
    }
  }
  const fresh = planAutonomousArtifactSettlement({
    projectRoot: planned.projectRoot,
    backlogPath: planned.backlogPath,
    ...(planned.entryId ? { entryId: planned.entryId } : {}),
  });
  const common = {
    schemaVersion: 1 as const, planDigest: expectedPlanDigest,
    entryId: fresh.entryId, taskId: fresh.taskId, attemptId: fresh.attemptId,
    archived: fresh.files, preserved: fresh.preserved,
  };
  if (expectedPlanDigest !== planned.planDigest || fresh.planDigest !== expectedPlanDigest || fresh.disposition === 'HOLD') {
    return { ...common, disposition: 'HOLD', holdReasons: fresh.disposition === 'HOLD' ? fresh.holdReasons : ['PLAN_AUTHORITY_CHANGED'] };
  }
  const archivePath = join(fresh.projectRoot, '.deckent', 'archive', 'autonomous', fresh.entryId!, fresh.attemptId!);
  const receiptPath = join(archivePath, 'receipt.json');
  if (existsSync(receiptPath)) {
    try {
      const prior = JSON.parse(readFileSync(receiptPath, 'utf8')) as AutonomousArtifactSettlementReceipt;
      if (prior.planDigest === expectedPlanDigest) return { ...prior, disposition: 'DEDUPLICATED' };
    } catch { /* collision is converted into typed HOLD below */ }
    return { ...common, disposition: 'HOLD', holdReasons: ['ARCHIVE_AUTHORITY_CHANGED'] };
  }
  const parent = dirname(archivePath);
  mkdirSync(parent, { recursive: true });
  const staging = `${archivePath}.tmp-${process.pid}-${Date.now()}`;
  mkdirSync(staging);
  try {
    for (const file of fresh.files) {
      const source = join(fresh.projectRoot, '.tasks', file.name);
      const bytes = readFileSync(source);
      const current = lstatSync(source);
      if (!current.isFile() || current.isSymbolicLink() || current.dev !== file.device || current.ino !== file.inode || hash(bytes) !== file.sha256) {
        throw createExecutionAuthorityError(`IDENTITY_CHANGED:${file.name}`);
      }
      writeFileSync(join(staging, file.name), bytes, { flag: 'wx' });
    }
    const receipt: AutonomousArtifactSettlementReceipt = { ...common, disposition: 'ARCHIVED', holdReasons: [], archivePath: relative(fresh.projectRoot, archivePath) };
    writeFileSync(join(staging, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
    syncDirectory(staging);
    renameSync(staging, archivePath);
    syncDirectory(parent);
    for (const file of fresh.files) {
      const source = join(fresh.projectRoot, '.tasks', file.name);
      const current = lstatSync(source);
      const bytes = readFileSync(source);
      if (current.dev !== file.device || current.ino !== file.inode || hash(bytes) !== file.sha256) {
        throw createExecutionAuthorityError(`IDENTITY_CHANGED:${file.name}`);
      }
      rmSync(source);
    }
    syncDirectory(join(fresh.projectRoot, '.tasks'));
    return receipt;
  } catch (error: unknown) {
    rmSync(staging, { recursive: true, force: true });
    return { ...common, disposition: 'HOLD', holdReasons: [error instanceof Error ? error.message : 'PUBLICATION_FAILED'] };
  }
}

export function settleAutonomousArtifacts(input: {
  projectRoot: string;
  backlogPath?: string;
  entryId?: string;
  apply?: boolean;
  planDigest?: string;
}): AutonomousArtifactSettlementPlan | AutonomousArtifactSettlementReceipt {
  const plan = planAutonomousArtifactSettlement(input);
  if (!input.apply) return plan;
  if (!input.planDigest) return {
    schemaVersion: 1, disposition: 'HOLD', planDigest: plan.planDigest,
    entryId: plan.entryId, taskId: plan.taskId, attemptId: plan.attemptId,
    archived: [], preserved: plan.preserved, holdReasons: ['PLAN_DIGEST_REQUIRED'],
  };
  return applyAutonomousArtifactSettlement(plan, input.planDigest);
}
