// ─── Routing Engine v2 ──────────────────────────────────────────────────────
// Layer 3: The main routing orchestrator.
// Replaces selectAgent() + selectSkills() with a unified, intent-based decision.

import type { TaskScope, ModelType, ProviderName, Task } from './task-types.js';
import { TaskStatus } from './task-types.js';
import type { AgentDefinition, AgentPool } from './agent-types.js';
import type { SkillDefinition } from './skill-types.js';
import type {
  TaskDNA,
  RoutingDecision,
  RoutingEngineConfig,
  UserOverride,
  LearningBonus,
  SkillBudget,
  ConfidenceLevel,
  ActivationConfig,
  OverrideSource,
  IntentType,
} from './routing-types.js';
import {
  createDefaultRoutingEngineConfig,
  SKILL_BUDGET_BY_SIZE,
  LEARNING_BONUS_CAP,
  DEFAULT_TOKEN_BUDGET_PER_SKILL,
  DEFAULT_TOKEN_BUDGET_TOTAL,
  SKILL_TOKEN_BUDGET_BY_EFFORT,
} from './routing-types.js';
import { classifyIntent } from './intent-classifier.js';
import { evaluateActivation, migrateV1AgentToActivation, migrateV1SkillToActivation, getDynamicExclusions } from './activation-engine.js';
import type { SkillAffinityContext } from './activation-engine.js';
import { AgentSelectionCache } from './agent-cache.js';
import { analyzeSkillInMemory } from '../orchestra/ecosystem-intelligence.js';
import { resolveComposition } from './skill-selector.js';
import { modelRegistry } from './model-registry.js';
import { normalizeTechStack, taskKindToIntent } from './work-model.js';
import type { TaskKind, TechStackKind } from './work-model.js';
import { getAgentDomain, getAgentRole, type AgentDomain, type AgentRole } from './agent-pool.js';
import { debugLog } from './utils.js';
import { resolveOpenRouterDocRoute, type OpenRouterRouteConfig } from './routing-openrouter.js';
import type { FreeModelCache } from './openrouter-models.js';
import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ─── Agent Fallback Chain ──────────────────────────────────────────────────

/**
 * Intent-based agent fallback chain.
 * When no agent meets the activation score threshold, this chain provides
 * deterministic agent selection based on the task's primary intent.
 * Post-Sprint-148: test-writer removed, testing tasks route to architect/refactorer.
 * born-638 (2026-07-11): construction-intent fallbacks must be Write-capable —
 * `architect` denies Write (agent.json deniedTools:['Write'], advisory-only persona),
 * so it cannot be the fallback for tasks that must produce a diff; the prompt-gate
 * persona-capability check now BLOCKs such routes on the runSprint path (born-628).
 */
export const AGENT_FALLBACK_CHAIN: Record<IntentType, string[]> = {
  'implementation': ['refactorer', 'bug-fixer'],
  'bugfix': ['bug-fixer', 'refactorer'],
  'refactor': ['refactorer', 'architect'],
  'documentation': ['doc-writer'],
  'security': ['security-auditor'],
  'devops': ['devops-engineer', 'architect'],
  'config': ['architect', 'refactorer'],
  'performance': ['performance-analyzer', 'architect'],
  'design': ['frontend-designer'],
  'migration': ['migration-specialist', 'architect'],
  'architecture': ['architecture-planner', 'architect'],
  'unknown': ['bug-fixer', 'refactorer'],
};

/**
 * Select an agent using the fallback chain when no agent met activation threshold.
 * Iterates the chain for the given intent, returning the first agent that exists
 * in the active agent IDs set.
 *
 * @param primary - The task's primary intent type
 * @param activeAgentIds - Set of currently active (enabled) agent IDs
 * @returns The selected agent ID (defaults to 'architect' as ultimate fallback)
 */
export function selectAgentByFallback(
  primary: IntentType,
  activeAgentIds: Set<string>,
): string {
  const chain = AGENT_FALLBACK_CHAIN[primary] ?? ['bug-fixer'];
  for (const agentId of chain) {
    if (activeAgentIds.has(agentId)) return agentId;
  }
  return 'bug-fixer'; // ultimate fallback — must be Write-capable (born-638)
}

// ─── Domain-Match Bonus (Sprint 209 — Task 209-002) ────────────────────────
//
// Multi-signal scoring fix. Until Sprint 209, agent selection used only
// activation-rule score; refactorer's `intent.primary === 'implementation'`
// rule (score 7) tied or beat every domain-specialized agent in the pool,
// so api/security/devops tasks were all routed to refactorer.
//
// This adds a +DOMAIN_MATCH_BONUS boost when an agent's domain aligns
// with the task — either via the task's intent (security task →
// security-domain agent) or via a path-extracted domain name (src/api/ →
// api-builder). Refactorer/architect still receive impl@7; the bonus
// only adds a tiebreaker for domain-specialists.

/** Score added when an agent's domain matches the task's intent or
 *  one of its path-extracted domain names. Sized to match the skill
 *  `stackBonus` so a domain-specialist + activation rule beats a
 *  generic-impl candidate that has only `impl@7`. */
export const DOMAIN_MATCH_BONUS = 3;

/**
 * WM-7 routing dual — soft penalty for a language-category skill whose language
 * does NOT match the confidently-detected project stack (e.g. typescript-expert
 * on a Go project). Sized to drop a typical mis-routed language skill below
 * `skillMinScore` (3) while letting a very strongly task-signalled skill survive
 * (polyglot-safe). Soft, score-based; `- Skills:` overrides bypass routing.
 */
export const LANGUAGE_MISMATCH_PENALTY = 6;

/** Map task intent → the agent domain that should be boosted. Only
 *  intents that map cleanly to an existing built-in agent domain are
 *  listed; anything else (implementation, refactor, bugfix, …) yields
 *  no domain bonus and falls through to standard scoring. */
export const INTENT_TO_AGENT_DOMAIN: Partial<Record<IntentType, AgentDomain>> = {
  security: 'security',
  devops: 'devops',
  design: 'react',
  documentation: 'doc',
  migration: 'data',
};

/** Map a path-extracted task domain name (TaskDNA.domains[].name) →
 *  the specific built-in agent that owns that domain. Used when the
 *  task intent itself doesn't carry the signal — e.g. an api task is
 *  classified as `implementation` intent, but its `src/api/` scope
 *  populates TaskDNA.domains with `api`, which is the routing hook. */
export const TASK_DOMAIN_TO_AGENT_ID: Readonly<Record<string, string>> = {
  api: 'api-builder',
  auth: 'security-auditor',
  dashboard: 'frontend-designer',
  components: 'frontend-designer',
  ui: 'frontend-designer',
  db: 'data-engineer',
  database: 'data-engineer',
  models: 'data-engineer',
  schemas: 'data-engineer',
  docker: 'devops-engineer',
  kubernetes: 'devops-engineer',
  k8s: 'devops-engineer',
  helm: 'devops-engineer',
};

/** ROUTE-1 B2 — intents that mark a task as a TOUCH-UP rather than a surface build.
 *  For these the path-extracted domain proxy + user-surface bonus are suppressed so a
 *  comment-sweep / doc edit touching src/api/ is not hijacked by api-builder. The
 *  intent-driven domain bonus (INTENT_TO_AGENT_DOMAIN, path 1) is NOT affected. */
const SURFACE_SUPPRESS_INTENTS: ReadonlySet<IntentType> = new Set<IntentType>(['refactor', 'documentation']);

/** ROUTE-1 B2 — canonical TaskKinds (medium axis) that also suppress the path proxy. */
const SURFACE_SUPPRESS_KINDS: ReadonlySet<TaskKind> = new Set<TaskKind>(['audit', 'documentation']);

/**
 * True when the task is genuinely building/extending its surface — path-proxy and
 * user-surface bonuses apply. False for touch-up / non-build work (bonuses suppressed).
 * OR semantics: suppression fires on either the operation arm (intent) or the medium
 * arm (taskKind), so a code-development-medium refactor-operation is still suppressed.
 */
export function isSurfaceBuildTask(intent: IntentType, taskKind?: TaskKind): boolean {
  if (SURFACE_SUPPRESS_INTENTS.has(intent)) return false;
  if (taskKind !== undefined && SURFACE_SUPPRESS_KINDS.has(taskKind)) return false;
  return true;
}

/**
 * Return the domain-match bonus for an agent against a task's DNA.
 *
 * Two match paths, either one yields +DOMAIN_MATCH_BONUS (no doubling):
 *   1. Intent-to-domain: the task's primary intent maps to an agent
 *      domain in INTENT_TO_AGENT_DOMAIN, and the agent's domain matches.
 *   2. Task-domain-to-agent: the agent id appears in
 *      TASK_DOMAIN_TO_AGENT_ID for one of the task's extracted domain
 *      names.
 *
 * @param agentId        The agent id being scored.
 * @param agentDomain    The agent's domain (from getAgentDomain).
 * @param taskDNA        The classified task.
 * @param allowPathProxy When false, path 2 (domain-name proxy) is suppressed;
 *                       path 1 (intent-driven) always runs. Defaults to true so
 *                       existing 3-arg callers are byte-for-byte unchanged.
 * @param scopeDomain    ROUTE-DOMAIN-SCOPE (born-470, Sprint 359 Task 359-005):
 *                       when truthy, REPLACES the path-2 taskDNA.domains lookup
 *                       (priority, not additive — see SCOPE_DOMAIN_TO_AGENT_ID
 *                       below). `undefined` (every pre-359-005 call site) or
 *                       `null` (scope-domain flag on but no curated match) both
 *                       fall through to the generic path-2 lookup unchanged.
 * @returns DOMAIN_MATCH_BONUS on match, 0 otherwise.
 */
export function getDomainMatchBonus(
  agentId: string,
  agentDomain: AgentDomain | 'generic',
  taskDNA: TaskDNA,
  allowPathProxy: boolean = true,
  scopeDomain?: string | null,
): number {
  // Path 1: intent → agent domain (intent-driven, always honoured).
  const targetDomain = INTENT_TO_AGENT_DOMAIN[taskDNA.intent.primary];
  if (targetDomain && agentDomain === targetDomain) {
    return DOMAIN_MATCH_BONUS;
  }

  // Path 2: extracted task domain name → specific agent id (path proxy, gated).
  if (allowPathProxy) {
    if (scopeDomain) {
      // born-470: curated scope-domain replaces the generic lookup below.
      const expectedAgent = SCOPE_DOMAIN_TO_AGENT_ID[scopeDomain];
      return expectedAgent === agentId ? DOMAIN_MATCH_BONUS : 0;
    }
    for (const domain of taskDNA.domains) {
      const expectedAgent = TASK_DOMAIN_TO_AGENT_ID[domain.name.toLowerCase()];
      if (expectedAgent && expectedAgent === agentId) {
        return DOMAIN_MATCH_BONUS;
      }
    }
  }

  return 0;
}

/**
 * User-surface routing (Sprint 216-003; reconstructed Sprint 218 after a
 * `git reset --hard` wiped the original). A user-facing surface (cli / dashboard
 * / api / serve / e2e harness) must route to its surface-owner agent, not
 * collapse to refactorer's generic impl@7. The bonus (8) clears refactorer's 7
 * even when the agent's own activation rule does not fire (e.g. api-builder's
 * `domains $contains 'api'` rule is silent for a `cli` domain).
 */
export const USER_SURFACE_BONUS = 8;

