// ═══ /do slash ↔ shared RunFlow chain — integration wire (452-002) ═════════
//
// REPL-DO-SLASH-WIRE goCriteria file. Proves the `/do <goal>` slash drives the
// SAME RunFlow chain the native `deckent_propose_run` tool uses — via run.tsx's
// `wireRunFlowMount` (the /run precedent: one session controller) composed with
// app.tsx's `runReplDoSlash` — for BOTH flag states, without mounting Ink
// (ink-testing-library is not a project dependency; the pure-helper extraction
// is the blessed pattern — see app-surface-wire.test.tsx).
//
//   flag-ON : wireRunFlowMount(true) → controller;  /do → proposeRun(goal) →
//             setPreview(deriveRunFlowPreview(ctx)) — the exact join seam.
//   flag-OFF: wireRunFlowMount(false) → undefined, the controller factory is
//             NEVER invoked (it is what would touch readContext/planSprint), so
//             the flag-off path has ZERO fs/planner side effects; /do prints the
//             real getMessage-backed notice.

import { describe, it, expect, vi } from 'vitest';
import { wireRunFlowMount, buildDoSlashLabels } from '../../src/cli/repl/run.js';
import { runReplDoSlash, deriveRunFlowPreview, type ReplDoSlashDeps } from '../../src/cli/repl/app.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import type { RunFlowController, RunFlowControllerDeps } from '../../src/cli/repl/run-flow-controller.js';
import type { RunFlowContext, PlanPreview } from '../../src/core/run-flow-contract.js';
import type { ResolvedConfig } from '../../src/core/types.js';

const PREVIEW: PlanPreview = {
  flowId: 'flow-wire-1', revision: 1, planDigest: 'digest-wire',
  taskSummaries: [], policyDecision: 'allow', gateResult: 'skipped',
};
const AWAITING: RunFlowContext = { state: 'AWAITING_APPROVAL', preview: PREVIEW };

// wireRunFlowMount only forwards `deps` to the factory; the fake factory below
// ignores it, so a cast-minimal deps object is sufficient (no real controller,
// no fs) — matches run-flow-mount.test.ts's wireRunFlowMount coverage.
const mountDeps: RunFlowControllerDeps = { root: '/mock/root', config: {} as ResolvedConfig };

function fakeController(record: { goal?: string }): RunFlowController {
  return {
    getContext: () => AWAITING,
    proposeRun: vi.fn(async (goal: string) => { record.goal = goal; return AWAITING; }),
    approve: vi.fn(() => AWAITING),
    reject: vi.fn(() => AWAITING),
  };
}

interface Sink {
  emitted: string[];
  previews: (PlanPreview | null)[];
  errors: string[];
}
function makeDeps(controller: RunFlowController | undefined, lang: string, sink: Sink): ReplDoSlashDeps {
  return {
    controller,
    labels: buildDoSlashLabels((k) => getMessage(k, lang)),
    emit: (t) => sink.emitted.push(t),
    setPreview: (p) => sink.previews.push(p),
    reportError: (m) => sink.errors.push(m),
  };
}

describe('/do slash wire — flag ON (terminal.run_flow_v2)', () => {
  it('mount composed → /do drives proposeRun(goal) → shared preview seam', async () => {
    const record: { goal?: string } = {};
    const controller = fakeController(record);
    const factory = vi.fn(() => controller);

    // The /run precedent: one session controller from wireRunFlowMount.
    const mounted = wireRunFlowMount(true, mountDeps, factory);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(mounted).toBe(controller);

    const sink: Sink = { emitted: [], previews: [], errors: [] };
    await runReplDoSlash('add a health endpoint', makeDeps(mounted, 'en', sink));

    // proposeRun received the goal text …
    expect(controller.proposeRun).toHaveBeenCalledWith('add a health endpoint');
    expect(record.goal).toBe('add a health endpoint');
    // … and the preview handed to the card is EXACTLY the shared-seam derivation
    // (same setRunFlowPreview(deriveRunFlowPreview(ctx)) the tool path feeds).
    expect(sink.previews).toEqual([deriveRunFlowPreview(controller.getContext())]);
    expect(sink.previews).toEqual([PREVIEW]);
    expect(sink.emitted).toEqual([]);
    expect(sink.errors).toEqual([]);
  });
});

describe('/do slash wire — flag OFF', () => {
  it('mount returns undefined without building a controller (zero fs/planner)', () => {
    const factory = vi.fn(() => fakeController({}));
    const mounted = wireRunFlowMount(false, mountDeps, factory);
    expect(mounted).toBeUndefined();
    expect(factory).not.toHaveBeenCalled(); // no readContext/planSprint ever runs
  });

  it('/do prints the real getMessage flag-off notice, no fs/preview side effect', async () => {
    const factory = vi.fn(() => fakeController({}));
    const mounted = wireRunFlowMount(false, mountDeps, factory);

    const sink: Sink = { emitted: [], previews: [], errors: [] };
    await runReplDoSlash('add a health endpoint', makeDeps(mounted, 'en', sink));

    expect(sink.emitted).toEqual([getMessage('do.slash_flag_off', 'en')]);
    expect(sink.previews).toEqual([]);
    expect(sink.errors).toEqual([]);
    expect(factory).not.toHaveBeenCalled();
  });

  it('localizes the flag-off notice (tr)', async () => {
    const sink: Sink = { emitted: [], previews: [], errors: [] };
    await runReplDoSlash('bir şey yap', makeDeps(undefined, 'tr', sink));
    expect(sink.emitted).toEqual([getMessage('do.slash_flag_off', 'tr')]);
  });
});
