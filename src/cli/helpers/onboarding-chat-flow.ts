// ─── Onboarding Chat-Flow Core (ONB-CHAT-CORE, Sprint 361 Task 361-016) ────
//
// NL layer on top of `onboarding-wizard.ts`'s (361-009) 5-step machine:
// "deckent → sohbetle tüm setup" (Sıra-202 dilim-1). This module does NOT
// reimplement the wizard — it drives the SAME exported step functions one at
// a time, pausing to ask a question only for the 3 of 5 steps that need a
// human decision (`mcp_suggestion`, and `workspace_mode`'s scope+mode pair);
// `provider_detect`/`auth_status` are pure probes with nothing to ask, and
// `config_plan` is a pure derive-and-finish step. `OnboardingChatStepId` is
// literally `OnboardingStepResult['kind']` — the wizard's own step kinds,
// walked in the wizard's own order.
//
// Intent interpretation is a deterministic, rule-based core: yes/no/skip
// word-lists (tr+en) checked first, then choice-value / 1-based-index
// matching against the current question's choices, then (ONB-CHAT-DILIM-2,
// Sprint 368 Task 368-004) a TR+EN meta-intent phrase list — "connect
// provider" / "show limits" / "how do I start a sprint" / "doctor" — for
// requests that are a detour, not an answer. A meta-intent reply does NOT
// advance the flow (interrupt-resume: `pending` is untouched, `lastMetaResponse`
// carries the helpful-feature suggestion back to the caller instead). An
// `OnboardingIntentFallback` seam exists for a real NL/LLM interpreter to plug
// in later, but is never wired to one here — by default an unrecognized reply
// simply re-asks the same question (`unknown` stays `unknown`).
//
// State (`OnboardingChatState`) is plain JSON data only — no functions, no
// probes. `startOnboardingChat`/`replyToOnboardingChat` take `input` (with
// probes) fresh on every call, exactly like the wizard's own `probes` param.
// That is what makes `JSON.parse(JSON.stringify(state))` a valid pause/resume
// round-trip: persist the state, drop it, reload it later, keep answering.
//
// String-free: every user-facing label is a `*Key` identifier the caller
// resolves via `getMessage()` (cli/helpers/messages.ts). `ONBOARDING_CHAT_MCP_QUESTION_KEY`
// and the `onboarding.suggestion.*` keys `generateOnboardingFeatureSuggestions`
// emits predate messages.ts registration (361-016 docImpact, still open —
// out of THIS task's scope). The 3 new `onboarding.chat.suggestion.*` keys this
// task's meta-intents introduce ARE registered in messages.ts, since messages.ts
// is in this task's write scope and the code introducing them is new.
// The `workspace_mode` step's question keys are NOT re-declared here at all —
// they come straight from the wizard's own `buildWorkspaceModeQuestions()`,
// so there is a single source of truth and zero drift risk.

import { basename } from 'node:path';
import {
  detectOnboardingProviders,
  probeOnboardingAuthStatus,
  suggestMcpAttachments,
  buildWorkspaceModeQuestions,
  resolveWorkspaceSelection,
  selectOnboardingProviders,
  planConfigWrite,
  type OnboardingProbes,
  type OnboardingStepResult,
  type OnboardingWizardResult,
  type OnboardingWorkspaceAnswers,
  type OnboardingQuestionChoice,
  type WorkspaceScope,
} from './onboarding-wizard.js';
import type { PlanMode } from '../../core/types.js';

// ─── Intent Matching ─────────────────────────────────────────────────────

/** Deterministic-core result shape for one interpreted user reply. */
export type OnboardingChatIntent =
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'skip' }
  | { kind: 'choice'; value: string }
  | { kind: 'meta'; action: OnboardingChatMetaAction }
  | { kind: 'unknown'; raw: string };

/**
 * A "meta"-intent (ONB-CHAT-DILIM-2, Sprint 368 Task 368-004): a request that
 * is NOT an answer to the currently-pending wizard question, but a detour the
 * user wants mid-flow — connect a provider, check usage limits, get pointed
 * at how to start a sprint, or bridge to `deckent doctor`. Recognizing one of
 * these does NOT advance the flow (see `replyToOnboardingChat`'s interrupt-resume
 * handling): the pending question stays exactly as it was.
 */
