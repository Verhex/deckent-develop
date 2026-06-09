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

/** The fundamental nature of a unit of work. ONE taxonomy; subsystems map from it. */
export type TaskKind =
  | 'code-development'
  | 'test'
  | 'documentation'
  | 'audit'
  | 'security'
  | 'refactor'
  | 'devops'
  | 'config'
  | 'design'
  | 'data'
  | 'generic';

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

/**
 * The canonical INPUT contract — unifies run/start/autonomous across CLI+MCP.
 * No hardcoded 'claude': `provider`/`model` are explicit or resolved upstream,
 * never assumed.
 */
export interface ExecutionRequest {
  description: string;
  kind: TaskKind;
  environment: EnvironmentType;
  requirements: RequirementProfile;
  scope: TaskScope;
  projectRoot: string;
  goNogo?: GoNoGoCriteria;
  effort?: TaskEffort;
  priority?: TaskPriority;
  provider?: ProviderName;
  model?: ModelType;
  authMode?: 'subscription' | 'api';
  agentId?: string;
  skillIds?: string[];
  autoApprove?: boolean;
  timeoutMs?: number;
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
