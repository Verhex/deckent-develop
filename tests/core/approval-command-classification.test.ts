import { describe, expect, it } from 'vitest';
import { classifyApprovalCommand } from '../../src/core/approval-command-classification.js';

describe('classifyApprovalCommand', () => {
  it('preserves the agentic-only package manager patterns', () => {
    expect(classifyApprovalCommand('pip install deckent', 'agentic').scope).toBe('network');
    expect(classifyApprovalCommand('apt install jq', 'agentic').scope).toBe('network');
    expect(classifyApprovalCommand('pip install deckent', 'worker').scope).toBe('shell-exec');
    expect(classifyApprovalCommand('apt install jq', 'worker').scope).toBe('shell-exec');
  });

  it('preserves common destructive and network classifications', () => {
    expect(classifyApprovalCommand('git push --force origin main', 'agentic')).toMatchObject({ scope: 'git-mutation', risk: 'critical' });
    expect(classifyApprovalCommand('git push --force origin main', 'worker')).toMatchObject({ scope: 'git-mutation', risk: 'critical' });
    expect(classifyApprovalCommand('curl https://example.invalid', 'worker')).toMatchObject({ scope: 'network', risk: 'medium' });
  });
});

describe('classifyApprovalCommand — 7111 read-only context', () => {
  const context = { dialect: 'posix' as const, projectRoot: '/srv/deckent' };

  it('classifies a proven read-only command as file-read with a typed READ_ONLY reason code', () => {
    expect(classifyApprovalCommand("sed -n '1,50p' docs/MASTER-PLAN.md", 'agentic', context))
      .toEqual({ scope: 'file-read', risk: 'none', reason: 'READ_ONLY:READ_ONLY', reasonCode: 'READ_ONLY:READ_ONLY' });
    expect(classifyApprovalCommand('grep -rn foo src', 'agentic', context)).toMatchObject({ scope: 'file-read', risk: 'low' });
    expect(classifyApprovalCommand('git log --oneline -5', 'agentic', context)).toMatchObject({ scope: 'file-read', risk: 'low' });
  });

  it('read-only recognition wins over the heuristic pattern ladder only when proven', () => {
    // A quoted "git push" inside a grep pattern is a read, not a push.
    expect(classifyApprovalCommand("grep -n 'git push' docs/a.md", 'agentic', context)).toMatchObject({ scope: 'file-read' });
    expect(classifyApprovalCommand('git push origin main', 'agentic', context)).toMatchObject({ scope: 'git-mutation', risk: 'high', reasonCode: 'GIT_PUSH' });
    expect(classifyApprovalCommand('cat f > g', 'agentic', context)).toMatchObject({ scope: 'shell-exec', risk: 'medium', reasonCode: 'SHELL_EXEC_DEFAULT' });
    expect(classifyApprovalCommand('cat /etc/passwd', 'agentic', context)).toMatchObject({ scope: 'shell-exec', risk: 'medium' });
    expect(classifyApprovalCommand('cat .env', 'agentic', context)).toMatchObject({ scope: 'shell-exec', risk: 'medium' });
  });

  it('keeps the context-free (worker gate) contract byte-identical: every shell command stays at least shell-exec', () => {
    expect(classifyApprovalCommand('cat README.md', 'worker')).toEqual({ scope: 'shell-exec', risk: 'medium', reason: 'shell command execution', reasonCode: 'SHELL_EXEC_DEFAULT' });
    expect(classifyApprovalCommand('cat README.md', 'agentic')).toMatchObject({ scope: 'shell-exec' });
    expect(classifyApprovalCommand('git push --force origin main', 'worker')).toMatchObject({ reasonCode: 'GIT_PUSH_FORCE', reason: 'git push --force' });
  });

  it('follows the PowerShell dialect when the host runs deckent_bash through powershell.exe', () => {
    const win = { dialect: 'powershell' as const, projectRoot: 'C:\\proj' };
    expect(classifyApprovalCommand('Get-Content README.md -TotalCount 20', 'agentic', win)).toMatchObject({ scope: 'file-read', risk: 'none' });
    expect(classifyApprovalCommand('Get-Content README.md | Out-File x', 'agentic', win)).toMatchObject({ scope: 'shell-exec' });
  });
});
