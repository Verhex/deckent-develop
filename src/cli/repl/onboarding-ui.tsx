// ═══ OnboardingWizardView — Ink surface for the 361-009 onboarding machine ═══
// (WIZARD-INK, Sprint 362 Task 362-011 — Sıra-201 dilim-2)
//
// A MOUNTABLE Ink surface over the pure 5-phase onboarding wizard core
// (cli/helpers/onboarding-wizard.ts, 361-009): question card (options /
// confirm / skip), progress indicator, and summary + apply-confirm screen.
// Entry wiring (entry.ts / app.tsx mount, `init` behavior, actually APPLYING
// the plan) is explicitly OUT of this slice — `onApply` receives the machine's
// `OnboardingConfigWritePlan` (which is `applied: false` by contract) and the
// follow-up owns the real write.
//
// Pattern (same as approval-card.tsx / app.tsx): every decision lives in pure,
// exported, React-free seams — `createOnboardingUiFlow` (flow controller),
// `buildOnboardingPlan` (plan re-derivation), `mapOnboardingKey`,
// `resolveOnboardingColors`, and the `build*Rows` view-model builders —
// because ink-testing-library is NOT a project dependency (confirmed sprints
// 285 / 354 / 359; see tests/cli/repl/f11-016-stab.test.tsx). The Ink
// components below are thin renderers over those seams.
//
// String-free (i18n-first): this module contains ZERO user-facing literal
// text. Every label is a `*Key` the caller resolves via the injected
// {@link OnboardingLabelResolver} (getMessage-backed in the entry-wire
// follow-up); machine-produced keys (promptKey / labelKey / descriptionKey /
// blockedReasonKey) pass through verbatim.
//
// Machine reuse (no reinvention): the workspace/mode question cards render the
// machine's own `wizard.workspaceQuestions` objects VERBATIM, and the summary
// plan is re-derived from the collected answers via the machine's pure step
// functions — `resolveWorkspaceSelection` + `planConfigWrite` — plus the
// initial run's `providerSelection`. No probe ever re-fires after the single
// upfront `runOnboardingWizard` the caller performs.

import { Box, Text, useInput } from 'ink';
import { useRef, useState, type ReactElement } from 'react';
import { resolveInkPalette, type InkPalette, type InkRoleStyle } from './ink-palette.js';
import type {
  OnboardingConfigWritePlan,
  OnboardingMcpSuggestion,
  OnboardingProviderAuthStatus,
  OnboardingProviderSelection,
  OnboardingQuestion,
  OnboardingWizardResult,
  OnboardingWorkspaceSelection,
  WorkspaceScope,
} from '../helpers/onboarding-wizard.js';
import { planConfigWrite, resolveWorkspaceSelection } from '../helpers/onboarding-wizard.js';
import type { GlobalScopeEnv } from '../../core/global-scope-resolver.js';
import type { PlanMode } from '../../core/types.js';
import { isNoColor } from '../helpers/output.js';

// ─── Steps & progress ────────────────────────────────────────────────────────

/** The five UI steps — 1:1 with the machine's five phases (steps[].kind). */
export type OnboardingUiStepId =
  | 'provider_detect'
  | 'auth_status'
  | 'mcp_suggestion'
  | 'workspace_mode'
  | 'summary';

export const ONBOARDING_UI_STEPS: readonly OnboardingUiStepId[] = [
  'provider_detect',
  'auth_status',
  'mcp_suggestion',
  'workspace_mode',
  'summary',
];

/** i18n key for a step's title — resolved by the caller, never literal here. */
export function onboardingStepTitleKey(stepId: OnboardingUiStepId): string {
  return `onboarding.ui.step.${stepId}`;
}

export interface OnboardingProgressView {
  /** 1-based UI step (both workspace questions share step 4). */
  index: number;
  total: number;
  stepId: OnboardingUiStepId;
  titleKey: string;
}

// ─── Label resolution (i18n seam) ────────────────────────────────────────────

/** Caller-injected resolver (getMessage-backed at the entry-wire). Keeps this
 *  module string-free: it only ever emits keys + params through this seam. */
export type OnboardingLabelResolver = (key: string, params?: Record<string, string>) => string;

