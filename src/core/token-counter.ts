// ─── Token Counter ──────────────────────────────────────────────────────────
// Estimates token counts for prompts. Pure logic, no fs.

import type { ModelType } from './task-types.js';
import type { ModelDefinition } from './model-registry.js';
import { modelRegistry } from './model-registry.js';

// ─── Types ──────────────────────────────────────────────────────────

/** @deprecated Use ModelType from task-types.ts instead */
export type ModelName = ModelType;

/**
 * Token budget per model. Uses a Record so any ModelType can have a budget.
 * Claude models are provided by default; other providers share the same default.
 */
export type TokenBudget = Record<string, number>;

export interface PromptSizeEstimate {
  agentTokens: number;
  skillTokens: number;
  taskTokens: number;
  totalTokens: number;
  model: ModelType;
  withinBudget: boolean;
}

export interface ContextBudgetEstimate {
  /** Total estimated tokens for the task context */
  estimatedTokens: number;
  /** Model's context window budget */
  modelBudget: number;
  /** Whether the estimated tokens fit within the model budget */
  withinBudget: boolean;
  /** Percentage of model budget used (0-100+) */
  utilizationPercent: number;
}

export interface BudgetWarning {
  model: ModelType;
  estimated: number;
  budget: number;
  overBy: number;
  percentOver: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const WORDS_PER_TOKEN = 0.75;

const DEFAULT_BUDGET = 200000;

/**
 * Derive token budgets from ModelRegistry context windows.
 * Budget = min(contextWindow, DEFAULT_BUDGET) — keeps the safe 200K cap
 * while automatically covering all registered models.
 */
function buildDefaultBudgets(): TokenBudget {
  const budgets: TokenBudget = {};
  for (const model of modelRegistry.getAllModels()) {
    budgets[model.id] = Math.min(model.contextWindow, DEFAULT_BUDGET);
  }
  return budgets;
}

const DEFAULT_BUDGETS: TokenBudget = buildDefaultBudgets();

// ─── TokenCounter ───────────────────────────────────────────────────

export class TokenCounter {
  private _budgets: TokenBudget;

  constructor(budgets: TokenBudget = {}) {
    this._budgets = { ...DEFAULT_BUDGETS, ...budgets };
  }

  /**
   * Estimate token count from text. Uses words / 0.75 approximation.
   */
  countTokens(text: string): number {
    if (!text || typeof text !== 'string') return 0;
    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
    return Math.ceil(words / WORDS_PER_TOKEN);
  }

  /**
   * Estimate the full prompt size for an agent + skills + task.
   */
  estimatePromptSize(
    agentPrompt: string,
    skillContents: string[],
    taskDescription: string,
    model: ModelType,
  ): PromptSizeEstimate {
    const agentTokens = this.countTokens(agentPrompt);
    const skillTokens = skillContents.reduce(
      (sum, content) => sum + this.countTokens(content),
      0,
    );
    const taskTokens = this.countTokens(taskDescription);
    const totalTokens = agentTokens + skillTokens + taskTokens;
    const withinBudget = this.isWithinBudget(totalTokens, model);

    return {
      agentTokens,
      skillTokens,
      taskTokens,
      totalTokens,
      model,
      withinBudget,
    };
  }

  /**
   * Check if a token count is within the budget for a model.
   */
  isWithinBudget(tokens: number, model: ModelType): boolean {
    const budget = this._budgets[model] ?? DEFAULT_BUDGET;
    return tokens <= budget;
  }

  /**
   * Get a warning if the token count exceeds the budget.
   * Returns null if within budget.
   */
  warnIfExceeding(tokens: number, model: ModelType): BudgetWarning | null {
    const budget = this._budgets[model] ?? DEFAULT_BUDGET;
    if (tokens <= budget) return null;

    const overBy = tokens - budget;
    const percentOver = Math.round((overBy / budget) * 100);

    return {
      model,
      estimated: tokens,
      budget,
      overBy,
      percentOver,
    };
  }

  /**
   * Format a warning message from a BudgetWarning.
   */
  formatWarning(warning: BudgetWarning): string {
    return `Token budget exceeded for model "${warning.model}": estimated ${warning.estimated} tokens, budget is ${warning.budget} (${warning.percentOver}% over).`;
  }

  /**
   * Get the budget for a specific model.
   */
  getBudget(model: ModelType): number {
    return this._budgets[model] ?? DEFAULT_BUDGET;
  }

  /**
   * Update the budget for a specific model.
   */
  setBudget(model: ModelType, budget: number): void {
    this._budgets[model] = budget;
  }

  /**
   * Estimate the full context budget for a task including scope files, agent prompt,
   * skill prompts, and system overhead.
   *
   * @param scopeFileLineCount - Total line count of all files in the task's scope
   * @param agentPrompt - Agent system prompt text
   * @param skillPrompts - Array of skill prompt texts
   * @param model - Target model for budget comparison
   * @param avgTokensPerLine - Average tokens per source line (default 10)
   * @returns Context budget estimate with utilization percentage
   */
  estimateTaskContextBudget(
    scopeFileLineCount: number,
    agentPrompt: string,
    skillPrompts: string[],
    model: ModelType,
    avgTokensPerLine = 10,
  ): ContextBudgetEstimate {
    const SYSTEM_PROMPT_OVERHEAD = 2000;

    const scopeTokens = scopeFileLineCount * avgTokensPerLine;
    const agentTokens = this.countTokens(agentPrompt);
    const skillTokens = skillPrompts.reduce(
      (sum, content) => sum + this.countTokens(content),
      0,
    );

    const estimatedTokens = scopeTokens + agentTokens + skillTokens + SYSTEM_PROMPT_OVERHEAD;

    // Use model's contextWindow from registry as the budget
    const modelDef: ModelDefinition | undefined = modelRegistry.get(model);
    const modelBudget = modelDef?.contextWindow ?? DEFAULT_BUDGET;

    const withinBudget = estimatedTokens <= modelBudget;
    const utilizationPercent = modelBudget > 0
      ? Math.round((estimatedTokens / modelBudget) * 100)
      : 0;

    return { estimatedTokens, modelBudget, withinBudget, utilizationPercent };
  }
}
