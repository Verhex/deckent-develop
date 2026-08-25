// ═══ bot-daemon — always-on bot process management (§4G) ═════════════
//
// A numeric PID alone is never process authority: operating systems reuse PIDs
// and containers expose namespace-local PID views. Bot management therefore
// binds the PID to its kernel start token and project root before status/start/
// stop may trust or signal it. Platforms without a verified start-token adapter
// fail honestly with `ownership-unknown`.

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResolvedConfig } from '../core/config-types.js';
import { isPidAlive } from '../core/pid-liveness.js';
import { processStartToken } from '../core/pid-ownership.js';
import { debugLog } from '../core/utils.js';
import {
  deliverPendingOwnerNotifications,
  type DeliveryOptions,
  type DeliveryResult,
  type OwnerNotificationTransport,
} from './notification-delivery.js';

const BOT_PID_FILE = 'bot.pid';
const BOT_PID_SCHEMA_VERSION = 2 as const;
const LEGACY_BOT_PID_SCHEMA_VERSION = 1 as const;
const MAX_BOT_PID_BYTES = 4_096;
const SHA256_RE = /^[a-f0-9]{64}$/u;
const START_TOKEN_RE = /^s\d+$/u;
const BOT_READY_POLL_INTERVAL_MS = 25;
const BOT_READY_MAX_ATTEMPTS = 400;
const BOT_READY_WAITER = new Int32Array(
  new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
);

export interface BotRuntimeIdentity {
  readonly entrypointDigest: string;
  readonly buildIdentityDigest: string;
}

interface BotPidRecord {
  readonly schemaVersion: typeof BOT_PID_SCHEMA_VERSION;
  readonly pid: number;
  readonly startToken: string | null;
  readonly projectRootDigest: string;
  readonly runtimeIdentity: BotRuntimeIdentity;
  readonly recordedAt: string;
}

interface LegacyBotPidRecord {
  readonly schemaVersion: typeof LEGACY_BOT_PID_SCHEMA_VERSION;
  readonly pid: number;
  readonly startToken: string | null;
  readonly projectRootDigest: string;
  readonly recordedAt: string;
}

export type BotPidInspection =
  | {
      readonly status: 'running';
      readonly pid: number;
      readonly runtimeIdentity: BotRuntimeIdentity;
    }
  | {
      readonly status: 'not-running';
      readonly reason: 'absent' | 'dead' | 'reused' | 'foreign-legacy';
    }
  | {
      readonly status: 'ownership-unknown';
      readonly pid: number | null;
      readonly reason:
        | 'malformed-record'
        | 'project-binding-mismatch'
        | 'start-token-unavailable'
        | 'legacy-identity-unavailable'
        | 'runtime-adoption-unavailable'
        | 'token-proven-legacy-schema';
    };

type LegacyIdentity = 'bot' | 'foreign' | 'unknown';

export interface BotPidRuntimeDeps {
  readonly platform?: NodeJS.Platform;
  readonly isAlive?: (pid: number) => boolean;
  readonly startToken?: (pid: number) => string | null;
  readonly legacyIdentity?: (root: string, pid: number) => LegacyIdentity;
  readonly kill?: (pid: number, signal: NodeJS.Signals) => void;
  readonly now?: () => Date;
  /** Listener-owned seam for the exact runtime bytes loaded by this process. */
  readonly runtimeIdentity?: () => BotRuntimeIdentity | null;
}

// Capture once during module evaluation. Re-reading either path when the pid
// file is eventually published could attest replacement bytes that this
// already-running listener never loaded.
const LOADED_RUNTIME_IDENTITY = loadedRuntimeIdentity();

function botPidPath(root: string): string {
  return join(root, '.deckent', BOT_PID_FILE);
}

function canonicalPathEquals(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    : left === right;
}

function projectRootDigest(root: string): string {
  return createHash('sha256')
    .update(realpathSync.native(resolve(root)))
    .digest('hex');
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) && new Date(epochMs).toISOString() === value;
}

function validRuntimeIdentity(value: unknown): value is BotRuntimeIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const identity = value as Record<string, unknown>;
  return Object.keys(identity).sort().join(',')
      === 'buildIdentityDigest,entrypointDigest'
    && typeof identity.entrypointDigest === 'string'
    && SHA256_RE.test(identity.entrypointDigest)
    && typeof identity.buildIdentityDigest === 'string'
    && SHA256_RE.test(identity.buildIdentityDigest);
}

