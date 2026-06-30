# ADR-G-007: External Messaging Connectors & Integration Layer

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=config-gated + lazy-load + fail-safe (per-target timeout-guarded, error-isolated) connectors + project-scoped session/pairing gateway (auth-gate pending) → tomorrow=integration-layer (MSG-1) + multi-channel ApprovalBroker relay (APR-2) + pairing onCallback wire + WhatsApp wire (MSG-3) + pairing hard-auth before public exposure
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-016 (External Messaging Connectors), ADR-091 (Project-Scoped Messaging Gateway) · **Supersedes:** —
**Crosswalk:** ADR-016 + ADR-091 → ADR-G-007

> **Note:** ADR-091 (Project-Scoped Messaging Gateway) lived in `memory.db` (`type='adr'`) but was never exported to `docs/adr/` — a real doc↔DB drift. Folding it into ADR-G-007 closes that drift; no standalone export is created (per crosswalk row #091). The gateway today ships **without** a hard pairing-auth gate, so it must not be exposed on a public network until the pairing onCallback + auth work (MSG-1/APR-2) lands — see Intent/Roadmap.

---

## Context

Operators need deckent to reach them where they already are — their phone — for sprint approvals, checkpoint gates, and alerts, and to reply back inbound (approve/reject) without opening a terminal. This is a first-class **product** surface: it is how a non-coder operator or an enterprise on-call rotation supervises an autonomous run from anywhere, and how deckent's "AI proposes, human approves" law (ADR-G-031 F3) reaches a human across channels.

Two decisions are merged here, because in the current codebase they are one subsystem:

- **ADR-016 (External Messaging Connectors)** defined the lifecycle-managed `src/connectors/` subsystem — the `BaseConnector` contract, the per-platform adapters (Telegram/Discord/WhatsApp), outbound notification dispatch, the inbound approve/reject pipeline, and the agentic bot. ADR-016 was originally (Sprint 044) an **AI-provider** health/lifecycle `Connector` abstraction; that responsibility moved to `src/core/provider.ts` `ProviderAdapter` (now governed by **ADR-G-008**), and the term *connector* + the `src/connectors/` namespace were repurposed to mean **external messaging connectors**. That repurpose closed a governance gap (a 16-file messaging/bot subsystem with no ADR).
- **ADR-091 (Project-Scoped Messaging Gateway)** added a project-scoped **session/pairing** gateway (`src/connectors/gateway/`) so that a single bot process can serve multiple projects with per-project session isolation and a pairing handshake — the re-architecture of the Telegram experience from the ground up.

The subsystem's non-negotiable invariants were forged from operational pain: a slow or hung messaging platform must **never** block the sprint lifecycle, an absent optional dependency must **never** break process load, and a misconfigured channel must **never** leak a credential.

---

## Decision (Today)

### 1. Connector subsystem (`src/connectors/`)

```xml
<connector-subsystem root="src/connectors/">
  <contract-and-pool>
    base-connector.ts   — BaseConnector interface (the per-platform contract)
    connector-pool.ts   — ConnectorPool: register / broadcast / lifecycle
  </contract-and-pool>
  <adapters>
    telegram.ts   — Telegram (telegraf, runtime dep)
    discord.ts    — Discord (discord.js, OPTIONAL dep, lazy-imported)
    whatsapp.ts   — WhatsApp (adapter present; full wire = MSG-3, see Tomorrow)
  </adapters>
  <outbound>
    connector-notify-adapter.ts — ConnectorNotificationAdapter implements the
      WIRE-001 NotificationAdapter contract; each DECKENT→USER:NOTIFY goes to
      every connector's own chat_id, per-target timeout-guarded + fail-isolated.
  </outbound>
  <inbound>
    incoming-router.ts → incoming-command-router.ts / incoming-command-resolver.ts
      — route inbound messages to actions (approve / reject / status).
  </inbound>
  <bot>
    bot-agentic.ts / bot-daemon.ts / bot-commands.ts / bot-action-store.ts
      — `deckent bot listen`; humanized replies (BOT-1).
    chat-bridge.ts — ChatMemoryAdapter, bounded multi-turn history (BOT-2d).
  </bot>
  <bootstrap>
    connector-bootstrap.ts — reads `notify_connectors` config, lazy-imports
      enabled connectors (missing optional dep → log + skip), starts OUTBOUND.
  </bootstrap>
  <gateway scope="project">                          <!-- absorbs ADR-091 -->
    gateway/ — project-scoped session + pairing: one bot process serves many
      projects; per-project session isolation + a pairing handshake binds a
      chat to a project. (Telegram experience re-architecture.)
  </gateway>
</connector-subsystem>
```

### 2. Invariants (the law)

- **Config-gated.** A connector is inert unless `notify_connectors: { telegram|discord: { enabled, token: "$DECK:…", chat_id } }` enables it. Tokens are referenced through `$DECK:` interpolation (**ADR-G-005**) — never stored inline.
- **Lazy.** Optional deps (e.g. `discord.js`) are lazy-imported; a missing optional dependency logs and is skipped, never breaks process load (dependency policy: **ADR-D-005**).
- **Fail-safe.** Every send is timeout-guarded and per-target error-isolated. A slow, hung, or erroring platform never blocks or fails the sprint lifecycle.
- **Adding a platform** = one new adapter implementing `BaseConnector` + one `notify_connectors` entry. No core change.

### 3. Project-scoped session/pairing gateway (absorbs ADR-091)

The gateway scopes inbound sessions per-project and brokers a pairing handshake so one running bot can supervise multiple projects without cross-project session bleed. **Today's honest limitation:** the gateway has **no hard pairing-auth gate** yet — pairing is established but not cryptographically enforced on every inbound callback — so it is safe for trusted/local use but **must not be exposed publicly** until the pairing onCallback + auth work lands (Tomorrow). This is an explicitly-marked debt, not silent.

---

## Intent / Roadmap (Tomorrow)

- **MSG-1 — Integration layer.** A formal integration layer above the per-platform adapters: a uniform inbound/outbound message envelope, retry/backoff, and delivery-receipt semantics, so new channels (Slack, Teams, email, webhook) plug in without per-adapter glue.
- **APR-2 — Multi-channel approval relay.** Approval requests fan out across every paired channel and the **first** authoritative human response wins, routed through the unified **ApprovalBroker** (the runtime-wide approval spine that also serves nervous-system approvals — **ADR-G-022**). One approval, any channel.
- **Pairing onCallback + hard-auth.** Wire the pairing callback end-to-end and gate every inbound callback behind the pairing identity, so the gateway becomes safe to expose beyond a trusted host. Connector-side identity/RBAC graduates into the enterprise connector-identity model (**ADR-G-031**, fail-CLOSED L2-RBAC) and the authority layer (**ADR-G-020**).
- **WhatsApp wire (MSG-3).** Complete the WhatsApp adapter to outbound+inbound parity with Telegram.
- **Bot tool-surface.** Expose cost/usage/kpi as bot-callable tools and gate risky tools (start/run/process, publish) behind a button-confirm approval in DMs and groups — under the same surface-parity contract as CLI/MCP/terminal (**ADR-G-011**).

---

## Consequences

**(+)** deckent reaches a human on their phone and takes back a decision — the approval loop closes across channels, which is what makes an autonomous run supervisable for a non-coder and an enterprise alike. The subsystem is fail-safe by construction (a dead platform never stalls a sprint), config-gated (no accidental phone-home), and extensible (new platform = new adapter). Folding ADR-091 into this record fixes a real doc↔DB drift and makes the gateway's session/pairing model part of the connector law rather than an orphan.

**(−)** The project-scoped gateway today lacks a hard pairing-auth gate — a marked debt that bounds it to trusted/local use until MSG-1/APR-2 land (it must not be made public before then). WhatsApp is adapter-present but not fully wired (MSG-3). The bot tool-surface and group-button approval are built but pending build+restart, and a detached-exec gap exists for start/run/process (tracked in `project_bot_tool_surface_and_group_buttons`). ApprovalBroker unification (APR-2) is roadmap — today approvals route through the existing nervous-accept path, not yet a single multi-channel broker.

---

## References / Absorbed

- **Absorbs:** ADR-016 (External Messaging Connectors — `BaseConnector`/`ConnectorPool`, adapters, outbound notify, inbound pipeline, agentic bot, bootstrap; originally Sprint-044 AI-provider lifecycle, repurposed 2026-06-11) + ADR-091 (Project-Scoped Messaging Gateway — session/pairing, drift-fixed here).
- **Provider lineage:** the original Sprint-044 AI-provider `Connector` responsibility moved to **ADR-G-008** (Provider Abstraction, Fleet & Native-Usage) — `connector` now means *messaging*, not *provider*.
- **Secret interpolation:** **ADR-G-005** (Secret File System & Zero-Worker-Exposure) — `$DECK:` token references.
- **Dependency policy:** **ADR-D-005** (Dependency Policy & Inventory) — `telegraf` runtime dep, `discord.js` optional/lazy.
- **Approval spine:** **ADR-G-022** (Nervous System) — ApprovalBroker unification (APR-1/APR-2).
- **Enterprise identity:** **ADR-G-031** (Enterprise Foundation) — connector social-identity RBAC, fail-CLOSED, tenant-scoped (absorbs old ADR-092); **ADR-G-020** (Authority, Roles, Flow & Enforcement) for the approval/authority contract.
- **Surface parity:** **ADR-G-011** (Surface Parity & Thin-Wrapper) — bot tool-surface ≡ CLI ≡ MCP ≡ terminal.
- **Wiring contracts:** WIRE-001 (`NotificationAdapter` notify dispatcher), BOT-1 (humanized bot-agent), BOT-2d (bounded chat history).
- **Born work-items:** MSG-1 (integration layer), APR-2 (multi-channel approval relay), MSG-3 (WhatsApp wire), PAIRING-AUTH (onCallback + hard-auth gate), BOT-TOOL-SURFACE (cost/usage/kpi + group-button approval).
- **Direction:** memory `project_messaging_gateway_rearch` (gateway in main, build+T9 pending, ⚠️ auth-gate-less — do not expose publicly), `project_bot_tool_surface_and_group_buttons`, `feedback_telegram_rich_approval_bot`; `.analysis/hermes-vs-deckent-direction-decisions.md` (runtime-wide ApprovalBroker = P0).
