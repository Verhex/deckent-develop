// Structured, read-only CLI selections admitted for same-session capture.
// This module only validates and resolves argv; process execution and storage
// stay in chat-tool-bridge and the session content store respectively.

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { signalProcessGroup, SIGKILL_ESCALATION_MS } from '../../core/process-tree-termination.js';
import type { SessionToolContentStore, ToolCaptureReceipt } from '../../agent/session-tool-content.js';

export type CliReadRequest =
  | { readonly kind: 'doctor' }
  | { readonly kind: 'history'; readonly last?: number; readonly agent?: string; readonly skill?: string }
  | { readonly kind: 'models'; readonly provider?: string }
  | { readonly kind: 'model-active-set' }
  | { readonly kind: 'agents' }
  | { readonly kind: 'skills'; readonly category?: string };

type UnknownArgs = Readonly<Record<string, unknown>>;

function hasOnlyKeys(args: UnknownArgs, allowed: readonly string[]): boolean {
  const keys = Object.keys(args);
  return keys.every((key) => allowed.includes(key));
}

function validRoot(value: unknown): boolean {
  return value === undefined || value === '.';
}

function nonEmpty(value: unknown): string | null {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim()) return null;
  return value;
}

function parseRest(value: unknown, aliases: readonly string[], flags: Readonly<Record<string, boolean>>): { alias: string; values: Record<string, string> } | null {
  if (value === undefined) return { alias: '', values: {} };
  if (!Array.isArray(value) || value.some((part) => typeof part !== 'string')) return null;
  const tokens = value as string[];
  let cursor = 0;
  let alias = '';
  if (tokens[0] && !tokens[0].startsWith('--')) {
    if (!aliases.includes(tokens[0])) return null;
    alias = tokens[0];
    cursor = 1;
  }
  const values: Record<string, string> = {};
  while (cursor < tokens.length) {
    const flag = tokens[cursor++];
    if (flag === undefined) return null;
    if (!(flag in flags) || Object.hasOwn(values, flag)) return null;
    if (flags[flag]) {
      const argument = tokens[cursor++];
      if (!argument || argument.startsWith('--')) return null;
      values[flag] = argument;
    } else {
      values[flag] = 'true';
    }
  }
  return { alias, values };
}

function chooseFilter(structured: unknown, parsed: string | undefined): string | null {
  if (structured !== undefined && parsed !== undefined) return null;
  return nonEmpty(structured ?? parsed);
}

/** Revalidate a public typed request and build the only argv allowed to execute. */
export function cliArgsForReadRequest(value: unknown): string[] | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const request = value as UnknownArgs;
  switch (request['kind']) {
    case 'doctor':
      return hasOnlyKeys(request, ['kind']) ? ['doctor', '--json'] : null;
    case 'history': {
      if (!hasOnlyKeys(request, ['kind', 'last', 'agent', 'skill'])) return null;
      const last = positiveInteger(request['last']);
      const agent = nonEmpty(request['agent']);
      const skill = nonEmpty(request['skill']);
      if (last === null || agent === null || skill === null) return null;
      const argv = ['history', '--json'];
      if (last) argv.push('--last', last);
      if (agent) argv.push('--agent', agent);
      if (skill) argv.push('--skill', skill);
      return argv;
    }
    case 'models': {
      if (!hasOnlyKeys(request, ['kind', 'provider'])) return null;
      const provider = nonEmpty(request['provider']);
      if (provider === null) return null;
      return ['models', 'list', '--offline', '--json', ...(provider ? ['--provider', provider] : [])];
    }
    case 'model-active-set':
      return hasOnlyKeys(request, ['kind']) ? ['models', 'active-set', '--offline', '--json'] : null;
    case 'agents':
      return hasOnlyKeys(request, ['kind']) ? ['agent', 'list', '--json'] : null;
    case 'skills': {
      if (!hasOnlyKeys(request, ['kind', 'category'])) return null;
      const category = nonEmpty(request['category']);
      if (category === null) return null;
      return ['skill', 'list', '--json', ...(category ? ['--category', category] : [])];
    }
    default: return null;
  }
}

function positiveInteger(value: unknown): string | null {
  if (value === undefined) return '';
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : null;
}

