// ─── Open Health Snapshot (TERM-1, Sprint 351) ──────────────────────────────
//
// "hazır mıyım?" — a single glance at REPL bootstrap (launchDefaultRepl,
// entry.ts) before the user starts typing: which provider/model will answer,
// is that provider actually logged in, is any MCP server configured for this
// project, how full is memory, which mode is active. Every field is I/O
// fail-soft: a slow/broken probe degrades that ONE field to 'unknown' instead
// of blocking REPL boot or crashing (ADR-G-010 terminal-UX; pivot-P0 TERM).
//
// Pure module: buildHealthSnapshot() is the only I/O; renderHealthSnapshot()
// is a pure formatter. entry.ts wires both at REPL-öncesi.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, resolveChatProvider } from '../../core/config.js';
import type { ResolvedConfig } from '../../core/config-types.js';
import { modelRegistry } from '../../core/model-registry.js';
import { probeProviderAuth } from '../../core/provider-auth-probe.js';
import { loadMcpServers, type McpServersMap } from '../../mcp-client/config.js';
import { MemoryStore } from '../../core/memory-store.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { listActive, type ReplSession } from './session-registry.js';
import { theme } from './theme.js';
import { getMessage } from './messages.js';

// ─── Types ───────────────────────────────────────────────────────────────

export type HealthFieldStatus = 'ok' | 'warn' | 'unknown';

export interface HealthField {
  status: HealthFieldStatus;
  /** Raw (untranslated) value — a technical id/count, or the literal 'unknown'. */
  label: string;
  /** Optional diagnostic — never a secret, safe to print. */
  detail?: string;
}

export interface HealthSnapshot {
  provider: HealthField;
  model: HealthField;
  auth: HealthField;
  mcp: HealthField;
  memory: HealthField;
  mode: HealthField;
  /**
   * Optional (not one of the always-on fields above): 361-015 session-registry
   * wiring (363-011). Omitted by pre-existing snapshot fixtures/consumers built
   * before this field existed — buildHealthSnapshot() always populates it.
   */
  sessions?: HealthField;
  cwd: string;
  elapsedMs: number;
}

/** Injectable seams — hermetic tests supply fakes; production defaults are real I/O. */
export interface HealthSnapshotDeps {
  loadConfigFn?: (root: string) => Promise<ResolvedConfig>;
  probeAuthFn?: typeof probeProviderAuth;
  loadMcpServersFn?: (root: string) => McpServersMap;
  readMemoryCountFn?: (root: string) => number | undefined;
  /** 363-011 — active REPL session count (361-015 session-registry). Default: listActive(root). */
  listActiveSessionsFn?: (root: string) => ReplSession[];
}

// ─── Timing budget ───────────────────────────────────────────────────────
// Config load has no built-in timeout (plain fs reads) — race it. The auth
// probe already self-bounds via its own `timeoutMs` option (never throws);
// the outer race is a defensive backstop for an injected/broken probe that
// never settles. Sum of both worst-cases (450ms) stays under the <500ms
// snapshot target while leaving room for the synchronous mcp/memory reads.
const CONFIG_TIMEOUT_MS = 200;
const AUTH_PROBE_TIMEOUT_MS = 250;

const UNKNOWN_LABEL = 'unknown';

/** 4+ concurrent REPL sessions on this project share one usage limit (/usage). */
const SESSION_WARN_THRESHOLD = 4;

/** Resolves to `value`, or `undefined` if `ms` elapses first. Never rejects on timeout. */
async function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Field resolvers ─────────────────────────────────────────────────────

function resolveProviderField(config: ResolvedConfig | undefined): HealthField {
  if (!config) {
    return { status: 'unknown', label: UNKNOWN_LABEL, detail: 'config unavailable' };
  }
  return { status: 'ok', label: resolveChatProvider(config) };
}

/**
 * Live model-registry lookup — NEVER a hardcoded model id. `brain_model`
 * (the project's configured tier id, e.g. 'sonnet') is mapped to the
 * REPL's actually-resolved provider via `getEquivalent` (claude/codex/gemini)
 * or `resolve` (ollama / openai-compat presets, outside getEquivalent's
 * provider union) so the displayed model always matches who will answer.
 */
