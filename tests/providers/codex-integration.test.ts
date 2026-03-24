import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { CodexAdapter } from '../../src/providers/codex.js';

// ─── Detect real Codex CLI availability ──────────────────────────────

const hasCodex = (() => {
  try {
    return spawnSync('codex', ['--version'], { encoding: 'utf-8', timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
})();

const hasApiKey = !!(process.env['OPENAI_API_KEY'] ?? process.env['DECKENT_OPENAI_API_KEY']);

// ─── Integration tests (require real Codex CLI) ─────────────────────

describe.skipIf(!hasCodex)('Codex CLI integration', () => {
  it('codex --version returns exit code 0', () => {
    const result = spawnSync('codex', ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(result.status).toBe(0);
  });

  it('codex --version outputs a version string', () => {
    const result = spawnSync('codex', ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(result.stdout.trim()).toMatch(/\d+\.\d+/);
  });

  it('codex --help includes exec subcommand', () => {
    const result = spawnSync('codex', ['--help'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('exec');
  });

  it('codex exec --help mentions --full-auto', () => {
    const result = spawnSync('codex', ['exec', '--help'], {
      encoding: 'utf-8',
      timeout: 10_000,
    });
    // Either in stdout or stderr, the help text should mention full-auto
    const combined = (result.stdout ?? '') + (result.stderr ?? '');
    expect(combined).toContain('full-auto');
  });

  it('CodexAdapter.isAvailable() reflects real environment', async () => {
    const adapter = new CodexAdapter('/tmp/test-codex-integration');
    const available = await adapter.isAvailable();
    // Codex CLI is installed (hasCodex is true), availability depends on API key
    expect(available).toBe(hasApiKey);
  });
});

// ─── Offline unit checks (always run) ───────────────────────────────

describe('Codex adapter arg format', () => {
  it('buildCommand produces codex exec --full-auto format', () => {
    const adapter = new CodexAdapter('/tmp/test');
    const cmd = adapter.buildCommand('gpt-4.1', '/tmp/prompt.txt');
    expect(cmd).toMatch(/^codex exec --full-auto .+ --model gpt-4\.1$/);
  });

  it('buildPlannerCommand produces correct structure', () => {
    const adapter = new CodexAdapter('/tmp/test');
    const result = adapter.buildPlannerCommand('plan prompt', 'o3');
    expect(result.command).toBe('codex');
    expect(result.args[0]).toBe('exec');
    expect(result.args[1]).toBe('--full-auto');
    expect(result.args[2]).toBe('plan prompt');
    expect(result.args[3]).toBe('--model');
    expect(result.args[4]).toBe('o3');
  });

  it('buildPlannerCommand args length is exactly 5', () => {
    const adapter = new CodexAdapter('/tmp/test');
    const result = adapter.buildPlannerCommand('test', 'gpt-4.1');
    expect(result.args).toHaveLength(5);
  });

  it('buildCommand does not include --quiet', () => {
    const adapter = new CodexAdapter('/tmp/test');
    const cmd = adapter.buildCommand('gpt-4.1', '/tmp/p.txt');
    expect(cmd).not.toContain('--quiet');
  });

  it('buildCommand does not include stdin redirect', () => {
    const adapter = new CodexAdapter('/tmp/test');
    const cmd = adapter.buildCommand('gpt-4.1', '/tmp/p.txt');
    expect(cmd).not.toMatch(/ < /);
  });
});
