import { describe, it, expect } from 'vitest';
import { parseSkillsDirective, parseStructuredDirectives } from '../../src/orchestra/task-builder.js';

describe('task-builder — routing overrides', () => {
  describe('parseSkillsDirective', () => {
    it('returns undefined for no line', () => {
      const result = parseSkillsDirective(undefined);
      expect(result.forceSkills).toBeUndefined();
      expect(result.excludeSkills).toBeUndefined();
    });

    it('returns undefined for empty line', () => {
      const result = parseSkillsDirective('Skills: ');
      expect(result.forceSkills).toBeUndefined();
    });

    it('parses "none" as empty forceSkills', () => {
      const result = parseSkillsDirective('- Skills: none');
      expect(result.forceSkills).toEqual([]);
    });

    it('parses "auto" as undefined (let auto-select)', () => {
      const result = parseSkillsDirective('- Skills: auto');
      expect(result.forceSkills).toBeUndefined();
    });

    it('parses single skill', () => {
      const result = parseSkillsDirective('- Skills: typescript-expert');
      expect(result.forceSkills).toEqual(['typescript-expert']);
      expect(result.excludeSkills).toBeUndefined();
    });

    it('parses multiple skills', () => {
      const result = parseSkillsDirective('- Skills: typescript-expert, testing-expert');
      expect(result.forceSkills).toEqual(['typescript-expert', 'testing-expert']);
    });

    it('parses exclude with - prefix', () => {
      const result = parseSkillsDirective('- Skills: -ci-testing');
      expect(result.forceSkills).toBeUndefined();
      expect(result.excludeSkills).toEqual(['ci-testing']);
    });

    it('parses mixed include and exclude', () => {
      const result = parseSkillsDirective('- Skills: typescript-expert, -ci-testing, testing-expert');
      expect(result.forceSkills).toEqual(['typescript-expert', 'testing-expert']);
      expect(result.excludeSkills).toEqual(['ci-testing']);
    });

    it('parses auto mixed with includes', () => {
      const result = parseSkillsDirective('- Skills: typescript-expert, auto, -ci-testing');
      expect(result.forceSkills).toEqual(['typescript-expert']);
      expect(result.excludeSkills).toEqual(['ci-testing']);
    });
  });

  describe('parseStructuredDirectives — Agent/Skills parsing', () => {
    it('parses Agent: override from directive', () => {
      const content = `# DIRECTIVES
## Task 1: Security Audit
- Model: opus
- Agent: security-auditor
- Files: src/auth/login.ts
- Scope: src/auth/

### Description
Audit the auth module.
`;
      const tasks = parseStructuredDirectives(content);
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.forceAgent).toBe('security-auditor');
    });

    it('parses Agent: none as generic', () => {
      const content = `# DIRECTIVES
## Task 1: Simple fix
- Agent: none
- Files: src/core/config.ts
- Scope: src/core/

### Description
Fix config bug.
`;
      const tasks = parseStructuredDirectives(content);
      expect(tasks[0]!.forceAgent).toBe('generic');
    });

    it('parses Agent: auto as undefined (let auto-select)', () => {
      const content = `# DIRECTIVES
## Task 1: Feature
- Agent: auto
- Files: src/core/config.ts
- Scope: src/core/

### Description
Add feature.
`;
      const tasks = parseStructuredDirectives(content);
      expect(tasks[0]!.forceAgent).toBeUndefined();
    });

    it('parses Skills: with includes and excludes', () => {
      const content = `# DIRECTIVES
## Task 1: Implementation
- Skills: typescript-expert, -ci-testing
- Files: src/cli/command.ts
- Scope: src/cli/

### Description
Implement new command.
`;
      const tasks = parseStructuredDirectives(content);
      expect(tasks[0]!.forceSkills).toEqual(['typescript-expert']);
      expect(tasks[0]!.excludeSkills).toEqual(['ci-testing']);
    });

    it('directive without Agent/Skills has undefined overrides', () => {
      const content = `# DIRECTIVES
## Task 1: Basic task
- Model: sonnet
- Files: src/core/utils.ts
- Scope: src/core/

### Description
Update utilities.
`;
      const tasks = parseStructuredDirectives(content);
      expect(tasks[0]!.forceAgent).toBeUndefined();
      expect(tasks[0]!.forceSkills).toBeUndefined();
      expect(tasks[0]!.excludeSkills).toBeUndefined();
    });
  });
});
