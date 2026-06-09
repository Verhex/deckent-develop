# Stack-Aware Routing (WM-7)

Deckent is designed to work on any project stack, not just TypeScript. It achieves this through a "stack-aware" routing and verification system. At the beginning of a sprint, Deckent analyzes your project to determine its `TechStackKind` (e.g., `typescript`, `go`, `python`, `rust`, `unknown`). This detection fundamentally changes how Deckent verifies tasks, routes work to agents, and applies skills.

This powerful feature ensures that a Go project is tested with `go test` and that a Python expert agent isn't assigned to a Rust task.

## Table of Contents
1.  [Task-Kind Aware Verification](#1-task-kind-aware-verification)
2.  [Stack-Specific Commands for Code](#2-stack-specific-commands-for-code)
3.  [Intelligent Coverage Gate](#3-intelligent-coverage-gate)
4.  [Parametric Skills and Specialized Agents](#4-parametric-skills-and-specialized-agents)
5.  [Language Mismatch Penalty](#5-language-mismatch-penalty)
6.  [User Overrides](#6-user-overrides)

---

### 1. Task-Kind Aware Verification

Not all tasks are created equal. Deckent understands the difference between writing documentation and refactoring critical code. The `task.kind` (`doc-write`, `audit`, `code-development`, etc.) is the first factor in the verification process.

-   **`doc-write` and `audit` tasks are NOT judged by a build.** Their success is determined by whether the target files were created with the expected content (`disk-verify`), not by running `tsc` or a test suite. This allows documentation and analysis to proceed without being coupled to the build system.

-   **`code-development` tasks**, however, are subject to rigorous, stack-aware verification.

---

### 2. Stack-Specific Commands for Code

When a task involves writing or modifying code, Deckent uses the detected `TechStackKind` to run the correct, idiomatic verification commands.

This means:
-   A **Go** project will be tested with `go test ./...`. Deckent will never incorrectly try to run `tsc`.
-   A **Rust** project will be checked with `cargo check` and `cargo test`.
-   A **TypeScript** project will use `tsc --noEmit` and `vitest run`.

This prevents spurious failures and ensures that every project is validated using its own native toolchain.

---

### 3. Intelligent Coverage Gate

Deckent's test coverage gate is currently implemented for JavaScript/TypeScript projects using `vitest --coverage`. For other stacks where coverage measurement isn't standardized in the same way, the coverage check is automatically exempted.

This is treated as a **measurement gap, not a failure**. A Go or Rust project will not be penalized for missing coverage data; the sprint can still succeed. This ensures the coverage requirement doesn't block work on non-JS/TS codebases.

---

### 4. Parametric Skills and Specialized Agents

Deckent's routing intelligence extends to how it assigns agents and skills.

-   **Parametric `code-expert` Skill:** The generic `code-expert` skill is parametric. When applied to a task, it resolves to a stack-specific implementation, providing the agent with the correct idioms, commands, and best practices for the project's language.

-   **Stack-Specialized Prime Agents:** For certain well-known stacks, Deckent may spin up temporary, specialized agents (e.g., `temp-go-specialist`, `temp-rust-expert`) to handle tasks requiring deep, language-specific knowledge.

---

### 5. Language Mismatch Penalty

To ensure high-quality results, the task router applies a heavy penalty when a skill or agent's specialization does not match the project's `TechStackKind`.

For example, the `typescript-expert` skill will almost never be routed to a task in a Go project. This prevents agents from applying incorrect patterns or attempting to use the wrong tools, which would lead to failed tasks and wasted effort.

---

### 6. User Overrides

While the automatic stack-aware routing is powerful, you always have the final say. You can bypass the routing logic and force the assignment of specific agents or skills directly in your `DIRECTIVES.md`:

```markdown
## Task 1: Refactor database logic in Go
- Agent: migration-specialist
- Skills: database-migration, go-expert
- Files: pkg/db/connect.go
- Scope: pkg/db/

### Description
...
```

By explicitly listing `- Agent:` or `- Skills:`, you override the language-mismatch penalty and ensure the specified experts are assigned to the task, regardless of the automatically detected stack. This gives you fine-grained control when you need it.
