// ═══ Task 362-011 — WIZARD-INK — render-seam tests ═══════════════════════════
//
// Ink surface (src/cli/repl/onboarding-ui.tsx) over the 361-009 onboarding
// step machine (cli/helpers/onboarding-wizard.ts).
//
// Why no Ink mount despite the `.tsx` extension: ink-testing-library is NOT a
// project dependency (confirmed sprints 285 / 354 / 359 — see
// tests/cli/repl/f11-016-stab.test.tsx and app-surface-wire.test.tsx), so —
// following that suite's established "render-test" convention — this file
// exercises the pure, exported seams the components are thin shells over:
// createOnboardingUiFlow (flow controller), buildOnboardingPlan (machine-reuse
// plan derivation), mapOnboardingKey, resolveOnboardingColors, and the
// build*Rows view-model builders. Every screen the components would render is
// asserted through `flow.screen()`/`flow.progress()`.
//
// Machine-reuse proof: the fixtures are built by driving the REAL
// `runOnboardingWizard` (361-009) with injected probes — no fs, no network,
// no process spawn (hermetic by construction) — and the default-answer walk
// asserts the flow's re-derived plan deep-equals the machine's own
// `wizard.configPlan`. The workspace question cards are asserted to be the
// machine's `wizard.workspaceQuestions` objects VERBATIM (same reference).
//
// NOT covered by a seam (documented, not silently dropped — same convention
// as history-ink-wire.test.tsx): the real useInput dispatch inside
// <OnboardingWizardView> and Ink's frame reconciliation — those need a real
// PTY smoke, and the entry-wire follow-up owns that surface.

import { describe, it, expect, vi } from 'vitest';
import {
  APPLY_CONFIRM_QUESTION,
  ONBOARDING_UI_STEPS,
  buildAuthStatusRows,
  buildMcpAttachQuestion,
  buildMcpInfoRows,
  buildOnboardingPlan,
  buildProviderDetectRows,
  buildSummaryRows,
  createOnboardingUiFlow,
  mapOnboardingKey,
  onboardingStepTitleKey,
  resolveOnboardingColors,
  type OnboardingScreen,
  type OnboardingUiContext,
  type OnboardingUiFlow,
} from '../../../src/cli/repl/onboarding-ui.js';
import {
  ALL_PLAN_MODES,
  runOnboardingWizard,
  type OnboardingAuthProbe,
  type OnboardingMcpAttachProbe,
  type OnboardingWizardResult,
} from '../../../src/cli/helpers/onboarding-wizard.js';

// ─── Fixtures — the REAL 361-009 machine driven by injected probes ───────────

const CONTEXT: OnboardingUiContext = {
  projectRoot: '/proj/demo',
  platform: 'linux',
  env: { HOME: '/home/u' },
  language: 'en',
  projectName: 'demo',
};

const defaultAuthProbe: OnboardingAuthProbe = async (name) => {
  if (name === 'claude') {
    return { state: 'logged-in', present: true, authenticated: true, method: 'subscription' };
  }
  if (name === 'codex') {
    return { state: 'logged-out', present: true, authenticated: false, method: 'none' };
  }
  return { state: 'unknown' };
};

const defaultMcpProbe: OnboardingMcpAttachProbe = (host) =>
  host === 'claude'
    ? { host, supported: true, attached: false, toolCount: 12 }
    : { host, supported: false, attached: false, toolCount: 0, reason: 'no mcp subcommand' };

/** claude installed+logged-in+attachable, codex installed+logged-out, gemini absent. */
async function makeWizard(
  overrides: { auth?: OnboardingAuthProbe; mcpAttach?: OnboardingMcpAttachProbe } = {},
): Promise<OnboardingWizardResult> {
  return runOnboardingWizard({
    projectRoot: CONTEXT.projectRoot,
    probes: {
      discovery: {
        version: (name) =>
          name === 'claude' ? 'claude 2.1.0' : name === 'codex' ? 'codex-cli 1.0.0' : undefined,
      },
      auth: overrides.auth ?? defaultAuthProbe,
      mcpAttach: overrides.mcpAttach ?? defaultMcpProbe,
      platform: CONTEXT.platform,
      env: CONTEXT.env,
    },
  });
}

function screenAs<K extends OnboardingScreen['kind']>(
  flow: OnboardingUiFlow,
  kind: K,
): Extract<OnboardingScreen, { kind: K }> {
  const screen = flow.screen();
  expect(screen.kind).toBe(kind);
  return screen as Extract<OnboardingScreen, { kind: K }>;
}

// ─── 5-step flow walk: seçim → ilerleme → özet ───────────────────────────────

