// ─── Agent Pool Manager ──────────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  AgentCatalogLayer,
  AgentDefinition,
  AgentPool,
  AgentPromptAvailability,
  AgentRoutabilityBlocker,
  AgentStats,
} from './agent-types.js';
import { createDefaultStats, resolveDefaultAgentModel } from './agent-types.js';
import type { ActivationRule } from './routing-types.js';
import { createDefaultActivationConfig } from './routing-types.js';
import { readJsonSafe, debugLog } from './utils.js';
import { capabilityVectorSchema } from './routing/capability-vector.js';
import type { CapabilityVector } from './routing/capability-vector.js';
import { modelRegistry, resolveCanonicalModelIdentity } from './model-registry.js';
import type { AgentRole } from './agent-role-contract.js';
export {
  BUILTIN_AGENT_ROLES,
  getAgentRole,
  type AgentRole,
} from './agent-role-contract.js';

// ─── Builtin Fallback (371-001 CATALOG-MATERIALIZE) ─────────────────────────
//
// D-004 layer pattern: .deckent override > builtin default. Mirrors
// skill-pool.ts's _loadBuiltinFallback — see that file for the full
// rationale (why this reads the builtin tree in-memory at load time rather
// than having the sync step / seedBuiltins materialize agent.json files).

/**
 * Test-only override for the builtin agents directory (446-022): lets the
 * builtin-fallback mechanism be exercised against a tmpdir fixture tree
 * instead of depending on which REAL builtin agents happen to be
 * manifest-less (a repo-state coupling that broke twice — 445-019, 446).
 * Production never sets this; `null` restores the module-relative default.
 */
let builtinAgentsDirOverrideForTests: string | null = null;

/** @internal test hook — see builtinAgentsDirOverrideForTests. */
export function __setBuiltinAgentsDirForTests(dir: string | null): void {
  builtinAgentsDirOverrideForTests = dir;
}

export type AgentPoolDegradedCode =
  | 'builtin-project-config-missing'
  | 'builtin-catalog-directory-missing';

export interface AgentPoolDegradation {
  readonly code: AgentPoolDegradedCode;
  readonly message: Readonly<{ en: string; tr: string }>;
}

/** AgentPool remains Map-compatible; readers may opt in to catalog diagnostics. */
export interface ObservableAgentPool extends Map<string, AgentDefinition> {
  degraded?: AgentPoolDegradation[];
}

const AGENT_POOL_DEGRADED_MESSAGES: Readonly<
  Record<AgentPoolDegradedCode, Readonly<{ en: string; tr: string }>>
> = {
  'builtin-project-config-missing': {
    en: 'Builtin agent catalog was not loaded because .deckent/config.json is missing.',
    tr: 'Yerleşik agent kataloğu .deckent/config.json bulunamadığı için yüklenmedi.',
  },
  'builtin-catalog-directory-missing': {
    en: 'Builtin agent catalog directory is missing; the agent pool is degraded.',
    tr: 'Yerleşik agent katalog dizini bulunamadı; agent havuzu eksik durumda.',
  },
};

function markBuiltinCatalogDegraded(
  pool: ObservableAgentPool,
  code: AgentPoolDegradedCode,
): void {
  const message = AGENT_POOL_DEGRADED_MESSAGES[code];
  (pool.degraded ??= []).push({ code, message });
  // stderr, deliberately one line so operators and log collectors cannot miss it.
  // eslint-disable-next-line no-console
  console.error(`[deckent][${code}] ${message.en} / ${message.tr}`);
}

/**
 * Resolve the builtin agents directory relative to THIS module's own file
 * location (src/core/agent-pool.ts or dist/core/agent-pool.js — builtins/ is
 * a direct sibling either way, copied to dist/ by scripts/copy-assets.mjs).
 */
function resolveBuiltinAgentsDir(): string {
  if (builtinAgentsDirOverrideForTests !== null) return builtinAgentsDirOverrideForTests;
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(moduleDir, 'builtins', 'agents');
}

