// ═══ agentic-worker-tools — native Ollama tool schemas (T-233-001) ═══
//
// Five JSON-schema tool definitions advertised to the local model on every
// `/api/chat` call. Matches Ollama's native tool-calling shape
// (`{ type: 'function', function: { name, description, parameters } }`),
// which the OpenAI-compatible adapters (GLM/Groq/OpenRouter) also accept
// — so AS-2 Faz 2 can reuse these schemas verbatim.
//
// Tool surface (spec §4):
//   • read_file({path})              — read any file under projectRoot
//   • write_file({path, content})    — write; scope-guarded by runner
//   • edit_file({path, old, new})    — replace; scope-guarded by runner
//   • run_bash({cmd})                — async spawn; stdout+stderr+exit
//   • task_done({selfAssessment, notes}) — terminate loop with assessment
//
// Scope enforcement and bash policy live in the runner, not the schema —
// the schema only tells the model the tool exists. Hard-rejection of an
// out-of-scope write reaches the model as the tool result, not as a
// schema-level constraint (so the model can self-correct).

export interface OllamaToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; enum?: readonly string[]; description: string }>;
      required: readonly string[];
    };
  };
}

export const TOOL_READ_FILE: OllamaToolSchema = {
  type: 'function',
  function: {
    name: 'read_file',
    description:
      'Read the contents of a file, relative to the project root. Returns the file body as a string. Use for inspecting any source/test/doc file before editing.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project-relative file path.' },
      },
      required: ['path'],
    },
  },
};

export const TOOL_WRITE_FILE: OllamaToolSchema = {
  type: 'function',
  function: {
    name: 'write_file',
    description:
      'Create or overwrite a file with the given content. Only paths within the assigned task scope (scope.filesWrite or scope.directories) are accepted; other paths are rejected with an error you must read and self-correct.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project-relative target file path.' },
        content: { type: 'string', description: 'Full new file content.' },
      },
      required: ['path', 'content'],
    },
  },
};

export const TOOL_EDIT_FILE: OllamaToolSchema = {
  type: 'function',
  function: {
    name: 'edit_file',
    description:
      'Replace the first occurrence of `old` with `new` in the target file. Only paths within the assigned task scope are accepted. Fails if `old` is not found verbatim — call read_file first to get the exact text.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project-relative target file path.' },
        old: { type: 'string', description: 'Exact text to replace.' },
        new: { type: 'string', description: 'Replacement text.' },
      },
      required: ['path', 'old', 'new'],
    },
  },
};

export const TOOL_RUN_BASH: OllamaToolSchema = {
  type: 'function',
  function: {
    name: 'run_bash',
    description:
      'Run a shell command in the project root. Returns stdout+stderr. A non-zero exit appends `[exit N]` to the output. Use for verification commands (tsc, vitest, pytest, etc.) and lightweight diagnostics.',
    parameters: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: 'Shell command to execute via bash -lc.' },
      },
      required: ['cmd'],
    },
  },
};

export const TOOL_TASK_DONE: OllamaToolSchema = {
  type: 'function',
  function: {
    name: 'task_done',
    description:
      'Terminate the agentic loop and submit your honest self-assessment. Call this exactly once when finished. Pass DONE only if every goCriteria item is verifiably met; GO_WITH_TECH_DEBT if core items met with a named gap; NO_GO if a critical item failed.',
    parameters: {
      type: 'object',
      properties: {
        selfAssessment: {
          type: 'string',
          enum: ['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO'],
          description: 'Honest assessment against task goCriteria.',
        },
        notes: { type: 'string', description: 'Brief summary of what was done and any caveats.' },
      },
      required: ['selfAssessment', 'notes'],
    },
  },
};

/** Native Ollama tools advertised on every /api/chat request (spec §4 — 5 tools). */
export const OLLAMA_TOOLS: readonly OllamaToolSchema[] = [
  TOOL_READ_FILE,
  TOOL_WRITE_FILE,
  TOOL_EDIT_FILE,
  TOOL_RUN_BASH,
  TOOL_TASK_DONE,
] as const;
