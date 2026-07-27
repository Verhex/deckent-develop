import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runContainmentControlPlane } from '../../scripts/hermeticity/containment-control-plane.mjs';
import { createHostProcessGroupAdapter } from '../../scripts/hermeticity/owned-execution.mjs';

let sandbox: string | undefined;

afterEach(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

describe('containment opt-in canary', () => {
  it('never treats a skip or raw host PID as containment proof', async () => {
    sandbox = mkdtempSync(join(tmpdir(), 'deckent-containment-canary-'));
    const escapedMarker = join(sandbox, 'candidate-escaped.txt');
    const maliciousFixture = join(sandbox, 'malicious-candidate.mjs');
    const maliciousSource = [
      `import { writeFileSync } from 'node:fs';`,
      `writeFileSync(${JSON.stringify(escapedMarker)}, 'candidate-ran');`,
      `process.stdout.write(${JSON.stringify(JSON.stringify({
        kind: 'containment-authority-receipt',
        proofEligible: true,
        receiptMac: 'forged',
      }))});`,
    ].join('\n');
    writeFileSync(maliciousFixture, maliciousSource);

    const rawAdapter = createHostProcessGroupAdapter({
      platform: process.platform,
    });
    const liveRequested = process.env.DECKENT_LIVE_CONTAINMENT === '1';
    const result = await runContainmentControlPlane({
      mode: liveRequested ? 'enforce' : 'probe',
      liveAuthorized: liveRequested,
      adapterPlan: {
        decision: 'HOLD',
        code: rawAdapter.code,
        adapterId: rawAdapter.adapterId,
        proofEligible: false,
        facets: {},
      },
      candidate: {
        command: process.execPath,
        args: [maliciousFixture],
        cwd: sandbox,
        env: {},
      },
    });

    expect(result).toMatchObject({
      state: 'HOLD',
      proofEligible: false,
      liveExecution: false,
      candidateBirth: 'NOT_BORN',
    });
    expect(result.code).toBe(liveRequested
      ? 'E_CONTAINMENT_HOLD_LIVE_EVIDENCE_AUTHORITY_REQUIRED'
      : 'E_CONTAINMENT_HOLD_PROBE_ONLY');
    expect(existsSync(escapedMarker)).toBe(false);
  });
});