/** Surface domain name (from TaskDNA.domains/tags) → owning agent id. */
export const SURFACE_DOMAIN_TO_AGENT_ID: Readonly<Record<string, string>> = {
  cli: 'api-builder',
  commands: 'api-builder',
  serve: 'api-builder',
  api: 'api-builder',
  dashboard: 'frontend-designer',
  components: 'frontend-designer',
  ui: 'frontend-designer',
  e2e: 'ci-guardian',
  harness: 'ci-guardian',
};

/** Agents eligible for the user-surface bonus (surface owners). */
export const USER_SURFACE_AGENTS: ReadonlySet<string> = new Set([
  'api-builder',
  'frontend-designer',
  'ci-guardian',
]);

/**
 * Returns USER_SURFACE_BONUS when `agentId` is the surface owner of one of the
 * task's surface domains/tags, else 0. Non-surface agents (refactorer, …) never
 * receive it — that is the anti-collapse guarantee.
 *
 * @param scopeDomain ROUTE-DOMAIN-SCOPE (born-470, Sprint 359 Task 359-005):
 *   when truthy, REPLACES the generic `taskDNA.domains`/tags signals lookup below
 *   (priority, not additive — see {@link SCOPE_DOMAIN_TO_AGENT_ID}). `undefined`
 *   (the default — every pre-359-005 call site) or `null` (scope-domain flag on but
 *   no curated match for this scope) both fall through to the generic lookup, so
 *   this param is 100% opt-in and byte-identical when omitted.
 */
export function getUserSurfaceBonus(agentId: string, taskDNA: TaskDNA, scopeDomain?: string | null): number {
  if (!USER_SURFACE_AGENTS.has(agentId)) return 0;
  const signals = [
    ...taskDNA.domains.map((d) => d.name.toLowerCase()),
    ...((taskDNA.tags ?? []) as string[]).map((t) => String(t).toLowerCase()),
  ];
  // Security/auth tasks belong to security-auditor even when they touch
  // `src/api/` — the surface bonus must NOT divert them to api-builder.
  const hasSecuritySignal =
    taskDNA.intent.primary === 'security' ||
    signals.some((s) => s === 'auth' || s === 'security' || s === 'rbac');
  if (hasSecuritySignal && agentId === 'api-builder') return 0;

  if (scopeDomain) {
    // born-470: curated scope-domain replaces the generic signals lookup below.
    const expectedAgent = SCOPE_DOMAIN_TO_AGENT_ID[scopeDomain];
    return expectedAgent === agentId ? USER_SURFACE_BONUS : 0;
  }

  for (const s of signals) {
    if (SURFACE_DOMAIN_TO_AGENT_ID[s] === agentId) return USER_SURFACE_BONUS;
  }
  return 0;
}

// ─── TESTING-INTENT — test-dominant ownership bonus (born-594) ─────────────
//
// Audit root-cause #3 (sprint-agent-skill-prompt-audit-2026-07-10.md §0/A1/E-P1#8):
// a task whose write scope is MAJORITY test-file writes, combined with a
// test-fix-flavored title/description, classifies as `implementation` intent
// (Sprint 148 retired the standalone 'testing' IntentType — see intent-classifier.ts
// line 17/507). ci-guardian's manifest EXCLUDES `intent.primary === 'implementation'`
// outright, and bug-fixer's sole rule (`intent.primary === 'bugfix'`) never fires for
// 'implementation' — so every test-sweep task forced onto either agent trips an
// overrideWarning (9/9 observed in sprint-391). `IntentType` (routing-types.ts) is a
// cross-subsystem SSOT outside this task's single-writer scope (routing-engine.ts
// only) — adding a 'testing' member there would ripple through every
// `Record<IntentType, …>` consumer across core/orchestra, none of which are in scope
// here (manifest vocabulary work is born-601's). This is therefore a routing-engine-
// only ownership fix, in the same spirit as DOMAIN_MATCH_BONUS/USER_SURFACE_BONUS
// above: a real test-dominant signal grants ci-guardian + bug-fixer a bypass-strength
// bonus (same magnitude/bypass mechanics as USER_SURFACE_BONUS, Sprint 216-003) so
// they become the live owners of test-dominant work without a manifest edit.

/** Majority threshold for "scope/files çoğunluğu tests/" — half or more of a task's
 *  write scope is test files. */
export const TEST_DOMINANT_WRITE_RATIO_THRESHOLD = 0.5;

const TEST_NOUN_PATTERN = /\btest(s|ing)?\b/i;
const TEST_FIX_VERB_PATTERN = /\b(fix|sweep|flak\w*|regression|stabiliz\w*|hermetic)\b/i;

/**
 * True when a task reads as a test-dominant sweep/fix: MAJORITY of its write scope
 * is test files (`taskDNA.scope.testWriteRatio`) AND its title/description carries a
 * test-fix pattern (a "test" noun co-occurring with a fix/sweep/regression verb).
 * Both signals are required — a task that merely touches one incidental test file
 * alongside a src/ feature build (e.g. the T-145-004 fixture in
 * agent-routing-health.test.ts) must NOT be reclassified; requiring the text
 * pattern too keeps this narrow.
 */
export function isTestDominantTask(taskDNA: TaskDNA, taskText: string): boolean {
  return (
    taskDNA.scope.testWriteRatio >= TEST_DOMINANT_WRITE_RATIO_THRESHOLD &&
    TEST_NOUN_PATTERN.test(taskText) &&
    TEST_FIX_VERB_PATTERN.test(taskText)
  );
}

/** Bypass-strength bonus — sized to match USER_SURFACE_BONUS's precedent: large
 *  enough to (a) clear refactorer's generic impl@7 candidate score and (b) act as
 *  the nonzero signal that bypasses an agent's own activation-exclude rule (mirrors
 *  the surfaceBonus bypass mechanics in selectBestAgent below). */
export const TEST_OWNERSHIP_BONUS = 8;

/** The curated, narrow "live owners" of test-dominant work — exactly the two agents
 *  named in born-594 (ci-guardian, bug-fixer). Not derived from any domain/surface
 *  table; a hardcoded set by design, matching USER_SURFACE_AGENTS' precedent. */
export const TEST_OWNERSHIP_AGENTS: ReadonlySet<string> = new Set(['ci-guardian', 'bug-fixer']);

/** Returns TEST_OWNERSHIP_BONUS when `agentId` is a curated test-owner AND the task
 *  is test-dominant, else 0. */
export function getTestOwnershipBonus(agentId: string, testDominant: boolean): number {
  return testDominant && TEST_OWNERSHIP_AGENTS.has(agentId) ? TEST_OWNERSHIP_BONUS : 0;
}

// ─── ROUTE-DOMAIN-SCOPE — scope-path domain extraction (born-470) ──────────
//
// born-470 (3-sprint-proven, 358-002: APR-XPROC-WIRE): the generic path-proxy
// domain signal (TaskDNA.domains, populated by intent-classifier's first-path-
// segment extraction) is too coarse for agent routing. A REPL/Ink task scoped
// under `src/cli/repl/` extracts the bare domain name `'cli'`, which
// SURFACE_DOMAIN_TO_AGENT_ID maps to `'api-builder'` — so terminal-UI work was
// routed to the REST/HTTP specialist purely because `cli` and the api surface
// happen to share a path segment ('src/cli/...' vs 'src/api/...'), not because
// the task has anything to do with APIs.
//
// This section adds a curated, more specific scope-domain extraction —
// flag-gated via `RoutingOptions.domainFromScope` (default-off). When enabled
// and a task's scope matches one of the curated prefixes below, the resulting
// domain name REPLACES (priority, not additive weight) the generic path-proxy
// domain for the two domain-driven agent bonuses (`getDomainMatchBonus` path 2,
// `getUserSurfaceBonus`). Flag-off is byte-identical to pre-359-005 routing.

/** Curated scope-path-prefix → canonical domain name. Order matters: a more
 *  specific prefix (`src/cli/repl`) must be listed before its broader parent
 *  (`src/cli`) — `extractScopeDomain` returns the FIRST match. Both entries
 *  resolve to the same 'terminal-ui' domain today, so the ordering has no
 *  observable effect yet, but is kept correct for when the two diverge. */
const SCOPE_DOMAIN_PATTERNS: ReadonlyArray<{ prefix: RegExp; domain: string }> = [
  { prefix: /^src\/cli\/repl(\/|$)/, domain: 'terminal-ui' },
  { prefix: /^src\/cli(\/|$)/, domain: 'terminal-ui' },
  { prefix: /^src\/api(\/|$)/, domain: 'api' },
  { prefix: /^src\/dashboard(\/|$)/, domain: 'frontend' },
  { prefix: /^src\/core(\/|$)/, domain: 'core' },
  { prefix: /^src\/orchestra(\/|$)/, domain: 'orchestration' },
  { prefix: /^docs(\/|$)/, domain: 'doc' },
  { prefix: /^src\/connectors(\/|$)/, domain: 'messaging' },
];

/**
 * Extract the curated scope-domain for a task from its write scope
 * (`scope.filesWrite`, then `scope.directories` — the born-470 "path-önekleri"
 * signal). Returns the first curated-table match across all scope paths, or
 * `null` when nothing matches (no curated opinion — callers fall through to
 * the generic taskDNA.domains-driven lookup for that scope).
 */
export function extractScopeDomain(scope: TaskScope): string | null {
  const paths = [...scope.filesWrite, ...scope.directories];
  for (const path of paths) {
    for (const { prefix, domain } of SCOPE_DOMAIN_PATTERNS) {
      if (prefix.test(path)) return domain;
    }
  }
  return null;
}

/**
 * Curated scope-domain → owning agent id. Only domains with a genuine built-in
 * specialist agent are listed (verified against `BUILTIN_AGENT_DOMAINS` in
 * agent-pool.ts).
 *
 * R-1b (2026-07-08 routing-skew fix): `'terminal-ui'` now maps to
 * `terminal-ux-engineer` (its own `domain: 'terminal-ui'` agent, activation rule
 * `domains $contains 'terminal-ui' → 8`). Previously it mapped to NOTHING because
 * that agent did not exist when born-470 landed — so a REPL/CLI task's api-builder
 * surface bonus was merely *suppressed*, dropping the task to refactorer's generic
 * impl@7 (the empirical 39-task shadow: refactorer 24 + api-builder 15, zero
 * terminal-ux-engineer). Mapping terminal-ui → terminal-ux-engineer gives it the
 * +DOMAIN_MATCH_BONUS that clears refactorer's 7, routing terminal work to the
 * terminal specialist. `'core'`/`'orchestration'`/`'messaging'` still map to
 * nothing (no dedicated specialist → generic scoring decides).
 */
export const SCOPE_DOMAIN_TO_AGENT_ID: Readonly<Record<string, string>> = {
  api: 'api-builder',
  frontend: 'frontend-designer',
  doc: 'doc-writer',
  'terminal-ui': 'terminal-ux-engineer',
};

