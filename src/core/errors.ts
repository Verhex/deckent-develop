// ─── DeckentError ───────────────────────────────────────────────────

export class DeckentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly suggestion?: string,
    public readonly docLink?: string,
    public readonly whatHappened?: string,
    public readonly why?: string,
    public readonly howToFix?: string[],
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
  whatHappened?: string;
  why?: string;
  howToFix?: string[];
}

// ─── Error Registry ─────────────────────────────────────────────────

const registry = new Map<string, ErrorEntry>();

// Pre-populate registry
registry.set('DECKENT_E001', {
  message: 'tmux not found',
  suggestion: 'Install: brew install tmux (macOS) / sudo apt install tmux (Linux). Or use spawn_backend: "subprocess"',
  whatHappened: 'Deckent could not find tmux on your system.',
  why: 'tmux is required for spawning parallel worker agents in terminal sessions.',
  howToFix: [
    'Install tmux: brew install tmux (macOS) or sudo apt install tmux (Linux)',
    'Or set spawn_backend to "subprocess" in your config: deckent config set spawn_backend subprocess',
  ],
});

registry.set('DECKENT_E002', {
  message: 'claude CLI not found',
  suggestion: 'Install: npm install -g @anthropic-ai/claude-code',
  whatHappened: 'Deckent could not find the Claude CLI tool.',
  why: 'The Claude CLI is required for AI-powered task execution.',
  howToFix: [
    'Install the Claude CLI: npm install -g @anthropic-ai/claude-code',
    'Verify installation: claude --version',
  ],
});

registry.set('DECKENT_E003', {
  message: 'no DIRECTIVES.md',
  suggestion: 'Create DIRECTIVES.md with sprint goals, or run: deckent init',
  whatHappened: "Brain couldn't read your DIRECTIVES.md file.",
  why: "The file is missing or doesn't contain any task definitions.",
  howToFix: [
    'Open or create DIRECTIVES.md in your project root',
    'Add at least one task: ## Task 1: [description]',
    'Run `deckent plan` again',
  ],
});

registry.set('DECKENT_E004', {
  message: 'config invalid',
  suggestion: 'Run: deckent doctor to diagnose',
  whatHappened: 'Your project configuration file is invalid.',
  why: 'The config file has missing or malformed fields.',
  howToFix: [
    'Run `deckent doctor` to see what\'s wrong',
    'Or re-initialize: `deckent init`',
  ],
});

registry.set('DECKENT_E005', {
  message: 'scope violation',
  suggestion: 'Worker exceeded assigned scope',
  whatHappened: 'A worker modified files outside its assigned scope.',
  why: 'Each worker is restricted to specific directories and files to prevent conflicts.',
  howToFix: [
    'Check the task scope in .tasks/task-*.json',
    'Ensure file changes stay within scope.directories and scope.filesWrite',
    'Run `deckent status` to see which worker caused the violation',
  ],
});

registry.set('DECKENT_E006', {
  message: 'lock conflict',
  suggestion: 'Another worker holds the lock, wait or run: deckent cleanup',
  whatHappened: 'A file lock is held by another worker.',
  why: 'Multiple workers tried to modify the same file simultaneously.',
  howToFix: [
    'Wait for the other worker to finish',
    'Or run `deckent cleanup` to clear stale locks',
  ],
});

registry.set('DECKENT_E007', {
  message: 'usage exceeded',
  suggestion: 'Usage threshold reached, sprint auto-paused',
  whatHappened: 'The AI usage threshold has been reached.',
  why: 'Sprint was auto-paused to prevent unexpected costs.',
  howToFix: [
    'Check usage with `deckent status`',
    'Increase the threshold in config: deckent config set usage_limit <amount>',
    'Resume with `deckent start --resume`',
  ],
});

registry.set('DECKENT_E008', {
  message: 'build failed',
  suggestion: 'Run: tsc --noEmit to check errors',
  whatHappened: 'TypeScript build failed with compilation errors.',
  why: 'There are type errors or syntax issues in the code.',
  howToFix: [
    'Run `tsc --noEmit` to see the errors',
    'Fix the reported issues',
    'Run the build again',
  ],
});

registry.set('DECKENT_E009', {
  message: 'git not found',
  suggestion: 'Install git',
  whatHappened: 'Deckent could not find git on your system.',
  why: 'Git is required for version control, safety points, and scope checking.',
  howToFix: [
    'Install git: https://git-scm.com/downloads',
    'Verify installation: git --version',
  ],
});

