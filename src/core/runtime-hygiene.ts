/**
 * Bounded, receipt-producing orchestration for the runtime retention families.
 *
 * Planning is read-only. Applying a plan first revalidates every candidate's
 * exact bytes, delegates archive/verification/retirement to the family owner,
 * and finally publishes one immutable first-writer-wins receipt. A receipt is
 * also written for partial outcomes; callers therefore never have to infer
 * success from missing live files.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { RuntimeArtifactFamilyRetentionConfig } from './config-types.js';
import { ErrorRegistry } from './errors.js';
import {
  applyRecentWorkRetention,
  planRecentWorkRetention,
  type RecentWorkRetentionApplyResult,
  type RecentWorkRetentionPlan,
} from './recent-work-retention.js';
import {
  applyRunFlowRetention,
  type RunFlowRetentionOptions,
  type RunFlowRetentionResult,
} from './run-flow-retention.js';
import {
  applyRuntimeEvaluationRetention,
  planRuntimeEvaluationRetention,
  type RuntimeEvaluationRetentionPlan,
  type RuntimeEvaluationRetentionResult,
} from './runtime-evaluation-retention.js';
import {
  applyRuntimeJobRetention,
  planRuntimeJobRetention,
  type RuntimeJobOwnershipState,
  type RuntimeJobRecordView,
  type RuntimeJobRetentionPlan,
  type RuntimeJobRetentionResult,
} from './runtime-job-retention.js';
import {
  applyRuntimeLogRetention,
  planRuntimeLogRetention,
  type PlanRuntimeLogRetentionOptions,
  type RuntimeLogRetentionApplyResult,
  type RuntimeLogRetentionPlan,
} from './runtime-log-retention.js';

export const RUNTIME_HYGIENE_VERSION = 1 as const;
export const DEFAULT_RUNTIME_HYGIENE_MAX_INVENTORY = 10_000;
export const DEFAULT_RUNTIME_HYGIENE_RECEIPT_ROOT = '.deckent/archive/runtime-hygiene/receipts';

const RUNTIME_HYGIENE_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_RUNTIME_HYGIENE_RECEIPT_BYTES = 64 * 1024 * 1024;

export type RuntimeHygieneFamily = 'recent-work' | 'jobs' | 'evaluations' | 'run-flows' | 'logs';

export interface RuntimeHygieneFamilyCounter {
  readonly inventoryCount: number;
  readonly inventoryBytes: number;
  readonly candidateCount: number;
  readonly candidateBytes: number;
}

export interface RuntimeHygieneAuthorityIdentity {
  readonly source: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface RuntimeHygieneOptions {
  /** Exact terminal sprint families which may be reconciled. Current sprints are rejected. */
  readonly sprintIds?: readonly string[];
  readonly currentSprintIds?: readonly string[];
  readonly jobBounds?: RuntimeArtifactFamilyRetentionConfig;
  readonly jobOwnership?: (job: RuntimeJobRecordView) => RuntimeJobOwnershipState;
  readonly now?: Date;
  readonly flow?: Omit<RunFlowRetentionOptions, 'now'>;
  readonly logs?: Omit<PlanRuntimeLogRetentionOptions, 'now'>;
  readonly maxInventoryEntries?: number;
  readonly maxApplyItems?: number;
  readonly receiptRoot?: string;
}

interface PlannedFlowRetention {
  readonly options: RunFlowRetentionOptions;
  readonly sources: readonly string[];
}

export interface RuntimeHygienePlan {
  readonly version: typeof RUNTIME_HYGIENE_VERSION;
  readonly projectRoot: string;
  readonly plannedAt: string;
  readonly planDigest: string;
  readonly maxInventoryEntries: number;
  readonly maxApplyItems: number;
  readonly receiptRoot: string;
  readonly counters: Readonly<Record<RuntimeHygieneFamily, RuntimeHygieneFamilyCounter>>;
  readonly authority: readonly RuntimeHygieneAuthorityIdentity[];
  readonly recentWork: readonly RecentWorkRetentionPlan[];
  readonly jobs?: RuntimeJobRetentionPlan;
  readonly evaluations: readonly RuntimeEvaluationRetentionPlan[];
  readonly runFlows: PlannedFlowRetention;
  readonly logs: RuntimeLogRetentionPlan;
}

