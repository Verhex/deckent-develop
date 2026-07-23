import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path';

import { createJsonFileFirstWriterWins } from './approval-file-cas.js';
import {
  resolveGlobalScopePaths,
  type GlobalScopeEnv,
  type GlobalScopePlatform,
} from './global-scope-resolver.js';

export const PROVIDER_AUTHORITY_KEYRING_SCHEMA_VERSION = 1;

export type ProviderAuthorityDomain = 'truth' | 'limit' | 'account-pseudonym';
export type ProviderAuthorityKeyStatus = 'active' | 'retired';

export interface ProviderAuthorityMac {
  readonly keyId: string;
  readonly mac: string;
  readonly authorityRevision: number;
}

/**
 * Narrow host-only signing surface consumed by Truth/Limit stores. Implementors
 * must select the exact row key on verify; trying other keys is forbidden.
 */
export interface ProviderIntegrityAuthority {
  sign(domain: Exclude<ProviderAuthorityDomain, 'account-pseudonym'>, value: string): ProviderAuthorityMac;
  verify(
    domain: Exclude<ProviderAuthorityDomain, 'account-pseudonym'>,
    keyId: string,
    value: string,
    mac: string,
  ): boolean;
}

interface SerializedAuthorityKey {
  readonly keyId: string;
  readonly status: ProviderAuthorityKeyStatus;
  readonly derivation: 'hkdf-v1' | 'legacy-raw-v1';
  readonly domains: readonly Exclude<ProviderAuthorityDomain, 'account-pseudonym'>[];
  readonly createdAt: string;
  readonly retiredAt: string | null;
  readonly keyMaterialHex: string;
}

interface SerializedKeyringRevisionUnsigned {
  readonly schemaVersion: number;
  readonly keyringId: string;
  readonly revision: number;
  readonly previousRevisionHash: string | null;
  readonly createdAt: string;
  readonly pseudonymRootHex: string;
  readonly activeAuthorityKeyId: string;
  readonly authorityKeys: readonly SerializedAuthorityKey[];
}

interface SerializedKeyringRevision extends SerializedKeyringRevisionUnsigned {
  readonly revisionHash: string;
}

export interface ProviderAuthorityKeyringSnapshot {
  readonly schemaVersion: 1;
  readonly keyringId: string;
  readonly revision: number;
  readonly revisionHash: string;
  readonly activeAuthorityKeyId: string;
  readonly authorityKeys: readonly Readonly<{
    keyId: string;
    status: ProviderAuthorityKeyStatus;
    derivation: 'hkdf-v1' | 'legacy-raw-v1';
    domains: readonly Exclude<ProviderAuthorityDomain, 'account-pseudonym'>[];
    createdAt: string;
    retiredAt: string | null;
  }>[];
}

export type ProviderAuthorityKeyringErrorCode =
  | 'KEYRING_SCOPE_UNRESOLVED'
  | 'KEYRING_PROJECT_SCOPE_FORBIDDEN'
  | 'KEYRING_STORAGE_UNSAFE'
  | 'KEYRING_ACL_UNSUPPORTED'
  | 'KEYRING_ACL_ENFORCEMENT_FAILED'
  | 'KEYRING_ATOMIC_PUBLICATION_UNSUPPORTED'
  | 'KEYRING_MALFORMED'
  | 'KEYRING_UNSUPPORTED_VERSION'
  | 'KEYRING_INTEGRITY_FAILURE'
  | 'KEYRING_ACTIVE_KEY_MISSING'
  | 'KEYRING_UNKNOWN_KEY_ID'
  | 'KEYRING_CONCURRENT_UPDATE'
  | 'KEYRING_IO_FAILURE';

export class ProviderAuthorityKeyringError extends Error {
  constructor(readonly code: ProviderAuthorityKeyringErrorCode, message: string) {
    super(message);
    this.name = 'ProviderAuthorityKeyringError';
  }
}

export interface ProviderAuthorityKeyringOpenOptions {
  readonly dataDir: string;
  readonly platform?: NodeJS.Platform;
  /** Optional defence-in-depth boundary. The keyring must never resolve below it. */
  readonly projectRoot?: string;
}

