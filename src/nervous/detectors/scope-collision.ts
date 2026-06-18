// src/nervous/detectors/scope-collision.ts
//
// ScopeCollisionMonitor — plan-time ve runtime scope çakışması tespiti.
//
// Sprint 138 T-004'te implemente edilen detectScopeCollisions() fonksiyonunun
// Nervous System detector versiyonu. O fonksiyon reaktif (spawn sonrası wave
// inşası sırasında) çalışırken bu detector proactive (cron/fs event ile
// PLAN ve EXECUTE fazlarında sürekli) çalışır.
//
// Design spec: docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md
// ADR-040: proposed

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Task JSON'dan okunan minimal yapı */
interface TaskFileData {
  id: string;
  status?: string;
  scope?: {
    filesWrite?: string[];
  };
}

/** Tekil çakışma kaydı */
interface CollisionEntry {
  file: string;
  taskIds: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Scope collision detection yalnızca bu fazlarda aktiftir */
const PROTECTED_PHASES = new Set(['PLAN', 'EXECUTE'] as const);

/** Task'ın aktif sayılması için geçerli statüsler */
const ACTIVE_STATUSES = new Set(['PENDING', 'CLAIMED', 'EXECUTING']);

// ─── ScopeCollisionMonitor ────────────────────────────────────────────────────

/**
 * PLAN ve EXECUTE fazlarında aynı dosyaya yazmak isteyen birden fazla task'ı
 * tespit eder. Tespit edildiğinde SCOPE_COLLISION_REORDER eylemi önerilir.
 *
 * Tetikleyici: cron tick veya filesystem event (.tasks/ değişimi)
 *
 * @example
 * const monitor = new ScopeCollisionMonitor();
 * const result = monitor.detect(ctx);  // null | DetectorResult
 */
export class ScopeCollisionMonitor {
  readonly detectorId = 'scope-collision';

  /**
   * Scope çakışmalarını tespit eder.
   *
   * @param ctx - Observer event + sprint state + proje kök dizini
   * @returns DetectorResult veya null (tespit edilmedi)
   */
  detect(ctx: DetectorContext): DetectorResult | null {
    // ── Phase guard ──────────────────────────────────────────────────────────
    if (!PROTECTED_PHASES.has(ctx.sprintState.currentPhase as 'PLAN' | 'EXECUTE')) {
      return null;
    }

    // ── .tasks/ dizini var mı ────────────────────────────────────────────────
    const tasksDir = join(ctx.projectRoot, '.tasks');
    if (!existsSync(tasksDir)) return null;

    // ── Task dosyalarını oku ─────────────────────────────────────────────────
    const tasks = this.readTaskFiles(tasksDir);
    if (tasks.length === 0) return null;

    // ── Aktif task'ların filesWrite'ını topla ────────────────────────────────
    const writeMap = this.buildWriteMap(tasks);

    // ── Çakışmaları bul ──────────────────────────────────────────────────────
    const collisions = this.findCollisions(writeMap);
    if (collisions.length === 0) return null;

    // ── DetectorResult üret ──────────────────────────────────────────────────
    return this.buildResult(collisions);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * .tasks/ dizinindeki task-*.json dosyalarını okur.
   * Parse hatası olan dosyalar sessizce atlanır.
   */
  private readTaskFiles(tasksDir: string): TaskFileData[] {
    let files: string[];
    try {
      files = readdirSync(tasksDir).filter(
        f => f.startsWith('task-') && f.endsWith('.json'),
      );
    } catch {
      return [];
    }

    const tasks: TaskFileData[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(tasksDir, file), 'utf-8');
        const parsed = JSON.parse(raw) as TaskFileData;
        tasks.push(parsed);
      } catch {
        // Bozuk JSON dosyasını atla
      }
    }
    return tasks;
  }

  /**
   * Aktif task'lardan normalize edilmiş dosya yolu → taskId[] map'i üretir.
   *
   * Normalizasyon:
   * - Büyük/küçük harf duyarsızlık (toLowerCase)
   * - Çoklu slash temizleme (/+ → /)
   */
  private buildWriteMap(tasks: TaskFileData[]): Map<string, string[]> {
    const writeMap = new Map<string, string[]>();

    for (const task of tasks) {
      // Yalnızca aktif statüsteki task'ları dahil et
      const status = task.status ?? 'PENDING';
      if (!ACTIVE_STATUSES.has(status)) continue;

      const filesWrite = task.scope?.filesWrite ?? [];
      for (const filePath of filesWrite) {
        const normalized = this.normalizePath(filePath);
        const existing = writeMap.get(normalized) ?? [];
        existing.push(task.id);
        writeMap.set(normalized, existing);
      }
    }

    return writeMap;
  }

  /**
   * Dosya yolunu normalize eder:
   * - Çoklu slash → tekil slash
   * - Küçük harfe dönüştür
   */
  private normalizePath(filePath: string): string {
    return filePath.replace(/\/+/g, '/').toLowerCase();
  }

  /**
   * writeMap'ten birden fazla task'ın yazdığı dosyaları bulur.
   */
  private findCollisions(writeMap: Map<string, string[]>): CollisionEntry[] {
    const collisions: CollisionEntry[] = [];
    for (const [file, taskIds] of writeMap) {
      if (taskIds.length > 1) {
        collisions.push({ file, taskIds });
      }
    }
    return collisions;
  }

  /**
   * Tespit edilen çakışmalardan DetectorResult üretir.
   */
  private buildResult(collisions: CollisionEntry[]): DetectorResult {
    const groupKey = `scope-collision:${collisions.map(c => c.file).join(',')}`;

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      title: `Scope collision on ${collisions.length} file(s)`,
      message: `${collisions.length} file(s) are claimed by multiple active tasks (first: ${collisions[0]!.file} → ${collisions[0]!.taskIds.join(', ')}) — concurrent writes risk corruption; reorder`,
      groupKey,
      suggestedActions: [
        {
          id: 'SCOPE_COLLISION_REORDER',
          label: `Reorder ${collisions.length} colliding task(s)`,
          risk: 'medium' as const,
          payload: {
            collisions: collisions.map(c => ({
              file: c.file,
              taskIds: c.taskIds,
            })),
          },
        },
      ],
      metadata: {
        type: 'scope-collision',
        collisions: collisions.length,
      },
    };
  }
}
