// ─── Onboarding Wizard Core (ONB-WIZARD-CORE, Sprint 361 Task 361-009) ─────
//
// Pure core for the install→init onboarding wizard (Sıra-201 dilim-1, sibling
// of Sıra-200 ONB-GLOBAL). A 5-phase step machine — provider-detect →
// auth-status → mcp-suggestion → workspace/mode selection → config-write-plan
// — that turns injected probe results into a `OnboardingConfigWritePlan`
// object. Like `/connect`'s wizard core (`cli/helpers/connect-wizard.ts`,
// Sprint 353), NOTHING here spawns a process, reads a file, or touches the
// network directly — every external signal comes from an injected probe, and
// the terminal step produces a PLAN only. Actually writing that plan to disk
// (`config.json`) is an explicit, separate follow-up step (Ink-UI wiring),
// not this module's job.
//
// String-free: every user-facing label is a `*Key` identifier the caller
// resolves via `getMessage()` (cli/helpers/messages.ts) — this module never
// contains literal English/Turkish text. New message keys this module
// introduces are NOT added to messages.ts here (out of this task's write
// scope) — see the worker's `.result` `docImpact` note.
//
// Reuse, not reinvention (disk-verified):
//   - provider-detect → `discoverProviders()` (core/provider-discovery.ts,
//     356-007 ONB-DISCOVERY) — PATH-level CLI presence/version, injectable.
//   - auth-status → `probeProviderAuth()` (core/provider-auth-probe.ts,
//     356-009 PSL-6-WIRE) — real login-state probe with the enriched
//     present/authenticated/method fields (GAP-4 fix: "CLI installed" ≠
//     "logged in").
//   - mcp-suggestion → `detectAttachStatus()` / `getAttachCommand()`
//     (cli/helpers/mcp-attach.ts) — same host-CLI MCP attach primitives
//     connect-wizard.ts already uses.
//   - workspace scope → `normalizeGlobalScopePlatform()` /
//     `resolveGlobalScopePaths()` (core/global-scope-resolver.ts, Sıra-200
//     ONB-GLOBAL dilim-1) — the pure, injectable, intentionally-unwired
//     global-scope resolver; this wizard is exactly the kind of consumer its
//     own module doc anticipates.
//   - plan mode → `getModePreset()` (core/mode-presets.ts) for an honest
//     preview (returns `undefined`, never invented, for the 3 subscription
//     modes without a MODE_PRESETS entry).

import { basename, join } from 'node:path';
import {
  discoverProviders,
  DISCOVERABLE_PROVIDERS,
  type DiscoverableProviderName,
  type DiscoverProvidersProbes,
  type ProviderDiscoveryResult,
} from '../../core/provider-discovery.js';
import { probeProviderAuth, type AuthProbeResult } from '../../core/provider-auth-probe.js';
import { detectAttachStatus, getAttachCommand, type McpAttachStatus } from './mcp-attach.js';
import {
  normalizeGlobalScopePlatform,
  resolveGlobalScopePaths,
  GlobalScopeResolutionError,
  type GlobalScopeEnv,
  type GlobalScopePaths,
} from '../../core/global-scope-resolver.js';
import { getModePreset, type ModelStrategy } from '../../core/mode-presets.js';
import type { PlanMode } from '../../core/types.js';
import { DECKENT_DIR } from '../../core/constants.js';

// ─── Provider Names ──────────────────────────────────────────────────────

/** The three CLI-backed providers this wizard understands (reuses the 356-007 tuple). */
export type OnboardingProviderName = DiscoverableProviderName;

/** Fixed iteration order — every result array below is built from this tuple. */
export const ONBOARDING_PROVIDERS: readonly OnboardingProviderName[] = DISCOVERABLE_PROVIDERS;

// ─── Step 1+2: Provider Detect + Auth Status ────────────────────────────

/** One provider's merged discovery (PATH presence/version) + real auth state. */
export interface OnboardingProviderAuthStatus {
  name: OnboardingProviderName;
  discovery: ProviderDiscoveryResult;
  auth: AuthProbeResult;
}

