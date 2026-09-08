// ═══ Structured CLI read projections — parser/model only ═══════════════════
//
// This module deliberately accepts only a complete, digest-verified JSON
// document supplied by the same-session detail reader. It never knows a file
// path, ContentWriter, child process, or rendered broker preview.

import {
  buildSyncAggregate,
  isSyncAggregateSummary,
  type SyncAggregateSummary,
  type SyncCommandOutput,
} from '../helpers/sync-aggregate.js';
import { isAgentSyncConflictKind } from '../../core/agent-sync-conflict.js';
import { isSyncChangeDetectionMode, isSyncChangeDetectionIssueCode } from '../helpers/sync-change-detection.js';

export type ToolReadKind =
  | 'doctor'
  | 'history'
  | 'models'
  | 'model-active-set'
  | 'agents'
  | 'skills'
  | 'sync'
  | 'audit-gate'
  | 'audit-query'
  | 'audit-compliance';
export type ToolReadDataState = 'loading' | 'valid' | 'empty' | 'schema-unknown' | 'partial' | 'unavailable' | 'raw';

export interface ToolReadField {
  readonly key: string;
  readonly value: string;
}

export interface ToolReadRow {
  readonly id: string;
  readonly title: string;
  /** Presentation section resolved by injected caller labels, never prose here. */
  readonly titleKind?: 'authority' | 'summary' | 'capture' | 'execution'
    | 'tsc' | 'vitest' | 'honesty' | 'observability';
  readonly fields: readonly ToolReadField[];
}

export interface ToolReadProjection {
  readonly kind: ToolReadKind;
  readonly state: ToolReadDataState;
  readonly count: number | null;
  readonly rows: readonly ToolReadRow[];
  /** Technical code only; caller maps its explanation through injected labels. */
  readonly reasonCode: string | null;
  readonly execution?: { readonly exitCode: number | null; readonly signal: string | null; readonly reason: string | null; readonly stderr: string | null; readonly stderrReadReason?: string; readonly command?: string };
  readonly observation?: {
    readonly observedAt: string;
    readonly stdoutObservedBytes: number;
    readonly stdoutStoredBytes: number;
    readonly stdoutComplete: boolean;
    readonly stdoutObservedSha256: string;
    readonly stdoutStoredSha256: string | null;
    readonly stderrObservedBytes: number;
    readonly stderrStoredBytes: number;
    readonly stderrComplete: boolean;
    readonly stderrObservedSha256: string;
    readonly stderrStoredSha256: string | null;
  };
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function scalar(value: unknown): string | null {
  if (typeof value === 'string') return safeTerminalText(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}

/**
 * Projection-only terminal sanitization. It never changes captured JSON bytes
 * or their digest; it only makes control and directional code points visible in
 * an Ink text sink.
 */
export function safeTerminalText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, (char) =>
    `\\u${char.codePointAt(0)!.toString(16).padStart(4, '0')}`,
  );
}

function structured(value: unknown): string | null {
  if (value === null) return 'null';
  if (Array.isArray(value) || isRecord(value)) {
    try { return safeTerminalText(JSON.stringify(value)); } catch { return null; }
  }
  return scalar(value);
}

function fieldValue(key: string, value: unknown): ToolReadField | null {
  const text = structured(value);
  return text === null ? null : { key: safeTerminalText(key), value: text };
}

/** Known-schema detail preserves every own field, including explicit null and
 * future additive fields. Preferred order is presentation, not a lossy allowlist.
 * The caller has already admitted a complete bounded JSON document. */
function completeFields(source: UnknownRecord, preferred: readonly string[] = [], excluded: readonly string[] = []): ToolReadField[] {
  const omitted = new Set(excluded);
  const first = new Set(preferred);
  const keys = [
    ...preferred.filter((key) => Object.hasOwn(source, key) && !omitted.has(key)),
    ...Object.keys(source).filter((key) => !first.has(key) && !omitted.has(key)).sort(),
  ];
  return keys.flatMap((key) => { const field = fieldValue(key, source[key]); return field ? [field] : []; });
}

