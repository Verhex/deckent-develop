import type { SqliteMissionStore } from '../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import type {
  ResultLike,
  WorkItemStatus,
} from '../../src/orchestra/autonomous/mission-store/mission-types.js';

/** Exercise the real host claim→settle authority in tests; never bypass lifecycle CAS. */
export function settleMissionItem(
  store: SqliteMissionStore,
  id: string,
  status: Extract<WorkItemStatus, 'done' | 'failed' | 'parked'>,
  result: ResultLike,
): void {
  const claim = store.claimItemWithAuthority(id, `test-settler:${id}`);
  if (!claim) throw new Error(`TEST_MISSION_CLAIM_FAILED: ${id}`);
  if (!store.settleClaimedItem(claim, status, result)) {
    throw new Error(`TEST_MISSION_SETTLEMENT_FAILED: ${id}`);
  }
}