export interface ProviderAuthorityKeyringCreateOptions extends ProviderAuthorityKeyringOpenOptions {
  readonly now?: () => Date;
  readonly keyringIdFactory?: () => string;
  readonly keyIdFactory?: () => string;
  readonly randomBytesFactory?: (size: number) => Buffer;
}

export interface ProviderAuthorityKeyringRotateOptions {
  readonly expectedRevisionHash: string;
  readonly now?: () => Date;
  readonly keyIdFactory?: () => string;
  readonly randomBytesFactory?: (size: number) => Buffer;
}

export interface ProviderAuthorityLegacyKeyImportOptions {
  readonly expectedRevisionHash: string;
  readonly domain: 'truth' | 'limit';
  readonly legacyKey: string | Buffer;
  readonly now?: () => Date;
  readonly keyIdFactory?: () => string;
}

export interface ProviderAccountIdentity {
  readonly tenantId: string;
  readonly provider: string;
  readonly authMode: string;
  readonly stableAccountIdentity: string;
}

const KEY_BYTES = 32;
const HEX_32_BYTES = /^[a-f0-9]{64}$/u;
const HEX_KEY_MATERIAL = /^(?:[a-f0-9]{2}){32,}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const KEYRING_RELATIVE_DIR = join('keys', 'provider-authority', 'v1', 'revisions');
const GENESIS_FILE = 'genesis.json';
const DOMAIN_INFO: Readonly<Record<ProviderAuthorityDomain, string>> = {
  truth: 'deckent:provider-authority:truth-integrity:v1',
  limit: 'deckent:provider-authority:limit-integrity:v1',
  'account-pseudonym': 'deckent:provider-authority:account-pseudonym:v1',
};
const HKDF_SALT = Buffer.from('deckent:provider-authority:hkdf-salt:v1', 'utf8');

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function revisionHash(revision: SerializedKeyringRevisionUnsigned): string {
  return createHash('sha256').update(canonicalJson(revision)).digest('hex');
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function safeEqualHex(left: string, right: string): boolean {
  if (!HEX_32_BYTES.test(left) || !HEX_32_BYTES.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function ensureIdentity(name: string, value: string): void {
  if (!SAFE_ID.test(value)) {
    throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', `${name} is not a canonical opaque identifier`);
  }
}

function pathIsWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function assertPosixPrivate(path: string, kind: 'directory' | 'file'): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (kind === 'directory' ? !stat.isDirectory() : !stat.isFile())) {
    throw new ProviderAuthorityKeyringError('KEYRING_STORAGE_UNSAFE', `Provider authority ${kind} is unsafe`);
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new ProviderAuthorityKeyringError(
      'KEYRING_ACL_ENFORCEMENT_FAILED',
      `Provider authority ${kind} grants group or other permissions`,
    );
  }
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new ProviderAuthorityKeyringError(
      'KEYRING_ACL_ENFORCEMENT_FAILED',
      `Provider authority ${kind} is not owned by the current host principal`,
    );
  }
}

