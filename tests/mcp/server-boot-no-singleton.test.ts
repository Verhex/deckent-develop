import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireOrCheckWriterLease } from '../../src/mcp/writer-lease.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'boot-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('MCP boot is no longer a whole-server singleton (MCP-W1)', () => {
  it('the singleton-lock module is gone', async () => {
    await expect(import('../../src/mcp/server-singleton-lock.js')).rejects.toThrow();
  });

  it('two boot-equivalent lease acquisitions never throw (no SingletonLockError)', () => {
    const root = sandbox();
    // First "window" acquires; a second self-acquire just refreshes — boot never throws.
    expect(() => acquireOrCheckWriterLease(root)).not.toThrow();
    expect(() => acquireOrCheckWriterLease(root)).not.toThrow();
  });
});
