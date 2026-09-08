import { join } from 'node:path';

import { SPRINT_STATE_FILE } from './constants.js';
import type { DebtInjectionHold } from './sprint-types.js';
import { readJsonSafe } from './utils.js';

export function assertDebtInjectionHolds(value: unknown): asserts value is DebtInjectionHold[] | undefined {
  if (value !== undefined && (!Array.isArray(value)
    || value.some(hold => !hold || typeof hold !== 'object'
      || typeof (hold as DebtInjectionHold).debtId !== 'string'
      || (hold as DebtInjectionHold).debtId.trim().length === 0
      || ((hold as DebtInjectionHold).reason !== 'legacy-unavailable'
        && (hold as DebtInjectionHold).reason !== 'invalid-origin')))) {
    throw new Error('SPRINT_STATE_DEBT_INJECTION_HOLDS_INVALID');
  }
}

export function readCurrentSprintDebtHolds(
  projectRoot: string,
  currentSprintId: string | null,
): readonly DebtInjectionHold[] | undefined {
  if (currentSprintId === null) return undefined;
  const state = readJsonSafe<Record<string, unknown>>(join(projectRoot, SPRINT_STATE_FILE));
  if (!state || state.sprintId !== currentSprintId) return undefined;
  assertDebtInjectionHolds(state.debtInjectionHolds);
  return state.debtInjectionHolds?.map(hold => Object.freeze({ ...hold }));
}
