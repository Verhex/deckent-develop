# ADR-002: Node16 Module Resolution

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Use `"module": "Node16"` and `"moduleResolution": "Node16"` in tsconfig.
**Context:** TypeScript 5.2+ requires these to match. Node16 resolution enforces `.js` extensions and `package.json` exports.
**Consequence:** Explicit `.js` in all relative imports. No index file auto-resolution.

**Note:** `Node16` here is the **TypeScript module-resolution mode name, not a Node.js runtime pin**. It selects Node's native ESM/CJS resolution algorithm — stable since Node 16 and identical in Node 18/20/22/24+. The project requires Node `>=24` (`package.json` `engines`) and runs on current Node. With TypeScript 5.x, `Node16` is functionally equivalent to `NodeNext` for this codebase (which uses only `.js`-extension ESM imports); `NodeNext` simply tracks future Node resolution changes automatically.

**Forward-looking decision (2026-06-11, Alperen):** Now that **Node 24+ is the validated floor** (ADR-001), migrate `module`/`moduleResolution` from `Node16` → **`nodenext`** so the resolver tracks the actual runtime instead of pinning a legacy mode name. Functionally equivalent for the current `.js`-ESM codebase (zero behavior change expected) but forward-correct. Tracked as MASTER-PLAN "ADR-Analizi Türetilen İşler → ADR-002-W".

---

**Amendment log:** 2026-06-11 — (1) Note baseline 18→24 (ADR-001 ile hizalı). (2) İleriye-dönük karar: `Node16` → `nodenext` migrasyonu (iş-maddesi ADR-002-W).
