import { createHash } from 'node:crypto';

import {
  APPROVAL_LIFECYCLE_BLOCKING_SCOPES,
  APPROVAL_LIFECYCLE_ORIGINS,
  APPROVAL_RISK_TIERS,
  APPROVAL_TIMEOUT_DISPOSITIONS,
  type ApprovalLifecycleBlockingScope,
  type ApprovalLifecycleConfig,
  type ApprovalLifecycleOrigin,
  type ApprovalRiskTier,
  type ApprovalTimeoutDisposition,
  type ResolvedApprovalLifecycleConfig,
  type ResolvedApprovalLifecycleProfile,
} from './config-types.js';

export const APPROVAL_LIFECYCLE_POLICY_VERSION = 1 as const;

type LegacyApprovalRisk = 'none' | 'low' | 'medium' | 'high' | 'critical';
type LegacyApprovalAction = 'allow' | 'deny' | 'defer' | 'escalate';

export type ApprovalLifecycleClock = () => Date;
export const SYSTEM_APPROVAL_LIFECYCLE_CLOCK: ApprovalLifecycleClock = () => new Date();

const RISK_RANK: Record<ApprovalRiskTier, number> = {
  routine: 0,
  elevated: 1,
  critical: 2,
};
const TIMEOUT_RANK: Record<ApprovalTimeoutDisposition, number> = {
  'request-default': 0,
  'park-alert': 1,
  'park-undecidable': 2,
  'deny-expire': 3,
};
const BLOCKING_RANK: Record<ApprovalLifecycleBlockingScope, number> = {
  request: 0,
  trigger: 1,
  run: 2,
  security: 3,
};

const DEFAULT_PROFILES: ResolvedApprovalLifecycleConfig['profiles'] = {
  confirmation: {
    ttlMs: 28_800_000,
    slaMs: [300_000, 1_800_000, 7_200_000],
    riskTier: 'elevated',
    timeoutDisposition: 'park-undecidable',
    blocking: 'run',
  },
  'autonomous-trigger': {
    ttlMs: 3_600_000,
    slaMs: [120_000, 600_000, 1_800_000],
    riskTier: 'elevated',
    timeoutDisposition: 'park-alert',
    blocking: 'trigger',
  },
  'gateway-pairing': {
    ttlMs: 600_000,
    slaMs: [60_000, 180_000, 420_000],
    riskTier: 'critical',
    timeoutDisposition: 'deny-expire',
    blocking: 'security',
  },
  'broker-native': {
    ttlMs: 1_800_000,
    slaMs: [120_000, 600_000, 1_200_000],
    riskTier: 'routine',
    timeoutDisposition: 'request-default',
    blocking: 'request',
  },
};

function cloneProfiles(
  profiles: ResolvedApprovalLifecycleConfig['profiles'],
): ResolvedApprovalLifecycleConfig['profiles'] {
  return Object.fromEntries(APPROVAL_LIFECYCLE_ORIGINS.map((origin) => {
    const profile = profiles[origin];
    return [origin, { ...profile, slaMs: [...profile.slaMs] as [number, number, number] }];
  })) as ResolvedApprovalLifecycleConfig['profiles'];
}

export const DEFAULT_APPROVAL_LIFECYCLE_POLICY: Readonly<ResolvedApprovalLifecycleConfig> =
  (() => {
    const profiles = cloneProfiles(DEFAULT_PROFILES);
    for (const origin of APPROVAL_LIFECYCLE_ORIGINS) {
      Object.freeze(profiles[origin].slaMs);
      Object.freeze(profiles[origin]);
    }
    Object.freeze(profiles);
    return Object.freeze({ enabled: false, profiles });
  })();

export class ApprovalLifecyclePolicyError extends Error {
  readonly code = 'APPROVAL_LIFECYCLE_POLICY_INVALID' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ApprovalLifecyclePolicyError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ApprovalLifecyclePolicyError(`${path} contains unsupported field(s): ${unknown.join(', ')}`);
  }
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ApprovalLifecyclePolicyError(`${path} must be a positive safe integer`);
  }
  return value as number;
}

