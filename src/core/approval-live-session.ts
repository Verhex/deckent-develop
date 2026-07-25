import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type {
  LiveApprovalAuthentication,
  LiveApprovalAuthenticator,
  LiveApprovalReauthenticationContext,
  LiveApprovalSessionProof,
} from './approval-decision-ingress.js';
import { createJsonFileFirstWriterWins } from './approval-file-cas.js';

export const APPROVAL_LIVE_SESSION_SCHEMA_VERSION = 1 as const;

export interface ApprovalLiveSessionLeaseV1 {
  readonly schemaVersion: typeof APPROVAL_LIVE_SESSION_SCHEMA_VERSION;
  readonly kind: 'approval-live-session';
  readonly sessionRefHash: string;
  readonly actorId: string;
  readonly tenantId: string;
  readonly role: string | null;
  readonly authorityRef: string;
  readonly requestDigest: string;
  readonly action: string;
  readonly channel: string;
  readonly authenticatedAt: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly leaseDigest: string;
}

export interface ApprovalLiveSessionRevocationV1 {
  readonly schemaVersion: typeof APPROVAL_LIVE_SESSION_SCHEMA_VERSION;
  readonly kind: 'approval-live-session-revocation';
  readonly sessionRefHash: string;
  readonly leaseDigest: string;
  readonly revokedAt: string;
  readonly reasonCode: string;
}

export interface IssueApprovalLiveSessionInput {
  readonly actorId: string;
  readonly tenantId: string;
  readonly role: string | null;
  readonly authorityRef: string;
  readonly requestDigest: string;
  readonly action: string;
  readonly channel: string;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
}

export type ApprovalLiveSessionErrorCode =
  | 'APPROVAL_SESSION_SCOPE_UNRESOLVED'
  | 'APPROVAL_SESSION_PROJECT_SCOPE_FORBIDDEN'
  | 'APPROVAL_SESSION_STORAGE_UNSAFE'
  | 'APPROVAL_SESSION_ACL_ENFORCEMENT_FAILED'
  | 'APPROVAL_SESSION_INVALID'
  | 'APPROVAL_SESSION_CONFLICT'
  | 'APPROVAL_SESSION_CORRUPT';

export class ApprovalLiveSessionError extends Error {
  constructor(
    readonly code: ApprovalLiveSessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApprovalLiveSessionError';
  }
}

export interface ApprovalLiveSessionStoreOptions {
  readonly projectRoot: string;
  readonly stateDir: string;
  readonly now?: () => Date;
  readonly randomBytesFactory?: (size: number) => Buffer;
}

const SHA256_HEX = /^[a-f0-9]{64}$/u;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function assertIdentity(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 512
    || value !== value.trim()
    || /[\r\n\0]/u.test(value)) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_INVALID',
      `${field} must be a non-empty bounded identity`,
    );
  }
}

function assertTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string'
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_INVALID',
      `${field} must be a canonical ISO timestamp`,
    );
  }
}

function assertPrivateDirectory(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_STORAGE_UNSAFE',
      'Approval live-session directory is unsafe',
    );
  }
  if ((stat.mode & 0o077) !== 0
    || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_ACL_ENFORCEMENT_FAILED',
      'Approval live-session directory is not private to the host principal',
    );
  }
}

function assertPrivateFile(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_STORAGE_UNSAFE',
      'Approval live-session file is unsafe',
    );
  }
  if ((stat.mode & 0o077) !== 0
    || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_ACL_ENFORCEMENT_FAILED',
      'Approval live-session file is not private to the host principal',
    );
  }
}

function parseLease(path: string): ApprovalLiveSessionLeaseV1 | null {
  if (!existsSync(path)) return null;
  assertPrivateFile(path);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_CORRUPT',
      'Approval live-session lease is not valid JSON',
    );
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_CORRUPT',
      'Approval live-session lease is malformed',
    );
  }
  const lease = value as Partial<ApprovalLiveSessionLeaseV1>;
  if (lease.schemaVersion !== APPROVAL_LIVE_SESSION_SCHEMA_VERSION
    || lease.kind !== 'approval-live-session'
    || !SHA256_HEX.test(lease.sessionRefHash ?? '')
    || !SHA256_HEX.test(lease.requestDigest ?? '')
    || !SHA256_HEX.test(lease.leaseDigest ?? '')
    || typeof lease.role !== 'string' && lease.role !== null) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_CORRUPT',
      'Approval live-session lease shape is invalid',
    );
  }
  for (const [field, item] of [
    ['actorId', lease.actorId],
    ['tenantId', lease.tenantId],
    ['authorityRef', lease.authorityRef],
    ['action', lease.action],
    ['channel', lease.channel],
  ] as const) {
    assertIdentity(item, field);
  }
  assertTimestamp(lease.authenticatedAt, 'authenticatedAt');
  assertTimestamp(lease.issuedAt, 'issuedAt');
  assertTimestamp(lease.expiresAt, 'expiresAt');
  const { leaseDigest, ...unsigned } = lease as ApprovalLiveSessionLeaseV1;
  if (sha256(canonicalJson(unsigned)) !== leaseDigest) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_CORRUPT',
      'Approval live-session lease digest is invalid',
    );
  }
  return lease as ApprovalLiveSessionLeaseV1;
}

