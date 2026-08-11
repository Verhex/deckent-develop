# OWASP Agentic Top 10 baseline — 2026-08-11

## Purpose and evidence boundary

This is a conservative, point-in-time self-assessment of deckent against the
OWASP Top 10 for Agentic Applications (ASI01–ASI10, 2026). It is for security
owners and integrators deciding whether a deployment needs compensating
controls.

The task's read authority exposes the owner-supplied
[`CODEX-OWASP-ASI-PROMPT.md`](CODEX-OWASP-ASI-PROMPT.md), but not the
implementation or `docs/MASTER-PLAN.md` paths it cites. Therefore, the paths
and line ranges below are traceable evidence leads, not an independent
code-truth confirmation. A feature is never credited as covered from a task
assertion alone. Every verdict is `open` until the cited source path is read
and its production wiring is verified.

`MASTER row` records an owner supplied by the task or prompt. `Not identified`
means this assessment could not safely infer an owner without ledger access.

| Risk | Verdict | Evidence path / current assessment | MASTER row owning a gap |
| --- | --- | --- | --- |
| ASI01 — Agent Goal Hijack | **Open** | `CODEX-OWASP-ASI-PROMPT.md` identifies no general content-provenance or taint boundary for file, web, MCP, memory, skill, or ADR content entering prompts. The underlying source was not readable in this task. | Not identified |
| ASI02 — Tool Misuse & Exploitation | **Open** | `src/orchestra/tool-scope-gate.ts` is named by the owner prompt as unwired; `src/providers/provider-command-spec.ts:129,145` is cited for non-Claude `allowedToolsFlag: null`; `src/orchestra/command-guard.ts:54-55` is cited as loopback-inert. No production caller was independently verified. | Not identified |
| ASI03 — Identity & Privilege Abuse | **Open** | `src/providers/provider-command-spec.ts:129,145` is the supplied evidence lead for provider command authority, and the prompt reports broad `Bash` access undermines path scoping. Scope/identity enforcement cannot be credited without code-truth review. | Not identified |
| ASI04 — Agentic Supply Chain | **Open** | `src/orchestra/plugin-loader.ts` is cited for validation primitives, but `src/orchestra/sprint-controller.ts:1654` and `src/orchestra/plugin-hooks.ts:225-238` are cited as the historical unwired/error-swallowing path. Task context says row 7031 later wired this behind a flag, but gives no file-level proof of the current caller/default; it is not credited. `src/mcp-client/config.ts:46,57` is also cited for default trust of cloned `.mcp.json`. | 7031 (plugin sandbox; owner-reported flag-gated remediation) |
| ASI05 — Unexpected Code Execution | **Open** | `src/orchestra/tool-scope-gate.ts` and `SkillSandbox.requireSafe` are named as unwired in the owner prompt. `src/providers/provider-command-spec.ts:129,145` is the supplied cross-provider authority lead. Production enforcement and sandbox escape resistance remain unverified. | 7031 where the gap is plugin-hook execution; otherwise Not identified |
| ASI06 — Memory & Context Poisoning | **Open** | The owner prompt reports no general provenance/taint control for memory and context inputs. `src/orchestra/audit-writer.ts:35` is cited for a fixed `AUDIT_HMAC_SECRET`, which weakens audit integrity but does not itself prove memory protection. No readable evidence shows admission, provenance, or durable quarantine of memory writes. | Not identified |
| ASI07 — Insecure Inter-Agent Communication | **Open** | `src/agents/worker.ts:795` is cited for `checkWorkerAuthority(enforceRbac)` as an unwired control. No readable evidence establishes authenticated, integrity-protected inter-agent messages, replay protection, or a production RBAC caller. | Not identified |
| ASI08 — Cascading Failures | **Open** | `src/orchestra/result-evaluator.ts:2380-2430` is cited for reliance on worker-reported `filesChanged`; `src/monitor/auditor.ts:752-791` is cited as alert-only, misattributing, and blind to untracked files; `src/orchestra/sprint-controller.ts:1922` is cited as fail-open on a Git failure. These are evidence leads for weak containment, not verified coverage. | Not identified |
| ASI09 — Human-Agent Trust Exploitation | **Open** | The owner prompt identifies content without provenance/taint marking and no cited approval-view integrity control. Approval flows may exist, but no file-level, readable evidence proves that approvers see trustworthy provenance, scope, and consequence information. | Not identified |
| ASI10 — Rogue Agents | **Open** | `src/agents/worker.ts:795`, `src/orchestra/self-modifying-detector.ts:203`, `src/orchestra/tool-scope-gate.ts`, and `SkillSandbox.requireSafe` are owner-prompt evidence leads for controls reported unwired. `src/orchestra/result-evaluator.ts:2380-2430` is cited as relying on an agent's own boundary declaration. Independent enforcement is unverified. | Not identified |

## Cross-cutting control inventory

The owner prompt describes capability and tool authority checks, plugin validation,
scope gates, spend gates, approval-related controls, memory/context handling, and
audit chains. This document does **not** classify any of them as `covered` or
`partially covered`: current production reachability, flag defaults, failure modes,
and ledger ownership were not available in this task's permitted read set.

Two remediation rows are explicitly supplied by the task context:

- **7031**: plugin sandbox, described as wired but flag-gated.
- **4091**: spend gate, described as enforced but flag-gated.

Those statements require a follow-up code-truth review that records the exact
producer, consumer, entrypoint, policy key, default, and fail-closed behavior before
they can change an ASI verdict. This preserves the baseline's rule: absence of
file-level verification is an open risk, not evidence of coverage.

## Required follow-up evidence

For each row above, a reviewer with read authority should inspect the cited source
paths and `docs/MASTER-PLAN.md`, then replace only the relevant `open` verdict after
confirming production wiring. The review must capture the exact path and line range,
whether the control is enforced, config-gated, advisory, or unwired, its default, and
the owning MASTER row for every remaining gap.