function parseProfileOverride(
  origin: ApprovalLifecycleOrigin,
  value: unknown,
  base: ResolvedApprovalLifecycleProfile,
): ResolvedApprovalLifecycleProfile {
  const path = `approval.lifecycle.profiles.${origin}`;
  if (!isPlainObject(value)) {
    throw new ApprovalLifecyclePolicyError(`${path} must be an object`);
  }
  rejectUnknownKeys(value, ['ttlMs', 'slaMs', 'riskTier', 'timeoutDisposition', 'blocking'], path);

  const ttlMs = value['ttlMs'] === undefined
    ? base.ttlMs
    : requirePositiveInteger(value['ttlMs'], `${path}.ttlMs`);
  if (ttlMs > base.ttlMs) {
    throw new ApprovalLifecyclePolicyError(`${path}.ttlMs may only shorten the parent ceiling`);
  }

  let slaMs = [...base.slaMs] as [number, number, number];
  if (value['slaMs'] !== undefined) {
    if (!Array.isArray(value['slaMs']) || value['slaMs'].length !== 3) {
      throw new ApprovalLifecyclePolicyError(`${path}.slaMs must contain exactly three due offsets`);
    }
    slaMs = value['slaMs'].map((entry, index) =>
      requirePositiveInteger(entry, `${path}.slaMs.${index}`)) as [number, number, number];
    if (!(slaMs[0] < slaMs[1] && slaMs[1] < slaMs[2])) {
      throw new ApprovalLifecyclePolicyError(`${path}.slaMs must be strictly increasing`);
    }
    if (slaMs.some((entry, index) => entry > base.slaMs[index]!)) {
      throw new ApprovalLifecyclePolicyError(`${path}.slaMs may only advance parent stages`);
    }
  }
  if (slaMs[2] >= ttlMs) {
    throw new ApprovalLifecyclePolicyError(`${path}.slaMs entries must be earlier than ttlMs`);
  }

  const riskTier = value['riskTier'] === undefined ? base.riskTier : value['riskTier'];
  if (!APPROVAL_RISK_TIERS.includes(riskTier as ApprovalRiskTier)) {
    throw new ApprovalLifecyclePolicyError(`${path}.riskTier is invalid`);
  }
  if (RISK_RANK[riskTier as ApprovalRiskTier] < RISK_RANK[base.riskTier]) {
    throw new ApprovalLifecyclePolicyError(`${path}.riskTier may not lower the parent floor`);
  }

  const timeoutDisposition = value['timeoutDisposition'] === undefined
    ? base.timeoutDisposition
    : value['timeoutDisposition'];
  if (!APPROVAL_TIMEOUT_DISPOSITIONS.includes(timeoutDisposition as ApprovalTimeoutDisposition)) {
    throw new ApprovalLifecyclePolicyError(`${path}.timeoutDisposition is invalid`);
  }
  if (TIMEOUT_RANK[timeoutDisposition as ApprovalTimeoutDisposition] < TIMEOUT_RANK[base.timeoutDisposition]) {
    throw new ApprovalLifecyclePolicyError(`${path}.timeoutDisposition may not weaken the parent disposition`);
  }

  const blocking = value['blocking'] === undefined ? base.blocking : value['blocking'];
  if (!APPROVAL_LIFECYCLE_BLOCKING_SCOPES.includes(blocking as ApprovalLifecycleBlockingScope)) {
    throw new ApprovalLifecyclePolicyError(`${path}.blocking is invalid`);
  }
  if (BLOCKING_RANK[blocking as ApprovalLifecycleBlockingScope] < BLOCKING_RANK[base.blocking]) {
    throw new ApprovalLifecyclePolicyError(`${path}.blocking may not weaken the parent boundary`);
  }

  return {
    ttlMs,
    slaMs,
    riskTier: riskTier as ApprovalRiskTier,
    timeoutDisposition: timeoutDisposition as ApprovalTimeoutDisposition,
    blocking: blocking as ApprovalLifecycleBlockingScope,
  };
}

