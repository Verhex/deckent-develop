import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const GUIDE_DIR = join(process.cwd(), 'docs', 'guide');

describe('docs/guide/getting-started.md', () => {
  const filePath = join(GUIDE_DIR, 'getting-started.md');
  const content = readFileSync(filePath, 'utf-8');

  it('exists and is non-empty', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(content.length).toBeGreaterThan(500);
  });

  it('contains installation instructions with npm', () => {
    expect(content).toContain('npm install -g deckent');
    expect(content).toContain('deckent --version');
    expect(content).toContain('deckent doctor');
  });

  it('contains project init step with npx deckent init', () => {
    expect(content).toContain('npx deckent init');
    expect(content).toContain('config.json');
  });

  it('contains directive writing step', () => {
    expect(content).toContain('DIRECTIVES.md');
    expect(content).toContain('## Task');
  });

  it('contains sprint start step', () => {
    expect(content).toContain('deckent start');
    expect(content).toContain('deckent plan');
    expect(content).toContain('deckent status');
  });

  it('contains result evaluation section with all assessment types', () => {
    expect(content).toContain('DONE');
    expect(content).toContain('GO_WITH_TECH_DEBT');
    expect(content).toContain('NO_GO');
  });

  it('contains config customization section referencing config.json', () => {
    expect(content).toContain('config.json');
    expect(content).toContain('Config Reference');
  });

  it('contains copy-pasteable bash code blocks', () => {
    expect(content).toContain('```bash');
    expect(content).toContain('```json');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Kurulum');
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Adımlar');
  });
});

describe('docs/guide/first-sprint.md', () => {
  const filePath = join(GUIDE_DIR, 'first-sprint.md');
  const content = readFileSync(filePath, 'utf-8');

  it('exists and is non-empty', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(content.length).toBeGreaterThan(500);
  });

  it('contains directive setup instructions', () => {
    expect(content).toContain('DIRECTIVES.md');
    expect(content).toContain('## Task');
    expect(content).toContain('Model:');
    expect(content).toContain('Scope:');
  });

  it('contains plan preview step', () => {
    expect(content).toContain('deckent plan');
  });

  it('contains sprint start and monitoring commands', () => {
    expect(content).toContain('deckent start');
    expect(content).toContain('deckent status --watch');
    expect(content).toContain('tmux attach');
  });

  it('contains result review section', () => {
    expect(content).toContain('.result');
    expect(content).toContain('DONE');
    expect(content).toContain('NO_GO');
    expect(content).toContain('GO_WITH_TECH_DEBT');
  });

  it('explains sprint lifecycle phases', () => {
    expect(content).toContain('PLAN');
    expect(content).toContain('SPAWN');
    expect(content).toContain('EXECUTE');
    expect(content).toContain('EVALUATE');
    expect(content).toContain('RETRO');
  });

  it('contains terminal output examples', () => {
    expect(content).toContain('```bash');
    expect(content).toContain('```json');
    expect(content).toContain('```');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Kurulum');
    expect(content).not.toContain('Sonuçlar');
  });
});

describe('docs/guide/concepts.md', () => {
  const filePath = join(GUIDE_DIR, 'concepts.md');
  const content = readFileSync(filePath, 'utf-8');

  it('exists and is non-empty', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(content.length).toBeGreaterThan(500);
  });

  it('explains Sprint concept with lifecycle', () => {
    expect(content).toContain('## Sprint');
    expect(content).toContain('PLAN');
    expect(content).toContain('EXECUTE');
    expect(content).toContain('EVALUATE');
    expect(content).toContain('RETRO');
    expect(content).toContain('DECAY');
  });

  it('explains Task concept with JSON example', () => {
    expect(content).toContain('## Task');
    expect(content).toContain('"id"');
    expect(content).toContain('"model"');
    expect(content).toContain('"scope"');
    expect(content).toContain('PENDING');
  });

  it('explains all three Agent types: Brain, Worker, Auditor', () => {
    expect(content).toContain('## Agent');
    expect(content).toContain('### Brain');
    expect(content).toContain('### Worker');
    expect(content).toContain('### Auditor');
  });

  it('explains Brain role as orchestrator', () => {
    expect(content).toContain('orchestrator');
    expect(content).toContain('directives');
    expect(content).toContain('evaluates');
  });

  it('explains Worker scope enforcement', () => {
    expect(content).toContain('scope');
    expect(content).toContain('boundary');
    expect(content).toContain('.result');
  });

  it('explains Auditor monitoring role', () => {
    expect(content).toContain('30 seconds');
    expect(content).toContain('heartbeat');
    expect(content).toContain('never writes source code');
  });

  it('explains Skill concept', () => {
    expect(content).toContain('## Skill');
    expect(content).toContain('skill_routing');
  });

  it('explains Memory system with decay', () => {
    expect(content).toContain('## Memory');
    expect(content).toContain('MEMORY.md');
    expect(content).toContain('DEBT.md');
    expect(content).toContain('decay');
  });

  it('explains Directives', () => {
    expect(content).toContain('## Directives');
    expect(content).toContain('DIRECTIVES.md');
  });

  it('explains Configuration', () => {
    expect(content).toContain('## Configuration');
    expect(content).toContain('config.json');
  });

  it('contains the system overview diagram', () => {
    expect(content).toContain('Brain reads it');
    expect(content).toContain('Workers spawn');
    expect(content).toContain('Auditor monitors');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Kavramlar');
    expect(content).not.toContain('Görev');
    expect(content).not.toContain('Hafıza');
  });
});