export interface RuntimeHygieneFamilyOutcome {
  readonly family: RuntimeHygieneFamily;
  readonly attempted: number;
  readonly retired: number;
  readonly retiredBytes: number;
  readonly failures: readonly string[];
}

export interface RuntimeHygieneReceipt {
  readonly kind: 'deckent.runtime-hygiene-receipt';
  readonly version: typeof RUNTIME_HYGIENE_VERSION;
  readonly planDigest: string;
  readonly status: 'complete' | 'partial';
  readonly counters: Readonly<Record<RuntimeHygieneFamily, RuntimeHygieneFamilyCounter>>;
  readonly outcomes: readonly RuntimeHygieneFamilyOutcome[];
}

export interface RuntimeHygieneApplyResult {
  readonly receiptPath: string;
  readonly receipt: RuntimeHygieneReceipt;
  readonly receiptState: 'published' | 'existing';
}

export interface ApplyRuntimeHygieneOptions {
  /** Test/integration fault boundary. A throw is recorded and later families still run. */
  readonly beforeFamily?: (family: RuntimeHygieneFamily) => void;
}

interface InventoryEntry extends RuntimeHygieneAuthorityIdentity {
  readonly family: RuntimeHygieneFamily;
}

const FAMILY_ORDER: readonly RuntimeHygieneFamily[] = [
  'recent-work', 'jobs', 'evaluations', 'run-flows', 'logs',
];
const DEFAULT_JOB_BOUNDS: RuntimeArtifactFamilyRetentionConfig = {
  max_age_days: 30,
  max_count: 250,
  max_size_mb: 256,
};

function portable(path: string): string { return path.split(sep).join('/'); }

function safeRelative(value: string): string {
  const normalized = portable(value).replace(/^\.\//u, '');
  if (normalized === '' || isAbsolute(value) || value.includes('\0')
    || normalized.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_INVALID_RELATIVE_PATH',
    });
  }
  return normalized;
}

function validateLimit(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: `RUNTIME_HYGIENE_INVALID_${label}`,
    });
  }
  return value;
}

function identity(path: string): { bytes: number; sha256: string } {
  const before = lstatSync(path);
  if (!before.isFile()) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_NOT_REGULAR',
    });
  }
  if (before.nlink !== 1) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_MULTIPLY_LINKED',
    });
  }
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let bytes = 0;
  try {
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      bytes += count;
      hash.update(buffer.subarray(0, count));
    }
  } finally { closeSync(descriptor); }
  const after = statSync(path);
  if (after.dev !== before.dev || after.ino !== before.ino || after.size !== bytes
    || after.mtimeMs !== before.mtimeMs || after.nlink !== 1) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_CHANGED_DURING_INVENTORY',
    });
  }
  return { bytes, sha256: hash.digest('hex') };
}

function classify(source: string): RuntimeHygieneFamily | null {
  if (source.startsWith('.deckent/recently-works/')) return 'recent-work';
  if (source.startsWith('.deckent/runtime/jobs/')) return 'jobs';
  if (source.startsWith('.deckent/runtime/evaluations/')) return 'evaluations';
  if (source.startsWith('.deckent/runtime/run-flow-store/') && source.endsWith('.events.jsonl')) return 'run-flows';
  const name = source.slice(source.lastIndexOf('/') + 1).toLowerCase();
  if (['.deckent/brain-start.log', '.deckent/dashboard-start.log', '.deckent/bot-start.log', '.deckent/mcp-start.log'].includes(source)
    || (source.startsWith('.deckent/runtime/logs/detached/') && name.endsWith('.log'))
    || (name.endsWith('.log') && name.includes('bot'))
    || (name.endsWith('.jsonl') && name.includes('prompt-lint'))
    || name === 'resource-log.jsonl'
    || /\.(?:tmp|temp|partial)$/u.test(name) || /^\..+\.tmp(?:\.|$)/u.test(name)) return 'logs';
  return null;
}

