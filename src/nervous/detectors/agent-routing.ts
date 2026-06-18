// src/nervous/detectors/agent-routing.ts
//
// AgentRoutingHealth — Sprint 146 T-146-005 agent `string;` corruption lesson.
// İlk canlı test case: agent pool'daki corrupt entry + runtime %40+ anomaly tespiti.
//
// Design spec: docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md Section 5.4
// Sprint 147 Task 12

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Geçerli agent ID formatı: küçük harf ile başlar, küçük harf/rakam/tire içerebilir,
 * küçük harf veya rakam ile biter. Minimum 2 karakter.
 *
 * Sprint 146 bug: agent ID olarak `string;` atandı — noktalı virgül ve TypeScript tipi
 * bu regex'e uymaz → corrupt-agent flagged.
 */
const AGENT_ID_REGEX = /^[a-z][a-z0-9-]*[a-z0-9]$/;

/** %40 veya daha fazla task aynı agent'a atanırsa anomaly */
const ANOMALY_THRESHOLD_RATE = 0.40;

type IssueType = 'corrupt-agent' | 'anomaly';

interface RoutingIssue extends Record<string, unknown> {
  readonly type: IssueType;
  readonly detail: string;
  readonly taskIds: string[];
}

interface TaskRecord {
  id?: string;
  assignedAgent?: string;
}

/**
 * Agent routing sağlığını izler.
 *
 * İki tür sorun tespit eder:
 * 1. **Corrupt agent ID** — AGENT_ID_REGEX'e uymayan agent ID'leri (e.g. `string;`)
 * 2. **Routing anomaly** — Tek bir agent'a %40+ task atanması (Sprint 145 test-writer %53 bug)
 *
 * Tetikleyici: `sprint-lifecycle` source + `SPRINT_PHASE_CHANGE` + `newPhase=EVALUATE`
 * Severity: corrupt-agent varsa `critical`, sadece anomaly varsa `warning`
 */
export class AgentRoutingHealth {
  readonly detectorId = 'agent-routing';

  constructor(private readonly anomalyThreshold = ANOMALY_THRESHOLD_RATE) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // Sadece sprint-lifecycle kaynağından gelen EVALUATE phase geçişinde tetikle
    if (ctx.event.source !== 'sprint-lifecycle') return null;
    if (
      ctx.event.type !== 'SPRINT_PHASE_CHANGE' ||
      ctx.event.payload['newPhase'] !== 'EVALUATE'
    ) {
      return null;
    }

    const tasksDir = join(ctx.projectRoot, '.tasks');
    if (!existsSync(tasksDir)) return null;

    // .tasks/ dizinindeki task JSON dosyalarını oku
    const taskFiles = readdirSync(tasksDir).filter(
      f => f.startsWith('task-') && f.endsWith('.json'),
    );

    if (taskFiles.length === 0) return null;

    const tasks: TaskRecord[] = taskFiles.map(f => {
      try {
        return JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as TaskRecord;
      } catch {
        return {};
      }
    });

    const issues: RoutingIssue[] = [];

    // ─── 1. Corrupt agent detection ──────────────────────────────────────────
    // Sprint 146 T-146-005 gerçek bug: agent='string;' — TypeScript tip adı sızdı
    for (const t of tasks) {
      if (t.assignedAgent && !AGENT_ID_REGEX.test(t.assignedAgent)) {
        issues.push({
          type: 'corrupt-agent',
          detail: `Invalid agent ID "${t.assignedAgent}" on task ${t.id ?? '(unknown)'}`,
          taskIds: [t.id ?? '(unknown)'],
        });
      }
    }

    // ─── 2. %40+ anomaly detection ───────────────────────────────────────────
    // Sprint 145 replay: test-writer'a 14/17 (%82) task atandı
    const agentCounts = new Map<string, string[]>();
    for (const t of tasks) {
      if (t.assignedAgent && AGENT_ID_REGEX.test(t.assignedAgent)) {
        const taskId = t.id ?? '(unknown)';
        const existing = agentCounts.get(t.assignedAgent) ?? [];
        agentCounts.set(t.assignedAgent, [...existing, taskId]);
      }
    }

    const total = tasks.length;
    for (const [agent, taskIds] of agentCounts) {
      const rate = taskIds.length / total;
      if (rate >= this.anomalyThreshold) {
        const pct = (rate * 100).toFixed(1);
        issues.push({
          type: 'anomaly',
          detail: `${agent} assigned to ${taskIds.length}/${total} tasks (${pct}%)`,
          taskIds,
        });
      }
    }

    if (issues.length === 0) return null;

    // Corrupt agent varsa critical, sadece anomaly ise warning
    const hasCritical = issues.some(i => i.type === 'corrupt-agent');
    const corruptCount = issues.filter(i => i.type === 'corrupt-agent').length;

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: hasCritical ? 'critical' : 'warning',
      title: hasCritical
        ? `Corrupt agent ID detected (${corruptCount})`
        : `Agent routing anomaly (${issues.length})`,
      message: hasCritical
        ? `${corruptCount} task(s) carry an invalid agent ID (e.g. "string;") — routing/pool corruption; first: ${issues.find(i => i.type === 'corrupt-agent')!.detail}`
        : `${issues.length} routing issue(s) at EVALUATE — ${issues[0]!.detail}`,
      groupKey: `agent-routing:${ctx.sprintState.sprintId}`,
      suggestedActions: issues.map(i => ({
        id: i.type === 'corrupt-agent' ? 'AGENT_PERFORMANCE_FLAG' : 'SKILL_ROUTING_ADJUST',
        label: i.detail,
        risk: 'medium' as const,
        payload: i,
      })),
      metadata: { type: 'agent-routing', issueCount: issues.length },
    };
  }
}
