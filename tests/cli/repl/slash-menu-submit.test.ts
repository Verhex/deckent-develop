import { describe, expect, it } from 'vitest';
import { resolveMenuSubmit } from '../../../src/cli/repl/input-bar.js';
import type { SlashCommand } from '../../../src/cli/commands/chat-slash-registry.js';

const commands: SlashCommand[] = [
  { name: '/clear', desc: 'clear screen' },
  { name: '/context', desc: 'context' },
];

describe('resolveMenuSubmit', () => {
  it('substitutes the selected command when buffer prefix-matches', () => {
    expect(resolveMenuSubmit('/cle', commands, 0)).toBe('/clear');
  });

  it('keeps typed buffer when nothing prefix-matches (fallback catalog)', () => {
    expect(resolveMenuSubmit('/zzzz', commands, 0)).toBe('/zzzz');
  });
});
