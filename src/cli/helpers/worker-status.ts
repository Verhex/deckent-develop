// ─── Worker Status Tracker ──────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorkerProgressEntry } from './progress.js';

export interface HeartbeatData {
  workerId: string;
  taskId: string;
  status: string;
  currentFile?: string;
  timestamp: string;
  agentId?: string;
}

const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export class WorkerStatusTracker {
  private readonly staleThresholdMs: number;

  constructor(staleThresholdMs: number = STALE_THRESHOLD_MS) {
    this.staleThresholdMs = staleThresholdMs;
  }

  pollWorkerStatus(tasksDir: string): WorkerProgressEntry[] {
    const entries: WorkerProgressEntry[] = [];

    let files: string[];
    try {
      files = fs.readdirSync(tasksDir);
    } catch {
      return entries;
    }

    const hbFiles = files.filter((f) => f.endsWith('.hb'));
    for (const hbFile of hbFiles) {
      const fullPath = path.join(tasksDir, hbFile);
      const entry = this.parseHeartbeat(fullPath);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  parseHeartbeat(filePath: string): WorkerProgressEntry | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data: HeartbeatData = JSON.parse(raw);
      const isStale = this.isStale(data.timestamp);
      const status = isStale ? 'STALE' : data.status;
      const progressPercent = this.statusToProgress(data.status);

      return {
        taskId: data.taskId,
        workerId: data.workerId,
        agentName: data.agentId ?? 'generic',
        status,
        currentFile: data.currentFile ?? '',
        progressPercent,
      };
    } catch {
      return null;
    }
  }

  isStale(timestamp: string): boolean {
    const age = Date.now() - new Date(timestamp).getTime();
    return age > this.staleThresholdMs;
  }

  statusToProgress(status: string): number {
    switch (status) {
      case 'CODING':
        return 25;
      case 'EXECUTING':
        return 40;
      case 'TESTING':
        return 65;
      case 'DOCUMENTING':
        return 90;
      case 'DONE':
        return 100;
      default:
        return 0;
    }
  }
}
