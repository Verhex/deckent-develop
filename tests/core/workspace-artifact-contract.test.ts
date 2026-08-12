import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_ARTIFACT_REGISTRY,
  WORKSPACE_ARTIFACT_SCHEMA_VERSION,
  ensureWorkspaceArtifactHeader,
  inspectManagedContractBlock,
  parseWorkspaceArtifactHeader,
  renderManagedContractBlock,
  workspaceManagedDocEntries,
} from '../../src/core/workspace-artifact-contract.js';

describe('workspace artifact contract', () => {
  it('registers the complete five-artifact workspace inventory exactly once', () => {
    expect(WORKSPACE_ARTIFACT_REGISTRY.map((entry) => entry.id)).toEqual([
      'identity', 'tools', 'boot', 'worker-guide', 'stats-snapshot',
    ]);
    expect(new Set(WORKSPACE_ARTIFACT_REGISTRY.map((entry) => entry.path)).size).toBe(5);
    expect(workspaceManagedDocEntries().map((entry) => entry.id)).toEqual([
      'identity-md', 'tools-md', 'boot-md', 'worker-guide-md',
    ]);
  });

  it('round-trips provenance headers without touching user content', () => {
    const original = '# Project Identity\nName: acme\n';
    const updated = ensureWorkspaceArtifactHeader(original, {
      id: 'identity',
      schemaVersion: WORKSPACE_ARTIFACT_SCHEMA_VERSION,
      authority: 'user',
      provenance: 'user-authored-or-migrated',
    });
    expect(updated).toContain(original);
    expect(parseWorkspaceArtifactHeader(updated)).toEqual({
      id: 'identity',
      schemaVersion: 1,
      authority: 'user',
      provenance: 'user-authored-or-migrated',
    });
  });

  it('verifies digest-bound managed content and fails closed after tampering', () => {
    const block = renderManagedContractBlock('worker-guide', 'canonical body');
    expect(inspectManagedContractBlock(block, 'worker-guide')).toMatchObject({
      state: 'VERIFIED', schemaVersion: 1,
    });
    expect(inspectManagedContractBlock(block.replace('canonical body', 'tampered body'), 'worker-guide')).toEqual({
      state: 'HOLD', reason: 'digest-mismatch',
    });
    expect(inspectManagedContractBlock('# legacy', 'worker-guide')).toEqual({
      state: 'HOLD', reason: 'missing',
    });
  });
});
