// ─── Multi-Agent Pipeline ────────────────────────────────────────────────────
// Defines and runs sequential multi-agent pipelines for complex tasks.
import type { Task } from '../core/types.js';
import type { SharedContext } from '../agents/shared-context.js';

// ═══ Types ═══════════════════════════════════════════════════════════════════

export interface PipelineStep {
  agentId: string;
  phase: string;
}

export interface PipelineStepResult {
  agentId: string;
  phase: string;
  status: 'done' | 'failed';
  output?: string;
}

export interface PipelineResult {
  steps: PipelineStepResult[];
  success: boolean;
}

export type PipelineExecutor = (
  step: PipelineStep,
  task: Task,
) => Promise<{ status: 'done' | 'failed'; output?: string }>;

// ═══ Pipeline Definition ════════════════════════════════════════════════════

/**
 * Validate and return a pipeline definition.
 * Requirements:
 * - At least 1 step
 * - No duplicate phases
 * - Every step must have a non-empty agentId and phase
 */
export function definePipeline(steps: PipelineStep[]): PipelineStep[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('Pipeline must have at least 1 step');
  }

  const seenPhases = new Set<string>();
  for (const step of steps) {
    if (!step.agentId || typeof step.agentId !== 'string') {
      throw new Error(`Pipeline step has invalid agentId: ${JSON.stringify(step.agentId)}`);
    }
    if (!step.phase || typeof step.phase !== 'string') {
      throw new Error(`Pipeline step has invalid phase: ${JSON.stringify(step.phase)}`);
    }
    if (seenPhases.has(step.phase)) {
      throw new Error(`Pipeline has duplicate phase: "${step.phase}"`);
    }
    seenPhases.add(step.phase);
  }

  return steps;
}

// ═══ Pipeline Execution ═════════════════════════════════════════════════════

/**
 * Run pipeline steps sequentially.
 * If any step fails, abort remaining steps.
 * Each step's output is written to sharedContext under key "pipeline:{phase}".
 */
export async function runPipeline(
  steps: PipelineStep[],
  task: Task,
  sharedContext: SharedContext,
  executor: PipelineExecutor,
): Promise<PipelineResult> {
  const completedSteps: PipelineStepResult[] = [];

  for (const step of steps) {
    let result: { status: 'done' | 'failed'; output?: string };
    try {
      result = await executor(step, task);
    } catch (err) {
      result = {
        status: 'failed',
        output: err instanceof Error ? err.message : String(err),
      };
    }

    const stepResult: PipelineStepResult = {
      agentId: step.agentId,
      phase: step.phase,
      status: result.status,
      output: result.output,
    };
    completedSteps.push(stepResult);

    // Write step output to shared context
    try {
      sharedContext.write(step.agentId, `pipeline:${step.phase}`, {
        status: result.status,
        output: result.output,
      });
    } catch {
      // Shared context write failure is non-fatal
    }

    // Abort on failure
    if (result.status === 'failed') {
      return {
        steps: completedSteps,
        success: false,
      };
    }
  }

  return {
    steps: completedSteps,
    success: true,
  };
}
