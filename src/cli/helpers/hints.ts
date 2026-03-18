import { getMessage } from './messages.js';

// ─── Contextual Hints ────────────────────────────────────────────────

/**
 * Get contextual hints for a given sprint phase.
 * Returns an array of hint strings in the specified language.
 */
export function getContextualHints(
  phase: string,
  status?: object,
  lang = 'en',
): string[] {
  const normalizedPhase = phase.toUpperCase();

  switch (normalizedPhase) {
    case 'COMPLETE':
      return [getMessage('hint.COMPLETE', lang)];

    case 'EXECUTE':
      return buildExecuteHints(status, lang);

    case 'PLAN':
      return [getMessage('hint.PLAN', lang)];

    case 'IDLE':
      return [getMessage('hint.IDLE', lang)];

    default:
      return [];
  }
}

function buildExecuteHints(status: object | undefined, lang: string): string[] {
  const hints: string[] = [getMessage('hint.EXECUTE', lang)];

  if (status && typeof status === 'object') {
    const s = status as Record<string, unknown>;

    if (typeof s['taskCount'] === 'number') {
      hints.push(
        getMessage('status.tasks_running', lang, {
          taskCount: String(s['taskCount']),
        }),
      );
    }

    if (typeof s['sprintId'] === 'string') {
      hints.push(
        getMessage('status.sprint_active', lang, {
          sprintId: s['sprintId'],
        }),
      );
    }
  }

  return hints;
}