/** Resolve exactly one admitted structured read. Invalid input performs no I/O. */
export function resolveCliReadRequest(toolName: string, args: UnknownArgs): CliReadRequest | null {
  if (toolName === 'deckent_doctor') {
    if (!hasOnlyKeys(args, ['root', '_rest']) || !validRoot(args['root'])) return null;
    const rest = parseRest(args['_rest'], [], { '--json': false });
    return rest ? { kind: 'doctor' } : null;
  }

  if (toolName === 'deckent_history') {
    if (!hasOnlyKeys(args, ['root', '_rest', 'last', 'agent', 'skill']) || !validRoot(args['root'])) return null;
    const rest = parseRest(args['_rest'], [], { '--json': false, '--last': true, '--agent': true, '--skill': true });
    if (!rest) return null;
    const last = positiveInteger(args['last'] ?? rest.values['--last']);
    if (args['last'] !== undefined && rest.values['--last'] !== undefined) return null;
    const agent = chooseFilter(args['agent'], rest.values['--agent']);
    const skill = chooseFilter(args['skill'], rest.values['--skill']);
    if (last === null || agent === null || skill === null) return null;
    return { kind: 'history', ...(last ? { last: Number(last) } : {}), ...(agent ? { agent } : {}), ...(skill ? { skill } : {}) };
  }

  if (toolName === 'deckent_models') {
    if (!hasOnlyKeys(args, ['_rest', 'provider'])) return null;
    const rest = parseRest(args['_rest'], ['list', 'active-set'], { '--json': false, '--offline': false, '--provider': true });
    if (!rest) return null;
    if (rest.alias === 'active-set') {
      if (rest.values['--provider'] !== undefined) return null;
      if (args['provider'] !== undefined) return null;
      return { kind: 'model-active-set' };
    }
    const provider = chooseFilter(args['provider'], rest.values['--provider']);
    if (provider === null) return null;
    return { kind: 'models', ...(provider ? { provider } : {}) };
  }

  if (toolName === 'deckent_agent_list') {
    if (!hasOnlyKeys(args, ['_rest']) || !parseRest(args['_rest'], ['list'], { '--json': false })) return null;
    return { kind: 'agents' };
  }

  if (toolName === 'deckent_skill_list') {
    if (!hasOnlyKeys(args, ['_rest', 'category'])) return null;
    const rest = parseRest(args['_rest'], ['list'], { '--json': false, '--category': true });
    if (!rest) return null;
    const category = chooseFilter(args['category'], rest.values['--category']);
    if (category === null) return null;
    return { kind: 'skills', ...(category ? { category } : {}) };
  }

  return null;
}

export type CliCaptureFailureReason = 'timeout' | 'spawn-error' | 'capture-admission' | 'REAP_UNVERIFIED';

export interface CliCapturedOutcome {
  readonly stdout: ToolCaptureReceipt;
  readonly stderr: ToolCaptureReceipt;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly reason?: CliCaptureFailureReason;
  readonly pid: number | null;
  readonly spawnError?: Error;
}

export interface CaptureCliToolOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly store: SessionToolContentStore;
  readonly timeoutMs: number;
  readonly previewBytes: number;
  readonly maxStoredBytes?: number;
  readonly reapObservationMs?: number;
  readonly platform?: NodeJS.Platform;
  readonly spawnProcess?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
}

function unavailableCaptureReceipt(): ToolCaptureReceipt {
  return {
    legacyContentRef: null,
    detailRef: null,
    observedSha256: createHash('sha256').update(Buffer.alloc(0)).digest('hex'),
    observedBytes: 0,
    storedSha256: null,
    storedBytes: 0,
    preview: '',
    protocolTail: '',
    protocolFailure: null,
    complete: false,
    reasonCode: 'CONTENT_STORE_FAILED',
  };
}