function parseRevocation(path: string): ApprovalLiveSessionRevocationV1 | null {
  if (!existsSync(path)) return null;
  assertPrivateFile(path);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_CORRUPT',
      'Approval live-session revocation is not valid JSON',
    );
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_CORRUPT',
      'Approval live-session revocation is malformed',
    );
  }
  const item = value as Partial<ApprovalLiveSessionRevocationV1>;
  if (item.schemaVersion !== APPROVAL_LIVE_SESSION_SCHEMA_VERSION
    || item.kind !== 'approval-live-session-revocation'
    || !SHA256_HEX.test(item.sessionRefHash ?? '')
    || !SHA256_HEX.test(item.leaseDigest ?? '')) {
    throw new ApprovalLiveSessionError(
      'APPROVAL_SESSION_CORRUPT',
      'Approval live-session revocation shape is invalid',
    );
  }
  assertTimestamp(item.revokedAt, 'revokedAt');
  assertIdentity(item.reasonCode, 'reasonCode');
  return item as ApprovalLiveSessionRevocationV1;
}

export class ApprovalLiveSessionStore {
  readonly rootDir: string;
  private readonly leasesDir: string;
  private readonly revocationsDir: string;
  private readonly now: () => Date;
  private readonly randomBytesFactory: (size: number) => Buffer;

