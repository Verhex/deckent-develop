import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { ApprovalDecisionIntegrityAuthority } from './approval-decision-ingress.js';
import type {
  GlobalScopePlatform,
} from './global-scope-resolver.js';

export const APPROVAL_AUTHORITY_KEYRING_SCHEMA_VERSION = 1 as const;

export type ApprovalAuthorityKeyStatus = 'active' | 'retired';

interface SerializedApprovalAuthorityKey {
  readonly keyId: string;
  readonly status: ApprovalAuthorityKeyStatus;
  readonly createdAt: string;
  readonly retiredAt: string | null;
  readonly keyMaterialHex: string;
}

interface SerializedApprovalAuthorityRevisionUnsigned {
  readonly schemaVersion: typeof APPROVAL_AUTHORITY_KEYRING_SCHEMA_VERSION;
  readonly kind: 'approval-decision-keyring';
  readonly keyringId: string;
  readonly revision: number;
  readonly previousRevisionHash: string | null;
  readonly createdAt: string;
  readonly activeKeyId: string;
  readonly keys: readonly SerializedApprovalAuthorityKey[];
}

interface SerializedApprovalAuthorityRevision extends SerializedApprovalAuthorityRevisionUnsigned {
  readonly revisionHash: string;
}

export interface ApprovalAuthorityKeyringSnapshot {
  readonly schemaVersion: typeof APPROVAL_AUTHORITY_KEYRING_SCHEMA_VERSION;
  readonly kind: 'approval-decision-keyring';
  readonly keyringId: string;
  readonly revision: number;
  readonly revisionHash: string;
  readonly activeKeyId: string;
  readonly custodyAdapterId: string;
  readonly keys: readonly Readonly<{
    keyId: string;
    status: ApprovalAuthorityKeyStatus;
    createdAt: string;
    retiredAt: string | null;
  }>[];
}

export type ApprovalAuthorityKeyringErrorCode =
  | 'APPROVAL_KEYRING_SCOPE_UNRESOLVED'
  | 'APPROVAL_KEYRING_PROJECT_SCOPE_FORBIDDEN'
  | 'APPROVAL_KEYRING_NOT_PROVISIONED'
  | 'APPROVAL_KEYRING_STORAGE_UNSAFE'
  | 'APPROVAL_KEYRING_ACL_UNSUPPORTED'
  | 'APPROVAL_KEYRING_ACL_ENFORCEMENT_FAILED'
  | 'APPROVAL_KEYRING_MALFORMED'
  | 'APPROVAL_KEYRING_UNSUPPORTED_VERSION'
  | 'APPROVAL_KEYRING_INTEGRITY_FAILURE'
  | 'APPROVAL_KEYRING_ACTIVE_KEY_MISSING'
  | 'APPROVAL_KEYRING_UNKNOWN_KEY_ID'
  | 'APPROVAL_KEYRING_IO_FAILURE';

export class ApprovalAuthorityKeyringError extends Error {
  constructor(
    readonly code: ApprovalAuthorityKeyringErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApprovalAuthorityKeyringError';
  }
}

export interface ApprovalAuthorityCustodyOpenOptions {
  readonly dataDir: string;
  readonly projectRoot: string;
  readonly platform: GlobalScopePlatform;
}

export interface ApprovalDecisionCustodyHandle extends ApprovalDecisionIntegrityAuthority {
  readonly snapshot: ApprovalAuthorityKeyringSnapshot;
}

/**
 * Platform boundary for approval-decision integrity custody. Implementations
 * own key access and never expose key material to the runtime composition root.
 */
export interface ApprovalDecisionCustodyAdapter {
  readonly adapterId: string;
  open(options: ApprovalAuthorityCustodyOpenOptions): ApprovalDecisionCustodyHandle;
}

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const KEY_MATERIAL_HEX = /^(?:[a-f0-9]{2}){32,}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const REVISION_FILE = /^revision-([1-9][0-9]*)\.json$/u;
const KEYRING_RELATIVE_DIR = join('keys', 'approval-decision', 'v1', 'revisions');

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

function safeHexEqual(left: string, right: string): boolean {
  if (!SHA256_HEX.test(left) || !SHA256_HEX.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function revisionHash(revision: SerializedApprovalAuthorityRevisionUnsigned): string {
  return sha256(canonicalJson(revision));
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function assertSafeId(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_MALFORMED',
      `${field} is not a canonical opaque identifier`,
    );
  }
}

function assertOwnerOnly(path: string, kind: 'directory' | 'file'): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (kind === 'directory' ? !stat.isDirectory() : !stat.isFile())) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_STORAGE_UNSAFE',
      `Approval authority ${kind} is unsafe`,
    );
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_ACL_ENFORCEMENT_FAILED',
      `Approval authority ${kind} grants group or other permissions`,
    );
  }
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_ACL_ENFORCEMENT_FAILED',
      `Approval authority ${kind} is not owned by the current host principal`,
    );
  }
}