/** Real auth probe shape — mirrors `probeProviderAuth`'s per-provider signature. */
export type OnboardingAuthProbe = (name: OnboardingProviderName) => Promise<AuthProbeResult>;

/**
 * Step 1 — PATH-level provider discovery. Thin, explicitly-named wrapper
 * around `discoverProviders()` so this phase has its own injectable seam
 * and test target, distinct from step 2's richer auth probe.
 */
export async function detectOnboardingProviders(
  probes: DiscoverProvidersProbes = {},
): Promise<ProviderDiscoveryResult[]> {
  return discoverProviders(probes);
}

/**
 * Step 2 — real login-state probe per discovered provider. Deliberately
 * separate from step 1: `discoverProviders`'s own optional `auth` probe only
 * returns a coarse `AuthProbeState`, while `probeProviderAuth` (356-009)
 * returns the richer `present`/`authenticated`/`method` breakdown this
 * wizard's later steps (provider auto-pick, config-write-plan) rely on.
 */
export async function probeOnboardingAuthStatus(
  providers: ProviderDiscoveryResult[],
  authProbe: OnboardingAuthProbe = (name) => probeProviderAuth(name),
): Promise<OnboardingProviderAuthStatus[]> {
  const results: OnboardingProviderAuthStatus[] = [];
  for (const discovery of providers) {
    const auth = await authProbe(discovery.name);
    results.push({ name: discovery.name, discovery, auth });
  }
  return results;
}

// ─── Step 3: MCP Suggestion ──────────────────────────────────────────────

export interface OnboardingMcpSuggestion {
  host: OnboardingProviderName;
  status: McpAttachStatus;
  /** True only when the host CLI supports MCP attach and isn't attached yet. */
  suggested: boolean;
  /** Argv form of the attach command — present only when `suggested`. */
  attachCommand?: { cmd: string; args: readonly string[] };
  /** i18n key resolved by the caller via getMessage(); never literal text. */
  descriptionKey: string;
  descriptionParams?: Record<string, string>;
}

/** Real MCP attach-status probe shape — mirrors `detectAttachStatus`'s signature. */
export type OnboardingMcpAttachProbe = (host: OnboardingProviderName) => McpAttachStatus;

/**
 * Step 3 — for each provider whose CLI is actually installed (`discovery.present`),
 * probe MCP attach status and suggest an attach action when applicable. A host
 * whose CLI isn't installed is never probed (nothing to attach to yet) —
 * surfaced as its own honest `descriptionKey` instead.
 */
export function suggestMcpAttachments(
  providers: OnboardingProviderAuthStatus[],
  attachProbe: OnboardingMcpAttachProbe = (host) => detectAttachStatus(host),
): OnboardingMcpSuggestion[] {
  return providers.map(({ name, discovery }): OnboardingMcpSuggestion => {
    if (!discovery.present) {
      return {
        host: name,
        status: { host: name, supported: false, attached: false, toolCount: 0, reason: 'cli-not-installed' },
        suggested: false,
        descriptionKey: 'onboarding.mcp.host_not_installed',
        descriptionParams: { host: name },
      };
    }

    const status = attachProbe(name);

    if (!status.supported) {
      return {
        host: name,
        status,
        suggested: false,
        descriptionKey: 'onboarding.mcp.unsupported',
        descriptionParams: { host: name },
      };
    }

    if (status.attached) {
      return {
        host: name,
        status,
        suggested: false,
        descriptionKey: 'onboarding.mcp.already_attached',
        descriptionParams: { host: name },
      };
    }

    const attachCommand = getAttachCommand(name)?.add;
    return {
      host: name,
      status,
      suggested: true,
      attachCommand,
      descriptionKey: 'onboarding.mcp.attach_suggested',
      descriptionParams: { host: name },
    };
  });
}

// ─── Step 4: Workspace / Mode Selection ─────────────────────────────────

/** Where the resolved config would live: this project only, or user-machine-wide. */
export type WorkspaceScope = 'project' | 'global';

/**
 * Full `PlanMode` domain (config-types.ts). Enumerated here (not exported
 * from config-types.ts as a values array) purely for question-choice
 * iteration — mirrors the same values-array-beside-the-type pattern
 * `DISCOVERABLE_PROVIDERS`/`CONNECT_PROVIDERS` already use for their unions.
 */
