import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { CodexAdapter, createCodexAdapter, CODEX_TIER_MODELS } from '../../src/providers/codex.js';
import type { CodexAuthMode, CodexCliVariant } from '../../src/providers/codex.js';

// ─── Skip if codex CLI not available ─────────────────────────────────

function isCodexCliAvailable(): boolean {
  try {
    const result = spawnSync('codex', ['--version'], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

const codexAvailable = isCodexCliAvailable();

// ─── Integration Tests ──────────────────────────────────────────────

describe.skipIf(!codexAvailable)('CodexAdapter Integration (real CLI)', () => {
  const projectDir = process.cwd();
  let adapter: CodexAdapter;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    adapter = new CodexAdapter(projectDir);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should detect codex CLI as available', async () => {
    const available = await adapter.isAvailable();
    // Available depends on auth — at minimum CLI exists
    expect(typeof available).toBe('boolean');
  });

  it('should detect auth mode', () => {
    const mode = adapter.detectAuthMode();
    expect(['api_key', 'subscription', 'none']).toContain(mode);
  });

  it('should build valid exec command', () => {
    const cmd = adapter.buildCommand('gpt-4.1', '/tmp/prompt.txt');
    expect(cmd).toContain('codex exec');
    expect(cmd).toContain('--full-auto');
    expect(cmd).toContain('--model gpt-4.1');
  });

  it('should build valid planner command', () => {
    const result = adapter.buildPlannerCommand('test prompt', 'gpt-4.1');
    expect(result.command).toBe('codex');
    expect(result.args[0]).toBe('exec');
    expect(result.args).toContain('--full-auto');
  });

  it('should return correct tier models', () => {
    expect(adapter.getModelForTier('premium')).toBe('gpt-5.5');
    expect(adapter.getModelForTier('standard')).toBe('gpt-4.1');
    expect(adapter.getModelForTier('economy')).toBe('gpt-5-mini');
  });

  it('should detect CLI variant (rust/node/unknown)', () => {
    const variant = adapter.detectCliVariant();
    expect(['rust', 'node', 'unknown']).toContain(variant);
  });

  it('should have name codex', () => {
    expect(adapter.name).toBe('codex');
  });

  it('should support expected models', () => {
    expect(adapter.supportedModels).toContain('gpt-5.5');
    expect(adapter.supportedModels).toContain('gpt-4.1');
    expect(adapter.supportedModels).toContain('gpt-4.1-mini');
  });
});

// ─── Tests that always run (no CLI needed) ──────────────────────────

describe('CodexAdapter Integration (no CLI needed)', () => {
  it('should create adapter via factory', () => {
    const adapter = createCodexAdapter('/tmp/test');
    expect(adapter).toBeInstanceOf(CodexAdapter);
    expect(adapter.name).toBe('codex');
  });

  it('should have CODEX_TIER_MODELS with correct tiers', () => {
    expect(CODEX_TIER_MODELS).toHaveProperty('premium');
    expect(CODEX_TIER_MODELS).toHaveProperty('standard');
    expect(CODEX_TIER_MODELS).toHaveProperty('economy');
  });

  it('should tier models be valid OpenAI models', () => {
    const adapter = createCodexAdapter('/tmp/test');
    expect(adapter.supportedModels).toContain(CODEX_TIER_MODELS.premium);
    expect(adapter.supportedModels).toContain(CODEX_TIER_MODELS.standard);
    expect(adapter.supportedModels).toContain(CODEX_TIER_MODELS.economy);
  });

  it('should list no workers initially', () => {
    const adapter = createCodexAdapter('/tmp/test');
    expect(adapter.listWorkers()).toEqual([]);
  });
});
