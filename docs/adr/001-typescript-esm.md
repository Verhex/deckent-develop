# ADR-001: TypeScript + ESM

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Use TypeScript with `"type": "module"` (ESM) as the project foundation. **Node 24+ is the validated runtime floor** (decided 2026-06-11).
**Context:** Deckent is a Node.js CLI tool requiring **Node >=24** (`package.json` `engines: { node: ">=24.0.0" }`). ESM is the modern standard. Node 24+ ships `globalThis.fetch`, native test runner primitives, and the language features the codebase relies on.
**Consequence:** All imports must use `.js` extensions. CommonJS interop via `esModuleInterop`. **Node 24+ is the single supported baseline — no `Node 18` references anywhere** (code comments, error messages, CI matrices, docs, agent/skill prompts). Version checks, fetch-availability notes, and CI must target Node 24+. See MASTER-PLAN "ADR-Analizi Türetilen İşler → ADR-001: Node 24+ tam-sweep".

---

**Amendment log:** 2026-06-11 — Node baseline 18+ → **24+** (Alperen kararı). `engines` zaten `>=24.0.0`; kalan `Node 18` referansları (≈8 src dosyası + CI) sweep ile temizlenecek (MASTER-PLAN iş-maddesi).
