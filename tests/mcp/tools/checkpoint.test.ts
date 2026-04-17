import { describe, it, expect } from 'vitest';
import { validateSprintId, validatePhase, validatePath, ValidationError } from '../../../src/core/validators.js';

// These tests verify that the validation functions used by checkpoint.ts
// correctly reject malicious inputs that could cause path traversal.

describe('checkpoint validation integration', () => {
  it('rejects path traversal in sprintId', () => {
    expect(() => validateSprintId('sprint-001/../../etc')).toThrow(ValidationError);
  });

  it('rejects shell injection in sprintId', () => {
    expect(() => validateSprintId('sprint-001$(rm -rf /)')).toThrow(ValidationError);
  });

  it('rejects backtick injection in sprintId', () => {
    expect(() => validateSprintId('sprint-`whoami`')).toThrow(ValidationError);
  });

  it('accepts valid sprintId for checkpoint', () => {
    expect(validateSprintId('sprint-143')).toBe('sprint-143');
  });

  it('rejects invalid phase for checkpoint', () => {
    expect(() => validatePhase('../../etc')).toThrow(ValidationError);
  });

  it('rejects phase with shell metachar', () => {
    expect(() => validatePhase('plan && cat /etc/passwd')).toThrow(ValidationError);
  });

  it('accepts valid checkpoint phase', () => {
    expect(validatePhase('plan')).toBe('plan');
    expect(validatePhase('evaluate')).toBe('evaluate');
    expect(validatePhase('fix')).toBe('fix');
  });

  it('validates constructed checkpoint file path stays within dir', () => {
    const dir = '/project/.deckent/checkpoints';
    const validFile = 'checkpoint-sprint-143-plan.json';
    expect(validatePath(dir, validFile)).toBe(`${dir}/${validFile}`);
  });

  it('rejects checkpoint path traversal attempt', () => {
    const dir = '/project/.deckent/checkpoints';
    expect(() => validatePath(dir, '../../../etc/passwd')).toThrow(ValidationError);
  });
});