// ─── Colors (NO_COLOR-clean by construction) ─────────────────────────────────

/** TERMINAL-READABILITY-001 — the wizard's colors are palette ROLES: the frame
 *  takes the decorative accent, the cursor row the focus role (inverse), ok /
 *  warn the supplemental success / warning colors beside their words, and
 *  secondary rows the muted role. No literal, no dim. */
export interface OnboardingColorSet {
  border?: string;
  focus: InkRoleStyle;
  ok?: string;
  warn?: string;
  muted: InkRoleStyle;
}

/** All-off set under NO_COLOR — an `undefined` Ink color prop and an empty
 *  style render plain text, so the whole surface degrades to ANSI-free output.
 *  The caller passes the canonical `isNoColor()` verdict (helpers/output.ts,
 *  R4-ISNOCOLOR SSOT); `palette` is the tier-resolved Ink palette (default:
 *  the host-theme-mapped ansi16 palette). */
export function resolveOnboardingColors(noColor: boolean, palette: InkPalette = resolveInkPalette('ansi16')): OnboardingColorSet {
  if (noColor) return { focus: {}, muted: {} };
  return { border: palette.accent.color, focus: palette.focus, ok: palette.success.color, warn: palette.warning.color, muted: palette.muted };
}

// ─── View models (pure — key + plain string only, never ANSI) ────────────────

/** Semantic tone per row — the component maps it to a palette color. */
export type OnboardingRowTone = 'ok' | 'warn' | 'dim';

export interface OnboardingInfoRow {
  labelKey: string;
  labelParams?: Record<string, string>;
  tone: OnboardingRowTone;
}

/** Step 1 — one row per provider: PATH presence + parsed version. */
export function buildProviderDetectRows(providers: OnboardingProviderAuthStatus[]): OnboardingInfoRow[] {
  return providers.map(({ name, discovery }): OnboardingInfoRow =>
    discovery.present
      ? {
          labelKey: 'onboarding.ui.provider.present',
          labelParams: { provider: name, version: discovery.version ?? '' },
          tone: 'ok',
        }
      : { labelKey: 'onboarding.ui.provider.missing', labelParams: { provider: name }, tone: 'dim' },
  );
}

/** Step 2 — one row per provider: real login state (GAP-4: installed ≠ logged in). */
export function buildAuthStatusRows(providers: OnboardingProviderAuthStatus[]): OnboardingInfoRow[] {
  return providers.map(({ name, auth }): OnboardingInfoRow => ({
    labelKey: `onboarding.ui.auth.${auth.state}`,
    labelParams: { provider: name, method: auth.method ?? 'none' },
    tone: auth.state === 'logged-in' ? 'ok' : auth.state === 'logged-out' ? 'warn' : 'dim',
  }));
}

/** Step 3 (info variant — nothing suggested): the machine's own per-host
 *  `descriptionKey`/`descriptionParams` pass through verbatim. */
export function buildMcpInfoRows(mcp: OnboardingMcpSuggestion[]): OnboardingInfoRow[] {
  return mcp.map((m): OnboardingInfoRow => ({
    labelKey: m.descriptionKey,
    labelParams: m.descriptionParams,
    tone: m.suggested ? 'ok' : 'dim',
  }));
}

// ─── Questions this surface adds on top of the machine's ────────────────────

export type OnboardingMcpAnswer = 'accept' | 'skip';

/**
 * Step 3 (question variant): accept-or-skip the machine's suggested MCP
 * attaches, as one card covering every suggested host. Returns null when the
 * machine suggested nothing — the flow then renders the info variant instead.
 * Reuses the machine's own {@link OnboardingQuestion} shape so the same
 * question-card component renders machine and UI questions identically.
 */
export function buildMcpAttachQuestion(
  mcp: OnboardingMcpSuggestion[],
): OnboardingQuestion<OnboardingMcpAnswer> | null {
  const suggested = mcp.filter((m) => m.suggested);
  if (suggested.length === 0) return null;
  const hosts = suggested.map((m) => m.host).join(', ');
  return {
    id: 'mcp_attach',
    promptKey: 'onboarding.ui.question.mcp_attach',
    choices: [
      { value: 'accept', labelKey: 'onboarding.ui.choice.mcp_attach.accept', labelParams: { hosts } },
      { value: 'skip', labelKey: 'onboarding.ui.choice.mcp_attach.skip' },
    ],
    defaultValue: 'accept',
  };
}

