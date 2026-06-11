# ADR-016: External Messaging Connectors (Discord / Telegram / WhatsApp + Bot)

**Status:** accepted

**Date:** 2026-04-16 (original) · repurposed 2026-06-11

---

**Decision (current):** External messaging connectors live in `src/connectors/` as a lifecycle-managed subsystem:
- **Contract + pool:** `base-connector.ts` (`BaseConnector` interface) + `connector-pool.ts` (`ConnectorPool` — register / broadcast / lifecycle).
- **Per-platform adapters:** Telegram (`telegram.ts`, `telegraf` runtime dep), Discord (`discord.ts`, `discord.js` **optional** dep, lazy-imported), WhatsApp (`whatsapp.ts`).
- **Outbound notify:** `connector-notify-adapter.ts` (`ConnectorNotificationAdapter` — implements the WIRE-001 `NotificationAdapter` contract; each `DECKENT→USER:NOTIFY` goes to each connector's own `chat_id`, per-target timeout-guarded + fail-isolated).
- **Inbound pipeline:** `incoming-router.ts` → `incoming-command-router.ts` / `incoming-command-resolver.ts` (route inbound messages to actions, e.g. approve/reject).
- **Agentic bot:** `bot-agentic.ts` / `bot-daemon.ts` / `bot-commands.ts` / `bot-action-store.ts` (`deckent bot listen`; humanized replies — see BOT-1).
- **Multi-turn:** `chat-bridge.ts` (`ChatMemoryAdapter`, bounded history — BOT-2d).
- **Bootstrap:** `connector-bootstrap.ts` reads `notify_connectors` config, lazy-imports enabled connectors (missing optional dep → log+skip), starts OUTBOUND.

**Context:** Operators need deckent to reach them on their phone (sprint approvals, checkpoints, alerts) and to reply back (inbound approve/reject). The subsystem must be **config-gated** (`notify_connectors: { telegram|discord: { enabled, token: "$DECK:…", chat_id } }`), **lazy** (optional deps never break load), and **fail-safe** (a slow/hung platform never blocks the sprint lifecycle — every send is timeout-guarded + per-target error-isolated).

**Consequence:** Adding a platform = a new adapter implementing `BaseConnector` + a `notify_connectors` entry. Discord stays an `optionalDependency` (ADR-010). Telegram is a runtime dep (`telegraf`). Connectors are a first-class **product** surface for non-coder/enterprise reach (cross-ref BOT-1 humanized bot-agent, §4G human-interaction-wire). Cross-ref: ADR-010 (deps), WIRE-001 (notify dispatcher), `$DECK:` interpolation (ADR-014).

---

**Original decision (Sprint 044 — SUPERSEDED):** ADR-016 originally recorded an **AI-provider** health/lifecycle `Connector` abstraction (runtime health-check, lazy init, auditor integration, `.dashboard` health metrics). That AI-provider responsibility moved to `src/core/provider.ts` `ProviderAdapter` (`isAvailable()`, multi-provider registry) per **ADR-017 (MCP-Native Provider Adapters)**; the `Connector` class itself moved to `src/core/session-interface.ts` (evolved role). The term **"connector"** + the `src/connectors/` namespace now mean **external messaging connectors** (this ADR's current subject).

---

**Amendment log:** 2026-06-11 — ADR **repurposed** from "AI-provider lifecycle Connector" → **"External Messaging Connectors"** to match the codebase's current meaning of `connector` (closes a governance gap: the 16-file messaging/bot subsystem had no ADR). AI-provider lifecycle part marked superseded-by-ADR-017 (Alperen ADR-review). md+db synced.
