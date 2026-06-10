import { describe, it, expect } from 'vitest';
import {
  isHighStakesTask,
  selectVerifierProvider,
  decideCrossVerify,
  DEFAULT_VERIFIER_PRIORITY,
  type HighStakesTaskInput,
  type CrossVerifyDecision,
} from '../../src/core/cross-verify.js';
import type { Task, ProviderName } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── isHighStakesTask ───────────────────────────────────────────────────────

describe('cross-verify · isHighStakesTask', () => {
  it('flags a security/auth keyword in the description (positive)', () => {
    expect(
      isHighStakesTask({ description: 'Harden the JWT authentication flow against CSRF' }),
    ).toBe(true);
  });

  it('flags a security keyword inside a scope directory (positive)', () => {
    expect(
      isHighStakesTask({ description: 'Refactor login', scope: { directories: ['src/auth/'] } }),
    ).toBe(true);
  });

  it('flags assignedAgent === security-auditor (positive)', () => {
    expect(isHighStakesTask({ description: 'Review module', assignedAgent: 'security-auditor' })).toBe(true);
  });

  it('flags forceAgent === security-auditor (positive)', () => {
    expect(isHighStakesTask({ description: 'Review module', forceAgent: 'security-auditor' })).toBe(true);
  });

  it('flags priority === CRITICAL (positive — P0 tier)', () => {
    expect(isHighStakesTask({ description: 'Generic change', priority: 'CRITICAL' })).toBe(true);
  });

  it('flags a standalone "P0" marker in text (positive)', () => {
    expect(isHighStakesTask({ description: 'This is a P0 outage fix' })).toBe(true);
  });

  it('flags policy === risk-tagged when present (positive)', () => {
    expect(isHighStakesTask({ description: 'Generic change', policy: 'risk-tagged' })).toBe(true);
  });

  it('does NOT flag a plain documentation task (negative)', () => {
    expect(
      isHighStakesTask({
        title: 'Update README',
        description: 'Refresh the documentation and changelog',
        scope: { directories: ['docs/'] },
        priority: 'LOW',
      }),
    ).toBe(false);
  });

  it('does NOT false-positive on "authority"/"author" (boundary guard)', () => {
    expect(
      isHighStakesTask({
        title: 'Authority Matrix doc',
        description: 'Document the authority matrix authored by the architect',
        priority: 'NORMAL',
      }),
    ).toBe(false);
  });

  it('does NOT flag a token-usage task lacking real security context (over-broad guard)', () => {
    expect(
      isHighStakesTask({ description: 'Improve the token usage tracker dashboard', priority: 'NORMAL' }),
    ).toBe(false);
  });

  it('ignores a non-risk policy value', () => {
    expect(isHighStakesTask({ description: 'Generic change', policy: 'auto' })).toBe(false);
  });

  it('accepts a full Task object structurally (type compatibility)', () => {
    const task: Task = {
      id: '276-004',
      title: 'OAuth hardening',
      description: 'Add RBAC checks to the authorization layer',
      model: 'opus',
      effort: 'high',
      priority: 'NORMAL',
      reason: 'directive',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/x.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
      status: TaskStatus.EXECUTING,
    };
    expect(isHighStakesTask(task)).toBe(true);
  });
});

// ─── selectVerifierProvider ─────────────────────────────────────────────────

