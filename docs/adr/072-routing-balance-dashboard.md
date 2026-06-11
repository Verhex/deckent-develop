# ADR-072: Agent Routing Balance (Multi-Signal Scoring) + Dashboard API Auth Hardening

**Status:** accepted

**Date:** 2026-05-31

**Accepted:** Sprint 209

---

## Context

### Routing Imbalance (Sprint 208 observation)

Sprint 208 completed 16 tasks — 15 of them were routed to the `refactorer` agent. The root cause is a combination of two weaknesses in the routing pipeline:

1. **Coarse intent classification** — `intent-classifier.ts` was collapsing nearly every code task to `intent.primary: "implementation"`. Scope path signals (`src/api/`, `src/auth/`, `src/dashboard/`, etc.) were ignored, so intent carried no domain information.

2. **Single-signal agent scoring** — `routing-engine.ts` selected agents based primarily on their `implementation` activation weight. `refactorer` carries `impl@7`, `architect` carries `impl@6`; all domain-specific agents (api-builder, security-auditor, frontend-designer, data-engineer, devops-engineer) activate on `api`/`security`/`design`/`data`/`devops` intents respectively — intents that never surfaced.

The outcome: 15 built-in agents and 21 skills are registered, yet routing consistently converges on a single agent regardless of task domain. This wastes specialized capability and makes routing outcomes unpredictable as agent pools grow.

### Dashboard Auth-Disabled Dependency (F7-001 blocker)

The dashboard (`src/dashboard/`) and its backing API (`src/api/`) require `DECKENT_API_AUTH_DISABLED=1` to function in development. Without this flag the auth middleware rejects every request — including those from `localhost`. This is unsafe by design because:

- The flag is binary: either auth is fully disabled (insecure for any shared environment) or fully enabled (blocking for local dev).
- There is no automatic trust path for `localhost` callers that identifies them as the local developer without requiring a pre-issued token.
- The flag name implies "auth is broken" rather than "auth is appropriately relaxed for local dev".

The goal is a prod-safe default: localhost callers get a time-limited auto-injected token, remote callers must present a valid token, and `DECKENT_API_AUTH_DISABLED` becomes an optional override (not a prerequisite).

---

## Decision

### Part A — Intent Classifier Domain Enrichment

`intent-classifier.ts` is extended with scope-path and description-keyword signals that derive a domain-aware intent before falling back to `"implementation"`:

| Scope pattern | Derived intent |
|---------------|----------------|
| `src/api/`, `*/routes/`, `*/endpoint*` | `api` |
| `src/auth/`, `src/security/`, `*/guard*`, `*/middleware*` | `security` |
| `src/dashboard/`, `src/components/`, `*/ui/`, `*.tsx` | `design` |
| `src/db/`, `src/models/`, `*/migration*`, `*/schema*` | `data` |
| `.github/`, `Dockerfile*`, `docker-compose*`, `*/ci/`, `*.yml` CI paths | `devops` |
| `docs/`, `*.md` | `documentation` |
| (none matched) | `implementation` (unchanged fallback) |

The classifier inspects both `scope.directories` paths and description keywords. Domain enrichment is additive: existing intent categories are preserved, only the distribution changes.

### Part B — Multi-Signal Agent Scoring

`routing-engine.ts` gains a domain-match bonus layer applied after baseline activation scoring:

- When a task's derived intent matches an agent's declared domain (e.g. `api-builder` domain is `api`), the agent receives a **+3 domain-match bonus** on top of its activation score.
- `refactorer` and `architect` remain candidates for all tasks (they do not have a narrow domain) but no longer win by default when a domain-specific agent exists.
- Skill scoring is similarly extended: `api-builder` skill gets a boost for `api` intent, `security-specialist` for `security`, `react-specialist` for `design`, etc.
- The Sprint 205 fix (scoped temp-agent demotion) is preserved — temp agents without matching scope do not override built-in domain winners.

### Part C — Dashboard API Auth Localhost Auto-Inject

`src/api/auth.ts` is updated so that:

1. Requests from `localhost` / `127.0.0.1` / `::1` receive an automatically generated short-lived token (TTL: 1 hour) injected by the server middleware — no manual token provisioning required for local development.
2. Requests from non-localhost origins must present a valid `Authorization: Bearer <token>` header.
3. `DECKENT_API_AUTH_DISABLED=1` remains recognized as an escape hatch (CI environments, integration tests) but is no longer required for normal local dev usage.
4. Invalid or expired tokens from any origin are rejected with `401 Unauthorized`.

This matches the security posture of other local-dev tools: localhost is implicitly trusted for a short session, remote access requires explicit credentials.

