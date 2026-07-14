// Sprint 444 (444-007) — "F3" era integration gate.
//
// Unlike routing-impl-builtin.test.ts (hermetic hand-typed `makeAgent` mirrors
// of the on-disk activation rules), this suite reads the REAL builtin
// manifests straight off disk — `src/core/builtins/agents/{implementer,
// refactorer, devops-engineer}/agent.json` (+ implementer's PROMPT.md) — and
// proves the era end-to-end against that real content:
//
//   1. implementation-intent task -> implementer (via routeTaskV2)
//   2. refactor-intent task       -> refactorer (refactor-only post-444-002)
//   3. devops-intent task         -> devops-engineer, NOT implementer
//      (the new implementation@7 floor is not a magnet for domain tasks)
//   4. implementer/PROMPT.md parses with >=2 guidance sections incl. 'default'
//
// Deliberately does NOT go through AgentPoolManager.loadAgents(): that reads
// the project's .deckent/agents/* shadow copies, which are stale for this era
// (see the header notes in routing-live-diversity.test.ts /
// routing-diversity-guard.test.ts — the shadow still carries refactorer's
// retired implementation@7 rule and has no materialized `implementer/` entry
// at all). Reading src/core/builtins/agents/*/agent.json directly is the
// actual "real disk manifest" this era's target state lives in, and keeps the
// suite hermetic (read-only on src/core/builtins/agents; no writes).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { routeTaskV2 } from '../../src/core/routing-engine.js';
import { parseGuidanceSections } from '../../src/core/persona-guidance.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUILTINS_DIR = join(__dirname, '..', '..', 'src', 'core', 'builtins', 'agents');

function readBuiltinAgent(id: string): AgentDefinition {
  const raw = readFileSync(join(BUILTINS_DIR, id, 'agent.json'), 'utf8');
  return JSON.parse(raw) as AgentDefinition;
}

function readBuiltinPrompt(id: string): string {
  return readFileSync(join(BUILTINS_DIR, id, 'PROMPT.md'), 'utf8');
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map((a) => [a.id, a]));
}

describe('sprint-444 (444-007) implementer-era integration — real disk manifests', () => {
  const implementer = readBuiltinAgent('implementer');
  const refactorer = readBuiltinAgent('refactorer');
  const devopsEngineer = readBuiltinAgent('devops-engineer');

  // Sanity: prove these ARE the real on-disk 444-001/444-002 manifests, not
  // some other fixture accidentally shadowing the read.
  it('sanity: real manifests reflect the 444-001/444-002 era shape', () => {
    expect(implementer.source).toBe('builtin');
    expect(implementer.activation?.rules).toEqual([
      { when: { 'intent.primary': 'implementation' }, score: 7 },
    ]);

    expect(refactorer.source).toBe('builtin');
    expect(refactorer.activation?.rules).toEqual([
      { when: { 'intent.primary': 'refactor' }, score: 10 },
    ]);
  });

  it('1. implementation-intent task routes to implementer (real manifests)', () => {
    const decision = routeTaskV2(
      {
        title: 'Implement config validator module',
        description:
          'Create a new validator function in src/core to check config values. ' +
          'Add a small module with explicit error types.',
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: ['src/core/config-validator.ts'],
        },
      },
      makePool(implementer, refactorer),
      new Map(),
    );

    expect(
      decision.agentId,
      `routing trace:\n${decision.reasoning.join('\n')}`,
    ).toBe('implementer');
    expect(decision.taskDNA.intent.primary).toBe('implementation');
    expect(decision.agentScore).toBeGreaterThanOrEqual(7);
  });

  it('2. refactor-intent task still routes to refactorer (refactor-only post-444-002)', () => {
    const decision = routeTaskV2(
      {
        title: 'Refactor config validator module',
        description:
          'Extract the validation logic in src/core/config.ts into a dedicated ' +
          'module. Rename unclear variables and simplify the conditional checks. ' +
          'No behavior change.',
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: ['src/core/config.ts'],
        },
      },
      makePool(implementer, refactorer),
      new Map(),
    );

    expect(
      decision.agentId,
      `routing trace:\n${decision.reasoning.join('\n')}`,
    ).toBe('refactorer');
    expect(decision.taskDNA.intent.primary).toBe('refactor');
    expect(decision.agentScore).toBeGreaterThanOrEqual(10);
  });

  it('3. devops-intent task still routes to devops-engineer — the implementation@7 floor is not a magnet', () => {
    const decision = routeTaskV2(
      {
        title: 'Optimize Docker build pipeline',
        description:
          'Optimize the Docker build pipeline by adding layer caching and ' +
          'reducing image size for deployment.',
        scope: {
          directories: ['docker/', '.github/workflows/'],
          filesRead: [],
          filesWrite: ['docker/Dockerfile'],
        },
      },
      makePool(implementer, refactorer, devopsEngineer),
      new Map(),
    );

    expect(
      decision.agentId,
      `routing trace:\n${decision.reasoning.join('\n')}`,
    ).toBe('devops-engineer');
    expect(decision.taskDNA.intent.primary).toBe('devops');
    expect(decision.agentId).not.toBe('implementer');
  });

  it("4. implementer's PROMPT.md parses with >=2 guidance sections including 'default'", () => {
    const promptMd = readBuiltinPrompt('implementer');
    const { sections, issues } = parseGuidanceSections(promptMd);

    expect(issues).toEqual([]);
    expect(sections.has('default')).toBe(true);
    expect(sections.size).toBeGreaterThanOrEqual(2);
    // Real content sanity — not just empty-string captures.
    expect(sections.get('default')!.length).toBeGreaterThan(0);
  });
});