registry.set('DECKENT_E010', {
  message: 'node version too low',
  suggestion: 'Upgrade Node.js to >=18',
  whatHappened: 'Your Node.js version is below the minimum requirement.',
  why: 'Deckent requires Node.js 18 or higher for ESM support and modern APIs.',
  howToFix: [
    'Upgrade Node.js to version 18 or higher',
    'Use nvm: nvm install 18 && nvm use 18',
    'Verify: node --version',
  ],
});

// ─── CLI Error Codes (DECKENT_E020-E039) ─────────────────────────────

registry.set('DECKENT_E020', {
  message: 'config file not found',
  suggestion: 'Run: deckent init to create a project config, or verify the config path',
  whatHappened: 'Could not find the project configuration file.',
  why: 'The .deckent/ directory may not exist, or the config file was deleted.',
  howToFix: ['Run `deckent init` to create a new project config', 'Or check that .deckent/config.json exists'],
});

registry.set('DECKENT_E021', {
  message: 'import file not found',
  suggestion: 'Verify the import file path exists and is accessible',
  whatHappened: 'The config file you tried to import does not exist.',
  why: 'The file path is incorrect or the file was moved.',
  howToFix: ['Double-check the file path', 'Ensure the file exists and is readable'],
});

registry.set('DECKENT_E022', {
  message: 'invalid JSON in import file',
  suggestion: 'Validate the JSON syntax in the import file (use a JSON linter)',
  whatHappened: 'The import file contains invalid JSON.',
  why: 'There is a syntax error in the JSON file (missing comma, bracket, etc.).',
  howToFix: ['Open the file and check for JSON syntax errors', 'Use a JSON validator tool to find the issue'],
});

registry.set('DECKENT_E023', {
  message: 'skill manifest not found',
  suggestion: 'Ensure the skill directory contains a valid manifest.json',
  whatHappened: 'The skill directory is missing its manifest.json file.',
  why: 'Every skill must have a manifest.json describing its metadata.',
  howToFix: ['Create a manifest.json in the skill directory', 'Include id, name, and version fields'],
});

registry.set('DECKENT_E024', {
  message: 'invalid skill name',
  suggestion: 'Use alphanumeric characters and hyphens only (max 64 chars)',
  whatHappened: 'The skill name contains invalid characters.',
  why: 'Skill names must be alphanumeric with hyphens, max 64 characters.',
  howToFix: ['Use only letters, numbers, and hyphens', 'Keep the name under 64 characters'],
});

registry.set('DECKENT_E025', {
  message: 'skill already exists',
  suggestion: 'Use --force to overwrite, or choose a different name',
  whatHappened: 'A skill with this name is already installed.',
  why: 'Skill names must be unique to avoid conflicts.',
  howToFix: ['Use --force flag to overwrite the existing skill', 'Or choose a different skill name'],
});

registry.set('DECKENT_E026', {
  message: 'git clone failed',
  suggestion: 'Check the URL, your network connection, and git credentials',
  whatHappened: 'Failed to clone the git repository.',
  why: 'The URL may be wrong, network is down, or credentials are missing.',
  howToFix: ['Verify the repository URL', 'Check your network connection', 'Ensure git credentials are configured'],
});

registry.set('DECKENT_E027', {
  message: 'cloned repo missing manifest',
  suggestion: 'The cloned repository must contain a manifest.json at the root',
  whatHappened: 'The cloned repository does not contain a manifest.json.',
  why: 'A valid skill repository must have manifest.json at its root.',
  howToFix: ['Ensure the repository has a manifest.json at the root level'],
});

registry.set('DECKENT_E028', {
  message: 'invalid manifest.json',
  suggestion: 'manifest.json must contain id, name, and version fields',
  whatHappened: 'The manifest.json file is missing required fields.',
  why: 'id, name, and version are required for skill registration.',
  howToFix: ['Add id, name, and version fields to manifest.json'],
});

registry.set('DECKENT_E029', {
  message: 'source path not found',
  suggestion: 'Verify the source path exists and is accessible',
  whatHappened: 'The source path does not exist.',
  why: 'The path you provided could not be found on disk.',
  howToFix: ['Check the path for typos', 'Ensure the directory exists'],
});

registry.set('DECKENT_E030', {
  message: 'source must be a directory',
  suggestion: 'Provide a directory path containing the skill files',
  whatHappened: 'The source path points to a file, not a directory.',
  why: 'Skills must be installed from a directory containing all skill files.',
  howToFix: ['Provide a directory path instead of a file path'],
});

