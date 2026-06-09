import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hostname } from 'node:os';
import { createSyslogSiemTransport } from '../../src/core/siem-transport-syslog.js';
import type { SiemRecord } from '../../src/core/siem-forwarder.js';

// ─── Hermetic socket-module mocks ─────────────────────────────────────────────
// node:dgram and node:net are fully mocked: NO real socket is ever opened in
// this file. The injected `sendImpl` path never touches these modules either —
// asserted explicitly below.

const sockets = vi.hoisted(() => ({
  udp: {
    created: 0,
    closed: 0,
    sends: [] as Array<{ port: number; host: string; payload: string }>,
    sendError: null as Error | null,
  },
  tcp: {
    created: 0,
    writes: [] as Array<{ host: number | string; port: number | string; data: string }>,
    connectError: null as Error | null,
  },
  reset() {
    this.udp = { created: 0, closed: 0, sends: [], sendError: null };
    this.tcp = { created: 0, writes: [], connectError: null };
  },
}));

vi.mock('node:dgram', () => ({
  createSocket: (_type: string) => {
    sockets.udp.created++;
    return {
      send(buf: Buffer, port: number, host: string, cb: (err: Error | null) => void) {
        sockets.udp.sends.push({ port, host, payload: buf.toString('utf8') });
        cb(sockets.udp.sendError);
      },
      close() {
        sockets.udp.closed++;
      },
    };
  },
}));