// ─── DOMAIN-ALIAS — kural-vocabulary ↔ detectDomains emisyon-vocabulary (born-589) ──
//
// sprint-agent-skill-prompt-audit-2026-07-10.md (§0/B/C) found that `detectDomains`
// (intent-classifier.ts) emits path-SEGMENT names (orchestra, core, cli, dashboard,
// connectors, docker, mcp, …) extracted from scope.filesWrite/filesRead/directories, while a
// number of built-in agent/skill `activation.rules` check `domains.$contains <word>` against a
// DIFFERENT vocabulary detectDomains can never emit — e.g. sh-portability's sole rule checks
// `orchestration`, but the only value detectDomains ever emits for that module is `orchestra`.
//
// This is a RULE-EVALUATION-LAYER fix only, by design: `withAliasedDomains` returns a
// scoring-only COPY of a task's `domains` array (the input is never mutated) with each present
// segment's alias siblings appended, so `evaluateActivation`'s `domains.$contains` check sees
// both the real segment and every rule-vocabulary alias for it. `routeTaskV2`'s returned/
// persisted `taskDNA` (the TaskDNA-filter / learning key) is untouched by this — normalizing the
// alias into detectDomains' own OUTPUT would silently re-key historical learning data, which is
// why expansion happens only immediately before each `evaluateActivation(...)` call, never inside
// intent-classifier.ts.
//
// Every group below is a REAL segment whose ENTIRE purpose (not merely a narrow sub-topic within
// a broader, multi-purpose directory) matches every alias word in the group — e.g. `dashboard`
// IS exclusively frontend/UI code, so `frontend`/`accessibility`/`css` are safe 1:1 synonyms. A
// narrow sub-topic living inside a broad, multi-purpose directory (e.g. "database" work is only
// ONE of many unrelated concerns inside `core/`; "onboarding" wizard code is only one of many
// concerns inside `cli/`) is deliberately NOT aliased here — reviving it would make the owning
// rule newly fire on every unrelated task that merely shares the broad directory, which is a
// scoring-formula change in disguise, not a vocabulary fix (verified against
// tests/core/routing-live-diversity.test.ts, which asserts an unrelated `src/core/` task must
// still route to `refactorer`, not `data-engineer`/`architecture-planner`).
//
// A SECOND, independently-discovered danger: a group must NOT be added when the target
// agent/skill already has its OWN separate, currently-real rule for a DIFFERENT word in the same
// group — reviving the dead sibling would then ADD to (not merely replace zero with) an
// already-functioning score, which is exactly the scoring-formula change the nogo forbids, not a
// vocabulary fix. Two candidate groups failed this check and are deliberately excluded:
//   - `cli`/`terminal-ui`: terminal-ux-engineer has BOTH `cli`@6 (real) AND `terminal-ui`@8 (dead)
//     as separate rules; aliasing would stack them to 14, which flips
//     tests/core/route-domain-scope.test.ts's flag-off legacy-collapse assertions (proven by
//     running the suite — 2 failures).
//   - `connectors`/`messaging`/`integrations`: integration-engineer has `connectors`@8 (real) AND
//     `messaging`@8 + `integrations`@6 (dead) as three separate rules; aliasing stacks them to 22
//     — empirically flips a large connectors-scoped task from `architect` (16) to
//     `integration-engineer` (22), a routing DECISION change, not just an internal score change.
// Both un-aliasable words are exactly the ones scripts/lint-rule-vocabulary.mjs documents in its
// known-orphan baseline as manifest-content work for a future task (e.g. collapsing the
// redundant pair down to a single rule).

/** Real segment ↔ rule-vocabulary alias groups. Exported so both the vocabulary-lint script
 *  (scripts/lint-rule-vocabulary.mjs mirrors this list — keep the two in sync) and
 *  tests/core/routing-domain-alias.test.ts share this exact catalogue instead of re-deriving it.
 *  A word may appear in more than one group (none currently do); `buildDomainAliasIndex` unions
 *  a word's siblings across every group it belongs to. */
export const DOMAIN_ALIAS_GROUPS: ReadonlyArray<readonly string[]> = [
  // sh-portability's sole activation rule checks `orchestration`; the real directory is `orchestra`.
  ['orchestra', 'orchestration'],
  // frontend-designer / frontend-design (`frontend`), accessibility-auditor / accessibility-expert
  // (`accessibility`) and frontend-design's second rule (`css`) all target the real `dashboard`
  // segment — every one of these agents/skills lists `src/dashboard/` in its own triggerScopes,
  // and NONE of them also carries a separate, already-real rule for `dashboard` itself.
  ['dashboard', 'frontend', 'accessibility', 'css'],
  // devops-engineer's `infrastructure` — the closest real segment reachable from its own
  // triggerScopes (`docker/`, `.github/`, `infra/`, `scripts/`) is `docker` (tests/docker/ exists;
  // `.github/` is filtered by extractDomainFromPath's dot-guard, `infra/` doesn't exist in-repo).
  // devops-engineer has no separate, already-real `docker` rule of its own to stack with.
  ['docker', 'infrastructure'],
  // rpc-protocol's `rpc` — this project's RPC/dispatch-envelope surface is the MCP server's
  // stdio JSON-RPC-style tool dispatch (`src/mcp/`), which is the module's entire reason for
  // being. No manifest carries a separate, already-real `mcp` rule to stack with.
  ['mcp', 'rpc'],
];

/** Word → its alias siblings (excluding itself), unioned across every DOMAIN_ALIAS_GROUPS entry
 *  the word belongs to. Built once at module load — the group list is a small, static literal. */
function buildDomainAliasIndex(groups: ReadonlyArray<readonly string[]>): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const word of group) {
      const siblings = index.get(word) ?? new Set<string>();
      for (const sibling of group) {
        if (sibling !== word) siblings.add(sibling);
      }
      index.set(word, siblings);
    }
  }
  return index;
}

const domainAliasIndex = buildDomainAliasIndex(DOMAIN_ALIAS_GROUPS);

/**
 * Return a TaskDNA whose `domains` array is expanded with alias siblings for every segment
 * already present — a scoring-only view for `evaluateActivation`'s `domains.$contains` checks.
 * Never mutates `taskDNA` or its `.domains` array; returns the SAME reference when no alias
 * applies (the common case) so callers pay no allocation cost for the vast majority of tasks.
 */
export function withAliasedDomains(taskDNA: TaskDNA): TaskDNA {
  const present = new Set(taskDNA.domains.map((d) => d.name));
  const extra: Array<{ name: string; weight: number }> = [];
  for (const domain of taskDNA.domains) {
    const siblings = domainAliasIndex.get(domain.name);
    if (!siblings) continue;
    for (const alias of siblings) {
      if (!present.has(alias)) {
        present.add(alias);
        extra.push({ name: alias, weight: domain.weight });
      }
    }
  }
  if (extra.length === 0) return taskDNA;
  return { ...taskDNA, domains: [...taskDNA.domains, ...extra] };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RoutingOptions {
  projectStack?: { language: string; framework: string; dependencies: string[] } | null;
  overrides?: UserOverride[];
  learningData?: LearningBonus[];
  config?: Partial<RoutingEngineConfig>;
  /** Task effort level for dynamic skill token budget calculation */
  effort?: 'low' | 'normal' | 'high';
  /** Sprint ID for decision trail persistence */
  sprintId?: string;
  /** Task ID for decision trail persistence */
  taskId?: string;
  /** Project root for decision trail persistence */
  projectRoot?: string;
  /** Estimated token count for the task's full worker prompt (from estimateTaskContextBudget) */
  estimatedTokens?: number;
  /** Model ID assigned to the task — used for context budget fit assessment */
  modelId?: string;
  /** Set of active agent IDs for fallback chain resolution */
  activeAgentIds?: Set<string>;
  /**
   * Enable skill→agent affinity bonus (ADR-075). Default-off.
   * When true, agents receive SKILL_AGENT_AFFINITY_BONUS when an assigned skill
   * maps to them in SKILL_AGENT_MAP. Skills are selected BEFORE agent selection
   * (skill-first ordering) so the affinity signal is always available.
   */
  skillAgentAffinity?: boolean;
  /**
   * Enable kind-affinity bonus (PCOMP-W5C, Sprint 352-008). Default-off.
   * When true, `getKindAffinityBonus` is folded into agent scoring: the
   * 'refactorer' agent gets +KIND_AFFINITY_BONUS on a 'refactor'-kind task and
   * KIND_AFFINITY_CODE_DEV_PENALTY on a 'code-development'-kind task. Flag-off
   * is byte-identical to pre-352-008 routing.
   */
  kindAffinity?: boolean;
  /**
   * Enable task/agent-prompt language-mismatch penalty (WM-7, Sprint 355-008).
   * Default-off. When true, `detectHeuristicLanguage` classifies the task text
   * (title+description) and each agent's persona text (description+systemPrompt)
   * via a simple TR-char/word-ratio heuristic; a confident TR/EN mismatch costs
   * the agent AGENT_LANGUAGE_MISMATCH_PENALTY. Mirrors the kindAffinity /
   * getRoleMismatchPenalty additive-tiebreaker pattern — never exclusionary.
   * Flag-off is byte-identical to pre-355-008 routing.
   */
  languagePenalty?: boolean;
  /**
   * Enable agent selection cache. Default-off.
   * When true, selectBestAgent results are memoized via agentSelectionCache.
   * Cache key includes selected skill IDs so affinity-on cache is correct.
   * Call agentSelectionCache.clear() when pool or config changes.
   */
  agentCache?: boolean;
  /**
   * Enable scope-path domain extraction (ROUTE-DOMAIN-SCOPE, born-470,
   * Sprint 359 Task 359-005). Default-off. When true, `extractScopeDomain`
   * derives a curated domain name from the task's scope path prefixes
   * (src/cli/repl|src/cli→terminal-ui, src/api→api, src/dashboard→frontend,
   * src/core→core, src/orchestra→orchestration, docs→doc,
   * src/connectors→messaging) and, when a curated match is found, that domain
   * REPLACES (priority, not additive weight) the generic path-proxy domain
   * signal for `getDomainMatchBonus`/`getUserSurfaceBonus` — fixing the
   * born-470 class of bug where a REPL/Ink task under `src/cli/` was routed to
   * api-builder purely because 'cli' and 'api' share the `SURFACE_DOMAIN_TO_AGENT_ID`
   * lookup table. Mirrors the kindAffinity/languagePenalty additive-tiebreaker
   * pattern in spirit (config-gated, non-exclusionary at the option level) but
   * is a REPLACE at the bonus-lookup level, not an add. Flag-off is
   * byte-identical to pre-359-005 routing.
   */
  domainFromScope?: boolean;
  /**
   * Enable the OpenRouter doc-route provider-suggestion wire (OPENROUTER-DOC-ROUTE,
   * Sprint 362 Task 362-006). Default-off. When true AND `openRouterConfig` +
   * `openRouterCache` are BOTH supplied, `resolveOpenRouterDocRoute` (361-003,
   * previously a standalone pure function — see routing-openrouter.ts's own
   * "slice 2" follow-up note) is consulted for the task. The result is
   * appended to `RoutingDecision.reasoning` as text — `RoutingDecision` has no
   * dedicated field for it (routing-types.ts is outside this task's write
   * scope), mirroring how `domainFromScope`'s scopeDomain is surfaced above.
   * NEVER overrides an existing `task.forceModel`/`task.provider` — those are
   * checked BEFORE the resolver is even consulted, regardless of this flag
   * (ASLA-override guarantee). Flag-off is byte-identical to pre-362-006
   * routing: the whole block is skipped, zero reasoning lines added.
   */
  openRouterDocRoute?: boolean;
  /** Config consulted by the OpenRouter doc-route wire — see `openRouterDocRoute`. */
  openRouterConfig?: OpenRouterRouteConfig;
  /** Free-model cache consulted by the OpenRouter doc-route wire — see `openRouterDocRoute`. */
  openRouterCache?: FreeModelCache;
}

// ─── Agent Selection Cache (module-level singleton) ─────────────────────────
//
// Exported so callers can call .clear() when the agent pool or routing config
// changes (pool/config-change invalidation — required by agentCache flag semantics).
// Default-off (agentCache option must be true for it to be used).

export const agentSelectionCache = new AgentSelectionCache();

interface ScoredCandidate {
  id: string;
  rawScore: number;
  learningBonus: number;
  finalScore: number;
  matchedRules: string[];
}

// ─── ROUTING-DECISION-JOURNAL (born-622, Sprint 402 Task 402-003) ──────────
//
// selectBestAgent computes a multi-signal score per candidate but the
// decision-moment breakdown was never persisted anywhere — routing was
// unauditable ("why did api-builder win/lose", 397-007). This is a SEPARATE
// concern from `.deckent/routing/outcomes/` (post-hoc evaluation outcomes,
// outcome-tracker.ts) and `.deckent/runtime/decisions/` (free-text reasoning
// steps, decision-logger.ts): this journal captures the raw per-candidate
// numeric signal breakdown at the moment selectBestAgent decides.
//
// Fail-soft (ADR-G-009), mirrors `recordSprintWorkerTrace` in
// src/orchestra/output-collector.ts: a journal-write error must NEVER affect
// routing. Signals are harvested from already-computed intermediate values
// inside selectBestAgent's existing scoring loop — never recomputed.

const ROUTING_DECISIONS_DIR = '.deckent/routing/decisions';

/** One scored candidate at a routing decision point — signals are the exact
 *  already-computed bonus/penalty contributions that summed to `totalScore`. */
export interface RoutingDecisionCandidate {
  agentId: string;
  totalScore: number;
  signals: Record<string, number>;
  /** True only when this candidate was under an active exclude rule
   *  (override-exclude or activation-exclude) that a surface/test-ownership
   *  bonus bypassed — not merely "has a nonzero surface/test bonus". */
  bypass: boolean;
}

/** One selectBestAgent decision-moment record, appended to the sprint's
 *  decision journal (one JSON object per line). */
export interface RoutingDecisionRecord {
  taskId: string;
  sprintId: string;
  ts: string;
  candidates: RoutingDecisionCandidate[];
  winner: string | null;
  reason: string;
  /** True when this record reflects an agent-selection-cache hit — no
   *  per-signal breakdown is available from the cache entry (honest-empty,
   *  never fabricated/recomputed). */
  cached: boolean;
}

/** Path to this sprint's decision journal — mirrors the sprint-scoped,
 *  append-only convention of `.deckent/routing/outcomes/<sprintId>.json`. */
export function routingDecisionJournalPath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, ROUTING_DECISIONS_DIR, `sprint-${sprintId}.jsonl`);
}

