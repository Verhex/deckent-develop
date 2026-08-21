# ADR-D-011: Global Install Topology — Daemon vs CLI-Invoked, Project-Scope Config Layer

> **ACCEPTED DECISION (2026-07-06, Alperen):** Option C (Hybrid — per-project coordination daemon, CLI stays primary)


**Class:** ADR-D (Dogfooding / Dev) — **see Meta-note below; classification is itself an open question** · **Scope:** global+project · **Immutable:** no (proposed) · **Source:** publisher · **Enforcement:** today=none, design-only — no code ships with this ADR → tomorrow=phased build (§ Intent/Roadmap) gated on Alperen's decision below
**Status:** accepted (Alperen, 2026-07-06) · **Date:** 2026-07-05 · **Absorbs:** — (new; this is the daemon-vs-CLI install-architecture axis of MASTER-PLAN row-200 ONB-GLOBAL — a *sibling*, not a duplicate, of the file-location axis already drafted in `docs/design/onb-global-install.md` §8) · **Supersedes:** —
**Crosswalk:** — (new decision, no legacy ADR-NNN predecessor)

> **Meta-note (classification — flagged, not resolved by this document):** Per ADR-G-019 §1's own class definitions, ADR-G covers "runtime behavior, orchestration... ships in BOTH global install AND every project install... applies to dogfood AND user (solo → largest enterprise, million-scale)"; ADR-D covers only "how deckent is BUILT — contributor conventions... ships ONLY with the dev install." This document's subject — how the *installed product* runs for every end user — reads as ADR-G by that definition, not ADR-D. The write-scope assigned to this task, however, is the file `docs/adr/adr-d-011-global-install-project-scope.md` (a D-slot). Rather than write outside my assigned scope, I am flagging the mismatch explicitly as **Open Question 1** below and keeping the file at its assigned path/number; the Class header above is left as assigned pending Alperen's call — if reclassified, the correct move is a follow-up rename to an `ADR-G-0XX` slot (mirroring the placeholder the sibling document already reserved, `docs/design/onb-global-install.md` §8) plus this file's retirement/redirect, not a silent edit of the number here.

---

## Context

### 1. What is already decided (do not re-litigate here)

Two adjacent questions on MASTER-PLAN row-200 (ONB-GLOBAL, P0, "kesinlikle revize edilecek") are **already designed and partially shipped** and this document treats them as a settled floor:

- **Config precedence (ADR-G-001).** `loadConfig()` (`src/core/config.ts:1446-`) merges four effective layers, last wins: hardcoded defaults (`createDefaultConfig()`, `config.ts:1459`) → `~/.deckent/config.json` (global merge, `config.ts:1461-1464`) → `.deckent/config.json` (project merge, `config.ts:1466-1503`) → curated `DECKENT_*` env overrides (`config.ts:1529-1550`). `deepMerge` semantics (nested-merge, array-replace, undefined-skip) are unchanged by anything in this document.
- **Pivot rule — learnings stay project-scope (ADR-G-017).** `.brain/memory.db` (ADRs, sprint learnings, retros, routing stats) is the project's own accumulated judgment; it never migrates to global scope and never leaks across sibling projects. `docs/design/onb-global-install.md` §3.2 already states this as a design principle; this document reaffirms it as an unconditional constraint on every option below.
- **Where global files physically live on disk.** `docs/design/onb-global-install.md` (Sprint 361-008, 2026-07-02) designed the full 4-platform matrix (XDG on Linux/WSL, `Library/Application Support`+`Library/Caches` on macOS, `%APPDATA%`/`%LOCALAPPDATA%` on Windows) via `resolveGlobalScopePaths` (`src/core/global-scope-resolver.ts`) and a versioned `GlobalStore` layer (`src/core/global-store.ts`, Sprint 362-010). That document's own §8 already contains a **separate, still-`proposed` ADR draft** ("ADR-G-0XX: Global Scope Topology & Platform-Correct Global Paths") for exactly this narrower axis — options A (flat forever) / B (platform-correct, staged migration) / C (hybrid opt-in). **This document does not re-decide that axis**; it is a sibling, cross-referenced, not absorbed.