export type OnboardingChatMetaAction = 'connect_provider' | 'show_limits' | 'start_sprint' | 'doctor';

/** Context the matcher needs to resolve a "seçenek-adı" (choice-name) reply. */
export interface OnboardingIntentContext {
  choices?: ReadonlyArray<OnboardingQuestionChoice>;
}

/**
 * Injectable NL/LLM interpretation seam — invoked ONLY when the deterministic
 * matcher returns `unknown`. Never wired to a real LLM by this module; omit it
 * (the default) to leave `unknown` replies as `unknown` (caller re-asks).
 */
export type OnboardingIntentFallback = (
  raw: string,
  context: OnboardingIntentContext,
) => OnboardingChatIntent | undefined | Promise<OnboardingChatIntent | undefined>;

const YES_WORDS = new Set(['y', 'yes', 'yeah', 'yep', 'evet', 'e', 'tamam', 'ok', 'okay', 'olur']);
const NO_WORDS = new Set(['n', 'no', 'nope', 'hayır', 'hayir', 'h', 'istemiyorum', 'iptal']);
const SKIP_WORDS = new Set(['skip', 'atla', 'geç', 'gec', 'pas', 'sonra', 'next']);

/**
 * TR+EN phrase list per meta-action, matched by plain substring — same
 * deterministic, no-LLM philosophy as the yes/no/skip word-lists above, just
 * phrase-length instead of single-token. Not exhaustive NLP coverage by
 * design (YAGNI); covers the phrasings named in the ONB-CHAT-DILIM-2 spec
 * plus their direct TR/EN counterparts.
 */
const META_INTENT_PATTERNS: Record<OnboardingChatMetaAction, readonly string[]> = {
  connect_provider: [
    'provider bağla', 'provider bagla', 'sağlayıcı bağla', 'saglayici bagla', 'provider ekle',
    'connect provider', 'connect a provider', 'add provider', 'link provider',
  ],
  show_limits: [
    'limit göster', 'limit goster', 'kota göster', 'kota goster', 'limitlerim', 'kotam',
    'show limits', 'show my limits', 'show quota', 'show my quota', 'usage limits',
  ],
  start_sprint: [
    'sprint nasıl başlatırım', 'sprint nasil baslatirim', 'sprint başlat', 'sprint baslat',
    'how do i start a sprint', 'how to start a sprint', 'start a sprint',
  ],
  doctor: [
    'sorun var', 'bir sorun var', 'hata var', 'doctor çalıştır', 'doctor calistir', 'doctor',
    'something is wrong', "something's wrong", 'there is a problem', "there's a problem", 'run doctor',
  ],
};

/** Returns the first meta-action whose pattern list matches `lower` as a substring, else `undefined`. */
function matchMetaIntent(lower: string): OnboardingChatMetaAction | undefined {
  for (const action of Object.keys(META_INTENT_PATTERNS) as OnboardingChatMetaAction[]) {
    if (META_INTENT_PATTERNS[action].some((pattern) => lower.includes(pattern))) {
      return action;
    }
  }
  return undefined;
}

/**
 * Deterministic rule-based core: yes/no/skip word-lists first, then
 * choice-by-value or choice-by-1-based-index against `context.choices` (an
 * exact answer to the currently-pending question always wins over a
 * coincidental meta-phrase collision), then the meta-intent phrase list,
 * else `unknown`. An empty/whitespace-only reply is treated as `skip`
 * (accepting the question's default is the safe, non-blocking behavior for
 * "just enter").
 */
export function interpretChatAnswer(raw: string, context: OnboardingIntentContext = {}): OnboardingChatIntent {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'skip' };
  const lower = trimmed.toLowerCase();

  if (SKIP_WORDS.has(lower)) return { kind: 'skip' };
  if (YES_WORDS.has(lower)) return { kind: 'yes' };
  if (NO_WORDS.has(lower)) return { kind: 'no' };

  const choices = context.choices ?? [];
  const byValue = choices.find((c) => c.value.toLowerCase() === lower);
  if (byValue) return { kind: 'choice', value: byValue.value };

  const index = Number(trimmed);
  if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
    return { kind: 'choice', value: choices[index - 1]!.value };
  }

  const metaAction = matchMetaIntent(lower);
  if (metaAction) return { kind: 'meta', action: metaAction };

  return { kind: 'unknown', raw: trimmed };
}

