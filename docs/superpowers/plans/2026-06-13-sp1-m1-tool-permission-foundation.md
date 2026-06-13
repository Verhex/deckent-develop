# SP-1 M1 — Tool & Permission Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dependency-free, fully unit-testable foundation of the native-terminal-agent core — the tool-registry contract, the rule+policy-driven permission engine, and the rule-lifetime store — with zero coupling to providers, the agent loop, or the view.

**Architecture:** Greenfield `src/agent/` modules (spec §5). Pure logic + hermetic file I/O only. The permission engine is data-driven: a `PermissionPolicy` (loaded from `.deckent/permission-policy.json` over a safe default) supplies the tier-map + always-floor + default-mode, so the same engine adapts to enterprise-locked / solo-YOLO / air-gapped scenarios without code changes (spec §4 meta-principle). The tool registry is an extension point: anything implementing `ToolDefinition` registers and is exposed as a provider-native tool schema.

**Tech Stack:** TypeScript (ESM, Node16 resolution — `.js` import suffix mandatory), vitest, hand-written validation (ADR-010, no schema dep), hermetic tests (ADR-087 — `os.tmpdir()`, no spawnSync, no gitignored-state reads).

**Spec:** `docs/superpowers/specs/2026-06-13-sp1-native-terminal-agent-core-design.md` (§5 module map, §6 permission, §8 tool-set).

**Conventions:** Every commit ends with the repo co-author trailer (`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`); omitted from the example commands below for brevity. User-facing strings are out of scope for M1 (no terminal output here) — i18n applies from M2's view-wire.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/agent/tools/types.ts` | `ToolDefinition` contract + `validateToolDefinition` (the extension point) |
| `src/agent/tools/registry.ts` | `ToolRegistry` — register / get / list / `toNativeSchemas` |
| `src/agent/permission-types.ts` | `PermissionRule`, `PermissionDecision`, `ApprovalMode`, `matchRule` (glob) |
| `src/agent/permission-policy.ts` | `PermissionPolicy`, `SAFE_DEFAULT_POLICY`, `loadPolicy` (merge over default) |
| `src/agent/permission.ts` | `decide()` — precedence engine (deny > floor > rule > tier > mode) |
| `src/agent/permission-store.ts` | rule-lifetime persistence (session memory + `settings.local.json`), legacy `allow[]` migration |
| `tests/agent/*.test.ts` | one hermetic test file per module |

Dependency order: types → registry; permission-types → permission-policy → permission → permission-store. Tasks below follow this order.

---

## Task 1: ToolDefinition contract

**Files:**
- Create: `src/agent/tools/types.ts`
- Test: `tests/agent/tool-types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/tool-types.test.ts
import { describe, it, expect } from 'vitest';
import { validateToolDefinition, type ToolDefinition } from '../../src/agent/tools/types.js';

const valid: ToolDefinition = {
  name: 'write_file',
  description: 'Write a file to disk',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  category: 'coding',
  tier: 'confirm',
  source: 'builtin',
  handler: async () => ({ ok: true, output: 'done' }),
};

describe('validateToolDefinition', () => {
  it('returns null for a well-formed definition', () => {
    expect(validateToolDefinition(valid)).toBeNull();
  });
  it('rejects empty name', () => {
    expect(validateToolDefinition({ ...valid, name: '' })).toMatch(/name/);
  });
  it('rejects unknown tier', () => {
    expect(validateToolDefinition({ ...valid, tier: 'nope' as never })).toMatch(/tier/);
  });
  it('rejects non-object inputSchema', () => {
    expect(validateToolDefinition({ ...valid, inputSchema: null as never })).toMatch(/inputSchema/);
  });
  it('rejects missing handler', () => {
    expect(validateToolDefinition({ ...valid, handler: undefined as never })).toMatch(/handler/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/tool-types.test.ts`
