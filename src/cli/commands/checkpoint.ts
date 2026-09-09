import type { Command } from 'commander';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { resolveGlobalConfigReadPath } from '../../core/global-scope-resolver.js';
import {
  getDeprecatedForwardingSurface,
  registerDeprecatedForwarding,
} from '../helpers/compatibility-command-help.js';
import { bindArgumentDescriptions } from '../helpers/message-catalog/cli-run.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { withCommandLocalShutdown } from '../helpers/shutdown-hooks.js';
import { executeApprovalDecision } from './approvals.js';

const CHECKPOINT_PHASES = new Set(['plan', 'evaluate', 'fix']);
const SAFE_CHECKPOINT_SPRINT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const MAX_CHECKPOINT_SPRINT_ID_LENGTH = 128;
const MAX_CHECKPOINT_BYTES = 64 * 1024;
const CHECKPOINT_FILENAME = /^checkpoint-([A-Za-z0-9][A-Za-z0-9_-]{0,127})-(plan|evaluate|fix)\.json$/u;
const CHECKPOINT_STAT_KEYS = ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'] as const;

type CheckpointStatus = 'pending' | 'approved' | 'rejected' | 'timeout';

interface CheckpointListOpts {
  readonly pending?: boolean;
  readonly json?: boolean;
  readonly lang?: string;
}

interface CheckpointViewPolicy {
  readonly strictTenantIsolation: boolean;
  readonly authorityEnabled: boolean;
  readonly tenantId?: string;
  readonly language?: string;
}

type CheckpointListItem = Readonly<{
  state: 'ready'; id: string; sprintId: string; phase: string; status: CheckpointStatus;
  summary: string; createdAt: string; tenantId?: string;
}> | Readonly<{ state: 'unknown'; id: string; reasonCode: string }>;

type CheckpointListResult =
  | Readonly<{ state: 'ready'; items: readonly CheckpointListItem[] }>
  | Readonly<{ state: 'partial'; items: readonly CheckpointListItem[] }>
  | Readonly<{ state: 'held'; reasonCode: string; id?: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameStat(a: ReturnType<typeof fstatSync>, b: ReturnType<typeof fstatSync>): boolean {
  return CHECKPOINT_STAT_KEYS.every(key => a[key] === b[key]);
}

/** The lifecycle producer writes `new Date().toISOString()`; accept that exact, safe shape only. */
function isCanonicalCreatedAt(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

/** Read only the list view's policy fields: no config migration, healing, or write. */
function readCheckpointViewPolicy(projectRoot: string): CheckpointViewPolicy | { readonly reasonCode: string } {
  let strictTenantIsolation = false;
  let authorityEnabled = false;
  let tenantId: string | undefined;
  let language: string | undefined;
  for (const path of [resolveGlobalConfigReadPath(), join(resolve(projectRoot), PROJECT_CONFIG_PATH)]) {
    let raw: string;
    try { raw = readFileSync(path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      return { reasonCode: 'CONFIG_UNAVAILABLE' };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw) as unknown; }
    catch { return { reasonCode: 'CONFIG_INVALID' }; }
    if (!isRecord(parsed)) return { reasonCode: 'CONFIG_INVALID' };
    if (parsed.strict_tenant_isolation !== undefined && typeof parsed.strict_tenant_isolation !== 'boolean') {
      return { reasonCode: 'CONFIG_INVALID' };
    }
    if (parsed.language !== undefined && typeof parsed.language !== 'string') return { reasonCode: 'CONFIG_INVALID' };
    const approval = parsed.approval;
    if (approval !== undefined) {
      if (!isRecord(approval)) return { reasonCode: 'CONFIG_INVALID' };
      const authority = approval.authority;
      if (authority !== undefined) {
        if (!isRecord(authority)
          || (authority.enabled !== undefined && typeof authority.enabled !== 'boolean')
          || (authority.tenant_id !== undefined && typeof authority.tenant_id !== 'string')) {
          return { reasonCode: 'CONFIG_INVALID' };
        }
        if (authority.enabled !== undefined) authorityEnabled = authority.enabled;
        if (authority.tenant_id !== undefined) tenantId = authority.tenant_id;
      }
    }
    if (parsed.strict_tenant_isolation !== undefined) strictTenantIsolation = parsed.strict_tenant_isolation;
    if (parsed.language !== undefined) language = parsed.language;
  }
  return { strictTenantIsolation, authorityEnabled, ...(tenantId === undefined ? {} : { tenantId }), ...(language === undefined ? {} : { language }) };
}

function readCheckpointFile(path: string, filename: string): CheckpointListItem {
  const match = CHECKPOINT_FILENAME.exec(filename);
  const id = filename.slice(0, 256);
  if (!match) return { state: 'unknown', id, reasonCode: 'INVALID_FILENAME' };
  const [sprintId, phase] = [match[1], match[2]];
  if (sprintId === undefined || phase === undefined) return { state: 'unknown', id, reasonCode: 'INVALID_FILENAME' };
  let before: ReturnType<typeof lstatSync>;
  try { before = lstatSync(path); }
  catch { return { state: 'unknown', id, reasonCode: 'UNREADABLE' }; }
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_CHECKPOINT_BYTES) {
    return { state: 'unknown', id, reasonCode: before.size > MAX_CHECKPOINT_BYTES ? 'OVERSIZE' : 'UNSAFE_SOURCE' };
  }
  // Refuse the source on platforms without no-follow open: lstat alone cannot close the swap race.
  if (typeof constants.O_NOFOLLOW !== 'number' || constants.O_NOFOLLOW === 0) {
    return { state: 'unknown', id, reasonCode: 'UNSAFE_SOURCE' };
  }
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    if (!opened.isFile() || !sameStat(before, opened) || opened.size > MAX_CHECKPOINT_BYTES) {
      return { state: 'unknown', id, reasonCode: 'UNSAFE_SOURCE' };
    }
    const bytes = Buffer.allocUnsafe(MAX_CHECKPOINT_BYTES + 1);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    const after = fstatSync(fd);
    if (count > MAX_CHECKPOINT_BYTES) return { state: 'unknown', id, reasonCode: 'OVERSIZE' };
    if (!sameStat(opened, after)) return { state: 'unknown', id, reasonCode: 'UNSAFE_SOURCE' };
    let value: unknown;
    try { value = JSON.parse(bytes.subarray(0, count).toString('utf8')) as unknown; }
    catch { return { state: 'unknown', id, reasonCode: 'INVALID_RECORD' }; }
    if (!isRecord(value)
      || value.phase !== phase
      || typeof value.summary !== 'string'
      || typeof value.createdAt !== 'string'
      || !isCanonicalCreatedAt(value.createdAt)
      || typeof value.status !== 'string'
      || !(['pending', 'approved', 'rejected', 'timeout'] as const).includes(value.status as CheckpointStatus)) {
      return { state: 'unknown', id, reasonCode: 'INVALID_RECORD' };
    }
    const recordTenantId = value.tenantId;
    if (recordTenantId !== undefined && (typeof recordTenantId !== 'string' || recordTenantId.length === 0 || recordTenantId.length > 512)) {
      return { state: 'unknown', id, reasonCode: 'INVALID_RECORD' };
    }
    return {
      state: 'ready', id: `checkpoint-${sprintId}-${phase}`, sprintId, phase,
      status: value.status as CheckpointStatus, summary: value.summary, createdAt: value.createdAt,
      ...(recordTenantId === undefined ? {} : { tenantId: recordTenantId }),
    };
  } catch { return { state: 'unknown', id, reasonCode: 'UNREADABLE' }; }
  finally { if (fd !== undefined) closeSync(fd); }
}