// ─── Step Machine ────────────────────────────────────────────────────────

/** The wizard's own 5 step kinds, walked in the wizard's own order. */
export type OnboardingChatStepId = OnboardingStepResult['kind'];

const ONBOARDING_CHAT_STEP_ORDER: readonly OnboardingChatStepId[] = [
  'provider_detect', 'auth_status', 'mcp_suggestion', 'workspace_mode', 'config_plan',
];

/** New message key this module introduces — asked only when >=1 MCP host is suggested. */
export const ONBOARDING_CHAT_MCP_QUESTION_KEY = 'onboarding.chat.question.mcp_attach';

/** One outstanding question the caller must resolve (via `interpretChatAnswer`) before the flow can proceed. */
export interface OnboardingChatQuestion {
  stepId: Extract<OnboardingChatStepId, 'mcp_suggestion' | 'workspace_mode'>;
  /** Only set for `workspace_mode`, which has 2 sub-questions. */
  questionId?: 'scope' | 'mode';
  /** getMessage key the caller resolves for the prompt text — never literal text. */
  promptKey: string;
  /** Present for choice-style questions (workspace_mode); absent for yes/no/skip questions (mcp_suggestion). */
  choices?: ReadonlyArray<OnboardingQuestionChoice>;
}

/** Fully JSON-serializable — safe to persist and resume via `JSON.parse(JSON.stringify(state))`. */
export interface OnboardingChatState {
  stepIndex: number;
  /** 0 = ask scope, 1 = ask mode, 2 = both answered (resolve + advance on next tick). Only meaningful during `workspace_mode`. */
  workspaceSubIndex: 0 | 1 | 2;
  status: 'in_progress' | 'done';
  answers: OnboardingWorkspaceAnswers;
  mcpAttachDeclined: boolean;
  /** Completed wizard step results, in order — same shape `runOnboardingWizard` produces. */
  steps: OnboardingStepResult[];
  pending?: OnboardingChatQuestion;
  /** Set once `status === 'done'` — same shape `runOnboardingWizard` returns. */
  result?: OnboardingWizardResult;
  /** Last reply that neither matched deterministically nor via the fallback seam — cleared on the next successful match. */
  lastUnrecognizedReply?: string;
  /**
   * Set when the most recent reply was a meta-intent (ONB-CHAT-DILIM-2) —
   * "connect provider" / "show limits" / "how do I start a sprint" /
   * "doctor" — recognized WHILE `pending` was set. `pending` is left
   * untouched (interrupt-resume: the original question is still there to
   * answer next). Cleared on the very next reply, whatever kind it is.
   */
  lastMetaResponse?: OnboardingChatMetaResponse;
}

/** A meta-intent's helpful-feature response — the Deckent-suggestion principle applied mid-flow. */
export interface OnboardingChatMetaResponse {
  action: OnboardingChatMetaAction;
  suggestion: OnboardingFeatureSuggestion;
}

export interface OnboardingChatInput {
  projectRoot: string;
  /** Defaults to `'en'`. */
  language?: string;
  /** Defaults to `basename(projectRoot)`. */
  projectName?: string;
  probes?: OnboardingProbes;
}

function findStep<K extends OnboardingChatStepId>(
  steps: OnboardingStepResult[],
  kind: K,
): Extract<OnboardingStepResult, { kind: K }> {
  const found = steps.find((s): s is Extract<OnboardingStepResult, { kind: K }> => s.kind === kind);
  if (!found) {
    throw new Error(`onboarding-chat-flow: expected step '${kind}' to have already run`);
  }
  return found;
}