/** One bounded traversal, excluding immutable archives, inventories all owned families. */
function inventory(root: string, limit: number): InventoryEntry[] {
  const deckent = join(root, '.deckent');
  const pending = [deckent];
  const entries: InventoryEntry[] = [];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    let names: string[];
    try { names = readdirSync(directory).sort().reverse(); } catch { continue; }
    for (const name of names) {
      const path = join(directory, name);
      const source = portable(relative(root, path));
      if (source === '.deckent/archive' || source.startsWith('.deckent/archive/')) continue;
      let metadata;
      try { metadata = lstatSync(path); } catch { continue; }
      if (metadata.isDirectory()) {
        pending.push(path);
        continue;
      }
      const family = classify(source);
      if (family === null) continue;
      if (entries.length === limit) {
        throw ErrorRegistry.createError('DECKENT_E004', {
          message: `RUNTIME_HYGIENE_INVENTORY_LIMIT_EXCEEDED:${limit}`,
        });
      }
      if (!metadata.isFile()) continue;
      try {
        entries.push({ family, source, ...identity(path) });
      } catch {
        // Family planners retain non-regular or multiply-linked entries as a
        // typed HOLD. They never become unified mutation authority.
      }
    }
  }
  return entries.sort((a, b) => a.source.localeCompare(b.source));
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}

function digestPlan(plan: Omit<RuntimeHygienePlan, 'planDigest'>): string {
  return createHash('sha256').update(canonical(plan)).digest('hex');
}

function emptyCounters(): Record<RuntimeHygieneFamily, RuntimeHygieneFamilyCounter> {
  return Object.fromEntries(FAMILY_ORDER.map(family => [family, {
    inventoryCount: 0, inventoryBytes: 0, candidateCount: 0, candidateBytes: 0,
  }])) as Record<RuntimeHygieneFamily, RuntimeHygieneFamilyCounter>;
}

function candidateSources(
  recentWork: readonly RecentWorkRetentionPlan[],
  jobs: RuntimeJobRetentionPlan | undefined,
  evaluations: readonly RuntimeEvaluationRetentionPlan[],
  flowSources: readonly string[],
  logs: RuntimeLogRetentionPlan,
): Readonly<Record<RuntimeHygieneFamily, readonly string[]>> {
  return {
    'recent-work': recentWork.flatMap(plan => plan.retire.map(item => item.source)),
    jobs: jobs?.retire.map(item => item.source) ?? [],
    evaluations: evaluations.flatMap(plan => [...plan.reconcile, ...plan.retire].map(item => item.source)),
    'run-flows': flowSources,
    logs: logs.retire.map(item => item.source),
  };
}