function unknown(kind: ToolReadKind, reasonCode = 'READ_SCHEMA_UNKNOWN'): ToolReadProjection {
  return { kind, state: 'schema-unknown', count: null, rows: [], reasonCode };
}

function rowsProjection(kind: ToolReadKind, rows: readonly ToolReadRow[]): ToolReadProjection {
  return { kind, state: rows.length === 0 ? 'empty' : 'valid', count: rows.length, rows, reasonCode: null };
}

function parseArray(kind: ToolReadKind, value: unknown, map: (entry: UnknownRecord, index: number) => ToolReadRow | null): ToolReadProjection {
  if (!Array.isArray(value)) return unknown(kind);
  const rows: ToolReadRow[] = [];
  for (let index = 0; index < value.length; index++) {
    const entry = value[index];
    if (!isRecord(entry)) return unknown(kind);
    const row = map(entry, index);
    if (row === null) return unknown(kind);
    rows.push(row);
  }
  return rowsProjection(kind, rows);
}

function idOf(value: unknown, fallback: string): string | null {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function producerError(kind: ToolReadKind, value: unknown): ToolReadProjection | null {
  if (!isRecord(value) || typeof value.error !== 'string') return null;
  return {
    kind,
    state: 'raw',
    count: null,
    rows: [{
      id: `${kind}:producer-error`,
      title: '',
      titleKind: 'execution',
      fields: completeFields(value, ['error']),
    }],
    reasonCode: 'READ_PRODUCER_ERROR',
  };
}

function parseDoctor(value: unknown): ToolReadProjection {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || !Array.isArray(value.checks) || !Array.isArray(value.providers) || !Array.isArray(value.providerAuth) || !('honestSummary' in value)) return unknown('doctor');
  const rows: ToolReadRow[] = [];
  for (let index = 0; index < value.checks.length; index++) {
    const check = value.checks[index];
    if (!isRecord(check) || typeof check.name !== 'string' || typeof check.passed !== 'boolean' || typeof check.message !== 'string' || typeof check.required !== 'boolean') return unknown('doctor');
    rows.push({
      id: `doctor:${index}:${check.name}`,
      title: safeTerminalText(check.name),
      fields: completeFields(check, ['passed', 'required', 'message', 'name']),
    });
  }
  for (let index = 0; index < value.providers.length; index++) {
    const provider = value.providers[index];
    if (!isRecord(provider) || typeof provider.name !== 'string') return unknown('doctor');
    rows.push({ id: `doctor:provider:${index}:${provider.name}`, title: safeTerminalText(provider.name), fields: completeFields(provider, ['available', 'reason', 'version', 'name']) });
  }
  for (let index = 0; index < value.providerAuth.length; index++) {
    const auth = value.providerAuth[index];
    if (!isRecord(auth) || typeof auth.provider !== 'string') return unknown('doctor');
    rows.push({ id: `doctor:auth:${index}:${auth.provider}`, title: safeTerminalText(auth.provider), fields: completeFields(auth, ['available', 'state', 'method', 'ready', 'evidence', 'provider']) });
  }
  const summary = fieldValue('honestSummary', value.honestSummary);
  if (summary === null) return unknown('doctor');
  rows.push({ id: 'doctor:summary', title: '', titleKind: 'summary', fields: completeFields(value, ['honestSummary', 'ok', 'providerSummary'], ['checks', 'providers', 'providerAuth']) });
  return rowsProjection('doctor', rows);
}

function parseHistory(value: unknown): ToolReadProjection {
  return parseArray('history', value, (entry, index) => {
    const sprint = idOf(entry.sprint, '');
    const counts = ['tasks', 'completed', 'noGo'];
    const strings = ['techDebt', 'noGoRate', 'successRate', 'coverage', 'duration', 'agents', 'skills', 'tokens', 'calls', 'filesChanged'];
    if (sprint === null || sprint.length === 0 || typeof entry.sprint !== 'string'
      || counts.some((key) => !(entry[key] === '-' || entry[key] === null || (Number.isSafeInteger(entry[key]) && (entry[key] as number) >= 0)))
      || strings.some((key) => typeof entry[key] !== 'string')) return null;
    return { id: `history:${safeTerminalText(sprint)}:${index}`, title: safeTerminalText(sprint), fields: completeFields(entry, ['sprint', 'tasks', 'completed', 'noGo', 'techDebt', 'successRate', 'noGoRate', 'coverage', 'duration', 'filesChanged', 'tokens', 'calls', 'agents', 'skills']) };
  });
}

