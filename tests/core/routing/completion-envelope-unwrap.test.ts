// ─── 581-B16 regression: provider-envelope unwrap for the routing completeFn ──
//
// The routing content-batch AND the K3 tie-judge share one completeFn that
// spawns the provider CLI with `--output-format json`. That flag wraps the
// answer in an envelope `{"type":"result","result":"<escaped JSON string>"}`.
// Before this fix, completeFn resolved the RAW envelope, so BOTH consumers
// silently failed on 100% of real calls (content-batch → structural fallback
// for every task; tie-judge → null → fail-open → never fired). The unit tests
// that "covered" them injected FAKE completers and never exercised the real
// envelope→parse path — which is exactly why the bug shipped.
//
// This pin runs the REAL ClaudeAdapter.parseAgentResponse (the unwrap completeFn
// now applies) over a REAL provider envelope shape, then the REAL parsers, and
// asserts both consumers get usable output. A fake completer here would defeat
// the test's whole purpose.

import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../../src/providers/claude.js';
import { parseContentBatchResponse } from '../../../src/core/routing/content-llm.js';
import { parseTieJudgeVerdict } from '../../../src/core/routing/tie-judge.js';

/** Build the exact `claude --output-format json` envelope: the answer is a
 *  JSON string nested in the `result` field (escaped once), as captured live. */
function providerEnvelope(inner: string): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 7000,
    num_turns: 1,
    result: inner, // JSON.stringify escapes the nested JSON exactly like the CLI
    session_id: '386f264f-d139-4fc9-a16b-0ec',
  });
}

// projectDir is required by the constructor but unused by parseAgentResponse
// (a pure envelope decoder) — process.cwd() keeps the instance valid + hermetic.
const adapter = new ClaudeAdapter(process.cwd());
/** The unwrap step completeFn applies before resolving (sprint-planner.ts). */
const unwrap = (raw: string): string =>
  typeof adapter.parseAgentResponse === 'function' ? adapter.parseAgentResponse(raw) : raw;

describe('581-B16 — provider-envelope unwrap revives both completeFn consumers', () => {
  it('content-batch: raw envelope parses to ZERO entries (the shipped bug); unwrapped parses fully', () => {
    const inner = JSON.stringify([
      { taskId: 't1', workType: 'build', subtype: null, summary: 'add the widget', semanticTags: ['ui'], confidence: 0.8 },
      { taskId: 't2', workType: 'review', subtype: null, summary: 'audit the flow', semanticTags: ['security'], confidence: 0.7 },
    ]);
    const envelope = providerEnvelope(inner);
    const known = new Set(['t1', 't2']);

    // Reproduce the bug: parsing the RAW envelope drops everything.
    const rawResult = parseContentBatchResponse(envelope, known);
    expect(rawResult.entries.size).toBe(0);

    // The fix: unwrap first, then every entry parses.
    const fixed = parseContentBatchResponse(unwrap(envelope), known);
    expect(fixed.entries.size).toBe(2);
    expect(fixed.entries.get('t1')?.workType).toBe('build');
    expect(fixed.entries.get('t2')?.workType).toBe('review');
    expect(fixed.dropped).toHaveLength(0);
  });

  it('tie-judge: raw envelope yields null (the shipped bug — judge never fires); unwrapped yields the verdict', () => {
    const inner = JSON.stringify({ agentId: 'terminal-ux-engineer', rationale: 'best CLI fit' });
    const envelope = providerEnvelope(inner);
    const allowed = new Set(['terminal-ux-engineer', 'implementer']);

    // Reproduce the bug: the envelope's own `{…}` matches, JSON.parse succeeds,
    // but `.agentId` is undefined → null → fail-open → the judge never fires.
    expect(parseTieJudgeVerdict(envelope, allowed)).toBeNull();

    // The fix: unwrap first, then the real verdict comes through.
    const verdict = parseTieJudgeVerdict(unwrap(envelope), allowed);
    expect(verdict).toEqual({ agentId: 'terminal-ux-engineer', rationale: 'best CLI fit' });
  });

  it('unwrap is a no-op for a bare (non-enveloped) answer — codex/gemini direct output still works', () => {
    const bareArray = JSON.stringify([{ taskId: 't1', workType: 'build', subtype: null, summary: 's', semanticTags: [], confidence: 0.9 }]);
    expect(parseContentBatchResponse(unwrap(bareArray), new Set(['t1'])).entries.size).toBe(1);
    const bareVerdict = JSON.stringify({ agentId: 'implementer', rationale: 'r' });
    expect(parseTieJudgeVerdict(unwrap(bareVerdict), new Set(['implementer']))?.agentId).toBe('implementer');
  });
});
