import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('docs/reference/skills.md', () => {
  const skillsPath = join(ROOT, 'docs', 'reference', 'skills.md');

  it('file exists', () => {
    expect(existsSync(skillsPath)).toBe(true);
  });

  it('is written in English', () => {
    const content = readFileSync(skillsPath, 'utf-8');
    expect(content).toContain('# Skill System');
    expect(content).toContain('What Are Skills');
  });

  it('has all required sections', () => {
    const content = readFileSync(skillsPath, 'utf-8');
    const requiredSections = [
      'What Are Skills',
      'Built-in Skills',
      'Creating Custom Skills',
      'Installing Skills',
      'Skill Selection Algorithm',
      'Skill Composition',
      'Stack Detection',
      'Marketplace',
    ];
    for (const section of requiredSections) {
      expect(content).toContain(section);
    }
  });

  it('documents the built-in skills', () => {
    const content = readFileSync(skillsPath, 'utf-8');
    // Built-in skill ids per src/core/builtins/skills/*/manifest.json.
    // The accessibility skill id is `accessibility-expert` (not the
    // nonexistent `accessibility-specialist`).
    const builtInSkills = [
      'typescript-expert',
      'react-specialist',
      'testing-expert',
      'security-specialist',
      'performance-optimizer',
      'api-builder',
      'database-migration',
      'devops-engineer',
      'documentation-writer',
      'accessibility-expert',
    ];
    for (const skill of builtInSkills) {
      expect(content).toContain(skill);
    }
  });

  it('includes CLI command examples', () => {
    const content = readFileSync(skillsPath, 'utf-8');
    expect(content).toContain('deckent skill create');
    expect(content).toContain('deckent skill install');
    expect(content).toContain('deckent skill list');
    expect(content).toContain('--json');
    expect(content).toContain('--force');
    expect(content).toContain('--category');
  });

  it('describes manifest.json structure', () => {
    const content = readFileSync(skillsPath, 'utf-8');
    expect(content).toContain('manifest.json');
    expect(content).toContain('SKILL.md');
    expect(content).toContain('"triggers"');
    expect(content).toContain('"category"');
    expect(content).toContain('"priority"');
    expect(content).toContain('"stackDetection"');
  });

  it('explains selection algorithm with scoring', () => {
    const content = readFileSync(skillsPath, 'utf-8');
    expect(content).toContain('trigger');
    expect(content).toContain('score');
    expect(content).toContain('priority');
    expect(content).toContain('stack');
  });
});