function listCheckpoints(projectRoot: string, pendingOnly: boolean): CheckpointListResult {
  const policy = readCheckpointViewPolicy(projectRoot);
  if ('reasonCode' in policy) return { state: 'held', reasonCode: policy.reasonCode };
  if (!policy.authorityEnabled) return { state: 'held', reasonCode: 'APPROVAL_AUTHORITY_DISABLED' };
  const directory = join(resolve(projectRoot), '.deckent', 'checkpoints');
  let directoryStat: ReturnType<typeof lstatSync>;
  try { directoryStat = lstatSync(directory); }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { state: 'ready', items: [] } : { state: 'held', reasonCode: 'SOURCE_UNAVAILABLE' }; }
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return { state: 'held', reasonCode: 'SOURCE_UNSAFE' };
  let names: string[];
  try { names = readdirSync(directory); }
  catch { return { state: 'held', reasonCode: 'SOURCE_UNAVAILABLE' }; }
  const items: CheckpointListItem[] = [];
  for (const name of names.sort()) {
    if (!name.startsWith('checkpoint-') || !name.endsWith('.json')) continue;
    const item = readCheckpointFile(join(directory, name), name);
    if (item.state === 'unknown') {
      if (item.reasonCode === 'UNSAFE_SOURCE') return { state: 'held', reasonCode: 'SOURCE_UNSAFE', id: item.id };
      if (policy.strictTenantIsolation) return { state: 'held', reasonCode: 'TENANT_SCOPE_UNRESOLVED', id: item.id };
      items.push(item);
      continue;
    }
    if (policy.strictTenantIsolation && (policy.tenantId === undefined || item.tenantId === undefined)) {
      return { state: 'held', reasonCode: 'TENANT_SCOPE_UNRESOLVED', id: item.id };
    }
    // Match the approval inbox's existing tenant rule: unscoped source rows
    // remain visible outside strict mode, but a tenant-scoped row is never
    // surfaced when this authority has no matching tenant identity.
    if (item.tenantId !== undefined && item.tenantId !== policy.tenantId) continue;
    if (!pendingOnly || item.status === 'pending') items.push(item);
  }
  if (policy.strictTenantIsolation && policy.tenantId === undefined && items.length > 0) {
    return { state: 'held', reasonCode: 'TENANT_SCOPE_UNRESOLVED' };
  }
  return { state: items.some(item => item.state === 'unknown') ? 'partial' : 'ready', items };
}

