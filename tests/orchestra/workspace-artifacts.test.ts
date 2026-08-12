import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MCP_TOOL_COUNT } from '../../src/mcp/tools/tool-catalog.js';
import { COMMAND_REGISTRY } from '../../src/cli/command-registry.js';
import {
  initializeWorkspaceArtifacts,
  inspectWorkerGuideContract,
  WorkspaceArtifactAuthorityError,
} from '../../src/orchestra/workspace-artifacts.js';

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-workspace-artifacts-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'fixture',
    scripts: { test: 'vitest run', build: 'tsc' },
  }));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('initializeWorkspaceArtifacts', () => {
  it('creates the complete versioned workspace from canonical catalogs', () => {
    const root = fixture();
    const result = initializeWorkspaceArtifacts({
      projectRoot: root,
      projectName: 'fixture',
      language: 'en',
      stack: { language: 'typescript', framework: 'node', testFramework: 'vitest', buildTool: 'tsc' },
    });
    expect(result.actions).toHaveLength(5);
    expect(result.actions.every((action) => action.action === 'created')).toBe(true);

    const tools = readFileSync(join(root, '.deckent/workspace/TOOLS.md'), 'utf8');
    const boot = readFileSync(join(root, '.deckent/workspace/BOOT.md'), 'utf8');
    const guide = readFileSync(join(root, '.deckent/workspace/WORKER-GUIDE.md'), 'utf8');
    const identity = readFileSync(join(root, '.deckent/workspace/IDENTITY.md'), 'utf8');

    expect((tools.match(/^\| `deckent_/gm) ?? [])).toHaveLength(MCP_TOOL_COUNT);
    expect(tools).toContain('`deckent_analyze_project`');
    expect(tools).not.toContain('`deckent_analyze` |');
    expect(tools).not.toContain('deckent init-steps');
    expect((tools.match(/^\| `deckent [^`]+`/gm) ?? [])).toHaveLength(
      COMMAND_REGISTRY.filter((entry) => entry.surfaces.includes('cli')).length,
    );
    expect(tools).toContain('`test` | `vitest run`');

    expect(boot).toContain('deckent recover <sprint-id> --dry-run');
    expect(boot).toContain('deckent_run` accepts `{ description }`');
    expect(boot).not.toContain('deckent kill --all');
    expect(boot).not.toContain('{ taskId:');

    expect(guide).toContain('Canonical schema-required fields (derived at runtime)');
    expect(guide).not.toContain('tokenUsage.provider');
    expect(guide).not.toMatch(/≥80|50–79|<50/);
    expect(inspectWorkerGuideContract(root).state).toBe('VERIFIED');

    expect(identity).toContain('Language Authority: detected');
    expect(identity).toContain('Platform: runtime-resolved');
    expect(identity).not.toMatch(/^Platform: (Linux|Windows|macOS)$/m);

    const repeated = initializeWorkspaceArtifacts({
      projectRoot: root,
      projectName: 'fixture',
      language: 'en',
      stack: { language: 'typescript', framework: 'node', testFramework: 'vitest', buildTool: 'tsc' },
    });
    expect(repeated.actions.every((action) => action.action === 'unchanged')).toBe(true);
  });

  it('preserves user sections, migrates known generated sections, and is idempotent', () => {
    const root = fixture();
    mkdirSync(join(root, '.deckent/workspace'), { recursive: true });
    writeFileSync(join(root, '.deckent/workspace/IDENTITY.md'), '# Project Identity\nName: user-owned\nCustom: keep-me\n');
    writeFileSync(join(root, '.deckent/workspace/TOOLS.md'), '# Environment Tools\nCustom command: keep-me\n\n## MCP Tools\nstale\n\n## CLI Commands\nstale\n');
    writeFileSync(join(root, '.deckent/workspace/BOOT.md'), '# Boot Sequence\nstale\n\n## Owner Notes\nkeep-me\n\n## Manual Recovery Chain\nstale\n');
    writeFileSync(join(root, '.deckent/workspace/WORKER-GUIDE.md'), '# Worker Guide\n\n> **Canonical location moved.** See [docs/guide/workers.md](../../docs/guide/workers.md) for the complete worker guide.\n> **Fallback:** if that target is archived or removed (docs-reset, 2026-08-03), THIS file is the\n> canonical worker guide — do not follow a dangling pointer.\n\n## Anti-Patterns\nstale generated body\n\n## Owner Notes\nkeep-me\n');
    writeFileSync(join(root, '.deckent/workspace/stats-snapshot.json'), '{"sprint":42}\n');

    const input = { projectRoot: root, projectName: 'fixture', language: 'en', stack: { language: 'typescript' } };
    initializeWorkspaceArtifacts(input);
    const first = new Map(['IDENTITY.md', 'TOOLS.md', 'BOOT.md', 'WORKER-GUIDE.md', 'stats-snapshot.json'].map((name) => [name, readFileSync(join(root, '.deckent/workspace', name), 'utf8')]));
    const second = initializeWorkspaceArtifacts(input);

    expect(first.get('IDENTITY.md')).toContain('Custom: keep-me');
    expect(first.get('TOOLS.md')).toContain('Custom command: keep-me');
    expect(first.get('BOOT.md')).toContain('## Owner Notes\nkeep-me');
    expect(first.get('WORKER-GUIDE.md')).toContain('## Owner Notes\nkeep-me');
    expect(first.get('WORKER-GUIDE.md')).not.toContain('docs/guide/workers.md');
    expect(first.get('stats-snapshot.json')).toBe('{"sprint":42}\n');
    expect(second.actions.every((action) => action.action === 'unchanged')).toBe(true);
  });

  it('returns HOLD when the managed worker contract is modified out of band', () => {
    const root = fixture();
    initializeWorkspaceArtifacts({ projectRoot: root, projectName: 'fixture', language: 'en' });
    const guidePath = join(root, '.deckent/workspace/WORKER-GUIDE.md');
    writeFileSync(guidePath, readFileSync(guidePath, 'utf8').replace('Result ingress', 'Changed ingress'));
    expect(inspectWorkerGuideContract(root)).toEqual({ state: 'HOLD', reason: 'digest-mismatch' });
  });

  it('fails closed before mutation when an artifact was written by a newer schema', () => {
    const root = fixture();
    mkdirSync(join(root, '.deckent/workspace'), { recursive: true });
    const identity = '<!-- DECKENT:WORKSPACE id="identity" schema="2" authority="user" provenance="future" -->\n# Future\n';
    const identityPath = join(root, '.deckent/workspace/IDENTITY.md');
    writeFileSync(identityPath, identity);

    expect(() => initializeWorkspaceArtifacts({
      projectRoot: root,
      projectName: 'fixture',
      language: 'en',
    })).toThrowError(expect.objectContaining<Partial<WorkspaceArtifactAuthorityError>>({
      code: 'E_WORKSPACE_SCHEMA_AHEAD',
      artifactId: 'identity',
    }));
    expect(readFileSync(identityPath, 'utf8')).toBe(identity);
    expect(() => readFileSync(join(root, '.deckent/workspace/TOOLS.md'), 'utf8')).toThrow();
  });

  it('rejects a symlinked workspace before it can write outside the project', () => {
    const root = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'deckent-workspace-outside-'));
    roots.push(outside);
    mkdirSync(join(root, '.deckent'), { recursive: true });
    symlinkSync(outside, join(root, '.deckent/workspace'), process.platform === 'win32' ? 'junction' : 'dir');

    expect(() => initializeWorkspaceArtifacts({
      projectRoot: root,
      projectName: 'fixture',
      language: 'en',
    })).toThrowError(expect.objectContaining<Partial<WorkspaceArtifactAuthorityError>>({
      code: 'E_WORKSPACE_PATH_AUTHORITY',
      artifactId: 'identity',
    }));
    expect(() => readFileSync(join(outside, 'IDENTITY.md'), 'utf8')).toThrow();
  });
});
