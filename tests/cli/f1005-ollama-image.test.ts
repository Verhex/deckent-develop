import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../');

// ─── F1-005: ollama added to worker image ────────────────────────────────────

describe('F1-005 — ollama added to worker image', () => {
  it('assets/Dockerfile.worker exists', () => {
    const dockerfilePath = join(PROJECT_ROOT, 'assets', 'Dockerfile.worker');
    expect(existsSync(dockerfilePath)).toBe(true);
  });

  it('Dockerfile.worker contains INSTALL_OLLAMA build-arg (default-off)', () => {
    const content = readFileSync(
      join(PROJECT_ROOT, 'assets', 'Dockerfile.worker'),
      'utf-8',
    );
    expect(content).toContain('ARG INSTALL_OLLAMA=false');
  });

  it('Dockerfile.worker contains conditional ollama install line', () => {
    const content = readFileSync(
      join(PROJECT_ROOT, 'assets', 'Dockerfile.worker'),
      'utf-8',
    );
    expect(content).toMatch(/INSTALL_OLLAMA.*true.*ollama|ollama.*INSTALL_OLLAMA.*true/s);
    expect(content).toContain('INSTALL_OLLAMA');
    expect(content).toContain('ollama');
  });

  it('ollama install is gated (not unconditional)', () => {
    const content = readFileSync(
      join(PROJECT_ROOT, 'assets', 'Dockerfile.worker'),
      'utf-8',
    );
    // Must have a conditional block — not a bare RUN curl ... ollama
    expect(content).toContain('if [ "$INSTALL_OLLAMA" = "true" ]');
  });

  it('existing INSTALL_CODEX and INSTALL_GEMINI patterns still present', () => {
    const content = readFileSync(
      join(PROJECT_ROOT, 'assets', 'Dockerfile.worker'),
      'utf-8',
    );
    expect(content).toContain('ARG INSTALL_CODEX=false');
    expect(content).toContain('ARG INSTALL_GEMINI=false');
    expect(content).toContain('if [ "$INSTALL_CODEX" = "true" ]');
    expect(content).toContain('if [ "$INSTALL_GEMINI" = "true" ]');
  });

  it('Cursor support does not replace or alter the adjacent Ollama gate', () => {
    const content = readFileSync(
      join(PROJECT_ROOT, 'src/cli/commands/image.ts'),
      'utf-8',
    );
    expect(content).toContain("'INSTALL_OLLAMA=true'");
    expect(content).toContain("'INSTALL_CURSOR=true'");
  });
});

describe('CURSOR-PROVIDER-001 — Cursor added to the worker image', () => {
  const dockerfile = () => readFileSync(
    join(PROJECT_ROOT, 'assets', 'Dockerfile.worker'),
    'utf-8',
  );

  it('declares and consumes the default-off INSTALL_CURSOR build argument', () => {
    const content = dockerfile();
    expect(content).toContain('ARG INSTALL_CURSOR=false');
    expect(content).toContain('if [ "$INSTALL_CURSOR" = "true" ]');
    expect(content).toContain('https://cursor.com/install');
  });

  it('installs Cursor into a non-root-readable prefix and verifies the binary', () => {
    const content = dockerfile();
    expect(content).toContain('HOME=/opt/cursor-agent bash');
    expect(content).toContain('/usr/local/bin/cursor-agent');
    expect(content).toContain('chmod -R a+rX /opt/cursor-agent/.local');
    expect(content).toContain('cursor-agent --version');
    expect(content).not.toContain('HOME=/root');
  });
});
