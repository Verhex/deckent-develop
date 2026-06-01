// ═══ Sprint Reporter — Specialization Drift Retro Wire Tests ══════════════
// Sprint 212 Task 212-005 — verifies SpecializationDriftDetector becomes a
// real retro consumer via `sprint-reporter.ts`. Before this wire,
// `SpecializationDriftDetector` had zero external callers (dormant).

import { describe, it, expect } from 'vitest';
import {
  collectSpecializationDriftReports,
  buildSpecializationDriftSection,
  type AgentDriftInput,
  type DriftReport,
} from '../../src/orchestra/sprint-reporter.js';
import type { RecentResult } from '../../src/orchestra/sprint-reporter.js';

function makeResult(taskType: string, taskTitle: string): RecentResult {
  return { taskType, taskTitle, evaluation: 'DONE' };
}

// ─── collectSpecializationDriftReports (caller side) ────────────────

describe('sprint-reporter — specialization drift retro wire', () => {
  it('drift tespit: drifted agent returns driftScore > 0 and non-keep recommendation', () => {
    const agents: AgentDriftInput[] = [
      {
        agentId: 'frontend-designer',
        triggerKeywords: ['frontend', 'react', 'ui', 'css', 'design'],
        recentResults: [
          makeResult('python', 'Machine learning pipeline'),
          makeResult('python', 'Data science notebook'),
          makeResult('database', 'SQL migration scripts'),
        ],
      },
    ];

    const reports = collectSpecializationDriftReports(agents);

    expect(reports).toHaveLength(1);
    expect(reports[0].agentId).toBe('frontend-designer');
    expect(reports[0].driftScore).toBeGreaterThan(0);
    expect(reports[0].recommendation).not.toBe('keep');
  });

  it('drift yok: aligned agent returns low driftScore and keep recommendation', () => {
    const agents: AgentDriftInput[] = [
      {
        agentId: 'typescript-refactorer',
        triggerKeywords: ['typescript', 'refactor', 'cleanup'],
        recentResults: [
          makeResult('typescript', 'Refactor config module'),
          makeResult('typescript', 'Cleanup sprint-controller'),
        ],
      },
    ];

    const reports = collectSpecializationDriftReports(agents);

    expect(reports).toHaveLength(1);
    expect(reports[0].driftScore).toBeLessThan(0.6);
    expect(reports[0].recommendation).toBe('keep');
  });

  it('çoklu agent: returns one DriftReport per input agent', () => {
    const agents: AgentDriftInput[] = [
      {
        agentId: 'security-auditor',
        triggerKeywords: ['security', 'auth', 'vulnerability'],
        recentResults: [makeResult('security', 'Audit auth endpoints')],
      },
      {
        agentId: 'doc-writer',
        triggerKeywords: ['docs', 'readme', 'comment'],
        recentResults: [makeResult('python', 'ML pipeline refactor')],
      },
    ];

    const reports = collectSpecializationDriftReports(agents);

    expect(reports).toHaveLength(2);
    expect(reports[0].agentId).toBe('security-auditor');
    expect(reports[1].agentId).toBe('doc-writer');
  });

  it('boş veri: empty input returns empty array (graceful)', () => {
    const reports = collectSpecializationDriftReports([]);
    expect(reports).toEqual([]);
  });

  it('agent with no recentResults returns driftScore 0 and keep', () => {
    const agents: AgentDriftInput[] = [
      {
        agentId: 'new-agent',
        triggerKeywords: ['api', 'rest', 'endpoint'],
        recentResults: [],
      },
    ];

    const reports = collectSpecializationDriftReports(agents);

    expect(reports).toHaveLength(1);
    expect(reports[0].driftScore).toBe(0);
    expect(reports[0].recommendation).toBe('keep');
  });

  // ─── buildSpecializationDriftSection (formatter side) ───────────────

  it('formats drift reports as markdown section with heading', () => {
    const reports: DriftReport[] = [
      {
        agentId: 'frontend-designer',
        originalSpecialization: ['frontend', 'react'],
        currentSpecialization: ['python', 'ml'],
        driftScore: 0.75,
        recommendation: 'respecialize',
      },
    ];

    const md = buildSpecializationDriftSection(reports);

    expect(md).toContain('## Specialization Drift');
    expect(md).toContain('frontend-designer');
    expect(md).toContain('75%');
    expect(md).toContain('respecialize');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('renders empty-state message when no drift data provided', () => {
    const md = buildSpecializationDriftSection([]);

    expect(md).toContain('## Specialization Drift');
    expect(md).toContain('No agent drift data available');
    expect(md.endsWith('\n')).toBe(true);
  });

  // ─── end-to-end pipeline ─────────────────────────────────────────

  it('end-to-end: collect → build produces a retro-ready markdown section', () => {
    const agents: AgentDriftInput[] = [
      {
        agentId: 'refactorer',
        triggerKeywords: ['refactor', 'cleanup', 'typescript'],
        recentResults: [
          makeResult('typescript', 'Refactor sprint-controller'),
          makeResult('typescript', 'Cleanup imports'),
        ],
      },
      {
        agentId: 'doc-writer',
        triggerKeywords: ['docs', 'readme', 'changelog'],
        recentResults: [
          makeResult('python', 'Data pipeline implementation'),
          makeResult('python', 'ML feature engineering'),
          makeResult('database', 'Schema migration'),
        ],
      },
    ];

    const reports = collectSpecializationDriftReports(agents);
    const md = buildSpecializationDriftSection(reports);

    expect(md).toContain('## Specialization Drift');
    expect(md).toContain('refactorer');
    expect(md).toContain('doc-writer');
    // doc-writer doing python tasks should show significant drift
    const docWriterReport = reports.find(r => r.agentId === 'doc-writer')!;
    expect(docWriterReport.driftScore).toBeGreaterThan(0);
  });
});
