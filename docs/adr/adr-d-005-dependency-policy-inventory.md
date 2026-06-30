# ADR-D-005: Dependency Policy & Inventory (All Deps + Rationale)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=per-dependency rationale in the living inventory + exact-version pin + audited source → tomorrow=keep the inventory current as deps grow + automated audit / SBOM gate
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-010 (Tek Runtime Dependency → Dependency Policy), ADR-011 (node:readline built-in prompt) · **Supersedes:** —
**Crosswalk:** ADR-010 + ADR-011 → ADR-D-005

> **Reframe note (2026-06-30):** The old "single / minimal runtime dependency" dogma is **removed**. A dependency *count target* is the wrong discipline — it would block essential capabilities (LLM/AI providers, MCP, embedded SQL memory, crypto, PTY, rich UI). The real discipline is **merit-based selection + security rigor**, recorded in a living inventory. This is a contributor-only build policy (ADR-D, dev install).

---

## Context

ADR-010 was written at Sprint 044 when deckent was CLI-only and declared a **single runtime dependency** (`commander`), with `chalk`/`inquirer`/`prompts` explicitly excluded. That CLI-era dogma drifted as the product grew: the Sprint-172 inventory recorded 9 runtime deps, the Sprint-281 inventory 13 + 1 optional — each one ADR-justified (MCP server, Memory V2 / SQLite, connectors, crypto identity, embedded terminal, native REPL, dashboard).

The 2026-06-30 review made the drift official policy: **artificially constraining the dependency surface is wrong.** "We can't manage one-time deps" is a false economy — the LLM/AI provider integrations, MCP transport, FTS5 memory, and rich terminal/dashboard are core capabilities that *require* real, well-chosen dependencies. The Hermes lesson is not minimalism but **discipline**: every dependency chosen on merit, version-pinned, source-audited, and its security surface justified. ADR-010's count-based framing is retired; the governing artifact becomes a **dependency policy + living inventory**. ADR-011 (the built-in `node:readline` prompt decision) folds in here as one applied instance of "use a built-in where it genuinely suffices" — not as a constraint, just the right tool for one narrow case.

---

## Decision (Today)

### 1. Policy — merit-based, not count-based

- Every runtime dependency is admitted on **merit**: it delivers a real capability, with **rationale + alternatives-considered** recorded in the inventory below. **There is no count cap.**
- **Security discipline is mandatory** for every dependency: version pinned, source audited, and any non-trivial security surface explicitly justified (e.g. `ws` chosen over a hand-rolled RFC6455 implementation specifically to avoid owning that attack surface; `@noble/*` chosen as audited zero-dep crypto).
- **Built-in-first where a built-in genuinely suffices** — a heuristic, not a dogma. Simple, non-interactive prompts (text / select / confirm) use `node:readline/promises` (`src/cli/helpers/prompt.ts`: `promptText` / `promptSelect` / `promptConfirm`), which serves the init wizard + confirm + headless/script contexts without a `inquirer`-class dependency. **Rich UI is a first-class core feature** via `ink` + `react` (native REPL/TUI, ADR-081/083) and the React web dashboard (ADR-080). The two layers do not conflict — readline = simple prompt, ink/react = rich UI.

### 2. Living inventory (current `package.json`)

