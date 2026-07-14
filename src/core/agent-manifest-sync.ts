// ─── Builtin Agent Manifest Sync (446-019, agent-prompt-sync.ts's agent.json counterpart) ──
//
// Propagates `src/core/builtins/agents/<id>/agent.json` into its
// `.deckent/agents/<id>/agent.json` shadow with three-way protection:
//   (a) shadow byte-equal to the last-synced builtin content -> safe update
//   (b) shadow locally edited (differs from both)             -> keep local + conflict
//   (c) shadow missing                                        -> create
//
// Mirrors agent-prompt-sync.ts's contract exactly (see that module's header for the
// full rationale on why a dedicated state file lives here rather than being reused
// from orchestra/managed-docs/doc-cache.ts or cli/commands/init-steps.ts's seeder).
// This module owns its own state file at `.deckent/agents/.manifest-sync-state.json`,
// written ONLY here, so the two sync mechanisms (PROMPT.md, agent.json) never share
// or race on the same baseline record.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { DECKENT_DIR, PROJECT_CONFIG_PATH } from './constants.js';

const AGENTS_DIR = path.join(DECKENT_DIR, 'agents');
const MANIFEST_JSON_FILENAME = 'agent.json';
const STATE_RELATIVE_PATH = path.join(AGENTS_DIR, '.manifest-sync-state.json');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentManifestSyncConflict {
  agentId: string;
  shadowPath: string;
  builtinPath: string;
  reason: string;
}

export interface AgentManifestSyncReport {
  /** Shadow agent.json files newly created from the builtin. */
  created: string[];
  /** Shadow agent.json files safely overwritten with new builtin content. */
  updated: string[];
  /** Shadow agent.json files left untouched because they were locally edited. */
  keptLocal: string[];
  /** One typed notice per keptLocal entry, explaining why it was skipped. */
  conflicts: AgentManifestSyncConflict[];
}

export interface AgentManifestSyncOptions {
  /** When true, compute the report but never write to disk. */
  dryRun?: boolean;
}

interface ManifestSyncStateEntry {
  /** sha1 of the builtin agent.json content at the moment it was last synced into the shadow. */
  builtinHash: string;
  syncedAt: string;
}

interface ManifestSyncStateFile {
  _meta?: { generatedBy: string; schemaVersion: number };
  agents: Record<string, ManifestSyncStateEntry>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyReport(): AgentManifestSyncReport {
  return { created: [], updated: [], keptLocal: [], conflicts: [] };
}

/**
 * Resolve the builtin agents directory relative to THIS module's own file
 * location (src/core/agent-manifest-sync.ts or dist/core/agent-manifest-sync.js —
 * builtins/ is a direct sibling either way). Mirrors agent-prompt-sync.ts's
 * resolveBuiltinAgentsDir (file-local duplication is the established pattern
 * for this pool-manager family — see agent-pool.ts's own comments).
 */
function resolveBuiltinAgentsDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(moduleDir, 'builtins', 'agents');
}