/**
 * Append one routing decision record to the sprint's decision journal.
 * Fail-soft (ADR-G-009): any read/mkdir/write error is swallowed — a
 * decision-journal write failure must never affect routing. No-op when
 * `projectRoot` is not supplied (missing decision-trail context).
 */
function appendRoutingDecisionRecord(
  projectRoot: string | undefined,
  record: RoutingDecisionRecord,
): void {
  if (!projectRoot) return;
  try {
    const filePath = routingDecisionJournalPath(projectRoot, record.sprintId);
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  } catch {
    // Fail-soft (ADR-G-009): a decision-journal write error must never affect routing.
  }
}

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Route a task to the best agent + skills using the v2 intent-based engine.
 *
 * Skill-first ordering (Sprint 324-007): skills are selected BEFORE the agent so
 * the assigned skill IDs are available as an affinity signal for agent scoring
 * (`skillAgentAffinity` flag, default-off). When both flags are off the routing
 * output is byte-identical to the pre-reorder behavior.
 */
/**
 * Suggest the closest registered skill id for an unknown/typo'd forced skill.
 * Cheap heuristic (no full edit-distance): prefer a pool id in a prefix/substring
 * relationship with the unknown id, then one sharing its first token — this catches
 * the dominant real cases ('testing' → 'testing-expert', 'typescript' → 'typescript-expert').
 * Returns undefined when nothing plausible matches (caller then just reports "dropped").
 */
function suggestNearestSkill(
  unknown: string,
  skillPool: Map<string, SkillDefinition>,
): string | undefined {
  const u = unknown.toLowerCase();
  const ids = [...skillPool.keys()];
  const prefixMatch = ids.find(
    (id) => id.toLowerCase().startsWith(u) || u.startsWith(id.toLowerCase()),
  );
  if (prefixMatch) return prefixMatch;
  const firstToken = u.split(/[-_]/)[0];
  return ids.find((id) => id.toLowerCase().split(/[-_]/)[0] === firstToken);
}

export function routeTaskV2(
  task: {
    title: string; description: string; scope: TaskScope; type?: TaskKind;
    /** ASLA-override guard for the OpenRouter doc-route wire — see `RoutingOptions.openRouterDocRoute`. */
    forceModel?: ModelType;
    /** ASLA-override guard for the OpenRouter doc-route wire — see `RoutingOptions.openRouterDocRoute`. */
    provider?: ProviderName;
  },
  agentPool: AgentPool,
  skillPool: Map<string, SkillDefinition>,
  options?: RoutingOptions,
): RoutingDecision {
  const cfg = { ...createDefaultRoutingEngineConfig(), ...options?.config };
  const overrides = options?.overrides ?? [];
  const learningData = options?.learningData ?? [];
  const reasoning: string[] = [];
  const overrideWarnings: string[] = [];
  const skillAgentAffinityEnabled = options?.skillAgentAffinity ?? false;
  const kindAffinityEnabled = options?.kindAffinity ?? false;
  const languagePenaltyEnabled = options?.languagePenalty ?? false;
  const agentCacheEnabled = options?.agentCache ?? false;
  // R-1b (2026-07-08): born-470 curated scope-domain extraction is now ON by
  // default (was default-off, "3-sprint-proven" pending a flip). The retrospective
  // 39-task shadow proved the default-off routing collapses to 2 generic attractors
  // (refactorer 24 + api-builder 15, 100% skew); scope-domain routing sends a
  // src/cli/repl task to terminal-ux-engineer instead. A caller may still pass
  // `domainFromScope: false` to restore the pre-R-1b path.
  const domainFromScopeEnabled = options?.domainFromScope ?? true;
  // born-470: hoisted once — identical for every candidate this call.
  const scopeDomain = domainFromScopeEnabled ? extractScopeDomain(task.scope) : undefined;

  // Step 1: Classify task intent
  const taskDNA = classifyIntent(task);
  reasoning.push(`Intent: ${taskDNA.intent.primary} (confidence: ${taskDNA.intent.confidence})`);
  if (domainFromScopeEnabled) {
    reasoning.push(`Scope-domain (born-470): ${scopeDomain ? `'${scopeDomain}'` : 'none (no curated match)'}`);
  }

  // born-594 — test-dominant ownership signal (routing-engine-only; see isTestDominantTask
  // above). Always-on, matching the born-589 domain-alias precedent (no new option flag).
  const taskText = `${task.title} ${task.description}`;
  const testDominant = isTestDominantTask(taskDNA, taskText);
  reasoning.push(
    testDominant
      ? "Test-dominant signal (born-594): true — effective intent='testing' (ci-guardian/bug-fixer ownership eligible)"
      : 'Test-dominant signal (born-594): false',
  );

  // OPENROUTER-DOC-ROUTE wire (Sprint 362 Task 362-006) — see RoutingOptions.openRouterDocRoute.
  const openRouterDocRouteEnabled = options?.openRouterDocRoute ?? false;
  if (openRouterDocRouteEnabled) {
    if (task.forceModel || task.provider) {
      // ASLA-override guarantee: an existing forceModel/provider short-circuits
      // BEFORE the resolver is even consulted — never overridden.
      const setField = task.forceModel ? `forceModel='${task.forceModel}'` : `provider='${task.provider}'`;
      reasoning.push(`OpenRouter doc-route: skipped — task already has ${setField} (never overridden)`);
    } else if (!options?.openRouterConfig || !options?.openRouterCache) {
      reasoning.push('OpenRouter doc-route: flag on but openRouterConfig/openRouterCache not supplied — skipped');
    } else {
      // resolveOpenRouterDocRoute requires the full Task shape, but only ever
      // reads `.type`/`.scope` internally (isDocKindTask/isDocKindScope, private
      // helpers mirrored-not-exported by that module's own precedent). The
      // fields below beyond title/description/scope/type are structurally
      // required placeholders, never read by the resolver.
      const docRouteTask: Task = {
        id: options?.taskId ?? '',
        title: task.title,
        description: task.description,
        model: 'sonnet',
        effort: 'normal',
        priority: 'NORMAL',
        reason: '',
        scope: task.scope,
        dependencies: [],
        goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
        status: TaskStatus.DRAFT,
        type: task.type,
      };
      const suggestion = resolveOpenRouterDocRoute(docRouteTask, options.openRouterConfig, options.openRouterCache);
      reasoning.push(
        suggestion
          ? `OpenRouter doc-route suggestion: provider='${suggestion.provider}', model='${suggestion.model}'`
          : 'OpenRouter doc-route: no suggestion (not doc-kind, or model not cache-validated)',
      );
    }
  }

  // ROUTE-1 B3 — when the keyword classifier cannot resolve an intent, fall back to the
  // canonical TaskKind SSOT (scope-shape) instead of 'unknown'. Confident classifications
  // are never overridden — the operation axis outranks the medium axis.
  if (taskDNA.intent.primary === 'unknown' && task.type !== undefined) {
    const kindIntent = taskKindToIntent(task.type);
    if (kindIntent !== 'unknown') {
      taskDNA.intent.primary = kindIntent;
      taskDNA.intent.confidence = 0.5; // SSOT-derived intent — modest confidence, not classifier-certain
      reasoning.push(`Intent from TaskKind SSOT: ${kindIntent} (task.type=${task.type})`);
    }
  }

  // Step 2: Resolve user overrides
  const resolved = resolveOverrides(overrides);
  let overrideSource: OverrideSource = 'none';
  if (resolved.forceAgent || resolved.forceSkills) {
    overrideSource = overrides[0]?.source ?? 'task-directive';
  }

  // Step 3: Calculate skill budget (effort-aware token allocation)
  // Moved before agent selection so skill IDs are available as affinity signal.
  const skillBudget = calculateSkillBudget(taskDNA, cfg, options?.effort);
  reasoning.push(`Skill budget: max ${skillBudget.maxSkills} (${skillBudget.reason})`);

  // Step 4: Select skills (skill-first — before agent, for affinity signal)
  let skillIds: string[] = [];
  const skillScores = new Map<string, number>();
  let skillConfidence: ConfidenceLevel = 'uncertain';

  if (resolved.forceSkills !== undefined) {
    // forceSkills=[] means "Skills: none" (explicit no-skills directive), respect it.
    // Validate every forced id against the real skill pool BEFORE it enters
    // task.assignedSkills: an unknown/typo'd id (an agent id like 'security-auditor',
    // or 'testing' when the real skill is 'testing-expert') was previously copied
    // verbatim, silently dropped at prompt-injection time (resolveSkillPrompts catch),
    // yet still recorded as a 100%-success skill in routing outcome stats — a phantom
    // entry polluting the outcome→routing learning loop (learnings.json).
    for (const id of resolved.forceSkills) {
      if (skillPool.has(id)) {
        skillIds.push(id);
      } else {
        const suggestion = suggestNearestSkill(id, skillPool);
        const hint = suggestion ? ` — did you mean '${suggestion}'?` : '';
        overrideWarnings.push(`Forced skill '${id}' is not a registered skill; dropped${hint}`);
        reasoning.push(`Dropped unknown forced skill '${id}'${hint}`);
      }
    }
    for (const id of skillIds) skillScores.set(id, 100);
    skillConfidence = skillIds.length > 0 ? 'high' : 'uncertain';
    reasoning.push(
      skillIds.length > 0
        ? `Skills forced by override: [${skillIds.join(', ')}]`
        : 'Skills cleared by override (none)',
    );
  } else {
    const skillResult = selectBestSkills(
      taskDNA, skillPool, cfg, learningData,
      resolved.excludeSkills ?? [], skillBudget,
      options?.projectStack ?? null, task.type,
    );
    skillIds = skillResult.skillIds;
    for (const [id, score] of skillResult.scores) skillScores.set(id, score);
    skillConfidence = skillResult.confidence;
    reasoning.push(...skillResult.reasoning);
  }

  // Step 5: Select agent (receives selected skill IDs for optional affinity scoring)
  let agentId: string | null = null;
  let agentScore = 0;
  let agentConfidence: ConfidenceLevel = 'uncertain';

  if (resolved.forceAgent) {
    agentId = resolved.forceAgent;
    agentScore = 100;
    agentConfidence = 'high';
    reasoning.push(`Agent forced by override: ${agentId}`);

    // F8 (Sprint 182): Semantic check — run activation rules on the forced agent
    // against TaskDNA. If the score is below `forceAgentWarnRatio * agentMinScore`
    // emit an advisory warning. Override is still honored (PLAN continues).
    const semanticWarning = evaluateForceAgentSemantic(
      resolved.forceAgent,
      taskDNA,
      agentPool,
      cfg,
      testDominant,
    );
    if (semanticWarning) {
      overrideWarnings.push(semanticWarning);
      reasoning.push(`Override warning: ${semanticWarning}`);
    }
  } else {
    // Compute dynamic exclusions based on intent + scope (replaces hard-coded global exclusions)
    const dynamicExclusions = getDynamicExclusions(
      taskDNA.intent.primary,
      task.scope.directories,
    );
    const allExcludeAgents = [...new Set([...(resolved.excludeAgents ?? []), ...dynamicExclusions])];
    if (dynamicExclusions.length > 0) {
      reasoning.push(`Dynamic exclusions: [${dynamicExclusions.join(', ')}]`);
    }

    // Cache key (computed once, reused for lookup + store if agentCacheEnabled)
    const cacheKey = agentCacheEnabled
      ? agentSelectionCache.taskSignature({
          title: task.title,
          description: task.description,
          scope: { directories: task.scope.directories, filesWrite: task.scope.filesWrite },
          taskType: task.type,
          assignedSkills: skillIds,
        })
      : undefined;

    // Cache lookup (flag-gated, default-off)
    let cacheHit = false;
    if (cacheKey !== undefined) {
      const cached = agentSelectionCache.get(cacheKey);
      if (cached) {
        agentId = cached.agentId || null;
        agentScore = cached.score;
        agentConfidence = (cached.confidence ?? 'uncertain') as ConfidenceLevel;
        reasoning.push('[agent-cache hit]', ...(cached.reasoningLines ?? []));
        cacheHit = true;

        // born-622 (402-003): still record a decision — a cache hit is a real
        // decision, not an invisible one. No per-signal breakdown is available
        // from the cache entry (honest-empty, never fabricated/recomputed).
        if (options?.projectRoot && options?.sprintId && options?.taskId) {
          appendRoutingDecisionRecord(options.projectRoot, {
            taskId: options.taskId,
            sprintId: options.sprintId,
            ts: new Date().toISOString(),
            candidates: cached.agentId
              ? [{ agentId: cached.agentId, totalScore: cached.score, signals: {}, bypass: false }]
              : [],
            winner: cached.agentId || null,
            reason: cached.reason,
            cached: true,
          });
        }
      }
    }

    if (!cacheHit) {
      const agentResult = selectBestAgent(
        taskDNA, agentPool, cfg, learningData, allExcludeAgents, task.type,
        skillIds, skillAgentAffinityEnabled, kindAffinityEnabled,
        taskText, languagePenaltyEnabled, scopeDomain, testDominant,
      );
      agentId = agentResult.agentId;
      agentScore = agentResult.score;
      agentConfidence = agentResult.confidence;
      reasoning.push(...agentResult.reasoning);

      // born-622 (402-003): decision-moment journal — recorded BEFORE the
      // fallback chain below may reassign agentId, so this reflects
      // selectBestAgent's own signal-based verdict (a separate mechanism
      // from the static/dynamic fallback chain).
      if (options?.projectRoot && options?.sprintId && options?.taskId) {
        appendRoutingDecisionRecord(options.projectRoot, {
          taskId: options.taskId,
          sprintId: options.sprintId,
          ts: new Date().toISOString(),
          candidates: agentResult.candidates,
          winner: agentResult.agentId,
          reason: agentResult.reasoning[agentResult.reasoning.length - 1] ?? '',
          cached: false,
        });
      }

      // Store in cache when enabled and an agent was found (skip null — let fallback handle it)
      if (cacheKey !== undefined && agentId !== null) {
        agentSelectionCache.cache(cacheKey, {
          agentId,
          score: agentScore,
          reason: 'agent-cache',
          confidence: agentConfidence,
          reasoningLines: agentResult.reasoning,
        });
      }

      // Fallback chain if no agent met threshold
      if (agentId === null && options?.activeAgentIds) {
        agentId = selectAgentByFallback(taskDNA.intent.primary, options.activeAgentIds);
        agentScore = 50; // fallback score
        agentConfidence = 'low';
        reasoning.push(`Agent fallback chain: '${agentId}' (intent=${taskDNA.intent.primary})`);
      } else if (agentId === null) {
        // No activeAgentIds provided — use static fallback
        const chain = AGENT_FALLBACK_CHAIN[taskDNA.intent.primary] ?? ['bug-fixer'];
        agentId = chain[0] ?? 'bug-fixer'; // Write-capable default (born-638)
        agentScore = 50;
        agentConfidence = 'low';
        reasoning.push(`Agent static fallback: '${agentId}' (intent=${taskDNA.intent.primary})`);
      }
    }
  }

  // Step 6: Context budget fit assessment
  const contextFit = assessContextFit(options?.estimatedTokens, options?.modelId, reasoning);

  return {
    agentId,
    agentScore,
    agentConfidence,
    skillIds,
    skillScores,
    skillConfidence,
    overrideSource,
    taskDNA,
    reasoning,
    contextFit,
    routingVersion: 'v2' as const,
    overrideWarnings: overrideWarnings.length > 0 ? overrideWarnings : undefined,
  };
}

