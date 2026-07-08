import { describe, it, expect } from 'vitest';
import { classifyTool } from '../../src/cli/repl/tool-permissions.js';

// 387-015 (born-524): deckent_start/run/process previously fell through
// classifyTool()'s generic 'read' catch-all instead of getting an explicit
// tier — these are powerful tools (spawn a full sprint / a worker process /
// a process-mode execution) and must not default to the weakest tier.
describe('classifyTool — deckent_start/run/process explicit tier (387-015)', () => {
  it('deckent_start → always (spawns full sprint lifecycle)', () => {
    expect(classifyTool('deckent_start', {})).toBe('always');
    expect(classifyTool('deckent_start', { dryRun: true })).toBe('always');
  });

  it('deckent_run → always (spawns a worker process immediately)', () => {
    expect(classifyTool('deckent_run', {})).toBe('always');
    expect(classifyTool('deckent_run', { description: 'fix bug' })).toBe('always');
  });

  it('deckent_process: submit (default) → always, status/result → read', () => {
    expect(classifyTool('deckent_process', { action: 'submit', description: 'x' })).toBe('always');
    expect(classifyTool('deckent_process', {})).toBe('always');
    expect(classifyTool('deckent_process', { action: 'status', executionId: 'e-1' })).toBe('read');
    expect(classifyTool('deckent_process', { action: 'result', executionId: 'e-1' })).toBe('read');
  });

  it('does not regress other tools already classified (spot-check)', () => {
    expect(classifyTool('deckent_status', {})).toBe('read');
    expect(classifyTool('deckent_plan', {})).toBe('confirm');
    expect(classifyTool('deckent_kill', {})).toBe('always');
    expect(classifyTool('deckent_config', {})).toBe('read');
    expect(classifyTool('deckent_config', { _rest: ['set', 'max_workers', '4'] })).toBe('confirm');
    expect(classifyTool('deckent_autonomous', { action: 'status' })).toBe('read');
    expect(classifyTool('deckent_autonomous', { action: 'approve', triggerId: 't-1' })).toBe('confirm');
    expect(classifyTool('deckent_audit', { action: 'query' })).toBe('read');
  });
});
