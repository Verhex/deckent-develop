import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkAcceptanceConfirmationAuthority } from '../../scripts/lint-acceptance-confirmation-authority.mjs';

describe('lint-acceptance-confirmation-authority', () => {
  let root: string;
  const write = (file: string, source: string): void => {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source, 'utf8');
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'acceptance-authority-ratchet-'));
    write('src/core/acceptance-confirmation-authority.ts', [
      'export interface AcceptanceConfirmationIdentity { id: string }',
      'export interface AcceptanceConfirmationReceipt { identity: AcceptanceConfirmationIdentity }',
      'export interface AcceptanceConfirmationAuthorityBinding { receipt: AcceptanceConfirmationReceipt }',
      'export function reduceAcceptanceConfirmation() { return true; }',
      "export const acceptanceConfirmationDigest = 'sha256:canonical';",
    ].join('\n'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('accepts one canonical declaration set and ignores prose in comments and strings', () => {
    write('src/cli/commands/unrelated.ts', [
      '// interface AcceptanceConfirmationReceipt {}',
      "const documentation = 'settleDebt(); xverify:';",
      "const value = payload as unknown;",
    ].join('\n'));
    expect(checkAcceptanceConfirmationAuthority(root)).toEqual({ ok: true, problems: [] });
  });

  it.each([
    ['AcceptanceConfirmationIdentity', 'DUPLICATE_IDENTITY_AUTHORITY', 'interface AcceptanceConfirmationIdentity {}'],
    ['AcceptanceConfirmationReceipt', 'DUPLICATE_RECEIPT_AUTHORITY', 'type AcceptanceConfirmationReceipt = {};'],
    ['reduceAcceptanceConfirmation', 'DUPLICATE_REDUCER_AUTHORITY', 'function reduceAcceptanceConfirmation() {}'],
    ['acceptanceConfirmationDigest', 'DUPLICATE_DIGEST_AUTHORITY', 'const acceptanceConfirmationDigest = "x";'],
    ['AcceptanceConfirmationAuthorityBinding', 'DUPLICATE_AUTHORITY_BINDING_AUTHORITY', 'class AcceptanceConfirmationAuthorityBinding {}'],
  ])('rejects duplicate %s declarations', (_name, code, declaration) => {
    write('src/orchestra/acceptance-confirmation-shadow.ts', declaration);
    expect(checkAcceptanceConfirmationAuthority(root).problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it.each([
    ['const decoded = payload as unknown;', 'FORBIDDEN_CAST'],
    ['confirmAcceptance(receipt);', 'DIRECT_CONFIRMATION_BYPASS'],
    ['settleAcceptanceDebt(debt);', 'DIRECT_DEBT_SETTLEMENT_BYPASS'],
    ['const trusted = value.startsWith("xverify:");', 'PREFIX_ONLY_XVERIFY_TRUST'],
    ['function LegacyReconcilerAdapter() { return reconcile(); }', 'UNINDEXED_RECONCILER_ADAPTER'],
    ['surfaceText("Acceptance confirmation succeeded");', 'NON_I18N_SURFACE_TEXT'],
  ])('rejects seeded syntax violation %s', (source, code) => {
    write('src/orchestra/acceptance-confirmation-adapter.ts', source);
    expect(checkAcceptanceConfirmationAuthority(root).problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it('requires a precise, reasoned, rule-specific allowlist comment', () => {
    write('src/orchestra/acceptance-confirmation-adapter.ts', [
      '// acceptance-confirmation-authority-allow FORBIDDEN_CAST -- wire decoder boundary',
      'const decoded = payload as unknown;',
    ].join('\n'));
    expect(checkAcceptanceConfirmationAuthority(root)).toEqual({ ok: true, problems: [] });

    write('src/orchestra/acceptance-confirmation-adapter.ts', [
      '// acceptance-confirmation-authority-allow *',
      'const decoded = payload as unknown;',
    ].join('\n'));
    const codes = checkAcceptanceConfirmationAuthority(root).problems.map(problem => problem.code);
    expect(codes).toContain('INVALID_ALLOWLIST_COMMENT');
    expect(codes).toContain('FORBIDDEN_CAST');
  });

  it('is deterministic across CRLF input and portable path reporting', () => {
    write('src/orchestra/acceptance-confirmation-shadow.ts',
      'type AcceptanceConfirmationReceipt = {};\r\nconfirmAcceptance(receipt);\r\n');
    const first = checkAcceptanceConfirmationAuthority(root);
    const second = checkAcceptanceConfirmationAuthority(root);
    expect(second).toEqual(first);
    expect(first.problems.map(problem => problem.file)).toEqual([
      'src/orchestra/acceptance-confirmation-shadow.ts',
      'src/orchestra/acceptance-confirmation-shadow.ts',
    ]);
  });
});
