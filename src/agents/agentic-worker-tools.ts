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

// ═══ WORKERGATE-WIRE (sprint-354 task-354-005) ══════════════════════════════
//
// Wires the WorkerApprovalGate (APR-WORKERGATE, src/core/approval-worker-gate.ts
// — core, READ-ONLY here: imported, never modified) into this worker tool
// layer. Risky tool-classes — shell-exec / git-mutation / network, three of
// the seven ApprovalScope values approval-contract.ts already defines — pass
// through `gate.guard()` BEFORE dispatch, gated by `approval_gate.enabled`
// (DEFAULT-OFF; the caller reads the config flag and passes it in here).
//
// Flag-off is byte-identical BY CONSTRUCTION: `wrapDispatcherWithApprovalGate`
// returns the exact `baseDispatcher` reference (not a passthrough wrapper)
// when `enabled` is false — zero extra work, zero extra call frame.
//
// Only `run_bash` maps onto shell-exec/git-mutation/network among the 5
// Ollama tools (read_file/task_done aren't risky; write_file/edit_file are
// already scope-guarded by the runner and are not in this task's named
// risky-class list). `classifyRiskyToolCall` picks ONE ApprovalScope per
// call — priority git-mutation > network > shell-exec (a `git push` is a
// history mutation first, its network side-effect second) — mirroring how
// command-registry.ts's 'Çalıştır' (execute/spawn) tier is the most-cautious
// rung on this codebase's own risk ladder.
//
// Timeout handling is NEVER reimplemented here: `guard()` (the real
// WorkerApprovalGate) owns the ONE timeout race via its injected
// FallbackResolver seam (default: deny). Adding a second timeout/deny path
// in this module would be exactly the "gate'i bypass eden ikinci yol" this
// task's nogo forbids.
//
// ADR-008 (agents/ MUST NOT import cli/ — see src/core/redact-sensitive.ts's
// header comment for the same rule stated at its original call-site):
// `ToolDispatcherLike` below is a local structural mirror of
// `McpToolDispatcher` (src/cli/commands/chat-native.ts) rather than an
// import — any dispatcher shape-compatible caller (the real chat-tool-exec
// adapter, a test fake) satisfies it without a new agents/ -> cli/ edge.

import type { ApprovalScope, ApprovalRisk } from '../core/approval-contract.js';
import type { GateVerdict, WorkerActionDescriptor } from '../core/approval-worker-gate.js';
import { redactSensitive } from '../core/redact-sensitive.js';

/** Structural mirror of `McpToolDispatcher` (src/cli/commands/chat-native.ts). */
export interface ToolDispatcherLike {
  dispatch(name: string, args: Record<string, unknown>): Promise<string>;
}

/**
 * Structural mirror of `WorkerApprovalGate#guard` — the ONLY method this
 * module calls. Kept structural (not `WorkerApprovalGate` the class) so a
 * hermetic fake can stand in for tests, mirroring approval-worker-gate.ts's
 * own `ApprovalBrokerLike` seam pattern one layer up. A real
 * `WorkerApprovalGate` instance satisfies this with zero adapter code.
 */
export interface ApprovalGateLike {
  guard(action: WorkerActionDescriptor): Promise<GateVerdict>;
}

/**
 * The 3 risky ApprovalScope classes this task gates — a fixed subset of
 * approval-contract.ts's 7-value `ApprovalScope` enum, aligned with
 * command-registry.ts's most-cautious 'Çalıştır' (execute/spawn) risk tier.
 * `file-read`/`file-write`/`credential`/`lifecycle` are deliberately excluded
 * — write_file/edit_file are already scope-guarded by the runner, and
 * credential/lifecycle don't apply to any of the 5 Ollama tools.
 */
export const RISKY_APPROVAL_SCOPES: readonly ApprovalScope[] = ['shell-exec', 'git-mutation', 'network'] as const;

const RISKY_TOOL_NAME = 'run_bash';

export interface RiskyClassification {
  scope: ApprovalScope;
  risk: ApprovalRisk;
  reason: string;
}

interface RiskPattern {
  re: RegExp;
  risk: ApprovalRisk;
  reason: string;
}

// Ordered most- to least-severe; the FIRST match wins within each class.
const GIT_MUTATION_PATTERNS: readonly RiskPattern[] = [
  { re: /\bgit\s+push\b[^|;&]*(--force\b|-f\b)/i, risk: 'critical', reason: 'git push --force' },
  { re: /\bgit\s+reset\b[^|;&]*--hard\b/i, risk: 'critical', reason: 'git reset --hard' },
  { re: /\bgit\s+clean\b[^|;&]*-[a-z]*f/i, risk: 'critical', reason: 'git clean -f' },
  { re: /\bgit\s+branch\b[^|;&]*-D\b/i, risk: 'high', reason: 'git branch -D (force delete)' },
  { re: /\bgit\s+push\b/i, risk: 'high', reason: 'git push' },
  {
    re: /\bgit\s+(commit|merge|rebase|reset|tag|cherry-pick|revert|rm|am|filter-branch)\b/i,
    risk: 'high',
    reason: 'git history/state mutation',
  },
  { re: /\bgit\s+checkout\b[^|;&]*--\s/i, risk: 'medium', reason: 'git checkout -- (discard working-tree changes)' },
  { re: /\bgit\s+stash\b[^|;&]*(drop|clear)\b/i, risk: 'medium', reason: 'git stash drop/clear' },
];