function keyringDirectory(options: ProviderAuthorityKeyringOpenOptions, create: boolean): string {
  if (!options.dataDir || !isAbsolute(options.dataDir)) {
    throw new ProviderAuthorityKeyringError(
      'KEYRING_SCOPE_UNRESOLVED',
      'Provider authority dataDir must be an absolute platform-global path',
    );
  }
  if ((options.platform ?? process.platform) === 'win32') {
    throw new ProviderAuthorityKeyringError(
      'KEYRING_ACL_UNSUPPORTED',
      'Provider authority requires a verified Windows DACL storage adapter',
    );
  }
  const revisionsDir = resolve(options.dataDir, KEYRING_RELATIVE_DIR);
  if (create) {
    mkdirSync(revisionsDir, { recursive: true, mode: 0o700 });
    for (const directory of [
      resolve(options.dataDir, 'keys'),
      resolve(options.dataDir, 'keys', 'provider-authority'),
      resolve(options.dataDir, 'keys', 'provider-authority', 'v1'),
      revisionsDir,
    ]) {
      const stat = lstatSync(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new ProviderAuthorityKeyringError(
          'KEYRING_STORAGE_UNSAFE',
          'Provider authority directory cannot be a symlink or non-directory',
        );
      }
      chmodSync(directory, 0o700);
    }
  }
  if (options.projectRoot) {
    const project = realpathSync(options.projectRoot);
    const data = realpathSync(options.dataDir);
    const revisions = realpathSync(revisionsDir);
    if (pathIsWithin(project, data) || pathIsWithin(project, revisions)) {
      throw new ProviderAuthorityKeyringError(
        'KEYRING_PROJECT_SCOPE_FORBIDDEN',
        'Provider authority keyring cannot live inside a project or worker scope',
      );
    }
  }
  for (const directory of [
    resolve(options.dataDir, 'keys'),
    resolve(options.dataDir, 'keys', 'provider-authority'),
    resolve(options.dataDir, 'keys', 'provider-authority', 'v1'),
    revisionsDir,
  ]) {
    assertPosixPrivate(directory, 'directory');
  }
  return revisionsDir;
}

function parseRevision(path: string): SerializedKeyringRevision {
  assertPosixPrivate(path, 'file');
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', 'Provider authority revision is not valid JSON');
  }
  if (!value || typeof value !== 'object') {
    throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', 'Provider authority revision must be an object');
  }
  const item = value as Partial<SerializedKeyringRevision>;
  if (item.schemaVersion !== PROVIDER_AUTHORITY_KEYRING_SCHEMA_VERSION) {
    throw new ProviderAuthorityKeyringError(
      'KEYRING_UNSUPPORTED_VERSION',
      'Provider authority keyring schema is unsupported',
    );
  }
  if (typeof item.keyringId !== 'string' || typeof item.activeAuthorityKeyId !== 'string'
    || typeof item.revision !== 'number' || !Number.isSafeInteger(item.revision) || item.revision < 1
    || (item.previousRevisionHash !== null && !HEX_32_BYTES.test(item.previousRevisionHash ?? ''))
    || !validTimestamp(item.createdAt)
    || !HEX_32_BYTES.test(item.pseudonymRootHex ?? '')
    || !Array.isArray(item.authorityKeys)
    || !HEX_32_BYTES.test(item.revisionHash ?? '')) {
    throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', 'Provider authority revision shape is invalid');
  }
  ensureIdentity('keyringId', item.keyringId);
  ensureIdentity('activeAuthorityKeyId', item.activeAuthorityKeyId);
  const ids = new Set<string>();
  let activeCount = 0;
  for (const key of item.authorityKeys) {
    if (!key || typeof key !== 'object') {
      throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', 'Provider authority key entry is invalid');
    }
    ensureIdentity('keyId', key.keyId);
    if (ids.has(key.keyId) || !HEX_KEY_MATERIAL.test(key.keyMaterialHex)
      || !validTimestamp(key.createdAt)
      || (key.derivation !== 'hkdf-v1' && key.derivation !== 'legacy-raw-v1')
      || !Array.isArray(key.domains)
      || key.domains.length === 0
      || key.domains.some((domain: unknown) => domain !== 'truth' && domain !== 'limit')
      || new Set(key.domains).size !== key.domains.length
      || (key.status !== 'active' && key.status !== 'retired')
      || (key.retiredAt !== null && !validTimestamp(key.retiredAt))) {
      throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', 'Provider authority key entry is invalid');
    }
    if ((key.status === 'active' && key.retiredAt !== null)
      || (key.status === 'retired' && key.retiredAt === null)) {
      throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', 'Provider authority key lifecycle is invalid');
    }
    if (key.status === 'active'
      && (key.derivation !== 'hkdf-v1' || !key.domains.includes('truth') || !key.domains.includes('limit'))) {
      throw new ProviderAuthorityKeyringError(
        'KEYRING_MALFORMED',
        'Active provider authority key must support every integrity domain',
      );
    }
    if (key.status === 'active') activeCount += 1;
    ids.add(key.keyId);
  }
  if (activeCount !== 1 || !ids.has(item.activeAuthorityKeyId)
    || item.authorityKeys.find(key => key.keyId === item.activeAuthorityKeyId)?.status !== 'active') {
    throw new ProviderAuthorityKeyringError(
      'KEYRING_ACTIVE_KEY_MISSING',
      'Provider authority revision has no unique active signing key',
    );
  }
  const {
    revisionHash: persistedHash,
    ...unsigned
  } = item as SerializedKeyringRevision;
  if (!safeEqualHex(persistedHash, revisionHash(unsigned))) {
    throw new ProviderAuthorityKeyringError('KEYRING_INTEGRITY_FAILURE', 'Provider authority revision hash mismatch');
  }
  return item as SerializedKeyringRevision;
}

