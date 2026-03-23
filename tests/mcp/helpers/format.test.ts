import { describe, it, expect } from 'vitest';
import {
  formatStatusResponse,
  formatPlanResponse,
  formatStartResponse,
  formatDoctorResponse,
  formatRetroResponse,
  formatHistoryResponse,
  formatErrorResponse,
  wrapResponse,
} from '../../../src/mcp/helpers/format.js';
import type {
  StatusData,
  PlanData,
  StartData,
  DoctorData,
  RetroData,
  HistoryData,
  ErrorData,
} from '../../../src/mcp/helpers/format.js';

// ─── formatDoctorResponse ──────────────────────────────────────────

describe('formatDoctorResponse', () => {
  it('returns healthy message when all checks pass', () => {
    const data: DoctorData = {
      ok: true,
      checks: [
        { ok: true, name: 'node' },
        { ok: true, name: 'git' },
        { ok: true, name: 'tmux' },
      ],
      healthScore: 100,
    };
    const result = formatDoctorResponse(data);
    expect(result).toContain('System healthy');
    expect(result).toContain('100% health score');
  });

  it('shows issue count when checks fail', () => {
    const data: DoctorData = {
      checks: [
        { ok: true, name: 'node' },
        { ok: false, name: 'tmux' },
        { ok: false, name: 'claude' },
      ],
      healthScore: 33,
    };
    const result = formatDoctorResponse(data);
    expect(result).toContain('System has 2 issues');
    expect(result).toContain('33% health score');
    expect(result).toContain('fix: tmux, claude');
  });

  it('uses singular "issue" for single failure', () => {
    const data: DoctorData = {
      checks: [
        { ok: true, name: 'node' },
        { ok: false, name: 'tmux' },
      ],
    };
    const result = formatDoctorResponse(data);
    expect(result).toContain('1 issue');
    expect(result).not.toContain('issues');
  });

  it('shows recommendations count', () => {
    const data: DoctorData = {
      checks: [{ ok: true, name: 'node' }],
      recommendations: ['Install tmux', 'Update Node.js'],
    };
    const result = formatDoctorResponse(data);
    expect(result).toContain('2 recommendations');
  });

  it('uses singular "recommendation" for one item', () => {
    const data: DoctorData = {
      checks: [{ ok: true, name: 'node' }],
      recommendations: ['Install tmux'],
    };
    const result = formatDoctorResponse(data);
    expect(result).toContain('1 recommendation');
  });

  it('returns "No health checks available." when checks empty', () => {
    const result = formatDoctorResponse({ checks: [] });
    expect(result).toBe('No health checks available.');
  });

  it('returns "No health checks available." when checks undefined', () => {
    const result = formatDoctorResponse({});
    expect(result).toBe('No health checks available.');
  });

  it('limits failed check names to 3', () => {
    const data: DoctorData = {
      checks: [
        { ok: false, name: 'a' },
        { ok: false, name: 'b' },
        { ok: false, name: 'c' },
        { ok: false, name: 'd' },
      ],
    };
    const result = formatDoctorResponse(data);
    expect(result).toContain('fix: a, b, c');
    expect(result).not.toContain('d');
  });

  it('uses label when name is missing', () => {
    const data: DoctorData = {
      checks: [{ ok: false, label: 'Claude CLI' }],
    };
    const result = formatDoctorResponse(data);
    expect(result).toContain('fix: Claude CLI');
  });
});

// ─── formatRetroResponse ───────────────────────────────────────────

describe('formatRetroResponse', () => {
  it('returns "No retrospective available." when content is null', () => {
    const result = formatRetroResponse({ content: null });
    expect(result).toBe('No retrospective available.');
  });

  it('returns "No retrospective available." when content is undefined', () => {
    const result = formatRetroResponse({});
    expect(result).toBe('No retrospective available.');
  });

  it('shows sprint ID and success rate', () => {
    const data: RetroData = {
      content: '## Summary\nSprint completed.',
      sprintId: 'sprint-040',
      successRate: 92,
    };
    const result = formatRetroResponse(data);
    expect(result).toContain('Sprint sprint-040');
    expect(result).toContain('92% success');
  });

  it('shows self-healing rate', () => {
    const data: RetroData = {
      content: '## Summary\nSprint completed.',
      selfHealingRate: 75,
    };
    const result = formatRetroResponse(data);
    expect(result).toContain('self-healing rate 75%');
  });

  it('shows self-healed count', () => {
    const data: RetroData = {
      content: '## Summary\nDone.',
      selfHealedCount: 3,
    };
    const result = formatRetroResponse(data);
    expect(result).toContain('3 tasks auto-fixed');
  });

  it('uses singular task for 1 self-healed', () => {
    const data: RetroData = {
      content: '## Summary\nDone.',
      selfHealedCount: 1,
    };
    const result = formatRetroResponse(data);
    expect(result).toContain('1 task auto-fixed');
    expect(result).not.toContain('tasks');
  });

  it('does not show self-healed count when 0', () => {
    const data: RetroData = {
      content: '## Summary\nDone.',
      selfHealedCount: 0,
      sprintId: 'sprint-040',
    };
    const result = formatRetroResponse(data);
    expect(result).not.toContain('auto-fixed');
  });

  it('shows highlight count when no metrics', () => {
    const data: RetroData = {
      content: '## Summary\nDone.',
      highlights: ['Task 1 completed', 'Task 2 completed'],
    };
    const result = formatRetroResponse(data);
    expect(result).toContain('2 highlights');
  });

  it('returns generic message when content present but no metadata', () => {
    const data: RetroData = {
      content: '## Summary\nDone.',
    };
    const result = formatRetroResponse(data);
    expect(result).toBe('Retrospective available.');
  });

  it('combines all metrics', () => {
    const data: RetroData = {
      content: '## Summary\nDone.',
      sprintId: 'sprint-041',
      successRate: 85,
      selfHealingRate: 60,
      selfHealedCount: 2,
    };
    const result = formatRetroResponse(data);
    expect(result).toContain('Sprint sprint-041');
    expect(result).toContain('85% success');
    expect(result).toContain('self-healing rate 60%');
    expect(result).toContain('2 tasks auto-fixed');
  });
});