/** Resolve one config layer relative to its parent; weakening is rejected, never clamped. */
export function resolveApprovalLifecyclePolicy(
  config?: ApprovalLifecycleConfig | null,
  parent: ResolvedApprovalLifecycleConfig = DEFAULT_APPROVAL_LIFECYCLE_POLICY as ResolvedApprovalLifecycleConfig,
): ResolvedApprovalLifecycleConfig {
  if (config !== undefined && config !== null && !isPlainObject(config)) {
    throw new ApprovalLifecyclePolicyError('approval.lifecycle must be an object');
  }
  const raw = (config ?? {}) as Record<string, unknown>;
  rejectUnknownKeys(raw, ['enabled', 'profiles'], 'approval.lifecycle');
  if (raw['enabled'] !== undefined && typeof raw['enabled'] !== 'boolean') {
    throw new ApprovalLifecyclePolicyError('approval.lifecycle.enabled must be a boolean');
  }
  if (raw['profiles'] !== undefined && !isPlainObject(raw['profiles'])) {
    throw new ApprovalLifecyclePolicyError('approval.lifecycle.profiles must be an object');
  }

  const rawProfiles = (raw['profiles'] ?? {}) as Record<string, unknown>;
  rejectUnknownKeys(rawProfiles, APPROVAL_LIFECYCLE_ORIGINS, 'approval.lifecycle.profiles');
  const profiles = cloneProfiles(parent.profiles);
  for (const origin of APPROVAL_LIFECYCLE_ORIGINS) {
    if (rawProfiles[origin] !== undefined) {
      profiles[origin] = parseProfileOverride(origin, rawProfiles[origin], parent.profiles[origin]);
    }
  }
  return {
    enabled: (raw['enabled'] as boolean | undefined) ?? parent.enabled,
    profiles,
  };
}

/** Tighten one embedded in-flight origin profile; store/broker consumers share this rank authority. */
export function tightenApprovalLifecycleProfile(
  origin: ApprovalLifecycleOrigin,
  authored: ResolvedApprovalLifecycleProfile,
  candidate: ResolvedApprovalLifecycleProfile,
): ResolvedApprovalLifecycleProfile {
  return parseProfileOverride(origin, candidate, authored);
}

export interface ApprovalLifecycleProfileTransition {
  readonly profile: ResolvedApprovalLifecycleProfile;
  readonly transitionChanged: boolean;
  readonly weakeningIgnored: boolean;
}

function stricterValue<T extends string>(
  authored: T,
  candidate: T,
  ranks: Record<T, number>,
): T {
  return ranks[candidate] > ranks[authored] ? candidate : authored;
}

/**
 * Apply a live config transition field-by-field. Weakening is ignored while
 * independent tightening in the same revision is retained for the durable record.
 */
export function applyApprovalLifecycleProfileTransition(
  authored: ResolvedApprovalLifecycleProfile,
  candidate: ResolvedApprovalLifecycleProfile,
): ApprovalLifecycleProfileTransition {
  const profile: ResolvedApprovalLifecycleProfile = {
    ttlMs: Math.min(authored.ttlMs, candidate.ttlMs),
    slaMs: [
      Math.min(authored.slaMs[0], candidate.slaMs[0]),
      Math.min(authored.slaMs[1], candidate.slaMs[1]),
      Math.min(authored.slaMs[2], candidate.slaMs[2]),
    ],
    riskTier: stricterValue(authored.riskTier, candidate.riskTier, RISK_RANK),
    timeoutDisposition: stricterValue(
      authored.timeoutDisposition,
      candidate.timeoutDisposition,
      TIMEOUT_RANK,
    ),
    blocking: stricterValue(authored.blocking, candidate.blocking, BLOCKING_RANK),
  };
  const transitionChanged = profile.ttlMs !== authored.ttlMs
    || profile.slaMs.some((value, index) => value !== authored.slaMs[index])
    || profile.riskTier !== authored.riskTier
    || profile.timeoutDisposition !== authored.timeoutDisposition
    || profile.blocking !== authored.blocking;
  const weakeningIgnored = candidate.ttlMs > authored.ttlMs
    || candidate.slaMs.some((value, index) => value > authored.slaMs[index]!)
    || RISK_RANK[candidate.riskTier] < RISK_RANK[authored.riskTier]
    || TIMEOUT_RANK[candidate.timeoutDisposition] < TIMEOUT_RANK[authored.timeoutDisposition]
    || BLOCKING_RANK[candidate.blocking] < BLOCKING_RANK[authored.blocking];
  return { profile, transitionChanged, weakeningIgnored };
}