vi.mock('node:net', () => ({
  createConnection: (opts: { host: string; port: number }, onConnect?: () => void) => {
    sockets.tcp.created++;
    const handlers: Record<string, (err: Error) => void> = {};
    const sock = {
      on(event: string, fn: (err: Error) => void) {
        handlers[event] = fn;
        return sock;
      },
      end(data: string, cb?: () => void) {
        sockets.tcp.writes.push({ host: opts.host, port: opts.port, data });
        cb?.();
      },
      destroy() {},
    };
    queueMicrotask(() => {
      if (sockets.tcp.connectError) handlers['error']?.(sockets.tcp.connectError);
      else onConnect?.();
    });
    return sock;
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<SiemRecord> = {}): SiemRecord {
  return {
    ts: '2026-06-09T12:00:00.000Z',
    actor: 'user-001',
    action: 'resource:read',
    outcome: 'success',
    ...overrides,
  };
}

/** Split one RFC 5424 message into its 7 header fields + the MSG remainder. */
function splitMessage(msg: string): { fields: string[]; payload: string } {
  const parts = msg.split(' ');
  return { fields: parts.slice(0, 7), payload: parts.slice(7).join(' ') };
}

beforeEach(() => {
  sockets.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── RFC 5424 message format (via injected sendImpl — hermetic) ──────────────

describe('createSyslogSiemTransport — RFC 5424 format', () => {
  it('uses PRI <110> by default (facility 13 "log audit" * 8 + severity 6 info) and VERSION 1', async () => {
    const captured: string[] = [];
    const sendImpl = vi.fn(async (messages: string[]) => {
      captured.push(...messages);
    });

    const transport = createSyslogSiemTransport({ host: 'siem.local', sendImpl });
    await transport([makeRecord()]);

    expect(captured).toHaveLength(1);
    expect(captured[0]!.startsWith('<110>1 ')).toBe(true);
  });

  it('emits RFC 5424 field order: <PRI>1 TIMESTAMP HOSTNAME APP-NAME PROCID MSGID SD MSG', async () => {
    const captured: string[] = [];
    const sendImpl = async (messages: string[]) => {
      captured.push(...messages);
    };

    const transport = createSyslogSiemTransport({ host: 'siem.local', sendImpl });
    const record = makeRecord();
    await transport([record]);

    const { fields } = splitMessage(captured[0]!);
    expect(fields[0]).toBe('<110>1'); // PRI + VERSION
    expect(fields[1]).toBe(record.ts); // TIMESTAMP = record.ts (ISO-8601)
    expect(fields[2]).toBe(hostname() || '-'); // HOSTNAME
    expect(fields[3]).toBe('deckent'); // APP-NAME default
    expect(fields[4]).toMatch(/^\d+$/); // PROCID = pid
    expect(fields[5]).toBe('-'); // MSGID = NILVALUE
    expect(fields[6]).toBe('-'); // STRUCTURED-DATA = NILVALUE
  });

  it('MSG part is the SiemRecord JSON (round-trips via JSON.parse)', async () => {
    const captured: string[] = [];
    const transport = createSyslogSiemTransport({
      host: 'siem.local',
      sendImpl: async (messages) => {
        captured.push(...messages);
      },
    });
    const record = makeRecord({ correlationId: 'corr-1', causationId: 'caus-1' });
    await transport([record]);

    const { payload } = splitMessage(captured[0]!);
    expect(JSON.parse(payload)).toEqual(record);
  });

  it('honors custom facility and appName (facility 4 → PRI 38)', async () => {
    const captured: string[] = [];
    const transport = createSyslogSiemTransport({
      host: 'siem.local',
      facility: 4,
      appName: 'custom-app',
      sendImpl: async (messages) => {
        captured.push(...messages);
      },
    });
    await transport([makeRecord()]);

    const { fields } = splitMessage(captured[0]!);
    expect(fields[0]).toBe('<38>1'); // 4 * 8 + 6
    expect(fields[3]).toBe('custom-app');
  });

  it('formats one message per record in the batch', async () => {
    const captured: string[] = [];
    const transport = createSyslogSiemTransport({
      host: 'siem.local',
      sendImpl: async (messages) => {
        captured.push(...messages);
      },
    });
    await transport([
      makeRecord({ action: 'a:1' }),
      makeRecord({ action: 'a:2' }),
      makeRecord({ action: 'a:3' }),
    ]);

    expect(captured).toHaveLength(3);
    expect(captured.map((m) => (JSON.parse(splitMessage(m).payload) as SiemRecord).action)).toEqual(
      ['a:1', 'a:2', 'a:3'],
    );
  });

  it('empty batch is a no-op — sendImpl is never invoked', async () => {
    const sendImpl = vi.fn(async (_messages: string[]) => {});
    const transport = createSyslogSiemTransport({ host: 'siem.local', sendImpl });

    await transport([]);

    expect(sendImpl).not.toHaveBeenCalled();
  });
});

// ─── Socket selection (defaults vs injected sendImpl) ────────────────────────

describe('createSyslogSiemTransport — socket selection', () => {
  it('NEVER opens a socket when sendImpl is injected (udp and tcp opts alike)', async () => {
    const sendImpl = async (_messages: string[]) => {};

    const udpTransport = createSyslogSiemTransport({ host: 'h', protocol: 'udp', sendImpl });
    const tcpTransport = createSyslogSiemTransport({ host: 'h', protocol: 'tcp', sendImpl });
    await udpTransport([makeRecord()]);
    await tcpTransport([makeRecord()]);

    expect(sockets.udp.created).toBe(0);
    expect(sockets.tcp.created).toBe(0);
  });

  it('defaults to udp (node:dgram) on port 514 when sendImpl is omitted', async () => {
    const transport = createSyslogSiemTransport({ host: 'siem.local' });
    await transport([makeRecord(), makeRecord({ action: 'a:2' })]);

    expect(sockets.udp.created).toBe(1);
    expect(sockets.tcp.created).toBe(0);
    expect(sockets.udp.sends).toHaveLength(2); // one datagram per message
    expect(sockets.udp.sends[0]).toMatchObject({ host: 'siem.local', port: 514 });
    expect(sockets.udp.sends[0]!.payload.startsWith('<110>1 ')).toBe(true);
    expect(sockets.udp.closed).toBe(1); // socket released after the batch
  });

  it('uses tcp (node:net) with newline framing when protocol is tcp', async () => {
    const transport = createSyslogSiemTransport({
      host: 'siem.local',
      port: 6514,
      protocol: 'tcp',
    });
    await transport([makeRecord({ action: 'a:1' }), makeRecord({ action: 'a:2' })]);

    expect(sockets.tcp.created).toBe(1);
    expect(sockets.udp.created).toBe(0);
    expect(sockets.tcp.writes).toHaveLength(1);
    expect(sockets.tcp.writes[0]).toMatchObject({ host: 'siem.local', port: 6514 });

    const lines = sockets.tcp.writes[0]!.data.split('\n');
    expect(lines.at(-1)).toBe(''); // newline-terminated framing
    expect(lines.slice(0, -1)).toHaveLength(2); // one line per message
    for (const line of lines.slice(0, -1)) {
      expect(line.startsWith('<110>1 ')).toBe(true);
    }
  });
});

// ─── Error propagation (transport throws → forwarder retries) ────────────────

describe('createSyslogSiemTransport — error propagation', () => {
  it('rejects when the injected sendImpl rejects (forwarder owns retries)', async () => {
    const sendImpl = async (_messages: string[]) => {
      throw new Error('collector unreachable');
    };
    const transport = createSyslogSiemTransport({ host: 'siem.local', sendImpl });

    await expect(transport([makeRecord()])).rejects.toThrow('collector unreachable');
  });

  it('binds the udp send-callback error to the promise and still closes the socket', async () => {
    sockets.udp.sendError = new Error('EHOSTUNREACH');
    const transport = createSyslogSiemTransport({ host: 'siem.local' });

    await expect(transport([makeRecord()])).rejects.toThrow('EHOSTUNREACH');
    expect(sockets.udp.closed).toBe(1);
  });

  it('rejects when the tcp connection emits an error', async () => {
    sockets.tcp.connectError = new Error('ECONNREFUSED');
    const transport = createSyslogSiemTransport({ host: 'siem.local', protocol: 'tcp' });

    await expect(transport([makeRecord()])).rejects.toThrow('ECONNREFUSED');
  });
});

// ─── Option validation ────────────────────────────────────────────────────────

describe('createSyslogSiemTransport — option validation', () => {
  it('throws on an empty host', () => {
    expect(() => createSyslogSiemTransport({ host: '' })).toThrow(/host/);
  });

  it('throws on an invalid protocol', () => {
    expect(() =>
      createSyslogSiemTransport({ host: 'h', protocol: 'tls' as unknown as 'udp' }),
    ).toThrow(/protocol/);
  });

  it('throws on an out-of-range port or facility, and on whitespace in appName', () => {
    expect(() => createSyslogSiemTransport({ host: 'h', port: 0 })).toThrow(/port/);
    expect(() => createSyslogSiemTransport({ host: 'h', port: 70000 })).toThrow(/port/);
    expect(() => createSyslogSiemTransport({ host: 'h', facility: 24 })).toThrow(/facility/);
    expect(() => createSyslogSiemTransport({ host: 'h', appName: 'bad name' })).toThrow(/appName/);
  });
});
