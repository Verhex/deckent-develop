// ─── Token Counter ──────────────────────────────────────────────────────────
// Estimates token counts for prompts. Pure logic, no fs.

// ─── Types ──────────────────────────────────────────────────────────

export type ModelName = 'opus' | 'sonnet' | 'haiku';

export interface TokenBudget {
  opus: number;
  sonnet: number;
  haiku: number;
}

export interface PromptSizeEstimate {
  agentTokens: number;
  skillTokens: number;
  taskTokens: number;
  totalTokens: number;
  model: ModelName;
  withinBudget: boolean;
}

export interface BudgetWarning {
  model: ModelName;
  estimated: number;
  budget: number;
  overBy: number;
  percentOver: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const WORDS_PER_TOKEN = 0.75;

const DEFAULT_BUDGETS: TokenBudget = {
  opus: 200000,
  sonnet: 200000,
  haiku: 200000,
};

// ─── TokenCounter ───────────────────────────────────────────────────

export class TokenCounter {
  private _budgets: TokenBudget;

  constructor(budgets: Partial<TokenBudget> = {}) {
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
    model: ModelName,
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
  isWithinBudget(tokens: number, model: ModelName): boolean {
    const budget = this._budgets[model];
    return tokens <= budget;
  }

  /**
   * Get a warning if the token count exceeds the budget.
   * Returns null if within budget.
   */
  warnIfExceeding(tokens: number, model: ModelName): BudgetWarning | null {
    const budget = this._budgets[model];
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
  getBudget(model: ModelName): number {
    return this._budgets[model];
  }

  /**
   * Update the budget for a specific model.
   */
  setBudget(model: ModelName, budget: number): void {
    this._budgets[model] = budget;
  }
}
