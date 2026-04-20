import { describe, it, expect } from 'vitest';
import { sanitizeScope } from '../../src/orchestra/scope-sanitizer.js';

describe('scope-sanitizer', () => {
  it('removes dist/ prefix paths', () => {
    const result = sanitizeScope(['dist/cli/entry.js', 'src/core/config.ts']);
    expect(result.filesWrite).toEqual(['src/core/config.ts']);
    expect(result.rejected).toEqual([]);
  });

  it('removes extension-only paths like .ts', () => {
    const result = sanitizeScope(['.ts', '.md', 'src/core/types.ts']);
    expect(result.filesWrite).toEqual(['src/core/types.ts']);
  });

  it('removes unqualified filenames with warning', () => {
    const result = sanitizeScope(['init.ts', 'src/core/init.ts']);
    expect(result.filesWrite).toEqual(['src/core/init.ts']);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('init.ts');
  });

  it('removes global protected files like config.json', () => {
    const result = sanitizeScope(['config.json', 'src/core/config.ts']);
    expect(result.filesWrite).toEqual(['src/core/config.ts']);
  });

  it('deduplicates case-insensitive paths', () => {
    const result = sanitizeScope(['src/a.ts', 'src/a.ts', 'src/A.ts']);
    expect(result.filesWrite).toEqual(['src/a.ts']);
  });

  it('strips (yeni) suffix and deduplicates', () => {
    const result = sanitizeScope(['src/a.ts (yeni)', 'src/a.ts']);
    expect(result.filesWrite).toEqual(['src/a.ts']);
  });

  it('rejects path traversal with ..', () => {
    const result = sanitizeScope(['../etc/passwd', 'src/core/types.ts']);
    expect(result.filesWrite).toEqual(['src/core/types.ts']);
    expect(result.rejected).toEqual(['../etc/passwd']);
  });

  it('rejects absolute paths', () => {
    const result = sanitizeScope(['/etc/passwd', 'src/core/types.ts']);
    expect(result.filesWrite).toEqual(['src/core/types.ts']);
    expect(result.rejected).toEqual(['/etc/passwd']);
  });

  it('leaves normal scope unchanged', () => {
    const input = ['src/core/config.ts', 'src/orchestra/task-builder.ts', 'tests/core/config.test.ts'];
    const result = sanitizeScope(input);
    expect(result.filesWrite).toEqual(input);
    expect(result.warnings).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it('integration: task-builder scope output is sanitized', async () => {
    // Import buildWorkerPrompt and verify it uses sanitized scope
    const { buildWorkerPrompt } = await import('../../src/orchestra/task-builder.js');
    const task = {
      id: '146-004',
      title: 'Test Task',
      description: 'A test task',
      model: 'sonnet' as const,
      effort: 'normal' as const,
      priority: 'NORMAL' as const,
      reason: 'test',
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['dist/cli/entry.js', 'config.json', 'src/core/config.ts', '../etc/passwd'],
      },
      dependencies: [],
      goNogo: { goCriteria: 'test', noGoCriteria: 'test', techDebtAcceptable: 'test' },
      status: 'PENDING' as const,
      sprintId: 'sprint-146',
      createdAt: new Date().toISOString(),
    };

    const prompt = buildWorkerPrompt(task as any);
    // dist/cli/entry.js should NOT appear in prompt
    expect(prompt).not.toContain('dist/cli/entry.js');
    // config.json (unqualified global protected) should NOT appear
    expect(prompt).not.toContain('  - config.json');
    // ../etc/passwd should NOT appear in scope files listing
    expect(prompt).not.toContain('  - ../etc/passwd');
    // src/core/config.ts should appear
    expect(prompt).toContain('src/core/config.ts');
  });
});
