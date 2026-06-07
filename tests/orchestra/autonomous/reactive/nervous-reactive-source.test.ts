import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeNervousReactiveSource } from '../../../../src/orchestra/autonomous/reactive/nervous-reactive-source.js';
import type { ReactiveEvent } from '../../../../src/orchestra/autonomous/reactive/reactive-types.js';
import type { DetectorResult } from '../../../../src/core/nervous-types.js';

const detection = (over: Partial<DetectorResult> = {}): DetectorResult => ({
  risk: 'high', suggestedActions: [], shouldNotify: true, severity: 'critical', groupKey: 'debt_trend', ...over,
});

describe('nervous-reactive-source', () => {
  it('normalizes a detection and forwards it to the ingester on start()', () => {
    const observer = new EventEmitter();
    const got: ReactiveEvent[] = [];
    const source = makeNervousReactiveSource({ observer, ingester: { ingest: (ev) => { got.push(ev); return 'written'; } } });
    source.start();
    observer.emit('detection', detection(), { foo: 1 });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ sourceType: 'nervous', risk: 'high', severity: 'critical', groupKey: 'debt_trend' });
  });
  it('stop() removes the listener — later detections are ignored', () => {
    const observer = new EventEmitter();
    const got: ReactiveEvent[] = [];
    const source = makeNervousReactiveSource({ observer, ingester: { ingest: (ev) => { got.push(ev); return 'written'; } } });
    source.start(); source.stop();
    observer.emit('detection', detection(), {});
    expect(got).toHaveLength(0);
  });
});
