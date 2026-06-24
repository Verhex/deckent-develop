import type { ZodType } from 'zod';

export type Tier = 'read' | 'local' | 'external' | 'destructive';
export type PolicyDecision = 'auto' | 'confirm' | 'deny';
export type Edition = 'solo' | 'enterprise';
export type PlatformId = 'win-native' | 'win-wsl' | 'darwin' | 'linux' | 'unsupported';

export interface MediaAttachment {
  readonly kind: 'photo' | 'document';
  readonly filename: string;
  readonly mime: string;
  readonly data: Buffer;
  readonly caption?: string;
}

export interface CapabilityResult {
  readonly text?: string;
  readonly media?: readonly MediaAttachment[];
}

export interface SpawnResult { readonly code: number; readonly stdout: Buffer; readonly stderr: string }
export type SpawnFn = (cmd: string, args: readonly string[], opts?: { timeoutMs?: number }) => Promise<SpawnResult>;

export interface MailMessage { readonly from: string; readonly to: string | readonly string[]; readonly subject: string; readonly text: string }
export interface MailTransport { sendMail(msg: MailMessage): Promise<{ messageId: string }> }

export interface MailConfig {
  readonly allowedRecipients?: readonly string[];
  readonly from?: string;
  readonly smtp?: { host?: string; port?: number; user?: string; pass?: string; secure?: boolean };
}

export interface BotCapabilitiesConfig {
  readonly enabled?: boolean;
  readonly policies?: Readonly<Record<string, PolicyDecision>>;
  readonly perChat?: Readonly<Record<string, Readonly<Record<string, PolicyDecision>>>>;
  readonly mail?: MailConfig;
}

export interface CapabilityContext {
  readonly chatKey: string;
  readonly project: string;            // project root path
  readonly lang: string;
  readonly config: BotCapabilitiesConfig;
  readonly now: number;                // injected for deterministic captions/audit
  readonly spawn: SpawnFn;             // injected host-effect (screenshot)
  readonly loadMailTransport: (cfg: MailConfig | undefined) => Promise<MailTransport>; // injected (mail)
}

export interface Capability<A = unknown> {
  readonly id: string;                 // tool name the LLM calls (e.g. 'screenshot', 'send_mail')
  readonly titleKey: string;           // i18n key for human label
  readonly tier: Tier;
  readonly defaultPolicy: PolicyDecision;
  readonly edition: Edition;
  readonly paramsSchema: ZodType<A>;
  preview(args: A, lang: string): string;
  run(args: A, ctx: CapabilityContext): Promise<CapabilityResult>;
}
