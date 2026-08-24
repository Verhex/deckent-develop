import { describe, expect, it } from 'vitest';
import {
  createWorkerActivityHeartbeat,
  parseWorkerActivityHeartbeat,
  renderWorkerActivityHeartbeatInstruction,
  serializeWorkerActivityHeartbeat,
} from '../../src/core/worker-activity-heartbeat.js';

const identity = {
  taskId: '661-003',
  workerId: 'w-661-003',
  attemptId: 'attempt-1',
  backend: 'subprocess' as const,
};

describe('worker activity heartbeat v1', () => {
  it('serializes one versioned identity-bound activity projection', () => {
    const heartbeat = createWorkerActivityHeartbeat({
      ...identity,
      status: 'EXECUTING',
      currentAction: 'Writing focused tests',
    }, () => new Date('2026-08-24T12:00:00.000Z'));

    const wire = serializeWorkerActivityHeartbeat(heartbeat);
    expect(JSON.parse(wire)).toEqual({
      version: 1,
      kind: 'worker-activity-heartbeat',
      ...identity,
      status: 'EXECUTING',
      currentAction: 'Writing focused tests',
      observedAt: '2026-08-24T12:00:00.000Z',
    });
    expect(wire).not.toMatch(/sequence|progress|pid|liveness|verdict/i);
    expect(parseWorkerActivityHeartbeat(JSON.parse(wire))).toEqual({
      state: 'VALID',
      heartbeat,
    });
  });

  it('uses the same field contract in generated worker instructions', () => {
    const instruction = renderWorkerActivityHeartbeatInstruction(identity);
    expect(instruction).toContain('"kind": "worker-activity-heartbeat"');
    for (const [key, value] of Object.entries(identity)) {
      expect(instruction).toContain(`"${key}": "${value}"`);
    }
    expect(instruction).toContain('Do not add sequence, progress, PID');
  });

  it('returns a typed identity HOLD for ambiguous legacy data', () => {
    expect(parseWorkerActivityHeartbeat({
      taskId: '661-003',
      workerId: 'w-661-003',
      status: 'EXECUTING',
      currentAction: 'Working',
      timestamp: '2026-08-24T12:00:00.000Z',
      sequence: 4,
      progress: 30,
    })).toEqual({
      state: 'HOLD',
      reasonCode: 'AMBIGUOUS_LEGACY_IDENTITY',
      detail: 'legacy heartbeat lacks explicit attemptId or backend identity',
    });
  });

  it('types malformed and authority-contaminated payloads instead of coercing', () => {
    expect(parseWorkerActivityHeartbeat('not-an-object')).toMatchObject({
      state: 'HOLD', reasonCode: 'MALFORMED',
    });
    expect(parseWorkerActivityHeartbeat({
      version: 1,
      kind: 'worker-activity-heartbeat',
      ...identity,
      status: 'EXECUTING',
      currentAction: 'Working',
      observedAt: '2026-08-24T12:00:00.000Z',
      sequence: 1,
    })).toMatchObject({ state: 'HOLD', reasonCode: 'LEGACY_SHAPE' });
  });
});
