// ═══ Audit Compliance Export ══════════════════════════════════════════════
// Compliance-grade JSON/CSV export with HMAC chain verification.
// F4 enterprise foundation — ROADMAP F4-002. ADR-037, ADR-010.
// Sprint 211 (211-006).

import { createHmac } from 'node:crypto';
import { queryAudit } from './audit-query.js';
import type { AuditQuery, AuditEntry } from './audit-query.js';

// ─── Types ────────────────────────────────────────────────────────

export type AuditExportFormat = 'json' | 'csv';

export type AuditExportFilter = AuditQuery;

export interface AuditExportResult {
  format: AuditExportFormat;
  sprintId: string;
  entryCount: number;
  /** Serialized audit log (JSON string or CSV text). */
  data: string;
  /** HMAC-SHA256 chain over entries — use verifyHmacChain() to validate. */
  hmacChain: string[];
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Export audit log for a sprint as JSON or CSV with HMAC chain.
 *
 * Reads events via queryAudit(), serializes to the requested format,
 * and computes an HMAC-SHA256 chain over the entries for tamper detection.
 *
 * @param projectRoot - Project root directory
 * @param sprintId    - Sprint identifier, e.g. "sprint-211"
 * @param format      - Output format: 'json' | 'csv'
 * @param filter      - Optional filter (tenant/channel/time-range, AND semantics)
 * @param secret      - HMAC secret key (default: 'deckent-audit')
 */
export function exportAuditLog(
  projectRoot: string,
  sprintId: string,
  format: AuditExportFormat,
  filter: AuditExportFilter = {},
  secret = 'deckent-audit',
): AuditExportResult {
  const queryResult = queryAudit(projectRoot, sprintId, filter);
  const entries = queryResult.matched;

  const data = format === 'csv' ? entriesToCsv(entries) : entriesToJson(entries);
  const hmacChain = buildHmacChain(entries, secret);

  return {
    format,
    sprintId,
    entryCount: entries.length,
    data,
    hmacChain,
  };
}

/**
 * Verify an HMAC chain against a list of audit entries.
 *
 * Recomputes the chain from scratch and compares each digest with
 * the stored chain. Returns false immediately if any digest mismatches
 * or if the chain length does not match the entries length.
 *
 * @param entries   - Original audit entries (same order as export)
 * @param chain     - Stored hmacChain from AuditExportResult
 * @param secret    - Same HMAC secret used during export
 */
export function verifyHmacChain(
  entries: AuditEntry[],
  chain: string[],
  secret = 'deckent-audit',
): boolean {
  if (entries.length !== chain.length) return false;
  const recomputed = buildHmacChain(entries, secret);
  return recomputed.every((digest, i) => digest === chain[i]);
}

// ─── Serialization ────────────────────────────────────────────────

function entriesToJson(entries: AuditEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

const CSV_HEADER = 'timestamp,sequence,source,target,channel,tenantId';

function entriesToCsv(entries: AuditEntry[]): string {
  const rows = entries.map(e =>
    [e.timestamp, e.sequence, e.source, e.target, e.channel, e.tenantId ?? '']
      .map(csvCell)
      .join(','),
  );
  return [CSV_HEADER, ...rows].join('\n');
}

function csvCell(value: string | number | undefined): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ─── HMAC Chain ───────────────────────────────────────────────────

function buildHmacChain(entries: AuditEntry[], secret: string): string[] {
  const chain: string[] = [];
  let prev = '';
  for (const entry of entries) {
    const digest = createHmac('sha256', secret)
      .update(prev + JSON.stringify(entry))
      .digest('hex');
    chain.push(digest);
    prev = digest;
  }
  return chain;
}
