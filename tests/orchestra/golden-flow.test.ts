import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  runGoldenFlow,
  buildPlanPreview,
  type GoldenFlowSeams,
  type GoldenFlowEvent,
} from '../../src/orchestra/golden-flow.js';
import { buildDirectives, type DirectiveBuildIntent } from '../../src/orchestra/directives-builder.js';

// TERM-FLOW (Sprint 354, Task 354-007): pure golden-flow orchestrator. Every
// seam here is a fake — no LLM call, no exec, no real sprint start ever
// happens in this suite (matches connect-wizard.test.ts's hermeticity
// convention: probes/seams are injected, defaults are never wired to a real
// backend within the module under test).

interface FakeStart {
  sprintId: string;
}

interface FakeEvaluate {
  outcome: string;
  sprintId: string;
}

function fixtureIntent(): DirectiveBuildIntent {
  return {
    title: 'Golden Flow Fixture',
    tasks: [
      {
        title: 'Do the thing',
        desc: 'A fixture task for golden-flow tests.',
        files: ['src/x.ts'],
        scope: ['src/'],
        deps: [],
        goCriteria: ['tsc clean'],
        nogo: ['break build'],
      },
    ],
  };
}

/** Deterministic clock — each call advances by one second from a fixed epoch. */
function makeClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
}

interface SeamOverrides {
  approvePlan?: GoldenFlowSeams<FakeStart, FakeEvaluate>['approvePlan'];
  signal?: AbortSignal;
  deriveIntent?: GoldenFlowSeams<FakeStart, FakeEvaluate>['deriveIntent'];
  startSprint?: GoldenFlowSeams<FakeStart, FakeEvaluate>['startSprint'];
}

function makeSeams(overrides: SeamOverrides = {}) {
  const callLog: string[] = [];
  const events: GoldenFlowEvent[] = [];
  const intent = fixtureIntent();

  const seams: GoldenFlowSeams<FakeStart, FakeEvaluate> = {
    deriveIntent:
      overrides.deriveIntent ??
      (async (goal: string) => {
        callLog.push(`deriveIntent:${goal}`);
        return intent;
      }),
    approvePlan:
      overrides.approvePlan ??
      (async () => {
        callLog.push('approvePlan');
        return true;
      }),
    startSprint:
      overrides.startSprint ??
      (async () => {
        callLog.push('startSprint');
        return { sprintId: 'sprint-fixture' };
      }),
    evaluateSprint: async (start) => {
      callLog.push('evaluateSprint');
      return { outcome: 'done', sprintId: start.sprintId };
    },
    onEvent: (event) => events.push(event),
    now: makeClock(),
    signal: overrides.signal,
  };

  return { seams, callLog, events, intent };
}

const STAGE_STATUS = (events: GoldenFlowEvent[]): Array<{ stage: string; status: string; reason?: string }> =>
  events.map((e) => (e.reason ? { stage: e.stage, status: e.status, reason: e.reason } : { stage: e.stage, status: e.status }));

describe('runGoldenFlow — happy path', () => {
  it('runs the full fake-seam flow end-to-end and returns a completed result', async () => {
    const { seams, callLog, intent } = makeSeams();
    const result = await runGoldenFlow('build a thing', seams);

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('unreachable');
    expect(result.intent).toEqual(intent);
    expect(result.preview.directivesMarkdown).toBe(buildDirectives(intent));
    expect(result.preview.taskCount).toBe(1);
    expect(result.start).toEqual({ sprintId: 'sprint-fixture' });
    expect(result.evaluate).toEqual({ outcome: 'done', sprintId: 'sprint-fixture' });

    // seams invoked in strict pipeline order, exactly once each
    expect(callLog).toEqual(['deriveIntent:build a thing', 'approvePlan', 'startSprint', 'evaluateSprint']);
  });

  it('emits a deterministic step-by-step event sequence (TERM-LIVE-shaped)', async () => {
    const { seams, events } = makeSeams();
    await runGoldenFlow('build a thing', seams);

    expect(STAGE_STATUS(events)).toEqual([
      { stage: 'intent', status: 'start' },
      { stage: 'intent', status: 'done' },
      { stage: 'plan', status: 'start' },
      { stage: 'plan', status: 'done' },
      { stage: 'approve', status: 'start' },
      { stage: 'approve', status: 'done' },
      { stage: 'start', status: 'start' },
      { stage: 'start', status: 'done' },
      { stage: 'evaluate', status: 'start' },
      { stage: 'evaluate', status: 'done' },
    ]);

    // TERM-LIVE-shaped: every event carries an ISO timestamp, non-decreasing
    for (const e of events) expect(() => new Date(e.timestamp).toISOString()).not.toThrow();
    const times = events.map((e) => new Date(e.timestamp).getTime());
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]!);

    // running/next labels are present on start/done events for live-footer wiring
    const introStart = events.find((e) => e.stage === 'intent' && e.status === 'start')!;
    expect(introStart.running).toBeTruthy();
    expect(introStart.next).toBe('plan');
  });

  it('re-running with identical seam outputs re-produces the identical event sequence (determinism)', async () => {
    const first = makeSeams();
    const second = makeSeams();
    await runGoldenFlow('same goal', first.seams);
    await runGoldenFlow('same goal', second.seams);
    expect(STAGE_STATUS(first.events)).toEqual(STAGE_STATUS(second.events));
  });
});

