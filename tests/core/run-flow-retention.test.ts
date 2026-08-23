import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RUN_FLOW_EVENT_SCHEMA_VERSION, type RunFlowEvent } from '../../src/core/run-flow-contract.js';
import { applyRunFlowRetention } from '../../src/core/run-flow-retention.js';
import { appendFlowEvents, readFlowEvents, saveApprovedSnapshot } from '../../src/core/run-flow-store.js';
import { replayMaintenanceArchive, verifyMaintenanceArchive } from '../../src/core/maintenance-archive.js';
import { SprintPhase, SprintStatus } from '../../src/core/sprint-types.js';

let root: string;
const old = '2026-01-01T00:00:00.000Z';
const digest = 'a'.repeat(64);

function proposal(flowId: string, timestamp = old): RunFlowEvent {
  return {
    schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
    type: 'PROPOSAL_SUBMITTED',
    flowId,
    timestamp,
    proposal: {
      flowId, revision: 7, intentSummary: 'ship it', tenant: 'tenant-a', project: 'project-a',
      actor: { id: 'operator' }, origin: 'api',
    },
  };
}

function running(flowId: string): RunFlowEvent[] {
  return [
    proposal(flowId),
    { schemaVersion: 1, type: 'PREVIEW_STARTED', flowId, timestamp: old, revision: 7 },
    { schemaVersion: 1, type: 'PREVIEW_READY', flowId, timestamp: old,
      preview: { flowId, revision: 7, planDigest: digest, taskSummaries: [], policyDecision: 'allow', gateResult: 'pass' } },
    { schemaVersion: 1, type: 'APPROVAL_GRANTED', flowId, timestamp: old,
      revision: 7, planDigest: digest, approvedBy: { id: 'operator' } },
    { schemaVersion: 1, type: 'START_REQUESTED', flowId, timestamp: old, revision: 7, planDigest: digest },
    { schemaVersion: 1, type: 'RUN_STARTED', flowId, timestamp: old,
      handle: { flowId, jobId: `job-${flowId}`, logRef: `log-${flowId}` } },
  ];
}

function append(flowId: string, events: RunFlowEvent[]): void {
  appendFlowEvents(root, flowId, events);
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'run-flow-retention-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('run-flow journal retention', () => {
  it('archives a terminal journal with revision/digest lineage while canonical history survives', () => {
    const flowId = 'terminal-flow';
    append(flowId, [
      ...running(flowId),
      { schemaVersion: 1, type: 'RUN_COMPLETED', flowId, timestamp: old, summary: 'done' },
    ]);
    const projection = join(root, '.deckent/runtime/run-flow-store', `${flowId}.events.jsonl`);
    const original = readFileSync(projection, 'utf8');

    const result = applyRunFlowRetention(root, { now: new Date('2026-08-23T00:00:00Z') });
    expect(result.failures).toEqual([]);
    expect(result.archived).toEqual([expect.objectContaining({
      flowId, revision: 7, planDigest: digest, eventHead: 7, reason: 'terminal',
    })]);
    expect(result.archived[0]!.publication.manifest.lineage).toContain(`revision=7;planDigest=${digest};eventHead=7`);
    expect(verifyMaintenanceArchive(root, result.archived[0]!.publication.manifestPath).ok).toBe(true);
    expect(existsSync(projection)).toBe(false);
    expect(readFlowEvents(root, flowId)).toHaveLength(7);

    replayMaintenanceArchive(root, result.archived[0]!.publication.manifestPath, 'replayed/events.jsonl');
    expect(readFileSync(join(root, 'replayed/events.jsonl'), 'utf8')).toBe(original);

    const retry = applyRunFlowRetention(root);
    expect(retry.archived).toEqual([]);
    expect(retry.failures).toEqual([]);
    expect(retry.held).toContainEqual({ flowId, reason: 'journal-projection-absent' });
  });

  it('preserves proposed, approved, running, resumable, and ambiguous flows', () => {
    append('proposed', [proposal('proposed')]);
    append('approved', running('approved').slice(0, 4));
    append('running', running('running'));
    append('paused', [
      ...running('paused'),
      { schemaVersion: 1, type: 'RUN_PAUSED', flowId: 'paused', timestamp: old, reason: 'operator pause', resumeCommand: 'resume' },
    ]);
    append('ambiguous', running('ambiguous'));
    saveApprovedSnapshot(root, {
      flowId: 'ambiguous', revision: 8, planDigest: 'b'.repeat(64), approvedBy: { id: 'operator' },
      approvedAt: old,
      sprint: { id: 'sprint-8', number: 8, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN, tasks: [], workers: [] },
    });

    const result = applyRunFlowRetention(root, {
      now: new Date('2026-08-23T00:00:00Z'), staleAfterMs: 1,
      liveness: [{ flowId: 'running', state: 'unknown', observedAt: old, eventHead: 6, revision: 7, planDigest: digest }],
    });
    expect(result.archived).toEqual([]);
    expect(result.held).toEqual(expect.arrayContaining([
      { flowId: 'proposed', reason: 'live-authority' },
      { flowId: 'approved', reason: 'live-authority' },
      { flowId: 'running', reason: 'liveness-unproven' },
      { flowId: 'paused', reason: 'resumable-authority' },
      { flowId: 'ambiguous', reason: 'ambiguous-authority' },
    ]));
    for (const flowId of ['proposed', 'approved', 'running', 'paused', 'ambiguous']) {
      expect(existsSync(join(root, '.deckent/runtime/run-flow-store', `${flowId}.events.jsonl`))).toBe(true);
    }
  });

  it('archives only stale running flows with exact fresh dead-liveness lineage', () => {
    append('dead', running('dead'));
    append('mismatch', running('mismatch'));
    append('fresh', running('fresh').map(event => ({ ...event, timestamp: '2026-08-22T23:59:59.900Z' })));
    const result = applyRunFlowRetention(root, {
      now: new Date('2026-08-23T00:00:00Z'), staleAfterMs: 1_000,
      liveness: [
        { flowId: 'dead', state: 'dead', observedAt: '2026-08-23T00:00:00Z', eventHead: 6, revision: 7, planDigest: digest },
        { flowId: 'mismatch', state: 'dead', observedAt: '2026-08-23T00:00:00Z', eventHead: 5, revision: 7, planDigest: digest },
        { flowId: 'fresh', state: 'dead', observedAt: '2026-08-23T00:00:00Z', eventHead: 6, revision: 7, planDigest: digest },
      ],
    });
    expect(result.archived).toEqual([expect.objectContaining({ flowId: 'dead', reason: 'stale-dead' })]);
    expect(result.held).toEqual(expect.arrayContaining([
      { flowId: 'mismatch', reason: 'liveness-lineage-mismatch' },
      { flowId: 'fresh', reason: 'not-stale' },
    ]));
  });

  it('fails closed on malformed canonical event payloads', () => {
    append('malformed', [
      proposal('malformed'),
      // Syntactically valid but impossible: completion cannot precede preview/start.
      { schemaVersion: 1, type: 'RUN_COMPLETED', flowId: 'malformed', timestamp: old },
    ]);
    const result = applyRunFlowRetention(root);
    expect(result.archived).toEqual([]);
    expect(result.held).toContainEqual({ flowId: 'malformed', reason: 'malformed-journal' });
    expect(existsSync(join(root, '.deckent/runtime/run-flow-store/malformed.events.jsonl'))).toBe(true);
  });
});
