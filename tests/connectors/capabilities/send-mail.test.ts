import { describe, it, expect, vi } from 'vitest';
import { sendMailCapability, matchRecipient } from '../../../src/connectors/capabilities/builtin/send-mail.js';
import type { CapabilityContext, MailTransport } from '../../../src/connectors/capabilities/types.js';

function ctx(over: Partial<CapabilityContext>): CapabilityContext {
  return { chatKey: 'c', project: '/tmp', lang: 'en', config: { enabled: true }, now: 1, spawn: vi.fn() as never,
    loadMailTransport: async () => { throw new Error('SMTP not configured'); }, ...over } as CapabilityContext;
}

describe('matchRecipient', () => {
  it('exact + domain rules', () => {
    expect(matchRecipient('a@x.com', 'a@x.com')).toBe(true);
    expect(matchRecipient('a@x.com', '@x.com')).toBe(true);
    expect(matchRecipient('a@x.com', '*@x.com')).toBe(true);
    expect(matchRecipient('a@y.com', '@x.com')).toBe(false);
  });
});

describe('sendMailCapability.preview (Task 4 — rich multi-line)', () => {
  it('TR: preview is multi-line with bold *Kime* / *Konu* / *Gövde*', () => {
    const p = sendMailCapability.preview({ to: 'a@x.com', subject: 'Hi', body: 'Hello world' } as any, 'tr');
    expect(p).toMatch(/\*Kime:\*/);
    expect(p).toMatch(/\*Konu:\*/);
    expect(p).toMatch(/Hi/);
    expect(p).toMatch(/Hello world/);
    // multi-line: must contain a newline between fields
    expect(p).toContain('\n');
  });

  it('EN: preview is multi-line with bold *To* / *Subject* / *Body*', () => {
    const p = sendMailCapability.preview({ to: 'b@y.com', subject: 'Test', body: 'Body text' } as any, 'en');
    expect(p).toMatch(/\*To:\*/);
    expect(p).toMatch(/\*Subject:\*/);
    expect(p).toMatch(/\*Body:\*/);
    expect(p).toContain('\n');
  });

  it('preview includes body up to 200 chars (not truncated at 120)', () => {
    const longBody = 'x'.repeat(180);
    const p = sendMailCapability.preview({ to: 'c@z.com', subject: 'S', body: longBody } as any, 'en');
    // All 180 chars must appear (old code truncated at 120)
    expect(p).toContain('x'.repeat(180));
  });
});

describe('sendMailCapability', () => {
  it('missing SMTP config → honest error, no send', async () => {
    const res = await sendMailCapability.run({ to: 'a@x.com', subject: 's', body: 'b' }, ctx({}));
    expect(res.text).toMatch(/SMTP|yapılandırılmamış/i);
  });
  it('recipient outside allowlist → denied before send', async () => {
    const sendMail = vi.fn();
    const res = await sendMailCapability.run({ to: 'a@evil.com', subject: 's', body: 'b' },
      ctx({ config: { enabled: true, mail: { allowedRecipients: ['@corp.com'] } },
            loadMailTransport: async () => ({ sendMail } as unknown as MailTransport) }));
    expect(sendMail).not.toHaveBeenCalled();
    expect(res.text).toMatch(/not allowed|izinli değil/i);
  });
  it('multi-recipient: any recipient outside allowlist → denied before send', async () => {
    const sendMail = vi.fn();
    const res = await sendMailCapability.run(
      { to: ['a@corp.com', 'b@evil.com'], subject: 's', body: 'b' },
      ctx({ config: { enabled: true, mail: { allowedRecipients: ['@corp.com'] } },
            loadMailTransport: async () => ({ sendMail } as unknown as MailTransport) }));
    expect(sendMail).not.toHaveBeenCalled();
    expect(res.text).toMatch(/not allowed|izinli değil/i);
  });
  it('multi-recipient: all allowed → transport called once', async () => {
    const sendMail = vi.fn(async () => ({ messageId: 'mid-2' }));
    const res = await sendMailCapability.run(
      { to: ['a@corp.com', 'b@corp.com'], subject: 's', body: 'b' },
      ctx({ config: { enabled: true, mail: { from: 'bot@corp.com', allowedRecipients: ['@corp.com'], smtp: { host: 'smtp' } } },
            loadMailTransport: async () => ({ sendMail } as unknown as MailTransport) }));
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(res.text).toContain('mid-2');
  });
  it('valid → calls transport with correct envelope', async () => {
    const sendMail = vi.fn(async () => ({ messageId: 'mid-1' }));
    const res = await sendMailCapability.run({ to: 'a@corp.com', subject: 'Hi', body: 'Body' },
      ctx({ config: { enabled: true, mail: { from: 'bot@corp.com', allowedRecipients: ['@corp.com'], smtp: { host: 'smtp' } } },
            loadMailTransport: async () => ({ sendMail } as unknown as MailTransport) }));
    expect(sendMail).toHaveBeenCalledWith({ from: 'bot@corp.com', to: 'a@corp.com', subject: 'Hi', text: 'Body' });
    expect(res.text).toContain('mid-1');
  });
});
