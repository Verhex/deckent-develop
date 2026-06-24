import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:net';
import { sendMailCapability } from '../../../src/connectors/capabilities/builtin/send-mail.js';
import type { CapabilityContext, MailConfig, MailTransport } from '../../../src/connectors/capabilities/types.js';

// Proof-of-function: a REAL SMTP protocol round-trip against a local in-process sink
// (not a nodemailer mock). Hermetic: tmp port, async, torn down in the test.
//
// NOTE: loadNodemailerTransport uses Function('m','return import(m)') which Vite/Vitest
// intercepts at transform time. This smoke test therefore uses a vitest-native import()
// to load nodemailer (same optional dep, real binary). The Function() path is proven
// correct in production via the Node.js smoke script; here we prove the real SMTP
// wire protocol (RCPT TO + Subject) with nodemailer itself.
function smtpSink(): Promise<{ server: Server; port: number; received: () => string }> {
  let buf = '';
  return new Promise((resolve) => {
    const server = createServer((sock) => {
      sock.write('220 localhost ESMTP sink\r\n');
      sock.on('data', (d) => {
        buf += d.toString();
        const line = d.toString();
        if (/^EHLO|^HELO/im.test(line)) sock.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (/^AUTH/im.test(line)) sock.write('235 ok\r\n');
        else if (/^MAIL FROM|^RCPT TO/im.test(line)) sock.write('250 ok\r\n');
        else if (/^DATA/im.test(line)) sock.write('354 end with .\r\n');
        else if (/^\.\r\n/m.test(line)) sock.write('250 queued\r\n');
        else if (/^QUIT/im.test(line)) { sock.write('221 bye\r\n'); sock.end(); }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, received: () => buf }));
  });
}

/** Vitest-native factory: loads nodemailer via native import() (Vite-transform-safe). */
async function makeNativeTransport(cfg: MailConfig | undefined): Promise<MailTransport> {
  if (!cfg?.smtp?.host) throw new Error('SMTP not configured');
  const mod = await import('nodemailer');
  const t = mod.createTransport({
    host: cfg.smtp.host, port: cfg.smtp.port ?? 587, secure: cfg.smtp.secure ?? false,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
  });
  return {
    async sendMail(msg) {
      const info = await t.sendMail(msg as Parameters<typeof t.sendMail>[0]);
      return { messageId: String((info as { messageId?: string }).messageId ?? '') };
    },
  };
}

describe('send_mail real-run (proof-of-function, local SMTP sink)', () => {
  it('opens a real SMTP connection and transmits the envelope', async () => {
    const { server, port, received } = await smtpSink();
    try {
      const cfg = { enabled: true, mail: { from: 'bot@test.local', smtp: { host: '127.0.0.1', port, secure: false } } };
      const ctx = { chatKey: 'smoke', project: process.cwd(), lang: 'en', config: cfg, now: 1,
        spawn: (async () => ({ code: 0, stdout: Buffer.from(''), stderr: '' })) as CapabilityContext['spawn'],
        loadMailTransport: makeNativeTransport } as CapabilityContext;
      const res = await sendMailCapability.run({ to: 'dest@test.local', subject: 'Smoke', body: 'Hello' }, ctx);
      expect(res.text).toMatch(/sent|gönderildi/i);
      const wire = received();
      expect(wire).toMatch(/RCPT TO:.*dest@test.local/i);
      expect(wire).toMatch(/Subject: Smoke/i);
    } finally { server.close(); }
  }, 20_000);
});
