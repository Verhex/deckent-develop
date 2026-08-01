import { describe, expect, it } from 'vitest';

import {
  resolveFixRepairAuthority,
  type FixRepairAuthorityInput,
} from '../../src/orchestra/fix-repair-authority.js';

function input(overrides: Partial<FixRepairAuthorityInput> = {}): FixRepairAuthorityInput {
  return {
    reviewedDirectories: ['src/orchestra/', 'tests/orchestra/'],
    inheritedFilesRead: ['src/orchestra/debt-manager.ts'],
    inheritedFilesWrite: ['src/orchestra/debt-manager.ts'],
    failureEvidence: [
      { path: 'src/orchestra/fix-repair-authority.ts', access: 'read', evidenceRef: 'test-output:line-1' },
      { path: 'tests/orchestra/fix-repair-authority.test.ts', access: 'write', evidenceRef: 'test-output:line-2' },
    ],
    trackedPaths: [
      'src/orchestra/debt-manager.ts',
      'src/orchestra/fix-repair-authority.ts',
      'tests/orchestra/fix-repair-authority.test.ts',
    ],
    ...overrides,
  };
}

describe('resolveFixRepairAuthority', () => {
  it('admits only exact tracked evidence paths within reviewed directories', () => {
    const result = resolveFixRepairAuthority(input());

    expect(result).toMatchObject({ state: 'accepted', action: 'continue' });
    expect(result.filesRead).toEqual([
      'src/orchestra/debt-manager.ts',
      'src/orchestra/fix-repair-authority.ts',
    ]);
    expect(result.filesWrite).toEqual([
      'src/orchestra/debt-manager.ts',
      'tests/orchestra/fix-repair-authority.test.ts',
    ]);
    expect(result.addedReadPaths).toEqual(['src/orchestra/fix-repair-authority.ts']);
    expect(result.addedWritePaths).toEqual(['tests/orchestra/fix-repair-authority.test.ts']);
    expect(result.authorityFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('is deterministic across order and duplicate evidence', () => {
    const first = resolveFixRepairAuthority(input());
    const second = resolveFixRepairAuthority(input({
      reviewedDirectories: ['tests/orchestra/', 'src/orchestra/', 'src/orchestra/'],
      failureEvidence: [
        { path: 'tests/orchestra/fix-repair-authority.test.ts', access: 'write', evidenceRef: 'second-reference' },
        { path: 'src/orchestra/fix-repair-authority.ts', access: 'read', evidenceRef: 'first-reference' },
        { path: 'src/orchestra/fix-repair-authority.ts', access: 'read', evidenceRef: 'duplicate-reference' },
      ],
    }));

    expect(second).toEqual(first);
  });

  it('pauses without granting a delta when an evidenced path is outside review', () => {
    const result = resolveFixRepairAuthority(input({
      failureEvidence: [{
        path: 'tests/core/authority.test.ts',
        access: 'write',
        evidenceRef: 'failure:outside-boundary',
      }],
      trackedPaths: ['src/orchestra/debt-manager.ts', 'tests/core/authority.test.ts'],
    }));

    expect(result).toMatchObject({
      state: 'hold',
      action: 'pause',
      reason: 'unresolved_requirements',
      filesWrite: ['src/orchestra/debt-manager.ts'],
      addedWritePaths: [],
      unresolvedFindings: [{ code: 'outside_reviewed_directory', path: 'tests/core/authority.test.ts' }],
    });
  });

  it('pauses for invalid or untracked evidence instead of inferring a path', () => {
    const result = resolveFixRepairAuthority(input({
      failureEvidence: [
        { path: 'src/orchestra/', access: 'write', evidenceRef: 'failure:directory' },
        { path: 'tests/orchestra/missing.test.ts', access: 'read', evidenceRef: 'failure:missing' },
      ],
    }));

    expect(result).toMatchObject({
      state: 'hold',
      reason: 'unresolved_requirements',
      addedReadPaths: [],
      addedWritePaths: [],
      unresolvedFindings: [
        { code: 'invalid_evidence', path: 'src/orchestra/' },
        { code: 'untracked_evidence_path', path: 'tests/orchestra/missing.test.ts' },
      ],
    });
  });

  it('turns the same impossible authority fingerprint into a repeated pause', () => {
    const first = resolveFixRepairAuthority(input({
      failureEvidence: [{
        path: 'tests/core/authority.test.ts',
        access: 'write',
        evidenceRef: 'failure:outside-boundary',
      }],
      trackedPaths: ['src/orchestra/debt-manager.ts', 'tests/core/authority.test.ts'],
    }));
    const second = resolveFixRepairAuthority(input({
      failureEvidence: [{
        path: 'tests/core/authority.test.ts',
        access: 'write',
        evidenceRef: 'failure:another-reference',
      }],
      trackedPaths: ['src/orchestra/debt-manager.ts', 'tests/core/authority.test.ts'],
      priorImpossibleFingerprints: [first.authorityFingerprint],
    }));

    expect(second).toMatchObject({
      state: 'hold',
      action: 'pause',
      reason: 'repeated_impossible_fingerprint',
      authorityFingerprint: first.authorityFingerprint,
    });
  });
});
