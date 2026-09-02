// ═══ app.tsx — runReplDoSlash (`/do <goal>`) unit tests (452-002) ═══════════
//
// REPL-DO-SLASH-WIRE. ink-testing-library is NOT a project dependency, so the
// `/do` handler is extracted from handleSubmit as the pure, DI-testable
// `runReplDoSlash` (same "pull pure logic out of the component" precedent
// app-surface-wire.test.tsx documents). These tests exercise the three edges
// WITHOUT mounting Ink:
//   - flag-off (no controller)  → honest notice, ZERO fs/planner side effects
//   - empty/whitespace goal     → usage hint, proposeRun never called
//   - flag-on happy path        → proposeRun(trimmed goal) → setPreview(derived)
//   - controller error          → reportError, never re-thrown

import { describe, it, expect, vi } from 'vitest';
import {
  runReplDoSlash,
  deriveRunFlowPreview,
  type ReplDoSlashDeps,
} from '../../../src/cli/repl/app.js';
import type { RunFlowController } from '../../../src/cli/repl/run-flow-controller.js';
import type { RunFlowContext, PlanPreview } from '../../../src/core/run-flow-contract.js';
import { buildDoSlashLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

/** en `/do` labels — app.tsx owns no default object since TERMINAL-TOOLS-002. */
const EN_DO_SLASH_LABELS = buildDoSlashLabels((k) => getMessage(k, 'en'));

const PREVIEW: PlanPreview = {
  flowId: 'flow-do-1', revision: 1, planDigest: 'digest-abc',
  taskSummaries: [], policyDecision: 'allow', gateResult: 'skipped',
};
const AWAITING: RunFlowContext = { state: 'AWAITING_APPROVAL', preview: PREVIEW };

interface Harness {
  deps: ReplDoSlashDeps;
  emitted: string[];
  previews: (PlanPreview | null)[];
  errors: string[];
}

function makeHarness(overrides: Partial<ReplDoSlashDeps> = {}): Harness {
  const emitted: string[] = [];
  const previews: (PlanPreview | null)[] = [];
  const errors: string[] = [];
  const deps: ReplDoSlashDeps = {
    controller: undefined,
    labels: EN_DO_SLASH_LABELS,
    emit: (t) => emitted.push(t),
    setPreview: (p) => previews.push(p),
    reportError: (m) => errors.push(m),
    ...overrides,
  };
  return { deps, emitted, previews, errors };
}

/** Fake controller — the 4 required RunFlowController methods (mirrors
 *  run-flow-mount.test.ts's fakeController). proposeRun returns a real-shaped
 *  AWAITING_APPROVAL context so deriveRunFlowPreview(ctx) is non-null. */
function fakeController(proposeRun: RunFlowController['proposeRun']): RunFlowController {
  return {
    getContext: () => AWAITING,
    proposeRun,
    approve: vi.fn(() => AWAITING),
    reject: vi.fn(() => AWAITING),
  };
}

describe('runReplDoSlash — flag-off (no controller)', () => {
  it('emits the honest flag-off notice and touches nothing else', async () => {
    const h = makeHarness({ controller: undefined });
    await runReplDoSlash('add a health endpoint', h.deps);

    expect(h.emitted).toEqual([EN_DO_SLASH_LABELS.flagOff]);
    expect(h.previews).toEqual([]); // no plan-preview ⇒ no card, no proposeRun
    expect(h.errors).toEqual([]);
  });
});

describe('runReplDoSlash — empty/whitespace goal (flag-on)', () => {
  it('bare goal → usage hint, proposeRun NEVER called (avoids controller throw)', async () => {
    const proposeRun = vi.fn(async () => AWAITING);
    const h = makeHarness({ controller: fakeController(proposeRun) });

    await runReplDoSlash('', h.deps);

    expect(h.emitted).toEqual([EN_DO_SLASH_LABELS.usage]);
    expect(proposeRun).not.toHaveBeenCalled();
    expect(h.previews).toEqual([]);
  });

  it('whitespace-only goal → usage hint', async () => {
    const proposeRun = vi.fn(async () => AWAITING);
    const h = makeHarness({ controller: fakeController(proposeRun) });

    await runReplDoSlash('   \t  ', h.deps);

    expect(h.emitted).toEqual([EN_DO_SLASH_LABELS.usage]);
    expect(proposeRun).not.toHaveBeenCalled();
  });
});

describe('runReplDoSlash — flag-on happy path (shared RunFlow chain)', () => {
  it('proposeRun gets the trimmed goal and setPreview gets deriveRunFlowPreview(ctx)', async () => {
    const proposeRun = vi.fn(async () => AWAITING);
    const controller = fakeController(proposeRun);
    const h = makeHarness({ controller });

    await runReplDoSlash('  add a health endpoint  ', h.deps);

    expect(proposeRun).toHaveBeenCalledTimes(1);
    expect(proposeRun).toHaveBeenCalledWith('add a health endpoint');
    // The single join point: /do feeds the SAME setRunFlowPreview(deriveRunFlowPreview(...))
    // seam the deckent_propose_run tool feeds → identical preview → approval chain.
    expect(h.previews).toEqual([deriveRunFlowPreview(controller.getContext())]);
    expect(h.previews).toEqual([PREVIEW]);
    expect(h.emitted).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  it('a non-AWAITING context after propose → setPreview(null) (honest, no stale card)', async () => {
    const collecting: RunFlowContext = { state: 'COLLECTING' };
    const proposeRun = vi.fn(async () => collecting);
    const h = makeHarness({ controller: fakeController(proposeRun) });

    await runReplDoSlash('do something', h.deps);

    expect(h.previews).toEqual([null]);
    expect(h.errors).toEqual([]);
  });
});

describe('runReplDoSlash — controller error is reported, never re-thrown', () => {
  it('a proposeRun throw (e.g. single-flow RunFlowTransitionError) → reportError', async () => {
    const proposeRun = vi.fn(async () => { throw new Error('flow already proposed'); });
    const h = makeHarness({ controller: fakeController(proposeRun) });

    await expect(runReplDoSlash('second goal', h.deps)).resolves.toBeUndefined();

    expect(h.errors).toEqual(['flow already proposed']);
    expect(h.previews).toEqual([]);
    expect(h.emitted).toEqual([]);
  });
});

describe('buildDoSlashLabels (en)', () => {
  it('both catalog labels are non-empty (the component owns no fallback)', () => {
    expect(EN_DO_SLASH_LABELS.flagOff.length).toBeGreaterThan(0);
    expect(EN_DO_SLASH_LABELS.usage.length).toBeGreaterThan(0);
  });
});
