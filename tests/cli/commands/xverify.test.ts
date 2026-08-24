import { describe, expect, it } from 'vitest';
import { resolveTierAdmissionProjection } from '../../../src/cli/commands/xverify.js';

describe('xverify tier admission projection', () => {
  it('projects only an opaque owner decision ref for an exact admitted pair', () => {
    const projection = resolveTierAdmissionProjection({
      authority: {
        schema_version: 1,
        decisions: [{
          author_model: 'gpt-5.6-sol',
          verifier_model: 'claude-opus-5',
          decision: 'allow',
          decision_ref: 'owner-xverify-allow-2026-08-24',
        }],
      },
      authorModel: 'gpt-5.6-sol',
      authorProvider: 'codex',
      verifierModel: 'claude-opus-5',
      verifierProvider: 'claude',
    });

    expect(projection).toEqual({
      admission: 'owner-pair-admitted',
      decisionRef: 'owner-xverify-allow-2026-08-24',
    });
  });

  it('labels a non-exception equal-or-higher pair as normal admission', () => {
    expect(resolveTierAdmissionProjection({
      authority: undefined,
      authorModel: 'claude-sonnet-5',
      authorProvider: 'claude',
      verifierModel: 'gpt-5.6-sol',
      verifierProvider: 'codex',
    })).toEqual({ admission: 'normal-tier-admitted', decisionRef: null });
  });

  it('keeps an equal-or-higher allowed pair classified as normal admission', () => {
    expect(resolveTierAdmissionProjection({
      authority: {
        schema_version: 1,
        decisions: [{
          author_model: 'claude-sonnet-5',
          verifier_model: 'gpt-5.6-sol',
          decision: 'allow',
          decision_ref: 'owner-xverify-unneeded-allow-2026-08-24',
        }],
      },
      authorModel: 'claude-sonnet-5',
      authorProvider: 'claude',
      verifierModel: 'gpt-5.6-sol',
      verifierProvider: 'codex',
    })).toEqual({ admission: 'normal-tier-admitted', decisionRef: null });
  });
});
