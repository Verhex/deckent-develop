// ─── Model Auto-Detect (F1-AD first-slice) ───────────────────────────────────
// Runtime-probe each connected provider CLI → discover accessible model-ids →
// reconcile with catalog and bundled fallback → register in ModelRegistry.
//
// Priority: CLI > models.dev catalog > bundled BUILTIN_MODELS (F1-PD parametric).
// New models (e.g. 'claude-mythos-5') are accepted without code changes via the
// parametric resolver already in ModelRegistry.resolve().
//
// Cache: ~/.deckent/cache/model-auto-detect-{provider}-{authMode}.json (1h TTL)
// Spawn: async child_process.spawn, injected for tests (no spawnSync, ADR-087).

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { BUILTIN_MODELS } from './model-registry.js';
import type { ModelRegistry, ModelDefinition, RegistryProviderName } from './model-registry.js';
import { buildParametricModel, inferProviderFromId } from './model-registry.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AutoDetectProvider = 'claude' | 'codex' | 'gemini' | 'ollama';

/** Async spawn abstraction — injected by tests for hermeticity. */
export type SpawnFn = (
  cmd: string,
  args: string[],
  timeoutMs?: number,
) => Promise<{ stdout: string; exitCode: number | null }>;

export interface ProbeOptions {
  /** Optional spawn implementation (for tests). */
  spawnFn?: SpawnFn;
  /** Timeout in ms for the CLI probe (default 5000). */
  timeoutMs?: number;
}

export interface CacheEntry {
  ts: number;
  provider: string;
  authMode: string;
  modelIds: string[];
}

export interface DetectResult {
  provider: AutoDetectProvider;
  authMode: string;
  discovered: string[];
  registered: number;
  source: 'cli' | 'cache' | 'empty';
}

export interface DetectAndRegisterOptions extends ProbeOptions {
  /** Which providers to probe (default: all four). */
  providers?: AutoDetectProvider[];
  /** Skip network / disk cache reads. */
  offline?: boolean;
  /** Override cache directory (for tests). */
  cacheDir?: string;
  /** TTL override in ms (default 3_600_000 = 1h). */
  ttlMs?: number;
  /** Now provider for deterministic tests. */
  now?: () => number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const AUTO_DETECT_CACHE_DIR = join(homedir(), '.deckent', 'cache');
export const AUTO_DETECT_TTL_MS = 3_600_000; // 1 hour

// ─── Default Spawn ───────────────────────────────────────────────────────────

/** Default async spawn implementation; wraps child_process.spawn. */
export function defaultSpawnFn(
  cmd: string,
  args: string[],
  timeoutMs = 5_000,
): Promise<{ stdout: string; exitCode: number | null }> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    let settled = false;

    const child = spawn(cmd, args, { shell: false });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({ stdout: '', exitCode: null });
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    child.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ stdout: '', exitCode: null });
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ stdout: Buffer.concat(chunks).toString('utf-8'), exitCode: code });
      }
    });
  });
}

// ─── CLI Probe Commands per Provider ─────────────────────────────────────────

const PROBE_COMMANDS: Record<AutoDetectProvider, { cmd: string; args: string[] }> = {
  claude: { cmd: 'claude', args: ['models', 'list'] },
  codex:  { cmd: 'codex',  args: ['models', 'list'] },
  gemini: { cmd: 'gemini', args: ['models', 'list'] },
  ollama: { cmd: 'ollama', args: ['list'] },
};

// ─── Output Parsers ──────────────────────────────────────────────────────────

/**
 * Extract model ids from raw CLI stdout.
 * Handles common formats:
 *   1. JSON array of strings: ["model-a", "model-b"]
 *   2. JSON { models: [{ id: "..." }, ...] }
 *   3. JSON { data: [{ id: "..." }, ...] }
 *   4. Plain text: one model-like token per non-empty line
 */
export function parseCliModelOutput(raw: string, provider: AutoDetectProvider): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Attempt JSON parse first; if the string looks like JSON but is malformed, return empty.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return extractIdsFromJson(parsed, provider);
    } catch {
      return [];
    }
  }

  // Text format — extract model-id-shaped tokens from each line.
  return parseTextModelList(trimmed, provider);
}

function extractIdsFromJson(parsed: unknown, provider: AutoDetectProvider): string[] {
  if (Array.isArray(parsed)) {
    // ["id1", "id2"]  or  [{ id: "..." }, ...]
    return parsed.flatMap(item => {
      if (typeof item === 'string') return [item];
      if (item && typeof item === 'object' && 'id' in item && typeof (item as Record<string, unknown>)['id'] === 'string') {
        return [(item as Record<string, unknown>)['id'] as string];
      }
      return [];
    });
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    // { models: [...] }  or  { data: [...] }
    const list = obj['models'] ?? obj['data'];
    if (Array.isArray(list)) {
      return extractIdsFromJson(list, provider);
    }
  }
  return [];
}

function parseTextModelList(raw: string, provider: AutoDetectProvider): string[] {
  const ids: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const token = line.trim().split(/\s+/)[0] ?? '';
    if (!token || token === 'NAME' || token === 'ID') continue; // skip header rows
    // Heuristic: looks like a model id if it contains a letter+digit pattern or a colon (ollama tags)
    if (/[a-zA-Z]/.test(token) && token.length > 1) {
      // Use the same provider inference to filter obviously wrong tokens
      const inf = inferProviderFromId(token);
      if (inf === provider || provider === 'ollama') {
        ids.push(token);
      }
    }
  }
  return ids;
}

