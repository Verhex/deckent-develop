// src/orchestra/autonomous/authority-adapter.ts
//
// AuthorityChecker adapter — wraps authority-enforcer.checkAuthority into the
// AuthorityChecker DI interface consumed by autonomous-runtime.ts.
// Sprint 226 Task 226-001. ADR-037 (RBAC).

import { checkAuthority } from '../authority-enforcer.js';
import type { AgentRole, ActionType } from '../authority-enforcer.js';
import type {
  AuthorityChecker,
  AuthorityDecision,
  AuthorityOutcome,
} from '../autonomous-runtime.js';

// ─── Internal Mapping Helpers ─────────────────────────────────────────

const ROLE_MAP: Record<string, AgentRole> = {
  brain: 'brain',
  auditor: 'auditor',
  worker: 'worker',
  system: 'brain',
};

/**
 * Map requestedBy string to AgentRole.
 * Returns null for unknown subjects → caller applies default-deny.
 */
function resolveRole(requestedBy: string): AgentRole | null {
  if (!requestedBy) return null;
  const lower = requestedBy.toLowerCase();
  for (const [prefix, role] of Object.entries(ROLE_MAP)) {
    if (lower === prefix || lower.startsWith(`${prefix}:`)) return role;
  }
  return null;
}

/** Map symbolic autonomous action string to authority-enforcer ActionType. */
function resolveActionType(action: string): ActionType {
  const lower = action.toLowerCase();
  if (lower.includes('kill')) return 'kill';
  if (lower.includes('spawn') || lower.includes('start')) return 'spawn';
  if (lower.includes('append')) return 'append';
  if (lower.includes('write') || lower.includes('create') || lower.includes('update') || lower.includes('delete')) return 'write';
  if (lower.includes('emit') || lower.includes('publish')) return 'event_emit';
  if (lower.includes('consume') || lower.includes('subscribe')) return 'event_consume';
  if (lower.includes('read') || lower.includes('get') || lower.includes('fetch') || lower.includes('list') || lower.includes('status')) return 'read';
  return 'event_emit';
}

/** Map AuthorityCheckResult level/allowed to AuthorityOutcome. */
function toOutcome(allowed: boolean, level: 'permit' | 'warn' | 'deny'): AuthorityOutcome {
  if (allowed) return 'allowed';
  if (level === 'deny') return 'denied';
  return 'needs_approval';
}

// ─── Public Factory ───────────────────────────────────────────────────

/**
 * Create an AuthorityChecker that wraps the real authority-enforcer.checkAuthority.
 *
 * Default-deny: any requestedBy not recognized as a known agent role is
 * immediately denied without calling checkAuthority (ADR-037).
 */
export function makeAuthorityChecker(): AuthorityChecker {
  return {
    check(action: string, requestedBy: string): AuthorityDecision {
      const role = resolveRole(requestedBy);

      if (role === null) {
        return {
          outcome: 'denied',
          reason: `Unknown requestedBy "${requestedBy}" — default-deny (ADR-037)`,
        };
      }

      const result = checkAuthority({
        role,
        action: resolveActionType(action),
        target: action,
      });

      return {
        outcome: toOutcome(result.allowed, result.level),
        reason: result.reason,
      };
    },
  };
}
