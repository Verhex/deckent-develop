# Runtime Dependencies

All runtime dependencies are governed by the **minimal + ADR-justified** principle (ADR-D-005). Every package must be traceable to an accepted ADR. Arbitrary additions without ADR backing are forbidden.

For the full history and amendment log, see [ADR-D-005](../adr/adr-d-005-dependency-policy-inventory.md).

## Current Inventory

| Package | Version | Purpose | Governing ADR |
|---------|---------|---------|---------------|
| `commander` | `^13.0.0` | CLI command framework | [ADR-D-005](../adr/adr-d-005-dependency-policy-inventory.md) |
| `@modelcontextprotocol/sdk` | `^1.27.1` | MCP server/client transport | ADR-017: MCP-Native Provider Adapters |
| `better-sqlite3` | `^12.10.0` | Memory V2 DB — SQLite + FTS5 | ADR-088: Memory V2 — DB-First Architecture |
| `grammy` | `^1.44.0` | Telegram connector (grammY framework) | ADR-016: External Messaging Connectors |
| `zod` | `^3.25.0` | Plan/config schema validation | ADR-004: Layered Config Merge — runtime schema validation for config merge + plan validation |
| `@noble/ed25519` | `^2.3.0` | Ed25519 `.deck` signing | ADR-014: .deck Secret File System |
| `@noble/hashes` | `^1.8.0` | SHA-512 `.deck` key derivation | ADR-014: .deck Secret File System |
| `@lydell/node-pty` | `^1.2.0-beta.12` | PTY for embedded web terminal | ADR-062: Embedded Web Terminal |
| `ws` | `^8.18.0` | WebSocket terminal transport | ADR-062: Embedded Web Terminal |
| `ink` | `^7.0.5` | Native REPL (React-for-CLI) | ADR-081 / ADR-083: Native Agentic REPL + REPL-UX-Evolution |
| `react` | `^19.2.7` | Ink REPL + web dashboard | ADR-081 (REPL) / ADR-080 (Dashboard) |
| `react-dom` | `^19.2.7` | Web dashboard render | ADR-080: Dashboard God-Level |
| `cli-highlight` | `^2.1.11` | REPL syntax highlighting | ADR-081 / ADR-083: sub-feature of Native Agentic REPL — REPL UX syntax coloring; governed by the REPL ADR family |
| `ink-testing-library` *(dev-only)* | `^4.0.0` | Render + drive Ink REPL components in tests (mount, read frames, simulate keypress via stdin) — closes the "Ink components are manual-verify-only" gap (Alperen-authorized 2026-07-16). | ADR-081 / ADR-083: test tooling for the Native Agentic REPL — same REPL ADR family as `ink` |
| `discord.js` *(optional)* | `^14.26.3` | Discord connector (lazy/optional) | ADR-016: External Messaging Connectors |
| `react` *(desktop sub-pkg)* | `19.2.7` (exact) | Desktop shell component model (SURF-4 D4-3) | SURF-4 onaylı-yığın (Alperen 2026-07-16, `docs/analysis/surf4-desktop-foundation-plan-2026-07-16.md` §2) — Context7-doğrulanmış stabil-major |
| `react-dom` *(desktop sub-pkg)* | `19.2.7` (exact) | Desktop shell render | SURF-4 onaylı-yığın §2 |
| `react-router` *(desktop sub-pkg)* | `7.9.4` (exact) | HashRouter — Electron `file://` güvenli 4-view routing | SURF-4 onaylı-yığın §2 |
| `@tanstack/react-query` *(desktop sub-pkg)* | `5.90.3` (exact) | Server-state: RunFlow REST cache + SSE→cache canlı-besleme | SURF-4 onaylı-yığın §2 |
| `zustand` *(desktop sub-pkg)* | `5.0.14` (exact) | Hafif UI-state (session/tema/nav) | SURF-4 D4-0 kilidi (Alperen-onaylı 2026-07-16) |
| `react-aria-components` *(desktop sub-pkg)* | `1.19.0` (exact) | Erişilebilir davranış-primitifleri — style-free (Köprüüstü dilini kısıtlamaz), yerleşik TR-dahil i18n | SURF-4 D4-0 kilidi (6-aday karşılaştırmasıyla, Alperen-onaylı 2026-07-16) |
| `@xterm/xterm` *(desktop sub-pkg)* | `5.5.0` (exact) | «Makine Dairesi» PTY-paneli — dashboard'da vetted AYNI sürüm; React.lazy chunk'ında (ana-bundle'a girmez) | 583/N3 (Alperen-onaylı 2026-07-18); ADR-G-029 |
| `@xterm/addon-fit` *(desktop sub-pkg)* | `0.10.0` (exact) | xterm boyut-uydurma eklentisi (ResizeObserver→fit→resize-frame) | 583/N3 (Alperen-onaylı 2026-07-18); ADR-G-029 |
| `nodemailer` *(optional)* | `^6.9.14` | Email connector (SMTP outbound) | ADR-016: External Messaging Connectors |
| `openai` *(optional)* | `^4.103.0` | OpenAI voice connector (Whisper transcription + TTS) | ADR-016: External Messaging Connectors |

## Policy

- **Adding a dependency:** Must reference an existing accepted ADR or propose a new ADR. No exceptions.
- **Removing a dependency:** Update this table and the ADR-D-005 amendment log.
- **Version bumps:** Do not require an ADR amendment unless the package's role changes.

## Security Bump Log

Non-major security bumps applied against `scripts/audit-exceptions.json` high/critical findings
(SEC-05 fail-closed gate, ADR-D-005). Each row closes the named advisory exception(s) — see
`scripts/check-dependency-audit.mjs` for the gate mechanics.

| Package | Old → New | Advisory | Reason | Task |
|---------|-----------|----------|--------|------|
| `fast-uri` | `3.1.0` → `3.1.3` | [GHSA-q3j6-qgpj-74h6](https://github.com/advisories/GHSA-q3j6-qgpj-74h6), [GHSA-v39h-62p7-jpjc](https://github.com/advisories/GHSA-v39h-62p7-jpjc) | Path-traversal / host-confusion via percent-encoded segments. Transitive via `@modelcontextprotocol/sdk` → `ajv@8.18.0` (`ajv` declares `^3.0.1`, so `3.1.3` resolves without an override). | DEP669A |
| `hono` | `4.12.8` → `4.12.29` | [GHSA-88fw-hqm2-52qc](https://github.com/advisories/GHSA-88fw-hqm2-52qc) (+ multiple lower-severity fixes bundled in the same non-major range) | CORS middleware reflected any `Origin` with credentials on the wildcard default. Transitive via `@modelcontextprotocol/sdk` (declares `^4.11.4`); bumped to latest `4.x` to close every advisory below `4.12.25` in one pass, still within the declared range. | DEP669A |
| `path-to-regexp` | `8.3.0` → `8.4.2` | [GHSA-j3q9-mxjg-w52f](https://github.com/advisories/GHSA-j3q9-mxjg-w52f) | DoS via sequential optional groups. Transitive via `@modelcontextprotocol/sdk` → `express@5.2.1` → `router@2.2.0` (declares `^8.0.0`). | DEP669A |
| `undici` | `6.24.1` → `6.27.0` | [GHSA-vxpw-j846-p89q](https://github.com/advisories/GHSA-vxpw-j846-p89q) | WebSocket client DoS via fragment-count bypass. Transitive via optional `discord.js@14.26.3` and `@discordjs/rest@2.6.1`, both of which pin `undici` to an **exact** `6.24.1` in their own `package.json` (not a caret range) — a plain lockfile bump could not move it. Closed via a root `"overrides": { "undici": "6.27.0" }` in `package.json`, forcing the whole tree to the patched `6.x` release without requiring a `discord.js` major bump. | DEP669A |
| `ws` | `8.20.0` → `8.21.0` | [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) | Memory-exhaustion DoS from tiny fragments/data chunks. Direct dependency (`^8.18.0` already permitted `8.21.0`); lockfile-only bump, no `package.json` range change needed. | DEP669A |

`nodemailer` (`GHSA-rcmh-qjqh-p98v`, `GHSA-p6gq-j5cr-w38f`) requires a semver-major bump
(`9.0.3+`) and stays on the short-expiry exception list — explicitly out of scope for DEP669A,
deferred to DEP669B.

### DEP669B — nodemailer 9.x bump: usage-surface inventory + breaking-change analysis (blocked, not applied)

Investigated for the `9.0.3+` semver-major bump closing `GHSA-rcmh-qjqh-p98v` (addressparser
recursion DoS, fixed `7.0.11`) and `GHSA-p6gq-j5cr-w38f` (`raw` option bypasses
`disableFileAccess`/`disableUrlAccess`, fixed `9.0.1`) — the higher floor of the two, `9.0.1`,
governs; `9.0.3` additionally hardens STARTTLS/socket handling and HTTP-proxy CONNECT.

- **Usage surface** (full inventory, `grep -r nodemailer src/`): exactly two files reference
  the package — `src/connectors/capabilities/mail-transport.ts` (the only real usage: dynamic
  `import('nodemailer')` → `createTransport({ host, port, secure, auth })` → wrapped
  `sendMail()`) and `src/connectors/voice/openai-voice.ts` (a comment only, no API call).
  The `send_mail` capability (`src/connectors/capabilities/builtin/send-mail.ts`) is the sole
  caller, building `{ from, to, subject, text, attachments: [{ filename, path }] }` — always
  **local artifact-store paths**, never the `raw` option, never SES, never OAuth2.
- **Breaking-change impact on this usage surface: none.** `7.0.0` removes the legacy AWS SES
  SDK (v2/v3) — not used (SMTP only). `8.0.0` renames error code `'NoAuth'` → `'ENOAUTH'` —
  not used (no error-code string matching in this codebase). `9.0.0` enables TLS-certificate
  validation by default for *remote HTTPS fetches* (attachments-by-URL, OAuth2 endpoints,
  proxies) — not used (attachments are always local paths; no OAuth2 transport). A behavior-
  preserving bump for this codebase's actual call shape would be a drop-in version change with
  no source adaptation required.
- **Blocked — not applied.** This worker's write scope does not include `package.json` /
  `package-lock.json`, and the workspace's Dependency-Mutation Advisory prohibits a worker from
  running any install/update against the shared lockfile regardless of task-level authorization
  claims (escalated via the `[NPM-ADVISORY]` question channel — host confirmed: not approved
  inside the workspace). `tests/release/dep-bump-audit.test.ts` (outside this worker's write
  scope) currently pins `nodemailer` at `^6.9.14` and asserts exactly the 2 exceptions below
  remain — both must be updated **together, host-side**, in the same change as the actual
  `npm install nodemailer@9.0.3` lockfile mutation, or the pinned test breaks. The 2 exceptions
  in `scripts/audit-exceptions.json` therefore remain in place (removing them without the real
  fix installed would make `check-dependency-audit.mjs` fail-closed on the still-present
  findings). Static usage-surface guard tests added in
  `tests/connectors/email-nodemailer-major.test.ts` lock in the "no breaking-surface usage"
  findings above so a future host-side bump has an automated regression check.
- **Next step (host-side):** `npm install nodemailer@^9.0.3` (updates `package.json` +
  `package-lock.json`), then in the same change remove the 2 `nodemailer` rows from
  `scripts/audit-exceptions.json`, update `tests/release/dep-bump-audit.test.ts`'s pinned
  version/exception-count assertions, and bump the `nodemailer` row above to `^9.0.3`.

_Last updated: 2026-07-12 (DEP669B: nodemailer 9.x usage-surface inventory + breaking-change
analysis — bump itself blocked pending host-side lockfile mutation, see above; DEP669A:
non-major security bump slice — fast-uri, hono, path-to-regexp, undici (via override), ws;
F11 fix: telegraf → grammy; added nodemailer + openai optional deps)_