function resolveModelField(config: ResolvedConfig | undefined, providerLabel: string): HealthField {
  if (!config) {
    return { status: 'unknown', label: UNKNOWN_LABEL, detail: 'config unavailable' };
  }
  const brainModel = config.activeModeConfig?.brain_model;
  if (typeof brainModel !== 'string' || brainModel.length === 0) {
    return { status: 'unknown', label: UNKNOWN_LABEL, detail: 'no brain_model configured' };
  }
  try {
    let def;
    if (providerLabel === 'claude' || providerLabel === 'codex' || providerLabel === 'gemini') {
      const equivalentId = modelRegistry.getEquivalent(brainModel, providerLabel);
      def = modelRegistry.get(equivalentId) ?? modelRegistry.resolve(equivalentId, { register: false });
    } else {
      def = modelRegistry.resolve(brainModel, { register: false });
    }
    return { status: 'ok', label: `${def.id} (${def.apiId})` };
  } catch (err) {
    return { status: 'unknown', label: UNKNOWN_LABEL, detail: errorDetail(err) };
  }
}

async function resolveAuthField(
  probeAuthFn: typeof probeProviderAuth,
  providerField: HealthField,
): Promise<HealthField> {
  if (providerField.status !== 'ok') {
    return { status: 'unknown', label: UNKNOWN_LABEL, detail: 'provider unresolved' };
  }
  try {
    const result = await raceWithTimeout(
      probeAuthFn(providerField.label, { timeoutMs: AUTH_PROBE_TIMEOUT_MS }),
      AUTH_PROBE_TIMEOUT_MS,
    );
    if (!result) {
      return { status: 'unknown', label: UNKNOWN_LABEL, detail: 'auth probe timed out' };
    }
    const status: HealthFieldStatus =
      result.state === 'logged-in' ? 'ok' : result.state === 'logged-out' ? 'warn' : 'unknown';
    const field: HealthField = { status, label: result.state };
    if (result.detail !== undefined) field.detail = result.detail;
    return field;
  } catch (err) {
    return { status: 'unknown', label: UNKNOWN_LABEL, detail: errorDetail(err) };
  }
}

/** 0 configured servers is an honest, non-error state — NOT 'unknown'. */
function resolveMcpField(loadMcpServersFn: (root: string) => McpServersMap, root: string): HealthField {
  try {
    const count = Object.keys(loadMcpServersFn(root)).length;
    return { status: count > 0 ? 'ok' : 'warn', label: String(count) };
  } catch (err) {
    return { status: 'unknown', label: UNKNOWN_LABEL, detail: errorDetail(err) };
  }
}

/** Guards with existsSync BEFORE opening — MemoryStore creates the DB file on open,
 *  and a health check must never have the side effect of creating .brain/memory.db. */
function defaultReadMemoryCount(root: string): number | undefined {
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return undefined;
  try {
    const store = new MemoryStore(dbPath);
    try {
      return store.totalCount();
    } finally {
      store.close();
    }
  } catch {
    return undefined;
  }
}

function resolveMemoryField(
  root: string,
  config: ResolvedConfig | undefined,
  readMemoryCountFn: (root: string) => number | undefined,
): HealthField {
  try {
    const count = readMemoryCountFn(root);
    if (count === undefined) {
      return { status: 'unknown', label: UNKNOWN_LABEL, detail: 'memory.db not found' };
    }
    const budget = config?.memory_budget;
    const label = budget !== undefined ? `${count}/${budget}` : `${count}/?`;
    const status: HealthFieldStatus = budget !== undefined && count > budget ? 'warn' : 'ok';
    return { status, label };
  } catch (err) {
    return { status: 'unknown', label: UNKNOWN_LABEL, detail: errorDetail(err) };
  }
}

function resolveModeField(config: ResolvedConfig | undefined): HealthField {
  if (!config || typeof config.mode !== 'string' || config.mode.length === 0) {
    return { status: 'unknown', label: UNKNOWN_LABEL, detail: 'config unavailable' };
  }
  return { status: 'ok', label: config.mode };
}

/**
 * 363-011 — active-session count (361-015 session-registry). >= SESSION_WARN_THRESHOLD
 * is an honest 'warn' (all N sessions share one usage limit), not an error.
 */
function resolveSessionsField(
  root: string,
  listActiveSessionsFn: (root: string) => ReplSession[],
): HealthField {
  try {
    const count = listActiveSessionsFn(root).length;
    return { status: count >= SESSION_WARN_THRESHOLD ? 'warn' : 'ok', label: String(count) };
  } catch (err) {
    return { status: 'unknown', label: UNKNOWN_LABEL, detail: errorDetail(err) };
  }
}

// ─── Public: buildHealthSnapshot ────────────────────────────────────────

