// ═══ Canonical Work-Model — Single Source of Truth (SSOT) ═══════════════════
// Sprint 238 (WM-2a, additive). Replaces 5 incompatible `TaskType` enums with
// ONE canonical taxonomy (`TaskKind`); subsystems MAP from it via pure adapters
// instead of re-deriving their own. This step is intentionally additive and
// "dead until a consumer migrates" — foundation laid, not WM-2 done.
// See docs/superpowers/specs/2026-06-08-canonical-work-model-design.md.
//
// ADR-008 (core/ must not import orchestra/): the two legacy enums that live in
// core/ (decision-types, routing-types) are imported directly; the three that
// live in orchestra/ (rubric-registry, task-router, adr-selector) are MIRRORED
// here as local literal unions — importing them would invert the dependency.
// ADR-053 (TaskType taxonomy) — this is its realized single-source form.

import type { TaskType as DecisionTaskType } from './decision-types.js';
import type { IntentType } from './routing-types.js';
import type {
  TaskScope,
  GoNoGoCriteria,
  TaskEffort,
  TaskPriority,
  ProviderName,
  ModelType,
} from './task-types.js';

// ─── Canonical Types (spec §2) ──────────────────────────────────────────────

/** Runtime + type-level SSOT for the fundamental nature of a unit of work. */
export const TASK_KINDS = [
  'code-development',
  'test',
  'documentation',
  'audit',
  'security',
  'refactor',
  'devops',
  'config',
  'design',
  'data',
  'generic',
] as const;

/** The fundamental nature of a unit of work. ONE taxonomy; subsystems map from it. */
export type TaskKind = typeof TASK_KINDS[number];

/** Hybrid two-axis axis 1 — WHAT domain the work targets. */
export type WorkDomain = 'code-repo' | 'erp' | 'messaging' | 'web' | 'data-pipeline' | 'generic';

/** Hybrid two-axis axis 2 — WHERE / how the work runs. */
export type ExecutionContext = 'local-dev' | 'ci' | 'docker' | 'air-gapped' | 'production-tenant';

/** Hybrid two-axis environment: domain × execution-context. */
export interface EnvironmentType {
  domain: WorkDomain;
  context: ExecutionContext;
}

/** A capability the work needs — drives policy/routing/governance/capability-broker. */
export type Capability =
  | 'fs-read'
  | 'fs-write'
  | 'network'
  | 'db-query'
  | 'db-write'
  | 'erp-read'
  | 'erp-write'
  | 'shell'
  | 'approval'
  | 'provider-pin'
  | 'gpu'
  | 'tenant-scope'
  | 'mcp-tool';

/** A resource the work needs — drives scheduling/isolation. */
export type ResourceNeed = 'memory-high' | 'gpu' | 'network-isolation' | 'secrets' | 'long-running';

/** What the work needs to run — capability + resource profile. */
export interface RequirementProfile {
  capabilities: Capability[];
  resources: ResourceNeed[];
}

// ─── ExecutionRequest envelope types (WM-1 universal contract) ───────────────
// These extend the contract to cover ALL four personas (solo-assistant /
// developer / team / enterprise) + the 6 everyone-everywhere scenarios. Every
// envelope field is OPTIONAL and consumed incrementally by the feature that
// owns it (TEAM-1→actor, ENT-3→correlation/causation, F8→capabilityTarget,
// chat→mode, cost-gate→budget, F10→riskClass). Solo/dev paths leave them unset.
// See docs/superpowers/specs/2026-06-09-execution-request-persona-coverage.md.

/** Non-code work target — a capability/connector to invoke (F8 broker). For
 *  work that isn't file-scoped (mail/calendar/ERP/DB), `capabilityTarget`
 *  carries the verb + args + which backend, alongside (or instead of) `scope`. */
export interface CapabilityTarget {
  /** Dotted capability verb, e.g. 'mail.send' | 'erp.read' | 'db.query' | 'calendar.create'. */
  capability: string;
  args?: Record<string, unknown>;
  /** Which backend fulfils it, e.g. 'imap' | 'graph' | 'odoo' | 'postgres'. */
  connector?: string;
}

/** WHO requested the work — identity + RBAC role + tenant (team/enterprise). */
export interface ActorContext {
  id: string;
  role?: string;
  tenantId?: string;
  // PRINCIPAL-001 P1a: optional, backward-compatible provenance fields so
  // authorization can SEE what identity it is trusting. Produced by
  // principalToActor (src/core/principal.ts); absence marks a
  // pre-PRINCIPAL-001 ingress and is surfaced by the advisory seam.
  identityClass?: 'local' | 'oidc' | 'workload' | 'connector' | 'service';
  assurance?: 'unverified' | 'os-user' | 'token-parsed' | 'token-verified';
  provenance?: RequestOrigin;
}