Expected: FAIL — cannot resolve `../../src/agent/tools/types.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/agent/tools/types.ts
// ═══ ToolDefinition — the native-agent tool extension point (SP-1 §8) ═══════
// Any source (builtin, MCP, user, package, config) registers tools by
// implementing this contract. The registry exposes them as provider-native
// tool_use schemas. Hand-written validation (ADR-010, no schema dependency).

export type ToolPermissionTier = 'silent' | 'confirm' | 'always';
export type ToolSource = 'builtin' | 'mcp' | 'user' | 'package' | 'config';

export interface ToolResult {
  ok: boolean;
  output: string;
  meta?: Record<string, unknown>;
}

export interface ToolDefinition {
  /** Unique tool name (provider tool_use `name`). */
  name: string;
  /** Human/model-facing description (provider tool_use `description`). */
  description: string;
  /** JSON Schema for args (provider tool_use `input_schema`). */
  inputSchema: Record<string, unknown>;
  /** Open taxonomy: 'coding' | 'orchestration' | 'mcp' | 'web' | 'skill' | … */
  category: string;
  /** Default confirmation tier; policy may override by name/category. */
  tier: ToolPermissionTier;
  /** Where this tool came from (for telemetry + guard policy). */
  source: ToolSource;
  /** Executes the tool. Pure of the view; returns a structured result. */
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

const TIERS: ReadonlySet<string> = new Set(['silent', 'confirm', 'always']);
const SOURCES: ReadonlySet<string> = new Set(['builtin', 'mcp', 'user', 'package', 'config']);

/** Validate a candidate ToolDefinition; returns the first violation or null. */
export function validateToolDefinition(def: unknown): string | null {
  if (!def || typeof def !== 'object') return 'definition must be an object';
  const d = def as Partial<ToolDefinition>;
  if (typeof d.name !== 'string' || d.name.length === 0) return 'name must be a non-empty string';
  if (typeof d.description !== 'string' || d.description.length === 0) return 'description must be a non-empty string';
  if (!d.inputSchema || typeof d.inputSchema !== 'object' || Array.isArray(d.inputSchema)) return 'inputSchema must be a plain object';
  if (typeof d.category !== 'string' || d.category.length === 0) return 'category must be a non-empty string';
  if (typeof d.tier !== 'string' || !TIERS.has(d.tier)) return `tier must be one of ${[...TIERS].join('|')}`;
  if (typeof d.source !== 'string' || !SOURCES.has(d.source)) return `source must be one of ${[...SOURCES].join('|')}`;
  if (typeof d.handler !== 'function') return 'handler must be a function';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/tool-types.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools/types.ts tests/agent/tool-types.test.ts
git commit -m "feat(agent): ToolDefinition contract + validator (SP-1 M1 T1)"
```

---

## Task 2: Tool registry

**Files:**
- Create: `src/agent/tools/registry.ts`
- Test: `tests/agent/tool-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/tool-registry.test.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import type { ToolDefinition } from '../../src/agent/tools/types.js';

const mk = (name: string, over: Partial<ToolDefinition> = {}): ToolDefinition => ({
  name,
  description: `${name} tool`,
  inputSchema: { type: 'object', properties: {} },
  category: 'coding',
  tier: 'confirm',
  source: 'builtin',
  handler: async () => ({ ok: true, output: '' }),
  ...over,
});

describe('ToolRegistry', () => {
  it('registers and gets a tool by name', () => {
    const r = new ToolRegistry();
    r.register(mk('read_file'));
    expect(r.get('read_file')?.name).toBe('read_file');
    expect(r.get('missing')).toBeUndefined();
  });
  it('throws on invalid definition', () => {
    const r = new ToolRegistry();
    expect(() => r.register(mk('', {}))).toThrow(/name/);
  });
  it('last-write-wins on duplicate name', () => {
    const r = new ToolRegistry();
    r.register(mk('bash', { description: 'first' }));
    r.register(mk('bash', { description: 'second' }));
    expect(r.list()).toHaveLength(1);
    expect(r.get('bash')?.description).toBe('second');
  });
  it('toNativeSchemas maps to provider tool_use shape', () => {
    const r = new ToolRegistry();
    r.register(mk('grep', { description: 'search', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }));
    expect(r.toNativeSchemas()).toEqual([
      { name: 'grep', description: 'search', input_schema: { type: 'object', properties: { q: { type: 'string' } } } },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/tool-registry.test.ts`
