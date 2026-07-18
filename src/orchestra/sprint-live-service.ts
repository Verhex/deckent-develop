// ═══ sprint-live-service — «deckent şu an napıyor?» (588/F1, plan §3) ═══════
//
// The ONE read-model behind the «Köprü» operations center and the
// Worker-Penceresi (plan §2.1/§2.2): live tasks + heartbeats + phase + locks
// folded into a single snapshot, and a per-task detail (task json + .plan +
// .result) for the drill-in. Read-only by construction — this service NEVER
// writes; every parse is tolerant (a torn/garbage file degrades to honest
// absence, never a throw). Sources are the SAME files the terminal's own
// surfaces read (status → sprint-state.json; workers → .tasks/*.hb): one
// truth, another face (ADR-G-011).
//
// 587-deseni: HTTP (`/api/sprint/live`, `/api/sprint/task/:id`) is a thin
// face over these functions; a future CLI/TUI face consumes the same ones.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS_DIR, SPRINT_STATE_FILE } from '../core/constants.js';

const LOCKS_DIR = '.locks';
/** Detail-payload text caps — explicit, mirror N1's honesty rule. */
export const SPRINT_DETAIL_TEXT_CAP = 64_000;

export interface SprintLiveWorker {
  taskId: string;
  /** Task description first line (the card title). */
  title: string;
  /** task.json status (PENDING/EXECUTING/DONE/NO_GO/…). */
  status: string;
  agent?: string;
  model?: string;
  filesWrite: string[];
  /** Latest heartbeat, when the worker process has written one. */
  hb?: {
    status: string;
    currentAction?: string;
    currentFile?: string;
    filesChangedCount?: number;
    sequence?: number;
    ageMs: number;
  };
}

export interface SprintLiveSnapshot {
  sprintId: string | null;
  phase: string | null;
  workers: SprintLiveWorker[];
  locks: Array<{ name: string; ageMs: number }>;
  /** true ⇔ at least one task file is materialized (a sprint lives on disk). */
  active: boolean;
  generatedAt: string;
}

function readJsonTolerant<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? '';
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

