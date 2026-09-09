// tests/cli/chat-tool-exec-dialect.test.ts
// ═══ 7111 — the shell the exec dispatcher spawns == the dialect the classifier parses ═
import { describe, expect, it } from 'vitest';
import { resolveBashInvocation } from '../../src/cli/commands/chat-tool-exec.js';
import { resolveShellDialectForPlatform } from '../../src/core/shell-readonly-classifier.js';

describe('deckent_bash shell ⇔ read-only classifier dialect parity', () => {
  it.each(['win32', 'linux', 'darwin', 'freebsd'] as const)('%s', (platform) => {
    const invocation = resolveBashInvocation('cat f', platform);
    const dialect = resolveShellDialectForPlatform(platform);
    if (invocation.command === 'powershell.exe') expect(dialect).toBe('powershell');
    else expect(dialect).toBe('posix');
    expect(invocation.command === 'powershell.exe').toBe(dialect === 'powershell');
  });
});
