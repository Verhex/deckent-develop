import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../../../core/constants.js';
import type {
  MissionStore, Mission, NewMission, MissionStatus, Progress, ResultLike,
  WorkItem, NewWorkItem, NewMissionWorkItem, WorkItemStatus,
  WorkItemApprovalBinding, WorkItemApprovalState, ApprovalDecisionTransition,
} from './mission-types.js';
import type {
  MissionAcceptanceDecisionRecord,
  MissionAcceptanceDecisionV1,
} from './mission-acceptance.js';
import {
  CANONICAL_WORK_ITEM_KINDS,
  assertCanonicalWorkItemKind,
  isCanonicalWorkItemKind,
} from './mission-kind-admission.js';
import {
  assertStoredMissionAcceptanceRecord,
  readGoalAcceptanceContract,
  validateMissionAcceptanceDecision,
} from './mission-acceptance.js';
import {
  validateStoredApprovalDecision,
  validateStoredApprovalRequest,
  type ApprovalDecision,
  type ApprovalRequest,
} from '../../../core/approval-contract.js';

const WORK_ITEM_STATUSES: ReadonlySet<WorkItemStatus> = new Set([
  'pending', 'running', 'done', 'failed', 'blocked', 'parked',
]);
const CANONICAL_KIND_POSITIONAL = CANONICAL_WORK_ITEM_KINDS.map(() => '?').join(',');
const CANONICAL_KIND_NAMED = CANONICAL_WORK_ITEM_KINDS.map((_, index) => `@canonicalKind${index}`).join(',');
const CANONICAL_KIND_BINDINGS = Object.fromEntries(
  CANONICAL_WORK_ITEM_KINDS.map((kind, index) => [`canonicalKind${index}`, kind]),
);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
  tenant TEXT NOT NULL, title TEXT NOT NULL, spec TEXT,
  created_by TEXT, deliver_to TEXT, render_as TEXT NOT NULL, progress TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, last_result TEXT );
CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id), kind TEXT NOT NULL,
  status TEXT NOT NULL, spec TEXT, policy TEXT NOT NULL DEFAULT 'auto', render_as TEXT NOT NULL,
  progress TEXT, depends_on TEXT, trigger TEXT, claimed_at TEXT, claimed_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_result TEXT );
