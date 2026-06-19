// Autonomous v2 — durable mission/work-item model + store/view contracts.
export type MissionKind = 'list' | 'goal';
export type MissionStatus = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
export type MissionRenderAs = 'checklist' | 'goal';

export type WorkItemKind = 'task' | 'sprint' | 'capability' | 'process';
export type WorkItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'parked';
export type WorkItemRenderAs = 'task' | 'sprint' | 'workflow' | 'action';
export type WorkItemPolicy = 'auto' | 'approval-required' | 'risk-tagged';

export interface Progress { done: number; total: number; phase?: string; step?: string; }
export interface ResultLike { ok: boolean; reason?: string; [k: string]: unknown; }

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
  getMission(id: string): Mission | null;
  listMissions(f?: { status?: MissionStatus[]; tenant?: string }): Mission[];
  updateMissionStatus(id: string, status: MissionStatus, result?: ResultLike): void;
  setMissionProgress(id: string, progress: Progress): void;
  enqueueItem(item: NewWorkItem): WorkItem;
  queryDue(opts?: { tenant?: string; limit?: number }): WorkItem[];
  claimItem(id: string, by: string): boolean;
  updateItemStatus(id: string, status: WorkItemStatus, result?: ResultLike): void;
  listItems(missionId: string): WorkItem[];
}