/** Title-case a kebab/snake-case id as a last-resort name. */
function titleCaseFromId(id: string): string {
  return id
    .split(/[-_]/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Parse a builtin PROMPT.md body for its H1 title and lead paragraph.
 * Tolerates an optional YAML frontmatter block. Mirrors
 * skill-pool.ts:parseMarkdownTitleAndLead (kept file-local — the two
 * pool managers are outside each other's write/read scope for this task).
 */
function parseMarkdownTitleAndLead(markdown: string): { title: string; lead: string } {
  const withoutFrontmatter = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
  const lines = withoutFrontmatter.split('\n');

  let title = '';
  let titleIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = /^#\s+(.+)$/.exec(lines[i]!.trim());
    if (match) {
      title = match[1]!.trim();
      titleIndex = i;
      break;
    }
  }

  const leadLines: string[] = [];
  if (titleIndex >= 0) {
    for (let i = titleIndex + 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === '') {
        if (leadLines.length > 0) break;
        continue;
      }
      if (/^#{1,6}\s/.test(line)) break;
      leadLines.push(line);
    }
  }

  return { title, lead: leadLines.join(' ').trim() };
}

/**
 * Synthesize a minimal, valid AgentDefinition (raw JSON-shaped record) from a
 * builtin PROMPT.md that has no accompanying agent.json. `systemPrompt` is
 * left empty — the real content is served through the resolver's own
 * builtin-tree fallback ({@link resolvePrompt}; PROMPT.md stays the single
 * canonical source, per ADR-048); duplicating it into systemPrompt here would
 * violate that single-source contract. Returns null if the file cannot be read.
 *
 * Reads through {@link readPromptFile} — the module's single prompt-content read
 * (row 7011 slice S3): this synthesis path used to own a second `fs.readFileSync`
 * of the very same PROMPT.md the resolver reads, so the two could disagree about
 * what a builtin's prompt bytes are.
 */
function synthesizeAgentDefinition(id: string, promptMdPath: string): Record<string, unknown> | null {
  const content = readPromptFile(promptMdPath);
  if (content === undefined) return null;

  const { title, lead } = parseMarkdownTitleAndLead(content);
  const name = (title ? title.replace(/\s+Agent$/i, '').trim() : '') || titleCaseFromId(id);

  return {
    id,
    name,
    description: lead,
    systemPrompt: '',
    manifestVersion: 2,
    expertise: [],
    allowedTools: ['Read', 'Grep', 'Bash', 'Write'],
    deniedTools: [],
    preferredModel: resolveDefaultAgentModel(),
    effortMultiplier: 1,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: false,
    enabled: true,
    source: 'builtin',
    stats: createDefaultStats(),
    // Well-formed but inert (no rules -> never scores above minScore): the V2
    // routing engine indexes activation.rules unconditionally for every pool
    // member, so leaving this field undefined (rather than an empty, valid
    // ActivationConfig) breaks scoring for the WHOLE pool, not just this entry.
    activation: createDefaultActivationConfig(),
  };
}

// ─── Built-in Implementation Intent Candidacy (Sprint 204 Task 204-003) ──────
//
// Origin: built-in agent.json files declared no `intent.primary: "implementation"`
// activation rules, so every "implementation" task fell to the scope-blind
// temp-react-ts-specialist (impl@6); this load-time injection made refactorer(7)
// and architect(6) viable candidates without touching the manifests.
//
// Implementer era (Sprint 444 F3): the implementation floor now lives on the
// `implementer` builtin's OWN manifest (implementation@7) — refactorer is
// refactor-only by spec ("activates ONLY on intent=refactor") and was dropped
// from this map so a live-loaded pool cannot re-inject the retired candidacy.
// Only architect's secondary candidacy (6) remains injected here.
//
// Domain balance (Sprint 209 Task 209-002+003) is unchanged:
//   Domain-specialized agents beat the impl floor via getDomainMatchBonus (+3):
//     api-builder: 8 (domain rule) + 3 (bonus) = 11 > implementer@7
//     security-auditor: 10 (security intent) + 3 (bonus) = 13 > implementer@7
//   Implementer is the correct winner for generic (non-domain) impl tasks;
//   temp agents (6) still lose to it — the Sprint-205 anti-temp guarantee.
export const BUILTIN_IMPLEMENTATION_INTENT_RULES: Readonly<
  Record<string, { score: number; name: string }>
> = {
  architect: { score: 6, name: 'implementation-candidate' },
};

/**
 * Inject a mid-tier `intent.primary === "implementation"` activation rule into
 * known built-in agents (architect) so they become viable candidates for
 * generic implementation tasks. Idempotent: re-applying does not duplicate
 * the rule. Returns true when the agent was modified.
 */
export function applyBuiltinImplementationRules(agent: AgentDefinition): boolean {
  const ruleSpec = BUILTIN_IMPLEMENTATION_INTENT_RULES[agent.id];
  if (!ruleSpec) return false;
  if (agent.source !== 'builtin') return false;

  if (!agent.activation) {
    agent.activation = createDefaultActivationConfig();
  }

  const alreadyPresent = agent.activation.rules.some(
    (r) => r.when['intent.primary'] === 'implementation',
  );
  if (alreadyPresent) return false;

  const rule: ActivationRule = {
    name: ruleSpec.name,
    when: { 'intent.primary': 'implementation' },
    score: ruleSpec.score,
  };
  agent.activation.rules.push(rule);
  return true;
}

// ─── Agent Domain ─────────────────────────────────────────────────────────────

export type AgentDomain = 'cli' | 'react' | 'system' | 'test' | 'doc' | 'devops' | 'security' | 'data';

/**
 * PCOMP-W5 (persona role axis — sprint-348-005 prompt analysis): WHAT KIND of
 * output a persona is built to produce, orthogonal to its domain. A reviewer
 * persona (severity-graded finding reports, audit checklists) assigned to an
 * implementation task is the known output-format-conflict / auditor-drift
 * failure class; the routing engine penalizes the mismatch (see
 * `getRoleMismatchPenalty` in routing-engine.ts). Bridges to ADR-G-006 V3's
 * task-kind vector-select axis.
 */
// Module augmentation: adds domain?/role?/capabilities? to AgentDefinition
// (backward compat — undefined → 'generic' / 'implementer' / no capability vector).
// `capabilities` (445-012, routing-v3 Slice-0) is purely additive: the V2 scoring
// path (routing-engine.ts / activation-engine.ts) never reads this field, so its
// presence or absence cannot change any V2 RoutingDecision.
declare module './agent-types.js' {
  interface AgentDefinition {
    domain?: AgentDomain;
    role?: AgentRole;
    capabilities?: CapabilityVector;
  }
}

/** Hardcoded domain map for built-in agents (agent.json domain field population is out of scope). */
export const BUILTIN_AGENT_DOMAINS: Readonly<Record<string, AgentDomain>> = {
  'architect': 'system',
  'architecture-planner': 'system',
  'bug-fixer': 'system',
  'code-reviewer': 'system',
  'refactorer': 'system',
  'api-builder': 'react',
  'frontend-designer': 'react',
  'accessibility-auditor': 'react',
  'doc-writer': 'doc',
  'ci-guardian': 'test',
  'security-auditor': 'security',
  'performance-analyzer': 'system',
  'data-engineer': 'data',
  'devops-engineer': 'devops',
  'migration-specialist': 'system',
};

/**
 * Hardcoded domain overrides for known temp agents that lack a domain field in agent.json.
 * Ensures validatePersonaTaskMatch can detect domain mismatches for these agents.
 */
export const TEMP_AGENT_DOMAINS: Readonly<Record<string, AgentDomain>> = {
  'temp-react-ts-specialist': 'react',
};

/**
 * Get the domain for an agent. Reads agent.domain if set (from agent.json),
 * falls back to BUILTIN_AGENT_DOMAINS by id, then TEMP_AGENT_DOMAINS, then 'generic'.
 */
export function getAgentDomain(agent: AgentDefinition): AgentDomain | 'generic' {
  if (agent.domain) return agent.domain;
  const builtin = BUILTIN_AGENT_DOMAINS[agent.id];
  if (builtin) return builtin;
  const temp = TEMP_AGENT_DOMAINS[agent.id];
  if (temp) return temp;
  return 'generic';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENTS_DIR = '.deckent/agents';
const TEMP_AGENTS_DIR = '.tasks/agents';
const AGENT_FILENAME = 'agent.json';
const CONFIG_FILENAME = path.join('.deckent', 'config.json');

/** Default maximum number of temp agents to keep in pool. */
export const DEFAULT_MAX_TEMP_AGENTS = 50;

/** Default maximum age (in sprints) for temp agents before eviction. */
export const DEFAULT_MAX_AGENT_AGE = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the numeric sprint number from a sprint ID string (e.g. "sprint-037" → 37).
 * Returns 0 if the format is not recognized.
 */
function sprintNumber(sprintId: string): number {
  const match = /sprint-(\d+)/i.exec(sprintId);
  if (!match || !match[1]) return 0;
  return parseInt(match[1], 10);
}

/**
 * Determine whether a temp agent should be evicted based on last-used sprint.
 * @param lastUsedInSprint - The sprint ID when the agent was last used.
 * @param currentSprintId  - The current sprint ID (used as reference point).
 * @param maxAge           - Maximum number of sprints an agent can be unused.
 * @returns true when the agent is old enough to evict.
 */
export function isTempAgentStale(
  lastUsedInSprint: string,
  currentSprintId: string,
  maxAge: number,
): boolean {
  if (!lastUsedInSprint) return true;
  const lastNum = sprintNumber(lastUsedInSprint);
  const currentNum = sprintNumber(currentSprintId);
  if (lastNum === 0 || currentNum === 0) return false; // cannot determine — keep safe
  return currentNum - lastNum > maxAge;
}

// ─── Layer Precedence (row 7011 D1 — owner-approved 2026-08-11) ─────────────
//
// follow-up-works/agent-catalog-authority-design-2026-08-11.md §3.1 + addendum "D1 KABUL":
// L1 project override (.deckent/agents/) > L2 learned/runtime (.tasks/agents/) > L0 shipped
// builtin, with L2 limited to a field-level exception: on an id collision with L1, L2 may only
// carry across the RUNTIME-DERIVED fields (`stats` — including `lastUsedInSprint` — and
// `capabilitiesProvisional`), never identity, prompt, tool grants or routing declarations.
// This reverses the previous whole-record L2-wins collision behavior (an approved behavior
// change, D1). L0 already only fills genuine gaps (_loadBuiltinFallback's `pool.has` check
// below) and needs no change — that already matches L1 > L2 > L0.

/**
 * Compose a colliding L2 (learned/runtime) record onto its L1 (project override) counterpart
 * per D1's field-level exception. Returns `l1Agent` with `stats` replaced by `l2Agent.stats`,
 * and `capabilitiesProvisional` replaced when `l2Agent` declares one. Every other field —
 * identity, prompt, tool grants, routing declarations — stays L1's.
 */
function composeL1WithL2RuntimeFields(l1Agent: AgentDefinition, l2Agent: AgentDefinition): AgentDefinition {
  const composed: AgentDefinition = { ...l1Agent, stats: l2Agent.stats };
  if (l2Agent.capabilitiesProvisional !== undefined) {
    composed.capabilitiesProvisional = l2Agent.capabilitiesProvisional;
  }
  return composed;
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_SOURCES = ['builtin', 'user', 'learned'] as const;

// ─── Activation Schema (born-590 ACTIVATION-VALIDATION) ─────────────────────
//
// `activation` (ActivationConfig — routing-types.ts) is the sole real
// scoring input the routing/activation engine reads (activation-engine.ts
// indexes `config.rules`/`config.exclude`/`config.minScore` unconditionally
// for every pool member), yet it was never validated at load time — a
// manually-edited agent.json with a malformed `activation` block silently
// entered the pool with a broken scoring shape instead of being excluded.
// Mirrors the ActivationConfig/ActivationRule/ExclusionRule interfaces
// (routing-types.ts) exactly. Kept file-local and duplicated in
// skill-pool.ts for the same reason parseMarkdownTitleAndLead is duplicated
// there — see that file's comment (the two pool managers are outside each
// other's write/read scope for this task).
const activationRuleSchema = z.object({
  name: z.string().optional(),
  when: z.record(z.string(), z.unknown()),
  score: z.number(),
});
const activationExclusionRuleSchema = z.object({
  name: z.string().optional(),
  when: z.record(z.string(), z.unknown()),
  reason: z.string().optional(),
});
const activationConfigSchema = z.object({
  rules: z.array(activationRuleSchema),
  exclude: z.array(activationExclusionRuleSchema),
  minScore: z.number(),
});

/**
 * Validate `activation` (when present) against {@link activationConfigSchema}
 * and append one human-readable error per zod issue to `errors`. Absent
 * `activation` is intentionally left unvalidated — downstream already
 * defaults it via createDefaultActivationConfig() at synthesis time, and
 * requiring it on every hand-authored agent.json would be a
 * behavior-narrowing this task does not ask for ("davranışı DARALTMA").
 */
function validateActivationField(activation: unknown, errors: string[]): void {
  if (activation === undefined) return;
  const result = activationConfigSchema.safeParse(activation);
  if (result.success) return;
  for (const issue of result.error.issues) {
    const fieldPath = issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
    errors.push(`"activation${fieldPath}" ${issue.message}`);
  }
}

// ─── Manifest Normalization (born-641 POOL-LOAD-NORMALIZE) ──────────────────
//
// Mirrors skill-pool.ts:normalizeSkillManifest — see that file's comment for the
// full born-641 rationale (kept file-local for the same reason
// parseMarkdownTitleAndLead/validateActivationField are duplicated there: the two
// pool managers are outside each other's write/read scope for this task). Applied
// ONLY after validate*Definition() confirms the manifest is valid — a
// present-but-wrong-typed field is still rejected (fail-soft skip+warn is
// UNCHANGED); this only fills fields that are literally absent. Limited to fields
// already declared on AgentDefinition — no new fields invented.
function normalizeAgentManifest(raw: Record<string, unknown>): void {
  if (raw['deniedTools'] === undefined) raw['deniedTools'] = [];
  if (raw['expertise'] === undefined) raw['expertise'] = [];
}

// ─── Load Diagnostics (born-590) ─────────────────────────────────────────────

/** A manifest skipped during the most recent load because it failed validation or JSON parsing. */
export interface InvalidManifestEntry {
  id: string;
  path: string;
  errors: string[];
  /**
   * 'skip' (default, born-590): the WHOLE manifest was rejected and the agent is
   * absent from the pool. 'warning' (445-012): only an additive field (e.g.
   * `capabilities`) failed validation — the agent still loaded normally on its
   * other V2 fields, just without that one field attached.
   */
  severity?: 'skip' | 'warning';
}

// ─── Stats Sidecar (born-605 STATS-SIDECAR) ─────────────────────────────────
//
// Live agent/skill stats (totalUses/successRate/avgCoverage/lastUsedInSprint) used
// to be written straight into the git-tracked agent.json/manifest.json on every
// sprint finalize (sprint-finalizer.ts's "8d2" sync block) — per-sprint repo-diff
// noise + a hermeticity/C5 violation + a two-tree sync conflict source. Live stats
// now live in a single gitignored ledger, `.deckent/stats/catalog-stats.json`
// (shape: `{ agents: {id: AgentStats}, skills: {id: SkillStats} }`, shared with
// skill-pool.ts), written atomically (tmp + rename, mirrors approval-broker.ts's
// atomicWriteJson). READ is unified: loadAgents() overlays the sidecar value onto
// each pool entry's `stats` when present, else the manifest-loaded value is left
// untouched — migration-friendly, a consumer (marketplace/rating/routing bonus)
// sees the identical value regardless of which store currently holds it, and the
// git-tracked manifest's own `stats` field is NEVER rewritten by this task (a bulk
// manifest re-zero is a separate, explicitly-approved change). Duplicated
// file-local in skill-pool.ts for the same reason parseMarkdownTitleAndLead is
// duplicated there — the two pool managers are outside each other's write/read
// scope for this task.

const STATS_SIDECAR_RELATIVE_PATH = path.join('.deckent', 'stats', 'catalog-stats.json');

interface StatsSidecarLedger {
  agents: Record<string, AgentStats>;
  skills: Record<string, unknown>;
}

/** Defensive read — a missing/corrupt/malformed ledger degrades to an empty one, never throws. */
function readStatsSidecarLedger(projectRoot: string): StatsSidecarLedger {
  const raw = readJsonSafe<Partial<StatsSidecarLedger>>(
    path.join(projectRoot, STATS_SIDECAR_RELATIVE_PATH),
  );
  const agents = raw?.agents && typeof raw.agents === 'object' && !Array.isArray(raw.agents)
    ? raw.agents
    : {};
  const skills = raw?.skills && typeof raw.skills === 'object' && !Array.isArray(raw.skills)
    ? raw.skills
    : {};
  return { agents: agents as Record<string, AgentStats>, skills };
}

/**
 * Read-merge-write a single agent's stats into the shared sidecar ledger, atomically
 * (tmp file + rename — a crash mid-write never leaves a torn file, and a same-tick
 * skill-stats write from SkillPoolManager against the same physical file is never
 * clobbered since each write re-reads the full ledger first).
 */
function writeAgentStatsToSidecar(projectRoot: string, id: string, stats: AgentStats): void {
  const ledger = readStatsSidecarLedger(projectRoot);
  ledger.agents[id] = stats;
  const fullPath = path.join(projectRoot, STATS_SIDECAR_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const tmpPath = `${fullPath}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
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

export class AgentPoolManager {
  /** Maximum number of temp agents to keep in pool (LRU eviction). */
  private maxTempAgents: number;

  constructor(projectRoot: string, maxTempAgents = DEFAULT_MAX_TEMP_AGENTS) {
    this.projectRoot = projectRoot;
    this.maxTempAgents = maxTempAgents;
  }

  private projectRoot: string;

  /** Manifests skipped during the most recent loadAgents() call (born-590 — see getInvalidManifests). */
  private invalidManifests: InvalidManifestEntry[] = [];

  /**
   * Record a manifest that failed load-time validation or JSON parsing, and
   * emit a visible signal via the existing debugLog primitive (stderr when
   * DECKENT_DEBUG is set, always persisted to .brain/ERRORS.md) — replacing
   * the previous fully-silent skip (born-590).
   */
  private _recordInvalidManifest(
    id: string,
    manifestPath: string,
    errors: string[],
    severity: 'skip' | 'warning' = 'skip',
  ): void {
    this.invalidManifests.push({ id, path: manifestPath, errors, severity });
    const label = severity === 'warning' ? 'WARNING' : 'SKIP';
    debugLog('agent-pool:invalid-manifest', `[${label}] ${id} (${manifestPath}): ${errors.join('; ')}`);
  }

  /** Manifests skipped during the most recent loadAgents() call because they failed validation or JSON parsing (born-590). */
  getInvalidManifests(): InvalidManifestEntry[] {
    return [...this.invalidManifests];
  }

  /** Count of manifests skipped during the most recent loadAgents() call (born-590). */
  getInvalidCount(): number {
    return this.invalidManifests.length;
  }

  /**
   * Validate `raw.capabilities` (routing-v3 Slice-0 CapabilityVector, 445-012) against
   * {@link capabilityVectorSchema} when present, in place on the raw manifest record.
   *
   * Unlike `activation` (validateActivationField, born-590) — where a malformed block
   * rejects the ENTIRE manifest — an invalid `capabilities` block does NOT reject the
   * agent: it is dropped (so the loaded AgentDefinition simply has no `capabilities`)
   * and recorded as a visible WARNING via the existing _recordInvalidManifest channel.
   * The agent still loads normally on its other (V2) fields. This keeps the V2 scoring
   * path (routing-engine.ts / activation-engine.ts, which never reads `capabilities`)
   * completely unaffected by this field's presence, absence, or validity.
   */
  private _validateAndAttachCapabilities(raw: Record<string, unknown>, id: string, manifestPath: string): void {
    const capabilities = raw['capabilities'];
    if (capabilities === undefined) return;

    const result = capabilityVectorSchema.safeParse(capabilities);
    if (result.success) {
      const preferredModel = result.data.numerical.preferredModel;
      if (preferredModel !== undefined) {
        try {
          resolveCanonicalModelIdentity(preferredModel, { registerParametric: false });
        } catch {
          delete raw['capabilities'];
          this._recordInvalidManifest(
            id,
            manifestPath,
            ['"capabilities.numerical.preferredModel" must be a canonical registered model ID'],
            'warning',
          );
          return;
        }
      }
      raw['capabilities'] = result.data;
      return;
    }

    const errors = result.error.issues.map((issue) => {
      const fieldPath = issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
      return `"capabilities${fieldPath}" ${issue.message}`;
    });
    delete raw['capabilities'];
    this._recordInvalidManifest(id, manifestPath, errors, 'warning');
  }

  // ─── Load ────────────────────────────────────────────────────────────────────

  /**
   * Load all agents from .deckent/agents/ and .tasks/agents/ directories.
   * Returns an AgentPool (Map<string, AgentDefinition>).
   * Skips directories with invalid agent.json files — visibly (born-590):
   * see getInvalidManifests()/getInvalidCount() for what was skipped and why.
   * Applies LRU eviction: keeps only the most-recently-used temp agents
   * up to `maxTempAgents` (default 50).
   * Layer precedence (row 7011 D1): L1 project override > L2 learned/runtime > L0 shipped
   * builtin. A colliding L2 record composes only its runtime-derived fields onto the L1
   * record — see composeL1WithL2RuntimeFields().
   */
  loadAgents(): ObservableAgentPool {
    const pool: ObservableAgentPool = new Map();
    this.invalidManifests = [];

    // Load persistent agents from .deckent/agents/ (never evicted)
    const persistentDir = path.join(this.projectRoot, AGENTS_DIR);
    this._loadFromDir(persistentDir, pool);

    // Load temp agents from .tasks/agents/ with LRU eviction
    const tempDir = path.join(this.projectRoot, TEMP_AGENTS_DIR);
    const tempPool: AgentPool = new Map();
    this._loadFromDir(tempDir, tempPool);

    // Apply LRU eviction: keep only maxTempAgents most-recently-used temp agents.
    // NOTE (born-605): this sort reads the PRE-sidecar-overlay `stats.lastUsedInSprint`
    // (overlay runs once at the very end, below — see _applyStatsSidecarOverlay for
    // why: reading the sidecar per-agent here would add extra fs reads that break
    // tests/core/agent-pool.test.ts's exact-call-count/ordered-mock assertions,
    // which this task's write scope cannot touch). A temp agent whose ONLY stats
    // updates came through the sidecar-only finalizer path since being created may
    // therefore sort as staler than it really is — a narrow, pre-existing-test-
    // constrained limitation, not a correctness issue for the overlay itself.
    if (tempPool.size > this.maxTempAgents) {
      const sorted = Array.from(tempPool.values()).sort((a, b) => {
        const aNum = sprintNumber(a.stats?.lastUsedInSprint ?? '');
        const bNum = sprintNumber(b.stats?.lastUsedInSprint ?? '');
        return bNum - aNum; // descending: most recent first
      });
      const kept = sorted.slice(0, this.maxTempAgents);
      for (const agent of kept) {
        const l1Agent = pool.get(agent.id);
        pool.set(agent.id, l1Agent ? composeL1WithL2RuntimeFields(l1Agent, agent) : agent);
      }
    } else {
      for (const [id, agent] of tempPool) {
        const l1Agent = pool.get(id);
        pool.set(id, l1Agent ? composeL1WithL2RuntimeFields(l1Agent, agent) : agent);
      }
    }

    this._loadBuiltinFallback(pool);
    this._applyStatsSidecarOverlay(pool);

    return pool;
  }

  /**
   * Overlay sidecar stats onto every pool entry that has one (sidecar wins), else
   * the manifest-loaded `stats` value is left as-is (unified read, born-605).
   * Reads the ledger exactly once, and short-circuits entirely on an empty pool
   * (nothing to overlay onto — also keeps a from-scratch project's loadAgents()
   * call free of a pointless fs read).
   */
  private _applyStatsSidecarOverlay(pool: AgentPool): void {
    if (pool.size === 0) return;
    const statsLedger = readStatsSidecarLedger(this.projectRoot);
    for (const agent of pool.values()) {
      const sidecarStats = statsLedger.agents[agent.id];
      if (sidecarStats && typeof sidecarStats === 'object') {
        agent.stats = sidecarStats;
      }
    }
  }

  /**
   * Persist ONLY `stats` for an agent to the gitignored stats sidecar
   * (.deckent/stats/catalog-stats.json) — the git-tracked agent.json manifest is
   * never touched by this call (born-605: sprint-finalizer's per-sprint sync no
   * longer mutates the manifest). Does not affect saveAgent()/updateAgentStats(),
   * whose manifest-write contract is unchanged.
   */
  saveAgentStats(id: string, stats: AgentStats): void {
    writeAgentStatsToSidecar(this.projectRoot, id, stats);
  }

  /**
   * Fallback layer (371-001): make builtin agents pool-visible even when
   * .deckent/agents/<id>/agent.json has never been materialized. D-004
   * precedence — any id already present (a .deckent/.tasks override) is left
   * untouched; only ids absent from `pool` are considered here.
   *
   * Gated on .deckent/config.json existing — see skill-pool.ts's
   * _loadBuiltinFallback for the full rationale (this projectRoot must
   * actually be an initialized deckent project, not merely a directory that
   * happens to contain a `.deckent/agents/<id>/` subdirectory).
   */
  private _loadBuiltinFallback(pool: AgentPool): void {
    if (!fs.existsSync(path.join(this.projectRoot, CONFIG_FILENAME))) {
      markBuiltinCatalogDegraded(pool, 'builtin-project-config-missing');
      return;
    }

    const builtinDir = resolveBuiltinAgentsDir();
    if (!fs.existsSync(builtinDir)) {
      markBuiltinCatalogDegraded(pool, 'builtin-catalog-directory-missing');
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(builtinDir, { withFileTypes: true });
    } catch {
      return;
    }
    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (pool.has(entry.name)) continue;

      const entryDir = path.join(builtinDir, entry.name);
      let files: fs.Dirent[];
      try {
        files = fs.readdirSync(entryDir, { withFileTypes: true });
      } catch {
        continue;
      }
      if (!Array.isArray(files)) continue;

      // Capabilities-era (446, V3 Slice-1): builtins may ship their OWN
      // agent.json (445 authored real capability blocks on every builtin).
      // The builtin manifest is the DEFAULT layer of the D-004 pattern —
      // loaded here when no .deckent override exists (`pool.has` above keeps
      // override precedence). The historical synthesis path stays for
      // manifest-less builtin dirs (PROMPT.md only).
      let raw: Record<string, unknown> | null = null;
      if (files.some((f) => f.name === AGENT_FILENAME)) {
        raw = readJsonSafe<Record<string, unknown>>(path.join(entryDir, AGENT_FILENAME));
        if (raw && typeof raw === 'object') {
          // Builtin-tree manifests are ours; still validated below like any manifest.
          raw['source'] = 'builtin';
        }
      } else if (files.some((f) => f.name === PROMPT_MD_FILENAME)) {
        raw = synthesizeAgentDefinition(entry.name, path.join(entryDir, PROMPT_MD_FILENAME));
      } else {
        continue;
      }
      if (!raw) continue;
      const validation = AgentPoolManager.validateAgentDefinition(raw);
      if (!validation.valid) {
        this._recordInvalidManifest(entry.name, path.join(entryDir, PROMPT_MD_FILENAME), validation.errors);
        continue;
      }
      normalizeAgentManifest(raw);
      const agent = raw as unknown as AgentDefinition;
      applyBuiltinImplementationRules(agent);
      pool.set(agent.id, agent);
    }
  }

  /**
   * Batch-read all agent definitions from a directory.
   * Single readdirSync to list subdirectories, then map over entries — O(N+1) syscalls.
   * readJsonSafe handles missing/invalid agent.json files gracefully (returns null).
   */
  private _loadFromDir(dir: string, pool: AgentPool): void {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    // Batch read: map over all directory entries, attempt to read agent.json for each.
    // No per-entry existsSync on the happy path — readJsonSafe returns null for
    // missing or invalid files. A null result only gets an existsSync check
    // (below) to tell "no agent.json here at all" (not an error — many
    // directories legitimately lack one) apart from "agent.json exists but is
    // unreadable/malformed" (a genuine silent drop worth surfacing, born-590).
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'archive') continue; // Skip archive directory
      const agentFile = path.join(dir, entry.name, AGENT_FILENAME);
      const raw = readJsonSafe<Record<string, unknown>>(agentFile);
      if (raw) {
        const validation = AgentPoolManager.validateAgentDefinition(raw);
        if (validation.valid) {
          normalizeAgentManifest(raw);
          this._validateAndAttachCapabilities(raw, entry.name, agentFile);
          const agent = raw as unknown as AgentDefinition;
          applyBuiltinImplementationRules(agent);
          pool.set(agent.id, agent);
        } else {
          this._recordInvalidManifest(entry.name, agentFile, validation.errors);
        }
      } else if (fs.existsSync(agentFile)) {
        this._recordInvalidManifest(entry.name, agentFile, ['agent.json exists but is unreadable or contains invalid JSON']);
      }
    }
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  /**
   * Save an agent definition to .deckent/agents/{id}/agent.json.
   */
  saveAgent(agent: AgentDefinition): void {
    const agentDir = path.join(this.projectRoot, AGENTS_DIR, agent.id);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, AGENT_FILENAME),
      JSON.stringify(agent, null, 2) + '\n',
      'utf8',
    );
  }

  // ─── Remove ──────────────────────────────────────────────────────────────────

  /**
   * Remove an agent by id. Returns true if removed, false if not found.
   */
  removeAgent(id: string): boolean {
    const agentDir = path.join(this.projectRoot, AGENTS_DIR, id);
    if (!fs.existsSync(agentDir)) return false;
    fs.rmSync(agentDir, { recursive: true, force: true });
    return true;
  }

  // ─── Get / List ──────────────────────────────────────────────────────────────

  /**
   * Get a single agent by id. Returns undefined if not found.
   */
  getAgent(id: string): AgentDefinition | undefined {
    const pool = this.loadAgents();
    return pool.get(id);
  }

  /**
   * List all agents as an array.
   */
  listAgents(): AgentDefinition[] {
    const pool = this.loadAgents();
    return Array.from(pool.values());
  }

  /**
   * List only enabled agents.
   */
  listEnabled(): AgentDefinition[] {
    return this.listAgents().filter((a) => a.enabled);
  }

  /**
   * Get the set of active (enabled) agent IDs from the persistent agent pool.
   * Scans .deckent/agents/ directory, skipping 'archive' subdirectory.
   * This is used by the routing fallback chain to verify agent availability.
   */
  getActiveAgentIds(): Set<string> {
    const pool = this.loadAgents();
    const ids = new Set<string>();
    for (const [id, agent] of pool) {
      if (agent.enabled && !id.startsWith('archive')) {
        ids.add(id);
      }
    }
    return ids;
  }

  /**
   * Resolve `id`'s persona through the pool's own resolver, against THIS manager's
   * projectRoot (row 7011 slice S3). Consumers that already hold a pool entry call this
   * instead of re-deriving prompt truth from a path literal — one resolution path, one
   * layer precedence, one typed degraded classification for every surface.
   *
   * NOTE — not eager: prompt content is deliberately NOT attached inside loadAgents().
   * The builtin tier's `hasPersistentRecord` gate needs an `existsSync` on each id's
   * agent.json, which tests/core/agent-pool.test.ts pins as never happening during a load
   * ("does NOT call existsSync for individual agent.json files"). That file is outside this
   * slice's write authority, the same constraint the S2 slice honored (see the born-605
   * note in loadAgents). The single-path fold is delivered here; eager per-entry attachment
   * belongs to the slice allowed to re-pin those syscall assertions.
   */
  resolvePrompt(id: string): ResolvedAgentPrompt {
    return resolvePrompt(id, this.projectRoot);
  }

  // ─── Temp Agents ─────────────────────────────────────────────────────────────

  /**
   * Save a temporary agent to the persistent agent pool (.deckent/agents/temp-{id}/).
   * These agents are discoverable by `ls .deckent/agents/` and survive across sprints
   * until explicitly removed or evicted. Idempotent: re-saves on each call.
   */
  saveTempAgentToPool(agent: AgentDefinition): void {
    const dirName = agent.id.startsWith('temp-') ? agent.id : `temp-${agent.id}`;
    const agentDir = path.join(this.projectRoot, AGENTS_DIR, dirName);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, AGENT_FILENAME),
      JSON.stringify({ ...agent, id: dirName }, null, 2) + '\n',
      'utf8',
    );
  }

  /**
   * Remove all temp agents (id starts with "temp-") from .deckent/agents/.
   * Returns the number of agents removed.
   */
  cleanupPersistentTempAgents(): number {
    const persistentDir = path.join(this.projectRoot, AGENTS_DIR);
    if (!fs.existsSync(persistentDir)) return 0;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(persistentDir, { withFileTypes: true });
    } catch {
      return 0;
    }
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('temp-')) {
        fs.rmSync(path.join(persistentDir, entry.name), { recursive: true, force: true });
        removed++;
      }
    }
    return removed;
  }

  /**
   * Create a temporary agent scoped to a sprint.
   * Stored in .tasks/agents/{sprintId}-{id}/agent.json.
   */
  createTempAgent(sprintId: string, agent: AgentDefinition): void {
    const dirName = `${sprintId}-${agent.id}`;
    const agentDir = path.join(this.projectRoot, TEMP_AGENTS_DIR, dirName);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, AGENT_FILENAME),
      JSON.stringify(agent, null, 2) + '\n',
      'utf8',
    );
  }

  /**
   * Cleanup all temporary agents for a given sprint.
   */
  cleanupTempAgents(sprintId: string): void {
    const tempDir = path.join(this.projectRoot, TEMP_AGENTS_DIR);
    if (!fs.existsSync(tempDir)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(tempDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(`${sprintId}-`)) {
        fs.rmSync(path.join(tempDir, entry.name), { recursive: true, force: true });
      }
    }
  }

  /**
   * LRU-based cleanup: remove temp agents that have not been used in the last
   * `maxAge` sprints relative to `currentSprintId`.
   * Builtin agents (source === 'builtin') in .deckent/agents/ are NEVER removed.
   *
   * @param maxAge         - Maximum number of sprints an agent can be unused (default 5).
   * @param currentSprintId - The reference sprint ID (e.g. "sprint-037").
   *                          Defaults to the highest sprint number found in the temp dir.
   * @returns number of agents removed.
   */
  cleanup(maxAge = DEFAULT_MAX_AGENT_AGE, currentSprintId?: string): number {
    const tempDir = path.join(this.projectRoot, TEMP_AGENTS_DIR);
    if (!fs.existsSync(tempDir)) return 0;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(tempDir, { withFileTypes: true });
    } catch {
      return 0;
    }

    // If no currentSprintId provided, infer it from the highest sprint number
    // seen in agent lastUsedInSprint fields. Batch read: no per-entry existsSync.
    let resolvedCurrentSprint = currentSprintId ?? '';
    if (!resolvedCurrentSprint) {
      let maxNum = 0;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const agentFile = path.join(tempDir, entry.name, AGENT_FILENAME);
        const raw = readJsonSafe<Record<string, unknown>>(agentFile);
        if (raw) {
          const stats = raw['stats'] as Record<string, unknown> | undefined;
          const lastUsed = (stats?.['lastUsedInSprint'] as string | undefined) ?? '';
          const num = sprintNumber(lastUsed);
          if (num > maxNum) maxNum = num;
        }
      }
      if (maxNum > 0) {
        resolvedCurrentSprint = `sprint-${String(maxNum).padStart(3, '0')}`;
      }
    }

    // If still no reference sprint, nothing to evict
    if (!resolvedCurrentSprint) return 0;

    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const agentFile = path.join(tempDir, entry.name, AGENT_FILENAME);
      const raw = readJsonSafe<Record<string, unknown>>(agentFile);
      if (!raw) continue;

      const validation = AgentPoolManager.validateAgentDefinition(raw);
      if (!validation.valid) continue;

      const agent = raw as unknown as AgentDefinition;

      // Builtin agents are never removed
      if (agent.source === 'builtin') continue;

      const stats = agent.stats;
      const lastUsed = stats?.lastUsedInSprint ?? '';

      if (isTempAgentStale(lastUsed, resolvedCurrentSprint, maxAge)) {
        fs.rmSync(path.join(tempDir, entry.name), { recursive: true, force: true });
        removed++;
      }
    }

    return removed;
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  /**
   * Update stats for an agent after task evaluation.
   * `coverage: null` means no coverage was measured for this task (a MEASUREMENT
   * GAP, not a 0%) — totalUses/successRate still advance, but avgCoverage is left
   * untouched so the gap can never dilute it toward 0 (born-591 P0 dilution fix).
   */
  updateAgentStats(
    id: string,
    evaluation: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
    coverage: number | null,
    sprintId: string,
  ): void {
    const agent = this.getAgent(id);
    if (!agent) return;

    const stats = agent.stats ?? createDefaultStats();
    const prevTotal = stats.totalUses;
    stats.totalUses += 1;

    // Recalculate success rate (DONE and GO_WITH_TECH_DEBT count as success)
    const wasSuccess = evaluation === 'DONE' || evaluation === 'GO_WITH_TECH_DEBT';
    const prevSuccessCount = Math.round(stats.successRate * prevTotal);
    const newSuccessCount = prevSuccessCount + (wasSuccess ? 1 : 0);
    stats.successRate = stats.totalUses > 0 ? newSuccessCount / stats.totalUses : 0;

    // Recalculate average coverage — skip entirely when this task had no real
    // coverage measurement (null), so it never enters the running average.
    if (coverage !== null) {
      const prevTotalCoverage = stats.avgCoverage * prevTotal;
      stats.avgCoverage = stats.totalUses > 0 ? (prevTotalCoverage + coverage) / stats.totalUses : 0;
    }

    stats.lastUsedInSprint = sprintId;
    agent.stats = stats;

    this.saveAgent(agent);
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  /**
   * Validate an unknown value as an AgentDefinition.
   * Returns { valid: boolean, errors: string[] }.
   */
  static validateAgentDefinition(agent: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
      return { valid: false, errors: ['Agent definition must be a non-null object'] };
    }

    const obj = agent as Record<string, unknown>;

    // Required string fields
    for (const field of ['id', 'name'] as const) {
      if (typeof obj[field] !== 'string' || !(obj[field] as string).trim()) {
        errors.push(`"${field}" must be a non-empty string`);
      }
    }

    // Optional string fields that must be strings if present
    for (const field of ['description', 'systemPrompt'] as const) {
      if (obj[field] !== undefined && typeof obj[field] !== 'string') {
        errors.push(`"${field}" must be a string`);
      }
    }

    // preferredModel validation
    if (obj['preferredModel'] === undefined) {
      errors.push('"preferredModel" must be a canonical registered model ID');
    } else {
      try {
        if (typeof obj['preferredModel'] !== 'string') throw new Error('invalid model type');
        resolveCanonicalModelIdentity(obj['preferredModel'], { registerParametric: false });
      } catch {
        errors.push(`"preferredModel" must be a canonical registered model ID: ${modelRegistry.getAllModelIds().join(', ')}`);
      }
    }

    // source validation
    if (obj['source'] !== undefined) {
      if (!VALID_SOURCES.includes(obj['source'] as typeof VALID_SOURCES[number])) {
        errors.push(`"source" must be one of: ${VALID_SOURCES.join(', ')}`);
      }
    }

    // effortMultiplier validation
    if (obj['effortMultiplier'] !== undefined) {
      if (typeof obj['effortMultiplier'] !== 'number') {
        errors.push('"effortMultiplier" must be a number');
      } else if (obj['effortMultiplier'] < 0.1 || obj['effortMultiplier'] > 3.0) {
        errors.push('"effortMultiplier" must be between 0.1 and 3.0');
      }
    }

    // Boolean fields
    for (const field of ['persistent', 'enabled'] as const) {
      if (obj[field] !== undefined && typeof obj[field] !== 'boolean') {
        errors.push(`"${field}" must be a boolean`);
      }
    }

    // Array fields
    for (const field of [
      'expertise', 'allowedTools', 'deniedTools',
      'triggerKeywords', 'triggerScopes', 'triggerFilePatterns',
    ] as const) {
      if (obj[field] !== undefined) {
        if (!Array.isArray(obj[field])) {
          errors.push(`"${field}" must be an array`);
        } else {
          for (const item of obj[field] as unknown[]) {
            if (typeof item !== 'string') {
              errors.push(`"${field}" must be an array of strings`);
              break;
            }
          }
        }
      }
    }

    // Stats validation
    if (obj['stats'] !== undefined) {
      if (!obj['stats'] || typeof obj['stats'] !== 'object' || Array.isArray(obj['stats'])) {
        errors.push('"stats" must be an object');
      } else {
        const stats = obj['stats'] as Record<string, unknown>;
        if (stats['totalUses'] !== undefined && typeof stats['totalUses'] !== 'number') {
          errors.push('"stats.totalUses" must be a number');
        }
        if (stats['successRate'] !== undefined && typeof stats['successRate'] !== 'number') {
          errors.push('"stats.successRate" must be a number');
        }
        if (stats['avgCoverage'] !== undefined && typeof stats['avgCoverage'] !== 'number') {
          errors.push('"stats.avgCoverage" must be a number');
        }
        if (stats['lastUsedInSprint'] !== undefined && typeof stats['lastUsedInSprint'] !== 'string') {
          errors.push('"stats.lastUsedInSprint" must be a string');
        }
      }
    }

    // activation validation (born-590 — the sole real scoring input; previously unchecked)
    validateActivationField(obj['activation'], errors);

    return { valid: errors.length === 0, errors };
  }
}

// ─── Agent Prompt Resolution (row 7011 slice S3 — one path, behind the resolver) ──
//
// follow-up-works/agent-catalog-authority-design-2026-08-11.md §1.3 measured the defect
// this section closes: prompt resolution was a SECOND chain, structurally independent of
// the pool's own layered resolution, so an agent could be "present in the pool but
// prompt-less" or "prompt-resolvable but absent from the pool", and the builtin-fallback
// condition differed between the two. §6 S3 is the fold: one resolution path, the D1 layer
// precedence the owner approved (L1 project > L2 runtime > L0 builtin — addendum "D1 KABUL",
// already the order this chain walked), and the prompt facet expressed in the SAME typed
// vocabulary slice S1 landed in agent-types.ts rather than a private second one.
//
// What is deliberately preserved byte-for-byte: the step order, the trim()-based emptiness
// rule, the builtin tier's `hasPersistentRecord` + initialized-project gate, the degraded
// console.warn, and the exact {content, source, degraded, resolvedFrom} shape every current
// consumer sees ({@link getAgentPrompt} projects down to it). S3's proof obligation is that
// standalone resolution and pool-side resolution return identical values — which is trivially
// true once there is only one implementation of it.

/** Source of the resolved agent prompt content. */
export type AgentPromptSource = 'prompt-md' | 'prompt-md-builtin' | 'system-prompt' | 'none';

/**
 * Result of {@link getAgentPrompt}. Single-source contract:
 *   PROMPT.md (canonical) > agent.json::systemPrompt (degraded fallback) > none.
 * Concatenation is NOT performed — at most one source supplies `content`.
 */
export interface AgentPromptResolution {
  content: string;
  source: AgentPromptSource;
  /** True when PROMPT.md was missing and we fell back to systemPrompt. */
  degraded: boolean;
  /** Resolved path (when source !== 'none'), useful for diagnostics. */
  resolvedFrom?: string;
}

/**
 * What {@link resolvePrompt} actually produces: the legacy resolution PLUS the typed
 * classification the S1 state model (agent-types.ts §3.4) already defines. The extra facets
 * ride on this type rather than on {@link AgentPromptResolution} so that no current consumer
 * of `getAgentPrompt()` observes a changed object — the migration of those consumers onto
 * the richer record is slice S4's work, not this one's.
 */
/**
 * Machine-detectable persona integrity (owner D-G(a), sprint-523 task 5).
 * DATA ONLY in this slice — the spawn boundary (task 6) consumes it; nothing
 * here changes routing. `digest-mismatch` requires a manifest-declared digest;
 * absence of a declared digest NEVER fabricates a mismatch.
 */
export type PersonaIntegrityVerdict =
  | 'intact'
  | 'empty'
  | 'undersized'
  | 'digest-mismatch'
  | 'unreadable';

export function classifyPersonaIntegrity(input: {
  availability: AgentPromptAvailability;
  content: string;
  minBytes: number;
  declaredDigest?: string | null;
  actualDigest?: string | null;
}): PersonaIntegrityVerdict {
  if (input.availability === 'none') return 'unreadable';
  const bytes = Buffer.byteLength(input.content ?? '', 'utf8');
  if (bytes === 0) return 'empty';
  if (bytes < input.minBytes) return 'undersized';
  if (input.declaredDigest && input.actualDigest && input.declaredDigest !== input.actualDigest) {
    return 'digest-mismatch';
  }
  return 'intact';
}

export interface ResolvedAgentPrompt extends AgentPromptResolution {
  /**
   * D4's persona-availability facet, verbatim from agent-types.ts: a PROMPT.md hit is
   * `'prompt-file'`, the systemPrompt fallback is `'system-prompt'`, and nothing usable is
   * `'none'`. This is the same value `classifyAgentManifest()` derives from a manifest's
   * sibling-file evidence, so a catalog entry and its resolved prompt can no longer disagree
   * about whether a persona exists.
   */
  readonly availability: AgentPromptAvailability;
  /** The catalog layer the content came from (§3.1), or null when nothing resolved. */
  readonly layer: AgentCatalogLayer | null;
  /**
   * The routability blocker this resolution implies, or null when the persona is obtainable.
   * Only `'none'` blocks: per D4 a degraded-but-present systemPrompt is still a persona, and
   * whether a *broken* one is machine-detectable is an open owner question — so this mirrors
   * agent-types.ts `finalize()` exactly instead of guessing a stricter rule.
   */
  readonly blocker: AgentRoutabilityBlocker | null;
  /**
   * The manifest-declared `promptSha256` (agent-types.ts, additive) for whichever tier
   * supplied `content`, or null when the manifest declared none (524-012). Never fabricated.
   */
  readonly declaredDigest: string | null;
  /**
   * The actual `sha256:<hex>` digest of `content`, computed by {@link computePromptDigest}.
   * Null only when there is no content to hash (the `'none'` availability case).
   */
  readonly actualDigest: string | null;
}

const PROMPT_MD_FILENAME = 'PROMPT.md';

/**
 * The module's single prompt-content read (S3). Every PROMPT.md byte any surface sees —
 * resolver tiers and builtin synthesis alike — passes through here; a second reader is
 * exactly the drift this slice removes. Absent, unreadable and directory paths all degrade
 * to `undefined`, never a throw.
 */
function readPromptFile(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * The module's single digest primitive (524-012). Every actual-digest value any resolver
 * tier reports is computed here — a second `createHash` call site is exactly the drift this
 * helper exists to prevent.
 */
function computePromptDigest(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

/**
 * Author-declared digest for the manifest in `dir`, or null when absent/malformed. A plain
 * field read — not a digest computation — so it does not count against the single
 * `computePromptDigest` primitive above.
 */
function readDeclaredPromptDigest(dir: string): string | null {
  const raw = readJsonSafe<Record<string, unknown>>(path.join(dir, AGENT_FILENAME));
  const declared = raw?.['promptSha256'];
  return typeof declared === 'string' ? declared : null;
}

/** A PROMPT.md tier: the directory to look in, and how a hit there is reported. */
interface PromptFileTier {
  readonly layer: AgentCatalogLayer;
  readonly dir: string;
  readonly source: AgentPromptSource;
}

function promptFileResolution(
  content: string,
  tier: PromptFileTier,
  resolvedFrom: string,
): ResolvedAgentPrompt {
  return {
    content,
    source: tier.source,
    degraded: false,
    resolvedFrom,
    availability: 'prompt-file',
    layer: tier.layer,
    blocker: null,
    declaredDigest: readDeclaredPromptDigest(tier.dir),
    actualDigest: computePromptDigest(content),
  };
}

/**
 * Resolve a single canonical agent prompt for `agentId` from `projectRoot` — the ONE prompt
 * resolution path in the runtime (S3). {@link getAgentPrompt} and
 * {@link AgentPoolManager.resolvePrompt} are both thin delegates over it.
 *
 * Lookup order (D1 precedence — L1 project > L2 runtime > L0 builtin, then the degraded
 * tier in the same layer order):
 *   1. `<root>/.deckent/agents/<id>/PROMPT.md` (canonical, L1)
 *   2. `<root>/.tasks/agents/<id>/PROMPT.md`  (temp scope, L2)
 *   2.5. `src/core/builtins/agents/<id>/PROMPT.md` (builtin fallback, 371-001, L0) —
 *        ONLY when neither .deckent/agents/<id>/ nor .tasks/agents/<id>/ has
 *        ANY record for this id (not even an agent.json). If a persistent or
 *        temp agent.json exists, that id already went through the sync/
 *        override path deliberately and step 3's degraded contract applies —
 *        reaching past it into the builtin tree would break ADR-048 for
 *        every already-known agent that happens to omit its own PROMPT.md.
 *   3. `agent.json::systemPrompt` (degraded fallback — emits warning)
 *
 * No concatenation. `agent.json::systemPrompt` is preserved in the schema for
 * routing scoring and UI display, but it never co-exists with PROMPT.md in
 * the worker prompt block. ADR-048 (Prompt Lifecycle Contract) — Sprint 182.
 */
export function resolvePrompt(
  agentId: string,
  projectRoot: string,
): ResolvedAgentPrompt {
  // 1 + 2. PROMPT.md — L1 project override, then L2 learned/runtime.
  const fileTiers: readonly PromptFileTier[] = [
    { layer: 'project', dir: path.join(projectRoot, AGENTS_DIR, agentId), source: 'prompt-md' },
    { layer: 'runtime', dir: path.join(projectRoot, TEMP_AGENTS_DIR, agentId), source: 'prompt-md' },
  ];
  for (const tier of fileTiers) {
    const promptPath = path.join(tier.dir, PROMPT_MD_FILENAME);
    const content = readPromptFile(promptPath);
    if (content !== undefined && content.trim().length > 0) {
      return promptFileResolution(content, tier, promptPath);
    }
  }

  // 2.5. PROMPT.md (L0 builtin fallback) — only when this id has no .deckent/
  // .tasks record at all (neither PROMPT.md nor agent.json anywhere for it),
  // AND projectRoot is an actual initialized deckent project (has
  // .deckent/config.json — see _loadBuiltinFallback for why this gate
  // matters: resolveBuiltinAgentsDir() intentionally reaches outside
  // projectRoot, into the running installation's own location).
  const hasPersistentRecord = fileTiers.some((tier) =>
    fs.existsSync(path.join(tier.dir, AGENT_FILENAME)),
  );
  const isInitializedProject = fs.existsSync(path.join(projectRoot, CONFIG_FILENAME));
  if (!hasPersistentRecord && isInitializedProject) {
    const builtinTier: PromptFileTier = {
      layer: 'builtin',
      dir: path.join(resolveBuiltinAgentsDir(), agentId),
      source: 'prompt-md-builtin',
    };
    const builtinPromptPath = path.join(builtinTier.dir, PROMPT_MD_FILENAME);
    const builtinPrompt = readPromptFile(builtinPromptPath);
    if (builtinPrompt !== undefined && builtinPrompt.trim().length > 0) {
      return promptFileResolution(builtinPrompt, builtinTier, builtinPromptPath);
    }
  }

  // 3. Degraded fallback: agent.json::systemPrompt, same layer precedence.
  for (const tier of fileTiers) {
    const jsonPath = path.join(tier.dir, AGENT_FILENAME);
    const raw = readJsonSafe<Record<string, unknown>>(jsonPath);
    if (!raw) continue;
    const sp = raw['systemPrompt'];
    if (typeof sp === 'string' && sp.trim().length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[deckent] Agent "${agentId}" PROMPT.md missing — falling back to agent.json::systemPrompt (degraded).`,
      );
      const declared = raw['promptSha256'];
      return {
        content: sp,
        source: 'system-prompt',
        degraded: true,
        resolvedFrom: jsonPath,
        availability: 'system-prompt',
        layer: tier.layer,
        blocker: null,
        declaredDigest: typeof declared === 'string' ? declared : null,
        actualDigest: computePromptDigest(sp),
      };
    }
  }

  // 4. Nothing usable — the one case D4 calls definitively non-routable.
  return {
    content: '',
    source: 'none',
    degraded: true,
    availability: 'none',
    layer: null,
    blocker: 'prompt-unresolvable',
    declaredDigest: null,
    actualDigest: null,
  };
}

/**
 * Thin delegate over {@link resolvePrompt}, kept for every existing consumer (S3: "keep
 * `getAgentPrompt()` as a thin delegate"). It projects the resolver's record down to the
 * historical four-field shape — including omitting `resolvedFrom` entirely when nothing
 * resolved — so the object handed to callers is byte-identical to the pre-S3 one and the
 * richer facets cannot leak into a serialized payload that never declared them.
 */
export function getAgentPrompt(
  agentId: string,
  projectRoot: string,
): AgentPromptResolution {
  const resolved = resolvePrompt(agentId, projectRoot);
  const projected: AgentPromptResolution = {
    content: resolved.content,
    source: resolved.source,
    degraded: resolved.degraded,
  };
  if (resolved.resolvedFrom !== undefined) projected.resolvedFrom = resolved.resolvedFrom;
  return projected;
}
