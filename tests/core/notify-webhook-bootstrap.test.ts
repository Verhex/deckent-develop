// R4/B11 WIRE — webhook notification delivery through bootstrapNotifyDispatcher.
//
// Faithful regression: proves that notify_channel='webhook' + notify_url is now
// wired into the canonical NotifyDispatcher chain. Before the wire, the webhook
// option was ignored (the dormant WebhookNotificationProvider had zero prod
// callers), so a dispatched notification NEVER reached an outbound HTTP webhook.
//
// Pre-fix (revert src/core/notify-bootstrap.ts): the `webhook` option is dropped,
// the recording HttpClient is never called → the delivery test FAILS.
// Post-fix: the webhook adapter is registered and delivers → it passes.
//
// Imports ONLY stable symbols (bootstrapNotifyDispatcher + createNotification +
// the pre-existing HttpClient type) so the faithful proof isolates the WIRE
// behavior, not a new export. Hermetic: tmpdir + saved/restored process-globals.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapNotifyDispatcher } from '../../src/core/notify-bootstrap.js';
import { clearGlobalNotifyDispatcher } from '../../src/core/notify-registry.js';
import { createNotification } from '../../src/core/notification-dispatcher.js';
import type { HttpClient } from '../../src/core/notification-providers/webhook.js';

/** Recording HttpClient — captures every outbound POST. */
class RecordingHttpClient implements HttpClient {
  readonly calls: Array<{ url: string; body: string }> = [];
  async post(url: string, body: string): Promise<{ statusCode: number }> {
    this.calls.push({ url, body });
    return { statusCode: 200 };
  }
}

describe('bootstrapNotifyDispatcher — webhook wire (R4/B11)', () => {
  let tmpDir: string;
  let savedParentPid: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-webhook-'));
    savedParentPid = process.env['DECKENT_PARENT_PID'];
    clearGlobalNotifyDispatcher();
  });

  afterEach(() => {
    clearGlobalNotifyDispatcher();
    if (savedParentPid === undefined) delete process.env['DECKENT_PARENT_PID'];
    else process.env['DECKENT_PARENT_PID'] = savedParentPid;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('delivers a dispatched notification to the configured webhook URL', async () => {
    const recorder = new RecordingHttpClient();
    const dispatcher = bootstrapNotifyDispatcher({
      projectRoot: tmpDir,
      webhook: { url: 'https://example.test/hook', projectName: 'proj', httpClient: recorder },
    });

    // 'human-checkpoint-required' is critical → sent immediately (no throttle).
    await dispatcher.dispatch(
      createNotification('human-checkpoint-required', 'sprint-1', 'Checkpoint', 'Approve me', 'extra'),
    );

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]!.url).toBe('https://example.test/hook');
    const payload = JSON.parse(recorder.calls[0]!.body) as Record<string, unknown>;
    // Canonical event name forwarded losslessly (widened NotificationEventType).
    expect(payload['event']).toBe('human-checkpoint-required');
    expect(String(payload['summary'])).toContain('Checkpoint');
    expect(payload['project']).toBe('proj');
  });

  it('registers the webhook adapter only when a webhook URL is configured', () => {
    const without = bootstrapNotifyDispatcher({ projectRoot: tmpDir });
    const baseline = without.adapterCount; // cli + file
    clearGlobalNotifyDispatcher();

    const withHook = bootstrapNotifyDispatcher({
      projectRoot: tmpDir,
      webhook: { url: 'https://example.test/hook', projectName: 'proj', httpClient: new RecordingHttpClient() },
    });
    expect(withHook.adapterCount).toBe(baseline + 1);
  });

  it('does not register a webhook adapter for an empty URL', () => {
    const without = bootstrapNotifyDispatcher({ projectRoot: tmpDir });
    const baseline = without.adapterCount;
    clearGlobalNotifyDispatcher();

    const blank = bootstrapNotifyDispatcher({
      projectRoot: tmpDir,
      webhook: { url: '   ', projectName: 'proj', httpClient: new RecordingHttpClient() },
    });
    expect(blank.adapterCount).toBe(baseline);
  });
});