export async function buildHealthSnapshot(
  root: string,
  deps: HealthSnapshotDeps = {},
): Promise<HealthSnapshot> {
  const start = Date.now();
  const loadConfigFn = deps.loadConfigFn ?? loadConfig;
  const probeAuthFn = deps.probeAuthFn ?? probeProviderAuth;
  const loadMcpServersFn = deps.loadMcpServersFn ?? loadMcpServers;
  const readMemoryCountFn = deps.readMemoryCountFn ?? defaultReadMemoryCount;
  const listActiveSessionsFn = deps.listActiveSessionsFn ?? ((r: string) => listActive(r));

  let config: ResolvedConfig | undefined;
  try {
    config = await raceWithTimeout(loadConfigFn(root), CONFIG_TIMEOUT_MS);
  } catch {
    config = undefined;
  }

  const provider = resolveProviderField(config);
  const model = resolveModelField(config, provider.label);
  const mcp = resolveMcpField(loadMcpServersFn, root);
  const memory = resolveMemoryField(root, config, readMemoryCountFn);
  const mode = resolveModeField(config);
  const sessions = resolveSessionsField(root, listActiveSessionsFn);
  const auth = await resolveAuthField(probeAuthFn, provider);

  return { provider, model, auth, mcp, memory, mode, sessions, cwd: root, elapsedMs: Date.now() - start };
}

// ─── Render (i18n-first, NO_COLOR via `theme`) ──────────────────────────
//
// health.* keys live in messages.ts (Task 15 — MESSAGES-KEYS migrated the
// local en/tr fallback map that previously lived here; see 351-001).

function statusColor(status: HealthFieldStatus, text: string): string {
  if (status === 'ok') return theme.success(text);
  if (status === 'warn') return theme.warning(text);
  return theme.muted(text);
}

/** Technical labels (ids/counts) render as-is; only a genuine 'unknown' status is localized. */
function genericLabel(field: HealthField, lang: string): string {
  return field.status === 'unknown' ? getMessage('health.unknown', lang) : field.label;
}

function authLabelText(field: HealthField, lang: string): string {
  if (field.label === 'logged-in') return getMessage('health.logged_in', lang);
  if (field.label === 'logged-out') return getMessage('health.logged_out', lang);
  return getMessage('health.unknown', lang);
}

/**
 * Injectable seam for the 363-011 session-warn line only — every other message
 * lookup in this render stays a direct getMessage() call (existing pattern).
 * Needed because the 'health.session_warn' key's messages.ts entry is a
 * companion edit outside this task's write scope (see .result docImpact); this
 * DI lets the wiring + en/tr/interpolation behavior be proven hermetically
 * now, and picks up the real localized text with zero further code changes
 * once messages.ts adds the key.
 */
export interface RenderHealthSnapshotDeps {
  getMessageFn?: typeof getMessage;
}

/** Compact single-line render — "tek-bakış" (ADR-G-010: terminal stays concise).
 *  Gains a second, warning-only line when 4+ parallel sessions are active. */
export function renderHealthSnapshot(
  snapshot: HealthSnapshot,
  lang: string,
  deps: RenderHealthSnapshotDeps = {},
): string {
  const getMessageFn = deps.getMessageFn ?? getMessage;
  const providerText = genericLabel(snapshot.provider, lang);
  const modelText = genericLabel(snapshot.model, lang);
  // Model rides on top of provider: show `provider/unknown` when only the model
  // failed to resolve (still informative), but collapse to just `provider` when
  // the provider itself is unknown (a model without a provider is meaningless).
  const providerModel = snapshot.provider.status === 'unknown' ? providerText : `${providerText}/${modelText}`;

  const segments = [
    statusColor(snapshot.provider.status, providerModel),
    `${getMessage('health.auth', lang)}: ${statusColor(snapshot.auth.status, authLabelText(snapshot.auth, lang))}`,
    `${getMessage('health.mcp', lang)}: ${statusColor(snapshot.mcp.status, genericLabel(snapshot.mcp, lang))}`,
    `${getMessage('health.mem', lang)}: ${statusColor(snapshot.memory.status, genericLabel(snapshot.memory, lang))}`,
    `${getMessage('health.mode', lang)}: ${statusColor(snapshot.mode.status, genericLabel(snapshot.mode, lang))}`,
  ];

  const line = `${segments.join(' · ')}  ${theme.muted(snapshot.cwd)}`;
  if (snapshot.sessions?.status !== 'warn') return line;

  const warning = getMessageFn('health.session_warn', lang, { count: snapshot.sessions.label });
  return `${line}\n${statusColor('warn', warning)}`;
}
