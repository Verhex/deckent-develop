import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..', '..');
const dockerfileWorkerPath = join(ROOT, 'Dockerfile.worker');

function dockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function workerImageExists(): boolean {
  try {
    execSync('docker image inspect deckent-worker:test', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

describe('Dockerfile.worker — provider CLI readiness (static analysis)', () => {
  it('Dockerfile.worker exists', () => {
    expect(existsSync(dockerfileWorkerPath)).toBe(true);
  });

  it('Dockerfile.worker has commented Codex install line (opt-in pattern)', () => {
    const content = readFileSync(dockerfileWorkerPath, 'utf-8');
    expect(content).toMatch(/#\s*RUN npm i -g @openai\/codex/);
  });

  it('Dockerfile.worker has commented Gemini install line (opt-in pattern)', () => {
    const content = readFileSync(dockerfileWorkerPath, 'utf-8');
    expect(content).toMatch(/#\s*RUN npm i -g @google\/gemini-cli/);
  });

  it('Dockerfile.worker has Claude CLI install (always present)', () => {
    const content = readFileSync(dockerfileWorkerPath, 'utf-8');
    expect(content).toContain('npm i -g @anthropic-ai/claude-code');
  });

  it('Dockerfile.worker HEALTHCHECK references claude --version', () => {
    const content = readFileSync(dockerfileWorkerPath, 'utf-8');
    expect(content).toContain('claude --version');
  });
});

describe('Dockerfile.worker — provider CLI runtime (requires docker + deckent-worker:test image)', () => {
  it.skipIf(!dockerAvailable() || !workerImageExists())(
    'claude --version exits 0 in worker container',
    () => {
      const result = execSync(
        'docker run --rm deckent-worker:test claude --version',
        { timeout: 30000 },
      );
      expect(result.toString()).toMatch(/claude/i);
    },
  );

  it.skipIf(!dockerAvailable() || !workerImageExists())(
    'codex --version exits 0 in worker container (requires uncommented Dockerfile line)',
    () => {
      const result = execSync(
        'docker run --rm deckent-worker:test codex --version',
        { timeout: 30000 },
      );
      expect(result.toString()).toMatch(/codex|openai/i);
    },
  );

  it.skipIf(!dockerAvailable() || !workerImageExists())(
    'gemini --version exits 0 in worker container (requires uncommented Dockerfile line)',
    () => {
      const result = execSync(
        'docker run --rm deckent-worker:test gemini --version',
        { timeout: 30000 },
      );
      expect(result.toString()).toMatch(/gemini|google/i);
    },
  );
});