What those two settled items do **not** answer, and what MASTER-PLAN row-200 still marks 🟡 for, is the question this document takes on:

### 2. The open question — how does the installed product *run*?

Today, per `package.json:6-9` and `docs/guide/installation.md:24-44`, deckent ships two bins — `deckent` (`dist/cli/entry.js`) and `deckent-mcp` (`dist/mcp/server.js`) — and both install paths documented (`npx deckent@latest init` zero-install, or `npm install -g deckent`) are **CLI-invocation models**: every `deckent <command>` is a fresh process that reads config, does its work, and exits (or, for a sprint, spawns worker processes via tmux/subprocess and exits when the sprint completes). There is **no persistent background process for the core orchestration engine**.

deckent already has exactly **one** daemon-shaped subsystem, and it is scoped narrowly: `src/connectors/gateway/gateway-daemon.ts` (152 lines) + `src/connectors/bot-daemon.ts` (112 lines) run the messaging-connector inbound listener (Telegram/Discord) as a long-lived, detached child process, because polling cannot receive inbound bot messages. Its own header comment is disarmingly honest about the model's limits: *"a detached process does NOT survive a reboot or a crash — that needs an OS supervisor (systemd/pm2). This is 'always-on while the machine is up', not 'survives reboot'"* (`bot-daemon.ts:1-7`). It is tracked by pid file **per project root** (`botPidPath(root)` → `.deckent/bot.pid`, `bot-daemon.ts:16-18`), liveness-checked by a portable, no-throw cross-platform helper (`src/core/pid-liveness.ts`, `isPidAlive`), and stale instances are detected — never auto-killed — by `src/core/daemon-hygiene.ts` (`detectStaleDaemons`, pure detector over an injected process snapshot; `listDeckentProcesses`, an injectable spawn-based cross-platform adapter that returns an honest empty list with `supported:false` on an unrecognized platform rather than guessing).

The reason this axis can no longer stay implicit: the owner-approved **runtime-wide ApprovalBroker** direction requires an approval-request emitted by any surface (worker/tool/MCP elicitation) to broadcast live to *every* connected channel (terminal, Telegram, WhatsApp, dashboard), and a decision made in any one of them to cross-broadcast "approved in X" to all the others, in real time. The same product direction makes the **terminal** the primary, conversational, tool-driven surface — a UX shape that assumes a live, addressable session, not a one-shot CLI invocation. Both requirements push toward *some* durable, addressable process; neither the existing config-precedence work nor the existing file-location work answers what that process's scope and lifecycle should be. That is this document's decision.

---

## Decision (Today)

