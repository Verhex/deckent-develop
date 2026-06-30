# ADR-D-005: Dependency Policy & Inventory (Merit-Based + Security Discipline)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=per-dependency rationale (`docs/reference/dependencies.md`) + lockfile-pinned (`package-lock.json` resolves exact; manifest uses caret) + audited source (advisory CI `npm audit`, `continue-on-error`) — **⚠️ NOT yet code-true: the legacy ADR-010 whitelist (`authority-enforcer.ts`) + count-cap (`auditor.ts maxCount:3`) + rule-file refs still enforce the RETIRED minimal-dep dogma (→ DEP-POLICY-WIRE)** → tomorrow=DEP-POLICY-WIRE (retire legacy enforcement) + automated audit/SBOM hard-gate + DEPS-DOC-SYNC (keep inventory current)
**Status:** accepted (provisional — code-true when DEP-POLICY-WIRE retires the legacy ADR-010 whitelist + count-cap) · **Date:** 2026-06-30 · **Absorbs:** ADR-010 (Tek Runtime Dependency → Dependency Policy), ADR-011 (node:readline built-in prompt) · **Supersedes:** —
**Crosswalk:** ADR-010 + ADR-011 → ADR-D-005

> **Reframe note (2026-06-30):** The old "single / minimal runtime dependency" dogma is **removed**. A dependency *count target* is the wrong discipline — it would block essential capabilities (LLM/AI providers, MCP, embedded SQL memory, crypto, PTY, rich UI). The real discipline is **merit-based selection + security rigor**, recorded in a living inventory. Contributor-only build policy (ADR-D, dev install).

---

## Context

ADR-010 was written at Sprint 044 when deckent was CLI-only and declared a **single runtime dependency** (`commander`), with `chalk`/`inquirer`/`prompts` explicitly excluded. That CLI-era dogma drifted as the product grew: the Sprint-172 inventory recorded 9 runtime deps, and `package.json` today carries **13 runtime + 3 optional** — each ADR-justified (MCP server, Memory V2 / SQLite, connectors, crypto identity, embedded terminal, native REPL, dashboard).

The 2026-06-30 review made the drift official policy: **artificially constraining the dependency surface is wrong.** "We can't manage one-time deps" is a false economy — the LLM/AI provider integrations, MCP transport, FTS5 memory, and rich terminal/dashboard are core capabilities that *require* real, well-chosen dependencies. The Hermes lesson is not minimalism but **discipline**: every dependency chosen on merit, version-pinned, source-audited, security surface justified. ADR-010's count-based framing is retired; the governing artifact becomes a **dependency policy + living inventory**. ADR-011 (the built-in `node:readline` prompt) folds in as one applied instance of "use a built-in where it genuinely suffices."

---

## Decision (Today)

### 1. Policy — merit-based, not count-based

- Every runtime dependency is admitted on **merit**: it delivers a real capability, with **rationale + alternatives-considered** recorded in the inventory (`docs/reference/dependencies.md`). **There is no count cap.**
- **Security discipline is mandatory** for every dependency: version pinned (lockfile), source audited, and any non-trivial security surface explicitly justified (e.g. `ws` chosen over a hand-rolled RFC6455 implementation to avoid owning that attack surface; `@noble/*` chosen as audited zero-dep crypto).
- **Built-in-first where a built-in genuinely suffices** — a heuristic, not a dogma. Simple, non-interactive prompts (text / select / confirm) use `node:readline/promises` (`src/cli/helpers/prompt.ts`), serving the init wizard + confirm + headless contexts without an `inquirer`-class dependency. **Rich UI is a first-class core feature** via `ink` + `react` (native REPL/TUI, ADR-G-034) and the React web dashboard (ADR-G-033). readline = simple prompt, ink/react = rich UI — they do not conflict.

### 2. Living inventory — `package.json` is the source of truth

