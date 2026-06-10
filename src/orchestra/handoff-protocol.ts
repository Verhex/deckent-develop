// ─── Handoff Protocol ───────────────────────────────────────────────────────
// Manages artifact handoffs between dependent tasks.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorRegistry } from '../core/errors.js';
import { debugLog } from '../core/utils.js';

export interface Handoff {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  artifacts: string[];
  status: 'pending' | 'ready' | 'failed';
  createdAt: string;
  failReason?: string;
  /** Free-text message from upstream worker to downstream worker (Sprint 278 COMM-1). */
  notes?: string;
}

export class HandoffProtocol {
  private handoffDir: string;

  constructor(private projectRoot: string) {
    this.handoffDir = join(projectRoot, '.tasks', 'handoffs');
  }

  /**
   * Create a new handoff from one task to another.
   * @param notes Optional free-text message from upstream worker to downstream worker (Sprint 278 COMM-1).
   */
  createHandoff(fromTaskId: string, toTaskId: string, artifacts: string[], notes?: string): Handoff {
    if (!fromTaskId || !toTaskId) {
      throw ErrorRegistry.createError('DECKENT_E046', { message: 'HandoffProtocol.createHandoff: fromTaskId and toTaskId are required' });
    }
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
      throw ErrorRegistry.createError('DECKENT_E047', { message: 'HandoffProtocol.createHandoff: artifacts must be a non-empty array' });
    }

    mkdirSync(this.handoffDir, { recursive: true });

    const id = `${fromTaskId}-to-${toTaskId}`;
    const handoff: Handoff = {
      id,
      fromTaskId,
      toTaskId,
      artifacts,
      status: 'pending',
      createdAt: new Date().toISOString(),
      ...(notes !== undefined && { notes }),
    };

    writeFileSync(
      join(this.handoffDir, `${id}.json`),
      JSON.stringify(handoff, null, 2),
      'utf-8',
    );

    return handoff;
  }

  /**
   * Execute a handoff: verify all artifacts exist.
   * Returns success=true if all artifacts are present.
   */
  executeHandoff(handoffId: string): { success: boolean; missingArtifacts: string[] } {
    const handoff = this._readHandoff(handoffId);
    if (!handoff) {
      return { success: false, missingArtifacts: [] };
    }

    if (handoff.status === 'failed') {
      return { success: false, missingArtifacts: handoff.artifacts };
    }

    const missing: string[] = [];
    for (const artifact of handoff.artifacts) {
      const fullPath = join(this.projectRoot, artifact);
      if (!existsSync(fullPath)) {
        missing.push(artifact);
      }
    }

    if (missing.length === 0) {
      handoff.status = 'ready';
      this._writeHandoff(handoff);
      return { success: true, missingArtifacts: [] };
    }

    return { success: false, missingArtifacts: missing };
  }

  /**
   * Mark a handoff as failed with a reason.
   */
  failHandoff(handoffId: string, reason: string): void {
    const handoff = this._readHandoff(handoffId);
    if (!handoff) {
      throw ErrorRegistry.createError('DECKENT_E048', { message: `HandoffProtocol.failHandoff: handoff "${handoffId}" not found` });
    }

    handoff.status = 'failed';
    handoff.failReason = reason;
    this._writeHandoff(handoff);
  }

  /**
   * List all handoffs.
   */
  listHandoffs(): Handoff[] {
    if (!existsSync(this.handoffDir)) return [];
    try {
      const files = readdirSync(this.handoffDir).filter(f => f.endsWith('.json'));
      const handoffs: Handoff[] = [];
      for (const file of files) {
        try {
          const content = readFileSync(join(this.handoffDir, file), 'utf-8');
          // safe: handoff files written by _writeHandoff with Handoff shape; id checked below
          const parsed = JSON.parse(content) as Handoff;
          if (parsed && parsed.id) {
            handoffs.push(parsed);
          }
        } catch (e) {
          debugLog('HandoffProtocol:_listHandoffs:parseFile', e);
        }
      }
      return handoffs.sort((a, b) => a.id.localeCompare(b.id));
    } catch (e) {
      debugLog('HandoffProtocol:_listHandoffs:readdirSync', e);
      return [];
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private _readHandoff(handoffId: string): Handoff | null {
    const filePath = join(this.handoffDir, `${handoffId}.json`);
    try {
      if (!existsSync(filePath)) return null;
      const content = readFileSync(filePath, 'utf-8');
      // safe: handoff files written by _writeHandoff with Handoff shape
      return JSON.parse(content) as Handoff;
    } catch {
      return null;
    }
  }

  private _writeHandoff(handoff: Handoff): void {
    mkdirSync(this.handoffDir, { recursive: true });
    writeFileSync(
      join(this.handoffDir, `${handoff.id}.json`),
      JSON.stringify(handoff, null, 2),
      'utf-8',
    );
  }
}