/** How the work entered the system (provenance — audit + persona routing). */
export type RequestOrigin =
  | 'cli'
  | 'mcp'
  | 'chat'
  | 'autonomous'
  | 'webhook'
  | 'scheduled'
  | 'api'
  | 'ide';

/** Interaction shape — conversational assistant vs fire-and-forget vs streamed. */
export type InteractionMode = 'batch' | 'interactive' | 'streaming';

/** Cost/resource ceiling for a request (enterprise cost-control). */
export interface ExecutionBudget {
  maxUsd?: number;
  /** Aggregate measured tokens, including prompt-cache reads and writes. */
  maxTokens?: number;
  /** Maximum number of distinct provider model calls/turns. */
  maxTurns?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxCacheReadTokens?: number;
  maxCacheCreationTokens?: number;
  /** Maximum measured context presented to any single provider call. */
  maxContextTokens?: number;
}

/** Risk class — DERIVED from requirements + capabilityTarget (never stored). */
export type RiskClass = 'low' | 'medium' | 'high';

/**
 * The canonical INPUT contract — unifies run/start/autonomous across CLI+MCP and
 * serves all four personas. No hardcoded 'claude': `provider`/`model` are
 * explicit or resolved upstream, never assumed. The envelope fields (below the
 * core) are OPTIONAL + consumed incrementally per their owning feature.
 */
export interface ExecutionRequest {
  // ── WHAT ──
  description: string;
  kind: TaskKind;
  // ── WHERE ──
  environment: EnvironmentType;
  // ── NEEDS ──
  requirements: RequirementProfile;
  // ── TARGET ──
  scope: TaskScope;
  /** Non-code work target (F8 broker) — for mail/calendar/ERP/DB work. */
  capabilityTarget?: CapabilityTarget;
  projectRoot: string;
  // ── OUTCOME ──
  goNogo?: GoNoGoCriteria;
  // ── HOW ──
  effort?: TaskEffort;
  priority?: TaskPriority;
  provider?: ProviderName;
  model?: ModelType;
  /** Native model reasoning-depth (F1-RE), distinct from work-size `effort`. */
  modelEffort?: string;
  authMode?: 'subscription' | 'api';
  agentId?: string;
  skillIds?: string[];
  autoApprove?: boolean;
  timeoutMs?: number;
  /** Opt-in native skills passthrough (AS4-P2). Maps to config native_skills_passthrough. Default-off. */
  useNativeSkills?: boolean;
  // ── INTERACTION ──
  mode?: InteractionMode;
  // ── IDENTITY / GOVERNANCE envelope ──
  actor?: ActorContext;
  origin?: RequestOrigin;
  /** Audit: groups related requests. */
  correlationId?: string;
  /** Audit: what caused this request (lineage, ENT-3). */
  causationId?: string;
  // ── CONSTRAINTS ──
  budget?: ExecutionBudget;
}

const HIGH_RISK_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'erp-write',
  'db-write',
  'shell',
]);
const MEDIUM_RISK_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'network',
  'fs-write',
  'erp-read',
  'db-query',
  'approval',
  'provider-pin',
  'tenant-scope',
  'mcp-tool',
]);

/**
 * Derive the {@link RiskClass} of a request from its declared capabilities +
 * capability-target verb (write/send/delete/exec → high). Pure; the single
 * source for governance gating (F10) — risk is NOT stored on the request.
 */
export function resolveRiskClass(
  req: Pick<ExecutionRequest, 'requirements' | 'capabilityTarget'>,
): RiskClass {
  const caps = req.requirements?.capabilities ?? [];
  if (caps.some((c) => HIGH_RISK_CAPABILITIES.has(c))) return 'high';
  const verb = req.capabilityTarget?.capability ?? '';
  if (/\.(send|write|create|delete|update|exec|drop)\b/i.test(verb)) return 'high';
  if (caps.some((c) => MEDIUM_RISK_CAPABILITIES.has(c))) return 'medium';
  return 'low';
}

// ─── Mirrored legacy enums (orchestra-resident; mirrored per ADR-008) ────────

/** Mirror of `rubric-registry.ts` TaskType (orchestra/). */
export type RubricTaskType = 'audit' | 'document-write' | 'code-development';

