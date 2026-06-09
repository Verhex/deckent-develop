// tests/nervous/authority-matrix.test.ts
//
// Authority Matrix — 12 tests (Sprint 147 Task 3)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionDefinition, ApprovalPolicy } from '../../src/core/nervous-types.js';
import type { Capability, ExecutionRequest } from '../../src/core/work-model.js';

// ─── Mock action-registry ────────────────────────────────────────────────────

const MOCK_ACTIONS: ReadonlyArray<ActionDefinition> = [
  // Low risk
  {
    id: 'ORPHAN_TASK_ARCHIVE',
    displayName: 'Orphan Task Archive',
    description: 'Orphan .tasks/ dosyalarını arşivle',
    category: 'low-risk',
    defaultRisk: 'low',
    requiredSafetyFloor: [],
    reversible: true,
  },
  // Medium risk
  {
    id: 'WORKER_RESPAWN',
    displayName: 'Worker Respawn',
    description: 'Stale worker yeniden başlat',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: false,
  },
  // High risk (non-safety-floor)
  {
    id: 'COMMIT_PUSH',
    displayName: 'Commit Push',
    description: 'Git push',
    category: 'high-risk',
    defaultRisk: 'high',
    requiredSafetyFloor: [],
    reversible: false,
  },
  // Safety floor actions (5)
  {
    id: 'KILL_LIVE_SPRINT',
    displayName: 'Kill Live Sprint',
    description: 'Canlı sprint durdurma',
    category: 'safety-floor',
    defaultRisk: 'high',
    requiredSafetyFloor: ['KILL_LIVE_SPRINT'],
    reversible: false,
  },
  {
    id: 'MANUAL_FILE_DELETE',
    displayName: 'Manual File Delete',
    description: 'Manuel dosya silme',
    category: 'safety-floor',
    defaultRisk: 'high',
    requiredSafetyFloor: ['MANUAL_FILE_DELETE'],
    reversible: false,
  },
  {
    id: 'COST_OVER_THRESHOLD',
    displayName: 'Cost Over Threshold',
    description: 'Eşik aşımı',
    category: 'safety-floor',
    defaultRisk: 'high',
    requiredSafetyFloor: ['COST_OVER_THRESHOLD'],
    reversible: false,
  },
  {
    id: 'DESTRUCTIVE_GIT',
    displayName: 'Destructive Git',
    description: 'git reset --hard, force push',
    category: 'safety-floor',
    defaultRisk: 'high',
    requiredSafetyFloor: ['DESTRUCTIVE_GIT'],
    reversible: false,
  },
  {
    id: 'ADR_DEPRECATE_ACCEPTED',
    displayName: 'ADR Deprecate Accepted',
    description: 'Accepted ADR deprecate',
    category: 'safety-floor',
    defaultRisk: 'high',
    requiredSafetyFloor: ['ADR_DEPRECATE_ACCEPTED'],
    reversible: false,
  },
];

const MOCK_ACTION_BY_ID = new Map(MOCK_ACTIONS.map(a => [a.id, a]));

vi.mock('../../src/nervous/action-registry.js', () => ({
  ACTION_BY_ID: MOCK_ACTION_BY_ID,
}));

// ─── Import SUT after mock ──────────────────────────────────────────────────

const {
  SAFETY_FLOOR,
  STRICT_MATRIX,
  BALANCED_MATRIX,
  AUTOPILOT_MATRIX,
  FULL_AUTO_MATRIX,
  MATRIX_BY_MODE,
  resolvePolicy,
  isSafetyFloorAction,
  checkWorkerAuthority,
  normalizeWorkerRole,
  ROLE_CAPABILITY_MAP,
  ENFORCE_RBAC_CONFIG_KEY,
  authorizeExecution,
} = await import('../../src/nervous/authority-matrix.js');

