import { describe, expect, it } from 'vitest';
import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import {
  APPROVAL_CANCELLED_EXIT_CODE,
  buildApprovalDecisionContext,
  isInteractiveTerminalCancellation,
} from '../../src/cli/commands/approvals.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

function request(scope: ApprovalRequest['scope'], details: Record<string, unknown> = {}): ApprovalRequest {
  return {
    id: `context-${scope}`,
    requester: { role: 'worker', instanceId: 'worker-17' },
    summary: 'Read one project file',
    details,
    scopeId: 'project:file-7',
    scope,
    risk: 'low',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'tenant-a',
    userId: 'operator-a',
    createdAt: '2026-09-07T12:00:00.000Z',
    expiresAt: '2026-09-07T12:10:00.000Z',
    maskedArgs: { path: 'docs/README.md', token: '[REDACTED]' },
  };
}

describe('approval decision context truth', () => {
  it.each(['file-read', 'file-write', 'shell-exec', 'git-mutation', 'network', 'credential', 'lifecycle'] as const)(
    'renders exact %s request authority without claiming execution or reachability',
    (scope) => {
      for (const lang of ['en', 'tr']) {
        const text = buildApprovalDecisionContext(request(scope), 'allow', lang);
        expect(text).toContain(`context-${scope}`);
        expect(text).toContain(`worker/worker-17`);
        expect(text).toContain(`operator-a / tenant-a`);
        expect(text).toContain(scope);
        expect(text).toContain('project:file-7');
        expect(text).toContain('[REDACTED]');
        expect(text).not.toMatch(/one[- ]time|tek kullanımlık|runs? the|çalışma süresi|reachability check|erişim denemesi/i);
      }
    },
  );

  it('renders a declared execution subject only when present and keeps unknown values honest', () => {
    const generic = buildApprovalDecisionContext(request('file-read'), 'allow', 'en');
    expect(generic).not.toContain('Declared target');
    const specialized = buildApprovalDecisionContext(request('network', {
      subject: { provider: 'claude', model: 'sonnet', backendScope: 'probe', budget: {} },
    }), 'allow', 'en');
    expect(specialized).toContain('Declared target: claude/sonnet · probe');
    expect(specialized).toContain('Declared ceiling: unknown tokens · unknown s');
  });

  it('uses action-specific neutral confirmation and consequence copy in both languages', () => {
    for (const lang of ['en', 'tr']) {
      const deny = buildApprovalDecisionContext(request('file-read'), 'deny', lang);
      expect(deny).toContain(getMessage('approvals.action_deny', lang));
      const prompt = getMessage('approvals.confirm_prompt', lang, { action: getMessage('approvals.action_deny', lang) });
      expect(prompt).not.toMatch(/type "yes" to approve|onaylıyorsan/i);
      const effect = getMessage('approvals.decided_effect', lang);
      expect(effect).not.toMatch(/waiting job|bekleyen iş|reachable|erişilebilir/i);
      expect(effect).toMatch(/not yet proven|henüz kanıtlanmış değildir/i);
    }
  });

  it('distinguishes readline cancellation from authentication failure and localizes its truthful boundary', () => {
    const cancelled = new Error('readline cancelled');
    cancelled.name = 'AbortError';
    expect(isInteractiveTerminalCancellation(cancelled)).toBe(true);
    expect(isInteractiveTerminalCancellation(new Error('terminal unavailable'))).toBe(false);
    expect(APPROVAL_CANCELLED_EXIT_CODE).toBe(130);
    for (const lang of ['en', 'tr']) {
      const text = getMessage('approvals.decision_cancelled', lang, { id: 'approval-17' });
      expect(text).toContain('approval-17');
      expect(text).not.toMatch(/approved|onaylandı|denied|reddedildi/i);
    }
  });
});
