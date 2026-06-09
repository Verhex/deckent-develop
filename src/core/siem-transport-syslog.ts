// ═══ SIEM Syslog Transport (RFC 5424) ══════════════════════════════════════════
// Pluggable syslog transport for the SIEM forwarder (`siem-forwarder.ts`).
// Formats each SiemRecord as one RFC 5424 message and ships the batch via an
// injectable `sendImpl` — the default implementation uses node:dgram (UDP) or
// node:net (TCP, newline-framed). Real sockets are opened ONLY inside the
// default implementation; tests always inject `sendImpl` (hermetic).
//
// Contract (see siem-forwarder.ts): `(batch: SiemRecord[]) => Promise<void>`.
// Send failures THROW — the forwarder owns retry/drop semantics; no retry here
// (avoids double-retry).
//
// ADR-010: no new runtime deps — Node built-ins only (node:dgram, node:net, node:os).
// ADR-008: imports only from core/.

import { createSocket } from 'node:dgram';
import { createConnection } from 'node:net';
import { hostname } from 'node:os';

import type { SiemRecord } from './siem-forwarder.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Default syslog facility: 13 = "log audit" (RFC 5424 §6.2.1 Table 1) — the
 * designated facility for audit-trail messages, which is exactly what SIEM
 * records are.
 */
const DEFAULT_FACILITY = 13;

/** Fixed severity: 6 = Informational (RFC 5424 §6.2.1 Table 2). */
const SEVERITY_INFO = 6;

const DEFAULT_PORT = 514;
const DEFAULT_APP_NAME = 'deckent';

/** RFC 5424 NILVALUE — placeholder for absent fields. */
const NILVALUE = '-';

// ─── Options ──────────────────────────────────────────────────────────────────

/** Batch sender — receives one formatted RFC 5424 message per SiemRecord. */
export type SyslogSendImpl = (messages: string[]) => Promise<void>;

/** Options for {@link createSyslogSiemTransport}. */
export interface SyslogTransportOptions {
  /** Syslog collector hostname or IP. Required, non-empty. */
  host: string;
  /** Collector port. Default: 514. */
  port?: number;
  /** Wire protocol. Default: 'udp'. TCP uses non-transparent (newline) framing. */
  protocol?: 'udp' | 'tcp';
  /** Syslog facility (0–23). Default: 13 ("log audit", RFC 5424 §6.2.1). */
  facility?: number;
  /** APP-NAME field. Default: 'deckent'. Must not contain whitespace (RFC token). */
  appName?: string;
  /**
   * Injectable sender — receives the formatted messages for the batch. When
   * provided, NO socket is opened (hermetic testing / custom delivery). When
   * omitted, the default node:dgram (udp) / node:net (tcp) sender is used.
   */
  sendImpl?: SyslogSendImpl;
}

// ─── RFC 5424 formatting ──────────────────────────────────────────────────────

/**
 * Format one SiemRecord as an RFC 5424 message:
 * `<PRI>1 TIMESTAMP HOSTNAME APP-NAME PROCID MSGID SD MSG`
 * PRI = facility * 8 + severity (severity fixed at 6/Informational).
 * MSGID and STRUCTURED-DATA are NILVALUE; MSG is the record JSON.
 */
function formatRfc5424(record: SiemRecord, facility: number, appName: string): string {
  const pri = facility * 8 + SEVERITY_INFO;
  // record.ts is ISO-8601 from the forwarder's normalize() — RFC 3339 compatible.
  const timestamp = typeof record.ts === 'string' && record.ts.length > 0 ? record.ts : NILVALUE;
  const host = hostname() || NILVALUE;
  return `<${pri}>1 ${timestamp} ${host} ${appName} ${process.pid} ${NILVALUE} ${NILVALUE} ${JSON.stringify(record)}`;
}

// ─── Default socket senders (real I/O lives ONLY here) ───────────────────────

/** UDP: one datagram per message; send-callback errors reject the promise. */
async function sendUdp(host: string, port: number, messages: string[]): Promise<void> {
  const socket = createSocket('udp4');
  try {
    for (const message of messages) {
      await new Promise<void>((resolve, reject) => {
        socket.send(Buffer.from(message, 'utf8'), port, host, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  } finally {
    socket.close();
  }
}

/** TCP: single connection, non-transparent framing (one message per line). */
function sendTcp(host: string, port: number, messages: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const socket = createConnection({ host, port }, () => {
      socket.end(messages.map((m) => `${m}\n`).join(''), () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
    });
    socket.on('error', (err: Error) => {
      socket.destroy();
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a syslog SIEM transport compatible with `createSiemForwarder`'s
 * `transport` option.
 *
 * @example
 * ```ts
 * const fwd = createSiemForwarder({
 *   transport: createSyslogSiemTransport({ host: 'siem.internal', protocol: 'tcp' }),
 * });
 * ```
 *
 * @throws Error on invalid options (empty host, bad port/protocol/facility,
 *   whitespace in appName).
 */
export function createSyslogSiemTransport(
  opts: SyslogTransportOptions,
): (batch: SiemRecord[]) => Promise<void> {
  const { host, sendImpl } = opts;
  const port = opts.port ?? DEFAULT_PORT;
  const protocol = opts.protocol ?? 'udp';
  const facility = opts.facility ?? DEFAULT_FACILITY;
  const appName = opts.appName ?? DEFAULT_APP_NAME;

  if (typeof host !== 'string' || host.length === 0) {
    throw new Error('syslog transport: host must be a non-empty string');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`syslog transport: port must be an integer in 1-65535, got ${port}`);
  }
  if (protocol !== 'udp' && protocol !== 'tcp') {
    throw new Error(`syslog transport: protocol must be 'udp' or 'tcp', got '${String(protocol)}'`);
  }
  if (!Number.isInteger(facility) || facility < 0 || facility > 23) {
    throw new Error(`syslog transport: facility must be an integer in 0-23, got ${facility}`);
  }
  if (/\s/.test(appName)) {
    throw new Error('syslog transport: appName must not contain whitespace (RFC 5424 APP-NAME)');
  }

  const send: SyslogSendImpl =
    sendImpl ??
    (protocol === 'udp'
      ? (messages) => sendUdp(host, port, messages)
      : (messages) => sendTcp(host, port, messages));

  return async (batch: SiemRecord[]): Promise<void> => {
    if (batch.length === 0) return; // nothing to ship — never open a socket for an empty batch
    const messages = batch.map((record) => formatRfc5424(record, facility, appName));
    await send(messages); // errors propagate — forwarder retries/drops (siem-forwarder.ts)
  };
}
