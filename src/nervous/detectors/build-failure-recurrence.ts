// src/nervous/detectors/build-failure-recurrence.ts
//
// BuildFailureRecurrenceDetector — Son N sprint'te aynı dosyaların tekrar tekrar
// tsc fail etmesini tespit eder. "dikkat: X dosyası 3 sprint üstüste fail" warning.
//
// Sprint 151 Task 15 — Nervous System Detector 6/10

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Kaç sprint geriye bakılacağı (default: 3) */
const DEFAULT_RECURRENCE_THRESHOLD = 3;

interface ResultRecord {
  taskId?: string;
  filesChanged?: string[];
  testsPassed?: boolean;
  notes?: string;
}

interface SprintLog {
  sprintId: string;
  failedFiles: string[];
}

/**
 * Son N sprint'te aynı dosyaların tekrar tekrar build fail etmesini izler.
 *
 * Tetikleyici: sprint-lifecycle SPRINT_PHASE_CHANGE newPhase=RETRO
 * (RETRO fazında tüm result'lar mevcut, analiz yapılabilir)
 *
 * Çalışma mantığı:
 * 1. .tasks/*.result dosyalarını oku, testsPassed=false olan task'ların filesChanged'ini topla
 * 2. .brain/sprints/ altındaki son N sprint log'unu oku
 * 3. Aynı dosya N sprint üstüste fail listesinde ise warning üret
 */
export class BuildFailureRecurrenceDetector {
  readonly detectorId = 'build-failure-recurrence';

  constructor(private readonly recurrenceThreshold = DEFAULT_RECURRENCE_THRESHOLD) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // Sadece RETRO phase geçişinde tetikle — tüm result'lar yazılmış olur
    if (ctx.event.source !== 'sprint-lifecycle') return null;
    if (
      ctx.event.type !== 'SPRINT_PHASE_CHANGE' ||
      ctx.event.payload['newPhase'] !== 'RETRO'
    ) {
      return null;
    }

    const tasksDir = join(ctx.projectRoot, '.tasks');
    if (!existsSync(tasksDir)) return null;

    // ─── Mevcut sprint fail dosyalarını topla ────────────────────────────
    const currentFailedFiles = this.collectCurrentFailedFiles(tasksDir);

    if (currentFailedFiles.length === 0) return null;

    // ─── Geçmiş sprint verilerini oku ────────────────────────────────────
    const sprintsDir = join(ctx.projectRoot, '.brain', 'sprints');
    const historicalFails = this.collectHistoricalFails(sprintsDir);

    // ─── Tekrarlayan dosyaları bul ───────────────────────────────────────
    const recurrentFiles: Array<{ file: string; count: number }> = [];

    for (const file of currentFailedFiles) {
      // Bu dosya kaç geçmiş sprint'te de fail etmiş?
      let consecutiveCount = 1; // mevcut sprint dahil
      for (const sprint of historicalFails) {
        if (sprint.failedFiles.includes(file)) {
          consecutiveCount++;
        } else {
          break; // ardışık olmalı
        }
      }

      if (consecutiveCount >= this.recurrenceThreshold) {
        recurrentFiles.push({ file, count: consecutiveCount });
      }
    }

    if (recurrentFiles.length === 0) return null;

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      groupKey: `build-failure-recurrence:${ctx.sprintState.sprintId}`,
      suggestedActions: recurrentFiles.map(rf => ({
        id: 'BUILD_FAILURE_INVESTIGATE',
        label: `${rf.file} failed in ${rf.count} consecutive sprints`,
        risk: 'medium' as const,
        payload: { file: rf.file, consecutiveCount: rf.count },
      })),
      metadata: {
        type: 'build-failure-recurrence',
        recurrentFileCount: recurrentFiles.length,
        files: recurrentFiles,
      },
    };
  }

  /** Mevcut sprint'teki fail task'ların dosyalarını toplar */
  private collectCurrentFailedFiles(tasksDir: string): string[] {
    const resultFiles = readdirSync(tasksDir).filter(
      f => f.startsWith('task-') && f.endsWith('.result'),
    );

    const failedFiles = new Set<string>();

    for (const rf of resultFiles) {
      try {
        const data = JSON.parse(
          readFileSync(join(tasksDir, rf), 'utf-8'),
        ) as ResultRecord;

        if (data.testsPassed === false && Array.isArray(data.filesChanged)) {
          for (const file of data.filesChanged) {
            failedFiles.add(file);
          }
        }
      } catch {
        // Corrupt result — skip
      }
    }

    return [...failedFiles];
  }

  /** .brain/sprints/ altından son N sprint log'unu okur, fail dosyalarını çıkarır */
  private collectHistoricalFails(sprintsDir: string): SprintLog[] {
    if (!existsSync(sprintsDir)) return [];

    try {
      const files = readdirSync(sprintsDir)
        .filter(f => f.startsWith('sprint-') && f.endsWith('.md'))
        .sort()
        .reverse() // en son sprint ilk sırada
        .slice(0, this.recurrenceThreshold);

      const logs: SprintLog[] = [];

      for (const file of files) {
        try {
          const content = readFileSync(join(sprintsDir, file), 'utf-8');
          // NO_GO veya fail pattern'larından dosya isimlerini çıkar
          const failedFiles = this.extractFailedFilesFromLog(content);
          const sprintId = file.replace('.md', '');
          logs.push({ sprintId, failedFiles });
        } catch {
          // Skip corrupt file
        }
      }

      return logs;
    } catch {
      return [];
    }
  }

  /** Sprint log markdown'ından NO_GO task dosyalarını çıkarır */
  private extractFailedFilesFromLog(content: string): string[] {
    const files = new Set<string>();
    // Pattern: "NO_GO" satırlarından sonra gelen dosya yollarını yakala
    const lines = content.split('\n');
    let inNoGoSection = false;

    for (const line of lines) {
      if (line.includes('NO_GO') || line.includes('no-go')) {
        inNoGoSection = true;
        continue;
      }
      if (inNoGoSection) {
        // src/ veya tests/ ile başlayan dosya yollarını yakala
        const fileMatch = line.match(/\b(src\/[^\s,)]+|tests\/[^\s,)]+)/g);
        if (fileMatch) {
          for (const f of fileMatch) {
            files.add(f);
          }
        }
        // Boş satır veya yeni section → çık
        if (line.trim() === '' || line.startsWith('#')) {
          inNoGoSection = false;
        }
      }
    }

    return [...files];
  }
}