describe('createOnboardingUiFlow — full 5-step walk (select → progress → summary)', () => {
  it('walks provider_detect → auth_status → mcp → scope → mode → summary with honest progress', async () => {
    const wizard = await makeWizard();
    const flow = createOnboardingUiFlow(wizard, CONTEXT);

    // Step 1/5 — provider detect (info)
    expect(flow.progress()).toMatchObject({ index: 1, total: 5, stepId: 'provider_detect' });
    const detect = screenAs(flow, 'info');
    expect(detect.titleKey).toBe(onboardingStepTitleKey('provider_detect'));
    expect(detect.rows).toEqual([
      {
        labelKey: 'onboarding.ui.provider.present',
        labelParams: { provider: 'claude', version: '2.1.0' },
        tone: 'ok',
      },
      {
        labelKey: 'onboarding.ui.provider.present',
        labelParams: { provider: 'codex', version: '1.0.0' },
        tone: 'ok',
      },
      { labelKey: 'onboarding.ui.provider.missing', labelParams: { provider: 'gemini' }, tone: 'dim' },
    ]);

    // Step 2/5 — auth status (info): logged-in=ok, logged-out=warn, unknown=dim
    flow.dispatch('select');
    expect(flow.progress()).toMatchObject({ index: 2, stepId: 'auth_status' });
    const auth = screenAs(flow, 'info');
    expect(auth.rows.map((r) => [r.labelKey, r.tone])).toEqual([
      ['onboarding.ui.auth.logged-in', 'ok'],
      ['onboarding.ui.auth.logged-out', 'warn'],
      ['onboarding.ui.auth.unknown', 'dim'],
    ]);

    // Step 3/5 — mcp suggestion (question: claude is attachable)
    flow.dispatch('select');
    expect(flow.progress()).toMatchObject({ index: 3, stepId: 'mcp_suggestion' });
    const mcp = screenAs(flow, 'question');
    expect(mcp.question.id).toBe('mcp_attach');
    expect(mcp.cursor).toBe(0); // defaultValue 'accept' is choice 0
    flow.dispatch('select'); // accept

    // Step 4/5 — workspace scope THEN plan mode (both step 4), machine questions VERBATIM
    expect(flow.progress()).toMatchObject({ index: 4, stepId: 'workspace_mode' });
    const scope = screenAs(flow, 'question');
    expect(scope.question).toBe(wizard.workspaceQuestions.scope); // same reference = reuse
    expect(scope.cursor).toBe(0); // defaultValue 'project'
    flow.dispatch('select');

    expect(flow.progress()).toMatchObject({ index: 4, stepId: 'workspace_mode' });
    const mode = screenAs(flow, 'question');
    expect(mode.question).toBe(wizard.workspaceQuestions.mode);
    expect(mode.cursor).toBe(ALL_PLAN_MODES.indexOf('balanced')); // cursor starts on the default
    flow.dispatch('select');

    // Step 5/5 — summary: default answers ⇒ plan deep-equals the machine's own run
    expect(flow.progress()).toMatchObject({ index: 5, stepId: 'summary' });
    const summary = screenAs(flow, 'summary');
    expect(summary.plan).toEqual(wizard.configPlan);
    expect(summary.confirm).toBe(APPLY_CONFIRM_QUESTION);
    expect(summary.rows.map((r) => r.labelKey)).toContain('onboarding.ui.summary.config_path');

    // Apply-confirm → done
    const answers = flow.answers();
    expect(answers).toEqual({ mcpAttach: 'accept', scope: 'project', mode: 'balanced' });
    flow.dispatch('select');
    expect(flow.status()).toBe('applied');
    const done = screenAs(flow, 'done');
    expect(done.messageKey).toBe('onboarding.ui.done.applied');
    expect(done.plan).toEqual(wizard.configPlan);
  });

  it('selection changes the plan: global scope + economic mode re-derive via the machine', async () => {
    const wizard = await makeWizard();
    const onApply = vi.fn();
    const flow = createOnboardingUiFlow(wizard, CONTEXT, { onApply });

    flow.dispatch('select'); // provider_detect →
    flow.dispatch('select'); // auth_status →
    flow.dispatch('select'); // mcp accept →

    flow.dispatch('down'); // scope: project → global
    flow.dispatch('select');
    flow.dispatch('down'); // mode: balanced → economic
    flow.dispatch('select');

    const summary = screenAs(flow, 'summary');
    expect(summary.plan.fields.mode).toBe('economic');
    // linux + HOME ⇒ XDG fallback under /home/u — a DIFFERENT root than the project plan
    expect(summary.plan.configPath).not.toBe(wizard.configPlan.configPath);
    expect(summary.plan.configPath.startsWith('/home/u/')).toBe(true);
    expect(summary.rows.map((r) => r.labelKey)).not.toContain('onboarding.ui.summary.global_scope_error');

    flow.dispatch('select'); // apply
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(summary.plan);
  });

  it('skip (s) answers every question with its own defaultValue', async () => {
    const wizard = await makeWizard();
    const flow = createOnboardingUiFlow(wizard, CONTEXT);

    flow.dispatch('select'); // info
    flow.dispatch('select'); // info
    flow.dispatch('skip'); // mcp → default 'accept'
    flow.dispatch('skip'); // scope → default 'project'
    flow.dispatch('skip'); // mode → default 'balanced'

    expect(flow.answers()).toEqual({ mcpAttach: 'accept', scope: 'project', mode: 'balanced' });
    expect(screenAs(flow, 'summary').plan).toEqual(wizard.configPlan);
  });

  it('declining the mcp suggestion empties the plan attach actions', async () => {
    const wizard = await makeWizard();
    expect(wizard.configPlan.mcpAttachActions).toHaveLength(1); // claude suggested by the machine
    const flow = createOnboardingUiFlow(wizard, CONTEXT);

    flow.dispatch('select');
    flow.dispatch('select');
    flow.dispatch('down'); // accept → skip
    flow.dispatch('select');
    flow.dispatch('skip'); // scope default
    flow.dispatch('skip'); // mode default

    const summary = screenAs(flow, 'summary');
    expect(summary.plan.mcpAttachActions).toEqual([]);
    expect(summary.rows.map((r) => r.labelKey)).toContain('onboarding.ui.summary.mcp_none');
  });
});