export type OnboardingApplyAnswer = 'apply' | 'cancel';

/** Step 5's apply-confirm — a fixed two-choice question, defaulting to apply. */
export const APPLY_CONFIRM_QUESTION: OnboardingQuestion<OnboardingApplyAnswer> = {
  id: 'apply_confirm',
  promptKey: 'onboarding.ui.question.apply',
  choices: [
    { value: 'apply', labelKey: 'onboarding.ui.choice.apply.apply' },
    { value: 'cancel', labelKey: 'onboarding.ui.choice.apply.cancel' },
  ],
  defaultValue: 'apply',
};

// ─── Plan re-derivation (machine reuse — pure, no probe re-fires) ────────────

/** Caller-resolved runtime facts the flow needs to re-derive the plan. The
 *  component never reads `process.platform`/`process.env` — the entry-wire
 *  resolves them once, exactly like `runOnboardingWizard`'s own outer seam. */
export interface OnboardingUiContext {
  projectRoot: string;
  platform: string;
  env: GlobalScopeEnv;
  language: string;
  projectName: string;
}

/** Answers this surface collects on top of the initial wizard run. */
export interface OnboardingUiAnswers {
  mcpAttach?: OnboardingMcpAnswer;
  scope?: WorkspaceScope;
  mode?: PlanMode;
}

export interface OnboardingPlanBuild {
  workspace: OnboardingWorkspaceSelection;
  providerSelection: OnboardingProviderSelection;
  plan: OnboardingConfigWritePlan;
}

/**
 * Fold the collected answers into a fresh config-write plan using the
 * machine's pure step functions — `resolveWorkspaceSelection` (step 4) +
 * `planConfigWrite` (step 5) over the initial run's questions, MCP
 * suggestions, and provider auto-pick. Skipping the MCP attach suggestion is
 * expressed honestly as `suggested: false` so `planConfigWrite`'s own filter
 * drops the attach actions (no parallel filtering logic here).
 */
export function buildOnboardingPlan(
  wizard: OnboardingWizardResult,
  context: OnboardingUiContext,
  answers: OnboardingUiAnswers,
): OnboardingPlanBuild {
  const workspace = resolveWorkspaceSelection(
    { projectRoot: context.projectRoot, platform: context.platform, env: context.env },
    { scope: answers.scope, mode: answers.mode },
    wizard.workspaceQuestions,
  );
  const mcpForPlan =
    answers.mcpAttach === 'skip' ? wizard.mcp.map((m) => ({ ...m, suggested: false })) : wizard.mcp;
  const plan = planConfigWrite(workspace, wizard.providerSelection, mcpForPlan, {
    language: context.language,
    projectName: context.projectName,
  });
  return { workspace, providerSelection: wizard.providerSelection, plan };
}

/** Step 5's summary rows — plan + workspace facts, warnings kept honest
 *  (machine's `blockedReasonKey` / `globalScopeError` pass through, never hidden). */