Expected: FAIL — cannot resolve `registry.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/agent/tools/registry.ts
// ═══ ToolRegistry — single registry for all tool sources (SP-1 §8) ══════════
// Sources (builtin/MCP/user/package/config) register ToolDefinitions here.
// toNativeSchemas() emits the provider tool_use schema list for the loop.

import { validateToolDefinition, type ToolDefinition } from './types.js';

export interface NativeToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /** Register (or replace, last-write-wins) a tool. Throws on invalid shape. */
  register(def: ToolDefinition): void {
    const violation = validateToolDefinition(def);
    if (violation) throw new Error(`invalid tool definition: ${violation}`);
    this.tools.set(def.name, def);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Provider-native tool_use schema list (Anthropic/OpenAI-compat shape). */
  toNativeSchemas(): NativeToolSchema[] {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/tool-registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools/registry.ts tests/agent/tool-registry.test.ts
git commit -m "feat(agent): ToolRegistry register/get/list/toNativeSchemas (SP-1 M1 T2)"
```

---

## Task 3: Permission rule + glob matching

**Files:**
- Create: `src/agent/permission-types.ts`
- Test: `tests/agent/permission-match.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/permission-match.test.ts
import { describe, it, expect } from 'vitest';
import { matchRule, type PermissionRule } from '../../src/agent/permission-types.js';

const rule = (tool: string, pattern: string): PermissionRule => ({ tool, pattern });

describe('matchRule', () => {
  it('matches exact tool + ** pattern (any resource)', () => {
    expect(matchRule(rule('write_file', '**'), 'write_file', 'anything/here.ts')).toBe(true);
  });
  it('respects tool name mismatch', () => {
    expect(matchRule(rule('write_file', '**'), 'bash', 'x')).toBe(false);
  });
  it('matches a directory glob src/**', () => {
    expect(matchRule(rule('write_file', 'src/**'), 'write_file', 'src/agent/loop.ts')).toBe(true);
    expect(matchRule(rule('write_file', 'src/**'), 'write_file', 'docs/x.md')).toBe(false);
  });
  it('matches single-segment * (no slash)', () => {
    expect(matchRule(rule('read_file', 'src/*'), 'read_file', 'src/index.ts')).toBe(true);
    expect(matchRule(rule('read_file', 'src/*'), 'read_file', 'src/agent/loop.ts')).toBe(false);
  });
  it('matches a bash command prefix pattern', () => {
    expect(matchRule(rule('bash', 'npm test*'), 'bash', 'npm test --run')).toBe(true);
    expect(matchRule(rule('bash', 'npm test*'), 'bash', 'rm -rf /')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/permission-match.test.ts`
Expected: FAIL — cannot resolve `permission-types.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/agent/permission-types.ts
// ═══ Permission core types + glob matcher (SP-1 §6) ═════════════════════════
// A grant/deny is a rule = tool(resource-pattern). matchRule does glob:
//   **  → any chars incl. '/'      *  → any chars except '/'
// All other glob metachars are treated literally (escaped).

export type ApprovalMode = 'suggest' | 'auto-edit' | 'full-auto';
export type PermissionDecision = 'allow' | 'ask' | 'deny';

export interface PermissionRule {
  /** Exact tool name this rule applies to. */
  tool: string;
  /** Glob over the tool's primary resource (path / command / url). */
  pattern: string;
}

/** Compile a glob to a RegExp: `**`→`.*`, `*`→`[^/]*`, rest escaped. */
function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { out += '.*'; i++; }
      else { out += '[^/]*'; }
    } else if ('\\^$.|?+()[]{}'.includes(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

/** True if `rule` applies to `tool` and its `resource` matches the pattern. */
export function matchRule(rule: PermissionRule, tool: string, resource: string): boolean {
  if (rule.tool !== tool) return false;
  return globToRegExp(rule.pattern).test(resource);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/permission-match.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/permission-types.ts tests/agent/permission-match.test.ts
git commit -m "feat(agent): permission rule types + glob matchRule (SP-1 M1 T3)"
```

