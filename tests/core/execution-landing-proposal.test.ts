import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildExecutionLandingProposalPromptSegment,
  executionLandingProposalPath,
  parseLandingProposalV2,
  parseExecutionLandingProposal,
  readExecutionLandingProposal,
  writeExecutionLandingProposal,
} from '../../src/core/execution-landing-proposal.js';

const roots: string[] = [];
const ATTEMPT = '11111111-1111-4111-8111-111111111111';
const T0 = '2026-07-23T20:00:00.000Z';
const T1 = '2026-07-23T20:00:01.000Z';

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-landing-proposal-'));
  roots.push(value);
  mkdirSync(join(value, '.tasks'));
  return value;
}

function proposal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    taskId: 'm1-007',
    attemptId: ATTEMPT,
    sequence: 2,
    summary: 'Checkpoint-ready coherent state.',
    completedWork: ['plan and one source change'],
    remainingWork: ['targeted verification'],
    nextAction: 'run the targeted test',
    unresolvedRisks: [],
    updatedAt: T1,
    ...overrides,
  };
}

function proposalV2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...proposal(),
    version: 2,
    generation: 3,
    resultReference: {
      taskId: 'm1-007', attemptId: ATTEMPT, generation: 3,
      relativePath: '.tasks/task-m1-007.result',
    },
    ...overrides,
  };
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('execution landing proposal', () => {
  it('validates and atomically replaces a structured V2 proposal', () => {
    const projectRoot = root();
    const first = proposalV2();
    const written = writeExecutionLandingProposal(projectRoot, first as never);
    const path = join(projectRoot, written.relativePath);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(first);

    writeExecutionLandingProposal(projectRoot, proposalV2({ sequence: 3 }) as never);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ sequence: 3, generation: 3 });
    expect(written.proposalSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ['task traversal', { taskId: '../m1-007' }],
    ['Windows-style task traversal', { taskId: '..\\m1-007' }],
    ['NUL in task identity', { taskId: 'm1-007\0other' }],
    ['invalid attempt', { attemptId: 'not-an-attempt' }],
    ['invalid generation', { generation: 0 }],
    ['invalid sequence', { sequence: 0 }],
    ['conflicting duplicate identity', { resultReference: { taskId: 'other', attemptId: ATTEMPT, generation: 3, relativePath: '.tasks/task-m1-007.result' } }],
    ['result traversal', { resultReference: { taskId: 'm1-007', attemptId: ATTEMPT, generation: 3, relativePath: '../task-m1-007.result' } }],
    ['oversized risks', { unresolvedRisks: Array.from({ length: 51 }, () => 'risk') }],
  ])('rejects %s before publication', (_name, override) => {
    const projectRoot = root();
    expect(() => writeExecutionLandingProposal(projectRoot, proposalV2(override) as never)).toThrow();
    expect(() => readFileSync(join(projectRoot, '.tasks/task-m1-007.landing-proposal.json'))).toThrow();
  });

  it('rejects non-serializable input and symlinked destinations', () => {
    const cyclic = proposalV2();
    cyclic.summary = cyclic;
    expect(() => parseLandingProposalV2(cyclic)).toThrow(/cycle/);

    const projectRoot = root();
    const outside = join(projectRoot, 'outside.json');
    writeFileSync(outside, 'untouched');
    symlinkSync(outside, executionLandingProposalPath(projectRoot, 'm1-007'));
    expect(() => writeExecutionLandingProposal(projectRoot, proposalV2() as never)).toThrow(/symlink/);
    expect(readFileSync(outside, 'utf8')).toBe('untouched');
  });

  it('accepts only the exact attempt-bound bounded schema', () => {
    expect(parseExecutionLandingProposal(proposal(), {
      taskId: 'm1-007',
      attemptId: ATTEMPT,
    })).toMatchObject({
      taskId: 'm1-007',
      attemptId: ATTEMPT,
      sequence: 2,
    });
    expect(() => parseExecutionLandingProposal(proposal({ provider: 'claude' }), {
      taskId: 'm1-007',
      attemptId: ATTEMPT,
    })).toThrow(/exact attempt-bound schema/);
    expect(() => parseExecutionLandingProposal(proposal({ attemptId: '22222222-2222-4222-8222-222222222222' }), {
      taskId: 'm1-007',
      attemptId: ATTEMPT,
    })).toThrow(/exact attempt-bound schema/);
    expect(() => parseExecutionLandingProposal(proposal({ updatedAt: 'not-an-iso-timestamp' }), {
      taskId: 'm1-007',
      attemptId: ATTEMPT,
    })).toThrow(/exact attempt-bound schema/);
  });

  it('accepts worker clock skew while binding freshness to host-observed file evidence', () => {
    const projectRoot = root();
    const path = executionLandingProposalPath(projectRoot, 'm1-007');
    writeFileSync(path, `${JSON.stringify(proposal({ updatedAt: '2000-01-01T00:00:00.000Z' }))}\n`);
    const envelope = readExecutionLandingProposal(projectRoot, {
      taskId: 'm1-007',
      attemptId: ATTEMPT,
      notBefore: '2000-01-01T00:00:00.000Z',
    });
    expect(envelope.relativePath).toBe('.tasks/task-m1-007.landing-proposal.json');
    expect(envelope.proposalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.proposal.updatedAt).toBe('2000-01-01T00:00:00.000Z');
  });

  it('rejects a proposal file that predates the host-prepared attempt', () => {
    const projectRoot = root();
    const path = executionLandingProposalPath(projectRoot, 'm1-007');
    writeFileSync(path, `${JSON.stringify(proposal())}\n`);
    const stale = new Date('2026-07-23T19:59:00.000Z');
    utimesSync(path, stale, stale);

    expect(() => readExecutionLandingProposal(projectRoot, {
      taskId: 'm1-007',
      attemptId: ATTEMPT,
      notBefore: T0,
    })).toThrow(/predates the current attempt/);
  });

  it('emits one bounded attempt-specific volatile protocol segment', () => {
    const segment = buildExecutionLandingProposalPromptSegment('m1-007', ATTEMPT);
    expect(segment).toContain('.tasks/task-m1-007.landing-proposal.json');
    expect(segment).toContain(ATTEMPT);
    expect(segment).toContain('untrusted proposal only');
    expect(segment).toContain('diagnostic worker metadata only');
    expect(segment).toContain('FIRST lifecycle action');
    expect(segment).toContain('SAME Bash tool call');
    expect(segment).toContain('FINALIZATION BARRIER');
    expect(segment).toContain('sequence 2 or higher');
    expect(segment).toContain('SAME assistant turn');
    expect(segment).toContain('stop early and report NO_GO');
    expect(segment).toContain('quote-safe composition');
    expect(segment).toContain('proposal_tmp="${proposal_path}.tmp.$$"');
    expect(segment).toContain('mv -- "$proposal_tmp" "$proposal_path"');
    expect(segment.length).toBeLessThan(3_500);
  });

  it('combines finite adjudication checkpointing with the existing evidence tool call', () => {
    const segment = buildExecutionLandingProposalPromptSegment(
      'm3-010-xverify',
      ATTEMPT,
      'finite-adjudication',
    );
    expect(segment).toContain('Do not spend a standalone tool call on this proposal');
    expect(segment).toContain('SAME single Bash tool call');
    expect(segment).toContain('Do not update the proposal after the evidence pass');
    expect(segment).toContain('only permitted project-file mutation');
    expect(segment).toContain('quote-safe composition');
    expect(segment).toContain('mv -- "$proposal_tmp" "$proposal_path"');
    expect(segment).not.toContain('after your plan and after each coherent completed step');
    expect(segment.length).toBeLessThan(4_000);
  });
});
