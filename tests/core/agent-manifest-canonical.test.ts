import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { modelRegistry } from '../../src/core/model-registry.js';

const BUILTIN_AGENTS_DIR = new URL('../../src/core/builtins/agents/', import.meta.url);
const PROJECT_AGENTS_DIR = new URL('../../.deckent/agents/', import.meta.url);

interface AgentManifestModelShape {
  id: string;
  preferredModel: string;
  capabilities?: { numerical?: { preferredModel?: string } };
}

function readManifests(root: URL): AgentManifestModelShape[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .flatMap((entry) => {
      try {
        return [JSON.parse(readFileSync(new URL(`${entry.name}/agent.json`, root), 'utf8')) as AgentManifestModelShape];
      } catch {
        return [];
      }
    });
}

function expectCanonicalModels(manifest: AgentManifestModelShape): void {
  for (const modelId of [manifest.preferredModel, manifest.capabilities?.numerical?.preferredModel]) {
    if (!modelId) continue;
    const model = modelRegistry.get(modelId);
    expect(model, `${manifest.id}:${modelId}`).toBeDefined();
    expect(model?.id, `${manifest.id}:${modelId}`).toBe(model?.apiId);
  }
}

describe('canonical built-in agent manifests', () => {
  it('keeps every source built-in pool-visible with exact registered API model IDs', () => {
    const manifests = readManifests(BUILTIN_AGENTS_DIR);

    expect(manifests).toHaveLength(22);
    for (const manifest of manifests) {
      expectCanonicalModels(manifest);
      expect(AgentPoolManager.validateAgentDefinition(manifest).valid, manifest.id).toBe(true);
    }

    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-agent-canonical-'));
    try {
      mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
      writeFileSync(join(projectRoot, '.deckent', 'config.json'), '{}\n', 'utf8');
      const pool = new AgentPoolManager(projectRoot).loadAgents();
      expect([...pool.values()].filter((agent) => agent.source === 'builtin')).toHaveLength(22);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('keeps the project mirror model-identical to builtins, including nested routing models', () => {
    const builtins = new Map(readManifests(BUILTIN_AGENTS_DIR).map(manifest => [manifest.id, manifest]));
    const project = readManifests(PROJECT_AGENTS_DIR).filter(manifest => builtins.has(manifest.id));
    expect(project).toHaveLength(22);
    for (const manifest of project) {
      expectCanonicalModels(manifest);
      const builtin = builtins.get(manifest.id);
      expect(builtin, manifest.id).toBeDefined();
      expect(manifest.preferredModel, manifest.id).toBe(builtin?.preferredModel);
      expect(manifest.capabilities?.numerical?.preferredModel, manifest.id)
        .toBe(builtin?.capabilities?.numerical?.preferredModel);
    }
  });
});
