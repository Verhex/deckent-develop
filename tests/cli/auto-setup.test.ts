import { describe, it, expect } from 'vitest';
import { generateSetupRecommendation } from '../../src/cli/auto-setup.js';
import type { SystemProfile, ProjectAnalysis, SubscriptionDetected } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<SystemProfile> = {}): SystemProfile {
  return {
    cpuCores: 8,
    totalMemMB: 16384,
    freeMemMB: 8192,
    recommendedMaxWorkers: 8,
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<ProjectAnalysis> = {}): ProjectAnalysis {
  return {
    framework: 'unknown',
    language: 'typescript',
    testFramework: 'vitest',
    buildTool: 'tsc',
    ci: 'unknown',
    fileCount: 50,
    authorCount: 1,
    size: 'medium',
    methodology: 'sprint',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('generateSetupRecommendation', () => {
  it('max subscription + 16GB + small project → performance, ~4 workers', () => {
    const result = generateSetupRecommendation(
      makeProfile({ recommendedMaxWorkers: 8, totalMemMB: 16384 }),
      'max',
      makeAnalysis({ size: 'small' }),
    );

    expect(result.mode).toBe('performance');
    expect(result.maxWorkers).toBe(4); // ceil(8 * 0.5)
    expect(result.brainModel).toBe('opus');
    expect(result.defaultModel).toBe('opus');
    expect(result.planning).toBe('ai');
  });

  it('pro subscription + 8GB + large project → economic, ~3 workers', () => {
    const result = generateSetupRecommendation(
      makeProfile({ recommendedMaxWorkers: 3, totalMemMB: 8192 }),
      'pro',
      makeAnalysis({ size: 'large' }),
    );

    expect(result.mode).toBe('economic');
    expect(result.maxWorkers).toBe(3); // ceil(3 * 1.0)
    expect(result.brainModel).toBe('sonnet');
    expect(result.defaultModel).toBe('sonnet');
    expect(result.planning).toBe('structured');
  });

  it('unknown subscription → economic safe default', () => {
    const result = generateSetupRecommendation(
      makeProfile(),
      'unknown',
      makeAnalysis(),
    );

    expect(result.mode).toBe('economic');
    expect(result.brainModel).toBe('sonnet');
    expect(result.defaultModel).toBe('sonnet');
    expect(result.planning).toBe('structured');
  });

  it('reasons array is non-empty and contains strings', () => {
    const result = generateSetupRecommendation(
      makeProfile(),
      'max',
      makeAnalysis(),
    );

    expect(result.reasons.length).toBeGreaterThanOrEqual(5);
    for (const reason of result.reasons) {
      expect(typeof reason).toBe('string');
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it('SetupRecommendation interface has all required fields', () => {
    const result = generateSetupRecommendation(
      makeProfile(),
      'pro',
      makeAnalysis(),
    );

    expect(result).toHaveProperty('mode');
    expect(result).toHaveProperty('maxWorkers');
    expect(result).toHaveProperty('brainModel');
    expect(result).toHaveProperty('defaultModel');
    expect(result).toHaveProperty('planning');
    expect(result).toHaveProperty('reasons');
  });

  it('small project halves the workers (ceil)', () => {
    const result = generateSetupRecommendation(
      makeProfile({ recommendedMaxWorkers: 5 }),
      'pro',
      makeAnalysis({ size: 'small' }),
    );

    expect(result.maxWorkers).toBe(3); // ceil(5 * 0.5) = 3
  });

  it('medium project uses 0.75 multiplier', () => {
    const result = generateSetupRecommendation(
      makeProfile({ recommendedMaxWorkers: 8 }),
      'max',
      makeAnalysis({ size: 'medium' }),
    );

    expect(result.maxWorkers).toBe(6); // ceil(8 * 0.75) = 6
  });

  it('large project uses full workers', () => {
    const result = generateSetupRecommendation(
      makeProfile({ recommendedMaxWorkers: 10 }),
      'max',
      makeAnalysis({ size: 'large' }),
    );

    expect(result.maxWorkers).toBe(10); // ceil(10 * 1.0) = 10
  });

  it('maxWorkers is always at least 1', () => {
    const result = generateSetupRecommendation(
      makeProfile({ recommendedMaxWorkers: 1 }),
      'pro',
      makeAnalysis({ size: 'small' }),
    );

    expect(result.maxWorkers).toBeGreaterThanOrEqual(1);
  });

  it('max subscription gets ai planning, pro gets structured', () => {
    const maxResult = generateSetupRecommendation(
      makeProfile(),
      'max',
      makeAnalysis(),
    );
    const proResult = generateSetupRecommendation(
      makeProfile(),
      'pro',
      makeAnalysis(),
    );

    expect(maxResult.planning).toBe('ai');
    expect(proResult.planning).toBe('structured');
  });

  it('reasons mention subscription, system, and project size', () => {
    const result = generateSetupRecommendation(
      makeProfile(),
      'max',
      makeAnalysis({ size: 'small' }),
    );

    const joined = result.reasons.join(' ');
    expect(joined).toContain('max');
    expect(joined).toContain('performance');
    expect(joined).toContain('small');
    expect(joined).toContain('workers');
  });
});
