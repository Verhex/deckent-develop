# Deckent — Product Roadmap

> **"Install it. Run it. Own it."**
>
> Deckent is an AI agent orchestration tool that lives on your machine, runs your sprints, and never calls home.

## What Deckent Is

Deckent is a **local-first, open-source CLI tool** for AI-powered sprint orchestration. You install it once and it works — on your laptop, in your CI pipeline, inside Docker, on WSL2, on a friend's Linux server with no internet access beyond your AI provider.

There is no dashboard at `deckent.app`. There is no account to create. There is no monthly subscription. There is no cloud that knows your tasks. There is no oncall team that pages when "the service is down", because there is no service.

**Two commands to start your first sprint:**

```bash
npx deckent init
deckent start
```

That's it. No signup. No API key for Deckent itself. No credit card. If you have Claude Code authenticated, you're already running.

---

## The Four Immovable Principles

These principles define what Deckent is. They are not slogans — they are architectural constraints that shape every feature decision. See ADR-033 for the formal record.

### 1. Product, Not Service

Deckent is software you install, not a service you subscribe to. Every feature must work without a Deckent server, Deckent cloud, or Deckent API. If a feature requires calling a Deckent-controlled endpoint, it does not ship.

### 2. Install-and-Run Easy

The first experience must be excellent. A developer who has never heard of Deckent should be able to run their first sprint in under five minutes, starting from zero. Wizard-first onboarding, interactive setup, sensible defaults — no configuration required to get started.

### 3. Open Source, Free Forever

Every feature is available to every user. No "pro" tier. No "team" plan. No enterprise edition with extra agents. The codebase is MIT-licensed. Contributions welcome. Forks encouraged.

### 4. For Everyone, Everywhere

macOS, Linux, WSL2, Docker, CI runners. Turkish and English interfaces. Works on slow connections (local AI model support on the roadmap). Works offline when your AI provider is local. No platform assumptions.

---

## Sprint 134-145 Roadmap

Each sprint is approximately 30-60 minutes of Deckent orchestrating its own development. The roadmap below reflects confirmed work items and planned priorities. Details change — the direction does not.

| Sprint | Theme | Key Deliverables | Status |
|--------|-------|-----------------|--------|
| **134** | Triple Dogfooding + Max Load + Product Vision Launch | Task dependency pipeline (T-001), scope parser hardening (T-002), stale heartbeat fix (T-003), baseline honesty checker (T-005), token pipeline fix (T-006), ADR-033 product vision (T-007), ADR-034 multi-project isolation (T-012), god object split phase 1 sprint-reporter (T-009), god object split phase 2 sprint-controller (T-010), local observability Level 2 (T-011), self-audit gate (T-014), RETRO rubric detail (T-013) | **Active** |
| **135** | Setup Wizard + First-Run Experience | Interactive `deckent init` wizard, provider detection, model tier auto-config, first sprint guided walkthrough, README-first documentation rewrite | Planned |
| **136** | Local Model Support (Phase 1) | Ollama provider adapter, local model registry entries, tier mapping for llama-3.3/qwen2.5/mistral, offline sprint capability, no-internet test suite | Planned |
| **137** | Cross-Platform Hardening | Windows native support (non-WSL), Docker backend stability, CI runner first-class support (GitHub Actions, GitLab CI, CircleCI), path normalization across platforms | Planned |
| **138** | Distribution + Package Quality | `npm publish` automation, provenance attestation, SBOM generation, signed releases, `npx` zero-install verification matrix, homebrew tap draft | Planned |
| **139** | MCP Tool Completeness | Full MCP tool parity with CLI, resource subscription model, streaming status updates, IDE extension protocol improvements | Planned |
| **140** | Observability Level 3 | Web-based local dashboard (no cloud), metrics history, sprint comparison charts, agent performance trends, cost tracking per sprint | Planned |
| **141** | i18n Expansion | Japanese (JA), German (DE), Spanish (ES) support — `patternsByLang` expansion, locale-aware reports, community translation workflow | Planned |
| **142** | Multi-Project Workspace | Per-project isolation refinements (ADR-034 implementation depth), global config inheritance, workspace manifest, `deckent ls` across projects | Planned |
| **143** | Agent Evolution Pipeline | Temp-to-permanent agent promotion UI, community agent registry (local-first, no central server), agent skill recommendation engine | Planned |
| **144** | Sprint Intelligence V2 | Adaptive task splitting based on historical data, cross-sprint pattern learning, effort estimation calibration, retry strategy auto-tuning | Planned |
| **145** | v1.0 Launch Prep | API surface stabilization, breaking change freeze, migration guide from 0.x, full documentation audit, community contributor onboarding guide | Planned |

