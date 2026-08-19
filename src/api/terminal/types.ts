export type TenantId = string; // "local" today; future: real tenant id (#3 seam)
export type SessionKind = 'ai' | 'deckent' | 'shell';
export type AiTool = 'claude' | 'gemini' | 'codex' | 'cursor';

export interface CreateSessionInput {
  kind: SessionKind;
  tool?: AiTool;       // required when kind==='ai'
  cwd?: string;
  args?: string[];     // for kind==='deckent'
  tenantId?: TenantId; // default 'local'
}

export interface SessionMeta {
  id: string;
  kind: SessionKind;
  tenantId: TenantId;
  createdAt: string;   // ISO 8601
  status: 'running' | 'exited';
  exitCode?: number;
}

export type AuditAction =
  | 'session.create' | 'session.attach' | 'session.detach'
  | 'session.kill' | 'session.exit' | 'auth.ok' | 'auth.deny'
  | 'guard.block'
  | 'outbound.warn' | 'outbound.kill';

export interface AuditEvent {
  action: AuditAction;
  tenantId: TenantId;
  sessionId?: string;
  detail?: string;     // never raw PTY output — short structured note only
  at: string;          // ISO 8601
}
