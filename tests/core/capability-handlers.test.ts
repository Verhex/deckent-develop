import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { CapabilityRegistry, type CapabilityResult } from '../../src/core/capability-broker.js';
import {
  createEnvReadHandler,
  createHttpGetHandler,
  createShellExecHandler,
  envReadHandler,
  httpGetHandler,
  installExtendedHandlers,
  shellExecHandler,
  type HttpGetHandlerOptions,
  type ShellExecHandlerOptions,
} from '../../src/core/capability-handlers.js';
import type { Capability } from '../../src/core/work-model.js';

function grant(capability: 'net.read' | 'env.read' | 'shell.exec'): Capability {
  return capability as Capability;
}

function expectOk(result: CapabilityResult): { value: unknown; handler: string } {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.error}`);
  return result;
}

type FakeSpawn = NonNullable<ShellExecHandlerOptions['spawnImpl']>;
type FakeSpawnProcess = ReturnType<FakeSpawn>;

function makeFakeSpawn(overrides: {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  signal?: NodeJS.Signals | null;
  error?: Error;
} = {}): ReturnType<typeof vi.fn<FakeSpawn>> {
  return vi.fn<FakeSpawn>((_command, _args, _options) => {
    const child = new EventEmitter() as FakeSpawnProcess;
    child.stdout = Readable.from([overrides.stdout ?? '']);
    child.stderr = Readable.from([overrides.stderr ?? '']);
    process.nextTick(() => {
      if (overrides.error) {
        child.emit('error', overrides.error);
        return;
      }
      child.emit('close', overrides.code ?? 0, overrides.signal ?? null);
    });
    return child;
  });
}

describe('extended capability handlers', () => {
  it('declares least-privilege requiredCapability values', () => {
    expect(httpGetHandler.requiredCapability).toBe('net.read');
    expect(envReadHandler.requiredCapability).toBe('env.read');
    expect(shellExecHandler.requiredCapability).toBe('shell.exec');
  });

  it('installExtendedHandlers registers handlers without editing the broker', () => {
    const registry = new CapabilityRegistry();
    installExtendedHandlers(registry);
    expect(registry.list()).toEqual(['env.read', 'http.get', 'shell.exec']);
  });

  it('keeps broker least-privilege gating active for installed handlers', async () => {
    const fetchImpl: HttpGetHandlerOptions['fetchImpl'] = vi.fn(async () => ({
      status: 200,
      text: async () => 'ok',
    }));
    const registry = new CapabilityRegistry();
    installExtendedHandlers(registry, { http: { fetchImpl } });

    const denied = await registry.invoke(
      { capability: 'http.get', args: { url: 'https://example.test' } },
      { grantedCapabilities: [grant('env.read')] },
    );
    expect(denied.ok).toBe(false);
    expect(!denied.ok && denied.code).toBe('CAPABILITY_DENIED');

    const allowed = await registry.invoke(
      { capability: 'http.get', args: { url: 'https://example.test' } },
      { grantedCapabilities: [grant('net.read')] },
    );
    expect(expectOk(allowed).value).toEqual({ status: 200, body: 'ok' });
  });
});

describe('httpGetHandler', () => {
  it('performs a hermetic GET through injected fetch and returns status/body', async () => {
    const fetchImpl: HttpGetHandlerOptions['fetchImpl'] = vi.fn(async (input, init) => ({
      status: 202,
      text: async () => `body:${input.toString()}:${init?.method}`,
    }));
    const handler = createHttpGetHandler({ fetchImpl, headers: { 'X-Test': 'yes' } });

    const value = await handler.invoke({ url: 'https://example.test/path' }, {});

    expect(value).toEqual({ status: 202, body: 'body:https://example.test/path:GET' });
    expect(fetchImpl).toHaveBeenCalledWith(new URL('https://example.test/path'), {
      method: 'GET',
      headers: { 'X-Test': 'yes' },
    });
  });

  it('rejects missing, invalid, and unsupported URLs before fetch', async () => {
    const fetchImpl: HttpGetHandlerOptions['fetchImpl'] = vi.fn();
    const handler = createHttpGetHandler({ fetchImpl });

    await expect(handler.invoke({}, {})).rejects.toThrow(/args.url/);
    await expect(handler.invoke({ url: 'not a url' }, {})).rejects.toThrow(/valid URL/);
    await expect(handler.invoke({ url: 'file:///etc/passwd' }, {})).rejects.toThrow(/http: and https:/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('envReadHandler', () => {
  it('reads only allow-listed variables', async () => {
    const handler = createEnvReadHandler({
      env: { DECKENT_ALLOWED: 'secret', DECKENT_BLOCKED: 'nope' },
      allowlist: ['DECKENT_ALLOWED'],
    });

    expect(handler.invoke({ name: 'DECKENT_ALLOWED' }, {})).toEqual({
      name: 'DECKENT_ALLOWED',
      value: 'secret',
    });
    expect(() => handler.invoke({ name: 'DECKENT_BLOCKED' }, {})).toThrow(/allow-listed/);
  });

  it('returns null for an allow-listed variable that is absent', async () => {
    const handler = createEnvReadHandler({ env: {}, allowlist: ['MISSING'] });
    expect(handler.invoke({ name: 'MISSING' }, {})).toEqual({
      name: 'MISSING',
      value: null,
    });
  });
});

describe('shellExecHandler', () => {
  it('runs through injected async spawn with shell disabled and returns output', async () => {
    const spawnImpl = makeFakeSpawn({ stdout: 'out', stderr: 'err', code: 7 });
    const handler = createShellExecHandler({ spawnImpl, allowedCommands: ['deckent-safe'] });

    const value = await handler.invoke(
      { command: 'deckent-safe', args: ['--json'], cwd: '/tmp/project' },
      {},
    );

    expect(value).toEqual({ code: 7, signal: null, stdout: 'out', stderr: 'err' });
    expect(spawnImpl).toHaveBeenCalledWith('deckent-safe', ['--json'], {
      cwd: '/tmp/project',
      shell: false,
    });
  });

  it('uses ctx.projectRoot as cwd when args.cwd is absent', async () => {
    const spawnImpl = makeFakeSpawn();
    const handler = createShellExecHandler({ spawnImpl, allowedCommands: ['pwd'] });

    await handler.invoke({ command: 'pwd' }, { projectRoot: '/tmp/project-root' });

    expect(spawnImpl).toHaveBeenCalledWith('pwd', [], {
      cwd: '/tmp/project-root',
      shell: false,
    });
  });

  it('validates command, args, allowlist, and spawn errors', async () => {
    const spawnImpl = makeFakeSpawn({ error: new Error('spawn failed') });
    const handler = createShellExecHandler({ spawnImpl, allowedCommands: ['allowed'] });

    await expect(handler.invoke({}, {})).rejects.toThrow(/args.command/);
    await expect(handler.invoke({ command: 'allowed', args: [1] }, {})).rejects.toThrow(/array of strings/);
    await expect(handler.invoke({ command: 'blocked' }, {})).rejects.toThrow(/allow-listed/);
    await expect(handler.invoke({ command: 'allowed' }, {})).rejects.toThrow(/spawn failed/);
  });
});
