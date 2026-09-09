import type { ApprovalRisk, ApprovalScope } from './approval-contract.js';
import {
  classifyReadOnlyShellCommand,
  type ReadOnlyShellReasonCode,
  type ShellDialect,
} from './shell-readonly-classifier.js';

export type ApprovalCommandProfile = 'agentic' | 'worker';

/** Typed provenance of a classification — never user-facing prose. */
export type ApprovalCommandReasonCode =
  | 'GIT_PUSH_FORCE'
  | 'GIT_RESET_HARD'
  | 'GIT_CLEAN_FORCE'
  | 'GIT_BRANCH_FORCE_DELETE'
  | 'GIT_PUSH'
  | 'GIT_HISTORY_MUTATION'
  | 'GIT_CHECKOUT_DISCARD'
  | 'GIT_STASH_DROP'
  | 'PACKAGE_PUBLISH'
  | 'HTTP_CLIENT'
  | 'REMOTE_TRANSFER'
  | 'PACKAGE_INSTALL'
  | 'SYSTEM_PACKAGE_INSTALL'
  | 'GIT_NETWORK_FETCH'
  | 'SHELL_EXEC_DEFAULT'
  | `READ_ONLY:${ReadOnlyShellReasonCode}`;

export interface ApprovalCommandClassification {
  readonly scope: ApprovalScope;
  readonly risk: ApprovalRisk;
  /** Legacy diagnostic string (kept byte-identical for existing consumers). */
  readonly reason: string;
  readonly reasonCode: ApprovalCommandReasonCode;
}

/**
 * Optional execution context. When supplied, the deterministic allowlist
 * read-only parser (`shell-readonly-classifier.ts`) runs FIRST and a proven
 * read-only command classifies as `file-read` with risk `none|low`. Callers that
 * omit the context (worker approval gates, which contractually gate EVERY shell
 * command) keep the pre-7111 behavior byte-identical: shell-exec at minimum.
 */
export interface ApprovalCommandContext {
  /** Shell dialect the command will run under (resolve from the host platform). */
  readonly dialect: ShellDialect;
  /** Absolute project root for path containment; `null` = lexical containment only. */
  readonly projectRoot: string | null;
  /** Root-relative protected read patterns; default set lives in the classifier. */
  readonly protectedPaths?: readonly string[];
  /** Host platform (case rule for containment). Default `process.platform`. */
  readonly platform?: NodeJS.Platform;
}

interface Pattern {
  readonly re: RegExp;
  readonly risk: ApprovalRisk;
  readonly reason: string;
  readonly code: ApprovalCommandReasonCode;
}

const GIT_COMMON: readonly Pattern[] = [
  { re: /\bgit\s+push\b[^|;&]*(--force\b|-f\b)/i, risk: 'critical', reason: 'git push --force', code: 'GIT_PUSH_FORCE' },
  { re: /\bgit\s+reset\b[^|;&]*--hard\b/i, risk: 'critical', reason: 'git reset --hard', code: 'GIT_RESET_HARD' },
  { re: /\bgit\s+clean\b[^|;&]*-[a-z]*f/i, risk: 'critical', reason: 'git clean -f', code: 'GIT_CLEAN_FORCE' },
  { re: /\bgit\s+branch\b[^|;&]*-D\b/i, risk: 'high', reason: 'git branch -D (force delete)', code: 'GIT_BRANCH_FORCE_DELETE' },
  { re: /\bgit\s+push\b/i, risk: 'high', reason: 'git push', code: 'GIT_PUSH' },
  { re: /\bgit\s+(commit|merge|rebase|reset|tag|cherry-pick|revert|rm|am|filter-branch)\b/i, risk: 'high', reason: 'git history/state mutation', code: 'GIT_HISTORY_MUTATION' },
];

const AGENTIC_GIT_EXTRA: readonly Pattern[] = [
  { re: /\bgit\s+checkout\b[^|;&]*--\s/i, risk: 'medium', reason: 'git checkout -- (discard working-tree changes)', code: 'GIT_CHECKOUT_DISCARD' },
  { re: /\bgit\s+stash\b[^|;&]*(drop|clear)\b/i, risk: 'medium', reason: 'git stash drop/clear', code: 'GIT_STASH_DROP' },
];

const NETWORK_COMMON: readonly Pattern[] = [
  { re: /\b(npm|yarn|pnpm)\s+publish\b/i, risk: 'high', reason: 'package publish', code: 'PACKAGE_PUBLISH' },
  { re: /\b(curl|wget)\b/i, risk: 'medium', reason: 'HTTP client invocation', code: 'HTTP_CLIENT' },
  { re: /\b(ssh|scp|sftp|rsync)\b/i, risk: 'medium', reason: 'remote-host transfer', code: 'REMOTE_TRANSFER' },
  { re: /\b(npm|yarn|pnpm)\s+(install|i|ci|add|update|up)\b/i, risk: 'medium', reason: 'package registry install', code: 'PACKAGE_INSTALL' },
];

const AGENTIC_NETWORK_EXTRA: readonly Pattern[] = [
  { re: /\bpip3?\s+install\b/i, risk: 'medium', reason: 'package registry install', code: 'PACKAGE_INSTALL' },
  { re: /\b(apt(-get)?|brew)\s+install\b/i, risk: 'medium', reason: 'system package install', code: 'SYSTEM_PACKAGE_INSTALL' },
];

const NETWORK_FETCH: Pattern = {
  re: /\bgit\s+(clone|pull|fetch)\b/i,
  risk: 'low',
  reason: 'git network fetch',
  code: 'GIT_NETWORK_FETCH',
};

function first(command: string, patterns: readonly Pattern[]): Pattern | undefined {
  return patterns.find(({ re }) => re.test(command));
}

/**
 * Shared classifier; profiles intentionally remain distinct.
 *
 * With `context`, a command the allowlist parser PROVES read-only is
 * `file-read` (risk `none` for bounded local reads, `low` for repository-wide
 * traversal / environment exposure) — the permission engine's silent tier.
 * The parser is fail-closed: anything it cannot prove falls through to the
 * exact pattern ladder below, unchanged.
 */
export function classifyApprovalCommand(
  command: string,
  profile: ApprovalCommandProfile,
  context?: ApprovalCommandContext,
): ApprovalCommandClassification {
  if (context !== undefined) {
    const readOnly = classifyReadOnlyShellCommand(command, {
      dialect: context.dialect,
      projectRoot: context.projectRoot,
      ...(context.protectedPaths !== undefined ? { protectedPaths: context.protectedPaths } : {}),
      ...(context.platform !== undefined ? { platform: context.platform } : {}),
    });
    if (readOnly.readOnly && readOnly.risk !== null) {
      const code: ApprovalCommandReasonCode = `READ_ONLY:${readOnly.reasonCode}`;
      return { scope: 'file-read', risk: readOnly.risk, reason: code, reasonCode: code };
    }
  }
  const git = first(command, profile === 'agentic' ? [...GIT_COMMON, ...AGENTIC_GIT_EXTRA] : GIT_COMMON);
  if (git) return { scope: 'git-mutation', risk: git.risk, reason: git.reason, reasonCode: git.code };
  const network = first(command, profile === 'agentic'
    ? [...NETWORK_COMMON, ...AGENTIC_NETWORK_EXTRA, NETWORK_FETCH]
    : [...NETWORK_COMMON, NETWORK_FETCH]);
  if (network) return { scope: 'network', risk: network.risk, reason: network.reason, reasonCode: network.code };
  return { scope: 'shell-exec', risk: 'medium', reason: 'shell command execution', reasonCode: 'SHELL_EXEC_DEFAULT' };
}
