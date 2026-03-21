import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildUsageOutput } from '../../src/cli/commands/usage.js';
import { UsageTracker } from '../../src/core/usage-tracker.js';

// ─── Mock UsageTracker ────────────────────────────────────────────────────────

function makeTracker(overrides: Partial<UsageTracker> = {}): UsageTracker {
  const base = {
    getSprintUsage: vi.fn(),
    getTotalUsage: vi.fn(),
    getModelBreakdown: vi.fn(),
    listSprints: vi.fn(),
    recordCall: vi.fn(),
  } as unknown as UsageTracker;
  return Object.assign(base, overrides);
}

const emptyTotal = {
  totalCalls: 0,
  totalTokens: 0,
  sprintCount: 0,
  modelBreakdown: [],
};

const sampleTotal = {
  totalCalls: 10,
  totalTokens: 5000,
  sprintCount: 2,
  modelBreakdown: [
    { model: 'opus' as const, calls: 6, tokens: 4000 },
    { model: 'haiku' as const, calls: 4, tokens: 1000 },
  ],
};

const sampleSprint = {
  sprintId: 'sprint-001',
  entries: [],
  totalCalls: 5,
  totalTokens: 2500,
  modelBreakdown: [
    { model: 'opus' as const, calls: 3, tokens: 2000 },
    { model: 'haiku' as const, calls: 2, tokens: 500 },
  ],
};

const emptySprintUsage = {
  sprintId: 'sprint-999',
  entries: [],
  totalCalls: 0,
  totalTokens: 0,
  modelBreakdown: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildUsageOutput — no data', () => {
  it('returns informative message when no usage data', () => {
    const tracker = makeTracker({
      getTotalUsage: vi.fn().mockReturnValue(emptyTotal),
      listSprints: vi.fn().mockReturnValue([]),
    });

    const { text } = buildUsageOutput(tracker);
    expect(text).toContain('No usage data found');
    expect(text).toContain('Run a sprint first');
  });

  it('data field contains total usage object when empty', () => {
    const tracker = makeTracker({
      getTotalUsage: vi.fn().mockReturnValue(emptyTotal),
      listSprints: vi.fn().mockReturnValue([]),
    });

    const { data } = buildUsageOutput(tracker);
    expect(data).toEqual(emptyTotal);
  });
});

describe('buildUsageOutput — with data', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    tracker = makeTracker({
      getTotalUsage: vi.fn().mockReturnValue(sampleTotal),
      listSprints: vi.fn().mockReturnValue(['sprint-001', 'sprint-002']),
      getSprintUsage: vi.fn().mockReturnValue(sampleSprint),
    });
  });

  it('returns table with model breakdown', () => {
    const { text } = buildUsageOutput(tracker);
    expect(text).toContain('Model');
    expect(text).toContain('Calls');
    expect(text).toContain('Tokens');
    expect(text).toContain('opus');
    expect(text).toContain('haiku');
  });

  it('includes total summary line', () => {
    const { text } = buildUsageOutput(tracker);
    expect(text).toContain('Total Sprints: 2');
    expect(text).toContain('Total Calls: 10');
    expect(text).toContain('Total Tokens: 5000');
  });

  it('includes sprint history section', () => {
    const { text } = buildUsageOutput(tracker);
    expect(text).toContain('Sprint History');
  });

  it('data contains total and sprints array', () => {
    const { data } = buildUsageOutput(tracker) as { data: { total: unknown; sprints: unknown[] } };
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('sprints');
    expect(Array.isArray(data.sprints)).toBe(true);
  });
});

describe('buildUsageOutput — --sprint filter', () => {
  it('returns sprint-specific data when sprint option provided', () => {
    const tracker = makeTracker({
      getSprintUsage: vi.fn().mockReturnValue(sampleSprint),
    });

    const { text } = buildUsageOutput(tracker, { sprint: 'sprint-001' });
    expect(text).toContain('Sprint: sprint-001');
    expect(text).toContain('Total Calls: 5');
  });

  it('returns informative message when sprint has no data', () => {
    const tracker = makeTracker({
      getSprintUsage: vi.fn().mockReturnValue(emptySprintUsage),
    });

    const { text } = buildUsageOutput(tracker, { sprint: 'sprint-999' });
    expect(text).toContain('No usage data found for sprint: sprint-999');
  });

  it('data field is SprintUsage when sprint filter used', () => {
    const tracker = makeTracker({
      getSprintUsage: vi.fn().mockReturnValue(sampleSprint),
    });

    const { data } = buildUsageOutput(tracker, { sprint: 'sprint-001' });
    expect(data).toEqual(sampleSprint);
  });

  it('calls getSprintUsage with correct sprint id', () => {
    const getSprintUsage = vi.fn().mockReturnValue(sampleSprint);
    const tracker = makeTracker({ getSprintUsage });

    buildUsageOutput(tracker, { sprint: 'sprint-042' });
    expect(getSprintUsage).toHaveBeenCalledWith('sprint-042');
  });

  it('shows model breakdown table for sprint', () => {
    const tracker = makeTracker({
      getSprintUsage: vi.fn().mockReturnValue(sampleSprint),
    });

    const { text } = buildUsageOutput(tracker, { sprint: 'sprint-001' });
    expect(text).toContain('Model Breakdown');
    expect(text).toContain('opus');
  });
});

