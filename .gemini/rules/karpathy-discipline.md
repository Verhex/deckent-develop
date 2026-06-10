---
paths: ["src/**","tests/**",".gemini/**","docs/**"]
---
# Karpathy 4-Discipline Rule — Deckent Worker Anchor

This rule defines the four core disciplines that every Deckent worker MUST follow when
generating code. These disciplines serve as a cognitive anchor: before writing any line,
validate it against all four principles. Inspired by Andrej Karpathy's software engineering
philosophy as adapted for AI-agent workflows.

---

## Discipline 1 — Think Before Coding

**Read before you write. Plan before you implement.**

- Read the full task description, goNogo criteria, and ALL files in scope.filesRead before touching a single line.
- Identify every ADR constraint that applies to the task — check `.brain/exports/decisions.md` or the injected ADR list.
- Write the execution plan (`.tasks/task-XXX.plan`) BEFORE touching source files. The plan must list: files to change, expected deltas, and how each change maps to the task's goCriteria.
- List assumptions explicitly in the plan. An assumption you cannot verify becomes a risk; name it so Brain can catch it.
- If the task description is ambiguous, resolve ambiguity from the goCriteria — not from guesswork.
- Re-read the relevant existing code one more time after planning and before editing. Understanding the existing pattern prevents introducing drift.
- Never assume a file is empty or trivial — 10 seconds reading saves 10 minutes debugging.

**Anti-patterns to avoid:**
- Starting to code before finishing plan.md
- Skipping ADR check because this looks like a simple task
- Treating existing code as legacy that needs rewriting by default

---

## Discipline 2 — Simplicity First

**Prefer existing patterns. Avoid new abstractions. YAGNI.**

- Before adding a new function, search for an existing one that does (or can be extended to do) the same thing.
- Three similar lines of code are better than a premature abstraction. Do NOT extract a shared utility unless it appears in 3+ distinct callsites within THIS task scope.
- YAGNI — You Aren't Gonna Need It. Do not implement generalization, configuration knobs, or extensibility that the task spec does not require.
- Prefer flat code over nested abstractions. Each layer of indirection must earn its existence by making the call-site simpler AND reducing duplication.
- When in doubt between two approaches, choose the one with fewer new lines of code — all else equal.
- Do NOT introduce new runtime dependencies unless the task explicitly requires it and the dependency is already in package.json.
- Follow ADR-010 (Tek Runtime Dependency): if you need a new package, check if an existing one or a Node.js built-in can fill the need.

**Anti-patterns to avoid:**
- Creating a helper function used exactly once
- Adding an options object to a function that has a single caller
- Introducing an interface for a concrete type that will never be polymorphic
- Adding try/catch blocks for errors that cannot occur given validated input

---

## Discipline 3 — Surgical Changes

**Stay within scope. Minimum-diff. Preserve existing behavior.**

- Write only to files listed in scope.filesWrite. The Auditor runs git diff --stat after every task — files outside scope trigger an automatic violation flag.
- Edit only the lines that need to change. Do not reformat, rename, or reorganize code adjacent to the change unless the task description explicitly asks for it.
- Preserve existing behavior unless the task description explicitly asks you to change it. If existing tests pass before your change, they must still pass after.
- Do not upgrade or downgrade dependency versions as a side effect.
- If you discover a bug or improvement outside your scope while working, note it in your .result file under notes — do NOT fix it inline.
- Keep diffs reviewable: a PR reviewer should be able to understand your change in one read-through.
- Prefer Edit over full file rewrites. A rewrite that touches 90% of a file when only 5% needed to change is a red flag.

**Anti-patterns to avoid:**
- Touching files not in scope.filesWrite just to fix a small thing
- Reformatting entire functions while changing one line inside them
- Updating imports across the file when only one new import was needed
- Silently changing return types or side-effects of existing functions

---

## Discipline 4 — Goal-Driven Execution

