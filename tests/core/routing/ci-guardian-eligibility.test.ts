import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { CapabilityVector } from '../../../src/core/routing/capability-vector.js';
import type { RequirementVector } from '../../../src/core/routing/requirement-vector.js';
import type { RouteCatalog, RoutableTask } from '../../../src/core/routing/route-task-v3.js';
import { routeTaskV3 } from '../../../src/core/routing/route-task-v3.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../../src/core/routing/config.js';
import { eliminate, type AgentCandidate } from '../../../src/core/routing/stage-eliminate.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing/vocabulary-builtin.js';

interface CiGuardianManifest {
  readonly id: string;
  readonly capabilities: CapabilityVector;
}

const BUILTIN_MANIFEST_PATH = 'src/core/builtins/agents/ci-guardian/agent.json';
const WORKSPACE_MANIFEST_PATH = '.deckent/agents/ci-guardian/agent.json';

function readManifest(path: string): CiGuardianManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as CiGuardianManifest;
}

function requirement(workType: 'build' | 'fix'): RequirementVector {
  return {
    content: {
      workType,
      subtype: null,
      summary: null,
      semanticTags: null,
      provenance: 'structural',
      calibratedConfidence: 1,
    },
    positional: {
      domains: [{ id: 'test/quality', weight: 1, evidence: 'synthetic-test-task' }],
      deliverables: [{ type: 'code-test', ratio: 1 }],
      surfaces: [],
      needsWrite: true,
      language: 'en',
    },
    numerical: {
      estimatedSize: 'small',
      fileCount: 1,
      moduleCount: 1,
      effortClass: 'normal',
      riskClass: 'low',
    },
  };
}

const TASK: RoutableTask = {
  title: 'Repair the CI test harness',
  description: 'Fix and build test-quality infrastructure.',
  scope: {
    directories: ['tests/'],
    filesRead: [],
    filesWrite: ['tests/ci-harness.test.ts'],
  },
};

describe('ci-guardian routing eligibility', () => {
  it('survives stage 1 and appears in ranked results for test/quality fix and build work', async () => {
    const manifest = readManifest(BUILTIN_MANIFEST_PATH);
    const candidate: AgentCandidate = {
      agentId: manifest.id,
      capabilities: manifest.capabilities,
      source: 'builtin',
    };
    const catalog: RouteCatalog = {
      agents: [candidate],
      skills: [],
      vocabulary: {
        domains: BUILTIN_DOMAINS,
        knownDomainIds: new Set(BUILTIN_DOMAINS.map((domain) => domain.id)),
      },
    };

    for (const workType of ['fix', 'build'] as const) {
      const syntheticRequirement = requirement(workType);

      expect(eliminate(syntheticRequirement, [candidate]).survivors).toEqual([candidate]);

      const decision = await routeTaskV3(TASK, catalog, {
        config: { ...DEFAULT_ROUTING_V3_CONFIG, enabled: true },
        requirement: syntheticRequirement,
      });
      expect(decision.ranked.map((entry) => entry.agentId)).toContain('ci-guardian');
    }
  });

  it('keeps review primary while synchronizing both manifest copies byte-for-byte', () => {
    const builtinBytes = readFileSync(BUILTIN_MANIFEST_PATH, 'utf8');
    const workspaceBytes = readFileSync(WORKSPACE_MANIFEST_PATH, 'utf8');
    const manifest = JSON.parse(builtinBytes) as CiGuardianManifest;

    expect(workspaceBytes).toBe(builtinBytes);
    expect(manifest.capabilities.content.workTypes).toContainEqual({
      type: 'review',
      proficiency: 'primary',
    });
    expect(manifest.capabilities.positional.role).toBe('reviewer');
  });
});
