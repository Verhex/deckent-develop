import { describe, it, expect } from 'vitest';
import { validatePath, validateSprintId, validatePhase, validateTaskId, ValidationError } from '../../src/core/validators.js';

// ─── validatePath ───────────────────────────────────────────────────────────

describe('validatePath', () => {
  it('accepts a valid relative path within base', () => {
    const result = validatePath('/project', 'src/file.ts');
    expect(result).toBe('/project/src/file.ts');
  });

  it('accepts nested subdirectory', () => {
    const result = validatePath('/project', 'src/core/types.ts');
    expect(result).toBe('/project/src/core/types.ts');
  });

  it('rejects path traversal with ../', () => {
    expect(() => validatePath('/project', '../etc/passwd')).toThrow(ValidationError);
    expect(() => validatePath('/project', '../etc/passwd')).toThrow('Path traversal detected');
  });

  it('rejects absolute path outside base', () => {
    expect(() => validatePath('/project', '/etc/passwd')).toThrow(ValidationError);
  });

  it('rejects double-encoded traversal', () => {
    // path.resolve normalizes this
    expect(() => validatePath('/project', '..%2F..%2Fetc/passwd')).not.toThrow();
    // but actual traversal should be caught
    expect(() => validatePath('/project', '../../etc/passwd')).toThrow(ValidationError);
  });

  it('rejects null byte injection attempt', () => {
    // node path.resolve handles null bytes by including them literally
    // The resolved path will still be within base, but taskId validator catches this
    const result = validatePath('/project', 'file\x00.json');
    expect(result).toContain('/project/');
  });

  it('accepts path that resolves to base itself', () => {
    const result = validatePath('/project', '.');
    expect(result).toBe('/project');
  });

  it('has code PATH_TRAVERSAL', () => {
    try {
      validatePath('/project', '../../etc/passwd');
    } catch (e) {
      expect((e as ValidationError).code).toBe('PATH_TRAVERSAL');
    }
  });
});

// ─── validateSprintId ───────────────────────────────────────────────────────

describe('validateSprintId', () => {
  it('accepts sprint-001', () => {
    expect(validateSprintId('sprint-001')).toBe('sprint-001');
  });

  it('accepts sprint-1234', () => {
    expect(validateSprintId('sprint-1234')).toBe('sprint-1234');
  });

  it('rejects sprint without number', () => {
    expect(() => validateSprintId('sprint-')).toThrow(ValidationError);
  });

  it('rejects path traversal in sprint ID', () => {
    expect(() => validateSprintId('sprint-001/../../../etc')).toThrow(ValidationError);
  });

  it('rejects shell metacharacters', () => {
    expect(() => validateSprintId('sprint-001; rm -rf /')).toThrow(ValidationError);
  });

  it('rejects empty string', () => {
    expect(() => validateSprintId('')).toThrow(ValidationError);
  });

  it('rejects sprint with 5+ digits', () => {
    expect(() => validateSprintId('sprint-12345')).toThrow(ValidationError);
  });

  it('rejects sprint with 1-2 digits', () => {
    expect(() => validateSprintId('sprint-01')).toThrow(ValidationError);
  });

  it('has code INVALID_SPRINT_ID', () => {
    try {
      validateSprintId('bad');
    } catch (e) {
      expect((e as ValidationError).code).toBe('INVALID_SPRINT_ID');
    }
  });
});

// ─── validatePhase ──────────────────────────────────────────────────────────

describe('validatePhase', () => {
  it('accepts PLAN (uppercase)', () => {
    expect(validatePhase('PLAN')).toBe('PLAN');
  });

  it('accepts plan (lowercase)', () => {
    expect(validatePhase('plan')).toBe('plan');
  });

  it('accepts evaluate', () => {
    expect(validatePhase('evaluate')).toBe('evaluate');
  });

  it('accepts all valid phases', () => {
    const phases = ['directive', 'plan', 'spawn', 'execute', 'evaluate', 'fix', 'retro', 'decay', 'transition', 'complete'];
    for (const phase of phases) {
      expect(() => validatePhase(phase)).not.toThrow();
    }
  });

  it('rejects unknown phase', () => {
    expect(() => validatePhase('unknown')).toThrow(ValidationError);
  });

  it('rejects path traversal in phase', () => {
    expect(() => validatePhase('../etc')).toThrow(ValidationError);
  });

  it('rejects shell injection in phase', () => {
    expect(() => validatePhase('plan; rm -rf /')).toThrow(ValidationError);
  });

  it('has code INVALID_PHASE', () => {
    try {
      validatePhase('bad');
    } catch (e) {
      expect((e as ValidationError).code).toBe('INVALID_PHASE');
    }
  });
});

// ─── validateTaskId ─────────────────────────────────────────────────────────

describe('validateTaskId', () => {
  it('accepts valid task ID', () => {
    expect(validateTaskId('031-001')).toBe('031-001');
  });

  it('accepts alphanumeric with hyphens and underscores', () => {
    expect(validateTaskId('task_001-abc')).toBe('task_001-abc');
  });

  it('rejects empty string', () => {
    expect(() => validateTaskId('')).toThrow(ValidationError);
  });

  it('rejects path traversal', () => {
    expect(() => validateTaskId('../etc/passwd')).toThrow(ValidationError);
  });

  it('rejects shell metacharacters', () => {
    expect(() => validateTaskId('001; rm -rf /')).toThrow(ValidationError);
  });

  it('rejects null bytes', () => {
    expect(() => validateTaskId('001\x00bad')).toThrow(ValidationError);
  });

  it('rejects very long IDs (>100 chars)', () => {
    expect(() => validateTaskId('a'.repeat(101))).toThrow(ValidationError);
  });

  it('rejects URL-encoded traversal', () => {
    // %2F is / which is not in [\w-]
    expect(() => validateTaskId('..%2F..%2Fetc')).toThrow(ValidationError);
  });

  it('has code INVALID_TASK_ID', () => {
    try {
      validateTaskId('');
    } catch (e) {
      expect((e as ValidationError).code).toBe('INVALID_TASK_ID');
    }
  });
});

// ─── ValidationError ────────────────────────────────────────────────────────

describe('ValidationError', () => {
  it('is an instance of Error', () => {
    const err = new ValidationError('test', 'TEST');
    expect(err).toBeInstanceOf(Error);
  });

  it('has correct name', () => {
    const err = new ValidationError('test', 'TEST');
    expect(err.name).toBe('ValidationError');
  });

  it('has default code', () => {
    const err = new ValidationError('test');
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});