function loadLatest(options: ProviderAuthorityKeyringOpenOptions): SerializedKeyringRevision {
  const revisionsDir = keyringDirectory(options, false);
  const names = readdirSync(revisionsDir).filter(name => name.endsWith('.json')).sort();
  if (!names.includes(GENESIS_FILE)) {
    throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', 'Provider authority genesis revision is missing');
  }
  const visited = new Set<string>();
  let current = parseRevision(join(revisionsDir, GENESIS_FILE));
  if (current.revision !== 1 || current.previousRevisionHash !== null) {
    throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', 'Provider authority genesis revision is invalid');
  }
  visited.add(GENESIS_FILE);
  while (names.includes(`${current.revisionHash}.json`)) {
    const fileName = `${current.revisionHash}.json`;
    const next = parseRevision(join(revisionsDir, fileName));
    if (next.keyringId !== current.keyringId
      || next.pseudonymRootHex !== current.pseudonymRootHex
      || next.revision !== current.revision + 1
      || next.previousRevisionHash !== current.revisionHash) {
      throw new ProviderAuthorityKeyringError('KEYRING_INTEGRITY_FAILURE', 'Provider authority revision chain is invalid');
    }
    const previousKeys = new Map(current.authorityKeys.map(key => [key.keyId, key]));
    for (const oldKey of previousKeys.values()) {
      const carried = next.authorityKeys.find(key => key.keyId === oldKey.keyId);
      if (!carried || carried.keyMaterialHex !== oldKey.keyMaterialHex
        || carried.createdAt !== oldKey.createdAt
        || carried.derivation !== oldKey.derivation
        || carried.domains.length !== oldKey.domains.length
        || carried.domains.some((domain, index) => domain !== oldKey.domains[index])
        || oldKey.status === 'retired' && (carried.status !== 'retired' || carried.retiredAt !== oldKey.retiredAt)) {
        throw new ProviderAuthorityKeyringError(
          'KEYRING_INTEGRITY_FAILURE',
          'Provider authority revision rewrites historical key custody',
        );
      }
    }
    visited.add(fileName);
    current = next;
  }
  if (visited.size !== names.length) {
    throw new ProviderAuthorityKeyringError(
      'KEYRING_INTEGRITY_FAILURE',
      'Provider authority contains an unreachable or competing revision',
    );
  }
  return current;
}

