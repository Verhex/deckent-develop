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
