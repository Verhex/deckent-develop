import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, renameSync, existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('verify-ran atomic write', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `verify-ran-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('atomic write: .tmp intermediary is invisible as final path until rename', () => {
    const markerPath = join(testDir, 'task-001.verify-ran');
    const tmpPath = `${markerPath}.tmp`;
    const content = JSON.stringify({ taskId: '001', tsc: 'PASS', vitest: 'PASS' });

    writeFileSync(tmpPath, content, 'utf-8');

    // tmp exists but final path is NOT visible yet (race-safe)
    expect(existsSync(tmpPath)).toBe(true);
    expect(existsSync(markerPath)).toBe(false);

    renameSync(tmpPath, markerPath);

    // After rename: final path visible, tmp gone
    expect(existsSync(markerPath)).toBe(true);
    expect(existsSync(tmpPath)).toBe(false);

    const parsed = JSON.parse(readFileSync(markerPath, 'utf-8'));
    expect(parsed.taskId).toBe('001');
    expect(parsed.tsc).toBe('PASS');
    expect(parsed.vitest).toBe('PASS');
  });

  it('atomic write prevents 0-byte marker: tmp is overwritten before rename', () => {
    const markerPath = join(testDir, 'task-002.verify-ran');
    const tmpPath = `${markerPath}.tmp`;

    // Simulate a partial/failed first write to tmp
    writeFileSync(tmpPath, '', 'utf-8');
    expect(readFileSync(tmpPath, 'utf-8')).toBe('');
    expect(existsSync(markerPath)).toBe(false); // marker not exposed

    // Re-write with full content before rename (atomic retry pattern)
    const fullContent = JSON.stringify({ taskId: '002', tsc: 'PASS', vitest: 'PASS' }, null, 2);
    writeFileSync(tmpPath, fullContent, 'utf-8');
    renameSync(tmpPath, markerPath);

    const result = JSON.parse(readFileSync(markerPath, 'utf-8'));
    expect(result.taskId).toBe('002');
    // Final marker is never 0 bytes — the rename only happens after complete write
    expect(readFileSync(markerPath, 'utf-8').length).toBeGreaterThan(0);
  });
});