function parseAgents(value: unknown): ToolReadProjection {
  return parseArray('agents', value, (entry, index) => {
    const id = idOf(entry.id, '');
    const name = scalar(entry.name);
    if (id === null || id.length === 0 || name === null || typeof entry.enabled !== 'boolean' || (entry.validity !== 'valid' && entry.validity !== 'invalid') || !isRecord(entry.routable) || typeof entry.routable.value !== 'boolean' || !Array.isArray(entry.routable.reasons) || !isRecord(entry.provenance) || !isRecord(entry.prompt) || typeof entry.uses !== 'number' || !Number.isFinite(entry.uses) || !(entry.successRate === null || (typeof entry.successRate === 'number' && Number.isFinite(entry.successRate))) || !Array.isArray(entry.diagnostics)) return null;
    return { id: `agent:${safeTerminalText(id)}:${index}`, title: name, fields: completeFields(entry, ['id', 'name', 'enabled', 'validity', 'displayType', 'model', 'uses', 'successRate', 'successes', 'successRatio', 'successPercent', 'lastUsedInSprint', 'routable', 'provenance', 'prompt', 'diagnostics']) };
  });
}

function parseSkills(value: unknown): ToolReadProjection {
  return parseArray('skills', value, (entry, index) => {
    const id = idOf(entry.id, '');
    const name = scalar(entry.name);
    const disposition = entry.disposition;
    if (id === null || id.length === 0 || name === null || typeof entry.category !== 'string'
      || typeof entry.enabled !== 'boolean' || typeof entry.layer !== 'string'
      || !isRecord(disposition) || !['active', 'disabled', 'quarantined', 'retired'].includes(disposition.state as string)
      || ['reasonCode', 'since', 'supersededBy'].some((key) => disposition[key] !== null && typeof disposition[key] !== 'string')
      || typeof entry.masked !== 'boolean'
      || !(entry.profileState === null || typeof entry.profileState === 'string')
      || typeof entry.priority !== 'number' || !Number.isFinite(entry.priority)
      || !Array.isArray(entry.triggers) || entry.triggers.some((trigger) => typeof trigger !== 'string')
      || !(entry.stats === null || isRecord(entry.stats)) || !(entry.exposure === null || isRecord(entry.exposure))) return null;
    return { id: `skill:${safeTerminalText(id)}:${index}`, title: name, fields: completeFields(entry, ['id', 'name', 'category', 'enabled', 'layer', 'disposition', 'masked', 'profileState', 'priority', 'triggers', 'activation', 'routing', 'stats', 'exposure']) };
  });
}

function parseModels(value: unknown): ToolReadProjection {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.kind !== 'model-catalog-list' || typeof value.catalogDigest !== 'string' || typeof value.source !== 'string' || !isRecord(value.filter) || !Array.isArray(value.models) || !Array.isArray(value.warnings) || !Number.isSafeInteger(value.count) || (value.count as number) < 0) return unknown('models');
  const parsed = parseArray('models', value.models, (entry, index) => {
    const id = idOf(entry.id, '');
    const provider = scalar(entry.provider);
    if (id === null || id.length === 0 || provider === null || typeof entry.apiId !== 'string' || typeof entry.tier !== 'string' || typeof entry.status !== 'string' || typeof entry.contextWindow !== 'number' || !Number.isFinite(entry.contextWindow) || !(entry.maxOutputTokens === null || (typeof entry.maxOutputTokens === 'number' && Number.isFinite(entry.maxOutputTokens))) || !isRecord(entry.costPerMillion) || !isRecord(entry.capabilities) || typeof entry.preferredForTier !== 'boolean') return null;
    return { id: `model:${safeTerminalText(provider)}:${safeTerminalText(id)}:${index}`, title: safeTerminalText(id), fields: completeFields(entry, ['id', 'provider', 'apiId', 'tier', 'status', 'contextWindow', 'maxOutputTokens', 'preferredForTier', 'costPerMillion', 'capabilities']) };
  });
  if (parsed.state === 'schema-unknown') return parsed;
  const metadata = completeFields(value, ['source', 'fetchedAt', 'ageMs', 'offline', 'filter', 'count', 'catalogDigest', 'warnings'], ['models']);
  return { ...parsed, count: value.count as number, rows: [{ id: 'models:summary', title: '', titleKind: 'summary', fields: metadata }, ...parsed.rows] };
}