function parseRevision(path: string): SerializedApprovalAuthorityRevision {
  assertOwnerOnly(path, 'file');
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_MALFORMED',
      'Approval authority revision is not valid JSON',
    );
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_MALFORMED',
      'Approval authority revision must be an object',
    );
  }
  const item = value as Partial<SerializedApprovalAuthorityRevision>;
  if (item.schemaVersion !== APPROVAL_AUTHORITY_KEYRING_SCHEMA_VERSION) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_UNSUPPORTED_VERSION',
      'Approval authority keyring schema is unsupported',
    );
  }
  if (item.kind !== 'approval-decision-keyring'
    || !Number.isSafeInteger(item.revision)
    || (item.revision ?? 0) < 1
    || !validTimestamp(item.createdAt)
    || (item.previousRevisionHash !== null && !SHA256_HEX.test(item.previousRevisionHash ?? ''))
    || !Array.isArray(item.keys)
    || !SHA256_HEX.test(item.revisionHash ?? '')) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_MALFORMED',
      'Approval authority revision shape is invalid',
    );
  }
  assertSafeId(item.keyringId, 'keyringId');
  assertSafeId(item.activeKeyId, 'activeKeyId');

  const keyIds = new Set<string>();
  let activeCount = 0;
  for (const key of item.keys) {
    if (key === null || typeof key !== 'object') {
      throw new ApprovalAuthorityKeyringError(
        'APPROVAL_KEYRING_MALFORMED',
        'Approval authority key entry is invalid',
      );
    }
    assertSafeId(key.keyId, 'keyId');
    if (keyIds.has(key.keyId)
      || (key.status !== 'active' && key.status !== 'retired')
      || !validTimestamp(key.createdAt)
      || (key.retiredAt !== null && !validTimestamp(key.retiredAt))
      || !KEY_MATERIAL_HEX.test(key.keyMaterialHex)) {
      throw new ApprovalAuthorityKeyringError(
        'APPROVAL_KEYRING_MALFORMED',
        'Approval authority key entry is invalid',
      );
    }
    if ((key.status === 'active' && key.retiredAt !== null)
      || (key.status === 'retired' && key.retiredAt === null)) {
      throw new ApprovalAuthorityKeyringError(
        'APPROVAL_KEYRING_MALFORMED',
        'Approval authority key lifecycle is invalid',
      );
    }
    if (key.status === 'active') activeCount += 1;
    keyIds.add(key.keyId);
  }
  if (activeCount !== 1
    || !keyIds.has(item.activeKeyId)
    || item.keys.find(key => key.keyId === item.activeKeyId)?.status !== 'active') {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_ACTIVE_KEY_MISSING',
      'Approval authority revision has no unique active signing key',
    );
  }
  const { revisionHash: persistedHash, ...unsigned } = item as SerializedApprovalAuthorityRevision;
  if (!safeHexEqual(persistedHash, revisionHash(unsigned))) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_INTEGRITY_FAILURE',
      'Approval authority revision hash does not match its content',
    );
  }
  return item as SerializedApprovalAuthorityRevision;
}

function loadRevisionChain(options: ApprovalAuthorityCustodyOpenOptions): {
  latest: SerializedApprovalAuthorityRevision;
  revisionsDir: string;
} {
  if (options.platform === 'win32') {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_ACL_UNSUPPORTED',
      'Approval authority requires a verified Windows DPAPI/CNG and DACL custody adapter',
    );
  }
  if (!options.dataDir || !isAbsolute(options.dataDir)) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_SCOPE_UNRESOLVED',
      'Approval authority dataDir must be an absolute platform-global path',
    );
  }
  const revisionsDir = resolve(options.dataDir, KEYRING_RELATIVE_DIR);
  let canonicalProject: string;
  let canonicalData: string;
  let canonicalRevisions: string;
  try {
    canonicalProject = realpathSync(options.projectRoot);
    canonicalData = realpathSync(options.dataDir);
    canonicalRevisions = realpathSync(revisionsDir);
  } catch {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_NOT_PROVISIONED',
      'Approval authority keyring is not provisioned in the host-global data directory',
    );
  }
  if (isWithin(canonicalProject, canonicalData) || isWithin(canonicalProject, canonicalRevisions)) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_PROJECT_SCOPE_FORBIDDEN',
      'Approval authority keyring cannot live inside a project or worker scope',
    );
  }
  for (const directory of [
    resolve(options.dataDir, 'keys'),
    resolve(options.dataDir, 'keys', 'approval-decision'),
    resolve(options.dataDir, 'keys', 'approval-decision', 'v1'),
    revisionsDir,
  ]) {
    assertOwnerOnly(directory, 'directory');
  }

  let files: string[];
  try {
    files = readdirSync(revisionsDir)
      .filter(file => REVISION_FILE.test(file))
      .sort((left, right) => {
        const leftRevision = Number(REVISION_FILE.exec(left)?.[1] ?? 0);
        const rightRevision = Number(REVISION_FILE.exec(right)?.[1] ?? 0);
        return leftRevision - rightRevision;
      });
  } catch {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_IO_FAILURE',
      'Approval authority keyring revisions cannot be listed',
    );
  }
  if (files.length === 0) {
    throw new ApprovalAuthorityKeyringError(
      'APPROVAL_KEYRING_NOT_PROVISIONED',
      'Approval authority keyring has no provisioned revision',
    );
  }
  const revisions = files.map(file => parseRevision(join(revisionsDir, file)));
  for (let index = 0; index < revisions.length; index += 1) {
    const current = revisions[index]!;
    const fileRevision = Number(REVISION_FILE.exec(files[index]!)?.[1] ?? 0);
    const previous = revisions[index - 1];
    if (current.revision !== index + 1
      || current.revision !== fileRevision
      || current.previousRevisionHash !== (previous?.revisionHash ?? null)
      || (previous && current.keyringId !== previous.keyringId)) {
      throw new ApprovalAuthorityKeyringError(
        'APPROVAL_KEYRING_INTEGRITY_FAILURE',
        'Approval authority revision chain is not contiguous or hash-linked',
      );
    }
  }
  return { latest: revisions.at(-1)!, revisionsDir };
}