/** Create a deterministic, side-effect-free plan after one bounded inventory. */
export function planRuntimeHygiene(projectRoot: string, options: RuntimeHygieneOptions = {}): RuntimeHygienePlan {
  const root = resolve(projectRoot);
  const maxInventoryEntries = validateLimit(
    options.maxInventoryEntries ?? DEFAULT_RUNTIME_HYGIENE_MAX_INVENTORY,
    'INVENTORY_LIMIT',
  );
  const maxApplyItems = validateLimit(options.maxApplyItems ?? maxInventoryEntries, 'APPLY_LIMIT');
  const receiptRoot = safeRelative(options.receiptRoot ?? DEFAULT_RUNTIME_HYGIENE_RECEIPT_ROOT);
  const plannedAt = (options.now ?? new Date()).toISOString();
  const current = new Set(options.currentSprintIds ?? []);
  const sprintIds = [...new Set(options.sprintIds ?? [])].sort();
  if (sprintIds.some(sprintId => current.has(sprintId))) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_CURRENT_SPRINT_MUTATION_REJECTED',
    });
  }
  const entries = inventory(root, maxInventoryEntries);
  const recentWork = sprintIds.map(sprintId => planRecentWorkRetention(root, sprintId));
  const jobs = options.jobBounds === undefined && !existsSync(join(root, '.deckent/runtime/jobs'))
    ? undefined
    : planRuntimeJobRetention(root, {
      bounds: options.jobBounds ?? DEFAULT_JOB_BOUNDS,
      now: () => Date.parse(plannedAt),
      ownership: options.jobOwnership,
    });
  const evaluations = sprintIds.map(sprintId =>
    planRuntimeEvaluationRetention(root, sprintId, { currentSprintIds: [...current] }));
  const flowSources = entries.filter(item => item.family === 'run-flows').map(item => item.source);
  const flowOptions: RunFlowRetentionOptions = {
    ...options.flow,
    now: new Date(plannedAt),
  };
  const logs = planRuntimeLogRetention(root, { ...options.logs, now: new Date(plannedAt) });
  const sources = candidateSources(recentWork, jobs, evaluations, flowSources, logs);
  const candidateSet = new Set(FAMILY_ORDER.flatMap(family => sources[family]));
  if (candidateSet.size > maxApplyItems) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: `RUNTIME_HYGIENE_APPLY_LIMIT_EXCEEDED:${maxApplyItems}`,
    });
  }
  const authority = entries.filter(entry => candidateSet.has(entry.source))
    .map(({ source, bytes, sha256 }) => ({ source, bytes, sha256 }));
  if (authority.length !== candidateSet.size) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_CANDIDATE_OUTSIDE_INVENTORY',
    });
  }
  const counters = emptyCounters();
  for (const entry of entries) {
    const prior = counters[entry.family];
    counters[entry.family] = {
      ...prior,
      inventoryCount: prior.inventoryCount + 1,
      inventoryBytes: prior.inventoryBytes + entry.bytes,
    };
  }
  const bySource = new Map(entries.map(entry => [entry.source, entry]));
  for (const family of FAMILY_ORDER) {
    const prior = counters[family];
    counters[family] = {
      ...prior,
      candidateCount: sources[family].length,
      candidateBytes: sources[family].reduce((sum, source) => sum + (bySource.get(source)?.bytes ?? 0), 0),
    };
  }
  const projection: Omit<RuntimeHygienePlan, 'planDigest'> = {
    version: RUNTIME_HYGIENE_VERSION,
    projectRoot: root,
    plannedAt,
    maxInventoryEntries,
    maxApplyItems,
    receiptRoot,
    counters,
    authority,
    recentWork,
    ...(jobs ? { jobs } : {}),
    evaluations,
    runFlows: { options: flowOptions, sources: flowSources },
    logs,
  };
  return { ...projection, planDigest: digestPlan(projection) };
}

function receiptPath(plan: RuntimeHygienePlan): string {
  return `${plan.receiptRoot}/${plan.planDigest}.json`;
}

function parseReceipt(bytes: Buffer, digest: string): RuntimeHygieneReceipt {
  const parsed = JSON.parse(bytes.toString('utf8')) as Partial<RuntimeHygieneReceipt>;
  if (parsed.kind !== 'deckent.runtime-hygiene-receipt' || parsed.version !== RUNTIME_HYGIENE_VERSION
    || parsed.planDigest !== digest || (parsed.status !== 'complete' && parsed.status !== 'partial')
    || parsed.counters === null || typeof parsed.counters !== 'object'
    || !Array.isArray(parsed.outcomes) || parsed.outcomes.length !== FAMILY_ORDER.length
    || FAMILY_ORDER.some((family, index) => {
      const counter = parsed.counters?.[family];
      const outcome = parsed.outcomes?.[index];
      return counter === null || typeof counter !== 'object'
        || !['inventoryCount', 'inventoryBytes', 'candidateCount', 'candidateBytes'].every(field => {
          const value = counter[field as keyof RuntimeHygieneFamilyCounter];
          return Number.isSafeInteger(value) && value >= 0;
        })
        || outcome === null || typeof outcome !== 'object' || outcome.family !== family
        || !Number.isSafeInteger(outcome.attempted) || outcome.attempted < 0
        || !Number.isSafeInteger(outcome.retired) || outcome.retired < 0
        || !Number.isSafeInteger(outcome.retiredBytes) || outcome.retiredBytes < 0
        || !Array.isArray(outcome.failures) || outcome.failures.some(item => typeof item !== 'string');
    })) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_RECEIPT_CONFLICT',
    });
  }
  return parsed as RuntimeHygieneReceipt;
}

