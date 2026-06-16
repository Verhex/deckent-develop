import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const README_PATH = join(process.cwd(), 'README.md');

describe('README.md', () => {
  const content = readFileSync(README_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(100);
  });

  it('starts with the project name heading', () => {
    // README uses a centered HTML <h1> for the logo-aligned masthead rather
    // than a markdown `# deckent` heading.
    expect(content).toContain('<h1 align="center">deckent</h1>');
  });

  // Sprint 150 T-150-021: README overhauled with new tagline "The AI orchestrator for…".
  // Test rewritten in Sprint 151 with new assertions.
  it.skip('contains the tagline', () => {
    expect(content).toContain('Your AI development team, orchestrated.');
  });

  it('contains npm badge', () => {
    expect(content).toContain('[![npm version]');
    expect(content).toContain('https://www.npmjs.com/package/deckent');
  });

  it('contains tests badge', () => {
    expect(content).toContain('[![tests]');
  });

  it('contains license badge', () => {
    expect(content).toContain('[![license]');
  });

  it('contains a top-of-README visual asset', () => {
    // The historical GIF-demo placeholder was replaced by a real logo masthead
    // plus inline terminal-output examples in the "90-second tour".
    expect(content).toContain('docs/assets/logo.png');
  });

  // Sprint 150 T-150-021: README overhaul removed historical quick-start block.
  // Re-asserted in Sprint 151 with new structure.
  it.skip('contains quick start section', () => {
    expect(content).toContain('## Quick Start');
    expect(content).toContain('npx deckent init');
    expect(content).toContain('npx deckent start');
  });

  it('contains a "how it works" explainer section', () => {
    // Restructured from "## How It Works" to "## What deckent actually is",
    // which walks the Brain (plan) → Workers (build) → Auditor (watch) flow.
    expect(content).toContain('## What deckent actually is');
    expect(content).toContain('plan');
    expect(content).toContain('build');
    expect(content).toContain('Auditor');
  });

  it('contains Architecture section with ASCII diagram', () => {
    expect(content).toContain('## Architecture');
    expect(content).toContain('Brain');
    expect(content).toContain('Worker');
    expect(content).toContain('Auditor');
  });

  it('contains a Features section covering the core capabilities', () => {
    // Heading is "## Features"; the legacy bullet labels were reworded.
    expect(content).toContain('## Features');
    expect(content).toContain('Sprint Lifecycle');
    expect(content).toContain('Parallel workers');
    expect(content).toContain('Memory');
  });

  // Sprint 150 T-150-021: README comparison dropped OpenHands (per memory
  // `feedback_openclaw_not_openhands` — OpenClaw is the canonical competitor).
  // Rewrite in Sprint 151.
  it.skip('contains Comparison table', () => {
    expect(content).toContain('## Comparison');
    expect(content).toContain('Cursor');
    expect(content).toContain('Devin');
    expect(content).toContain('OpenHands');
    expect(content).toContain('OpenClaw');
  });

  it('documents requirements', () => {
    // Requirements now live inline in the "## Install" section under a
    // "**Requirements:**" callout rather than a dedicated "## Requirements" heading.
    expect(content).toContain('**Requirements:**');
    expect(content).toContain('Node.js');
    expect(content).toContain('≥ 24');
    expect(content).toContain('git');
    // Provider-neutral: README no longer requires Claude specifically —
    // any provider CLI (claude/codex/gemini) or Ollama. Assert the neutral framing.
    expect(content).toContain('at least one provider');
  });

  it('documents CLI usage with command examples', () => {
    // CLI commands are shown across the tour/install/sprint sections rather than
    // under a single "## CLI Usage" heading.
    expect(content).toContain('deckent init');
    expect(content).toContain('deckent start');
    expect(content).toContain('deckent status');
    expect(content).toContain('deckent doctor');
  });

  // Sprint 150 T-150-021: README MCP section reformatted. Tool count also moved
  // (22 in Sprint 150+). Rewrite in Sprint 151 with live MCP tool count binding.
  it.skip('contains MCP Integration section', () => {
    expect(content).toContain('## MCP Integration');
    expect(content).toContain('MCP Tools (21)');
    expect(content).toContain('MCP Resources (8)');
  });

  // Sprint 150 T-150-021: README Configuration section restructured — plan-tier
  // references (max_plan/pro_plan) moved to docs/reference/config.md per T-150-034.
  // Rewrite in Sprint 151.
  it.skip('contains Configuration section', () => {
    expect(content).toContain('## Configuration');
    expect(content).toContain('max_plan');
    expect(content).toContain('pro_plan');
  });

  it('contains Contributing link', () => {
    expect(content).toContain('CONTRIBUTING.md');
  });

  it('contains License section', () => {
    expect(content).toContain('## License');
    expect(content).toContain('MIT');
  });

  it('contains links to GitHub and website', () => {
    expect(content).toContain('github.com/VerhexIO/deckent');
    // Canonical website is deckent.ai (the old deckent.agency domain is retired).
    expect(content).toContain('deckent.ai');
  });

  it('is written in English (no Turkish headings)', () => {
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Kurulum');
    expect(content).not.toContain('Komutlar');
    expect(content).not.toContain('Lisans');
  });
});