/** Mirror of `task-router.ts` TaskType (orchestra/). */
export type RouterTaskType = 'code' | 'test' | 'doc' | 'design' | 'unknown';

/** Mirror of `adr-selector.ts` TaskType (orchestra/). */
export type AdrTaskType =
  | 'core-dev'
  | 'docs'
  | 'test'
  | 'cli'
  | 'mcp'
  | 'security'
  | 'observability'
  | 'orchestra'
  | 'provider'
  | 'dashboard';

/**
 * WM-7 — Canonical technology-stack axis, ORTHOGONAL to TaskKind. TaskKind is
 * WHAT the work is (code/doc/audit/…); TechStackKind is the language/runtime it
 * targets. Drives: stack-aware GO/NO-GO criteria, coverage exemption (deckent
 * can only measure JS/TS coverage), and parametric/prime skill+agent routing
 * (so a Go project is never judged by `tsc` nor routed `typescript-expert`).
 */
export type TechStackKind =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin'
  | 'csharp'
  | 'swift'
  | 'cpp'
  | 'c'
  | 'ruby'
  | 'php'
  | 'dart'
  | 'generic';

/** Languages deckent can natively MEASURE test coverage for (vitest/v8 path). */
export const COVERAGE_MEASURABLE_STACKS: ReadonlySet<TechStackKind> = new Set<TechStackKind>([
  'typescript',
  'javascript',
]);

/**
 * Normalize a free-string project language (from stack-detector or IDENTITY.md
 * `Language:`) into the canonical {@link TechStackKind}. Pure + total: unknown
 * input → `'generic'` (callers degrade gracefully, never throw). Order matters —
 * `javascript` is matched before `java` because `'javascript'.includes('java')`.
 */
export function normalizeTechStack(language: string | undefined | null): TechStackKind {
  const l = (language ?? '').toLowerCase().trim();
  if (!l) return 'generic';
  if (l.includes('typescript') || l === 'ts' || l === 'tsx') return 'typescript';
  if (l.includes('javascript') || l === 'js' || l === 'jsx' || l === 'node' || l === 'nodejs') return 'javascript';
  if (l.includes('python') || l === 'py') return 'python';
  if (l === 'go' || l.includes('golang')) return 'go';
  if (l.includes('rust') || l === 'rs') return 'rust';
  if (l.includes('kotlin') || l === 'kt') return 'kotlin';
  if (l.includes('java')) return 'java';
  if (l.includes('csharp') || l === 'c#' || l === 'cs' || l.includes('dotnet') || l.includes('.net')) return 'csharp';
  if (l.includes('swift')) return 'swift';
  if (l.includes('c++') || l === 'cpp' || l.includes('cplusplus')) return 'cpp';
  if (l.includes('ruby') || l === 'rb') return 'ruby';
  if (l.includes('php')) return 'php';
  if (l === 'dart' || l.includes('flutter')) return 'dart';
  if (l === 'c' || l === 'clang') return 'c';
  return 'generic';
}

// ─── Legacy → canonical adapters (pure; spec §3) ─────────────────────────────

/** decision-types `TaskType` → canonical `TaskKind`. */
export function decisionTypeToKind(value: DecisionTaskType | string): TaskKind {
  switch (value) {
    case 'code':
      return 'code-development';
    case 'test':
      return 'test';
    case 'doc':
      return 'documentation';
    case 'security':
      return 'security';
    case 'refactor':
      return 'refactor';
    case 'devops':
      return 'devops';
    case 'config':
      return 'config';
    default:
      return 'generic';
  }
}

/** rubric-registry `TaskType` → canonical `TaskKind`. */
export function rubricTypeToKind(value: RubricTaskType | string): TaskKind {
  switch (value) {
    case 'audit':
      return 'audit';
    case 'document-write':
      return 'documentation';
    case 'code-development':
      return 'code-development';
    default:
      return 'generic';
  }
}

/** task-router `TaskType` → canonical `TaskKind`. */
export function routerTypeToKind(value: RouterTaskType | string): TaskKind {
  switch (value) {
    case 'code':
      return 'code-development';
    case 'test':
      return 'test';
    case 'doc':
      return 'documentation';
    case 'design':
      return 'design';
    case 'unknown':
      return 'generic';
    default:
      return 'generic';
  }
}