export const ALL_PLAN_MODES: readonly PlanMode[] = [
  'performance', 'balanced', 'economic', 'api', 'max_plan', 'max5x_plan', 'pro_plan',
] as const;

/** One selectable choice within an {@link OnboardingQuestion} — value plus a caller-resolved label key. */
export interface OnboardingQuestionChoice<V extends string = string> {
  value: V;
  labelKey: string;
  labelParams?: Record<string, string>;
}

/** A single wizard question. Structure only — no literal prompt/label text. */
export interface OnboardingQuestion<V extends string = string> {
  id: string;
  promptKey: string;
  choices: ReadonlyArray<OnboardingQuestionChoice<V>>;
  defaultValue: V;
}

export interface OnboardingWorkspaceModeQuestions {
  scope: OnboardingQuestion<WorkspaceScope>;
  mode: OnboardingQuestion<PlanMode>;
}

/** Caller-resolved answers to {@link OnboardingWorkspaceModeQuestions}. Omitted fields fall back to defaultValue. */
export interface OnboardingWorkspaceAnswers {
  scope?: WorkspaceScope;
  mode?: PlanMode;
}

export interface OnboardingWorkspaceSelection {
  scope: WorkspaceScope;
  mode: PlanMode;
  /** Resolved directory the config would live under (project root, or the resolved global configDir). */
  root: string;
  /** Tier-based preview for `mode` — `undefined` when the mode has no MODE_PRESETS entry (honest, not invented). */
  modePreset?: { model_strategy: ModelStrategy; max_workers: number };
  /** Populated only when `scope === 'global'` and resolution succeeded. */
  globalPaths?: GlobalScopePaths;
  /** Populated only when `scope === 'global'` and resolution failed — falls back to `projectRoot` for `root`. */
  globalScopeError?: string;
}

/** Question structure for step 4 — no probe needed, purely static choice/key scaffolding. */
export function buildWorkspaceModeQuestions(): OnboardingWorkspaceModeQuestions {
  return {
    scope: {
      id: 'workspace_scope',
      promptKey: 'onboarding.question.workspace_scope',
      choices: [
        { value: 'project', labelKey: 'onboarding.choice.workspace_scope.project' },
        { value: 'global', labelKey: 'onboarding.choice.workspace_scope.global' },
      ],
      defaultValue: 'project',
    },
    mode: {
      id: 'plan_mode',
      promptKey: 'onboarding.question.plan_mode',
      choices: ALL_PLAN_MODES.map((m) => ({ value: m, labelKey: `onboarding.choice.plan_mode.${m}` })),
      defaultValue: 'balanced',
    },
  };
}

/** Injectable platform/env seam for step 4's global-scope resolution — mirrors global-scope-resolver.ts's own contract. */
export interface OnboardingWorkspaceProbeInput {
  projectRoot: string;
  platform: string;
  env: GlobalScopeEnv;
}

/**
 * Step 4 — resolve the workspace-scope + plan-mode questions into a concrete
 * selection. Pure: `platform`/`env` must already be resolved by the caller
 * (the `runOnboardingWizard` orchestrator is the one place that defaults them
 * to `process.platform`/`process.env` — this function never reads either).
 */
export function resolveWorkspaceSelection(
  input: OnboardingWorkspaceProbeInput,
  answers: OnboardingWorkspaceAnswers = {},
  questions: OnboardingWorkspaceModeQuestions = buildWorkspaceModeQuestions(),
): OnboardingWorkspaceSelection {
  const scope = answers.scope ?? questions.scope.defaultValue;
  const mode = answers.mode ?? questions.mode.defaultValue;
  const modePreset = getModePreset(mode);

  if (scope === 'project') {
    return { scope, mode, root: input.projectRoot, modePreset };
  }

  try {
    const normalized = normalizeGlobalScopePlatform(input.platform, input.env);
    const globalPaths = resolveGlobalScopePaths(normalized, input.env);
    return { scope, mode, root: globalPaths.configDir, modePreset, globalPaths };
  } catch (error) {
    const message = error instanceof GlobalScopeResolutionError ? error.message : String(error);
    return { scope, mode, root: input.projectRoot, modePreset, globalScopeError: message };
  }
}