---

## Task 4: Permission policy (data-driven, safe default + merge)

**Files:**
- Create: `src/agent/permission-policy.ts`
- Test: `tests/agent/permission-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/permission-policy.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPolicy, SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-policy-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('loadPolicy', () => {
  it('returns the safe default when no policy file exists', () => {
    const p = loadPolicy(sandbox());
    expect(p.defaultMode).toBe(SAFE_DEFAULT_POLICY.defaultMode);
    expect(p.alwaysFloor).toContain('deckent_kill');
  });
  it('merges an enterprise-locked override (mode + extra floor)', () => {
    const d = sandbox();
    writeFileSync(join(d, '.deckent', 'permission-policy.json'), JSON.stringify({
      defaultMode: 'suggest',
      alwaysFloor: ['deckent_config'],
    }));
    const p = loadPolicy(d);
    expect(p.defaultMode).toBe('suggest');
    // override floor extends the safe floor, never shrinks it below defaults
    expect(p.alwaysFloor).toEqual(expect.arrayContaining(['deckent_kill', 'deckent_config']));
  });
  it('merges a solo-YOLO override (full-auto) but keeps the safe floor', () => {
    const d = sandbox();
    writeFileSync(join(d, '.deckent', 'permission-policy.json'), JSON.stringify({ defaultMode: 'full-auto' }));
    const p = loadPolicy(d);
    expect(p.defaultMode).toBe('full-auto');
    expect(p.alwaysFloor).toContain('deckent_cleanup'); // floor survives full-auto
  });
  it('falls back to safe default on malformed JSON (fail-safe)', () => {
    const d = sandbox();
    writeFileSync(join(d, '.deckent', 'permission-policy.json'), '{ not json');
    expect(loadPolicy(d).defaultMode).toBe(SAFE_DEFAULT_POLICY.defaultMode);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/permission-policy.test.ts`
Expected: FAIL — cannot resolve `permission-policy.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/agent/permission-policy.ts
// ═══ PermissionPolicy — data-driven posture (SP-1 §6) ═══════════════════════
// The same engine adapts to enterprise-locked / solo-YOLO / air-gapped by
// loading .deckent/permission-policy.json over a safe default. Overrides may
// raise restrictions (extend the floor, tighten the mode) but the safe floor
// is always preserved — an override can never shrink it below the baseline.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ApprovalMode, ToolPermissionTierMap } from './permission-types.js';
import type { ToolPermissionTier } from './tools/types.js';

export type ToolPermissionTierMapT = Record<string, ToolPermissionTier>;

export interface PermissionPolicy {
  /** tool-name or category → default tier (overrides ToolDefinition.tier). */
  tierMap: ToolPermissionTierMapT;
  /** tools/commands that ALWAYS ask — never auto-approvable (the safe floor). */
  alwaysFloor: string[];
  /** default approval mode when no rule applies. */
  defaultMode: ApprovalMode;
}

/** Baseline floor — destructive/irreversible ops (spec §6). Never removed. */
const SAFE_FLOOR: readonly string[] = ['deckent_kill', 'deckent_cleanup', 'deckent_recover'];

export const SAFE_DEFAULT_POLICY: PermissionPolicy = {
  tierMap: {},
  alwaysFloor: [...SAFE_FLOOR],
  defaultMode: 'suggest',
};

/** Load + merge policy over the safe default. Fail-safe: malformed → default. */
export function loadPolicy(cwd: string): PermissionPolicy {
  const p = join(cwd, '.deckent', 'permission-policy.json');
  if (!existsSync(p)) return clone(SAFE_DEFAULT_POLICY);
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<PermissionPolicy>;
    return {
      tierMap: { ...SAFE_DEFAULT_POLICY.tierMap, ...(isObj(raw.tierMap) ? raw.tierMap : {}) },
      // union: override floor EXTENDS the safe floor, never shrinks it
      alwaysFloor: [...new Set([...SAFE_FLOOR, ...(Array.isArray(raw.alwaysFloor) ? raw.alwaysFloor.filter((x) => typeof x === 'string') : [])])],
      defaultMode: isMode(raw.defaultMode) ? raw.defaultMode : SAFE_DEFAULT_POLICY.defaultMode,
    };
  } catch {
    return clone(SAFE_DEFAULT_POLICY);
  }
}

function clone(p: PermissionPolicy): PermissionPolicy {
  return { tierMap: { ...p.tierMap }, alwaysFloor: [...p.alwaysFloor], defaultMode: p.defaultMode };
}
function isObj(x: unknown): x is Record<string, ToolPermissionTier> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}
function isMode(x: unknown): x is ApprovalMode {
  return x === 'suggest' || x === 'auto-edit' || x === 'full-auto';
}
```

