import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { PromptEvolutionLog } from '../../src/agents/prompt-evolution.js';
import type { EvolutionEvent, EvolutionTimeline } from '../../src/agents/prompt-evolution.js';

vi.mock('node:fs');

const ROOT = '/tmp/test-project';

function makeEvent(overrides: Partial<EvolutionEvent> = {}): EvolutionEvent {
  return {
    type: 'improved',
    version: '1.0.0',
    timestamp: '2026-03-22T00:00:00Z',
    triggerReason: 'Low success rate',
    statsAtTime: { successRate: 0.7, totalUses: 10, avgCoverage: 80 },
    ...overrides,
  };
}

describe('PromptEvolutionLog', () => {
  let log: PromptEvolutionLog;

  beforeEach(() => {
    vi.restoreAllMocks();
    log = new PromptEvolutionLog(ROOT);
  });

  // ─── recordEvolution ──────────────────────────────────────────

  it('records an evolution event', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const event = makeEvent();
    log.recordEvolution('agent-1', event);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(written).toHaveLength(1);
    expect(written[0].type).toBe('improved');
  });

  it('appends to existing events', () => {
    const existing = [makeEvent({ version: '0.1.0', type: 'created' })];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    log.recordEvolution('agent-1', makeEvent({ version: '1.0.0' }));

    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(written).toHaveLength(2);
  });

  // ─── getEvolutionTimeline ─────────────────────────────────────

  it('returns empty timeline when no file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const timeline = log.getEvolutionTimeline('agent-1');
    expect(timeline.agentId).toBe('agent-1');
    expect(timeline.events).toEqual([]);
    expect(timeline.totalEvolutions).toBe(0);
    expect(timeline.latestVersion).toBe('0.0.0');
  });

  it('returns timeline with events', () => {
    const events = [
      makeEvent({ version: '0.1.0', type: 'created' }),
      makeEvent({ version: '1.0.0', type: 'improved' }),
    ];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(events));

    const timeline = log.getEvolutionTimeline('agent-1');
    expect(timeline.totalEvolutions).toBe(2);
    expect(timeline.latestVersion).toBe('1.0.0');
  });

  it('handles invalid JSON gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not-json');

    const timeline = log.getEvolutionTimeline('agent-1');
    expect(timeline.events).toEqual([]);
  });

  it('handles non-array JSON gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ not: 'array' }));

    const timeline = log.getEvolutionTimeline('agent-1');
    expect(timeline.events).toEqual([]);
  });

  // ─── formatTimeline ───────────────────────────────────────────

  it('formats empty timeline', () => {
    const timeline: EvolutionTimeline = {
      agentId: 'agent-1',
      events: [],
      totalEvolutions: 0,
      latestVersion: '0.0.0',
    };
    const formatted = log.formatTimeline(timeline);
    expect(formatted).toContain('No evolution events');
  });

  it('formats timeline with events', () => {
    const timeline: EvolutionTimeline = {
      agentId: 'agent-1',
      events: [makeEvent({ version: '1.0.0', type: 'improved' })],
      totalEvolutions: 1,
      latestVersion: '1.0.0',
    };
    const formatted = log.formatTimeline(timeline);
    expect(formatted).toContain('agent-1');
    expect(formatted).toContain('1.0.0');
    expect(formatted).toContain('IMPROVED');
    expect(formatted).toContain('1 events');
  });

  it('includes stats in formatted output', () => {
    const timeline: EvolutionTimeline = {
      agentId: 'agent-1',
      events: [makeEvent({ statsAtTime: { successRate: 0.85, totalUses: 20, avgCoverage: 90 } })],
      totalEvolutions: 1,
      latestVersion: '1.0.0',
    };
    const formatted = log.formatTimeline(timeline);
    expect(formatted).toContain('success=85%');
    expect(formatted).toContain('uses=20');
  });

  // ─── getEventCount ────────────────────────────────────────────

  it('returns 0 for non-existent agent', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(log.getEventCount('agent-1')).toBe(0);
  });

  it('returns correct count', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([makeEvent(), makeEvent()]));
    expect(log.getEventCount('agent-1')).toBe(2);
  });

  // ─── clearEvents ──────────────────────────────────────────────

  it('clears all events for an agent', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    log.clearEvents('agent-1');

    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(written).toEqual([]);
  });
});
