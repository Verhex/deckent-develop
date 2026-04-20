import { describe, it, expect } from 'vitest';
import {
  ACTION_REGISTRY,
  ACTION_BY_ID,
  getAction,
  getActionsByCategory,
  isSafetyFloorAction,
} from '../../src/nervous/action-registry.js';

describe('ActionRegistry', () => {
  // Test 1: Total count
  it('should contain exactly 30 actions', () => {
    expect(ACTION_REGISTRY.length).toBe(30);
  });

  // Test 2: Category counts (8 low + 11 medium + 6 high + 5 safety-floor = 30)
  it('should have correct category distribution', () => {
    const low = ACTION_REGISTRY.filter(a => a.category === 'low-risk');
    const medium = ACTION_REGISTRY.filter(a => a.category === 'medium-risk');
    const high = ACTION_REGISTRY.filter(a => a.category === 'high-risk');
    const safetyFloor = ACTION_REGISTRY.filter(a => a.category === 'safety-floor');

    expect(low.length).toBe(8);
    expect(medium.length).toBe(11);
    expect(high.length).toBe(6);
    expect(safetyFloor.length).toBe(5);
    expect(low.length + medium.length + high.length + safetyFloor.length).toBe(30);
  });

  // Test 3: ACTION_BY_ID lookup
  it('should look up ORPHAN_TASK_ARCHIVE by ID', () => {
    const action = ACTION_BY_ID.get('ORPHAN_TASK_ARCHIVE');
    expect(action).toBeDefined();
    expect(action!.displayName).toBe('Orphan Task Archive');
    expect(action!.category).toBe('low-risk');
    expect(action!.reversible).toBe(true);
  });

  // Test 4: Safety floor IDs have requiredSafetyFloor set
  it('should have all 5 safety floor actions with requiredSafetyFloor', () => {
    const safetyFloorIds = [
      'KILL_LIVE_SPRINT',
      'MANUAL_FILE_DELETE',
      'COST_OVER_THRESHOLD',
      'DESTRUCTIVE_GIT',
      'ADR_DEPRECATE_ACCEPTED',
    ];

    for (const id of safetyFloorIds) {
      const action = ACTION_BY_ID.get(id);
      expect(action, `${id} should exist`).toBeDefined();
      expect(action!.category, `${id} should be safety-floor`).toBe('safety-floor');
      expect(action!.requiredSafetyFloor.length, `${id} should have requiredSafetyFloor`).toBeGreaterThan(0);
      expect(isSafetyFloorAction(id), `${id} should be safety floor`).toBe(true);
    }
  });

  // Test 5: defaultRisk consistent with category
  it('should have defaultRisk consistent with category', () => {
    for (const action of ACTION_REGISTRY) {
      if (action.category === 'low-risk') {
        expect(action.defaultRisk, `${action.id} low-risk → low`).toBe('low');
      } else if (action.category === 'medium-risk') {
        expect(action.defaultRisk, `${action.id} medium-risk → medium`).toBe('medium');
      } else if (action.category === 'high-risk' || action.category === 'safety-floor') {
        expect(action.defaultRisk, `${action.id} high-risk/safety-floor → high`).toBe('high');
      }
    }
  });

  // Test 6: getAction unknown
  it('should return undefined for unknown action ID', () => {
    expect(getAction('UNKNOWN')).toBeUndefined();
    expect(getAction('')).toBeUndefined();
    expect(getAction('kill_live_sprint')).toBeUndefined(); // case sensitive
  });

  // Test 7: getActionsByCategory
  it('should return 11 medium-risk actions', () => {
    const mediumActions = getActionsByCategory('medium-risk');
    expect(mediumActions.length).toBe(11);
    for (const a of mediumActions) {
      expect(a.category).toBe('medium-risk');
    }
  });

  // Test 8: isSafetyFloorAction positive
  it('should identify safety floor actions correctly', () => {
    expect(isSafetyFloorAction('KILL_LIVE_SPRINT')).toBe(true);
    expect(isSafetyFloorAction('MANUAL_FILE_DELETE')).toBe(true);
    expect(isSafetyFloorAction('COST_OVER_THRESHOLD')).toBe(true);
    expect(isSafetyFloorAction('DESTRUCTIVE_GIT')).toBe(true);
    expect(isSafetyFloorAction('ADR_DEPRECATE_ACCEPTED')).toBe(true);
  });

  // Test 9: isSafetyFloorAction negative
  it('should return false for non-safety-floor actions', () => {
    expect(isSafetyFloorAction('ORPHAN_TASK_ARCHIVE')).toBe(false);
    expect(isSafetyFloorAction('SPRINT_START')).toBe(false);
    expect(isSafetyFloorAction('COMMIT_PUSH')).toBe(false);
    expect(isSafetyFloorAction('UNKNOWN')).toBe(false);
  });

  // Test 10: No duplicate IDs
  it('should have no duplicate action IDs', () => {
    const ids = ACTION_REGISTRY.map(a => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    expect(ACTION_BY_ID.size).toBe(ACTION_REGISTRY.length);
  });
});