function printCheckpointList(result: CheckpointListResult, json: boolean, language: string): void {
  if (json) {
    print(JSON.stringify(result));
    if (result.state === 'held' || result.state === 'partial') process.exitCode = 1;
    return;
  }
  if (result.state === 'held') {
    if (result.reasonCode === 'TENANT_SCOPE_UNRESOLVED') {
      printError(new Error(getMessage('checkpoint.list_tenant_scope_hold', language, { id: result.id ?? '-' })));
    } else if (result.reasonCode === 'APPROVAL_AUTHORITY_DISABLED') {
      printError(new Error(getMessage('approvals.authority_disabled', language)));
    } else print(JSON.stringify(result));
    process.exitCode = 1;
    return;
  }
  if (result.items.length === 0) { print(getMessage('checkpoint.list_empty', language)); return; }
  print([getMessage('checkpoint.col_sprint', language), getMessage('checkpoint.col_phase', language), getMessage('checkpoint.col_status', language), getMessage('checkpoint.col_summary', language), getMessage('checkpoint.col_created', language)].join('\t'));
  for (const item of result.items) {
    if (item.state === 'unknown') print(JSON.stringify(item));
    // JSON string escaping is stable, keeps table delimiters intact, and
    // prevents untrusted checkpoint summaries from issuing terminal controls.
    else print([item.sprintId, item.phase, item.status, JSON.stringify(item.summary).slice(1, -1), item.createdAt].join('\t'));
  }
  if (result.state === 'partial') process.exitCode = 1;
}

export function checkpointApprovalRequestId(sprintId: string, phase: string): string | undefined {
  if (
    sprintId.length > MAX_CHECKPOINT_SPRINT_ID_LENGTH
    || !SAFE_CHECKPOINT_SPRINT_ID.test(sprintId)
    || !CHECKPOINT_PHASES.has(phase)
  ) return undefined;
  return `checkpoint-${sprintId}-${phase}`;
}

interface CheckpointDecisionOpts {
  readonly lang?: string;
}

function resolveCallerLocalLanguage(requested: string | undefined): string {
  const normalized = requested?.slice(0, 2).toLowerCase();
  return normalized === 'en' || normalized === 'tr' ? normalized : getLanguage(undefined);
}

function resolveCheckpointListLanguage(requested: string | undefined, configLanguage: string | undefined): string {
  const normalized = requested?.slice(0, 2).toLowerCase();
  return normalized === 'en' || normalized === 'tr' ? normalized : getLanguage(configLanguage);
}

function registerCheckpointDecision(
  checkpoint: Command,
  action: 'approve' | 'reject',
  helpLanguage: string,
): void {
  bindArgumentDescriptions(
    checkpoint.command(`${action} <sprintId> <phase>`),
    helpLanguage,
    {
      sprintId: 'cliContract.checkpoint.arg.sprintId',
      phase: 'cliContract.checkpoint.arg.phase',
    },
  )
    .description(getMessage(`cli.checkpoint.${action}.desc`, helpLanguage))
    .option('--lang <code>', getMessage('checkpoint.lang_option', helpLanguage))
    .allowExcessArguments(false)
    .action((sprintId: string, phase: string, opts: CheckpointDecisionOpts) =>
      withCommandLocalShutdown(async () => {
        const language = resolveCallerLocalLanguage(opts.lang);
        const requestId = checkpointApprovalRequestId(sprintId, phase);
        if (requestId === undefined) {
          printError(new Error(getMessage('approvals.decision_refused', language, {
            id: 'checkpoint-input',
            kind: 'invalid-input',
            reason: 'invalid-checkpoint-identity',
          })));
          process.exitCode = 1;
          return;
        }
        await executeApprovalDecision(
          requestId,
          action === 'approve' ? { allow: true } : { deny: true },
          { callerLocalLang: language, requiredFederatedOrigin: 'checkpoint' },
        );
      }));
}

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerCheckpoint(program: Command): void {
  const checkpoint = registerDeprecatedForwarding(
    program,
    getDeprecatedForwardingSurface('checkpoint')!,
  );
  const helpLanguage = getLanguage(undefined);
  checkpoint.command('list')
    .description(getMessage('cli.checkpoint.list.desc', helpLanguage))
    .option('--pending', getMessage('checkpoint.pending_option', helpLanguage))
    .option('--json', getMessage('checkpoint.json_option', helpLanguage))
    .option('--lang <code>', getMessage('checkpoint.lang_option', helpLanguage))
    .allowExcessArguments(false)
    .action((opts: CheckpointListOpts) => {
      const policy = readCheckpointViewPolicy(resolveProjectRoot());
      const language = resolveCheckpointListLanguage(
        opts.lang,
        'language' in policy ? policy.language : undefined,
      );
      // The caller-local override is deliberately resolved before the view's
      // project language; this list never loads or mutates config.
      const result = listCheckpoints(resolveProjectRoot(), opts.pending === true);
      printCheckpointList(result, opts.json === true, language);
    });
  registerCheckpointDecision(checkpoint, 'approve', helpLanguage);
  registerCheckpointDecision(checkpoint, 'reject', helpLanguage);
}