function parseActiveModels(value: unknown): ToolReadProjection {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.kind !== 'model-active-set' || !isRecord(value.authority)) return unknown('model-active-set');
  if (value.authority.state === 'hold') {
    const reasonCode = typeof value.authority.reasonCode === 'string' ? value.authority.reasonCode : 'MODEL_ACTIVATION_AUTHORITY_UNAVAILABLE';
    return { kind: 'model-active-set', state: 'unavailable', count: null, rows: [{ id: 'active:authority', title: '', titleKind: 'authority', fields: [
      ...completeFields(value.authority, ['state', 'reasonCode', 'policySnapshotDigest']),
      ...completeFields(value, [], ['authority']).map((field) => ({ ...field, key: `snapshot.${field.key}` })),
    ] }], reasonCode: safeTerminalText(reasonCode) };
  }
  if (value.authority.state !== 'ready' || !Array.isArray(value.ownerPermittedModels) || !Array.isArray(value.unknownActiveModels) || !isRecord(value.catalog)) return unknown('model-active-set');
  const permitted = parseArray('model-active-set', value.ownerPermittedModels, (entry, index) => {
    const id = idOf(entry.id, '');
    const provider = scalar(entry.provider);
    if (id === null || id.length === 0 || provider === null) return null;
    return { id: `permitted:${safeTerminalText(provider)}:${safeTerminalText(id)}:${index}`, title: safeTerminalText(id), fields: completeFields(entry, ['id', 'provider', 'apiId', 'tier', 'status', 'contextWindow', 'maxOutputTokens', 'costPerMillion', 'capabilities']) };
  });
  if (permitted.state === 'schema-unknown') return permitted;
  const authority = value.authority;
  const metadataKeys = ['policySnapshotDigest', 'defaultMode', 'explicitProviders', 'recordedActivations', 'providerPolicies'];
  const metadata = completeFields(authority, metadataKeys);
  const catalog = value.catalog;
  const catalogKeys = ['source', 'fetchedAt', 'ageMs', 'catalogDigest', 'warnings'];
  metadata.push(...completeFields(catalog, catalogKeys).map((field) => ({ ...field, key: `catalog.${field.key}` })));
  metadata.push(...completeFields(value, [], ['authority', 'catalog', 'ownerPermittedModels', 'unknownActiveModels']).map((field) => ({ ...field, key: `snapshot.${field.key}` })));
  const unknownRows: ToolReadRow[] = [];
  for (let index = 0; index < value.unknownActiveModels.length; index++) {
    const item = value.unknownActiveModels[index];
    if (!isRecord(item) || typeof item.provider !== 'string' || typeof item.modelId !== 'string') return unknown('model-active-set');
    unknownRows.push({ id: `unknown:${safeTerminalText(item.provider)}:${safeTerminalText(item.modelId)}:${index}`, title: safeTerminalText(item.modelId), fields: completeFields(item, ['provider', 'modelId', 'actor', 'updatedAt']) });
  }
  return { kind: 'model-active-set', state: permitted.state, count: permitted.count, rows: [{ id: 'active:metadata', title: '', titleKind: 'authority', fields: metadata }, ...permitted.rows, ...unknownRows], reasonCode: null };
}

const SYNC_REPORT_KEYS = [
  'adaptersSynced',
  'adapterErrors',
  'agentPromptSync',
  'agentManifestSync',
  'agentCapabilitiesSync',
  'skillManifestSync',
  'workspaceSync',
  'gitChanges',
  'warnings',
  'summary',
] as const;