// Build a minimal ExecutionRequest slice for checkWorkerAuthority (ENT-1).
function reqSlice(
  role: string | undefined,
  caps: Capability[],
): Pick<ExecutionRequest, 'actor' | 'requirements'> {
  return {
    actor: role === undefined ? undefined : { id: 'u1', role },
    requirements: { capabilities: caps, resources: [] },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthorityMatrix', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1: STRICT — low-risk → suggest-30m
  it('STRICT: low-risk action returns suggest-30m', () => {
    const result = resolvePolicy(STRICT_MATRIX, 'ORPHAN_TASK_ARCHIVE');
    expect(result.policy).toBe('suggest-30m');
    expect(result.isSafetyFloor).toBe(false);
  });

  // Test 2: BALANCED — low → autonomous, medium → suggest-30m, high → approve
  it('BALANCED: risk levels map correctly', () => {
    const low = resolvePolicy(BALANCED_MATRIX, 'ORPHAN_TASK_ARCHIVE');
    expect(low.policy).toBe('autonomous');

    const med = resolvePolicy(BALANCED_MATRIX, 'WORKER_RESPAWN');
    expect(med.policy).toBe('suggest-30m');

    const high = resolvePolicy(BALANCED_MATRIX, 'COMMIT_PUSH');
    expect(high.policy).toBe('approve');
  });

  // Test 3: AUTOPILOT — high-risk → suggest-5m (NOT approve)
  it('AUTOPILOT: high-risk action returns suggest-5m', () => {
    const result = resolvePolicy(AUTOPILOT_MATRIX, 'COMMIT_PUSH');
    expect(result.policy).toBe('suggest-5m');
    expect(result.policy).not.toBe('approve');
  });

  // Test 4: FULL_AUTO — normal high-risk → autonomous
  it('FULL_AUTO: normal high-risk action returns autonomous', () => {
    const result = resolvePolicy(FULL_AUTO_MATRIX, 'COMMIT_PUSH');
    expect(result.policy).toBe('autonomous');
  });

  // Test 5: FULL_AUTO — safety floor KILL_LIVE_SPRINT → approve (VETO)
  it('FULL_AUTO: KILL_LIVE_SPRINT forced to approve by safety floor', () => {
    const result = resolvePolicy(FULL_AUTO_MATRIX, 'KILL_LIVE_SPRINT');
    expect(result.policy).toBe('approve');
    expect(result.isSafetyFloor).toBe(true);
  });

  // Test 6: User override COMMIT_PUSH=approve + AUTOPILOT → approve
  it('user override takes precedence over matrix default', () => {
    const overrides: Record<string, ApprovalPolicy> = { COMMIT_PUSH: 'approve' };
    const result = resolvePolicy(AUTOPILOT_MATRIX, 'COMMIT_PUSH', overrides);
    expect(result.policy).toBe('approve');
    expect(result.reason).toContain('User override');
  });

  // Test 7: Safety floor override edilemez — user override KILL_LIVE_SPRINT=autonomous → yine approve
  it('safety floor cannot be overridden by user override', () => {
    const overrides: Record<string, ApprovalPolicy> = { KILL_LIVE_SPRINT: 'autonomous' };
    const result = resolvePolicy(FULL_AUTO_MATRIX, 'KILL_LIVE_SPRINT', overrides);
    expect(result.policy).toBe('approve');
    expect(result.isSafetyFloor).toBe(true);
    expect(result.reason).toContain('Safety floor');
  });

  // Test 8: resolvePolicy with unknown action throws
  it('resolvePolicy throws for unknown action ID', () => {
    expect(() => resolvePolicy(BALANCED_MATRIX, 'UNKNOWN_ACTION')).toThrow(
      'Unknown action: UNKNOWN_ACTION',
    );
  });

  // Test 9: Reason strings differ for all 4 resolution paths
  it('reason strings reflect the resolution path used', () => {
    // Path 1: Safety floor
    const safetyResult = resolvePolicy(BALANCED_MATRIX, 'KILL_LIVE_SPRINT');
    expect(safetyResult.reason).toMatch(/^Safety floor:/);

    // Path 2: User override
    const userResult = resolvePolicy(BALANCED_MATRIX, 'COMMIT_PUSH', { COMMIT_PUSH: 'autonomous' });
    expect(userResult.reason).toMatch(/^User override/);

    // Path 3: Matrix override — build a custom matrix with actionOverrides
    const customMatrix = {
      ...BALANCED_MATRIX,
      actionOverrides: { COMMIT_PUSH: 'suggest-5m' as const },
    };
    const matrixResult = resolvePolicy(customMatrix, 'COMMIT_PUSH');
    expect(matrixResult.reason).toMatch(/^Matrix override:/);

    // Path 4: Default risk-based
    const defaultResult = resolvePolicy(BALANCED_MATRIX, 'ORPHAN_TASK_ARCHIVE');
    expect(defaultResult.reason).toMatch(/^Risk-based default/);
  });

  // Test 10: All 4 matrices share identical SAFETY_FLOOR reference
  it('all 4 matrices have identical safetyFloor reference', () => {
    expect(STRICT_MATRIX.safetyFloor).toBe(SAFETY_FLOOR);
    expect(BALANCED_MATRIX.safetyFloor).toBe(SAFETY_FLOOR);
    expect(AUTOPILOT_MATRIX.safetyFloor).toBe(SAFETY_FLOOR);
    expect(FULL_AUTO_MATRIX.safetyFloor).toBe(SAFETY_FLOOR);
  });

  // Test 11: MATRIX_BY_MODE has exactly 4 entries
  it('MATRIX_BY_MODE contains exactly 4 presets', () => {
    expect(MATRIX_BY_MODE.size).toBe(4);
    expect(MATRIX_BY_MODE.has('strict')).toBe(true);
    expect(MATRIX_BY_MODE.has('balanced')).toBe(true);
    expect(MATRIX_BY_MODE.has('autopilot')).toBe(true);
    expect(MATRIX_BY_MODE.has('full-auto')).toBe(true);
  });

  // Test 12: Object.freeze prevents mutation (readonly enforcement)
  it('preset matrices are frozen and immutable', () => {
    // Object.freeze makes property assignment throw in strict mode
    expect(() => {
      (STRICT_MATRIX as Record<string, unknown>).mode = 'full-auto';
    }).toThrow();

    expect(() => {
      (STRICT_MATRIX.riskPolicyMap as Record<string, unknown>).low = 'autonomous';
    }).toThrow();

    // SAFETY_FLOOR is frozen too
    expect(() => {
      (SAFETY_FLOOR as string[]).push('NEW_ACTION' as never);
    }).toThrow();
  });

  // Bonus: isSafetyFloorAction helper
  describe('isSafetyFloorAction', () => {
    it('returns true for safety floor actions', () => {
      expect(isSafetyFloorAction('KILL_LIVE_SPRINT')).toBe(true);
      expect(isSafetyFloorAction('DESTRUCTIVE_GIT')).toBe(true);
    });

    it('returns false for non-safety-floor actions', () => {
      expect(isSafetyFloorAction('ORPHAN_TASK_ARCHIVE')).toBe(false);
      expect(isSafetyFloorAction('COMMIT_PUSH')).toBe(false);
    });
  });

  // ─── ENT-1: actor.role → worker authority (ADR-037 V2 step) ───────────────
  describe('checkWorkerAuthority (ENT-1)', () => {
    it('permissive default: no actor → permit, allow-all, role null', () => {
      const result = checkWorkerAuthority(reqSlice(undefined, ['fs-write', 'shell']));
      expect(result.allowed).toBe(true);
      expect(result.level).toBe('permit');
      expect(result.role).toBeNull();
      expect(result.deniedCapabilities).toEqual([]);
      expect(result.reason).toContain('No actor role');
    });

    it('permissive default: unknown role → permit (backward-safe)', () => {
      const result = checkWorkerAuthority(reqSlice('wizard', ['db-write']));
      expect(result.allowed).toBe(true);
      expect(result.level).toBe('permit');
      expect(result.role).toBeNull();
      expect(result.reason).toContain("Unknown actor role 'wizard'");
    });

    it('viewer with read-only capabilities → permit', () => {
      const result = checkWorkerAuthority(reqSlice('viewer', ['fs-read', 'db-query', 'erp-read']));
      expect(result.allowed).toBe(true);
      expect(result.level).toBe('permit');
      expect(result.role).toBe('viewer');
      expect(result.deniedCapabilities).toEqual([]);
    });

    it('viewer requesting fs-write → SOFT warn (allowed, emits, not blocked) by default', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const emit = vi.fn();
      const result = checkWorkerAuthority(reqSlice('viewer', ['fs-read', 'fs-write']), { emit });

      expect(result.allowed).toBe(true); // SOFT — not blocked
      expect(result.level).toBe('warn');
      expect(result.role).toBe('viewer');
      expect(result.deniedCapabilities).toEqual(['fs-write']);
      expect(emit).toHaveBeenCalledOnce();
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'viewer', enforced: false, actorId: 'u1' }),
      );
      expect(warnSpy).toHaveBeenCalledOnce();
      warnSpy.mockRestore();
    });

    it('enforce_rbac flag ON: viewer requesting fs-write → HARD deny (blocked, no console.warn)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const emit = vi.fn();
      const result = checkWorkerAuthority(reqSlice('viewer', ['fs-write']), {
        enforceRbac: true,
        emit,
      });

      expect(result.allowed).toBe(false); // HARD block under flag
      expect(result.level).toBe('deny');
      expect(result.deniedCapabilities).toEqual(['fs-write']);
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ enforced: true }));
      expect(warnSpy).not.toHaveBeenCalled(); // deny path does not console.warn
      warnSpy.mockRestore();
    });

    it('engineer with dev capabilities → permit', () => {
      const result = checkWorkerAuthority(
        reqSlice('engineer', ['fs-write', 'shell', 'db-write', 'network']),
      );
      expect(result.allowed).toBe(true);
      expect(result.level).toBe('permit');
      expect(result.role).toBe('engineer');
    });

    it('engineer requesting enterprise-admin capability (erp-write) → soft warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = checkWorkerAuthority(reqSlice('engineer', ['fs-write', 'erp-write']));
      expect(result.allowed).toBe(true);
      expect(result.level).toBe('warn');
      expect(result.deniedCapabilities).toEqual(['erp-write']);
      warnSpy.mockRestore();
    });

    it('admin permits every capability', () => {
      const all: Capability[] = [
        'fs-read', 'fs-write', 'network', 'db-query', 'db-write', 'erp-read',
        'erp-write', 'shell', 'approval', 'provider-pin', 'gpu', 'tenant-scope', 'mcp-tool',
      ];
      const result = checkWorkerAuthority(reqSlice('admin', all));
      expect(result.allowed).toBe(true);
      expect(result.level).toBe('permit');
      expect(result.deniedCapabilities).toEqual([]);
    });

    it('known role with empty required capabilities → permit', () => {
      const result = checkWorkerAuthority(reqSlice('viewer', []));
      expect(result.allowed).toBe(true);
      expect(result.level).toBe('permit');
      expect(result.role).toBe('viewer');
    });

    it('normalizeWorkerRole maps known roles (case-insensitive) and rejects others', () => {
      expect(normalizeWorkerRole('admin')).toBe('admin');
      expect(normalizeWorkerRole('Engineer')).toBe('engineer');
      expect(normalizeWorkerRole('  viewer ')).toBe('viewer');
      expect(normalizeWorkerRole('wizard')).toBeNull();
      expect(normalizeWorkerRole(undefined)).toBeNull();
      expect(normalizeWorkerRole('')).toBeNull();
    });

    it('ROLE_CAPABILITY_MAP is a nested hierarchy (admin ⊇ engineer ⊇ viewer)', () => {
      const { admin, engineer, viewer } = ROLE_CAPABILITY_MAP;
      for (const cap of viewer) expect(engineer.has(cap)).toBe(true);
      for (const cap of engineer) expect(admin.has(cap)).toBe(true);
      // admin strictly larger than engineer (erp-write, tenant-scope are admin-only)
      expect(admin.has('erp-write')).toBe(true);
      expect(engineer.has('erp-write')).toBe(false);
      expect(engineer.has('tenant-scope')).toBe(false);
    });

    it('ENFORCE_RBAC_CONFIG_KEY is the enforce_rbac config flag name', () => {
      expect(ENFORCE_RBAC_CONFIG_KEY).toBe('enforce_rbac');
    });
  });

  // ─── authorizeExecution bridge (ENT-1 ADR-037 V2) ─────────────────────────
  describe('authorizeExecution (ENT-1 bridge)', () => {
    it('permissive default: no actor → allowed, no violations, not enforced', () => {
      const result = authorizeExecution({
        actor: undefined,
        requirements: { capabilities: ['fs-write', 'shell'], resources: [] },
      });
      expect(result.allowed).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.enforced).toBe(false);
    });

    it('denied under enforceRbac: viewer + fs-write + enforceRbac:true → blocked', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = authorizeExecution(
        reqSlice('viewer', ['fs-read', 'fs-write']),
        { enforceRbac: true },
      );
      expect(result.allowed).toBe(false);
      expect(result.violations).toEqual(['fs-write']);
      expect(result.enforced).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('unknown role → permissive allow: allowed, no violations, not enforced', () => {
      const result = authorizeExecution(
        reqSlice('unknownrole', ['db-write', 'shell']),
      );
      expect(result.allowed).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.enforced).toBe(false);
    });
  });
});
