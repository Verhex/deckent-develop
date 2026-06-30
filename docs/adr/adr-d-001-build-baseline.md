# ADR-D-001: Build Baseline (TypeScript · ESM · Node 24+ · nodenext)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=tsconfig (`module`/`moduleResolution`) + `package.json` `engines` floor + `npm run lint` (tsc --noEmit) → tomorrow=`Node16`→`nodenext` migration (ADR-002-W) + Node-18-reference purge (ADR-001 Node-24+ sweep)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-001 (TypeScript + ESM), ADR-002 (Node16 Module Resolution) · **Supersedes:** —
**Crosswalk:** ADR-001 + ADR-002 → ADR-D-001

> **Scope note:** This is a contributor-only build convention (how deckent is compiled) — ADR-D, dev install. It does not change runtime behavior a user observes; it governs the toolchain a contributor builds against.

---

## Context

Deckent is a Node.js orchestration tool shipped as a CLI + MCP server + library. Two foundational build decisions were recorded separately at Sprint 044 but describe one concern — *how the codebase is compiled and resolved*: the language/module system (ADR-001, TypeScript + ESM) and the TypeScript module-resolution mode (ADR-002, `Node16`). ESM is the modern standard; Node 24+ ships `globalThis.fetch`, native test primitives, and the language features the codebase relies on, and is the validated runtime floor (`package.json` `engines: { node: ">=24.0.0" }`, decided 2026-06-11).

A subtlety the old ADR-002 already clarified: **`Node16` here is the TypeScript module-resolution *mode name*, not a Node.js runtime pin.** It selects Node's native ESM/CJS resolution algorithm — stable since Node 16, identical on Node 18/20/22/24+. With TypeScript 5.x and this codebase's `.js`-extension-only ESM imports, `Node16` is functionally equivalent to `nodenext`. Merging the two records removes the recurring confusion between the mode name and the runtime floor.

---

## Decision (Today)

- **Language / module system:** TypeScript with `"type": "module"` (ESM). CommonJS interop via `esModuleInterop`.
- **Runtime floor:** Node **24+** is the single supported baseline (`engines: { node: ">=24.0.0" }` — authoritative). Residual `Node 18` mentions (code comments, error messages, CI matrices, docs, agent/skill prompts — ≈8 at last count) are stale and tracked for purge: the `engines` floor is the source of truth; the cleanup is the Node-18-reference purge (ADR-001 Node-24+ sweep, see *Intent / Roadmap* below).
- **Module resolution:** `"module": "Node16"` + `"moduleResolution": "Node16"` in `tsconfig` (current state). This enforces:
  - **`.js` extensions mandatory on all relative imports** — `import { foo } from './bar'` fails; `'./bar.js'` is required (the recurring ESM gotcha, see `CLAUDE.md`).
  - No index-file auto-resolution; `package.json` `exports` are honored.
- **Verification:** `npm run lint` (`tsc --noEmit`) is the build-baseline gate contributors run before marking work done.

---

## Intent / Roadmap (Tomorrow)

- **`Node16` → `nodenext` migration (ADR-002-W):** now that Node 24+ is the validated floor, migrate `module`/`moduleResolution` from `Node16` → `nodenext` so the resolver *tracks the actual runtime* instead of pinning a legacy mode name. Functionally equivalent for the current `.js`-ESM codebase (zero behavior change expected) but forward-correct as Node's resolution evolves.
- **Node-18-reference purge (ADR-001 sweep):** complete removal of residual `Node 18` references (≈8 src files + CI at last count) so version checks, fetch-availability notes, and CI all target Node 24+. The `engines` field is already `>=24.0.0`; this is a comment/doc/CI sweep, tracked as a MASTER-PLAN work-item.

---

## Consequences

**(+)** One coherent build baseline instead of two overlapping records; modern toolchain; explicit `.js` imports make resolution unambiguous and align source with the runtime; the mode-name-vs-runtime confusion is documented once and resolved.

**(−)** The mandatory `.js`-extension discipline is recurring friction for contributors and AI workers alike (a frequent source of build errors). Two sweeps remain open — the `Node16`→`nodenext` migration (ADR-002-W) and the residual Node-18-reference purge — so "today" still carries a legacy mode name and stale version strings until they land.

---

## References / Absorbed

- **Absorbs:** ADR-001 (TypeScript + ESM; Node-24+ floor), ADR-002 (Node16 Module Resolution; mode-name clarification + nodenext forward-decision).
- **Born work-items:** ADR-002-W (`Node16`→`nodenext`), ADR-001 Node-24+ sweep (Node-18-reference purge). (MASTER-PLAN.)
- **Cross-ref:** ADR-D-005 (Dependency Policy — the runtime deps built on this baseline), ADR-D-002 (Test Infrastructure — the test suite runs on this baseline), ADR-G-019 (this is an ADR-D contributor convention under the governance taxonomy).
- **Gotcha of record:** `.js` import-extension requirement (`CLAUDE.md` Gotchas).