/**
 * `SyncResult.detection.issue` (`src/cli/commands/sync.ts`): either `null`
 * (the mode was established cleanly) or a typed `{ code, detail }` record
 * naming which git step failed.
 */
function validSyncChangeDetectionIssue(value: unknown): boolean {
  return value === null
    || (isRecord(value)
      && isSyncChangeDetectionIssueCode(value.code)
      && typeof value.detail === 'string');
}

/**
 * `SyncResult.detection` (`src/cli/commands/sync.ts`): how the file lists on
 * this same `gitChanges` record were established. Required by every current
 * producer, so a present-but-malformed `detection` is rejected outright — see
 * `validSyncResult` for the separate, deliberate exception that keeps
 * accepting a LEGACY `gitChanges` that omits `detection` entirely.
 */
function validSyncChangeDetection(value: unknown): boolean {
  return isRecord(value)
    && isSyncChangeDetectionMode(value.mode)
    && validSyncChangeDetectionIssue(value.issue)
    // A failure code only ever accompanies 'unavailable' (the producer never
    // pairs a clean mode with an issue) — reject the incoherent combination.
    && (value.issue === null || value.mode === 'unavailable');
}

function validSyncResult(value: unknown): boolean {
  return isRecord(value)
    && isNonNegativeInteger(value.commits)
    && (value.sprintId === null || typeof value.sprintId === 'string')
    && isStringArray(value.modified)
    && isStringArray(value.added)
    && isStringArray(value.deleted)
    && isStringArray(value.renamed)
    // `detection` is required in the current `SyncResult` producer type, but
    // a pre-7104 producer never emitted it — accept that legacy shape (the
    // aggregate then fails closed to `detection: 'unavailable'`, see
    // `buildSyncAggregate`). What is never accepted is a PRESENT `detection`
    // that is malformed: a git failure must never look like "no changes".
    && (value.detection === undefined || validSyncChangeDetection(value.detection));
}

/**
 * `AgentPromptSyncConflict` / `AgentManifestSyncConflict`
 * (`src/core/agent-prompt-sync.ts`, `src/core/agent-manifest-sync.ts`): a
 * single typed keptLocal notice. `kind` is required by the current producer
 * type but a pre-7104 producer never emitted it — accepted as the same
 * deliberate legacy exception `validSyncResult` makes for `detection` above
 * (`buildSyncAggregate` then treats a missing `kind` as the more severe
 * `'local-edit'`, never as a silently-dropped field). Any OTHER `kind` value
 * is rejected outright — this is a closed two-value enum, not a free string.
 */
function validAgentSyncConflict(value: unknown): boolean {
  return isRecord(value)
    && typeof value.agentId === 'string'
    && typeof value.shadowPath === 'string'
    && typeof value.builtinPath === 'string'
    && typeof value.reason === 'string'
    && (value.kind === undefined || isAgentSyncConflictKind(value.kind));
}

/**
 * `AgentPromptSyncReport` / `AgentManifestSyncReport` (`agentPromptSync` /
 * `agentManifestSync`). `isStringArray` requires `Array.isArray`, so an
 * array-like object (e.g. `{ created: { length: 0 } }`) is rejected here —
 * `buildSyncAggregate` only ever reads `.length`, so that forgery would
 * otherwise pass the canonical-`summary` equality gate undetected.
 */
function validAgentSyncReport(value: unknown): boolean {
  return value === undefined
    || (isRecord(value)
      && isStringArray(value.created)
      && isStringArray(value.updated)
      && isStringArray(value.keptLocal)
      && Array.isArray(value.conflicts)
      && value.conflicts.every((entry) => validAgentSyncConflict(entry)));
}

/**
 * `AgentCapabilitiesSyncReport` (`agentCapabilitiesSync`,
 * `src/cli/commands/sync.ts`). `protected` is optional because a legacy
 * producer that predates that field omits it entirely; when present it must
 * be a real string array like every other count-bearing field here.
 */
