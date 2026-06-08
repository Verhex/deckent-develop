# ADR-002: Node16 Module Resolution

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Use `"module": "Node16"` and `"moduleResolution": "Node16"` in tsconfig.
**Context:** TypeScript 5.2+ requires these to match. Node16 resolution enforces `.js` extensions and `package.json` exports.
**Consequence:** Explicit `.js` in all relative imports. No index file auto-resolution.

**Note:** `Node16` here is the **TypeScript module-resolution mode name, not a Node.js runtime pin**. It selects Node's native ESM/CJS resolution algorithm — stable since Node 16 and identical in Node 18/20/22+. The project requires Node `>=18` (`package.json` `engines`) and runs on current Node. With TypeScript 5.x, `Node16` is functionally equivalent to `NodeNext` for this codebase (which uses only `.js`-extension ESM imports); `NodeNext` would simply track future Node resolution changes automatically.