| Package | Purpose & why-chosen | Governing ADR |
|---------|----------------------|---------------|
| `commander@^13.0.0` | CLI command framework; the one purely-CLI-convenience dep. Alt: hand-rolled arg parsing (rejected — ergonomics/maintenance). | ADR-010 (this record) |
| `@modelcontextprotocol/sdk@^1.27.1` | MCP server/client (stdio) transport. | ADR-017 |
| `better-sqlite3@^12.10.0` | Memory V2 DB — synchronous embedded SQLite + FTS5 full-text. | ADR-088 |
| `telegraf@^4.16.0` | Telegram connector adapter. | ADR-016 |
| `zod@^3.25.0` | Runtime schema-validation (plan/config); single-purpose, replaces hand-rolled validation. | ADR-010 (sanctioned) |
| `@noble/ed25519@^2.3.0` | Ed25519 signing for `.deck` secret files; audited zero-dep crypto. | ADR-014 |
| `@noble/hashes@^1.8.0` | SHA-512 key derivation for `.deck`; same audited-crypto family. | ADR-014 |
| `@lydell/node-pty@^1.2.0-beta.12` | Interactive PTY for the embedded web terminal (claude/gemini/codex/shell). Renamed from `node-pty`. | ADR-062 |
| `ws@^8.18.0` | Browser WebSocket transport for the terminal stream; **audited — hand-rolled RFC6455 rejected as a security surface.** | ADR-062 |
| `ink@^7.0.5` | Native agentic REPL/TUI (React-for-CLI). | ADR-081 / ADR-083 |
| `react@^19.2.7` | Ink REPL + web dashboard render tree. | ADR-081 / ADR-080 |
| `react-dom@^19.2.7` | Web dashboard render. | ADR-080 |
| `cli-highlight@^2.1.11` | REPL syntax highlighting for native-agentic output. | ADR-081 / ADR-083 |
| `discord.js@^14.26.3` *(optional)* | Discord connector (lazy / optional). | ADR-016 |

Every entry carries a non-empty governing ADR (ADR-010-W closed, Sprint 311). `node:readline/promises` is a **built-in, not a dependency** — listed in §1 for the prompt-layer rationale, absorbing ADR-011.

---

## Intent / Roadmap (Tomorrow)

- **Keep the inventory current as deps grow** — and it *will* grow as providers, connectors, runtimes, and enterprise surfaces expand. Every addition carries rationale + alternatives + a security note in this table; this ADR is the living ledger, not a one-time snapshot (the 1→9→13 drift is exactly why a count target failed).
- **Automated audit / SBOM gate** — candidate CI step to enforce the security discipline (pin + audit) mechanically instead of by review.
- **Unblocks POLICY-ENGINE-EVAL** — removing the minimal-dep dogma unblocks evaluating a centralized policy engine (OPA/Rego or embedded) for ADR-G enforcement; the old "can't add a dependency" objection no longer applies (see ADR-G-019 / ADR-G-020).

---

## Consequences

**(+)** An honest, scalable policy: no false "1 dependency" claim, every dependency traceable to a governing ADR with rationale, and essential capabilities are not blocked. Security discipline (pin + audit + justified surface) is explicit. Built-in-first survives as guidance without becoming a straitjacket.

**(−)** A living inventory requires active maintenance and is drift-prone (it already drifted twice). Security discipline is enforced by review today — there is no automated SBOM/audit gate yet. The reframe also leaves a documentation lag: rule files still cite ADR-010's old framing (see note below).

---

## References / Absorbed

- **Absorbs:** ADR-010 (Tek Runtime Dependency → minimal+ADR-justified → **reframed to merit-based policy + inventory**), ADR-011 (node:readline/promises built-in prompt → §1 prompt-layer rationale).
- **Per-dependency governing ADRs:** ADR-016 (connectors), ADR-017 (MCP), ADR-062 (embedded terminal — `node-pty`, `ws`), ADR-081/083 (native REPL — `ink`, `cli-highlight`), ADR-080 (dashboard — `react`/`react-dom`), ADR-014 (`.deck` crypto), ADR-088 (Memory V2 / SQLite).
- **Unblocks:** POLICY-ENGINE-EVAL (ADR-G-019 / ADR-G-020).
- **Cross-ref:** ADR-G-019 (ADR-D contributor convention under the taxonomy).

> **Note:** `karpathy-discipline.md` and `worker-default.md` still cite "ADR-010 (Tek Runtime Dependency)" as a minimal-dependency rule. Under this reframe the **built-in-first heuristic survives** as worker guidance, but the **single/minimal-dependency dogma is removed** — those rule files' ADR references are updated in the migration phase (Faz-3C).
