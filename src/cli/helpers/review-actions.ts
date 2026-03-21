// ─── Review Actions ─────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';

export type ReviewDecision = 'approved' | 'rejected' | 'retry' | 'pending';

export interface ReviewEntry {
  taskId: string;
  decision: ReviewDecision;
  reason?: string;
  reviewedAt?: string;
}

export interface ReviewState {
  sprintId: string;
  entries: ReviewEntry[];
  createdAt: string;
  updatedAt: string;
}

export class ReviewActions {
  private tasksDir: string;

  constructor(tasksDir: string) {
    this.tasksDir = tasksDir;
  }

  approveTask(taskId: string, sprintId: string): void {
    const state = this.loadState(sprintId);
    this.setDecision(state, taskId, 'approved');
    this.saveState(state);
  }

  rejectTask(taskId: string, sprintId: string, reason?: string): void {
    const state = this.loadState(sprintId);
    this.setDecision(state, taskId, 'rejected', reason);
    this.saveState(state);
  }

  retryTask(taskId: string, sprintId: string, reason?: string): void {
    const state = this.loadState(sprintId);
    this.setDecision(state, taskId, 'retry', reason);
    this.saveState(state);
  }

  getReviewStatus(taskId: string, sprintId: string): ReviewEntry | null {
    const state = this.loadState(sprintId);
    return state.entries.find((e) => e.taskId === taskId) ?? null;
  }

  getAllReviewStatuses(sprintId: string): Map<string, ReviewDecision> {
    const state = this.loadState(sprintId);
    const result = new Map<string, ReviewDecision>();
    for (const entry of state.entries) {
      result.set(entry.taskId, entry.decision);
    }
    return result;
  }

  isReviewComplete(sprintId: string): boolean {
    const state = this.loadState(sprintId);
    return state.entries.length > 0 && state.entries.every((e) => e.decision !== 'pending');
  }

  private setDecision(state: ReviewState, taskId: string, decision: ReviewDecision, reason?: string): void {
    const existing = state.entries.find((e) => e.taskId === taskId);
    if (existing) {
      existing.decision = decision;
      existing.reason = reason;
      existing.reviewedAt = new Date().toISOString();
    } else {
      state.entries.push({
        taskId,
        decision,
        reason,
        reviewedAt: new Date().toISOString(),
      });
    }
    state.updatedAt = new Date().toISOString();
  }

  private getStatePath(sprintId: string): string {
    return path.join(this.tasksDir, `review-${sprintId}.json`);
  }

  loadState(sprintId: string): ReviewState {
    const filePath = this.getStatePath(sprintId);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as ReviewState;
    } catch {
      return {
        sprintId,
        entries: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  saveState(state: ReviewState): void {
    const filePath = this.getStatePath(state.sprintId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  }
}
