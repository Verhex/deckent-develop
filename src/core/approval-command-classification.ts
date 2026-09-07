import type { ApprovalRisk, ApprovalScope } from './approval-contract.js';

export type ApprovalCommandProfile = 'agentic' | 'worker';

export interface ApprovalCommandClassification {
  readonly scope: ApprovalScope;
  readonly risk: ApprovalRisk;
  readonly reason: string;
}

interface Pattern {
  readonly re: RegExp;
  readonly risk: ApprovalRisk;
  readonly reason: string;
}

const GIT_COMMON: readonly Pattern[] = [
  { re: /\bgit\s+push\b[^|;&]*(--force\b|-f\b)/i, risk: 'critical', reason: 'git push --force' },
  { re: /\bgit\s+reset\b[^|;&]*--hard\b/i, risk: 'critical', reason: 'git reset --hard' },
  { re: /\bgit\s+clean\b[^|;&]*-[a-z]*f/i, risk: 'critical', reason: 'git clean -f' },
  { re: /\bgit\s+branch\b[^|;&]*-D\b/i, risk: 'high', reason: 'git branch -D (force delete)' },
  { re: /\bgit\s+push\b/i, risk: 'high', reason: 'git push' },
  { re: /\bgit\s+(commit|merge|rebase|reset|tag|cherry-pick|revert|rm|am|filter-branch)\b/i, risk: 'high', reason: 'git history/state mutation' },
];

const AGENTIC_GIT_EXTRA: readonly Pattern[] = [
  { re: /\bgit\s+checkout\b[^|;&]*--\s/i, risk: 'medium', reason: 'git checkout -- (discard working-tree changes)' },
  { re: /\bgit\s+stash\b[^|;&]*(drop|clear)\b/i, risk: 'medium', reason: 'git stash drop/clear' },
];

const NETWORK_COMMON: readonly Pattern[] = [
  { re: /\b(npm|yarn|pnpm)\s+publish\b/i, risk: 'high', reason: 'package publish' },
  { re: /\b(curl|wget)\b/i, risk: 'medium', reason: 'HTTP client invocation' },
  { re: /\b(ssh|scp|sftp|rsync)\b/i, risk: 'medium', reason: 'remote-host transfer' },
  { re: /\b(npm|yarn|pnpm)\s+(install|i|ci|add|update|up)\b/i, risk: 'medium', reason: 'package registry install' },
];

const AGENTIC_NETWORK_EXTRA: readonly Pattern[] = [
  { re: /\bpip3?\s+install\b/i, risk: 'medium', reason: 'package registry install' },
  { re: /\b(apt(-get)?|brew)\s+install\b/i, risk: 'medium', reason: 'system package install' },
];

const NETWORK_FETCH: Pattern = {
  re: /\bgit\s+(clone|pull|fetch)\b/i,
  risk: 'low',
  reason: 'git network fetch',
};

function first(command: string, patterns: readonly Pattern[]): Pattern | undefined {
  return patterns.find(({ re }) => re.test(command));
}

/** Behavior-preserving shared classifier; profiles intentionally remain distinct. */
export function classifyApprovalCommand(
  command: string,
  profile: ApprovalCommandProfile,
): ApprovalCommandClassification {
  const git = first(command, profile === 'agentic' ? [...GIT_COMMON, ...AGENTIC_GIT_EXTRA] : GIT_COMMON);
  if (git) return { scope: 'git-mutation', risk: git.risk, reason: git.reason };
  const network = first(command, profile === 'agentic'
    ? [...NETWORK_COMMON, ...AGENTIC_NETWORK_EXTRA, NETWORK_FETCH]
    : [...NETWORK_COMMON, NETWORK_FETCH]);
  if (network) return { scope: 'network', risk: network.risk, reason: network.reason };
  return { scope: 'shell-exec', risk: 'medium', reason: 'shell command execution' };
}
