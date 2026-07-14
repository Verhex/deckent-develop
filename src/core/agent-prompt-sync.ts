// ─── Builtin Agent Prompt Sync (444-005 F4) ─────────────────────────────────
//
// Propagates `src/core/builtins/agents/<id>/PROMPT.md` into its
// `.deckent/agents/<id>/PROMPT.md` shadow with three-way protection:
//   (a) shadow byte-equal to the last-synced builtin content -> safe update
//   (b) shadow locally edited (differs from both)             -> keep local + conflict
//   (c) shadow missing                                        -> create
//
// No existing "last-synced baseline" tracker fits this job: the only
// comparable hash-cache (orchestra/managed-docs/doc-cache.ts) lives in
// orchestra/, which core/ MUST NOT import (ADR-D-004 C1 — core/ never imports
// orchestra/), and seedBuiltins() (cli/commands/init-steps.ts) is a
// write-if-not-exists seeder with no hash/baseline tracking, living in cli/
// (also off-limits to core/). So this module owns a small, dedicated state
// file at `.deckent/agents/.prompt-sync-state.json`, written ONLY here.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { DECKENT_DIR, PROJECT_CONFIG_PATH } from './constants.js';

const AGENTS_DIR = path.join(DECKENT_DIR, 'agents');
const PROMPT_MD_FILENAME = 'PROMPT.md';
const STATE_RELATIVE_PATH = path.join(AGENTS_DIR, '.prompt-sync-state.json');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentPromptSyncConflict {
  agentId: string;
  shadowPath: string;
  builtinPath: string;
  reason: string;
}

export interface AgentPromptSyncReport {
  /** Shadow PROMPT.md files newly created from the builtin. */
  created: string[];
  /** Shadow PROMPT.md files safely overwritten with new builtin content. */
  updated: string[];
  /** Shadow PROMPT.md files left untouched because they were locally edited. */
  keptLocal: string[];
  /** One typed notice per keptLocal entry, explaining why it was skipped. */
  conflicts: AgentPromptSyncConflict[];
}

export interface AgentPromptSyncOptions {
  /** When true, compute the report but never write to disk. */
  dryRun?: boolean;
}

interface PromptSyncStateEntry {
  /** sha1 of the builtin PROMPT.md content at the moment it was last synced into the shadow. */
  builtinHash: string;
  syncedAt: string;
}

interface PromptSyncStateFile {
  _meta?: { generatedBy: string; schemaVersion: number };
  agents: Record<string, PromptSyncStateEntry>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyReport(): AgentPromptSyncReport {
  return { created: [], updated: [], keptLocal: [], conflicts: [] };
}

/**
 * Resolve the builtin agents directory relative to THIS module's own file
 * location (src/core/agent-prompt-sync.ts or dist/core/agent-prompt-sync.js —
 * builtins/ is a direct sibling either way). Mirrors agent-pool.ts's
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
 * never throws). Deliberately self-contained rather than reusing
 * utils.ts's readJsonSafe: this module's only fs dependency is 'node:fs'
 * itself, keeping it immune to callers (e.g. sync.ts's own test suite) that
 * mock '../core/utils.js' narrowly to a handful of named exports. Mirrors
 * orchestra/managed-docs/doc-cache.ts's readDocCache, which makes the same
 * self-contained choice for the same reason.
 */
function readState(projectRoot: string): PromptSyncStateFile {
  const fullPath = path.join(projectRoot, STATE_RELATIVE_PATH);
  let raw: Partial<PromptSyncStateFile> | null = null;
  try {
    raw = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as Partial<PromptSyncStateFile>;
  } catch {
    raw = null;
  }
  const agents = raw?.agents && typeof raw.agents === 'object' && !Array.isArray(raw.agents)
    ? raw.agents
    : {};
  return { agents: agents as Record<string, PromptSyncStateEntry> };
}

/**
 * Atomic tmp+rename write (mirrors agent-pool.ts's writeAgentStatsToSidecar) —
 * a crash mid-write never leaves a torn state file.
 */
function writeState(projectRoot: string, agents: Record<string, PromptSyncStateEntry>): void {
  const fullPath = path.join(projectRoot, STATE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const withMeta: PromptSyncStateFile = {
    _meta: { generatedBy: 'agent-prompt-sync.ts', schemaVersion: 1 },
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
 * Sync every builtin agent's PROMPT.md into its `.deckent/agents/<id>/` shadow.
 *
 * Gated on `.deckent/config.json` existing (mirrors agent-pool.ts's
 * `_loadBuiltinFallback` gate) — `projectRoot` must be an actual initialized
 * deckent project, not merely a directory that happens to contain a
 * `.deckent/agents/<id>/` subdirectory.
 *
 * Never throws: every readdir/read/write is defensively guarded so a single
 * unreadable builtin or shadow entry cannot abort the whole sweep.
 */
export function syncBuiltinAgentPrompts(
  projectRoot: string,
  opts: AgentPromptSyncOptions = {},
): AgentPromptSyncReport {
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
  const nextAgentsState: Record<string, PromptSyncStateEntry> = { ...state.agents };
  let stateChanged = false;
  const syncedAt = new Date().toISOString();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const agentId = entry.name;

    const builtinPromptPath = path.join(builtinDir, agentId, PROMPT_MD_FILENAME);
    const builtinContent = readFileIfExists(builtinPromptPath);
    if (builtinContent === undefined || builtinContent.trim().length === 0) continue;

    const builtinHash = hashContent(builtinContent);
    const shadowDir = path.join(projectRoot, AGENTS_DIR, agentId);
    const shadowPath = path.join(shadowDir, PROMPT_MD_FILENAME);
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
      builtinPath: builtinPromptPath,
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
