// D4-4 — design-layer pins:
//   * buildCourseGeometry («Rota» signature): deterministic fixes, gentle
//     swell, honest underway/terminal semantics, degenerate cases.
//   * FLOW_STATE_MESSAGE_KEYS drift-gate: the Desktop's state vocabulary IS
//     the terminal /runs inbox's vocabulary — same keys as buildInboxLabels.

import { describe, it, expect } from 'vitest';
import { buildCourseGeometry } from '../src/renderer/shell/course.js';
import { FLOW_STATE_MESSAGE_KEYS, DESKTOP_MESSAGE_KEYS } from '../src/shared/desktop-messages.js';
import { buildInboxLabels } from '../../cli/repl/run-flow-inbox.js';
import type { RunFlowEventPayload } from '../src/renderer/shell/api-client.js';

function event(type: string, sequence: number): RunFlowEventPayload {
  return { type, flowId: 'f', timestamp: `t${sequence}`, sequence };
}

describe('buildCourseGeometry — «Rota» signature (D4-4)', () => {
  it('empty events → empty geometry (nothing speculative is ever drawn)', () => {
    expect(buildCourseGeometry([], 960, 96)).toEqual({ pathD: '', fixes: [], vessel: null, underway: false });
  });

  it('lays fixes left→right with margins; the vessel sits at the LAST fix', () => {
    const g = buildCourseGeometry([event('PROPOSAL_SUBMITTED', 1), event('PREVIEW_STARTED', 2), event('PREVIEW_READY', 3)], 960, 96);
    expect(g.fixes).toHaveLength(3);
    expect(g.fixes[0]!.x).toBeLessThan(g.fixes[1]!.x);
    expect(g.fixes[1]!.x).toBeLessThan(g.fixes[2]!.x);
    expect(g.fixes[0]!.x).toBeGreaterThan(0);
    expect(g.fixes[2]!.x).toBeLessThan(960);
    expect(g.vessel).toEqual(g.fixes[2]);
    expect(g.pathD.startsWith('M ')).toBe(true);
  });

  it('is underway until a terminal event, then the line honestly stops sailing', () => {
    const live = buildCourseGeometry([event('RUN_STARTED', 5)], 960, 96);
    expect(live.underway).toBe(true);
    for (const terminal of ['RUN_COMPLETED', 'RUN_FAILED', 'FLOW_ABORTED', 'APPROVAL_REJECTED']) {
      const done = buildCourseGeometry([event('RUN_STARTED', 5), event(terminal, 6)], 960, 96);
      expect(done.underway, terminal).toBe(false);
    }
  });

  it('a single event renders one fix at the left margin (no NaN geometry)', () => {
    const g = buildCourseGeometry([event('PROPOSAL_SUBMITTED', 1)], 960, 96);
    expect(g.fixes).toHaveLength(1);
    expect(Number.isFinite(g.fixes[0]!.x)).toBe(true);
    expect(Number.isFinite(g.fixes[0]!.y)).toBe(true);
  });

  it('is deterministic (same events → identical geometry)', () => {
    const events = [event('A', 1), event('B', 2), event('C', 3), event('D', 4)];
    expect(buildCourseGeometry(events, 960, 96)).toEqual(buildCourseGeometry(events, 960, 96));
  });
});

describe('FLOW_STATE_MESSAGE_KEYS — terminal-vocabulary drift-gate (D4-4)', () => {
  it('agrees EXACTLY with the terminal inbox mapping (buildInboxLabels)', () => {
    const seen: string[] = [];
    const t = (key: string) => {
      seen.push(key);
      return key;
    };
    const labels = buildInboxLabels(t);
    // the terminal's stateLabels record maps state → resolved key (our fake t
    // returns the key itself) — must equal the desktop map verbatim
    expect(labels.stateLabels).toEqual(FLOW_STATE_MESSAGE_KEYS);
  });

  it('every state key is served over the bridge', () => {
    const served = new Set<string>(DESKTOP_MESSAGE_KEYS);
    for (const key of Object.values(FLOW_STATE_MESSAGE_KEYS)) {
      expect(served.has(key), key).toBe(true);
    }
  });
});