function readReceiptBytes(path: string): Buffer {
  const before = lstatSync(path);
  if (!before.isFile() || before.nlink !== 1 || before.size > MAX_RUNTIME_HYGIENE_RECEIPT_BYTES) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_RECEIPT_CONFLICT',
    });
  }
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1
      || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs) {
      throw ErrorRegistry.createError('DECKENT_E004', {
        message: 'RUNTIME_HYGIENE_RECEIPT_CONFLICT',
      });
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (bytes.length !== before.size || after.dev !== before.dev || after.ino !== before.ino
      || after.nlink !== 1 || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw ErrorRegistry.createError('DECKENT_E004', {
        message: 'RUNTIME_HYGIENE_RECEIPT_CONFLICT',
      });
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Read one immutable receipt without rebuilding a plan from a tree which the
 * receipt may already have mutated. The exact digest is the replay capability;
 * malformed, linked, or conflicting durable state fails closed.
 */
export function readRuntimeHygieneReceipt(
  projectRoot: string,
  planDigest: string,
  receiptRoot = DEFAULT_RUNTIME_HYGIENE_RECEIPT_ROOT,
): RuntimeHygieneApplyResult | null {
  if (!RUNTIME_HYGIENE_DIGEST_PATTERN.test(planDigest)) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_PLAN_DIGEST_INVALID',
    });
  }
  const root = resolve(projectRoot);
  const relativeRoot = safeRelative(receiptRoot);
  const path = `${relativeRoot}/${planDigest}.json`;
  const absolute = join(root, path);
  if (!existsSync(absolute)) return null;
  return {
    receiptPath: path,
    receipt: parseReceipt(readReceiptBytes(absolute), planDigest),
    receiptState: 'existing',
  };
}

function publishReceipt(root: string, relativePath: string, receipt: RuntimeHygieneReceipt): 'published' | 'existing' {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  try {
    try { linkSync(temporary, destination); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      parseReceipt(readFileSync(destination), receipt.planDigest);
      return 'existing';
    }
    const directoryDescriptor = openSync(dirname(destination), 'r');
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    return 'published';
  } finally { try { unlinkSync(temporary); } catch { /* destination is authoritative */ } }
}

function fresh(plan: RuntimeHygienePlan, sources: readonly string[]): string[] {
  const expected = new Map(plan.authority.map(item => [item.source, item]));
  const failures: string[] = [];
  for (const source of sources) {
    const prior = expected.get(source);
    if (!prior) { failures.push(`${source}:AUTHORITY_MISSING`); continue; }
    try {
      const actual = identity(join(plan.projectRoot, source));
      if (actual.bytes !== prior.bytes || actual.sha256 !== prior.sha256) failures.push(`${source}:SOURCE_CHANGED`);
    } catch { failures.push(`${source}:SOURCE_CHANGED`); }
  }
  return failures;
}

function outcome(
  family: RuntimeHygieneFamily,
  attempted: number,
  retiredSources: readonly string[],
  bytes: ReadonlyMap<string, number>,
  failures: readonly string[],
): RuntimeHygieneFamilyOutcome {
  return {
    family,
    attempted,
    retired: retiredSources.length,
    retiredBytes: retiredSources.reduce((sum, source) => sum + (bytes.get(source) ?? 0), 0),
    failures,
  };
}