/** Drain both child streams into bounded session capture and settle only on close. */
export function captureCliTool(options: CaptureCliToolOptions): Promise<CliCapturedOutcome> {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) throw new Error('invalid capture timeout');
  if (!Number.isSafeInteger(options.previewBytes) || options.previewBytes < 1) throw new Error('invalid preview limit');
  const platform = options.platform ?? process.platform;
  let stdout: ReturnType<SessionToolContentStore['beginCapture']>;
  try {
    stdout = options.store.beginCapture({ channel: 'stdout', maxStoredBytes: options.maxStoredBytes, previewBytes: options.previewBytes });
  } catch {
    return Promise.resolve({
      stdout: unavailableCaptureReceipt(), stderr: unavailableCaptureReceipt(),
      exitCode: null, signal: null, reason: 'capture-admission', pid: null,
    });
  }
  let stderr: ReturnType<SessionToolContentStore['beginCapture']>;
  try {
    stderr = options.store.beginCapture({ channel: 'stderr', maxStoredBytes: options.maxStoredBytes, previewBytes: options.previewBytes });
  } catch (error) {
    return Promise.resolve({
      stdout: stdout.abort(), stderr: unavailableCaptureReceipt(),
      exitCode: null, signal: null, reason: 'capture-admission', pid: null,
    });
  }

  return new Promise((resolve) => {
    let child: ChildProcess | undefined;
    let settled = false;
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let reason: CliCaptureFailureReason | undefined;
    let spawnError: Error | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    let reapDeadline: ReturnType<typeof setTimeout> | undefined;

    const finish = (override?: CliCaptureFailureReason): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      if (reapDeadline) clearTimeout(reapDeadline);
      if (override === 'REAP_UNVERIFIED' && child) {
        child.stdout?.removeAllListeners('data');
        child.stderr?.removeAllListeners('data');
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref();
      }
      resolve({
        stdout: override === 'REAP_UNVERIFIED' ? stdout.abort() : stdout.finish(),
        stderr: override === 'REAP_UNVERIFIED' ? stderr.abort() : stderr.finish(),
        exitCode,
        signal: exitSignal,
        reason: override ?? reason,
        pid: typeof child?.pid === 'number' ? child.pid : null,
        ...(spawnError ? { spawnError } : {}),
      });
    };

    try {
      child = (options.spawnProcess ?? spawn)(options.command, options.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: options.env,
        detached: platform !== 'win32',
        windowsHide: true,
      });
    } catch (error) {
      reason = 'spawn-error';
      spawnError = error instanceof Error ? error : new Error(String(error));
      finish(reason);
      return;
    }

    child.stdout?.on('data', (chunk: Buffer | string) => stdout.append(Buffer.from(chunk)));
    child.stderr?.on('data', (chunk: Buffer | string) => stderr.append(Buffer.from(chunk)));
    child.once('exit', (code, signal) => {
      exitCode = typeof code === 'number' ? code : null;
      exitSignal = signal ?? null;
    });
    child.once('error', (error) => {
      if (settled) return;
      reason ??= 'spawn-error';
      spawnError ??= error;
      reapDeadline ??= setTimeout(() => finish('REAP_UNVERIFIED'), options.reapObservationMs ?? 2_000);
      reapDeadline.unref?.();
    });
    child.once('close', (code, signal) => {
      exitCode = typeof code === 'number' ? code : exitCode;
      exitSignal = signal ?? exitSignal;
      finish();
    });

    timeout = setTimeout(() => {
      if (settled) return;
      reason = 'timeout';
      signalProcessGroup(child!, 'SIGTERM', platform);
      forceKill = setTimeout(() => signalProcessGroup(child!, 'SIGKILL', platform), SIGKILL_ESCALATION_MS);
      forceKill.unref?.();
      const observation = options.reapObservationMs ?? 2_000;
      reapDeadline = setTimeout(() => finish('REAP_UNVERIFIED'), SIGKILL_ESCALATION_MS + observation);
      reapDeadline.unref?.();
    }, options.timeoutMs);
    timeout.unref?.();
  });
}

const MEMORY_PROTOCOL_TAIL_BYTES = 4 * 1024;

/** In-memory preview-only store for legacy standalone callers; it never spills. */
export function createMemoryPreviewContentStore(maxPreviewBytes = 64 * 1024): SessionToolContentStore {
  if (!Number.isSafeInteger(maxPreviewBytes) || maxPreviewBytes < 1 || maxPreviewBytes > 64 * 1024) {
    throw new Error('invalid memory preview limit');
  }
  let closed = false;
  return {
    write() { throw new Error('preview-only content store'); },
    beginCapture({ previewBytes }) {
      if (closed) throw new Error('content store closed');
      const limit = Math.min(maxPreviewBytes, previewBytes);
      const hash = createHash('sha256');
      let preview = Buffer.alloc(0);
      let tail = Buffer.alloc(0);
      let observedBytes = 0;
      let settled = false;
      const settle = (aborted: boolean): ToolCaptureReceipt => {
        if (settled) throw new Error('capture already settled');
        settled = true;
        const incomplete = aborted || observedBytes > preview.length;
        return {
          legacyContentRef: null,
          detailRef: null,
          observedSha256: hash.digest('hex'),
          observedBytes,
          storedSha256: null,
          storedBytes: 0,
          preview: utf8Prefix(preview),
          protocolTail: utf8Prefix(tail),
          protocolFailure: null,
          complete: !incomplete,
          reasonCode: incomplete ? (aborted ? 'CONTENT_STORE_FAILED' : 'CAPTURE_LIMIT_EXCEEDED') : null,
        };
      };
      return {
        append(chunk) {
          if (settled) return;
          const bytes = Buffer.from(chunk);
          hash.update(bytes);
          observedBytes += bytes.length;
          if (preview.length < limit) preview = Buffer.concat([preview, bytes.subarray(0, limit - preview.length)]);
          tail = bytes.length >= MEMORY_PROTOCOL_TAIL_BYTES
            ? bytes.subarray(bytes.length - MEMORY_PROTOCOL_TAIL_BYTES)
            : Buffer.concat([tail.subarray(Math.max(0, tail.length + bytes.length - MEMORY_PROTOCOL_TAIL_BYTES)), bytes]);
        },
        finish: () => settle(false),
        abort: () => settle(true),
      };
    },
    async readDetailRange() { return { kind: 'hold', reasonCode: 'CONTENT_READ_UNSUPPORTED' }; },
    close() { closed = true; },
  };
}

function utf8Prefix(bytes: Buffer): string {
  for (let trim = 0; trim <= 3 && trim <= bytes.length; trim += 1) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytes.length - trim)); } catch { /* trim incomplete suffix */ }
  }
  return '';
}