// ─── probeProviderModels ──────────────────────────────────────────────────────

/**
 * Probe a single provider CLI and return the list of accessible model ids.
 * Returns an empty array on any error (binary not found, timeout, parse failure).
 * Never throws.
 */
export async function probeProviderModels(
  provider: AutoDetectProvider,
  opts: ProbeOptions = {},
): Promise<string[]> {
  const spawnFn = opts.spawnFn ?? defaultSpawnFn;
  const { cmd, args } = PROBE_COMMANDS[provider];

  try {
    const { stdout, exitCode } = await spawnFn(cmd, args, opts.timeoutMs);
    if (exitCode !== 0 && exitCode !== null) return [];
    return parseCliModelOutput(stdout, provider);
  } catch {
    return [];
  }
}

// ─── reconcileModels ──────────────────────────────────────────────────────────

/**
 * Merge model ids from three sources: CLI > catalog > bundled.
 *
 * CLI ids have the highest priority; catalog ids (from models.dev) are appended
 * when not already present in the CLI list; bundled ids are the final safety net.
 * Deduplication is done by exact string match (case-sensitive).
 */
export function reconcileModels(
  cliIds: string[],
  catalogIds: string[],
  builtinIds: string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of cliIds) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of catalogIds) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of builtinIds) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

// ─── Cache I/O ───────────────────────────────────────────────────────────────

function cachePath(cacheDir: string, provider: string, authMode: string): string {
  return join(cacheDir, `model-auto-detect-${provider}-${authMode}.json`);
}

async function readCacheEntry(path: string): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as CacheEntry;
    if (
      typeof parsed.ts !== 'number' ||
      !Array.isArray(parsed.modelIds)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCacheEntry(path: string, entry: CacheEntry): Promise<void> {
  try {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, JSON.stringify(entry, null, 2), 'utf-8');
  } catch {
    // cache write failure is non-fatal
  }
}

// ─── Auth Mode Inference ──────────────────────────────────────────────────────

function inferAuthMode(provider: AutoDetectProvider): string {
  switch (provider) {
    case 'claude':
      return process.env['ANTHROPIC_API_KEY'] ? 'api' : 'session';
    case 'codex':
      return process.env['OPENAI_API_KEY'] ? 'api' : 'session';
    case 'gemini':
      return process.env['GOOGLE_API_KEY'] ? 'api' : 'session';
    case 'ollama':
      return 'local';
  }
}

// ─── detectAndRegisterModels ─────────────────────────────────────────────────

/**
 * Probe all (or specified) providers, reconcile model ids, and register
 * discovered models in the given ModelRegistry using the parametric resolver.
 *
 * This is the main public API of this module. Call it once at startup to
 * populate the registry with live-available models beyond the bundled catalog.
 * Idempotent: re-registering an id that already exists is a no-op.
 *
 * New model ids (e.g. 'claude-mythos-5') are accepted without a code change
 * because ModelRegistry.resolve() builds a parametric definition via
 * inferProviderFromId + inferTierFromId (F1-PD).
 */
export async function detectAndRegisterModels(
  registry: ModelRegistry,
  opts: DetectAndRegisterOptions = {},
): Promise<DetectResult[]> {
  const providers = opts.providers ?? (['claude', 'codex', 'gemini', 'ollama'] as const);
  const cacheDir = opts.cacheDir ?? AUTO_DETECT_CACHE_DIR;
  const ttl = opts.ttlMs ?? AUTO_DETECT_TTL_MS;
  const now = opts.now ?? (() => Date.now());

  const results: DetectResult[] = [];

  for (const provider of providers) {
    const authMode = inferAuthMode(provider);
    const path = cachePath(cacheDir, provider, authMode);

    let discovered: string[] = [];
    let source: DetectResult['source'] = 'empty';

    if (!opts.offline) {
      // Check cache first
      const cached = await readCacheEntry(path);
      if (cached && now() - cached.ts < ttl) {
        discovered = cached.modelIds;
        source = 'cache';
      } else {
        // Probe CLI
        const cliIds = await probeProviderModels(provider, {
          spawnFn: opts.spawnFn,
          timeoutMs: opts.timeoutMs,
        });

        // Get catalog ids for this provider from the registry (already in registry = catalog/bundled)
        const catalogIds = registry.getAllModels()
          .filter(m => m.provider === (provider as RegistryProviderName))
          .map(m => m.id);

        // Bundled ids for this provider
        const builtinIds = BUILTIN_MODELS
          .filter(m => m.provider === (provider as RegistryProviderName))
          .map(m => m.id);

        discovered = reconcileModels(cliIds, catalogIds, builtinIds);

        if (discovered.length > 0) {
          source = cliIds.length > 0 ? 'cli' : 'cache';
          await writeCacheEntry(path, {
            ts: now(),
            provider,
            authMode,
            modelIds: discovered,
          });
        }
      }
    }

    // Register every discovered model id that isn't already in the registry.
    // ModelRegistry.resolve() handles the parametric definition (F1-PD).
    let registered = 0;
    for (const id of discovered) {
      if (!registry.has(id)) {
        const providerHint = inferProviderFromId(id);
        const def: ModelDefinition = buildParametricModel(id, {
          provider: providerHint as RegistryProviderName,
          register: false,
        });
        registry.register(def);
        registered++;
      }
    }

    results.push({ provider, authMode, discovered, registered, source });
  }

  return results;
}
