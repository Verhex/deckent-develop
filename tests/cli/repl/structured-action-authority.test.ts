import { describe, expect, it, vi } from 'vitest';
import {
  buildStructuredActionDispatcher,
  buildStructuredActionLabels,
  type StructuredActionDispatcherDeps,
} from '../../../src/cli/repl/run.js';
import type { CliStructuredActionRequest } from '../../../src/cli/helpers/cli-tool-capture.js';
import type { CliStructuredActionResult } from '../../../src/cli/commands/chat-tool-bridge.js';

const t = (key: string): string => ({
  'tui.confirm_run': 'Run',
  'tui.cmd_cancelled': 'cancelled',
  'tui.structured_action.invalid': 'invalid',
}[key] ?? key);

function deps(overrides: Partial<StructuredActionDispatcherDeps> = {}) {
  const dispatchStructuredAction = vi.fn(async (request: CliStructuredActionRequest) => (
    { request, rendered: 'captured' } as CliStructuredActionResult
  ));
  return {
    cliDispatcher: { dispatchStructuredAction },
    askConfirm: vi.fn(async () => true),
    askConfirmAlways: vi.fn(async () => true),
    t,
    ...overrides,
  } satisfies StructuredActionDispatcherDeps;
}

describe('buildStructuredActionDispatcher', () => {
  it.each([
    [{ kind: 'sync', mode: 'preview' }, 'Run: deckent sync --dry-run --json', 'deckent_sync', { mode: 'preview' }],
    [{ kind: 'sync', mode: 'apply' }, 'Run: deckent sync --json', 'deckent_sync', { mode: 'apply' }],
    [{ kind: 'audit-gate', sprintId: 'sprint-7099' }, 'Run: deckent audit sprint-7099 --json', 'deckent_audit', { action: 'gate', sprintId: 'sprint-7099' }],
  ] as const)('confirms the canonical projection before one capture: %j', async (request, summary, tool, args) => {
    const collaborators = deps();
    const dispatch = buildStructuredActionDispatcher(collaborators);

    const outcome = await dispatch(request);

    expect(collaborators.askConfirm).toHaveBeenCalledOnce();
    expect(collaborators.askConfirm).toHaveBeenCalledWith(summary, tool, args);
    expect(collaborators.askConfirmAlways).not.toHaveBeenCalled();
    expect(collaborators.cliDispatcher.dispatchStructuredAction).toHaveBeenCalledOnce();
    expect(collaborators.cliDispatcher.dispatchStructuredAction).toHaveBeenCalledWith(request);
    expect(outcome).toMatchObject({ kind: 'captured', result: { request } });
  });

  it.each([
    { kind: 'audit-query' } as const,
    { kind: 'audit-query', channel: 'approval.decided' } as const,
    { kind: 'audit-compliance' } as const,
    { kind: 'audit-compliance', sprintId: 'sprint-7099' } as const,
  ])('runs read-classified audit action without a confirmation: %j', async (request) => {
    const collaborators = deps();
    const outcome = await buildStructuredActionDispatcher(collaborators)(request);

    expect(outcome.kind).toBe('captured');
    expect(collaborators.askConfirm).not.toHaveBeenCalled();
    expect(collaborators.askConfirmAlways).not.toHaveBeenCalled();
    expect(collaborators.cliDispatcher.dispatchStructuredAction).toHaveBeenCalledOnce();
  });

  it('denial returns the exact argv summary and performs zero capture', async () => {
    const collaborators = deps({ askConfirm: vi.fn(async () => false) });
    const outcome = await buildStructuredActionDispatcher(collaborators)({ kind: 'sync', mode: 'apply' });

    expect(outcome).toEqual({ kind: 'denied', rendered: '[cancelled] deckent sync --json' });
    expect(collaborators.cliDispatcher.dispatchStructuredAction).not.toHaveBeenCalled();
  });

  it('rejects a forged request before confirmation or capture', async () => {
    const collaborators = deps();
    const dispatch = buildStructuredActionDispatcher(collaborators);
    const outcome = await dispatch({ kind: 'audit-gate', sprintId: '--json', extra: true } as unknown as CliStructuredActionRequest);

    expect(outcome).toEqual({ kind: 'denied', rendered: 'invalid' });
    expect(collaborators.askConfirm).not.toHaveBeenCalled();
    expect(collaborators.askConfirmAlways).not.toHaveBeenCalled();
    expect(collaborators.cliDispatcher.dispatchStructuredAction).not.toHaveBeenCalled();
  });

  it('rejects null at the public runtime boundary without policy or capture work', async () => {
    const collaborators = deps();
    const outcome = await buildStructuredActionDispatcher(collaborators)(null as unknown as CliStructuredActionRequest);

    expect(outcome).toEqual({ kind: 'denied', rendered: 'invalid' });
    expect(collaborators.askConfirm).not.toHaveBeenCalled();
    expect(collaborators.askConfirmAlways).not.toHaveBeenCalled();
    expect(collaborators.cliDispatcher.dispatchStructuredAction).not.toHaveBeenCalled();
  });

  it('binds approval and capture to one immutable snapshot despite caller mutation while confirmation waits', async () => {
    let release!: (allowed: boolean) => void;
    const waiting = new Promise<boolean>((resolve) => { release = resolve; });
    const askConfirm = vi.fn(async () => waiting);
    const collaborators = deps({ askConfirm });
    const mutable = { kind: 'sync', mode: 'preview' } as CliStructuredActionRequest;

    const pending = buildStructuredActionDispatcher(collaborators)(mutable);
    await vi.waitFor(() => expect(askConfirm).toHaveBeenCalledOnce());
    (mutable as { mode: string }).mode = 'apply';
    release(true);
    const outcome = await pending;

    expect(askConfirm).toHaveBeenCalledWith('Run: deckent sync --dry-run --json', 'deckent_sync', { mode: 'preview' });
    expect(collaborators.cliDispatcher.dispatchStructuredAction).toHaveBeenCalledWith({ kind: 'sync', mode: 'preview' });
    const captured = collaborators.cliDispatcher.dispatchStructuredAction.mock.calls[0]?.[0];
    expect(Object.isFrozen(captured)).toBe(true);
    expect(outcome).toMatchObject({ kind: 'captured', result: { request: { kind: 'sync', mode: 'preview' } } });
  });

  it('injects all action labels without mechanism-owned prose', () => {
    const labels = buildStructuredActionLabels((key) => `label:${key}`);
    expect(labels).toEqual({
      syncTitle: 'label:tui.structured_action.sync_title',
      auditTitle: 'label:tui.structured_action.audit_title',
      preview: 'label:tui.structured_action.preview',
      apply: 'label:tui.structured_action.apply',
      gate: 'label:tui.structured_action.gate',
      query: 'label:tui.structured_action.query',
      compliance: 'label:tui.structured_action.compliance',
      gatePrompt: 'label:tui.structured_action.gate_prompt',
      invalid: 'label:tui.structured_action.invalid',
      busy: 'label:tui.structured_action.busy',
    });
  });
});