describe('cross-verify · selectVerifierProvider', () => {
  it('selects a different provider (claude task → codex)', () => {
    expect(selectVerifierProvider('claude', ['claude', 'codex'])).toBe('codex');
  });

  it('honors default priority order (codex before gemini)', () => {
    expect(selectVerifierProvider('claude', ['claude', 'gemini', 'codex'])).toBe('codex');
  });

  it('falls through to the next priority when codex is absent (claude → gemini)', () => {
    expect(selectVerifierProvider('claude', ['claude', 'gemini'])).toBe('gemini');
  });

  it('returns null for a single-provider environment (honest-skip)', () => {
    expect(selectVerifierProvider('claude', ['claude'])).toBeNull();
  });

  it('returns null when availableProviders is empty', () => {
    expect(selectVerifierProvider('claude', [])).toBeNull();
  });

  it('returns null when the only available provider equals the task provider', () => {
    expect(selectVerifierProvider('codex', ['codex', 'codex'])).toBeNull();
  });

  it('selects claude when the task ran on codex', () => {
    expect(selectVerifierProvider('codex', ['claude', 'codex'])).toBe('claude');
  });

  it('dedups repeated providers in the available list', () => {
    expect(selectVerifierProvider('claude', ['claude', 'codex', 'codex', 'claude'])).toBe('codex');
  });

  it('respects a custom priority order argument', () => {
    expect(
      selectVerifierProvider('claude', ['codex', 'gemini'], ['gemini', 'codex']),
    ).toBe('gemini');
  });

  it('falls back to availability order for a provider not in the priority list', () => {
    // ollama is not in a [codex, gemini, claude] priority list → still chosen as the
    // only different available provider.
    expect(selectVerifierProvider('claude', ['claude', 'ollama'], ['codex', 'gemini', 'claude'])).toBe('ollama');
  });

  it('exposes a sane default priority order', () => {
    expect(DEFAULT_VERIFIER_PRIORITY).toContain('codex');
    expect(DEFAULT_VERIFIER_PRIORITY).toContain('gemini');
    expect(DEFAULT_VERIFIER_PRIORITY[0]).toBe('codex');
  });
});

// ─── decideCrossVerify (decision combination) ───────────────────────────────

describe('cross-verify · decideCrossVerify', () => {
  const highStakes: HighStakesTaskInput = { description: 'Patch the auth bypass', priority: 'CRITICAL' };
  const plain: HighStakesTaskInput = { description: 'Tidy the README', priority: 'LOW' };

  it('verifies a high-stakes task when a second provider exists', () => {
    const d = decideCrossVerify({
      task: highStakes,
      taskProvider: 'claude',
      availableProviders: ['claude', 'codex'],
    });
    expect(d.shouldVerify).toBe(true);
    expect(d.verifierProvider).toBe('codex');
    expect(d.reason).toMatch(/high-stakes/i);
  });

  it('skips a non-high-stakes task under default high_stakes_only gate', () => {
    const d = decideCrossVerify({
      task: plain,
      taskProvider: 'claude',
      availableProviders: ['claude', 'codex'],
    });
    expect(d.shouldVerify).toBe(false);
    expect(d.verifierProvider).toBeUndefined();
    expect(d.reason).toMatch(/not high-stakes/i);
  });

  it('honest-skips a high-stakes task when no second provider is available', () => {
    const d = decideCrossVerify({
      task: highStakes,
      taskProvider: 'claude',
      availableProviders: ['claude'],
    });
    expect(d.shouldVerify).toBe(false);
    expect(d.verifierProvider).toBeUndefined();
    expect(d.reason).toMatch(/no second provider|honest-skip/i);
  });

  it('verifies a non-high-stakes task when high_stakes_only is disabled', () => {
    const d = decideCrossVerify({
      task: plain,
      taskProvider: 'claude',
      availableProviders: ['claude', 'gemini'],
      highStakesOnly: false,
    });
    expect(d.shouldVerify).toBe(true);
    expect(d.verifierProvider).toBe('gemini');
  });

  it('passes a custom verifier priority through to selection', () => {
    const d = decideCrossVerify({
      task: highStakes,
      taskProvider: 'claude',
      availableProviders: ['codex', 'gemini'],
      verifierPriority: ['gemini', 'codex'],
    });
    expect(d.shouldVerify).toBe(true);
    expect(d.verifierProvider).toBe('gemini');
  });

  it('always returns a non-empty reason string', () => {
    const inputs: ProviderName[][] = [['claude'], ['claude', 'codex']];
    for (const available of inputs) {
      const d: CrossVerifyDecision = decideCrossVerify({
        task: highStakes,
        taskProvider: 'claude',
        availableProviders: available,
      });
      expect(typeof d.reason).toBe('string');
      expect(d.reason.length).toBeGreaterThan(0);
    }
  });
});