  constructor(options: ApprovalLiveSessionStoreOptions) {
    if (!options.stateDir || !isAbsolute(options.stateDir)) {
      throw new ApprovalLiveSessionError(
        'APPROVAL_SESSION_SCOPE_UNRESOLVED',
        'Approval live-session stateDir must be an absolute host-global path',
      );
    }
    const projectId = sha256(realpathSync(options.projectRoot));
    this.rootDir = resolve(
      options.stateDir,
      'runtime',
      'approval-live-sessions',
      'v1',
      projectId,
    );
    const project = realpathSync(options.projectRoot);
    const rel = relative(project, this.rootDir);
    if (isWithin(project, this.rootDir) || (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)))) {
      throw new ApprovalLiveSessionError(
        'APPROVAL_SESSION_PROJECT_SCOPE_FORBIDDEN',
        'Approval live-session state cannot live inside a project or worker scope',
      );
    }
    this.leasesDir = join(this.rootDir, 'leases');
    this.revocationsDir = join(this.rootDir, 'revocations');
    for (const directory of [this.rootDir, this.leasesDir, this.revocationsDir]) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      chmodSync(directory, 0o700);
      assertPrivateDirectory(directory);
    }
    this.now = options.now ?? (() => new Date());
    this.randomBytesFactory = options.randomBytesFactory ?? randomBytes;
  }

  issue(input: IssueApprovalLiveSessionInput): LiveApprovalAuthentication {
    for (const [field, value] of [
      ['actorId', input.actorId],
      ['tenantId', input.tenantId],
      ['authorityRef', input.authorityRef],
      ['action', input.action],
      ['channel', input.channel],
    ] as const) {
      assertIdentity(value, field);
    }
    if (input.role !== null) assertIdentity(input.role, 'role');
    if (!SHA256_HEX.test(input.requestDigest)) {
      throw new ApprovalLiveSessionError(
        'APPROVAL_SESSION_INVALID',
        'requestDigest must be a lowercase SHA-256 digest',
      );
    }
    assertTimestamp(input.authenticatedAt, 'authenticatedAt');
    assertTimestamp(input.expiresAt, 'expiresAt');
    const issuedAt = this.now().toISOString();
    if (Date.parse(input.authenticatedAt) > Date.parse(issuedAt)
      || Date.parse(input.expiresAt) <= Date.parse(issuedAt)) {
      throw new ApprovalLiveSessionError(
        'APPROVAL_SESSION_INVALID',
        'Approval live-session timestamps are outside the active interval',
      );
    }
    const sessionRef = this.randomBytesFactory(32).toString('hex');
    const sessionRefHash = sha256(sessionRef);
    const unsigned = {
      schemaVersion: APPROVAL_LIVE_SESSION_SCHEMA_VERSION,
      kind: 'approval-live-session' as const,
      sessionRefHash,
      actorId: input.actorId,
      tenantId: input.tenantId,
      role: input.role,
      authorityRef: input.authorityRef,
      requestDigest: input.requestDigest,
      action: input.action,
      channel: input.channel,
      authenticatedAt: input.authenticatedAt,
      issuedAt,
      expiresAt: input.expiresAt,
    };
    const lease: ApprovalLiveSessionLeaseV1 = Object.freeze({
      ...unsigned,
      leaseDigest: sha256(canonicalJson(unsigned)),
    });
    const path = join(this.leasesDir, `${sessionRefHash}.json`);
    if (!createJsonFileFirstWriterWins(path, lease)) {
      throw new ApprovalLiveSessionError(
        'APPROVAL_SESSION_CONFLICT',
        'Approval live-session reference already exists',
      );
    }
    return {
      actorId: lease.actorId,
      tenantId: lease.tenantId,
      role: lease.role ?? undefined,
      sessionRef,
      authorityRef: lease.authorityRef,
      authenticatedAt: lease.authenticatedAt,
      expiresAt: lease.expiresAt,
    };
  }

  isActive(
    proof: LiveApprovalSessionProof,
    context: LiveApprovalReauthenticationContext,
    now: Date = this.now(),
  ): boolean {
    if (!SHA256_HEX.test(proof.sessionRefHash)) return false;
    try {
      const lease = parseLease(join(this.leasesDir, `${proof.sessionRefHash}.json`));
      if (!lease) return false;
      const revocation = parseRevocation(join(this.revocationsDir, `${proof.sessionRefHash}.json`));
      if (revocation) return false;
      return lease.sessionRefHash === proof.sessionRefHash
        && lease.actorId === proof.actorId
        && lease.tenantId === proof.tenantId
        && lease.role === proof.role
        && lease.authorityRef === proof.authorityRef
        && lease.authenticatedAt === proof.authenticatedAt
        && lease.expiresAt === proof.expiresAt
        && lease.requestDigest === context.requestDigest
        && lease.action === context.action
        && lease.channel === context.channel
        && now.getTime() >= Date.parse(lease.authenticatedAt)
        && now.getTime() < Date.parse(lease.expiresAt);
    } catch {
      return false;
    }
  }

  revoke(
    sessionRefHash: string,
    reasonCode: string,
  ): ApprovalLiveSessionRevocationV1 {
    if (!SHA256_HEX.test(sessionRefHash)) {
      throw new ApprovalLiveSessionError(
        'APPROVAL_SESSION_INVALID',
        'sessionRefHash must be a lowercase SHA-256 digest',
      );
    }
    assertIdentity(reasonCode, 'reasonCode');
    const lease = parseLease(join(this.leasesDir, `${sessionRefHash}.json`));
    if (!lease) {
      throw new ApprovalLiveSessionError(
        'APPROVAL_SESSION_INVALID',
        'Approval live-session lease does not exist',
      );
    }
    const revocation: ApprovalLiveSessionRevocationV1 = Object.freeze({
      schemaVersion: APPROVAL_LIVE_SESSION_SCHEMA_VERSION,
      kind: 'approval-live-session-revocation',
      sessionRefHash,
      leaseDigest: lease.leaseDigest,
      revokedAt: this.now().toISOString(),
      reasonCode,
    });
    const path = join(this.revocationsDir, `${sessionRefHash}.json`);
    if (!createJsonFileFirstWriterWins(path, revocation)) {
      const existing = parseRevocation(path);
      if (!existing
        || existing.sessionRefHash !== revocation.sessionRefHash
        || existing.leaseDigest !== revocation.leaseDigest) {
        throw new ApprovalLiveSessionError(
          'APPROVAL_SESSION_CONFLICT',
          'Approval live-session revocation conflicts with durable authority',
        );
      }
      return existing;
    }
    return revocation;
  }
}

/**
 * Restart-safe session validator used by ApprovalDecisionAuthority. It cannot
 * reauthenticate by itself, so an accidental use as decision ingress fails shut.
 */
export class ApprovalLiveSessionAuthority implements LiveApprovalAuthenticator {
  constructor(private readonly store: ApprovalLiveSessionStore) {}

  async reauthenticate(
    _context: LiveApprovalReauthenticationContext,
  ): Promise<LiveApprovalAuthentication | null> {
    return null;
  }

  isSessionActive(
    proof: LiveApprovalSessionProof,
    context: LiveApprovalReauthenticationContext,
    now: Date,
  ): boolean {
    return this.store.isActive(proof, context, now);
  }
}
