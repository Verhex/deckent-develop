// ─── Deckent Status Panel — data-binding (VS Code extension, dilim-1) ─────────
// Sıra-64 / Task 363-012: status+limits+approvals panel. This
// module owns data-loading and webview data-binding only — it never imports
// the real `vscode` module. The webview surface is injected (`WebviewLike`),
// the same dependency-injection convention `extension.ts`/`commands.ts` use
// for `VsCodeApi`, so this compiles and unit-tests without a real VS Code
// host (a mock webview is enough).

import type { RpcBridge, RpcBridgeError } from './rpc-bridge.js';
import type { TermRpcMethodTable } from '../../../core/term-rpc.js';

// ─── Injected webview surface ──────────────────────────────────────────────────

export interface WebviewLike {
  postMessage(message: unknown): unknown;
}

export interface PanelHost {
  webview: WebviewLike;
}

// ─── Panel data model ──────────────────────────────────────────────────────────

/** One panel section's outcome — exactly one of `data`/`error` is non-null. */
export interface PanelSection<T> {
  data: T | null;
  error: RpcBridgeError | null;
}

export interface DeckentPanelData {
  fetchedAt: string;
  runStatus: PanelSection<TermRpcMethodTable['run.status']['result']>;
  sessions: PanelSection<TermRpcMethodTable['session.list']['result']>;
  limits: PanelSection<TermRpcMethodTable['limits.get']['result']>;
  approvals: PanelSection<TermRpcMethodTable['approval.list']['result']>;
}

export interface LoadPanelDataOptions {
  /** Which run to report status for. Omitted → the runStatus section stays empty (no call made). */
  runId?: string;
  /** Approval scope filter, forwarded to `approval.list`. */
  scopeId?: string;
  /** Injected clock — tests pin a fixed ISO string instead of the wall clock. */
  now?: () => string;
}

export const PANEL_MESSAGE_TYPE = 'deckent.panelData';

// ─── Data loading ───────────────────────────────────────────────────────────────

function toSection<T>(result: { ok: true; value: T } | { ok: false; error: RpcBridgeError } | null): PanelSection<T> {
  if (result === null) return { data: null, error: null };
  if (result.ok) return { data: result.value, error: null };
  return { data: null, error: result.error };
}

/**
 * Fetch all 4 read-only sections concurrently. Each section fails
 * independently — one bridge call failing never blocks or discards the
 * others, so a partial outage still renders whatever data is available.
 */
export async function loadPanelData(bridge: RpcBridge, options: LoadPanelDataOptions = {}): Promise<DeckentPanelData> {
  const now = options.now ?? (() => new Date().toISOString());

  const [runStatus, sessions, limits, approvals] = await Promise.all([
    options.runId !== undefined ? bridge.getRunStatus(options.runId) : Promise.resolve(null),
    bridge.listSessions(),
    bridge.getLimits(),
    bridge.listApprovals(options.scopeId),
  ]);

  return {
    fetchedAt: now(),
    runStatus: toSection(runStatus),
    sessions: toSection(sessions),
    limits: toSection(limits),
    approvals: toSection(approvals),
  };
}

// ─── Webview binding ─────────────────────────────────────────────────────────────

/**
 * Load fresh panel data and push it into the webview via `postMessage` — the
 * panel veri-bağlama goCriteria item. The webview's own script is
 * responsible for re-rendering from the message; this function never writes
 * to `webview.html` (see {@link renderPanelHtml} for the separate, pure HTML
 * shell used for the initial paint).
 */
export async function refreshPanel(
  host: PanelHost,
  bridge: RpcBridge,
  options: LoadPanelDataOptions = {},
): Promise<DeckentPanelData> {
  const data = await loadPanelData(bridge, options);
  host.webview.postMessage({ type: PANEL_MESSAGE_TYPE, data });
  return data;
}

// ─── Static HTML shell (read-only) ───────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sectionErrorMessage(error: RpcBridgeError): string {
  return error.kind === 'rpc' ? error.error.message : error.message;
}

function renderSection<T>(title: string, section: PanelSection<T>, renderBody: (data: T) => string): string {
  const heading = `<h2>${escapeHtml(title)}</h2>`;
  if (section.error) {
    return `<section>${heading}<p class="error">${escapeHtml(sectionErrorMessage(section.error))}</p></section>`;
  }
  if (section.data === null) {
    return `<section>${heading}<p class="empty">No data</p></section>`;
  }
  return `<section>${heading}${renderBody(section.data)}</section>`;
}

function renderRunStatus(data: TermRpcMethodTable['run.status']['result']): string {
  return `<p>Run <code>${escapeHtml(data.runId)}</code>: <strong>${escapeHtml(data.state)}</strong></p>`;
}

function renderSessions(data: TermRpcMethodTable['session.list']['result']): string {
  if (data.sessions.length === 0) return '<p class="empty">No active sessions</p>';
  const items = data.sessions.map((s) => `<li>${escapeHtml(s.label)} — ${escapeHtml(s.status)}</li>`).join('');
  return `<ul>${items}</ul>`;
}

function renderLimits(data: TermRpcMethodTable['limits.get']['result']): string {
  const entries = Object.entries(data.limits);
  if (entries.length === 0) return '<p class="empty">No limits reported</p>';
  const items = entries.map(([key, value]) => `<li>${escapeHtml(key)}: ${escapeHtml(String(value))}</li>`).join('');
  return `<ul>${items}</ul>`;
}

function approvalField(approval: unknown, ...names: string[]): string | undefined {
  if (typeof approval !== 'object' || approval === null) return undefined;
  const record = approval as Record<string, unknown>;
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function renderApprovals(data: TermRpcMethodTable['approval.list']['result']): string {
  if (data.approvals.length === 0) return '<p class="empty">No pending approvals</p>';
  const items = data.approvals
    .map((approval) => {
      const id = approvalField(approval, 'id') ?? '';
      const code = approvalField(approval, 'shortCode', 'code') ?? id;
      const risk = approvalField(approval, 'risk', 'riskLevel') ?? '';
      const label = approvalField(approval, 'summary', 'title', 'description') ?? id;
      const prefix = `<code>#${escapeHtml(code)}</code> ${escapeHtml(label)}`;

      if (risk.toLowerCase() === 'critical') {
        return `<li class="approval critical">${prefix} <strong>critical</strong> <span class="hint">CLI: deckent approvals decide #${escapeHtml(code)}</span></li>`;
      }

      return `<li class="approval">${prefix} <button type="button" data-approval-id="${escapeHtml(id)}" data-action="approve">Approve</button> <button type="button" data-approval-id="${escapeHtml(id)}" data-action="reject">Reject</button></li>`;
    })
    .join('');
  return `<ul>${items}</ul>`;
}

/**
 * Render the panel body from a loaded {@link DeckentPanelData}
 * snapshot. Pure and side-effect-free — every interpolated string is
 * HTML-escaped regardless of provenance (session labels, limit keys/values,
 * approval payloads), since the RPC data is opaque and must never be trusted
 * as pre-sanitized HTML.
 */
export function renderPanelHtml(data: DeckentPanelData): string {
  const sections = [
    renderSection('Run Status', data.runStatus, renderRunStatus),
    renderSection('Sessions', data.sessions, renderSessions),
    renderSection('Limits', data.limits, renderLimits),
    renderSection('Approvals', data.approvals, renderApprovals),
  ].join('\n  ');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Deckent</title></head>
<body>
  <h1>Deckent</h1>
  <p class="fetched-at">Fetched: ${escapeHtml(data.fetchedAt)}</p>
  ${sections}
</body>
</html>`;
}