> Note: this task imports `ToolPermissionTierMap` from `permission-types.ts` for type clarity. Add this line to `src/agent/permission-types.ts` (created in Task 3) in this step, before running tests:
> ```typescript
> // appended to src/agent/permission-types.ts
> import type { ToolPermissionTier } from './tools/types.js';
> export type ToolPermissionTierMap = Record<string, ToolPermissionTier>;
> ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/permission-policy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/permission-policy.ts src/agent/permission-types.ts tests/agent/permission-policy.test.ts
git commit -m "feat(agent): data-driven PermissionPolicy load+merge, safe floor preserved (SP-1 M1 T4)"
```

---

## Task 5: Permission engine (precedence)

**Files:**
- Create: `src/agent/permission.ts`
- Test: `tests/agent/permission-decide.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/permission-decide.test.ts
import { describe, it, expect } from 'vitest';
import { decide, type PermissionContext } from '../../src/agent/permission.js';
import type { PermissionRule } from '../../src/agent/permission-types.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';

const ctx = (over: Partial<PermissionContext> = {}): PermissionContext => ({
  rules: [],
  denies: [],
  policy: SAFE_DEFAULT_POLICY,
  mode: 'suggest',
  ...over,
});
const r = (tool: string, pattern: string): PermissionRule => ({ tool, pattern });

describe('decide — precedence (deny > floor > allow-rule > tier > mode)', () => {
  it('silent tier auto-allows with no rule', () => {
    expect(decide('read_file', 'src/x.ts', 'silent', ctx())).toBe('allow');
  });
  it('confirm tier asks with no rule in suggest mode', () => {
    expect(decide('write_file', 'src/x.ts', 'confirm', ctx())).toBe('ask');
  });
  it('an allow-rule auto-allows a confirm-tier tool', () => {
    expect(decide('write_file', 'src/x.ts', 'confirm', ctx({ rules: [r('write_file', 'src/**')] }))).toBe('allow');
  });
  it('a deny-rule overrides an allow-rule', () => {
    expect(decide('write_file', 'src/x.ts', 'confirm', ctx({
      rules: [r('write_file', 'src/**')], denies: [r('write_file', 'src/secret/**')],
    }))).toBe('allow'); // not in deny scope
    expect(decide('write_file', 'src/secret/k.ts', 'confirm', ctx({
      rules: [r('write_file', 'src/**')], denies: [r('write_file', 'src/secret/**')],
    }))).toBe('deny');
  });
  it('always-floor tool asks even with an allow-rule', () => {
    expect(decide('deckent_kill', '', 'confirm', ctx({ rules: [r('deckent_kill', '**')] }))).toBe('ask');
  });
  it('full-auto auto-allows confirm tier BUT never overrides the floor', () => {
    expect(decide('write_file', 'x', 'confirm', ctx({ mode: 'full-auto' }))).toBe('allow');
    expect(decide('deckent_kill', '', 'always', ctx({ mode: 'full-auto' }))).toBe('ask');
  });
  it('auto-edit auto-allows non-bash confirm, still asks bash', () => {
    expect(decide('write_file', 'x', 'confirm', ctx({ mode: 'auto-edit' }))).toBe('allow');
    expect(decide('bash', 'ls', 'confirm', ctx({ mode: 'auto-edit' }))).toBe('ask');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/permission-decide.test.ts`
