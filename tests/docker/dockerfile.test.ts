import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const dockerfilePath = join(ROOT, 'Dockerfile');
const composePath = join(ROOT, 'docker-compose.yml');

// Helper to read file lines
function readLines(filePath: string): string[] {
  return readFileSync(filePath, 'utf-8').split('\n');
}

describe('Dockerfile', () => {
  it('Dockerfile exists', () => {
    expect(existsSync(dockerfilePath)).toBe(true);
  });

  it('uses node:22-slim as base image', () => {
    const fromLines = readLines(dockerfilePath).filter((l) => /^FROM\s+/i.test(l.trim()));
    expect(fromLines.length).toBeGreaterThanOrEqual(1);
    const hasSlim = fromLines.some((l) => l.includes('node:22-slim'));
    expect(hasSlim).toBe(true);
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

  it('copies package files', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    expect(content).toMatch(/COPY\s+package\*\.json/);
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

  it('has an ENTRYPOINT directive', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    expect(content).toMatch(/^ENTRYPOINT\s+/m);
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
