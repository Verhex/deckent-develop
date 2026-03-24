import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireSprintLock, isSprintLocked, releaseSprintLock } from '../../src/core/multi-ide.js';

describe('multi-ide conflict prevention', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-multi-ide-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('acquireSprintLock creates .deckent/sprint.lock file', () => {
    const result = acquireSprintLock(tempDir, 'sprint-046', 'vscode');
    expect(result).toBe(true);
    expect(existsSync(join(tempDir, '.deckent', 'sprint.lock'))).toBe(true);
  });

  it('lock file contains correct PID and env', () => {
    acquireSprintLock(tempDir, 'sprint-046', 'cursor');
    const raw = readFileSync(join(tempDir, '.deckent', 'sprint.lock'), 'utf-8');
    const data = JSON.parse(raw);
    expect(data.pid).toBe(process.pid);
    expect(data.env).toBe('cursor');
    expect(data.sprintId).toBe('sprint-046');
    expect(data.acquiredAt).toBeTruthy();
  });

  it('lock file contains valid ISO 8601 timestamp', () => {
    acquireSprintLock(tempDir, 'sprint-046', 'vscode');
    const raw = readFileSync(join(tempDir, '.deckent', 'sprint.lock'), 'utf-8');
    const data = JSON.parse(raw);
    const parsed = new Date(data.acquiredAt);
    expect(parsed.toISOString()).toBe(data.acquiredAt);
  });

  it('double acquire by same PID returns false (already locked)', () => {
    const first = acquireSprintLock(tempDir, 'sprint-046', 'vscode');
    const second = acquireSprintLock(tempDir, 'sprint-047', 'cursor');
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('isSprintLocked returns locked=true when lock exists with live PID', () => {
    acquireSprintLock(tempDir, 'sprint-046', 'vscode');
    const info = isSprintLocked(tempDir);
    expect(info.locked).toBe(true);
    expect(info.pid).toBe(process.pid);
    expect(info.env).toBe('vscode');
    expect(info.sprintId).toBe('sprint-046');
  });

  it('isSprintLocked returns locked=false when no lock file exists', () => {
    mkdirSync(join(tempDir, '.deckent'), { recursive: true });
    const info = isSprintLocked(tempDir);
    expect(info.locked).toBe(false);
    expect(info.pid).toBe(0);
    expect(info.env).toBe('');
  });

  it('stale lock (dead PID) is cleared by isSprintLocked', () => {
    const lockDir = join(tempDir, '.deckent');
    mkdirSync(lockDir, { recursive: true });
    const lockFile = join(lockDir, 'sprint.lock');
    writeFileSync(lockFile, JSON.stringify({
      pid: 999999,
      env: 'vscode',
      sprintId: 'sprint-045',
      acquiredAt: '2026-03-24T10:00:00.000Z',
    }));

    const info = isSprintLocked(tempDir);
    expect(info.locked).toBe(false);
    expect(existsSync(lockFile)).toBe(false);
  });

  it('stale lock is cleared by acquireSprintLock allowing new acquisition', () => {
    const lockDir = join(tempDir, '.deckent');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'sprint.lock'), JSON.stringify({
      pid: 999999,
      env: 'cursor',
      sprintId: 'sprint-044',
      acquiredAt: '2026-03-24T09:00:00.000Z',
    }));

    const result = acquireSprintLock(tempDir, 'sprint-046', 'vscode');
    expect(result).toBe(true);
    const raw = readFileSync(join(lockDir, 'sprint.lock'), 'utf-8');
    const data = JSON.parse(raw);
    expect(data.pid).toBe(process.pid);
    expect(data.sprintId).toBe('sprint-046');
  });

  it('releaseSprintLock removes the lock file', () => {
    acquireSprintLock(tempDir, 'sprint-046', 'vscode');
    expect(existsSync(join(tempDir, '.deckent', 'sprint.lock'))).toBe(true);
    releaseSprintLock(tempDir);
    expect(existsSync(join(tempDir, '.deckent', 'sprint.lock'))).toBe(false);
  });

  it('releaseSprintLock only works for owning PID', () => {
    const lockDir = join(tempDir, '.deckent');
    mkdirSync(lockDir, { recursive: true });
    const lockFile = join(lockDir, 'sprint.lock');
    // Write a lock owned by a different (but alive) PID — use PID 1 (init, always alive)
    writeFileSync(lockFile, JSON.stringify({
      pid: 1,
      env: 'vscode',
      sprintId: 'sprint-046',
      acquiredAt: '2026-03-24T14:00:00.000Z',
    }));

    releaseSprintLock(tempDir);
    // Lock should still exist since we don't own it
    expect(existsSync(lockFile)).toBe(true);
  });

  it('releaseSprintLock is no-op when no lock exists', () => {
    mkdirSync(join(tempDir, '.deckent'), { recursive: true });
    // Should not throw
    expect(() => releaseSprintLock(tempDir)).not.toThrow();
  });

  it('missing .deckent/ directory is created by acquireSprintLock', () => {
    expect(existsSync(join(tempDir, '.deckent'))).toBe(false);
    const result = acquireSprintLock(tempDir, 'sprint-046', 'vscode');
    expect(result).toBe(true);
    expect(existsSync(join(tempDir, '.deckent'))).toBe(true);
  });

  it('corrupt lock file is handled gracefully by isSprintLocked', () => {
    const lockDir = join(tempDir, '.deckent');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'sprint.lock'), 'NOT VALID JSON{{{');

    const info = isSprintLocked(tempDir);
    expect(info.locked).toBe(false);
    // Corrupt file should be removed
    expect(existsSync(join(lockDir, 'sprint.lock'))).toBe(false);
  });

  it('corrupt lock file is handled gracefully by acquireSprintLock', () => {
    const lockDir = join(tempDir, '.deckent');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'sprint.lock'), '!!!corrupt!!!');

    const result = acquireSprintLock(tempDir, 'sprint-046', 'vscode');
    expect(result).toBe(true);
    const raw = readFileSync(join(lockDir, 'sprint.lock'), 'utf-8');
    const data = JSON.parse(raw);
    expect(data.pid).toBe(process.pid);
  });

  it('auto-detects env when not provided', () => {
    const result = acquireSprintLock(tempDir, 'sprint-046');
    expect(result).toBe(true);
    const raw = readFileSync(join(tempDir, '.deckent', 'sprint.lock'), 'utf-8');
    const data = JSON.parse(raw);
    // env should be one of the valid DetectedEnv values
    expect(['vscode', 'codex', 'gemini', 'cursor', 'tmux', 'shell']).toContain(data.env);
  });
});
