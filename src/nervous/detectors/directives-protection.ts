// src/nervous/detectors/directives-protection.ts
//
// DirectivesMidSprintProtection — DIRECTIVES.md mid-sprint koruması.
// Sprint 145 08:14 TRT canlı bug: EXECUTE phase'de DIRECTIVES.md template'e dönüştü.
// Sprint 146 T-146-008 phase guard ekledi. Sprint 147 proactive detection + auto-restore.
//
// Design spec: docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md Section 5.5
// Sprint 147 Task 13

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Sprint 144/145 pattern: template size 463 bytes — anything under 2KB is suspicious
const TEMPLATE_SIZE_THRESHOLD = 2000;

// Known template/placeholder patterns from Sprint 144/145 incidents
const SUSPICIOUS_PATTERNS: ReadonlyArray<RegExp> = [
  /^# DIRECTIVES — \(Sprint \d+ için hazırlanıyor\)/,  // Template header
  /\(Task başlığı\)/,                                   // Placeholder text
];

/**
 * DIRECTIVES.md mid-sprint integrity monitor.
 *
 * Triggers on filesystem events targeting DIRECTIVES.md during EXECUTE/FIX phases.
 * Detects template reversion (size-based + pattern-based) and file deletion.
 * Suggests emergency restore from task JSON files.
 *
 * Historical context:
 * - Sprint 145 08:14 TRT: DIRECTIVES.md overwritten with 463-byte template mid-EXECUTE
 * - Sprint 146 T-146-008: archiveDirectives reject guard added
 * - Sprint 147: proactive filesystem watcher detection
 */
export class DirectivesMidSprintProtection {
  readonly detectorId = 'directives-protection';

  detect(ctx: DetectorContext): DetectorResult | null {
    // Only process filesystem events
    if (ctx.event.source !== 'filesystem') return null;

    // Only care about DIRECTIVES.md changes
    if (!ctx.event.payload.path?.toString().endsWith('DIRECTIVES.md')) return null;

    // Protection only active during EXECUTE/FIX phases
    const protectedPhases: ReadonlyArray<string> = ['EXECUTE', 'FIX'];
    if (!protectedPhases.includes(ctx.sprintState.currentPhase)) return null;

    const directivesPath = join(ctx.projectRoot, 'DIRECTIVES.md');

    // Case 1: File deleted entirely
    if (!existsSync(directivesPath)) {
      return this.buildCriticalAlert(ctx, 'DIRECTIVES.md DELETED mid-sprint');
    }

    // Case 2: File exists but content is suspicious
    const content = readFileSync(directivesPath, 'utf-8');
    const size = statSync(directivesPath).size;

    const isTemplate = size < TEMPLATE_SIZE_THRESHOLD ||
                       SUSPICIOUS_PATTERNS.some(p => p.test(content));

    if (!isTemplate) return null;

    return this.buildCriticalAlert(
      ctx,
      `DIRECTIVES.md reverted to template mid-sprint (size=${size})`,
    );
  }

  private buildCriticalAlert(ctx: DetectorContext, reason: string): DetectorResult {
    return {
      risk: 'high',
      shouldNotify: true,
      severity: 'emergency',
      title: 'DIRECTIVES.md integrity breach mid-sprint',
      message: `${reason} during ${ctx.sprintState.currentPhase} phase — emergency restore from task JSON files proposed`,
      groupKey: `directives-protection:${ctx.sprintState.sprintId}`,
      suggestedActions: [{
        id: 'DIRECTIVES_WRITE',
        label: '\u{1F6A8} EMERGENCY: Restore DIRECTIVES.md from task JSON files',
        risk: 'high' as const,
        payload: {
          reason,
          sprintId: ctx.sprintState.sprintId,
          phase: ctx.sprintState.currentPhase,
          autoRestore: true,
        },
      }],
      metadata: { type: 'directives-protection', reason },
    };
  }
}
