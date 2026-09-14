import { performance } from 'node:perf_hooks';

export interface CustodyReadSnapshotBounds {
  readonly maxEntries: number;
  readonly maxBytes: number;
  readonly maxDurationMs: number;
}

export interface CustodyReadSnapshotStatistics {
  readonly observations: number;
  readonly observationHits: number;
  readonly semanticHits: number;
  readonly retainedBytes: number;
  readonly peakRetainedBytes: number;
  readonly durationMs: number;
}

/** A single synchronous read operation, never a persistent authority cache.
 * Each distinct physical observation is repeated before a result can escape.
 * Callers must supply validated, owned values and stable fingerprints. */
export class CustodyReadSnapshot {
  private readonly started = performance.now();
  private readonly observations = new Map<string, {
    value: unknown; cached: boolean; valueBytes: number; expected: string; check: () => void;
  }>();
  private readonly semantic = new Map<string, unknown>();
  private retainedBytes = 0;
  private peakRetainedBytes = 0;
  private observationHits = 0;
  private semanticHits = 0;
  private semanticBytes = 0;
  private invalidReason: 'changed' | 'budget' | 'deadline' | 'mutation' | null = null;
  private readonly owners = new WeakMap<object, number>();
  private nextOwnerId = 0;

  constructor(
    private readonly bounds: CustodyReadSnapshotBounds,
    private readonly refuse: (reason: 'changed' | 'budget' | 'deadline' | 'mutation') => never,
  ) {
    if (![bounds.maxEntries, bounds.maxBytes, bounds.maxDurationMs]
      .every(value => Number.isSafeInteger(value) && value > 0)
      || bounds.maxEntries > 100_000 || bounds.maxBytes > 64 * 1024 * 1024
      || bounds.maxDurationMs > 600_000) this.fail('budget');
  }

  private fail(reason: 'changed' | 'budget' | 'deadline' | 'mutation'): never {
    this.invalidReason ??= reason;
    return this.refuse(this.invalidReason);
  }

  assertCurrent(): void {
    if (this.invalidReason) this.fail(this.invalidReason);
    if (performance.now() - this.started > this.bounds.maxDurationMs) this.fail('deadline');
  }

  denyMutation(): never { return this.fail('mutation'); }

  /** Release payload ownership at a consumer boundary, retaining every original
   * observation fence. Re-reading an evicted value must still match that fence.
   * This measures cache ownership, not process RSS or values held by callers. */
  releaseCachedValues(): void {
    this.assertCurrent();
    for (const observation of this.observations.values()) {
      if (!observation.cached) continue;
      observation.value = undefined;
      observation.cached = false;
      this.retainedBytes -= observation.valueBytes;
    }
    this.semantic.clear();
    this.retainedBytes -= this.semanticBytes;
    this.semanticBytes = 0;
  }

  private retain(bytes: number, newEntry = true): void {
    this.assertCurrent();
    if (!Number.isSafeInteger(bytes) || bytes < 0
      || (newEntry && this.observations.size + this.semantic.size >= this.bounds.maxEntries)
      || this.retainedBytes + bytes > this.bounds.maxBytes) this.fail('budget');
    this.retainedBytes += bytes;
    this.peakRetainedBytes = Math.max(this.peakRetainedBytes, this.retainedBytes);
  }

  observe<T>(key: string, read: () => T, fingerprint: (value: T) => string,
    size: (value: T) => number, copy: (value: T) => T): T {
    this.assertCurrent();
    const existing = this.observations.get(key);
    if (existing?.cached) {
      this.observationHits++;
      return copy(existing.value as T);
    }
    let value: T;
    try { value = read(); } catch (error) { this.invalidReason ??= 'changed'; throw error; }
    const expected = fingerprint(value);
    const valueBytes = size(value);
    if (existing) {
      if (expected !== existing.expected) this.fail('changed');
      this.retain(valueBytes, false);
      existing.value = value;
      existing.cached = true;
      existing.valueBytes = valueBytes;
      return copy(value);
    }
    this.retain(valueBytes + Buffer.byteLength(key) + Buffer.byteLength(expected));
    this.observations.set(key, { value, cached: true, valueBytes, expected, check: () => {
      this.assertCurrent();
      if (fingerprint(read()) !== expected) this.fail('changed');
    } });
    return copy(value);
  }

  /** Only deeply immutable JSON facts belong here; byte buffers and capabilities
   * remain on their existing reader/issuance paths. */
  memo<T>(key: string, read: () => T): T {
    this.assertCurrent();
    if (this.semantic.has(key)) {
      this.semanticHits++;
      return this.semantic.get(key) as T;
    }
    let value: T;
    try { value = read(); } catch (error) { this.invalidReason ??= 'changed'; throw error; }
    const seen = new Set<object>();
    const freeze = (item: unknown): void => {
      if (item === null || typeof item !== 'object' || seen.has(item)) return;
      if (ArrayBuffer.isView(item)) this.fail('mutation');
      seen.add(item);
      for (const field of Object.values(item)) freeze(field);
      Object.freeze(item);
    };
    freeze(value);
    const bytes = JSON.stringify(value);
    if (bytes === undefined) this.fail('mutation');
    const retained = Buffer.byteLength(bytes) + Buffer.byteLength(key);
    this.retain(retained);
    this.semanticBytes += retained;
    this.semantic.set(key, value);
    return value;
  }

  memoForOwner<T>(owner: object, key: string, read: () => T): T {
    this.assertCurrent();
    let id = this.owners.get(owner);
    if (id === undefined) { id = ++this.nextOwnerId; this.owners.set(owner, id); }
    return this.memo(`consumer:${id}:${key}`, read);
  }

  verify(): CustodyReadSnapshotStatistics {
    this.assertCurrent();
    // The Store detaches this view before invoking verify, so these closures
    // call real adapter reads rather than observing their own cached answers.
    for (const [key, observation] of this.observations) {
      if (!key.startsWith('scan:')) observation.check();
    }
    // Discovery membership is fenced last; an admission appended while other
    // evidence was being verified cannot disappear from the final decision.
    for (const [key, observation] of this.observations) {
      if (key.startsWith('scan:')) observation.check();
    }
    this.assertCurrent();
    return Object.freeze({ observations: this.observations.size,
      observationHits: this.observationHits, semanticHits: this.semanticHits,
      retainedBytes: this.retainedBytes, peakRetainedBytes: this.peakRetainedBytes,
      durationMs: performance.now() - this.started });
  }
}
