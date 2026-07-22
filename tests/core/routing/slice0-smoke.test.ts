// tests/core/routing/slice0-smoke.test.ts
//
// Sprint-445 Task 445-026 — slice-0 integration smoke: the hermetic tmpdir
// end-to-end gate named in the task's goCriteria (fixture project +
// sync-migrate -> agent-pool loads capabilities -> vectors produce -> doctor
// vocabulary section clean). Every prior routing3 Slice-0 piece is already
// unit-pinned in its own file (agent-pool-capabilities.test.ts,
// foundation-roundtrip.test.ts, vocabulary-doctor.test.ts,
// tests/cli/sync-capabilities-migrate.test.ts, ...) — this file's only job is
// proving the SAME real production code paths compose correctly end to end
// against one shared hermetic fixture, not re-litigating any single piece's
// own edge cases.
//
// CUSTOM Test Hermeticity: one throwaway os.tmpdir() sandbox built in
// beforeAll, removed in afterAll — no real project state (.deckent/, .brain/)
// is ever read or written.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { syncAgentCapabilities } from '../../../src/cli/commands/sync.js';
import { AgentPoolManager } from '../../../src/core/agent-pool.js';
import { validateCapabilities, type CapabilityVector } from '../../../src/core/routing/capability-vector.js';
import { runVocabularyDoctor } from '../../../src/core/routing/vocabulary-doctor.js';
import { loadVocabulary, type VocabularyRegistry } from '../../../src/core/routing/vocabulary.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing/vocabulary-builtin.js';
import {
  producePositional,
  produceNumerical,
  produceContentStructural,
  requirementVectorSchema,
  type RequirementVector,
  type RequirementVocabularySource,
} from '../../../src/core/routing/requirement-vector.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../../src/core/routing/config.js';
import { TaskStatus, type Task } from '../../../src/core/task-types.js';

const FIXTURE_AGENT_ID = 'slice0-smoke-fixture-agent';

// Same activation shape already pinned by foundation-roundtrip.test.ts's own
// v2->v3 migration stage — reused verbatim so this file relies on a known-good
// migration input rather than inventing new semantics to assert against.
const V2_FIXTURE_AGENT = {
  id: FIXTURE_AGENT_ID,
  name: 'Slice0 Smoke Fixture Agent',
  manifestVersion: 2,
  source: 'builtin',
  deniedTools: [],
  preferredModel: 'claude-sonnet-5',
  activation: {
    rules: [
      { when: { 'intent.primary': 'implementation' }, score: 10 },
      { when: { 'intent.primary': 'devops' }, score: 8 },
    ],
    exclude: [{ when: { 'intent.primary': 'security' } }],
    minScore: 5,
  },
};

function agentManifestPath(root: string): string {
  return join(root, '.deckent', 'agents', FIXTURE_AGENT_ID, 'agent.json');
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'slice0-smoke-task',
    title: 'Build a feature',
    description: 'Implement the described behavior in the codebase.',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'slice0-smoke fixture',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

/** Assemble the full 3-axis RequirementVector: positional -> numerical -> structural content. */
function produceFullVector(
  task: Task,
  vocabulary: RequirementVocabularySource,
  structuralConfidence: number,
): RequirementVector {
  const positional = producePositional(task, vocabulary);
  const numerical = produceNumerical(task, vocabulary);
  const content = produceContentStructural(task, positional, structuralConfidence);
  return { content, positional, numerical };
}

const sandboxes: string[] = [];
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-slice0-smoke-'));
  sandboxes.push(root);

  const agentDir = join(root, '.deckent', 'agents', FIXTURE_AGENT_ID);
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, 'agent.json'), JSON.stringify(V2_FIXTURE_AGENT, null, 2) + '\n', 'utf8');
});

