import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReactiveMap, validateReactiveRule, mapEventToEntry } from '../../../../src/orchestra/autonomous/reactive/reactive-map.js';
import type { ReactiveEvent, ReactiveRule, ReactiveMapFile } from '../../../../src/orchestra/autonomous/reactive/reactive-types.js';

const rule: ReactiveRule = {
  match: { groupKey: 'debt_trend', minRisk: 'medium' },
  entryTemplate: { kind: 'task', policy: 'approval-required', spec: { description: 'Review debt' }, titlePrefix: '[reactive] debt' },
  dedupKey: 'debt_trend',
};
const map: ReactiveMapFile = { _version: '1.0', rules: [rule] };
const ev = (over: Partial<ReactiveEvent> = {}): ReactiveEvent => ({ sourceType: 'nervous', risk: 'high', groupKey: 'debt_trend', ...over });
const idGen = (): string => 'rx-1';

describe('reactive-map', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rmap-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('loadReactiveMap returns empty map when file absent', () => {
    expect(loadReactiveMap(join(dir, 'none.json')).rules).toEqual([]);
  });
  it('loadReactiveMap loads a valid file', () => {
    const p = join(dir, 'm.json'); writeFileSync(p, JSON.stringify(map));
    expect(loadReactiveMap(p).rules).toHaveLength(1);
  });
  it('validateReactiveRule rejects a rule with no match criteria', () => {
    expect(validateReactiveRule({ match: {}, entryTemplate: rule.entryTemplate })).toMatch(/match/);
  });
  it('validateReactiveRule accepts a valid rule', () => {
    expect(validateReactiveRule(rule)).toBeNull();
  });
  it('mapEventToEntry matches by groupKey + risk threshold → entry', () => {
    const entry = mapEventToEntry(ev(), map, idGen);
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe('task');
    expect(entry!.policy).toBe('approval-required');
    expect(entry!.trigger).toEqual({ type: 'reactive', detector: 'debt_trend' });
    expect(entry!.status).toBe('pending');
  });
  it('mapEventToEntry returns null when groupKey differs', () => {
    expect(mapEventToEntry(ev({ groupKey: 'other' }), map, idGen)).toBeNull();
  });
  it('mapEventToEntry returns null when risk below threshold', () => {
    expect(mapEventToEntry(ev({ risk: 'low' }), map, idGen)).toBeNull();
  });
  it('mapEventToEntry folds risk/severity into description', () => {
    const entry = mapEventToEntry(ev({ severity: 'critical' }), map, idGen);
    expect(entry!.spec.description).toMatch(/Review debt/);
    expect(entry!.spec.description).toMatch(/high|critical/);
  });
});