describe('runGoldenFlow — approve-red clean cancel', () => {
  it('cancels cleanly when approvePlan rejects, never starting or evaluating', async () => {
    const { seams, callLog, events } = makeSeams({ approvePlan: async () => false });
    const result = await runGoldenFlow('build a thing', seams);

    expect(result).toEqual({ status: 'cancelled', stage: 'approve', reason: 'rejected' });
    expect(callLog).not.toContain('startSprint');
    expect(callLog).not.toContain('evaluateSprint');

    expect(STAGE_STATUS(events)).toEqual([
      { stage: 'intent', status: 'start' },
      { stage: 'intent', status: 'done' },
      { stage: 'plan', status: 'start' },
      { stage: 'plan', status: 'done' },
      { stage: 'approve', status: 'start' },
      { stage: 'approve', status: 'cancelled', reason: 'rejected' },
    ]);
  });
});

describe('runGoldenFlow — clean cancel at every stage boundary (AbortSignal)', () => {
  it('cancels before intent when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { seams, callLog } = makeSeams({ signal: controller.signal });

    const result = await runGoldenFlow('goal', seams);
    expect(result).toEqual({ status: 'cancelled', stage: 'intent', reason: 'aborted' });
    expect(callLog).toEqual([]); // no seam ever invoked
  });

  it('cancels at plan when the signal fires during deriveIntent', async () => {
    const controller = new AbortController();
    const { seams, callLog } = makeSeams({
      signal: controller.signal,
      deriveIntent: async (goal: string) => {
        callLog.push(`deriveIntent:${goal}`);
        controller.abort();
        return fixtureIntent();
      },
    });

    const result = await runGoldenFlow('goal', seams);
    expect(result).toEqual({ status: 'cancelled', stage: 'plan', reason: 'aborted' });
    expect(callLog).toEqual(['deriveIntent:goal']);
  });

  it('cancels at start when the signal fires during approvePlan', async () => {
    const controller = new AbortController();
    const { seams, callLog } = makeSeams({
      signal: controller.signal,
      approvePlan: async () => {
        callLog.push('approvePlan');
        controller.abort();
        return true;
      },
    });

    const result = await runGoldenFlow('goal', seams);
    expect(result).toEqual({ status: 'cancelled', stage: 'start', reason: 'aborted' });
    expect(callLog).toEqual(['deriveIntent:goal', 'approvePlan']);
    expect(callLog).not.toContain('startSprint');
  });

  it('cancels at evaluate when the signal fires during startSprint', async () => {
    const controller = new AbortController();
    const { seams, callLog } = makeSeams({
      signal: controller.signal,
      startSprint: async () => {
        callLog.push('startSprint');
        controller.abort();
        return { sprintId: 'sprint-fixture' };
      },
    });

    const result = await runGoldenFlow('goal', seams);
    expect(result).toEqual({ status: 'cancelled', stage: 'evaluate', reason: 'aborted' });
    expect(callLog).toEqual(['deriveIntent:goal', 'approvePlan', 'startSprint']);
    expect(callLog).not.toContain('evaluateSprint');
  });
});

describe('runGoldenFlow — seam error propagation', () => {
  it('emits an error event and rethrows when a seam throws', async () => {
    const { seams, events } = makeSeams({
      deriveIntent: async () => {
        throw new Error('llm exploded');
      },
    });

    await expect(runGoldenFlow('goal', seams)).rejects.toThrow('llm exploded');
    expect(STAGE_STATUS(events)).toEqual([
      { stage: 'intent', status: 'start' },
      { stage: 'intent', status: 'error' },
    ]);
    expect(events[1]!.error).toBe('llm exploded');
  });
});

describe('buildPlanPreview — builder-seam, READ-ONLY use of directives-builder', () => {
  it('renders a preview whose markdown matches buildDirectives(intent) exactly', () => {
    const intent = fixtureIntent();
    const preview = buildPlanPreview(intent);
    expect(preview.directivesMarkdown).toBe(buildDirectives(intent));
    expect(preview.taskCount).toBe(1);
    expect(preview.tasks).toEqual([
      { title: 'Do the thing', files: ['src/x.ts'], scope: ['src/'], goCriteria: ['tsc clean'] },
    ]);
  });

  it('never mutates the input intent (defensive copies of array fields)', () => {
    const intent = fixtureIntent();
    const preview = buildPlanPreview(intent);
    preview.tasks[0]!.files.push('mutated.ts');
    expect(intent.tasks[0]!.files).toEqual(['src/x.ts']);
  });
});

describe('golden-flow.ts — no disk writer (static source guard)', () => {
  it('contains no file-write call anywhere in the module', () => {
    const src = readFileSync(new URL('../../src/orchestra/golden-flow.ts', import.meta.url), 'utf-8');
    expect(src).not.toMatch(/writeFile|mkdirSync|createWriteStream/);
  });
});
