import { describe, expect, it } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { projectOwnerExecutionNotification } from '../../src/orchestra/sprint-controller.js';
import { projectSuccessfulSpawnAttemptEvidence } from '../../src/orchestra/sprint-phases.js';

describe('sprint owner-notification truth catalog', () => {
  it('drops failed-attempt dispatch evidence before a later zero-work SPAWN decision', () => {
    const failedAttempt = projectSuccessfulSpawnAttemptEvidence(false, [{
      taskId: '716-001', provider: 'codex', providerReleased: true,
    }]);
    const notification = projectOwnerExecutionNotification('sprint-716', 'spawn', failedAttempt);

    expect(failedAttempt).toEqual([]);
    expect(notification).toMatchObject({
      id: 'sprint-dispatch-held:sprint-716',
      kind: 'paused',
      titleKey: 'sprint.notify_no_dispatch_title',
    });
  });

  it('projects owner start only from actual evidence and reports exact releases separately', () => {
    const notification = projectOwnerExecutionNotification('sprint-716', 'spawn', [{
      taskId: '716-001', provider: 'codex', providerReleased: true,
    }, {
      taskId: '716-002', provider: 'claude', providerReleased: false,
    }]);

    expect(notification).toEqual({
      id: 'sprint-started:sprint-716',
      kind: 'sprint-started',
      titleKey: 'sprint.notify_started_title',
      summaryKey: 'sprint.notify_started_summary',
      params: { sprintId: 'sprint-716', workers: '2', providerReleases: '1' },
    });
  });

  it('has no FIX projection before the repair-dispatch callback supplies evidence', () => {
    expect(projectOwnerExecutionNotification('sprint-716', 'fix', [])).toBeNull();
    expect(projectOwnerExecutionNotification('sprint-716', 'fix', [{
      taskId: '716-001-fix', provider: 'codex', providerReleased: true,
    }])).toMatchObject({
      id: 'fix-started:sprint-716',
      kind: 'fix-started',
      titleKey: 'sprint.notify_fix_started_title',
      params: { workers: '1', providerReleases: '1' },
    });
  });

  it.each(['en', 'tr'] as const)(
    'uses a HOLD/no-worker message for zero dispatch in %s',
    (lang) => {
      const title = getMessage('sprint.notify_no_dispatch_title', lang, { sprintId: 'sprint-716' });
      const message = getMessage('sprint.notify_no_dispatch_summary', lang, { sprintId: 'sprint-716' });

      expect(`${title}\n${message}`).not.toMatch(/execution is underway|yürütme sürüyor/i);
      expect(`${title}\n${message}`).toMatch(/no worker|worker gönderimi/i);
    },
  );

  it.each(['en', 'tr'] as const)(
    'reports admitted dispatch evidence without raw runtime detail in %s',
    (lang) => {
      const initial = getMessage('sprint.notify_started_summary', lang, {
        sprintId: 'sprint-716', workers: '1', providerReleases: '1',
      });
      const repair = getMessage('sprint.notify_fix_started_summary', lang, {
        sprintId: 'sprint-716', workers: '1', providerReleases: '0',
      });

      expect(`${initial}\n${repair}`).not.toMatch(/docker|claude|codex|gemini|\/|\\/i);
      expect(`${initial}\n${repair}`).toContain('1');
    },
  );
});
