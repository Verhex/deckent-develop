// ─── Agent Sync Conflict Kind (MASTER 7104) ─────────────────────────────────
//
// Shared typed classification for the conflict shape both agent-prompt-sync.ts
// and agent-manifest-sync.ts report when a shadow file cannot be safely
// overwritten by the current builtin content. The two situations are distinct:
//   - 'missing-baseline': the shadow differs from the current builtin, but no
//     prior sync baseline was ever recorded for it (typical for older seeded
//     shadows) — provenance is unknown, so this is NOT necessarily a real
//     edit, only an unverifiable one.
//   - 'local-edit': the shadow differs from BOTH the recorded last-synced
//     baseline and the current builtin content — a real three-way conflict,
//     confirming the shadow was locally edited after the last sync.

export const AGENT_SYNC_CONFLICT_KINDS = ['missing-baseline', 'local-edit'] as const;

export type AgentSyncConflictKind = (typeof AGENT_SYNC_CONFLICT_KINDS)[number];

export function isAgentSyncConflictKind(value: unknown): value is AgentSyncConflictKind {
  return (
    typeof value === 'string' &&
    (AGENT_SYNC_CONFLICT_KINDS as readonly string[]).includes(value)
  );
}
