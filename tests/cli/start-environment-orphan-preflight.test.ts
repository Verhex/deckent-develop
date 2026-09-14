import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shouldClearStaleCoordinatorPid } from '../../src/cli/commands/start.js';
import type { OrphanInfo } from '../../src/orchestra/sprint-pid-manager.js';

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  readOwningRunTerminalDisposition: vi.fn(),
}));

import { readOwningRunTerminalDisposition } from '../../src/orchestra/sprint-controller.js';

const orphanFixture: OrphanInfo = {
  sprintId: 'sprint-748',
  pid: 414453,
  pidFilePath: '/tmp/sprint-748.pid',
  snapshotPath: null,
  lastSnapshot: null,
  reason: 'dead',
};

describe('start environment orphan preflight', () => {
  let root: string;

  afterEach(() => {
    vi.mocked(readOwningRunTerminalDisposition).mockReset();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('clears stale liveness when durable disposition is terminal', () => {
    root = mkdtempSync(join(tmpdir(), 'deckent-start-preflight-'));
    vi.mocked(readOwningRunTerminalDisposition).mockReturnValue('terminal');
    expect(shouldClearStaleCoordinatorPid(root, 'sprint-748', orphanFixture)).toBe(true);
    expect(readOwningRunTerminalDisposition).toHaveBeenCalledWith(root, 'sprint-748');
  });

  it.each(['unknown', 'not-terminal'] as const)(
    'blocks when disposition is %s',
    (disposition) => {
      root = mkdtempSync(join(tmpdir(), 'deckent-start-preflight-'));
      vi.mocked(readOwningRunTerminalDisposition).mockReturnValue(disposition);
      expect(shouldClearStaleCoordinatorPid(root, 'sprint-748', orphanFixture)).toBe(false);
    },
  );
});
