import { describe, it, expect } from 'vitest';
import {
  REQUIRED_FIELDS,
  parseBornIntake,
  checkBornIntake,
} from '../../scripts/check-born-intake.mjs';

// ─── fixtures ───────────────────────────────────────────────────────────

function buildValidFixture(): string {
  return `# RECOVERY-BORN Intake Draft

## Work ID
RECOVERY-BORN-519-INTAKE-CHECKER-001

## Parent ID
RECOVERY-DOGFOOD-BORN-001

## Title
Intake checker had no automated coverage of its own mandatory-field contract

## Priority
P2

## Dependencies
—

## Trigger
Sprint-519 task 519-003 introduced the checker script without a test
driving it against a valid draft, per-field-missing drafts and a real
ledger row.

## Affected surfaces
follow-up-works born-intake workflow, scripts/check-born-intake.mjs

## Exact evidence
tests/scripts/born-intake-checker.test.ts covers the valid fixture, one
missing-field fixture per required field, and the RECOVERY-BORN-480-HEARTBEAT-001
golden row from docs/MASTER-PLAN.md row 3171.

## Acceptance
checkBornIntake reports valid=true for a fully filled draft and a typed
MISSING_FIELD gap for every draft missing exactly one required section.

## Negative scope
no CI wiring, no docs/MASTER-PLAN.md edits, no new mandatory fields beyond
the row 3169 contract.

## Date
2026-08-11
`;
}

/** Removes an entire `## <field>` section (heading + body) from a fixture. */
function removeSection(content: string, field: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      skipping = headingMatch[1] === field;
      if (skipping) continue;
    }
    if (!skipping) out.push(line);
  }

  return out.join('\n');
}

// Real content transcribed read-only from docs/MASTER-PLAN.md row 3171
// (RECOVERY-BORN-480-HEARTBEAT-001, child of RECOVERY-DOGFOOD-BORN-001).
// The ledger file itself is never read by the checker or written by this test.
function buildGoldenFixtureFromRow3171(): string {
  return `# RECOVERY-BORN Intake Draft (golden case, row 3171)

## Work ID
RECOVERY-BORN-480-HEARTBEAT-001

## Parent ID
RECOVERY-DOGFOOD-BORN-001

## Title
Worker-writable heartbeat can regress monotonic recovery evidence

## Priority
P0

## Dependencies
WORKER-REGISTRY-001, RECOVERY-DECISION-001

## Trigger
Sprint-480 task 480-004 overwrote wrapper heartbeat sequence \`80+\` with
\`sequence=1\` and hardcoded \`2026-07-30T00:10:00.000Z\` while host time was
approximately \`2026-07-30T19:47Z\`; wrapper later projected sequence \`111\`,
proving split writers. Sprint-482 reproduced the same split writer: Docker
wrapper heartbeats reached sequence \`7+\`, worker-authored task heartbeats
restarted at sequence \`1\`, and the wrapper later advanced again.

## Affected surfaces
Worker registry, status, recovery decision and Docker wrapper.

## Exact evidence
Sprint-480 task 480-004 wrapper heartbeat sequence \`80+\` overwritten with
\`sequence=1\`, hardcoded timestamp \`2026-07-30T00:10:00.000Z\` vs host time
\`2026-07-30T19:47Z\`; wrapper later at sequence \`111\`. Sprint-482 Docker
wrapper reached sequence \`7+\` while worker-authored task heartbeats
restarted at sequence \`1\`. \`receipt=GR-2026-08-04-FAZ4A-S7-01\`.

## Acceptance
Heartbeat publication has one fenced writer or monotonic CAS; a worker
cannot lower sequence, forge wall time or overwrite wrapper authority;
regressions become typed contradictory evidence without hiding a live
process.

## Negative scope
no PID/time-only orphan verdict, no broad \`.tasks\` cleanup, no provider
replay.

## Date
2026-08-04
`;
}

// ─── parseBornIntake ────────────────────────────────────────────────────

describe('parseBornIntake', () => {
  it('splits a draft into a field-name -> body-text map', () => {
    const fields = parseBornIntake(buildValidFixture());
    expect(fields['Work ID']).toBe('RECOVERY-BORN-519-INTAKE-CHECKER-001');
    expect(fields['Priority']).toBe('P2');
    expect(fields['Date']).toBe('2026-08-11');
  });
});

// ─── checkBornIntake: valid fixture ─────────────────────────────────────

describe('checkBornIntake — valid fixture', () => {
  it('reports valid=true with no gaps for a fully filled draft', () => {
    const result = checkBornIntake(buildValidFixture());
    expect(result.valid).toBe(true);
    expect(result.gaps).toEqual([]);
  });
});

// ─── checkBornIntake: each single-field-missing fixture ─────────────────

describe('checkBornIntake — single-field-missing fixtures', () => {
  for (const field of REQUIRED_FIELDS) {
    it(`reports a MISSING_FIELD gap when "${field}" is dropped`, () => {
      const draft = removeSection(buildValidFixture(), field);
      const result = checkBornIntake(draft);

      expect(result.valid).toBe(false);
      expect(result.gaps).toContainEqual(
        expect.objectContaining({ field, type: 'MISSING_FIELD' })
      );
      // dropping exactly one field produces exactly one gap
      expect(result.gaps).toHaveLength(1);
    });
  }
});

// ─── checkBornIntake: golden real-ledger case ────────────────────────────

describe('checkBornIntake — golden case (RECOVERY-BORN-480-HEARTBEAT-001)', () => {
  it('reports valid=true for a real born row transcribed into the template', () => {
    const result = checkBornIntake(buildGoldenFixtureFromRow3171());
    expect(result.valid).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.fields['Work ID']).toBe('RECOVERY-BORN-480-HEARTBEAT-001');
    expect(result.fields['Parent ID']).toBe('RECOVERY-DOGFOOD-BORN-001');
    expect(result.fields['Priority']).toBe('P0');
  });
});
