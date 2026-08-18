// tests/cli/native-transport-limit.test.ts
// ═══ Ollama context-budget doc↔code consistency (born-556) ══════════════════
// resolveContextBudgetTokens's JSDoc previously claimed a 32k Ollama default
// while the code returned 24_000 — a doc/code mismatch that misleads readers
// about the actual generation headroom. This pins both sides to the same
// value so either drifting alone (comment edited without the constant, or
// vice versa) fails the test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveContextBudgetTokens } from '../../src/cli/repl/native-transport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(__dirname, '../../src/cli/repl/native-transport.ts');

describe('resolveContextBudgetTokens — Ollama default doc↔code consistency', () => {
  it('refuses an Ollama selection with no context authority (typed, no 24k literal — 7086/560-001)', () => {
    expect(() => resolveContextBudgetTokens('ollama', {})).toThrowError(/INPUT_CONTEXT_AUTHORITY_UNAVAILABLE/);
    // With any real authority (config or advertised) it resolves normally.
    expect(resolveContextBudgetTokens('ollama', { native_context_tokens: 24_000 })).toBe(24_000);
    expect(resolveContextBudgetTokens('ollama', {}, null, 32_768)).toBe(32_768);
  });

  it('JSDoc above resolveContextBudgetTokens documents typed refusal — no literal fallback ceilings (7086/560-001)', () => {
    const source = readFileSync(sourcePath, 'utf8');
    const docBlockMatch = source.match(
      /\/\*\*\s*Prompt-side context budget[\s\S]*?\*\/\s*\nexport function resolveContextBudgetTokens/,
    );
    expect(docBlockMatch).not.toBeNull();
    const docBlock = docBlockMatch![0];
    // The optimistic per-provider literals (24k/100k/160k) are removed;
    // unknown authority is a typed refusal, and the doc says so.
    expect(docBlock).toContain('Unknown authority is rejected');
    expect(docBlock).not.toContain('24k');
    expect(docBlock).not.toContain('32k');
  });
});
