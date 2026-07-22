// Autonomous v2 — durable mission/work-item model + store/view contracts.
export type MissionKind = 'list' | 'goal';
export type MissionStatus = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
export type MissionRenderAs = 'checklist' | 'goal';

export type WorkItemKind = 'task' | 'sprint' | 'capability' | 'process';
export type WorkItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked' | 'parked';
export type WorkItemRenderAs = 'task' | 'sprint' | 'workflow' | 'action';
export type WorkItemPolicy = 'auto' | 'approval-required' | 'risk-tagged';

export interface Progress { done: number; total: number; phase?: string; step?: string; }
/**
 * Three-way settle outcome for a dispatched work item, layered on top of the binary
 * `ok` used for scheduling: 'done' = clean success, 'debt' = succeeded but the worker
 * honestly self-assessed GO_WITH_TECH_DEBT (still `ok: true` — DEBT is not a failure),
 * 'failed' = NO_GO / thrown / timed-out. Optional: absent on any ResultLike falls back
 * to `ok ? 'done' : 'failed'` (see mission-engine-wire.ts#deriveSettleDetail) — no store
 * migration needed, it round-trips through the existing JSON `last_result` column.
 */
export type SettleDetail = 'done' | 'debt' | 'failed';
export interface ResultLike { ok: boolean; reason?: string; settleDetail?: SettleDetail; [k: string]: unknown; }

export interface Mission {
  id: string; kind: MissionKind; status: MissionStatus; tenant: string;
  title: string; spec: Record<string, unknown> | null;
  createdBy: string | null; deliverTo: string | null; renderAs: MissionRenderAs;
  progress: Progress | null;
  createdAt: string; updatedAt: string; completedAt: string | null;
  lastResult: ResultLike | null;
}
export interface NewMission {
  id: string; kind: MissionKind; tenant?: string; title: string;
  spec?: Record<string, unknown>; createdBy?: string; deliverTo?: string;
  renderAs?: MissionRenderAs; progress?: Progress;
}
export interface WorkItem {
  id: string; missionId: string; kind: WorkItemKind; status: WorkItemStatus;
  spec: Record<string, unknown> | null; policy: WorkItemPolicy; renderAs: WorkItemRenderAs;
  progress: Progress | null; dependsOn: string[]; trigger: Record<string, unknown> | null;
  claimedAt: string | null; claimedBy: string | null;
  createdAt: string; updatedAt: string; lastResult: ResultLike | null;
}
export interface NewWorkItem {
  id: string; missionId: string; kind: WorkItemKind; spec?: Record<string, unknown>;
  policy?: WorkItemPolicy; renderAs?: WorkItemRenderAs; dependsOn?: string[];
  trigger?: Record<string, unknown>;
}
export interface MissionEvent { ts: string; workItemId?: string; type: string; data?: unknown; }

export interface MissionStore {
  migrate(): void;
  recover(): void;
  close(): void;
  createMission(m: NewMission): Mission;
  /** Validate and persist a new mission plus its complete work-item DAG atomically. */
  createMissionWithItems(m: NewMission, items: readonly NewWorkItem[]): Mission;
  getMission(id: string): Mission | null;
  listMissions(f?: { status?: MissionStatus[]; tenant?: string }): Mission[];
  updateMissionStatus(id: string, status: MissionStatus, result?: ResultLike): void;
  setMissionProgress(id: string, progress: Progress): void;
  enqueueItem(item: NewWorkItem): WorkItem;
  /** Fail invalid/cyclic/failed-upstream pending dependency chains durably.
   * Returns mission ids whose item status changed during reconciliation. */
  reconcilePendingDependencies(): string[];
  queryDue(opts?: { tenant?: string; limit?: number }): WorkItem[];
  claimItem(id: string, by: string): boolean;
  updateItemStatus(id: string, status: WorkItemStatus, result?: ResultLike): void;
  listItems(missionId: string): WorkItem[];
}
