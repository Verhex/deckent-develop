import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuleEvolver } from '../../src/orchestra/rule-evolver.js';
import { OutcomeTracker } from '../../src/orchestra/outcome-tracker.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe('RuleEvolver', () => {
  let tracker: OutcomeTracker;
  let evolver: RuleEvolver;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new OutcomeTracker('/tmp/test');
    evolver = new RuleEvolver(tracker);
  });

  it('returns empty rules with no data', () => {
    const result = evolver.evolveRules();
    expect(result.newRules).toHaveLength(0);
  });

  it('generates activation rule for high-performing agent+intent', () => {
    const dna = createDefaultTaskDNA();
    dna.intent.primary = 'security';

    // Record 6 successful security tasks
    for (let i = 0; i < 6; i++) {
      tracker.recordOutcome({
        taskId: `task-${i}`, sprintId: 'sprint-001', taskDNA: dna,
        agentId: 'security-auditor', skillIds: [], evaluation: 'DONE',
        coverage: 90, routingVersion: 'v2',
      });
    }

    // Record 2 failed non-security tasks to create a delta
    const implDna = createDefaultTaskDNA();
    implDna.intent.primary = 'implementation';
    for (let i = 0; i < 5; i++) {
      tracker.recordOutcome({
        taskId: `task-fail-${i}`, sprintId: 'sprint-001', taskDNA: implDna,
        agentId: 'security-auditor', skillIds: [], evaluation: 'NO_GO',
        coverage: 0, routingVersion: 'v2',
      });
    }

    const result = evolver.evolveRules();
    const securityRule = result.newRules.find(r =>
      r.entityId === 'security-auditor' && r.type === 'activation',
    );
    expect(securityRule).toBeDefined();
    expect(securityRule!.confidence).toBeGreaterThan(0.5);
  });

  it('generates exclusion rule for low-performing agent+intent', () => {
    const implDna = createDefaultTaskDNA();
    implDna.intent.primary = 'implementation';

    // Record 6 successful general tasks first
    const secDna = createDefaultTaskDNA();
    secDna.intent.primary = 'security';
    for (let i = 0; i < 6; i++) {
      tracker.recordOutcome({
        taskId: `sec-${i}`, sprintId: 'sprint-001', taskDNA: secDna,
        agentId: 'ci-testing-skill', skillIds: [], evaluation: 'DONE',
        coverage: 90, routingVersion: 'v2',
      });
    }

    // Record 6 failed implementation tasks
    for (let i = 0; i < 6; i++) {
      tracker.recordOutcome({
        taskId: `impl-${i}`, sprintId: 'sprint-001', taskDNA: implDna,
        agentId: 'ci-testing-skill', skillIds: [], evaluation: 'NO_GO',
        coverage: 0, routingVersion: 'v2',
      });
    }

    const result = evolver.evolveRules();
    const excludeRule = result.newRules.find(r =>
      r.entityId === 'ci-testing-skill' && r.type === 'exclusion',
    );
    expect(excludeRule).toBeDefined();
  });

  it('does not generate rules with insufficient data', () => {
    const dna = createDefaultTaskDNA();
    dna.intent.primary = 'security';

    // Only 2 tasks — below minimum (5)
    for (let i = 0; i < 2; i++) {
      tracker.recordOutcome({
        taskId: `task-${i}`, sprintId: 'sprint-001', taskDNA: dna,
        agentId: 'agent-x', skillIds: [], evaluation: 'DONE',
        coverage: 90, routingVersion: 'v2',
      });
    }

    const result = evolver.evolveRules();
    expect(result.newRules.filter(r => r.entityId === 'agent-x')).toHaveLength(0);
  });

  it('detects synergy in reasoning', () => {
    const dna = createDefaultTaskDNA();
    for (let i = 0; i < 5; i++) {
      tracker.recordOutcome({
        taskId: `task-${i}`, sprintId: 'sprint-001', taskDNA: dna,
        agentId: 'agent-a', skillIds: ['skill-b'], evaluation: 'DONE',
        coverage: 95, routingVersion: 'v2',
      });
    }

    const result = evolver.evolveRules();
    expect(result.reasoning.some(r => r.includes('Synergy'))).toBe(true);
  });
});
