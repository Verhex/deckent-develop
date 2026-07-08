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
  it('returns the documented 24k default for Ollama', () => {
    expect(resolveContextBudgetTokens('ollama', {})).toBe(24_000);
  });

  it('JSDoc above resolveContextBudgetTokens states the same value the code returns (24k, not 32k)', () => {
    const source = readFileSync(sourcePath, 'utf8');
    const docBlockMatch = source.match(
      /\/\*\*\s*Prompt-side context budget[\s\S]*?\*\/\s*\nexport function resolveContextBudgetTokens/,
    );
    expect(docBlockMatch).not.toBeNull();
    const docBlock = docBlockMatch![0];
    expect(docBlock).toContain('24k');
    expect(docBlock).not.toContain('32k');
  });
});