function loadLatestSafe(options: ProviderAuthorityKeyringOpenOptions): SerializedKeyringRevision {
  try {
    return loadLatest(options);
  } catch (error) {
    if (error instanceof ProviderAuthorityKeyringError) throw error;
    throw new ProviderAuthorityKeyringError(
      'KEYRING_IO_FAILURE',
      `Provider authority keyring could not be read: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
}

function derivedKey(rootHex: string, domain: ProviderAuthorityDomain): Buffer {
  return Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(rootHex, 'hex'),
    HKDF_SALT,
    Buffer.from(DOMAIN_INFO[domain], 'utf8'),
    KEY_BYTES,
  ));
}

function hmac(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

function toSnapshot(revision: SerializedKeyringRevision): ProviderAuthorityKeyringSnapshot {
  return {
    schemaVersion: 1,
    keyringId: revision.keyringId,
    revision: revision.revision,
    revisionHash: revision.revisionHash,
    activeAuthorityKeyId: revision.activeAuthorityKeyId,
    authorityKeys: revision.authorityKeys.map(({ keyMaterialHex: _secret, ...key }) => key),
  };
}

export function resolveProviderAuthorityKeyringDirectory(
  platform: GlobalScopePlatform,
  env: GlobalScopeEnv,
): string {
  const pathApi = platform === 'win32' ? win32 : posix;
  return pathApi.join(
    resolveGlobalScopePaths(platform, env).dataDir,
    'keys',
    'provider-authority',
    'v1',
    'revisions',
  );
}

/**
 * Compatibility/test adapter for callers that already own a host root key.
 * Production composition uses {@link ProviderAuthorityKeyring}; this adapter
 * still applies the same HKDF domain separation and exact key-id verification.
 */
export function createProviderIntegrityAuthority(
  rootKey: string | Buffer,
  explicitKeyId?: string,
): ProviderIntegrityAuthority {
  const material = Buffer.isBuffer(rootKey) ? Buffer.from(rootKey) : Buffer.from(rootKey, 'utf8');
  if (material.byteLength < KEY_BYTES) {
    throw new ProviderAuthorityKeyringError(
      'KEYRING_MALFORMED',
      'Provider integrity root key must be at least 32 bytes',
    );
  }
  const keyId = explicitKeyId
    ?? `pak-inline-${createHash('sha256').update(material).digest('hex').slice(0, 24)}`;
  ensureIdentity('keyId', keyId);
  const derive = (domain: 'truth' | 'limit'): Buffer => Buffer.from(hkdfSync(
    'sha256',
    material,
    HKDF_SALT,
    Buffer.from(DOMAIN_INFO[domain], 'utf8'),
    KEY_BYTES,
  ));
  return {
    sign(domain, value) {
      return { keyId, mac: hmac(derive(domain), value), authorityRevision: 1 };
    },
    verify(domain, candidateKeyId, value, mac) {
      if (candidateKeyId !== keyId) {
        throw new ProviderAuthorityKeyringError(
          'KEYRING_UNKNOWN_KEY_ID',
          'Provider authority key id is unavailable',
        );
      }
      return safeEqualHex(hmac(derive(domain), value), mac);
    },
  };
}

export class ProviderAuthorityKeyring implements ProviderIntegrityAuthority {
  private constructor(private readonly options: ProviderAuthorityKeyringOpenOptions) {}

  static open(options: ProviderAuthorityKeyringOpenOptions): ProviderAuthorityKeyring {
    loadLatestSafe(options);
    return new ProviderAuthorityKeyring(options);
  }

  static create(options: ProviderAuthorityKeyringCreateOptions): {
    readonly keyring: ProviderAuthorityKeyring;
    readonly created: boolean;
  } {
    const revisionsDir = keyringDirectory(options, true);
    const now = (options.now ?? (() => new Date()))().toISOString();
    const keyId = (options.keyIdFactory ?? (() => `pak-${randomUUID()}`))();
    const keyringId = (options.keyringIdFactory ?? (() => `par-${randomUUID()}`))();
    ensureIdentity('keyId', keyId);
    ensureIdentity('keyringId', keyringId);
    const bytes = options.randomBytesFactory ?? randomBytes;
    const unsigned: SerializedKeyringRevisionUnsigned = {
      schemaVersion: 1,
      keyringId,
      revision: 1,
      previousRevisionHash: null,
      createdAt: now,
      pseudonymRootHex: bytes(KEY_BYTES).toString('hex'),
      activeAuthorityKeyId: keyId,
      authorityKeys: [{
        keyId,
        status: 'active',
        derivation: 'hkdf-v1',
        domains: ['truth', 'limit'],
        createdAt: now,
        retiredAt: null,
        keyMaterialHex: bytes(KEY_BYTES).toString('hex'),
      }],
    };
    const genesis = { ...unsigned, revisionHash: revisionHash(unsigned) };
    let created: boolean;
    try {
      created = createJsonFileFirstWriterWins(join(revisionsDir, GENESIS_FILE), genesis);
    } catch (error) {
      throw new ProviderAuthorityKeyringError(
        'KEYRING_ATOMIC_PUBLICATION_UNSUPPORTED',
        `Provider authority genesis could not be published atomically: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
    if (created) chmodSync(join(revisionsDir, GENESIS_FILE), 0o600);
    const keyring = ProviderAuthorityKeyring.open(options);
    return { keyring, created };
  }

  snapshot(): ProviderAuthorityKeyringSnapshot {
    return toSnapshot(loadLatestSafe(this.options));
  }

  rotate(options: ProviderAuthorityKeyringRotateOptions): ProviderAuthorityKeyringSnapshot {
    const current = loadLatestSafe(this.options);
    if (current.revisionHash !== options.expectedRevisionHash) {
      throw new ProviderAuthorityKeyringError(
        'KEYRING_CONCURRENT_UPDATE',
        'Provider authority revision changed before rotation',
      );
    }
    const now = (options.now ?? (() => new Date()))().toISOString();
    const newKeyId = (options.keyIdFactory ?? (() => `pak-${randomUUID()}`))();
    ensureIdentity('keyId', newKeyId);
    if (current.authorityKeys.some(key => key.keyId === newKeyId)) {
      throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', 'Provider authority key id already exists');
    }
    const bytes = options.randomBytesFactory ?? randomBytes;
    const unsigned: SerializedKeyringRevisionUnsigned = {
      schemaVersion: 1,
      keyringId: current.keyringId,
      revision: current.revision + 1,
      previousRevisionHash: current.revisionHash,
      createdAt: now,
      pseudonymRootHex: current.pseudonymRootHex,
      activeAuthorityKeyId: newKeyId,
      authorityKeys: [
        ...current.authorityKeys.map(key => key.status === 'active'
          ? { ...key, status: 'retired' as const, retiredAt: now }
          : key),
        {
          keyId: newKeyId,
          status: 'active',
          derivation: 'hkdf-v1',
          domains: ['truth', 'limit'],
          createdAt: now,
          retiredAt: null,
          keyMaterialHex: bytes(KEY_BYTES).toString('hex'),
        },
      ],
    };
    const next = { ...unsigned, revisionHash: revisionHash(unsigned) };
    const path = join(keyringDirectory(this.options, false), `${current.revisionHash}.json`);
    let created: boolean;
    try {
      created = createJsonFileFirstWriterWins(path, next);
    } catch (error) {
      throw new ProviderAuthorityKeyringError(
        'KEYRING_ATOMIC_PUBLICATION_UNSUPPORTED',
        `Provider authority rotation could not be published atomically: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
    if (!created) {
      throw new ProviderAuthorityKeyringError(
        'KEYRING_CONCURRENT_UPDATE',
        'Another host process won provider authority rotation',
      );
    }
    chmodSync(path, 0o600);
    return toSnapshot(loadLatestSafe(this.options));
  }

  sign(domain: 'truth' | 'limit', value: string): ProviderAuthorityMac {
    const revision = loadLatestSafe(this.options);
    const key = revision.authorityKeys.find(item => item.keyId === revision.activeAuthorityKeyId);
    if (!key || key.status !== 'active') {
      throw new ProviderAuthorityKeyringError('KEYRING_ACTIVE_KEY_MISSING', 'Active provider authority key is missing');
    }
    if (!key.domains.includes(domain)) {
      throw new ProviderAuthorityKeyringError('KEYRING_UNKNOWN_KEY_ID', 'Active key does not cover this domain');
    }
    return {
      keyId: key.keyId,
      mac: hmac(this.keyForDomain(key, domain), value),
      authorityRevision: revision.revision,
    };
  }

  verify(domain: 'truth' | 'limit', keyId: string, value: string, mac: string): boolean {
    const revision = loadLatestSafe(this.options);
    const key = revision.authorityKeys.find(item => item.keyId === keyId);
    if (!key) {
      throw new ProviderAuthorityKeyringError('KEYRING_UNKNOWN_KEY_ID', 'Provider authority key id is unavailable');
    }
    if (!key.domains.includes(domain)) {
      throw new ProviderAuthorityKeyringError('KEYRING_UNKNOWN_KEY_ID', 'Provider authority key does not cover this domain');
    }
    return safeEqualHex(hmac(this.keyForDomain(key, domain), value), mac);
  }

  /**
   * Owner-gated bridge for immutable pre-key-id evidence. Imported material is
   * retired/verify-only and scoped to exactly one store domain.
   */
  importLegacyVerificationKey(
    options: ProviderAuthorityLegacyKeyImportOptions,
  ): ProviderAuthorityKeyringSnapshot {
    const current = loadLatestSafe(this.options);
    if (current.revisionHash !== options.expectedRevisionHash) {
      throw new ProviderAuthorityKeyringError(
        'KEYRING_CONCURRENT_UPDATE',
        'Provider authority revision changed before legacy-key import',
      );
    }
    const material = Buffer.isBuffer(options.legacyKey)
      ? Buffer.from(options.legacyKey)
      : Buffer.from(options.legacyKey, 'utf8');
    if (material.byteLength < KEY_BYTES) {
      throw new ProviderAuthorityKeyringError(
        'KEYRING_MALFORMED',
        'Legacy provider authority key must be at least 32 bytes',
      );
    }
    const now = (options.now ?? (() => new Date()))().toISOString();
    const keyId = (options.keyIdFactory ?? (() => `pak-legacy-${randomUUID()}`))();
    ensureIdentity('keyId', keyId);
    if (current.authorityKeys.some(key => key.keyId === keyId)) {
      throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', 'Provider authority key id already exists');
    }
    const unsigned: SerializedKeyringRevisionUnsigned = {
      schemaVersion: 1,
      keyringId: current.keyringId,
      revision: current.revision + 1,
      previousRevisionHash: current.revisionHash,
      createdAt: now,
      pseudonymRootHex: current.pseudonymRootHex,
      activeAuthorityKeyId: current.activeAuthorityKeyId,
      authorityKeys: [
        ...current.authorityKeys,
        {
          keyId,
          status: 'retired',
          derivation: 'legacy-raw-v1',
          domains: [options.domain],
          createdAt: now,
          retiredAt: now,
          keyMaterialHex: material.toString('hex'),
        },
      ],
    };
    const next = { ...unsigned, revisionHash: revisionHash(unsigned) };
    const path = join(keyringDirectory(this.options, false), `${current.revisionHash}.json`);
    let created: boolean;
    try {
      created = createJsonFileFirstWriterWins(path, next);
    } catch (error) {
      throw new ProviderAuthorityKeyringError(
        'KEYRING_ATOMIC_PUBLICATION_UNSUPPORTED',
        `Provider authority legacy key could not be published atomically: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
    if (!created) {
      throw new ProviderAuthorityKeyringError(
        'KEYRING_CONCURRENT_UPDATE',
        'Another host process changed provider authority custody',
      );
    }
    chmodSync(path, 0o600);
    return toSnapshot(loadLatestSafe(this.options));
  }

  pseudonymizeAccount(identity: ProviderAccountIdentity): string {
    for (const [name, value] of Object.entries(identity)) {
      if (!value || value !== value.trim()) {
        throw new ProviderAuthorityKeyringError('KEYRING_MALFORMED', `${name} is required for account identity`);
      }
    }
    const revision = loadLatestSafe(this.options);
    const payload = canonicalJson({
      tenantId: identity.tenantId,
      provider: identity.provider,
      authMode: identity.authMode,
      stableAccountIdentity: identity.stableAccountIdentity,
    });
    return hmac(derivedKey(revision.pseudonymRootHex, 'account-pseudonym'), payload);
  }

  private keyForDomain(
    key: SerializedAuthorityKey,
    domain: 'truth' | 'limit',
  ): Buffer {
    return key.derivation === 'legacy-raw-v1'
      ? Buffer.from(key.keyMaterialHex, 'hex')
      : derivedKey(key.keyMaterialHex, domain);
  }
}
