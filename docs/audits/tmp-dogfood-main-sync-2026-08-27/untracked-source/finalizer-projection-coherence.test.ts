import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import {
  assertManagedProjectionCoherence,
  ProjectionIntegrityHoldError,
  runPostFinalizeHooks,
} from '../../src/core/identity-generator.js';

function checkout(): { root: string; source: string; runtime: string } {
  const root = mkdtempSync(join(tmpdir(), 'deckent-coherence-'));
  const source = join(root, 'src', 'core', 'generator.ts');
  const runtime = join(root, 'dist', 'core', 'generator.js');
  mkdirSync(join(root, 'src', 'core'), { recursive: true });
  mkdirSync(join(root, 'dist', 'core'), { recursive: true });
  writeFileSync(source, 'source');
  writeFileSync(runtime, 'runtime');
  writeFileSync(join(root, 'dist', 'build-identity.json'), JSON.stringify({
    schemaVersion: 2,
    packageName: 'deckent',
    packageVersion: 'test',
    sourceRootSha256: createHash('sha256').update(root).digest('hex'),
    sourceTreeSha256: 'c'.repeat(64),
    sourceTreeFileCount: 1,
  }));
  return { root, source, runtime };
}

describe('post-finalization projection coherence', () => {
  it('does not penalize an installed consumer project without Deckent source', () => {
    const fixture = checkout();
    const consumer = mkdtempSync(join(tmpdir(), 'deckent-consumer-'));
    expect(() => assertManagedProjectionCoherence({
      projectRoot: consumer,
      runtimeModuleUrl: pathToFileURL(fixture.runtime).href,
      projection: 'host-rules',
      generatorPairs: [{ canonicalSource: 'missing', runtimeFile: fixture.runtime }],
    })).not.toThrow();
  });

  it('narrows ordinary source changes to affected generator files', () => {
    const fixture = checkout();
    writeFileSync(join(fixture.root, 'src', 'core', 'unrelated.ts'), 'changed');
    expect(() => assertManagedProjectionCoherence({
      projectRoot: fixture.root,
      runtimeModuleUrl: pathToFileURL(fixture.runtime).href,
      projection: 'host-rules',
      generatorPairs: [{ canonicalSource: fixture.source, runtimeFile: fixture.runtime }],
    })).not.toThrow();
  });

  it('carries the typed integrity HOLD through the post-finalize hook result', async () => {
    const hold = new ProjectionIntegrityHoldError('runtime-generator-older', 'host-rules');
    const result = await runPostFinalizeHooks({
      projectRoot: mkdtempSync(join(tmpdir(), 'deckent-hook-')),
      sprintId: 'sprint-test',
      metrics: {
        sprintId: 'sprint-test', totalTasks: 1, completedTasks: 1,
        techDebtTasks: 0, noGoTasks: 0, coveragePercent: 100, durationMs: 1,
      },
      skipMemoryExport: true,
      skipAdrInsert: true,
      onRuleRegen: () => { throw hold; },
    });
    expect(result.integrityHold).toBe(hold);
    expect(result.ruleRegenCalled).toBe(false);
  });
});