---

## Competitive Landscape

Deckent occupies a unique position: **open-source CLI sprint orchestration with local-first AI**. Here is how we view the ecosystem.

### Devin — KARŞI (Against)

**Position:** SaaS-based autonomous coding agent with cloud execution.

**Why we differ:** Devin requires a subscription, runs in Cognition's cloud, and you cannot self-host it. Task execution happens on servers you do not own. This is the exact model Deckent refuses. Devin is powerful for teams who want a managed service — Deckent is for developers who want ownership.

**What we learn from Devin:** Autonomous multi-step task execution is the right direction. Deckent's sprint model validates this. The difference is where execution happens.

| Dimension | Devin | Deckent |
|-----------|-------|---------|
| Deployment | Cloud-only | Local-only |
| Cost | Subscription (SaaS) | Free (MIT) |
| Data ownership | Cognition's servers | Your machine |
| Self-hostable | No | Yes (it's just your terminal) |
| Offline capable | No | Yes (with local AI) |

### OpenHands — MÜTTEFİK (Ally)

**Position:** Open-source AI software development agent, self-hostable.

**Why we align:** OpenHands is MIT-licensed, self-hostable, and community-driven. Their work on multi-agent coordination and AI coding tooling is complementary to Deckent's sprint orchestration model. We follow their research on agent sandboxing and tool use patterns.

**Deckent vs OpenHands:** Deckent focuses on **sprint lifecycle management** — PLAN → SPAWN → EVALUATE → RETRO — with structured DIRECTIVES format and a built-in agent/skill registry. OpenHands focuses on single-session task completion with a browser-based UI. These are complementary tools, not competitors.

**Potential collaboration:** OpenHands agents could be Deckent workers; Deckent's sprint structure could wrap OpenHands sessions.

### OpenClaw — REFERANS (Reference Model)

**Position:** Open-source Claude Code wrapper with Docker sandboxing.

**Why it's our reference:** OpenClaw exemplifies the "install-and-run" philosophy. Clone the repo, run one command, and you have a sandboxed AI coding environment. No accounts. No cloud. No friction. Deckent's distribution goal is the same experience: `npx deckent init && deckent start` should feel as effortless as OpenClaw's setup.

**What Deckent adds:** Sprint lifecycle, multi-agent parallelism, structured evaluation (GO/NO-GO/TECH_DEBT), memory system, agent pool, skill registry, MCP integration. OpenClaw shows us the floor for install experience; Deckent builds the orchestration layer above it.

### Cursor — KARŞI (Against)

**Position:** AI-powered IDE with cloud-synced features and subscription model.

**Why we differ:** Cursor is IDE-centric and subscription-based. Its AI features depend on Cursor's servers and require an account. Deckent is terminal-native, project-portable, and works in any editor or no editor. Cursor's value proposition is "AI that knows your codebase in a rich GUI" — Deckent's is "AI that manages your development sprint from the CLI."

**What we learn from Cursor:** Context-aware AI (knowing the full codebase, git history, open files) dramatically improves task quality. Deckent's scope system and file-locking are our equivalent — workers get exactly the context they need, no more.

### GitHub Copilot — KARŞI (Against)

**Position:** Microsoft-backed AI code completion, tight IDE integration, enterprise-grade subscription.

**Why we differ:** Copilot is a real-time code completion tool with an enterprise distribution model. It requires a GitHub/Microsoft account, has paid tiers, and sends code context to Microsoft's servers. This is fundamentally incompatible with Deckent's local-first, free-forever principles.

**What we learn from Copilot:** Deep integration with developer workflow drives adoption. Deckent's MCP server and IDE extension strategy takes notes from Copilot's distribution, not its business model.

### Aider — MÜTTEFİK (Ally)

**Position:** Open-source CLI AI coding assistant, git-integrated, multi-provider.

**Why we align:** Aider is MIT-licensed, terminal-native, works with multiple AI providers, and requires no account beyond your AI API key. Its "map-reduce" approach to understanding codebases and its edit format conventions are solid engineering.

**Deckent vs Aider:** Aider is a **session-based pair programmer** — you work with it interactively. Deckent is an **autonomous sprint orchestrator** — you give it DIRECTIVES and it manages multiple agents in parallel. They solve different problems; a developer might use both in the same day.

**Potential collaboration:** Aider's LiteLLM multi-provider support could inform Deckent's provider abstraction layer.

---

## The "Install and Run" Experience Goal

The north star for every release is this scenario:

```
A developer finds Deckent on GitHub. They read the README for 3 minutes. They run:

  npx deckent init

An interactive wizard asks them 4 questions:
  1. Project name? (auto-detected from package.json)
  2. AI provider? [Claude / Codex / Gemini] (Claude if authenticated)
  3. Default model tier? [economy / standard / premium] (standard)
  4. Language? [EN / TR] (EN)

Then they write their DIRECTIVES:

  deckent set-directives "Fix the auth bug and add tests"

Then they start:

  deckent start

Workers spawn. Agents execute. Results evaluate. Retro writes.
Total time from discovery to first sprint complete: under 10 minutes.
```

Every feature decision is measured against this scenario. Does it make the path shorter? Does it reduce friction? Does it work without an account, a server, or a credit card?

If not, it waits.

---

## What Deckent Will Never Be

To be clear about the product boundaries:

- **Not a SaaS platform.** There is no `deckent.app` where you log in and run sprints. There never will be. (ADR-033)
- **Not cloud-hosted.** Deckent does not offer a "run in our cloud" option. Your tasks run on your machine. (ADR-033)
- **Not behind a paywall.** Every feature available in the repo is available to every user, forever. (ADR-033)
- **Not an enterprise edition.** There is no "Deckent Enterprise" with extra features. Open source is the only edition. (ADR-033)
- **Not multi-tenant SaaS.** Multi-project isolation means "one developer, multiple local projects" — not "10,000 users sharing one server." (ADR-034)
- **Not an IDE plugin** (primarily). The MCP server and IDE extensions are access layers, not the core. The core is the CLI.

---

## Contributing

Deckent is open for contributions. The best way to contribute:

1. **Run Deckent on a real project** and file issues for friction you encounter.
2. **Write a skill or agent** for your domain and share it (PR or community post).
3. **Improve the first-run experience** — wizard, docs, error messages, onboarding.
4. **Add a language** — `patternsByLang` in `content-generators.ts` + `I18nStrings` entries.
5. **Improve cross-platform support** — Windows native, Docker, unusual CI environments.

See `CONTRIBUTING.md` for code style, test requirements, and PR process.

---

## References

- ADR-033: Product Vision — `.brain/DECISIONS.md`
- ADR-034: Multi-Project Isolation — `.brain/DECISIONS.md`
- Sprint 134 Design Spec: `docs/superpowers/specs/2026-04-11-sprint-134-design.md`
- API Surface Contract: `.contracts/api-surface.md`
- Project Identity: `.deckent/workspace/IDENTITY.md`
- OpenClaw: reference install-and-run implementation
- OpenHands: open-source agent coordination research
- Aider: CLI-first AI coding, multi-provider reference
