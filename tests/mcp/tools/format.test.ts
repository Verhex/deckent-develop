import { describe, it, expect } from 'vitest';
import {
  formatStatusResponse,
  formatPlanResponse,
  formatStartResponse,
  formatErrorResponse,
  wrapResponse,
} from '../../../src/mcp/helpers/format.js';
import type {
  StatusData,
  PlanData,
  StartData,
  ErrorData,
} from '../../../src/mcp/helpers/format.js';

// ─── formatStatusResponse ─────────────────────────────────────────

describe('formatStatusResponse', () => {
  it('returns "No active sprint." when active is false', () => {
    const result = formatStatusResponse({ active: false });
    expect(result).toBe('No active sprint.');
  });

  it('returns custom message when active is false with message', () => {
    const result = formatStatusResponse({ active: false, message: 'Sprint paused.' });
    expect(result).toBe('Sprint paused.');
  });

  it('returns summary with progress, workers, and ETA', () => {
    const data: StatusData = {
      sprint: { id: 'sprint-040' },
      progress: { done: 7, active: 3, total: 12 },
      agents: [{ status: 'EXECUTING' }, { status: 'CODING' }, { status: 'TESTING' }],
      eta: '~8 minutes',
      active: true,
    };
    const result = formatStatusResponse(data);
    expect(result).toContain('Sprint sprint-040');
    expect(result).toContain('7/12 done');
    expect(result).toContain('58%');
    expect(result).toContain('3 active workers');
    expect(result).toContain('~8 minutes remaining');
  });

  it('shows singular worker when only 1', () => {
    const data: StatusData = {
      sprint: { id: 'sprint-040' },
      progress: { done: 1, active: 1, total: 5 },
      agents: [{ status: 'CODING' }],
      eta: '~10 minutes',
      active: true,
    };
    const result = formatStatusResponse(data);
    expect(result).toContain('1 active worker');
    expect(result).not.toContain('workers');
  });

  it('omits ETA when unknown', () => {
    const data: StatusData = {
      progress: { done: 0, total: 5, active: 2 },
      eta: 'unknown',
      active: true,
    };
    const result = formatStatusResponse(data);
    expect(result).not.toContain('remaining');
  });

  it('shows critical alert count', () => {
    const data: StatusData = {
      progress: { done: 3, total: 10, active: 2 },
      alerts: [
        { level: 'CRITICAL', message: 'Boundary violation' },
        { level: 'WARNING', message: 'Slow worker' },
      ],
      active: true,
    };
    const result = formatStatusResponse(data);
    expect(result).toContain('1 critical alert');
  });

  it('shows non-critical alert count when no criticals', () => {
    const data: StatusData = {
      progress: { done: 3, total: 10, active: 2 },
      alerts: [
        { level: 'WARNING', message: 'Slow worker' },
        { level: 'WARNING', message: 'High memory' },
      ],
      active: true,
    };
    const result = formatStatusResponse(data);
    expect(result).toContain('2 alerts');
  });

  it('handles missing progress gracefully', () => {
    const result = formatStatusResponse({});
    expect(result).toBe('No active sprint.');
  });

  it('shows 0% when no tasks done', () => {
    const data: StatusData = {
      progress: { done: 0, total: 8, active: 0 },
      active: true,
    };
    const result = formatStatusResponse(data);
    expect(result).toContain('0%');
    expect(result).toContain('0/8');
  });

  it('uses active count from progress when no agents array', () => {
    const data: StatusData = {
      progress: { done: 2, active: 4, total: 10 },
      active: true,
    };
    const result = formatStatusResponse(data);
    expect(result).toContain('4 active workers');
  });
});

// ─── formatPlanResponse ────────────────────────────────────────────

