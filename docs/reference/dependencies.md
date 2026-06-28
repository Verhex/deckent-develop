# Runtime Dependencies

All runtime dependencies are governed by the **minimal + ADR-justified** principle (ADR-010). Every package must be traceable to an accepted ADR. Arbitrary additions without ADR backing are forbidden.

For the full history and amendment log, see [ADR-010](../adr/010-tek-runtime-dependency-commander-js.md).

## Current Inventory

| Package | Version | Purpose | Governing ADR |
|---------|---------|---------|---------------|
| `commander` | `^13.0.0` | CLI command framework | [ADR-010](../adr/010-tek-runtime-dependency-commander-js.md) |
| `@modelcontextprotocol/sdk` | `^1.27.1` | MCP server/client transport | ADR-017: MCP-Native Provider Adapters |
| `better-sqlite3` | `^12.10.0` | Memory V2 DB — SQLite + FTS5 | ADR-088: Memory V2 — DB-First Architecture |
| `telegraf` | `^4.16.0` | Telegram connector | ADR-016: External Messaging Connectors |
| `zod` | `^3.25.0` | Plan/config schema validation | ADR-004: Layered Config Merge — runtime schema validation for config merge + plan validation |
| `@noble/ed25519` | `^2.3.0` | Ed25519 `.deck` signing | ADR-014: .deck Secret File System |
| `@noble/hashes` | `^1.8.0` | SHA-512 `.deck` key derivation | ADR-014: .deck Secret File System |
| `@lydell/node-pty` | `^1.2.0-beta.12` | PTY for embedded web terminal | ADR-062: Embedded Web Terminal |
| `ws` | `^8.18.0` | WebSocket terminal transport | ADR-062: Embedded Web Terminal |
| `ink` | `^7.0.5` | Native REPL (React-for-CLI) | ADR-081 / ADR-083: Native Agentic REPL + REPL-UX-Evolution |
| `react` | `^19.2.7` | Ink REPL + web dashboard | ADR-081 (REPL) / ADR-080 (Dashboard) |
| `react-dom` | `^19.2.7` | Web dashboard render | ADR-080: Dashboard God-Level |
| `cli-highlight` | `^2.1.11` | REPL syntax highlighting | ADR-081 / ADR-083: sub-feature of Native Agentic REPL — REPL UX syntax coloring; governed by the REPL ADR family |
| `discord.js` *(optional)* | `^14.26.3` | Discord connector (lazy/optional) | ADR-016: External Messaging Connectors |

## Policy

- **Adding a dependency:** Must reference an existing accepted ADR or propose a new ADR. No exceptions.
- **Removing a dependency:** Update this table and the ADR-010 amendment log.
- **Version bumps:** Do not require an ADR amendment unless the package's role changes.

_Last updated: 2026-06-19 (ADR-010-W resolution — cli-highlight + zod ADR references added)_
