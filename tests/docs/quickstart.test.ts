import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOC_PATH = join(process.cwd(), 'docs', 'guide', 'quickstart.md');

describe('docs/guide/quickstart.md', () => {
  const content = readFileSync(DOC_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(100);
  });

  it('contains Prerequisites section', () => {
    expect(content).toContain('## 1. Prerequisites');
    expect(content).toContain('Node.js');
    expect(content).toContain('>= 18');
    expect(content).toContain('git');
  });

  it('contains Installation section', () => {
    expect(content).toContain('## 2. Installation');
    expect(content).toContain('npm install -g deckent');
  });

  it('contains First Project Setup section', () => {
    expect(content).toContain('## 3. First Project Setup');
    expect(content).toContain('deckent init');
  });

  it('contains Writing Directives section', () => {
    expect(content).toContain('## 4. Writing Directives');
    expect(content).toContain('DIRECTIVES.md');
    expect(content).toContain('## Task');
  });

  it('contains Running a Sprint section', () => {
    expect(content).toContain('## 5. Running a Sprint');
    expect(content).toContain('deckent start');
    expect(content).toContain('deckent plan');
  });

  it('contains Understanding Results section', () => {
    expect(content).toContain('## 6. Understanding Results');
    expect(content).toContain('deckent status');
    expect(content).toContain('DONE');
    expect(content).toContain('NO_GO');
    expect(content).toContain('GO_WITH_TECH_DEBT');
  });

  it('contains Next Steps section', () => {
    expect(content).toContain('## 7. Next Steps');
    expect(content).toContain('CONFIG-REFERENCE.md');
    expect(content).toContain('API.md');
  });

  it('contains copy-pasteable commands', () => {
    expect(content).toContain('```bash');
    expect(content).toContain('npm install -g deckent');
    expect(content).toContain('deckent init');
    expect(content).toContain('deckent start');
    expect(content).toContain('deckent status');
    expect(content).toContain('deckent doctor');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Kurulum');
    expect(content).not.toContain('Gereksinimler');
  });
});