**Map every line to the task goCriteria. If you cannot justify a change, drop it.**

- The task goNogo.goCriteria field is the definition of done. Re-read it after every significant change.
- Before committing a code block, ask: Which goCriteria item does this satisfy? If the answer is none, remove the code.
- Run the verification commands listed in the task description before writing the result file. Kanit commands are not optional.
- The self-assessment field in the result file must reflect ACTUAL outcome, not intended outcome:
  - DONE — every goCriteria item verified with evidence
  - GO_WITH_TECH_DEBT — core criteria met but at least one minor item remains; describe the gap
  - NO_GO — at least one critical goCriteria item unmet; describe why
- Do NOT inflate self-assessment. Brain FIX phase exists exactly for honest NO_GO results; a false DONE that fails auditor review costs more than a truthful NO_GO.
- Token budget discipline: every tool call should advance the task. Reading the same file twice without a state change is waste.
- Finish the task, or write NO_GO. Partial, uncommitted work that leaves the codebase in a broken state is worse than doing nothing.

**Anti-patterns to avoid:**
- Writing selfAssessment DONE without running the verification commands
- Adding nice-to-have features that are not in goCriteria
- Leaving temporary debug code, TODO comments, or half-finished blocks in the committed result
- Overstating coverage or test results in the notes field

---

## Quick Reference Checklist

Before writing the first line of code:
- [ ] Read full task + all scope files
- [ ] Identified all relevant ADRs
- [ ] Written execution plan (.plan file)
- [ ] Listed explicit assumptions

Before each code block:
- [ ] Follows existing pattern (not a new abstraction)
- [ ] Within scope.filesWrite
- [ ] Justified by a specific goCriteria item

Before writing the result file:
- [ ] Ran all verification commands from task description
- [ ] tsc --noEmit passes (or failure explained)
- [ ] Test suite passes (or failures listed)
- [ ] Self-assessment reflects actual, verified outcome

---

## Source

Adapted from Andrej Karpathy software engineering philosophy for AI-agent workflows.
Canonical reference: multica-ai/andrej-karpathy-skills (external, public domain principles).
Deckent-specific adaptations: Sprint 191, Worker Discipline Anchor project.

See also: .claude/rules/worker-default.md, .brain/exports/decisions.md (ADR-037, ADR-035).


---

## CUSTOM — Test Hermeticity

**Every test MUST be hermetic — it must pass on a fresh checkout with no local state.**

CI runs on a clean machine with no `.deckent/config.json`, no `.brain/memory.db`, and no
`~/.deckent` directory. Tests that read gitignored state pass locally but fail in CI.
The `test:ci-sim` script reproduces this by hiding those files before running the suite.

Rules:
- **Never read gitignored local state** — `.deckent/config.json`, `.brain/memory.db`,
  `~/.deckent`, `.deck/` are gitignored and absent on a fresh checkout. Tests that
  `readFileSync` these paths without a skip-guard will fail in CI.
- **Use tmpdir for all file I/O** — create all test fixtures under `os.tmpdir()` (e.g.
  `withSandboxHome()`), and clean up in `afterEach`. Never write to the project root or HOME.
- **No spawnSync for subprocesses** — use async `spawn` (child_process) so the worker
  does not freeze waiting for a subprocess. `spawnSync` blocks the event loop and causes
  CI timeouts.
- **CI=fresh checkout assumption** — write every test as if the only files present are
  those committed to git. If your test needs external state, create it in a tmpdir fixture
  at test-start and tear it down at test-end.
- **Reference `test:ci-sim`** — before pushing, run `npm run test:ci-sim` to verify that
  your tests pass under hidden gitignored state. This is the canonical hermetic reproducer
  (ci-sim script introduced in Sprint 215).

Routing: CI tasks (test infra, pipeline fixes, hermetic reproducer) should use
**ci-guardian agent** + **ci-testing skill**. This ensures the routing engine selects
the right specialization for CI hygiene work.

