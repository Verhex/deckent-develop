import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AttendedExecutionProposalStore,
  attendedExecutionProposalSha256,
  createAttendedExecutionProposalDigests,
} from '../../src/core/attended-execution-proposal.js';

const roots: string[] = [];

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'deckent-attended-proposal-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const storeDir = join(base, 'host', 'proposals');
  mkdirSync(projectRoot, { recursive: true });
  return { base, projectRoot, storeDir };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('AttendedExecutionProposalStore', () => {
  it('persists one exact digest-only proposal and reopens it after restart', () => {
    const { projectRoot, storeDir } = fixture();
    const digests = createAttendedExecutionProposalDigests({
      task: { id: 'task-a', model: 'claude-fable-5' },
      prompt: 'bounded prompt',
      scope: { filesRead: ['src/a.ts'], filesWrite: ['src/a.ts'] },
      acceptance: { goCriteria: 'targeted proof passes', noGoCriteria: 'dispatch drift' },
    });
    const proposalDigest = attendedExecutionProposalSha256({
      attemptId: '123e4567-e89b-42d3-a456-426614174000',
      ...digests,
    });
    const input = {
      proposalDigest,
      bindingDigest: 'b'.repeat(64),
      digests,
      createdAt: '2026-07-25T00:00:00.000Z',
      expiresAt: '2026-07-25T00:30:00.000Z',
    };

    const first = new AttendedExecutionProposalStore(projectRoot, storeDir).persist(input);
    const reopened = new AttendedExecutionProposalStore(projectRoot, storeDir);

    expect(reopened.read(proposalDigest)).toEqual(first);
    expect(reopened.persist(input)).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('bounded prompt');
  });

  it('rejects first-writer conflict and project-local custody', () => {
    const { projectRoot, storeDir } = fixture();
    const digests = createAttendedExecutionProposalDigests({
      task: { id: 'task-a' },
      prompt: 'bounded prompt',
      scope: {},
      acceptance: {},
    });
    const proposalDigest = 'a'.repeat(64);
    const store = new AttendedExecutionProposalStore(projectRoot, storeDir);
    store.persist({
      proposalDigest,
      bindingDigest: 'b'.repeat(64),
      digests,
      createdAt: '2026-07-25T00:00:00.000Z',
      expiresAt: '2026-07-25T00:30:00.000Z',
    });

    expect(() => store.persist({
      proposalDigest,
      bindingDigest: 'c'.repeat(64),
      digests,
      createdAt: '2026-07-25T00:00:00.000Z',
      expiresAt: '2026-07-25T00:30:00.000Z',
    })).toThrow('conflicts with its first writer');
    expect(() => new AttendedExecutionProposalStore(
      projectRoot,
      join(projectRoot, '.deckent', 'proposals'),
    )).toThrow('outside the worker-mounted project');
  });
});