/** Apply each family independently, expose all partial failures, then publish the FWW receipt. */
export function applyRuntimeHygiene(
  plan: RuntimeHygienePlan,
  options: ApplyRuntimeHygieneOptions = {},
): RuntimeHygieneApplyResult {
  if (plan.version !== RUNTIME_HYGIENE_VERSION) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_INVALID_PLAN',
    });
  }
  const { planDigest: ignored, ...projection } = plan;
  if (digestPlan(projection) !== plan.planDigest) {
    throw ErrorRegistry.createError('DECKENT_E004', {
      message: 'RUNTIME_HYGIENE_PLAN_DIGEST_INVALID',
    });
  }
  const root = resolve(plan.projectRoot);
  const path = receiptPath(plan);
  if (existsSync(join(root, path))) {
    return {
      receiptPath: path,
      receipt: parseReceipt(readReceiptBytes(join(root, path)), plan.planDigest),
      receiptState: 'existing',
    };
  }
  const bytes = new Map(plan.authority.map(item => [item.source, item.bytes]));
  const sources = candidateSources(plan.recentWork, plan.jobs, plan.evaluations, plan.runFlows.sources, plan.logs);
  const outcomes: RuntimeHygieneFamilyOutcome[] = [];

  const execute = (family: RuntimeHygieneFamily, run: () => { retired: readonly string[]; failures: readonly string[] }): void => {
    const authorityFailures = fresh(plan, sources[family]);
    if (authorityFailures.length > 0) {
      outcomes.push(outcome(family, sources[family].length, [], bytes, authorityFailures));
      return;
    }
    try {
      options.beforeFamily?.(family);
      const result = run();
      outcomes.push(outcome(family, sources[family].length, result.retired, bytes, result.failures));
    } catch (error) {
      outcomes.push(outcome(family, sources[family].length, [], bytes, [
        `${family}:${error instanceof Error ? error.message : String(error)}`,
      ]));
    }
  };

  execute('recent-work', () => {
    const results: RecentWorkRetentionApplyResult[] = plan.recentWork.map(applyRecentWorkRetention);
    return { retired: results.flatMap(result => result.retired), failures: results.flatMap(result => result.failures) };
  });
  execute('jobs', () => {
    const result: RuntimeJobRetentionResult | undefined = plan.jobs && applyRuntimeJobRetention(plan.jobs);
    return { retired: result?.retired ?? [], failures: result?.failures ?? [] };
  });
  execute('evaluations', () => {
    const results: RuntimeEvaluationRetentionResult[] = plan.evaluations.map(applyRuntimeEvaluationRetention);
    return { retired: results.flatMap(result => result.retired), failures: results.flatMap(result => result.failures) };
  });
  execute('run-flows', () => {
    const result: RunFlowRetentionResult = applyRunFlowRetention(root, plan.runFlows.options);
    return {
      retired: result.archived.map(item => item.publication.manifest.source),
      failures: result.failures.map(item => `${item.flowId}:${item.error}`),
    };
  });
  execute('logs', () => {
    const result: RuntimeLogRetentionApplyResult = applyRuntimeLogRetention(plan.logs, {
      now: new Date(plan.plannedAt),
      currentWriters: plan.logs.preserve.filter(item => item.reason === 'current-writer').map(item => item.source),
    });
    return { retired: result.retired, failures: result.failures };
  });

  const receipt: RuntimeHygieneReceipt = {
    kind: 'deckent.runtime-hygiene-receipt',
    version: RUNTIME_HYGIENE_VERSION,
    planDigest: plan.planDigest,
    status: outcomes.every(item => item.failures.length === 0) ? 'complete' : 'partial',
    counters: plan.counters,
    outcomes,
  };
  const receiptState = publishReceipt(root, path, receipt);
  const durable = parseReceipt(readReceiptBytes(join(root, path)), plan.planDigest);
  return { receiptPath: path, receipt: durable, receiptState };
}

export function reconcileRuntimeHygiene(
  projectRoot: string,
  options: RuntimeHygieneOptions & { readonly apply?: boolean } = {},
): RuntimeHygienePlan | RuntimeHygieneApplyResult {
  const plan = planRuntimeHygiene(projectRoot, options);
  return options.apply === true ? applyRuntimeHygiene(plan) : plan;
}