Expected: FAIL — cannot resolve `permission.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/agent/permission.ts
// ═══ Permission engine — decide() (SP-1 §6) ═════════════════════════════════
// Precedence (high → low):
//   1. explicit deny rule
//   2. always-floor (policy.alwaysFloor)  — never auto, even in full-auto
//   3. explicit allow rule (once/session/always grants)
//   4. tier default (silent → allow, confirm → ask)
//   5. approvalMode (suggest/auto-edit/full-auto)
// The floor (step 2) sits ABOVE every grant/mode — the safety invariant.

import { matchRule, type ApprovalMode, type PermissionDecision, type PermissionRule } from './permission-types.js';
import type { PermissionPolicy } from './permission-policy.js';
import type { ToolPermissionTier } from './tools/types.js';

export interface PermissionContext {
  /** Active allow grants (session memory + persisted rules). */
  rules: PermissionRule[];
  /** Active deny rules. */
  denies: PermissionRule[];
  /** Loaded policy (tier-map already applied by caller to `tier`). */
  policy: PermissionPolicy;
  /** Session approval mode. */
  mode: ApprovalMode;
}

function inFloor(policy: PermissionPolicy, tool: string): boolean {
  return policy.alwaysFloor.includes(tool);
}

export function decide(
  tool: string,
  resource: string,
  tier: ToolPermissionTier,
  ctx: PermissionContext,
): PermissionDecision {
  // 1. explicit deny
  if (ctx.denies.some((d) => matchRule(d, tool, resource))) return 'deny';
  // 2. always-floor — never auto
  if (tier === 'always' || inFloor(ctx.policy, tool)) return 'ask';
  // 3. silent tier auto-allows
  if (tier === 'silent') return 'allow';
  // 4. explicit allow grant
  if (ctx.rules.some((r) => matchRule(r, tool, resource))) return 'allow';
  // 5. approval mode (confirm tier only reaches here)
  if (ctx.mode === 'full-auto') return 'allow';
  if (ctx.mode === 'auto-edit' && tool !== 'bash') return 'allow';
  return 'ask';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/permission-decide.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/permission.ts tests/agent/permission-decide.test.ts
git commit -m "feat(agent): permission decide() precedence engine, floor invariant (SP-1 M1 T5)"
```

---

## Task 6: Permission store (rule lifetime + legacy migration)

