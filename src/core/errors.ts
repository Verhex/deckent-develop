// ─── DeckentError ───────────────────────────────────────────────────

export class DeckentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly suggestion?: string,
    public readonly docLink?: string,
  ) {
    super(message);
    this.name = 'DeckentError';
  }
}

// ─── Error Entry ────────────────────────────────────────────────────

export interface ErrorEntry {
  message: string;
  suggestion: string;
  docLink?: string;
}

// ─── Error Registry ─────────────────────────────────────────────────

const registry = new Map<string, ErrorEntry>();

// Pre-populate registry
registry.set('DECKENT_E001', {
  message: 'tmux not found',
  suggestion: 'Install: brew install tmux (macOS) / sudo apt install tmux (Linux). Or use spawn_backend: "subprocess"',
});

registry.set('DECKENT_E002', {
  message: 'claude CLI not found',
  suggestion: 'Install: npm install -g @anthropic-ai/claude-code',
});

registry.set('DECKENT_E003', {
  message: 'no DIRECTIVES.md',
  suggestion: 'Create DIRECTIVES.md with sprint goals, or run: deckent init',
});

registry.set('DECKENT_E004', {
  message: 'config invalid',
  suggestion: 'Run: deckent doctor to diagnose',
});

registry.set('DECKENT_E005', {
  message: 'scope violation',
  suggestion: 'Worker exceeded assigned scope',
});

registry.set('DECKENT_E006', {
  message: 'lock conflict',
  suggestion: 'Another worker holds the lock, wait or run: deckent cleanup',
});

registry.set('DECKENT_E007', {
  message: 'usage exceeded',
  suggestion: 'Usage threshold reached, sprint auto-paused',
});

registry.set('DECKENT_E008', {
  message: 'build failed',
  suggestion: 'Run: tsc --noEmit to check errors',
});

registry.set('DECKENT_E009', {
  message: 'git not found',
  suggestion: 'Install git',
});

registry.set('DECKENT_E010', {
  message: 'node version too low',
  suggestion: 'Upgrade Node.js to >=18',
});

// ─── CLI Error Codes (DECKENT_E020-E039) ─────────────────────────────

registry.set('DECKENT_E020', {
  message: 'config file not found',
  suggestion: 'Run: deckent init to create a project config, or verify the config path',
});

registry.set('DECKENT_E021', {
  message: 'import file not found',
  suggestion: 'Verify the import file path exists and is accessible',
});

registry.set('DECKENT_E022', {
  message: 'invalid JSON in import file',
  suggestion: 'Validate the JSON syntax in the import file (use a JSON linter)',
});

registry.set('DECKENT_E023', {
  message: 'skill manifest not found',
  suggestion: 'Ensure the skill directory contains a valid manifest.json',
});

registry.set('DECKENT_E024', {
  message: 'invalid skill name',
  suggestion: 'Use alphanumeric characters and hyphens only (max 64 chars)',
});

registry.set('DECKENT_E025', {
  message: 'skill already exists',
  suggestion: 'Use --force to overwrite, or choose a different name',
});

registry.set('DECKENT_E026', {
  message: 'git clone failed',
  suggestion: 'Check the URL, your network connection, and git credentials',
});

registry.set('DECKENT_E027', {
  message: 'cloned repo missing manifest',
  suggestion: 'The cloned repository must contain a manifest.json at the root',
});

registry.set('DECKENT_E028', {
  message: 'invalid manifest.json',
  suggestion: 'manifest.json must contain id, name, and version fields',
});

registry.set('DECKENT_E029', {
  message: 'source path not found',
  suggestion: 'Verify the source path exists and is accessible',
});

registry.set('DECKENT_E030', {
  message: 'source must be a directory',
  suggestion: 'Provide a directory path containing the skill files',
});

registry.set('DECKENT_E031', {
  message: 'agent config not found',
  suggestion: 'Ensure the agent directory contains agent.json',
});

registry.set('DECKENT_E032', {
  message: 'invalid agent name',
  suggestion: 'Use alphanumeric characters and hyphens only (max 64 chars)',
});

registry.set('DECKENT_E033', {
  message: 'agent already exists',
  suggestion: 'Use a different name or remove the existing agent first',
});

registry.set('DECKENT_E034', {
  message: 'manifest not found for publish',
  suggestion: 'Run from a skill directory that contains manifest.json',
});

registry.set('DECKENT_E035', {
  message: 'failed to parse manifest',
  suggestion: 'Check manifest.json for syntax errors',
});

registry.set('DECKENT_E036', {
  message: 'not authenticated for marketplace',
  suggestion: 'Run: deckent config set --global marketplace_token <token>',
});

registry.set('DECKENT_E037', {
  message: 'malformed global config',
  suggestion: 'Fix or delete the global config file at ~/.deckent/config.json',
});

