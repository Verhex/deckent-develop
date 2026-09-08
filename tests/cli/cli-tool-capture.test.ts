import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  captureCliTool,
  cliArgsForReadRequest,
  cliArgsForStructuredActionRequest,
  cliToolForStructuredActionRequest,
  createMemoryPreviewContentStore,
  resolveCliReadRequest,
  resolveCliStructuredActionRequest,
} from '../../src/cli/helpers/cli-tool-capture.js';
import { createSessionToolContentStore } from '../../src/agent/session-tool-content.js';

describe('resolveCliReadRequest', () => {
  it.each([
    ['deckent_doctor', {}, { kind: 'doctor' }, ['doctor', '--json']],
    ['deckent_history', { _rest: ['--last', '12', '--agent', 'writer', '--skill', 'typescript'] }, { kind: 'history', last: 12, agent: 'writer', skill: 'typescript' }, ['history', '--json', '--last', '12', '--agent', 'writer', '--skill', 'typescript']],
    ['deckent_models', {}, { kind: 'models' }, ['models', 'list', '--offline', '--json']],
    ['deckent_models', { _rest: ['active-set', '--offline', '--json'] }, { kind: 'model-active-set' }, ['models', 'active-set', '--offline', '--json']],
    ['deckent_agent_list', { _rest: ['list', '--json'] }, { kind: 'agents' }, ['agent', 'list', '--json']],
    ['deckent_skill_list', { _rest: ['--category', 'quality'] }, { kind: 'skills', category: 'quality' }, ['skill', 'list', '--json', '--category', 'quality']],
  ] as const)('resolves %s as an exact offline read', (tool, args, request, cliArgs) => {
    const resolved = resolveCliReadRequest(tool, args);
    expect(resolved).toEqual(request);
    expect(cliArgsForReadRequest(resolved)).toEqual(cliArgs);
  });

  it.each([
    ['deckent_models', { _rest: ['refresh'] }],
    ['deckent_models', { provider: 'codex', _rest: ['--provider', 'claude'] }],
    ['deckent_models', { provider: 'codex', extra: true }],
    ['deckent_history', { trend: true }],
    ['deckent_history', { last: 0 }],
    ['deckent_skill_list', { category: '' }],
    ['deckent_doctor', { _rest: ['--fix'] }],
    ['deckent_agent_list', { _rest: ['list', '--json', '--json'] }],
    ['deckent_status', {}],
  ] as const)('rejects unsafe or unsupported selection %s without normalizing it', (tool, args) => {
    expect(resolveCliReadRequest(tool, args)).toBeNull();
  });

  it('rejects forged typed requests instead of trusting caller-provided argv', () => {
    expect(cliArgsForReadRequest({ kind: 'models', cliArgs: ['kill', '--all'] })).toBeNull();
    expect(cliArgsForReadRequest({ kind: 'history', last: Number.POSITIVE_INFINITY })).toBeNull();
    expect(cliArgsForReadRequest({ kind: 'unknown' })).toBeNull();
  });
});