export function buildSummaryRows(built: OnboardingPlanBuild): OnboardingInfoRow[] {
  const { workspace, plan } = built;
  const rows: OnboardingInfoRow[] = [
    { labelKey: 'onboarding.ui.summary.config_path', labelParams: { path: plan.configPath }, tone: 'ok' },
    {
      labelKey: 'onboarding.ui.summary.mode',
      labelParams: {
        mode: plan.fields.mode,
        // ModelStrategy is a tier object — compact brain/worker view for the row
        strategy: plan.fields.model_strategy
          ? `${plan.fields.model_strategy.brain_tier}/${plan.fields.model_strategy.worker_tier}`
          : '',
      },
      tone: 'ok',
    },
    {
      labelKey: 'onboarding.ui.summary.scope',
      labelParams: { scope: workspace.scope, root: workspace.root },
      tone: 'ok',
    },
  ];
  if (plan.blockedReasonKey !== undefined) {
    rows.push({ labelKey: plan.blockedReasonKey, tone: 'warn' });
  } else {
    rows.push({
      labelKey: 'onboarding.ui.summary.providers',
      labelParams: {
        brain: plan.fields.brain_provider ?? '',
        worker: plan.fields.worker_provider ?? '',
        fallback: plan.fields.fallback_provider ?? '',
      },
      tone: 'ok',
    });
  }
  if (plan.mcpAttachActions.length > 0) {
    rows.push({
      labelKey: 'onboarding.ui.summary.mcp_actions',
      labelParams: {
        count: String(plan.mcpAttachActions.length),
        hosts: plan.mcpAttachActions.map((a) => a.host).join(', '),
      },
      tone: 'ok',
    });
  } else {
    rows.push({ labelKey: 'onboarding.ui.summary.mcp_none', tone: 'dim' });
  }
  if (workspace.globalScopeError !== undefined) {
    rows.push({
      labelKey: 'onboarding.ui.summary.global_scope_error',
      labelParams: { error: workspace.globalScopeError },
      tone: 'warn',
    });
  }
  return rows;
}

// ─── Key mapping (pure — unit-testable without Ink) ──────────────────────────

export type OnboardingUiAction = 'up' | 'down' | 'select' | 'skip' | 'cancel';

/** Structural subset of Ink's `Key` — only the flags this surface consumes. */
export interface OnboardingKeyFlags {
  upArrow?: boolean;
  downArrow?: boolean;
  return?: boolean;
  escape?: boolean;
}

/** ↑/↓ move the cursor, Enter selects, `s` skips (take the default), Esc
 *  cancels. Any other key is a no-op (null) — never an implicit decision. */
export function mapOnboardingKey(input: string, key: OnboardingKeyFlags): OnboardingUiAction | null {
  if (key.escape === true) return 'cancel';
  if (key.upArrow === true) return 'up';
  if (key.downArrow === true) return 'down';
  if (key.return === true) return 'select';
  if (input.toLowerCase() === 's') return 'skip';
  return null;
}

// ─── Flow controller (pure, React-free — the render seam tests exercise) ─────

export type OnboardingUiStatus = 'active' | 'applied' | 'cancelled';

type OnboardingUiQuestionKind = 'mcp_attach' | 'workspace_scope' | 'plan_mode';

type OnboardingUiCard =
  | { kind: 'info'; stepId: OnboardingUiStepId; rows: OnboardingInfoRow[] }
  | {
      kind: 'question';
      stepId: OnboardingUiStepId;
      questionKind: OnboardingUiQuestionKind;
      question: OnboardingQuestion;
    }
  | { kind: 'summary'; stepId: 'summary' };

/** What to render now — the discriminated view model the components consume. */
export type OnboardingScreen =
  | { kind: 'info'; stepId: OnboardingUiStepId; titleKey: string; rows: OnboardingInfoRow[] }
  | {
      kind: 'question';
      stepId: OnboardingUiStepId;
      titleKey: string;
      question: OnboardingQuestion;
      cursor: number;
    }
  | {
      kind: 'summary';
      stepId: 'summary';
      titleKey: string;
      rows: OnboardingInfoRow[];
      confirm: OnboardingQuestion<OnboardingApplyAnswer>;
      cursor: number;
      plan: OnboardingConfigWritePlan;
    }
  | { kind: 'done'; status: 'applied' | 'cancelled'; messageKey: string; plan: OnboardingConfigWritePlan | null };

export interface OnboardingUiHooks {
  /** Fired once on apply-confirm. The plan is still `applied: false` — the
   *  entry-wire follow-up owns the real config write + attach commands. */
  onApply?: (plan: OnboardingConfigWritePlan) => void;
  onCancel?: () => void;
  /** Drives the owning component's re-render (React setState). */
  onChange?: () => void;
}

export interface OnboardingUiFlow {
  screen(): OnboardingScreen;
  progress(): OnboardingProgressView;
  status(): OnboardingUiStatus;
  answers(): Readonly<OnboardingUiAnswers>;
  /** The re-derived plan — null until the summary step has been reached. */
  plan(): OnboardingConfigWritePlan | null;
  dispatch(action: OnboardingUiAction): void;
}

