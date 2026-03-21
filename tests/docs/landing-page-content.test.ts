import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOC_PATH = join(process.cwd(), 'docs', 'landing-page-content.md');

describe('docs/landing-page-content.md', () => {
  const content = readFileSync(DOC_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(500);
  });

  it('contains Hero section with tagline', () => {
    expect(content).toContain('## Hero Section');
    expect(content).toContain('Your AI development team, orchestrated.');
  });

  it('contains CTA with npm install', () => {
    expect(content).toContain('npm install -g deckent');
  });

  it('contains Problem Statement section', () => {
    expect(content).toContain('## Problem Statement');
  });

  it('contains three problem points', () => {
    expect(content).toContain('One agent, one task');
    expect(content).toContain('No quality control');
    expect(content).toContain('No memory between sessions');
  });

  it('contains Solution section', () => {
    expect(content).toContain('## Solution');
  });

  it('contains How It Works section with 3 steps', () => {
    expect(content).toContain('## How It Works');
    expect(content).toContain('### Step 1: Describe');
    expect(content).toContain('### Step 2: Plan');
    expect(content).toContain('### Step 3: Execute');
  });

  it('contains Features section', () => {
    expect(content).toContain('## Features');
    expect(content).toContain('Multi-Agent Parallel Execution');
    expect(content).toContain('Sprint Lifecycle Management');
    expect(content).toContain('Quality Auditor');
    expect(content).toContain('Memory and Learning');
    expect(content).toContain('GO / NO-GO Evaluation');
    expect(content).toContain('Provider Agnostic');
  });

  it('contains Comparison vs Alternatives section', () => {
    expect(content).toContain('## Comparison');
    expect(content).toContain('Cursor');
    expect(content).toContain('Devin');
    expect(content).toContain('Aider');
  });

  it('contains Pricing section (free, open source)', () => {
    expect(content).toContain('## Pricing');
    expect(content).toContain('Free');
    expect(content).toContain('Open source');
    expect(content).toContain('MIT');
  });

  it('contains Getting Started section', () => {
    expect(content).toContain('## Getting Started');
    expect(content).toContain('npm install -g deckent');
    expect(content).toContain('deckent init');
    expect(content).toContain('deckent start');
  });

  it('contains Footer links', () => {
    expect(content).toContain('## Footer');
    expect(content).toContain('GitHub');
    expect(content).toContain('npm');
    expect(content).toContain('deckent.agency');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Kurulum');
  });
});
