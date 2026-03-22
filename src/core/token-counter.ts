// ─── Token Counter ──────────────────────────────────────────────────────────
// Estimates token counts for prompts. Pure logic, no fs.

import type { ModelType } from './task-types.js';

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

const DEFAULT_BUDGETS: TokenBudget = {
  opus: DEFAULT_BUDGET,
  sonnet: DEFAULT_BUDGET,
  haiku: DEFAULT_BUDGET,
  'gpt-4.1': DEFAULT_BUDGET,
  o3: DEFAULT_BUDGET,
  'o4-mini': DEFAULT_BUDGET,
  'gemini-2.5-pro': DEFAULT_BUDGET,
  'gemini-2.5-flash': DEFAULT_BUDGET,
};

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
}