registry.set('DECKENT_E031', {
  message: 'agent config not found',
  suggestion: 'Ensure the agent directory contains agent.json',
  whatHappened: 'The agent directory is missing its agent.json config.',
  why: 'Each agent must have an agent.json file defining its configuration.',
  howToFix: ['Create an agent.json in the agent directory'],
});

registry.set('DECKENT_E032', {
  message: 'invalid agent name',
  suggestion: 'Use alphanumeric characters and hyphens only (max 64 chars)',
  whatHappened: 'The agent name contains invalid characters.',
  why: 'Agent names must be alphanumeric with hyphens, max 64 characters.',
  howToFix: ['Use only letters, numbers, and hyphens', 'Keep the name under 64 characters'],
});

registry.set('DECKENT_E033', {
  message: 'agent already exists',
  suggestion: 'Use a different name or remove the existing agent first',
  whatHappened: 'An agent with this name already exists.',
  why: 'Agent names must be unique.',
  howToFix: ['Choose a different agent name', 'Or remove the existing agent first'],
});

registry.set('DECKENT_E034', {
  message: 'manifest not found for publish',
  suggestion: 'Run from a skill directory that contains manifest.json',
  whatHappened: 'Could not find manifest.json for publishing.',
  why: 'Publishing requires a manifest.json in the current directory.',
  howToFix: ['Navigate to the skill directory', 'Ensure manifest.json exists'],
});

registry.set('DECKENT_E035', {
  message: 'failed to parse manifest',
  suggestion: 'Check manifest.json for syntax errors',
  whatHappened: 'manifest.json could not be parsed.',
  why: 'The file contains invalid JSON syntax.',
  howToFix: ['Open manifest.json and fix syntax errors', 'Use a JSON validator'],
});

registry.set('DECKENT_E036', {
  message: 'not authenticated for marketplace',
  suggestion: 'Run: deckent config set --global marketplace_token <token>',
  whatHappened: 'You are not authenticated with the marketplace.',
  why: 'A marketplace token is required for publishing skills.',
  howToFix: ['Run: deckent config set --global marketplace_token <your-token>'],
});

registry.set('DECKENT_E037', {
  message: 'malformed global config',
  suggestion: 'Fix or delete the global config file at ~/.deckent/config.json',
  whatHappened: 'The global config file is corrupted or malformed.',
  why: 'The file contains invalid JSON or unexpected structure.',
  howToFix: ['Fix the JSON in ~/.deckent/config.json', 'Or delete it and reconfigure: deckent config set --global ...'],
});

registry.set('DECKENT_E038', {
  message: 'failed to read config file',
  suggestion: 'Check file permissions and JSON syntax',
  whatHappened: 'Could not read the config file.',
  why: 'File permissions may be wrong or the file is corrupted.',
  howToFix: ['Check file permissions: ls -la .deckent/config.json', 'Ensure the file contains valid JSON'],
});

registry.set('DECKENT_E039', {
  message: 'skill name must be non-empty',
  suggestion: 'Provide a valid non-empty skill name string',
  whatHappened: 'An empty skill name was provided.',
  why: 'Skill names cannot be empty strings.',
  howToFix: ['Provide a non-empty skill name'],
});

// ─── Orchestra Error Codes (DECKENT_E040-E059) ──────────────────────

registry.set('DECKENT_E040', {
  message: 'pipeline must have at least 1 step',
  suggestion: 'Provide at least one PipelineStep with agentId and phase',
  whatHappened: 'Pipeline was created with no steps.',
  why: 'A pipeline needs at least one step to execute.',
  howToFix: ['Add at least one PipelineStep with agentId and phase'],
});

registry.set('DECKENT_E041', {
  message: 'pipeline step has invalid agentId',
  suggestion: 'Each pipeline step must have a non-empty string agentId',
  whatHappened: 'A pipeline step has a missing or empty agentId.',
  why: 'Each step must reference a valid agent.',
  howToFix: ['Provide a non-empty agentId for each pipeline step'],
});

registry.set('DECKENT_E042', {
  message: 'pipeline step has invalid phase',
  suggestion: 'Each pipeline step must have a non-empty string phase',
  whatHappened: 'A pipeline step has a missing or empty phase name.',
  why: 'Each step must specify which phase it runs in.',
  howToFix: ['Provide a non-empty phase string for each pipeline step'],
});

registry.set('DECKENT_E043', {
  message: 'pipeline has duplicate phase',
  suggestion: 'Each phase in the pipeline must be unique',
  whatHappened: 'Two or more pipeline steps share the same phase name.',
  why: 'Phase names must be unique to prevent execution conflicts.',
  howToFix: ['Rename duplicate phases to be unique'],
});

