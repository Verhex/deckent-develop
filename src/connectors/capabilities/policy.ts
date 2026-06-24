import type { Capability, BotCapabilitiesConfig, PolicyDecision, Edition } from './types.js';

export type PolicyResolution = PolicyDecision | 'unavailable';

export interface PolicyContext {
  readonly chatKey: string;
  readonly config: BotCapabilitiesConfig;
  readonly edition: Edition;
}

export function resolvePolicy(cap: Capability, ctx: PolicyContext): PolicyResolution {
  if (!ctx.config.enabled) return 'unavailable';
  if (cap.edition === 'enterprise' && ctx.edition !== 'enterprise') return 'unavailable';
  const perChat = ctx.config.perChat?.[ctx.chatKey]?.[cap.id];
  const global = ctx.config.policies?.[cap.id];
  let base: PolicyDecision = perChat ?? global ?? cap.defaultPolicy;
  if (cap.tier === 'destructive' && base === 'auto') base = 'confirm'; // hard safety rail
  return base;
}