function parseStructuredBotPidRecord(
  raw: string,
): BotPidRecord | LegacyBotPidRecord | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const commonKeys = [
      'pid',
      'projectRootDigest',
      'recordedAt',
      'schemaVersion',
      'startToken',
    ];
    const current = record.schemaVersion === BOT_PID_SCHEMA_VERSION;
    const expectedKeys = current
      ? [...commonKeys, 'runtimeIdentity'].sort()
      : commonKeys;
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) return null;
    if ((record.schemaVersion !== BOT_PID_SCHEMA_VERSION
        && record.schemaVersion !== LEGACY_BOT_PID_SCHEMA_VERSION)
      || !Number.isSafeInteger(record.pid)
      || (record.pid as number) <= 0
      || (record.startToken !== null
        && (typeof record.startToken !== 'string'
          || !START_TOKEN_RE.test(record.startToken)))
      || typeof record.projectRootDigest !== 'string'
      || !SHA256_RE.test(record.projectRootDigest)
      || !validTimestamp(record.recordedAt)
      || (current && !validRuntimeIdentity(record.runtimeIdentity))) {
      return null;
    }
    if (!current) {
      return {
        schemaVersion: LEGACY_BOT_PID_SCHEMA_VERSION,
        pid: record.pid as number,
        startToken: record.startToken as string | null,
        projectRootDigest: record.projectRootDigest,
        recordedAt: record.recordedAt as string,
      };
    }
    return {
      schemaVersion: BOT_PID_SCHEMA_VERSION,
      pid: record.pid as number,
      startToken: record.startToken as string | null,
      projectRootDigest: record.projectRootDigest,
      runtimeIdentity: record.runtimeIdentity as BotRuntimeIdentity,
      recordedAt: record.recordedAt as string,
    };
  } catch {
    return null;
  }
}

function parseLegacyPid(raw: string): number | null {
  const value = raw.trim();
  if (!/^[1-9]\d*$/u.test(value)) return null;
  const pid = Number(value);
  return Number.isSafeInteger(pid) ? pid : null;
}

function readBotPidRaw(path: string): string | null {
  if (!existsSync(path)) return null;
  const entry = lstatSync(path);
  if (!entry.isFile()
    || entry.isSymbolicLink()
    || entry.nlink !== 1
    || entry.size > MAX_BOT_PID_BYTES) {
    throw new Error('unsafe-bot-pid-record');
  }
  const raw = readFileSync(path, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_BOT_PID_BYTES) {
    throw new Error('oversized-bot-pid-record');
  }
  return raw;
}