registry.set('DECKENT_E044', {
  message: 'shared memory write: invalid key',
  suggestion: 'SharedMemory.write requires a non-empty string key',
  whatHappened: 'Tried to write to shared memory with an empty key.',
  why: 'Shared memory requires a valid key to store data.',
  howToFix: ['Provide a non-empty string key when calling SharedMemory.write'],
});

registry.set('DECKENT_E045', {
  message: 'shared memory write: invalid writerId',
  suggestion: 'SharedMemory.write requires a non-empty string writerId',
  whatHappened: 'Tried to write to shared memory without identifying the writer.',
  why: 'SharedMemory tracks which agent wrote each entry.',
  howToFix: ['Provide a non-empty writerId when calling SharedMemory.write'],
});

registry.set('DECKENT_E046', {
  message: 'handoff: missing task IDs',
  suggestion: 'Both fromTaskId and toTaskId are required for createHandoff',
  whatHappened: 'Task handoff is missing source or destination task ID.',
  why: 'Both task IDs are required to create a valid handoff.',
  howToFix: ['Provide both fromTaskId and toTaskId'],
});

registry.set('DECKENT_E047', {
  message: 'handoff: empty artifacts',
  suggestion: 'Provide at least one artifact path for the handoff',
  whatHappened: 'Task handoff was created with no artifacts.',
  why: 'A handoff must include at least one file or artifact to transfer.',
  howToFix: ['Add at least one artifact path to the handoff'],
});

registry.set('DECKENT_E048', {
  message: 'handoff not found',
  suggestion: 'Verify the handoff ID exists in .tasks/handoffs/',
  whatHappened: 'The referenced handoff does not exist.',
  why: 'The handoff ID may be incorrect or the handoff was not created.',
  howToFix: ['Check the handoff ID', 'List handoffs in .tasks/handoffs/'],
});

registry.set('DECKENT_E049', {
  message: 'circular dependency detected',
  suggestion: 'Review task dependencies to remove cycles',
  whatHappened: 'Tasks have circular dependencies that prevent execution.',
  why: 'Task A depends on B, which depends on A (or longer cycle).',
  howToFix: ['Review task dependencies in DIRECTIVES.md', 'Remove or restructure the circular chain'],
});

registry.set('DECKENT_E050', {
  message: 'failed to stash changes',
  suggestion: 'Resolve git conflicts or commit changes before creating a safety point',
  whatHappened: 'Could not stash your uncommitted changes.',
  why: 'There may be unresolved merge conflicts or git state issues.',
  howToFix: ['Resolve any merge conflicts', 'Commit or discard pending changes', 'Then retry the safety point'],
});

registry.set('DECKENT_E051', {
  message: 'failed to get commit SHA',
  suggestion: 'Ensure you are inside a git repository with at least one commit',
  whatHappened: 'Could not read the current git commit SHA.',
  why: 'The repository may not have any commits yet, or this is not a git repo.',
  howToFix: ['Run `git init` if not a git repo', 'Create an initial commit: git commit --allow-empty -m "init"'],
});

registry.set('DECKENT_E052', {
  message: 'failed to create safety branch',
  suggestion: 'Check git permissions and branch name conflicts',
  whatHappened: 'Could not create the safety point branch.',
  why: 'A branch with the same name may already exist, or git permissions are wrong.',
  howToFix: ['Check for existing branches: git branch -a', 'Delete conflicting branch if safe'],
});

registry.set('DECKENT_E053', {
  message: 'rating must be 1-5 integer',
  suggestion: 'Provide an integer rating between 1 and 5',
  whatHappened: 'An invalid rating value was provided.',
  why: 'Ratings must be whole numbers between 1 and 5.',
  howToFix: ['Use an integer between 1 and 5'],
});

registry.set('DECKENT_E054', {
  message: 'observability not initialized',
  suggestion: 'Call initObservability(projectRoot) before using metric/trace/structuredLog',
  whatHappened: 'A caller tried to read the metrics path before the observability library was initialized for a project root.',
  why: 'Observability state is lazy — it must be bound to a project root via initObservability() at sprint startup.',
  howToFix: ['Call initObservability(projectRoot) once at sprint bootstrap', 'Or pass an explicit projectRoot to getMetricsPath(projectRoot)'],
});

registry.set('DECKENT_E055', {
  message: 'sprint coordinator already running',
  suggestion: 'Stop the existing sprint first with: deckent kill --all',
  whatHappened: 'A new coordinator was started for a sprint that already has a live coordinator process.',
  why: 'Only one coordinator process can run per sprint to prevent state corruption.',
  howToFix: ['Stop the existing sprint: deckent kill --all', 'Or wait for the current sprint to finish', 'If the process is stale, delete .deckent/pids/<sprintId>.pid'],
});

