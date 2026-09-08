import { describe, expect, it } from 'vitest';
import { buildStructuredActionPicker, resolveStructuredActionInput } from '../../../src/cli/repl/structured-action-picker.js';
import { buildStructuredActionLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { cliArgsForStructuredActionRequest } from '../../../src/cli/helpers/cli-tool-capture.js';

describe('structured action selection', () => {
  it.each(['en', 'tr'] as const)('builds one localized picker without granting authority (%s)', (lang) => {
    const labels = buildStructuredActionLabels((key) => getMessage(key, lang));
    for (const family of ['sync', 'audit'] as const) {
      const spec = buildStructuredActionPicker(family, labels);
      expect(spec.kind).toBe('action');
      expect(spec.candidates.map((candidate) => candidate.id)).toEqual(family === 'sync' ? ['preview', 'apply'] : ['gate', 'query', 'compliance']);
      expect(spec.candidates.every((candidate) => candidate.label.length > 0 && !candidate.label.startsWith('tui.'))).toBe(true);
      expect(spec.scopes).toEqual(['apply']);
    }
  });

  it.each([
    ['/sync preview', { kind: 'sync', mode: 'preview' }],
    ['/sync 2', { kind: 'sync', mode: 'apply' }],
    ['/AUDIT 2', { kind: 'audit-query' }],
    ['/audit gate sprint-724', { kind: 'audit-gate', sprintId: 'sprint-724' }],
    ['/audit query warning', { kind: 'audit-query', channel: 'warning' }],
    ['/audit compliance sprint-724', { kind: 'audit-compliance', sprintId: 'sprint-724' }],
  ])('resolves %s through the same closed request contract', (input, request) => {
    expect(resolveStructuredActionInput(input as string)).toEqual({ kind: 'request', request });
  });

  it('requires an explicit gate target and keeps unrelated commands untouched', () => {
    expect(resolveStructuredActionInput('/audit')).toEqual({ kind: 'picker', family: 'audit' });
    expect(resolveStructuredActionInput('/sync')).toEqual({ kind: 'picker', family: 'sync' });
    expect(resolveStructuredActionInput('/audit gate')).toEqual({ kind: 'prompt', command: '/audit gate' });
    expect(resolveStructuredActionInput('/audit 1')).toEqual({ kind: 'prompt', command: '/audit gate' });
    expect(resolveStructuredActionInput('/doctor')).toBeNull();
  });

  it.each(['/sync 3', '/sync apply unexpected', '/audit forward', '/audit retention', '/audit gate --json', '/audit gate ../outside', '/audit gate query', '/audit query one two', '/audit compliance one two'])('rejects %s without selecting an action', (input) => {
    expect(resolveStructuredActionInput(input)).toEqual({ kind: 'invalid' });
  });

  it.each(['verify', 'C:outside', 'a\u001b[2J', 'a\nnext', 'a/b', 'a\\b'])('rejects unsafe or reserved gate id %j', (sprintId) => {
    expect(cliArgsForStructuredActionRequest({ kind: 'audit-gate', sprintId })).toBeNull();
    expect(cliArgsForStructuredActionRequest({ kind: 'audit-compliance', sprintId })).toBeNull();
  });

  it.each(['channel\u001b[2J', 'channel\nnext', 'channel\u202etxt'])('keeps terminal controls out of confirmation filters %j', (channel) => {
    expect(cliArgsForStructuredActionRequest({ kind: 'audit-query', channel })).toBeNull();
  });
});
