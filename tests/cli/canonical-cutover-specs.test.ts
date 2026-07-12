/**
 * TERM-6 T6A (428-004) — canonical-cutover pins for cli-bridge-tool-specs.ts.
 *
 * Module-level contract, independent of tests/cli/run-flow-controller.test.ts's
 * registry-level pins (which build the full native tool registry and never
 * hardcode the note text). This file asserts directly against the specs
 * module's own exports:
 *   1. deckent_propose_run is named + carries the canonical-path note, and is
 *      deliberately absent from the base CLI_BRIDGE_TOOLS catalog (only the
 *      registry adds it, flag-on).
 *   2. the escape-hatch note literally labels set/plan/start "Expert ...
 *      escape hatch" and names deckent_propose_run as the canonical path.
 *   3. the escape-hatch trio is exactly {set_directives, plan, start} — never
 *      silently widened/narrowed.
 *   4. nogo guard: none of the trio has been deleted from CLI_BRIDGE_TOOLS.
 *   5. flag-off bit-eş guard: the trio's BASE descriptions carry no
 *      escape-hatch text — the note is purely additive at the registry layer.
 *   6. tool-count two-state pin: base catalog floor (>=29, born-596 parity)
 *      plus exactly +1 for the flag-on addition.
 */
import { describe, it, expect } from 'vitest';
import {
  CLI_BRIDGE_TOOLS,
  RUN_FLOW_PROPOSAL_TOOL_NAME,
  RUN_FLOW_PROPOSAL_TOOL_SPEC,
  RUN_FLOW_ESCAPE_HATCH_NOTE,
  RUN_FLOW_ESCAPE_HATCH_NAMES,
} from '../../src/cli/repl/cli-bridge-tool-specs.js';

describe('T6A — deckent_propose_run canonical-path note', () => {
  it('is named deckent_propose_run and states it is the canonical entry point', () => {
    expect(RUN_FLOW_PROPOSAL_TOOL_NAME).toBe('deckent_propose_run');
    expect(RUN_FLOW_PROPOSAL_TOOL_SPEC.name).toBe(RUN_FLOW_PROPOSAL_TOOL_NAME);
    expect(RUN_FLOW_PROPOSAL_TOOL_SPEC.description).toContain('Canonical entry point');
    expect(RUN_FLOW_PROPOSAL_TOOL_SPEC.description).toContain('terminal.run_flow_v2');
  });

  it('is NOT part of the base CLI_BRIDGE_TOOLS catalog — only the registry adds it, flag-on', () => {
    expect(CLI_BRIDGE_TOOLS.find((s) => s.name === RUN_FLOW_PROPOSAL_TOOL_NAME)).toBeUndefined();
  });
});

describe('T6A — expert escape-hatch label on set/plan/start', () => {
  it('the note literally labels the tools an expert-level escape hatch pointing at the canonical path', () => {
    expect(RUN_FLOW_ESCAPE_HATCH_NOTE).toMatch(/expert/i);
    expect(RUN_FLOW_ESCAPE_HATCH_NOTE).toMatch(/escape hatch/i);
    expect(RUN_FLOW_ESCAPE_HATCH_NOTE).toContain('deckent_propose_run');
    expect(RUN_FLOW_ESCAPE_HATCH_NOTE).toContain('terminal.run_flow_v2');
  });

  it('the escape-hatch trio is exactly set_directives/plan/start — no drift', () => {
    expect([...RUN_FLOW_ESCAPE_HATCH_NAMES].sort()).toEqual(
      ['deckent_plan', 'deckent_set_directives', 'deckent_start'].sort(),
    );
  });

  it('nogo guard: none of the escape-hatch trio has been deleted from CLI_BRIDGE_TOOLS', () => {
    for (const name of RUN_FLOW_ESCAPE_HATCH_NAMES) {
      const spec = CLI_BRIDGE_TOOLS.find((s) => s.name === name);
      expect(spec, `${name} must remain in CLI_BRIDGE_TOOLS (expert escape hatch, not removed)`).toBeDefined();
    }
  });

  it('flag-off bit-eş guard: the trio\'s base descriptions carry no escape-hatch text', () => {
    for (const name of RUN_FLOW_ESCAPE_HATCH_NAMES) {
      const spec = CLI_BRIDGE_TOOLS.find((s) => s.name === name)!;
      expect(spec.description).not.toContain(RUN_FLOW_ESCAPE_HATCH_NOTE);
      expect(spec.description).not.toMatch(/expert.*escape hatch/i);
    }
  });
});

describe('T6A — tool-count pin (two-state: flag-off base vs flag-on +1)', () => {
  it('base catalog stays at or above the born-596 parity floor', () => {
    expect(CLI_BRIDGE_TOOLS.length).toBeGreaterThanOrEqual(29);
  });

  it('flag-on total (as derivable from this module alone) is exactly base + 1', () => {
    const baseNames = new Set(CLI_BRIDGE_TOOLS.map((s) => s.name));
    expect(baseNames.has(RUN_FLOW_PROPOSAL_TOOL_NAME)).toBe(false);
    const flagOnNames = new Set([...baseNames, RUN_FLOW_PROPOSAL_TOOL_NAME]);
    expect(flagOnNames.size).toBe(CLI_BRIDGE_TOOLS.length + 1);
  });
});
