import { z } from 'zod';
import { getMessage } from '../../../cli/helpers/messages.js';
import type { Capability, CapabilityResult } from '../types.js';

const Params = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().min(1),
  body: z.string(),
  attachIds: z.array(z.string()).optional(),
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
  preview: (args, lang) => {
    const base = getMessage('cap.mail.preview', lang, {
      to: recipientsOf(args.to).join(', '), subject: args.subject, body: args.body.slice(0, 200),
    });
    if (!args.attachIds?.length) return base;
    const attachLine = getMessage('cap.mail.preview_attach', lang, { files: args.attachIds.join(', ') });
    return `${base}\n${attachLine}`;
  },
  async run(args, ctx): Promise<CapabilityResult> {
    const to = recipientsOf(args.to);
    if (!allowed(to, ctx.config.mail?.allowedRecipients)) {
      return { text: getMessage('cap.mail.recipient_denied', ctx.lang, { to: to.join(', ') }) };
    }
    // Resolve artifact attachments — ONLY via registered artifact-ids (anti-exfil)
    const attachments: { filename: string; path: string }[] = [];
    for (const aid of args.attachIds ?? []) {
      const ref = ctx.artifacts?.get(ctx.chatKey, aid);
      if (!ref) return { text: getMessage('cap.mail.attach_unknown', ctx.lang, { id: aid }) };
      attachments.push({ filename: ref.filename, path: ref.path });
    }
    let transport;
    try { transport = await ctx.loadMailTransport(ctx.config.mail); }
    catch { return { text: getMessage('cap.mail.smtp_missing', ctx.lang) }; }
    const from = ctx.config.mail?.from ?? ctx.config.mail?.smtp?.user ?? '';
    try {
      const msg = { from, to: args.to, subject: args.subject, text: args.body,
        ...(attachments.length ? { attachments } : {}) };
      const { messageId } = await transport.sendMail(msg);
      return { text: getMessage('cap.mail.sent', ctx.lang, { to: to.join(', '), subject: args.subject, id: messageId }) };
    } catch (e) {
      return { text: getMessage('cap.mail.failed', ctx.lang, { error: e instanceof Error ? e.message : String(e) }) };
    }
  },
};