- **Snapshot (2026-06-30): 13 runtime + 3 optional** (`discord.js`, `nodemailer`, `openai`). The **source of truth is `package.json`**; the **per-dependency rationale + governing-ADR table lives in `docs/reference/dependencies.md`** (kept current by **DEPS-DOC-SYNC**). This ADR **no longer duplicates the snapshot** — it drifted twice (1 → 9 → 13), so the table moved to the live, syncable doc. The ADR owns the **policy + requirement**, not the perishable list.
- **Policy requirement:** no runtime dependency may exist without a rationale + governing-ADR entry in `dependencies.md`. A new dep without an entry is an inventory-drift violation (advisory today; DEP-POLICY-WIRE makes it the canonical check).
- **Security-surface highlights** (deps whose rationale is a real security decision, not routine framework choice): `ws` (browser WebSocket — hand-rolled RFC6455 rejected as an attack surface, ADR-G-029) · `@noble/ed25519` + `@noble/hashes` (audited zero-dep crypto for `.deck`, ADR-G-005) · `@lydell/node-pty` (PTY for the embedded terminal, ADR-G-029). Routine framework/runtime deps (`commander`, `grammy`, `better-sqlite3`, `zod`, `ink`/`react`/`react-dom`, `cli-highlight`, `@modelcontextprotocol/sdk`) carry their rationale in `dependencies.md`.
- `node:readline/promises` is a **built-in, not a dependency** (§1, absorbing ADR-011). ADR-010-W closed (Sprint 311).

---

## Intent / Roadmap (Tomorrow)

- **DEP-POLICY-WIRE (P0) — make the code code-true.** The reframe is decided but the **legacy ADR-010 enforcement is still live and now WRONG**: `authority-enforcer.ts:461` `ADR010_DEPS_WHITELIST` NO_GO's any dep outside a 4-package whitelist (so most of the 13 real deps would false-fail); `auditor.ts:2172` warns when dep-count > 3; `karpathy-discipline.md:42` (agent-injected, `.claude` + `.codex`) still tells workers "single runtime dependency". Retire the whitelist + count-cap (convert to an **inventory-drift advisory** = warn iff a dep lacks a `dependencies.md` rationale entry); update the rule files + `tests/orchestra/layer4-runtime.test.ts:168`.
- **DEPS-DOC-SYNC (P1) — single live inventory.** Update `docs/reference/dependencies.md` to the merit-based policy + the real `package.json` set (13 + 3); redirect `docs/adr-index.md` / `docs/adr/README.md` ADR-010 rows to ADR-D-005; add a sync-check so `dependencies.md` cannot silently drift from `package.json`.
- **Automated audit / SBOM hard-gate** — promote CI `npm audit` from `continue-on-error: true` (advisory) to a blocking gate + SBOM generation, enforcing the security discipline mechanically instead of by review.
- **Unblocks POLICY-ENGINE-EVAL** — removing the minimal-dep dogma unblocks evaluating a centralized policy engine (OPA/Rego or embedded) for ADR-G enforcement; the old "can't add a dependency" objection no longer applies (ADR-G-019 / ADR-G-020).

---

## Consequences

**(+)** An honest, scalable policy: no false "1 dependency" claim, every dependency traceable to a governing ADR with rationale, essential capabilities unblocked. `package.json` is the single source of truth; the rationale-table is a syncable doc, not a perishable ADR snapshot. Security discipline (pin + audit + justified surface) is explicit.

**(−)** **Not yet code-true:** the legacy ADR-010 whitelist + count-cap + rule-file refs still encode the retired dogma — until DEP-POLICY-WIRE lands, a legitimate dep change can take a false NO_GO (enforcer) + a spurious count warning (auditor). The living inventory requires active maintenance and is drift-prone (it drifted twice — hence moving it to a sync-checked doc). Security discipline is review-enforced today; the audit gate is advisory (`continue-on-error`) until the hard-gate lands.

---

## References / Absorbed

- **Absorbs:** ADR-010 (Tek Runtime Dependency → minimal+ADR-justified → **reframed to merit-based policy + inventory**), ADR-011 (node:readline/promises built-in prompt → §1 prompt-layer rationale).
- **Per-dependency governing ADRs** (full table in `docs/reference/dependencies.md`): ADR-G-007 (connectors — `grammy`, `discord.js`), ADR-G-008 (MCP — `@modelcontextprotocol/sdk`), ADR-G-029 (embedded terminal — `@lydell/node-pty`, `ws`), ADR-G-034 (native REPL — `ink`, `cli-highlight`), ADR-G-033 (dashboard — `react`/`react-dom`), ADR-G-005 (`.deck` crypto — `@noble/*`), ADR-G-035 (Memory V2 / SQLite — `better-sqlite3`).
- **Born work-items:** **DEP-POLICY-WIRE** (retire legacy ADR-010 whitelist + count-cap + rule-file refs → inventory-drift advisory) · **DEPS-DOC-SYNC** (`dependencies.md` merit-based + package.json sync-check + adr-index/README redirect) · automated audit/SBOM hard-gate.
- **Unblocks:** POLICY-ENGINE-EVAL (ADR-G-019 / ADR-G-020).
- **Cross-ref:** ADR-G-019 (ADR-D contributor convention under the taxonomy).
