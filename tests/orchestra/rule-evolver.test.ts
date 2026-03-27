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

  describe('evolveSynergyRules (skill-skill pairs)', () => {
    it('creates activation EvolvedRule for synergistic skill pairs', () => {
      const dna = createDefaultTaskDNA();
      // 5 tasks where skill-a and skill-b always succeed together
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome({
          taskId: `task-${i}`, sprintId: 'sprint-001', taskDNA: dna,
          agentId: null, skillIds: ['skill-a', 'skill-b'], evaluation: 'DONE',
          coverage: 95, routingVersion: 'v2',
        });
      }

      const result = evolver.evolveRules();
      const synergyRule = result.newRules.find(r =>
        r.type === 'activation' && r.entityType === 'skill' &&
        r.rule.name?.includes('synergy-skill-a-with-skill-b'),
      );
      expect(synergyRule).toBeDefined();
      expect(synergyRule!.sampleSize).toBe(5);
    });

    it('creates exclusion EvolvedRule for conflicting skill pairs', () => {
      const dna = createDefaultTaskDNA();
      // 5 tasks where skill-x and skill-y always fail together
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome({
          taskId: `task-${i}`, sprintId: 'sprint-001', taskDNA: dna,
          agentId: null, skillIds: ['skill-x', 'skill-y'], evaluation: 'NO_GO',
          coverage: 0, routingVersion: 'v2',
        });
      }

      const result = evolver.evolveRules();
      const conflictRule = result.newRules.find(r =>
        r.type === 'exclusion' && r.entityType === 'skill' &&
        r.rule.name?.includes('conflict-skill-x-with-skill-y'),
      );
      expect(conflictRule).toBeDefined();
    });

    it('does not create skill-skill rules for agent+skill synergy pairs', () => {
      const dna = createDefaultTaskDNA();
      // Agent + skill synergy — should NOT create a skill EvolvedRule
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome({
          taskId: `task-${i}`, sprintId: 'sprint-001', taskDNA: dna,
          agentId: 'test-agent', skillIds: ['skill-a'], evaluation: 'DONE',
          coverage: 90, routingVersion: 'v2',
        });
      }

      const result = evolver.evolveRules();
      // Agent+skill synergy rules should not produce EvolvedRule objects
      const agentSkillRules = result.newRules.filter(r =>
        r.rule.name?.includes('synergy-test-agent-with-skill-a') ||
        r.rule.name?.includes('synergy-skill-a-with-test-agent'),
      );
      expect(agentSkillRules).toHaveLength(0);
    });

    it('sets correct confidence and status based on sample size', () => {
      const dna = createDefaultTaskDNA();
      // 10 tasks → higher confidence
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome({
          taskId: `task-${i}`, sprintId: 'sprint-001', taskDNA: dna,
          agentId: null, skillIds: ['skill-p', 'skill-q'], evaluation: 'DONE',
          coverage: 90, routingVersion: 'v2',
        });
      }

      const result = evolver.evolveRules();
      const rule = result.newRules.find(r => r.rule.name?.includes('synergy-skill-p-with-skill-q'));
      expect(rule).toBeDefined();
      expect(rule!.confidence).toBeGreaterThan(0.65);
      expect(['auto-applied', 'suggested']).toContain(rule!.status);
    });

    it('detects conflict in reasoning for failing pairs', () => {
      const dna = createDefaultTaskDNA();
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome({
          taskId: `task-${i}`, sprintId: 'sprint-001', taskDNA: dna,
          agentId: null, skillIds: ['skill-m', 'skill-n'], evaluation: 'NO_GO',
          coverage: 0, routingVersion: 'v2',
        });
      }

      const result = evolver.evolveRules();
      expect(result.reasoning.some(r => r.includes('Conflict'))).toBe(true);
    });
  });

  describe('skill rule evolution', () => {
    it('generates activation rule for high-performing skill+intent', () => {
      const secDna = createDefaultTaskDNA();
      secDna.intent.primary = 'security';
      const implDna = createDefaultTaskDNA();
      implDna.intent.primary = 'implementation';

      // 6 successful security tasks for the skill
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome({
          taskId: `sec-${i}`, sprintId: 'sprint-001', taskDNA: secDna,
          agentId: null, skillIds: ['security-expert'], evaluation: 'DONE',
          coverage: 90, routingVersion: 'v2',
        });
      }
      // 5 failed implementation tasks
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome({
          taskId: `impl-${i}`, sprintId: 'sprint-001', taskDNA: implDna,
          agentId: null, skillIds: ['security-expert'], evaluation: 'NO_GO',
          coverage: 0, routingVersion: 'v2',
        });
      }

      const result = evolver.evolveRules();
      const activationRule = result.newRules.find(r =>
        r.entityId === 'security-expert' && r.entityType === 'skill' && r.type === 'activation',
      );
      expect(activationRule).toBeDefined();
    });

    it('generates exclusion rule for low-performing skill+intent', () => {
      const implDna = createDefaultTaskDNA();
      implDna.intent.primary = 'implementation';
      const testDna = createDefaultTaskDNA();
      testDna.intent.primary = 'testing';

      // 6 successful testing tasks
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome({
          taskId: `test-${i}`, sprintId: 'sprint-001', taskDNA: testDna,
          agentId: null, skillIds: ['doc-writer'], evaluation: 'DONE',
          coverage: 80, routingVersion: 'v2',
        });
      }
      // 6 failed implementation tasks
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome({
          taskId: `impl-${i}`, sprintId: 'sprint-001', taskDNA: implDna,
          agentId: null, skillIds: ['doc-writer'], evaluation: 'NO_GO',
          coverage: 0, routingVersion: 'v2',
        });
      }

      const result = evolver.evolveRules();
      const exclusionRule = result.newRules.find(r =>
        r.entityId === 'doc-writer' && r.entityType === 'skill' && r.type === 'exclusion',
      );
      expect(exclusionRule).toBeDefined();
    });
  });
});
