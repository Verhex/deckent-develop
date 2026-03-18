import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';

describe('getMessage', () => {
  it('returns English hint for known key', () => {
    const msg = getMessage('hint.COMPLETE', 'en');
    expect(msg).toContain('Sprint complete');
    expect(msg).toContain('deckent retro');
  });

  it('returns Turkish hint for known key', () => {
    const msg = getMessage('hint.COMPLETE', 'tr');
    expect(msg).toContain('tamamlandı');
    expect(msg).toContain('deckent retro');
  });

  it('returns key itself for unknown key', () => {
    const msg = getMessage('unknown.key.xyz', 'en');
    expect(msg).toBe('unknown.key.xyz');
  });

  it('returns key for unknown key in Turkish too', () => {
    const msg = getMessage('totally.unknown', 'tr');
    expect(msg).toBe('totally.unknown');
  });

  it('interpolates variables in template', () => {
    const msg = getMessage('status.tasks_running', 'en', { taskCount: '7' });
    expect(msg).toContain('7');
    expect(msg).toContain('tasks running');
  });

  it('interpolates sprintId variable', () => {
    const msg = getMessage('status.sprint_active', 'en', { sprintId: 'sprint-022' });
    expect(msg).toContain('sprint-022');
    expect(msg).toContain('active');
  });

  it('Turkish variable interpolation works', () => {
    const msg = getMessage('status.tasks_running', 'tr', { taskCount: '3' });
    expect(msg).toContain('3');
    expect(msg).toContain('görev');
  });

  it('leaves placeholder if variable missing', () => {
    const msg = getMessage('status.sprint_active', 'en', {});
    expect(msg).toContain('{sprintId}');
  });

  it('works without vars parameter', () => {
    const msg = getMessage('hint.IDLE', 'en');
    expect(msg).toContain('deckent plan');
  });

  it('hint.EXECUTE English', () => {
    const msg = getMessage('hint.EXECUTE', 'en');
    expect(msg).toContain('deckent status --watch');
  });

  it('hint.PLAN Turkish', () => {
    const msg = getMessage('hint.PLAN', 'tr');
    expect(msg).toContain('deckent start');
    expect(msg).toContain('başlatın');
  });

  it('unknown lang falls back to English', () => {
    const msg = getMessage('hint.COMPLETE', 'de');
    expect(msg).toContain('Sprint complete');
  });
});
