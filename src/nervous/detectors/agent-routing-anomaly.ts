// src/nervous/detectors/agent-routing-anomaly.ts
//
// AgentRoutingAnomalyDetector — Aynı agent >80% task alıyorsa ADR-041 enforce warning.
// Sprint 147 test-writer 22/22 pattern tekrarını önler.
//
// Mevcut AgentRoutingHealth'ten farkı: bu detector daha yüksek eşik (%80 vs %40)
// ve ADR-041 spesifik referans ile PLAN fazında erken uyarı verir.
//
// Sprint 151 Task 15 — Nervous System Detector 8/10

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** %80+ task aynı agent'a atandığında ADR-041 ihlali */
const DEFAULT_ANOMALY_THRESHOLD = 0.80;

/** Minimum task sayısı — çok az task'ta anomaly anlamsız */
const MIN_TASKS_FOR_ANOMALY = 5;

interface TaskRecord {
  id?: string;
  assignedAgent?: string;
}

/**
 * Agent routing anomaly detector — ADR-041 enforcer.
 *
 * Tetikleyici: sprint-lifecycle SPRINT_PHASE_CHANGE newPhase=SPAWN veya EVALUATE
 * (SPAWN: planlama sonrası erken tespit, EVALUATE: sonuç bazlı doğrulama)
 *
 * ADR-041 referansı: "Agent Taxonomy — Horizontal Skills vs Vertical Agents"
 * Tek bir agent'ın %80+ task alması, skill/agent ayrımının çalışmadığını gösterir.
 */
export class AgentRoutingAnomalyDetector {
  readonly detectorId = 'agent-routing-anomaly';

  constructor(private readonly anomalyThreshold = DEFAULT_ANOMALY_THRESHOLD) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    if (ctx.event.source !== 'sprint-lifecycle') return null;
    if (ctx.event.type !== 'SPRINT_PHASE_CHANGE') return null;

    const newPhase = ctx.event.payload['newPhase'];
    if (newPhase !== 'SPAWN' && newPhase !== 'EVALUATE') return null;

    const tasksDir = join(ctx.projectRoot, '.tasks');
    if (!existsSync(tasksDir)) return null;

    const taskFiles = readdirSync(tasksDir).filter(
      f => f.startsWith('task-') && f.endsWith('.json'),
    );

    if (taskFiles.length < MIN_TASKS_FOR_ANOMALY) return null;

    // ─── Agent dağılımı hesapla ──────────────────────────────────────────
    const agentCounts = new Map<string, string[]>();

    for (const tf of taskFiles) {
      try {
        const data = JSON.parse(
          readFileSync(join(tasksDir, tf), 'utf-8'),
        ) as TaskRecord;

        if (data.assignedAgent) {
          const taskId = data.id ?? tf;
          const existing = agentCounts.get(data.assignedAgent) ?? [];
          agentCounts.set(data.assignedAgent, [...existing, taskId]);
        }
      } catch {
        // Skip corrupt
      }
    }

    // ─── %80+ anomaly tespit ─────────────────────────────────────────────
    const total = taskFiles.length;
    const anomalies: Array<{ agent: string; count: number; rate: number; taskIds: string[] }> = [];

    for (const [agent, taskIds] of agentCounts) {
      const rate = taskIds.length / total;
      if (rate >= this.anomalyThreshold) {
        anomalies.push({ agent, count: taskIds.length, rate, taskIds });
      }
    }

    if (anomalies.length === 0) return null;

    const topAnomaly = anomalies.reduce((a, b) => (b.rate > a.rate ? b : a));
    return {
      risk: 'high',
      shouldNotify: true,
      severity: 'warning',
      title: `Agent routing anomaly: ${topAnomaly.agent} (${(topAnomaly.rate * 100).toFixed(0)}%)`,
      message: `ADR-041 violation in ${newPhase} — ${topAnomaly.agent} assigned ${topAnomaly.count}/${total} tasks (${(topAnomaly.rate * 100).toFixed(0)}%); skill/agent split not working`,
      groupKey: `agent-routing-anomaly:${ctx.sprintState.sprintId}`,
      suggestedActions: anomalies.map(a => ({
        id: 'SKILL_ROUTING_ADJUST',
        label: `ADR-041 violation: ${a.agent} assigned ${a.count}/${total} tasks (${(a.rate * 100).toFixed(0)}%)`,
        risk: 'high' as const,
        payload: {
          agent: a.agent,
          count: a.count,
          total,
          rate: Math.round(a.rate * 100) / 100,
          taskIds: a.taskIds,
          adrReference: 'ADR-041',
        },
      })),
      metadata: {
        type: 'agent-routing-anomaly',
        anomalyCount: anomalies.length,
        phase: newPhase,
      },
    };
  }
}
