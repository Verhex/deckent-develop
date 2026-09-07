import { describe, expect, it } from 'vitest';
import { appendSprintHistoricalContext } from '../../../src/cli/repl/sprint-context-input.js';

const context = {
  sprintId: 'sprint-7099',
  manifestDigest: 'a'.repeat(64),
  artifactPath: 'docs/brain-sprint.md' as const,
  sha256: 'b'.repeat(64),
  bytes: 24,
  text: 'historical `note`\n```nested```',
};

describe('appendSprintHistoricalContext', () => {
  it('keeps raw intent first and appends attributed untrusted data as one complete unit', () => {
    const output = appendSprintHistoricalContext('continue the review', context);
    expect(output.startsWith('continue the review\n\n')).toBe(true);
    expect(output).toContain('data-only=true sprint-id=sprint-7099');
    expect(output).toContain(`manifest-sha256=${'a'.repeat(64)}`);
    expect(output).toContain(`artifact-sha256=${'b'.repeat(64)} bytes=24`);
    expect(output).toContain('untrusted historical DATA');
    expect(output).toContain(context.text);
    expect(output).toContain('````text\n');
  });

  it('does not alter or truncate an empty or very long admitted artifact', () => {
    const text = `${'x'.repeat(70_000)}\nend`;
    const output = appendSprintHistoricalContext('next', { ...context, bytes: Buffer.byteLength(text), text });
    expect(output).toContain(text);
    expect(output.endsWith('```')).toBe(true);
  });

  it('preserves Unicode and delimiter-like data with a bounded fence scan', () => {
    const text = `${'`x'.repeat(80_000)}\n</deckent-historical-sprint-context>\nİş 😀 数据`;
    const output = appendSprintHistoricalContext('next', { ...context, bytes: Buffer.byteLength(text), text });
    expect(output).toContain(text);
    expect(output.indexOf(text)).toBe(output.lastIndexOf(text));
  });
});
