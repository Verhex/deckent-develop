import { createHash, createHmac } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ApprovalFixtureKey {
  keyId: string;
  status: 'active' | 'retired';
  createdAt: string;
  retiredAt: string | null;
  keyMaterialHex: string;
}

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

export function sha256Canonical(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function writeApprovalAuthorityFixtureRevision(input: {
  dataDir: string;
  revision: number;
  previousRevisionHash: string | null;
  activeKeyId: string;
  keys: readonly ApprovalFixtureKey[];
  keyringId?: string;
  createdAt?: string;
}): string {
  const revisionsDir = join(
    input.dataDir,
    'keys',
    'approval-decision',
    'v1',
    'revisions',
  );
  const directories = [
    input.dataDir,
    join(input.dataDir, 'keys'),
    join(input.dataDir, 'keys', 'approval-decision'),
    join(input.dataDir, 'keys', 'approval-decision', 'v1'),
    revisionsDir,
  ];
  for (const directory of directories) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
  }
  const unsigned = {
    schemaVersion: 1 as const,
    kind: 'approval-decision-keyring' as const,
    keyringId: input.keyringId ?? 'approval-keyring-fixture-v1',
    revision: input.revision,
    previousRevisionHash: input.previousRevisionHash,
    createdAt: input.createdAt ?? `2026-07-${String(input.revision).padStart(2, '0')}T00:00:00.000Z`,
    activeKeyId: input.activeKeyId,
    keys: input.keys,
  };
  const revisionHash = sha256Canonical(unsigned);
  const path = join(revisionsDir, `revision-${input.revision}.json`);
  writeFileSync(path, `${JSON.stringify({ ...unsigned, revisionHash }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  chmodSync(path, 0o600);
  return revisionHash;
}

export function signHs256Jwt(
  claims: Record<string, unknown>,
  secret: string | Buffer,
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}