/** adr-selector `TaskType` → canonical `TaskKind`. */
export function adrSelectorToKind(value: AdrTaskType | string): TaskKind {
  switch (value) {
    case 'core-dev':
      return 'code-development';
    case 'docs':
      return 'documentation';
    case 'test':
      return 'test';
    case 'cli':
      return 'code-development';
    case 'mcp':
      return 'code-development';
    case 'security':
      return 'security';
    case 'observability':
      return 'devops';
    case 'orchestra':
      return 'code-development';
    case 'provider':
      return 'code-development';
    case 'dashboard':
      return 'design';
    default:
      return 'generic';
  }
}

/** routing-types `IntentType` → canonical `TaskKind`. */
export function intentToKind(value: IntentType | string): TaskKind {
  switch (value) {
    case 'implementation':
      return 'code-development';
    case 'bugfix':
      return 'code-development';
    case 'refactor':
      return 'refactor';
    case 'documentation':
      return 'documentation';
    case 'security':
      return 'security';
    case 'devops':
      return 'devops';
    case 'config':
      return 'config';
    case 'performance':
      return 'refactor';
    case 'design':
      return 'design';
    case 'migration':
      return 'refactor';
    case 'architecture':
      return 'code-development';
    case 'unknown':
      return 'generic';
    default:
      return 'generic';
  }
}

// ─── Reverse helpers (pure) — derive a subsystem view from canonical kind ────

/** Canonical `TaskKind` → rubric-registry rubric selector. */
export function taskKindToRubric(kind: TaskKind): RubricTaskType {
  switch (kind) {
    case 'audit':
      return 'audit';
    case 'documentation':
      return 'document-write';
    default:
      return 'code-development';
  }
}

/** Canonical `TaskKind` → adr-selector domain. */
export function taskKindToAdrDomain(kind: TaskKind): AdrTaskType {
  switch (kind) {
    case 'code-development':
      return 'core-dev';
    case 'test':
      return 'test';
    case 'documentation':
      return 'docs';
    case 'audit':
      return 'docs';
    case 'security':
      return 'security';
    case 'refactor':
      return 'core-dev';
    case 'devops':
      return 'observability';
    case 'config':
      return 'core-dev';
    case 'design':
      return 'dashboard';
    case 'data':
      return 'core-dev';
    case 'generic':
      return 'core-dev';
    default:
      return 'core-dev';
  }
}

// ─── Task-class prompt profile (593-002 — one classifier, three call sites) ──
//
// Before 593-002 the "what class of work is this?" predicate lived THREE times,
// each reading different inputs and drifting independently:
//   (1) prompt-god-template `buildWorkerCoreSystemPrompt` — raw scope + task.type,
//   (2) prompt-god-template `buildScopeBlock`            — sanitized write + raw read,
//   (3) coverage-validator  `isDocOnlyTask`              — directory prefixes.
// They are now ONE resolver living next to the existing kind-SSOT reverse helpers
// (`taskKindToRubric` / `taskKindToAdrDomain`) — no second parallel taxonomy.
//
// ADR-D-004 C1 (core/ must not import orchestra/): the legacy doc-vs-code
// FALLBACK heuristic is `rubric-registry.detectTaskType`, which lives in
// orchestra/. It is therefore INJECTED by the caller as
// {@link TaskProfileSignals.fallbackDocOnly} instead of imported here.
//
// ADR-G-027: the profile SELECTS prompt composition; it never truncates content.

/**
 * Canonical task-class as the prompt compiler and the coverage validator see it.
 *
 * - `inspection-only` — read targets, no write authority (read-only discipline),
 * - `doc-only`        — documentation-class work (no source to type-check/test),
 * - `code`            — everything else (the default, test-verified class).
 *
 * Precedence is fixed: inspection-only ▸ doc-only ▸ code. A task with an authored
 * read list and no write targets is inspection-only even when its kind is a doc
 * kind — write authority is the stronger signal (fail-closed).
 */
export type TaskPromptProfile = 'inspection-only' | 'doc-only' | 'code';

/**
 * The signals {@link resolveTaskPromptProfile} classifies from. Every field is
 * OPTIONAL on purpose: each call site supplies only the signals it actually owns
 * (the scope-block site has no task type; the coverage validator has only
 * directories), and an absent signal is simply not consulted — so delegating a
 * legacy predicate is behavior-identical rather than behavior-widening.
 */
