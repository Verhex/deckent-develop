import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const RELEASE_NOTES_PATH = join(ROOT, 'docs', 'release', 'release-notes.md');

function readReleaseNotes(): string {
  return readFileSync(RELEASE_NOTES_PATH, 'utf-8');
}

const fileExists = existsSync(RELEASE_NOTES_PATH);

// The release notes were rewritten for the v1.0.0-beta.1 public beta
// (docs/release/release-notes.md). The original assertions validated a long-retired
// Sprint-042/047-era format (".deck Secret System", "NO_GO Trend" table, "9,300+
// tests", "Generated from Sprint 042"); those are gone by design. These assertions
// validate the CURRENT release notes against code-reality (version, providers,
// agent/skill counts, key features, honest known-limitations).
describe.skipIf(!fileExists)('release-notes.md content', () => {
  it('file exists', () => {
    expect(existsSync(RELEASE_NOTES_PATH)).toBe(true);
  });

  it('is the v1.0.0-beta.1 public beta release notes', () => {
    const content = readReleaseNotes();
    expect(content).toContain('1.0.0-beta.1');
    expect(content).toMatch(/Public Beta/i);
  });

  it('states the Node.js >= 24 requirement', () => {
    const content = readReleaseNotes();
    expect(content).toMatch(/Node\.js[^\n]*(>=\s*24|≥\s*24)/);
  });

  it('reflects the current development-sprint scale', () => {
    const content = readReleaseNotes();
    // No longer a literal count in the intro prose; a Key Metrics row carries it.
    expect(content).toMatch(/Sprints[^\n]*\|\s*\d{3}/);
  });

  it('documents the four-provider fleet', () => {
    const content = readReleaseNotes();
    expect(content).toContain('Claude');
    expect(content).toContain('Codex');
    expect(content).toContain('Gemini');
    expect(content).toContain('Ollama');
  });

  it('documents the 15 built-in agents and 21 built-in skills', () => {
    const content = readReleaseNotes();
    expect(content).toMatch(/15 Built-in Agents/i);
    expect(content).toMatch(/21 Built-in Skills/i);
  });

  it('describes the 8-phase sprint lifecycle', () => {
    const content = readReleaseNotes();
    expect(content).toContain('PLAN');
    expect(content).toContain('CLEANUP');
    expect(content).toMatch(/GO\/NO-GO|GO\/NO-GO Evaluation/);
  });

  it('describes Memory V2 DB-first architecture', () => {
    const content = readReleaseNotes();
    expect(content).toMatch(/Memory V2/);
    expect(content).toMatch(/SQLite|FTS5/);
  });

  it('describes the Nervous System and Autonomous engine', () => {
    const content = readReleaseNotes();
    expect(content).toContain('Nervous System');
    expect(content).toMatch(/Autonomous [Ee]ngine/);
  });

  it('lists Ollama sprint-worker support as a partial limitation', () => {
    const content = readReleaseNotes();
    expect(content).toMatch(/Known Limitations/i);
    expect(content).toMatch(/Ollama[^\n]*partial/i);
  });

  it('discloses ADR-037 RBAC runtime enforcement as advisory/soft', () => {
    const content = readReleaseNotes();
    expect(content).toContain('ADR-037');
    expect(content).toMatch(/advisory/i);
  });

  it('does NOT carry the retired Sprint-042/047 release-notes format', () => {
    const content = readReleaseNotes();
    // Sanity guard: ensure the obsolete structure is genuinely gone.
    expect(content).not.toContain('9,300+');
    expect(content).not.toContain('NO_GO Trend');
    expect(content).not.toContain('Generated from Sprint 042');
  });
});
