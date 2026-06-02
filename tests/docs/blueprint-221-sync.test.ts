import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BLUEPRINT_PATH = join(process.cwd(), 'docs/vision/blueprint.md');

describe('Blueprint 221-sync — Sprint 221 doc update (task 221-016)', () => {
  it('native tam-kapsam güncel — blueprint reflects full-scope native REPL with live slash, agentic, and provider parity', () => {
    expect(existsSync(BLUEPRINT_PATH)).toBe(true);
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    // Sprint 221 delivered full-scope REPL — section 3.5 should exist
    expect(content).toMatch(/3\.5.*Native REPL/i);
    // Live slash-commands mentioned
    expect(content).toMatch(/slash/i);
    // Agentic dispatch mentioned
    expect(content).toMatch(/agentic dispatch/i);
    // Sprint 221 in "where it stands"
    expect(content).toMatch(/Sprint 221/);
  });

  it('local-model var — ollama-local (zero-API) documented as first-class provider', () => {
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    // ollama-local must be documented
    expect(content).toMatch(/ollama/i);
    expect(content).toMatch(/zero.API/i);
    // local fallback / local model concept
    expect(content).toMatch(/local/i);
    // localhost:11434 as canonical ollama address
    expect(content).toMatch(/localhost:11434/);
  });

  it('provider-parity var — 5 providers documented with equal standing (claude bias absent)', () => {
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    // All 5 providers must appear in blueprint
    expect(content).toMatch(/claude/i);
    expect(content).toMatch(/codex/i);
    expect(content).toMatch(/gemini/i);
    expect(content).toMatch(/ollama/i);
    expect(content).toMatch(/openai.compat/i);
    // Provider parity table or section
    expect(content).toMatch(/provider parity/i);
  });
});
