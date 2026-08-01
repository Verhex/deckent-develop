import { describe, expect, it } from 'vitest';

import { createSprintAttributionFixture } from '../helpers/sprint-attribution-fixture.js';
import { assembleSprintTerminalEvidence } from '../../src/orchestra/sprint-terminal-evidence.js';

describe('multi-attempt attribution summary replay', () => {
  it('projects only verified exact-attempt files while retaining exclusions and independent cost evidence', () => {
    const fixture = createSprintAttributionFixture();
    const projection = assembleSprintTerminalEvidence({
      attempts: fixture.attempts,
      coordinatorEvidence: [],
    });

    const completed = projection.completed.find(
      item => item.logicalTaskId === 'logical-485-006',
    );
    expect(completed).toBeDefined();
    expect(completed?.resolvedBy.attemptId).toBe('fix-fix-attempt');

    const verifiedByAttempt = new Map(
      completed?.verifiedAttribution.map(item => [item.identity.attemptId, item]),
    );
    expect([...verifiedByAttempt.keys()]).toEqual(fixture.expectedVerifiedAttemptIds);
    expect(verifiedByAttempt.get('original-attempt')?.filesChanged)
      .toEqual(fixture.expectedFilesByAttempt['original-attempt']);
    expect(verifiedByAttempt.get('fix-fix-attempt')?.filesChanged)
      .toEqual(fixture.expectedFilesByAttempt['fix-fix-attempt']);
    expect(verifiedByAttempt.has('fix-attempt')).toBe(false);

    const excludedAttemptIds = projection.attributionExclusions
      .map(item => item.identity.attemptId);
    expect(excludedAttemptIds).toEqual(fixture.expectedExcludedAttemptIds);
    expect(projection.summary.attributionExclusionCount).toBe(2);

    const independentlyAccountedCostUsd = fixture.attempts
      .reduce((total, attempt) => total + attempt.result.payload.costUsd, 0);
    expect(independentlyAccountedCostUsd).toBe(fixture.independentlyAccountedCostUsd);
  });
});
