// Real loopback transport proof: a stalled Ollama-compatible HTTP endpoint
// must observe the abort and release its socket; no external provider is used.
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createProviderEvidence } from '../../../src/cli/repl/provider-evidence.js';

const servers: Array<ReturnType<typeof createServer>> = [];
const sockets = new Set<Socket>();

function within<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    void work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('Ollama HTTP evidence containment', () => {
  it('aborts and closes an actual hanging loopback request without caching reachability', async () => {
    let observedRequest!: () => void;
    let observedClose!: () => void;
    const requestObserved = new Promise<void>((resolve) => { observedRequest = resolve; });
    const requestClosed = new Promise<void>((resolve) => { observedClose = resolve; });
    const server = createServer((request) => {
      observedRequest();
      request.on('close', observedClose);
      // Deliberately never write a response: this is the hung local endpoint.
    });
    servers.push(server);
    server.on('connection', (socket) => sockets.add(socket));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('loopback listen failed');

    const store = createProviderEvidence({
      probeAuth: async () => ({ state: 'unknown', present: 'unknown', authenticated: 'unknown', method: 'none' }),
      fetchFn: globalThis.fetch,
      ollamaHost: `http://127.0.0.1:${address.port}`,
      hostCliProviders: [],
      providers: ['ollama'],
      // Use the production deadline: the proof must not abort before a loaded
      // loopback server has accepted the request.
    });
    const refresh = store.refresh();
    await within(requestObserved, 2_000, 'loopback request was not observed');
    await refresh;
    expect(store.get('ollama')).toEqual({ ok: 'unknown' });
    expect(store.inFlight()).toEqual([]);
    await within(requestClosed, 2_000, 'loopback request did not close after abort');
  }, 10_000);
});