describe('resolveCliStructuredActionRequest', () => {
  it.each([
    ['deckent_sync', {}, { kind: 'sync', mode: 'apply' }, ['sync', '--json']],
    ['deckent_sync', { mode: 'preview' }, { kind: 'sync', mode: 'preview' }, ['sync', '--dry-run', '--json']],
    ['deckent_audit', { action: 'gate', sprintId: 'sprint-7099' }, { kind: 'audit-gate', sprintId: 'sprint-7099' }, ['audit', 'sprint-7099', '--json']],
    ['deckent_audit', { action: 'query' }, { kind: 'audit-query' }, ['audit', 'query', '--json']],
    ['deckent_audit', { action: 'query', channel: 'approval.decided' }, { kind: 'audit-query', channel: 'approval.decided' }, ['audit', 'query', '--json', '--action', 'approval.decided']],
    ['deckent_audit', { action: 'compliance' }, { kind: 'audit-compliance' }, ['audit', 'compliance', '--json']],
    ['deckent_audit', { action: 'compliance', sprintId: 'sprint-7099' }, { kind: 'audit-compliance', sprintId: 'sprint-7099' }, ['audit', 'compliance', '--json', '--sprint', 'sprint-7099']],
  ] as const)('resolves %s to one closed action and canonical JSON argv', (tool, args, request, cliArgs) => {
    const resolved = resolveCliStructuredActionRequest(tool, args);
    expect(resolved).toEqual(request);
    expect(cliArgsForStructuredActionRequest(resolved)).toEqual(cliArgs);
  });

  it('projects the validated action back to exact tool args for classification and approval binding', () => {
    expect(cliToolForStructuredActionRequest({ kind: 'sync', mode: 'preview' })).toEqual({
      tool: 'deckent_sync', args: { mode: 'preview' },
    });
    expect(cliToolForStructuredActionRequest({ kind: 'audit-gate', sprintId: 'sprint-7099' })).toEqual({
      tool: 'deckent_audit', args: { action: 'gate', sprintId: 'sprint-7099' },
    });
    expect(cliToolForStructuredActionRequest({ kind: 'audit-query', channel: 'rbac.check' })).toEqual({
      tool: 'deckent_audit', args: { action: 'query', channel: 'rbac.check' },
    });
    expect(cliToolForStructuredActionRequest({ kind: 'audit-compliance' })).toEqual({
      tool: 'deckent_audit', args: { action: 'compliance' },
    });
  });

  it.each([
    ['deckent_sync', { mode: 'apply', extra: true }],
    ['deckent_sync', { mode: 'bogus' }],
    ['deckent_sync', { _rest: ['--dry-run'] }],
    ['deckent_audit', { action: 'gate' }],
    ['deckent_audit', { action: 'gate', sprintId: '--json' }],
    ['deckent_audit', { action: 'gate', sprintId: '../sprint-7099' }],
    ['deckent_audit', { action: 'gate', sprintId: 'query' }],
    ['deckent_audit', { action: 'query', tenant: 'tenant-a' }],
    ['deckent_audit', { action: 'query', channel: '--tenant' }],
    ['deckent_audit', { action: 'compliance', channel: 'rbac.check' }],
    ['deckent_audit', { action: 'retention' }],
    ['deckent_status', {}],
  ] as const)('rejects unsupported or ambiguous structured action %s', (tool, args) => {
    expect(resolveCliStructuredActionRequest(tool, args)).toBeNull();
  });

  it('rejects forged action requests instead of trusting embedded argv or normalized values', () => {
    expect(cliArgsForStructuredActionRequest({ kind: 'sync', mode: 'apply', argv: ['kill'] })).toBeNull();
    expect(cliArgsForStructuredActionRequest({ kind: 'audit-gate', sprintId: ' sprint-7099' })).toBeNull();
    expect(cliArgsForStructuredActionRequest({ kind: 'audit-gate', sprintId: 'compliance' })).toBeNull();
    expect(cliArgsForStructuredActionRequest({ kind: 'unknown' })).toBeNull();
  });
});