class ApprovalDecisionFileKeyring implements ApprovalDecisionCustodyHandle {
  readonly snapshot: ApprovalAuthorityKeyringSnapshot;
  private readonly keys: ReadonlyMap<string, Buffer>;
  private readonly activeKeyId: string;

  constructor(
    latest: SerializedApprovalAuthorityRevision,
    custodyAdapterId: string,
  ) {
    this.activeKeyId = latest.activeKeyId;
    this.keys = new Map(
      latest.keys.map(key => [key.keyId, Buffer.from(key.keyMaterialHex, 'hex')]),
    );
    this.snapshot = Object.freeze({
      schemaVersion: APPROVAL_AUTHORITY_KEYRING_SCHEMA_VERSION,
      kind: 'approval-decision-keyring',
      keyringId: latest.keyringId,
      revision: latest.revision,
      revisionHash: latest.revisionHash,
      activeKeyId: latest.activeKeyId,
      custodyAdapterId,
      keys: Object.freeze(latest.keys.map(key => Object.freeze({
        keyId: key.keyId,
        status: key.status,
        createdAt: key.createdAt,
        retiredAt: key.retiredAt,
      }))),
    });
  }

  sign(payload: string): { keyId: string; mac: string } {
    const key = this.keys.get(this.activeKeyId);
    if (!key) {
      throw new ApprovalAuthorityKeyringError(
        'APPROVAL_KEYRING_ACTIVE_KEY_MISSING',
        'Approval authority active signing key is unavailable',
      );
    }
    return {
      keyId: this.activeKeyId,
      mac: createHmac('sha256', key).update(payload).digest('hex'),
    };
  }

  verify(keyId: string, payload: string, mac: string): boolean {
    const key = this.keys.get(keyId);
    if (!key || !SHA256_HEX.test(mac)) return false;
    const expected = createHmac('sha256', key).update(payload).digest('hex');
    return safeHexEqual(expected, mac);
  }
}

/** Open-only POSIX private-file adapter. It never creates or rotates key material. */
export class PosixPrivateFileApprovalDecisionCustodyAdapter implements ApprovalDecisionCustodyAdapter {
  readonly adapterId = 'posix-private-file:approval-decision:v1';

  open(options: ApprovalAuthorityCustodyOpenOptions): ApprovalDecisionCustodyHandle {
    const { latest } = loadRevisionChain(options);
    return new ApprovalDecisionFileKeyring(latest, this.adapterId);
  }
}

/**
 * Default adapter selection is explicit and fail-closed. Native Windows needs
 * a separately implemented and attested DPAPI/CNG+DACL adapter.
 */
export function defaultApprovalDecisionCustodyAdapter(
  platform: GlobalScopePlatform,
): ApprovalDecisionCustodyAdapter {
  if (platform === 'win32') {
    return {
      adapterId: 'windows-unsupported:approval-decision:v1',
      open(): ApprovalDecisionCustodyHandle {
        throw new ApprovalAuthorityKeyringError(
          'APPROVAL_KEYRING_ACL_UNSUPPORTED',
          'Approval authority requires a verified Windows DPAPI/CNG and DACL custody adapter',
        );
      },
    };
  }
  return new PosixPrivateFileApprovalDecisionCustodyAdapter();
}