---

## Consequences

**Positive:**
- Domain-aware routing distributes tasks across the full agent pool — api-builder, security-auditor, frontend-designer, data-engineer, and devops-engineer become active participants rather than dormant entries.
- `routing-distribution.mjs` (Sprint 209-005) can now surface meaningful agent diversity metrics; a single agent dominating >70% will generate a warning.
- Dashboard works out of the box for local dev without environment variable ceremony.
- `DECKENT_API_AUTH_DISABLED` flag becomes an optional CI/testing convenience rather than a mandatory prerequisite, improving default security posture.

**Negative:**
- Domain-match bonus (+3) is a heuristic. Tasks that straddle multiple domains (e.g. "secure API endpoint") may produce less deterministic routing — requires monitoring.
- Localhost auto-inject relies on request IP detection, which can be spoofed in some network configurations (reverse proxies, Docker bridging). This is acceptable for local dev but must be documented as a limitation.
- The intent-classifier path-matching is regex-based — edge-case paths may not match expected patterns. A future structured scope type (ADR-007 extension) would be more robust.

---

## Alternatives Considered

- **Single-signal scoring only:** Keep routing as-is (refactorer wins by impl@7). Rejected — 208 data shows this produces a degenerate distribution; the intent behind having 15 agents is meaningless if only one is ever selected.
- **Hard-coded agent override per task type:** Require DIRECTIVES to explicitly name the agent for every task. Rejected — defeats the purpose of automatic routing and increases sprint authoring burden.
- **Keep `DECKENT_API_AUTH_DISABLED` as-is:** The flag is already present and working. Rejected — it is a security anti-pattern (binary disable) and a usability blocker (required env var for normal local dev).
- **Full token-based auth from first request:** Require developers to pre-generate and supply an API token even for localhost. Rejected — adds friction for the most common use case (local dev) without meaningful security gain against the threat model (local attacker already has file system access).

---

## References

- Sprint 209 Task 1 — `src/core/intent-classifier.ts` (domain enrichment from scope paths)
- Sprint 209 Task 2 — `src/core/routing-engine.ts` (domain-match bonus scoring)
- Sprint 209 Task 3 — `src/core/agent-pool.ts` (impl score domain-aware balance)
- Sprint 209 Task 4 — `src/core/routing-engine.ts` (skill routing diversity)
- Sprint 209 Task 5 — `scripts/routing-distribution.mjs` (distribution report)
- Sprint 209 Task 6 — `src/api/auth.ts` (localhost auto-inject, prod-safe default)
- ADR-015: TaskRouter Module — 6-level routing
- ADR-028: Decision-Engine V1 → V2 Routing Migration
- ADR-041: Agent Taxonomy — Horizontal Skills vs Vertical Agents
- ADR-070: Brain Evaluation Integrity — Zero-Hard-Code Principle
- ROADMAP F7-001: API auth fix → Sprint 209-006 DONE
- ROADMAP F7-002: Dashboard live data parity → Sprint 209-007 IN PROGRESS

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (routing-dağılımı + local-dev-auth ürün davranışı).

**Re-verified:** Part-A domain-enrichment canlı (intent-classifier keyword+path patterns) ✓ · Part-B `DOMAIN_MATCH_BONUS = 3` (routing-engine:97) + `routing-distribution.mjs` ✓ · Part-C loopback-auto-trust (auth.ts:23/28, prod-safe) ✓ — **canlı-kanıt 2026-06-11 UX-denetimi:** `deckent serve` token auto-mint + dashboard'a otomatik enjeksiyon bizzat gözlendi.

**Gerçeklik-notu (ADR-041 Sprint-281 amendment'iyle aynı aile):** Part-A/B dengesizliği tek başına çözmedi — **Sprint 211'de nüks** (12/16 refactorer; memory `feedback_agent_routing_imbalance`). Çözüm katmanlı evrildi: **ADR-073** (routing live-validation + FIX-prompt enrichment) + **ADR-075** (skill→agent affinity) + **WM-7** `LANGUAGE_MISMATCH_PENALTY` (S254, polyglot-safe) + `routing-imbalance-guard` script. Bu ADR'nin +3-bonus'u zincirin ilk halkasıdır; dağılım-dengesi sürekli-izlenen hedef olarak kalır.

**Part-C evrimi:** localhost-auto-trust, **ADR-076** (auth-precedence + serve token-inject) ile olgunlaştı — bugünkü canlı davranış 076'nın token-inject akışıdır; bu ADR'nin prod-safe-default ilkesi korunur. md+db senkron (Alperen ADR-review).