// ─── F8: Force-Agent Semantic Check ─────────────────────────────────────────

/**
 * F8 (Sprint 182): Evaluate whether a `forceAgent` override is semantically
 * aligned with the task's intent. Computes the agent's activation score
 * against the task DNA and returns a warning string when the agent is missing,
 * excluded, or scores below `forceAgentWarnRatio * agentMinScore`.
 *
 * Severity: `warn` (locked) — PLAN continues, override is honored.
 *
 * @returns A human-readable warning string, or `null` if the override is
 *   semantically appropriate.
 */
export function evaluateForceAgentSemantic(
  forcedAgentId: string,
  taskDNA: TaskDNA,
  agentPool: AgentPool,
  cfg: RoutingEngineConfig,
  testDominant: boolean = false,
): string | null {
  const agent = agentPool.get(forcedAgentId);
  if (!agent) {
    return `forceAgent '${forcedAgentId}' is not registered in the agent pool (intent=${taskDNA.intent.primary})`;
  }
  if (!agent.enabled) {
    return `forceAgent '${forcedAgentId}' is registered but disabled (intent=${taskDNA.intent.primary})`;
  }

  const activation = getAgentActivation(agent);
  const result = evaluateActivation(withAliasedDomains(taskDNA), activation);
  // born-594 — a test-dominant task's ownership bonus bypasses the agent's own
  // activation-exclude rule, mirroring the surfaceBonus bypass in selectBestAgent.
  const testBonus = getTestOwnershipBonus(forcedAgentId, testDominant);
  if (result.excluded && testBonus === 0) {
    return `forceAgent '${forcedAgentId}' is excluded by its own activation rules ` +
      `(reason='${result.excludeReason ?? 'unknown'}', intent=${taskDNA.intent.primary})`;
  }

  const ratio = cfg.forceAgentWarnRatio ?? 0.3;
  const threshold = cfg.agentMinScore * ratio;
  const effectiveScore = result.score + testBonus;
  if (effectiveScore < threshold) {
    return `forceAgent '${forcedAgentId}' has low semantic relevance: ` +
      `activation score=${effectiveScore} < threshold=${threshold.toFixed(2)} ` +
      `(agentMinScore=${cfg.agentMinScore} × ratio=${ratio}, intent=${taskDNA.intent.primary}). ` +
      `Override honored; verify this is intentional.`;
  }
  return null;
}

// ─── Agent Selection ────────────────────────────────────────────────────────

/**
 * PCOMP-W5 (persona role signal): the roles a task kind actually needs. An
 * `audit` task wants a reviewer/analyst persona; every other kind ships a diff
 * and wants an implementer. Undefined kind → no opinion (no penalty).
 */
export function getRoleMismatchPenalty(agentRole: AgentRole, taskKind?: TaskKind): number {
  if (!taskKind) return 0;
  const wantsReview = taskKind === 'audit';
  const compatible = wantsReview
    ? agentRole === 'reviewer' || agentRole === 'analyst'
    : agentRole === 'implementer';
  // −3 by design, NOT the analysis' −5 strawman: it exactly cancels the +3
  // domain-match bonus, so a domain-specialized reviewer (today the ONLY agent
  // carrying the `security` domain is the reviewer security-auditor) still
  // competes on activation merit for a security implement-task instead of being
  // hard-excluded in favor of a generic agent with zero domain knowledge. The
  // long-term winning combo is implementer + secure-coding skill (PCOMP-W5b);
  // this signal tips ties that way without degrading today's routing.
  return compatible ? 0 : -3;
}

/** PCOMP-W5C (Sprint 352-008, config-gated, default-off): +bonus when 'refactorer' faces its named specialty. */
export const KIND_AFFINITY_BONUS = 3;
/** PCOMP-W5C: −penalty countering refactorer's generic impl@7 (agent-pool.ts) auto-winning the catch-all kind. */
export const KIND_AFFINITY_CODE_DEV_PENALTY = -2;

/**
 * PCOMP-W5C (kind-affinity signal, config-gated default-off, Sprint 352-008):
 * a task's TaskKind carries a request-shape signal that today only touches
 * one agent by name — 'refactor' explicitly asks for a restructuring pass
 * (refactorer's named specialty), while 'code-development' is the generic
 * catch-all kind that must not let refactorer's baseline impl@7 activation
 * score (see agent-pool.ts) auto-win ties against a domain-specialized
 * candidate. Agent-ID-scoped (not role-scoped, unlike getRoleMismatchPenalty):
 * every agent other than 'refactorer' gets 0 regardless of kind. Undefined
 * kind or a non-'refactorer' agent → no opinion (no penalty, no bonus).
 */
