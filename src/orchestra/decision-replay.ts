// ─── Decision Replay ───────────────────────────────────────────────────────
// Re-run decisions and compare results for diagnostic purposes.
import type { Task } from '../core/types.js';
import type { DecisionResult, DecisionLogEntry } from '../core/decision-types.js';
import type { DecisionOrchestrator } from './decision-engine.js';
import type { DecisionLogger } from './decision-logger.js';

// ─── Replay Result ─────────────────────────────────────────────────────────

export interface ReplayResult {
  taskId: string;
  original: { steps: DecisionLogEntry[]; decidedAt: string } | null;
  replayed: DecisionResult;
  diffs: string[];
  drifted: boolean;
}

// ─── replayDecision ────────────────────────────────────────────────────────

/**
 * Replay a decision for a task: read the original log, re-run the engine,
 * and diff the results.
 */
export function replayDecision(
  task: Task,
  engine: DecisionOrchestrator,
  logger: DecisionLogger,
): ReplayResult {
  const original = logger.readDecisionLog(task.id);
  const replayed = engine.decide(task);

  let diffs: string[] = [];
  let drifted = false;

  if (original) {
    diffs = diffDecisionLogs(original.steps, replayed.decisionLog);
    drifted = diffs.length > 0;
  } else {
    diffs = ['No original decision log found -- cannot compare'];
    drifted = true;
  }

  return {
    taskId: task.id,
    original,
    replayed,
    diffs,
    drifted,
  };
}

// ─── diffDecisions ─────────────────────────────────────────────────────────

/**
 * Compare two DecisionResult objects and return a list of human-readable differences.
 */
export function diffDecisions(a: DecisionResult, b: DecisionResult): string[] {
  const diffs: string[] = [];

  // Compare analysis
  if (a.analysis.type !== b.analysis.type) {
    diffs.push(`TaskType changed: ${a.analysis.type} -> ${b.analysis.type}`);
  }
  if (a.analysis.complexity !== b.analysis.complexity) {
    diffs.push(`Complexity changed: ${a.analysis.complexity} -> ${b.analysis.complexity}`);
  }

  // Compare agent
  const aAgentId = a.agent?.id ?? 'none';
  const bAgentId = b.agent?.id ?? 'none';
  if (aAgentId !== bAgentId) {
    diffs.push(`Agent changed: ${aAgentId} -> ${bAgentId}`);
  }

  // Compare skills
  const aSkillIds = a.skills.map(s => s.id).sort().join(',');
  const bSkillIds = b.skills.map(s => s.id).sort().join(',');
  if (aSkillIds !== bSkillIds) {
    diffs.push(`Skills changed: [${aSkillIds || 'none'}] -> [${bSkillIds || 'none'}]`);
  }

  // Compare model
  if (a.model !== b.model) {
    diffs.push(`Model changed: ${a.model} -> ${b.model}`);
  }

  // Compare effort
  if (a.effort !== b.effort) {
    diffs.push(`Effort changed: ${a.effort} -> ${b.effort}`);
  }

  // Compare scope directories
  const aDirs = [...a.scope.directories].sort().join(',');
  const bDirs = [...b.scope.directories].sort().join(',');
  if (aDirs !== bDirs) {
    diffs.push(`Scope directories changed: [${aDirs}] -> [${bDirs}]`);
  }

  // Compare scope filesWrite
  const aFiles = [...a.scope.filesWrite].sort().join(',');
  const bFiles = [...b.scope.filesWrite].sort().join(',');
  if (aFiles !== bFiles) {
    diffs.push(`Scope filesWrite changed: [${aFiles}] -> [${bFiles}]`);
  }

  return diffs;
}

// ─── diffDecisionLogs ──────────────────────────────────────────────────────

/**
 * Compare two decision log arrays step by step.
 */
function diffDecisionLogs(original: DecisionLogEntry[], replayed: DecisionLogEntry[]): string[] {
  const diffs: string[] = [];

  const maxSteps = Math.max(original.length, replayed.length);
  for (let i = 0; i < maxSteps; i++) {
    const orig = original[i];
    const repl = replayed[i];

    if (!orig) {
      diffs.push(`Step ${i + 1}: new step added -- ${repl?.name ?? 'unknown'}`);
      continue;
    }
    if (!repl) {
      diffs.push(`Step ${i + 1}: step removed -- ${orig.name}`);
      continue;
    }

    if (orig.name !== repl.name) {
      diffs.push(`Step ${orig.step}: name changed: ${orig.name} -> ${repl.name}`);
    }
    if (orig.reasoning !== repl.reasoning) {
      diffs.push(`Step ${orig.step} (${orig.name}): reasoning changed`);
    }
  }

  return diffs;
}