export interface TaskProfileSignals {
  /** Declared canonical kind (`task.type`). Empty/absent → {@link fallbackDocOnly}. */
  type?: TaskKind | string | null;
  /** Scope signals. `filesWrite` is whatever the caller owns — RAW or already sanitized. */
  scope?: {
    readonly filesWrite?: readonly string[];
    readonly filesRead?: readonly string[];
    readonly directories?: readonly string[];
  } | null;
  /**
   * Doc-vs-code fallback used ONLY when `type` is absent (legacy/direct-run path).
   * Injected by the caller because the canonical implementation
   * (`rubric-registry.detectTaskType`) lives in orchestra/ (ADR-D-004 C1).
   * Absent → the directory-prefix heuristic below is used instead.
   */
  fallbackDocOnly?: () => boolean;
}

/**
 * Config surface for the profile resolver (`prompt.task_profiles`). Defaults
 * reproduce the pre-593-002 hardcoded literals exactly, so the config skeleton
 * changes NO behavior until an operator overrides it.
 */
export interface TaskProfileConfig {
  /** `task.type` values classified as documentation-class. */
  readonly doc_kinds: readonly string[];
  /** Directory prefixes that mark source-code work (anything else is doc-only). */
  readonly code_directories: readonly string[];
}

/** Behavior-preserving defaults — the literals the three legacy predicates carried. */
export const DEFAULT_TASK_PROFILES: TaskProfileConfig = {
  // buildWorkerCoreSystemPrompt / renderSegments verify-tier doc-kind set.
  doc_kinds: ['documentation', 'design', 'audit'],
  // coverage-validator `sourceCodeDirs`.
  code_directories: ['src/', 'src', 'tests/', 'tests', 'lib/', 'lib'],
};

/**
 * THE canonical task-class classifier — one predicate, three (now four) call sites.
 *
 * Pure and total: unknown/absent signals degrade to `'code'` (the conservative,
 * fully-verified class) rather than throwing. Resolution order:
 *   1. scope shape  → no write targets + an authored read list ⇒ `inspection-only`,
 *   2. declared kind → member of `doc_kinds` ⇒ `doc-only`, otherwise ⇒ `code`,
 *   3. injected fallback (`fallbackDocOnly`) when no kind was declared,
 *   4. directory prefixes — no `code_directories` hit (and a non-empty list) ⇒ `doc-only`.
 *
 * @param profiles partial `prompt.task_profiles` override; missing fields fall
 *        back per-field to {@link DEFAULT_TASK_PROFILES}.
 */
export function resolveTaskPromptProfile(
  signals: TaskProfileSignals,
  profiles: Partial<TaskProfileConfig> = DEFAULT_TASK_PROFILES,
): TaskPromptProfile {
  const scope = signals.scope;
  // (1) Inspection-only — fail-closed: presence of an authored read list with no
  // write target selects read-only mode (legacy sites 1 + 2, byte-identical).
  if ((scope?.filesWrite?.length ?? 0) === 0 && (scope?.filesRead?.length ?? 0) > 0) {
    return 'inspection-only';
  }
  // (2) Declared kind wins over every heuristic (legacy site 1).
  const type = signals.type;
  if (type) {
    const docKinds = profiles.doc_kinds ?? DEFAULT_TASK_PROFILES.doc_kinds;
    return docKinds.includes(type) ? 'doc-only' : 'code';
  }
  // (3) Caller-injected legacy fallback (rubric-registry detectTaskType).
  if (signals.fallbackDocOnly) return signals.fallbackDocOnly() ? 'doc-only' : 'code';
  // (4) Directory-prefix heuristic (legacy site 3). An empty directory list is
  // NOT evidence of doc-only work → 'code'.
  const dirs = scope?.directories ?? [];
  if (dirs.length === 0) return 'code';
  const codeDirs = profiles.code_directories ?? DEFAULT_TASK_PROFILES.code_directories;
  const touchesCode = dirs.some(d => codeDirs.some(s => d.startsWith(s) || d === s));
  return touchesCode ? 'code' : 'doc-only';
}

/** Canonical `TaskKind` → routing-types intent. */
export function taskKindToIntent(kind: TaskKind): IntentType {
  switch (kind) {
    case 'code-development':
      return 'implementation';
    case 'test':
      return 'implementation';
    case 'documentation':
      return 'documentation';
    case 'audit':
      return 'documentation';
    case 'security':
      return 'security';
    case 'refactor':
      return 'refactor';
    case 'devops':
      return 'devops';
    case 'config':
      return 'config';
    case 'design':
      return 'design';
    case 'data':
      return 'implementation';
    case 'generic':
      return 'unknown';
    default:
      return 'unknown';
  }
}
