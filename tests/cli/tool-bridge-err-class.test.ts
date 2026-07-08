import { describe, it, expect, vi } from 'vitest';
import {
  createCliToolDispatcher,
  DEFAULT_PERMISSION_DENIED_LABEL,
  type CliToolSpawnFn,
} from '../../src/cli/commands/chat-tool-bridge.js';

// born-538 (TOOL-BRIDGE-ERR-CLASS): chat-tool-bridge.ts used to tag every spawn
// failure identically as `[mcp-error] …`, so a permission-denied spawn (EACCES/
// EPERM — the OS/user identity refused to run the CLI) read exactly like a
// genuine runtime failure (ENOENT, non-zero exit, timeout). These tests prove
// the two classes are now separated: permission-denied → `[deckent-denied] …`
// (reusing the existing denied-tag convention native-tool-registry.ts / run.tsx
// already produce/consume), runtime-error → unchanged `[mcp-error] …` detail.
//
// All tests inject a fake spawnFn/spawnDetachedFn — no real subprocess is ever
// launched, so the suite is hermetic (mirrors chat-tool-bridge.test.ts).

function errnoError(message: string, code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}

describe('chat-tool-bridge.ts — permission-denied vs runtime-error classification (born-538)', () => {
  it('spawnFn rejects with EACCES → tagged [deckent-denied], not [mcp-error]', async () => {
    const spawnFn = vi.fn().mockRejectedValue(errnoError('permission denied', 'EACCES')) as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_status', {});
    expect(out).toBe(`[deckent-denied] deckent_status: ${DEFAULT_PERMISSION_DENIED_LABEL}`);
    expect(out).not.toContain('[mcp-error]');
  });

  it('spawnFn rejects with EPERM → also classified as permission-denied', async () => {
    const spawnFn = vi.fn().mockRejectedValue(errnoError('not permitted', 'EPERM')) as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_history', {});
    expect(out).toBe(`[deckent-denied] deckent_history: ${DEFAULT_PERMISSION_DENIED_LABEL}`);
  });

  it('spawnDetachedFn throws EACCES (deckent_start path) → [deckent-denied]', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const spawnDetachedFn = vi.fn().mockImplementation(() => { throw errnoError('permission denied', 'EACCES'); });
    const d = createCliToolDispatcher({ spawnFn, spawnDetachedFn });
    const out = await d.dispatch('deckent_start', {});
    expect(out).toBe(`[deckent-denied] deckent_start: ${DEFAULT_PERMISSION_DENIED_LABEL}`);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('spawnFn rejects with a plain Error (no errno code) → stays [mcp-error] with detail (unchanged)', async () => {
    const spawnFn = vi.fn().mockRejectedValue(new Error('ENOENT')) as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_status', {});
    expect(out).toBe('[mcp-error] deckent_status: ENOENT');
    expect(out).not.toContain('[deckent-denied]');
  });

  it('spawnFn rejects with an unrelated errno code (ENOSPC) → still [mcp-error], not denied', async () => {
    const spawnFn = vi.fn().mockRejectedValue(errnoError('no space left', 'ENOSPC')) as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_status', {});
    expect(out).toBe('[mcp-error] deckent_status: no space left');
  });

  it('permissionDeniedLabel override replaces the English default (i18n seam)', async () => {
    const spawnFn = vi.fn().mockRejectedValue(errnoError('denied', 'EACCES')) as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn, permissionDeniedLabel: 'izin reddedildi' });
    const out = await d.dispatch('deckent_status', {});
    expect(out).toBe('[deckent-denied] deckent_status: izin reddedildi');
  });

  it('the two classes are mutually exclusive and distinguishable by prefix (matches run.tsx isDenied/isError)', async () => {
    const deniedSpawn = vi.fn().mockRejectedValue(errnoError('denied', 'EACCES')) as unknown as CliToolSpawnFn;
    const errorSpawn = vi.fn().mockRejectedValue(new Error('boom')) as unknown as CliToolSpawnFn;
    const denied = await createCliToolDispatcher({ spawnFn: deniedSpawn }).dispatch('deckent_status', {});
    const error = await createCliToolDispatcher({ spawnFn: errorSpawn }).dispatch('deckent_status', {});
    expect(denied.startsWith('[deckent-denied]')).toBe(true);
    expect(denied.startsWith('[mcp-error]')).toBe(false);
    expect(error.startsWith('[mcp-error]')).toBe(true);
    expect(error.startsWith('[deckent-denied]')).toBe(false);
  });
});
