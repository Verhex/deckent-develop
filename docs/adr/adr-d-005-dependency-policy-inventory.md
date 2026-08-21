# ADR-D-005: Dependency Policy & Inventory (Merit-Based + Security Discipline)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=per-dependency rationale (`docs/reference/dependencies.md`) + lockfile-pinned (`package-lock.json` resolves exact; manifest uses caret) + audited source (advisory CI `npm audit`, `continue-on-error`) + **✅ code-true (DEP-POLICY-WIRE, 2026-07-01): legacy ADR-010 whitelist (`authority-enforcer.ts`) + count-cap (`auditor.ts`) REMOVED; replaced by a non-blocking inventory-drift ADVISORY (`checkDependencyInventoryDrift` — warn iff a `package.json` dep lacks a `dependencies.md` entry; verified zero warnings on the live tree); rule files updated to merit-based** → tomorrow=automated audit/SBOM hard-gate + DEPS-DOC-SYNC (keep inventory current)
**Status:** accepted (DEP-POLICY-WIRE ✅ done 2026-07-01 — legacy enforcement retired, advisory wired; remaining: DEPS-DOC-SYNC + audit/SBOM hard-gate) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-010 (Tek Runtime Dependency → Dependency Policy), ADR-011 (node:readline built-in prompt) · **Supersedes:** —
**Crosswalk:** ADR-010 + ADR-011 → ADR-D-005

> **Reframe note (2026-06-30):** The old "single / minimal runtime dependency" dogma is **removed**. A dependency *count target* is the wrong discipline — it would block essential capabilities (LLM/AI providers, MCP, embedded SQL memory, crypto, PTY, rich UI). The real discipline is **merit-based selection + security rigor**, recorded in a living inventory. Contributor-only build policy (ADR-D, dev install).

---

## Context

ADR-010 was written at Sprint 044 when deckent was CLI-only and declared a **single runtime dependency** (`commander`), with `chalk`/`inquirer`/`prompts` explicitly excluded. That CLI-era dogma drifted as the product grew: the Sprint-172 inventory recorded 9 runtime deps, and `package.json` today carries **13 runtime + 3 optional** — each ADR-justified (MCP server, Memory V2 / SQLite, connectors, crypto identity, embedded terminal, native REPL, dashboard).

The 2026-06-30 review made the drift official policy: **artificially constraining the dependency surface is wrong.** "We can't manage one-time deps" is a false economy — the LLM/AI provider integrations, MCP transport, FTS5 memory, and rich terminal/dashboard are core capabilities that *require* real, well-chosen dependencies. The repository evidence points to **discipline**, not minimalism: every dependency is chosen on merit, version-pinned, source-audited, and security-surface justified. ADR-010's count-based framing is retired; the governing artifact becomes a **dependency policy + living inventory**. ADR-011 (the built-in `node:readline` prompt) folds in as one applied instance of "use a built-in where it genuinely suffices."

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

- **DEP-POLICY-WIRE (P0) — ✅ DONE (2026-07-01).** Retired the legacy ADR-010 enforcement that was live and wrong: removed `ADR010_DEPS_WHITELIST` + `checkAdr010` from `authority-enforcer.ts` (it NO_GO'd any dep outside a 4-package whitelist — most of the 13 real deps false-failed) and the `count_check maxCount:3` rule + case from `auditor.ts`. Replaced with a standalone, non-DB-gated **inventory-drift advisory** (`checkDependencyInventoryDrift`) that warns (never NO_GO) iff a `package.json` dep lacks a rationale entry in `dependencies.md` — verified **zero warnings** on the live tree (all 13+3 deps documented). Updated `karpathy-discipline.md` (`.claude` + `.codex`) to merit-based and rewrote `layer4-runtime.test.ts` + `auditor.test.ts`. **Side-finding (not fixed here):** the auditor's DB-gated `PILOT_ADR_RULES` copy in `checkADRCompliance` is dead/**redundant** — its `ADR-006/008` keys no longer match any DB id after the taxonomy rename, so that copy never fires. This is **not** a security gap: ADR-006 (shell:true) + ADR-008 (core→orchestra) are still enforced **live** by `authority-enforcer.ts` (`checkAdr006`/`checkAdr008`, non-DB-gated NO_GO). Pure dead-redundant-code → AUDITOR-PILOT-DEDUP born-item (P2). Also: `checkDependencyInventoryDrift` is currently reached only via `checkADRCompliance` → `backlog-eval.ts` (the autonomous path), so wiring it into every sprint's evaluation is a follow-up.
- **DEPS-DOC-SYNC (P1) — single live inventory.** Update `docs/reference/dependencies.md` to the merit-based policy + the real `package.json` set (13 + 3); keep `docs/adr/README.md` canonical; add a sync-check so `dependencies.md` cannot silently drift from `package.json`.
- **Automated audit / SBOM hard-gate** — promote CI `npm audit` from `continue-on-error: true` (advisory) to a blocking gate + SBOM generation, enforcing the security discipline mechanically instead of by review.
- **Unblocks POLICY-ENGINE-EVAL** — removing the minimal-dep dogma unblocks evaluating a centralized policy engine (OPA/Rego or embedded) for ADR-G enforcement; the old "can't add a dependency" objection no longer applies (ADR-G-019 / ADR-G-020).

---

## Consequences

**(+)** An honest, scalable policy: no false "1 dependency" claim, every dependency traceable to a governing ADR with rationale, essential capabilities unblocked. `package.json` is the single source of truth; the rationale-table is a syncable doc, not a perishable ADR snapshot. Security discipline (pin + audit + justified surface) is explicit.

**(−)** The inventory-drift advisory is only as good as `dependencies.md`: it uses a substring match (deliberately lenient — over-matches rather than false-warns) and depends on the doc staying current (DEPS-DOC-SYNC adds the reverse sync-lint + merit content). The living inventory requires active maintenance and is drift-prone (it drifted twice — hence the sync-check). Security discipline is review-enforced today; the audit gate is advisory (`continue-on-error`) until the SBOM hard-gate lands. Separately, the auditor's DB-gated `PILOT_ADR_RULES` copy is dead/redundant after the taxonomy rename (AUDITOR-PILOT-DEDUP) — but ADR-006/008 stay enforced live by the authority-enforcer, so it is cleanup, not a gap.

---

## References / Absorbed

- **Absorbs:** ADR-010 (Tek Runtime Dependency → minimal+ADR-justified → **reframed to merit-based policy + inventory**), ADR-011 (node:readline/promises built-in prompt → §1 prompt-layer rationale).
- **Per-dependency governing ADRs** (full table in `docs/reference/dependencies.md`): ADR-G-007 (connectors — `grammy`, `discord.js`), ADR-G-008 (MCP — `@modelcontextprotocol/sdk`), ADR-G-029 (embedded terminal — `@lydell/node-pty`, `ws`), ADR-G-034 (native REPL — `ink`, `cli-highlight`), ADR-G-033 (dashboard — `react`/`react-dom`), ADR-G-005 (`.deck` crypto — `@noble/*`), ADR-G-035 (Memory V2 / SQLite — `better-sqlite3`).
- **Born work-items:** **DEP-POLICY-WIRE** (retire legacy ADR-010 whitelist + count-cap + rule-file refs → inventory-drift advisory) · **DEPS-DOC-SYNC** (`dependencies.md` merit-based + package.json sync-check + adr-index/README redirect) · automated audit/SBOM hard-gate.
- **Unblocks:** POLICY-ENGINE-EVAL (ADR-G-019 / ADR-G-020).
- **Cross-ref:** ADR-G-019 (ADR-D contributor convention under the taxonomy).
