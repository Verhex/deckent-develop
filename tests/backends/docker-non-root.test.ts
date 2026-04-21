import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Docker Non-Root User Tests
 *
 * These tests verify that the Dockerfile is correctly configured to run
 * as a non-root user. Actual Docker build/run tests are performed in CI;
 * these unit-style tests parse the Dockerfile to verify the directives.
 *
 * God-analysis P1 finding #7: Dockerfile runs as root → FIXED in Sprint 149.
 */

const DOCKERFILE_PATH = join(process.cwd(), 'Dockerfile');

function readDockerfile(): string {
  if (!existsSync(DOCKERFILE_PATH)) {
    throw new Error(`Dockerfile not found at: ${DOCKERFILE_PATH}`);
  }
  return readFileSync(DOCKERFILE_PATH, 'utf-8');
}

describe('Dockerfile USER Non-Root (Sprint 149 Security Fix)', () => {
  it('should have USER directive switching to non-root user', () => {
    const content = readDockerfile();
    // Must have a USER directive that is not root
    const userLines = content
      .split('\n')
      .filter((line) => line.trim().startsWith('USER '));

    expect(userLines.length).toBeGreaterThanOrEqual(1);

    const hasNonRootUser = userLines.some(
      (line) => !line.includes('root') && line.trim() !== 'USER root',
    );
    expect(hasNonRootUser).toBe(true);
  });

  it('should create a dedicated deckent system user', () => {
    const content = readDockerfile();
    // groupadd and useradd must be present
    expect(content).toContain('groupadd');
    expect(content).toContain('useradd');
    expect(content).toContain('deckent');
  });

  it('should set correct file ownership with chown before USER switch', () => {
    const content = readDockerfile();
    const lines = content.split('\n');

    // chown must appear before USER deckent
    const chownLineIdx = lines.findIndex((l) => l.includes('chown') && l.includes('deckent'));
    const userLineIdx = lines.findIndex(
      (l) => l.trim() === 'USER deckent',
    );

    expect(chownLineIdx).toBeGreaterThanOrEqual(0);
    expect(userLineIdx).toBeGreaterThanOrEqual(0);
    expect(chownLineIdx).toBeLessThan(userLineIdx);
  });

  it('should create workspace directory that deckent user can write to', () => {
    const content = readDockerfile();
    // /workspace dir must be created and owned by deckent user
    expect(content).toContain('/workspace');
    // chown must include /workspace
    const chownLines = content
      .split('\n')
      .filter((l) => l.includes('chown') && l.includes('deckent:deckent'));
    const workspaceChowned = chownLines.some((l) => l.includes('/workspace'));
    expect(workspaceChowned).toBe(true);
  });
});