/** Runs auto/probe steps and derives questions until either a question is pending or the flow is done. */
async function advanceUntilBlocked(draft: OnboardingChatState, input: OnboardingChatInput): Promise<OnboardingChatState> {
  const probes = input.probes ?? {};

  while (draft.status === 'in_progress' && !draft.pending) {
    const stepId = ONBOARDING_CHAT_STEP_ORDER[draft.stepIndex];

    if (stepId === 'provider_detect') {
      const providers = await detectOnboardingProviders(probes.discovery ?? {});
      draft.steps.push({ kind: 'provider_detect', providers });
      draft.stepIndex += 1;
      continue;
    }

    if (stepId === 'auth_status') {
      const { providers } = findStep(draft.steps, 'provider_detect');
      const withAuth = await probeOnboardingAuthStatus(providers, probes.auth);
      draft.steps.push({ kind: 'auth_status', providers: withAuth });
      draft.stepIndex += 1;
      continue;
    }

    if (stepId === 'mcp_suggestion') {
      if (!draft.steps.some((s) => s.kind === 'mcp_suggestion')) {
        const { providers: withAuth } = findStep(draft.steps, 'auth_status');
        const suggestions = suggestMcpAttachments(withAuth, probes.mcpAttach);
        draft.steps.push({ kind: 'mcp_suggestion', suggestions });
      }
      const { suggestions } = findStep(draft.steps, 'mcp_suggestion');
      if (suggestions.some((s) => s.suggested)) {
        draft.pending = { stepId: 'mcp_suggestion', promptKey: ONBOARDING_CHAT_MCP_QUESTION_KEY };
        break;
      }
      draft.stepIndex += 1;
      continue;
    }

    if (stepId === 'workspace_mode') {
      const questions = buildWorkspaceModeQuestions();

      if (draft.workspaceSubIndex === 0) {
        draft.pending = {
          stepId: 'workspace_mode',
          questionId: 'scope',
          promptKey: questions.scope.promptKey,
          choices: questions.scope.choices,
        };
        break;
      }

      if (draft.workspaceSubIndex === 1) {
        draft.pending = {
          stepId: 'workspace_mode',
          questionId: 'mode',
          promptKey: questions.mode.promptKey,
          choices: questions.mode.choices,
        };
        break;
      }

      const selection = resolveWorkspaceSelection(
        { projectRoot: input.projectRoot, platform: probes.platform ?? process.platform, env: probes.env ?? process.env },
        draft.answers,
        questions,
      );
      draft.steps.push({ kind: 'workspace_mode', questions, selection });
      draft.stepIndex += 1;
      continue;
    }

    if (stepId === 'config_plan') {
      const { providers: withAuth } = findStep(draft.steps, 'auth_status');
      const { suggestions } = findStep(draft.steps, 'mcp_suggestion');
      const { questions, selection: workspace } = findStep(draft.steps, 'workspace_mode');
      const mcpForPlan = draft.mcpAttachDeclined
        ? suggestions.map((s) => ({ ...s, suggested: false }))
        : suggestions;

      const providerSelection = selectOnboardingProviders(withAuth, {});
      const configPlan = planConfigWrite(workspace, providerSelection, mcpForPlan, {
        language: input.language ?? 'en',
        projectName: input.projectName ?? basename(input.projectRoot),
      });
      draft.steps.push({ kind: 'config_plan', plan: configPlan });

      draft.result = {
        steps: draft.steps,
        providers: withAuth,
        mcp: suggestions,
        workspaceQuestions: questions,
        workspace,
        providerSelection,
        configPlan,
      };
      draft.status = 'done';
      continue;
    }
  }

  return draft;
}

/** Applies a resolved intent to the currently-pending question. Returns false (no-op) for an unresolvable `unknown` intent. */
function applyIntent(draft: OnboardingChatState, intent: OnboardingChatIntent): boolean {
  const pending = draft.pending;
  if (!pending) return false;

  if (pending.stepId === 'mcp_suggestion') {
    if (intent.kind === 'yes') {
      draft.mcpAttachDeclined = false;
    } else if (intent.kind === 'no' || intent.kind === 'skip') {
      draft.mcpAttachDeclined = true;
    } else {
      return false;
    }
    draft.pending = undefined;
    draft.stepIndex += 1;
    return true;
  }

  if (pending.questionId === 'scope') {
    if (intent.kind === 'choice') {
      draft.answers.scope = intent.value as WorkspaceScope;
    } else if (intent.kind !== 'skip') {
      return false;
    }
    draft.pending = undefined;
    draft.workspaceSubIndex = 1;
    return true;
  }

  if (pending.questionId === 'mode') {
    if (intent.kind === 'choice') {
      draft.answers.mode = intent.value as PlanMode;
    } else if (intent.kind !== 'skip') {
      return false;
    }
    draft.pending = undefined;
    draft.workspaceSubIndex = 2;
    return true;
  }

  return false;
}

