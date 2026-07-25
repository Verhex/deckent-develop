import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMcpServerEntryPoint } from '../../src/mcp/server.js';

const sandboxes: string[] = [];

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-mcp-entry-'));
  sandboxes.push(root);
  return root;
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('MCP server entrypoint identity', () => {
  it('accepts the direct module path and rejects an imported-module path', () => {
    const root = sandbox();
    const modulePath = join(root, 'server.js');
    const importerPath = join(root, 'test-runner.js');
    writeFileSync(modulePath, '');
    writeFileSync(importerPath, '');
    const moduleUrl = pathToFileURL(modulePath).href;

    expect(isMcpServerEntryPoint(modulePath, moduleUrl)).toBe(true);
    expect(isMcpServerEntryPoint(importerPath, moduleUrl)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')(
    'accepts a POSIX executable symlink that resolves to the module',
    () => {
      const root = sandbox();
      const modulePath = join(root, 'server.js');
      const linkedEntry = join(root, 'deckent-mcp');
      writeFileSync(modulePath, '');
      symlinkSync(modulePath, linkedEntry, 'file');

      expect(isMcpServerEntryPoint(linkedEntry, pathToFileURL(modulePath).href)).toBe(true);
    },
  );

  it('fails closed for missing argv and malformed module URLs', () => {
    expect(isMcpServerEntryPoint(undefined)).toBe(false);
    expect(isMcpServerEntryPoint('/tmp/deckent-mcp', 'not-a-file-url')).toBe(false);
  });
});
