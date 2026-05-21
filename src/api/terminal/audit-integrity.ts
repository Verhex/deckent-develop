import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Audit HMAC chain — I4 invariant from sub-project #2 design.
 *
 * Append-only chain over terminal audit rows. Each row carries:
 *   - audit_prev_hmac: hmac of the previous row (NULL for genesis)
 *   - audit_hmac     : hmac(secret, prev_hmac || timestamp || tenant_id || action || content)
 *
 * Any UPDATE/DELETE of an audit row breaks the chain — `verifyAuditChain`
 * walks rows in id-order and reports the first tampered row id.
 *
 * Security invariants:
 *   - The audit-key (32 random bytes) lives at `.deckent/audit-key`, mode 0600,
 *     gitignored. It MUST be machine-local.
 *   - The HMAC content_signal is the same JSON string that gets persisted in
 *     `entries.content` — I2 (no raw bytes) is enforced upstream by TerminalAudit.
 */

export const AUDIT_KEY_FILENAME = 'audit-key';

export interface AuditHmacInput {
  prevHmac: string | null;
  timestamp: string;
  tenantId: string;
  action: string;
  contentSignal: string;
}

export interface AuditChainRow {
  id: number;
  content: string;
  tenant_id: string | null;
  audit_hmac: string | null;
  audit_prev_hmac: string | null;
  created_at: string;
}

export interface AuditChainStore {
  queryAuditChain(): AuditChainRow[];
}

export interface VerifyAuditChainResult {
  ok: boolean;
  rowsVerified: number;
  firstTamperedRowId: number | null;
  note?: string;
}

/**
 * Compute HMAC-SHA256 over the ordered fields. Returns a lowercase hex digest
 * (64 chars). NULL `prevHmac` is normalized to the empty string so the digest
 * is well-defined for the genesis row.
 */
export function computeAuditHmac(secret: Buffer, input: AuditHmacInput): string {
  const h = createHmac('sha256', secret);
  const sep = '\x00';
  h.update((input.prevHmac ?? '') + sep);
  h.update(input.timestamp + sep);
  h.update(input.tenantId + sep);
  h.update(input.action + sep);
  h.update(input.contentSignal);
  return h.digest('hex');
}

/**
 * Read `.deckent/audit-key` from `projectRoot`, generating a fresh 32-byte
 * key on first call. The key file is mode 0600 on POSIX systems.
 */
export function loadOrCreateAuditKey(projectRoot: string): Buffer {
  const deckentDir = join(projectRoot, '.deckent');
  if (!existsSync(deckentDir)) {
    mkdirSync(deckentDir, { recursive: true });
  }
  const keyPath = join(deckentDir, AUDIT_KEY_FILENAME);
  if (existsSync(keyPath)) {
    const hex = readFileSync(keyPath, 'utf-8').trim();
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      throw new Error(`audit-key at ${keyPath} is not a 32-byte hex string`);
    }
    return Buffer.from(hex, 'hex');
  }
  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString('hex'), { encoding: 'utf-8' });
  try {
    chmodSync(keyPath, 0o600);
  } catch {
    /* ignore on non-POSIX */
  }
  return key;
}

/**
 * Walk all audit rows in id-order, recompute the expected HMAC for each, and
 * report the first row whose stored hmac differs from the expected value.
 *
 * Rows that lack `audit_hmac` (legacy rows written before chain rollout) are
 * skipped — the verifier resumes once it encounters a row with a stored hmac.
 */
export function verifyAuditChain(opts: {
  store: AuditChainStore;
  secret: Buffer;
}): VerifyAuditChainResult {
  const rows = opts.store.queryAuditChain();
  if (rows.length === 0) {
    return { ok: true, rowsVerified: 0, firstTamperedRowId: null, note: 'no audit rows' };
  }
  let rowsVerified = 0;
  let lastValidHmac: string | null = null;
  for (const row of rows) {
    if (row.audit_hmac === null) {
      continue;
    }
    let parsed: { action?: string; at?: string };
    try {
      parsed = JSON.parse(row.content);
    } catch {
      return {
        ok: false,
        rowsVerified,
        firstTamperedRowId: row.id,
        note: 'malformed audit content JSON',
      };
    }
    const action = parsed.action ?? '';
    const timestamp = parsed.at ?? row.created_at;
    const tenantId = row.tenant_id ?? 'local';
    const expected = computeAuditHmac(opts.secret, {
      prevHmac: lastValidHmac,
      timestamp,
      tenantId,
      action,
      contentSignal: row.content,
    });
    if (expected !== row.audit_hmac) {
      return {
        ok: false,
        rowsVerified,
        firstTamperedRowId: row.id,
      };
    }
    rowsVerified += 1;
    lastValidHmac = row.audit_hmac;
  }
  return {
    ok: true,
    rowsVerified,
    firstTamperedRowId: null,
  };
}