/** Starts a new chat flow — runs the auto-probe steps and stops at the first question (or `config_plan` if nothing needs asking). */
export async function startOnboardingChat(input: OnboardingChatInput): Promise<OnboardingChatState> {
  const draft: OnboardingChatState = {
    stepIndex: 0,
    workspaceSubIndex: 0,
    status: 'in_progress',
    answers: {},
    mcpAttachDeclined: false,
    steps: [],
  };
  return advanceUntilBlocked(draft, input);
}

/** Maps a recognized meta-action to its helpful-feature suggestion key (Deckent-suggestion principle). */
function buildMetaSuggestion(action: OnboardingChatMetaAction): OnboardingFeatureSuggestion {
  switch (action) {
    case 'connect_provider':
      // Reuses the same key `generateOnboardingFeatureSuggestions` emits for a blocked config-plan.
      return { key: 'onboarding.suggestion.connect_provider' };
    case 'show_limits':
      return { key: 'onboarding.chat.suggestion.show_limits' };
    case 'start_sprint':
      return { key: 'onboarding.chat.suggestion.start_sprint' };
    case 'doctor':
      return { key: 'onboarding.chat.suggestion.run_doctor' };
  }
}

/**
 * Interprets `reply` against the state's current `pending` question and
 * advances the flow. Throws if there is no pending question (flow already
 * `done`, or between two auto-advanced steps — callers should only call this
 * when a previous result's `pending` was set). An unresolvable reply (neither
 * the deterministic core nor `fallback` could interpret it) leaves `pending`
 * unchanged — the caller re-prompts. A meta-intent reply (ONB-CHAT-DILIM-2)
 * also leaves `pending` unchanged — interrupt-resume: it is a detour, not an
 * answer, so `lastMetaResponse` carries the bridge suggestion back to the
 * caller while the original question stays there to answer next.
 */
export async function replyToOnboardingChat(
  state: OnboardingChatState,
  reply: string,
  input: OnboardingChatInput,
  fallback?: OnboardingIntentFallback,
): Promise<OnboardingChatState> {
  if (!state.pending) {
    throw new Error('replyToOnboardingChat: no pending question to answer');
  }

  const draft = structuredClone(state);
  const context: OnboardingIntentContext = { choices: draft.pending?.choices };
  let intent = interpretChatAnswer(reply, context);
  if (intent.kind === 'unknown' && fallback) {
    const resolved = await fallback(reply, context);
    if (resolved) intent = resolved;
  }

  if (intent.kind === 'meta') {
    draft.lastUnrecognizedReply = undefined;
    draft.lastMetaResponse = { action: intent.action, suggestion: buildMetaSuggestion(intent.action) };
    return draft;
  }

  if (!applyIntent(draft, intent)) {
    draft.lastUnrecognizedReply = reply;
    draft.lastMetaResponse = undefined;
    return draft;
  }
  draft.lastUnrecognizedReply = undefined;
  draft.lastMetaResponse = undefined;

  return advanceUntilBlocked(draft, input);
}

// ─── Feature Suggestions ─────────────────────────────────────────────────

/** One helpful-feature suggestion — string-free like the wizard's own `descriptionKey` pattern. */
export interface OnboardingFeatureSuggestion {
  key: string;
  params?: Record<string, string>;
}

/**
 * Derives a short list of helpful next-step suggestions from a completed
 * flow's final wizard-shaped result. Pure and rule-based — no probes, no I/O.
 */
export function generateOnboardingFeatureSuggestions(result: OnboardingWizardResult): OnboardingFeatureSuggestion[] {
  const suggestions: OnboardingFeatureSuggestion[] = [];

  if (result.configPlan.blockedReasonKey) {
    suggestions.push({ key: 'onboarding.suggestion.connect_provider' });
  }

  if (result.mcp.some((m) => m.suggested) && result.configPlan.mcpAttachActions.length === 0) {
    suggestions.push({ key: 'onboarding.suggestion.mcp_attach_later' });
  }

  if (result.workspace.scope === 'project') {
    suggestions.push({ key: 'onboarding.suggestion.try_global_scope' });
  }

  if (result.workspace.mode === 'balanced') {
    suggestions.push({ key: 'onboarding.suggestion.explore_modes' });
  }

  if (result.providerSelection.brain_provider && !result.providerSelection.fallback_provider) {
    suggestions.push({
      key: 'onboarding.suggestion.add_fallback_provider',
      params: { provider: result.providerSelection.brain_provider },
    });
  }

  return suggestions;
}