const NETWORK_PATTERNS: readonly RiskPattern[] = [
  { re: /\b(npm|yarn|pnpm)\s+publish\b/i, risk: 'high', reason: 'package publish' },
  { re: /\b(curl|wget)\b/i, risk: 'medium', reason: 'HTTP client invocation' },
  { re: /\b(ssh|scp|sftp|rsync)\b/i, risk: 'medium', reason: 'remote-host transfer' },
  { re: /\b(npm|yarn|pnpm)\s+(install|i|ci|add|update|up)\b/i, risk: 'medium', reason: 'package registry install' },
  { re: /\bpip3?\s+install\b/i, risk: 'medium', reason: 'package registry install' },
  { re: /\b(apt(-get)?|brew)\s+install\b/i, risk: 'medium', reason: 'system package install' },
  { re: /\bgit\s+(clone|pull|fetch)\b/i, risk: 'low', reason: 'git network fetch' },
];

function matchPattern(cmd: string, patterns: readonly RiskPattern[]): RiskPattern | undefined {
  return patterns.find((p) => p.re.test(cmd));
}

/**
 * Classify a tool call against the 3 risky ApprovalScope classes. Returns
 * `null` for every tool except `run_bash` (read_file/write_file/edit_file/
 * task_done are not in this task's named risky-class list). For `run_bash`,
 * ALWAYS returns a classification — shell-exec is itself one of the 3 named
 * risky classes, so every run_bash call is gated at minimum as shell-exec;
 * a recognized git-mutation or network sub-pattern upgrades the scope/risk.
 */
export function classifyRiskyToolCall(name: string, args: Record<string, unknown>): RiskyClassification | null {
  if (name !== RISKY_TOOL_NAME) return null;

  const cmd = String(args['cmd'] ?? args['command'] ?? '');

  const gitMatch = matchPattern(cmd, GIT_MUTATION_PATTERNS);
  if (gitMatch) return { scope: 'git-mutation', risk: gitMatch.risk, reason: gitMatch.reason };

  const networkMatch = matchPattern(cmd, NETWORK_PATTERNS);
  if (networkMatch) return { scope: 'network', risk: networkMatch.risk, reason: networkMatch.reason };

  return { scope: 'shell-exec', risk: 'medium', reason: 'shell command execution' };
}

const SUMMARY_MAX_LENGTH = 200;

function buildSummary(cmd: string, classification: RiskyClassification): string {
  const prefix = `run_bash (${classification.scope}): `;
  const safeCmd = redactSensitive(cmd);
  const budget = SUMMARY_MAX_LENGTH - prefix.length;
  const truncated = safeCmd.length > budget ? `${safeCmd.slice(0, Math.max(0, budget - 1))}…` : safeCmd;
  return `${prefix}${truncated}`;
}

function buildDeniedError(name: string, classification: RiskyClassification, extra?: string): string {
  const suffix = extra ? ` (${extra})` : '';
  return `[approval-denied] tool=${name} scope=${classification.scope} risk=${classification.risk} reason="${classification.reason}"${suffix}`;
}

export interface WorkerGateWireOptions {
  /**
   * `approval_gate.enabled` config flag. DEFAULT-OFF: pass `false` (or omit
   * wrapping entirely) to keep the pre-WORKERGATE-WIRE dispatch behavior
   * byte-identical — this module never blocks a worker unless the caller
   * explicitly opts in.
   */
  enabled: boolean;
  /**
   * WorkerApprovalGate instance (or any `guard()`-compatible fake). Its
   * broker/requester/tenantId/userId/timeout/FallbackResolver are all
   * constructed and owned by the caller — out of this module's scope.
   */
  gate: ApprovalGateLike;
  /** Approval-request `scopeId` — the sprint/task identity this worker run belongs to. */
  scopeId: string;
}

/**
 * Wrap a tool dispatcher so risky tool-classes (shell-exec/git-mutation/
 * network — currently only `run_bash`) pass through `options.gate.guard()`
 * before dispatch. A denied or errored guard call returns a structured
 * `[approval-denied] ...` string WITHOUT ever calling `baseDispatcher` — the
 * model sees the denial as a normal tool result and can self-correct, same
 * pattern as the runner's existing `[scope-violation]` rejections.
 */
export function wrapDispatcherWithApprovalGate(
  baseDispatcher: ToolDispatcherLike,
  options: WorkerGateWireOptions,
): ToolDispatcherLike {
  if (!options.enabled) return baseDispatcher;

  return {
    async dispatch(name: string, args: Record<string, unknown>): Promise<string> {
      const classification = classifyRiskyToolCall(name, args);
      if (!classification) return baseDispatcher.dispatch(name, args);

      const cmd = String(args['cmd'] ?? args['command'] ?? '');
      let verdict: GateVerdict;
      try {
        verdict = await options.gate.guard({
          summary: buildSummary(cmd, classification),
          details: { tool: name, scope: classification.scope, risk: classification.risk, reason: classification.reason },
          scopeId: options.scopeId,
          scope: classification.scope,
          risk: classification.risk,
          policy: 'require-approval',
          defaultAction: 'deny',
          rawArgs: args,
        });
      } catch (err) {
        return buildDeniedError(name, classification, `gate error: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (verdict === 'deny') return buildDeniedError(name, classification);
      return baseDispatcher.dispatch(name, args);
    },
  };
}
