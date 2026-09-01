import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { loadExecAuthorityNative } from '../../src/core/exec-authority-native.js';
import {
  createTaskAttemptCustodyWin32Adapter,
  type TaskAttemptCustodyWin32BackendMountConsumer,
} from '../../src/core/task-attempt-custody-win32-adapter.js';
import {
  TaskAttemptCustodyHold,
  type TaskAttemptCustodyAdapter,
} from '../../src/core/task-attempt-custody-store.js';

const ADAPTER_METHODS = [
  'openRoot',
  'ensurePrivateDirectory',
  'readPrivateDirectory',
  'scanPrivateDirectoryBounded',
  'issuePathCapability',
  'issueBackendMountCapability',
  'consumeBackendMountCapability',
  'readDurableEffectMarker',
  'publishDurableEffectMarkerFirstWriter',
  'publishBytesFirstWriter',
  'readFirstWriter',
  'readVerified',
  'captureStableFile',
  'beginFirstWriterPublication',
  'appendFirstWriterPublication',
  'sealFirstWriterPublication',
  'abortFirstWriterPublication',
] as const satisfies readonly (Exclude<keyof TaskAttemptCustodyAdapter, 'platform'>)[];

describe('TaskAttemptCustodyWin32Adapter', () => {
  it('implements the complete Store adapter contract as a Windows authority', () => {
    const adapter = createTaskAttemptCustodyWin32Adapter();

    expect(adapter.platform).toBe('win32');
    for (const method of ADAPTER_METHODS) {
      expect(typeof adapter[method]).toBe('function');
    }
  });

  it('fails closed without a canonical Win32 native capability and never calls the mount consumer', async () => {
    const consumeBackendMount = vi.fn<TaskAttemptCustodyWin32BackendMountConsumer>();
    const adapter = createTaskAttemptCustodyWin32Adapter({ consumeBackendMount });
    const native = loadExecAuthorityNative();
    const hasWin32Capability = process.platform === 'win32'
      && native.available
      && native.manifest.platform === 'win32'
      && native.manifest.features.includes('custody-win32-v1');

    if (hasWin32Capability) return;

    let observed: unknown;
    try {
      adapter.openRoot({
        absoluteRoot: process.platform === 'win32'
          ? 'C:\\deckent-custody-contract-only'
          : '/deckent-custody-contract-only',
        canonicalProjectRoot: process.platform === 'win32'
          ? 'D:\\deckent-project-contract-only'
          : '/deckent-project-contract-only',
        projectId: 'contract-only',
        create: false,
      });
    } catch (error) {
      observed = error;
    }

    expect(observed).toBeInstanceOf(TaskAttemptCustodyHold);
    expect(observed).toMatchObject({
      state: 'HOLD',
      code: 'NATIVE_CAPABILITY_UNAVAILABLE',
      operation: 'open-root',
    });
    expect(consumeBackendMount).not.toHaveBeenCalled();
  });

  it('contains no POSIX proof fallback or serializable path/descriptor mount authority', async () => {
    const sourcePath = fileURLToPath(new URL(
      '../../src/core/task-attempt-custody-win32-adapter.ts',
      import.meta.url,
    ));
    const source = await readFile(sourcePath, 'utf8');

    expect(source).toContain('loadExecAuthorityNative');
    expect(source).toContain("'custody-win32-v1'");
    expect(source).toContain('consumeSealReconciliation');
    expect(source).toContain("custody.invoke('scan-directory-bounded'");
    expect(source).toContain('createTaskAttemptCustodyDirectoryScanReceiptV2');
    expect(source).toContain('DISPATCH_DISCOVERY_MUTATED');
    expect(source).toContain('protected-owner-only-dacl-readback');
    expect(source).toContain('native-file-and-parent-directory-flush');
    expect(source).not.toContain("from 'node:fs'");
    expect(source).not.toContain("from 'node:fs/promises'");
    expect(source).not.toContain('/proc/');
    expect(source).not.toContain('sourcePath:');
    expect(source).not.toContain('fdPath(');
    expect(source).not.toContain('chmod');
    expect(source).toContain('windows-native-structured-docker-receipt-deferred');
    expect(source).not.toContain("state: cleanupConfirmed ? 'CONSUMED'");
  });
});