**Files:**
- Create: `src/agent/permission-store.ts`
- Test: `tests/agent/permission-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/permission-store.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuleStore } from '../../src/agent/permission-store.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-store-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const settingsPath = (d: string) => join(d, '.deckent', 'settings.local.json');

describe('createRuleStore', () => {
  it('grant "once" does not persist and is not remembered', () => {
    const d = sandbox();
    const s = createRuleStore(d);
    s.grant({ tool: 'write_file', pattern: 'src/**' }, 'once');
    expect(s.activeRules()).toHaveLength(0);
    expect(existsSync(settingsPath(d))).toBe(false);
  });
  it('grant "session" remembers in memory but does not persist', () => {
    const d = sandbox();
    const s = createRuleStore(d);
    s.grant({ tool: 'write_file', pattern: 'src/**' }, 'session');
    expect(s.activeRules()).toEqual([{ tool: 'write_file', pattern: 'src/**' }]);
    expect(existsSync(settingsPath(d))).toBe(false);
  });
  it('grant "always" persists to settings.local.json AND is active', () => {
    const d = sandbox();
    const s = createRuleStore(d);
    s.grant({ tool: 'bash', pattern: 'npm test*' }, 'always');
    expect(s.activeRules()).toContainEqual({ tool: 'bash', pattern: 'npm test*' });
    const doc = JSON.parse(readFileSync(settingsPath(d), 'utf-8'));
    expect(doc.permissions.rules).toContainEqual({ tool: 'bash', pattern: 'npm test*' });
  });
  it('migrates legacy permissions.allow[toolName] → rule tool(**) on load', () => {
    const d = sandbox();
    writeFileSync(settingsPath(d), JSON.stringify({ permissions: { allow: ['deckent_write_file'] } }));
    const s = createRuleStore(d);
    expect(s.activeRules()).toContainEqual({ tool: 'deckent_write_file', pattern: '**' });
  });
  it('revoke removes a session rule', () => {
    const d = sandbox();
    const s = createRuleStore(d);
    s.grant({ tool: 'write_file', pattern: 'src/**' }, 'session');
    s.revoke({ tool: 'write_file', pattern: 'src/**' });
    expect(s.activeRules()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/permission-store.test.ts`
Expected: FAIL — cannot resolve `permission-store.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/agent/permission-store.ts
// ═══ Rule store — lifetime persistence (SP-1 §6) ════════════════════════════
// Lifetimes: 'once' (no memory), 'session' (in-memory only), 'always'
// (in-memory + .deckent/settings.local.json under permissions.rules).
// Migrates legacy permissions.allow:[toolName] → { tool, pattern: '**' }.
// Evolves chat-permissions.ts (tool-name set → rule set), same file location.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { PermissionRule } from './permission-types.js';

export type GrantLifetime = 'once' | 'session' | 'always';

export interface RuleStore {
  /** Add a rule for the given lifetime. */
  grant(rule: PermissionRule, lifetime: GrantLifetime): void;
  /** Remove a matching rule from memory + persisted store. */
  revoke(rule: PermissionRule): void;
  /** All currently-active rules (session + persisted). */
  activeRules(): PermissionRule[];
}

function settingsPath(cwd: string): string {
  return join(cwd, '.deckent', 'settings.local.json');
}

function sameRule(a: PermissionRule, b: PermissionRule): boolean {
  return a.tool === b.tool && a.pattern === b.pattern;
}

function loadPersisted(cwd: string): PermissionRule[] {
  const p = settingsPath(cwd);
  if (!existsSync(p)) return [];
  try {
    const doc = JSON.parse(readFileSync(p, 'utf-8')) as {
      permissions?: { rules?: unknown; allow?: unknown };
    };
    const rules: PermissionRule[] = [];
    const raw = doc.permissions?.rules;
    if (Array.isArray(raw)) {
      for (const x of raw) {
        if (x && typeof x === 'object' && typeof (x as PermissionRule).tool === 'string' && typeof (x as PermissionRule).pattern === 'string') {
          rules.push({ tool: (x as PermissionRule).tool, pattern: (x as PermissionRule).pattern });
        }
      }
    }
    // legacy migration: permissions.allow:[toolName] → tool(**)
    const legacy = doc.permissions?.allow;
    if (Array.isArray(legacy)) {
      for (const t of legacy) {
        if (typeof t === 'string') rules.push({ tool: t, pattern: '**' });
      }
    }
    return rules;
  } catch {
    return [];
  }
}

function persist(cwd: string, rules: PermissionRule[]): void {
  const p = settingsPath(cwd);
  let doc: Record<string, unknown> = {};
  try {
    if (existsSync(p)) doc = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    doc = {};
  }
  const permissions = (doc['permissions'] && typeof doc['permissions'] === 'object')
    ? (doc['permissions'] as Record<string, unknown>)
    : {};
  permissions['rules'] = rules;
  delete permissions['allow']; // migrated into rules
  doc['permissions'] = permissions;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}

export function createRuleStore(cwd: string): RuleStore {
  const persisted = loadPersisted(cwd);
  const session: PermissionRule[] = [];
  const active = (): PermissionRule[] => {
    const all = [...persisted];
    for (const s of session) if (!all.some((a) => sameRule(a, s))) all.push(s);
    return all;
  };
  return {
    grant(rule, lifetime) {
      if (lifetime === 'once') return;
      if (lifetime === 'session') {
        if (!session.some((s) => sameRule(s, rule))) session.push(rule);
        return;
      }
      // always
      if (!persisted.some((s) => sameRule(s, rule))) persisted.push(rule);
      persist(cwd, persisted);
    },
    revoke(rule) {
      for (let i = session.length - 1; i >= 0; i--) if (sameRule(session[i]!, rule)) session.splice(i, 1);
      const before = persisted.length;
      for (let i = persisted.length - 1; i >= 0; i--) if (sameRule(persisted[i]!, rule)) persisted.splice(i, 1);
      if (persisted.length !== before) persist(cwd, persisted);
    },
    activeRules: active,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/permission-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/permission-store.ts tests/agent/permission-store.test.ts
git commit -m "feat(agent): rule store lifetimes + legacy allow[] migration (SP-1 M1 T6)"
```