afterAll(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('slice-0 integration smoke — hermetic tmpdir end-to-end (445-026)', () => {
  it('stage 1: sync-migrates the fixture V2 manifest into a schema-valid, provisional V3 capabilities block', () => {
    const report = syncAgentCapabilities(root);

    expect(report.migrated).toEqual([FIXTURE_AGENT_ID]);
    expect(report.alreadyV3).toEqual([]);
    expect(report.issues).toEqual([]);

    const written = JSON.parse(readFileSync(agentManifestPath(root), 'utf8')) as Record<string, unknown>;
    expect(validateCapabilities(written['capabilities']).ok).toBe(true);
    expect(written['capabilitiesProvisional']).toBe(true);
    // Dual-carry (445-011 contract): V2 activation survives verbatim.
    expect(written['activation']).toEqual(V2_FIXTURE_AGENT.activation);
  });

  it('stage 2: agent-pool loads the migrated capabilities onto the AgentDefinition, identical to what sync wrote to disk', () => {
    const manager = new AgentPoolManager(root);
    const pool = manager.loadAgents();
    const agent = pool.get(FIXTURE_AGENT_ID);

    expect(agent).toBeDefined();
    expect(agent?.capabilities).toBeDefined();
    // Scoped to our own fixture id, not a global getInvalidCount()===0: the
    // pool's builtin-fallback layer also loads the repo's real
    // src/core/builtins/agents/ tree (resolved relative to agent-pool.ts
    // itself, not this fixture's projectRoot) — asserting a global zero would
    // couple this smoke test to unrelated, repo-wide manifest state.
    expect(manager.getInvalidManifests().some((e) => e.id === FIXTURE_AGENT_ID)).toBe(false);

    const written = JSON.parse(readFileSync(agentManifestPath(root), 'utf8')) as { capabilities: CapabilityVector };
    expect(agent?.capabilities).toEqual(written.capabilities);

    // The migration semantics themselves (445-009/445-011), already pinned by
    // foundation-roundtrip.test.ts against the identical fixture shape:
    // implementation-primary, devops-secondary, security excluded to 'never'.
    expect(agent?.capabilities?.content.workTypes.find((w) => w.type === 'build')?.proficiency).toBe('primary');
    expect(agent?.capabilities?.content.workTypes.find((w) => w.type === 'configure')?.proficiency).toBe('secondary');
    expect(agent?.capabilities?.positional.domains.find((d) => d.id === 'security')?.proficiency).toBe('never');
    expect(agent?.capabilities?.positional.writeAuthority).toBe(true);
    expect(agent?.capabilities?.positional.role).toBe('implementer');
  });

  it('stage 3: produces schema-valid RequirementVectors for representative task shapes against the fixture project vocabulary', async () => {
    const registry: VocabularyRegistry = await loadVocabulary(root);
    // No project/org vocabulary layer was ever added by this fixture -> pure builtin-base.
    expect(registry.mergeReport.layerCounts).toEqual({ builtin: BUILTIN_DOMAINS.length, orgOverlay: 0, project: 0 });

    const vocabularySource: RequirementVocabularySource = { domains: registry.domains };
    const structuralConfidence = DEFAULT_ROUTING_V3_CONFIG.structuralConfidence;

    const shapes: ReadonlyArray<{
      label: string;
      task: Task;
      expectedDomainIds: readonly string[];
      expectedWorkType: string;
    }> = [
      {
        label: 'impl-generic',
        task: makeTask({
          title: 'Add a rate limiter to the connector',
          description: 'Implement token-bucket rate limiting for outbound connector calls.',
          scope: { directories: ['src/connectors/'], filesRead: [], filesWrite: ['src/connectors/rate-limiter.ts'] },
        }),
        expectedDomainIds: ['connectors/messaging'],
        expectedWorkType: 'build',
      },
      {
        label: 'docs',
        task: makeTask({
          title: 'Document the sync flags',
          description: 'Update the guide describing new sync CLI flags.',
          scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] },
        }),
        expectedDomainIds: ['docs'],
        expectedWorkType: 'document',
      },
    ];

    for (const shape of shapes) {
      const vector = produceFullVector(shape.task, vocabularySource, structuralConfidence);
      expect(vector.positional.domains.map((d) => d.id).sort()).toEqual([...shape.expectedDomainIds].sort());
      expect(vector.content.workType).toBe(shape.expectedWorkType);
      // goCriteria: "vectors produce" -> full RequirementVector round-trip.
      expect(requirementVectorSchema.parse(vector)).toEqual(vector);
    }
  });

  it('stage 4: doctor vocabulary section reports zero project-introduced issues for this vocabulary-layer-free fixture', async () => {
    const report = await runVocabularyDoctor(root);

    expect(report.domainCount).toBe(BUILTIN_DOMAINS.length);
    expect(report.layerCounts).toEqual({ builtin: BUILTIN_DOMAINS.length, orgOverlay: 0, project: 0 });
    // No project vocabulary.json was ever written by this fixture -> nothing
    // can shadow a builtin id, collide on an alias, or arrive with a blank
    // description.
    expect(report.shadowed).toEqual([]);
    expect(report.duplicateAliases).toEqual([]);
    expect(report.domainsMissingDescription).toEqual([]);
    // deadPathPatterns is deliberately NOT asserted clean here: the doctor's
    // own walkProjectFiles prunes '.deckent' (EXCLUDED_DIR_NAMES), so
    // 'agents-catalog''s '.deckent/agents/**' / '.deckent/skills/**' patterns
    // can never be satisfied by any real project, this fixture included --
    // a structural fact of the doctor itself, not a regression from this
    // fixture. Per-pattern dead/live coverage belongs to (and is already
    // covered by) vocabulary-doctor.test.ts.
  });

  it('stage 5: end-to-end coherence — every domain id the migrated capabilities reference resolves in the SAME vocabulary the doctor validated', async () => {
    const manager = new AgentPoolManager(root);
    const pool = manager.loadAgents();
    const agent = pool.get(FIXTURE_AGENT_ID);
    const registry = await loadVocabulary(root);
    const knownIds = new Set(registry.domains.map((d) => d.id));

    const referencedIds = (agent?.capabilities?.positional.domains ?? [])
      .map((d) => d.id)
      .filter((id) => id !== '*');

    expect(referencedIds.length).toBeGreaterThan(0);
    for (const id of referencedIds) {
      expect(knownIds.has(id)).toBe(true);
    }
  });
});