// ─── Cancel / guard semantics ────────────────────────────────────────────────

describe('createOnboardingUiFlow — cancel + guard semantics', () => {
  it('Esc cancels from any active step and fires onCancel exactly once', async () => {
    const wizard = await makeWizard();
    const onCancel = vi.fn();
    const flow = createOnboardingUiFlow(wizard, CONTEXT, { onCancel });

    flow.dispatch('select'); // step 2
    flow.dispatch('cancel');
    expect(flow.status()).toBe('cancelled');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screenAs(flow, 'done').messageKey).toBe('onboarding.ui.done.cancelled');
    expect(flow.plan()).toBeNull(); // summary never reached — no plan built

    flow.dispatch('select'); // post-terminal dispatch is inert
    expect(flow.status()).toBe('cancelled');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('the summary cancel choice cancels without applying', async () => {
    const wizard = await makeWizard();
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const flow = createOnboardingUiFlow(wizard, CONTEXT, { onApply, onCancel });

    for (const action of ['select', 'select', 'skip', 'skip', 'skip'] as const) flow.dispatch(action);
    flow.dispatch('down'); // apply → cancel
    flow.dispatch('select');

    expect(flow.status()).toBe('cancelled');
    expect(onApply).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('skip on the apply-confirm is a no-op — a config write never happens implicitly', async () => {
    const wizard = await makeWizard();
    const flow = createOnboardingUiFlow(wizard, CONTEXT);
    for (const action of ['select', 'select', 'skip', 'skip', 'skip'] as const) flow.dispatch(action);
    flow.dispatch('skip');
    expect(flow.status()).toBe('active');
    expect(flow.screen().kind).toBe('summary');
  });

  it('cursor wraps in both directions; up/down on an info card is a no-op', async () => {
    const wizard = await makeWizard();
    const flow = createOnboardingUiFlow(wizard, CONTEXT);

    flow.dispatch('up'); // info card: no-op
    expect(flow.progress()).toMatchObject({ index: 1 });

    for (const action of ['select', 'select', 'skip', 'skip'] as const) flow.dispatch(action);
    const mode = screenAs(flow, 'question'); // plan_mode, 7 choices, cursor at 'balanced' (1)
    expect(mode.cursor).toBe(1);
    flow.dispatch('up');
    expect(screenAs(flow, 'question').cursor).toBe(0);
    flow.dispatch('up'); // wraps to the last choice
    expect(screenAs(flow, 'question').cursor).toBe(ALL_PLAN_MODES.length - 1);
    flow.dispatch('down'); // wraps back to 0
    expect(screenAs(flow, 'question').cursor).toBe(0);
  });
});

// ─── Step-3 info variant + blocked-provider honesty ──────────────────────────

describe('machine-key passthrough (step-3 info variant, blocked provider)', () => {
  it('renders step 3 as an info card with the MACHINE descriptionKeys when nothing is suggested', async () => {
    const wizard = await makeWizard({
      mcpAttach: (host) => ({ host, supported: true, attached: true, toolCount: 12 }),
    });
    expect(buildMcpAttachQuestion(wizard.mcp)).toBeNull();

    const flow = createOnboardingUiFlow(wizard, CONTEXT);
    flow.dispatch('select');
    flow.dispatch('select');
    const info = screenAs(flow, 'info');
    expect(info.stepId).toBe('mcp_suggestion');
    // 361-009's own keys, verbatim — not re-invented here
    expect(info.rows.map((r) => r.labelKey)).toEqual([
      'onboarding.mcp.already_attached',
      'onboarding.mcp.already_attached',
      'onboarding.mcp.host_not_installed',
    ]);
    flow.dispatch('select'); // info variant confirms straight through to step 4
    expect(flow.progress()).toMatchObject({ index: 4, stepId: 'workspace_mode' });
    expect(flow.answers().mcpAttach).toBeUndefined();
  });

  it('surfaces the machine blockedReasonKey as a warn summary row when nobody is logged in', async () => {
    const wizard = await makeWizard({ auth: async () => ({ state: 'logged-out' }) });
    const built = buildOnboardingPlan(wizard, CONTEXT, {});
    const rows = buildSummaryRows(built);
    expect(rows).toContainEqual({ labelKey: 'onboarding.provider.none_authenticated', tone: 'warn' });
    expect(rows.map((r) => r.labelKey)).not.toContain('onboarding.ui.summary.providers');
  });
});

// ─── Pure key mapper ─────────────────────────────────────────────────────────

describe('mapOnboardingKey', () => {
  it('maps arrows/enter/s/esc and treats everything else as a no-op', () => {
    expect(mapOnboardingKey('', { escape: true })).toBe('cancel');
    expect(mapOnboardingKey('', { upArrow: true })).toBe('up');
    expect(mapOnboardingKey('', { downArrow: true })).toBe('down');
    expect(mapOnboardingKey('', { return: true })).toBe('select');
    expect(mapOnboardingKey('s', {})).toBe('skip');
    expect(mapOnboardingKey('S', {})).toBe('skip');
    // unmapped keys must never decide anything
    expect(mapOnboardingKey('y', {})).toBeNull();
    expect(mapOnboardingKey('', {})).toBeNull(); // bare arrow-ish/mouse escape residue
  });

  it('escape wins over simultaneous flags (never a stray select)', () => {
    expect(mapOnboardingKey('', { escape: true, return: true })).toBe('cancel');
  });
});

// ─── NO_COLOR cleanliness ────────────────────────────────────────────────────

describe('NO_COLOR cleanliness', () => {
  // TERMINAL-READABILITY-001: the color set is built from palette ROLES (host
  // theme-mapped); the cursor row is the inverse focus role; nothing is dim.
  it('resolveOnboardingColors(true) carries no color and no attribute', () => {
    expect(resolveOnboardingColors(true)).toEqual({ focus: {}, muted: {} });
  });

  it('resolveOnboardingColors(false) provides the role palette (named colors, inverse focus, no dim)', () => {
    const colors = resolveOnboardingColors(false);
    expect(colors.border).toBe('cyan');
    expect(colors.focus).toEqual({ inverse: true });
    expect(colors.ok).toBe('green');
    expect(colors.warn).toBe('yellow');
    expect(colors.muted).toEqual({});
    expect(JSON.stringify(colors)).not.toMatch(/#[0-9a-fA-F]{6}|dim/);
  });

  it('no screen/view-model ever contains an ANSI escape (string-free + key-only)', async () => {
    const wizard = await makeWizard();
    const flow = createOnboardingUiFlow(wizard, CONTEXT);
    const frames: unknown[] = [flow.screen(), flow.progress()];
    for (const action of ['select', 'select', 'select', 'select', 'select', 'select'] as const) {
      flow.dispatch(action);
      frames.push(flow.screen(), flow.progress());
    }
    expect(JSON.stringify(frames)).not.toContain('\u001b');
  });
});

// ─── Row builders (direct) ───────────────────────────────────────────────────

describe('view-model builders', () => {
  it('buildProviderDetectRows/buildAuthStatusRows/buildMcpInfoRows key every provider', async () => {
    const wizard = await makeWizard();
    expect(buildProviderDetectRows(wizard.providers)).toHaveLength(3);
    expect(buildAuthStatusRows(wizard.providers)).toHaveLength(3);
    const mcpRows = buildMcpInfoRows(wizard.mcp);
    expect(mcpRows).toHaveLength(3);
    expect(mcpRows[0]).toMatchObject({ labelKey: 'onboarding.mcp.attach_suggested', tone: 'ok' });
  });

  it('buildMcpAttachQuestion lists the suggested hosts in the accept choice params', async () => {
    const wizard = await makeWizard();
    const question = buildMcpAttachQuestion(wizard.mcp);
    expect(question).not.toBeNull();
    expect(question!.defaultValue).toBe('accept');
    expect(question!.choices[0]).toMatchObject({
      value: 'accept',
      labelParams: { hosts: 'claude' },
    });
  });

  it('ONBOARDING_UI_STEPS mirrors the machine 5-phase order', () => {
    expect(ONBOARDING_UI_STEPS).toEqual([
      'provider_detect',
      'auth_status',
      'mcp_suggestion',
      'workspace_mode',
      'summary',
    ]);
  });
});
