// ─── Promotion Pipeline Guard Tests ─────────────────────────────────────────
// Verifies that built-in agents are skipped by promote() and demote(),
// while temp agents can be promoted successfully.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PromotionPipeline } from '../../src/orchestra/promotion-pipeline.js';

describe('PromotionPipeline guard — built-in skip', () => {
  let tmpDir: string;

  // Create a fresh temp directory for each test
  function setupTmpDir(): string {
    tmpDir = mkdtempSync(join(tmpdir(), 'promo-guard-'));
    return tmpDir;
  }

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('promote() should return false for a built-in agent', () => {
    // Arrange
    const root = setupTmpDir();
    const agentDir = join(root, '.deckent', 'agents', 'test-builtin');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, 'agent.json'),
      JSON.stringify({ id: 'test-builtin', name: 'Test Builtin', source: 'builtin', enabled: true }),
    );
    const pipeline = new PromotionPipeline(root);

    // Act
    const result = pipeline.promote('test-builtin', 'agent');

    // Assert
    expect(result).toBe(false);
  });

  it('demote() should return false for a built-in agent', () => {
    // Arrange
    const root = setupTmpDir();
    const agentDir = join(root, '.deckent', 'agents', 'test-builtin');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, 'agent.json'),
      JSON.stringify({ id: 'test-builtin', name: 'Test Builtin', source: 'builtin', enabled: true }),
    );
    const pipeline = new PromotionPipeline(root);

    // Act
    const result = pipeline.demote('test-builtin', 'agent');

    // Assert
    expect(result).toBe(false);
  });

  it('promote() should succeed for a temp agent in persistent temp pool', () => {
    // Arrange
    const root = setupTmpDir();
    const tempAgentDir = join(root, '.deckent', 'agents', 'temp-my-agent');
    mkdirSync(tempAgentDir, { recursive: true });
    writeFileSync(
      join(tempAgentDir, 'agent.json'),
      JSON.stringify({ id: 'temp-my-agent', name: 'My Temp Agent', source: 'temp', enabled: true }),
    );
    const pipeline = new PromotionPipeline(root);

    // Act
    const result = pipeline.promote('my-agent', 'agent');

    // Assert — promotion succeeded
    expect(result).toBe(true);

    // Assert — promoted agent exists at permanent location
    const permAgent = join(root, '.deckent', 'agents', 'my-agent', 'agent.json');
    expect(existsSync(permAgent)).toBe(true);
  });

  it('promote() should update source to "user" after promoting a temp agent', () => {
    // Arrange
    const root = setupTmpDir();
    const tempAgentDir = join(root, '.deckent', 'agents', 'temp-my-agent2');
    mkdirSync(tempAgentDir, { recursive: true });
    writeFileSync(
      join(tempAgentDir, 'agent.json'),
      JSON.stringify({ id: 'temp-my-agent2', name: 'My Temp Agent 2', source: 'temp', enabled: true }),
    );
    const pipeline = new PromotionPipeline(root);

    // Act
    pipeline.promote('my-agent2', 'agent');

    // Assert — promoted manifest has source: 'user'
    const permManifest = join(root, '.deckent', 'agents', 'my-agent2', 'agent.json');
    const raw = JSON.parse(readFileSync(permManifest, 'utf-8'));
    expect(raw.source).toBe('user');
    expect(raw._promotedAt).toBeDefined();
  });
});
