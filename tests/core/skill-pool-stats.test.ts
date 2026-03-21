import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillPoolManager } from '../../src/core/skill-pool.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `skill-pool-stats-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeSkillDef(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: 'test-skill',
    name: 'Test Skill',
    version: '1.0.0',
    description: 'A test skill',
    entrypoint: 'SKILL.md',
    category: 'tool',
    triggers: ['test'],
    stackDetection: { files: [], dependencies: [], commands: [] },
    composableWith: [],
    priority: 0,
    promptInjection: { position: 'append', maxTokens: 1500 },
    enabled: true,
    stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SkillPoolManager — updateSkillStats', () => {
  let tempDir: string;
  let manager: SkillPoolManager;

  beforeEach(() => {
    tempDir = makeTempDir();
    manager = new SkillPoolManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('increments totalUses by 1 on each call', () => {
    const skill = makeSkillDef({ id: 'counter-skill' });
    manager.saveSkill(skill);

    manager.updateSkillStats('counter-skill', 'DONE', 80, 'sprint-001');
    let updated = manager.getSkill('counter-skill');
    expect(updated?.stats.totalUses).toBe(1);

    manager.updateSkillStats('counter-skill', 'DONE', 90, 'sprint-002');
    updated = manager.getSkill('counter-skill');
    expect(updated?.stats.totalUses).toBe(2);

    manager.updateSkillStats('counter-skill', 'NO_GO', 0, 'sprint-003');
    updated = manager.getSkill('counter-skill');
    expect(updated?.stats.totalUses).toBe(3);
  });

  it('calculates successRate correctly for DONE evaluation', () => {
    const skill = makeSkillDef({ id: 'success-skill' });
    manager.saveSkill(skill);

    manager.updateSkillStats('success-skill', 'DONE', 80, 'sprint-001');
    const updated = manager.getSkill('success-skill');
    expect(updated?.stats.successRate).toBe(1.0); // 1/1 = 1.0
  });

  it('calculates successRate correctly for GO_WITH_TECH_DEBT (counts as success)', () => {
    const skill = makeSkillDef({ id: 'debt-skill' });
    manager.saveSkill(skill);

    manager.updateSkillStats('debt-skill', 'GO_WITH_TECH_DEBT', 60, 'sprint-001');
    const updated = manager.getSkill('debt-skill');
    expect(updated?.stats.successRate).toBe(1.0); // GO_WITH_TECH_DEBT counts as success
  });

  it('calculates successRate correctly for NO_GO (not a success)', () => {
    const skill = makeSkillDef({ id: 'nogo-skill' });
    manager.saveSkill(skill);

    manager.updateSkillStats('nogo-skill', 'NO_GO', 0, 'sprint-001');
    const updated = manager.getSkill('nogo-skill');
    expect(updated?.stats.successRate).toBe(0); // 0/1 = 0
  });

  it('calculates successRate correctly across mixed evaluations', () => {
    const skill = makeSkillDef({ id: 'mixed-skill' });
    manager.saveSkill(skill);

    manager.updateSkillStats('mixed-skill', 'DONE', 80, 'sprint-001');
    manager.updateSkillStats('mixed-skill', 'NO_GO', 0, 'sprint-002');
    manager.updateSkillStats('mixed-skill', 'DONE', 90, 'sprint-003');

    const updated = manager.getSkill('mixed-skill');
    // 2 successes out of 3 total
    expect(updated?.stats.successRate).toBeCloseTo(2 / 3, 5);
  });

  it('calculates avgCoverage as rolling average', () => {
    const skill = makeSkillDef({ id: 'coverage-skill' });
    manager.saveSkill(skill);

    manager.updateSkillStats('coverage-skill', 'DONE', 80, 'sprint-001');
    let updated = manager.getSkill('coverage-skill');
    expect(updated?.stats.avgCoverage).toBe(80); // avg(80) = 80

    manager.updateSkillStats('coverage-skill', 'DONE', 90, 'sprint-002');
    updated = manager.getSkill('coverage-skill');
    expect(updated?.stats.avgCoverage).toBe(85); // avg(80, 90) = 85

    manager.updateSkillStats('coverage-skill', 'DONE', 70, 'sprint-003');
    updated = manager.getSkill('coverage-skill');
    expect(updated?.stats.avgCoverage).toBe(80); // avg(80, 90, 70) = 80
  });

  it('updates lastUsedInSprint on each call', () => {
    const skill = makeSkillDef({ id: 'sprint-skill' });
    manager.saveSkill(skill);

    manager.updateSkillStats('sprint-skill', 'DONE', 80, 'sprint-001');
    let updated = manager.getSkill('sprint-skill');
    expect(updated?.stats.lastUsedInSprint).toBe('sprint-001');

    manager.updateSkillStats('sprint-skill', 'DONE', 90, 'sprint-005');
    updated = manager.getSkill('sprint-skill');
    expect(updated?.stats.lastUsedInSprint).toBe('sprint-005');
  });

  it('persists stats to manifest.json on disk', () => {
    const skill = makeSkillDef({ id: 'persist-skill' });
    manager.saveSkill(skill);

    manager.updateSkillStats('persist-skill', 'DONE', 85, 'sprint-010');

    // Read directly from disk
    const manifestPath = join(tempDir, '.deckent', 'skills', 'persist-skill', 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(raw.stats.totalUses).toBe(1);
    expect(raw.stats.successRate).toBe(1.0);
    expect(raw.stats.avgCoverage).toBe(85);
    expect(raw.stats.lastUsedInSprint).toBe('sprint-010');
  });

  it('does nothing when skill id does not exist', () => {
    // Should not throw
    manager.updateSkillStats('nonexistent-skill', 'DONE', 80, 'sprint-001');
    expect(manager.getSkill('nonexistent-skill')).toBeUndefined();
  });

  it('handles skill with undefined initial stats', () => {
    const skill = makeSkillDef({ id: 'no-stats-skill' });
    // Manually remove stats
    (skill as Record<string, unknown>).stats = undefined;
    manager.saveSkill(skill);

    manager.updateSkillStats('no-stats-skill', 'DONE', 75, 'sprint-001');
    const updated = manager.getSkill('no-stats-skill');
    expect(updated?.stats.totalUses).toBe(1);
    expect(updated?.stats.avgCoverage).toBe(75);
  });

  it('avgCoverage handles 0 coverage correctly', () => {
    const skill = makeSkillDef({ id: 'zero-cov-skill' });
    manager.saveSkill(skill);

    manager.updateSkillStats('zero-cov-skill', 'NO_GO', 0, 'sprint-001');
    manager.updateSkillStats('zero-cov-skill', 'DONE', 100, 'sprint-002');

    const updated = manager.getSkill('zero-cov-skill');
    expect(updated?.stats.avgCoverage).toBe(50); // avg(0, 100) = 50
  });

  it('stats survive across multiple manager instances', () => {
    const skill = makeSkillDef({ id: 'multi-instance-skill' });
    manager.saveSkill(skill);

    manager.updateSkillStats('multi-instance-skill', 'DONE', 80, 'sprint-001');

    // Create new manager instance pointing to same dir
    const manager2 = new SkillPoolManager(tempDir);
    manager2.updateSkillStats('multi-instance-skill', 'DONE', 90, 'sprint-002');

    const updated = manager2.getSkill('multi-instance-skill');
    expect(updated?.stats.totalUses).toBe(2);
    expect(updated?.stats.avgCoverage).toBe(85);
  });
});