export function getKindAffinityBonus(agentId: string, taskKind?: TaskKind): number {
  if (agentId !== 'refactorer' || !taskKind) return 0;
  if (taskKind === 'refactor') return KIND_AFFINITY_BONUS;
  if (taskKind === 'code-development') return KIND_AFFINITY_CODE_DEV_PENALTY;
  return 0;
}

// ─── WM-7 Agent Language-Mismatch Penalty (Sprint 355-008, config-gated) ────

/** Result of the simple TR/EN heuristic — 'unknown' means "no confident signal",
 *  which callers must treat as "no opinion" (never penalize on an unknown side). */
export type HeuristicLanguage = 'tr' | 'en' | 'unknown';

/** TR-specific letters absent from standard English orthography. Deliberately
 *  excludes plain ASCII 'I'/'i' (ambiguous with English) — only the dotted/dotless
 *  and diacritic forms unique to Turkish are counted. */
const TR_SPECIFIC_CHARS = /[çğıİöşüÇĞÖŞÜ]/;

/** Below this word count, the ratio has no statistical meaning — 'unknown'. */
const LANGUAGE_DETECT_MIN_WORDS = 3;

/** Ratio of TR-charactered words to total words at/above which text is
 *  confidently classified Turkish. Conservative — plain English text scores ~0
 *  because none of its words carry a Turkish-specific letter. */
const TR_WORD_RATIO_THRESHOLD = 0.08;

/**
 * WM-7 (Sprint 355-008, config-gated): a simple, dependency-free TR/EN language
 * heuristic — the ratio of words containing at least one TR-specific character
 * to total words. Turkish's suffix morphology (-ği, -ış, -ler, -şey, dil, için, …)
 * means a real Turkish sentence of any reasonable length reliably contains several
 * such words; plain English text scores ~0. Deliberately conservative: too few
 * words or a below-threshold ratio returns 'unknown'/'en' rather than guessing —
 * the goal is a confident TR/EN split for a routing tiebreaker, not language ID.
 * Reused symmetrically for both task text (title+description) and agent persona
 * text (description+systemPrompt) so no separate per-agent language field or
 * hardcoded map is needed.
 */
export function detectHeuristicLanguage(text: string): HeuristicLanguage {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < LANGUAGE_DETECT_MIN_WORDS) return 'unknown';
  const trWordCount = words.filter(w => TR_SPECIFIC_CHARS.test(w)).length;
  return trWordCount / words.length >= TR_WORD_RATIO_THRESHOLD ? 'tr' : 'en';
}

/** WM-7: soft penalty for a confident task/agent-prompt language mismatch. Sized
 *  small (unlike the skill-side stack LANGUAGE_MISMATCH_PENALTY) — this is a
 *  tiebreaker signal among otherwise-competitive agents, not a hard exclusion;
 *  a genuinely better-fit agent in the "wrong" language must still be selectable. */
export const AGENT_LANGUAGE_MISMATCH_PENALTY = -1;

/**
 * WM-7 (config-gated via RoutingOptions.languagePenalty, default-off): returns
 * AGENT_LANGUAGE_MISMATCH_PENALTY when the task's language and the agent's prompt
 * language are both confidently detected AND differ, else 0. Takes precomputed
 * `HeuristicLanguage` values (not raw text) so the task-side detection can be
 * hoisted once per selectBestAgent call instead of recomputed per candidate.
 */
export function getLanguageMismatchPenalty(
  taskLanguage: HeuristicLanguage,
  agentLanguage: HeuristicLanguage,
): number {
  if (taskLanguage === 'unknown' || agentLanguage === 'unknown') return 0;
  return taskLanguage === agentLanguage ? 0 : AGENT_LANGUAGE_MISMATCH_PENALTY;
}

function selectBestAgent(
  taskDNA: TaskDNA,
  pool: AgentPool,
  cfg: RoutingEngineConfig,
  learningData: LearningBonus[],
  excludeAgents: string[],
  taskKind?: TaskKind,
  assignedSkills?: string[],
  skillAgentAffinity?: boolean,
  kindAffinity?: boolean,
  taskText?: string,
  languagePenalty?: boolean,
  scopeDomain?: string | null,
  testDominant: boolean = false,
): { agentId: string | null; score: number; confidence: ConfidenceLevel; reasoning: string[]; candidates: RoutingDecisionCandidate[] } {
  const candidates: ScoredCandidate[] = [];
  // born-622 (402-003): every agent that reaches a finalScore this call — NOT
  // gated by cfg.agentMinScore — so a below-threshold "loser" is still
  // auditable. Hard-excluded agents (no bypass) never reach finalScore and
  // are correctly absent (no fabricated score).
  const decisionCandidates: RoutingDecisionCandidate[] = [];
  const reasoning: string[] = [];

  // ROUTE-1 B2 — suppress path-proxy + user-surface bonus for touch-up / non-build tasks.
  const buildTask = isSurfaceBuildTask(taskDNA.intent.primary, taskKind);

  // WM-7 — hoisted once: identical for every candidate this call (task-side only).
  const taskLanguage: HeuristicLanguage = languagePenalty ? detectHeuristicLanguage(taskText ?? '') : 'unknown';

  // born-589 — hoisted once: a scoring-only, alias-expanded view of taskDNA.domains for
  // evaluateActivation's `domains.$contains` checks. `taskDNA` itself (used by every other
  // bonus below) is untouched.
  const aliasedTaskDNA = withAliasedDomains(taskDNA);

  for (const [id, agent] of pool) {
    if (!agent.enabled) continue;

    // Sprint 216-003 — user-surface bonus. A surface-owner agent on its own
    // surface (cli/api→api-builder, dashboard→frontend-designer, e2e→ci-guardian)
    // gets +USER_SURFACE_BONUS and BYPASSES excludes (override + activation), so
    // a user-facing task cannot collapse to refactorer's generic impl@7.
    // ROUTE-1 B2: suppressed for non-build tasks (touch-ups, refactor, doc, audit).
    const surfaceBonus = buildTask ? getUserSurfaceBonus(id, taskDNA, scopeDomain) : 0;
    // born-594 — test-dominant ownership bonus; bypasses excludes the same way
    // surfaceBonus does (see the two bypass branches below).
    const testBonus = getTestOwnershipBonus(id, testDominant);
    const bypassBonus = surfaceBonus + testBonus;
    // born-622 (402-003): true only when an exclude rule was actually bypassed
    // below — NOT "bypassBonus > 0" alone (a non-excluded agent can carry a
    // nonzero surface/test bonus without ever needing to bypass anything).
    let bypassApplied = false;

    if (excludeAgents.includes(id)) {
      if (bypassBonus > 0) {
        bypassApplied = true;
        reasoning.push(
          testBonus > 0
            ? `Agent '${id}' test-ownership exclude bypass (override)`
            : `Agent '${id}' surface exclude bypass (user-surface owner)`,
        );
      } else {
        reasoning.push(`Agent '${id}' excluded by override`);
        continue;
      }
    }

    // Get activation config (v2 or migrated from v1)
    const activation = getAgentActivation(agent);
    // Skill→agent affinity context (ADR-075, Sprint 324-007). Flag-gated, default-off.
    // When enabled, SKILL_AGENT_AFFINITY_BONUS is added inside evaluateActivation when
    // an assigned skill maps to this agent via SKILL_AGENT_MAP.
    const affinityCtx: SkillAffinityContext | undefined = skillAgentAffinity
      ? { agentId: id, assignedSkills, enabled: true }
      : undefined;
    const result = evaluateActivation(aliasedTaskDNA, activation, affinityCtx);

    if (result.excluded) {
      if (bypassBonus > 0) {
        bypassApplied = true;
        reasoning.push(
          testBonus > 0
            ? `Agent '${id}' test-ownership exclude bypass: ${result.excludeReason}`
            : `Agent '${id}' surface exclude bypass: ${result.excludeReason}`,
        );
      } else {
        reasoning.push(`Agent '${id}' excluded: ${result.excludeReason}`);
        continue;
      }
    }

    // Apply learning bonus
    const bonus = getLearningBonus(id, learningData);

    // Sprint 209 — multi-signal: domain-match bonus so a domain-specialized
    // agent (api-builder / security-auditor / devops-engineer / …) beats
    // the generic refactorer impl@7 candidate. Refactorer/architect still
    // get impl@7; this is purely an additive tiebreaker.
    const domainBonus = getDomainMatchBonus(id, getAgentDomain(agent), taskDNA, buildTask, scopeDomain);
    if (domainBonus > 0) {
      reasoning.push(`Agent '${id}' domain-match bonus: +${domainBonus} (intent=${taskDNA.intent.primary}, domains=[${taskDNA.domains.map(d => d.name).join(', ')}]${scopeDomain ? `, scopeDomain='${scopeDomain}'` : ''})`);
    }
    if (surfaceBonus > 0) {
      reasoning.push(`Agent '${id}' user-surface bonus: +${surfaceBonus} (domains=[${taskDNA.domains.map(d => d.name).join(', ')}]${scopeDomain ? `, scopeDomain='${scopeDomain}'` : ''})`);
    }
    if (testBonus > 0) {
      reasoning.push(`Agent '${id}' test-ownership bonus: +${testBonus} (test-dominant task, testWriteRatio=${taskDNA.scope.testWriteRatio})`);
    }

    // PCOMP-W5: role-mismatch signal — a review/analyst persona on an implement
    // task (or vice versa) is the output-format-conflict failure class.
    const rolePenalty = getRoleMismatchPenalty(getAgentRole(agent), taskKind);
    if (rolePenalty !== 0) {
      reasoning.push(`Agent '${id}' role-mismatch penalty: ${rolePenalty} (role=${getAgentRole(agent)}, taskKind=${taskKind})`);
    }

    // PCOMP-W5C: kind-affinity signal — config-gated, default-off (see RoutingOptions.kindAffinity).
    const kindBonus = kindAffinity ? getKindAffinityBonus(id, taskKind) : 0;
    if (kindBonus !== 0) {
      reasoning.push(`Agent '${id}' kind-affinity bonus: ${kindBonus > 0 ? '+' : ''}${kindBonus} (taskKind=${taskKind})`);
    }

    // WM-7: task/agent-prompt language-mismatch signal — config-gated, default-off
    // (see RoutingOptions.languagePenalty).
    const agentLanguage: HeuristicLanguage = languagePenalty
      ? detectHeuristicLanguage(`${agent.description} ${agent.systemPrompt}`)
      : 'unknown';
    const langPenalty = languagePenalty ? getLanguageMismatchPenalty(taskLanguage, agentLanguage) : 0;
    if (langPenalty !== 0) {
      reasoning.push(`Agent '${id}' language-mismatch penalty: ${langPenalty} (taskLanguage=${taskLanguage}, agentLanguage=${agentLanguage})`);
    }

    const finalScore = result.score + bonus + domainBonus + surfaceBonus + testBonus + rolePenalty + kindBonus + langPenalty;

    // born-622 (402-003): harvest the journal candidate from the intermediate
    // values already computed above — no second scoring pass.
    decisionCandidates.push({
      agentId: id,
      totalScore: finalScore,
      signals: {
        activation: result.score,
        learningBonus: bonus,
        domainBonus,
        surfaceBonus,
        testBonus,
        rolePenalty,
        kindBonus,
        langPenalty,
      },
      bypass: bypassApplied,
    });

    if (finalScore >= cfg.agentMinScore) {
      candidates.push({
        id,
        rawScore: result.score + domainBonus + surfaceBonus + testBonus + rolePenalty + kindBonus + langPenalty,
        learningBonus: bonus,
        finalScore,
        matchedRules: result.matchedRules,
      });
    }
  }

  if (candidates.length === 0) {
    reasoning.push('No agent met minimum score threshold');
    return { agentId: null, score: 0, confidence: 'uncertain', reasoning, candidates: decisionCandidates };
  }

  // Sort by finalScore descending, then by learning bonus for tiebreaker
  // (V2: stats live in learnings.json, not agent.json — pool stats are always 0)
  candidates.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return getLearningBonus(b.id, learningData) - getLearningBonus(a.id, learningData);
  });

  const best = candidates[0]!;
  const second = candidates[1];
  const confidence = calculateConfidence(best.finalScore, second?.finalScore ?? 0, candidates.length);

  reasoning.push(`Agent selected: '${best.id}' (score=${best.finalScore}, rules=[${best.matchedRules.join(', ')}])`);

  return { agentId: best.id, score: best.finalScore, confidence, reasoning, candidates: decisionCandidates };
}

