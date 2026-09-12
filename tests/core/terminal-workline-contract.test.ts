import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERMINAL_WORKLINE_COMPOSER,
  resolveTerminalWorklineComposer,
} from '../../src/core/terminal-workline-contract.js';
import { pastePolicyFromTerminalWorkline } from '../../src/cli/repl/paste-composer.js';

describe('terminal-workline-contract', () => {
  it('defaults composer thresholds when workline absent', () => {
    expect(resolveTerminalWorklineComposer(undefined)).toEqual(DEFAULT_TERMINAL_WORKLINE_COMPOSER);
  });

  it('merges project overrides into paste policy', () => {
    const policy = pastePolicyFromTerminalWorkline({
      composer: { paste_max_lines_inline: 5, paste_max_chars_inline: 1024 },
    });
    expect(policy.maxLinesInline).toBe(5);
    expect(policy.maxCharsInline).toBe(1024);
  });
});