describe('formatPlanResponse', () => {
  it('returns "No tasks planned." when empty', () => {
    const result = formatPlanResponse({ tasks: [] });
    expect(result).toBe('No tasks planned.');
  });

  it('returns "No tasks planned." when tasks undefined', () => {
    const result = formatPlanResponse({});
    expect(result).toBe('No tasks planned.');
  });

  it('shows task count and model distribution', () => {
    const data: PlanData = {
      tasks: [
        { id: '1', title: 'T1', model: 'claude-opus-4-8' },
        { id: '2', title: 'T2', model: 'claude-sonnet-5' },
        { id: '3', title: 'T3', model: 'claude-sonnet-5' },
      ],
      modelDistribution: { 'claude-opus-4-8': 1, 'claude-sonnet-5': 2 },
    };
    const result = formatPlanResponse(data);
    expect(result).toContain('Planned 3 tasks');
    expect(result).toContain('1 claude-opus-4-8 (premium)');
    expect(result).toContain('2 claude-sonnet-5 (standard)');
  });

  it('shows wave info when multiple waves', () => {
    const data: PlanData = {
      tasks: Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: `T${i}`, model: 'claude-sonnet-5' })),
      modelDistribution: { 'claude-sonnet-5': 8 },
      recommendation: { maxWorkers: 4 },
      waveBreakdown: { wave1: 4, wave2: 4 },
    };
    const result = formatPlanResponse(data);
    expect(result).toContain('2 waves');
    expect(result).toContain('4 max workers');
  });

  it('shows risk assessment', () => {
    const data: PlanData = {
      tasks: [{ id: '1', title: 'T1', model: 'claude-opus-4-8' }],
      modelDistribution: { 'claude-opus-4-8': 1 },
      riskAssessment: 'low',
    };
    const result = formatPlanResponse(data);
    expect(result).toContain('risk: low');
  });

  it('uses singular "task" for single task', () => {
    const data: PlanData = {
      tasks: [{ id: '1', title: 'T1', model: 'claude-opus-4-8' }],
      modelDistribution: { 'claude-opus-4-8': 1 },
    };
    const result = formatPlanResponse(data);
    expect(result).toContain('Planned 1 task:');
  });

  it('includes the registry-derived economy tier', () => {
    const data: PlanData = {
      tasks: [{ id: '1', title: 'T1', model: 'claude-haiku-4-5-20251001' }],
      modelDistribution: { 'claude-haiku-4-5-20251001': 1 },
    };
    const result = formatPlanResponse(data);
    expect(result).toContain('claude-haiku-4-5-20251001 (economy)');
  });

  it('handles unknown model names gracefully', () => {
    const data: PlanData = {
      tasks: [{ id: '1', title: 'T1', model: 'gemini-pro' }],
      modelDistribution: { 'gemini-pro': 1 },
    };
    const result = formatPlanResponse(data);
    expect(result).toContain('1 gemini-pro');
    expect(result).not.toContain('gemini-pro (gemini-pro)');
  });
});

// ─── formatStartResponse ───────────────────────────────────────────

describe('formatStartResponse', () => {
  it('returns success message with watch command', () => {
    const data: StartData = { success: true, estimatedDuration: '~15 minutes' };
    const result = formatStartResponse(data);
    expect(result).toContain('Sprint started!');
    expect(result).toContain('deckent status --watch');
    expect(result).toContain('~15 minutes');
  });

  it('returns failure message with suggestion', () => {
    const data: StartData = { success: false, error: 'No DIRECTIVES.md found' };
    const result = formatStartResponse(data);
    expect(result).toContain('Sprint failed to start');
    expect(result).toContain('No DIRECTIVES.md found');
    expect(result).toContain('deckent doctor');
  });

  it('handles missing error message', () => {
    const data: StartData = { success: false };
    const result = formatStartResponse(data);
    expect(result).toContain('Unknown error');
  });

  it('omits duration when not provided', () => {
    const data: StartData = { success: true };
    const result = formatStartResponse(data);
    expect(result).toContain('Sprint started!');
    expect(result).not.toContain('Estimated duration');
    expect(result).toContain('deckent status --watch');
  });
});

// ─── formatErrorResponse ───────────────────────────────────────────

describe('formatErrorResponse', () => {
  it('shows what happened with code', () => {
    const data: ErrorData = {
      code: 'DECKENT_E003',
      message: 'DIRECTIVES.md is empty',
      howToFix: 'Add task definitions to DIRECTIVES.md',
    };
    const result = formatErrorResponse(data);
    expect(result).toContain('[DECKENT_E003]');
    expect(result).toContain('DIRECTIVES.md is empty');
    expect(result).toContain('Add task definitions to DIRECTIVES.md');
  });

  it('uses whatHappened over message', () => {
    const data: ErrorData = {
      whatHappened: 'Brain could not read directives',
      message: 'generic error',
    };
    const result = formatErrorResponse(data);
    expect(result).toContain('Brain could not read directives');
    expect(result).not.toContain('generic error');
  });

  it('suggests checking phase logs when no howToFix', () => {
    const data: ErrorData = {
      message: 'Planning failed',
      phase: 'PLAN',
    };
    const result = formatErrorResponse(data);
    expect(result).toContain('phase "PLAN"');
  });

  it('suggests deckent doctor as fallback', () => {
    const data: ErrorData = { message: 'Something broke' };
    const result = formatErrorResponse(data);
    expect(result).toContain('deckent doctor');
  });

  it('handles completely empty error data', () => {
    const result = formatErrorResponse({});
    expect(result).toContain('An unexpected error occurred');
    expect(result).toContain('deckent doctor');
  });

  it('omits code bracket when no code', () => {
    const result = formatErrorResponse({ message: 'err' });
    expect(result).not.toContain('[]');
    expect(result).toContain('Something went wrong: err');
  });
});

// ─── wrapResponse ──────────────────────────────────────────────────

describe('wrapResponse', () => {
  it('wraps data with summary', () => {
    const data = { foo: 'bar', count: 42 };
    const result = wrapResponse(data, 'Test summary.');
    expect(result.data).toEqual(data);
    expect(result.summary).toBe('Test summary.');
  });

  it('preserves original data structure', () => {
    const data = { nested: { a: 1 }, arr: [1, 2, 3] };
    const result = wrapResponse(data, 'summary');
    expect(result.data.nested.a).toBe(1);
    expect(result.data.arr).toEqual([1, 2, 3]);
  });

  it('has both data and summary keys', () => {
    const result = wrapResponse({}, 'empty');
    expect(Object.keys(result)).toContain('data');
    expect(Object.keys(result)).toContain('summary');
  });
});
