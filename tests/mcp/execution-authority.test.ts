import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerExecutionAuthorityTool } from '../../src/mcp/tools/execution-authority.js';
import {
  ExecutionLockError,
  type ExecutionLockMountAdoptionResult,
} from '../../src/core/file-lock.js';

type Handler = (input: {
  action?: 'mount-adopt';
  apply?: boolean;
  operator?: string;
  justification?: string;
}) => Promise<{
  content: readonly [{ type: 'text'; text: string }];
  isError?: boolean;
}>;

interface Capture {
  readonly name: string;
  readonly config: {
    annotations?: {
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
    };
  };
  readonly handler: Handler;
}

function canonicalResult(
  decision: ExecutionLockMountAdoptionResult['decision'],
): ExecutionLockMountAdoptionResult {
  return {
    schemaVersion: 1,
    decision,
    authorityEpoch: '10000000-0000-4000-8000-000000000001',
    previous: {
      projectDev: '1',
      projectIno: '2',
      locksDev: '1',
      locksIno: '3',
      mountId: '41',
    },
    current: {
      projectDev: '1',
      projectIno: '2',
      locksDev: '1',
      locksIno: '3',
      mountId: '42',
    },
    evidenceRefs: ['authority-epoch:10000000-0000-4000-8000-000000000001'],
  };
}

function register(adoptMount: ReturnType<typeof vi.fn>): Capture {
  let captured: Capture | undefined;
  const server = {
    registerTool(name: string, config: Capture['config'], handler: Handler) {
      captured = { name, config, handler };
    },
  };
  registerExecutionAuthorityTool(server as unknown as McpServer, {
    resolveProjectRoot: () => '/project',
    adoptMount,
    now: () => Date.parse('2026-07-28T12:00:00.000Z'),
  });
  if (!captured) throw new Error('tool was not registered');
  return captured;
}

function body(result: Awaited<ReturnType<Handler>>): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe('deckent_execution_authority MCP tool', () => {
  it('registers as an idempotent mutating, non-destructive tool', () => {
    const captured = register(vi.fn(() => canonicalResult('eligible')));

    expect(captured.name).toBe('deckent_execution_authority');
    expect(captured.config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it('uses the shared core authority in dry-run mode by default', async () => {
    const adoptMount = vi.fn(() => canonicalResult('eligible'));
    const captured = register(adoptMount);

    const response = await captured.handler({});

    expect(adoptMount).toHaveBeenCalledWith('/project', {
      apply: undefined,
      now: expect.any(Function),
    });
    expect(body(response)).toMatchObject({
      schemaVersion: 1,
      tool: 'deckent_execution_authority',
      action: 'mount-adopt',
      mode: 'dry-run',
      decision: 'eligible',
    });
    expect(response.isError).toBeUndefined();
  });

  it('refuses apply before core mutation without explicit attestation', async () => {
    const adoptMount = vi.fn(() => canonicalResult('adopted'));
    const captured = register(adoptMount);

    const response = await captured.handler({
      action: 'mount-adopt',
      apply: true,
      operator: 'operator-1',
    });

    expect(adoptMount).not.toHaveBeenCalled();
    expect(response.isError).toBe(true);
    expect(body(response)).toMatchObject({
      error: true,
      code: 'operator-attestation-required',
    });
  });

  it('forwards apply attestation and returns the canonical evidence DTO', async () => {
    const adoptMount = vi.fn(() => canonicalResult('adopted'));
    const captured = register(adoptMount);

    const response = await captured.handler({
      action: 'mount-adopt',
      apply: true,
      operator: 'operator-1',
      justification: 'verified remount',
    });

    expect(adoptMount).toHaveBeenCalledWith('/project', {
      apply: true,
      operatorId: 'operator-1',
      justification: 'verified remount',
      now: expect.any(Function),
    });
    expect(body(response)).toMatchObject({
      mode: 'apply',
      decision: 'adopted',
      previous: { mountId: '41' },
      current: { mountId: '42' },
    });
  });

  it('returns only a typed reason and never leaks internal authority paths', async () => {
    const adoptMount = vi.fn(() => {
      throw new ExecutionLockError(
        'sensitive internal authority path',
        'unknown',
        'project-active',
      );
    });
    const captured = register(adoptMount);

    const response = await captured.handler({});
    const parsed = body(response);

    expect(response.isError).toBe(true);
    expect(parsed).toMatchObject({ error: true, code: 'project-active' });
    expect(JSON.stringify(parsed)).not.toContain('sensitive internal authority path');
  });
});
