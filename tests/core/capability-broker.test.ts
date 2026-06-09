import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CapabilityRegistry,
  createDefaultRegistry,
  installReferenceHandlers,
  echoHandler,
  fsReadHandler,
  registerCapability,
  invokeCapability,
  hasCapability,
  listCapabilities,
  resetDefaultCapabilityRegistry,
  getDefaultRegistry,
  invokeFromRequest,
  type CapabilityHandler,
  type CapabilityResult,
} from '../../src/core/capability-broker.js';
import type { CapabilityTarget, ExecutionRequest } from '../../src/core/work-model.js';

// ─── Helpers ─────────────────────────────────────────────────────

/** Narrow a CapabilityResult to its ok:true branch (throws on failure). */
function expectOk(result: CapabilityResult): { value: unknown; handler: string } {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.error}`);
  return result;
}

function makeHandler(over?: Partial<CapabilityHandler>): CapabilityHandler {
  return {
    requiredCapability: 'mcp-tool',
    invoke: (args) => ({ seen: args }),
    ...over,
  };
}

function makeRequest(over?: Partial<ExecutionRequest>): ExecutionRequest {
  return {
    description: 'test',
    kind: 'generic',
    environment: { domain: 'generic', context: 'local-dev' },
    requirements: { capabilities: [], resources: [] },
    scope: { directories: [], filesRead: [], filesWrite: [] },
    projectRoot: '/tmp',
    ...over,
  };
}

// ─── CapabilityRegistry — registration surface ───────────────────

describe('CapabilityRegistry — registration', () => {
  let reg: CapabilityRegistry;
  beforeEach(() => {
    reg = new CapabilityRegistry();
  });

  it('register / has / get a handler', () => {
    const h = makeHandler();
    expect(reg.has('mail.send')).toBe(false);
    reg.register('mail.send', h);
    expect(reg.has('mail.send')).toBe(true);
    expect(reg.get('mail.send')).toBe(h);
  });

  it('list returns sorted, stable names', () => {
    reg.register('zeta', makeHandler());
    reg.register('alpha', makeHandler());
    expect(reg.list()).toEqual(['alpha', 'zeta']);
  });

  it('re-registering the same name overwrites (last writer wins)', () => {
    const first = makeHandler({ description: 'first' });
    const second = makeHandler({ description: 'second' });
    reg.register('x', first);
    reg.register('x', second);
    expect(reg.get('x')).toBe(second);
  });

  it('unregister removes; clear empties', () => {
    reg.register('a', makeHandler());
    reg.register('b', makeHandler());
    expect(reg.unregister('a')).toBe(true);
    expect(reg.unregister('a')).toBe(false);
    expect(reg.has('b')).toBe(true);
    reg.clear();
    expect(reg.list()).toEqual([]);
  });
});

// ─── CapabilityRegistry — resolution + invocation ────────────────

describe('CapabilityRegistry — resolution', () => {
  let reg: CapabilityRegistry;
  beforeEach(() => {
    reg = new CapabilityRegistry();
  });

  it('resolves by capability verb', async () => {
    reg.register('mail.send', makeHandler({ invoke: () => 'sent' }));
    const res = await reg.invoke({ capability: 'mail.send' });
    expect(expectOk(res).value).toBe('sent');
    expect(res.ok && res.handler).toBe('mail.send');
  });

  it('prefers an explicit connector over the verb', async () => {
    reg.register('mail.send', makeHandler({ invoke: () => 'via-verb' }));
    reg.register('imap', makeHandler({ invoke: () => 'via-connector' }));
    const target: CapabilityTarget = { capability: 'mail.send', connector: 'imap' };
    const res = await reg.invoke(target);
    expect(expectOk(res).value).toBe('via-connector');
    expect(res.ok && res.handler).toBe('imap');
  });

  it('falls back to the verb when the connector is not registered', async () => {
    reg.register('mail.send', makeHandler({ invoke: () => 'via-verb' }));
    const target: CapabilityTarget = { capability: 'mail.send', connector: 'unknown-backend' };
    const res = await reg.invoke(target);
    expect(expectOk(res).value).toBe('via-verb');
    expect(res.ok && res.handler).toBe('mail.send');
  });

  it('returns CAPABILITY_NOT_FOUND when nothing matches', async () => {
    const res = await reg.invoke({ capability: 'erp.read' });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.code).toBe('CAPABILITY_NOT_FOUND');
  });

  it('passes target.args through to the handler', async () => {
    reg.register('echo', echoHandler);
    const res = await reg.invoke({ capability: 'echo', args: { foo: 1, bar: 'x' } });
    expect(expectOk(res).value).toEqual({ echoed: { foo: 1, bar: 'x' } });
  });
});

// ─── Least-privilege gate ────────────────────────────────────────

describe('CapabilityRegistry — least-privilege gate', () => {
  let reg: CapabilityRegistry;
  beforeEach(() => {
    reg = new CapabilityRegistry();
    reg.register('db.write', makeHandler({ requiredCapability: 'db-write', invoke: () => 'wrote' }));
  });

  it('denies when the granted set excludes the required capability', async () => {
    const res = await reg.invoke({ capability: 'db.write' }, { grantedCapabilities: ['fs-read'] });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.code).toBe('CAPABILITY_DENIED');
  });

  it('allows when the granted set includes the required capability', async () => {
    const res = await reg.invoke({ capability: 'db.write' }, { grantedCapabilities: ['db-write'] });
    expect(expectOk(res).value).toBe('wrote');
  });

  it('is permissive when no granted set is provided (opt-in enforcement)', async () => {
    const res = await reg.invoke({ capability: 'db.write' });
    expect(expectOk(res).value).toBe('wrote');
  });

  it('surfaces a handler throw as CAPABILITY_FAILED (never throws)', async () => {
    reg.register('boom', makeHandler({
      invoke: () => {
        throw new Error('kaboom');
      },
    }));
    const res = await reg.invoke({ capability: 'boom' });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.code).toBe('CAPABILITY_FAILED');
    expect(!res.ok && res.error).toContain('kaboom');
  });
});

// ─── Reference handlers ──────────────────────────────────────────

describe('reference handlers', () => {
  it('echoHandler returns args verbatim and declares mcp-tool', async () => {
    expect(echoHandler.requiredCapability).toBe('mcp-tool');
    const out = await echoHandler.invoke({ a: 1 }, {});
    expect(out).toEqual({ echoed: { a: 1 } });
  });

  describe('fsReadHandler (real fs)', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'cap-broker-'));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('reads a real file under projectRoot', async () => {
      writeFileSync(join(dir, 'note.txt'), 'hello-broker');
      const out = (await fsReadHandler.invoke({ path: 'note.txt' }, { projectRoot: dir })) as {
        content: string;
      };
      expect(out.content).toBe('hello-broker');
    });

    it('throws on a missing file (→ CAPABILITY_FAILED via registry)', async () => {
      await expect(fsReadHandler.invoke({ path: 'absent.txt' }, { projectRoot: dir })).rejects.toThrow();
    });

    it('throws on a non-string path', async () => {
      await expect(fsReadHandler.invoke({ path: 42 }, { projectRoot: dir })).rejects.toThrow();
    });

    it('refuses a path that escapes projectRoot (traversal containment)', async () => {
      await expect(
        fsReadHandler.invoke({ path: '../../etc/passwd' }, { projectRoot: dir }),
      ).rejects.toThrow(/escapes/);
    });

    it('integrates through the registry as CAPABILITY_FAILED on bad path', async () => {
      const reg = createDefaultRegistry();
      const res = await reg.invoke({ capability: 'fs.read', args: { path: 'nope.txt' } }, { projectRoot: dir });
      expect(res.ok).toBe(false);
      expect(!res.ok && res.code).toBe('CAPABILITY_FAILED');
    });
  });
});

// ─── Default registry + convenience surface ──────────────────────

describe('default registry convenience surface', () => {
  afterEach(() => {
    resetDefaultCapabilityRegistry();
  });

  it('ships echo + fs.read preinstalled', () => {
    expect(listCapabilities()).toEqual(['echo', 'fs.read']);
    expect(hasCapability('echo')).toBe(true);
  });

  it('registerCapability mutates the default registry; invokeCapability uses it', async () => {
    registerCapability('ping', makeHandler({ invoke: () => 'pong' }));
    expect(hasCapability('ping')).toBe(true);
    const res = await invokeCapability({ capability: 'ping' });
    expect(expectOk(res).value).toBe('pong');
  });

  it('resetDefaultCapabilityRegistry restores the baseline (no leak across tests)', () => {
    registerCapability('leak', makeHandler());
    expect(hasCapability('leak')).toBe(true);
    resetDefaultCapabilityRegistry();
    expect(hasCapability('leak')).toBe(false);
    expect(listCapabilities()).toEqual(['echo', 'fs.read']);
  });

  it('getDefaultRegistry tracks the live instance after reset', () => {
    const before = getDefaultRegistry();
    resetDefaultCapabilityRegistry();
    expect(getDefaultRegistry()).not.toBe(before);
  });

  it('installReferenceHandlers populates an arbitrary registry', () => {
    const reg = new CapabilityRegistry();
    installReferenceHandlers(reg);
    expect(reg.list()).toEqual(['echo', 'fs.read']);
  });
});

// ─── invokeFromRequest — ExecutionRequest consumer ───────────────

describe('invokeFromRequest', () => {
  afterEach(() => {
    resetDefaultCapabilityRegistry();
  });

  it('returns CAPABILITY_NOT_FOUND when the request has no capabilityTarget', async () => {
    const res = await invokeFromRequest(makeRequest());
    expect(res.ok).toBe(false);
    expect(!res.ok && res.code).toBe('CAPABILITY_NOT_FOUND');
  });

  it('extracts the target and invokes the matching handler', async () => {
    registerCapability('mail.send', makeHandler({ requiredCapability: 'network', invoke: () => 'queued' }));
    const req = makeRequest({
      capabilityTarget: { capability: 'mail.send', args: { to: 'a@b.c' } },
      requirements: { capabilities: ['network'], resources: [] },
    });
    const res = await invokeFromRequest(req);
    expect(expectOk(res).value).toBe('queued');
  });

  it('derives the least-privilege grant set from requirements.capabilities', async () => {
    registerCapability('db.write', makeHandler({ requiredCapability: 'db-write', invoke: () => 'ok' }));
    // requirements grant fs-read only → db-write handler denied
    const req = makeRequest({
      capabilityTarget: { capability: 'db.write' },
      requirements: { capabilities: ['fs-read'], resources: [] },
    });
    const res = await invokeFromRequest(req);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.code).toBe('CAPABILITY_DENIED');
  });

  it('lets an explicit ctx override the request-derived grant set', async () => {
    registerCapability('db.write', makeHandler({ requiredCapability: 'db-write', invoke: () => 'ok' }));
    const req = makeRequest({
      capabilityTarget: { capability: 'db.write' },
      requirements: { capabilities: ['fs-read'], resources: [] },
    });
    const res = await invokeFromRequest(req, { grantedCapabilities: ['db-write'] });
    expect(expectOk(res).value).toBe('ok');
  });

  it('routes against a provided registry instead of the default', async () => {
    const reg = new CapabilityRegistry();
    reg.register('erp.read', makeHandler({ requiredCapability: 'erp-read', invoke: () => 'rows' }));
    const req = makeRequest({
      capabilityTarget: { capability: 'erp.read' },
      requirements: { capabilities: ['erp-read'], resources: [] },
    });
    const res = await invokeFromRequest(req, {}, reg);
    expect(expectOk(res).value).toBe('rows');
  });
});

// ─── Multi-backend selection (F8-002) ────────────────────────────

describe('CapabilityRegistry — multi-backend selection', () => {
  let reg: CapabilityRegistry;
  beforeEach(() => {
    reg = new CapabilityRegistry();
  });

  it('single backend registered with no opts: default priority, always available', async () => {
    reg.register('mail.send', makeHandler({ invoke: () => 'sent' }));
    const res = await reg.invoke({ capability: 'mail.send' });
    expect(expectOk(res).value).toBe('sent');
  });

  it('picks the highest-priority backend when several share a name', async () => {
    reg.register('mail.send', makeHandler({ invoke: () => 'low' }), { priority: 1 });
    reg.register('mail.send', makeHandler({ invoke: () => 'high' }), { priority: 5 });
    const res = await reg.invoke({ capability: 'mail.send' });
    expect(expectOk(res).value).toBe('high');
  });

  it('skips an unavailable higher-priority backend, falls back to an available lower one', async () => {
    reg.register('mail.send', makeHandler({ invoke: () => 'low-available' }), { priority: 1 });
    reg.register('mail.send', makeHandler({ invoke: () => 'high-down' }), {
      priority: 9,
      isAvailable: () => false,
    });
    const res = await reg.invoke({ capability: 'mail.send' });
    expect(expectOk(res).value).toBe('low-available');
  });

  it('returns CAPABILITY_NOT_FOUND when a registered name has no available backend', async () => {
    reg.register('mail.send', makeHandler({ invoke: () => 'x' }), { isAvailable: () => false });
    const res = await reg.invoke({ capability: 'mail.send' });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.code).toBe('CAPABILITY_NOT_FOUND');
    expect(!res.ok && res.error).toContain('all backends unavailable');
  });

  it('equal priority → most-recently registered wins (last-writer-wins preserved)', async () => {
    reg.register('x', makeHandler({ invoke: () => 'first' }));
    reg.register('x', makeHandler({ invoke: () => 'second' }));
    const res = await reg.invoke({ capability: 'x' });
    expect(expectOk(res).value).toBe('second');
  });

  it('get() returns the top backend ignoring availability (has ⟺ get)', () => {
    const down = makeHandler({ description: 'down' });
    reg.register('x', down, { priority: 5, isAvailable: () => false });
    expect(reg.has('x')).toBe(true);
    expect(reg.get('x')).toBe(down);
  });

  it('a throwing isAvailable() predicate counts as unavailable (registry never throws)', async () => {
    reg.register('x', makeHandler({ invoke: () => 'safe' }), { priority: 1 });
    reg.register('x', makeHandler({ invoke: () => 'boom-probe' }), {
      priority: 9,
      isAvailable: () => {
        throw new Error('probe failed');
      },
    });
    const res = await reg.invoke({ capability: 'x' });
    expect(expectOk(res).value).toBe('safe');
  });

  it('connector falls back to the verb when the connector backend is unavailable', async () => {
    reg.register('mail.send', makeHandler({ invoke: () => 'via-verb' }));
    reg.register('imap', makeHandler({ invoke: () => 'via-connector' }), {
      isAvailable: () => false,
    });
    const res = await reg.invoke({ capability: 'mail.send', connector: 'imap' });
    expect(expectOk(res).value).toBe('via-verb');
    expect(res.ok && res.handler).toBe('mail.send');
  });
});

// ─── listBackends introspection ──────────────────────────────────

describe('CapabilityRegistry — listBackends', () => {
  let reg: CapabilityRegistry;
  beforeEach(() => {
    reg = new CapabilityRegistry();
  });

  it('returns [] for an unregistered name', () => {
    expect(reg.listBackends('absent')).toEqual([]);
  });

  it('lists labels in resolution order (priority desc, ties most-recent first)', () => {
    reg.register('mail.send', makeHandler({ description: 'smtp-low' }), { priority: 1 });
    reg.register('mail.send', makeHandler({ description: 'graph-high' }), { priority: 5 });
    reg.register('mail.send', makeHandler({ description: 'imap-low2' }), { priority: 1 });
    expect(reg.listBackends('mail.send')).toEqual(['graph-high', 'imap-low2', 'smtp-low']);
  });

  it('falls back to requiredCapability when a backend has no description', () => {
    reg.register('x', makeHandler({ requiredCapability: 'db-write' }));
    expect(reg.listBackends('x')).toEqual(['db-write']);
  });
});

// ─── Module registerCapability opts forwarding ───────────────────

describe('registerCapability opts forwarding (default registry)', () => {
  afterEach(() => {
    resetDefaultCapabilityRegistry();
  });

  it('forwards priority so the higher-priority backend is selected', async () => {
    registerCapability('mail.send', makeHandler({ invoke: () => 'low' }), { priority: 1 });
    registerCapability('mail.send', makeHandler({ invoke: () => 'high' }), { priority: 5 });
    const res = await invokeCapability({ capability: 'mail.send' });
    expect(expectOk(res).value).toBe('high');
  });

  it('forwards isAvailable so an unavailable backend is skipped', async () => {
    registerCapability('svc', makeHandler({ invoke: () => 'up' }), { priority: 1 });
    registerCapability('svc', makeHandler({ invoke: () => 'down' }), {
      priority: 9,
      isAvailable: () => false,
    });
    const res = await invokeCapability({ capability: 'svc' });
    expect(expectOk(res).value).toBe('up');
  });
});