registry.set('DECKENT_E038', {
  message: 'failed to read config file',
  suggestion: 'Check file permissions and JSON syntax',
});

registry.set('DECKENT_E039', {
  message: 'skill name must be non-empty',
  suggestion: 'Provide a valid non-empty skill name string',
});

// ─── Orchestra Error Codes (DECKENT_E040-E059) ──────────────────────

registry.set('DECKENT_E040', {
  message: 'pipeline must have at least 1 step',
  suggestion: 'Provide at least one PipelineStep with agentId and phase',
});

registry.set('DECKENT_E041', {
  message: 'pipeline step has invalid agentId',
  suggestion: 'Each pipeline step must have a non-empty string agentId',
});

registry.set('DECKENT_E042', {
  message: 'pipeline step has invalid phase',
  suggestion: 'Each pipeline step must have a non-empty string phase',
});

registry.set('DECKENT_E043', {
  message: 'pipeline has duplicate phase',
  suggestion: 'Each phase in the pipeline must be unique',
});

registry.set('DECKENT_E044', {
  message: 'shared memory write: invalid key',
  suggestion: 'SharedMemory.write requires a non-empty string key',
});

registry.set('DECKENT_E045', {
  message: 'shared memory write: invalid writerId',
  suggestion: 'SharedMemory.write requires a non-empty string writerId',
});

registry.set('DECKENT_E046', {
  message: 'handoff: missing task IDs',
  suggestion: 'Both fromTaskId and toTaskId are required for createHandoff',
});

registry.set('DECKENT_E047', {
  message: 'handoff: empty artifacts',
  suggestion: 'Provide at least one artifact path for the handoff',
});

registry.set('DECKENT_E048', {
  message: 'handoff not found',
  suggestion: 'Verify the handoff ID exists in .tasks/handoffs/',
});

registry.set('DECKENT_E049', {
  message: 'circular dependency detected',
  suggestion: 'Review task dependencies to remove cycles',
});

registry.set('DECKENT_E050', {
  message: 'failed to stash changes',
  suggestion: 'Resolve git conflicts or commit changes before creating a safety point',
});

registry.set('DECKENT_E051', {
  message: 'failed to get commit SHA',
  suggestion: 'Ensure you are inside a git repository with at least one commit',
});

registry.set('DECKENT_E052', {
  message: 'failed to create safety branch',
  suggestion: 'Check git permissions and branch name conflicts',
});

registry.set('DECKENT_E053', {
  message: 'rating must be 1-5 integer',
  suggestion: 'Provide an integer rating between 1 and 5',
});

// ─── Agent Error Codes (DECKENT_E060-E079) ──────────────────────────

registry.set('DECKENT_E060', {
  message: 'invalid JSON in task file',
  suggestion: 'Check the task file for JSON syntax errors',
});

registry.set('DECKENT_E061', {
  message: 'task file not found',
  suggestion: 'Verify the task ID and that .tasks/ directory contains the task file',
});

registry.set('DECKENT_E062', {
  message: 'shared context write: invalid key',
  suggestion: 'SharedContext.write requires a non-empty string key',
});

registry.set('DECKENT_E063', {
  message: 'shared context write: invalid agentId',
  suggestion: 'SharedContext.write requires a non-empty string agentId',
});

registry.set('DECKENT_E064', {
  message: 'agent already has active experiment',
  suggestion: 'Complete or cancel the existing experiment before creating a new one',
});

registry.set('DECKENT_E065', {
  message: 'experiment not found',
  suggestion: 'Verify the experiment ID exists in .deckent/experiments/',
});

registry.set('DECKENT_E066', {
  message: 'experiment is not active',
  suggestion: 'Only active experiments can accept new results',
});

// ─── ErrorRegistry API ──────────────────────────────────────────────

export const ErrorRegistry = {
  /**
   * Get an error entry by code. Returns undefined if not found.
   */
  get(code: string): ErrorEntry | undefined {
    return registry.get(code);
  },

  /**
   * Check if a code exists in the registry.
   */
  has(code: string): boolean {
    return registry.has(code);
  },

  /**
   * Get all registered error entries.
   */
  getAll(): Map<string, ErrorEntry> {
    return new Map(registry);
  },

  /**
   * Create a DeckentError from a registry code.
   * Optionally override message/suggestion.
   */
  createError(code: string, overrides?: { message?: string; suggestion?: string }): DeckentError {
    const entry = registry.get(code);
    if (!entry) {
      return new DeckentError(code, overrides?.message ?? `Unknown error: ${code}`, overrides?.suggestion);
    }
    return new DeckentError(
      code,
      overrides?.message ?? entry.message,
      overrides?.suggestion ?? entry.suggestion,
      entry.docLink,
    );
  },

  /**
   * Register a new error code (for extensibility / plugins).
   */
  register(code: string, entry: ErrorEntry): void {
    registry.set(code, entry);
  },
} as const;
