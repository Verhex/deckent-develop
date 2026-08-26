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
} from '../../src/mcp/helpers/format.js';
import type {
  StatusData,
  PlanData,
  StartData,
  DoctorData,
  RetroData,
  HistoryData,
  ErrorData,
} from '../../src/mcp/helpers/format.js';
import { formatStatusResponse as formatStatusResponse__tsm_014, formatPlanResponse as formatPlanResponse__tsm_014, formatStartResponse as formatStartResponse__tsm_014, formatErrorResponse as formatErrorResponse__tsm_014, wrapResponse as wrapResponse__tsm_014 } from "../../src/mcp/helpers/format.js";
import type { StatusData as StatusData__tsm_014, PlanData as PlanData__tsm_014, StartData as StartData__tsm_014, ErrorData as ErrorData__tsm_014 } from "../../src/mcp/helpers/format.js";

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

// TSM-014: physically merged from tests/mcp/tools/format.test.ts.
{
// ─── formatStatusResponse ─────────────────────────────────────────
describe('formatStatusResponse', () => {
    it('returns "No active sprint." when active is false', () => {
        const result = formatStatusResponse__tsm_014({ active: false });
        expect(result).toBe('No active sprint.');
    });
    it('returns custom message when active is false with message', () => {
        const result = formatStatusResponse__tsm_014({ active: false, message: 'Sprint paused.' });
        expect(result).toBe('Sprint paused.');
    });
    it('returns summary with progress, workers, and ETA', () => {
        const data: StatusData__tsm_014 = {
            sprint: { id: 'sprint-040' },
            progress: { done: 7, active: 3, total: 12 },
            agents: [{ status: 'EXECUTING' }, { status: 'CODING' }, { status: 'TESTING' }],
            eta: '~8 minutes',
            active: true,
        };
        const result = formatStatusResponse__tsm_014(data);
        expect(result).toContain('Sprint sprint-040');
        expect(result).toContain('7/12 done');
        expect(result).toContain('58%');
        expect(result).toContain('3 active workers');
        expect(result).toContain('~8 minutes remaining');
    });
    it('shows singular worker when only 1', () => {
        const data: StatusData__tsm_014 = {
            sprint: { id: 'sprint-040' },
            progress: { done: 1, active: 1, total: 5 },
            agents: [{ status: 'CODING' }],
            eta: '~10 minutes',
            active: true,
        };
        const result = formatStatusResponse__tsm_014(data);
        expect(result).toContain('1 active worker');
        expect(result).not.toContain('workers');
    });
    it('omits ETA when unknown', () => {
        const data: StatusData__tsm_014 = {
            progress: { done: 0, total: 5, active: 2 },
            eta: 'unknown',
            active: true,
        };
        const result = formatStatusResponse__tsm_014(data);
        expect(result).not.toContain('remaining');
    });
    it('shows critical alert count', () => {
        const data: StatusData__tsm_014 = {
            progress: { done: 3, total: 10, active: 2 },
            alerts: [
                { level: 'CRITICAL', message: 'Boundary violation' },
                { level: 'WARNING', message: 'Slow worker' },
            ],
            active: true,
        };
        const result = formatStatusResponse__tsm_014(data);
        expect(result).toContain('1 critical alert');
    });
    it('shows non-critical alert count when no criticals', () => {
        const data: StatusData__tsm_014 = {
            progress: { done: 3, total: 10, active: 2 },
            alerts: [
                { level: 'WARNING', message: 'Slow worker' },
                { level: 'WARNING', message: 'High memory' },
            ],
            active: true,
        };
        const result = formatStatusResponse__tsm_014(data);
        expect(result).toContain('2 alerts');
    });
    it('handles missing progress gracefully', () => {
        const result = formatStatusResponse__tsm_014({});
        expect(result).toBe('No active sprint.');
    });
    it('shows 0% when no tasks done', () => {
        const data: StatusData__tsm_014 = {
            progress: { done: 0, total: 8, active: 0 },
            active: true,
        };
        const result = formatStatusResponse__tsm_014(data);
        expect(result).toContain('0%');
        expect(result).toContain('0/8');
    });
    it('uses active count from progress when no agents array', () => {
        const data: StatusData__tsm_014 = {
            progress: { done: 2, active: 4, total: 10 },
            active: true,
        };
        const result = formatStatusResponse__tsm_014(data);
        expect(result).toContain('4 active workers');
    });
});

// ─── formatPlanResponse ────────────────────────────────────────────
describe('formatPlanResponse', () => {
    it('returns "No tasks planned." when empty', () => {
        const result = formatPlanResponse__tsm_014({ tasks: [] });
        expect(result).toBe('No tasks planned.');
    });
    it('returns "No tasks planned." when tasks undefined', () => {
        const result = formatPlanResponse__tsm_014({});
        expect(result).toBe('No tasks planned.');
    });
    it('shows task count and model distribution', () => {
        const data: PlanData__tsm_014 = {
            tasks: [
                { id: '1', title: 'T1', model: 'claude-opus-4-8' },
                { id: '2', title: 'T2', model: 'claude-sonnet-5' },
                { id: '3', title: 'T3', model: 'claude-sonnet-5' },
            ],
            modelDistribution: { 'claude-opus-4-8': 1, 'claude-sonnet-5': 2 },
        };
        const result = formatPlanResponse__tsm_014(data);
        expect(result).toContain('Planned 3 tasks');
        expect(result).toContain('1 claude-opus-4-8 (premium)');
        expect(result).toContain('2 claude-sonnet-5 (standard)');
    });
    it('shows wave info when multiple waves', () => {
        const data: PlanData__tsm_014 = {
            tasks: Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: `T${i}`, model: 'claude-sonnet-5' })),
            modelDistribution: { 'claude-sonnet-5': 8 },
            recommendation: { maxWorkers: 4 },
            waveBreakdown: { wave1: 4, wave2: 4 },
        };
        const result = formatPlanResponse__tsm_014(data);
        expect(result).toContain('2 waves');
        expect(result).toContain('4 max workers');
    });
    it('shows risk assessment', () => {
        const data: PlanData__tsm_014 = {
            tasks: [{ id: '1', title: 'T1', model: 'claude-opus-4-8' }],
            modelDistribution: { 'claude-opus-4-8': 1 },
            riskAssessment: 'low',
        };
        const result = formatPlanResponse__tsm_014(data);
        expect(result).toContain('risk: low');
    });
    it('uses singular "task" for single task', () => {
        const data: PlanData__tsm_014 = {
            tasks: [{ id: '1', title: 'T1', model: 'claude-opus-4-8' }],
            modelDistribution: { 'claude-opus-4-8': 1 },
        };
        const result = formatPlanResponse__tsm_014(data);
        expect(result).toContain('Planned 1 task:');
    });
    it('includes the registry-derived economy tier', () => {
        const data: PlanData__tsm_014 = {
            tasks: [{ id: '1', title: 'T1', model: 'claude-haiku-4-5-20251001' }],
            modelDistribution: { 'claude-haiku-4-5-20251001': 1 },
        };
        const result = formatPlanResponse__tsm_014(data);
        expect(result).toContain('claude-haiku-4-5-20251001 (economy)');
    });
    it('handles unknown model names gracefully', () => {
        const data: PlanData__tsm_014 = {
            tasks: [{ id: '1', title: 'T1', model: 'gemini-pro' }],
            modelDistribution: { 'gemini-pro': 1 },
        };
        const result = formatPlanResponse__tsm_014(data);
        expect(result).toContain('1 gemini-pro');
        expect(result).not.toContain('gemini-pro (gemini-pro)');
    });
});