**Nothing changes today.** This document is a proposal; no code ships with it (nogo per this task's own goNogo criteria: no code, no DB write, no "kabul edildi" status). It exists to put the three candidate architectures on record, scored against Yasa #2 (design the full million-environment / multi-tenant matrix up front), so Alperen can decide before ONB-GLOBAL-WIRE-class implementation work starts.

### Options

```xml
<install-topology-options>
  <option id="A" name="Global daemon + project-attach">
    <shape>
      One long-lived background process PER MACHINE (started once — manually via a
      `deckent daemon start`, or registered as an OS service: systemd unit / launchd
      plist / Windows Service / schtasks). Every project "attaches" via a local IPC
      channel (unix domain socket / named pipe / loopback HTTP). The daemon owns:
      cross-project ApprovalBroker fan-out, ALL messaging-connector listeners
      (gateway-daemon absorbed into it), global-scope state (GlobalStore), and
      cost/limit-ledger aggregation across every attached project.
    </shape>
    <pros>
      Real-time cross-channel approval relay is trivial — one process already owns
      every channel connection, so fan-out is an in-process pub/sub, not
      cross-process coordination. One set of provider auth sessions machine-wide
      (no re-login per project). Efficient at scale for a single power user running
      many concurrent project sprints (shared connection pools/caches).
    </pros>
    <cons-yasa2 name="million-environment / multi-tenant impact">
      Takes on FULL OS-service-lifecycle burden across all four platforms on day
      one — systemd unit *and* launchd plist *and* Windows Service/schtasks *and*
      WSL nuances (a WSL daemon's socket is not reachable from Windows-side
      processes without an explicit bridge — `docs/design/onb-global-install.md`
      §5.2 already treats Windows↔WSL as "two machines by design", which directly
      complicates a would-be single cross-boundary daemon). Introduces a NEW
      failure class deckent must actively defend against — `daemon-hygiene.ts`
      already exists precisely because stale/orphaned always-on processes are a
      real, previously-fought problem (Sprint 331, B-ZOMBIE), not hypothetical.
      At enterprise/shared-machine scale, ONE per-machine daemon serving MULTIPLE
      tenants' projects is exactly the isolation boundary ADR-G-017 explicitly
      calls out of scope for today's per-project model ("multi-project ≠
      multi-tenant... enterprise multi-tenancy arrives later as a *modular* layer,
      **ADR-G-031**, never by weakening this per-project model" —
      `adr-g-017-multi-project-isolation.md:15`) — Option A would force that
      modular-layer work to exist BEFORE a shared-machine deployment is safe, not
      after. A locked-down environment (CI runner, ephemeral container, managed
      corporate desktop without background-service rights) may not permit
      installing/registering a service at all; must honestly fail (Yasa#2), not
      silently degrade.
    </cons-yasa2>
  </option>

  <option id="B" name="Global-CLI + project-config-layer (today, extended)">
    <shape>
      No persistent daemon for core orchestration, ever. `deckent` stays installed
      once (npm -g or npx), invoked per-command; state layering is exactly today's
      ADR-G-001 spine, now carried onto the already-shipped platform-correct
      GlobalStore (361-008/362-010/363-006). The ApprovalBroker (direction-doc §3)
      is built WITHOUT a central daemon: channels poll/tail a shared local
      event log (the same append-only pattern `.tasks/*.result` / `.dashboard`
      already use), or the EXISTING gateway-daemon is extended to also carry
      approval fan-out for the channels it already owns (Telegram/Discord),
      without becoming the product's backbone.
    </shape>
    <pros>
      Zero NEW OS-service-lifecycle surface — nothing to write/support/debug across
      four platforms beyond what already exists (gateway/bot-daemon). Simplest
      mental model: every command is a fresh, disposable process, matching
      `docs/guide/installation.md`'s two documented install paths exactly as they
      exist today. Naturally multi-tenant-safe by construction — no shared
      long-lived process means no cross-tenant blast radius to defend against.
      Matches sandboxed/CI/ephemeral-container environments, where installing a
      background service is often disallowed or simply pointless (a CI job that
      runs one sprint and exits has nothing to attach a daemon to anyway).
    </pros>
    <cons-yasa2 name="million-environment / multi-tenant impact">
      Real-time cross-channel relay is harder to make feel "live" — re-derived
      from polling/file-watch primitives instead of an in-process bus, likely
      higher latency for the "xx ortamda onaylandı" cross-broadcast the direction
      doc asks for. Does not actually eliminate daemons: messaging connectors
      ALREADY require one (`gateway-daemon.ts` exists because polling cannot
      receive inbound bot messages) — Option B just keeps that daemon narrowly
      scoped to messaging rather than making it also serve as the coordination
      backbone; the ApprovalBroker's live-relay ambition would sit awkwardly
      outside it.
    </cons-yasa2>
  </option>

  <option id="C" name="Hybrid — per-project coordination daemon, CLI stays primary">
    <shape>
      Core orchestration (sprints) stays CLI-invoked as today — Option A's
      per-machine service is NOT introduced. Generalize the ALREADY-EXISTING
      `gateway-daemon.ts`/`bot-daemon.ts` shape (detached child process,
      `.deckent/bot.pid`-style liveness file, `isPidAlive` cross-platform check,
      `daemon-hygiene.ts` stale-detection) into ONE narrow, optional,
      lazily-started **per-project** coordination daemon. Its only job: own the
      ApprovalBroker pub/sub bus for that project AND host the messaging listener
      under the same process (not two coordination shapes side by side). Scope is
      PER-PROJECT-ROOT — the exact isolation boundary ADR-G-017 already
      guarantees — not per-machine, so it inherits that ADR's isolation model
      instead of needing a new one. Auto-started on first need (first `deckent
      start` in a project, or first action requiring live approval-relay) if not
      already running; consent-gated per ADR-G-030 if it is ever registered
      persistent-on-boot (out of scope for the initial slice — see Open Question 4).
    </shape>
    <pros>
      Satisfies the actual P0 driver (live cross-channel approval relay) WITHOUT
      taking on Option A's full per-machine OS-service burden on day one. Reuses
      TWO things already built and already proven (`gateway-daemon.ts`'s detached-
      process shape + `daemon-hygiene.ts`'s stale-detection + `pid-liveness.ts`'s
      portable check) instead of inventing new OS-service machinery from scratch.
      Per-project scope keeps multi-tenant isolation trivial — it is the SAME
      boundary `.deckent/`/`.brain/` already use (ADR-G-017 Layer-1), so a shared
      enterprise machine running many projects gets N independent coordination
      daemons, never one shared surface to isolate. Environments that cannot/will
      not run background processes (locked-down CI) simply do not get live relay
      and fall back to polling — an honest, Yasa#2-compliant degrade, not a hard
      requirement to work at all.
    </pros>
    <cons-yasa2 name="million-environment / multi-tenant impact">
      Two coordination shapes (a generalized per-project daemon + whatever remains
      of `gateway-daemon.ts`) must be explicitly unified, not left to drift —
      this ADR's proposed decision below states they should be ONE process, but
      the actual ownership/merge design is deferred to Open Question 2. A
      per-project daemon still needs lifecycle hygiene (start/detect-stale/stop)
      — smaller surface than Option A's per-machine service (N independent,
      already-isolated processes vs. one shared one to defend), but not zero; N
      concurrently open projects means N coordination daemons running, which a
      resource-constrained environment (a small CI runner, a low-memory VM) must
      be able to see and reason about (`deckent doctor` / `daemon-hygiene.ts`
      already gives an inventory seam for this — extending it, not inventing a
      new one).
    </cons-yasa2>
  </option>
</install-topology-options>
```

### Proposed decision: **Option C**

Reasoning, laid out against the project's own laws:

1. **Yasa #3 (never MVP) does not mean "biggest option wins."** The god-level, enterprise-grade answer here is the *right-sized* one: reusing a proven, already-shipped daemon shape (`gateway-daemon.ts` + `daemon-hygiene.ts` + `pid-liveness.ts`) to close a real, named P0 gap (live cross-channel approval relay) is more rigorous than committing the whole product to a per-machine OS-service architecture (Option A) before any usage signal demonstrates that scale is needed. Building Option A's full systemd/launchd/Windows-Service/WSL-bridge matrix speculatively, with no proven driver beyond "it would also work," is itself a form of premature, unjustified complexity — the same anti-pattern Discipline 2 (Simplicity First) warns against, just at architecture scale instead of function scale.
2. **Yasa #2 (every environment, honestly) favors Option C's degrade story.** A per-project daemon that simply doesn't start in a locked-down CI runner (and the CLI still works, just without live relay) is an honest partial-capability story. Option A either has to solve OS-service registration on every platform *including* environments that forbid it, or itself falls back to something Option-C-shaped anyway for those environments — meaning Option A doesn't avoid building Option C, it just adds a second, heavier mode on top.
3. **ADR-G-017's existing "multi-project ≠ multi-tenant" line is exactly the isolation boundary Option C needs, already granted.** A per-project coordination daemon is no new isolation surface to design — it is the SAME directory-scoped boundary `.deckent/`/`.brain/` already use. Option A would need genuinely new multi-tenant engineering (a single shared daemon serving several tenants' projects safely) *before* it could be considered enterprise-safe, i.e. it would have to build ADR-G-031's modular multi-tenancy layer as a prerequisite rather than an addition.
4. **It does not foreclose Option A later.** If real usage data later shows most users run many concurrent projects and would benefit from one supervising per-machine process, that becomes ITS OWN follow-up ADR amendment (a "coordination-daemon supervisor" sitting above N per-project daemons) — not a decision this document has to make today, and not a rewrite of Option C's per-project foundation when it happens.

---

## Intent / Roadmap (Tomorrow)

Phased build, gated on Alperen's acceptance of this ADR (nothing below ships with this document):

- **Phase 0 (today, no-op).** Core orchestration remains CLI-invoked. `gateway-daemon.ts`/`bot-daemon.ts` remain the only daemon-shaped code, scoped to messaging.
- **Phase 1 — extract the coordination-daemon core.** Generalize `gateway-daemon.ts`'s detached-process/pid-file/liveness pattern into a project-scoped `coordination-daemon.ts` (name TBD) that can host BOTH the existing messaging listener AND a new ApprovalBroker pub/sub bus, reusing `pid-liveness.ts` and extending `daemon-hygiene.ts`'s stale-detection to the new process kind. No behavior change for existing bot users.
- **Phase 2 — wire approval emitters.** Worker/tool/MCP-elicitation approval-request call-sites publish through the coordination daemon (when running) instead of file-only state; channels (terminal/Telegram/WhatsApp/dashboard) subscribe for live cross-broadcast. Consent-gated auto-start per ADR-G-030 (no silent background-process spawn without the user having opted into the feature that needs it).
- **Phase 3 — evaluate a per-machine supervisor.** Only if real multi-project concurrent-usage telemetry shows a need: design a follow-up ADR for an OPTIONAL per-machine process supervising N per-project coordination daemons (Option A's benefits, added on top of Option C's foundation rather than replacing it). Not committed to by this document.

---

## Consequences

**(+)** Puts the daemon-vs-CLI axis of ONB-GLOBAL on record for the first time, distinct from the already-settled file-location axis (`docs/design/onb-global-install.md`) — MASTER-PLAN row-200 gets a real second decision to close, not a rehash. The recommended option reuses three already-shipped, already-tested primitives (`gateway-daemon.ts`, `daemon-hygiene.ts`, `pid-liveness.ts`) rather than inventing new OS-service machinery, keeping the eventual implementation surgical. Explicitly preserves the two settled floors (ADR-G-001 precedence, ADR-G-017 pivot rule) so no future implementation work can silently erode them while chasing this document's decision.

**(−)** This document itself carries an unresolved classification question (Meta-note) rather than resolving it — a follow-up rename/renumber may be needed once Alperen decides. Option C's "unify gateway-daemon into one coordination process" design is stated as a direction, not a finished interface — Open Question 2 below is real engineering ambiguity, not yet closed. No code ships with this ADR; MASTER-PLAN row-200 stays 🟡 until Alperen accepts (or amends) a decision here and Phase 1 work is scheduled.

---

## Open Questions (Alperen decides — each marked separately)

1. **[ALPEREN] Classification/numbering.** Per the Meta-note: should this document be reclassified `ADR-G-0XX` (Global/Constitution — install topology reaches every user/environment) instead of `ADR-D-011` (Dev/contributor-only, which this content does not actually match)? If yes, the follow-up move is a rename to a proper `ADR-G` slot (there is already a reserved placeholder pattern in `docs/design/onb-global-install.md` §8 for a *different* ADR-G-0XX — these would need distinct numbers) plus retiring/redirecting this file — not a silent in-place renumber.
2. **[ALPEREN] `gateway-daemon.ts` generalize-vs-new-module.** Should the coordination daemon be `gateway-daemon.ts` itself, extended to also carry ApprovalBroker fan-out, or a new sibling module that both messaging and approval-relay sit under? This is an implementation-shape fork with real blast-radius on the messaging-connector code path.
3. **[ALPEREN] Auto-start posture.** Should the per-project coordination daemon auto-start on first need (e.g. first `deckent start`, or first approval-needing action) by default, or stay strictly opt-in behind an explicit `deckent daemon start` / config flag? This interacts directly with ADR-G-030's consent-gating discipline — auto-starting a background process without an explicit user action is a meaningfully different trust posture than today's `bot start`, which the user invokes by name.
4. **[ALPEREN] OS-service registration — ever in scope?** Does deckent deliberately stay "detached user-space process only, no OS service" forever (matching `bot-daemon.ts`'s current honest limitation — no reboot survival), or is systemd/launchd/Windows-Service registration a real future goal for SOME tier of user (e.g. an enterprise "always-on" deployment)? If the latter, that is closer to Option A and should be scoped as its own follow-up ADR per Phase 3, not folded into this decision now.
5. **[ALPEREN] Future per-machine-supervisor trigger.** What signal (usage telemetry threshold? explicit enterprise-tier request? a specific number of concurrently open projects?) should trigger evaluating Phase 3 (a per-machine supervisor atop Option C)? Left undefined here deliberately — Alperen may prefer "revisit only when asked" over a pre-committed metric.

---

## References / Absorbed

- **Absorbs:** — (new document; no legacy ADR-NNN predecessor).
- **Settled floors reaffirmed, not re-decided here:** ADR-G-001 (Layered Config & Scope Precedence — `src/core/config.ts:1446-1487`); ADR-G-017 (Multi-Project Isolation — `docs/adr/adr-g-017-multi-project-isolation.md:15,98` "multi-project ≠ multi-tenant"); ADR-D-002 (STATE-RESOLVER work-item, `src/core/state-paths.ts`); ADR-G-030 (Consent-Based Provisioning & Install — `docs/adr/adr-g-030-consent-based-provisioning.md:30,39,61` no-silent-sudo, consent-gated); ADR-G-031 (Enterprise Foundation — future modular multi-tenancy layer, cross-ref only, not read in depth for this document).
- **Sibling document (file-location axis, not duplicated here):** `docs/design/onb-global-install.md` (Sprint 361-008) — its own §8 ADR draft covers "where do global files live on disk" (flat vs platform-correct XDG/AppData/Library); `src/core/global-scope-resolver.ts`, `src/core/global-store.ts` (Sprint 362-010), `src/core/global-config.ts`, `src/core/state-paths.ts`.
- **Existing daemon precedent (this document's Option C foundation):** `src/connectors/gateway/gateway-daemon.ts` (152 lines), `src/connectors/bot-daemon.ts` (112 lines, header comment on reboot-survival honesty, `botPidPath` per-project pid file), `src/core/daemon-hygiene.ts` (354 lines, `detectStaleDaemons` pure detector + `listDeckentProcesses` injectable cross-platform adapter, Sprint 331 B-ZOMBIE), `src/core/pid-liveness.ts` (portable no-throw liveness check, Sprint 178).
- **Install-model evidence:** `package.json:6-9` (`bin.deckent`, `bin.deckent-mcp`); `docs/guide/installation.md:24-44` (npx zero-install / `npm install -g` — both CLI-invocation models).
- **Direction driver:** ADR-G-034 (terminal as primary, conversational, tool-driven surface) and ADR-G-020 (runtime-wide multi-channel approval authority); these are the concrete requirements that make the daemon-vs-CLI axis undecidable-by-silence any longer.
- **MASTER-PLAN:** Row-200 (ONB-GLOBAL, P0, "kesinlikle revize edilecek") — this document is the daemon-vs-CLI sub-decision of that row; the file-location sub-decision (361-008/362-010/363-006) is separate and already in-flight toward its own ADR acceptance.
- **Born work-items (not yet filed in MASTER-PLAN, pending Alperen's acceptance of this ADR):** ONB-GLOBAL-DAEMON-CORE (Phase 1 — extract/generalize the coordination-daemon module), ONB-GLOBAL-APPROVAL-WIRE (Phase 2 — wire approval emitters + channel subscribers through it), ONB-GLOBAL-DAEMON-SUPERVISOR-EVAL (Phase 3 — future per-machine supervisor evaluation, gated on usage signal per Open Question 5).