CREATE INDEX IF NOT EXISTS idx_wi_mission_status ON work_items(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_wi_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_m_status_tenant ON missions(status, tenant);
CREATE TABLE IF NOT EXISTS work_item_approvals (
  work_item_id TEXT PRIMARY KEY REFERENCES work_items(id),
  request_id TEXT NOT NULL UNIQUE,
  request_json TEXT NOT NULL,
  publish_state TEXT NOT NULL CHECK(publish_state IN ('outbox','published')),
  decision_state TEXT NOT NULL CHECK(decision_state IN ('pending','allowed','denied','expired','deferred','escalated')),
  decision_json TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT,
  decided_at TEXT,
  updated_at TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_wia_publish ON work_item_approvals(publish_state, created_at);
CREATE INDEX IF NOT EXISTS idx_wia_decision ON work_item_approvals(decision_state, created_at);
CREATE TABLE IF NOT EXISTS mission_acceptance_decisions (
  mission_id TEXT NOT NULL REFERENCES missions(id),
  round INTEGER NOT NULL CHECK(round >= 0),
  contract_digest TEXT NOT NULL,
  decision_digest TEXT NOT NULL,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(mission_id, round),
  UNIQUE(mission_id, decision_digest) );
CREATE INDEX IF NOT EXISTS idx_mad_mission_created ON mission_acceptance_decisions(mission_id, created_at);
`;

/** Durable mission store (SQLite WAL) — the autonomous-v2 single source of truth. */
export class SqliteMissionStore implements MissionStore {
  protected db: DatabaseType;
  constructor(projectRoot: string) {
    const dir = join(projectRoot, DECKENT_DIR, 'autonomous');
    mkdirSync(dir, { recursive: true });
    this.db = new Database(join(dir, 'autonomous.db'));
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
  }
  migrate(): void { this.db.exec(SCHEMA); }
  recover(): void {
    // Classify an unsupported running row before the generic orphan rule can
    // obscure its stronger cause or leave it eligible for a future redrive.
    this.reconcileUnsupportedKinds();
    const result = JSON.stringify({
      ok: false,
      reason: 'RECOVERY_RECONCILIATION_REQUIRED: prior running attempt has no terminal dispatch evidence; automatic redrive refused',
    });
    this.db.prepare(`UPDATE work_items SET status='parked', last_result=@result,
      claimed_at=NULL, claimed_by=NULL, updated_at=@ts WHERE status='running'`)
      .run({ result, ts: this.now() });
  }
  close(): void { this.db.close(); }

  private now(): string { return new Date().toISOString(); }
  private j(v: unknown): string | null { return v === undefined || v === null ? null : JSON.stringify(v); }
  private p<T>(s: unknown): T | null { return typeof s === 'string' && s.length ? JSON.parse(s) as T : null; }
  private canonical(v: unknown): string {
    const normalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(normalize);
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
          .filter(([, nested]) => nested !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, normalize(nested)]));
      }
      return value ?? null;
    };
    return JSON.stringify(normalize(v));
  }

  /**
   * Preserve unsupported persisted rows for forensics while making every
   * non-terminal form durably non-executable. Intake cannot create these rows;
   * this is the legacy/tamper/recovery boundary.
   */
  private reconcileUnsupportedKinds(itemId?: string): string[] {
    const rows = this.db.prepare(`SELECT id, mission_id, kind FROM work_items
      WHERE status IN ('pending','running','parked')${itemId === undefined ? '' : ' AND id=?'}`)
      .all(...(itemId === undefined ? [] : [itemId])) as Array<{
        id: string;
        mission_id: string;
        kind: unknown;
      }>;
    const changedMissions = new Set<string>();
    const update = this.db.prepare(`UPDATE work_items SET status='failed', last_result=@result,
      claimed_at=NULL, claimed_by=NULL, updated_at=@ts
      WHERE id=@id AND status IN ('pending','running','parked') AND kind=@kind`);

    for (const row of rows) {
      if (isCanonicalWorkItemKind(row.kind)) continue;
      const persistedKind = String(row.kind);
      const result = JSON.stringify({
        ok: false,
        reason: `UNKNOWN_KIND: unsupported persisted work-item kind ${JSON.stringify(persistedKind)}`,
        missionAdmission: {
          code: 'UNKNOWN_KIND',
          itemId: row.id,
          persistedKind,
          decision: 'failed-closed',
        },
      });
      const info = update.run({
        id: row.id,
        kind: row.kind,
        result,
        ts: this.now(),
      });
      if (info.changes === 1) changedMissions.add(row.mission_id);
    }
    return [...changedMissions];
  }

  // --- Missions CRUD ---
  private rowToMission = (r: any): Mission => ({
    id: r.id, kind: r.kind, status: r.status, tenant: r.tenant, title: r.title,
    spec: this.p(r.spec), createdBy: r.created_by, deliverTo: r.deliver_to, renderAs: r.render_as,
    progress: this.p<Progress>(r.progress), createdAt: r.created_at, updatedAt: r.updated_at,
    completedAt: r.completed_at, lastResult: this.p<ResultLike>(r.last_result),
  });

  createMission(m: NewMission): Mission {
    const ts = this.now();
    this.db.prepare(`INSERT INTO missions(id,kind,status,tenant,title,spec,created_by,deliver_to,render_as,progress,created_at,updated_at)
      VALUES(@id,@kind,'pending',@tenant,@title,@spec,@createdBy,@deliverTo,@renderAs,@progress,@ts,@ts)`).run({
      id: m.id, kind: m.kind, tenant: m.tenant ?? 'local', title: m.title, spec: this.j(m.spec),
      createdBy: m.createdBy ?? null, deliverTo: m.deliverTo ?? null,
      renderAs: m.renderAs ?? (m.kind === 'list' ? 'checklist' : 'goal'),
      progress: this.j(m.progress), ts,
    });
    return this.getMission(m.id)!;
  }
  createMissionWithItems(m: NewMission, items: readonly NewMissionWorkItem[]): Mission {
    if (!m.id || m.id !== m.id.trim()) {
      throw new Error('MISSION_BATCH_INVALID: mission id must be a non-empty canonical string');
    }
    const normalizedItems = items.map((item): NewMissionWorkItem => {
      if (!item.id || item.id !== item.id.trim()) {
        throw new Error('MISSION_BATCH_INVALID: work-item id must be a non-empty canonical string');
      }
      if (item.missionId !== m.id) {
        throw new Error(`MISSION_BATCH_INVALID: item ${item.id} belongs to foreign mission ${item.missionId}`);
      }
      assertCanonicalWorkItemKind(item.kind, item.id);
      const dependencies = item.dependsOn ?? [];
      if (dependencies.some((id) => !id || id !== id.trim())) {
        throw new Error(`MISSION_BATCH_INVALID: item ${item.id} has a non-canonical dependency id`);
      }
      if (new Set(dependencies).size !== dependencies.length) {
        throw new Error(`MISSION_BATCH_INVALID: item ${item.id} has duplicate dependencies`);
      }
      if (item.initialStatus !== undefined && !WORK_ITEM_STATUSES.has(item.initialStatus)) {
        throw new Error(`MISSION_BATCH_INVALID: item ${item.id} has invalid initial status`);
      }
      if (item.initialResult !== undefined && (
        item.initialStatus === undefined
        || item.initialResult === null
        || typeof item.initialResult !== 'object'
        || typeof item.initialResult.ok !== 'boolean'
      )) {
        throw new Error(`MISSION_BATCH_INVALID: item ${item.id} has invalid initial result`);
      }
      return { ...item, dependsOn: [...dependencies].sort() };
    });
    const ids = new Set<string>();
    for (const item of normalizedItems) {
      if (ids.has(item.id)) throw new Error(`MISSION_BATCH_INVALID: duplicate work-item id ${item.id}`);
      ids.add(item.id);
    }
    for (const item of normalizedItems) {
      if (item.dependsOn?.includes(item.id)) {
        throw new Error(`MISSION_BATCH_INVALID: self dependency ${item.id}`);
      }
      const missing = item.dependsOn?.filter((id) => !ids.has(id)) ?? [];
      if (missing.length > 0) {
        throw new Error(`MISSION_BATCH_INVALID: item ${item.id} depends on missing or foreign item ${missing.join(', ')}`);
      }
    }

    const byId = new Map(normalizedItems.map((item) => [item.id, item]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        const cycleStart = stack.lastIndexOf(id);
        throw new Error(`MISSION_BATCH_INVALID: dependency cycle ${stack.slice(cycleStart).concat(id).join(' -> ')}`);
      }
      visiting.add(id);
      stack.push(id);
      for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
      stack.pop();
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of ids) visit(id);

    const transaction = this.db.transaction((): Mission => {
      const existing = this.getMission(m.id);
      if (existing) {
        if (normalizedItems.some((item) => item.initialStatus !== undefined || item.initialResult !== undefined)) {
          throw new Error(`MISSION_BATCH_CONFLICT: mission ${m.id} import/recovery state requires external replay provenance`);
        }
        const expectedMission = {
          id: m.id,
          kind: m.kind,
          tenant: m.tenant ?? 'local',
          title: m.title,
          spec: m.spec ?? null,
          createdBy: m.createdBy ?? null,
          deliverTo: m.deliverTo ?? null,
          renderAs: m.renderAs ?? (m.kind === 'list' ? 'checklist' : 'goal'),
          progress: m.progress ?? null,
        };
        const actualMission = {
          id: existing.id,
          kind: existing.kind,
          tenant: existing.tenant,
          title: existing.title,
          spec: existing.spec,
          createdBy: existing.createdBy,
          deliverTo: existing.deliverTo,
          renderAs: existing.renderAs,
          progress: existing.progress,
        };
        const actualItems = this.listItems(m.id).map((item) => ({
          id: item.id,
          missionId: item.missionId,
          kind: item.kind,
          spec: item.spec,
          policy: item.policy,
          renderAs: item.renderAs,
          dependsOn: [...item.dependsOn].sort(),
          trigger: item.trigger,
        })).sort((a, b) => a.id.localeCompare(b.id));
        const expectedItems = normalizedItems.map((item) => ({
          id: item.id,
          missionId: item.missionId,
          kind: item.kind,
          spec: item.spec ?? null,
          policy: item.policy ?? 'auto',
          renderAs: item.renderAs ?? this.defaultRenderAs(item.kind),
          dependsOn: item.dependsOn ?? [],
          trigger: item.trigger ?? null,
        })).sort((a, b) => a.id.localeCompare(b.id));
        if (
          this.canonical(actualMission) === this.canonical(expectedMission)
          && this.canonical(actualItems) === this.canonical(expectedItems)
        ) return existing;
        throw new Error(`MISSION_BATCH_CONFLICT: mission ${m.id} already exists with different creation data`);
      }

      const mission = this.createMission(m);
      const insert = this.db.prepare(`INSERT INTO work_items(id,mission_id,kind,status,spec,policy,render_as,depends_on,trigger,created_at,updated_at,last_result)
        VALUES(@id,@missionId,@kind,@status,@spec,@policy,@renderAs,@dependsOn,@trigger,@ts,@ts,@lastResult)`);
      for (const item of normalizedItems) {
        const ts = this.now();
        insert.run({
          id: item.id,
          missionId: item.missionId,
          kind: item.kind,
          status: item.initialStatus ?? 'pending',
          spec: this.j(item.spec),
          policy: item.policy ?? 'auto',
          renderAs: item.renderAs ?? this.defaultRenderAs(item.kind),
          dependsOn: this.j(item.dependsOn ?? []),
          trigger: this.j(item.trigger ?? null),
          lastResult: this.j(item.initialResult),
          ts,
        });
      }
      return mission;
    });
    try {
      return transaction.immediate();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('MISSION_BATCH_')) throw error;
      throw new Error(`MISSION_BATCH_CONFLICT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  getMission(id: string): Mission | null {
    const r = this.db.prepare('SELECT * FROM missions WHERE id=?').get(id);
    return r ? this.rowToMission(r) : null;
  }
  listMissions(f?: { status?: MissionStatus[]; tenant?: string }): Mission[] {
    const where: string[] = []; const args: unknown[] = [];
    if (f?.status?.length) { where.push(`status IN (${f.status.map(() => '?').join(',')})`); args.push(...f.status); }
    if (f?.tenant) { where.push('tenant=?'); args.push(f.tenant); }
    const sql = `SELECT * FROM missions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at`;
    return (this.db.prepare(sql).all(...args) as any[]).map(this.rowToMission);
  }
  updateMissionStatus(id: string, status: MissionStatus, result?: ResultLike): void {
    const ts = this.now();
    const completedAt = status === 'completed' || status === 'failed' || status === 'cancelled' ? ts : null;
    this.db.prepare(`UPDATE missions SET status=@status, updated_at=@ts,
      completed_at=@completedAt, last_result=COALESCE(@result, last_result) WHERE id=@id`)
      .run({ id, status, ts, completedAt, result: result ? JSON.stringify(result) : null });
  }
  setMissionProgress(id: string, progress: Progress): void {
    this.db.prepare('UPDATE missions SET progress=?, updated_at=? WHERE id=?').run(JSON.stringify(progress), this.now(), id);
  }

  recordAcceptanceDecision(decision: MissionAcceptanceDecisionV1): MissionAcceptanceDecisionRecord {
    const transaction = this.db.transaction((): MissionAcceptanceDecisionRecord => {
      const mission = this.getMission(decision.missionId);
      if (!mission) throw new Error(`MISSION_ACCEPTANCE_INVALID: mission not found ${decision.missionId}`);
      if (mission.kind !== 'goal') throw new Error(`MISSION_ACCEPTANCE_INVALID: mission ${decision.missionId} is not a goal`);
      const contract = readGoalAcceptanceContract(mission);
      if (!contract) throw new Error(`MISSION_ACCEPTANCE_INVALID: mission ${decision.missionId} has no v1 contract`);

      const existing = this.db.prepare(
        'SELECT * FROM mission_acceptance_decisions WHERE mission_id=? AND round=?',
      ).get(decision.missionId, decision.round) as Record<string, unknown> | undefined;
      if (existing) {
        const record = assertStoredMissionAcceptanceRecord(this.p(existing['record_json']));
        if (existing['contract_digest'] !== contract.digest
          || existing['decision_digest'] !== decision.decisionDigest
          || this.canonical(record.decision) !== this.canonical(decision)) {
          throw new Error(`MISSION_ACCEPTANCE_CONFLICT: mission ${decision.missionId} round ${decision.round}`);
        }
        return record;
      }

      const items = this.listItems(decision.missionId);
      const validationErrors = validateMissionAcceptanceDecision(
        decision,
        decision.missionId,
        contract,
        decision.round,
        items,
      );
      const effectiveOutcome = validationErrors.length === 0 ? decision.outcome : 'unknown';
      const record: MissionAcceptanceDecisionRecord = {
        decision,
        validationErrors,
        effectiveOutcome,
        createdAt: decision.decidedAt,
      };
      this.db.prepare(`INSERT INTO mission_acceptance_decisions(
        mission_id,round,contract_digest,decision_digest,record_json,created_at
      ) VALUES(@missionId,@round,@contractDigest,@decisionDigest,@recordJson,@createdAt)`).run({
        missionId: decision.missionId,
        round: decision.round,
        contractDigest: contract.digest,
        decisionDigest: decision.decisionDigest,
        recordJson: JSON.stringify(record),
        createdAt: record.createdAt,
      });

      const accepted = effectiveOutcome === 'accepted';
      const reason = accepted
        ? 'goal acceptance criteria met'
        : validationErrors.length > 0
          ? `GOAL_ACCEPTANCE_EVIDENCE_INVALID: ${validationErrors.join('; ')}`
          : 'goal not reached, acceptance criteria rejected';
      const result: ResultLike = {
        ok: accepted,
        reason,
        acceptanceDecision: decision,
        acceptanceValidationErrors: validationErrors,
      };
      const ts = this.now();
      this.db.prepare(`UPDATE missions SET status=@status, updated_at=@ts,
        completed_at=COALESCE(completed_at,@ts), last_result=@result WHERE id=@id`).run({
        id: decision.missionId,
        status: accepted ? 'completed' : 'failed',
        ts,
        result: JSON.stringify(result),
      });
      return record;
    });
    try {
      return transaction.immediate();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('MISSION_ACCEPTANCE_')) throw error;
      throw new Error(`MISSION_ACCEPTANCE_CONFLICT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  listAcceptanceDecisions(missionId: string): MissionAcceptanceDecisionRecord[] {
    const mission = this.getMission(missionId);
    if (!mission) throw new Error(`MISSION_ACCEPTANCE_INVALID: mission not found ${missionId}`);
    const contract = readGoalAcceptanceContract(mission);
    if (!contract) throw new Error(`MISSION_ACCEPTANCE_INVALID: mission ${missionId} has no v1 contract`);
    const items = this.listItems(missionId);
    const rows = this.db.prepare(
      'SELECT * FROM mission_acceptance_decisions WHERE mission_id=? ORDER BY round',
    ).all(missionId) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const record = assertStoredMissionAcceptanceRecord(this.p(row['record_json']));
      if (row['contract_digest'] !== record.decision.contractDigest
        || row['decision_digest'] !== record.decision.decisionDigest) {
        throw new Error(`MISSION_ACCEPTANCE_CORRUPT: row mismatch ${missionId}`);
      }
      const validationErrors = validateMissionAcceptanceDecision(
        record.decision,
        missionId,
        contract,
        record.decision.round,
        items,
      );
      const effectiveOutcome = validationErrors.length === 0 ? record.decision.outcome : 'unknown';
      if (this.canonical(validationErrors) !== this.canonical(record.validationErrors)
        || effectiveOutcome !== record.effectiveOutcome) {
        throw new Error(`MISSION_ACCEPTANCE_CORRUPT: validation mismatch ${missionId}`);
      }
      return record;
    });
  }

  // --- Work-items + atomic claim ---
  private rowToItem = (r: any): WorkItem => ({
    id: r.id, missionId: r.mission_id, kind: r.kind, status: r.status, spec: this.p(r.spec),
    policy: r.policy, renderAs: r.render_as, progress: this.p<Progress>(r.progress),
    dependsOn: this.p<string[]>(r.depends_on) ?? [], trigger: this.p(r.trigger),
    claimedAt: r.claimed_at, claimedBy: r.claimed_by, createdAt: r.created_at, updatedAt: r.updated_at,
    lastResult: this.p<ResultLike>(r.last_result),
  });
  private rowToApprovalBinding = (r: any): WorkItemApprovalBinding => {
    const request = validateStoredApprovalRequest(this.p<unknown>(r.request_json));
    if (!request.ok || request.value.id !== r.request_id) {
      throw new Error(`MISSION_APPROVAL_CORRUPT: invalid request binding ${String(r.request_id)}`);
    }
    const rawDecision = this.p<unknown>(r.decision_json);
    const decision = rawDecision === null ? null : validateStoredApprovalDecision(rawDecision);
    if (decision !== null && (!decision.ok || decision.value.requestId !== r.request_id)) {
      throw new Error(`MISSION_APPROVAL_CORRUPT: invalid decision binding ${String(r.request_id)}`);
    }
    return {
      workItemId: r.work_item_id,
      missionId: r.mission_id,
      requestId: r.request_id,
      request: request.value,
      publishState: r.publish_state,
      decisionState: r.decision_state,
      decision: decision?.value ?? null,
      createdAt: r.created_at,
      publishedAt: r.published_at,
      decidedAt: r.decided_at,
      updatedAt: r.updated_at,
    };
  };
  private defaultRenderAs(kind: NewWorkItem['kind']): WorkItem['renderAs'] {
    return kind === 'sprint' ? 'sprint' : kind === 'process' ? 'workflow' : kind === 'capability' ? 'action' : 'task';
  }

  enqueueItem(item: NewWorkItem): WorkItem {
    assertCanonicalWorkItemKind(item.kind, item.id);
    const ts = this.now();
    this.db.prepare(`INSERT INTO work_items(id,mission_id,kind,status,spec,policy,render_as,depends_on,trigger,created_at,updated_at)
      VALUES(@id,@missionId,@kind,'pending',@spec,@policy,@renderAs,@dependsOn,@trigger,@ts,@ts)
      ON CONFLICT(id) DO NOTHING`).run({
      id: item.id, missionId: item.missionId, kind: item.kind, spec: this.j(item.spec),
      policy: item.policy ?? 'auto', renderAs: item.renderAs ?? this.defaultRenderAs(item.kind),
      dependsOn: this.j(item.dependsOn ?? []), trigger: this.j(item.trigger ?? null), ts,
    });
    return this.rowToItem(this.db.prepare('SELECT * FROM work_items WHERE id=?').get(item.id));
  }
  listApprovalCandidates(): WorkItem[] {
    this.reconcileUnsupportedKinds();
    const sql = `SELECT wi.* FROM work_items wi JOIN missions m ON m.id=wi.mission_id
      LEFT JOIN work_item_approvals approval ON approval.work_item_id=wi.id
      WHERE wi.status='pending'
        AND wi.kind IN (${CANONICAL_KIND_POSITIONAL})
        AND wi.policy IN ('approval-required','risk-tagged')
        AND m.status IN ('pending','active')
        AND approval.work_item_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM json_each(COALESCE(wi.depends_on, '[]')) dep
          LEFT JOIN work_items upstream ON upstream.id=dep.value AND upstream.mission_id=wi.mission_id
          WHERE upstream.id IS NULL OR upstream.status<>'done'
        )
      ORDER BY wi.created_at`;
    return (this.db.prepare(sql).all(...CANONICAL_WORK_ITEM_KINDS) as any[]).map(this.rowToItem);
  }
  parkInvalidApprovalCandidate(itemId: string, reason: string): boolean {
    this.reconcileUnsupportedKinds(itemId);
    const result = JSON.stringify({ ok: false, reason: `APPROVAL_REQUEST_INVALID: ${reason}` });
    const info = this.db.prepare(`UPDATE work_items AS target SET status='parked', last_result=@result,
      claimed_at=NULL, claimed_by=NULL, updated_at=@ts
      WHERE id=@id AND status='pending' AND policy IN ('approval-required','risk-tagged')
        AND EXISTS (
          SELECT 1 FROM missions mission
          WHERE mission.id=target.mission_id AND mission.status IN ('pending','active')
        )
        AND NOT EXISTS (
          SELECT 1 FROM json_each(COALESCE(target.depends_on, '[]')) dep
          LEFT JOIN work_items upstream ON upstream.id=dep.value AND upstream.mission_id=target.mission_id
          WHERE upstream.id IS NULL OR upstream.status<>'done'
        )`)
      .run({ id: itemId, result, ts: this.now() });
    return info.changes === 1;
  }
  parkItemForApproval(itemId: string, request: ApprovalRequest): WorkItemApprovalBinding | null {
    this.reconcileUnsupportedKinds(itemId);
    const transaction = this.db.transaction((): WorkItemApprovalBinding | null => {
      const existing = this.db.prepare(`SELECT approval.*, wi.mission_id FROM work_item_approvals approval
        JOIN work_items wi ON wi.id=approval.work_item_id WHERE approval.work_item_id=?`).get(itemId);
      if (existing) {
        const binding = this.rowToApprovalBinding(existing);
        if (binding.requestId !== request.id) {
          throw new Error(`MISSION_APPROVAL_CONFLICT: item ${itemId} already bound to ${binding.requestId}`);
        }
        return binding;
      }

      const ts = this.now();
      const parked = this.db.prepare(`UPDATE work_items AS target
        SET status='parked', claimed_at=NULL, claimed_by=NULL, updated_at=@ts
        WHERE id=@id AND status='pending'
          AND policy IN ('approval-required','risk-tagged')
          AND EXISTS (
            SELECT 1 FROM missions mission
            WHERE mission.id=target.mission_id AND mission.status IN ('pending','active')
          )
          AND NOT EXISTS (
            SELECT 1 FROM json_each(COALESCE(target.depends_on, '[]')) dep
            LEFT JOIN work_items upstream ON upstream.id=dep.value AND upstream.mission_id=target.mission_id
            WHERE upstream.id IS NULL OR upstream.status<>'done'
          )`).run({ id: itemId, ts });
      if (parked.changes !== 1) return null;

      this.db.prepare(`INSERT INTO work_item_approvals(
        work_item_id,request_id,request_json,publish_state,decision_state,created_at,updated_at
      ) VALUES(@workItemId,@requestId,@requestJson,'outbox','pending',@ts,@ts)`).run({
        workItemId: itemId,
        requestId: request.id,
        requestJson: JSON.stringify(request),
        ts,
      });
      const row = this.db.prepare(`SELECT approval.*, wi.mission_id FROM work_item_approvals approval
        JOIN work_items wi ON wi.id=approval.work_item_id WHERE approval.work_item_id=?`).get(itemId);
      return this.rowToApprovalBinding(row);
    });
    try {
      return transaction.immediate();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('MISSION_APPROVAL_')) throw error;
      throw new Error(`MISSION_APPROVAL_CONFLICT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  listApprovalBindings(): WorkItemApprovalBinding[] {
    const rows = this.db.prepare(`SELECT approval.*, wi.mission_id FROM work_item_approvals approval
      JOIN work_items wi ON wi.id=approval.work_item_id ORDER BY approval.created_at`).all() as any[];
    return rows.map(this.rowToApprovalBinding);
  }
  markApprovalPublished(requestId: string): void {
    this.db.prepare(`UPDATE work_item_approvals SET publish_state='published',
      published_at=COALESCE(published_at,@ts), updated_at=@ts WHERE request_id=@requestId`)
      .run({ requestId, ts: this.now() });
  }
  applyApprovalDecision(
    requestId: string,
    state: Exclude<WorkItemApprovalState, 'pending'>,
    decision: ApprovalDecision,
  ): ApprovalDecisionTransition | null {
    const semanticallyValid = decision.requestId === requestId && (
      (state === 'allowed' && decision.decision === 'allow' && decision.channel !== 'ttl-expire')
      || (state === 'denied' && decision.decision === 'deny' && decision.channel !== 'ttl-expire')
      || (state === 'expired' && decision.channel === 'ttl-expire')
      || (state === 'deferred' && decision.decision === 'defer' && decision.channel !== 'ttl-expire')
      || (state === 'escalated' && decision.decision === 'escalate' && decision.channel !== 'ttl-expire')
    );
    if (!semanticallyValid) {
      throw new Error(`MISSION_APPROVAL_DECISION_INVALID: ${requestId} cannot transition to ${state}`);
    }
    const transaction = this.db.transaction((): ApprovalDecisionTransition | null => {
      const row = this.db.prepare(`SELECT approval.*, wi.mission_id FROM work_item_approvals approval
        JOIN work_items wi ON wi.id=approval.work_item_id WHERE approval.request_id=?`).get(requestId);
      if (!row) return null;
      const binding = this.rowToApprovalBinding(row);
      if (binding.decisionState !== 'pending') {
        if (binding.decisionState !== state || this.canonical(binding.decision) !== this.canonical(decision)) {
          throw new Error(`MISSION_APPROVAL_DECISION_CONFLICT: request ${requestId} already settled as ${binding.decisionState}`);
        }
        return { missionId: binding.missionId, workItemId: binding.workItemId, changed: false };
      }

      const ts = this.now();
      const blocked = state === 'denied' || state === 'expired';
      const targetStatus = state === 'allowed' ? 'pending' : blocked ? 'blocked' : 'parked';
      const result = blocked
        ? JSON.stringify({ ok: false, reason: `APPROVAL_${state.toUpperCase()}: ${requestId}`, approvalDecision: decision })
        : null;
      this.db.prepare(`UPDATE work_items SET status=@status,
        last_result=COALESCE(@result,last_result), claimed_at=NULL, claimed_by=NULL, updated_at=@ts
        WHERE id=@workItemId AND status IN ('parked','pending')`).run({
        status: targetStatus,
        result,
        ts,
        workItemId: binding.workItemId,
      });
      this.db.prepare(`UPDATE work_item_approvals SET decision_state=@state,
        decision_json=@decision, decided_at=@decidedAt, updated_at=@ts WHERE request_id=@requestId`).run({
        state,
        decision: JSON.stringify(decision),
        decidedAt: decision.decidedAt,
        ts,
        requestId,
      });
      return { missionId: binding.missionId, workItemId: binding.workItemId, changed: true };
    });
    return transaction.immediate();
  }
  reconcilePendingDependencies(): string[] {
    this.reconcileUnsupportedKinds();
    const transaction = this.db.transaction((): string[] => {
      const changedMissions = new Set<string>();
      const missionRows = this.db.prepare(
        "SELECT DISTINCT mission_id FROM work_items WHERE status='pending' ORDER BY mission_id",
      ).all() as Array<{ mission_id: string }>;

      for (const { mission_id: missionId } of missionRows) {
        const items = (this.db.prepare('SELECT * FROM work_items WHERE mission_id=? ORDER BY created_at')
          .all(missionId) as any[]).map(this.rowToItem);
        const byId = new Map(items.map((item) => [item.id, item]));
        const pendingIds = new Set(items.filter((item) => item.status === 'pending').map((item) => item.id));
        const failures = new Map<string, { status: 'failed' | 'blocked'; reason: string }>();

        for (const id of pendingIds) {
          const item = byId.get(id)!;
          const missing = item.dependsOn.filter((dependencyId) => !byId.has(dependencyId));
          if (missing.length > 0) {
            failures.set(id, { status: 'failed', reason: `DEPENDENCY_NOT_FOUND: ${missing.sort().join(', ')}` });
          }
        }

        // Detect every cycle among still-pending nodes. Forward references are
        // valid once present; only a back-edge in the mission-local graph fails.
        const visitState = new Map<string, 'visiting' | 'visited'>();
        const stack: string[] = [];
        const cycleIds = new Set<string>();
        const visit = (id: string): void => {
          const state = visitState.get(id);
          if (state === 'visited') return;
          if (state === 'visiting') {
            const start = stack.lastIndexOf(id);
            for (const cycleId of stack.slice(start)) cycleIds.add(cycleId);
            return;
          }
          visitState.set(id, 'visiting');
          stack.push(id);
          for (const dependencyId of byId.get(id)?.dependsOn ?? []) {
            if (pendingIds.has(dependencyId)) visit(dependencyId);
          }
          stack.pop();
          visitState.set(id, 'visited');
        };
        for (const id of pendingIds) visit(id);
        if (cycleIds.size > 0) {
          const cycle = [...cycleIds].sort().join(', ');
          for (const id of cycleIds) failures.set(id, { status: 'failed', reason: `DEPENDENCY_CYCLE: ${cycle}` });
        }

        // Propagate direct and transitive upstream failure in-memory before one
        // durable write pass, so A→B→C fails fully in the same reconciliation.
        let added = true;
        while (added) {
          added = false;
          for (const id of pendingIds) {
            if (failures.has(id)) continue;
            const failedDependency = byId.get(id)!.dependsOn.find((dependencyId) => {
              const dependency = byId.get(dependencyId);
              return dependency?.status === 'failed' || dependency?.status === 'blocked' || failures.has(dependencyId);
            });
            if (failedDependency) {
              failures.set(id, { status: 'blocked', reason: `DEPENDENCY_FAILED: ${failedDependency}` });
              added = true;
            }
          }
        }

        for (const [id, failure] of failures) {
          const { status, reason } = failure;
          const result = JSON.stringify({ ok: false, reason });
          const info = this.db.prepare(`UPDATE work_items SET status=@status, last_result=@result,
            claimed_at=NULL, claimed_by=NULL, updated_at=@ts WHERE id=@id AND status='pending'`)
            .run({ id, status, result, ts: this.now() });
          if (info.changes === 1) changedMissions.add(missionId);
        }
      }
      return [...changedMissions];
    });
    return transaction.immediate();
  }
  queryDue(opts?: { tenant?: string; limit?: number }): WorkItem[] {
    this.reconcileUnsupportedKinds();
    // Only mission-local dependency-success items are eligible. Missing,
    // failed, running, parked or pending dependencies keep the item out.
    const args: unknown[] = [...CANONICAL_WORK_ITEM_KINDS];
    let sql = `SELECT wi.* FROM work_items wi JOIN missions m ON m.id = wi.mission_id
      WHERE wi.status='pending' AND m.status IN ('pending','active')
      AND wi.kind IN (${CANONICAL_KIND_POSITIONAL})
      AND (
        wi.policy='auto' OR (
          wi.policy IN ('approval-required','risk-tagged') AND EXISTS (
            SELECT 1 FROM work_item_approvals approval
            WHERE approval.work_item_id=wi.id AND approval.decision_state='allowed'
          )
        )
      ) AND NOT EXISTS (
        SELECT 1 FROM json_each(COALESCE(wi.depends_on, '[]')) dep
        LEFT JOIN work_items upstream ON upstream.id=dep.value AND upstream.mission_id=wi.mission_id
        WHERE upstream.id IS NULL OR upstream.status<>'done'
      )`;
    if (opts?.tenant) { sql += ' AND m.tenant=?'; args.push(opts.tenant); }
    sql += ' ORDER BY wi.created_at';
    if (opts?.limit && opts.limit > 0) { sql += ' LIMIT ?'; args.push(opts.limit); }
    return (this.db.prepare(sql).all(...args) as any[]).map(this.rowToItem);
  }
  claimItem(id: string, by: string): boolean {
    const transaction = this.db.transaction((): boolean => {
      this.reconcileUnsupportedKinds(id);
      const info = this.db.prepare(`UPDATE work_items AS target
        SET status='running', claimed_at=@ts, claimed_by=@by, updated_at=@ts
        WHERE id=@id AND status='pending'
        AND target.kind IN (${CANONICAL_KIND_NAMED}) AND EXISTS (
          SELECT 1 FROM missions mission
          WHERE mission.id=target.mission_id AND mission.status IN ('pending','active')
        ) AND (
          target.policy='auto' OR (
            target.policy IN ('approval-required','risk-tagged') AND EXISTS (
              SELECT 1 FROM work_item_approvals approval
              WHERE approval.work_item_id=target.id AND approval.decision_state='allowed'
            )
          )
        ) AND NOT EXISTS (
          SELECT 1 FROM json_each(COALESCE(target.depends_on, '[]')) dep
          LEFT JOIN work_items upstream ON upstream.id=dep.value AND upstream.mission_id=target.mission_id
          WHERE upstream.id IS NULL OR upstream.status<>'done'
        )`).run({ ...CANONICAL_KIND_BINDINGS, id, by, ts: this.now() });
      return info.changes === 1;
    });
    return transaction.immediate();
  }
  updateItemStatus(id: string, status: WorkItemStatus, result?: ResultLike): void {
    this.db.prepare('UPDATE work_items SET status=?, last_result=COALESCE(?, last_result), updated_at=? WHERE id=?')
      .run(status, result ? JSON.stringify(result) : null, this.now(), id);
  }
  listItems(missionId: string): WorkItem[] {
    return (this.db.prepare('SELECT * FROM work_items WHERE mission_id=? ORDER BY created_at').all(missionId) as any[]).map(this.rowToItem);
  }

  // Test-only raw helpers (prefixed __ — not part of the public MissionStore surface).
  __rawTableNames(): string[] {
    return (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
  }
  __rawExec(sql: string): void { this.db.exec(sql); }
  __rawGet(sql: string): any { return this.db.prepare(sql).get(); }
}
