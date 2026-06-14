# Stack-Aware Routing

Deckent works on any project stack, not just TypeScript. Stack detection changes how Deckent verifies tasks, routes work to agents, and applies skills. At the start of a sprint, Deckent detects your project's `TechStackKind` (e.g., `typescript`, `go`, `python`, `rust`, `unknown`) — ensuring a Go project is verified with `go test` and a Python expert is never assigned to a Rust task.

Routing itself is handled by the **v2 Routing Engine** (`src/core/routing-engine.ts`), a 3-layer intent-based system that operates on top of stack detection.

## Table of Contents
1.  [Routing Engine v2 — 3-Layer Architecture](#1-routing-engine-v2--3-layer-architecture)
2.  [Task-Kind Aware Verification](#2-task-kind-aware-verification)
3.  [Stack-Specific Commands for Code](#3-stack-specific-commands-for-code)
4.  [Intelligent Coverage Gate](#4-intelligent-coverage-gate)
5.  [Language Mismatch Penalty](#5-language-mismatch-penalty)
6.  [User Overrides](#6-user-overrides)

---

### 1. Routing Engine v2 — 3-Layer Architecture

`routeTaskV2` (`src/core/routing-engine.ts`) replaces the original `selectAgent()` + `selectSkills()` functions with a unified, intent-based decision pipeline. Every task passes through three layers in order:

**Layer 1 — Intent Classifier** (`src/core/intent-classifier.ts`)

Analyzes the task's title, description, and scope to produce a **TaskDNA** object:

```typescript
interface TaskDNA {
  intent: {
    primary: IntentType;       // e.g. 'implementation' | 'security' | 'documentation' | ...
    secondary: IntentType[];
    confidence: number;        // 0.0–1.0
  };
  tags: string[];              // cross-cutting concerns (e.g. 'test-coverage')
  domains: Array<{ name: string; weight: number }>;  // e.g. [{name:'api', weight:0.8}]
  operations: Array<{ type: OperationType; weight: number }>;
  complexity: { fileCount: number; moduleCount: number; crossCutting: boolean; estimatedSize: TaskSize };
  scope: { writeRatio: Record<string, number>; primaryWriteTarget: string; testWriteRatio: number };
}
```

Supported intent types: `implementation`, `bugfix`, `refactor`, `documentation`, `security`, `devops`, `config`, `performance`, `design`, `migration`, `architecture`, `unknown`.

**Layer 2 — Activation Engine** (`src/core/activation-engine.ts`)

Evaluates each agent and skill against **ActivationConfig** rules (structured JSON rule-sets in each manifest's `activation.rules[]`). Rules fire when conditions on TaskDNA fields match — e.g. `{ "when": { "intent.primary": "security" }, "score": 10 }`. Agents and skills are ranked by cumulative activation score.

Domain-match bonuses (`DOMAIN_MATCH_BONUS = 3`) are added when an agent's domain aligns with the task's extracted domains (e.g. `src/api/` → `api-builder` bonus). User-surface tasks (`cli`, `dashboard`, `api`) receive an additional `USER_SURFACE_BONUS = 8` for their owning agents (`api-builder`, `frontend-designer`, `ci-guardian`).

**Layer 3 — Routing Engine** (`src/core/routing-engine.ts`)

Resolves user overrides, applies the activation scores, selects the top agent and skills, and returns a `RoutingDecision`:

```typescript
interface RoutingDecision {
  agentId: string | null;
  skillIds: string[];
  confidence: ConfidenceLevel;   // 'high' | 'medium' | 'low' | 'uncertain'
  reasoning: string[];
  taskDNA: TaskDNA;
  overrideSource: OverrideSource;
  overrideWarnings: string[];
  skillBudget: SkillBudget;
}
```

If no agent meets the activation threshold, the **fallback chain** for the primary intent provides a deterministic selection (e.g. `security` → `['security-auditor']`, `documentation` → `['doc-writer']`).

---

### 2. Task-Kind Aware Verification

Not all tasks are created equal. Deckent understands the difference between writing documentation and refactoring critical code. The `task.kind` (`doc-write`, `audit`, `code-development`, etc.) is the first factor in the verification process.

-   **`doc-write` and `audit` tasks are NOT judged by a build.** Their success is determined by whether the target files were created with the expected content (`disk-verify`), not by running `tsc` or a test suite. This allows documentation and analysis to proceed without being coupled to the build system.

-   **`code-development` tasks**, however, are subject to rigorous, stack-aware verification.

---

### 3. Stack-Specific Commands for Code

When a task involves writing or modifying code, Deckent uses the detected `TechStackKind` to run the correct, idiomatic verification commands.

-   A **Go** project will be tested with `go test ./...`. Deckent will never incorrectly try to run `tsc`.
-   A **Rust** project will be checked with `cargo check` and `cargo test`.
-   A **TypeScript** project will use `tsc --noEmit` and `vitest run`.

This prevents spurious failures and ensures that every project is validated using its own native toolchain.

---

### 4. Intelligent Coverage Gate

Deckent's test coverage gate is currently implemented for JavaScript/TypeScript projects using `vitest --coverage`. For other stacks where coverage measurement isn't standardized in the same way, the coverage check is automatically exempted.

This is treated as a **measurement gap, not a failure**. A Go or Rust project will not be penalized for missing coverage data; the sprint can still succeed. This ensures the coverage requirement doesn't block work on non-JS/TS codebases.

---

### 5. Language Mismatch Penalty

The routing engine applies a penalty (`LANGUAGE_MISMATCH_PENALTY = 6`) when a skill's language category does not match the confidently-detected project stack. For example, `typescript-expert` will almost never be routed to a task in a Go project. This penalty is score-based and soft — a `- Skills:` override in DIRECTIVES bypasses it entirely.

---

### 6. User Overrides

While the automatic stack-aware routing is powerful, you always have the final say. You can bypass the routing logic and force the assignment of specific agents or skills directly in your `DIRECTIVES.md`:

```markdown
## Task 1: Refactor database logic in Go
- Agent: migration-specialist
- Skills: database-migration, git-expert
- Files: pkg/db/connect.go
- Scope: pkg/db/

### Description
...
```

By explicitly listing `- Agent:` or `- Skills:`, you override the language-mismatch penalty and ensure the specified experts are assigned to the task, regardless of the automatically detected stack. This gives you fine-grained control when you need it.
