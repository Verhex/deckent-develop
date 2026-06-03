import { describe, it, expect } from 'vitest';
import { classifyTool } from '../../src/cli/repl/tool-permissions.js';

describe('classifyTool — REPL confirm hierarchy', () => {
  it('read-only tools → read (no confirm)', () => {
    expect(classifyTool('deckent_status', {})).toBe('read');
    expect(classifyTool('deckent_analyze_project', {})).toBe('read');
    expect(classifyTool('deckent_agent_list', {})).toBe('read');
  });

  it('config show / get / list → read', () => {
    expect(classifyTool('deckent_config', {})).toBe('read');
    expect(classifyTool('deckent_config', { _rest: ['get', 'max_workers'] })).toBe('read');
    expect(classifyTool('deckent_config', { _rest: ['list'] })).toBe('read');
    expect(classifyTool('deckent_config', { _rest: ['keys'] })).toBe('read');
  });

  it('config set / import / migrate → confirm (mutates config.json)', () => {
    expect(classifyTool('deckent_config', { _rest: ['set', 'max_workers', '4'] })).toBe('confirm');
    expect(classifyTool('deckent_config', { _rest: ['import', 'cfg.json'] })).toBe('confirm');
    expect(classifyTool('deckent_config', { _rest: ['migrate'] })).toBe('confirm');
  });

  it('write tools → confirm (once, "a" remembered)', () => {
    expect(classifyTool('deckent_plan', {})).toBe('confirm');
    expect(classifyTool('deckent_sync', {})).toBe('confirm');
    expect(classifyTool('deckent_set_directives', {})).toBe('confirm');
    expect(classifyTool('deckent_docs', {})).toBe('confirm');
    expect(classifyTool('deckent_checkpoint', {})).toBe('confirm');
  });

  it('destructive tools → always (a/allow-list/full-auto overridden)', () => {
    expect(classifyTool('deckent_kill', {})).toBe('always');
    expect(classifyTool('deckent_cleanup', {})).toBe('always');
    expect(classifyTool('deckent_recover', {})).toBe('always');
  });
});
