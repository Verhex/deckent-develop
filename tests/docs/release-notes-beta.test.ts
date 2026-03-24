import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const RELEASE_NOTES_PATH = join(ROOT, 'docs', 'RELEASE-NOTES-BETA.md');

function readReleaseNotes(): string {
  return readFileSync(RELEASE_NOTES_PATH, 'utf-8');
}

describe('RELEASE-NOTES-BETA.md content', () => {
  it('file exists', () => {
    expect(existsSync(RELEASE_NOTES_PATH)).toBe(true);
  });

  it('reflects sprint count of 47', () => {
    const content = readReleaseNotes();
    expect(content).toContain('47 development sprints');
    expect(content).toContain('Total Sprints | 47');
  });

  it('reflects test count of 10,000+', () => {
    const content = readReleaseNotes();
    expect(content).toContain('10,000+');
  });

  it('does NOT still say 9,300+ tests', () => {
    const content = readReleaseNotes();
    expect(content).not.toContain('9,300+');
  });

  it('does NOT still say 42 sprints in intro', () => {
    const content = readReleaseNotes();
    expect(content).not.toContain('42 development sprints');
  });

  it('mentions .deck secret system', () => {
    const content = readReleaseNotes();
    expect(content).toContain('.deck Secret System');
  });

  it('mentions multi-environment init', () => {
    const content = readReleaseNotes();
    // environment-aware init wizard
    expect(content).toMatch(/[Mm]ulti-[Ee]nvironment [Ii]nit|Multi-environment Init/);
  });

  it('mentions language-agnostic verify loop', () => {
    const content = readReleaseNotes();
    expect(content).toContain('Language-Agnostic Verify Loop');
  });

  it('mentions rich sprint output', () => {
    const content = readReleaseNotes();
    expect(content).toContain('Rich Sprint Output');
  });

  it('lists MCP backend as deferred limitation', () => {
    const content = readReleaseNotes();
    expect(content).toMatch(/MCP.*backend.*deferred|MCP server mode.*deferred/i);
  });

  it('lists API mode as partial limitation', () => {
    const content = readReleaseNotes();
    expect(content).toMatch(/[Aa]PI mode.*partial|partial.*[Aa]PI mode/);
  });

  it('includes NO_GO trend table', () => {
    const content = readReleaseNotes();
    expect(content).toContain('NO_GO Trend');
    expect(content).toContain('Sprint 047');
    expect(content).toContain('100%');
    expect(content).toContain('manual fix');
  });

  it('updated footer references Sprint 047', () => {
    const content = readReleaseNotes();
    expect(content).toContain('Sprint 047');
  });

  it('does NOT reference Sprint 042 in footer', () => {
    const content = readReleaseNotes();
    // The old footer said "Generated from Sprint 042"
    expect(content).not.toContain('Generated from Sprint 042');
  });

  it('updated release date to 2026-03-24', () => {
    const content = readReleaseNotes();
    expect(content).toContain('2026-03-24');
  });

  it('mentions Connector health tracking', () => {
    const content = readReleaseNotes();
    expect(content).toMatch(/[Cc]onnector.*[Hh]ealth|[Hh]ealth.*[Tt]racking/);
  });
});