---

## Task 7: Wire-up gate — typecheck + full M1 suite green

**Files:**
- Test: (no new file — verification task)

- [ ] **Step 1: Typecheck the whole project**

Run: `npm run lint`
Expected: PASS (tsc --noEmit clean; new `src/agent/` modules compile, all `.js` import suffixes resolve).

- [ ] **Step 2: Run the full agent suite**

Run: `npx vitest run tests/agent/`
Expected: PASS — 6 files, 30 tests (5+4+5+4+7+5).

- [ ] **Step 3: Run the full project suite (no regressions)**

Run: `npx vitest run`
Expected: PASS for all pre-existing suites (M1 is additive, greenfield `src/agent/` — orchestrator + REPL untouched). Any pre-existing red files are unrelated to M1 (do not "fix" them here; note them).

- [ ] **Step 4: Commit the milestone marker**

```bash
git commit --allow-empty -m "chore(agent): SP-1 M1 tool+permission foundation complete (30 tests green)"
```

---

## Self-Review

**Spec coverage (spec §6 + §8 foundation):**
- §8 ToolDefinition contract → Task 1 ✓ · registry + toNativeSchemas → Task 2 ✓
- §6 grant = tool(pattern) + glob → Task 3 ✓ · data-driven policy + safe floor → Task 4 ✓ · precedence engine + floor invariant → Task 5 ✓ · 3-lifetime + legacy migration → Task 6 ✓
- §6 `/permissions` list+revoke → store `activeRules()`/`revoke()` provide the data; the command surface itself is M3 (view) — noted, not a gap.
- §8 tool SOURCES (builtin/MCP/user/package/config) → registry accepts them (the `source` field + `register`); the loaders themselves are M2 — noted, not a gap.
- Provider/loop/identity/guards/view → M2/M3 by design (this plan is the dependency-free foundation only).

**Placeholder scan:** No TBD/TODO; every step has complete code + exact run command + expected output.

**Type consistency:** `PermissionRule {tool,pattern}` identical across T3/T5/T6 · `ToolPermissionTier 'silent'|'confirm'|'always'` identical T1/T4/T5 · `ApprovalMode` identical T3/T5 · `PermissionPolicy {tierMap,alwaysFloor,defaultMode}` identical T4/T5 · `decide(tool,resource,tier,ctx)` signature stable T5→consumers. Task 4 appends the `ToolPermissionTierMap` export to the Task 3 file (called out inline).

**Scope:** M1 produces a standalone, fully-unit-tested foundation (30 tests) with zero provider/loop/view coupling — builds and tests green on its own. M2 (provider+loop+identity) and M3 (view-wire+migration) are separate plans, written after M1 lands.
