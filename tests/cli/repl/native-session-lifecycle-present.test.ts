import { describe, it, expect } from 'vitest';
import { formatSessionLifecycleLines } from '../../../src/cli/repl/native-session-lifecycle-present.js';
import { buildSessionLifecycleLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const labels = buildSessionLifecycleLabels((key) => getMessage(key, 'en'));

describe('formatSessionLifecycleLines', () => {
  it('includes idle disclaimer separate from work wall budget', () => {
    const lines = formatSessionLifecycleLines({
      conversation: 'open',
      operation: 'idle',
      turnSequence: 1,
      userIdleMs: 45_000,
      userIdleTracked: true,
      permissionPending: false,
      budgetBlocked: false,
      workBudget: {
        budgetEpoch: 1,
        elapsedWorkMs: 5_000,
        maxWallTimeMs: 2_700_000,
        rounds: 0,
        maxModelRounds: 120,
        toolCalls: 0,
        maxToolCalls: 400,
        cumulativeTokens: 0,
        maxCumulativeTokens: 2_000_000,
      },
    }, labels);
    expect(lines.some((l) => l.includes('does not consume work wall budget'))).toBe(true);
    expect(lines.some((l) => l.includes('not user idle TTL'))).toBe(true);
  });
});
