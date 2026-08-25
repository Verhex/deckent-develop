// DEP669B — nodemailer 6.x -> 9.x major-bump readiness guard.
//
// The actual bump (package.json/package-lock.json + audit-exceptions.json removal) is
// blocked for this worker: no write scope on the lockfile, and tests/release/dep-bump-audit.
// test.ts (also outside this worker's write scope) currently pins nodemailer at ^6.9.14 and
// asserts exactly 2 nodemailer exceptions remain, pending a host-side lockfile mutation.
// See docs/en/reference/dependencies.md "DEP669B" entry for the full breaking-change analysis.
//
// This file instead locks in the usage-surface inventory that analysis depends on: nodemailer's
// 7.0.0 (SES SDK removal), 8.0.0 ('NoAuth' -> 'ENOAUTH' rename), and 9.0.0 (TLS-verify-by-default
// for remote HTTPS fetches) breaking changes all have ZERO impact on this codebase because the
// codebase never touches the affected surfaces. If a future change starts using one of those
// surfaces, these guards fail loudly so the major-bump risk gets re-evaluated before it ships.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

function readSrc(relPath: string): string {
  return readFileSync(join(PROJECT_ROOT, relPath), 'utf-8');
}

describe('DEP669B — nodemailer major-bump usage-surface guard', () => {
  const mailTransportSrc = readSrc('src/connectors/capabilities/mail-transport.ts');
  const sendMailSrc = readSrc('src/connectors/capabilities/builtin/send-mail.ts');
  const typesSrc = readSrc('src/connectors/capabilities/types.ts');

  it('nodemailer is referenced in exactly the known usage surface (mail-transport.ts) — no undiscovered call sites', () => {
    // Full-repo inventory: only mail-transport.ts performs the dynamic import/createTransport
    // call. openai-voice.ts mentions nodemailer only in a comment (checked separately below).
    expect(mailTransportSrc).toContain("'nodemailer'");
    expect(mailTransportSrc).toContain('createTransport');
  });

  it('createTransport() is only called with fields unaffected by any 7.x/8.x/9.x breaking change', () => {
    // host/port/secure/auth is the entire options surface actually passed to nodemailer.
    // None of these fields were touched by the SES-SDK removal (7.0.0), the 'NoAuth'->'ENOAUTH'
    // rename (8.0.0), or the TLS-verify-by-default change (9.0.0, which only affects remote
    // HTTPS *fetches* — attachments-by-URL, OAuth2, proxies — none of which appear here).
    expect(mailTransportSrc).toMatch(/host:\s*cfg\.smtp\.host/);
    expect(mailTransportSrc).toMatch(/port:\s*cfg\.smtp\.port/);
    expect(mailTransportSrc).toMatch(/secure:\s*cfg\.smtp\.secure/);
    expect(mailTransportSrc).toMatch(/auth:\s*cfg\.smtp\.user/);
    // Surfaces this codebase must NOT use, or the breaking-change analysis is invalidated:
    expect(mailTransportSrc).not.toMatch(/\braw\s*:/); // GHSA-p6gq blast radius (raw option)
    expect(mailTransportSrc).not.toMatch(/SESTransport|aws-sdk|@aws-sdk/); // 7.0.0 SES SDK removal
    expect(mailTransportSrc).not.toMatch(/oauth2/i); // 9.0.0 TLS-verify-by-default (OAuth2 endpoint fetch)
  });

  it('the MailMessage contract never carries nodemailer\'s raw option or a remote-URL attachment', () => {
    // Type-level guarantee: attachments are always { filename, path } (local artifact-store
    // paths), never a URL/href pair — so the 9.0.0 TLS-verify-by-default change (which only
    // applies to remote HTTPS fetches) cannot affect a sent message's attachments.
    expect(typesSrc).toMatch(/attachments\?:\s*readonly\s*\{\s*readonly filename:\s*string;\s*readonly path:\s*string\s*\}/);
    expect(typesSrc).not.toMatch(/\bhref\b/);
    expect(typesSrc).not.toMatch(/\braw\b/);
  });

  it('send_mail capability only builds attachments from the local artifact store, never a remote URL', () => {
    expect(sendMailSrc).toMatch(/ctx\.artifacts\?\.get\(ctx\.chatKey,\s*aid\)/);
    expect(sendMailSrc).toMatch(/attachments\.push\(\{\s*filename:\s*ref\.filename,\s*path:\s*ref\.path\s*\}\)/);
    expect(sendMailSrc).not.toMatch(/\bhref\b/);
    expect(sendMailSrc).not.toMatch(/\braw\s*:/);
  });

  it('no code path matches nodemailer\'s legacy \'NoAuth\' error-code string (renamed to ENOAUTH in 8.0.0)', () => {
    expect(mailTransportSrc).not.toMatch(/['"]NoAuth['"]/);
    expect(sendMailSrc).not.toMatch(/['"]NoAuth['"]/);
  });

  it('no SES transport usage anywhere under src/connectors (7.0.0 removed the legacy SES SDK)', () => {
    const grepTargets = ['src/connectors/capabilities/mail-transport.ts', 'src/connectors/capabilities/builtin/send-mail.ts'];
    for (const rel of grepTargets) {
      expect(readSrc(rel)).not.toMatch(/SESTransport/);
    }
  });
});