/** Card sequence for one wizard result. Both workspace questions share step 4;
 *  step 3 is a question only when the machine actually suggested an attach. */
function buildOnboardingCards(wizard: OnboardingWizardResult): OnboardingUiCard[] {
  const mcpQuestion = buildMcpAttachQuestion(wizard.mcp);
  return [
    { kind: 'info', stepId: 'provider_detect', rows: buildProviderDetectRows(wizard.providers) },
    { kind: 'info', stepId: 'auth_status', rows: buildAuthStatusRows(wizard.providers) },
    mcpQuestion !== null
      ? { kind: 'question', stepId: 'mcp_suggestion', questionKind: 'mcp_attach', question: mcpQuestion }
      : { kind: 'info', stepId: 'mcp_suggestion', rows: buildMcpInfoRows(wizard.mcp) },
    {
      kind: 'question',
      stepId: 'workspace_mode',
      questionKind: 'workspace_scope',
      question: wizard.workspaceQuestions.scope,
    },
    {
      kind: 'question',
      stepId: 'workspace_mode',
      questionKind: 'plan_mode',
      question: wizard.workspaceQuestions.mode,
    },
    { kind: 'summary', stepId: 'summary' },
  ];
}

/**
 * The interactive 5-step flow over one `runOnboardingWizard` result: info
 * cards confirm through, question cards select (Enter) or skip (`s` → the
 * question's own defaultValue), the summary card resolves apply/cancel. Esc
 * cancels from anywhere while active. Pure and synchronous — the Ink
 * component is a thin shell around `dispatch`.
 */
export function createOnboardingUiFlow(
  wizard: OnboardingWizardResult,
  context: OnboardingUiContext,
  hooks: OnboardingUiHooks = {},
): OnboardingUiFlow {
  const cards = buildOnboardingCards(wizard);
  const answers: OnboardingUiAnswers = {};
  let cardIndex = 0;
  let status: OnboardingUiStatus = 'active';
  let built: OnboardingPlanBuild | null = null;

  const initialCursor = (card: OnboardingUiCard): number => {
    const question = card.kind === 'question' ? card.question : card.kind === 'summary' ? APPLY_CONFIRM_QUESTION : null;
    if (question === null) return 0;
    const idx = question.choices.findIndex((c) => c.value === question.defaultValue);
    return idx === -1 ? 0 : idx;
  };

  let cursor = initialCursor(cards[0]!); // cards is never empty by construction

  const currentCard = (): OnboardingUiCard => cards[cardIndex]!; // index bounded by advance()

  const ensureBuilt = (): OnboardingPlanBuild => {
    built ??= buildOnboardingPlan(wizard, context, answers);
    return built;
  };

  const advance = (): void => {
    cardIndex += 1; // never past the summary card: its own dispatch never calls advance()
    const card = currentCard();
    if (card.kind === 'summary') ensureBuilt();
    cursor = initialCursor(card);
  };

  const recordAnswer = (questionKind: OnboardingUiQuestionKind, value: string): void => {
    // Single narrowing seam: each card's choices come from a correctly-typed
    // OnboardingQuestion<V>, so `value` is a member of the target union.
    if (questionKind === 'mcp_attach') answers.mcpAttach = value as OnboardingMcpAnswer;
    else if (questionKind === 'workspace_scope') answers.scope = value as WorkspaceScope;
    else answers.mode = value as PlanMode;
  };

  const dispatch = (action: OnboardingUiAction): void => {
    if (status !== 'active') return;
    if (action === 'cancel') {
      status = 'cancelled';
      hooks.onCancel?.();
      hooks.onChange?.();
      return;
    }
    const card = currentCard();
    if (card.kind === 'info') {
      if (action === 'select' || action === 'skip') advance();
    } else {
      const question = card.kind === 'question' ? card.question : APPLY_CONFIRM_QUESTION;
      if (action === 'up' || action === 'down') {
        const len = question.choices.length;
        cursor = (cursor + (action === 'down' ? 1 : -1) + len) % len;
      } else if (card.kind === 'question') {
        // action is 'select' | 'skip' — skip takes the question's own default
        const value = action === 'skip' ? question.defaultValue : question.choices[cursor]!.value;
        recordAnswer(card.questionKind, value);
        advance();
      } else if (action === 'select') {
        // Summary apply-confirm. 'skip' is deliberately a no-op here — a config
        // write must never happen implicitly.
        const choice = APPLY_CONFIRM_QUESTION.choices[cursor]!.value;
        if (choice === 'apply') {
          status = 'applied';
          hooks.onApply?.(ensureBuilt().plan);
        } else {
          status = 'cancelled';
          hooks.onCancel?.();
        }
      }
    }
    hooks.onChange?.();
  };

  const screen = (): OnboardingScreen => {
    if (status !== 'active') {
      return { kind: 'done', status, messageKey: `onboarding.ui.done.${status}`, plan: built?.plan ?? null };
    }
    const card = currentCard();
    const titleKey = onboardingStepTitleKey(card.stepId);
    if (card.kind === 'info') return { kind: 'info', stepId: card.stepId, titleKey, rows: card.rows };
    if (card.kind === 'question') {
      return { kind: 'question', stepId: card.stepId, titleKey, question: card.question, cursor };
    }
    const b = ensureBuilt();
    return {
      kind: 'summary',
      stepId: 'summary',
      titleKey,
      rows: buildSummaryRows(b),
      confirm: APPLY_CONFIRM_QUESTION,
      cursor,
      plan: b.plan,
    };
  };

  const progress = (): OnboardingProgressView => {
    const stepId = status === 'active' ? currentCard().stepId : 'summary';
    return {
      index: ONBOARDING_UI_STEPS.indexOf(stepId) + 1,
      total: ONBOARDING_UI_STEPS.length,
      stepId,
      titleKey: onboardingStepTitleKey(stepId),
    };
  };

  return {
    screen,
    progress,
    status: () => status,
    answers: () => ({ ...answers }),
    plan: () => built?.plan ?? null,
    dispatch,
  };
}

