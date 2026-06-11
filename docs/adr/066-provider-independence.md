# ADR-066: Provider Independence — Multi-Provider Backend Parity

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-31

**Sprint:** Sprint 202 (foundation) + Sprint 203 (Docker provider-aware completion)

---

## Status

accepted — provider-free architecture completed across all backends (subprocess, tmux, Docker).

---

## Context

Deckent launched with Claude as the only supported AI provider. Over 200+ sprints of dogfood, three other providers were added — Codex (OpenAI), Gemini (Google), and Ollama (local) — but support was uneven:

| Backend | Claude | Codex | Gemini | Ollama |
|---------|--------|-------|--------|--------|
| subprocess | ✓ | ✓ | ✓ | ✓ (Sprint 202) |
| tmux | ✓ | ✓ | ✓ | ✓ (Sprint 202) |
| Docker | ✓ | ✗ | ✗ | ✗ |

The Docker backend (`spawn-backend-docker.ts`) had three hardcoded Claude assumptions:
1. **Binary:** `const claudeCmd = 'claude ...'` — always spawned the `claude` CLI regardless of model/provider
2. **Auth:** `~/.claude` volume mount — only Claude session auth was mounted into the container
3. **Image:** `Dockerfile.worker` installed only `@anthropic-ai/claude-code` — no Codex/Gemini CLI available

Additionally, the codebase had accumulated 10 hardcoded `?? 'claude'` default provider fallbacks, some of which were unjustified short-circuits rather than legitimate last-resort defaults. This made provider routing leaky — even when Codex or Gemini was configured, edge paths silently fell back to Claude.

---

## Decision

Provider independence is implemented in two sprint phases:

### Phase 1 — Foundation (Sprint 202)

1. **Ollama bootstrap** — `bootstrapFromCatalog()` added to startup wire; Ollama is now a first-class provider with model registry entries (local tier, HTTP transport, no API key required).
2. **Model registry** — `model-registry.ts` extended to 13 models across 3 providers + Ollama local. `getProviderForModel(model)` is the single source of truth for model→provider resolution.
3. **Hardcode reduction** — `?? 'claude'` occurrences reduced from 10 to ≤3. Remaining occurrences are legitimate last-resort config defaults with inline justification comments.
4. **Token quota** — `token-quota.ts` introduced to track token usage per provider per sprint.

### Phase 2 — Docker Provider-Aware (Sprint 203)

#### Provider Binary Selection (Task 203-001)

`spawn-backend-docker.ts` calls `getProviderForModel(model)` to determine the provider, then selects `providerBinary` accordingly:

| Provider | Binary | Notes |
|----------|--------|-------|
| `claude` | `claude` | Default; session auth via `~/.claude` mount |
| `codex` | `codex` | Requires `OPENAI_API_KEY` env var |
| `gemini` | `gemini` | Requires `GOOGLE_API_KEY` env var |
| `ollama` | HTTP curl | Special-case: container calls host Ollama via `host.docker.internal` |

The Docker command is constructed around `providerBinary` — no more hardcoded `claude` binary string.

#### Provider-Aware Auth (Task 203-002)

Container auth is provider-specific:

- **Claude** → `~/.claude` directory mounted read-only + session auth (subscription mode)
- **Codex** → `OPENAI_API_KEY` passed via `--env` (already in passthrough list at line 524; no mount needed)
- **Gemini** → `GOOGLE_API_KEY` passed via `--env` (same passthrough mechanism)
- **Subscription default** → when no API key env is present, falls back to Claude subscription auth

Auth selection is driven by `provider` field on the task, resolved before container startup.

#### Dockerfile Multi-CLI (Task 203-003)

`Dockerfile.worker` defaults to Claude-only (lean image). Codex and Gemini CLIs are opt-in via build args:

```dockerfile
ARG INSTALL_CODEX=false
ARG INSTALL_GEMINI=false
```

When `INSTALL_CODEX=true`, `@openai/codex` is installed during build. When `INSTALL_GEMINI=true`, the Gemini CLI is installed. This keeps the default image size minimal while enabling multi-provider Docker workers for teams that need them.

---

## Consequences

### Easier
- Any provider (Claude, Codex, Gemini, Ollama) can run in the Docker backend — full parity with subprocess/tmux backends
- `getProviderForModel()` is the single authoritative model→provider resolver across all backends
- Dockerfile default remains lean (Claude-only); multi-provider teams opt in via build args
- `?? 'claude'` fallbacks are documented and justified — no more silent routing surprises