// ─── Skill Selection ────────────────────────────────────────────────────────

/** ROUTE-1 B4 — guaranteed skill when none cleared skillMinScore. */
const KIND_DEFAULT_SKILL: Partial<Record<TaskKind, string>> = {
  'code-development': 'typescript-expert',
  refactor:          'code-simplifier',
  documentation:     'documentation-writer',
  audit:             'code-simplifier',
  test:              'testing-expert',
};
// Fallback when taskKind is unavailable (pickSkillFloor tries KIND_DEFAULT_SKILL first).
const INTENT_DEFAULT_SKILL: Partial<Record<IntentType, string>> = {
  refactor:       'code-simplifier',
  implementation: 'typescript-expert',
  documentation:  'documentation-writer',
};

/** ROUTE-1 — project stack language → the built-in language-expert skill id.
 *  Only stacks with a real built-in expert are listed; others fall back to
 *  code-simplifier (language-agnostic) inside resolvePrincipledDefault. */
const LANGUAGE_EXPERT_SKILL: Partial<Record<TechStackKind, string>> = {
  typescript: 'typescript-expert',
  javascript: 'typescript-expert',
  python:     'python-expert',
};

/**
 * Resolve the principled floor default for a task (the kind/intent-appropriate
 * skill), stack-aware for code work. Returns null when no curated default fits.
 * Skipped for `unknown` intent by the caller to preserve the honest-empty contract.
 */
function resolvePrincipledDefault(
  intent: IntentType,
  taskKind: TaskKind | undefined,
  projectStack: { language: string } | null | undefined,
  pool: Map<string, SkillDefinition>,
): string | null {
  const isCode = taskKind === 'code-development' || intent === 'implementation' || intent === 'bugfix';
  if (isCode) {
    const lang = normalizeTechStack(projectStack?.language);
    const langSkill = LANGUAGE_EXPERT_SKILL[lang];
    if (langSkill && pool.has(langSkill)) return langSkill;
    if (pool.has('code-simplifier')) return 'code-simplifier'; // language-agnostic code skill
    // else fall through to the kind/intent defaults below
  }
  const byKind = taskKind ? KIND_DEFAULT_SKILL[taskKind] : undefined;
  if (byKind && pool.has(byKind)) return byKind;
  const byIntent = INTENT_DEFAULT_SKILL[intent];
  if (byIntent && pool.has(byIntent)) return byIntent;
  return null;
}

/**
 * Pick a floor skill when no candidate cleared the threshold:
 *  (1) the kind/intent principled default (stack-aware for code work), else
 *  (2) the best sub-threshold candidate (score > 0).
 * Returns null for genuinely unclassifiable tasks (intent 'unknown', no default,
 * no sub-threshold) so an empty pool / no-signal task honestly yields no skill.
 */
function pickSkillFloor(
  subThreshold: Array<{ id: string; finalScore: number }>,
  intent: IntentType,
  taskKind: TaskKind | undefined,
  pool: Map<string, SkillDefinition>,
  projectStack?: { language: string } | null,
): string | null {
  // Principled default first (the kind/intent-appropriate skill is a stronger
  // signal than a coincidentally-bonused sub-threshold candidate). Skipped for
  // `unknown` intent so an unclassifiable task can still return [].
  if (intent !== 'unknown') {
    const principled = resolvePrincipledDefault(intent, taskKind, projectStack, pool);
    if (principled) return principled;
  }
  // Fallback: best sub-threshold candidate (some real signal scored, just below threshold).
  if (subThreshold.length > 0) {
    return [...subThreshold].sort((a, b) => b.finalScore - a.finalScore)[0]!.id;
  }
  return null;
}

function selectBestSkills(
  taskDNA: TaskDNA,
  pool: Map<string, SkillDefinition>,
  cfg: RoutingEngineConfig,
  learningData: LearningBonus[],
  excludeSkills: string[],
  budget: SkillBudget,
  projectStack: { language: string; framework: string; dependencies: string[] } | null,
  taskKind?: TaskKind,
): { skillIds: string[]; scores: Map<string, number>; confidence: ConfidenceLevel; reasoning: string[] } {
  const candidates: ScoredCandidate[] = [];
  const subThreshold: Array<{ id: string; finalScore: number }> = [];
  const reasoning: string[] = [];
  const buildTask = isSurfaceBuildTask(taskDNA.intent.primary, taskKind);

  // born-589 — hoisted once: see the identical comment in selectBestAgent.
  const aliasedTaskDNA = withAliasedDomains(taskDNA);

  for (const [id, skill] of pool) {
    if (!skill.enabled) continue;
    if (excludeSkills.includes(id)) {
      reasoning.push(`Skill '${id}' excluded by override`);
      continue;
    }

    // Get activation config (v2 or migrated from v1)
    const activation = getSkillActivation(skill);
    const result = evaluateActivation(aliasedTaskDNA, activation);

    if (result.excluded) {
      reasoning.push(`Skill '${id}' excluded: ${result.excludeReason}`);
      continue;
    }

    // Stack detection bonus (project language/framework match)
    let stackBonus = 0;
    if (projectStack) {
      if (skill.category === 'language') {
        const langMatch = skill.triggers.some(t => t.toLowerCase() === projectStack.language.toLowerCase());
        if (langMatch) {
          stackBonus += 3;
        } else {
          // WM-7 routing dual: a language-category skill whose language does NOT
          // match the confidently-detected project stack is the wrong specialist
          // (e.g. typescript-expert on a Go project). Soft-penalize so it drops
          // below the candidate threshold for typical mis-routes, while a very
          // strong task signal can still override (polyglot-safe). `- Skills:`
          // overrides bypass routing entirely, so explicit pins are unaffected.
          const projStack = normalizeTechStack(projectStack.language);
          if (projStack !== 'generic') {
            const normMatch = skill.triggers.some(t => normalizeTechStack(t) === projStack);
            if (!normMatch) {
              stackBonus -= LANGUAGE_MISMATCH_PENALTY;
              reasoning.push(`Skill '${id}' language-mismatch penalty: -${LANGUAGE_MISMATCH_PENALTY} (skill not for ${projStack} stack)`);
            }
          }
        }
      }
      if (skill.category === 'framework') {
        const fwMatch = skill.triggers.some(t => t.toLowerCase() === projectStack.framework.toLowerCase());
        if (fwMatch) stackBonus += 3;
      }
      for (const dep of skill.stackDetection.dependencies) {
        if (projectStack.dependencies.includes(dep)) {
          stackBonus += 1;
          break; // only +1 for dependency match total
        }
      }
    }

    // Intent-based priority bonus: boost skills aligned with task's primary intent
    const intentBonus = getIntentPriorityBonus(id, taskDNA, projectStack, buildTask);
    if (intentBonus > 0) {
      reasoning.push(`Skill '${id}' intent-priority bonus: +${intentBonus} (intent=${taskDNA.intent.primary})`);
    }

    // Apply learning bonus (sprint recency: +3 for recent success, -2 for recent failure)
    const skillBonus = getLearningBonus(id, learningData);
    if (skillBonus !== 0) {
      reasoning.push(`Skill '${id}' learning bonus: ${skillBonus > 0 ? '+' : ''}${skillBonus} (sprint recency)`);
    }
    const finalScore = result.score + stackBonus + intentBonus + skillBonus;

    if (finalScore >= cfg.skillMinScore) {
      candidates.push({
        id,
        rawScore: result.score + stackBonus,
        learningBonus: skillBonus,
        finalScore,
        matchedRules: result.matchedRules,
      });
    } else if (finalScore > 0) {
      subThreshold.push({ id, finalScore });
    }
  }

  if (candidates.length === 0) {
    // ROUTE-1 B4 — empty-skill floor: never return [] for a classified task.
    const floorId = pickSkillFloor(subThreshold, taskDNA.intent.primary, taskKind, pool, projectStack);
    if (floorId) {
      reasoning.push(`Skill floor: '${floorId}' (no candidate ≥ ${cfg.skillMinScore})`);
      return { skillIds: [floorId], scores: new Map([[floorId, 0]]), confidence: 'low', reasoning };
    }
    reasoning.push('No skill met minimum score threshold');
    return { skillIds: [], scores: new Map(), confidence: 'uncertain', reasoning };
  }

  // Sort by finalScore descending, then priority
  candidates.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    const skillA = pool.get(a.id);
    const skillB = pool.get(b.id);
    return (skillB?.priority ?? 0) - (skillA?.priority ?? 0);
  });

  // Apply composition conflict resolution
  const selectedSkillDefs = candidates
    .slice(0, budget.maxSkills + 2) // take extras for composition resolution
    .map(c => pool.get(c.id)!)
    .filter(Boolean);

  const { resolved } = resolveComposition(selectedSkillDefs);
  const resolvedIds = new Set(resolved.map(s => s.id));

  // Cap at budget
  const finalCandidates = candidates
    .filter(c => resolvedIds.has(c.id))
    .slice(0, budget.maxSkills);

  // ROUTE-1 B4 — budget-cap floor: trivial tasks (maxSkills=0) would drop all
  // candidates; preserve the best-scored candidate as a floor instead.
  // Unknown-intent guard: mirrors pickSkillFloor contract — unclassifiable tasks return [].
  if (finalCandidates.length === 0 && taskDNA.intent.primary !== 'unknown') {
    const budgetFloorId = candidates[0]?.id
      ?? pickSkillFloor(subThreshold, taskDNA.intent.primary, taskKind, pool, projectStack);
    if (budgetFloorId) {
      const topScore = candidates[0]?.finalScore ?? 0;
      reasoning.push(`Skill floor (budget cap): '${budgetFloorId}' (maxSkills=${budget.maxSkills})`);
      return { skillIds: [budgetFloorId], scores: new Map([[budgetFloorId, topScore]]), confidence: 'low', reasoning };
    }
  }

  const scores = new Map<string, number>();
  const skillIds: string[] = [];
  for (const c of finalCandidates) {
    skillIds.push(c.id);
    scores.set(c.id, c.finalScore);
    reasoning.push(`Skill selected: '${c.id}' (score=${c.finalScore}, rules=[${c.matchedRules.join(', ')}])`);
  }

  const confidence = finalCandidates.length > 0
    ? calculateConfidence(
        finalCandidates[0]!.finalScore,
        finalCandidates[1]?.finalScore ?? 0,
        finalCandidates.length,
      )
    : 'uncertain';

  return { skillIds, scores, confidence, reasoning };
}

// ─── Skill Budget ───────────────────────────────────────────────────────────

