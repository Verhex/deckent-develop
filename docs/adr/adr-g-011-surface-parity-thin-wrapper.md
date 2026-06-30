# ADR-G-011: Surface Parity & Thin-Wrapper

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=shared core (`src/core/` · `src/orchestra/`) + thin CLI/MCP wrappers + auto-generated parity refs (`docs/reference/cli.md` · `mcp-tools.md`) → tomorrow=CLI≡MCP≡terminal/tool parity + LAYER-1 structural enforcement + WATCH-W backend-agnostic
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-022 (CLI/MCP Feature Parity) · **Supersedes:** —
**Crosswalk:** ADR-022 → ADR-G-011

---

## Context

Users switching from the CLI to an MCP host (Claude Code, VS Code, JetBrains) experienced **feature loss** — capabilities reachable from the CLI were missing in MCP. Worse, CLI and MCP used **different code paths** (CLI called functions directly while MCP ran wrappers over HTTP/stdio), so the two surfaces could drift in behavior, not just in coverage. ADR-022 (Sprint 067 v1 → Sprint 085 v2) established **feature parity + thin-wrapper**: one core, surfaces are thin.

The 2026-06-30 review confirmed this as **ADR-G** (Global / Constitution — "critical support" law): the same capability must be reachable over the same core from every surface. It then extended the law to the terminal-center pivot (CLI ≡ MCP ≡ terminal/tool).

---

## Decision (Today)

### 1. CLI ≡ MCP over one core

Every MCP tool has a CLI counterpart; **there are no MCP-only commands.** Shared business logic lives in `src/core/` or `src/orchestra/`; the CLI (`register<Name>(program)`) and MCP (`server.registerTool()`) are **thin wrappers that call the same core function**. Parameter parity holds: MCP tools use the same input/output schema as their CLI commands.

### 2. Intentional CLI-only (infra / UI / setup)

These are infrastructure/terminal operations, deliberately kept CLI-only:

```xml
<cli-only reason="infrastructure / interface / setup — not core capability">
  <group kind="infra">attach · spawn</group>           <!-- tmux session mgmt -->
  <group kind="server-ui">dashboard · web · serve</group> <!-- interface launch -->
  <group kind="setup">upgrade · onboard</group>          <!-- setup wizards -->
  <group kind="plugin">plugin install · plugin list · plugin create</group>
</cli-only>
```

### 3. `watch` is NOT CLI-only (2026-06-11 correction)

`deckent_watch` MCP already exists, but CLI `watch` (tmux-split) and MCP `deckent_watch` (event-stream subscribe) **semantically diverged** = a parity violation. Per this ADR they must be **unified** and made **backend-agnostic** (observe the worker wherever it runs — ADR-G-014, which absorbed ADR-089). Work-item: **WATCH-W**.

### 4. Counts are not load-bearing

The Sprint-085 parity counts ("19 MCP = 19 CLI", "MCP 16→19", "CLI 32→33") are **stale snapshots**. The principle stands; canonical counts are **auto-generated** — `docs/reference/cli.md` + `docs/reference/mcp-tools.md` via `npm run docs:ref`.

---

## Intent / Roadmap (Tomorrow)

- **CLI ≡ MCP ≡ terminal/tool:** as the native agentic terminal (ADR-G-034) becomes the primary management+usage surface and tool-driven invocation grows, parity **extends** — the same capability is reachable from CLI, MCP, the terminal, and tool-calls, all thin over one core. The dashboard remains **observe-only** (no command-execution divergence — ADR-G-033).
- **LAYER-1 structural enforcement:** the `core→cli/orchestra` import-inversion cleanup (CORE-W1 + ORCH-W1 + API-W1 + ADR-008-W) — logic lives in core, every surface stays thin; enforced **structurally** so a wrapper cannot accrete business logic. (MASTER-PLAN: LAYER-1.)
- **WATCH-W backend-agnostic parity:** `watch` observes the worker wherever it runs (docker/subprocess/tmux/firecracker/cloud) with **one semantic** across CLI + MCP (ADR-G-014 Observation).

---

## Consequences

**(+)** A user can do anything from any surface; new capability is built **once** in core and surfaced thinly; auto-generated refs prevent count-drift. The thin-wrapper law is precisely what makes the terminal-center pivot cheap — the terminal is just one more thin surface over the same core.

**(−)** Two-or-more wrappers per capability raise the per-feature cost (every core feature needs CLI + MCP + terminal surfacing). The thin-wrapper discipline is enforced **structurally only as a roadmap item** (LAYER-1); today a surface could still accrete logic (caught at review, not blocked). `watch` parity is an open divergence until WATCH-W lands.

---

## References / Absorbed

- **Absorbs:** ADR-022 (CLI/MCP Feature Parity — thin-wrapper, shared core, intentional CLI-only, `watch`-parity correction).
- **Surface partners:** ADR-G-034 (Native Agentic Terminal — primary surface), ADR-G-033 (Dashboard — observe-only), ADR-G-029 (Embedded Web Terminal), ADR-G-010 (Output, Terminal-UX & Brand — consistent output across surfaces).
- **Backend partner:** ADR-G-014 (Spawn Backend, Options & Observation — absorbed ADR-089 backend-agnostic watch; WATCH-W).
- **Structure substrate:** ADR-D-004 (Brain Central Import — one-way dependency) + ADR-D-006 (Code Architecture Conventions) — the import-direction LAYER-1 cleans.
- **Governance:** ADR-G-019 (taxonomy), ADR-G-020 (authority / enforcement).
- **Born work-items:** LAYER-1 (core→surface inversion cleanup, MASTER-PLAN P1), WATCH-W (backend-agnostic watch + CLI/MCP parity, P1).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 022 → ADR-G-011), `.analysis/hermes-vs-deckent-direction-decisions.md` (terminal-center pivot).
