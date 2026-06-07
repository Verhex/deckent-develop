// src/orchestra/autonomous/reactive/nervous-reactive-source.ts
// Subscribes a reactive ingester to the nervous observer's 'detection' events.
// Normalizes DetectorResult → ReactiveEvent and forwards to ingester.ingest.
import type { EventEmitter } from 'node:events';
import type { DetectorResult } from '../../../core/nervous-types.js';
import type { ReactiveEvent } from './reactive-types.js';
import type { IngestOutcome } from './reactive-ingester.js';

export interface NervousReactiveSourceDeps {
  /** The nervous observer (EventEmitter that emits 'detection'). */
  observer: EventEmitter;
  ingester: { ingest(ev: ReactiveEvent): IngestOutcome };
}

function normalize(result: DetectorResult): ReactiveEvent {
  return {
    sourceType: 'nervous',
    risk: result.risk,
    severity: result.severity,
    groupKey: result.groupKey,
    metadata: result.metadata,
  };
}

/** Subscribe a reactive ingester to the nervous observer's 'detection' events. */
export function makeNervousReactiveSource(deps: NervousReactiveSourceDeps): { start(): void; stop(): void } {
  const handler = (result: DetectorResult): void => {
    deps.ingester.ingest(normalize(result));
  };
  return {
    start(): void { deps.observer.on('detection', handler); },
    stop(): void { deps.observer.off('detection', handler); },
  };
}
