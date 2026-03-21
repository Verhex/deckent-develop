import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Pipeline Types ─────────────────────────────────────────────────

interface PipelineStep {
  agentName: string;
  action: string;
}

interface PipelineContext {
  taskId: string;
  title: string;
  results: Array<{
    agentName: string;
    action: string;
    success: boolean;
    output: string;
  }>;
  aborted: boolean;
  abortReason?: string;
}

type StepExecutor = (step: PipelineStep, context: PipelineContext) => Promise<{ success: boolean; output: string }>;

/**
 * Execute a multi-agent pipeline sequentially.
 * Each step receives the shared context with all prior results.
 * Aborts on failure unless continueOnError is true.
 */
async function runPipeline(
  steps: PipelineStep[],
  taskId: string,
  title: string,
  executor: StepExecutor,
  options?: { continueOnError?: boolean },
): Promise<PipelineContext> {
  const context: PipelineContext = {
    taskId,
    title,
    results: [],
    aborted: false,
  };

  for (const step of steps) {
    try {
      const result = await executor(step, context);
      context.results.push({
        agentName: step.agentName,
        action: step.action,
        success: result.success,
        output: result.output,
      });

      if (!result.success && !options?.continueOnError) {
        context.aborted = true;
        context.abortReason = `Step "${step.action}" by ${step.agentName} failed: ${result.output}`;
        break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      context.results.push({
        agentName: step.agentName,
        action: step.action,
        success: false,
        output: `Error: ${message}`,
      });

      if (!options?.continueOnError) {
        context.aborted = true;
        context.abortReason = `Step "${step.action}" by ${step.agentName} threw: ${message}`;
        break;
      }
    }
  }

  return context;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Multi-Agent Pipeline Integration', () => {
  let mockExecutor: StepExecutor;

  beforeEach(() => {
    mockExecutor = vi.fn().mockResolvedValue({ success: true, output: 'ok' });
  });

  // ─── Sequential Execution ─────────────────────────────────────

  it('executes all steps sequentially', async () => {
    const steps: PipelineStep[] = [
      { agentName: 'code-reviewer', action: 'review' },
      { agentName: 'test-writer', action: 'write-tests' },
    ];

    const ctx = await runPipeline(steps, 'task-001', 'Fix auth bug', mockExecutor);

    expect(ctx.results).toHaveLength(2);
    expect(ctx.results[0]!.agentName).toBe('code-reviewer');
    expect(ctx.results[1]!.agentName).toBe('test-writer');
    expect(ctx.aborted).toBe(false);
  });

  it('calls executor with correct step and context', async () => {
    const steps: PipelineStep[] = [
      { agentName: 'code-reviewer', action: 'review' },
    ];

    await runPipeline(steps, 'task-002', 'Refactor utils', mockExecutor);

    expect(mockExecutor).toHaveBeenCalledWith(
      { agentName: 'code-reviewer', action: 'review' },
      expect.objectContaining({ taskId: 'task-002', title: 'Refactor utils' }),
    );
  });

  it('passes accumulated results to subsequent steps', async () => {
    let capturedResultsLength = -1;
    let capturedFirstOutput = '';
    const executorSpy = vi.fn()
      .mockImplementationOnce(async () => {
        return { success: true, output: 'reviewed' };
      })
      .mockImplementationOnce(async (_step: PipelineStep, ctx: PipelineContext) => {
        // Capture the results length at the time the second step runs
        capturedResultsLength = ctx.results.length;
        capturedFirstOutput = ctx.results[0]?.output ?? '';
        return { success: true, output: 'tested' };
      });

    const steps: PipelineStep[] = [
      { agentName: 'code-reviewer', action: 'review' },
      { agentName: 'test-writer', action: 'write-tests' },
    ];

    await runPipeline(steps, 'task-003', 'Update API', executorSpy);

    // When the second step runs, context should have the first result
    expect(capturedResultsLength).toBe(1);
    expect(capturedFirstOutput).toBe('reviewed');
  });

  // ─── Abort on Failure ─────────────────────────────────────────

  it('aborts pipeline on step failure', async () => {
    const executorSpy = vi.fn()
      .mockResolvedValueOnce({ success: false, output: 'review found critical issues' })
      .mockResolvedValueOnce({ success: true, output: 'should not run' });

    const steps: PipelineStep[] = [
      { agentName: 'code-reviewer', action: 'review' },
      { agentName: 'test-writer', action: 'write-tests' },
    ];

    const ctx = await runPipeline(steps, 'task-004', 'Fix bug', executorSpy);

    expect(ctx.aborted).toBe(true);
    expect(ctx.abortReason).toContain('code-reviewer');
    expect(ctx.results).toHaveLength(1);
    expect(executorSpy).toHaveBeenCalledTimes(1);
  });

  it('aborts pipeline on executor throw', async () => {
    const executorSpy = vi.fn()
      .mockRejectedValueOnce(new Error('network timeout'));

    const steps: PipelineStep[] = [
      { agentName: 'code-reviewer', action: 'review' },
      { agentName: 'test-writer', action: 'write-tests' },
    ];

    const ctx = await runPipeline(steps, 'task-005', 'Task', executorSpy);

    expect(ctx.aborted).toBe(true);
    expect(ctx.abortReason).toContain('network timeout');
    expect(ctx.results).toHaveLength(1);
    expect(ctx.results[0]!.success).toBe(false);
  });

  // ─── Continue on Error ────────────────────────────────────────

  it('continues pipeline when continueOnError is true', async () => {
    const executorSpy = vi.fn()
      .mockResolvedValueOnce({ success: false, output: 'review failed' })
      .mockResolvedValueOnce({ success: true, output: 'tests written' });

    const steps: PipelineStep[] = [
      { agentName: 'code-reviewer', action: 'review' },
      { agentName: 'test-writer', action: 'write-tests' },
    ];

    const ctx = await runPipeline(steps, 'task-006', 'Task', executorSpy, { continueOnError: true });

    expect(ctx.aborted).toBe(false);
    expect(ctx.results).toHaveLength(2);
    expect(ctx.results[0]!.success).toBe(false);
    expect(ctx.results[1]!.success).toBe(true);
  });

  it('continues pipeline on throw when continueOnError is true', async () => {
    const executorSpy = vi.fn()
      .mockRejectedValueOnce(new Error('crash'))
      .mockResolvedValueOnce({ success: true, output: 'recovered' });

    const steps: PipelineStep[] = [
      { agentName: 'code-reviewer', action: 'review' },
      { agentName: 'test-writer', action: 'write-tests' },
    ];

    const ctx = await runPipeline(steps, 'task-007', 'Task', executorSpy, { continueOnError: true });

    expect(ctx.aborted).toBe(false);
    expect(ctx.results).toHaveLength(2);
    expect(ctx.results[0]!.output).toContain('Error: crash');
    expect(ctx.results[1]!.success).toBe(true);
  });

  // ─── Empty Pipeline ───────────────────────────────────────────

  it('handles empty pipeline', async () => {
    const ctx = await runPipeline([], 'task-008', 'Empty', mockExecutor);

    expect(ctx.results).toHaveLength(0);
    expect(ctx.aborted).toBe(false);
    expect(mockExecutor).not.toHaveBeenCalled();
  });

  // ─── Single Step Pipeline ─────────────────────────────────────

  it('handles single step pipeline', async () => {
    const steps: PipelineStep[] = [
      { agentName: 'test-writer', action: 'write-tests' },
    ];

    const ctx = await runPipeline(steps, 'task-009', 'Single', mockExecutor);

    expect(ctx.results).toHaveLength(1);
    expect(ctx.aborted).toBe(false);
  });

  // ─── Context Integrity ────────────────────────────────────────

  it('preserves taskId and title throughout pipeline', async () => {
    const executorSpy = vi.fn().mockResolvedValue({ success: true, output: 'ok' });

    const steps: PipelineStep[] = [
      { agentName: 'a1', action: 'step1' },
      { agentName: 'a2', action: 'step2' },
      { agentName: 'a3', action: 'step3' },
    ];

    const ctx = await runPipeline(steps, 'task-010', 'Context Test', executorSpy);

    expect(ctx.taskId).toBe('task-010');
    expect(ctx.title).toBe('Context Test');

    // Verify each call received the same taskId
    for (const call of executorSpy.mock.calls) {
      const callCtx = call[1] as PipelineContext;
      expect(callCtx.taskId).toBe('task-010');
      expect(callCtx.title).toBe('Context Test');
    }
  });

  it('records all step outputs in correct order', async () => {
    const executorSpy = vi.fn()
      .mockResolvedValueOnce({ success: true, output: 'first' })
      .mockResolvedValueOnce({ success: true, output: 'second' })
      .mockResolvedValueOnce({ success: true, output: 'third' });

    const steps: PipelineStep[] = [
      { agentName: 'a1', action: 'step1' },
      { agentName: 'a2', action: 'step2' },
      { agentName: 'a3', action: 'step3' },
    ];

    const ctx = await runPipeline(steps, 'task-011', 'Order', executorSpy);

    expect(ctx.results.map(r => r.output)).toEqual(['first', 'second', 'third']);
    expect(ctx.results.map(r => r.agentName)).toEqual(['a1', 'a2', 'a3']);
  });

  // ─── Failure at Different Positions ───────────────────────────

  it('aborts at second step, preserving first step result', async () => {
    const executorSpy = vi.fn()
      .mockResolvedValueOnce({ success: true, output: 'step1 ok' })
      .mockResolvedValueOnce({ success: false, output: 'step2 failed' })
      .mockResolvedValueOnce({ success: true, output: 'step3 should not run' });

    const steps: PipelineStep[] = [
      { agentName: 'a1', action: 'step1' },
      { agentName: 'a2', action: 'step2' },
      { agentName: 'a3', action: 'step3' },
    ];

    const ctx = await runPipeline(steps, 'task-012', 'Mid-fail', executorSpy);

    expect(ctx.aborted).toBe(true);
    expect(ctx.results).toHaveLength(2);
    expect(ctx.results[0]!.success).toBe(true);
    expect(ctx.results[1]!.success).toBe(false);
    expect(executorSpy).toHaveBeenCalledTimes(2);
  });

  it('abortReason includes agent name and action', async () => {
    const executorSpy = vi.fn()
      .mockResolvedValueOnce({ success: false, output: 'compilation error' });

    const steps: PipelineStep[] = [
      { agentName: 'code-compiler', action: 'compile' },
    ];

    const ctx = await runPipeline(steps, 'task-013', 'Compile', executorSpy);

    expect(ctx.abortReason).toContain('code-compiler');
    expect(ctx.abortReason).toContain('compile');
    expect(ctx.abortReason).toContain('compilation error');
  });
});
