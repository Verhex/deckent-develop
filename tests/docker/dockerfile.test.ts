import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const dockerfilePath = join(ROOT, 'Dockerfile');
const composePath = join(ROOT, 'docker-compose.yml');
const packageJson = JSON.parse(
  readFileSync(join(ROOT, 'package.json'), 'utf-8'),
) as {
  bin: { deckent: string };
  engines: { node: string };
};

// Helper to read file lines
function readLines(filePath: string): string[] {
  return readFileSync(filePath, 'utf-8').split('\n');
}

describe('Dockerfile', () => {
  it('Dockerfile exists', () => {
    expect(existsSync(dockerfilePath)).toBe(true);
  });

  it('uses a Node 24 slim base matching the package runtime floor', () => {
    const fromLines = readLines(dockerfilePath).filter((l) => /^FROM\s+/i.test(l.trim()));
    expect(fromLines.length).toBeGreaterThanOrEqual(1);
    const hasSlim = fromLines.some((l) => l.includes('node:24-slim'));
    expect(hasSlim).toBe(true);
    expect(packageJson.engines.node).toBe('>=24.0.0');
  });

  it('is currently a single-stage build', () => {
    const fromLines = readLines(dockerfilePath).filter((l) => /^FROM\s+/i.test(l.trim()));
    // Current Dockerfile has only one FROM (single-stage)
    expect(fromLines.length).toBe(1);
  });

  it('installs tmux and git', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    expect(content).toContain('tmux');
    expect(content).toContain('git');
  });

  it('copies the exact root manifest and canonical npm shrinkwrap', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    expect(content).toContain('COPY package.json npm-shrinkwrap.json ./');
    expect(content).not.toMatch(/COPY\s+package\*\.json/);
    expect(content).not.toMatch(/COPY[^\n]*package-lock\.json/);
  });

  it('runs npm ci for dependency installation', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    expect(content).toContain('npm ci');
  });

  it('runs npm run build for TypeScript compilation', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    expect(content).toContain('npm run build');
  });

  it('sets workspace directory', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    expect(content).toMatch(/WORKDIR\s+\/workspace/);
  });

  it('enters through the same compiled CLI declared by the npm package', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    expect(packageJson.bin.deckent).toBe('./dist/cli/entry.js');
    expect(content).toContain('ENTRYPOINT ["node", "/app/dist/cli/entry.js"]');
    expect(content).not.toContain('/app/dist/cli/index.js');
  });
});

describe('docker-compose.yml', () => {
  it('docker-compose.yml exists', () => {
    expect(existsSync(composePath)).toBe(true);
  });

  it('defines a deckent service', () => {
    const content = readFileSync(composePath, 'utf-8');
    expect(content).toContain('deckent:');
  });

  it('mounts .deckent volume', () => {
    const content = readFileSync(composePath, 'utf-8');
    expect(content).toContain('.deckent');
  });

  it('mounts .brain volume', () => {
    const content = readFileSync(composePath, 'utf-8');
    expect(content).toContain('.brain');
  });

  it('exposes port 3100', () => {
    const content = readFileSync(composePath, 'utf-8');
    expect(content).toContain('3100');
  });

  it('has healthcheck configuration', () => {
    const content = readFileSync(composePath, 'utf-8');
    expect(content).toContain('healthcheck:');
  });
});
