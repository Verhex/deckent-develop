import { describe, it, expect } from 'vitest';
import {
  createDefaultAnalysis,
  isValidTaskType,
  createDecisionLogEntry,
  axisScoresV3Schema,
  decisionStorySchema,
  brainEscalationSchema,
  routingDecisionV3Schema,
  journalEntryV3Schema,
  createRoutingDecisionV3,
  createJournalEntryV3,
  InvalidRoutingDecisionV3Error,
  InvalidJournalEntryV3Error,
  JOURNAL_ENTRY_V3_SCHEMA_VERSION,
} from '../../src/core/decision-types.js';
import type {
  TaskType,
  TaskAnalysis,
  DecisionLogEntry,
  DecisionResult,
  DecisionContext,
  DecisionStory,
  BrainEscalation,
  RoutingDecisionV3Input,
  JournalEntryV3Input,
} from '../../src/core/decision-types.js';
import { TaskStatus, type Task } from '../../src/core/task-types.js';
import {
  producePositional,
  produceNumerical,
  produceContentStructural,
} from '../../src/core/routing/requirement-vector.js';
import type { RequirementVector } from '../../src/core/routing/requirement-vector.js';
import { BUILTIN_DOMAINS } from '../../src/core/routing/vocabulary-builtin.js';
import type { CapabilityVector } from '../../src/core/routing/capability-vector.js';

// ─── createDefaultAnalysis ─────────────────────────────────────────────────

