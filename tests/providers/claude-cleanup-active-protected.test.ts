import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeAdapter } from '../../src/providers/claude.js';

const TEST_ROOT = '/tmp/test-claude-cleanup';

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(join(TEST_ROOT, '.tasks'), { recursive: true });
});

describe('ClaudeAdapter._cleanupOrphanedPromptFiles (Sprint 168 C0e selective filter)', () => {
  it('preserves active worker prompt on kill of another worker', () => {
    // Two active workers: heartbeats in place
    writeFileSync(
      join(TEST_ROOT, '.tasks', 'task-168-001.hb'),
      JSON.stringify({ taskId: '168-001', workerId: 'w-168-001', status: 'EXECUTING' }),
    );
    writeFileSync(
      join(TEST_ROOT, '.tasks', 'task-168-002.hb'),
      JSON.stringify({ taskId: '168-002', workerId: 'w-168-002', status: 'EXECUTING' }),
    );

    // Both prompt files written by spawn (Docker pattern: .prompt-{taskId}-{promptId}.txt)
    writeFileSync(join(TEST_ROOT, '.tasks', '.prompt-168-001-hash1.txt'), 'prompt content 1');
    writeFileSync(join(TEST_ROOT, '.tasks', '.prompt-168-002-hash2.txt'), 'prompt content 2');

    // Cleanup with explicit active=[168-001] — simulates kill of 168-002 leaving 168-001 alive
    const adapter = new ClaudeAdapter(TEST_ROOT, { claude_backend: 'tmux' });
    (adapter as unknown as { _cleanupOrphanedPromptFiles: (ids: string[]) => void })
      ._cleanupOrphanedPromptFiles(['168-001']);

    // 168-001 prompt MUST survive (active protected)
    expect(existsSync(join(TEST_ROOT, '.tasks', '.prompt-168-001-hash1.txt'))).toBe(true);
    // 168-002 prompt MUST be deleted (not in active list — orphan)
    expect(existsSync(join(TEST_ROOT, '.tasks', '.prompt-168-002-hash2.txt'))).toBe(false);
  });

  it('defaults active list from heartbeat files when caller omits activeTaskIds', () => {
    // Only 168-001 has an .hb file (active); 168-002 has no .hb (orphan)
    writeFileSync(
      join(TEST_ROOT, '.tasks', 'task-168-001.hb'),
      JSON.stringify({ taskId: '168-001', status: 'EXECUTING' }),
    );

    writeFileSync(join(TEST_ROOT, '.tasks', '.prompt-168-001-hash1.txt'), 'p1');
    writeFileSync(join(TEST_ROOT, '.tasks', '.prompt-168-002-hash2.txt'), 'p2');

    const adapter = new ClaudeAdapter(TEST_ROOT, { claude_backend: 'tmux' });
    // No explicit list — helper must default to getActiveWorkerIds()
    (adapter as unknown as { _cleanupOrphanedPromptFiles: (ids?: string[]) => void })
      ._cleanupOrphanedPromptFiles();

    expect(existsSync(join(TEST_ROOT, '.tasks', '.prompt-168-001-hash1.txt'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.tasks', '.prompt-168-002-hash2.txt'))).toBe(false);
  });

  it('fails closed when an explicit active-worker snapshot is empty', () => {
    // No .hb files at all
    writeFileSync(join(TEST_ROOT, '.tasks', '.prompt-old-hash.txt'), 'orphan');

    const adapter = new ClaudeAdapter(TEST_ROOT, { claude_backend: 'tmux' });
    (adapter as unknown as { _cleanupOrphanedPromptFiles: (ids?: string[]) => void })
      ._cleanupOrphanedPromptFiles([]);

    expect(existsSync(join(TEST_ROOT, '.tasks', '.prompt-old-hash.txt'))).toBe(true);
  });
});