/** Fold the live sprint state into ONE snapshot (the «Köprü» read-model). */
export function readSprintLive(root: string, now = Date.now()): SprintLiveSnapshot {
  const tasksDir = join(root, TASKS_DIR);
  const workers: SprintLiveWorker[] = [];
  if (existsSync(tasksDir)) {
    let names: string[] = [];
    try { names = readdirSync(tasksDir); } catch { names = []; }
    for (const name of names) {
      const match = /^task-(.+)\.json$/.exec(name);
      if (!match) continue;
      const taskId = match[1] as string;
      const task = readJsonTolerant<{
        id?: unknown; description?: unknown; status?: unknown;
        agent?: unknown; assignedAgent?: unknown; model?: unknown;
        scope?: { filesWrite?: unknown };
      }>(join(tasksDir, name));
      if (task === null) continue;
      const agent = typeof task.agent === 'string' ? task.agent
        : typeof task.assignedAgent === 'string' ? task.assignedAgent : undefined;
      const worker: SprintLiveWorker = {
        taskId,
        title: firstLine(typeof task.description === 'string' ? task.description : taskId),
        status: typeof task.status === 'string' ? task.status : 'UNKNOWN',
        ...(agent !== undefined ? { agent } : {}),
        ...(typeof task.model === 'string' ? { model: task.model } : {}),
        filesWrite: Array.isArray(task.scope?.filesWrite)
          ? (task.scope.filesWrite as unknown[]).filter((f): f is string => typeof f === 'string')
          : [],
      };
      const hbPath = join(tasksDir, `task-${taskId}.hb`);
      if (existsSync(hbPath)) {
        const hb = readJsonTolerant<{
          status?: unknown; currentAction?: unknown; currentFile?: unknown;
          filesChangedCount?: unknown; sequence?: unknown; timestamp?: unknown;
        }>(hbPath);
        if (hb !== null && typeof hb.status === 'string') {
          let ageMs: number;
          const parsed = typeof hb.timestamp === 'string' ? Date.parse(hb.timestamp) : Number.NaN;
          if (Number.isFinite(parsed)) {
            ageMs = Math.max(0, now - parsed);
          } else {
            try { ageMs = Math.max(0, now - statSync(hbPath).mtimeMs); } catch { ageMs = 0; }
          }
          worker.hb = {
            status: hb.status,
            ...(typeof hb.currentAction === 'string' ? { currentAction: hb.currentAction } : {}),
            ...(typeof hb.currentFile === 'string' ? { currentFile: hb.currentFile } : {}),
            ...(typeof hb.filesChangedCount === 'number' ? { filesChangedCount: hb.filesChangedCount } : {}),
            ...(typeof hb.sequence === 'number' ? { sequence: hb.sequence } : {}),
            ageMs,
          };
        }
      }
      workers.push(worker);
    }
  }
  workers.sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0));

  // Phase — the SAME file `deckent status` reads (one truth, another face).
  // KABUL P9 (canlı-koşuda yakalandı): the file's REAL shape is FLAT
  // ({sprintId, phase, status, startedAt}); the nested {sprint:{id,phase}}
  // variant is read as a fallback so both generations resolve.
  const state = readJsonTolerant<{
    sprintId?: unknown; phase?: unknown;
    sprint?: { id?: unknown; phase?: unknown };
  }>(join(root, SPRINT_STATE_FILE));
  const sprintId = typeof state?.sprintId === 'string' ? state.sprintId
    : typeof state?.sprint?.id === 'string' ? state.sprint.id : null;
  const phase = typeof state?.phase === 'string' ? state.phase
    : typeof state?.sprint?.phase === 'string' ? state.sprint.phase : null;

  const locks: Array<{ name: string; ageMs: number }> = [];
  const locksDir = join(root, LOCKS_DIR);
  if (existsSync(locksDir)) {
    let names: string[] = [];
    try { names = readdirSync(locksDir); } catch { names = []; }
    for (const name of names) {
      try {
        locks.push({ name, ageMs: Math.max(0, now - statSync(join(locksDir, name)).mtimeMs) });
      } catch { /* yarış: kilit okuma sırasında kalktı — dürüstçe atla */ }
    }
  }

  return {
    sprintId,
    phase,
    workers,
    locks,
    active: workers.length > 0,
    generatedAt: new Date(now).toISOString(),
  };
}

// ─── Worker drill-in (plan §2.2 — Görev/Plan/Sonuç sekmeleri) ───────────────

export interface SprintTaskDetail {
  taskId: string;
  /** Raw task.json (tolerant-parsed) — goal/goCriteria/scope render edilir. */
  task: Record<string, unknown> | null;
  /** .plan text (capped, explicit truncation flag). */
  plan: { text: string; truncated: boolean } | null;
  /** .result JSON (tolerant). */
  result: Record<string, unknown> | null;
  hb: SprintLiveWorker['hb'] | null;
}

/** Task-id path-safety — the SAME shape worker-logs enforces before fs access. */
export const SPRINT_TASK_ID_RE = /^[A-Za-z0-9_-]+$/;

export function readSprintTaskDetail(root: string, taskId: string, now = Date.now()): SprintTaskDetail | null {
  if (!SPRINT_TASK_ID_RE.test(taskId)) return null;
  const tasksDir = join(root, TASKS_DIR);
  const taskPath = join(tasksDir, `task-${taskId}.json`);
  if (!existsSync(taskPath)) return null;
  const task = readJsonTolerant<Record<string, unknown>>(taskPath);

  let plan: SprintTaskDetail['plan'] = null;
  const planPath = join(tasksDir, `task-${taskId}.plan`);
  if (existsSync(planPath)) {
    try {
      const raw = readFileSync(planPath, 'utf-8');
      const truncated = raw.length > SPRINT_DETAIL_TEXT_CAP;
      plan = { text: truncated ? raw.slice(0, SPRINT_DETAIL_TEXT_CAP) : raw, truncated };
    } catch { plan = null; }
  }

  const result = existsSync(join(tasksDir, `task-${taskId}.result`))
    ? readJsonTolerant<Record<string, unknown>>(join(tasksDir, `task-${taskId}.result`))
    : null;

  const snapshotWorker = readSprintLive(root, now).workers.find((w) => w.taskId === taskId);
  return { taskId, task, plan, result, hb: snapshotWorker?.hb ?? null };
}
