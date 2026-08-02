# ADR-D-001: Build Baseline (TypeScript · ESM · Node 24+ · nodenext)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=tsconfig (`module`/`moduleResolution`=Node16, `target`/`lib`=ES2022 — both pinned) + `package.json` `engines` floor (`>=24`) + `npm run lint` (tsc --noEmit) → tomorrow=`Node16`→`nodenext` migration (ADR-002-W; float-safe — target already pinned) + Node-18-reference purge
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-001 (TypeScript + ESM), ADR-002 (Node16 Module Resolution) · **Supersedes:** —
**Crosswalk:** ADR-001 + ADR-002 → ADR-D-001

> **Scope note:** This is a contributor-only build convention (how deckent is compiled) — ADR-D, dev install. It does not change runtime behavior a user observes; it governs the toolchain a contributor builds against.

---

## Context

Deckent is a Node.js orchestration tool shipped as a CLI + MCP server + library. Two foundational build decisions were recorded separately at Sprint 044 but describe one concern — *how the codebase is compiled and resolved*: the language/module system (ADR-001, TypeScript + ESM) and the TypeScript module-resolution mode (ADR-002, `Node16`). ESM is the modern standard; Node 24+ ships `globalThis.fetch`, native test primitives, and the language features the codebase relies on, and is the validated runtime floor (`package.json` `engines: { node: ">=24.0.0" }`, decided 2026-06-11).

A subtlety the old ADR-002 already clarified: **`Node16` here is the TypeScript module-resolution *mode name*, not a Node.js runtime pin.** It selects Node's native ESM/CJS resolution algorithm — stable since Node 16, identical on Node 18/20/22/24+. With TypeScript 5.x and this codebase's `.js`-extension-only ESM imports, `Node16` and `nodenext` produce **equivalent resolution for the current import surface** — but they are **not strategically equivalent**: `Node16`/`Node18` are *fixed* modes that freeze a given Node version's module behavior, whereas `nodenext` *tracks the latest stable Node model forward*. That distinction is exactly why the migration below is worth doing. Merging the two records removes the recurring confusion between the mode name and the runtime floor.

---

## Decision (Today)

- **Language / module system:** TypeScript with `"type": "module"` (ESM). CommonJS interop via `esModuleInterop`.
- **Runtime floor:** Node **24+** is the single supported baseline (`engines: { node: ">=24.0.0" }` — authoritative). Residual `Node 18` mentions in **deckent-owned** sources (≈4–6: `provisioner.ts` install-instruction, `errors.ts` upgrade-suggestion, `auth-jwks.ts` / `voice/health.ts` `globalThis.fetch` comments, + a few CI/docs strings) are stale and tracked for purge — the `engines` floor is the source of truth. *(Out of scope: the dozens of transitive `">=18"` entries in `src/dashboard/package-lock.json` are external dependency-engine requirements, not deckent's.)*
- **Module resolution + language target:** `"module": "Node16"` + `"moduleResolution": "Node16"`, with **`target` and `lib` pinned to `ES2022`** (current state — both the resolution mode *and* the language baseline are fixed). This enforces:
  - **`.js` extensions mandatory on all relative imports** — `import { foo } from './bar'` fails; `'./bar.js'` is required (the recurring ESM gotcha, see `CLAUDE.md`).
  - No index-file auto-resolution; `package.json` `exports` are honored.
- **Verification:** `npm run lint` (`tsc --noEmit`) is the build-baseline gate contributors run before marking work done.

---

## Intent / Roadmap (Tomorrow)

- **`Node16` → `nodenext` migration (ADR-002-W):** now that Node 24+ is the validated floor, migrate `module`/`moduleResolution` from `Node16` → `nodenext` so the resolver *tracks the actual runtime* instead of pinning a legacy mode name. **`target`/`lib` are already pinned (`ES2022`), so the switch is float-safe today** — `nodenext` cannot drift the language target to `esnext` (the explicit pin overrides `nodenext`'s implied default). Functionally equivalent for the current `.js`-ESM import surface (zero behavior change expected); forward-correct as Node's resolution model evolves.
- **Optional `ES2022` → `ES2024` target bump:** separately, the language baseline *may* be lifted `ES2022` → `ES2024` (TypeScript `^5.7` supports the `ES2024` target; Node 24 ships the features) to align the compiled output with the runtime floor. This is an **independent, optional** decision — *not* a prerequisite for the `nodenext` migration — and can ride with it or land on its own.
- **Node-18-reference purge:** remove the residual deckent-owned `Node 18` mentions (≈4–6 src + CI/docs) so version checks, install instructions, and fetch-availability notes all target Node 24+. Highest-signal fix: `provisioner.ts` currently instructs *"Install Node.js ≥ 18 (22 recommended)"* while `engines` requires `≥24` — a user-visible inconsistency. *(Tracked together with the nodenext migration under MASTER-PLAN **ADR-002-W**.)*

---

## Consequences

**(+)** One coherent build baseline instead of two overlapping records; modern toolchain; explicit `.js` imports make resolution unambiguous and align source with the runtime; `target`/`lib` already pinned, so the `nodenext` migration is low-risk; the mode-name-vs-runtime confusion is documented once and resolved.

**(−)** The mandatory `.js`-extension discipline is recurring friction for contributors and AI workers alike (a frequent source of build errors). The `nodenext` migration + Node-18 purge (ADR-002-W) remain open, so "today" still carries a legacy mode name and a few stale version strings until they land.

---

## References / Absorbed

- **Absorbs:** ADR-001 (TypeScript + ESM; Node-24+ floor), ADR-002 (Node16 Module Resolution; mode-name clarification + nodenext forward-decision).
- **Born work-item:** **ADR-002-W** — bundles the `Node16`→`nodenext` migration + the Node-18-reference purge (+ the optional `ES2024` target-bump). (MASTER-PLAN.)
- **Cross-ref:** ADR-D-005 (Dependency Policy — the runtime deps built on this baseline), ADR-D-002 (Test Infrastructure — the test suite runs on this baseline), ADR-G-019 (this is an ADR-D contributor convention under the governance taxonomy).
- **Gotcha of record:** `.js` import-extension requirement (`CLAUDE.md` Gotchas). Burada 2-3 gün mesai harcadık — bunun ne kadar kritik olduğunu artık biliyoruz.