describe('buildUsageOutput — --json output', () => {
  it('data field is valid JSON-serialisable when no data', () => {
    const tracker = makeTracker({
      getTotalUsage: vi.fn().mockReturnValue(emptyTotal),
      listSprints: vi.fn().mockReturnValue([]),
    });

    const { data } = buildUsageOutput(tracker, { json: true });
    expect(() => JSON.stringify(data)).not.toThrow();
  });

  it('data field is valid JSON-serialisable with full data', () => {
    const tracker = makeTracker({
      getTotalUsage: vi.fn().mockReturnValue(sampleTotal),
      listSprints: vi.fn().mockReturnValue(['sprint-001']),
      getSprintUsage: vi.fn().mockReturnValue(sampleSprint),
    });

    const { data } = buildUsageOutput(tracker, { json: true });
    expect(() => JSON.stringify(data)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(data)) as { total: typeof sampleTotal };
    expect(parsed.total.totalCalls).toBe(10);
  });

  it('data field includes sprint usage when sprint filter + json', () => {
    const tracker = makeTracker({
      getSprintUsage: vi.fn().mockReturnValue(sampleSprint),
    });

    const { data } = buildUsageOutput(tracker, { json: true, sprint: 'sprint-001' });
    expect(data).toEqual(sampleSprint);
  });
});

describe('buildUsageOutput — table format', () => {
  it('table contains correct call counts', () => {
    const tracker = makeTracker({
      getTotalUsage: vi.fn().mockReturnValue(sampleTotal),
      listSprints: vi.fn().mockReturnValue(['sprint-001']),
      getSprintUsage: vi.fn().mockReturnValue(sampleSprint),
    });

    const { text } = buildUsageOutput(tracker);
    // Model breakdown: 6 calls for opus
    expect(text).toContain('6');
    // Token count for opus: 4000
    expect(text).toContain('4000');
  });

  it('table has headers Model, Calls, Tokens', () => {
    const tracker = makeTracker({
      getTotalUsage: vi.fn().mockReturnValue(sampleTotal),
      listSprints: vi.fn().mockReturnValue(['sprint-001']),
      getSprintUsage: vi.fn().mockReturnValue(sampleSprint),
    });

    const { text } = buildUsageOutput(tracker);
    expect(text).toContain('Model');
    expect(text).toContain('Calls');
    expect(text).toContain('Tokens');
  });

  it('does NOT include cost column when not in API mode', () => {
    const tracker = makeTracker({
      getTotalUsage: vi.fn().mockReturnValue(sampleTotal),
      listSprints: vi.fn().mockReturnValue(['sprint-001']),
      getSprintUsage: vi.fn().mockReturnValue(sampleSprint),
    });

    const { text } = buildUsageOutput(tracker);
    expect(text).not.toContain('Est. Cost');
  });
});

describe('buildUsageOutput — multiple models', () => {
  it('shows all models in breakdown', () => {
    const multiModelTotal = {
      totalCalls: 15,
      totalTokens: 8000,
      sprintCount: 3,
      modelBreakdown: [
        { model: 'opus' as const, calls: 5, tokens: 5000 },
        { model: 'sonnet' as const, calls: 7, tokens: 2000 },
        { model: 'haiku' as const, calls: 3, tokens: 1000 },
      ],
    };

    const tracker = makeTracker({
      getTotalUsage: vi.fn().mockReturnValue(multiModelTotal),
      listSprints: vi.fn().mockReturnValue([]),
    });

    const { text } = buildUsageOutput(tracker);
    expect(text).toContain('opus');
    expect(text).toContain('sonnet');
    expect(text).toContain('haiku');
  });
});
