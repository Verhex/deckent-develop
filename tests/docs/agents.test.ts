import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('docs/architecture/agents.md', () => {
  const agentsPath = join(ROOT, 'docs', 'architecture', 'agents.md');

  it('file exists', () => {
    expect(existsSync(agentsPath)).toBe(true);
  });

  it('is written in English', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    // Check for English-language markers (no Turkish-specific characters in headings)
    expect(content).toContain('# Agent System');
    expect(content).toContain('What Are Agents');
  });

  it('has all 8 required sections', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    const requiredSections = [
      'What Are Agents',
      'Built-in Agents',
      'Creating Custom Agents',
      'Agent Selection Algorithm',
      'Multi-Agent Pipelines',
      'Agent Stats and Learning',
      'Temp Agents',
      'Configuration',
    ];
    for (const section of requiredSections) {
      expect(content).toContain(section);
    }
  });

  it('documents all 8 built-in agents', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    const builtInAgents = [
      'security-auditor',
      'test-writer',
      'doc-writer',
      'code-reviewer',
      'performance-optimizer',
      'migration-specialist',
      'api-designer',
      'devops-agent',
    ];
    for (const agent of builtInAgents) {
      expect(content).toContain(agent);
    }
  });

  it('includes CLI command examples', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('deckent agent list');
    expect(content).toContain('deckent agent create');
    expect(content).toContain('deckent agent enable');
    expect(content).toContain('deckent agent disable');
  });

  it('describes agent.json configuration format', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('agent.json');
    expect(content).toContain('PROMPT.md');
    expect(content).toContain('"triggers"');
    expect(content).toContain('"model"');
  });

  it('explains selection algorithm with trigger matching', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('trigger');
    expect(content).toContain('case-insensitive');
    expect(content).toContain('generic');
  });
});
