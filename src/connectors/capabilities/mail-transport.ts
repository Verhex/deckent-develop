import type { MailConfig, MailTransport } from './types.js';

// Dynamic nodemailer load (optionalDependency) — mirrors loadGrammy(): only loaded
// when mail actually runs, so tsc/unit-tests don't need it installed.
export async function loadNodemailerTransport(cfg: MailConfig | undefined): Promise<MailTransport> {
  if (!cfg?.smtp?.host) throw new Error('SMTP not configured');
  const moduleName = 'nodemailer';
  const mod = await (Function('m', 'return import(m)')(moduleName) as Promise<{ createTransport: (o: unknown) => { sendMail: (m: unknown) => Promise<{ messageId?: string }> } }>);
  const t = mod.createTransport({
    host: cfg.smtp.host, port: cfg.smtp.port ?? 587, secure: cfg.smtp.secure ?? false,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
  });
  return { async sendMail(msg) { const info = await t.sendMail(msg); return { messageId: String(info.messageId ?? '') }; } };
}
