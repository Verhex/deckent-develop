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