### Harder
- Docker builds for multi-provider teams require explicit `--build-arg` flags when building the worker image
- Ollama in Docker requires `host.docker.internal` hostname resolution — Linux Docker hosts may need `--add-host=host.docker.internal:host-gateway` in the container run command
- Auth passthrough per provider must be kept in sync with the env passthrough list in `spawn-backend-docker.ts`

### Risks
- **Codex/Gemini CLI availability** — `@openai/codex` and the Gemini CLI package names may differ from what is published; the Dockerfile install is conditional with a comment noting this. Verify package names before enabling.
- **Ollama host networking** — Ollama HTTP path skips the binary dispatch entirely; if Ollama is not reachable from the container, the task fails with a curl error (not a clear provider error). A future ADR should address Ollama-in-Docker networking.
- **Remaining 3 `?? 'claude'` defaults** — these are legitimate final defaults (config layer, CLI entry point, recovery path) but must not increase. Any new `?? 'claude'` addition requires justification comment.

---

## Alternatives Considered

1. **Provider-specific Docker images** — one image per provider (`deckent-worker-claude`, `deckent-worker-codex`). Rejected: multiplies image maintenance burden; users would need to pull different images per sprint configuration.

2. **Single fat image with all CLIs** — always install claude + codex + gemini in one image. Rejected: image size ~3–4x larger; most users only need one provider; violates lean-default principle.

3. **Provider resolution at task-router level only** — keep Docker always-Claude, route multi-provider tasks to subprocess. Rejected: breaks the backend-agnostic contract; Docker backend must be a full peer of subprocess/tmux.

4. **Environment variable override without binary swap** — keep `claude` binary but pass `--provider` flag. Rejected: Claude CLI does not accept Codex or Gemini model endpoints; binary must match provider.

---

## References

- ADR-023 (Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri)
- ADR-027 (Hybrid Spawn Backend)
- Sprint 202 — F1-P0 provider-free foundation (Ollama + model registry + hardcode reduction)
- Sprint 203 — F1-P1 Docker provider-aware (binary selection + auth + Dockerfile build-args)
- `src/orchestra/spawn-backend-docker.ts` — Docker backend implementation
- `src/core/model-registry.ts` — `getProviderForModel()` canonical resolver
- `Dockerfile.worker` — ARG INSTALL_CODEX / ARG INSTALL_GEMINI build args
- `docs/reference/provider-free.md` — user-facing provider-free guide

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (multi-provider ürünün çekirdek vaadi).

1. **Konum-düzeltmesi:** canonical resolver `getProviderForModel` **`src/core/task-types.ts`'te** yaşar (docker backend `:12`'den import eder, `:322`'de kullanır) — model-registry.ts'te yalnız yorum-referansı vardır. Karar değişmedi; konum-bilgisi düzeltildi.
2. **🔴 Invariant-drift — `?? 'claude'` 3 → 9:** "≤3 kalmalı, artmamalı, her yenisi justification ister" sözleşmesi bozuldu — bugün **9 gerçek-kod occurrence** (provider.ts:889, config.ts:92, cross-verify-runner.ts:215, sprint-utils.ts:214, +5). `sprint-utils.ts:203`'ün kendi yorumu bile "tekrar `?? 'claude'` yazma, `getDefaultProviderName()` kullan" der. Fix: MASTER-PLAN "ADR-Analizi Türetilen İşler → **ADR-066-W**" (9'unu re-audit: azalt / justify-comment'le / `getDefaultProviderName()`'e konsolide; WM-5 provider-free hard-enforcement kalanıyla aynı aile).
3. **🟢 Mimari evrim (S248-254 + ADR-077 — auth-tablosunu süpersede eder):** Codex/Gemini artık yalnız "API-key-env" değil — **gerçek host-adapter worker'lar** (`isAdapterProvider` host-route, S248) + **per-provider OAuth/subscription mount'ları docker'da** (`~/.codex`, `~/.gemini`, S252 PSL-1 `ProviderCommandSpec`) + MF-2 lazy adapter re-bootstrap + **F1-CB billing-follows-auth** (subscription/local=$0). Ollama'nın docker-curl özel-vakası → **host-adapter default-route**'a evrildi (`wantsHostAdapter`). 8-fleet + OpenAI-compatible HTTP adapter = ADR-077. Bu ADR'nin "parity" kararı geçerli; auth/binary tabloları S203-dönemi snapshot'tır.

md+db senkron (Alperen ADR-review).
