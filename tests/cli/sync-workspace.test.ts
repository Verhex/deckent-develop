import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncWorkspaceArtifacts } from '../../src/cli/commands/sync.js';
import { inspectManagedContractBlock } from '../../src/core/workspace-artifact-contract.js';

const roots: string[] = [];

function fakeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-sync-workspace-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({
    projectName: 'fake-typescript-project',
    language: 'en',
  }), 'utf8');
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: { build: 'tsc', test: 'vitest run' },
  }), 'utf8');
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('deckent sync managed workspace branch', () => {
  it('repairs a stale managed contract, preserves user content, and is idempotent', () => {
    const root = fakeProject();
    const initial = syncWorkspaceArtifacts(root);
    expect(initial.changed).toHaveLength(3);

    const identityPath = join(root, '.deckent', 'workspace', 'IDENTITY.md');
    expect(() => readFileSync(identityPath, 'utf8')).toThrow();
    writeFileSync(identityPath, '# Owner identity\n\n## Project Status\nDo not touch.\n', 'utf8');
    const identityBefore = readFileSync(identityPath, 'utf8');

    const toolsPath = join(root, '.deckent', 'workspace', 'TOOLS.md');
    const current = readFileSync(toolsPath, 'utf8');
    const stale = `${current.replace(/sha256="[a-f0-9]{64}"/, `sha256="${'0'.repeat(64)}"`)}\n## Owner Notes\nKeep this text.\n`;
    writeFileSync(toolsPath, stale, 'utf8');

    const repaired = syncWorkspaceArtifacts(root);
    expect(repaired.changed).toEqual(['.deckent/workspace/TOOLS.md']);
    expect(repaired.unchanged).toEqual([
      '.deckent/workspace/BOOT.md',
      '.deckent/workspace/WORKER-GUIDE.md',
    ]);

    const repairedTools = readFileSync(toolsPath, 'utf8');
    expect(inspectManagedContractBlock(repairedTools, 'tools').state).toBe('VERIFIED');
    expect(repairedTools).toContain('## Owner Notes\nKeep this text.');
    expect(repairedTools).toContain('| `build` | `tsc` |');
    expect(readFileSync(identityPath, 'utf8')).toBe(identityBefore);

    const second = syncWorkspaceArtifacts(root);
    expect(second.changed).toEqual([]);
    expect(second.unchanged).toHaveLength(3);
    expect(readFileSync(toolsPath, 'utf8')).toBe(repairedTools);
    expect(readFileSync(identityPath, 'utf8')).toBe(identityBefore);
  });

  it('reports dry-run changes without changing workspace bytes', () => {
    const root = fakeProject();
    syncWorkspaceArtifacts(root);
    const toolsPath = join(root, '.deckent', 'workspace', 'TOOLS.md');
    const stale = readFileSync(toolsPath, 'utf8').replace(
      /sha256="[a-f0-9]{64}"/,
      `sha256="${'0'.repeat(64)}"`,
    );
    writeFileSync(toolsPath, stale, 'utf8');

    const report = syncWorkspaceArtifacts(root, true);

    expect(report.changed).toEqual(['.deckent/workspace/TOOLS.md']);
    expect(readFileSync(toolsPath, 'utf8')).toBe(stale);
  });
});
