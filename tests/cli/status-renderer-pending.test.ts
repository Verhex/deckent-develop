// tests/cli/status-renderer-pending.test.ts
//
// W3 — `deckent status --follow` (StatusRenderer box) surfaces parked approvals
// live. The renderer reads the SAME durable hub (readPendingApprovals) as plain
// `deckent status`, so a NERVOUS_NOTIFICATION event-stream redraw shows the exact
// accept command in the live box. No noise when nothing is parked.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StatusRenderer } from '../../src/cli/helpers/status-renderer.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'renderer-pending-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent', 'nervous'), { recursive: true });
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('StatusRenderer.snapshot() — W3 pending approvals (live status --follow)', () => {
  it('renders the parked approval title + exact accept command', () => {
    const d = sandbox();
    writeFileSync(
      join(d, '.deckent', 'nervous', 'nervous-pending.json'),
      JSON.stringify([{ id: 'k9', title: 'Directives changed' }]),
    );
    const out = new StatusRenderer({ projectRoot: d, noColor: true, terminalWidth: 80 }).snapshot();
    expect(out).toContain('Pending approvals (1)');
    expect(out).toContain('deckent nervous accept k9');
  });

  it('omits the pending section when nothing is parked (no noise)', () => {
    const out = new StatusRenderer({ projectRoot: sandbox(), noColor: true, terminalWidth: 80 }).snapshot();
    expect(out).not.toContain('Pending approvals');
    expect(out).not.toContain('nervous accept');
  });
});