describe('captureCliTool', () => {
  it('returns sanitized incomplete receipts and performs zero spawn when capture admission fails', async () => {
    const spawnProcess = vi.fn();
    const store = {
      beginCapture: vi.fn(() => { throw new Error('/private/path quota detail'); }),
    } as unknown as ReturnType<typeof createSessionToolContentStore>;
    const outcome = await captureCliTool({
      command: process.execPath, args: ['-e', 'process.exit()'], env: {}, store,
      timeoutMs: 100, previewBytes: 64, spawnProcess,
    });
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ reason: 'capture-admission', pid: null, exitCode: null, signal: null });
    expect(outcome.stdout).toMatchObject({ detailRef: null, legacyContentRef: null, complete: false, reasonCode: 'CONTENT_STORE_FAILED' });
    expect(JSON.stringify(outcome)).not.toContain('/private/path');
  });

  it('detaches local handles after bounded reap observation without claiming the child reaped', async () => {
    vi.useFakeTimers();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as ChildProcess;
    Object.assign(child, {
      stdout, stderr, pid: 2_147_483_647, exitCode: null, signalCode: null,
      kill: vi.fn(() => true), unref: vi.fn(),
    });
    const store = createMemoryPreviewContentStore(64);
    try {
      const pending = captureCliTool({
        command: 'fixture', args: [], env: {}, store,
        timeoutMs: 10, reapObservationMs: 10, previewBytes: 64,
        platform: 'linux', spawnProcess: () => child,
      });
      await vi.advanceTimersByTimeAsync(2_021);
      const outcome = await pending;
      expect(outcome).toMatchObject({ reason: 'REAP_UNVERIFIED', pid: 2_147_483_647, exitCode: null });
      expect(outcome.stdout).toMatchObject({ complete: false, detailRef: null, legacyContentRef: null, reasonCode: 'CONTENT_STORE_FAILED' });
      expect(outcome.stderr).toMatchObject({ complete: false, detailRef: null, legacyContentRef: null, reasonCode: 'CONTENT_STORE_FAILED' });
      expect(child.unref).toHaveBeenCalledOnce();
      expect(stdout.destroyed).toBe(true);
      expect(stderr.destroyed).toBe(true);
      child.emit('error', new Error('late'));
      child.emit('close', 0, null);
      expect(vi.getTimerCount()).toBe(0);
      expect(outcome.reason).toBe('REAP_UNVERIFIED');
    } finally {
      store.close();
      vi.useRealTimers();
    }
  });

  it('keeps a bounded standalone preview while hashing and counting the entire stream', async () => {
    const store = createMemoryPreviewContentStore(8);
    const outcome = await captureCliTool({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("  1234567890  ")'],
      env: { PATH: process.env.PATH },
      store,
      timeoutMs: 2_000,
      previewBytes: 8,
    });
    expect(outcome.stdout).toMatchObject({
      preview: '  123456', observedBytes: 14, storedBytes: 0,
      complete: false, reasonCode: 'CAPTURE_LIMIT_EXCEEDED',
    });
    expect(outcome.stdout.observedSha256).toMatch(/^[a-f0-9]{64}$/u);
    store.close();
  });

  it('drains exact multibyte stdout/stderr bytes and preserves nonzero exit truth', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'deckent-cli-capture-test-'));
    const store = createSessionToolContentStore({ dir });
    try {
      const outcome = await captureCliTool({
        command: process.execPath,
        args: ['-e', 'process.stdout.write("  ğ🙂\\n");process.stderr.write("warn\\n");process.exitCode=7'],
        env: { PATH: process.env.PATH },
        store,
        timeoutMs: 2_000,
        previewBytes: 128,
      });
      expect(outcome.exitCode).toBe(7);
      expect(outcome.signal).toBeNull();
      expect(outcome.stdout.preview).toBe('  ğ🙂\n');
      expect(outcome.stdout.observedBytes).toBe(Buffer.byteLength('  ğ🙂\n'));
      expect(outcome.stderr.preview).toBe('warn\n');
      expect(outcome.stdout.complete).toBe(true);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('terminates a timed-out private child tree and settles on close', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'deckent-cli-timeout-test-'));
    const store = createSessionToolContentStore({ dir });
    try {
      const outcome = await captureCliTool({
        command: process.execPath,
        args: ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],
        env: { PATH: process.env.PATH },
        store,
        timeoutMs: 25,
        reapObservationMs: 3_000,
        previewBytes: 64,
      });
      expect(outcome.reason).toBe('timeout');
      expect(outcome.signal).toBe('SIGKILL');
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 5_000);
});