// ─── formatStartResponse ───────────────────────────────────────────
describe('formatStartResponse', () => {
    it('returns success message with watch command', () => {
        const data: StartData__tsm_014 = { success: true, estimatedDuration: '~15 minutes' };
        const result = formatStartResponse__tsm_014(data);
        expect(result).toContain('Sprint started!');
        expect(result).toContain('deckent status --watch');
        expect(result).toContain('~15 minutes');
    });
    it('returns failure message with suggestion', () => {
        const data: StartData__tsm_014 = { success: false, error: 'No DIRECTIVES.md found' };
        const result = formatStartResponse__tsm_014(data);
        expect(result).toContain('Sprint failed to start');
        expect(result).toContain('No DIRECTIVES.md found');
        expect(result).toContain('deckent doctor');
    });
    it('handles missing error message', () => {
        const data: StartData__tsm_014 = { success: false };
        const result = formatStartResponse__tsm_014(data);
        expect(result).toContain('Unknown error');
    });
    it('omits duration when not provided', () => {
        const data: StartData__tsm_014 = { success: true };
        const result = formatStartResponse__tsm_014(data);
        expect(result).toContain('Sprint started!');
        expect(result).not.toContain('Estimated duration');
        expect(result).toContain('deckent status --watch');
    });
});

// ─── formatErrorResponse ───────────────────────────────────────────
describe('formatErrorResponse', () => {
    it('shows what happened with code', () => {
        const data: ErrorData__tsm_014 = {
            code: 'DECKENT_E003',
            message: 'DIRECTIVES.md is empty',
            howToFix: 'Add task definitions to DIRECTIVES.md',
        };
        const result = formatErrorResponse__tsm_014(data);
        expect(result).toContain('[DECKENT_E003]');
        expect(result).toContain('DIRECTIVES.md is empty');
        expect(result).toContain('Add task definitions to DIRECTIVES.md');
    });
    it('uses whatHappened over message', () => {
        const data: ErrorData__tsm_014 = {
            whatHappened: 'Brain could not read directives',
            message: 'generic error',
        };
        const result = formatErrorResponse__tsm_014(data);
        expect(result).toContain('Brain could not read directives');
        expect(result).not.toContain('generic error');
    });
    it('suggests checking phase logs when no howToFix', () => {
        const data: ErrorData__tsm_014 = {
            message: 'Planning failed',
            phase: 'PLAN',
        };
        const result = formatErrorResponse__tsm_014(data);
        expect(result).toContain('phase "PLAN"');
    });
    it('suggests deckent doctor as fallback', () => {
        const data: ErrorData__tsm_014 = { message: 'Something broke' };
        const result = formatErrorResponse__tsm_014(data);
        expect(result).toContain('deckent doctor');
    });
    it('handles completely empty error data', () => {
        const result = formatErrorResponse__tsm_014({});
        expect(result).toContain('An unexpected error occurred');
        expect(result).toContain('deckent doctor');
    });
    it('omits code bracket when no code', () => {
        const result = formatErrorResponse__tsm_014({ message: 'err' });
        expect(result).not.toContain('[]');
        expect(result).toContain('Something went wrong: err');
    });
});

// ─── wrapResponse ──────────────────────────────────────────────────
describe('wrapResponse', () => {
    it('wraps data with summary', () => {
        const data = { foo: 'bar', count: 42 };
        const result = wrapResponse__tsm_014(data, 'Test summary.');
        expect(result.data).toEqual(data);
        expect(result.summary).toBe('Test summary.');
    });
    it('preserves original data structure', () => {
        const data = { nested: { a: 1 }, arr: [1, 2, 3] };
        const result = wrapResponse__tsm_014(data, 'summary');
        expect(result.data.nested.a).toBe(1);
        expect(result.data.arr).toEqual([1, 2, 3]);
    });
    it('has both data and summary keys', () => {
        const result = wrapResponse__tsm_014({}, 'empty');
        expect(Object.keys(result)).toContain('data');
        expect(Object.keys(result)).toContain('summary');
    });
});
}
