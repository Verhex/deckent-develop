export interface SessionMeta {
  id: string;
  kind: string;
  status: string;
}

export function getBootstrapToken(): string | undefined {
  return (window as unknown as { __DECKENT_TERMINAL_TOKEN__?: string }).__DECKENT_TERMINAL_TOKEN__;
}

export async function createSession(input: { kind: string; tool?: string; args?: string[] }): Promise<SessionMeta> {
  const res = await fetch('/api/terminal/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
  return res.json() as Promise<SessionMeta>;
}

export async function listSessions(): Promise<SessionMeta[]> {
  const res = await fetch('/api/terminal/sessions');
  return res.ok ? (res.json() as Promise<SessionMeta[]>) : [];
}

export async function killSession(id: string): Promise<void> {
  await fetch(`/api/terminal/sessions/${id}`, { method: 'DELETE' });
}
