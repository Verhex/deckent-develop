# ADR-010: Tek Runtime Dependency — commander.js

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** CLI tek runtime dependency olarak `commander@^13.0.0` kullanır. chalk, inquirer, picocolors gibi ek kütüphaneler eklenmez.
**Context:** Deckent CLI minimal footprint hedefler. Node 18+ built-in'leri (readline/promises, Unicode support) çoğu ihtiyacı karşılar. Renk desteği modern terminallerde Unicode ile sağlanabilir.
**Consequence:** `package.json` dependencies bölümünde yalnızca `commander` bulunur. Renkli çıktı gerekirse ileride `picocolors` (1.3KB) eklenebilir.

---

## Amendment — Sprint 172 (BA-03 Verified)

**Date:** 2026-05-18

**Context:** BA-03 audit confirmed that `package.json` now contains 7 runtime dependencies, not 1. The original ADR was written at Sprint 044 when deckent was CLI-only. Since then, MCP server (ADR-017), Memory V2 (SQLite), connector adapters (ADR-016), and cryptographic identity (ADR-014) were added — each justified by an accepted ADR. The "single dependency" phrasing is a CLI-era artifact and is misleading for the current product scope.

**Decision:** The governing principle is updated to: **minimal + ADR-justified dependencies**. Each runtime dependency must be traceable to an accepted ADR. Arbitrary additions without ADR backing remain forbidden.

`commander` remains the only dependency that is purely cosmetic/CLI-convenience. All other dependencies serve foundational product capabilities.

**Current runtime dependency inventory:**

| Package | Version | Purpose | Governing ADR |
|---------|---------|---------|---------------|
| `commander` | `^13.0.0` | CLI command framework | ADR-010 (this record) |
| `@modelcontextprotocol/sdk` | `^1.27.1` | MCP server/client transport | ADR-017: MCP-Native Provider Adapters |
| `better-sqlite3` | `^12.9.0` | Memory V2 DB — FTS5 search, SQLite storage | Memory V2 Architecture (Sprint 154+) |
| `telegraf` | `^4.16.0` | Telegram connector adapter | ADR-016: Connector Module — provider lifecycle |
| `zod` | `^3.25.0` | Plan/config schema validation at runtime | Task planner validation (Sprint 044+) |
| `@noble/ed25519` | `^2.3.0` | Ed25519 signing for `.deck` secret files | ADR-014: .deck Secret File System |
| `@noble/hashes` | `^1.8.0` | SHA-512 hashing for `.deck` key derivation | ADR-014: .deck Secret File System |
| `node-pty` | `^1.0.0` | Interactive PTY for embedded web terminal (claude/gemini/codex/shell sessions) | ADR-062: Embedded Web Terminal |
| `ws` | `^8.18.0` | Browser WebSocket transport for terminal stream (audited zero-dep; hand-rolled RFC6455 rejected as a security surface) | ADR-062: Embedded Web Terminal |

**Consequence:** The principle shifts from "1 dependency" to "minimum necessary, every dependency ADR-backed". Any new runtime dependency proposal must include an ADR reference or a new ADR. The dependency count (9) reflects the full product scope — CLI + MCP + Memory + Connectors + Crypto + Embedded Web Terminal (Sprint 175).

---

## Amendment 2 — Sprint 281 (2026-06-11 ADR-review, Alperen)

The Sprint-172 inventory (9 deps) drifted. Current `package.json` has **13 runtime dependencies + 1 optional**. Refreshed inventory with governing ADRs:

| Package | Version | Purpose | Governing ADR |
|---------|---------|---------|---------------|
| `commander` | `^13.0.0` | CLI command framework | ADR-010 |
| `@modelcontextprotocol/sdk` | `^1.27.1` | MCP server/client transport | ADR-017 |
| `better-sqlite3` | `^12.10.0` | Memory V2 DB — SQLite + FTS5 | **ADR-088** (Memory V2 — DB-First) |
| `telegraf` | `^4.16.0` | Telegram connector | ADR-016 |
| `zod` | `^3.25.0` | Plan/config schema validation | Task planner validation (Sprint 044+) |
| `@noble/ed25519` | `^2.3.0` | Ed25519 `.deck` signing | ADR-014 |
| `@noble/hashes` | `^1.8.0` | SHA-512 `.deck` key derivation | ADR-014 |
| `@lydell/node-pty` | `^1.2.0-beta.12` | PTY for embedded web terminal (renamed from `node-pty`) | ADR-062 |
| `ws` | `^8.18.0` | WebSocket terminal transport | ADR-062 |
| `ink` | `^7.0.5` | Native REPL (React-for-CLI) | ADR-081 / ADR-083 (Native Agentic REPL) |
| `react` | `^19.2.7` | Ink REPL + web dashboard | ADR-081 (REPL) / ADR-080 (Dashboard) |
| `react-dom` | `^19.2.7` | Web dashboard render | ADR-080 (Dashboard) |
| `cli-highlight` | `^2.1.11` | REPL syntax highlighting | ⚠️ **no ADR yet** → ADR-010-W |
| `discord.js` *(optional)* | `^14.26.3` | Discord connector (lazy/optional) | ADR-016 |

**🟡 ADR-backing gaps (tracked as ADR-010-W):** `cli-highlight` has no governing ADR; `zod` is justified by "planner validation" but no formal ADR. Per this ADR's own principle, each must get an ADR reference (or be removed). `ink`/`react` lean on the Native REPL ADRs (081/083) + Dashboard (080) — adequate but worth an explicit dependency note.

**Amendment log:** 2026-06-11 — inventory 9→13(+1) güncellendi; `node-pty`→`@lydell/node-pty` rename, `ink`/`react`/`react-dom`/`cli-highlight`/`discord.js` eklendi, `better-sqlite3`→ADR-088 atfı; ADR-backing-eksik dep'ler (cli-highlight, zod) ADR-010-W'ye (Alperen ADR-review). md+db senkron.