// ─── Ink components (thin renderers — all decisions live in the seams above) ─

/** Cursor glyph, not a label — the same inquirer-style marker across terminals. */
const CURSOR_MARKER = '❯';

function toneStyle(tone: OnboardingRowTone, colors: OnboardingColorSet): InkRoleStyle {
  if (tone === 'ok') return colors.ok === undefined ? {} : { color: colors.ok };
  if (tone === 'warn') return colors.warn === undefined ? {} : { color: colors.warn };
  if (tone === 'dim') return colors.muted;
  return {};
}

interface InfoRowsProps {
  rows: OnboardingInfoRow[];
  resolveLabel: OnboardingLabelResolver;
  colors: OnboardingColorSet;
}

function InfoRows({ rows, resolveLabel, colors }: InfoRowsProps): ReactElement {
  return (
    <Box flexDirection="column">
      {rows.map((row, i) => (
        <Text key={i} {...toneStyle(row.tone, colors)}>
          {resolveLabel(row.labelKey, row.labelParams)}
        </Text>
      ))}
    </Box>
  );
}

export interface OnboardingProgressProps {
  progress: OnboardingProgressView;
  resolveLabel: OnboardingLabelResolver;
  colors: OnboardingColorSet;
}

/** Progress indicator — "step {index}/{total}" chip + the step's title. */
export function OnboardingProgress({ progress, resolveLabel }: OnboardingProgressProps): ReactElement {
  return (
    <Box>
      <Text bold>
        {resolveLabel('onboarding.ui.progress', {
          index: String(progress.index),
          total: String(progress.total),
        })}
      </Text>
      <Text>{' '}</Text>
      <Text bold>{resolveLabel(progress.titleKey)}</Text>
    </Box>
  );
}

export interface OnboardingQuestionCardProps {
  question: OnboardingQuestion;
  cursor: number;
  resolveLabel: OnboardingLabelResolver;
  colors: OnboardingColorSet;
  /** Hint line under the choices — defaults to the question hint key. */
  hintKey?: string;
}

