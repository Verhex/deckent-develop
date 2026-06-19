// tests/connectors/gateway/runtime-supervisor.test.ts
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeRuntimeSupervisor, type ChildLike, type SpawnRuntimeFn } from '../../../src/connectors/gateway/runtime-supervisor.js';
import { encodeFrame, decodeFrames, type GatewayRequest } from '../../../src/connectors/gateway/gateway-ipc.js';

/** A fake child that echoes each request back as a final frame. */
function makeFakeChild(): { child: ChildLike; capturedEnv: NodeJS.ProcessEnv | null } {
  const ee = new EventEmitter();
  const stdoutListeners: Array<(c: string) => void> = [];
  const child: ChildLike = {
    stdin: {
      write(s: string) {
        const { frames } = decodeFrames(s);
        for (const f of frames) {
          const req = f as GatewayRequest;
          const reply = encodeFrame({ id: req.id, kind: 'final', parts: [`echo:${req.text}`] });
          for (const l of stdoutListeners) l(reply);
        }
      },
    },
    stdout: { setEncoding() {}, on(_ev, cb) { stdoutListeners.push(cb); } },
    on: (ev, cb) => ee.on(ev, cb as (...a: unknown[]) => void),
    kill: () => ee.emit('exit', 0),
    pid: 1234,
  };
  return { child, capturedEnv: null };
}

describe('RuntimeSupervisor', () => {
  it('spawns once per project and round-trips a request', async () => {
    let spawns = 0;
    const spawnFn: SpawnRuntimeFn = () => { spawns++; return makeFakeChild().child; };
    const sup = makeRuntimeSupervisor({ spawnFn });

    const h = sup.getOrSpawn('/foo');
    const resp = await h.send({ id: 'x1', chatKey: 'telegram:1', kind: 'message', text: 'hi' });
    expect(resp.kind === 'final' && resp.parts.join('')).toBe('echo:hi');

    sup.getOrSpawn('/foo'); // same project → no second spawn
    expect(spawns).toBe(1);
    await sup.dispose();
  });

  it('strips ANTHROPIC_API_KEY from the spawned child env', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-should-not-leak';
    let seen: NodeJS.ProcessEnv | undefined;
    const spawnFn: SpawnRuntimeFn = (_p, env) => { seen = env; return makeFakeChild().child; };
    const sup = makeRuntimeSupervisor({ spawnFn });
    try {
      sup.getOrSpawn('/foo');
      expect(seen && 'ANTHROPIC_API_KEY' in seen).toBe(false);
    } finally {
      delete process.env['ANTHROPIC_API_KEY'];
      await sup.dispose();
    }
  });

  it('respawns after the child exits', async () => {
    let spawns = 0;
    const children: ChildLike[] = [];
    const spawnFn: SpawnRuntimeFn = () => { spawns++; const c = makeFakeChild().child; children.push(c); return c; };
    const sup = makeRuntimeSupervisor({ spawnFn });
    sup.getOrSpawn('/foo');
    children[0]!.kill(); // emit exit
    await new Promise((r) => setTimeout(r, 0));
    sup.getOrSpawn('/foo'); // dead → respawn
    expect(spawns).toBe(2);
    await sup.dispose();
  });
});