describe('createDefaultAnalysis', () => {
  it('returns a TaskAnalysis with type code', () => {
    const analysis = createDefaultAnalysis();
    expect(analysis.type).toBe('code');
  });

  it('returns complexity 0', () => {
    const analysis = createDefaultAnalysis();
    expect(analysis.complexity).toBe(0);
  });

  it('returns empty keywords', () => {
    const analysis = createDefaultAnalysis();
    expect(analysis.keywords).toEqual([]);
  });

  it('returns scopeWeight 0', () => {
    const analysis = createDefaultAnalysis();
    expect(analysis.scopeWeight).toBe(0);
  });

  it('returns estimatedDurationMs 0', () => {
    const analysis = createDefaultAnalysis();
    expect(analysis.estimatedDurationMs).toBe(0);
  });

  it('returns a new object on every call', () => {
    const a = createDefaultAnalysis();
    const b = createDefaultAnalysis();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('keywords array is independently mutable', () => {
    const a = createDefaultAnalysis();
    a.keywords.push('test');
    const b = createDefaultAnalysis();
    expect(b.keywords).toEqual([]);
  });
});

// ─── isValidTaskType ───────────────────────────────────────────────────────

describe('isValidTaskType', () => {
  it('returns true for code', () => {
    expect(isValidTaskType('code')).toBe(true);
  });

  it('returns true for test', () => {
    expect(isValidTaskType('test')).toBe(true);
  });

  it('returns true for doc', () => {
    expect(isValidTaskType('doc')).toBe(true);
  });

  it('returns true for security', () => {
    expect(isValidTaskType('security')).toBe(true);
  });

  it('returns true for refactor', () => {
    expect(isValidTaskType('refactor')).toBe(true);
  });

  it('returns true for devops', () => {
    expect(isValidTaskType('devops')).toBe(true);
  });

  it('returns true for config', () => {
    expect(isValidTaskType('config')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidTaskType('')).toBe(false);
  });

  it('returns false for unknown type', () => {
    expect(isValidTaskType('unknown')).toBe(false);
  });

  it('returns false for uppercase CODE', () => {
    expect(isValidTaskType('CODE')).toBe(false);
  });

  it('returns false for number as string', () => {
    expect(isValidTaskType('123')).toBe(false);
  });
});

// ─── createDecisionLogEntry ────────────────────────────────────────────────

describe('createDecisionLogEntry', () => {
  it('creates entry with given step number', () => {
    const entry = createDecisionLogEntry(1, 'Test', 'reason');
    expect(entry.step).toBe(1);
  });

  it('creates entry with given name', () => {
    const entry = createDecisionLogEntry(2, 'AgentSelection', 'matched');
    expect(entry.name).toBe('AgentSelection');
  });

  it('creates entry with given reasoning', () => {
    const entry = createDecisionLogEntry(3, 'Skill', 'Found vitest skill');
    expect(entry.reasoning).toBe('Found vitest skill');
  });

  it('defaults input to empty object', () => {
    const entry = createDecisionLogEntry(1, 'A', 'B');
    expect(entry.input).toEqual({});
  });

  it('defaults output to empty object', () => {
    const entry = createDecisionLogEntry(1, 'A', 'B');
    expect(entry.output).toEqual({});
  });

  it('defaults durationMs to 0', () => {
    const entry = createDecisionLogEntry(1, 'A', 'B');
    expect(entry.durationMs).toBe(0);
  });

  it('returns a new object each time', () => {
    const a = createDecisionLogEntry(1, 'A', 'B');
    const b = createDecisionLogEntry(1, 'A', 'B');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('input object is independently mutable', () => {
    const entry = createDecisionLogEntry(1, 'A', 'B');
    entry.input['key'] = 'value';
    const entry2 = createDecisionLogEntry(1, 'A', 'B');
    expect(entry2.input).toEqual({});
  });

  it('supports step numbers 1 through 6', () => {
    for (let s = 1; s <= 6; s++) {
      const entry = createDecisionLogEntry(s, `Step${s}`, `reason${s}`);
      expect(entry.step).toBe(s);
    }
  });
});

// ─── TaskAnalysis interface ────────────────────────────────────────────────

describe('TaskAnalysis interface', () => {
  it('supports all TaskType values', () => {
    const types: TaskType[] = ['code', 'test', 'doc', 'security', 'refactor', 'devops', 'config'];
    for (const t of types) {
      const analysis: TaskAnalysis = {
        type: t,
        complexity: 5,
        keywords: ['keyword'],
        scopeWeight: 10,
        estimatedDurationMs: 300000,
      };
      expect(analysis.type).toBe(t);
    }
  });

  it('allows complexity range 0-10', () => {
    const low: TaskAnalysis = { ...createDefaultAnalysis(), complexity: 0 };
    const high: TaskAnalysis = { ...createDefaultAnalysis(), complexity: 10 };
    expect(low.complexity).toBe(0);
    expect(high.complexity).toBe(10);
  });
});

// ─── DecisionLogEntry interface ────────────────────────────────────────────

describe('DecisionLogEntry interface', () => {
  it('allows arbitrary input/output records', () => {
    const entry: DecisionLogEntry = {
      step: 1,
      name: 'Test',
      input: { title: 'foo', nested: { a: 1 } },
      output: { model: 'opus', score: 7 },
      durationMs: 15,
      reasoning: 'matched keywords',
    };
    expect(entry.input['title']).toBe('foo');
    expect(entry.output['model']).toBe('opus');
  });
});

// ─── DecisionResult interface ──────────────────────────────────────────────

describe('DecisionResult interface', () => {
  it('can hold null agent', () => {
    const result: DecisionResult = {
      analysis: createDefaultAnalysis(),
      agent: null,
      skills: [],
      model: 'sonnet',
      effort: 'normal',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      decisionLog: [],
    };
    expect(result.agent).toBeNull();
  });

  it('can hold populated fields', () => {
    const result: DecisionResult = {
      analysis: { ...createDefaultAnalysis(), type: 'test', complexity: 7 },
      agent: null,
      skills: [],
      model: 'opus',
      effort: 'high',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
      decisionLog: [createDecisionLogEntry(1, 'A', 'B')],
    };
    expect(result.model).toBe('opus');
    expect(result.decisionLog).toHaveLength(1);
  });
});

// ═══ V3 Decision Pipeline — RoutingDecisionV3 / DecisionStory /
// BrainEscalation / JournalEntryV3 (sprint-446 Task 446-002) ════════════════

// ─── Fixtures (mirrors tests/core/routing/foundation-roundtrip.test.ts's
// makeTask()/produceFullVector() pattern and capability-schema.test.ts's
// validExample() — kept local, not exported) ────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'decision-v3-task',
    title: 'Build a feature',
    description: 'Implement the described behavior in the codebase.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'decision-types V3 fixture',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/example.ts'] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeRequirementVector(): RequirementVector {
  const task = makeTask();
  const positional = producePositional(task, { domains: BUILTIN_DOMAINS });
  const numerical = produceNumerical(task, { domains: BUILTIN_DOMAINS });
  const content = produceContentStructural(task, positional, 0.7);
  return { content, positional, numerical };
}

function makeCapabilityVector(): CapabilityVector {
  return {
    capabilitiesVersion: 3,
    content: {
      workTypes: [{ type: 'build', proficiency: 'primary' }],
      expertise: ['feature construction'],
      personaSlices: ['implementation'],
    },
    positional: {
      domains: [{ id: '*', proficiency: 'able' }],
      surfaces: [],
      writeAuthority: true,
      role: 'implementer',
      deliverables: ['code-src'],
    },
    numerical: {
      preferredModel: 'sonnet',
      costTier: 'standard',
      maxParallel: null,
    },
  };
}

function makeDecisionStory(): DecisionStory {
  return {
    summary: 'implementer selected on content+positional match',
    steps: [
      { stage: 'elimination', outcome: 'survived', detail: 'writeAuthority satisfied' },
      { stage: 'ranking', outcome: 'top', detail: 'finalScore 0.82' },
    ],
    eliminated: [{ agentId: 'doc-writer', reason: 'no code-src deliverable capability' }],
  };
}

function makeBrainEscalation(): BrainEscalation {
  return {
    reason: 'tie',
    candidates: [
      { agentId: 'implementer', finalScore: 0.8, axisScores: { content: 0.9, positional: 0.8, numerical: 0.7 } },
      { agentId: 'refactorer', finalScore: 0.8, axisScores: { content: 0.85, positional: 0.85, numerical: 0.65 } },
    ],
    evidence: 'implementer and refactorer tied at finalScore 0.8',
  };
}

function makeRoutingDecisionInput(overrides: Partial<RoutingDecisionV3Input> = {}): RoutingDecisionV3Input {
  return {
    agentId: 'implementer',
    skillIds: ['vitest-testing'],
    personaSlices: ['implementation'],
    modelPreference: 'sonnet',
    effortClass: 'normal',
    axisScores: { content: 0.9, positional: 0.8, numerical: 0.7 },
    finalScore: 0.82,
    confidence: 0.75,
    provenance: 'ai',
    story: makeDecisionStory(),
    ...overrides,
  };
}

function makeJournalEntryInput(overrides: Partial<JournalEntryV3Input> = {}): JournalEntryV3Input {
  return {
    schemaVersion: JOURNAL_ENTRY_V3_SCHEMA_VERSION,
    taskId: 'decision-v3-task',
    requirementVector: makeRequirementVector(),
    candidateOutcomes: [
      {
        agentId: 'implementer',
        capabilityVector: makeCapabilityVector(),
        steps: [{ stage: 'elimination', outcome: 'survived', detail: 'writeAuthority satisfied' }],
      },
    ],
    decision: makeRoutingDecisionInput(),
    configSnapshotHash: 'sha256:deadbeefcafef00d',
    ...overrides,
  };
}

// ─── axisScoresV3Schema ─────────────────────────────────────────────────────

describe('axisScoresV3Schema', () => {
  it('accepts in-range axis scores', () => {
    const result = axisScoresV3Schema.safeParse({ content: 0.5, positional: 0.3, numerical: 0.2 });
    expect(result.success).toBe(true);
  });

  it('rejects an axis score above 1', () => {
    const result = axisScoresV3Schema.safeParse({ content: 1.1, positional: 0.3, numerical: 0.2 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative axis score', () => {
    const result = axisScoresV3Schema.safeParse({ content: -0.1, positional: 0.3, numerical: 0.2 });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized key (.strict())', () => {
    const result = axisScoresV3Schema.safeParse({ content: 0.5, positional: 0.3, numerical: 0.2, extra: 1 });
    expect(result.success).toBe(false);
  });
});

// ─── decisionStorySchema / brainEscalationSchema ───────────────────────────

describe('decisionStorySchema', () => {
  it('round-trips a valid DecisionStory example', () => {
    const example = makeDecisionStory();
    const parsed = decisionStorySchema.parse(example);
    expect(parsed).toEqual(example);
  });

  it('rejects an unrecognized key (.strict())', () => {
    const withExtra = { ...makeDecisionStory(), extra: true };
    expect(decisionStorySchema.safeParse(withExtra).success).toBe(false);
  });

  it('rejects an empty summary', () => {
    const empty = { ...makeDecisionStory(), summary: '' };
    expect(decisionStorySchema.safeParse(empty).success).toBe(false);
  });
});

describe('brainEscalationSchema', () => {
  it('round-trips a valid BrainEscalation example', () => {
    const example = makeBrainEscalation();
    const parsed = brainEscalationSchema.parse(example);
    expect(parsed).toEqual(example);
  });

  it('rejects an unrecognized key (.strict())', () => {
    const withExtra = { ...makeBrainEscalation(), extra: true };
    expect(brainEscalationSchema.safeParse(withExtra).success).toBe(false);
  });

  it('rejects an invalid reason literal', () => {
    const bad = { ...makeBrainEscalation(), reason: 'unknown-reason' };
    expect(brainEscalationSchema.safeParse(bad).success).toBe(false);
  });
});

// ─── routingDecisionV3Schema / createRoutingDecisionV3 ─────────────────────

describe('routingDecisionV3Schema', () => {
  it('round-trips a valid example without escalation', () => {
    const example = makeRoutingDecisionInput();
    const parsed = routingDecisionV3Schema.parse(example);
    expect(parsed).toEqual(example);
  });

  it('accepts a valid example WITH escalation', () => {
    const example = makeRoutingDecisionInput({ escalation: makeBrainEscalation() });
    expect(routingDecisionV3Schema.safeParse(example).success).toBe(true);
  });

  it('rejects an unrecognized key (.strict())', () => {
    const withExtra = { ...makeRoutingDecisionInput(), extra: true };
    expect(routingDecisionV3Schema.safeParse(withExtra).success).toBe(false);
  });

  it('rejects an invalid provenance literal', () => {
    const bad = { ...makeRoutingDecisionInput(), provenance: 'guessed' };
    expect(routingDecisionV3Schema.safeParse(bad).success).toBe(false);
  });
});

describe('createRoutingDecisionV3', () => {
  it('returns a decision with every input field intact', () => {
    const input = makeRoutingDecisionInput();
    const decision = createRoutingDecisionV3(input);
    expect(decision).toEqual(input);
  });

  it('is deep-frozen: top-level, nested story, nested steps array, axisScores', () => {
    const decision = createRoutingDecisionV3(makeRoutingDecisionInput());
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.story)).toBe(true);
    expect(Object.isFrozen(decision.story.steps)).toBe(true);
    expect(Object.isFrozen(decision.story.steps[0])).toBe(true);
    expect(Object.isFrozen(decision.axisScores)).toBe(true);
    expect(Object.isFrozen(decision.skillIds)).toBe(true);
  });

  it('throws on mutation attempt (strict-mode ESM)', () => {
    const decision = createRoutingDecisionV3(makeRoutingDecisionInput());
    expect(() => {
      (decision as { agentId: string }).agentId = 'mutated';
    }).toThrow();
  });

  it('does not leak internal references — mutating the original input after construction does not affect the frozen decision', () => {
    const input = makeRoutingDecisionInput();
    const decision = createRoutingDecisionV3(input);
    input.story.steps.push({ stage: 'post-construction', outcome: 'injected', detail: 'should not appear' });
    input.skillIds.push('injected-skill');
    expect(decision.story.steps).toHaveLength(2);
    expect(decision.skillIds).toEqual(['vitest-testing']);
  });

  it('accepts a valid decision WITH escalation and freezes it too', () => {
    const decision = createRoutingDecisionV3(makeRoutingDecisionInput({ escalation: makeBrainEscalation() }));
    expect(decision.escalation).toBeDefined();
    expect(Object.isFrozen(decision.escalation)).toBe(true);
  });

  it('throws InvalidRoutingDecisionV3Error on a missing required field', () => {
    const bad: Record<string, unknown> = makeRoutingDecisionInput();
    delete bad['agentId'];
    expect(() => createRoutingDecisionV3(bad)).toThrow(InvalidRoutingDecisionV3Error);
  });

  it('throws InvalidRoutingDecisionV3Error on an out-of-range confidence', () => {
    expect(() => createRoutingDecisionV3(makeRoutingDecisionInput({ confidence: 1.5 }))).toThrow(
      InvalidRoutingDecisionV3Error,
    );
  });
});

// ─── journalEntryV3Schema / createJournalEntryV3 ───────────────────────────

describe('journalEntryV3Schema', () => {
  it('round-trips a full valid example', () => {
    const example = makeJournalEntryInput();
    const parsed = journalEntryV3Schema.parse(example);
    expect(parsed).toEqual(example);
  });

  it('requires schemaVersion to be exactly 1', () => {
    expect(JOURNAL_ENTRY_V3_SCHEMA_VERSION).toBe(1);
    const wrongVersion = { ...makeJournalEntryInput(), schemaVersion: 2 };
    expect(journalEntryV3Schema.safeParse(wrongVersion).success).toBe(false);
  });

  it('rejects an unrecognized key (.strict())', () => {
    const withExtra = { ...makeJournalEntryInput(), extra: true };
    expect(journalEntryV3Schema.safeParse(withExtra).success).toBe(false);
  });
});

describe('createJournalEntryV3', () => {
  it('schemas round-trip through JSON serialization (replay-from-disk shape)', () => {
    const entry = createJournalEntryV3(makeJournalEntryInput());
    const serialized = JSON.stringify(entry);
    const reparsed = journalEntryV3Schema.parse(JSON.parse(serialized));
    expect(reparsed).toEqual(JSON.parse(JSON.stringify(makeJournalEntryInput())));
  });

  // goCriteria: "journal entry captures enough for replay (assert field
  // presence table-driven)" — table-driven presence check over every field
  // needed to replay the deterministic stages without re-running the AI call.
  const entry = createJournalEntryV3(makeJournalEntryInput());
  const REQUIRED_FIELDS: Array<[string, unknown]> = [
    ['schemaVersion', entry.schemaVersion],
    ['taskId', entry.taskId],
    ['requirementVector', entry.requirementVector],
    ['candidateOutcomes', entry.candidateOutcomes],
    ['candidateOutcomes[0].agentId', entry.candidateOutcomes[0]?.agentId],
    ['candidateOutcomes[0].capabilityVector', entry.candidateOutcomes[0]?.capabilityVector],
    ['candidateOutcomes[0].steps', entry.candidateOutcomes[0]?.steps],
    ['decision', entry.decision],
    ['decision.story', entry.decision.story],
    ['configSnapshotHash', entry.configSnapshotHash],
  ];

  it.each(REQUIRED_FIELDS)('captures %s (replay-sufficient)', (_name, value) => {
    expect(value).toBeDefined();
  });

  it('is deep-frozen: top-level, candidateOutcomes, nested decision', () => {
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.candidateOutcomes)).toBe(true);
    expect(Object.isFrozen(entry.candidateOutcomes[0])).toBe(true);
    expect(Object.isFrozen(entry.decision)).toBe(true);
    expect(Object.isFrozen(entry.decision.story)).toBe(true);
  });

  it('does not leak internal references from the input requirementVector/candidateOutcomes', () => {
    const input = makeJournalEntryInput();
    const sealed = createJournalEntryV3(input);
    input.candidateOutcomes.push({
      agentId: 'injected-agent',
      capabilityVector: makeCapabilityVector(),
      steps: [],
    });
    expect(sealed.candidateOutcomes).toHaveLength(1);
  });

  it('throws InvalidJournalEntryV3Error on a missing required field', () => {
    const bad: Record<string, unknown> = makeJournalEntryInput();
    delete bad['taskId'];
    expect(() => createJournalEntryV3(bad)).toThrow(InvalidJournalEntryV3Error);
  });

  it('throws InvalidJournalEntryV3Error on wrong schemaVersion', () => {
    expect(() => createJournalEntryV3(makeJournalEntryInput({ schemaVersion: 2 as 1 }))).toThrow(
      InvalidJournalEntryV3Error,
    );
  });
});
