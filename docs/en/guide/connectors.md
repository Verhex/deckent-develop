# Connectors

## Product-user perspective

Connectors carry notifications, approvals, chat turns, media, and selected capabilities between Deckent and messaging systems. They are adapters over project authority; they do not become execution authority merely because a message arrived remotely. [Evidence: identity contract `.deckent/workspace/IDENTITY.md:8-10`; connector principal resolution `src/connectors/connector-bootstrap.ts:206-245`]

The public connector ID union includes Discord, Telegram, WhatsApp, Slack, and email. The general bot bootstrap actively attempts Telegram, Discord, and WhatsApp from `notify_connectors`; Slack/Teams files in this tree are approval clients rather than members of that three-connector bot bootstrap. [Evidence: `src/connectors/types.ts:12,82-143`; `src/connectors/connector-bootstrap.ts:177-203`; `src/connectors/approval-slack.ts`; `src/connectors/approval-teams.ts`]

## Configuration and secrets

Connector startup is driven by `notify_connectors`; bot media/voice/capability behavior is driven by `bot_capabilities`; per-user authority can use identity configuration and `.deckent/identity.db`. Secret tokens can be represented through Deckent secret interpolation rather than committed plaintext. [Evidence: `src/core/config.ts:2242-2269`; `src/connectors/connector-bootstrap.ts:52-53,206-245`; `src/connectors/identity/identity-store.ts:19-114`; `src/core/deck-interpolation.ts:1-31`]

Misconfigured connectors are lazy-loaded and skipped with an error rather than crashing the whole bootstrap. This is availability-oriented fail-safe behavior; inbound identity resolution itself catches errors and returns no principal, a fail-closed authorization result. [Evidence: `src/connectors/connector-bootstrap.ts:1-11,184-203,206-245`]

## Telegram — ⚠️ partial

The Telegram adapter uses grammY and handles text, media, voice, callbacks, HTML-formatted output, file download, and optional voice processing. The bot path can share an artifact store and capability registry for approved screenshot/mail operations. [Evidence: `src/connectors/telegram.ts:108-333`; `src/connectors/connector-bootstrap.ts:94-175,521-558`; `src/connectors/capabilities/`]

Code and command wiring are live, but this audit did not send a Telegram message or probe external credentials. Status is therefore partial rather than end-to-end certified. [Evidence: no external connector run in audit]

## Discord — ⚠️ partial

The Discord adapter is lazy-loaded because `discord.js` is optional; a missing dependency causes log-and-skip behavior. It participates in the bot bootstrap when enabled. [Evidence: `package.json:128-131`; `src/connectors/connector-bootstrap.ts:1-11,182-203`; `src/connectors/discord.ts`]

No Discord session was started in this audit. [Evidence: audit run ledger, 2026-08-01]

## WhatsApp — 🔜 roadmap

WhatsApp is explicitly a scaffold. Disabled startup is a no-op; enabled startup throws an activation message; sending always throws; health is always false. It does not currently deliver product behavior. [Evidence: `src/connectors/whatsapp.ts:1-67`]

The source intentionally rejects the unofficial `whatsapp-web.js` route and names the official Business API approval path. Historical sprint targets in the source comments are not current delivery promises. [Evidence: `src/connectors/whatsapp.ts:4-11`; `src/connectors/whatsapp-README.md`]

## Bot lifecycle

Help-verified commands are `deckent bot listen|start|stop|status`. `listen` runs in the foreground; `start` launches a detached listener; status/stop use a PID record. [Evidence: `src/cli/commands/bot.ts:194-260,310-344`; real help audit]

A real read-only `bot status` reported a running daemon with PID 2085721. Do not use that observation as proof that any individual connector is authenticated or healthy. [Evidence: real output, 2026-08-01]

## Project gateway

The gateway provides project registration, pairing, binding, and a child runtime per project. The current listener loads Telegram specifically, applies pairing/access checks, and supervises project sessions. [Evidence: `src/connectors/gateway/gateway-daemon.ts:38-105`; `src/connectors/gateway/gateway-router.ts:20-93`; `src/connectors/gateway/runtime-supervisor.ts`]

Inline approval callbacks are explicitly deferred in the current gateway listener; buttons are not silently routed. Status is `⚠️ partial`. [Evidence: `src/connectors/gateway/gateway-daemon.ts:87-90`]

A real `gateway status` returned “not running.” The CLI also exposes pair list/approve/reject, while several gateway child help descriptions are empty—a known CLI documentation defect. [Evidence: real output and help audit, 2026-08-01; `src/cli/commands/gateway.ts:89-164`]

## Voice and media

Voice is default-off at the capability level. When explicitly enabled, bot startup constructs a local or OpenAI voice adapter and runs a health check; inbound Telegram voice can be downloaded, transcribed, and routed with detected language. Failures degrade to an honest error without crashing the poller. [Evidence: `src/cli/commands/bot.ts:81-189`; `src/connectors/voice/health.ts:53-93`; `src/connectors/connector-bootstrap.ts:133-175`]

## Dogfood / repository reality

| Capability | State | Limitation |
|---|---|---|
| Telegram bot code | ⚠️ partial | wired; no live message proof in this audit |
| Discord bot code | ⚠️ partial | optional dependency and no live session proof |
| WhatsApp | 🔜 roadmap | scaffold throws when enabled |
| Gateway | ⚠️ partial | Telegram-bound listener; callback approval deferred |
| Identity store | ✅ live code/schema | zero rows in current DB snapshot; no live sender proof |
| Bot daemon | ✅ running snapshot | PID observed; PAZARTESI records stop/identity-guard and stale PID cleanup defects |

Do not stop or clean a live bot/sprint without owner approval. [Evidence: `AGENTS.md:69-108`; `PAZARTESI.md:48-49`]
