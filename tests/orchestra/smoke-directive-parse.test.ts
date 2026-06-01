import { describe, it, expect } from 'vitest';
import { parseStructuredDirectives, parseBulletOrNumberedTasks } from '../../src/orchestra/task-builder.js';

const HEADER_BLOCK_WITH_SMOKE = `
## Task 1: serve token fix
- Model: sonnet
- Effort: normal
- Files: src/api/server.ts
- Scope: src/api/

### Description
Fix localhost token injection.

**Smoke:** node dist/cli/entry.js serve --port 3099 → http_code=200
`;

const HEADER_BLOCK_DASH_SMOKE = `
## Task 1: serve token fix
- Model: sonnet
- Effort: normal
- Smoke: node dist/cli/entry.js serve --port 3099 → http_code=200
- Files: src/api/server.ts
- Scope: src/api/

### Description
Fix localhost token injection.
`;

const HEADER_BLOCK_NO_SMOKE = `
## Task 1: serve token fix
- Model: sonnet
- Effort: normal
- Files: src/api/server.ts
- Scope: src/api/

### Description
Fix localhost token injection.
`;

const HEADER_BLOCK_MALFORMED_SMOKE = `
## Task 1: serve token fix
- Model: sonnet
- Effort: normal
- Smoke: node dist/cli/entry.js serve --port 3099
- Files: src/api/server.ts
- Scope: src/api/

### Description
No arrow separator here.
`;

describe('parseStructuredDirectives — Smoke: parsing', () => {
  it('parses **Smoke:** line from description body into smoke.command and smoke.expect', () => {
    const tasks = parseStructuredDirectives(HEADER_BLOCK_WITH_SMOKE);
    expect(tasks).toHaveLength(1);
    const smoke = tasks[0]!.smoke;
    expect(smoke).toBeDefined();
    expect(smoke!.command).toBe('node dist/cli/entry.js serve --port 3099');
    expect(smoke!.expect).toBe('http_code=200');
  });

  it('parses - Smoke: header directive line into smoke.command and smoke.expect', () => {
    const tasks = parseStructuredDirectives(HEADER_BLOCK_DASH_SMOKE);
    expect(tasks).toHaveLength(1);
    const smoke = tasks[0]!.smoke;
    expect(smoke).toBeDefined();
    expect(smoke!.command).toContain('node dist/cli/entry.js');
    expect(smoke!.expect).toContain('http_code=200');
  });

  it('returns undefined smoke when no Smoke: line present', () => {
    const tasks = parseStructuredDirectives(HEADER_BLOCK_NO_SMOKE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.smoke).toBeUndefined();
  });

  it('returns undefined smoke when Smoke: line has no → separator', () => {
    const tasks = parseStructuredDirectives(HEADER_BLOCK_MALFORMED_SMOKE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.smoke).toBeUndefined();
  });

  it('parses complex multi-word command and expect from real DIRECTIVES format', () => {
    const content = `
## Task 6: serve fix
- Model: opus
- Effort: normal
- Files: src/api/server.ts
- Scope: src/api/

### Description
Fix serve.

**Smoke:** env -u ANTHROPIC_API_KEY node dist/cli/entry.js serve --port 3211 --no-terminal → curl -so/dev/null -w '%{http_code}' localhost:3211/api/status = 200
`;
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    const smoke = tasks[0]!.smoke;
    expect(smoke).toBeDefined();
    expect(smoke!.command).toContain('node dist/cli/entry.js serve');
    expect(smoke!.expect).toContain('200');
  });
});

describe('parseBulletOrNumberedTasks — Smoke: parsing', () => {
  it('parses - Smoke: line in bullet task format', () => {
    const content = `
- Task: serve token fix
  - Model: sonnet
  - Smoke: node dist/cli/entry.js serve → http_code=200
  - Files: src/api/server.ts
`;
    const tasks = parseBulletOrNumberedTasks(content);
    expect(tasks.length).toBeGreaterThan(0);
    const smoke = tasks[0]!.smoke;
    expect(smoke).toBeDefined();
    expect(smoke!.command).toContain('node dist/cli/entry.js');
    expect(smoke!.expect).toContain('http_code=200');
  });

  it('returns undefined smoke for bullet task with no Smoke: line', () => {
    const content = `
- Task: plain task
  - Model: haiku
  - Files: docs/README.md
`;
    const tasks = parseBulletOrNumberedTasks(content);
    if (tasks.length > 0) {
      expect(tasks[0]!.smoke).toBeUndefined();
    }
  });
});