// ─── Step 5: Config-Write Plan ───────────────────────────────────────────

/** Which provider(s) the config-write-plan would assign — auto-picked or caller-supplied. */
export interface OnboardingProviderSelection {
  brain_provider?: OnboardingProviderName;
  worker_provider?: OnboardingProviderName;
  fallback_provider?: OnboardingProviderName;
  /** Set instead of the above when no authenticated provider was found and no answer overrode it. */
  blockedReasonKey?: string;
}

/** Caller override for provider selection — omitted fields fall back to auto-pick. */
export interface OnboardingProviderAnswers {
  brain_provider?: OnboardingProviderName;
  worker_provider?: OnboardingProviderName;
  fallback_provider?: OnboardingProviderName;
}

/**
 * Auto-pick policy: first `DISCOVERABLE_PROVIDERS`-order provider with a
 * confirmed `logged-in` auth state becomes brain+worker; the next
 * authenticated provider (if any) becomes fallback. A caller-supplied
 * `brain_provider` (or `worker_provider`) always wins outright.
 */
export function selectOnboardingProviders(
  providers: OnboardingProviderAuthStatus[],
  answers: OnboardingProviderAnswers = {},
): OnboardingProviderSelection {
  if (answers.brain_provider ?? answers.worker_provider) {
    return {
      brain_provider: answers.brain_provider ?? answers.worker_provider,
      worker_provider: answers.worker_provider ?? answers.brain_provider,
      fallback_provider: answers.fallback_provider,
    };
  }

  const authenticated = providers.filter((p) => p.auth.state === 'logged-in');
  if (authenticated.length === 0) {
    return { blockedReasonKey: 'onboarding.provider.none_authenticated' };
  }

  const primary = authenticated[0]!.name;
  const fallback = authenticated.find((p) => p.name !== primary)?.name;
  return { brain_provider: primary, worker_provider: primary, fallback_provider: fallback };
}

export interface OnboardingConfigWritePlan {
  /** Where config.json WOULD be written — never actually written by this module. */
  configPath: string;
  /** Contract-explicit marker: this is a plan, not an applied write. Applying it is a separate step. */
  applied: false;
  fields: {
    mode: PlanMode;
    language: string;
    projectName: string;
    brain_provider?: OnboardingProviderName;
    worker_provider?: OnboardingProviderName;
    fallback_provider?: OnboardingProviderName;
    model_strategy?: ModelStrategy;
  };
  /** MCP attach commands the plan would ALSO run, when applied — from step 3's suggestions. */
  mcpAttachActions: Array<{ host: OnboardingProviderName; command: readonly string[] }>;
  /** Carried through from provider selection when no provider could be auto-picked. */
  blockedReasonKey?: string;
}

/** Step 5 — pure derivation, no probe: folds steps 1-4's outputs into a plan object. */
export function planConfigWrite(
  workspace: OnboardingWorkspaceSelection,
  providerSelection: OnboardingProviderSelection,
  mcp: OnboardingMcpSuggestion[],
  meta: { language: string; projectName: string },
): OnboardingConfigWritePlan {
  const configPath = join(workspace.root, DECKENT_DIR, 'config.json');
  const mcpAttachActions = mcp
    .filter((m) => m.suggested && m.attachCommand)
    .map((m) => ({ host: m.host, command: [m.attachCommand!.cmd, ...m.attachCommand!.args] }));

  return {
    configPath,
    applied: false,
    fields: {
      mode: workspace.mode,
      language: meta.language,
      projectName: meta.projectName,
      brain_provider: providerSelection.brain_provider,
      worker_provider: providerSelection.worker_provider,
      fallback_provider: providerSelection.fallback_provider,
      model_strategy: workspace.modePreset?.model_strategy,
    },
    mcpAttachActions,
    blockedReasonKey: providerSelection.blockedReasonKey,
  };
}

// ─── Orchestrator ────────────────────────────────────────────────────────