/** Question card — prompt, cursor-navigable choices, and a key-hint line. */
export function OnboardingQuestionCard({
  question,
  cursor,
  resolveLabel,
  colors,
  hintKey = 'onboarding.ui.hint.question',
}: OnboardingQuestionCardProps): ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>{resolveLabel(question.promptKey)}</Text>
      {question.choices.map((choice, i) => (
        <Text key={choice.value} {...(i === cursor ? colors.focus : {})} bold={i === cursor}>
          {`${i === cursor ? CURSOR_MARKER : ' '} ${resolveLabel(choice.labelKey, choice.labelParams)}`}
        </Text>
      ))}
      <Text {...colors.muted}>{resolveLabel(hintKey)}</Text>
    </Box>
  );
}

export interface OnboardingSummaryCardProps {
  rows: OnboardingInfoRow[];
  confirm: OnboardingQuestion<OnboardingApplyAnswer>;
  cursor: number;
  resolveLabel: OnboardingLabelResolver;
  colors: OnboardingColorSet;
}

/** Summary + apply-confirm — the plan facts above the reused question card. */
export function OnboardingSummaryCard({
  rows,
  confirm,
  cursor,
  resolveLabel,
  colors,
}: OnboardingSummaryCardProps): ReactElement {
  return (
    <Box flexDirection="column">
      <InfoRows rows={rows} resolveLabel={resolveLabel} colors={colors} />
      <Box marginTop={1}>
        <OnboardingQuestionCard question={confirm} cursor={cursor} resolveLabel={resolveLabel} colors={colors} />
      </Box>
    </Box>
  );
}

export interface OnboardingWizardViewProps {
  /** The single upfront machine run (`runOnboardingWizard`) — probes already fired. */
  wizard: OnboardingWizardResult;
  context: OnboardingUiContext;
  resolveLabel: OnboardingLabelResolver;
  onApply?: (plan: OnboardingConfigWritePlan) => void;
  onCancel?: () => void;
  /** Defaults to the canonical `isNoColor()` (helpers/output.ts, R4-ISNOCOLOR SSOT). */
  noColor?: boolean;
}

/**
 * The mountable onboarding surface: progress indicator + the current card
 * (info / question / summary), driven by the pure flow controller. Key
 * handling deactivates itself (`isActive`) once the flow leaves 'active', so
 * a surrounding App regains input focus after apply/cancel.
 */
export function OnboardingWizardView(props: OnboardingWizardViewProps): ReactElement {
  const { wizard, context, resolveLabel, onApply, onCancel } = props;
  const [, setTick] = useState(0);
  const flowRef = useRef<OnboardingUiFlow | null>(null);
  if (!flowRef.current) {
    flowRef.current = createOnboardingUiFlow(wizard, context, {
      onApply,
      onCancel,
      onChange: () => setTick((t) => t + 1),
    });
  }
  const flow = flowRef.current;
  const colors = resolveOnboardingColors(props.noColor ?? isNoColor());

  useInput(
    (input, key) => {
      const action = mapOnboardingKey(input, key);
      if (action !== null) flow.dispatch(action);
    },
    { isActive: flow.status() === 'active' },
  );

  const screen = flow.screen();

  if (screen.kind === 'done') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={colors.border} paddingX={1}>
        <Text color={screen.status === 'applied' ? colors.ok : colors.warn}>
          {resolveLabel(screen.messageKey)}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.border} paddingX={1}>
      <OnboardingProgress progress={flow.progress()} resolveLabel={resolveLabel} colors={colors} />
      {screen.kind === 'info' && (
        <Box flexDirection="column" marginTop={1}>
          <InfoRows rows={screen.rows} resolveLabel={resolveLabel} colors={colors} />
          <Text {...colors.muted}>{resolveLabel('onboarding.ui.hint.info')}</Text>
        </Box>
      )}
      {screen.kind === 'question' && (
        <Box marginTop={1}>
          <OnboardingQuestionCard
            question={screen.question}
            cursor={screen.cursor}
            resolveLabel={resolveLabel}
            colors={colors}
          />
        </Box>
      )}
      {screen.kind === 'summary' && (
        <Box marginTop={1}>
          <OnboardingSummaryCard
            rows={screen.rows}
            confirm={screen.confirm}
            cursor={screen.cursor}
            resolveLabel={resolveLabel}
            colors={colors}
          />
        </Box>
      )}
    </Box>
  );
}