// ─── formatHistoryResponse ─────────────────────────────────────────

describe('formatHistoryResponse', () => {
  it('returns "No sprint history available." when empty', () => {
    const result = formatHistoryResponse({ sprints: [] });
    expect(result).toBe('No sprint history available.');
  });

  it('returns "No sprint history available." when undefined', () => {
    const result = formatHistoryResponse({});
    expect(result).toBe('No sprint history available.');
  });

  it('shows sprint count and trend', () => {
    const data: HistoryData = {
      sprints: [
        { id: 'sprint-036' },
        { id: 'sprint-037' },
        { id: 'sprint-038' },
        { id: 'sprint-039' },
        { id: 'sprint-040' },
      ],
      trend: 'improving',
    };
    const result = formatHistoryResponse(data);
    expect(result).toContain('Last 5 sprints');
    expect(result).toContain('trending up');
  });

  it('shows declining trend', () => {
    const data: HistoryData = {
      sprints: [{ id: 's1' }, { id: 's2' }],
      trend: 'declining',
    };
    const result = formatHistoryResponse(data);
    expect(result).toContain('trending down');
  });

  it('shows stable trend', () => {
    const data: HistoryData = {
      sprints: [{ id: 's1' }, { id: 's2' }],
      trend: 'stable',
    };
    const result = formatHistoryResponse(data);
    expect(result).toContain('stable');
  });

  it('omits trend when insufficient_data', () => {
    const data: HistoryData = {
      sprints: [{ id: 's1' }],
      trend: 'insufficient_data',
    };
    const result = formatHistoryResponse(data);
    expect(result).not.toContain('trending');
    expect(result).not.toContain('stable');
    expect(result).toContain('Last 1 sprint');
  });

  it('uses singular sprint for 1 entry', () => {
    const data: HistoryData = {
      sprints: [{ id: 's1' }],
    };
    const result = formatHistoryResponse(data);
    expect(result).toContain('Last 1 sprint');
    expect(result).not.toContain('sprints');
  });

  it('shows avg success rate', () => {
    const data: HistoryData = {
      sprints: [{ id: 's1' }, { id: 's2' }],
      avgSuccessRate: 95,
      trend: 'improving',
    };
    const result = formatHistoryResponse(data);
    expect(result).toContain('95% avg success rate');
  });
});

// ─── wrapResponse integration ──────────────────────────────────────

describe('wrapResponse with new formatters', () => {
  it('wraps doctor data with summary', () => {
    const data: DoctorData = {
      checks: [{ ok: true, name: 'node' }],
      healthScore: 100,
    };
    const summary = formatDoctorResponse(data);
    const wrapped = wrapResponse(data, summary);
    expect(wrapped.data).toEqual(data);
    expect(wrapped.summary).toContain('System healthy');
  });

  it('wraps retro data with summary', () => {
    const data: RetroData = {
      content: '## Retro\nDone.',
      sprintId: 'sprint-040',
      successRate: 90,
    };
    const summary = formatRetroResponse(data);
    const wrapped = wrapResponse(data, summary);
    expect(wrapped.data).toEqual(data);
    expect(wrapped.summary).toContain('Sprint sprint-040');
  });

  it('wraps history data with summary', () => {
    const data: HistoryData = {
      sprints: [{ id: 's1' }, { id: 's2' }],
      trend: 'stable',
    };
    const summary = formatHistoryResponse(data);
    const wrapped = wrapResponse(data, summary);
    expect(wrapped.data).toEqual(data);
    expect(wrapped.summary).toContain('stable');
  });
});

// ─── Edge cases / empty data ───────────────────────────────────────

describe('edge cases across all formatters', () => {
  it('formatStatusResponse handles empty data gracefully', () => {
    const result = formatStatusResponse({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatPlanResponse handles empty data gracefully', () => {
    const result = formatPlanResponse({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatStartResponse handles empty data gracefully', () => {
    const result = formatStartResponse({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatDoctorResponse handles empty data gracefully', () => {
    const result = formatDoctorResponse({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatRetroResponse handles empty data gracefully', () => {
    const result = formatRetroResponse({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatHistoryResponse handles empty data gracefully', () => {
    const result = formatHistoryResponse({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatErrorResponse handles empty data gracefully', () => {
    const result = formatErrorResponse({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