/** Injectable seam bag for the full wizard. Every field is optional — omitted seams fall back to real wiring. */
export interface OnboardingProbes {
  /** Step 1 seam — defaults to real PATH probing (`discoverProviders`'s own default). */
  discovery?: DiscoverProvidersProbes;
  /** Step 2 seam — defaults to real `probeProviderAuth`. */
  auth?: OnboardingAuthProbe;
  /** Step 3 seam — defaults to real `detectAttachStatus`. */
  mcpAttach?: OnboardingMcpAttachProbe;
  /** Step 4 seam — defaults to real `process.platform`. */
  platform?: string;
  /** Step 4 seam — defaults to real `process.env`. */
  env?: GlobalScopeEnv;
}

export interface OnboardingWizardAnswers extends OnboardingWorkspaceAnswers, OnboardingProviderAnswers {}

export interface OnboardingWizardInput {
  projectRoot: string;
  /** Defaults to `'en'`. */
  language?: string;
  /** Defaults to `basename(projectRoot)`. */
  projectName?: string;
  answers?: OnboardingWizardAnswers;
  probes?: OnboardingProbes;
}

/**
 * Ordered trace of the 5-step machine — one entry per phase, discriminated on
 * `kind`. Lets callers (and tests) introspect exactly what each step produced
 * without re-deriving it from the final result's flattened fields.
 */
export type OnboardingStepResult =
  | { kind: 'provider_detect'; providers: ProviderDiscoveryResult[] }
  | { kind: 'auth_status'; providers: OnboardingProviderAuthStatus[] }
  | { kind: 'mcp_suggestion'; suggestions: OnboardingMcpSuggestion[] }
  | { kind: 'workspace_mode'; questions: OnboardingWorkspaceModeQuestions; selection: OnboardingWorkspaceSelection }
  | { kind: 'config_plan'; plan: OnboardingConfigWritePlan };

export interface OnboardingWizardResult {
  steps: OnboardingStepResult[];
  providers: OnboardingProviderAuthStatus[];
  mcp: OnboardingMcpSuggestion[];
  workspaceQuestions: OnboardingWorkspaceModeQuestions;
  workspace: OnboardingWorkspaceSelection;
  providerSelection: OnboardingProviderSelection;
  configPlan: OnboardingConfigWritePlan;
}

/**
 * Run the full 5-step onboarding wizard: provider-detect → auth-status →
 * mcp-suggestion → workspace/mode selection → config-write-plan. No real
 * write/network happens here — every external signal comes from `input.probes`
 * (falling back to real wiring only at this single outer seam, exactly like
 * connect-wizard.ts's `createDefaultConnectProbes`).
 */
export async function runOnboardingWizard(input: OnboardingWizardInput): Promise<OnboardingWizardResult> {
  const probes = input.probes ?? {};
  const steps: OnboardingStepResult[] = [];

  const discovered = await detectOnboardingProviders(probes.discovery ?? {});
  steps.push({ kind: 'provider_detect', providers: discovered });

  const withAuth = await probeOnboardingAuthStatus(discovered, probes.auth);
  steps.push({ kind: 'auth_status', providers: withAuth });

  const mcp = suggestMcpAttachments(withAuth, probes.mcpAttach);
  steps.push({ kind: 'mcp_suggestion', suggestions: mcp });

  const questions = buildWorkspaceModeQuestions();
  const workspace = resolveWorkspaceSelection(
    {
      projectRoot: input.projectRoot,
      platform: probes.platform ?? process.platform,
      env: probes.env ?? process.env,
    },
    { scope: input.answers?.scope, mode: input.answers?.mode },
    questions,
  );
  steps.push({ kind: 'workspace_mode', questions, selection: workspace });

  const providerSelection = selectOnboardingProviders(withAuth, {
    brain_provider: input.answers?.brain_provider,
    worker_provider: input.answers?.worker_provider,
    fallback_provider: input.answers?.fallback_provider,
  });

  const configPlan = planConfigWrite(workspace, providerSelection, mcp, {
    language: input.language ?? 'en',
    projectName: input.projectName ?? basename(input.projectRoot),
  });
  steps.push({ kind: 'config_plan', plan: configPlan });

  return { steps, providers: withAuth, mcp, workspaceQuestions: questions, workspace, providerSelection, configPlan };
}