// ─── Agent Error Codes (DECKENT_E060-E079) ──────────────────────────

registry.set('DECKENT_E060', {
  message: 'invalid JSON in task file',
  suggestion: 'Check the task file for JSON syntax errors',
  whatHappened: 'A task file contains invalid JSON.',
  why: 'The task file was corrupted or manually edited incorrectly.',
  howToFix: ['Check the task file in .tasks/ for syntax errors', 'Use a JSON validator to find the issue'],
});

registry.set('DECKENT_E061', {
  message: 'task file not found',
  suggestion: 'Verify the task ID and that .tasks/ directory contains the task file',
  whatHappened: 'The task file could not be found.',
  why: 'The task ID may be wrong or the file was deleted.',
  howToFix: ['Check that .tasks/ directory exists', 'Verify the task ID is correct'],
});

registry.set('DECKENT_E062', {
  message: 'shared context write: invalid key',
  suggestion: 'SharedContext.write requires a non-empty string key',
  whatHappened: 'Tried to write to shared context with an empty key.',
  why: 'Shared context requires a valid key to store data.',
  howToFix: ['Provide a non-empty string key when calling SharedContext.write'],
});

registry.set('DECKENT_E063', {
  message: 'shared context write: invalid agentId',
  suggestion: 'SharedContext.write requires a non-empty string agentId',
  whatHappened: 'Tried to write to shared context without identifying the agent.',
  why: 'SharedContext tracks which agent wrote each entry.',
  howToFix: ['Provide a non-empty agentId when calling SharedContext.write'],
});

registry.set('DECKENT_E064', {
  message: 'agent already has active experiment',
  suggestion: 'Complete or cancel the existing experiment before creating a new one',
  whatHappened: 'This agent already has an active experiment running.',
  why: 'Each agent can only run one experiment at a time.',
  howToFix: ['Complete the current experiment first', 'Or cancel it before starting a new one'],
});

registry.set('DECKENT_E065', {
  message: 'experiment not found',
  suggestion: 'Verify the experiment ID exists in .deckent/experiments/',
  whatHappened: 'The referenced experiment does not exist.',
  why: 'The experiment ID is incorrect or the experiment was removed.',
  howToFix: ['Check the experiment ID', 'List experiments in .deckent/experiments/'],
});

registry.set('DECKENT_E066', {
  message: 'experiment is not active',
  suggestion: 'Only active experiments can accept new results',
  whatHappened: 'Tried to add results to a completed or cancelled experiment.',
  why: 'Only experiments with status "active" can accept new results.',
  howToFix: ['Check experiment status', 'Create a new experiment if needed'],
});

registry.set('DECKENT_E067', {
  message: 'rule template not found',
  suggestion: 'Verify the template file exists in the rule-templates directory',
  whatHappened: 'rule-generator could not locate a role template file on disk.',
  why: 'Rule generation requires template files for each role (brain, auditor, worker-default).',
  howToFix: [
    'Check that src/core/rule-templates/<role>.template.md exists',
    'Reinstall Deckent if templates are missing from the package',
    'Pass a custom templateDir to loadTemplate() if templates live elsewhere',
  ],
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
      entry.whatHappened,
      entry.why,
      entry.howToFix,
    );
  },

  /**
   * Register a new error code (for extensibility / plugins).
   */
  register(code: string, entry: ErrorEntry): void {
    registry.set(code, entry);
  },
} as const;

// ─── Human-Friendly Error Formatter ─────────────────────────────────

/**
 * Format a DeckentError as a human-readable string with context.
 * Falls back to basic format if human context fields are missing.
 */
export function formatHumanError(error: DeckentError): string {
  const lines: string[] = [];

  lines.push(`Error: ${error.message} [${error.code}]`);

  if (error.whatHappened) {
    lines.push('');
    lines.push('What happened:');
    lines.push(`  ${error.whatHappened}`);
  }

  if (error.why) {
    lines.push('');
    lines.push('Why:');
    lines.push(`  ${error.why}`);
  }

  if (error.howToFix && error.howToFix.length > 0) {
    lines.push('');
    lines.push('How to fix:');
    for (let i = 0; i < error.howToFix.length; i++) {
      lines.push(`  ${i + 1}. ${error.howToFix[i]}`);
    }
  }

  if (error.docLink) {
    lines.push('');
    lines.push(`Docs: ${error.docLink}`);
  }

  return lines.join('\n');
}