/** Apply a current snapshot to an authored in-flight snapshot, accepting tightening only. */
export function tightenApprovalLifecyclePolicy(
  authored: ResolvedApprovalLifecycleConfig,
  candidate: ResolvedApprovalLifecycleConfig,
): ResolvedApprovalLifecycleConfig {
  const profiles = cloneProfiles(authored.profiles);
  for (const origin of APPROVAL_LIFECYCLE_ORIGINS) {
    profiles[origin] = tightenApprovalLifecycleProfile(
      origin,
      authored.profiles[origin],
      candidate.profiles[origin],
    );
  }
  return { enabled: authored.enabled, profiles };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

export function approvalLifecyclePolicyDigest(policy: ResolvedApprovalLifecycleConfig): string {
  const payload = canonicalize({ schemaVersion: APPROVAL_LIFECYCLE_POLICY_VERSION, ...policy });
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Digest one embedded origin profile; durable v2 records use this as their snapshot identity. */
export function approvalLifecycleProfileDigest(
  origin: ApprovalLifecycleOrigin,
  profile: ResolvedApprovalLifecycleProfile,
): string {
  const payload = canonicalize({
    schemaVersion: APPROVAL_LIFECYCLE_POLICY_VERSION,
    origin,
    profile,
  });
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function parseUtc(value: string, path: string): number {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new ApprovalLifecyclePolicyError(`${path} must be an ISO UTC timestamp`);
  return epoch;
}

export interface EffectiveApprovalExpiry {
  readonly now: string;
  readonly expiresAt: string;
  readonly expired: boolean;
  readonly producerExpiryCapped: boolean;
}

/** Resolve the immutable source clock; producer expiry may shorten, never extend, the ceiling. */
export function resolveEffectiveApprovalExpiry(input: {
  createdAt: string;
  producerExpiresAt?: string | null;
  profile: ResolvedApprovalLifecycleProfile;
  clock?: ApprovalLifecycleClock;
}): EffectiveApprovalExpiry {
  const createdAtMs = parseUtc(input.createdAt, 'createdAt');
  const ceilingMs = createdAtMs + input.profile.ttlMs;
  const producerMs = input.producerExpiresAt == null
    ? ceilingMs
    : parseUtc(input.producerExpiresAt, 'producerExpiresAt');
  if (producerMs <= createdAtMs) {
    throw new ApprovalLifecyclePolicyError('producerExpiresAt must be after createdAt');
  }
  const effectiveMs = Math.min(producerMs, ceilingMs);
  const now = (input.clock ?? SYSTEM_APPROVAL_LIFECYCLE_CLOCK)();
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new ApprovalLifecyclePolicyError('approval lifecycle clock returned an invalid Date');
  return {
    now: now.toISOString(),
    expiresAt: new Date(effectiveMs).toISOString(),
    expired: nowMs >= effectiveMs,
    producerExpiryCapped: producerMs > ceilingMs,
  };
}

export function mapLegacyApprovalRisk(risk: LegacyApprovalRisk): ApprovalRiskTier {
  if (risk === 'none' || risk === 'low') return 'routine';
  if (risk === 'medium' || risk === 'high') return 'elevated';
  if (risk === 'critical') return 'critical';
  throw new ApprovalLifecyclePolicyError(`unknown legacy approval risk: ${String(risk)}`);
}

export function isApprovalRiskTierAtLeast(
  candidate: ApprovalRiskTier,
  floor: ApprovalRiskTier,
): boolean {
  return RISK_RANK[candidate] >= RISK_RANK[floor];
}

export function maxApprovalRiskTier(
  first: ApprovalRiskTier,
  ...tiers: ApprovalRiskTier[]
): ApprovalRiskTier {
  return tiers.reduce((highest, tier) =>
    isApprovalRiskTierAtLeast(tier, highest) ? tier : highest, first);
}

export function resolveEffectiveApprovalRiskTier(input: {
  origin: ApprovalLifecycleOrigin;
  producerRisk: LegacyApprovalRisk;
  policy?: ResolvedApprovalLifecycleConfig;
  securitySensitive?: boolean;
  destructive?: boolean;
  riskTagged?: boolean;
}): ApprovalRiskTier {
  const policy = input.policy ?? (DEFAULT_APPROVAL_LIFECYCLE_POLICY as ResolvedApprovalLifecycleConfig);
  const floor = policy.profiles[input.origin].riskTier;
  let risk = maxApprovalRiskTier(floor, mapLegacyApprovalRisk(input.producerRisk));
  if (input.origin === 'gateway-pairing'
    || (input.origin === 'confirmation' && input.securitySensitive === true)
    || (input.origin === 'autonomous-trigger' && (input.destructive === true || input.riskTagged === true))) {
    risk = 'critical';
  }
  return risk;
}

/** Central allowlist. Empty until a separately reviewed safe request kind is admitted. */
export const BROKER_PROCEED_WARN_REQUEST_KIND_ALLOWLIST: readonly string[] = Object.freeze([]);

export interface ResolvedApprovalTimeout {
  readonly action: 'park' | 'deny' | 'proceed-warn';
  readonly terminalState: 'UNDECIDABLE' | 'EXPIRED';
  readonly alert: boolean;
  readonly replayAllowed: false;
  readonly accessGrantAllowed: false;
  readonly blocking: ApprovalLifecycleBlockingScope;
  readonly reason: 'profile-timeout' | 'critical-fail-closed' | 'request-default-not-allowlisted' | 'request-default';
}

/** Shared origin/profile disposition resolver; callers cannot override its safety allowlist. */
export function resolveApprovalTimeout(input: {
  origin: ApprovalLifecycleOrigin;
  profile: ResolvedApprovalLifecycleProfile;
  riskTier: ApprovalRiskTier;
  requestDefaultAction?: LegacyApprovalAction;
  requestKind?: string;
}): ResolvedApprovalTimeout {
  const originFloor = DEFAULT_PROFILES[input.origin];
  if (TIMEOUT_RANK[input.profile.timeoutDisposition] < TIMEOUT_RANK[originFloor.timeoutDisposition]
    || BLOCKING_RANK[input.profile.blocking] < BLOCKING_RANK[originFloor.blocking]) {
    throw new ApprovalLifecyclePolicyError(
      `timeout profile weakens the ${input.origin} origin safety floor`,
    );
  }
  const common = {
    replayAllowed: false as const,
    accessGrantAllowed: false as const,
    blocking: input.profile.blocking,
  };
  switch (input.profile.timeoutDisposition) {
    case 'park-undecidable':
      return { ...common, action: 'park', terminalState: 'UNDECIDABLE', alert: true, reason: 'profile-timeout' };
    case 'park-alert':
      return { ...common, action: 'park', terminalState: 'EXPIRED', alert: true, reason: 'profile-timeout' };
    case 'deny-expire':
      return { ...common, action: 'deny', terminalState: 'EXPIRED', alert: false, reason: 'profile-timeout' };
    case 'request-default': {
      if (input.riskTier === 'critical') {
        return { ...common, action: 'deny', terminalState: 'EXPIRED', alert: true, reason: 'critical-fail-closed' };
      }
      if (input.requestDefaultAction === 'allow') {
        const allowlisted = input.riskTier === 'routine'
          && input.requestKind !== undefined
          && BROKER_PROCEED_WARN_REQUEST_KIND_ALLOWLIST.includes(input.requestKind);
        return allowlisted
          ? { ...common, action: 'proceed-warn', terminalState: 'EXPIRED', alert: true, reason: 'request-default' }
          : { ...common, action: 'deny', terminalState: 'EXPIRED', alert: true, reason: 'request-default-not-allowlisted' };
      }
      if (input.requestDefaultAction === 'deny') {
        return { ...common, action: 'deny', terminalState: 'EXPIRED', alert: false, reason: 'request-default' };
      }
      return { ...common, action: 'park', terminalState: 'EXPIRED', alert: true, reason: 'request-default' };
    }
  }
}
