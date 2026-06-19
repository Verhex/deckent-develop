// src/connectors/gateway/runtime-supervisor.ts
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeFrames, encodeFrame, type GatewayRequest, type GatewayResponse } from './gateway-ipc.js';

export interface ChildLike {
  stdin: { write(s: string): void };
  stdout: { setEncoding(e: string): void; on(ev: 'data', cb: (c: string) => void): void };
  on(ev: 'exit', cb: (code: number | null) => void): void;
  kill(): void;
  pid?: number;
}

export type SpawnRuntimeFn = (projectPath: string, env: NodeJS.ProcessEnv) => ChildLike;

export interface RuntimeHandle {
  readonly projectPath: string;
  send(req: GatewayRequest): Promise<GatewayResponse>;
}

export interface RuntimeSupervisor {
  getOrSpawn(projectPath: string): RuntimeHandle;
  dispose(): Promise<void>;
}

export interface RuntimeSupervisorOptions {
  /** Inject the spawn function (tests). Default: real `gateway-runtime` child. */
  spawnFn?: SpawnRuntimeFn;
  /** Per-request reply timeout (default 120000ms). */
  sendTimeoutMs?: number;
}

interface Runtime {
  child: ChildLike;
  alive: boolean;
  buffer: string;
  pending: Map<string, (resp: GatewayResponse) => void>;
}

export function makeRuntimeSupervisor(opts: RuntimeSupervisorOptions = {}): RuntimeSupervisor {
  const spawnFn = opts.spawnFn ?? defaultSpawn;
  const timeoutMs = opts.sendTimeoutMs ?? 120_000;
  const runtimes = new Map<string, Runtime>();

  function spawnRuntime(projectPath: string): Runtime {
    // Auth invariant: child must NOT inherit ANTHROPIC_API_KEY (subscription-auth).
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env['ANTHROPIC_API_KEY'];

    const child = spawnFn(projectPath, env);
    const rt: Runtime = { child, alive: true, buffer: '', pending: new Map() };

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      rt.buffer += chunk;
      const { frames, rest } = decodeFrames(rt.buffer);
      rt.buffer = rest;
      for (const f of frames) {
        const resp = f as GatewayResponse;
        const resolve = rt.pending.get(resp.id);
        if (resolve && resp.kind === 'final') { rt.pending.delete(resp.id); resolve(resp); }
      }
    });
    child.on('exit', () => {
      rt.alive = false;
      for (const [, resolve] of rt.pending) {
        resolve({ id: '', kind: 'final', parts: ['[runtime-exited]'] });
      }
      rt.pending.clear();
    });
    return rt;
  }

  function getRuntime(projectPath: string): Runtime {
    const existing = runtimes.get(projectPath);
    if (existing && existing.alive) return existing;
    const rt = spawnRuntime(projectPath); // respawn if dead/missing
    runtimes.set(projectPath, rt);
    return rt;
  }

  return {
    getOrSpawn(projectPath: string): RuntimeHandle {
      getRuntime(projectPath); // eager spawn so callers/tests can observe it
      return {
        projectPath,
        send(req: GatewayRequest): Promise<GatewayResponse> {
          const rt = getRuntime(projectPath);
          return new Promise<GatewayResponse>((resolve) => {
            const timer = setTimeout(() => {
              rt.pending.delete(req.id);
              resolve({ id: req.id, kind: 'final', parts: ['[runtime-timeout]'] });
            }, timeoutMs);
            if (typeof (timer as NodeJS.Timeout).unref === 'function') (timer as NodeJS.Timeout).unref();
            rt.pending.set(req.id, (resp) => { clearTimeout(timer); resolve(resp); });
            rt.child.stdin.write(encodeFrame(req));
          });
        },
      };
    },
    async dispose(): Promise<void> {
      for (const rt of runtimes.values()) {
        try { if (rt.alive) rt.child.kill(); } catch { /* best-effort */ }
      }
      runtimes.clear();
    },
  };
}

/** Resolve dist/cli/entry.js relative to this compiled module (dist/connectors/gateway). */
function entryPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'cli', 'entry.js');
}

const defaultSpawn: SpawnRuntimeFn = (projectPath, env) => {
  const child = spawn(process.execPath, [entryPath(), 'gateway-runtime', '--project', projectPath], {
    env,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  return child as unknown as ChildLike;
};
