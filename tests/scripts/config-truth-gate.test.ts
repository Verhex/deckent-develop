import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  analyzeConfigTruth,
  collectDefaultLeaves,
  collectMetadataDefaults,
  collectRuntimeLeaves,
} from '../../scripts/lint-config-truth.mjs';

const types = `
interface NestedConfig { enabled: boolean; timeout: number; }
export interface DeckentConfig { backend: string; nested: NestedConfig; }
`;

const loader = `
const DEFAULT_NESTED = { enabled: true, timeout: 30 };
export function createDefaultConfig() { return { backend: 'auto', nested: structuredClone(DEFAULT_NESTED) }; }
export async function loadConfig() { const config = createDefaultConfig(); const resolved = { backend: config.backend, nested: config.nested }; return resolved; }
export const CONFIG_METADATA = {
  backend: { default: 'auto' },
  nested: { default: undefined },
};
`;

function runCli(args: string[]): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [join(process.cwd(), 'scripts/lint-config-truth.mjs'), ...args], { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error && typeof (error as NodeJS.ErrnoException & { code?: unknown }).code !== 'number') return reject(error);
      resolve({ status: (error as NodeJS.ErrnoException & { code?: number } | null)?.code ?? 0, stdout, stderr });
    });
  });
}

describe('lint-config-truth', () => {
  it('accepts matching typed metadata, canonical defaults, and loader output', () => {
    const result = analyzeConfigTruth(types, loader);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect([...collectDefaultLeaves(loader)]).toEqual([
      ['backend', "'auto'"],
      ['nested.enabled', 'true'],
      ['nested.timeout', '30'],
    ]);
    expect([...collectRuntimeLeaves(loader, result.defaults)]).toEqual([
      ['backend', "'auto'"],
      ['nested.enabled', 'true'],
      ['nested.timeout', '30'],
    ]);
    expect([...collectMetadataDefaults(loader)]).toEqual([
      ['backend', "'auto'"],
      ['nested', 'undefined'],
    ]);
  });

  it('reports typed missing metadata, missing defaults, runtime omissions, and divergences', () => {
    const divergentLoader = `
      export function createDefaultConfig() { return { backend: 'auto', rogue: true }; }
      export async function loadConfig() { const config = createDefaultConfig(); const resolved = { backend: 'docker' }; return resolved; }
      export const CONFIG_METADATA = { backend: { default: 'docker' } };
    `;
    const divergentTypes = `export interface DeckentConfig { backend: string; requiredButUnset: boolean; }`;
    const result = analyzeConfigTruth(divergentTypes, divergentLoader);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'DIVERGENT', path: 'backend' }),
      expect.objectContaining({ kind: 'MISSING_METADATA', path: 'rogue' }),
      expect.objectContaining({ kind: 'MISSING_RUNTIME', path: 'rogue' }),
      expect.objectContaining({ kind: 'MISSING_DEFAULT', path: 'requiredButUnset' }),
    ]));
  });

  it('fails closed when runtime or manifest leaves have no canonical default producer', () => {
    const incompleteLoader = `
      export function createDefaultConfig() { return { backend: 'auto' }; }
      export async function loadConfig() { const config = createDefaultConfig(); const resolved = { backend: config.backend, runtimeOnly: true }; return resolved; }
      export const CONFIG_METADATA = { backend: { default: 'docker' }, manifestOnly: { default: false } };
    `;
    const result = analyzeConfigTruth(`export interface DeckentConfig { backend: string; }`, incompleteLoader);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'MISSING_METADATA', path: 'runtimeOnly' }),
      expect.objectContaining({ kind: 'MISSING_DEFAULT', path: 'runtimeOnly' }),
      expect.objectContaining({ kind: 'MISSING_METADATA', path: 'manifestOnly' }),
      expect.objectContaining({ kind: 'DIVERGENT', path: 'backend' }),
    ]));
  });

  describe('CLI', () => {
    let root: string;
    afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

    it('drives the real repository and reports its observed truth without weakening the gate', async () => {
      const result = await runCli([]);
      expect([0, 1]).toContain(result.status);
      expect(result.stdout).toContain('[lint-config-truth] metadata-leaves=');
      if (result.status === 0) expect(result.stdout).toContain('PASS:');
      else expect(result.stderr).toMatch(/(?:MISSING_|DIVERGENT|FAIL:)/);
    });

    it('fails closed through the CLI on fixture divergence', async () => {
      root = mkdtempSync(join(tmpdir(), 'config-truth-'));
      const typesPath = join(root, 'types.ts');
      const loaderPath = join(root, 'loader.ts');
      writeFileSync(typesPath, types, 'utf8');
      writeFileSync(loaderPath, loader.replace('backend: config.backend', "backend: 'docker'"), 'utf8');
      const result = await runCli(['--types', typesPath, '--loader', loaderPath]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('DIVERGENT: backend');
    });
  });
});
