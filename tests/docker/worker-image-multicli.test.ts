import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const dockerfileWorkerPath = join(ROOT, 'Dockerfile.worker');

describe('Dockerfile.worker — multi-CLI build-arg support', () => {
  it('has ARG INSTALL_CODEX build-arg declaration', () => {
    const content = readFileSync(dockerfileWorkerPath, 'utf-8');
    expect(content).toMatch(/^ARG\s+INSTALL_CODEX=/m);
  });

  it('has ARG INSTALL_GEMINI build-arg declaration', () => {
    const content = readFileSync(dockerfileWorkerPath, 'utf-8');
    expect(content).toMatch(/^ARG\s+INSTALL_GEMINI=/m);
  });

  it('defaults both build-args to false (Claude-only lean image)', () => {
    const content = readFileSync(dockerfileWorkerPath, 'utf-8');
    expect(content).toMatch(/^ARG\s+INSTALL_CODEX=false/m);
    expect(content).toMatch(/^ARG\s+INSTALL_GEMINI=false/m);
  });

  it('has conditional Codex install RUN block (opt-in)', () => {
    const content = readFileSync(dockerfileWorkerPath, 'utf-8');
    expect(content).toContain('INSTALL_CODEX');
    expect(content).toMatch(/if \[ "\$INSTALL_CODEX" = "true" \]/);
  });

  it('has conditional Gemini install RUN block (opt-in)', () => {
    const content = readFileSync(dockerfileWorkerPath, 'utf-8');
    expect(content).toContain('INSTALL_GEMINI');
    expect(content).toMatch(/if \[ "\$INSTALL_GEMINI" = "true" \]/);
  });

  it('always installs Claude CLI regardless of build args', () => {
    const content = readFileSync(dockerfileWorkerPath, 'utf-8');
    const claudeInstallIdx = content.indexOf('RUN npm i -g @anthropic-ai/claude-code');
    const argCodexIdx = content.indexOf('ARG INSTALL_CODEX');
    expect(claudeInstallIdx).toBeGreaterThanOrEqual(0);
    // Claude install appears before optional ARG declarations
    expect(claudeInstallIdx).toBeLessThan(argCodexIdx);
  });

  it('Dockerfile.worker file exists', () => {
    expect(existsSync(dockerfileWorkerPath)).toBe(true);
  });
});
