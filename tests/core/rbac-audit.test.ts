import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Permission, can } from '../../src/core/rbac.js';
import * as auditWriter from '../../src/core/audit-writer.js';

const CTX = {
  actor: 'user-alice',
  projectRoot: '/tmp/rbac-audit-test',
  sprintId: 'sprint-test',
};

describe('can — audit on denial', () => {
  beforeEach(() => {
    vi.spyOn(auditWriter, 'writeAuditEvent').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deny → writeAuditEvent is called with access:denied', () => {
    const result = can('viewer', Permission.WRITE, 'tenant-1', CTX);
    expect(result).toBe(false);
    expect(auditWriter.writeAuditEvent).toHaveBeenCalledOnce();
    expect(auditWriter.writeAuditEvent).toHaveBeenCalledWith(
      CTX.projectRoot,
      CTX.sprintId,
      expect.objectContaining({ action: 'access:denied' }),
    );
  });

  it('allow → writeAuditEvent is NOT called', () => {
    const result = can('admin', Permission.READ, 'tenant-1', CTX);
    expect(result).toBe(true);
    expect(auditWriter.writeAuditEvent).not.toHaveBeenCalled();
  });

  it('tenant field is included in the audit event', () => {
    can('viewer', Permission.ADMIN, 'tenant-corp', CTX);
    expect(auditWriter.writeAuditEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ tenantId: 'tenant-corp' }),
    );
  });

  it('actor is recorded in the audit event', () => {
    can('operator', Permission.AUDIT, 'tenant-1', { ...CTX, actor: 'bob-operator' });
    expect(auditWriter.writeAuditEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ actor: 'bob-operator' }),
    );
  });

  it('no audit written when auditCtx is omitted (backward compat)', () => {
    const result = can('viewer', Permission.WRITE, 'tenant-1');
    expect(result).toBe(false);
    expect(auditWriter.writeAuditEvent).not.toHaveBeenCalled();
  });
});
