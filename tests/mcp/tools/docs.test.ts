import { describe, it, expect } from 'vitest';
import { validatePath, ValidationError } from '../../../src/core/validators.js';

// These tests verify that the validation functions used by docs.ts
// correctly reject malicious file paths that could cause path traversal.

describe('docs validation integration', () => {
  it('accepts valid relative file path', () => {
    const result = validatePath('/project', 'docs/guide.md');
    expect(result).toBe('/project/docs/guide.md');
  });

  it('accepts nested file path', () => {
    const result = validatePath('/project', 'src/core/types.ts');
    expect(result).toBe('/project/src/core/types.ts');
  });

  it('rejects path traversal with ../', () => {
    expect(() => validatePath('/project', '../etc/passwd')).toThrow(ValidationError);
  });

  it('rejects double traversal ../../', () => {
    expect(() => validatePath('/project', '../../etc/shadow')).toThrow(ValidationError);
  });

  it('rejects absolute path outside root', () => {
    expect(() => validatePath('/project', '/etc/passwd')).toThrow(ValidationError);
  });

  it('rejects traversal hidden in nested path', () => {
    expect(() => validatePath('/project', 'docs/../../etc/passwd')).toThrow(ValidationError);
  });

  it('accepts file at root level', () => {
    const result = validatePath('/project', 'README.md');
    expect(result).toBe('/project/README.md');
  });
});
