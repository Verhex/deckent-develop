// tests/cli/repl/tool-target.test.ts
// 7114 — bounded, secret-free tool-line target + elapsed helper.
import { describe, it, expect } from 'vitest';
import { describeToolTarget, toolElapsedMs, TOOL_TARGET_MAX_CHARS } from '../../../src/cli/repl/tool-target.js';

describe('describeToolTarget', () => {
  it('file read: path + inclusive line range / legacy offset+limit / outline+search modes', () => {
    expect(describeToolTarget('deckent_read_file', { path: 'docs/MASTER-PLAN.md' })).toBe('docs/MASTER-PLAN.md');
    expect(describeToolTarget('deckent_read_file', { path: 'docs/MASTER-PLAN.md', startLine: 120, endLine: 240 })).toBe('docs/MASTER-PLAN.md:120-240');
    expect(describeToolTarget('deckent_read_file', { path: 'a.md', offset: 300, limit: 50 })).toBe('a.md:300+50');
    expect(describeToolTarget('deckent_read_file', { path: 'a.md', mode: 'outline' })).toBe('a.md [outline]');
    expect(describeToolTarget('deckent_read_file', { path: 'a.md', mode: 'search', query: 'P0' })).toBe('a.md [search] "P0"');
    expect(describeToolTarget('deckent_read_file', { path: 'a.md', mode: 'content' })).toBe('a.md');
  });

  it('shell: first line of the command only, credentials redacted', () => {
    expect(describeToolTarget('deckent_bash', { cmd: 'git status --short' })).toBe('git status --short');
    expect(describeToolTarget('bash', { command: 'ls -la\nrm -rf /' })).toBe('ls -la …');
    const leaky = describeToolTarget('deckent_bash', { cmd: 'curl -H "Authorization: Bearer sk-ant-verysecret-token" https://x' });
    expect(leaky).not.toContain('sk-ant-verysecret-token');
    expect(leaky).toContain('[REDACTED]');
    expect(describeToolTarget('deckent_bash', { cmd: 'export OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456 && run' })).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
  });

  it('content ref: digest prefix + byte window, never the whole digest', () => {
    const ref = 'a'.repeat(64);
    expect(describeToolTarget('deckent_read_content_ref', { ref, offset: 4096, limit: 8192 })).toBe(`${'a'.repeat(12)}… @4096+8192`);
    expect(describeToolTarget('deckent_read_content_ref', { ref })).toBe(`${'a'.repeat(12)}…`);
  });

  it('grep/glob: pattern (+ path); other tools: url/query; nothing displayable → empty', () => {
    expect(describeToolTarget('deckent_grep', { pattern: 'TODO', path: 'src' })).toBe('TODO src');
    expect(describeToolTarget('deckent_glob', { pattern: '**/*.ts' })).toBe('**/*.ts');
    expect(describeToolTarget('deckent_fetch', { url: 'https://user:pw@host/x' })).toBe('https://user:[REDACTED]@host/x');
    expect(describeToolTarget('deckent_memory_query', { query: 'routing' })).toBe('routing');
    expect(describeToolTarget('deckent_git_status', {})).toBe('');
    expect(describeToolTarget('deckent_git_status', undefined)).toBe('');
  });

  it('clips a long target to the glance budget with an ellipsis', () => {
    const long = describeToolTarget('deckent_read_file', { path: `${'d/'.repeat(80)}f.md` });
    expect(Array.from(long).length).toBe(TOOL_TARGET_MAX_CHARS);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('toolElapsedMs', () => {
  it('rounds and clamps at zero; undefined start → undefined', () => {
    expect(toolElapsedMs(1_000, 1_412.6)).toBe(413);
    expect(toolElapsedMs(2_000, 1_000)).toBe(0);
    expect(toolElapsedMs(undefined, 5)).toBeUndefined();
  });
});