function retireBotPidRecord(path: string, expectedRaw: string): boolean {
  try {
    if (readBotPidRaw(path) !== expectedRaw) return false;
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

function writeBotPidRecord(
  root: string,
  record: BotPidRecord,
  mode: 'create' | 'replace' = 'create',
): boolean {
  const path = botPidPath(root);
  const directory = dirname(path);
  const raw = JSON.stringify(record);
  const staging =
    `${path}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  let fd: number | undefined;
  let directoryFd: number | undefined;
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    fd = openSync(
      staging,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(fd, raw, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    if (mode === 'create') {
      // link(2) is an atomic no-clobber publication: concurrent listeners can
      // never overwrite one another's process authority.
      linkSync(staging, path);
      unlinkSync(staging);
    } else {
      renameSync(staging, path);
    }
    directoryFd = openSync(
      directory,
      fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0),
    );
    fsyncSync(directoryFd);
    closeSync(directoryFd);
    directoryFd = undefined;
    return true;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* preserve write failure */ }
    }
    if (directoryFd !== undefined) {
      try { closeSync(directoryFd); } catch { /* preserve write failure */ }
    }
    try { unlinkSync(staging); } catch { /* renamed or never created */ }
  }
}

function createBotPidRecord(
  root: string,
  pid: number,
  deps: BotPidRuntimeDeps,
): BotPidRecord | null {
  const tokenOf = deps.startToken ?? processStartToken;
  const recordedAt = (deps.now?.() ?? new Date()).toISOString();
  const runtimeIdentity = deps.runtimeIdentity
    ? deps.runtimeIdentity()
    : LOADED_RUNTIME_IDENTITY;
  if (!runtimeIdentity || !validRuntimeIdentity(runtimeIdentity)) return null;
  return {
    schemaVersion: BOT_PID_SCHEMA_VERSION,
    pid,
    startToken: tokenOf(pid),
    projectRootDigest: projectRootDigest(root),
    runtimeIdentity,
    recordedAt,
  };
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Digest the entrypoint and this build-identity module during module load. */
function loadedRuntimeIdentity(): BotRuntimeIdentity | null {
  try {
    const loadedEntrypoint = process.argv[1];
    if (!loadedEntrypoint) return null;
    return {
      entrypointDigest: sha256File(realpathSync.native(loadedEntrypoint)),
      buildIdentityDigest: sha256File(
        realpathSync.native(fileURLToPath(import.meta.url)),
      ),
    };
  } catch {
    return null;
  }
}

function resolveExisting(path: string): string | null {
  try {
    return realpathSync.native(path);
  } catch {
    return null;
  }
}

function inspectLegacyBotIdentity(root: string, pid: number): LegacyIdentity {
  if (process.platform !== 'linux') return 'unknown';
  try {
    const cwd = realpathSync.native(`/proc/${pid}/cwd`);
    if (!canonicalPathEquals(cwd, realpathSync.native(resolve(root)))) {
      return 'foreign';
    }
    const argv = readFileSync(`/proc/${pid}/cmdline`)
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
    if (argv.length < 4 || argv[2] !== 'bot' || argv[3] !== 'listen') {
      return 'foreign';
    }
    const actualEntry = resolveExisting(argv[1]!);
    const expectedEntries = [
      entryPath(),
      join(root, 'dist', 'cli', 'entry.js'),
      join(root, 'src', 'cli', 'entry.ts'),
    ].map(resolveExisting).filter((value): value is string => value !== null);
    return actualEntry
      && expectedEntries.some(expected =>
        canonicalPathEquals(actualEntry, expected))
      ? 'bot'
      : 'foreign';
  } catch {
    return 'unknown';
  }
}

/** Write the listener's ownership-bound pid record. */
export function writeBotPid(
  root: string,
  pid: number = process.pid,
  deps: BotPidRuntimeDeps = {},
): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    const existing = inspectBotPid(root, deps);
    if (existing.status === 'ownership-unknown') return false;
    if (existing.status === 'running') return existing.pid === pid;
    const record = createBotPidRecord(root, pid, deps);
    // Never launch an unmanageable daemon. Until a platform adapter can prove
    // process generations, listener admission fails honestly before waiting.
    if (!record || record.startToken === null) return false;
    return writeBotPidRecord(root, record);
  } catch {
    return false;
  }
}

/**
 * Inspect bot process ownership. Dead, reused, or provably foreign legacy
 * records are retired with compare-before-unlink; ambiguous evidence is kept
 * and returned as fail-closed `ownership-unknown`.
 */
export function inspectBotPid(
  root: string,
  deps: BotPidRuntimeDeps = {},
): BotPidInspection {
  const path = botPidPath(root);
  let raw: string | null;
  try {
    raw = readBotPidRaw(path);
  } catch {
    return {
      status: 'ownership-unknown',
      pid: null,
      reason: 'malformed-record',
    };
  }
  if (raw === null) return { status: 'not-running', reason: 'absent' };

  const isAlive = deps.isAlive ?? isPidAlive;
  const tokenOf = deps.startToken ?? processStartToken;
  const platform = deps.platform ?? process.platform;
  const structuredRecord = parseStructuredBotPidRecord(raw);
  const record = structuredRecord;
  if (record) {
    let expectedRootDigest: string;
    try {
      expectedRootDigest = projectRootDigest(root);
    } catch {
      return {
        status: 'ownership-unknown',
        pid: record.pid,
        reason: 'project-binding-mismatch',
      };
    }
    if (record.projectRootDigest !== expectedRootDigest) {
      return {
        status: 'ownership-unknown',
        pid: record.pid,
        reason: 'project-binding-mismatch',
      };
    }
    if (!isAlive(record.pid)) {
      retireBotPidRecord(path, raw);
      return { status: 'not-running', reason: 'dead' };
    }
    const liveToken = tokenOf(record.pid);
    if (record.startToken && liveToken) {
      if (record.startToken === liveToken) {
        if (record.schemaVersion === LEGACY_BOT_PID_SCHEMA_VERSION) {
          // Start-token equality on a live pid IS ownership proof; only the
          // runtime-adoption identity is missing on the legacy schema. Name
          // this precisely so stopBot can honor the proof — a pre-upgrade
          // daemon must stay stoppable through the CLI (HIGH-5, 2026-08-24).
          return {
            status: 'ownership-unknown',
            pid: record.pid,
            reason: 'token-proven-legacy-schema',
          };
        }
        return {
          status: 'running',
          pid: record.pid,
          runtimeIdentity: record.runtimeIdentity,
        };
      }
      retireBotPidRecord(path, raw);
      return { status: 'not-running', reason: 'reused' };
    }
    return {
      status: 'ownership-unknown',
      pid: record.pid,
      reason: 'start-token-unavailable',
    };
  }

  const legacyPid = parseLegacyPid(raw);
  if (legacyPid === null) {
    return {
      status: 'ownership-unknown',
      pid: null,
      reason: 'malformed-record',
    };
  }
  if (!isAlive(legacyPid)) {
    retireBotPidRecord(path, raw);
    return { status: 'not-running', reason: 'dead' };
  }
  const legacyIdentity = (deps.legacyIdentity ?? inspectLegacyBotIdentity)(
    root,
    legacyPid,
  );
  if (legacyIdentity === 'foreign') {
    retireBotPidRecord(path, raw);
    return { status: 'not-running', reason: 'foreign-legacy' };
  }
  if (legacyIdentity !== 'bot' || platform !== 'linux') {
    return {
      status: 'ownership-unknown',
      pid: legacyPid,
      reason: 'legacy-identity-unavailable',
    };
  }
  return {
    status: 'ownership-unknown',
    pid: legacyPid,
    reason: 'runtime-adoption-unavailable',
  };
}

/** Compatibility read: only proven-owned processes are returned. */
export function readBotPid(
  root: string,
  deps: BotPidRuntimeDeps = {},
): number | null {
  const inspection = inspectBotPid(root, deps);
  return inspection.status === 'running' ? inspection.pid : null;
}

/**
 * Remove only this listener generation's pid record. An older listener cannot
 * erase a newer daemon's record during overlapping shutdown/start.
 */
export function clearBotPid(
  root: string,
  pid: number = process.pid,
  deps: BotPidRuntimeDeps = {},
): boolean {
  const path = botPidPath(root);
  try {
    const raw = readBotPidRaw(path);
    if (raw === null) return true;
    const record = parseStructuredBotPidRecord(raw);
    const tokenOf = deps.startToken ?? processStartToken;
    if (record
      && record.pid === pid
      && record.startToken !== null
      && record.startToken === tokenOf(pid)) {
      return retireBotPidRecord(path, raw);
    }
    return false;
  } catch {
    return false;
  }
}

export type StopBotResult =
  | { readonly status: 'stopped'; readonly pid: number }
  | { readonly status: 'not-running' }
  | {
      readonly status: 'ownership-unknown';
      readonly pid: number | null;
      readonly reason: string;
    };

/** Stop only a proven-owned bot daemon via SIGTERM. */
export function stopBot(
  root: string,
  deps: BotPidRuntimeDeps = {},
): StopBotResult {
  const inspection = inspectBotPid(root, deps);
  if (inspection.status === 'not-running') return { status: 'not-running' };
  let pid: number;
  if (inspection.status === 'ownership-unknown') {
    // Start-token equality on the legacy schema is ownership proof for the
    // stop path (HIGH-5): a pre-upgrade daemon must stay CLI-stoppable.
    if (inspection.reason !== 'token-proven-legacy-schema'
      || inspection.pid === null) return inspection;
    pid = inspection.pid;
  } else {
    pid = inspection.pid;
  }
  try {
    (deps.kill ?? process.kill)(pid, 'SIGTERM');
  } catch {
    return { status: 'not-running' };
  }
  return { status: 'stopped', pid };
}

export type StartBotResult =
  | { readonly status: 'already-running'; readonly pid: number }
  | { readonly status: 'started'; readonly pid: number }
  | { readonly status: 'spawn-failed' }
  | {
      readonly status: 'ownership-unknown';
      readonly pid: number | null;
      readonly reason: string;
    };

export interface StartBotDaemonOptions extends BotPidRuntimeDeps {
  /** Inject the detached spawn for tests; returns the child pid or null. */
  readonly spawnFn?: (root: string) => number | null;
  /** Readiness authority seam. Production polls the ownership-bound pid record. */
  readonly readinessInspect?: (root: string) => BotPidInspection;
  /** Hermetic wait seam; production uses a bounded non-busy blocking wait. */
  readonly readinessWait?: (milliseconds: number) => void;
  readonly readinessMaxAttempts?: number;
}

function waitForBotReadiness(
  root: string,
  pid: number,
  opts: StartBotDaemonOptions,
): StartBotResult {
  const inspect = opts.readinessInspect ?? ((candidateRoot: string) =>
    inspectBotPid(candidateRoot, opts));
  const isAlive = opts.isAlive ?? isPidAlive;
  const wait = opts.readinessWait ?? ((milliseconds: number) => {
    Atomics.wait(BOT_READY_WAITER, 0, 0, milliseconds);
  });
  const attempts = opts.readinessMaxAttempts ?? BOT_READY_MAX_ATTEMPTS;
  if (!Number.isSafeInteger(attempts) || attempts <= 0 || attempts > 10_000) {
    return { status: 'spawn-failed' };
  }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const inspection = inspect(root);
    if (inspection.status === 'running') {
      return inspection.pid === pid
        ? { status: 'started', pid }
        : {
            status: 'ownership-unknown',
            pid: inspection.pid,
            reason: 'concurrent-owner',
          };
    }
    if (inspection.status === 'ownership-unknown') return inspection;
    if (!isAlive(pid)) return { status: 'spawn-failed' };
    if (attempt + 1 < attempts) wait(BOT_READY_POLL_INTERVAL_MS);
  }
  return {
    status: 'ownership-unknown',
    pid,
    reason: 'readiness-timeout',
  };
}

/** Start the listener only when prior ownership is absent, never ambiguous. */
export function startBotDaemon(
  root: string,
  opts: StartBotDaemonOptions = {},
): StartBotResult {
  const existing = inspectBotPid(root, opts);
  if (existing.status === 'running') {
    return { status: 'already-running', pid: existing.pid };
  }
  if (existing.status === 'ownership-unknown') return existing;

  const spawnFn = opts.spawnFn ?? defaultDetachedSpawn;
  const pid = spawnFn(root);
  if (pid == null) return { status: 'spawn-failed' };
  // A child PID is only process-birth evidence. Do not report "started" until
  // the listener itself publishes the ownership-bound pid record that
  // `status` and `stop` consume. This closes start→immediate-status races.
  return waitForBotReadiness(root, pid, opts);
}

/** Resolve dist/cli/entry.js relative to this compiled module. */
function entryPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'cli', 'entry.js');
}

/** Spawn `node dist/cli/entry.js bot listen` detached; subscription auth. */
function defaultDetachedSpawn(root: string): number | null {
  try {
    const env = { ...process.env };
    delete env['ANTHROPIC_API_KEY'];
    const child = spawn(process.execPath, [entryPath(), 'bot', 'listen'], {
      detached: true,
      stdio: 'ignore',
      cwd: root,
      env,
    });
    child.unref();
    return child.pid ?? null;
  } catch {
    return null;
  }
}

// ═══ durable owner-notification outbox drain (671-004) ═══════════════
//
// The outbox is append-only and only the bot may acknowledge a record, so an
// undrained outbox strands owner notifications indefinitely (two pause records
// sat pending from 24 August because nothing ever called the drain). The daemon
// therefore schedules the drain itself, on the config-resolved cadence.
//
// Honesty rules encoded here:
//   • the cadence is READ from `notify_outbox_drain_interval_ms` on the resolved
//     config — an unresolvable cadence schedules NOTHING rather than inventing a
//     literal fallback;
//   • a disabled bot / unconfigured connector is a typed SKIP (debug log, no
//     send attempt, no error, no partial delivery);
//   • the receipt is written by `deliverPendingOwnerNotifications` only after the
//     transport resolved, so a failed tick leaves the record pending for the next
//     tick — no bespoke retry state machine lives here;
//   • `stop()` clears the timer (and closes any transport this loop built) so no
//     drain timer survives daemon shutdown.
//
// Operator-facing text: none. Every line below is an operator-only diagnostic on
// the `debugLog` seam, deliberately NOT a `getMessage` catalogue entry.

/** Diagnostic label for every drain-loop debug line. */
const OWNER_NOTIFICATION_DRAIN_LOG = 'bot-daemon:notify-outbox-drain';

export type OwnerNotificationDrainSkipReason =
  | 'config-unavailable'
  | 'bot-disabled'
  | 'connector-unconfigured'
  | 'transport-unavailable';

export type OwnerNotificationDrainTick =
  | {
      readonly status: 'drained';
      readonly delivered: number;
      readonly pending: number;
    }
  | {
      readonly status: 'skipped';
      readonly reason: OwnerNotificationDrainSkipReason;
    }
  | { readonly status: 'failed'; readonly reason: string };

/** A transport that may own resources the drain loop must release on stop. */
interface ClosableOwnerNotificationTransport extends OwnerNotificationTransport {
  close?(): Promise<void>;
}

export interface OwnerNotificationDrainDeps {
  /** Resolved-config seam; production reads the cached layered config. */
  readonly readConfig?: (root: string) => Promise<ResolvedConfig | undefined>;
  /** Send seam; production reuses the existing telegram connector transport. */
  readonly resolveTransport?: (
    config: ResolvedConfig,
  ) => Promise<OwnerNotificationTransport | null>;
  /** Delivery seam; production is the durable outbox drain itself. */
  readonly deliver?: (
    root: string,
    transport: OwnerNotificationTransport,
    options?: DeliveryOptions,
  ) => Promise<DeliveryResult>;
  readonly deliveryOptions?: DeliveryOptions;
  /** Diagnostic seam; production is `debugLog`. */
  readonly log?: (event: string, detail: unknown) => void;
}

export interface OwnerNotificationDrainHandle {
  /** Cadence read from the resolved config; null when it could not be read. */
  readonly intervalMs: number | null;
  /** Run exactly one drain tick. Never throws. */
  tick(): Promise<OwnerNotificationDrainTick>;
  isRunning(): boolean;
  /** Clear the timer and release any transport this loop built. */
  stop(): Promise<void>;
}

/** Read the cadence from the resolved config field; never substitute a literal. */
function resolveDrainIntervalMs(config: ResolvedConfig | undefined): number | null {
  const authored = config?.notify_outbox_drain_interval_ms;
  return typeof authored === 'number'
    && Number.isFinite(authored)
    && authored > 0
    ? Math.floor(authored)
    : null;
}

type TelegramNotifyTarget = NonNullable<
  NonNullable<ResolvedConfig['notify_connectors']>['telegram']
>;

/**
 * Classify the configured outbound target BEFORE any transport is built, so a
 * disabled bot or an unconfigured connector never reaches a send attempt.
 */
function classifyDrainTarget(
  config: ResolvedConfig,
):
  | { readonly ok: true; readonly telegram: TelegramNotifyTarget }
  | { readonly ok: false; readonly reason: OwnerNotificationDrainSkipReason } {
  const telegram = config.notify_connectors?.telegram;
  if (!telegram) return { ok: false, reason: 'connector-unconfigured' };
  if (telegram.enabled !== true) return { ok: false, reason: 'bot-disabled' };
  if (!telegram.token
    || telegram.token.startsWith('$DECK:')
    || !telegram.chat_id) {
    return { ok: false, reason: 'connector-unconfigured' };
  }
  return { ok: true, telegram };
}

/** Read the already-resolved config; fall back to the layered async loader. */
async function defaultReadConfig(root: string): Promise<ResolvedConfig | undefined> {
  const mod = await import('../core/config.js');
  return mod.getLoadedConfig(root) ?? await mod.loadConfig(root);
}

/**
 * Reuse the EXISTING telegram send seam (`buildConnectorTargets` ->
 * `IMessageConnector.sendMessage`). No new client is constructed here: the
 * adapter is a thin closure over the connector the bootstrap already builds.
 */
async function defaultResolveTransport(
  config: ResolvedConfig,
): Promise<ClosableOwnerNotificationTransport | null> {
  const gate = classifyDrainTarget(config);
  if (!gate.ok) return null;
  const { buildConnectorTargets } = await import('./connector-bootstrap.js');
  const targets = await buildConnectorTargets({ telegram: gate.telegram });
  const target = targets.find((candidate) => candidate.connector.id === 'telegram');
  if (!target) {
    await Promise.allSettled(targets.map((candidate) => candidate.connector.stop()));
    return null;
  }
  return {
    async sendMessage(message: string, idempotencyKey: string): Promise<void> {
      // Failures PROPAGATE: notification-delivery owns retry/ack semantics.
      await target.connector.sendMessage({
        connector: target.connector.id,
        channelId: target.chatId,
        text: message,
      });
      debugLog(OWNER_NOTIFICATION_DRAIN_LOG, {
        event: 'sent',
        notificationId: idempotencyKey,
      });
    },
    async close(): Promise<void> {
      await target.connector.stop();
    },
  };
}

/**
 * Schedule the durable owner-notification outbox drain on the config-resolved
 * cadence. The returned handle owns the timer; `stop()` is how the daemon's
 * shutdown path guarantees no drain timer is left running.
 */
export async function startOwnerNotificationDrain(
  root: string,
  deps: OwnerNotificationDrainDeps = {},
): Promise<OwnerNotificationDrainHandle> {
  const readConfig = deps.readConfig ?? defaultReadConfig;
  const resolveTransport = deps.resolveTransport ?? defaultResolveTransport;
  const deliver = deps.deliver ?? deliverPendingOwnerNotifications;
  const log = deps.log ?? debugLog;

  let transport: ClosableOwnerNotificationTransport | null = null;
  let inFlight: Promise<OwnerNotificationDrainTick> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const skip = (
    reason: OwnerNotificationDrainSkipReason,
  ): OwnerNotificationDrainTick => {
    log(OWNER_NOTIFICATION_DRAIN_LOG, { event: 'skipped', reason });
    return { status: 'skipped', reason };
  };

  const runTick = async (): Promise<OwnerNotificationDrainTick> => {
    let config: ResolvedConfig | undefined;
    try {
      config = await readConfig(root);
    } catch (error: unknown) {
      config = undefined;
      log(OWNER_NOTIFICATION_DRAIN_LOG, { event: 'config-read-failed', error });
    }
    if (!config) return skip('config-unavailable');

    const gate = classifyDrainTarget(config);
    if (!gate.ok) return skip(gate.reason);

    if (transport === null) {
      try {
        transport = await resolveTransport(config);
      } catch (error: unknown) {
        transport = null;
        log(OWNER_NOTIFICATION_DRAIN_LOG, {
          event: 'transport-resolve-failed',
          error,
        });
      }
    }
    if (transport === null) return skip('transport-unavailable');

    try {
      const result = await deliver(root, transport, deps.deliveryOptions);
      log(OWNER_NOTIFICATION_DRAIN_LOG, {
        event: 'drained',
        delivered: result.delivered,
        pending: result.pending,
      });
      return {
        status: 'drained',
        delivered: result.delivered,
        pending: result.pending,
      };
    } catch (error: unknown) {
      // Unacknowledged records simply stay pending for the next tick.
      const reason = error instanceof Error ? error.message : String(error);
      log(OWNER_NOTIFICATION_DRAIN_LOG, { event: 'drain-failed', reason });
      return { status: 'failed', reason };
    }
  };

  /** Ticks never overlap: a slow drain must not stack sends on the outbox. */
  const tick = (): Promise<OwnerNotificationDrainTick> => {
    inFlight ??= runTick().finally(() => { inFlight = null; });
    return inFlight;
  };

  let bootConfig: ResolvedConfig | undefined;
  try {
    bootConfig = await readConfig(root);
  } catch (error: unknown) {
    bootConfig = undefined;
    log(OWNER_NOTIFICATION_DRAIN_LOG, { event: 'config-read-failed', error });
  }
  const intervalMs = resolveDrainIntervalMs(bootConfig);
  if (intervalMs === null) {
    log(OWNER_NOTIFICATION_DRAIN_LOG, { event: 'interval-unresolved' });
  } else {
    timer = setInterval(() => { void tick(); }, intervalMs);
    // Never hold the process open on the drain cadence alone.
    (timer as { unref?: () => void }).unref?.();
    log(OWNER_NOTIFICATION_DRAIN_LOG, { event: 'scheduled', intervalMs });
  }

  return {
    intervalMs,
    tick,
    isRunning: (): boolean => timer !== null,
    async stop(): Promise<void> {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      const pending = inFlight;
      if (pending) await pending.catch(() => undefined);
      const owned = transport;
      transport = null;
      if (owned?.close) {
        try {
          await owned.close();
        } catch (error: unknown) {
          log(OWNER_NOTIFICATION_DRAIN_LOG, {
            event: 'transport-close-failed',
            error,
          });
        }
      }
      log(OWNER_NOTIFICATION_DRAIN_LOG, { event: 'stopped' });
    },
  };
}