function hashContent(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function readFileIfExists(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Read-and-parse the state file, defensively (missing/corrupt -> empty state,
 * never throws). Deliberately self-contained rather than reusing utils.ts's
 * readJsonSafe, mirroring agent-prompt-sync.ts's readState for the same reason
 * (immunity from narrow '../core/utils.js' mocks in unrelated test suites).
 */
function readState(projectRoot: string): ManifestSyncStateFile {
  const fullPath = path.join(projectRoot, STATE_RELATIVE_PATH);
  let raw: Partial<ManifestSyncStateFile> | null = null;
  try {
    raw = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as Partial<ManifestSyncStateFile>;
  } catch {
    raw = null;
  }
  const agents = raw?.agents && typeof raw.agents === 'object' && !Array.isArray(raw.agents)
    ? raw.agents
    : {};
  return { agents: agents as Record<string, ManifestSyncStateEntry> };
}

/**
 * Atomic tmp+rename write (mirrors agent-prompt-sync.ts's writeState) — a crash
 * mid-write never leaves a torn state file.
 */
function writeState(projectRoot: string, agents: Record<string, ManifestSyncStateEntry>): void {
  const fullPath = path.join(projectRoot, STATE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const withMeta: ManifestSyncStateFile = {
    _meta: { generatedBy: 'agent-manifest-sync.ts', schemaVersion: 1 },
    agents,
  };
  const tmpPath = `${fullPath}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(withMeta, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmpPath, fullPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup — the rename error below is what the caller needs.
    }
    throw err;
  }
}

// ─── Sync ────────────────────────────────────────────────────────────────────

/**
 * Sync every builtin agent's agent.json into its `.deckent/agents/<id>/` shadow.
 *
 * Gated on `.deckent/config.json` existing (mirrors agent-prompt-sync.ts's gate)
 * — `projectRoot` must be an actual initialized deckent project, not merely a
 * directory that happens to contain a `.deckent/agents/<id>/` subdirectory.
 *
 * Never throws: every readdir/read/write is defensively guarded so a single
 * unreadable builtin or shadow entry cannot abort the whole sweep.
 */
export function syncBuiltinAgentManifests(
  projectRoot: string,
  opts: AgentManifestSyncOptions = {},
): AgentManifestSyncReport {
  const report = emptyReport();

  if (!fs.existsSync(path.join(projectRoot, PROJECT_CONFIG_PATH))) return report;

  const builtinDir = resolveBuiltinAgentsDir();
  if (!fs.existsSync(builtinDir)) return report;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(builtinDir, { withFileTypes: true });
  } catch {
    return report;
  }
  if (!Array.isArray(entries)) return report;

  const state = readState(projectRoot);
  const nextAgentsState: Record<string, ManifestSyncStateEntry> = { ...state.agents };
  let stateChanged = false;
  const syncedAt = new Date().toISOString();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const agentId = entry.name;

    const builtinManifestPath = path.join(builtinDir, agentId, MANIFEST_JSON_FILENAME);
    const builtinContent = readFileIfExists(builtinManifestPath);
    if (builtinContent === undefined || builtinContent.trim().length === 0) continue;

    const builtinHash = hashContent(builtinContent);
    const shadowDir = path.join(projectRoot, AGENTS_DIR, agentId);
    const shadowPath = path.join(shadowDir, MANIFEST_JSON_FILENAME);
    const shadowContent = readFileIfExists(shadowPath);

    // (c) shadow missing -> create
    if (shadowContent === undefined) {
      if (!opts.dryRun) {
        fs.mkdirSync(shadowDir, { recursive: true });
        fs.writeFileSync(shadowPath, builtinContent, 'utf8');
      }
      report.created.push(agentId);
      nextAgentsState[agentId] = { builtinHash, syncedAt };
      stateChanged = true;
      continue;
    }

    const shadowHash = hashContent(shadowContent);

    // Already byte-identical to the current builtin — nothing to change;
    // just (re)stamp the baseline if it was missing or stale.
    if (shadowHash === builtinHash) {
      if (nextAgentsState[agentId]?.builtinHash !== builtinHash) {
        nextAgentsState[agentId] = { builtinHash, syncedAt };
        stateChanged = true;
      }
      continue;
    }

    const lastSyncedHash = state.agents[agentId]?.builtinHash;

    // (a) shadow unmodified since the last sync (byte-equal to the recorded
    // last-synced builtin content) and the builtin has since changed -> safe update.
    if (lastSyncedHash !== undefined && shadowHash === lastSyncedHash) {
      if (!opts.dryRun) {
        fs.writeFileSync(shadowPath, builtinContent, 'utf8');
      }
      report.updated.push(agentId);
      nextAgentsState[agentId] = { builtinHash, syncedAt };
      stateChanged = true;
      continue;
    }

    // (b) shadow differs from both the current builtin content and the
    // recorded last-synced baseline — or no baseline was ever recorded, so
    // provenance can't be verified. Either way, never silently overwrite.
    report.keptLocal.push(agentId);
    report.conflicts.push({
      agentId,
      shadowPath,
      builtinPath: builtinManifestPath,
      reason: lastSyncedHash === undefined
        ? 'no prior sync baseline recorded for this shadow — content differs from the current builtin and provenance cannot be verified'
        : 'shadow content differs from both the last-synced builtin baseline and the current builtin content (locally edited)',
    });
  }

  if (stateChanged && !opts.dryRun) {
    writeState(projectRoot, nextAgentsState);
  }

  return report;
}
