import { z } from 'zod';
import { getMessage } from '../../../cli/helpers/messages.js';
import type { Capability, CapabilityResult } from '../types.js';

const Params = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().min(1),
  body: z.string(),
});
type Params = z.infer<typeof Params>;

export function matchRecipient(addr: string, rule: string): boolean {
  if (rule.startsWith('*@')) return addr.toLowerCase().endsWith(rule.slice(1).toLowerCase());
  if (rule.startsWith('@')) return addr.toLowerCase().endsWith(rule.toLowerCase());
  return addr.toLowerCase() === rule.toLowerCase();
}

function recipientsOf(to: string | readonly string[]): string[] { return Array.isArray(to) ? [...to] : [to as string]; }

function allowed(to: string[], allow?: readonly string[]): boolean {
  if (!allow || allow.length === 0) return true;
  return to.every((addr) => allow.some((rule) => matchRecipient(addr, rule)));
}

export const sendMailCapability: Capability<Params> = {
  id: 'send_mail',
  titleKey: 'cap.mail.title',
  tier: 'external',
  defaultPolicy: 'confirm',
  edition: 'solo',
  paramsSchema: Params,
  preview: (args, lang) => getMessage('cap.mail.preview', lang, {
    to: recipientsOf(args.to).join(', '), subject: args.subject, body: args.body.slice(0, 120),
  }),
  async run(args, ctx): Promise<CapabilityResult> {
    const to = recipientsOf(args.to);
    if (!allowed(to, ctx.config.mail?.allowedRecipients)) {
      return { text: getMessage('cap.mail.recipient_denied', ctx.lang, { to: to.join(', ') }) };
    }
    let transport;
    try { transport = await ctx.loadMailTransport(ctx.config.mail); }
    catch { return { text: getMessage('cap.mail.smtp_missing', ctx.lang) }; }
    const from = ctx.config.mail?.from ?? ctx.config.mail?.smtp?.user ?? '';
    try {
      const { messageId } = await transport.sendMail({ from, to: args.to, subject: args.subject, text: args.body });
      return { text: getMessage('cap.mail.sent', ctx.lang, { to: to.join(', '), subject: args.subject, id: messageId }) };
    } catch (e) {
      return { text: getMessage('cap.mail.failed', ctx.lang, { error: e instanceof Error ? e.message : String(e) }) };
    }
  },
};