function validCapabilitiesReport(value: unknown): boolean {
  return value === undefined
    || (isRecord(value)
      && isStringArray(value.migrated)
      && isStringArray(value.alreadyV3)
      && (value.protected === undefined || isStringArray(value.protected))
      && Array.isArray(value.issues)
      && value.issues.every((entry) => isRecord(entry)
        && typeof entry.agentId === 'string'
        && typeof entry.code === 'string'
        && typeof entry.message === 'string'));
}

/**
 * `BuiltinSkillSyncReport` (`skillManifestSync`, `src/core/skill-pool.ts`).
 * `issues` entries are `BuiltinSkillSyncIssue { skillId, reason }` — both
 * required strings; extra fields on an issue record are tolerated.
 */
function validSkillReport(value: unknown): boolean {
  return value === undefined
    || (isRecord(value)
      && isStringArray(value.created)
      && isStringArray(value.updated)
      && isStringArray(value.unchanged)
      && isStringArray(value.keptLocal)
      && Array.isArray(value.issues)
      && value.issues.every((entry) => isRecord(entry)
        && typeof entry.skillId === 'string'
        && typeof entry.reason === 'string'));
}

/**
 * Deterministic JSON serialization used only to compare a claimed `summary`
 * against the aggregate `buildSyncAggregate` derives from the same raw
 * report. Recursively sorts object keys so producer-controlled key order in
 * the parsed `summary` (or the field-declaration order `buildSyncAggregate`
 * happens to use) never causes a spurious mismatch; array element order is
 * preserved because it is semantically meaningful (e.g. `conflicts`,
 * `missingBaseline.agentIds`). Applying this to BOTH sides — never a raw
 * `JSON.stringify` on one side only — is what makes the comparison
 * order-independent instead of merely shifting the ordering assumption.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as UnknownRecord;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseSync(value: unknown): ToolReadProjection {
  const error = producerError('sync', value);
  if (error) return error;
  if (!isRecord(value) || !SYNC_REPORT_KEYS.some((key) => Object.hasOwn(value, key))) return unknown('sync');
  if (value.adaptersSynced !== undefined && !isStringArray(value.adaptersSynced)) return unknown('sync');
  if (value.adapterErrors !== undefined && (!Array.isArray(value.adapterErrors)
    || value.adapterErrors.some((entry) => !isRecord(entry)
      || typeof entry.label !== 'string'
      || typeof entry.file !== 'string'
      || typeof entry.reason !== 'string'))) return unknown('sync');
  if (!validAgentSyncReport(value.agentPromptSync)) return unknown('sync');
  if (!validAgentSyncReport(value.agentManifestSync)) return unknown('sync');
  if (!validCapabilitiesReport(value.agentCapabilitiesSync)) return unknown('sync');
  if (!validSkillReport(value.skillManifestSync)) return unknown('sync');
  if (value.workspaceSync !== undefined && (!isRecord(value.workspaceSync)
    || !isStringArray(value.workspaceSync.changed)
    || !isStringArray(value.workspaceSync.unchanged))) return unknown('sync');
  if (value.gitChanges !== undefined && value.gitChanges !== null && !validSyncResult(value.gitChanges)) return unknown('sync');
  if (value.warnings !== undefined && !isStringArray(value.warnings)) return unknown('sync');

  // A shape-valid `summary` is not enough: it must also be the exact
  // aggregate `buildSyncAggregate` derives from the rest of this same raw
  // report, or a stale/forged/hand-edited summary would render silently
  // alongside raw counts it disagrees with. Fail closed (never partially
  // render) on any shape violation, derivation error, or numeric/field
  // mismatch.
  let verifiedSummary: SyncAggregateSummary | undefined;
  if (value.summary !== undefined) {
    if (!isSyncAggregateSummary(value.summary)) return unknown('sync', 'READ_SCHEMA_UNKNOWN');
    const { summary: _summary, ...rawWithoutSummary } = value;
    let derivedSummary: SyncAggregateSummary;
    try {
      derivedSummary = buildSyncAggregate(rawWithoutSummary as unknown as SyncCommandOutput);
    } catch {
      return unknown('sync', 'READ_SCHEMA_UNKNOWN');
    }
    if (stableStringify(derivedSummary) !== stableStringify(value.summary)) return unknown('sync', 'READ_SCHEMA_UNKNOWN');
    verifiedSummary = value.summary;
  }

  const rows: ToolReadRow[] = [];
  let count: number | null = null;
  if (verifiedSummary !== undefined) {
    const summary = verifiedSummary;
    const fields: ToolReadField[] = [
      { key: 'adapters', value: summary.adapters.errors > 0 ? `${summary.adapters.synced}/${summary.adapters.errors}` : `${summary.adapters.synced}` },
      { key: 'skills', value: `${summary.skills.created + summary.skills.updated}/${summary.skills.unchanged}` },
      { key: 'commits', value: summary.git === null ? '-' : `${summary.git.commits}` },
      { key: 'conflicts', value: `${summary.conflicts.length}` },
      { key: 'missingBaseline', value: `${summary.missingBaseline.count}` },
    ];
    // A truthful `'root-fallback'`/`'unavailable'` detection mode must stay
    // visible on the card — the common `'range'` case adds nothing so the
    // row stays unchanged for it (7104: a git failure must never look like
    // "no changes").
    if (summary.git !== null && summary.git.detection !== 'range') {
      fields.push({ key: 'detection', value: summary.git.detection });
      if (summary.git.issueCode !== null) fields.push({ key: 'detectionIssue', value: summary.git.issueCode });
    }
    if (summary.missingBaseline.count > 0) fields.push({ key: 'missingBaselineAgents', value: summary.missingBaseline.agentIds.join(',') });
    if (summary.conflicts.length > 0) fields.push({ key: 'conflictAgents', value: summary.conflicts.map((entry) => `${entry.scope}:${entry.agentId}`).join(',') });
    rows.push({ id: 'sync:aggregate', title: '', titleKind: 'summary', fields });
    count = summary.conflicts.length;
  }
  rows.push({ id: 'sync:summary', title: '', titleKind: 'summary', fields: completeFields(value, SYNC_REPORT_KEYS, ['summary']) });
  return {
    kind: 'sync',
    state: 'valid',
    count,
    rows,
    reasonCode: null,
  };
}

function validAuditGateSection(value: unknown, status: 'status' | 'violations' | 'metrics'): boolean {
  if (!isRecord(value)) return false;
  if (status === 'status') return value.status === 'PASS' || value.status === 'FAIL';
  if (status === 'violations') return isNonNegativeInteger(value.violations) && isStringArray(value.flaggedTasks);
  return typeof value.metricsJsonlExists === 'boolean' && isNonNegativeInteger(value.lineCount);
}

function validAuditGateDelta(value: unknown): boolean {
  return isRecord(value)
    && ['files', 'pass', 'fail', 'skipped'].every((key) => isSafeInteger(value[key]));
}

function parseAuditGate(value: unknown): ToolReadProjection {
  const error = producerError('audit-gate', value);
  if (error) return error;
  if (!isRecord(value)
    || (value.overallGate !== 'PASS' && value.overallGate !== 'GATE_FAILURE')
    || !validAuditGateSection(value.tsc, 'status')
    || !isRecord(value.tsc) || !isStringArray(value.tsc.errors)
    || !validAuditGateSection(value.vitest, 'status')
    || !isRecord(value.vitest) || !validAuditGateDelta(value.vitest.delta)
    || !validAuditGateSection(value.honesty, 'violations')
    || !validAuditGateSection(value.observability, 'metrics')) return unknown('audit-gate');
  const rows: ToolReadRow[] = [{
    id: 'audit-gate:summary',
    title: '',
    titleKind: 'summary',
    fields: completeFields(value, ['overallGate'], ['tsc', 'vitest', 'honesty', 'observability']),
  }];
  for (const key of ['tsc', 'vitest', 'honesty', 'observability'] as const) {
    rows.push({ id: `audit-gate:${key}`, title: '', titleKind: key, fields: completeFields(value[key] as UnknownRecord) });
  }
  return { kind: 'audit-gate', state: 'valid', count: null, rows, reasonCode: null };
}

function parseAuditQuery(value: unknown): ToolReadProjection {
  const error = producerError('audit-query', value);
  if (error) return error;
  if (!isRecord(value) || typeof value.sprintId !== 'string' || value.sprintId.length === 0
    || !isNonNegativeInteger(value.totalScanned) || !Array.isArray(value.matched)) return unknown('audit-query');
  const rows: ToolReadRow[] = [{
    id: 'audit-query:summary',
    title: '',
    titleKind: 'summary',
    fields: completeFields(value, ['sprintId', 'totalScanned'], ['matched']),
  }];
  for (let index = 0; index < value.matched.length; index++) {
    const entry = value.matched[index];
    if (!isRecord(entry)
      || typeof entry.timestamp !== 'string'
      || !isNonNegativeInteger(entry.sequence)
      || typeof entry.source !== 'string'
      || typeof entry.target !== 'string'
      || typeof entry.channel !== 'string'
      || !(entry.tenantId === undefined || typeof entry.tenantId === 'string')) return unknown('audit-query');
    rows.push({
      id: `audit-query:${safeTerminalText(value.sprintId)}:${entry.sequence}:${index}`,
      title: safeTerminalText(entry.channel),
      fields: completeFields(entry, ['timestamp', 'sequence', 'source', 'target', 'channel', 'tenantId', 'payload']),
    });
  }
  return { kind: 'audit-query', state: 'valid', count: value.matched.length, rows, reasonCode: null };
}

function isControlStatus(value: unknown): value is 'ON' | 'OFF' {
  return value === 'ON' || value === 'OFF';
}

function parseAuditCompliance(value: unknown): ToolReadProjection {
  const error = producerError('audit-compliance', value);
  if (error) return error;
  if (!isRecord(value)
    || !isControlStatus(value.rbacStatus)
    || !isControlStatus(value.tenantIsolationStatus)
    || !isRecord(value.auditChainIntegrity)
    || typeof value.auditChainIntegrity.intact !== 'boolean'
    || !(value.auditChainIntegrity.brokenAt === undefined || isNonNegativeInteger(value.auditChainIntegrity.brokenAt))
    || !isNonNegativeInteger(value.eventCount)
    || !isRecord(value.actorBreakdown)
    || Object.values(value.actorBreakdown).some((count) => !isNonNegativeInteger(count))
    || !isRecord(value.controls)
    || !isControlStatus(value.controls.rbacEnforcement)
    || !isControlStatus(value.controls.tenantIsolation)
    || !isControlStatus(value.controls.auditChainIntact)) return unknown('audit-compliance');
  const rows: ToolReadRow[] = [{
    id: 'audit-compliance:summary',
    title: '',
    titleKind: 'summary',
    fields: completeFields(value, ['rbacStatus', 'tenantIsolationStatus', 'auditChainIntegrity', 'eventCount', 'controls'], ['actorBreakdown']),
  }];
  for (const actor of Object.keys(value.actorBreakdown).sort()) {
    rows.push({
      id: `audit-compliance:actor:${safeTerminalText(actor)}`,
      title: safeTerminalText(actor),
      fields: [{ key: 'count', value: String(value.actorBreakdown[actor]) }],
    });
  }
  return { kind: 'audit-compliance', state: 'valid', count: value.eventCount, rows, reasonCode: null };
}

/** Parse a complete verified JSON document. A parser failure never becomes empty. */
export function parseToolReadJson(kind: ToolReadKind, text: string): ToolReadProjection {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return unknown(kind, 'READ_JSON_INVALID'); }
  switch (kind) {
    case 'doctor': return parseDoctor(value);
    case 'history': return parseHistory(value);
    case 'agents': return parseAgents(value);
    case 'skills': return parseSkills(value);
    case 'models': return parseModels(value);
    case 'model-active-set': return parseActiveModels(value);
    case 'sync': return parseSync(value);
    case 'audit-gate': return parseAuditGate(value);
    case 'audit-query': return parseAuditQuery(value);
    case 'audit-compliance': return parseAuditCompliance(value);
  }
}