/**
 * Calculate how many skills a task should receive based on its complexity.
 * Token budgets are dynamically adjusted by effort level: low=1000, normal=1500, high=2500.
 */
export function calculateSkillBudget(
  taskDNA: TaskDNA,
  config?: Partial<RoutingEngineConfig>,
  effort?: string,
): SkillBudget {
  const maxDefault = config?.maxSkillsDefault ?? 3;
  let maxSkills = SKILL_BUDGET_BY_SIZE[taskDNA.complexity.estimatedSize] ?? 2;

  // Cross-cutting tasks get +1
  if (taskDNA.complexity.crossCutting && taskDNA.complexity.moduleCount >= 3) {
    maxSkills = Math.min(maxSkills + 1, maxDefault);
  }

  // Single-domain, single-operation tasks get -1
  if (taskDNA.domains.length <= 1 && taskDNA.operations.length <= 1 && maxSkills > 1) {
    maxSkills = Math.max(maxSkills - 1, 0);
  }

  // Hard cap
  maxSkills = Math.min(maxSkills, maxDefault);

  // Dynamic per-skill token budget based on effort level
  const maxTokensPerSkill = (effort !== undefined ? SKILL_TOKEN_BUDGET_BY_EFFORT[effort] : undefined) ?? DEFAULT_TOKEN_BUDGET_PER_SKILL;
  const totalSkillTokenBudget = Math.min(maxSkills * maxTokensPerSkill, DEFAULT_TOKEN_BUDGET_TOTAL * 2);

  return {
    maxSkills,
    maxTokensTotal: Math.min(maxSkills * DEFAULT_TOKEN_BUDGET_PER_SKILL, DEFAULT_TOKEN_BUDGET_TOTAL),
    perSkillTokenBudget: DEFAULT_TOKEN_BUDGET_PER_SKILL,
    maxTokensPerSkill,
    totalSkillTokenBudget,
    reason: `${taskDNA.complexity.estimatedSize} task, ${taskDNA.complexity.moduleCount} module(s), effort=${effort ?? 'normal'}`,
  };
}

// ─── Override Resolution ────────────────────────────────────────────────────

/**
 * Resolve user overrides by priority (task > sprint > project).
 * Higher priority overrides win.
 */
export function resolveOverrides(overrides: UserOverride[]): {
  forceAgent?: string;
  forceSkills?: string[];
  excludeSkills: string[];
  excludeAgents: string[];
} {
  // Sort by priority descending (highest first)
  const sorted = [...overrides].sort((a, b) => b.priority - a.priority);

  let forceAgent: string | undefined;
  let forceSkills: string[] | undefined;
  const excludeSkills = new Set<string>();
  const excludeAgents = new Set<string>();

  for (const override of sorted) {
    // First non-undefined forceAgent wins (highest priority)
    if (override.forceAgent !== undefined && forceAgent === undefined) {
      forceAgent = override.forceAgent;
    }
    // First non-undefined forceSkills wins
    if (override.forceSkills !== undefined && forceSkills === undefined) {
      forceSkills = override.forceSkills;
    }
    // Exclusions are additive (all levels)
    if (override.excludeSkills) {
      for (const s of override.excludeSkills) excludeSkills.add(s);
    }
    if (override.excludeAgents) {
      for (const a of override.excludeAgents) excludeAgents.add(a);
    }
  }

  return {
    forceAgent,
    forceSkills,
    excludeSkills: [...excludeSkills],
    excludeAgents: [...excludeAgents],
  };
}

// ─── Confidence Calculation ─────────────────────────────────────────────────

/**
 * Calculate confidence level based on score gap and candidate count.
 */
export function calculateConfidence(
  topScore: number,
  secondScore: number,
  candidateCount: number,
): ConfidenceLevel {
  if (topScore <= 0) return 'uncertain';
  if (candidateCount === 0) return 'uncertain';

  const gap = topScore - secondScore;
  const ratio = gap / topScore;

  // Single strong candidate
  if (candidateCount === 1 && topScore >= 5) return 'high';

  // Large gap between top two
  if (ratio >= 0.5 && topScore >= 5) return 'high';
  if (ratio >= 0.3 && topScore >= 3) return 'medium';
  if (ratio >= 0.1) return 'low';

  return 'uncertain';
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function getAgentActivation(agent: AgentDefinition): ActivationConfig {
  if (agent.activation) return agent.activation;
  return migrateV1AgentToActivation(
    agent.triggerKeywords,
    agent.triggerScopes,
    agent.triggerFilePatterns,
  );
}

function getSkillActivation(skill: SkillDefinition): ActivationConfig {
  if (skill.activation) return skill.activation;
  // Ecosystem intelligence: derive intent-based activation from skill metadata.
  // Richer signal than V1 migration for skills without a persisted V2 manifest.
  const ecosystemActivation = analyzeSkillInMemory({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    triggers: skill.triggers,
  });
  if (ecosystemActivation.rules.some(r => r.score >= 5)) {
    return ecosystemActivation;
  }
  return migrateV1SkillToActivation(
    skill.triggers,
    skill.category,
    skill.stackDetection,
  );
}

function getLearningBonus(entityId: string, learningData: LearningBonus[]): number {
  const entry = learningData.find(l => l.entityId === entityId);
  if (!entry) return 0;
  // Cap bonus to prevent runaway effects
  return Math.max(-LEARNING_BONUS_CAP, Math.min(LEARNING_BONUS_CAP, entry.bonus));
}

// ─── Skill Domain / Intent Bonus (Sprint 209-004) ──────────────────────────
//
// Counterpart to DOMAIN_MATCH_BONUS / TASK_DOMAIN_TO_AGENT_ID for agents.
// When a task's primary intent or a path-extracted domain name maps to a
// specific skill, that skill receives SKILL_DOMAIN_BONUS so domain-specialized
// skills (api-builder, security-specialist, react-specialist, …) surface ahead
// of the generic typescript-expert default.

/** Score added when a skill's id matches the task's intent or domain signal.
 *  Sized equal to DOMAIN_MATCH_BONUS so skill routing keeps pace with agent
 *  domain routing introduced in Sprint 209-002. */
export const SKILL_DOMAIN_BONUS = 3;

/** Map task primary intent → the skill that best serves that intent.
 *  documentation is excluded (handled by existing early-return at +2).
 *  The intent→skill mapping gives domain-specific skills a tiebreaker when
 *  the task intent is already classified beyond 'implementation'. */
export const INTENT_TO_SKILL_ID: Partial<Record<IntentType, string>> = {
  security:      'security-specialist',
  devops:        'devops-engineer',
  design:        'react-specialist',
  migration:     'database-migration',
  performance:   'performance-optimizer',
  architecture:  'system-architect',
  refactor:      'code-simplifier',   // ROUTE-1 B4
  config:        'devops-engineer',   // ROUTE-1 B4
};

/** Map path-extracted task domain name (TaskDNA.domains[].name) → skill id.
 *  Parallel to TASK_DOMAIN_TO_AGENT_ID; applied inside getIntentPriorityBonus
 *  so that scope-path signals (src/api/, src/auth/, dashboard/) steer the
 *  domain skill bonus even when intent is still 'implementation'. */
export const TASK_DOMAIN_TO_SKILL_ID: Readonly<Record<string, string>> = {
  api:        'api-builder',
  auth:       'security-specialist',
  security:   'security-specialist',
  dashboard:  'react-specialist',
  components: 'react-specialist',
  frontend:   'react-specialist',
  ui:         'react-specialist',
  db:         'database-migration',
  database:   'database-migration',
  models:     'database-migration',
  schemas:    'database-migration',
  docker:     'docker-expert',
  kubernetes: 'docker-expert',
  k8s:        'docker-expert',
  helm:       'docker-expert',
};

/**
 * Intent-based priority bonus for skill selection.
 * Boosts skills that align with the task's primary intent:
 * - testing → testing-expert +2
 * - documentation → documentation-writer +2
 * - implementation + typescript → typescript-expert +2
 * - intent→skill mapping (security/devops/design/…) → domain skill +3
 * - domain→skill mapping (api/auth/dashboard/…) → domain skill +3
 */
function getIntentPriorityBonus(
  skillId: string,
  taskDNA: TaskDNA,
  projectStack: { language: string; framework: string; dependencies: string[] } | null,
  allowPathProxy: boolean = true,
): number {
  const primary = taskDNA.intent.primary;

  if (taskDNA.tags?.includes('test-coverage') && skillId === 'testing-expert') return 2;
  if (primary === 'documentation' && skillId === 'documentation-writer') return 2;

  if (primary === 'implementation' && skillId === 'typescript-expert') {
    const isTypeScript =
      projectStack?.language?.toLowerCase() === 'typescript' ||
      taskDNA.domains.some(d => d.name.toLowerCase().includes('typescript'));
    if (isTypeScript) return 2;
  }

  // intent→skill (intent-driven, always honoured)
  const intentSkillId = INTENT_TO_SKILL_ID[primary];
  if (intentSkillId === skillId) return SKILL_DOMAIN_BONUS;

  // domain→skill (path proxy, gated — ROUTE-1 B4)
  if (allowPathProxy) {
    for (const domain of taskDNA.domains) {
      const domainSkillId = TASK_DOMAIN_TO_SKILL_ID[domain.name.toLowerCase()];
      if (domainSkillId === skillId) return SKILL_DOMAIN_BONUS;
    }
  }

  return 0;
}

// ─── Context Budget Fit ────────────────────────────────────────────────────

/** Context budget thresholds */
const CONTEXT_TIGHT_THRESHOLD = 0.75;
const CONTEXT_OVERFLOW_THRESHOLD = 0.90;

/**
 * Assess how well a task's estimated token usage fits within the model's context window.
 * Returns 'ok' if within 75%, 'tight' if between 75-90%, 'overflow' if above 90%.
 * When estimatedTokens or modelId is not provided, returns undefined (no assessment).
 */
export function assessContextFit(
  estimatedTokens: number | undefined,
  modelId: string | undefined,
  reasoning: string[],
): 'ok' | 'tight' | 'overflow' | undefined {
  if (estimatedTokens === undefined || modelId === undefined) return undefined;

  const modelDef = modelRegistry.get(modelId);
  if (!modelDef) return undefined;

  const contextWindow = modelDef.contextWindow;
  const utilization = estimatedTokens / contextWindow;

  if (utilization > CONTEXT_OVERFLOW_THRESHOLD) {
    reasoning.push(
      `Context fit: OVERFLOW — estimated ${estimatedTokens} tokens vs ${contextWindow} context window ` +
      `(${(utilization * 100).toFixed(1)}% utilization). Consider splitting the task.`,
    );
    debugLog('routing-engine', `Task context overflow: ${estimatedTokens}/${contextWindow} (${(utilization * 100).toFixed(1)}%) for model ${modelId}. SPLIT recommended.`);
    return 'overflow';
  }

  if (utilization > CONTEXT_TIGHT_THRESHOLD) {
    reasoning.push(
      `Context fit: TIGHT — estimated ${estimatedTokens} tokens vs ${contextWindow} context window ` +
      `(${(utilization * 100).toFixed(1)}% utilization). Consider upgrading to a higher-tier model.`,
    );
    return 'tight';
  }

  reasoning.push(
    `Context fit: OK — estimated ${estimatedTokens} tokens vs ${contextWindow} context window ` +
    `(${(utilization * 100).toFixed(1)}% utilization).`,
  );
  return 'ok';
}
