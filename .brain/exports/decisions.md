# Architecture Decision Records (auto-generated)

## adr-001: TypeScript + ESM

**Status:** accepted

# ADR-001: TypeScript + ESM

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Use TypeScript with `"type": "module"` (ESM) as the project foundation.
**Context:** Deckent is a Node.js CLI tool. ESM is the modern standard, supported by Node 18+.
**Consequence:** All imports must use `.js` extensions. CommonJS interop via `esModuleInterop`.


---

## adr-002: Node16 Module Resolution

**Status:** accepted

# ADR-002: Node16 Module Resolution

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Use `"module": "Node16"` and `"moduleResolution": "Node16"` in tsconfig.
**Context:** TypeScript 5.2+ requires these to match. Node16 resolution enforces `.js` extensions and `package.json` exports.
**Consequence:** Explicit `.js` in all relative imports. No index file auto-resolution.

**Note:** `Node16` here is the **TypeScript module-resolution mode name, not a Node.js runtime pin**. It selects Node's native ESM/CJS resolution algorithm — stable since Node 16 and identical in Node 18/20/22+. The project requires Node `>=18` (`package.json` `engines`) and runs on current Node. With TypeScript 5.x, `Node16` is functionally equivalent to `NodeNext` for this codebase (which uses only `.js`-extension ESM imports); `NodeNext` would simply track future Node resolution changes automatically.


---

## adr-003: vitest over Jest

**Status:** accepted

# ADR-003: vitest over Jest

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Use vitest for testing.
**Context:** Native ESM support, faster startup, v8 coverage provider, compatible API.
**Consequence:** Tests in `tests/` directory, `vitest.config.ts` at root.


---

## adr-004: 3-Layer Config Merge

**Status:** accepted

# ADR-004: 3-Layer Config Merge

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Config loads in 3 layers: hardcoded defaults → `~/.deckent/config.json` → `.deckent/config.json`.
**Context:** Users need global defaults (plan type, language) and per-project overrides.
**Consequence:** `deepMerge` function handles nested object merge. Arrays are replaced, not merged. `undefined` values are skipped.

**Note:** This ADR records the original **3-layer** decision. At runtime an additional **environment-variable override layer** sits on top (e.g. `DECKENT_BRAIN_PROVIDER`, `DECKENT_MAX_WORKERS`), so the effective precedence is: defaults → `~/.deckent/config.json` → `.deckent/config.json` → **env overrides** (env wins). See `src/core/config.ts` and the "Config Layers" section of `docs/architecture/architecture.md` (Layer 4 — Environment Variables). Behavior unchanged; documentation alignment only.


---

## adr-005: Synchronous I/O

**Status:** deprecated

# ADR-005: Synchronous I/O

**Status:** deprecated

**Date:** 2026-04-16

---

> **Note:** Sprint 132 CRITICAL #1 — Senkron I/O hot path performans sorunlarına yol açtı. Yeni modüller async I/O kullanmalıdır.

**Decision:** Wave 2 modülleri (tmux, auditor, worker) senkron I/O kullanır.
**Context:** tmux komutları <100ms, lock dosyaları <1KB, auditor 30s cycle'da birkaç küçük JSON okur. Async overhead gereksiz.
**Consequence:** Tüm fonksiyonlar senkron. Gelecekte performans sorunları çıkarsa async'e geçilebilir.


---

## adr-006: spawnSync Security Pattern

**Status:** accepted

# ADR-006: spawnSync Security Pattern

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Tüm shell komutları `spawnSync(binary, [...args])` ile çalıştırılır, shell interpretation yok.
**Context:** Command injection riski sıfıra indirilmeli. Prompt ve diğer kullanıcı girdileri argument array olarak geçer.
**Consequence:** Template literal veya string concat ile komut oluşturmak yasak. Varsayılan kural: `{ shell: true }` kullanılmaz.

**Note (documented exceptions):** The `spawnSync(binary, [...args])` array-args rule is the default and is the security baseline. There are **deliberate, narrowly-scoped exceptions** where `shell: true` is used:
- `src/core/plugin-hooks.ts` — sandboxed plugin hook execution.
- `src/core/provider.ts` — Windows only, to resolve `.cmd`/`.ps1` wrapper binaries on `PATH`.

These exceptions never interpolate untrusted input into a command string (args remain arrays / fixed). Compliance is tracked by the ADR-006 check in `src/orchestra/authority-enforcer.ts` (compile-time scan; per ADR-037 V1.0 this is **advisory/soft** — it warns + emits, does not hard-block). Behavior unchanged; documentation alignment only.


---

## adr-007: SpawnOptions Interface

**Status:** accepted

# ADR-007: SpawnOptions Interface

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** `SpawnOptions { allowedTools?: string; autoApprove?: boolean }` tmux modülünde tanımlanır.
**Context:** Blueprint 15 gereği her ajan `--allowedTools` ile kısıtlanır. `autoApprove` ise `--dangerously-skip-permissions` ekler.
**Consequence:** Brain, worker scope'una göre allowedTools string'i hesaplar. SpawnOptions her spawn fonksiyonuna opsiyonel parametre olarak geçer.

**Note (evolution):** This is the original/foundational decision and remains accurate — `SpawnOptions` is still defined in the tmux module (`src/orchestra/tmux.ts`, re-exported via `src/orchestra/index.ts`). With multi-provider support the concept was **extended** (not replaced): `ProviderSpawnOptions` in `src/core/provider.ts` and `SpawnBackendOptions extends ProviderSpawnOptions` in `src/orchestra/spawn-backend.ts` (see ADR-017 MCP-Native Provider Adapters, ADR-027 Hybrid Spawn Backend). `allowedTools`/`autoApprove` semantics are unchanged. Documentation alignment only.


---

## adr-008: Brain Merkezi Import — Tek Yönlü Bağımlılık

**Status:** accepted

# ADR-008: Brain Merkezi Import — Tek Yönlü Bağımlılık

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Brain, projede diğer modülleri (tmux, auditor, worker) import eden TEK modüldür. Diğer modüller brain'i import etmez.
**Context:** Döngüsel import'lar Node.js ESM'de tanımsız davranışa yol açar. Brain orkestratör rolünde — tmux/auditor/worker'ı çağırır ama onlar brain'den bağımsız çalışır.
**Consequence:** `grep -r "from.*brain" src/orchestra/tmux.ts src/monitor/auditor.ts src/agents/worker.ts` her zaman boş sonuç vermeli. Yeni modüller eklenirken bu kural korunmalı.

**Note (current enforcement & refinement):** The enforced lint (`src/orchestra/authority-enforcer.ts`, ADR-008 check) specifically scans the **import direction `core/ → orchestra/`**: `core/` must not depend on `orchestra/`; the orchestra Brain layer is the only place that imports `orchestra/` internals — a broader rule than the original `from.*brain` grep. Per ADR-037 V1.0 this check is **advisory/soft** (warns + emits, does not hard-block). After the god-object split, `src/orchestra/brain.ts` is a thin re-export layer; the actual importer is `sprint-controller`, and `planner` imports only from `core/`. The canonical refined statement of these import rules lives in `CLAUDE.md` and `docs/reference/api-surface.md` (Module Import Rules). Behavior unchanged; documentation alignment only.


---

## adr-009: DEBT.md Markdown Tablo Formatı

**Status:** accepted

# ADR-009: DEBT.md Markdown Tablo Formatı

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** DEBT.md, 9 kolonlu markdown tablo formatında tutulur. Brain `parseDebtTable`/`generateDebtTable` ile programatik okuma/yazma yapar.
**Context:** DebtItem interface'inin tüm alanlarını (id, description, originTaskId, originSprintId, priority, sprintsOpen, resolved, resolvedInSprintId, createdAt) saklamalıyız. JSON yerine markdown tercih edildi çünkü git diff'lerde okunabilir.
**Consequence:** Tablo parse'ı `|` split + `slice(1,-1)` ile yapılır. Boş kolon değerleri korunur. Yeni kolon eklemek parse/generate'i güncellemeyi gerektirir.

**Note (superseded by Memory V2 — DB-first):** This ADR records the **V1 design** where `DEBT.md` was the hand-maintained source of truth. Under **Memory V2**, technical debt lives in `.brain/memory.db` (SQLite, entries with `type='debt'` — see `src/orchestra/debt-manager.ts`, `store.getByType('debt')`); `.brain/exports/debt.md` is now a **generated export**, not the source. The original `parseDebtTable`/`generateDebtTable` markdown model is superseded by `MemoryStore` (consistent with the Memory V2 model in `docs/architecture/memory-system.md` and `docs/reference/api-surface.md`). Behavior unchanged; documentation alignment only.


---

## adr-010: Tek Runtime Dependency — commander.js

**Status:** accepted

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

## adr-011: node:readline/promises — Built-in Prompt

**Status:** accepted

# ADR-011: node:readline/promises — Built-in Prompt

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** İnteraktif prompt'lar (text, select, confirm) için `node:readline/promises` modülü kullanılır.
**Context:** `inquirer` (1.2MB) veya `prompts` (200KB) eklemek yerine Node 18+ built-in API yeterli. Basit wrapper'lar (`promptText`, `promptSelect`, `promptConfirm`) tüm init wizard ihtiyacını karşılıyor.
**Consequence:** Rich UI (autocomplete, fuzzy search) yok. Gerekirse Phase 3 TUI'da `ink` veya `blessed` eklenebilir.


---

## adr-012: register\<Name\>(program) Pattern

**Status:** accepted

# ADR-012: register\<Name\>(program) Pattern

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Her CLI komutu kendi dosyasında tanımlanır ve `register<Name>(program: Command): void` fonksiyonu export eder.
**Context:** Tek dosyada tüm komutları tanımlamak bakım zorluğu yaratır. Ayrı dosyalar bağımsız test, kolay ekleme/çıkarma sağlar.
**Consequence:** Her CLI komutu `src/cli/commands/` altında kendi dosyasında; entry point (`src/cli/index.ts`) her biri için bir `register<Name>(program)` çağrısı yapar. Yeni komut eklemek: dosya oluştur + `index.ts`'e import + `register` çağrısı ekle. (Güncel komut/dosya sayısı drift-eğilimli olduğu için burada sabit yazılmaz — kanonik liste auto-generated `docs/reference/cli.md`'de; çapraz-kontrol: `grep -c 'register[A-Z][A-Za-z]*(program' src/cli/index.ts`.)


---

## adr-013: DECKENT.md Adapter Pattern (Sprint 15)

**Status:** accepted

# ADR-013: DECKENT.md Adapter Pattern (Sprint 15)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** CLAUDE.md'yi init sırasında overwrite etmek kullanıcı değişikliklerini kaybettiriyordu.

**Decision:** DECKENT.md = tek gerçek kaynak. CLAUDE.md ve AGENTS.md adaptör dosyalar — sadece `@DECKENT.md` referansı enjekte edilir (ensureDeckentImport). Asla üzerine yazılmaz.

**Consequences:**
- Init idempotent ve güvenli
- Kullanıcının CLAUDE.md özelleştirmeleri korunur
- Gelecek provider'lar (Codex, Gemini) için adapter pattern genişletilebilir
- `deckent sync` komutu adapter'ları yeniden senkronize eder

**Note (realized):** The "extensible to future providers" consequence is now realized. Thin `@DECKENT.md` adapters exist for Gemini (`GEMINI.md`) and Codex (root `AGENTS.md`, optional `.codex/AGENTS.md`) alongside `CLAUDE.md` (Claude Code) and `.cursor/rules` (Cursor), all maintained via `ensureDeckentImport` (`src/core/utils.ts`) and `deckent sync` (`src/cli/commands/sync.ts`). `DECKENT.md` remains the single source of truth; adapters are never overwritten. Consistent with `DECKENT.md` and `CONTRIBUTING.md`. Behavior unchanged; documentation alignment only.


---

## adr-014: .deck Secret File System (Sprint 044)

**Status:** accepted

# ADR-014: .deck Secret File System (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Provider API key'leri .env'de tutmak proje .env dosyasıyla çakışıyordu. Kullanıcının mevcut .env içeriği DECKENT_ prefix'li key'lerle kirleniyor, .gitignore yönetimi karmaşıklaşıyordu.

**Decision:** Ayrı `.deck` dosyası oluşturuldu. DECKENT_ prefix'li key'ler bu dosyada tutulur. Init sırasında `.deck` otomatik olarak `.gitignore`'a eklenir.

**Consequence:** Worker'lar `.deck` içeriğini görmez. Brain sadece gerekli key'leri task scope'una göre inject eder. Kullanıcının .env dosyası hiç dokunulmaz.

**Note (evolution):** This records the original Sprint 044 decision. The `.deck` system has since grown (decision intent unchanged): (1) **`$DECK:KEY` config interpolation** — config values like `"token": "$DECK:DISCORD_TOKEN"` are resolved at runtime from `.deck` (`src/core/deck-interpolation.ts`, `src/core/deck-file.ts`); (2) **Ed25519 signing** — `src/core/signature.ts` uses `@noble/ed25519` + `@noble/hashes` for secret/skill-publish signatures. Per the ADR-010 Amendment, those two crypto dependencies are governed by this ADR. Behavior unchanged; documentation alignment only.


---

## adr-015: TaskRouter Module — 6-level routing (Sprint 044)

**Status:** accepted

# ADR-015: TaskRouter Module — 6-level routing (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Task → provider atama mantığı sprint-controller'da inline'dı ve genişletilemezdi. Yeni routing kuralı eklemek sprint-controller'ı her seferinde değiştirmeyi gerektiriyordu.

**Decision:** Ayrı `TaskRouter` modülü oluşturuldu. 6 seviyeli öncelik sırası: config → force → agent → skill → worker → fallback.

**Consequence:** Yeni routing kuralları sprint-controller'a dokunmadan eklenebilir. Her seviye bağımsız test edilebilir. Router, task metadata'sını (model, effort, scope) okuyarak otomatik provider seçimi yapar.

**Note (evolution):** The `TaskRouter` module is still current — `src/orchestra/task-router.ts` (`routeTask`, `TaskRouterConfig`) performs per-task provider + agent + skill routing. The **agent/skill selection it delegates to evolved to v2**: `src/core/routing-engine.ts` (`routeTaskV2`) "replaces `selectAgent()` + `selectSkills()` with a unified, intent-based decision" (3-layer: intent-classifier → activation-engine → routing-engine) per **ADR-028 (Decision-Engine V1→V2)**, default since Sprint 067. The original 6-level priority (config → force → agent → skill → worker → fallback) remains the foundational design. Behavior unchanged; documentation alignment only.


---

## adr-016: Connector Module — provider lifecycle (Sprint 044)

**Status:** accepted

# ADR-016: Connector Module — provider lifecycle (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Provider'ların sağlık durumu sadece bootstrap'ta kontrol ediliyordu. Sprint sırasında provider düşerse tespit edilemiyordu.

**Decision:** `Connector` class ile runtime health check, lazy init ve auditor entegrasyonu sağlandı. Her provider bağlantısı Connector üzerinden yönetilir.

**Consequence:** Sprint sırasında provider düşerse auditor tespit eder ve alert üretir. Lazy init sayesinde kullanılmayan provider'lar başlatılmaz. Connector, provider sağlık metriklerini `.dashboard`'a yazar.

**Note (terminology drift / evolution):** This recorded a Sprint 044 decision about **AI-provider health/lifecycle** via a `Connector` abstraction. That responsibility has since moved into `src/core/provider.ts` (`ProviderAdapter` interface with `isAvailable()`, the multi-provider registry) — see **ADR-017 (MCP-Native Provider Adapters)**. In the current codebase the term **"connector"** and the `src/connectors/` namespace mean **external messaging connectors** (`base-connector.ts`, `connector-pool.ts`): Discord (`discord.js`, an `optionalDependency`), Telegram (`telegraf`, a runtime dependency — mapped to this ADR by the ADR-010 Amendment), and WhatsApp. Behavior unchanged; documentation alignment only.


---

## adr-017: MCP-Native Provider Adapters (Sprint 045)

**Status:** accepted

# ADR-017: MCP-Native Provider Adapters (Sprint 045)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Codex/Gemini adapter'ları mock komutlar kullanıyordu. Gerçek CLI davranışı test edilemiyordu.

**Decision:** Gerçek CLI komutlarına geçiş: `codex exec --full-auto` ve `gemini -p --output-format json`. Adapter'lar gerçek binary'leri wrap eder.

**Consequence:** Gerçek provider'larla uçtan uca test mümkün. CI ortamında binary yoksa `describe.skipIf` ile testler atlanır. Mock adapter'lar yalnızca unit test scope'unda kalır.

**Note (current scope):** Verified accurate — `src/providers/codex.ts` emits `codex exec --full-auto … --model …`; `src/providers/gemini.ts` uses `gemini -p … --output-format json` and now also supports `--output-format stream-json` (NDJSON); integration tests use `describe.skipIf` (`tests/providers/{codex,gemini}-integration.test.ts`). Adapters live in `src/providers/{claude,codex,gemini,sandbox,subprocess}.ts` behind the `ProviderAdapter` interface + `ProviderRegistry` (`src/core/provider.ts`). Per the ADR-010 Amendment, this ADR is also the governing record for the `@modelcontextprotocol/sdk` runtime dependency (MCP server/client transport, `src/mcp/server.ts`). Behavior unchanged; documentation alignment only.


---

## adr-018: Multi-Environment Config Generation (Sprint 046)

**Status:** accepted

# ADR-018: Multi-Environment Config Generation (Sprint 046)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Her IDE/ortam farklı config dosyası bekliyor. Codex, Gemini, Cursor, VS Code farklı format ve yol tercihlerine sahip.

**Decision:** Ortam başına config generator: Codex → `config.toml`, Gemini → `settings.json`, Cursor → `mcp.json`. `deckent init --all-envs` tüm ortamları tek seferde hazırlar.

**Consequence:** Kullanıcı tek komutla tüm IDE entegrasyonlarını kurar. Her generator bağımsız modül, yeni ortam eklemek kolaylaşır. Mevcut config'ler üzerine yazılmaz, `writeIfNotExists` prensibi korunur.

**Note (evolved targets):** The per-environment generation decision still stands, but the concrete file targets converged on the **ADR-013 thin `@DECKENT.md` adapter** pattern (not the IDE-specific files originally proposed):
- Codex → `AGENTS.md` (not `config.toml`)
- Gemini → `GEMINI.md` (not `settings.json`)
- Cursor → `.cursor/rules/deckent.mdc` (not `mcp.json`)
- Claude → `CLAUDE.md`

Generators live in `src/cli/helpers/agent-templates.ts` (`generateAgentsMd`, `generateGeminiMd`, …); the never-overwrite guarantee is provided by `ensureDeckentImport` / `deckent sync` (ADR-013), superseding the original `writeIfNotExists` phrasing. Behavior unchanged; documentation alignment only.


---

## adr-019: Language-Agnostic Worker Verify (Sprint 046)

**Status:** accepted

# ADR-019: Language-Agnostic Worker Verify (Sprint 046)

**Status:** accepted

**Date:** 2026-04-16

---

> ✅ **Reconciliation note (Sprint 178, 2026-05-20).** The implementation gap
> previously flagged in this ADR has been closed. The codebase now implements
> the decision as written:
>
> - **`STACK_COMMANDS` map** lives in `src/core/stack-detector.ts` and covers
>   18 stacks: typescript, javascript, python, go, rust, java_maven,
>   java_gradle, kotlin_maven, kotlin_gradle, csharp, swift, c_cmake, c_make,
>   ruby, php, dart, flutter (and an empty-fallback path for `unknown`).
> - **`detectFullStack(projectRoot)`** (`src/core/stack-detector.ts`) returns
>   `FullStackResult { language, framework, buildTool, testFramework,
>   commands: { build, test, lint } }` using a 4-layer detection chain
>   (user override → exclusive marker → file-count weighted → fallback).
> - **Runtime verify is stack-aware:** `src/agents/worker-verify.ts` exports
>   `getVerifyCommands()`, `verifyCompilation()`, and `verifyTests()`; both
>   verify functions dispatch the stack-detected `build` / `test` command
>   (vitest gets the `--reporter=verbose` flag; other runners get the bare
>   command with optional scope args). Empty build/test commands are treated
>   as "skip — language not supported", returning success.
> - **Worker barrel** (`src/agents/worker.ts`) re-exports
>   `getVerifyCommands`, `verifyCompilation`, `verifyTests` so existing
>   imports remain stable.
> - **Coverage:** `tests/agents/worker-verify-lang.test.ts` (20 tests, all
>   GREEN as of Sprint 178) exercises TypeScript, Python, Java Maven /
>   Gradle, Go, Rust, C CMake / Make, plus failure paths and scope arg
>   forwarding.
>
> Per **ADR-037 V1.0** the verify loop remains advisory / prompt-driven
> rather than code-enforced (`enforceVerifyLoop`/`runTestVerifyLoop` retain
> their advisory call surface). That property is orthogonal to ADR-019 —
> ADR-019 only mandates that *when* the verify loop runs, it dispatches the
> correct stack command. Hard runtime enforcement is tracked separately
> under ADR-037 V2 (post-GA).

**Context:** Worker verify loop sadece `tsc --noEmit` ve `vitest run` çalıştırıyordu. TypeScript dışı projelerde Deckent kullanılamıyordu.

**Decision:** `STACK_COMMANDS` ile dil bazlı build/test komutu belirlendi: Python → `pytest`, Go → `go test ./...`, Rust → `cargo test`. `.deckent/project-stack.json` dosyasından stack okunur.

**Consequence:** Deckent TypeScript dışı projelerde de çalışır. Verify döngüsü stack-aware hale geldi. Yeni dil eklemek `STACK_COMMANDS` map'ine bir entry eklemekle yapılır.


---

## adr-020: Rich Sprint Output — 7-section summary (Sprint 044)

**Status:** accepted

# ADR-020: Rich Sprint Output — 7-section summary (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Sprint sonuç çıktısı tek satır metric'ti. Kullanıcı kaç task tamamlandı, hangi dosyalar değişti, ne öğrenildi gibi bilgilere erişemiyordu.

**Decision (intent):** Tek-satır metric yerine **zengin çok-bölümlü** sprint çıktısı; ANSI renk + `NO_COLOR` env var desteği.

**Consequence:** Her sprint sonunda kullanıcı tam resmi görür; `NO_COLOR` ile CI-friendly düz metin.

**Note (verified current structure — deep-checked):** The original "7 sections: Header / Results / Changes / Tests / Agents / Learnings / Next Steps" list is **stale**. As implemented today:
- **`RETRO.md`** (`src/orchestra/sprint-retro-writer.ts`) has **5 sections**: `## Summary`, `## Highlights`, `## Issues`, `## Metrics`, `## Learnings` (plus a `### Quality Dimensions` subsection). Highlights/Issues are emitted only when non-empty.
- **`.brain/sprints/sprint-NNN.md`** (`src/orchestra/sprint-docs-updater.ts`) is a **task-oriented log** (`## Task {id}: {title}` → `### Description`), *not* the same structure as the retro (the "same 7-section" claim no longer holds).
- **`NO_COLOR`** is honored — verified in `src/cli/helpers/splash.ts` (plain text when `NO_COLOR` set).

The rich-multi-section decision stands; the concrete section set evolved (canonical = the modules above + `deckent retro` / `deckent history` output). Behavior unchanged; documentation alignment only.


---

## adr-021: Kraken ASCII Brand Identity (Sprint 044)

**Status:** accepted


# ADR-021: Kraken ASCII Brand Identity (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Deckent'in görsel bir kimliği yoktu. CLI araçlarında ilk izlenim önemli.

**Decision:** Kraken ASCII mascot: teal gövde (#4DB8A4), bold-gold DECKENT yazısı (#C4A855), dim "AI Agent Orchestrator" tagline.

**Consequence:** Marka tanınırlığı artar. ASCII art sabit string olarak tutulur, runtime üretilmez.

**Note (verified — deep-checked vs `src/cli/helpers/splash.ts`):**
- **Path:** `src/cli/helpers/splash.ts` (not `src/cli/splash.ts`). `KRAKEN_ASCII` is a fixed `const` string; not generated at runtime — ✓.
- **Colors verified accurate:** `TEAL = \x1b[38;2;77;184;164m` → `#4DB8A4`; `BOLD_GOLD = \x1b[1;38;2;196;168;85m` → `#C4A855`; version + tagline dim.
- **Visibility gate:** splash is shown when **`config.output_splash` is true** (`showSplashIfEnabled` returns `null` otherwise) — not hard-wired to `--version`/`init`.
- **`NO_COLOR` correction:** with `NO_COLOR` set the splash is **NOT skipped** — `showSplash` returns the **plain-text** splash (Kraken + `DECKENT v<ver>` + tagline, no ANSI). There is **no `CI` env-var handling** in `splash.ts` (the original "NO_COLOR/CI → splash skipped" wording was inaccurate).

Behavior unchanged; documentation alignment only.


---

## adr-022: CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar

**Status:** accepted

# ADR-022: CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar

**Status:** accepted

**Date:** 2026-04-16

**Supersedes:** ADR-022 v1 (Sprint 067) — see **History** below

---

**Context:** Sprint 085'te MCP tool parametreleştirilmesi tamamlandı. `deckent_init`, `deckent_start`, `deckent_status`, `deckent_doctor`, `deckent_retro`, `deckent_history` araçlarına CLI karşılıkları olanlarla eşit parametreler eklendi. Ayrıca `deckent_agent_list` ve `deckent_skill_list` araçları CLI-only olan `deckent agent list` ve `deckent skill list` komutlarını MCP'ye getirdi.

**Decision:** CLI-only komutlar altyapı/terminal işlemleridir ve MCP'de yer almaz:
- **Altyapı:** `attach`, `spawn`, `watch` — tmux oturum yönetimi
- **Sunucu/UI:** `dashboard`, `web`, `serve` — arabirim başlatma
- **Kurulum:** `upgrade`, `onboard` — setup sihirbazları
- **Eklenti:** `plugin install`, `plugin list`, `plugin create` — eklenti yönetimi

MCP-only komut yoktur — her MCP aracının bir CLI karşılığı vardır. Ortak iş mantığı `src/core/` veya `src/orchestra/` altında paylaşılır; CLI (`register<Name>(program)`) ve MCP (`server.registerTool()`) yalnızca thin wrapper'dır ve aynı core fonksiyonu çağırır.

**Consequence:**
- Kullanıcı CLI'da yapabildiği her şeyi MCP (Claude Code, VS Code, JetBrains) üzerinden de yapabilir
- Parametre parity: tüm MCP araçları CLI komutlarıyla aynı giriş/çıkış şemasını kullanır
- Altyapı komutları (attach, web, serve, plugin) bilinçli olarak yalnız CLI'da tutulur
- README, CONTRIBUTING ve docs güncellenirken her iki taraf da sayılmalı

> **Note (point-in-time figures):** The Sprint 085 decision text quoted parity counts ("19 MCP = 19 CLI", "MCP 16→19", "CLI 32→33"). Those are **Sprint 085 snapshot values and are now outdated** — the principle (every MCP tool has a CLI counterpart; infra/UI commands are CLI-only) is what stands. Current canonical counts are auto-generated — see `docs/reference/cli.md` and `docs/reference/mcp-tools.md` (`npm run docs:ref`). Behavior unchanged; documentation alignment only.

---

## History — ADR-022 v1 (Sprint 067, superseded)

> Original decision, preserved for historical context. Superseded by the
> accepted decision above (Sprint 085).

**Status:** superseded

**Context (v1):** CLI'da 33+ komut, MCP'de 16 tool + 9 resource vardı. CLI'da olan bazı özellikler (spawn, attach, watch, agent, skill, plugin, onboard, upgrade, explain, finalize, dashboard, web, serve, archive-debt, quick-start, test-run, skill-marketplace) MCP tarafında yoktu. Kullanıcılar CLI'dan MCP'ye geçtiğinde özellik kaybı yaşıyordu. Ayrıca MCP tool'ları ile CLI komutları farklı kod yolları kullanıyordu — CLI doğrudan fonksiyon çağırırken MCP HTTP/stdio üzerinden wrapper çalıştırıyordu.

**Decision (v1):** CLI ve MCP tam özellik eşliği sağlanmalı; her yeni CLI komutu aynı zamanda MCP tool olarak da kaydedilmeli; ortak iş mantığı `src/core/`/`src/orchestra/` altında paylaşılan fonksiyonlarda, CLI ve MCP yalnız thin wrapper.

**Consequence (v1):** Kullanıcı CLI'daki her şeyi MCP üzerinden de yapabilir; test coverage iki kat artabilir; yeni özellik maliyeti artar (2 wrapper) ama tutarlılık garantilenir. (v2'de bu, "altyapı komutları intentional CLI-only" ile rafine edildi.)


---

## adr-022-v2: CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar (Updated Sprint 085)

**Status:** accepted

**Supersedes:** ADR-022 v1 (Sprint 067)

**Context:** Sprint 085'te MCP tool parametreleştirilmesi tamamlandı. `deckent_init`, `deckent_start`, `deckent_status`, `deckent_doctor`, `deckent_retro`, `deckent_history` araçlarına CLI karşılıkları olanyla eşit parametreler eklendi. Ayrıca `deckent_agent_list` ve `deckent_skill_list` araçları CLI-only olan `deckent agent list` ve `deckent skill list` komutlarını MCP'ye getirdi.

**Decision:** CLI-only komutlar altyapı/terminal işlemleridir ve MCP'de yer almaz:
- **Altyapı:** `attach`, `spawn`, `watch` — tmux oturum yönetimi
- **Sunucu/UI:** `dashboard`, `web`, `serve` — arabirim başlatma
- **Kurulum:** `upgrade`, `onboard` — setup sihirbazları
- **Eklenti:** `plugin install`, `plugin list`, `plugin create` — eklenti yönetimi

MCP-only komutlar yoktur — tüm MCP araçlarının CLI karşılığı mevcuttur.

**Tam Parity:** 19 MCP araç = 19 CLI komutu (Sprint 085 sonrası):
- Core: `init`, `set-directives`, `plan`, `start`, `status`, `doctor`, `retro`, `history`
- Management: `analyze`, `sync`, `config`, `usage`, `review`
- Execution: `run`, `kill`, `cleanup`
- Meta: `help`, `agent-list`, `skill-list`

**Consequence:**
- Kullanıcı CLI'da yapabildiği her şeyi MCP (Claude Code, VS Code, JetBrains) üzerinden de yapabilir
- MCP tool sayısı 16'dan 19'a çıktı (`deckent_agent_list`, `deckent_skill_list` eklendi)
- CLI komut sayısı 32'den 33'e çıktı (`set-directives` eklendi)
- Parametre parity: tüm MCP araçları CLI komutlarıyla aynı giriş/çıkış şemasını kullanır
- Altyapı komutları (attach, web, serve, plugin) sadece CLI'da tutulur, MCP'de eksik kalır intentional olarak

---

## adr-023: Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri (Sprint 072)

**Status:** accepted

# ADR-023: Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri (Sprint 072)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Plan tier isimleri Claude'a özgüydü: `max_plan`, `max5x_plan`, `pro_plan`. Bu isimler Codex ve Gemini kullanıcıları için anlamsızdı. Provider-agnostic bir CLI olarak Deckent, belirli bir sağlayıcıya atıfta bulunmamalı.

**Decision:** Tier isimleri genelleştirildi:
- `max_plan` → `performance` (en yüksek kalite, en yüksek maliyet)
- `max5x_plan` → `balanced` (kalite/maliyet dengesi)
- `pro_plan` → `economic` (düşük maliyet, temel görevler)
- `unlimited` korundu (sınırsız kullanım planları için)

Init wizard da güncellendi: "Select your Claude plan" → "Select your plan". Eski isimler geriye dönük uyumluluk için config migration'da alias olarak tanındı.

**Consequence:** Yeni kullanıcılar provider-agnostic terminoloji görür. Mevcut config'ler autoMigrateOnLoad ile otomatik güncellenir. Tüm belgeler yeni tier isimlerini kullanır. DECKENT.md ve CLAUDE.md provider.ts model equivalence tablosunu güncellenmiş tier isimleriyle gösterir.

**Note (verified vs `src/core/config.ts`):** `max_plan→performance`, `max5x_plan→balanced`, `pro_plan→economic` confirmed (alias map at `config.ts:75+`; `autoMigrateOnLoad` recognizes legacy names ✓). **Correction:** `unlimited` was **not preserved as a standalone tier** — it was remapped to **`api`** (`config.ts:78` → `unlimited: 'api'`, alias-only for backward compatibility). The canonical tier set is `VALID_MODES = ['performance', 'balanced', 'economic', 'api']` (`config.ts:91`); there is no live `unlimited` tier. Behavior unchanged; documentation alignment only.


---

## adr-024: sprint-controller.ts God Object Split — sprint-phases.ts Extract (Sprint 072)

**Status:** accepted

# ADR-024: sprint-controller.ts God Object Split — sprint-phases.ts Extract (Sprint 072)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** `sprint-controller.ts` 1300+ satıra büyüdü ve 8 sprint fazının tamamını içeriyordu. Bu durum bakım güçlüğü, yüksek cognitive load ve bağımsız test yazımını zorlaştırıyordu. Sprint 036'daki brain.ts split'inin ardından sprint-controller da god object haline geldi.

**Decision:** Sprint fazları `sprint-phases.ts` adlı yeni dosyaya çıkarıldı. `runSprint()` içindeki 7 faz fonksiyonu extract edildi:
- `runPlanPhase`, `runSpawnPhase`, `runEvaluatePhase`, `runFixPhase`
- `runRetroPhase`, `runDecayPhase`, `runCleanupPhase`

`sprint-controller.ts` orchestration mantığını korur, fazları import eder. Backward compatibility sprint-controller re-export layer üzerinden sağlandı.

**Consequence:** Her faz bağımsız olarak test edilebilir. `sprint-controller.ts` boyutu önemli ölçüde azaldı. Yeni faz eklemek veya mevcut fazı değiştirmek tek dosyayı etkiler. orchestra/ modül sayısı 36'dan 37'ye çıktı.

**Note (evolution):** This records the Sprint 072 **first step** — `sprint-phases.ts` exists and `sprint-controller.ts` shrank from 1300+ to ~780 LoC. The god-object split **continued well beyond this**: see **ADR-026 (God Object Split Stratejisi — Faz 1-3, Sprint 076)** plus `brain.ts` becoming a thin re-export layer. `orchestra/` now contains many dedicated `sprint-*` modules (`sprint-planner`, `sprint-spawner`, `sprint-finalizer`, `sprint-retro-writer`, `sprint-utils`, `sprint-checkpoint`, `sprint-metrics`, `sprint-lifecycle`, `sprint-docs-updater`, …); the original `runPlanPhase`/`runSpawnPhase`/… naming evolved into those modules' functions (`planSprint`, `spawnWorkers`, …). The "orchestra 36→37" figure is a Sprint-072 snapshot and is now far higher (drift-prone — canonical module counts are not pinned in ADRs). Behavior unchanged; documentation alignment only.


---

## adr-025: Graceful Shutdown Stratejisi — SIGINT → interruptActiveSprint (Sprint 076)

**Status:** accepted

# ADR-025: Graceful Shutdown Stratejisi — SIGINT → interruptActiveSprint (Sprint 076)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Kullanıcı Ctrl+C yaptığında veya process SIGINT aldığında, çalışan sprint aniden sonlanıyordu. Worker'lar temizlenmeden çıkıyor, task dosyaları yarım kalıyor, tmux sessionlar arka planda çalışmaya devam ediyordu. Bu durum .tasks/ dizininde stale heartbeat ve kilit dosyalarına yol açıyordu.

**Decision:** `entry.ts` içindeki SIGINT handler genişletildi:
1. `interruptActiveSprint()` çağrılır — aktif sprintin graceful shutdown koordinasyonunu yapar
2. `killAllSessions()` çağrılır — tüm tmux session'larını temizler
3. İşlem sırayla yapılır: önce sprint state kayıt, sonra session kill

**Consequence:** Ctrl+C sonrası temiz state bırakılır. Sprint INTERRUPTED olarak işaretlenir, review komutu bu durumu gösterir. Worker'lar SIGTERM sinyali alır ve kendi .hb dosyalarını DONE olarak işaretleyebilir. `deckent cleanup` sonrasında orphan dosya kalmaz.

**Note (verified — module locations):** Mechanism confirmed against code: `interruptActiveSprint()` is defined in `src/orchestra/sprint-lifecycle.ts` (marks task INTERRUPTED, aborts heartbeat, releases locks, kills workers); `killAllSessions()` lives in `src/orchestra/tmux.ts` ("Called on SIGINT for graceful shutdown"); the SIGINT handler is wired in `src/cli/entry.ts` (which exists alongside `src/cli/index.ts`). Behavior unchanged; documentation alignment only.


---

## adr-026: God Object Split Stratejisi — Faz 1-3 Tamamlandı (Sprint 076)

**Status:** accepted

# ADR-026: God Object Split Stratejisi — Faz 1-3 Tamamlandı (Sprint 076)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** `sprint-controller.ts` zamanla god object haline geldi (1300+ satır). Sprint 036'da brain.ts split'i yapılmıştı ama sprint-controller yeniden şişti. Test ve bakım güçlüğü arttı.

**Decision:** 3 fazlı kademeli split stratejisi:
- **Faz 1 (Sprint 072):** `sprint-phases.ts` — 7 sprint faz fonksiyonu extract edildi (`runPlanPhase`, `runSpawnPhase`, vb.)
- **Faz 2 (Sprint 075):** `sprint-utils.ts` — shared sprint utility fonksiyonları extract edildi
- **Faz 3 (Sprint 076):** `result-collector.ts` — `waitForResults()` ve IPC+fs.watch döngüsü extract edildi

Her fazda backward compatibility sprint-controller re-export layer üzerinden korundu.

**Consequence:** `sprint-controller.ts` orchestration koordinatörü rolüne döndü — iş mantığı bağımsız modüllerde. orchestra/ modül sayısı 37'den 47'ye çıktı. Her yeni modül bağımsız unit test kapsamı kazandı. Kademeli split stratejisi büyük refactor riskini minimize etti.

**Note (verified / evolution):** Faz 1-3 confirmed against code — `sprint-phases.ts`, `sprint-utils.ts`, `result-collector.ts` (`waitForResults` + IPC) all exist; `src/orchestra/brain.ts` is a ~53-line *"Slim Re-export Layer"* re-exporting from `sprint-controller.js` ✓. The split **continued past Faz 3** (many more dedicated `sprint-*` modules now — see the ADR-024 note). The "orchestra 37→47" figure is a Sprint-076 snapshot and is now far higher (drift-prone — canonical module counts are not pinned in ADRs; see `docs/architecture/architecture.md`). Behavior unchanged; documentation alignment only.


---

## adr-027: Hybrid Spawn Backend (Sprint 123, Revisited Sprint 139)

**Status:** accepted

# ADR-027: Hybrid Spawn Backend (Sprint 123, Revisited Sprint 139)

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Hibrit backend desteği **kalıcı olarak reddedildi** (Option B: reject). Mevcut tek-backend modeli yeterli ve Sprint 139 backend parity çalışması bu kararı güçlendirdi. `SpawnBackendFactory` docker → tmux → subprocess fallback zinciriyle TEK bir backend seçer; hibrit mod (worker Docker'da, auditor subprocess olarak) implementasyona alınmayacak.

**Context (Sprint 123 — Özgün):** Auditor scan loop `sprint-controller.ts` içinde in-process olarak çalışır — tmux/subprocess/docker backend'lerinden tamamen bağımsızdır. Worker'lar backend üzerinden spawn edilirken auditor dosya sistemi üzerinden `.hb` heartbeat dosyalarını okur. Auditor'ın backend seçimiyle hiçbir doğrudan bağlantısı olmadığından, hibrit mod için ayrı bir mekanizma gerekmez. Worker isolation Docker container'larıyla sağlanmaktadır.

**Sprint 139 Revisit Analizi:**

Sprint 139'da 3 backend'in (Docker, subprocess, tmux) E2E test coverage'ı tamamlandı ve aşağıdaki bulgular elde edildi:

1. **ADR-035 Event Stream (Sprint 138) hibrit gereksinimini ortadan kaldırıyor:** `.deckent/sprint-NNN-events.jsonl` append-only event stream tüm backend'lerin üzerinde ortak iletişim kanalı sağlıyor. Worker hangi backend'de çalışırsa çalışsın, auditor event stream'den okuyarak bağımsız doğrulama yapabiliyor. "Auditor'ın ayrı process olarak çalışması" senaryosu event stream sayesinde zaten çözüldü.

2. **3-backend parity (Sprint 139 Task 17-19):** Docker, subprocess ve tmux backend'lerinin her biri kendi E2E test suite'ine sahip. Her backend `SpawnBackend` arayüzünü tam olarak implement ediyor. Hybrid senaryosu için gereken "farklı backend'lerin birbirini tamamlaması" ihtiyacı yok — her backend zaten tam özellikli.

3. **Hibrit senaryosunun anlamsızlığı:** "Worker Docker'da, auditor subprocess olarak" senaryosu ADR-035 sonrasında gereksiz:
   - Auditor zaten in-process (sprint-controller içinde)
   - Event stream file-based olduğundan tüm backend'ler transparently mesaj üretiyor
   - Docker worker'lar shared `.tasks/` volume üzerinden heartbeat ve event yazıyor

4. **Complexity cost vs benefit:** Hibrit backend implementasyonu `SpawnBackend` interface'ini genişletmeyi, multi-backend lifecycle yönetimi eklemeyi ve `SpawnBackendFactory` sinyal koordinasyonu yazmayı gerektirir — zero user-visible benefit karşılığında ~400 LoC complexity.

5. **Product vision uyumu (ADR-033):** "Kur-çalıştır" prensibi konfigürasyon complexity'sini minimumda tutar. Kullanıcının "hangi backend'i ne için kullanayım?" sorusuna cevap vermek zorunda kalması ürün deneyimini kırar.

**Karar Rationale (Alperen'e Sunulan):**

| Seçenek | Değerlendirme | Karar |
|---------|--------------|-------|
| **Option A:** Sprint 140'ta hybrid implement et | ADR-035 event stream zaten bu ihtiyacı karşılıyor; ek complexity getirir, net fayda yok | **Reddedildi** |
| **Option B:** Kalıcı olarak reddet (tek backend at a time) | Mevcut model çalışıyor, test coverage tam, event stream entegrasyonu sorunsuz | **Kabul edildi** |
| **Option C:** Yeniden ertele | 3. deferred → kararsızlık işareti; net karar verilmeli | **Reddedildi** |

**Consequence(s):**
- Hibrit backend implementasyonu yapılmayacak — kalıcı karar.
- `SpawnBackendFactory` tek-backend-seçer semantiğini korur.
- Event stream (ADR-035) hibrit senaryosunun gerçek ihtiyacını (cross-backend observability) doldurdu.
- Sprint 140'ta backend ile ilgili çalışma olursa: mevcut 3 backend'in stabilizasyonu ve edge case fix'i üzerine yoğunlaşılır, hibrit mod değil.
- Distributed sprint execution ihtiyacı doğarsa (Sprint 145+), bu ADR revisit edilmeli ve event stream üzerine inşa edilen lightweight coordinator pattern değerlendirilmeli.

**References:**
- Sprint 123 özgün deferred kararı
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol — event stream hibrit ihtiyacı ortadan kaldırdı
- Sprint 139 Task 17: Docker E2E tests
- Sprint 139 Task 18: Tmux E2E tests
- Sprint 139 Task 19: Subprocess E2E tests (DONE — 33 test, 1.2s)
- ADR-033: Product Vision — complexity minimization principle


---

## adr-028: Decision-Engine V1 → V2 Routing Migration

**Status:** accepted

# ADR-028: Decision-Engine V1 → V2 Routing Migration

**Status:** accepted

**Date:** 2026-04-16

**Accepted:** Sprint 130

---

**Context:** Sprint 031'de keyword-based DecisionOrchestrator tasarlandı (6-step pipeline). Sprint 066'da intent-based V2 routing engine (routeTaskV2) ile değiştirildi.

**Decision:** V1 kod silinmeyecek — referans implementasyonu olarak korunacak. @deprecated ile işaretlendi.

**Consequences:** 4 kaynak dosya + 38 test maintained but unused in production. decision-logger.ts hâlâ V2 tarafından kullanılıyor.

**Note (verified vs code):** V2 confirmed — `routeTaskV2` in `src/core/routing-engine.ts`; `src/core/config.ts` defaults `routing_engine: 'v2'` and accepts `['v1','v2']` (V1 retained, selectable, `@deprecated`). Provenance: per `CLAUDE.md`/`IDENTITY.md` routing v2 has been the default since Sprint 067 (V2 introduced Sprint 066). The "4 source files / 38 tests" figures are a point-in-time snapshot (legacy V1 surface, not pinned). Behavior unchanged; documentation alignment only.


---

## adr-029: Managed-Docs Universalization — Sprint Lifecycle Template-Based Document Generation

**Status:** accepted

# ADR-029: Managed-Docs Universalization — Sprint Lifecycle Template-Based Document Generation

**Status:** accepted

**Date:** 2026-04-16

**Accepted:** Sprint 131

---

**Context:**
Önceki sprintlerde `sprint-reporter.ts` içindeki `updateProjectDocs()` fonksiyonu yalnızca hard-coded dokümanlara (CLAUDE.md, IDENTITY.md, README.md gibi) güncelleme yapabiliyordu. Kullanıcı kendi dokümanlarını (ARCHITECTURE.md, ONBOARDING.md, KPI dashboards) sprint döngüsüne dahil etmek istediğinde doğrudan `sprint-reporter.ts` kodunu değiştirmek zorunda kalıyordu. Bu durum:
- Kullanıcı konfigürasyonunu kaynak koduyla karıştırıyordu (separation of concerns ihlali)
- Her sprint sonrasında kullanıcı dokümanları stale kalıyordu
- Multi-language (TR/EN) proje dokümanları için tutarsız içerik üretiliyordu
- Plugin sistemi yok — yeni bölüm türü eklemek kaynak kodu değişikliği gerektiriyordu

Deckent'in hedef vizyonu "sprint lifecycle'ı herhangi bir proje türüne uygulayabilme" iken, doküman sistemi TypeScript mono-repo'ya hard-coded kalmıştı.

**Decision:**
`src/orchestra/managed-docs/` modül paketi oluşturuldu. Sprint finalizasyonunda `updateProjectDocs()` built-in updater'lardan sonra `runManagedDocUpdates()` çağırır. Sistem şu bileşenlerden oluşur:

1. **`.deckent/docs.json` konfigürasyon şeması** — `ManagedDocEntry` arayüzü: `path`, `autoSections`, `protectedSections`, `skills`, `maxLines`, `templates` alanları. Kullanıcı hangi dosyanın hangi bölümlerinin otomatik güncelleneceğini bildirir.
2. **`SectionGenerator` arayüzü** — `{ id, patterns, patternsByLang, generate(ctx) }`. Her generator bir bölüm başlığı deseni eşleştirir ve `DocUpdateContext`'ten markdown içeriği üretir.
3. **`content-generators.ts`** — 8 built-in generator: sprint-metrics, active-debt, sprint-history, agent-performance, changelog, test-coverage, module-map, dependencies. Generator registry runtime-extensible.
4. **`section-updater.ts`** — Mevcut dosyayı parse eder, sadece `autoSections` bölümlerini değiştirir, `protectedSections` ve kullanıcı içeriğini korur.
5. **`managed-doc-runner.ts`** — Orchestration: config okuma → user generator yükleme → cache kontrol → içerik üretimi → bölüm güncelleme → cache yazma.

Yeni doküman eklemek sıfır kaynak kodu değişikliği gerektirir — sadece `.deckent/docs.json` düzenlemesi yeterlidir.

**Consequences (+):**
- Kullanıcı herhangi bir markdown dokümanı sprint döngüsüne dahil edebilir
- `protectedSections` ile el ile yazılan bölümler hiç dokunulmaz
- `autoSections` match case-insensitive ve kısmi eşleşme destekler (TR/EN başlıkları)
- `templates` alanıyla built-in generator olmayan bölümler için `{{placeholder}}` syntax ile custom içerik tanımlanabilir
- `maxLines` ile uzun otomatik bölümler kırpılır

**Consequences (-):**
- `.deckent/docs.json` yoksa sistem hiçbir şey yapmaz — opt-in
- Büyük projelerde onlarca doküman için sprint bitişinde ek I/O yükü
- `section-updater.ts` markdown heading parse'ı stdlib yokluğundan regex-based — edge case'ler mümkün

**Alternatives Considered:**
- Hard-coded `sprint-reporter.ts` güncellemeleri — ölçeklenmez, kullanıcı özelleştirme yok, her yeni bölüm tipi kaynak kodu değişikliği gerektirir
- Harici template engine (Handlebars, Mustache) — runtime dependency, format vendor lock-in, ADR-010 minimal-dependency politikasıyla çelişir
- Ayrı CLI komutu (`deckent docs run`) — sprint döngüsüne entegre değil, kullanıcıların her seferinde manuel çağırması gerekir, tutarsız state riski
- Git-based template merge (patch stratejisi) — conflict resolution kompleks, merge çakışmaları kullanıcı deneyimini bozar

**Migration Impact:**
Mevcut projeler `.deckent/docs.json` oluşturmadan bu sistemi kullanmaz — backward-compat sağlanmıştır. İlk kez etkinleştirmek için `deckent docs add <path>` komutu veya dosyayı manuel oluşturmak yeterlidir.

**References:**
- Sprint 131 — feat: Managed Docs Universalization (commit hash omitted: pre-migration private-repo SHA, not resolvable in the public repo history)
- Kaynak: `src/orchestra/managed-docs/managed-doc-runner.ts`, `types.ts`, `docs-config.ts`
- Entegrasyon noktası: `src/orchestra/sprint-reporter.ts` → `updateProjectDocs()` → `runManagedDocUpdates()`

> **Note (verified):** Managed-docs system confirmed in code — `src/orchestra/managed-docs/` (incl. `docs-config.ts`) exists and `.deckent/docs.json` is present. Behavior unchanged; documentation alignment + repo-migration cleanup only (dead old-repo commit SHA removed).

---


---

## adr-030: Template Engine + Plugin Loader — Managed-Docs Render Pipeline

**Status:** accepted

# ADR-030: Template Engine + Plugin Loader — Managed-Docs Render Pipeline

**Status:** accepted

**Date:** 2026-04-16

**Accepted:** Sprint 131

---

**Context:**
Managed-Docs sistemi built-in `SectionGenerator`'ları sprint context'inden markdown üretir. Ancak bazı kullanıcılar:
- TypeScript yazmadan özel bölüm içeriği oluşturmak istiyor
- Proje-spesifik metrikler üretmek için kendi JavaScript mantığını çalıştırmak istiyor
- Farklı dillerdeki bölüm başlıkları için aynı generator'ı kullanmak istiyor

Built-in generator sistemi genişletilemez yapıda kalırsa, her yeni section türü `content-generators.ts` kaynak kodu değişikliği gerektirir.

**Decision:**
İki katmanlı extensibility sistemi tasarlandı:

**Katman 1: Template Renderer (`template-renderer.ts`)**
- `&#123;&#123;path.to.value&#125;&#125;` placeholder syntax — `DocUpdateContext`'e karşı çözümlenir
- `buildTemplateScope()` — sprint result, config, metrikler, agent/skill sayıları, paket versiyonu gibi standart değerleri scope'a ekler
- `resolvePath()` — nokta-ayrılmış yol üzerinden nested nesne/Map erişimi
- `renderTemplate()` — regex replace, unresolved placeholder → boş string (non-fatal)
- Konfigürasyon-level: `ManagedDocEntry.templates: Record<sectionTitle, templateString>`

**Katman 2: Plugin Loader (`plugin-loader.ts`)**
- `.deckent/generators/` dizininden kullanıcı generator'ları yüklenir
- **Format A — Declarative JSON** (`.json` uzantısı): `{ id, patterns, patternsByLang, template }` — güvenli, kod çalıştırmaz, `renderTemplate()` ile işlenir
- **Format B — Executable MJS** (`.mjs` uzantısı): `default export` olarak `SectionGenerator` — `loadUserGeneratorsAsync()` ile dinamik import, sprint pipeline'da *varsayılan olarak* çalışmaz (`--with-plugins` flag gerekir)
- User generator'lar built-in generator'lardan **önce** denenir (override semantiği)

Güvenlik kararı: JSON generator'lar `loadUserGeneratorsSync()` ile sync olarak sprint içinde çalışır; MJS generator'lar ise ayrı `loadUserGeneratorsAsync()` çağrısı gerektirir ve yalnızca güvenilen kaynaklardan yüklenmelidir.

**Consequences (+):**
- Template syntax öğrenme eğrisi düşük — `&#123;&#123;metrics.coveragePercent&#125;&#125;%` yeterli
- JSON format code review kolaylığı ve static analysis uyumluluğu sağlar
- MJS format güçlü extensibility (herhangi bir hesaplama yapılabilir)
- User generator'lar built-in'leri override edebilir — proje-spesifik davranış mümkün

**Consequences (-):**
- MJS generator'lar için güvenlik modeli geliştirilmemiş — keyfi kod çalıştırma riski
- `buildTemplateScope()` context-snapshot; generator çalışırken yeni değerler scope'a giremez
- `renderTemplate()` hata toleransı (unresolved → empty string) sessiz hataları gizleyebilir

**Alternatives Considered:**
- Sadece built-in generator'lar — extensibility yok, her özelleştirme PR gerektirir
- Tam template engine (Nunjucks, EJS) — ağır bağımlılık, XSS riski context-injection'da
- WebAssembly sandbox'lı plugin'ler — aşırı karmaşıklık, current requirements ötesinde

**References:**
- Sprint 131 — Template Engine + Plugin Loader (commit hash omitted: pre-migration private-repo SHA, not resolvable in the public repo history)
- Kaynak: `src/orchestra/managed-docs/template-renderer.ts`, `plugin-loader.ts`
- Güvenlik notu: MJS loader gelecekte `src/core/plugin-loader.ts` SkillSandbox entegrasyonuyla güçlendirilebilir (Sprint 133 Task 1)

> **Note (verified):** Confirmed in code — `src/orchestra/managed-docs/template-renderer.ts` and `plugin-loader.ts` exist (two-layer render pipeline as described). Behavior unchanged; documentation alignment + repo-migration cleanup only (dead old-repo commit SHA removed).

---


---

## adr-031: Content Hash Cache — Sprint Dokümanları Hash-Based Invalidation

**Status:** accepted

# ADR-031: Content Hash Cache — Sprint Dokümanları Hash-Based Invalidation

**Status:** accepted

**Date:** 2026-04-16

**Accepted:** Sprint 131

---

**Context:**
`runManagedDocUpdates()` her sprint bitişinde tüm konfigüre edilmiş dokümanlar için içerik üretimi çalıştırır. Büyük projelerde:
- 10+ managed doküman, her biri için built-in generator chain çalışır
- `readdirSync`, `readFileSync`, `JSON.parse` → her doküman için disk I/O
- AgentPoolManager, SkillPoolManager, modelRegistry instantiation → her bölüm üretiminde

Eğer sprint aralarında doküman içeriği ve konfigürasyon değişmediyse (örn. hotfix sprint — yalnızca küçük bug düzeltmeleri), tüm bu işlem gereksizdir.

Sprint 132 audit'i sync I/O'yu 799 kaynak satırda tespit etti. Cache olmaksızın managed-docs bu sayıyı her sprint'te anlamlı ölçüde artırır.

**Decision:**
**Dual-key SHA-1 cache** tasarlandı (`doc-cache.ts`):

- **Cache dosyası:** `.deckent/cache/managed-docs-cache.json` — `Record<docId, { entryHash, fileHash, updatedAt }>`
- **`entryHash`:** `ManagedDocEntry`'nin `autoSections + templates + protectedSections + maxLines` alanlarının JSON serialization hash'i — konfigürasyon değişikliklerini tespit eder
- **`fileHash`:** Hedef dosyanın mevcut içeriğinin hash'i — dışarıdan yapılan değişiklikleri (manuel düzenleme, başka araç) tespit eder
- **`contentHash(input)`:** `node:crypto` SHA-1, 40 hex karakter — çarpışma-güvenli yerel cache invalidation için yeterli
- **Cache skip mantığı:** `cached.entryHash === entryHash && cached.fileHash === fileHash` → `reason: 'cached_no_change'`, generator çalışmaz
- **Cache yenileme:** Doküman güncellendikten sonra yeni `fileHash` yazılır; hiç değişmese bile `updatedAt` güncellenir
- **Cache temizleme:** `clearDocCache()` → CLI `docs run --no-cache` tarafından çağrılır

**Consequences (+):**
- Değişmeyen dokümanlar için sıfır I/O — repeated sprint'lerde anlamlı hız farkı
- Cache dosyası küçük (doküman başına ~100 byte JSON), `.gitignore`'a eklenebilir
- İki ayrı key sayesinde konfigürasyon değişikliği veya dosya değişikliği ikisi de ayrı ayrı invalidation tetikler
- `--no-cache` escape hatch ile kullanıcı her zaman tam yenileme yapabilir

**Consequences (-):**
- SHA-1 artık kriptografik güvenlik için önerilmez — ancak burada yalnızca cache invalidation için kullanılıyor, güvenlik riski yok
- Cache dosyası stale olabilir (örn. generator mantığı kaynak kodda değiştiğinde) — major version bump'ta `clearDocCache()` çağrılmalı
- `node:crypto` ek I/O — ancak tek `createHash` çağrısı generator chain I/O'sunu geçemez

**Alternatives Considered:**
- mtime-based invalidation — symlink ve cross-filesystem mount'larda güvenilmez; WSL2 üzerinde mtime'lar zaman zaman tutarsız davranır
- MD5 hash — SHA-1 kadar hızlı, ancak SHA-1 Node.js `crypto` built-in API'de standart ve daha yaygın kabul görür
- In-memory cache (process lifetime) — Sprint restart'larında ve yeni terminal session'larında korunmaz; uzun-süren sprint'lerde tutarlı ama genel çözüm değil
- No cache — her sprint'te gereksiz I/O (rejected, Sprint 132 audit bulgusu: 799 sync I/O hot path)
- File watcher (fs.watch) — event-driven invalidation gereksiz karmaşıklık, doküman sayısı az, polling yeterli

**Cache Key Design Rationale:**
Dual-key (entryHash + fileHash) tasarımı şu senaryoları bağımsız olarak ele alır:
- Sadece konfigürasyon değişti (yeni autoSection eklendi) → entryHash değişir, rebuild gerekir
- Sadece dosya değişti (kullanıcı manual düzenledi) → fileHash değişir, rebuild gerekir
- İkisi de değişmedi → cache hit, rebuild atlanır
Tek-key (yalnızca fileHash) konfigürasyon değişikliklerini gözden kaçırırdı.

**References:**
- Sprint 131 — Content Hash Cache (commit hash omitted: pre-migration private-repo SHA, not resolvable in the public repo history)
- Kaynak: `src/orchestra/managed-docs/doc-cache.ts`, `managed-doc-runner.ts`
- İlgili: Sprint 132 Task 4 (loadConfig module-level cache) — benzer dual-key pattern, aynı motivasyon

> **Note (verified / evolution):** Dual-key cache (`entryHash` + `fileHash`) confirmed in `src/orchestra/managed-docs/doc-cache.ts` (`contentHash()`). **Extended in Sprint 166 (Bug S fix):** sprint-aware invalidation was added — caches are now forced-invalidated across sprints and pre-Sprint-166 cache entries are intentionally invalidated, so the original two-key model now has a third (sprint) dimension. Behavior unchanged; documentation alignment + repo-migration cleanup only (dead old-repo commit SHA removed).

---


---

## adr-032: i18n Pattern System — TR/EN İçerik Çeşitliliği Desteği

**Status:** accepted

# ADR-032: i18n Pattern System — TR/EN İçerik Çeşitliliği Desteği

**Status:** accepted

**Date:** 2026-04-16

**Accepted:** Sprint 131

---

**Context:**
Deckent TR ve EN kullanıcı tabanına sahip. Sprint 131 öncesinde:
- `content-generators.ts` built-in generator'ları yalnızca İngilizce başlık desenleri eşleştiriyordu
- Türkçe dokümanlar (`## Sprint Metrikleri`, `## Agent Performansı`) için generator match yoktu
- Sabit string'ler (tablo başlıkları, hata mesajları) EN-only hard-coded
- Kullanıcı Türkçe bölüm başlığı kullandığında generator hiç çalışmıyor, bölüm boş kalıyordu

Sprint 092'de `Dashboard i18n` implementasyonu (React tarafı) yapılmıştı; ancak server-side doküman üretim sistemi dil-agnostik hale getirilmemişti.

**Decision:**
İki katmanlı i18n stratejisi:

**Katman 1: `patternsByLang` — Dil-Spesifik Başlık Eşleştirme**
`SectionGenerator` arayüzüne `patternsByLang?: Record<string, string[]>` eklendi:
```typescript
{
  patterns: ['sprint metrics', 'metrics'],
  patternsByLang: {
    tr: ['sprint metrikleri', 'metrikler', 'sprint istatistikleri'],
    de: ['sprint-metriken', 'metriken'],
    es: ['métricas', 'estadísticas del sprint'],
  }
}
```
`findGenerator()` hem `patterns` hem tüm `patternsByLang` değerlerini birleştirerek arar. Konfigürasyon dil anahtarı kullanılmaz — tüm diller her zaman aranır (language-agnostic match). Bu yaklaşım mixed-language dokümanları da destekler.

**Katman 2: `I18nStrings` — Üretilen İçerik Lokalizasyonu**
`content-generators.ts` içinde:
- `I18nStrings` interface — tablo başlıkları, durum mesajları, hata string'leri
- `EN` ve `TR` sabit objeleri — compile-time derleme, runtime yük yok
- `i18n(ctx)` helper — `ctx.config?.language === 'tr' ? TR : EN` — EN default
- Her built-in generator `i18n(ctx)` çağırır: `const s = i18n(ctx)` → `| ${s.metric} | ${s.value} |`

Dil konfigürasyonu: `.deckent/config.json`'da `"language": "tr"` veya `"en"`. `buildStandaloneDocContext()` config.json'dan okur, sprint pipeline'da `ctx.config.language` üzerinden taşınır.

**Consequences (+):**
- Tüm built-in generator'lar TR ve EN çıktı üretir — zero configuration
- `patternsByLang` ile DE, ES, FR gibi yeni diller ekleme kolaylığı — tek obje değişikliği
- User-defined JSON generator'lar da `patternsByLang` kullanabilir — tam extensibility
- Mixed-language dokümanlarda hem Türkçe hem İngilizce başlıklar eşleşir

**Consequences (-):**
- Yalnızca TR ve EN tam string tablosu — DE/ES/FR için `patternsByLang` match yapar ama içerik EN çıkar
- `i18n()` helper context-based, statik — runtime dil değişimi desteklenmiyor (sprint restart gerektirir)
- Yeni built-in string eklemek hem `EN` hem `TR` objelerini güncellemeyi gerektirir — senkronizasyon riski

**Alternatives Considered:**
- ICU message format (i18next, formatjs) — ağır bağımlılık, Deckent minimal-dependency politikasıyla çelişir (ADR-010)
- Harici `.json` locale dosyaları — runtime file I/O, deployment karmaşıklığı
- Yalnızca İngilizce — TR kullanıcı deneyimini kırar, Deckent TR-first tasarım vizyonuyla çelişir
- Enum-based dil anahtarı yerine string — `'tr' | 'en'` union type daha iyi tip güvenliği sağlardı (gelecek iyileştirme)

**References:**
- Sprint 131 — i18n Pattern System (commit hash omitted: pre-migration private-repo SHA, not resolvable in the public repo history)
- Kaynak: `src/orchestra/managed-docs/content-generators.ts` (I18nStrings, EN, TR, i18n)
- Kaynak: `src/orchestra/managed-docs/types.ts` (`patternsByLang` field)
- İlgili: Sprint 092 Dashboard i18n (React tarafı), Sprint 084 i18n kapsam genişletmesi

> **Note (verified):** `patternsByLang` is present in `src/orchestra/managed-docs/types.ts` and the `I18nStrings`/`EN`/`TR`/`i18n()` localization layer in `content-generators.ts` — the two-layer i18n design described above is confirmed in code. (Line numbers dropped — drift-prone.) Behavior unchanged; documentation alignment + repo-migration cleanup only (dead old-repo commit SHA removed).

---


---

## adr-033: Product Vision — Product Not Service

**Status:** accepted

# ADR-033: Product Vision — Product Not Service

**Status:** accepted

**Date:** 2026-04-11

**Sprint:** 134

---

**Context:**
Deckent, Sprint 134 itibarıyla kritik bir kavramsal dönüm noktasına ulaştı. 130+ sprint sürecinde organik büyüme, zaman zaman "SaaS platform" ya da "kurumsal servis" yönünde baskı yarattı: cloud deployment fikirleri, paywall tartışmaları, enterprise tier düşünceleri, SOC2 sertifikasyonu önerileri. Bu baskıların tamamı tek bir tutarsızlık kaynağından besleniyor:

**Deckent'in ne olduğu hiçbir zaman formal olarak kayıt altına alınmamıştı.**

Kullanıcı deneyimi gözlemleri:
- Yeni geliştirici `npx deckent init && deckent start` ile <5 dakikada sprint başlatabilmeli
- Kurulum, lisans, bulut hesabı, API anahtarı, ödeme bilgisi gerektirmemeli
- Deckent offline çalışabilmeli (Claude Code local session ile)
- Her proje kendi `.deckent/` dizinine sahip — veri hiçbir yerde paylaşılmıyor

Sprint 133 post-mortem'de "product-not-service" ifadesi üç ayrı bağlamda kullanıldı ve herhangi bir şekilde formalize edilmedi. Sprint 134 DIRECTIVES bu boşluğu kapatmak için T-007'yi "DOKUNULAMAZ VİZYON" olarak işaretledi.

Referans bellek: proje hafızası — `memory.db` entry `project_vision_product_not_service` (Memory V2; `deckent recall "product not service"`)

**Decision:**
Deckent bir **üründür (product)**, **servis değildir (not service)**.

Bu kararın dört dokunulamaz prensibi:

1. **Product, not service** — Deckent bulutta yaşamaz. Kullanıcının makinesinde çalışır. Bir API endpoint'e bağımlı değildir. Sunucu yoktur, uptime SLA'sı yoktur, oncall ekibi yoktur.

2. **Kur-çalıştır kolay** — `npx deckent init && deckent start` iki komutla tam işlevsel bir sprint orkestrasyon sistemi kurulur. Kurulum friction'ı sıfıra yakın olmalıdır. Wizard, interaktif setup, README-first onboarding.

3. **Açık kaynak, ücretsiz** — Deckent'in hiçbir özelliği ödeme duvarının arkasında olamaz. Tüm core özellikler MIT lisansı altında. Topluluk katkısı teşvik edilir. Fiyatlandırma modeli yoktur.

4. **Herkese, her yerde** — macOS, Linux, WSL2, Docker, CI ortamları. Dil engeli yoktur (TR/EN i18n). Bant genişliği kısıtlı ortamlarda çalışır. Local model desteği roadmap'te.

**Kaldırılan / Yasak Boyutlar:**

Bu karar aşağıdaki yönlerin Deckent roadmap'inden kalıcı olarak çıkarıldığını ilan eder:

| Boyut | Neden Yasak |
|-------|-------------|
| SaaS model | Sunucu bağımlılığı yaratır, product kimliğiyle çelişir |
| Cloud-hosted deployment | Kullanıcı verisini dışarı taşır, gizlilik ilkesini kırar |
| Paywall / premium tier | Açık kaynak taahhüdüyle uyumsuz |
| Enterprise edition | İki kod tabanı yaratır, topluluk bölünmesine yol açar |
| SOC2 / ISO 27001 sertifikasyonu | Kurumsal servis modeli gerektirir, ürün kimliğiyle çelişir |
| Oncall / SLA / uptime monitoring | Servis sorumluluğu gerektirir — ürün mimarisinde geçersiz |
| Multi-tenant cloud infrastructure | ADR-034 ile net ayrım: multi-project ≠ multi-tenant SaaS |
| Subscription billing | Ödeme altyapısı = servis olmak demektir |
| Vendor lock-in | Belirli bir bulut sağlayıcısına bağımlılık kabul edilemez |

**Korunan / Güçlendirilen Boyutlar:**

Bu karar aşağıdaki yönlerin öncelikli geliştirme alanları olduğunu teyit eder:

| Boyut | Gerekçe |
|-------|---------|
| Local observability | Kullanıcı kendi sprint metriklerini kendi makinesinde görür (T-011) |
| God object split | Modüler, anlaşılabilir kod = ürün kalitesi (T-009, T-010) |
| Task dependency pipeline | Gerçek orkestrasyon zekası, ürün değer önerisi (T-001) |
| Distribution | `npx deckent` — sıfır kurulum, her yerde çalışır |
| Setup wizard | İlk deneyim mükemmel olmalı — kur-çalıştır hedefi |
| Local model support | Offline-first, API key gerektirmeyen sprint modu (roadmap) |
| i18n / TR-EN | Ürün her kullanıcıya kendi dilinde konuşur |
| Cross-platform | macOS + Linux + WSL2 + Docker = herkese her yerde |
| Açık kaynak ekosistemi | OpenHands, Aider, OpenClaw ile ittifak — değer paylaşımı |

**Consequences (+):**

- Tüm mühendislik kararları net bir lens üzerinden geçer: "Bu özellik local product deneyimini mi güçlendiriyor?"
- Roadmap tartışmalarında "SaaS yapalım mı?" sorusu geçerliliğini yitirir — ADR-033 referans gösterilir
- Katkıda bulunanlar ürün kimliğini anlar, yanlış yönlü PR'lar azalır
- OpenHands ve Aider gibi open-source CLI araçlarla ekosistem uyumu artar
- Kullanıcı trust'ı: veri asla dışarı çıkmıyor, garantisi var

**Consequences (-):**

- Gelecekte kurumsal gelir modeli kurmak isteyenler için kapı kapalı
- Hosting hizmeti sunmak isteyen community fork'ları bu ADR'a aykırı davranır
- "Managed Deckent cloud" gibi ticari girişimlerin core repo'ya merge edilmesi reddedilir
- SaaS rakiplerine karşı "anında erişim" avantajı kaybolur (kurulum gerekir, kayıt yok)

**Alternatives Considered:**

- **Freemium SaaS** — Ücretsiz tier + premium bulut özellikleri. Reddedildi: iki kimlik yaratır, açık kaynak taahhüdünü sulandırır.
- **Enterprise self-hosted** — Kurumsal lisans, on-prem deployment. Reddedildi: farklı destek altyapısı gerektirir, topluluktan kopuş başlar.
- **Hibrit model** — Core açık kaynak, bulut senkronizasyon eklentisi. Reddedildi: "her şey local" ilkesini kırar, veri akışı gizlilik sorusu yaratır.
- **Platform agnostik (karar erteleme)** — Şimdilik karar verme, her iki yöne açık kal. Reddedildi: belirsizlik mühendislik maliyeti yaratır, yanlış yönlü feature'lar birikmesine neden olur.

**References:**

- Sprint 134 DIRECTIVES — "DOKUNULAMAZ VİZYON" bölümü
- Proje hafızası: `memory.db` entry `project_vision_product_not_service` (Memory V2)
- ADR-034: Multi-Project Isolation (kardeş ADR — multi-project ≠ SaaS multi-tenant)
- ADR-010: Minimal Dependencies (bağımlılık minimizasyonu, product kimliğiyle uyumlu)
- `docs/vision/roadmap.md` — Halka açık yol haritası, product vizyonu pazarlama diliyle
- OpenClaw GitHub — kur-çalıştır referans implementasyon
- Sprint 134 design spec: `docs/superpowers/specs/2026-04-11-sprint-134-design.md`
- ADR-008: Module Import Rules — brain/worker sınır disiplini tek-kod-tabanı product kimliğini güçlendirir (SaaS servis katmanına ihtiyaç bırakmaz, community fork'lar aynı sınırları korur)

---


---

## adr-034: Multi-Project Isolation — Per-Project Security Boundaries

**Status:** accepted

# ADR-034: Multi-Project Isolation — Per-Project Security Boundaries

**Status:** accepted

**Date:** 2026-04-11

**Sprint:** 134

---

**Context:**

Deckent, tek bir kullanıcının aynı makinesinde birden fazla proje orkestre etmesini destekler. Her proje kendi `.deckent/`, `.brain/`, `.tasks/` dizinlerine sahiptir ve bu izolasyon fiilen var olsa da hiçbir zaman formal olarak tanımlanmamıştır.

**KRİTİK AYIRIM: multi-project ≠ SaaS multi-tenant.**

Bu ADR, aynı kullanıcının aynı makinede yan yana çalıştırdığı birden fazla proje arasındaki izolasyonu tanımlar. 10.000 tenant'ın paylaştığı bir sunucu senaryosu (SaaS multi-tenant) Deckent'in kapsamı dışındadır ve ADR-033 tarafından kalıcı olarak yasaklanmıştır.

Sprint 132 Week 1 güvenlik denetimi şu bulguları ortaya çıkardı:
- MEDIUM #10: Worker scope check'i symlink'leri takip etmiyor — `fs.realpath()` ile resolve edilmiş hedef path'in scope içinde olduğu doğrulanmıyor
- LOW #4: Sibling project dizinlerine erişim denetimi yalnızca scope matcher'a dayanıyor — scope dışı proje dosyalarına symlink oluşturularak bypass edilebilir
- LOW #7: Global `~/.deckent/config.json` hangi alanların paylaşıldığını, hangilerinin proje-özgü olduğunu belgelemiyor

Sprint 133'te implementasyonu tamamlanan AES-256-GCM per-project credential encryption bu izolasyonun temelini güçlendirdi; ancak scope bypass ve global state paylaşım kuralları formal olarak tanımlanmamıştı.

Tehdit modeli:
1. **Sibling project scope bypass** — Proje A'daki worker, `../proje-b/src/secret.ts` yoluna symlink oluşturup scope check'i geçerek Proje B'nin kaynak koduna erişir
2. **Credential leakage** — Global config'deki proje-özgü API anahtarları yanlışlıkla sibling proje tarafından okunur
3. **Global state pollution** — Bir proje'nin `.deckent/config.json` değişikliği global config'i etkiler, diğer projelerin davranışını değiştirir
4. **Symlink cycle DoS** — Recursive symlink'ler scope resolver'ı sonsuz döngüye sokar

**Decision:**

Deckent multi-project izolasyonu şu dört katmandan oluşur:

### Katman 1: Per-Project Directory Isolation (Mevcut, Formalize Ediliyor)

Her proje kendi bağımsız dizin yapısına sahiptir:
- `.deckent/` — proje konfigürasyonu, agent/skill pool, metric data
- `.brain/` — karar kayıtları, bellek, retrospektif, desenler
- `.tasks/` — sprint task dosyaları, heartbeat, result, lock
- `.locks/` — file lock dosyaları

Bu dizinler arasında cross-reference yoktur. Bir projenin `.brain/MEMORY.md`'si yalnızca o projenin sprint geçmişini içerir.

### Katman 2: Per-Project Credential Encryption

Sprint 133'te implementasyonu tamamlanan sistem:
- Her proje `.deckent/credentials.enc` dosyasına AES-256-GCM ile şifrelenmiş credential'lar saklar
- Encryption key per-project `projectRoot` path hash'inden türetilir
- Sibling proje'nin `.deckent/credentials.enc` dosyası farklı key ile şifrelenmiştir — çapraz okuma başarısız olur
- Decryption yalnızca proje dizini context'inde gerçekleşir

### Katman 3: Symlink-Aware Scope Enforcement

`isWithinScope()` fonksiyonu symlink-aware hale getirilir:
- `fs.realpathSync()` ile path resolve edilir — symlink hedef dosyanın gerçek konumu belirlenir
- Resolve edilmiş path scope matcher'a verilir
- Symlink hedefi scope dışındaysa → `ScopeViolationError` fırlatılır
- Recursive symlink (cycle) tespit edilirse → `ScopeViolationError` fırlatılır (`ELOOP` error code)

### Katman 4: Global vs Project-Specific Config Boundary

`~/.deckent/config.json` (global) ile `.deckent/config.json` (proje) arasında net ayrım:

| Alan | Scope | Paylaşım Kuralı |
|------|-------|------------------|
| `brain_provider`, `worker_provider` | Global OR Project | Proje override'ı tercih edilir |
| `max_workers` | Global OR Project | Proje override'ı tercih edilir |
| `brain_planning` | Global OR Project | Proje override'ı tercih edilir |
| `min_tier`, `mode_preset` | Global OR Project | Proje override'ı tercih edilir |
| `OPENAI_API_KEY`, `GOOGLE_API_KEY` | Environment | İşletim sistemi env var, config'de saklanmaz |
| `telemetry_enabled` | Hard-coded FALSE | ADR-033 gereği her zaman false |
| `verify_loop` | Project | Proje-özgü, global default true |
| `auto_archive_directives` | Project | Proje-özgü |
| Agent/skill pool | Project | Per-project `.deckent/agents/`, `.deckent/skills/` |
| Sprint history | Project | Per-project `.brain/sprints/` |

API anahtarları config dosyalarında saklanmaz — environment variable olarak iletilir. Bu, global config'in credential leakage vektörü olmasını engeller.

**Consequences (+):**

- Symlink scope bypass güvenlik açığı kapatılır (Sprint 132 MEDIUM #10)
- Per-project izolasyon kuralları formal ve test edilebilir hale gelir
- Global vs project config boundary belgelenir — yeni alan eklenirken hangi scope'a ait olduğu açıktır
- Credential isolation zaten AES-256-GCM ile sağlanıyor — bu ADR formalize eder
- "multi-project ≠ multi-tenant" ayrımı netleşir — yanlış yönlü PR'lar önlenir

**Consequences (-):**

- `isWithinScope()` artık `fs.realpathSync()` çağrısı yapar — her scope check'te bir disk I/O ekstra
- `realpathSync()` symlink hedefi silinmişse hata fırlatır — hata yönetimi gerekir
- Recursive symlink tespiti `ELOOP` error code'una dayanır — farklı OS'lerde davranış farkı olabilir
- Global config boundary kuralları yeni alan eklendiğinde güncellenmeli — yoksa belirsiz paylaşım kuralı oluşur

**Alternatives Considered:**

- **Sandboxed worker process** — Her worker'ı chroot/namespace ile izole et. Reddedildi: aşırı karmaşıklık, cross-platform uyumsuzluk (macOS chroot sınırlı), Deckent ürün kimliğiyle orantısız.
- **Yalnızca path normalization** — `path.normalize()` ile `..` segmentlerini çöz, symlink'leri ignore et. Reddedildi: hardlink ve symlink bypass'ı hâlâ mümkün.
- **Worker-level filesystem virtualization** — Sanal dosya sistemi katmanı. Reddedildi: Node.js native fs API uyumsuz, performans maliyeti yüksek.
- **Yalnızca dökümantasyon** — İzolasyon kurallarını belgeleyip enforce etme. Reddedildi: güvenlik açığı açık kalır, audit bulgusu kapatılmaz.
- **Docker isolation per project** — Her projeyi ayrı container'da çalıştır. Reddedildi: Docker dependency = kurulum friction, ADR-033'ün "kur-çalıştır" ilkesiyle çelişir.

**References:**

- Sprint 132 Week 1 güvenlik denetimi — MEDIUM #10 (symlink scope bypass)
- Sprint 133 credential encryption implementasyonu (AES-256-GCM per-project)
- ADR-033: Product Vision — Product Not Service (multi-tenant yasağı)
- ADR-004: 3-Layer Config Merge (global vs project config mekanizması)
- `src/agents/worker.ts:isWithinScope()` — symlink-aware scope check implementasyonu
- `docs/design/multi-project-isolation.md` — detaylı tasarım dokümanı ve test stratejisi

---

> **Note (verified vs code + ADR-037 V1.0):**
> - **Katman 2 (AES-256-GCM) confirmed:** `src/core/credential-encryption.ts` (`ALGORITHM = 'aes-256-gcm'`, `createCipheriv`) + `src/core/credentials.ts` — a real per-project credential-encryption system, distinct from the `.deck`/Ed25519 system of ADR-014.
> - **Katman 3 (symlink-aware scope) — accuracy correction:** The symlink resolution **is** implemented — `isWithinScope()` (`src/agents/worker.ts`) calls `realpathSync()` and returns a **boolean**. However, it does **not** itself throw `ScopeViolationError`, and per **ADR-037 V1.0** runtime scope enforcement is **advisory/soft** (a violation is warned + event-emitted but does **not** hard-block; hard-flip is post-GA V2 — see `docs/architecture/authority-matrix.md`). Therefore "vulnerability is closed / `ScopeViolationError` thrown / blocks" describes the **design intent**, not the current runtime guarantee.
>
> Behavior unchanged; documentation alignment only. (An unrelated, stale "Büyük Dosya Split Analizi (Sprint 130)" appendix — long since completed via ADR-024/026 — was removed from this ADR.)


---

## adr-035: Brain ↔ Worker ↔ Auditor Verification Protocol Standard (Sprint 138)

**Status:** accepted

# ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol Standard (Sprint 138)

**Status:** accepted

**Date:** 2026-04-14

**Sprint:** 138

---

**Context:**

Sprint 137 meta-dogfood analizi kritik bir iletişim sorununu ortaya koydu: Task 137-001 worker `status: DONE exitCode: 0` bildirdi, ancak vitest 53 fail test bıraktı. Worker "kod var" → DONE kısayolu. Bu sapmanın temel nedeni, Brain ↔ Worker ↔ Auditor arasındaki mesaj akışının formal bir protokole sahip olmamasıydı — her bileşen kendi dosya formatını üretiyordu (.hb heartbeat, .result, git diff çıktısı) ama bu mesajlar versiyonlanmış, kanonik, parse edilebilir değildi.

Sorunlar:

1. **Doğrulama eksikliği:** Worker `DONE` bildirdiğinde Auditor bağımsız doğrulama yapamıyordu. Auditor sadece `.result` dosyasının varlığını kontrol ediyor, içeriğinin doğruluğunu değil.
2. **Kanal belirsizliği:** `WORKER→BRAIN` yönünde sadece `.result` dosyası vardı; `WORKER→AUDITOR` doğrudan iletişim kanalı yoktu.
3. **Replay edilemezlik:** Sprint sonunda hangi olayların hangi sırada yaşandığını reconstruct etmek imkânsızdı. `.hb` timestamp'leri kaba granülaritede, `.result` tek snapshot.
4. **Mesaj versiyonlaması yok:** Yeni alan eklendiğinde eski consumer'lar uyumsuz hale geliyordu. Örn. Sprint 136 `rubricScores` alanı eski Brain evaluate kodunu bozdu.

Sprint 138 bu sorunu formal mesaj protokolü ile çözer. Dosya tabanlı state (`.hb`, `.result`) geriye dönük uyumluluk için Sprint 142'ye kadar devam eder, ancak event stream kanonik truth olur.

**Decision:**

Brain ↔ Worker ↔ Auditor iletişimi için versiyonlanmış mesaj protokolü (Protocol Version 1.0). Append-only event stream (`.deckent/sprint-NNN-events.jsonl`) tüm mesajları sıralı olarak kaydeder. Dosya tabanlı state paralel devam eder (fail-safe fallback), ancak event stream kanonik gerçek kabul edilir.

### Mesaj Formatı

```json
{
  "timestamp": "2026-04-14T10:00:00.000Z",
  "sequence": 42,
  "protocol_version": "1.0",
  "source": "worker | brain | auditor | deckent",
  "target": "brain | worker | auditor | user | *",
  "channel": "CHANNEL_CODE",
  "payload": {}
}
```

- `sequence`: sprint başından itibaren monoton artan tam sayı, 1'den başlar
- `protocol_version`: sabit "1.0" (Sprint 138), yeni majör değişiklikler 2.0 olacak
- `target: "*"`: broadcast mesaj (tüm consumer'lar dinler)
- `payload`: kanal koduna göre değişir, JSON object, forward-compatible (ekstra alanlar ignore edilir)

### Kanal Kodları (15 adet, Protocol Version 1.0)

**Brain ↔ Worker Kanalları:**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `BRAIN→WORKER:TASK_ASSIGN` | brain | worker | Task atama, scope + model + skills payload'ı |
| `WORKER→BRAIN:HEARTBEAT` | worker | brain | Periyodik canlılık sinyali (30s interval) |
| `WORKER→BRAIN:RESULT` | worker | brain | Task sonucu (selfAssessment, filesChanged, rubricScores) |
| `WORKER→BRAIN:QUESTION` | worker | brain | Checkpoint/blocker sorusu |
| `BRAIN→WORKER:ANSWER` | brain | worker | Checkpoint cevabı veya blocker çözümü |

**Worker ↔ Auditor Kanalları:**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | worker | auditor | Worker result'ını bağımsız doğrulama talebi |
| `AUDITOR→BRAIN:VERIFICATION_RESULT` | auditor | brain | Doğrulama sonucu: PASS \| DOWNGRADE \| FAIL |
| `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` | auditor | brain | İki worker aynı dosyaya yazıyor, plan-time bypass |
| `AUDITOR→BRAIN:ADR_VIOLATION` | auditor | brain | Pilot ADR kural ihlali (ADR-006, ADR-008, ADR-010) |
| `AUDITOR→BRAIN:GATE_COMPUTED` | auditor | brain | Sprint gate hesaplandı (PASS \| WARNING \| FAIL) |
| `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN` | auditor | brain | load-test-report.md yazıldı |

**Broadcast / Sprint Kanalları:**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `BRAIN→*:METRIC_EMITTED` | brain | * | Sprint metric noktası (coverage, duration, worker count) |
| `BRAIN→WORKER:FIX_REQUEST` | brain | worker | NO_GO sonrası fix yeniden deneği |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | brain | * | Faz geçişi (PLAN→SPAWN→EXECUTE→...) |

**User Notification (Sprint 139 Seed):**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `DECKENT→USER:NOTIFY` | deckent | user | Kullanıcıya bildirim (Sprint 139 dispatcher, Sprint 138'de sadece tanımlı) |

### Backward Compatibility Roadmap

| Sprint | Durum |
|--------|-------|
| Sprint 138 | `.hb` + `.result` dosyaları **paralel devam eder**, event stream ek katman |
| Sprint 139-140 | Event stream primary, file-based secondary |
| Sprint 140+ | File-based **soft-deprecated** (consumer'lar event stream'e migrate edilir) |
| Sprint 142 | File-based **removed** (sadece event stream) |

### Fail-Safe Davranış

Event stream write başarısız olursa (disk tam, permission hata) → `console.warn` + file-based fallback. Sprint asla event stream I/O hatası nedeniyle durmamalı.

**Consequences (+):**

- Sprint sonunda tüm olaylar replay edilebilir → post-mortem analiz mümkün
- Auditor `WORKER→AUDITOR:CODE_VERIFY_REQUEST` ile aktif doğrulayıcı rolüne geçer (Sprint 137 kısayol kapatılır)
- `SCOPE_COLLISION_DETECTED` plan-time saptanabilir → manual wave barrier ihtiyacı azalır
- Protocol versiyonlaması → breaking change'ler kontrollü, consumer'lar protocol_version'ı okur
- `DECKENT→USER:NOTIFY` kanalı Sprint 139 dispatcher'a temiz extension point sağlar

**Consequences (-):**

- Her olay için disk I/O artışı — `.jsonl` append performance testi gerekebilir
- `sequence` monotonicity multi-worker concurrent write'ta race condition riski — atomik increment gerekir (file lock veya process-level counter)
- Event stream büyüyebilir — Sprint 143'te rotation/cleanup mekanizması düşünülmeli
- Sprint 142 file-based remove, legacy consumer'lar için migration burden

**Alternatives Considered:**

- **gRPC/Protobuf:** Tip güvenli, binary verimli. Reddedildi — schema compiler toolchain bağımlılığı, Node.js subprocess'lerde kurulum karmaşıklığı, Deckent "kur-çalıştır" ilkesiyle çelişiyor (ADR-010).
- **WebSocket:** Gerçek zamanlı, bidirektional. Reddedildi — Docker backend'de port mapping karmaşıklığı, Worker container'ların WebSocket server'a erişimi garanti değil, HTTP API zaten var.
- **Redis Pub/Sub:** Yüksek throughput, kanıtlı. Reddedildi — ADR-010 tek runtime dependency ilkesi ihlali, ADR-033 "kur-çalıştır" product vizyonuyla çelişiyor, Redis kurulu olmayan makinelerde sıfır fallback.
- **SQLite:** ACID garantili, structured query. Reddedildi — dosya tabanlı append'den daha karmaşık, basit olmak Deckent kimliğinin temelidir, WAL mode multi-writer complexity ekler.
- **Mevcut dosya tabanlı devam:** Değişiklik yok, `.hb` + `.result` yeterli. Reddedildi — Sprint 137 meta-dogfood canlı kanıtı: file-based state functional doğrulama yapmıyor, replay imkânsız.

**References:**

- Sprint 137 Task 137-001 retrospektif — worker DONE kısayolu canlı kanıtı
- Sprint 138 design spec: `docs/superpowers/specs/2026-04-14-sprint-138-architectural-pivot-design.md` Section 6
- Sprint 138 plan: `docs/superpowers/plans/2026-04-14-sprint-138-architectural-pivot-plan.md`
- ADR-008: Brain Merkezi Import — mesaj akışı sınır disiplini
- ADR-010: Minimal Dependencies — Redis/SQLite reddetme gerekçesi
- ADR-033: Product Vision — WebSocket/Redis reddetme gerekçesi (kur-çalıştır)
- `src/orchestra/event-stream.ts` — Sprint 138 Task 4 implementasyonu
- `src/monitor/auditor.ts` — Sprint 138 Task 3 Auditor Authority Extension
- `.deckent/sprint-138-events.jsonl` — canlı runtime event log

> **Note (verified vs code, Sprint 172):** `src/orchestra/event-stream.ts` exists and implements the versioned protocol + channel codes ✓. **However, the "Backward Compatibility Roadmap" did not materialize:** the table projects file-based state soft-deprecated by Sprint 140 and **removed by Sprint 142** — but at Sprint 172 the file-based `.hb`/`.result` mechanism is still the **live primary** path (`src/orchestra/result-collector.ts`, `src/agents/worker.ts`; the ADR-047 manual-dispatch flow reads `.tasks/task-*.result`). The event stream is an **additive layer**, not the sole canonical truth in practice. "Event stream = canonical truth / file-based removed by 142" is design intent, not the current runtime state (consistent with the ADR-037 V1.0 advisory framing in `docs/architecture/authority-matrix.md`). Behavior unchanged; documentation alignment only.

---


---

## adr-036: ADR Governance Integration — Mandatory Architecture Decision Enforcement

**Status:** accepted

# ADR-036: ADR Governance Integration — Mandatory Architecture Decision Enforcement

**Status:** accepted

**Date:** 2026-04-14

**Sprint:** 138

---

**Context:**

Deckent 135+ sprint boyunca `.brain/DECISIONS.md` dosyasında mimari kararları (ADR) kayıt altına aldı. Ancak bu ADR'ler yalnızca bilgilendirme amaçlıydı — brain veya worker'lar tarafından aktif olarak okunmuyor, uyumluluk kontrol edilmiyordu. Açık kaynak repoya geçişle birlikte kullanıcılar kendi `.brain/DECISIONS.md` dosyalarını yazıp Deckent'tan enforce ettirmeyi bekleyecek.

Sorunlar:
1. ADR format standardize değildi — bazı ADR'lerde Status alanı vardı, bazılarında yoktu
2. Worker prompt'larında ADR bilgisi yoktu — worker'lar mimari kısıtlamalardan habersiz çalışıyordu
3. ADR yaşam döngüsü (accepted → deprecated → superseded) takip edilemiyordu
4. ADR governance CI pipeline'a entegre değildi — format hataları build'de yakalanmıyordu

**Decision:**

ADR governance'ı kullanıcı-facing ürün özelliğine dönüştürmek. 5 bileşen:

1. **MADR v3 Hibrit Format:** Tüm ADR'lere zorunlu `**Status:**` alanı eklendi. Geçerli değerler: accepted, deprecated, superseded, proposed, rejected. Parantezli açıklama desteklenir (örn. `accepted (Sprint 131)`).

2. **Mandatory Read Wiring:** DECKENT.md'ye `@.brain/DECISIONS.md` referansı eklendi. brain.md ve worker-default.md kurallarına ADR compliance zorunluluğu eklendi.

3. **Worker Prompt ADR Injection:** `buildWorkerPrompt()` fonksiyonu `.brain/DECISIONS.md` içeriğini worker prompt'una enjekte eder. Worker'lar mimari kısıtlamaları bilir, ihlal durumunda NO_GO + ADR amendment proposal yazar.

4. **Validator Script:** `scripts/adr-validator.mjs` — format doğrulama, status enum kontrolü, duplicate ID tespiti. `npm run lint:adr` ile CI'da çalıştırılır.

5. **ADR/SDL Naming Split:** `.brain/DECISIONS.md` = ADR (kalıcı mimari kararlar), `.deckent/decisions/*.json` = SDL (sprint taktik kararları).

**Consequences (+):**
- Worker'lar her sprint'te mimari kısıtlamaları bilir — bilinçsiz ihlaller azalır
- `npm run lint:adr` CI pipeline'da format tutarlılığını garanti eder
- Kullanıcılar kendi projelerinde ADR governance'ı kurabilir
- MADR v3 standardıyla uyumlu format — topluluk alışkanlıklarıyla uyum

**Consequences (-):**
- Worker prompt boyutu ADR injection ile büyür (~3000 char ek)
- Validator basit regex-based — karmaşık markdown edge case'leri gözden kaçabilir
- ADR enforcement runtime'da değil, compile-time'da — aktif kod analizi yok

**References:**
- Sprint 138 Task 138-001 implementasyonu
- `scripts/adr-validator.mjs` — validator script
- `src/orchestra/task-builder.ts:loadADRContent()` — prompt injection
- ADR-013: DECKENT.md Adapter Pattern — mandatory read wiring pattern
- MADR v3: https://adr.github.io/madr/

> **Note (verified / Memory V2 reconciliation):** Confirmed in code — `scripts/adr-validator.mjs` + `npm run lint:adr` (format/status-enum/duplicate-ID) and the MADR v3 mandatory `**Status:**` enum are real; the "enforcement is compile-time, not runtime" caveat is accurate (consistent with ADR-037 V1.0). **However, the ADR store evolved (Memory V2, DB-first):** `.brain/DECISIONS.md` is **no longer a live hand-maintained file**. ADRs live in `.brain/memory.db` (`type='adr'`), synced from `docs/adr/*.md` via ADR-046 (`syncAdrFilesToDb`) and exported to `.brain/exports/decisions.md`. Worker-prompt ADR injection is DB-based (`src/orchestra/adr-selector.ts`), not a raw `.brain/DECISIONS.md` read; the brain/worker/auditor rules now state "Query ADRs via MemoryStore — never parse .md files". Read every `.brain/DECISIONS.md` mention above as **shorthand for the ADR governance store** (DB + `docs/adr/` + `exports/decisions.md`) — consistent with ADR-009, `docs/architecture/memory-system.md`, and `CLAUDE.md`. Behavior unchanged; documentation alignment only.

---


---

## adr-037: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0

**Status:** accepted

# ADR-037: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0

**Status:** accepted

**Date:** 2026-04-15

**Sprint:** 138

---

> ⚠️ **V1.0 enforcement reality (read this first — this is the canonical source other docs cite).**
> This ADR defines the **intended** RBAC model. What is actually enforced today (Sprint 172):
> - **Layer 1 (compile-time lint) + Layer 3 (audit-trail) are ACTIVE.**
> - **Layer 2 (runtime) is ADVISORY / SOFT** — a violation is logged + emitted
>   to the event stream but does **not** block the action
>   (`src/orchestra/authority-enforcer.ts` is always-soft; `src/agents/worker.ts`
>   `checkWorkerAuthority` returns `true` even on a detected violation).
> - `enforceVerifyLoop()` / `runTestVerifyLoop()` are **prompt instructions,
>   not code-enforced** (0 runtime callers).
> - The hard-blocking Layer-2 is **intentionally absent in V1.0** and is a
>   **post-GA V2 hard-flip** — *not* "Sprint 139 scope" (that completion did
>   not land; it remains advisory at Sprint 172).
> - Therefore the **"Fail-Closed"** principle and all ❌/"yasaklanmış" cells
>   below are **design intent**, not a current runtime guarantee.
>
> This matches the honest framing in `CLAUDE.md`, `.claude/rules/worker-default.md`,
> and `docs/architecture/authority-matrix.md`. Also: `.brain/DECISIONS.md` and the
> `MEMORY.md`/`RETRO.md` line numbers in the matrix below are **Memory-V2
> shorthand / outdated V1 budgets** — ADRs live in `.brain/memory.db`
> (`type='adr'`); canonical line budgets are in `src/core/constants.ts`.

**Context:**

Deckent'in üç temel bileşeni — Brain (orkestratör), Auditor (doğrulayıcı), Worker (uygulayıcı) — Sprint 138'e kadar örtük güven (implicit trust) modeliyle çalışıyordu. Yetki sınırları `.claude/rules/*.md` dosyalarında doğal dil kuralları olarak tanımlı, ancak bu kurallar:

1. **Enforceable değildi:** Worker'ın scope dışına yazması yalnızca post-hoc `git diff` ile tespit ediliyordu. Brain'in `src/**`'e doğrudan müdahalesi engelleyen mekanizma yoktu. Auditor'ın kaynak kod yazmasını engelleyen tek şey doğal dil talimatıydı.

2. **Formal olarak tanımlı değildi:** ADR-008 Brain merkezi import kuralını, ADR-034 per-project izolasyonu, ADR-035 mesaj protokolünü tanımlıyordu — ama bu üç ADR'nin kesişiminde oluşan "kim neyi yapabilir?" sorusu hiçbir yerde tek tablo olarak cevaplanmıyordu.

3. **Enterprise ölçeğe hazır değildi:** Milyon kullanıcı hedefiyle (Q3 2026 vizyonu), bir bileşenin yetkisini aştığında ne olacağının deterministik, denetlenebilir, versiyonlanmış bir protokolü yoktu. NIST SP 800-162 (ABAC) ve RBAC standartları referans alınmalıydı.

4. **Sprint 137-138 canlı kanıtları:**
   - Sprint 137 Task 137-001: Worker `DONE` bildirdi, vitest 53 fail — worker kendi doğrulama yetkisini aşıyordu (self-assessment = judge of own work).
   - Sprint 138 Task 138-003: Auditor Authority Extension 3-Pipeline ile auditor aktif doğrulayıcı oldu, ama bu yetki genişlemesi formal RBAC kaydı olmadan yapıldı.
   - Sprint 138 Task 138-004: Event stream kanal kodları (ADR-035) "source" ve "target" alanlarıyla örtük role bilgisi taşıyor, ama hangi kanalı kimin kullanabileceği tanımlı değil.

5. **Tehdit modeli (ADR-034'ü genişletir):**
   - **Privilege escalation:** Worker'ın `.brain/DECISIONS.md`'yi değiştirerek kendi scope kurallarını gevşetmesi
   - **Lateral movement:** Worker A'nın Worker B'nin task dosyalarını okuması/yazması
   - **Audit bypass:** Brain'in auditor verification'ı atlayarak doğrudan GO kararı vermesi
   - **Role confusion:** Auditor'ın kaynak kodu yazması (audit bağımsızlığını bozar)

**Decision:**

Brain, Auditor ve Worker bileşenleri için formal Role-Based Access Control (RBAC) authority matrix tanımlanır. Bu matrix, Protocol Version 1.0 (ADR-035) üzerine inşa edilir ve her bileşenin dosya sistemi erişim hakları, event stream kanal kullanım hakları ve sprint yaşam döngüsü eylem yetkilerini belirler.

### Temel Prensipler

1. **Least Privilege (En Az Yetki):** Her bileşen yalnızca görevini yerine getirmek için gereken minimum yetkilere sahiptir. Ek yetki açıkça tanımlanmalı ve bu ADR'de kayıt altına alınmalıdır.

2. **Separation of Duties (Görev Ayrılığı):** Aynı bileşen hem uygulayıcı hem denetleyici olamaz. Worker kod yazar, Auditor doğrular, Brain karar verir. Bu üçlü hiçbir bileşende birleşmez.

3. **Auditability (Denetlenebilirlik):** Her yetki kullanımı event stream'e (ADR-035) kaydedilir. Yetkisiz erişim girişimleri `SCOPE_VIOLATION` olayı olarak loglanır.

4. **Fail-Closed (Kapalı Hata):** Yetki doğrulaması başarısız olursa varsayılan karar "erişim yok" olur. Açıkça izin verilmeyen her eylem yasaklanmış kabul edilir.

### Brain Authority Matrix

Brain, sprint orkestratörüdür. Planlama, karar verme ve koordinasyon yetkilerine sahiptir.

**Dosya Sistemi — YAZMA İZNİ:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.tasks/*` | ✅ WRITE | Task JSON oluşturma, durum güncelleme, sprint yönetimi |
| `.deckent/config.json` | ✅ WRITE | Konfigürasyon güncelleme (config set komutu) |
| `.deckent/sprint-state.json` | ✅ WRITE | Sprint faz geçişi, aktif sprint kaydı |
| `.deckent/sprint-*-events.jsonl` | ✅ APPEND | Event stream yazma (yalnızca append, overwrite yasak) |
| `.deckent/sprint-*-checkpoint.json` | ✅ WRITE | Checkpoint yazma (resume capability) |
| `.deckent/sprint-*-metrics.jsonl` | ✅ APPEND | Metrik noktaları kaydetme |
| `.deckent/cache/*` | ✅ WRITE | Managed-docs cache, build cache |
| `.brain/MEMORY.md` | ✅ WRITE | Sprint öğrenimleri kaydetme (max 300 satır) |
| `.brain/RETRO.md` | ✅ WRITE | Retrospektif yazma (overwrite, max 120 satır) |
| `.brain/DEBT.md` | ✅ WRITE | Teknik borç tablosu yönetimi |
| `.brain/PATTERNS.md` | ✅ WRITE | Desen kayıtları güncelleme |
| `.brain/sprints/sprint-*.md` | ✅ WRITE | Sprint log dosyaları (max 80 satır) |
| `.brain/archive/*` | ✅ WRITE | Sprint arşivleme (DIRECTIVES, tasks) |

**Dosya Sistemi — YAZMA YASAĞI:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `src/**` | ❌ DENY | Brain kaynak kodu yazmaz — ADR-038 istisnası hariç (gelecek ADR) |
| `tests/**` | ❌ DENY | Brain test yazmaz — worker görevi |
| `.brain/DECISIONS.md` | ❌ DENY | ADR'ler yalnızca insan (Alperen) veya ADR governance süreci ile değişir |
| `docs/vision/roadmap.md` | ❌ DENY | Vizyon dokümanı yalnızca insan tarafından güncellenir |
| `.dashboard` | ❌ DENY | Auditor'ın münhasır yazma alanı |
| `.locks/*` | ❌ DENY | Lock yönetimi auditor + worker sorumluluğu |

**Sprint Yaşam Döngüsü Eylemleri:**

| Eylem | İzin | Koşul |
|-------|------|-------|
| Task oluşturma (PLAN fazı) | ✅ | DIRECTIVES.md okunmuş olmalı |
| Worker spawn | ✅ | SPAWN fazı aktif olmalı |
| Worker kill | ✅ | Timeout veya NO_GO sonrası |
| GO / NO_GO / GO_WITH_TECH_DEBT label | ✅ | EVALUATE fazı aktif olmalı |
| Cross-dependency fix spawn | ✅ | FIX fazı aktif, bağımlılık analizi tamamlanmış |
| Auditor doğrulamasını atlama | ❌ | Brain, auditor verification sonuçlarını beklemek ZORUNDADIR |
| Kendi kararını doğrulama | ❌ | Self-audit gate (Sprint 134 T-014) auditor tarafından kontrol edilir |

**Event Stream Kanal Hakları (ADR-035 V1.0):**

| Kanal | Hak | Rol |
|-------|-----|-----|
| `BRAIN→WORKER:TASK_ASSIGN` | ✅ EMIT | Kaynak |
| `BRAIN→WORKER:ANSWER` | ✅ EMIT | Kaynak |
| `BRAIN→WORKER:FIX_REQUEST` | ✅ EMIT | Kaynak |
| `BRAIN→*:METRIC_EMITTED` | ✅ EMIT | Kaynak |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | ✅ EMIT | Kaynak |
| `WORKER→BRAIN:*` | ✅ CONSUME | Hedef |
| `AUDITOR→BRAIN:*` | ✅ CONSUME | Hedef |
| `WORKER→AUDITOR:*` | ❌ | Ne kaynak ne hedef |
| `DECKENT→USER:NOTIFY` | ❌ | Deckent CLI katmanı sorumlu |

### Auditor Authority Matrix

Auditor, bağımsız doğrulayıcıdır. Gözlemleme, doğrulama ve raporlama yetkilerine sahiptir. Kaynak kodu ASLA yazmaz.

**Dosya Sistemi — YAZMA İZNİ:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.dashboard` | ✅ WRITE | Sprint durumu dashboard'u (30s scan cycle'da overwrite) |
| `.deckent/sprint-*-gate.json` | ✅ WRITE | Sprint gate hesaplama sonucu |
| `.deckent/sprint-*-events.jsonl` | ✅ APPEND | Event stream'e doğrulama sonuçları yazma |
| `docs/audits/*` | ✅ WRITE | Audit raporları, load-test raporları |
| `.brain/PATTERNS.md` | ✅ APPEND | Yeni pattern ekleme (mevcut içerik korunur, yalnızca append) |

**Dosya Sistemi — OKUMA İZNİ:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.tasks/*.hb` | ✅ READ | Worker heartbeat kontrolü (stale detection) |
| `.tasks/*.result` | ✅ READ | Worker sonuç doğrulaması |
| `.tasks/*.json` | ✅ READ | Task tanımı okuma (scope doğrulama) |
| `.locks/*` | ✅ READ + WRITE | Stale lock tespiti ve temizleme (>5 min) |
| `src/**` | ✅ READ | Kod analizi, ADR compliance kontrolü (sadece okuma!) |
| `tests/**` | ✅ READ | Test sonuç doğrulaması |
| `.brain/DECISIONS.md` | ✅ READ | ADR compliance kontrolü |
| `git diff --stat` | ✅ EXEC | Boundary violation tespiti |

**Dosya Sistemi — YAZMA YASAĞI:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `src/**` | ❌ DENY | Auditor kaynak kodu ASLA yazmaz — audit bağımsızlığı |
| `tests/**` | ❌ DENY | Auditor test yazmaz — bağımsızlık ilkesi |
| `.tasks/*.json` | ❌ DENY | Task tanımı değiştirme yetkisi yok — Brain münhasır |
| `.brain/MEMORY.md` | ❌ DENY | Bellek yönetimi Brain sorumluluğu |
| `.brain/RETRO.md` | ❌ DENY | Retrospektif yazma Brain sorumluluğu |
| `.brain/DECISIONS.md` | ❌ DENY | ADR değişikliği governance süreci gerektirir |
| `.deckent/sprint-state.json` | ❌ DENY | Sprint faz geçişi Brain sorumluluğu |

**Sprint Yaşam Döngüsü Eylemleri:**

| Eylem | İzin | Koşul |
|-------|------|-------|
| Verification 3-pipeline (`verifyWorkerResult`) | ✅ | Worker `.result` dosyası mevcut |
| Functional verification (`verifyFunctional`) | ✅ | EXECUTE veya EVALUATE fazı |
| Tech debt validation (`validateTechDebt`) | ✅ | Worker GO_WITH_TECH_DEBT bildirdi |
| ADR compliance check (`checkADRCompliance`) | ✅ | Pilot ADR'ler (ADR-006, ADR-008, ADR-010) |
| Sprint gate hesaplama (`GATE_COMPUTED`) | ✅ | EVALUATE fazı tamamlandı |
| PASS / DOWNGRADE / FAIL verdict | ✅ | 3-pipeline sonucu |
| GO / NO_GO label kararı | ❌ | Brain münhasır — auditor yalnızca verdict önerir |
| Worker spawn / kill | ❌ | Brain münhasır |
| Task oluşturma / değiştirme | ❌ | Brain münhasır |

**Event Stream Kanal Hakları (ADR-035 V1.0):**

| Kanal | Hak | Rol |
|-------|-----|-----|
| `AUDITOR→BRAIN:VERIFICATION_RESULT` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:ADR_VIOLATION` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:GATE_COMPUTED` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN` | ✅ EMIT | Kaynak |
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | ✅ CONSUME | Hedef |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | ✅ CONSUME | Broadcast dinleyici |
| `BRAIN→*:METRIC_EMITTED` | ✅ CONSUME | Broadcast dinleyici |
| `BRAIN→WORKER:*` | ❌ | Ne kaynak ne hedef |
| `WORKER→BRAIN:*` | ❌ | Ne kaynak ne hedef (Brain'e ait) |

### Worker Authority Matrix

Worker, görev uygulayıcısıdır. Atanan task scope'u içinde kaynak kodu yazar, test çalıştırır ve sonuç raporlar.

**Dosya Sistemi — YAZMA İZNİ:**

| Yol Pattern | İzin | Koşul |
|-------------|------|-------|
| `scope.filesWrite` (task JSON'dan) | ✅ WRITE | Yalnızca atanan task'ın scope.filesWrite listesindeki dosyalar |
| `scope.directories` (task JSON'dan) | ✅ WRITE | Yalnızca atanan task'ın scope.directories içindeki yeni dosyalar |
| `.tasks/task-{ownId}.hb` | ✅ WRITE | Kendi heartbeat dosyası |
| `.tasks/task-{ownId}.result` | ✅ WRITE | Kendi sonuç dosyası |
| `.tasks/task-{ownId}.plan` | ✅ WRITE | Kendi yürütme planı |
| `.tasks/task-{ownId}.verify-delta.json` | ✅ WRITE | Honest assessment kanıt dosyası |
| `.locks/{ownScope}` | ✅ WRITE | Kendi scope'undaki dosyalar için lock alma/bırakma |

**Dosya Sistemi — OKUMA İZNİ:**

| Yol Pattern | İzin | Koşul |
|-------------|------|-------|
| `.tasks/task-{ownId}.json` | ✅ READ | Kendi task tanımı |
| `scope.filesRead` (task JSON'dan) | ✅ READ | Task scope'undaki okuma listesi |
| `.brain/DECISIONS.md` | ✅ READ | ADR compliance kontrolü (zorunlu okuma — ADR-036) |
| `.locks/*` | ✅ READ | File lock kontrolü (yazma öncesi) |
| `DIRECTIVES.md` | ✅ READ | Sprint hedefleri bağlamı |

**Dosya Sistemi — YAZMA YASAĞI:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.tasks/task-{otherId}.*` | ❌ DENY | Başka worker'ın dosyalarına erişim yasak — lateral movement engeli |
| `.brain/DECISIONS.md` | ❌ DENY | ADR değişikliği governance süreci gerektirir — privilege escalation engeli |
| `.brain/MEMORY.md` | ❌ DENY | Brain münhasır |
| `.brain/RETRO.md` | ❌ DENY | Brain münhasır |
| `.deckent/sprint-state.json` | ❌ DENY | Sprint durumu Brain münhasır |
| `.dashboard` | ❌ DENY | Auditor münhasır |
| `docs/audits/*` | ❌ DENY | Auditor münhasır |
| Scope dışı `src/**` | ❌ DENY | Scope violation — auditor `git diff --stat` ile tespit eder |

**Sprint Yaşam Döngüsü Eylemleri:**

| Eylem | İzin | Koşul |
|-------|------|-------|
| Task claim (PENDING → CLAIMED) | ✅ | Task kendisine atanmış olmalı |
| Kod yazma | ✅ | Scope dahilinde |
| Test çalıştırma (`tsc --noEmit`, `vitest run`) | ✅ | Verify loop (max 3 attempt) |
| Self-assessment yazma | ✅ | Honest assessment kuralları geçerli (ADR-035 V1.0 honest block) |
| Checkpoint question (`WORKER→BRAIN:QUESTION`) | ✅ | Blocker durumunda |
| Başka worker'ı spawn/kill | ❌ | Brain münhasır |
| Sprint faz değiştirme | ❌ | Brain münhasır |
| GO / NO_GO kararı | ❌ | Brain münhasır — worker yalnızca self-assessment yazar |
| Verification çalıştırma | ❌ | Auditor münhasır — worker kendi çalışmasını judge edemez |

**Event Stream Kanal Hakları (ADR-035 V1.0):**

| Kanal | Hak | Rol |
|-------|-----|-----|
| `WORKER→BRAIN:HEARTBEAT` | ✅ EMIT | Kaynak |
| `WORKER→BRAIN:RESULT` | ✅ EMIT | Kaynak |
| `WORKER→BRAIN:QUESTION` | ✅ EMIT | Kaynak |
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | ✅ EMIT | Kaynak |
| `BRAIN→WORKER:TASK_ASSIGN` | ✅ CONSUME | Hedef |
| `BRAIN→WORKER:ANSWER` | ✅ CONSUME | Hedef |
| `BRAIN→WORKER:FIX_REQUEST` | ✅ CONSUME | Hedef |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | ✅ CONSUME | Broadcast dinleyici |
| `AUDITOR→BRAIN:*` | ❌ | Ne kaynak ne hedef (Brain'e ait) |
| `BRAIN→*:METRIC_EMITTED` | ❌ | Worker metrik tüketmez |

### Cross-Role Interaction Rules (Çapraz Rol Kuralları)

**Kural 1: Separation of Assessment and Verification**
Worker self-assessment yazar (DONE / GO_WITH_TECH_DEBT / NO_GO). Auditor bağımsız olarak doğrular (PASS / DOWNGRADE / FAIL). Brain her iki sonucu değerlendirerek nihai GO / NO_GO kararı verir. Hiçbir bileşen hem uygulayıcı hem doğrulayıcı olamaz.

**Kural 2: No Direct Worker-to-Worker Communication**
Worker'lar birbirleriyle doğrudan iletişim kuramaz. Tüm koordinasyon Brain üzerinden yapılır. Worker A'nın Worker B'nin çıktısına ihtiyacı varsa, Brain dependency resolution yapar (FIX fazı, cross-dep priority).

**Kural 3: Auditor Independence**
Auditor hiçbir koşulda kaynak kodu (src/**, tests/**) yazmaz. Bu kural ADR-037'nin "dokunulamaz" maddesidir. Auditor bağımsızlığı kırılırsa self-audit mekanizması anlamsızlaşır.

**Kural 4: Brain Orchestration Boundary**
Brain planlama, koordinasyon ve karar verme yapar. Doğrudan kaynak kod üretimi yapmaz (src/** yazma yasağı). Brain'in kodu etkilemesi gereken durumlarda worker spawn eder. İstisna: gelecek ADR-038 meta-refactoring capability (şu an tanımlı değil, bu ADR'de referans olarak belirtilmiştir).

**Kural 5: Event Stream Integrity**
Her bileşen yalnızca kendi kanal haklarında belirtilen kanalları kullanabilir. Event stream append-only'dir — mevcut event'ler değiştirilemez veya silinemez. Event stream bozulması durumunda file-based fallback devreye girer (ADR-035 backward compatibility).

### Enforcement Mekanizması

**Katman 1 — Compile-Time (Static)**
- `npm run lint:adr` ADR-037 authority matrix'ini parse eder ve scope kurallarını doğrular
- Worker prompt injection (ADR-036) authority matrix'i worker'a bildirir
- `isWithinScope()` fonksiyonu (ADR-034) symlink-aware dosya erişim kontrolü yapar

**Katman 2 — Runtime (Dynamic)**
- Auditor 30s scan cycle: `git diff --stat` ile scope violation tespiti
- Event stream `source` alanı doğrulaması: yanlış source ile yazılan event → `SCOPE_VIOLATION` alert
- File lock çakışma tespiti: aynı dosyaya iki worker yazarsa → `SCOPE_COLLISION_DETECTED` event

**Katman 3 — Post-Hoc (Audit Trail)**
- Event stream replay: sprint sonunda tüm yetki kullanımları reconstruct edilebilir
- `.deckent/sprint-*-gate.json`: sprint gate hesaplamasında authority violation sayısı raporlanır
- `docs/audits/sprint-*/`: her sprint'in audit raporu authority matrix compliance içerir

### Versioning & Evolution

Bu RBAC matrix Protocol Version 1.0 ile birlikte tanımlanmıştır. Değişiklikler:

| Değişiklik Türü | Gereksinim |
|-----------------|------------|
| Yeni yetki ekleme (izin genişletme) | Bu ADR'ye amendment + `npm run lint:adr` geçmeli |
| Yetki kaldırma (izin daraltma) | Bu ADR'ye amendment + etkilenen bileşen testleri güncellenmeli |
| Yeni rol ekleme | Yeni ADR (ADR-037 bu ADR'yi supersede eder) |
| Kanal hakkı değişikliği | ADR-035 ve bu ADR birlikte güncellenmeli |

**Consequences (+):**

- Her bileşenin yetki sınırları tek tablo olarak okunabilir — onboarding kolaylığı
- Privilege escalation vektörleri (worker → `.brain/DECISIONS.md` yazma) formal olarak kapatılır
- Audit trail event stream üzerinden reconstruct edilebilir — post-mortem analiz mümkün
- Enterprise-ready RBAC pattern: NIST SP 800-162 prensiplerine uyumlu (least privilege, separation of duties, fail-closed)
- Yeni bileşen eklendiğinde (örn. Notifier, Scheduler) authority matrix genişletme pattern'ı belirli
- Sprint 137/138 canlı kanıtlarından türetilen kurallar — teorik değil, gerçek ihlallerden öğrenilmiş

**Consequences (-):**

- Authority matrix bakımı gerektirir — her yeni dosya pattern'ı veya kanal eklenmesinde güncellenmeli
- Runtime enforcement henüz tam değil (Sprint 139 scope) — şu an compile-time + audit trail ağırlıklı
- Matrix karmaşıklığı yeni katkıda bulunanlar için başlangıçta zorlayıcı olabilir
- File-system level enforcement (OS capability) implementasyonu yok — güven modeli hâlâ process-level

**Alternatives Considered:**

- **Implicit trust (örtük güven):** Sprint 138'e kadarki model. Reddedildi: Sprint 137 canlı kanıtı gösterdi ki worker self-assessment güvenilmez, formal boundary'ler gerekli.
- **OS-level capability model (Linux capabilities, seccomp):** Her bileşen ayrı process, OS-level file permission. Reddedildi: cross-platform uyumsuzluk (macOS seccomp yok), Docker backend'de container-in-container karmaşıklığı, ADR-033 "kur-çalıştır" ilkesiyle çelişir.
- **CI lint-only enforcement:** Authority matrix'i yalnızca CI pipeline'da kontrol et, runtime'da enforce etme. Reddedildi: runtime violation'lar CI'da yakalanamaz, post-hoc tespit yetersiz (Sprint 137 kanıtı).
- **Centralized policy engine (OPA/Rego):** Policy-as-code engine. Reddedildi: ADR-010 tek runtime dependency ilkesi ihlali, kur-çalıştır friction'ı artırır, Deckent'in mevcut ölçeği için overkill.
- **Per-sprint dynamic RBAC:** Her sprint'te farklı yetki matrisi. Reddedildi: öngörülemezlik yaratır, debug zorlaştırır, authority matrix'in sabit olması güvenlik garantisi verir.

**References:**

- NIST SP 800-162: Guide to Attribute Based Access Control (ABAC) Definition and Considerations — least privilege, separation of duties prensipleri
- ADR-008: Brain Merkezi Import — tek yönlü bağımlılık (import boundary = authority boundary temeli)
- ADR-034: Multi-Project Isolation — per-project security boundaries (symlink-aware scope enforcement)
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol Standard V1.0 — event stream kanal kodları
- ADR-036: ADR Governance Integration — mandatory read wiring, validator enforcement
- Sprint 137 Task 137-001 retrospektif — worker self-assessment güvenilmezlik kanıtı
- Sprint 138 Task 138-003 — Auditor Authority Extension 3-Pipeline implementasyonu
- Sprint 134 T-014 — Brain Self-Audit Gate
- `.claude/rules/brain.md`, `.claude/rules/auditor.md`, `.claude/rules/worker-default.md` — mevcut doğal dil yetki kuralları (bu ADR ile formalize edildi)
- `src/agents/worker.ts:isWithinScope()` — runtime scope check implementasyonu
- `src/monitor/auditor.ts:verifyWorkerResult()` — 3-pipeline verification implementasyonu

---


---

## adr-038: Dead Code Disposition — Sprint 139 Audit Results

**Status:** accepted

# ADR-038: Dead Code Disposition — Sprint 139 Audit Results

**Status:** accepted

**Date:** 2026-04-15

**Sprint:** 139

---

**Context:**

Sprint 139 Dead Code Audit (Task 139-037 `scripts/dead-code-audit.mjs`) 11 modülü analiz etti ve 4 kategoride sınıflandırdı: Dead (6 modül, ~1042 LoC), Dormant/ADR-protected (4 modül, ~495 LoC), Active (1 modül — false positive). Audit, Sprint 132'deki güvenlik denetiminden gelen şüphelileri ve ADR-028 koruması altındaki V1 decision engine ekosistemini kapsadı.

Sorun: 1042 satır dead code bakım maliyeti yaratıyor (tsc derleme süresi, IDE noise, yeni katkıda bulunanlar için kafa karışıklığı). Ancak bazı dead modüller gelecek roadmap öğeleriyle (distributed execution Sprint 145+, ML-driven routing) doğrudan ilişkili — acele silme değerli mimari bilgiyi kaybettirir.

**Decision:**

Sprint 139 dead code audit sonuçları için 4 kademeli disposition kararı:

### Kademe 1: Remove (Sprint 140 Adım 4)

Aşağıdaki modüller **tamamen silinecek** (kaynak + test dosyaları):

| Modül | LoC | Gerekçe |
|-------|-----|---------|
| `src/orchestra/learning-decay.ts` | 151 | Deprecated learning sistemiyle bağlı, V2 routing farklı decay mekanizması kullanıyor. Pattern basit — gerekirse 30 dakikada yeniden yazılır. |
| `src/orchestra/learning-migration.ts` | 229 | Hardcoded keyword-to-taskType mapping, eski veri formatı migrasyonu. Yeni learning sistemi kurulursa sıfırdan tasarlanmalı. |
| `src/orchestra/batch-stats.ts` | 141 | Queue + delayed batch write pattern'ı jenerik. Gerekirse `node:stream` veya basit buffer ile yeniden implement edilir. Mevcut implementation 0 consumer. |

**Toplam:** 3 modül, ~521 LoC silme, 3 test dosyası silme.

**Rollback planı:** `git revert` ile tek commit geri alınır. Silme öncesi son commit hash'i `docs/audits/sprint-139/dead-code-decisions.md`'de kayıt altına alınır.

### Kademe 2: Defer (Sprint 145+ Değerlendirme)

Aşağıdaki modüller **silinmeyecek** — gelecek roadmap öğeleriyle doğrudan ilişkili:

| Modül | LoC | Gelecek Bağlantı | Yeniden Değerlendirme |
|-------|-----|-------------------|----------------------|
| `src/orchestra/combination-scorer.ts` | 101 | ML-driven routing scoring, outcome-tracker entegrasyonu | Sprint 145 (routing evolution) |
| `src/orchestra/handoff-protocol.ts` | 152 | Distributed execution, multi-task artifact exchange | Sprint 145 (distributed sprint) |
| `src/orchestra/brain-context.ts` | 268 | Context-aware planner enrichment, planner.ts entegrasyonu | Sprint 142 (planner evolution) |

**Toplam:** 3 modül, ~521 LoC korunacak. Test dosyaları da korunur.

Bu modüller `@deprecated` JSDoc tag'i ile işaretlenecek ve dosya başına `// DEFERRED: ADR-038, reassess Sprint 145` yorumu eklenecek. Sprint 145'te yeniden değerlendirilecek — ya revive edilecek (dogfood + test), ya da silinecek.

**Rollback planı:** `@deprecated` tag kaldırılır, modül aktif routing'e bağlanır.

### Kademe 3: Deprecate + Warning (ADR-028 Amendment — Sprint 142+)

ADR-028 koruması altındaki 4 dormant modül statüsü değişmiyor:

| Modül | LoC | ADR-028 Statüsü |
|-------|-----|------------------|
| `src/orchestra/decision-engine.ts` | 170 | Korunuyor — V1 referans |
| `src/orchestra/decision-replay.ts` | 150 | Korunuyor — audit tool |
| `src/orchestra/decision-steps/agent-step.ts` | 83 | Korunuyor — V1 step |
| `src/orchestra/decision-steps/scope-step.ts` | 92 | Korunuyor — V1 step |

**Toplam:** 4 modül, ~495 LoC — ADR-028 amendment gerektirir, Sprint 142+ değerlendirilecek.

Bu ADR, ADR-028'in removal'ını TALEP ETMİYOR — yalnızca Sprint 142'de reassessment öneriyor. V2 routing engine 10+ sprint boyunca stabil çalıştığında, V1 referans değerinin devam edip etmediği yeniden değerlendirilmeli.

### Kademe 4: False Positive Düzeltme

`src/orchestra/parallel-pipeline.ts` dead code olarak **yanlış raporlanmıştır**. Modül 4 src/ dosyası tarafından aktif olarak import edilmektedir (`sprint-spawner.ts`, `sprint-controller.ts`, `conflict-resolver.ts`). Rapordaki "0 import" yalnızca `PipelineTask` type export'u için geçerlidir — modülün kendisi kritik altyapıdır. Dead code raporundan çıkarılmalıdır.

**Consequences (+):**

- 521 LoC dead code güvenle silinecek (Sprint 140 Adım 4) — derleme süresi ve IDE noise azalır
- 521 LoC yüksek değerli kod korunacak — gelecek roadmap öğeleri için yatırım kaybı önlenir
- Her karar formal gerekçe, risk değerlendirmesi ve rollback planı ile belgelenmiştir
- False positive (parallel-pipeline) düzeltilerek audit doğruluğu artırılmıştır
- ADR-028 dormant modülleri Sprint 142'de reassessment'a takvimlenmiştir

**Consequences (-):**

- Deferred modüller (521 LoC) bakım yükü devam eder — `@deprecated` tag + periodic reassessment gerektirir
- Sprint 145 reassessment'ta modüllerin hâlâ relevant olup olmadığı belirsiz — roadmap değişebilir
- ADR-028 dormant modüller artık 15+ sprint boyunca untouched — reference value tartışmalı

**Alternatives Considered:**

- **Tümünü sil:** 1042 LoC + 495 LoC = ~1537 LoC silme. Reddedildi: combination-scorer ve handoff-protocol'ün yeniden yazım maliyeti yüksek, mimari bilgi kaybı.
- **Hiçbirini silme:** Tüm dead code korunsun. Reddedildi: learning-decay/migration/batch-stats gerçekten değersiz, bakım maliyeti artıyor.
- **Tümünü deprecate:** `@deprecated` işaretle, silme erteleme. Reddedildi: learning-decay/migration/batch-stats için deprecation gereksiz — doğrudan silme daha temiz.
- **Monorepo archive:** Dead kodu `packages/archive/` dizinine taşı. Reddedildi: ADR-010 minimal dependency, monorepo yapısı yok.

**References:**

- Sprint 139 Task 139-037: `scripts/dead-code-audit.mjs` — audit tool
- Sprint 139 Task 139-037: `docs/audits/sprint-139/dead-code-report.md` — audit raporu
- ADR-028: Decision-Engine V1 → V2 Routing Migration — dormant modül koruması
- ADR-033: Product Vision — bakım maliyeti minimizasyonu
- `docs/audits/sprint-139/dead-code-decisions.md` — detaylı decision matrix

> **Note (actual disposition as of Sprint 172 — verified vs `src/orchestra/`):** The plan was only partially realized and partly diverged:
> - **Kademe 1 (Remove):** `learning-decay.ts` ✓ removed, `learning-migration.ts` ✓ removed, but **`batch-stats.ts` still exists** (was not deleted).
> - **Kademe 2 (Defer):** `handoff-protocol.ts` and `brain-context.ts` are still present as planned, but **`combination-scorer.ts` was removed** (diverged from "defer / reassess Sprint 145").
> - **Kademe 3 (ADR-028 V1):** `decision-engine.ts`, `decision-replay.ts`, `decision-steps/agent-step.ts`, `decision-steps/scope-step.ts` all still present — accurate ✓.
> - **Kademe 4 (false positive):** `parallel-pipeline.ts` confirmed present and actively imported — accurate ✓.
>
> Behavior unchanged; documentation alignment only (records the real outcome vs the original plan).


---

## adr-039: Self-Modifying Task Detection — Deckent Dogfood vs User Project Discrimination

**Status:** accepted

# ADR-039: Self-Modifying Task Detection — Deckent Dogfood vs User Project Discrimination

**Status:** accepted

**Date:** 2026-04-15

**Sprint:** 139

---

**Context:**

Deckent iki farklı modda çalışır:

1. **Deckent-Dogfood modu:** Deckent kendi kaynak kodunu sprint ile değiştirir (örn. Sprint 139 Wave 5 `src/orchestra/` modülleri). Bu durumda Brain'in runtime cache'i invalidate olur, MCP server eski kodu çalıştırır ve `tsc` rebuild gerekir. Sprint 138 Layer 4 fail'in root cause'u tam olarak budur: worker `src/orchestra/sprint-finalizer.ts`'i değiştirdi ama Brain hâlâ eski pre-build cache'teki kodu çalıştırıyordu.

2. **Kullanıcı-Projesi modu:** Deckent, kullanıcının projesini (Rails app, React app, Go service vb.) orkestre eder. Kullanıcının kaynak kodu Deckent'in runtime'ını etkilemez — cache invalidation ve MCP restart gereksizdir.

Bu iki mod arasındaki ayrım hiçbir yerde formalize edilmemişti. Sonuçlar:

- Sprint 138 Task 6 (Layer 4 Wire Forensic Fix): 3-sprint üst üste runtime fail. Worker `sprint-finalizer.ts`'i değiştirdi, Brain eski kodu çalıştırdı, gate.json/load-report/metrics.jsonl üretilmedi.
- Self-modifying sprint'lerde parallel execution riskli: iki worker aynı anda `src/orchestra/` modüllerini değiştirirse tsc rebuild çakışır.
- Kullanıcı projelerinde gereksiz restart/rebuild overhead: her sprint sonunda MCP restart tetiklemek anlamsız.

**Decision:**

`src/orchestra/self-modifying-detector.ts` modülü ile runtime self-modification tespiti. Üç public fonksiyon:

### 1. `detectDeckentRepo(projectRoot: string): boolean`

Proje dizininin Deckent'in kendi repo'su olup olmadığını tespit eder. İki koşulun **ikisi birden** sağlanmalı:
- `.deckent/` dizini mevcut (gerekli ama yeterli değil — kullanıcı projeleri de bunu içerir)
- `package.json` dosyasının `name` alanı `'deckent'` (kesin ayırıcı)

### 2. `isSelfModifying(task: Pick<Task, 'scope'>, projectRoot: string): boolean`

Tek bir task'ın Deckent'in kendi kaynak kodunu değiştirip değiştirmediğini tespit eder. İki koşul:
- `detectDeckentRepo(projectRoot) === true`
- Task'ın `scope.directories` veya `scope.filesWrite` listesinde en az bir Deckent source pattern'ı bulunuyor

**Deckent Source Patterns:**
```
src/core/
src/orchestra/
src/monitor/
src/agents/
src/cli/
src/mcp/
src/providers/
src/api/
src/dashboard/
.deckent/agents/
.deckent/skills/
```

### 3. `isSelfModifyingSprint(tasks: ReadonlyArray<Pick<Task, 'scope'>>, projectRoot: string): boolean`

Sprint seviyesinde tespit: en az bir task self-modifying ise sprint self-modifying kabul edilir.

### Policy Kararları

**P1: Sequential Execution Zorunluluğu**
Self-modifying task'lar aynı wave içinde **sequential** çalıştırılmalı (parallel: false). İki worker aynı anda `src/orchestra/` modüllerini değiştirirse tsc rebuild race condition oluşur.

**P2: Wave 0 Self-Boot Gate (Gelecek Sprint)**
Self-modifying sprint tespit edildiğinde Brain otomatik Wave 0 `tsc && vitest run` gate prepend eder — mevcut codebase sağlığı doğrulanır. Bu ADR tasarımı tanımlar, runtime wiring Sprint 140+ scope.

**P3: Post-Task Auto-Checkpoint**
Self-modifying task tamamlandıktan sonra otomatik checkpoint yazılır (sprint-checkpoint.ts). MCP restart gerekiyorsa checkpoint'ten resume edilebilir.

**P4: Kullanıcı Projelerinde No-Op**
`detectDeckentRepo() === false` → tüm self-modifying kontrolleri atlanır. Zero overhead kullanıcı projeleri için.

### Integration Points

| Entegrasyon | Dosya | Açıklama | Sprint |
|-------------|-------|----------|--------|
| Detection API | `self-modifying-detector.ts` | 3 public fonksiyon | Sprint 139 (bu ADR) |
| Spawner wave sequencing | `sprint-spawner.ts` | `isSelfModifyingSprint` → sequential wave | Sprint 140+ |
| Finalizer MCP restart hook | `sprint-finalizer.ts` | Post-task rebuild + MCP restart | Sprint 140+ |
| Event stream integration | `event-stream.ts` | `BRAIN→*:SELF_MODIFY_DETECTED` channel | Sprint 140+ |

**Consequences (+):**

- Sprint 138 Layer 4 fail root cause formalize edildi — gelecekte aynı hata sınıfı önlenir
- Kullanıcı projeleri sıfır overhead — `detectDeckentRepo()` tek `readFileSync` + JSON.parse
- Self-modifying sprint'ler runtime-aware: Brain cache invalidation, sequential execution, auto-checkpoint
- Deckent-dogfood sprint'lerde `tsc` rebuild race condition riski ortadan kalkar (sequential wave)
- ADR-035 event stream'e `SELF_MODIFY_DETECTED` channel eklenebilir (Sprint 140+ extension point)

**Consequences (-):**

- `package.json` name check heuristic — fork'lar farklı name kullanabilir (edge case, kabul edilebilir)
- Deckent source pattern listesi bakım gerektirir — yeni `src/` alt dizini eklenirse güncellenmeli
- Wave 0 gate ve MCP restart wiring Sprint 140+ ertelendi — Sprint 139'da yalnızca detection API

**Alternatives Considered:**

- **Compile-time detection (tsc plugin):** TypeScript compiler plugin ile import graph analizi. Reddedildi: plugin maintenance cost yüksek, runtime'da tsc plugin API instabil.
- **Git-based detection (`git diff --name-only`):** Değişen dosyaları git'ten oku. Reddedildi: plan-time'da (sprint başlamadan) henüz değişiklik yok — scope'tan tespit etmek daha erken ve daha güvenilir.
- **Environment variable (`DECKENT_DOGFOOD=1`):** Manual flag. Reddedildi: ADR-033 "kur-çalıştır" ilkesi — otomatik tespit tercih edilir, kullanıcı konfigürasyon burden'ı minimize edilmeli.
- **Tüm sprint'leri self-modifying kabul et:** Her sprint sonrası rebuild + restart. Reddedildi: kullanıcı projeleri için gereksiz overhead, Sprint 138 audit 799 sync I/O hot path bulgusuyla çelişir.

**References:**

- Sprint 138 Task 6: Layer 4 Runtime Wire Forensic Fix — root cause (Brain pre-build cache)
- Sprint 138 Task 4: Event Stream + Plan-Time Scope Collision Detection — sequential wave pattern
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol — event stream extension point
- ADR-033: Product Vision — kur-çalıştır ilkesi (otomatik detection, manual flag değil)
- ADR-037: RBAC Authority Matrix — Brain/Worker dosya erişim sınırları
- `src/orchestra/self-modifying-detector.ts` — Sprint 139 implementasyonu
- `src/orchestra/sprint-spawner.ts` — Sprint 140+ sequential wave wiring

> **Note (verified vs code, Sprint 172):** The **detection API is real** — `src/orchestra/self-modifying-detector.ts` exports `detectDeckentRepo`, `isSelfModifying`, `isSelfModifyingSprint`, consumed by `src/orchestra/authority-enforcer.ts` and `src/agents/worker.ts`. **However, the "Sprint 140+ Integration Points" did not land:** there is no sequential-wave wiring in `sprint-spawner.ts`, no MCP-restart hook in `sprint-finalizer.ts`, no `SELF_MODIFY_DETECTED` channel in `event-stream.ts`, and the P2 Wave-0 gate is unwired. In practice deckent-dev self-modifying sprints are handled via **ADR-047 (Manuel Subagent Dispatch)** — manual, isolated dispatch — rather than the projected automated sequential-wave / rebuild-restart orchestration. Behavior unchanged; documentation alignment only (records actual state vs the original roadmap).


---

## adr-040: Nervous System Architecture — Proactive Meta-Orchestrator

**Status:** accepted

# ADR-040: Nervous System Architecture — Proactive Meta-Orchestrator

**Status:** accepted

**Date:** 2026-04-20

**Sprint:** sprint-147

---

## Context

Deckent'in Sprint 144–146 boyunca yaşanan canlı olaylar, proaktif bir meta-katmana olan ihtiyacı kanıtladı:

- **Sprint 145 08:14 TRT**: DIRECTIVES.md, EXECUTE fazında template'e döndü (463 byte — içerik silinmiş). Sprint duraklayarak manuel müdahale gerektirdi.
- **Sprint 145 test-writer anomalisi**: 14/17 task (%53) aynı agent'a route edildi — normal dağılım %40 eşiğini aştı. Brain fark etmedi, sadece retro sonrası görüldü.
- **Sprint 146 T-146-005 `string;` corruption**: Bir task'ın assignedAgent alanı geçerli bir agent ID yerine TypeScript syntax kalıntısı içeriyordu. Sprint sonuna kadar fark edilmedi.
- **Sprint 146 dead SDL write**: Sprint Decision Log yazma girişimi sırasında silent failure oluştu, record kayboldu.

Bu olayların ortak paydası: mevcut mimaride Brain/Auditor/Worker üçlüsü **reaktif** çalışıyor — hata oluştuktan sonra retro'da görülüyor. Proaktif bir gözlemci katman yoktu.

## Decision

`src/nervous/` altında **Proactive Meta-Orchestrator** (Nervous System) inşa edildi. Sprint 147'nin 22 task'ı bu kararı hayata geçirdi.

### Mimari Pipeline

```
Observer → DetectorRegistry → DecisionEngine → Proposer → Dispatcher → Executor
```

**Observer** (`T-147-004`): 4 event source — EventBus, Filesystem watcher (.tasks/, .brain/, DIRECTIVES.md, .deckent/), 15s Cron tick, Sprint lifecycle events (SPRINT_PHASE_CHANGE, SPRINT_RETRO_COMPLETE).

**DetectorRegistry** — 5 MVP detector:
- `StaleWorkerDetector` (T-147-009): 3dk+ HB yok → WORKER_RESPAWN suggest
- `ScopeCollisionMonitor` (T-147-010): PLAN/EXECUTE fazında çakışan filesWrite → SCOPE_COLLISION_REORDER
- `DebtTrendAnalyzer` (T-147-011): Son 3 sprint >%15 debt rate → DEBT_REPRIORITIZE
- `AgentRoutingHealth` (T-147-012): Agent ID corruption (`string;` pattern) + %40 anomaly detection
- `DirectivesMidSprintProtection` (T-147-013): EXECUTE/FIX fazında DIRECTIVES.md template'e dönüşünü tespit + emergency restore

**DecisionEngine** (T-147-005): DetectorResult → AuthorityMatrix lookup → DecisionOutput (policy + risk + safetyFloor flag).

**AuthorityMatrix** (T-147-003): 4 preset:
- `strict`: low→suggest-30m, medium/high→approve
- `balanced`: low→autonomous, medium→suggest-30m, high→approve  
- `autopilot`: low/medium→autonomous, high→suggest-5m
- `full-auto`: all→autonomous (safety floor hariç)

**5 Locked Safety Floor** (asla override edilemez):
KILL_LIVE_SPRINT, MANUAL_FILE_DELETE, COST_OVER_THRESHOLD, DESTRUCTIVE_GIT, ADR_DEPRECATE_ACCEPTED

**Proposer** (T-147-006): Throttle (5dk groupKey dedup) + severity filter + NervousNotification builder.

**Executor** (T-147-007): 3 mod — autonomous (hemen), suggest-timeout (timer + auto-apply), approve (user decision bekler). Reversible undo desteği.

**Dispatcher** (T-147-018): Context detection (MCP env / TTY) + 3 adapter — MCP, CLI, File. Cross-channel dedup.

**History** (T-147-008): `.deckent/nervous-history.jsonl` append-only audit trail. 30-day retention.

### Action Registry

30 eylem, 4 kategori (T-147-002):
- Low risk (8): DEAD_EVENT_STREAM_CLEANUP, ORPHAN_TASK_ARCHIVE, LOG_ROTATION, CACHE_INVALIDATE, STALE_LOCK_RELEASE, IPC_DIR_CLEANUP, DEBT_TRENDING_REPORT, METRIC_EMIT
- Medium risk (11): DIRECTIVES_WRITE, PROMPT_BUILDER_TWEAK, SKILL_ROUTING_ADJUST, DEBT_REPRIORITIZE, WORKER_RESPAWN, SCOPE_COLLISION_REORDER, ADR_DRAFT, RETRO_AUGMENT, AGENT_PERFORMANCE_FLAG, SPRINT_GATE_ADJUST, TASK_DEPENDENCY_REWIRE
- High risk (11): SPRINT_START, SPRINT_STOP, SRC_MODIFICATION, COMMIT_CREATE, COMMIT_PUSH, AGENT_DISABLE, COST_THRESHOLD_RAISE, ADR_ACCEPT, PROVIDER_SWITCH, CONFIG_MIGRATE, NPM_PUBLISH

### User Interface

**CLI** (T-147-014): `deckent nervous` — dashboard, accept/reject/edit/undo/history/log subcommands.

**CLI Config** (T-147-015): `deckent config nervous set mode <preset>` + per-action override.

**MCP Tools** (T-147-016): 5 yeni tool — deckent_nervous_subscribe, deckent_nervous_accept, deckent_nervous_reject, deckent_nervous_status, deckent_nervous_config. Toplam 27 MCP tool.

**Config Schema** (T-147-017): `nervous_system` section — 3-layer config merge. Default: enabled=false (Sprint 148'de true).

**Sprint Controller Hook** (T-147-021): Her phase geçişinde EventBus'a SPRINT_PHASE_CHANGE + SPRINT_RETRO_COMPLETE emit.

## Consequences

### Positive
- **Proaktif görünürlük**: Hata olmadan önce tespit edilir, kullanıcıya önerilir.
- **Autonomy control**: 4 preset + per-action override ile granüler kontrol. Safety floor garantisi.
- **Audit trail**: Her eylem JSONL history'de, undo destekli.
- **Sprint 145/146 bug'ları yakalanabilir hale geldi**: AgentRoutingHealth T-147-012 direkt olarak `string;` corruption'ı tespit eder.
- **CLI/MCP parity**: ADR-022-v2 gereği her CLI komutu MCP tool olarak da erişilebilir.

### Negative
- **Complexity artışı**: ~3500+ LoC yeni modül. Sprint 148'de canlı dogfood gerekli.
- **enabled=false başlangıç**: Sprint 148 aktifleştirme + Sprint 149 doc sprint zorunlu.
- **Self-modifying risk**: Deckent kendi `src/nervous/`'ini yazıyor — ADR-039 self-modifying detection aktif tutulmalı.
- **FS watcher overhead**: 4 dizin izleme — low-traffic projelerde ≤1% CPU, high-traffic'de monitoring gerekebilir.

## References

### Sprint 145 Canlı Kanıtlar
- DIRECTIVES.md mid-sprint template bug (08:14 TRT, EXECUTE fazı, 463 byte)
- test-writer %53 anomaly (14/17 task, tek agent overload)
- Sprint 145 T-145-006 NotifyDispatcher foundation (Nervous Dispatcher base)
- Sprint 145 T-145-003 EventBus (Observer subscription base)

### Sprint 146 Kanıtlar
- T-146-005: `string;` agent corruption (assignedAgent geçersiz değer)
- T-146-012: ADR-040 placeholder types (nervous-types.ts ~190 LoC, status=proposed)
- Sprint 146 retro: 16/17 done, avg rubric 94

### Sprint 147 Implementation Tasks
- T-147-001: nervous-types.ts genişletme (ObserverEvent, DetectorContext, ActionDefinition, ExecutionRecord)
- T-147-002: action-registry.ts (30 eylem, risk matrix)
- T-147-003: authority-matrix.ts (4 preset, resolvePolicy, safety floor)
- T-147-004: observer.ts (NervousObserver, 4 source)
- T-147-005: decision-engine.ts (DecisionEngine, quiet hours)
- T-147-006: proposer.ts (Proposer, throttle, groupKey)
- T-147-007: executor.ts (Executor, 3 mod, pending approvals)
- T-147-008: history.ts (NervousHistory, JSONL, undo, prune)
- T-147-009: detectors/stale-worker.ts
- T-147-010: detectors/scope-collision.ts
- T-147-011: detectors/debt-trend.ts
- T-147-012: detectors/agent-routing.ts (string; corruption detector)
- T-147-013: detectors/directives-protection.ts (emergency restore)
- T-147-014: cli/commands/nervous.ts (deckent nervous)
- T-147-015: cli/commands/config-nervous.ts (deckent config nervous)
- T-147-016: mcp/tools/nervous.ts (5 MCP tool)
- T-147-017: core/config.ts nervous_system schema extension
- T-147-018: nervous/dispatcher.ts (3 adapter, context detection)
- T-147-019: tests/nervous/integration/ (40+ test suite)
- T-147-020: tests/e2e/nervous-flow.test.ts (canlı sprint sim)
- T-147-021: orchestra/sprint-controller.ts lifecycle event emit
- T-147-022: ADR-040 accept (bu kayıt)

### Design Spec
- `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md` (583 satır, 14 section)

---

> **Note (verified vs code, Sprint 172):** `src/nervous/` exists with the full pipeline modules (observer, detector-registry, decision-engine, proposer, dispatcher, executor, authority-matrix, history, runtime-scope-check, detectors/) and the **sprint-controller EventBus hook is wired** (`src/orchestra/sprint-controller.ts` — `emitSprintEvent('SPRINT_PHASE_CHANGE', …)`, "always fires, subscribers optional"). The MCP `deckent_nervous_*` tools exist. Consistent with this ADR's own caveats, the Nervous System is **config-gated / opt-in**: the proactive Observer pipeline is not the default active path, and in practice deckent-dev operates self-modifying sprints via ADR-047 (Manuel Subagent Dispatch) rather than autonomous nervous execution. The "Toplam 27 MCP tool" figure (under "MCP Tools") is a Sprint-147 snapshot — the current count is higher (~31, drift-prone; canonical: `docs/reference/mcp-tools.md`). Behavior unchanged; documentation alignment only.


---

## adr-041: Agent Taxonomy — Horizontal Skills vs Vertical Agents

**Status:** accepted

# ADR-041: Agent Taxonomy — Horizontal Skills vs Vertical Agents

**Status:** accepted

**Date:** 2026-04-21

**Sprint:** sprint-150

---

## Status
accepted (Sprint 150 — reconfirmed with Sprint 150 dogfood evidence)

## Context

Sprint 146-147 canlı kanıtları agent taxonomy problemini açığa çıkardı:

- **Sprint 145:** test-writer 14/27 (%52) — beklenmedik yüksek atama oranı
- **Sprint 146:** test-writer 9/17 (%53) — anomali devam ediyor
- **Sprint 147:** test-writer 22/22 (%100) — **kritik eşik aşıldı**, ADR gereksinimi tetiklendi

AgentRoutingHealth detector (Sprint 147 T-147-003) %95 anomaly threshold'u aşıldığını bildirdi. `test-writer` agent, "test" keyword'ü içeren her task'a (scope=tests/ dahil) atanıyordu. Bu durum şu sorunlara yol açtı:

1. **Yanlış taxonomik sınıflandırma:** "Test yazmak" bir yatay beceridir (her agent yapabilir), dikey uzmanlık alanı değil.
2. **Routing dağılımı bozukluğu:** Tek agent %100 atamasıyla anomaly detector anlamsız hale geldi.
3. **Beta GA UX problemi:** Kullanıcılar "neden her task test-writer'a gidiyor?" sorusunu soruyor.
4. **Intent classifier yanlışlığı:** 'testing' primary intent olarak tanımlanması her test/ scope task'ı yanlış sınıflandırıyordu.

Sprint 148 Block A (T-148-001..T-148-005) reform paketini hayata geçirdi:
- test-writer agent arşivlendi (T-148-001)
- testing-expert skill auto-activation eklendi (T-148-002)
- Intent classifier 'testing' primary intent kaldırıldı, 'test-coverage' tag sistemi eklendi (T-148-003)
- Router V2 agent fallback chain güncellendi — test-writer yok (T-148-004)
- 15 agent PROMPT.md rubric spec temizlendi (T-148-005)

## Decision

Agent taxonomy şu şekilde reorganize edildi:

**Agent = Dikey Uzmanlık** — belirli bir domain'de derin bilgi:
- `architect` — sistem tasarımı, modül yönetimi
- `security-auditor` — güvenlik açıkları, OWASP
- `frontend-designer` — UI/UX, component tasarımı
- `doc-writer` — dokümantasyon, README, CHANGELOG
- `bug-fixer` — hata ayıklama, regression
- vb.

**Skill = Yatay Beceri** — herhangi bir agent tarafından kullanılabilir:
- `testing-expert` — test yazımı, vitest, coverage (scope tests/** veya *.test.ts ile auto-activate)
- `typescript-expert` — TypeScript tip sistemi
- `documentation-writer` — Markdown, JSDoc
- vb.

**Test, yatay beceridir** — architect da test yazar, bug-fixer da. test-writer agent'ı gereksizdir.

### Routing Kuralları

1. Intent classifier: 'testing' artık primary intent değil. Scope tests/** → 'test-coverage' tag eklenir.
2. selectSkills(): scope tests/** veya filesWrite *.test.ts içeriyorsa testing-expert otomatik eklenir.
3. selectAgent(): task primary intent'e göre seçilir (core-dev → architect, bug-fix → bug-fixer, vb.)
4. AgentRoutingHealth: threshold %40 — hiçbir agent %40'ı aşmamalı.

## Consequences

**(+) Routing dağılımı dengelendi** — Sprint 148 hedef: hiçbir agent %43'ü aşmamalı (architect borderline kabul edilebilir — multi-block varlığı nedeniyle).

**(+) AgentRoutingHealth detector anlamlı** — Artık gerçek anomalileri yakalayabilir, false %100 görüntüsü ortadan kalktı.

**(+) Beta GA UX temizlendi** — Kullanıcılar routing kararlarını anlayabiliyor; "test-writer neden her yerde?" sorusu sorulmaz.

**(+) Skill ekonomisi** — testing-expert birden fazla agent ile çalışabilir. Tek-agent monopolisi yerine skill reuse.

**(-) Sprint 147 test-writer stats arşivlendi** — Tarihsel performans verileri kaybedilmedi, arşivlendi (`.deckent/agents/archive/test-writer-removed-sprint-148/`).

**(-) Breaking change** — Özel (custom) `test-writer` agent tanımlayan kullanıcı projeleri migration adapter gerektirebilir.

## Dogfood Kanıtları (Sprint 149 + Sprint 150 Acceptance)

- **Sprint 148 Test-Writer Atama:** Sprint 148 reform sonrası 27 task arasında test-writer = 0 atama (baseline %95'ten %0'a)
- **Sprint 149 Gate 6:** `grep test-writer .tasks/*.json | wc -l` = 0 — enforcement canlı
- **AgentRoutingHealth:** Sprint 148 anomaly algısı = 0 false positive (detector artık anlamlı)
- **ADR-037 RBAC:** test-writer authority matrix'ten çıkarıldı (Sprint 149 T-149-025 doğrusu)
- **Sprint 150 Gate 6:** Sprint 150 38 task arasında test-writer assigned = 0 — taxonomy reform kalıcı
- **Sprint 150 AgentRoutingHealth:** Anomaly threshold %40 altında — routing dağılımı dengeli

## Implementation Status

- **Sprint 148 T-148-001:** test-writer archive ✅
- **Sprint 148 T-148-002:** testing-expert auto-activation ✅
- **Sprint 148 T-148-003:** Intent classifier refactor ✅
- **Sprint 148 T-148-004:** Router V2 fallback chain ✅
- **Sprint 148 T-148-005:** Agent PROMPT.md cleanup ✅
- **Sprint 149 T-149-025:** ADR ACCEPT + evidence recorded ✅
- **Sprint 150 T-150-025:** ADR-041 reconfirmed with Sprint 150 dogfood — test-writer=0 in 38-task sprint ✅

## References

- Sprint 146 T-146-005: string; corruption — test-writer agent.json bozulması
- Sprint 147 T-147-003: AgentRoutingHealth detector — %95 anomaly detection
- Sprint 148 T-148-001..005: Reform implementation package
- ADR-037: Brain-Auditor-Worker Authority Matrix RBAC V1.0
- ADR-040: Nervous System Architecture — AgentRoutingHealth detector integration

> **Note (verified vs code, Sprint 172):** Confirmed accurate — `.deckent/agents/` holds **15 built-in agents** (excluding temp/archive); `test-writer` is removed and archived under `.deckent/agents/archive/test-writer-removed-sprint-148/`. The Agent=vertical / Skill=horizontal taxonomy is consistent with `docs/architecture/agents.md` and `docs/architecture/agent-skill-architecture.md`. This decision was further **re-reconfirmed in Sprint 166** (per `DECKENT.md`) — still in force. Behavior unchanged; documentation alignment only.


---

## adr-042: Hybrid Mode Architecture — Sprint + Task Dual Modes

**Status:** accepted

# ADR-042: Hybrid Mode Architecture — Sprint + Task Dual Modes

**Status:** accepted

**Date:** 2026-04-21

**Sprint:** sprint-150

---

## Status
accepted (proposed Sprint 150 → accepted: dual-mode shipped & verified in code, Sprint 172)

## Context

Deckent'in iki farklı kullanım paradigması var:

1. **Developer Orchestration (Sprint Mode):** Yazılım geliştiriciler için — çoklu agent, sprint lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE), DIRECTIVES.md tabanlı, CI/CD entegrasyonu. Mevcut ana kullanım senaryosu.

2. **Life Assistant (Task Mode):** Gündelik kullanıcılar için — tek seferlik görevler, doğal dil, anlık cevap, messaging connector entegrasyonu (Discord/Telegram). Sprint 149 Block A ile temel hazırlandı.

Bu iki mod, aynı Deckent çekirdeği üzerinde çalışır ancak farklı ön yüz davranışı, routing mantığı ve UX beklentisi gerektirir:

- **Sprint Mode'da:** Brain aktif, DIRECTIVES.md zorunlu, multi-worker paralel, retro/memory lifecycle var.
- **Task Mode'da:** Brain bypass, tek worker, anında sonuç, messaging connector üzerinden input.

Tek bir config key ile toggle edilebilir olmalı: `deckent_style: "sprint" | "task"`.

## Decision

`deckent_style` config key (ADR-004 3-layer merge uyumlu) ile hybrid mod mimarisi:

```typescript
// src/core/config-types.ts
export interface DeckentConfig {
  /** Active runtime style */
  deckent_style?: 'sprint' | 'task';
}
```

**Routing Mantığı:**

```
deckent_style === 'sprint' → runSprint() → PLAN/SPAWN/EXECUTE/EVALUATE lifecycle
deckent_style === 'task'   → runTaskMode() → single worker, instant result
```

**CLI Entry Point:**

```bash
deckent mode sprint   # Switch to sprint mode
deckent mode task     # Switch to task mode  
deckent mode auto     # Auto-detect from context (git+DIRECTIVES → sprint)
deckent mode show     # Show current mode
```

**Config Hierarchy (ADR-004):**

```
env DECKENT_STYLE=task (highest)
  → .deckent/config.json { "deckent_style": "task" }
    → ~/.deckent/config.json { "deckent_style": "sprint" }
      → default: "sprint"
```

**Nervous System Integration:**

- `TaskModeIdleDetector` — task modunda 5+ dakika idle → kullanıcı hatırlatması
- `AgentRoutingHealth` — her iki modda da aktif

## Consequences

**(+) Dual Audience:** Developer ve life assistant kullanıcılar aynı ürünü kullanabilir, farklı mod ile.

**(+) DeckentHub Ekosistemi:** Task mode'a yönelik life assistant skill'leri (spotify-control, calendar, weather) hub'da ilk sınıfı oluşturur. Hub'ın değeri iki katına çıkar.

**(+) Messaging Connector Zemin:** Block C connector'ları (Discord/Telegram) task mode ile anlamlı olur. Sprint mode'da "deploy yap" komutu → sprint trigger; task mode'da "hava durumu?" → anlık cevap.

**(+) ADR-040 Uyumlu:** Nervous system detector pipeline her iki modda çalışır. Mode-specific detector (TaskModeIdleDetector) eklendi.

**(-) Mode-Aware Code Complexity:** sprint-controller.ts, task-mode-runner.ts, event-stream — her biri mode check gerektiriyor. "Sprint mi task mı?" sorusu kodun birçok yerinde sorulacak.

**(-) Test Matrix Genişlemesi:** Her özellik artık 2 modda test edilmeli. Sprint 149+ test budget'ı ~%30 artacak.

**(-) Kullanıcı Karmaşası:** "Hangi modda mıyım?" sorusu. `deckent mode show` ile mittige edildi, ancak onboarding UX dikkat gerektirir.

## Implementation Plan

- **Sprint 149 T-149-001:** `deckent_style` config key (3-layer merge) ✅
- **Sprint 149 T-149-002:** `deckent mode` CLI command ✅  
- **Sprint 149 T-149-003:** Sprint controller mode-aware routing ✅
- **Sprint 149 T-149-004:** Nervous system TaskModeIdleDetector ✅
- **Sprint 150 T-150-001:** `deckent_style` config key 3-layer integration (reconfirm + validation) 🔄
- **Sprint 150 T-150-002:** `deckent mode` CLI command (mode show/sprint/task/auto/global) 🔄
- **Sprint 150 T-150-003:** Sprint controller mode-aware routing (task-mode-runner.ts) 🔄
- **Sprint 150 T-150-004:** Nervous system TaskModeIdleDetector (task-mode-idle.ts) 🔄
- **Sprint 151+:** Task mode full UX (onboarding flow, mode indicator, messaging auto-route)

## References

- ADR-004: 3-Layer Config Merge — config hierarchy
- ADR-040: Nervous System Architecture — detector pipeline
- ADR-041: Agent Taxonomy — skill vs agent distinction (task mode reuses same pool)
- Sprint 149 DIRECTIVES Block A — mode architecture implementation
- Sprint 148 competitive analysis: OpenClaw life assistant mode comparison

> **Note (verified vs code → status promoted, Sprint 172):** This ADR was marked `proposed` but the dual-mode is **shipped and verified**: `src/orchestra/task-mode-runner.ts` (`runTaskMode()`), `src/cli/commands/mode.ts` (`VALID_STYLES = ['sprint','task']`, `deckent mode sprint|task|auto`), the `deckent_style` config key (3-layer merge, ADR-004), and `README.md` presents Dual Mode as a core feature. Status therefore promoted **proposed → accepted** (governance-approved). The `🔄` items above (T-150-003/004 full task-mode UX, idle detector) reflect Sprint-150-era progress markers; the core toggle + runner are in place. `.brain/exports/summary.md`/`memory.db` will reflect `accepted` after the next `syncAdrFilesToDb` (docs/adr → DB). Behavior unchanged; documentation alignment only.


---

## adr-043: Brain Crash Recovery Protocol

**Status:** accepted

# ADR-043: Brain Crash Recovery Protocol

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-13

**Sprint:** Sprint 163 (backfill — implementation sprints: 160, 161, 162)

---

## Status

accepted (Sprint 163 — Sprint 160 T-001 + Sprint 161 T-002 + Sprint 162 T-004 birleşik implementasyonunun geriye dönük belgelenmesi)

---

## Context

Sprint 159–161 forensic analizinde Brain crash recovery'nin üç kritik eksikliği tespit edildi:

**1. Negatif `durationMs` bug (`durationMs: -106`)**
Sprint state dosyası (`sprint-state.json`) crash öncesi `startTime` doğru yazılmıştı; ancak crash sonrası Brain yeniden başladığında `durationMs` hesaplaması yanlış referans zamanı kullanıyordu. Sonuç: negatif süre değerleri dashboard'da görünür hale geldi, sprint metrikleri güvenilmez oldu.

**2. Stale EXECUTING task'lar `handleEvaluation`'a girmedi**
Brain crash anında bazı task'lar `EXECUTING` statüsünde kalmış olabiliyordu. Yeniden başlamada bu task'ların `.result` dosyaları disk'te varken Brain bunları `handleEvaluation` pipeline'ına sokmuyordu. Görünürde tamamlanmış iş kayboluyordu; sprint döngüsü yanlış `NO_GO` veya eksik evaluate ile kapanıyordu.

**3. Sensitive data exception log'unda leak riski**
Unhandled exception yakalanmadığı durumlarda `process.on('uncaughtException')` handler yoktu. Stack trace'ler içinde `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` gibi environment variable değerleri doğrudan log'a yazılabiliyordu. Bu durum ADR-034 (Multi-Project Isolation) güvenlik sınırlarını ihlal edebilirdi.

Bu üç sorun birbirinden bağımsız commit'lerde düzeltildi (Sprint 160 T-001, Sprint 161 T-002, Sprint 162 T-004) ancak bir recovery protokolü olarak ADR'ye alınmamıştı. ADR-043 bu protokolü resmî hale getirir.

---

## Decision

Brain için **3-katman crash recovery protokolü** zorunlu kılınır:

### Katman 1 — Entry-Point Exception Handler (Sprint 160 T-001)

**Commit:** `9c184a3`

Process boot'ta `installCrashHandlers()` çağrısı yapılır. Bu fonksiyon:

- `process.on('uncaughtException', handler)` kaydeder
- `process.on('unhandledRejection', handler)` kaydeder
- Her handler `redactSensitive(error.message + stack)` çağrısıyla API key/token pattern'lerini log'a yazmadan önce `***REDACTED***` ile değiştirir

`redactSensitive()` regex coverage:
- `sk-ant-...` (Anthropic API key pattern)
- `Bearer <token>`
- `OPENAI_API_KEY=<value>`
- `GOOGLE_API_KEY=<value>`
- Genel `apiKey: "..."` JSON pattern

**Zorunluluk:** `sprint-controller.ts` veya entry-point binary'de `installCrashHandlers()` process boot'un ilk satırlarında çağrılmalıdır. Handler kurulmadan sprint başlatılamaz.

### Katman 2 — Atomic Checkpoint Write (Sprint 161 T-002)

**Commit:** `8cefed0`

Sprint execution boyunca periyodik checkpoint yazımı yapılır (`sprint_checkpoint_interval` config anahtarı, `config.ts:602` default `5`; Sprint 139 yüksek-riskli sprint'lerde `3`'e override edilir). Checkpoint atomicity kuralı:

1. `computeEventStreamOffset()` ile o ana kadar yazılan event sayısı hesaplanır
2. `completedTasks` listesi checkpoint'e eklenir (boş array YASAK — en az 1 completed task varsa populate edilmeli)
3. `checkpointNumber` her yazımda artırılır
4. Dosya **doğrudan hedef path'e yazılmaz** — önce `.tmp` suffix'li geçici dosyaya yazılır, ardından `renameSync()` ile atomik rename yapılır

Bu pattern, yarı yazılmış checkpoint'in okunan geçersiz state'e yol açmasını önler. `renameSync()` POSIX sistemlerde atomik garantilidir.

**Checkpoint schema zorunlu alanları:**
```json
{
  "checkpointNumber": "<integer >= 1>",
  "eventStreamOffset": "<integer > 0>",
  "completedTasks": ["<taskId>", "..."],
  "sprintId": "<sprint-NNN>",
  "timestamp": "<ISO 8601>"
}
```

### Katman 3 — State Recovery on Restart (Sprint 162 T-004)

`restoreSprintFromCheckpoint()` fonksiyonu Brain restart'ında checkpoint'i okur ve 3 action'dan birini seçer:

| Koşul | Action | Açıklama |
|---|---|---|
| Checkpoint yok | `fresh` | Yeni sprint başlat, geçmiş state yok |
| Tüm task'lar DONE veya NO_GO | `complete` | Sprint zaten tamamlanmış, cleanup'a geç |
| Stale EXECUTING task'lar var + `.result` mevcutsa | `resume-evaluate` | `.result` dosyasını `handleEvaluation`'a sok |

**`resume-evaluate` ayırt etme kuralı:**
Stale EXECUTING task için `.tasks/task-NNN.result` dosyası disk'te mevcutsa → worker iş bitirmiş, Brain crash etmişti → result `handleEvaluation`'a girer.
`.result` yoksa → worker da crash etmiş veya henüz tamamlamamış → task EXECUTING kalır, timeout beklenir.

**`durationMs` fix:**
`restoreSprintFromCheckpoint()` içinde sprint `startTime` checkpoint'ten restore edilir. `durationMs` hesabı `Date.now() - restoredStartTime.getTime()` olarak yapılır. Bu negatif durationMs bug'ını ortadan kaldırır.

---

## Consequences

### Olumlu

- **Brain restart sonrası state korunur.** `resume-evaluate` action ile tamamlanmış worker sonuçları kaybolmaz.
- **Negatif `durationMs` giderildi.** Sprint metrikleri crash sonrasında da anlamlı değerler gösterir.
- **Sensitive data exception log'una sızmaz.** `redactSensitive()` API key/token değerlerini process crash loglarından temizler.
- **External observer crash öncesi state'i restore edebilir.** Atomic checkpoint, makul bir tutarlılık noktası sağlar.
- **Checkpoint integrity.** `.tmp` + `renameSync()` pattern sayesinde yarı yazılmış checkpoint asla okunmaz.

### Olumsuz

- **Checkpoint overhead.** Her `sprint_checkpoint_interval` (default 5) I/O yapılır. Yoğun sprint'lerde disk I/O artar; ancak `renameSync()` maliyeti genellikle ihmal edilebilir.
- **`resume-evaluate` sadece `.result` varlığına bakar.** Worker `.result` yazmış ama dosya bozuksa (JSON parse hatası) evaluate fail olabilir. Bu durum için `handleEvaluation` içinde JSON parse guard eklenmesi önerilir (sonraki sprint).
- **`installCrashHandlers()` zorunluluğu entegrasyon testi gerektirir.** Handler'ın gerçekten kurulduğunu doğrulamak için boot-sequence test eklenmeli.

---

## Alternatives Considered

### (a) No-recovery (fresh restart)

Brain crash sonrası her zaman temiz başlatma yapılır, partial state yok sayılır.

**Reddedildi:** Partial work kaybı kabul edilemez. Özellikle uzun sprint'lerde (60+ dakika) tamamlanmış worker sonuçları sıfırlanır. Sprint duration ve task count metrikleri hatalı olur.

### (b) Full memory checkpoint

Her task completion'da tüm sprint state (task tree, event stream, memory context) tam olarak serialize edilir.

**Reddedildi:** Performance overhead çok yüksek. Event stream büyük sprint'lerde MB-seviyesine çıkabilir; her task sonrası tam serialize → write maliyetli. Mevcut periyodik checkpoint (5 dk interval, sadece completed list + offset) yeterli recovery granülaritesi sağlıyor.

### (c) Crash-only exception handler (no checkpoint)

Sadece `uncaughtException` handler ekle, checkpoint yazma yok.

**Reddedildi:** Sensitive data leak'i önler ama state recovery sağlamaz. Sprint 160 T-001 tek başına yetersiz; Katman 2 ve 3 olmadan stale task sorunu devam eder.

---

## References

- **Sprint 160 T-001** — `installCrashHandlers()` + `redactSensitive()` implementation, commit `9c184a3`
- **Sprint 161 T-002** — Atomic checkpoint write (`.tmp` + `renameSync`), commit `8cefed0`
- **Sprint 162 T-004** — `restoreSprintFromCheckpoint()` 3-action state recovery discrimination
- **ADR-034** — Multi-Project Isolation (sensitive data boundary)
- **ADR-035** — Brain ↔ Worker ↔ Auditor Verification Protocol (state integrity)
- **ADR-036** — ADR Governance Integration (mandatory read for all agents)

---

## Memory DB Insert

Sprint 163 sonunda aşağıdaki pattern ile `memory.db`'ye eklendi:

```typescript
store.insert({
  type: 'adr',
  id: 'adr-043',
  title: 'Brain Crash Recovery Protocol',
  status: 'accepted',
  sprint_id: 'sprint-163',
  tags: ['recovery', 'crash', 'brain', 'observability'],
  body: '3-katman crash recovery: exception handler + atomic checkpoint + state recovery on restart',
});
```

---

## Notes

Bu ADR, Sprint 160–162 boyunca üç ayrı commit'te gerçekleştirilen implementasyonun geriye dönük belgelenmesidir. ADR-043 olmadan Sprint 163 governance borcu kapanmış sayılmıyordu. ADR-036 (ADR Governance Integration) gereği tüm kabul edilen mimari kararlar kayıt altına alınmak zorundadır.

> **Note (verified vs code, Sprint 172):** Confirmed accurate against the codebase — referenced commits `9c184a3` (Sprint 160 T-001) and `8cefed0` (Sprint 161 T-002) **exist in this repo's git history** (real provenance, not migration-dead refs). The protocol's three layers are wired: `installCrashHandlers()` (`src/orchestra/sprint-runner-entry.ts`), `redactSensitive()` (`src/core/redact-sensitive.ts` + `src/orchestra/sensitive-redactor.ts`), and `restoreSprintFromCheckpoint()` + `computeEventStreamOffset()` (`src/orchestra/sprint-checkpoint.ts`). One naming correction applied above: the checkpoint interval is the `sprint_checkpoint_interval` config key (`config.ts:602`, default `5`), not a `CHECKPOINT_INTERVAL` constant. Behavior unchanged; documentation alignment only.


---

## adr-044: Sprint State Observability Contract

**Status:** accepted

# ADR-044: Sprint State Observability Contract

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-13

**Sprint:** Sprint 163 (governance record — implementation: Sprint 162 T-003)

---

## Status

accepted (Sprint 163 — Sprint 162 T-003 tarafından implement edilmiş contract'ın geriye dönük ADR kaydı)

---

## Context

Sprint 159–161 forensic analizi, `sprint-state.json` dosyasının sprint'in gerçek
lifecycle ilerlemesini yansıtmadığını ortaya koydu:

- Dosya `phase: "SPAWN", status: "PLANNING"` durumunda donuk kalıyor, EXECUTE →
  EVALUATE → RETRO → CLEANUP geçişleri diske yansımıyordu.
- External observer'lar (CLI `deckent status`, recovery modülü, dashboard) sprint'in
  gerçek fazını göremiyor, `sprint-state.json`'ı okuyarak yanlış kararlar alıyordu.
- Crash sonrası restart'ta hangi fazdan devam edileceği belirsizdi; `restoreSprintFromCheckpoint`
  stale EXECUTING task'ları tanıyamıyordu.
- Per-task değerlendirme kararları (`DONE / NO_GO / GO_WITH_TECH_DEBT`) yalnızca
  in-memory'de yaşıyor, post-sprint forensic için yeniden inşa edilemiyordu.

Bu körlük Sprint 159–161 boyunca "Brain'in ne yaptığı belirsiz" şikayetinin teknik
köküdür. Sprint 162 T-003, `sprint-phases.ts:persistPhaseTransition` wire'ını ve
`evaluation-audit-trail.ts:writeEvaluationAudit` çağrısını ekleyerek bu boşluğu kapattı.

---

## Decision

### 1. Phase Transition Persistence (Zorunlu)

Her `sprint.phase` mutation'ından sonra `persistPhaseTransition(projectRoot, sprint, phase, status)`
çağrısı **ZORUNLUDUR**. Aşağıdaki call-site'lar tanımlanmıştır:

| Faz Fonksiyonu    | Phase Argümanı | Status Argümanı   |
|-------------------|----------------|-------------------|
| `runPlanPhase`    | `PLAN`         | `PLANNING`        |
| `runSpawnPhase`   | `SPAWN`        | `RUNNING` → sonra `ACTIVE` |
| `runEvaluatePhase`| `EVALUATE`     | `EVALUATING`      |
| `runFixPhase`     | `FIX`          | `FIXING`          |

**Uygulama kuralları:**

- Atomic write pattern zorunlu: geçici `.tmp` dosyasına yaz, `renameSync` ile hedef
  yola taşı. Partial write ortamı bozmamalı.
- Fail-soft `try/catch` wrap zorunlu: `persistPhaseTransition` fırlatmamalı, hata
  `debugLog` ile yutulmalıdır. Brain lifecycle'ı state-file yazma hatasıyla ölmemelidir.
- Fonksiyon imzası:

```typescript
export function persistPhaseTransition(
  projectRoot: string,
  sprint: Sprint,
  phase: SprintPhase,
  status: SprintStatus,
): void
```

### 2. Per-Task Evaluation Audit (Zorunlu)

Her task evaluation sonrası `writeEvaluationAudit(projectRoot, sprintId, taskId, attemptNum, input)`
çağrısı **ZORUNLUDUR**. Audit kaydı şu schema'yı izler:

```typescript
interface EvaluationAuditRecord {
  taskId: string;
  sprintId: string;
  attemptNum: number;
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  ruleSet: AuditRuleSet;           // hangi rubrik çalıştı
  criterionScores: Record<string, number | null>;
  schemaValidation: SchemaValidationResult;
  rationale: string;               // human-readable karar gerekçesi
  timestamp: string;               // ISO 8601 UTC
}
```

Dosya yolu: `.deckent/evaluations/<sprintId>/<taskId>-attempt-<N>.json` (`EVALUATIONS_DIR` sabiti — `constants.ts:27`)

FIX-phase retry'ları `attemptNum` ile ayırt edilir; orijinal EVAL kaydının üzerine yazılmaz.

### 3. Memory DB Insert Pattern

ADR kabul edildiğinde aşağıdaki pattern ile memory.db'ye insert yapılır:

```typescript
store.insert({
  type: 'adr',
  id: 'adr-044',
  title: 'Sprint State Observability Contract',
  status: 'accepted',
  sprint_id: 'sprint-163',
  tags: ['observability', 'sprint-state', 'audit-trail', 'phase-transition'],
});
```

---

## Consequences

### Olumlu

- **Dashboard real-time tracking.** `deckent status` artık gerçek sprint fazını
  gösterir; PLAN → SPAWN → EVALUATE → RETRO geçişleri disk'te görünür olur.
- **Crash recovery determinizmi.** `restoreSprintFromCheckpoint` her fazda tutarlı
  state görür; negatif `durationMs` (-106ms bug) ortadan kalkar.
- **Post-sprint forensic.** `.deckent/evaluations/<sprintId>/` dizinindeki audit kayıtları ile
  her task'ın değerlendirme kararı, kullanılan rubrik ve skor dağılımı yeniden
  inşa edilebilir; Brain'in neden DONE/NO_GO dediği açıklanabilir.
- **Spurious NO_GO tespiti.** Audit trail `rationale` field'ı `reconcileSpuriousNoGo`
  çağrısı yapıldığında override gerekçesini kaydeder; ADR-044 bu field'ı zorunlu kılar.

### Olumsuz

- **Ek disk I/O.** Her faz geçişinde ve her task evaluation'da dosya yazılır. Atomic
  rename pattern bu riski düşürür; ancak yüksek task sayılı sprintlerde (50+) I/O
  baskısı ölçülmelidir.
- **Fail-soft gizler sorunları.** `persistPhaseTransition` hataları `debugLog`'a
  düşer, kullanıcıya alert olarak yansımaz. State file yazma başarısız olursa
  gözlemlenebilirlik zinciri sessizce kırılır. Uzun vadede metrics/alert entegrasyonu
  gerekir.

---

## Alternatives Considered

### (a) Event-Stream-Only Observability

Sprint events stream (`events.jsonl`) tüm faz geçişlerini kayıt altına alabilir;
ayrıca snapshot dosyası gerekmez.

**Neden reddedildi:** Event stream'den anlık faz durumunu okumak tüm satırları
yeniden işlemeyi gerektirir. `sprint-state.json` snapshot'ı O(1) okuma sağlar.
Recovery modülü ve CLI status komutu snapshot'a ihtiyaç duyar.

### (b) Synchronous DB Write

Her faz geçişinde doğrudan `memory.db`'ye INSERT yapmak yerine sadece dosya
yazmak yerine DB çağrısı yapmak.

**Neden reddedildi:** `better-sqlite3` senkron API kilit çakışması riski taşır;
Brain main loop'u bloke edebilir. Dosya-tabanlı atomic rename pattern daha düşük
latency ve kilit riski sunar. DB export ayrıca `deckent memory export` ile manuel
veya sprint sonu otomatik tetiklenebilir.

---

## References

- Sprint 162 T-003 — `sprint-phases.ts:persistPhaseTransition` wire implementation
- `evaluation-audit-trail.ts` — Sprint 157 T-001 survivor (`6c337b0`), per-task audit write path
- Sprint 162 result forensic — `sprint-state.json` phase transition disk visibility kanıtı
- ADR-043 — Brain Crash Recovery Protocol (bağlı: recovery modülü bu observability contract'ına dayanır)
- ADR-035 — Brain ↔ Worker ↔ Auditor Verification Protocol (audit trail bu protokolü destekler)
- Sprint 159–161 stalled forensic — `.tasks/archive/sprint-160-stalled/`, `.tasks/archive/sprint-161-stalled/`

---

## Notes

Bu ADR, Sprint 162 T-003 tarafından implement edilen `persistPhaseTransition` wire'ının
ve `evaluation-audit-trail.ts` entegrasyonunun geriye dönük governance kaydıdır.
ADR-053'te olduğu gibi: uygulama önce yazıldı, ADR tasarım kararlarını geç ama eksiksiz
kayıt altına almaktadır. Sprint 163 ile kabul edilmiştir.

> **Note (deep-verified vs code, Sprint 172):** Decision §1'deki **4 call-site tablosu kod ile birebir doğrulandı** (`src/orchestra/sprint-phases.ts`): `runPlanPhase`→`PLAN/PLANNING` (`:447`), `runSpawnPhase`→`SPAWN/sprint.status`→`SPAWN/ACTIVE` (`:550`/`:553`), `runEvaluatePhase`→`EVALUATE/EVALUATING` (`:736`), `runFixPhase`→`FIX/FIXING` (`:1100`). `runRetroPhase` için call-site yoktur ve ADR de listelemez (tutarlı). Tek nüans: `runSpawnPhase` ilk çağrıda status argümanı literal `RUNNING` değil dinamik `sprint.status`'tur (ADR'nin "RUNNING → ACTIVE" ifadesi yaklaşık). `persistPhaseTransition`/`writeEvaluationAudit`/`reconcileSpuriousNoGo` fonksiyonları kodda mevcut; referans commit `6c337b0` (Sprint 157 T-001 survivor) repo git geçmişinde gerçek. Yukarıda audit yol düzeltmesi uygulandı: `.tasks/audit/...` → `.deckent/evaluations/<sprintId>/<taskId>-attempt-<N>.json` (`EVALUATIONS_DIR`, `constants.ts:27`). Behavior unchanged; documentation alignment only.


---

## adr-045: Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire

**Status:** accepted

# ADR-045: Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-13

**Sprint:** Sprint 164 (implementation contract — Task 4 wire implementation bu ADR'a uyumlu yazılır)

---

## Status

accepted (Sprint 164 — implementation'dan ÖNCE yazılan contract ADR; ADR-036 Sprint 138 ADR Governance disiplinine uygun)

---

## Context

Sprint 134 T-007'de `respawnEligibleTasks` fonksiyonu `sprint-spawner` modülünde tanımlandı
(Kahn's algorithm topological sort + `enforceWaveDependency` çağrısı + slot kontrolü).
Ancak fonksiyon runtime'da **hiçbir yerden çağrılmıyordu** — call-site eksikti.

Bu eksiklik 5 sprint boyunca görünmez kaldı:

- **Sprint 156-002:** Default `dependency_pipeline_enabled: false → true` flip yapıldı
  (`GO_WITH_TECH_DEBT` kararı). Wire eksikliği bu flipte tespit edilmedi.
- **Sprint 161 stalled forensic:** Wave 1 (3 task) spawn oldu; Wave 2 (T4 bağımlı T2'ye) ve
  Wave 3 (T5 bağımlı T1+T2+T4'e) hayalet kaldı. Sprint hang — `waitForResults` sonsuza
  kadar bekledi çünkü eligible task'lar hiç spawn edilmedi.
- **Sprint 164 forensic analizi:** 6 ayrı kanıtla (KESİN güven) bug doğrulandı:
  1. `respawnEligibleTasks` definition Sprint 134'ten beri var, call-site yok
  2. `spawnWorkers` Wave 2+ task'larını `activeTasks` ve `queuedTasks` listelerinden çıkarıyor
  3. `waitForResults` dep-blind FIFO loop — yalnızca ilk `queuedTasks`'tan shift ediyor
  4. `task.status` EXECUTING'de kalıp DONE'a inline mutate edilmiyor; `respawnEligibleTasks`
     `t.status === TaskStatus.DONE` filter'ı çalıştırınca eligible task bulamıyor
  5. `processQueue` FIFO sonrası dep-aware respawn çağrısı yok
  6. `collectResults` result topladıktan sonra in-memory status sync yapmıyor

**Sonuç:** `dependency_pipeline_enabled: true` flag set edilmesine rağmen multi-wave execution
semantiği hiçbir zaman çalışmamış; tüm sprint'ler legacy FIFO modunda devam etmiştir.

---

## Decision

Yol B (wire) — 3 değişiklik yapılır. Bu 3 madde Task 4 implementasyonu için **binding contract**:

### 1. `collectResults` İçinde Inline Status Mutation

Bir `.result` dosyası toplandığında `taskMap.get(taskId)` referansı üzerinden in-memory
task status mutation yapılır. Worker `selfAssessment` alanına göre:

| selfAssessment değeri       | Yeni status           |
|-----------------------------|-----------------------|
| `DONE`                      | `TaskStatus.DONE`     |
| `NO_GO`                     | `TaskStatus.NO_GO`    |
| `GO_WITH_TECH_DEBT`         | `TaskStatus.DONE`     |

`GO_WITH_TECH_DEBT` → `DONE` map'i bilinçli bir karardır: dependency filter
`t.status === TaskStatus.DONE` kontrolü yapar; debt ile kapanan task'ların bağımlısını
bloke etmemesi gerekir (ADR-045 Consequences bölümüne bkz.).

`taskMap` zaten `Map<string, Task>` kullanıyor; `taskMap.get(taskId)` referansı
`sprint.tasks` array'indeki aynı objeye işaret eder (referans paylaşımı). In-memory
mutation yeterli — EVALUATE phase sonrası disk'e yazılır (mevcut pipeline korunur).

**Rationale:** `respawnEligibleTasks` eligible task hesabı için `sprint.tasks` üzerinden
`t.status === TaskStatus.DONE` filter'ı çalıştırır. EVALUATE phase öncesi inline
mutation olmadan bu filter her zaman boş döner — Wave 2/3 task'ları asla eligible olmaz.

### 2. `waitForResults` Ana Döngüsünde Dep-Aware Respawn

`waitForResults` içinde, her `processQueue(newlyCollected)` çağrısının ardından
`dependency_pipeline_enabled` kontrolü ile dallanma yapılır:

```typescript
if (config.dependency_pipeline_enabled) {
  await respawnEligibleTasks(projectRoot, sprint, config, spawnOpts);
}
// else: legacy FIFO — processQueue yeterli, queuedTasks shift ile devam
```

`config: ResolvedConfig` parametresi `waitForResults` signature'a eklenir. Caller'lar
(`sprint-controller.ts::runFullSprint` ve `sprint-phases.ts::runEvaluatePhase` giriş noktaları)
parameter pass-through ile güncellenir — davranış değişikliği yok, sadece forwarding.

İlk `collectResults + processQueue` bloğunun sonrasında da aynı respawn çağrısı yapılır:
race-safe initial pass — Wave 1 ilk turda done olduysa Wave 2 hemen eligible olur.

**Legacy compatibility:** `dependency_pipeline_enabled: false` (Sprint 164 default) durumunda
`if` branch'i çalışmaz; `waitForResults` mevcut FIFO davranışını korur. Geriye uyumlu.

### 3. `respawnEligibleTasks` Slot Kontrolü Korunur

`sprint-spawner` modülündeki mevcut `slotsAvailable = maxWorkers - currentlyExecuting` kontrolü
**değiştirilmez**. Bu kontrol çift spawn'ı engeller. `enforceWaveDependency` çağrısı korunur.
`wave.respawn` metric emit'i ve `BRAIN→WORKER:DEPENDENCY_BLOCKED` event emit'leri zaten
implement — artık gerçekten tetiklenecek.

**Config freeze:** `dependency_pipeline_enabled` değeri Sprint 164'te `false` olarak kalır.
Config flip Sprint 165'te Alperen onayı ile yapılır (canlı retry + smoke test).

---

## Alternatives Considered

### (a) Yol A — Feature Burial (Flag Deprecate)

`dependency_pipeline_enabled` flag'i deprecated işaretlenir, `respawnEligibleTasks` kodu
silinir, tüm sprint'ler legacy FIFO ile devam eder.

**Neden reddedildi:** Alperen açık wire kararı verdi. Sprint 134 T-005 priority+dependencies
altyapısı ve Sprint 134 T-007 chain scheduler, multi-wave execution için tasarlandı. Bu altyapı
5 sprint boyunca sessizce var; bury seçeneği Sprint 134 T-007 design intent'ini kalıcı olarak
iptal eder. Product roadmap açısından dependency-aware execution kritik özellik — burial değil
completion gerekli.

### (b) Disk-Based Status Read

`respawnEligibleTasks`, in-memory task status yerine `.result` dosyasının mevcudiyetine bakarak
eligible task'ları belirler (`existsSync('.tasks/task-NNN.result')`).

**Neden reddedildi:** Disk I/O overhead her respawn döngüsünde N task × `existsSync` çağrısı
anlamına gelir. In-memory `task.status` zaten otoriter kaynak — `collectResults` result'ı okur,
in-memory map'i günceller. Disk-based check tutarsız state yaratabilir (result yazıldı ama
in-memory henüz güncellenmedi durumu). Memory-first mimari tercih edilir (ADR-005 deprecated
olmasına rağmen in-memory state consistency prensibi geçerli).

### (c) Status Mutation Sadece EVALUATE Phase'de

`task.status` mutasyonu yalnızca `runEvaluatePhase` içinde yapılır; EXECUTE devam ederken
in-memory status değişmez.

**Neden reddedildi:** `respawnEligibleTasks` EVALUATE phase'e girmeden önce `waitForResults`
ana döngüsü içinden çağrılır. EVALUATE-only mutation, respawn çağrısı anında `t.status` hâlâ
`EXECUTING` olduğu için eligible task bulamaz — wire çalışmaz. Inline mutation (Decision 1)
timing sorununu çözer: `collectResults` result toplar → status mutate → `processQueue` →
`respawnEligibleTasks` → eligible Wave 2 task'lar bulunur → spawn edilir.

---

## Consequences

### Olumlu

- **Wave 2/3 task'lar spawn olur.** Dependency-aware execution semantiği ilk kez runtime'da
  gerçek anlamda çalışır. Multi-wave sprint planları (priority + dependencies ile) uygulanabilir.
- **Sprint 161 stalled senaryosu fix'lenir.** 3 spawn + 2 hayalet → 5/5 spawn. `waitForResults`
  artık tüm task'ların tamamlanmasını bekleyebilir.
- **Sprint 134 T-007 design intent tamamlanır.** Chain scheduler runtime kanıtı kazanır;
  5 sprintlik call-site borcu kapanır.
- **`BRAIN→WORKER:DEPENDENCY_BLOCKED` event'leri gerçekten yayınlanır.** `wave.respawn` metriği
  meaningful veri içerir; observability zinciri tamamlanır.

### Olumsuz

- **`task.status` mutation timing değişir.** EVALUATE phase öncesi DONE/NO_GO status set edilir.
  EVALUATE phase içindeki status okumaları bu mutasyonun farkında olmalı; mevcut EVALUATE
  logic'i tekrar status set ederse duplicate mutation olur (idempotent — problem yok).
- **`evaluate-phase idempotency` regression riski.** Sprint 159 survivor test
  (`evaluate-phase-idempotency`) status mutation timing değişikliğini test eder. Task 4
  bu testi bozmamak zorunda; bozulursa Auditor + Alperen onayıyla test güncellenebilir.
- **Auditor `git diff --stat` boundary'yi etkilemez.** In-memory status mutation disk yazısı
  yapmaz — Auditor scope violation detection sistemi bu değişiklikten etkilenmez (ADR-037 safe).

### Risk Mitigation

- **Sprint 159 survivor test:** `evaluate-phase-idempotency` 6-case regression suite mevcut;
  Task 4 bu testi PASS etmek zorunda.
- **Sprint 165 smoke:** `dependency_pipeline_enabled: true` flip + 3-task multi-wave smoke
  sprint ile canlı doğrulama yapılır. Wire production'da kanıtlanmadan Sprint 165 geçmez.
- **Sprint 166 rollback opsiyonu:** Flag `false`'a geri çevrilebilir. Wire kodu `disabled mod`'da
  mevcut `if (config.dependency_pipeline_enabled)` branch atlayarak legacy davranışa döner.
  Wire kodu silinmek zorunda değil; rollback non-destructive.

---

## References

1. **Sprint 134 T-007 spec** — `respawnEligibleTasks` + Kahn's algorithm chain dependency
   scheduler tasarımı (+620 LoC, Sprint 139 Wave 1 Early Wire Bootstrap)
2. **Sprint 156-002 flip commit** — `dependency_pipeline_enabled: false → true` default değişimi
   (`GO_WITH_TECH_DEBT` — wire eksikliği bu sprintte tespit edilmedi)
3. **Sprint 161 stalled task archive** — `.tasks/archive/sprint-161-stalled/` Wave 2/3 hayalet
   forensic kanıtı (3 spawn + 2 hayalet → sprint hang)
4. **Sprint 162 spurious NO_GO bug ve Sprint 163 T1 fix** — Status mutation timing dersleri;
   in-memory `task.status` sync önemi (ADR-045 Decision 1'in doğrudan öncülü)
5. **ADR-036: ADR Governance Integration** — Bu ADR'ı mandatory read yapan kural; Sprint 138
   ADR Governance disiplini gereği implementation'dan önce yazılır
6. **ADR-037: Brain-Auditor-Worker Authority Matrix** — Wire implementasyonu RBAC sınırlarını
   ihlal etmemeli; in-memory mutation Auditor'ın `git diff --stat` boundary sistemini bypass
   etmez (disk write yok)
7. **ADR-039: Self-Modifying Task Detection** — Deckent dogfood discrimination — wire kendi
   sprint planlamasını etkilemiyor; `respawnEligibleTasks` sadece mevcut sprint task'larını
   re-evaluates eder, yeni task yaratmaz

---

## Memory DB Insert Pattern

Worker bu ADR'ı tamamladıktan sonra aşağıdaki pattern ile `memory.db`'ye insert yapılır:

```typescript
store.insert({
  type: 'adr',
  id: 'adr-045',
  title: 'Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire',
  status: 'accepted',
  sprint_id: 'sprint-164',
  tags: ['dep-pipeline', 'wave-execution', 'task-status', 'wire', 'sprint-134-completion'],
  body: 'Yol B wire: collectResults inline status mutation + waitForResults dep-aware respawn + respawnEligibleTasks slot kontrolü korunur. Sprint 161 stalled fix. dependency_pipeline_enabled: false (Sprint 165 flip için bekletilir).',
});
```

Markdown dosyası `deckent memory export` ile auto-regenerate edilir. ADR-036 Memory V2
DB-first kuralı gereği bu manuel DECISIONS.md güncellemesi DEĞİL, DB insert + export
pipeline'ı ile yönetilir.

---

## Notes

Bu ADR, `dependency_pipeline_enabled: true` Yol B wire implementasyonunun (Task 4) **contract
belgesidir** — implementation'dan önce yazılır. Task 4 worker bu ADR'ı okumak ve Decision
bölümündeki 3 maddeye uymak zorundadır. Sapma → NO_GO + ADR amendment proposal (ADR-036 mandatory).

Sprint 165 ile `dependency_pipeline_enabled: false → true` config flip + canlı multi-wave smoke
test yapıldıktan sonra bu ADR production-validated olarak işaretlenir.

> **Note (deep-verified vs code, Sprint 172):** Bu contract ADR'nin **3 Decision maddesi de kodda birebir indi** (gövde gelecek-zamanlı kalmıştır; aşağıdaki güncel gerçektir):
> - **§1** → `src/orchestra/result-collector.ts:123-131` `applyStatusMutation` — 3-satır tablo (`DONE→DONE`, `GO_WITH_TECH_DEBT→DONE`, `NO_GO→NO_GO`) ve debt-DONE rationale yorumu ADR ile birebir.
> - **§2** → `result-collector.ts:379-387` `maybeRespawn` — `if (!config?.dependency_pipeline_enabled) return` legacy-FIFO no-op + fail-soft try/catch + `respawnEligibleTasks(projectRoot, sprint, config, spawnOpts)`. Tek nüans: respawn statik değil **lazy dynamic-import** (`loadRespawn()`) ile yüklenir — sözleşme sapması değil, ADR-008 tek-yönlü bağımlılık dostu.
> - **§3** → `src/orchestra/sprint-spawner.ts` — slot kontrolü korundu (`:507` `slotsAvailable = max(0, maxWorkers - currentlyExecuting)`), `enforceWaveDependency` korundu (`:486`), `BRAIN→WORKER:DEPENDENCY_BLOCKED` (`:493`) ve `wave.respawn` metric (`:576`) gerçekten tetikleniyor; eligible filtresi `t.status === TaskStatus.DONE` (`:477`).
>
> **deckent-dev gerçeği:** Bu projede `.deckent/config.json` `dependency_pipeline_enabled: false` — Wave geçişleri bilinçle Brain-manuel (ADR-047, Sprint 164-171 kanıtlı). ADR'deki "Sprint 165 flip → production-validated" **kullanıcı-projesi default yolunu** tanımlar (`config.ts` kod default `true`, ADR-045 Sprint 169 H5'te `docs/reference/api-surface.md`'de teyitli); dogfood'da flag `false` kalır, rollback non-destructive (`if` branch atlanır). Behavior unchanged; documentation alignment only.


---

## adr-046: Brain Self-Update Hook Architecture

**Status:** accepted

# ADR-046: Brain Self-Update Hook Architecture

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-13

**Sprint:** Sprint 166 (implementation contract — T1/T2/T3 fixes bu ADR'ın kontratına göre yazıldı)

---

## Status

accepted (Sprint 166 — 4 root cause forensic + Sprint 154-165 arasında kırık self-update döngüsünün kapanması)

---

## Context

Sprint 154-165 boyunca Brain'in post-finalize self-update döngüsü **yarım çalıştı**: Brain her sprint sonunda
dosyaları güncellediğini "sanıyordu" ama gerçekte dört kritik hook ya hiç tetiklenmiyordu ya da yanlış
çalışıyordu. Sprint 166 forensic analizi dört root cause tespit etti:

### Bug M — ADR Insert Hook Eksikliği

`sprint-finalizer.ts:1197` çevresindeki `runPostFinalizeHooks` çağrısında `adrInsert` step yoktu.
ADR-043, ADR-044, ADR-045 `docs/adr/` dizinine yazıldı; ancak `memory.db`'ye hiçbir zaman insert
edilmedi. Brain ADR tabanlı kararlar alırken en güncel governance veriye erişemiyordu.

**Kanıt:** `sqlite3 .brain/memory.db "SELECT COUNT(*) FROM entries WHERE type='adr'"` → Sprint 166
öncesi `adr-042`'de duruyordu; `docs/adr/` dizininde 3 yeni ADR (043/044/045) mevcuttu.

### Bug N — Manuel Finalize Path'inde onRuleRegen Eksikliği

`sprint-phases.ts:1238` ve `sprint-finalizer.ts:1197` Brain'in otomatik finalize path'ini doğru
şekilde yönetiyordu; ancak `cli/commands/finalize.ts:166` içindeki `finalizeSprint(...)` çağrısında
`onRuleRegen` parametresi yoktu. Sprint 152'den itibaren manuel finalize kullanılan tüm dönemlerde
`.claude/rules/*.md` dosyaları 13 sprint boyunca stale kaldı.

**Kanıt:** `grep -n "onRuleRegen" src/cli/commands/finalize.ts` → Sprint 166 T2 öncesi 0 match.

### Bug S — Cache Key Sprint-Agnostik Olduğundan Doc Sync Atlıyordu

`src/orchestra/managed-docs/doc-cache.ts` cache key'i `fileHash + entryHash` olarak hesaplıyordu;
sprint ID dahil değildi. Aynı dosya aynı sprint'te birden fazla kez finalize edildiğinde (veya farklı
sprint'lerde içerik değişmediyse) cache hit oluyordu ve CLAUDE.md güncellenmiyordu. Sprint 152'den
beri `cached_no_change` skip path aktifti.

**Kanıt:** Sprint 130-151 working chain commit zinciri vs Sprint 152+ `cached_no_change` log analizi.

### Bug Y2 — Doc Sync Ground-Truth Eksikliği

Sprint 164 commit `a4f3be4`'te koordinatör agent prompt'una "16 agent" yanlış inject edildi (gerçek: 15).
5 anchor `.md` dosyası yanlış güncellendi. Doc sync agent'larının prompt'a inject ettiği sayım gerçek
dosya sistemine karşılaştırılmıyordu.

**Ortak Pattern:** 4 bug da aynı mimari eksiklikten kaynaklanıyordu — post-finalize hook chain'i
**opsiyonel callback'ler** ve **partial wiring** ile tasarlanmıştı. Yeni step eklendiğinde veya mevcut
step'in wire'ı eksik kaldığında sessizce atlanıyordu. Hiçbir hook **koşulsuz invocation** garantisi
vermiyordu.

---

## Decision

Brain post-finalize hook chain için **Step Ordering Contract** zorunlu kılınır. Bu kontrat
`src/core/identity-generator.ts → runPostFinalizeHooks()` implementasyonuna kodlanır ve bu ADR ile
dokümante edilir.

### Step Ordering Contract (Section 5.1)

Post-finalize hook'lar aşağıdaki sırayla çalışır. Sıralama değiştirilemez — değişiklik bu ADR'ın
amendment'ını gerektirir (ADR-036 mandatory).

| Step | Adı             | Hedef                                      | Zorunluluk |
|------|-----------------|--------------------------------------------|------------|
| 1    | memoryExport    | `exports/*.md` regenerate                  | Koşulsuz   |
| 2    | identityRegen   | `PROJECT-IDENTITY.md` update               | Deprecated (Sprint 168'de kaldırılır) |
| 3    | adrInsert       | `docs/adr/*.md` → `memory.db` upsert       | Koşulsuz   |
| 4    | ruleRegen       | `.claude/rules/*.md` regenerate            | Koşullu (callback mevcut ise) |

**Step 3, Step 4'ten ÖNCE çalışmak ZORUNDADIR.** Sprint 166'da kabul edilen ADR-046 gibi yeni ADR'ler
Step 3'te `memory.db`'ye insert edilir; Step 4'te regenerate edilen `.claude/rules/*.md` dosyaları
bu insert'ten sonra çalışır. Sıralama ters olursa yeni ADR'ler kurallar güncellenmeden önce kayıt
altına alınamaz.

### Mimari Prensipler

**1. Koşulsuz Invocation (Unconditional Invocation Pattern)**

Her hook **her finalize döngüsünde** çalışır. Opsiyonel callback tasarımı yerine doğrudan çağrı kullanılır.
`skipXxx` flag'leri sadece test izolasyonu ve acil devre-dışı bırakma senaryoları için mevcuttur;
production deploy'da hiçbiri aktif olmamalıdır.

**Rationale:** Bug M ve Bug N'nin ortak kökü optional wiring'di. `opts.onRuleRegen` callback yoksa
Step 4 sessizce atlanıyordu. Koşulsuz pattern bu "sessiz atlanma" riskini ortadan kaldırır.

**2. Cache Key Kompletliği (Complete Cache Key)**

Managed-docs pipeline'ında her cache key şunları ZORUNLU olarak içerir:
- `fileHash` — hedef dosya içerik hash'i
- `entryHash` — generator entry config hash'i
- `sprintId` — mevcut sprint identifier

Eksik `sprintId` → cache hit → `cached_no_change` skip → doc sync sessizce atlanır.
Bu Bug S'in tam tanımıdır.

**3. Single Registration Target**

Her hook sadece bir yerde registration point'e sahip olur:
- **Brain otomatik path:** `sprint-finalizer.ts` → `runPostFinalizeHooks()`
- **Manuel path:** `cli/commands/finalize.ts` → `finalizeSprint({ onRuleRegen: ... })`

Her iki path da aynı `PostFinalizeHookOptions` interface'ini kullanır. Yeni hook eklendiğinde her iki
path'e aynı anda eklenmek ZORUNDADIR (Bug N dersi: sadece bir path'e eklemek 13 sprint stale'e yol açar).

**4. Ground-Truth Verification**

Doc sync agent'ları (type='doc') inject edilen sayısal iddiayı (`N agents`, `M tools`) çalıştırma
öncesi gerçek dosya sistemi ile doğrulamak ZORUNDADIR. Doğrulama whitelist:
`.deckent/ground-truth-overrides.json`.

### Step Ordering Contract Değişikliği Protokolü

Step sıralamasını değiştirmek için:
1. Bu ADR'ı supersede eden yeni ADR yazılır
2. `runPostFinalizeHooks()` JSDoc bloğu güncellenir
3. `tests/core/identity-generator-step-order.test.ts` regression test güncellenir
4. Sprint finalize log'unda step execution order doğrulanır

---

## Consequences

### Olumlu

- **ADR-043/044/045/046 memory.db'ye insert edildi.** Brain ADR-bazlı kararlar için artık güncel
  governance veriye erişebilir. Sprint 166 sonrası query: `searchMemory(store, {type:['adr']})` doğru
  döner.
- **`.claude/rules/*.md` artık manuel finalize'da da güncellenir.** Bug N kapandı — 13 sprint stale
  borcu bitti. Multi-provider sync (Bug Q) ile `.codex/rules/`, `.gemini/rules/`, `.cursor/rules/`
  da aynı anda güncellenir.
- **CLAUDE.md her sprint'te güncellenir.** Bug S kapandı — sprint-aware cache key ile her yeni sprint
  cache miss üretir ve doc sync çalışır.
- **Doc sync agent'ları inject öncesi ground-truth doğrular.** Bug Y2 kapandı — `ls | wc -l` vs
  whitelist kontrolü ile yanlış sayım propagasyonu engellenir.
- **Yeni hook eklenmesi için anchor.** Sprint 167-168 M1-M4 monitoring hook'ları (örn. token budget
  tracker, stale_md detector) bu contract'a uygun olarak Step 5+ olarak eklenir. Her yeni step bu
  ADR'ı referans alır.

### Olumsuz

- **Step 2 (identityRegen) deprecated yükü.** Sprint 168'e kadar kod'da kalır. `skipIdentityRegen`
  flag'i olmayan caller'lar eski behavior'ı almaya devam eder. Migration: managed-docs zincirine devret.
- **onRuleRegen opsiyonelliği korundu.** Step 4 hâlâ callback-conditional — ancak artık cli finalize
  path'inde callback zorunlu geçiriliyor (Bug N fix). Test coverage bu bağlantıyı korur.
- **Cache key migration backward-compat yükü.** Eski cache entry'leri `sprintId` içermiyor — ilk
  sprint'te her entry cache miss yapar (beklenen davranış, bütçe etkisi minimal).

### M1-M4 Monitoring Falsifiable Claims (Sprint 167-168)

Bu ADR'ın kontrakt doğruluğu 4 ölçüm kanalı ile izlenir:

| Kanal | Metrik | Beklenti (Sprint 167+) |
|-------|--------|------------------------|
| M1    | `memory.db SELECT COUNT(*) WHERE type='adr'` | Her yeni ADR dosyası → +1 entry |
| M2    | `ls .claude/rules/*.md` mtime | Her finalize → mtime güncellenir |
| M3    | `grep "sprint-NNN" CLAUDE.md` | Her sprint → yeni sprint ID'si CLAUDE.md'de |
| M4    | `stale_md detector emitAlert` | CLAUDE.md mtime > 70min ise alarm |

Sprint 167'de dependency_pipeline_enabled flip + M1-M4 baseline tracking ile bu claim'ler
ilk kez ölçülebilir hale gelir.

### Sprint 170 Refactor Trigger

Aşağıdaki koşullardan biri gerçekleşirse Sprint 170'te hook chain refactor tetiklenir:

1. Step sayısı 6'yı geçerse (yeni M1-M4 monitoring hook'ları + billing hook + event emit)
2. `runPostFinalizeHooks()` LoC > 150 olursa (şu an ~85 LoC)
3. Step 2 (identityRegen deprecated) Sprint 168'den geçerse ve hâlâ kodda ise

Refactor hedefi: hook chain'i `PostFinalizeStepRegistry` pattern'ına taşımak
(ADR-026 God Object Split Stratejisi prensipleri ile).

---

## Alternatives Considered

### (a) Optional Callback Pattern Korunur

Mevcut `onRuleRegen?: callback` tasarımı korunur, eksik wire'lar tek tek patch edilir.

**Neden reddedildi:** Bu yaklaşım Bug N'yi tekil olarak fix eder ama pattern'ı korur. Her yeni hook
için aynı wiring hatası tekrarlanabilir. Sprint 166 forensic'i 4 bağımsız wiring hatasını aynı anda
ortaya koydu — pattern değişikliği gerekli.

### (b) Event-Driven Hook Dispatch

`EventEmitter` pattern: `finalizeEmitter.emit('post-finalize', opts)`. Hook'lar listener olarak kayıt
olur. Execution order belirsiz.

**Neden reddedildi:** Step ordering contract ile çelişir. EventEmitter sıralaması listener registration
sırasına bağlıdır — `once()` vs `on()` race condition riski. Explicit step ordering okunabilirliği ve
test edilebilirliği daha yüksek; 4 step için EventEmitter overhead gereksiz karmaşıklık.

### (c) Database-Only Hook Registration

Tüm hook'lar `memory.db`'ye kayıt olur; finalize döngüsü DB'yi okuyarak hangi hook'ların çalışacağını
belirler.

**Neden reddedildi:** Finalize döngüsünün DB'ye bağımlılığını artırır. DB yoksa veya kilitliyse
hiçbir hook çalışmaz. Mevcut in-process step chain daha güvenilir; DB sadece persistence layer
olarak kalmalı (ADR-008 Brain merkezi import prensibi).

---

## References

1. **Sprint 154-165 forensic analizi** — 4 root cause (M, N, S, Y2) tespiti
2. **Sprint 166 T1** — `src/core/adr-file-sync.ts` + `identity-generator.ts` Step 3 wire (Bug M fix)
3. **Sprint 166 T2** — `cli/commands/finalize.ts:166` onRuleRegen wire (Bug N fix)
4. **Sprint 166 T3** — `doc-cache.ts` sprint-aware cache key (Bug S fix)
5. **Sprint 166 T4** — Ground-truth verification 3-layer defense (Bug Y2 fix)
6. **ADR-036** — ADR Governance Integration — mandatory read; bu ADR ADR-036 disiplinine uygun
7. **ADR-037** — Brain-Auditor-Worker Authority Matrix — hook chain RBAC sınırlarını ihlal etmez
8. **ADR-026** — God Object Split Stratejisi — Sprint 170 refactor trigger referansı
9. **ADR-031** — Content Hash Cache — Bug S root cause (sprint ID eksik cache key)

---

## Memory DB Insert Pattern

Bu ADR'ın `memory.db`'ye insert edilmesi `syncAdrFilesToDb()` aracılığıyla otomatik gerçekleşir
(Sprint 166 T1 — Bug M fix). Alperen'in `npx deckent memory rebuild` çalıştırmasının ardından:

```typescript
// adr-file-sync.ts syncAdrFilesToDb() output (expected):
{
  inserted: 1,   // adr-046 (yeni)
  updated: 3,    // adr-043, adr-044, adr-045 (eksik idiler)
  skipped: 42,   // mevcut ve değişmemiş ADR'lar
  errors: [],
  ids: ['adr-046', 'adr-043', 'adr-044', 'adr-045'],
}
```

Doğrulama: `sqlite3 .brain/memory.db "SELECT id FROM entries WHERE id='adr-046'"` → 1 row.

---

## Notes

Bu ADR, Sprint 154-165 boyunca birikmiş "Brain self-update yarım çalışıyor" borcunun resmi
kapanış belgesidir. T1-T3 fix'leri bu ADR'ın Step Ordering Contract'ına uygun yazıldı; test
coverage (`tests/core/identity-generator-step-order.test.ts`) kontratı kalıcı kılar.

Sprint 167-168 için M1-M4 monitoring baseline ve Sprint 170 refactor trigger bu ADR'a
kodlanmıştır — gelecek sprint'ler bu kararı referans alarak genişletebilir.

---

## Amendment — Sprint 168 C0a-4 (BUG-CC fix)

**Date:** 2026-05-14
**Author:** Alperen Sartaçoğlu
**Sprint:** sprint-168
**Cluster:** A.4 (BUG-CC closure)
**Decision reference:** `.deckent/sprint-168-archive-decision.txt` (Alperen Pre-Flight Step 16 — Option B)

### Step 12 Default Behavior Flip — `archiveDirectives`

Bu amendment, ADR-046 Step Ordering Contract'ın **Step 12 (archiveDirectives)** adımında
default davranışı değiştirir. Step sırası, idempotency garantileri ve diğer kontrat
maddeleri **aynen geçerli** kalır.

#### Önceki (Sprint 138–167 davranışı)

```ts
// finalizeSprint Step 12 (legacy)
const autoArchive = rawCfg?.['auto_archive_directives'] ?? true;  // default TRUE
if (autoArchive) archiveDirectives(projectRoot, sprint.id, 'CLEANUP');
```

- Sprint finalize'da `DIRECTIVES.md` her zaman placeholder ile **overwrite** edilirdi.
- Archive copy yazılırdı (`.brain/archive/DIRECTIVES-sprint-NNN.md`).
- Mid-sprint yanlış invocation veya yan etki → DIRECTIVES.md kaybı = sprint context kaybı.

#### Yeni (Sprint 168+ davranışı)

```ts
// finalizeSprint Step 12 (Sprint 168 C0a-4)
const autoArchive = rawCfg?.['auto_archive_directives'] ?? false;  // default FALSE
archiveDirectives(projectRoot, sprint.id, 'CLEANUP', { autoArchive: autoArchive === true });
```

```ts
// archiveDirectives implementation (Sprint 168 C0a-4)
export interface ArchiveDirectivesOptions {
  autoArchive?: boolean;  // default false — PRESERVE working DIRECTIVES.md
}

export function archiveDirectives(
  projectRoot: string,
  sprintId: string,
  phase?: string,
  options: ArchiveDirectivesOptions = {},
): void { /* ... */ }
```

- **Default:** `DIRECTIVES.md` **KORUNUR** (preserve). Archive copy her zaman yazılır.
- **Opt-in:** `auto_archive_directives: true` → eski legacy davranış
  (placeholder overwrite). Resmi `deckent` orchestrator için açık opt-in gerekir.

#### Gerekçe

Sprint 167 BUG-CC live evidence (Phase 1+2 forensic — `.audit/sprint-167/T5-brain-debug-phase1.md`,
`phase2.md` Cluster A.4):
- DIRECTIVES.md placeholder ile overwrite olduktan sonra, **mevcut sprint context'i kayboldu**.
- Recovery için `emergencyRestoreDirectives` reaktif workaround gerekti — ancak orijinal
  içerik (description, kanıt blokları, custom directives) tam restore edilemedi.
- Conservative "preserve by default" davranışı, kayıp riskini sıfıra indirir; archive copy
  yine de audit trail için garanti.

#### Test Invariant

Default preserve davranışı kalıcı test ile garanti altına alındı:

```
tests/orchestra/archive-directives-default-preserve.test.ts
  ✓ preserves DIRECTIVES.md by default (auto_archive_directives=false)
  ✓ overwrites DIRECTIVES.md when autoArchive=true (opt-in legacy)
  ✓ skips silently when DIRECTIVES.md does not exist
  ✓ phase guard still rejects non-CLEANUP/COMPLETE phases (default preserve)
```

#### Backward Compatibility

Mevcut konfigürasyonlar:
- `auto_archive_directives` config flag'i tanımlı **değilse** → yeni default (false, preserve).
- `auto_archive_directives: true` ayarlı projeler → legacy davranış aynen devam eder.
- `auto_archive_directives: false` ayarlı projeler → davranış değişmez (zaten preserve).

#### Step Ordering Contract — Değişmedi

ADR-046'nın orijinal Step Ordering Contract maddeleri (Step 1–13 sırası, idempotency,
dual-write garantileri) bu amendment'tan **etkilenmez**. Sadece Step 12'nin "side-effect
default'u" değiştirildi; sıra ve hook architecture aynen geçerli.

---

## Amendment — Sprint 169 H1 (Bi-Directional FS↔DB Sync)

**Date:** 2026-05-15
**Author:** Alperen Sartaçoğlu
**Sprint:** sprint-169
**Decision reference:** DIRECTIVES.md Task 8 (H1 ADR DB→FS Export Pipeline)

ADR-046 orijinalde **forward direction** (FS→DB) `syncAdrFilesToDb()` aracılığıyla Sprint 166'da
kurulmuştu. Bu amendment **reverse direction** (DB→FS) ekler ve bi-directional kontratı resmileştirir:

| Direction | Function | Location | Trigger |
|-----------|----------|----------|---------|
| Forward (FS→DB) | `syncAdrFilesToDb()` | `src/core/adr-file-sync.ts` | Post-finalize Step 3 |
| Reverse (DB→FS) | `exportAdrsToFs()` | `src/core/memory-export.ts` | Manual / CI gate |

### Reverse Sync Rules

1. **Manual edit wins** — if a file's mtime is newer than the DB `updated_at`, the file is preserved
   unchanged (DB→FS write is skipped).
2. **Idempotent** — re-running `exportAdrsToFs` with the same DB state produces no changes
   (`written=0, updated=0`) when all files are up-to-date.
3. **Missing fields** — DB entries with empty sprint, content, or date fields render as
   `_To be backfilled_` placeholders.
4. **MADR v3 passthrough** — if DB content already starts with a `#` header, it is written
   as-is without further wrapping.

### Conflict Resolution

| Condition | Winner | Action |
|-----------|--------|--------|
| File mtime > DB updated_at | File (manual edit) | Skip — no write |
| File mtime ≤ DB updated_at | DB | Overwrite file |
| File does not exist | DB | Create new file |

### CLI Wrapper

```bash
node scripts/memory/export-adr-fs.mjs [--dry-run] [--db <path>] [--adr-dir <path>]
```

### Step Ordering (Section 5.1 unchanged)

The reverse sync runs **outside** the post-finalize hook chain — it is a manual operator tool,
not an automatic step. The Step Ordering Contract (Steps 1–13) defined above is **unaffected**
by this amendment.

### OSS GA Anchor

This amendment is a prerequisite for the Sprint 170 OSS GA public flip. The CI gate
(`scripts/memory/export-adr-fs.mjs --dry-run`) must report `written=0` before the public
flip proceeds.

### References

1. **Sprint 166 T1** — `src/core/adr-file-sync.ts` forward sync implementation (Bug M fix)
2. **Sprint 169 H1** — `src/core/memory-export.ts` reverse sync implementation
3. **ADR-036** — ADR Governance Integration (mandatory amendment protocol)

---

> **Note (deep-verified vs code, Sprint 172):** Bu ADR'nin tüm somut iddiaları kodla doğrulandı:
> - **§5.1 Step Ordering Contract (4-hook) doğru:** `src/core/identity-generator.ts:341-346` JSDoc — Step 1 `memoryExport` → Step 2 `identityRegen` → Step 3 `adrInsert` → Step 4 `ruleRegen`, ve "Step 3 must run BEFORE Step 4 so that newly accepted ADRs (e.g. ADR-046)…" birebir. Invariant testleri mevcut: `tests/core/identity-generator-step-order.test.ts` + `tests/core/adr-046-step-ordering-invariant.test.ts`.
> - **Bug M (Step 3 adrInsert):** `src/core/adr-file-sync.ts` `syncAdrFilesToDb()` mevcut (FS→DB upsert, non-destructive). **Önemli numaralandırma açıklığı:** Sprint 168 Amendment'taki "Step 12 (archiveDirectives) / Steps 1–13" ifadesi bu §5.1 **4-hook `runPostFinalizeHooks` kontratı DEĞİL**, ayrı `finalizeSprint` CLEANUP zincirinin (`src/cli/commands/finalize.ts`) 13-adımlı numaralandırmasıdır. İki numaralandırma farklı kapsamlardır; §5.1 kontratı 4 hook olarak geçerlidir.
> - **Bug N:** `cli/commands/finalize.ts:166` "Bug N fix (Sprint 166-T2)" + `:176 onRuleRegen` wire ✓.
> - **Bug S:** `src/orchestra/managed-docs/doc-cache.ts:67-68` `computeCacheKey(entryHash, fileHash, sprintId?)` → sprint-aware key, `sprintId` yoksa legacy `entryHash:fileHash` (backward-compat clause doğru) ✓.
> - **Bug Y2:** `.deckent/ground-truth-overrides.json` mevcut; whitelist iddiası doğru ✓.
> - **Step 2 (identityRegen):** kod `@deprecated Sprint 166 (ADR-046)`, "Sprint 168 C0a-1 (BUG-GG) made the default runtime behavior to skip Step 2 — NO LONGER invoked". `PROJECT-IDENTITY.md` kaldırıldı, `.deckent/workspace/IDENTITY.md` (managed-docs) ile ikame edildi (`docs/reference/api-surface.md` ile hizalı). §5.1'deki "Sprint 168'de kaldırılır" runtime-skip default'unu doğru özetler.
> - **Sprint 169 H1 Amendment:** `src/core/memory-export.ts:305 exportAdrsToFs()` + `scripts/memory/export-adr-fs.mjs` mevcut ✓.
> - **İleri-dönük iddialar (gerçekleşme durumu):** "Sprint 167'de dependency_pipeline_enabled flip + M1-M4 baseline" ve "Sprint 170 hook chain refactor trigger" tasarım-niyeti/falsifiable hedeflerdir. deckent-dev'de `dependency_pipeline_enabled` bilinçle `false` kalır (Brain-manuel wave, ADR-045 + ADR-047); M1-M4 izleme kanalları ve Sprint 170 `PostFinalizeStepRegistry` refactor'ı koşullu/post-GA — bu projede otomatik tetiklenmez. "Memory DB Insert Pattern" bloğundaki `inserted:1 / updated:3` çıktısı Sprint-166 dönemi bir tahmin snapshot'ıdır, güncel literal durum değildir.
> - **Duplicate dosya:** `046-brain-self-update-hook.md` artık `# ADR-NNN:` H1 + `**Status:**` taşımayan bir insan/link redirect'idir; `adr-file-sync` onu `skipped` sayar, bu canonical `adr-046` entry'sini ezemez.
>
> Behavior unchanged; documentation alignment only.


---

## adr-047: Manuel Subagent Dispatch Protocol

**Status:** accepted

# ADR-047: Manuel Subagent Dispatch Protocol

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator — post-repair)

**Date:** 2026-05-14

**Sprint:** Sprint 168 (Brain Repair Phase — hardened protocol formalization)

---

## Status

accepted (Sprint 168 — Sprint 164-168 manuel survival pattern proven across 23+ incidents; formal
protocol kontrat olarak dokümante edildi. Sprint 169+ Brain otonom orchestration hedefinin anchor ADR'ı.)

---

## Context

### Brain Self-Orchestration Chicken-and-Egg Paradox

Sprint 164-168 boyunca Brain'in orchestration pipeline'ı kısmen kırıktı. Kırık Brain'i tamir etmek
için Brain'in otonom orchestration'ını kullanmak mümkün değildi — bu klasik bir **chicken-and-egg
paradox**u oluşturuyordu:

- Brain kendi spawn pipeline'ını kırık bulduğunda, task dispatch edemedi
- Kırık Brain üzerinden plan yapılamadı (RC1 parser bare token, RC2 collision subscribe yoktu)
- Brain finalize hook chain'i kısmen çalışıyordu (ADR-046 — Step 2/4/5 partial implementation)
- Bu kısırlaşma döngüsünü kırmak için insan-güdümlü (Alperen-guided) manuel dispatch gerekti

### Sprint 164-168 Manuel Survival Pattern (23+ Incident)

| Sprint | Manuel Dispatch Kullanım Gerekçesi |
|--------|-------------------------------------|
| 164 | Brain spawn pipeline crash — workaround: manuel task assignment |
| 165 | Finalize hook eksik — manuel memory export + RETRO.md yaz |
| 166 | Bug M+N+S+Y2+... forensic — manuel Brain repair sprint (11/11 task done) |
| 167 | Audit + debug phase 1+2 — 10 bug x 5 cluster forensic investigation |
| 168 | Brain Repair Phase — 8 anchor task hardened manuel dispatch |

Bu pattern, otonom Brain orchestration'ın güvenilmez olduğu dönemlerde **projenin ilerlemesinin devam
etmesini sağladı**. 23+ incident boyunca zero sprint abandonment (hiçbir sprint yarım bırakılmadı).

### Phase 1+2 Audit Evidence (Sprint 167)

Sprint 167 T5 forensic audit (`.audit/sprint-167/T5-brain-debug-phase1.md` +
`T5-brain-debug-phase2.md`) 5 architectural cluster tespit etti:

- **Cluster A:** Brain Finalize Hook Chain Implementation Gap (4 bug: BUG-CC/DD/EE/GG)
- **Cluster B:** Locking Infrastructure Asymmetry — SpawnLock symmetric cleanup eksik
- **Cluster C:** Plan-Spawn Integration Disconnect — 3 baglanti kopuklugu
- **Cluster D:** Sprint Metrics Math — null/undefined guard eksik
- **Cluster E:** Worker Lifecycle Mismatch — non-selective prompt cleanup cascade

**Phase 4.5 trigger tetiklendi:** Her cluster için 3+ basarisiz önceki fix girisimi mevcut (Cluster A:
Sprint 166 T1/T2/T5/T11 — 4 wire fix, Sprint 167'de hala kismi; Cluster B: Sprint 156 T-10'dan beri 11
sprint asimetrik; Cluster C: Sprint 138 T4'ten beri 29 sprint disconnect).

### Sprint 168 Formalization Gerekçesi

Sprint 168'de "manuel subagent dispatch" ilk kez **hardened protocol** olarak biçimlendirildi:

- **v1 to v5 eval zinciri:** systematic-debugging (Agent A: 79 to 96/100) + devil's advocate (Agent B: 22 to 26/100)
- **Çift hedef basarili:** Agent A >=95 APPROVED, Agent B <30 SHIP_AS_IS
- **8 paralel + 1 sequential subagent** git worktree isolation ile dispatch edildi
- Bu ADR o protokolü kalici mimari kontrat olarak dokümante eder

---

## Decision

Brain repair veya Brain orchestration'ın güvenilmez oldugu sprint'lerde **Hardened Manuel Subagent
Dispatch Protocol** uygulanir. Bu protokol yedi zorunlu prensibe dayanir:

### 1. Worktree Isolation (Git Worktree Per Cluster)

Her cluster/subagent için ayri git worktree olusturulur:

```bash
git worktree add ../deckent-sprint-NNN-<CLUSTER_ID> main
```

**Zorunluluk:** Paralel subagent'lar ayni dosyalarda çakisma yapamaz. Subagent kendi worktree'sinde
çalisir, main branch'e dokunmaz. Sprint sonu rebase + merge cascade order ile yapilir.

**Örnek (Sprint 168):**

```
../deckent-sprint-168-C0e      (cascade endpoint — first merge)
../deckent-sprint-168-C0b      (locking)
../deckent-sprint-168-C0c      (plan-to-spawn integration)
../deckent-sprint-168-C0a-1    (hook chain step 2)
../deckent-sprint-168-C0a-2    (hook chain step 4, sequential)
../deckent-sprint-168-C0a-3    (hook chain step 5, sequential)
../deckent-sprint-168-C0a-4    (hook chain step 12, sequential)
../deckent-sprint-168-C0d      (metrics, isolated)
../deckent-sprint-168-ADR-047  (governance doc, paralel)
```

### 2. File Authority Matrix

Her subagent için STRICT `scope.filesWrite` tanimlanir. Subagent bu matrisin disina çikamaz:

| Subagent | scope.filesWrite (yazma yetkisi) |
|----------|----------------------------------|
| C0e | src/providers/claude.ts, src/orchestra/sprint-lifecycle.ts, src/orchestra/spawn-backend.ts, src/orchestra/tmux.ts, src/core/active-workers.ts (NEW), docs/adr/048-*.md, tests/providers/, tests/orchestra/ |
| C0b | src/core/file-lock.ts, src/monitor/auditor.ts (lock binding only), src/orchestra/spawn-backend-docker.ts:933 (on-exit hook only), tests/core/, tests/monitor/ |
| C0c | src/orchestra/planner.ts, src/orchestra/task-builder.ts, src/orchestra/decision-engine.ts, src/orchestra/sprint-controller.ts (TASK_ASSIGN re-read only), tests/orchestra/ |
| C0a-1 | src/core/identity-generator.ts, tests/core/identity-regen-default-skip.test.ts |
| C0a-2 | src/core/rule-generator.ts, src/orchestra/sprint-finalizer.ts (Step 4 only), tests/core/, tests/orchestra/ |
| C0a-3 | src/orchestra/sprint-retro-writer.ts, src/orchestra/sprint-finalizer.ts (Step 5 only), tests/orchestra/ |
| C0a-4 | src/orchestra/sprint-docs-updater.ts, docs/adr/046-*.md (amendment), src/orchestra/sprint-finalizer.ts (Step 12 only), tests/orchestra/ |
| C0d | src/orchestra/sprint-reporter.ts veya managed-doc-runner.ts, tests/orchestra/ |
| ADR-047 | docs/adr/047-*.md (sadece) |

**Alperen review gate:** Her subagent commit sonrasi `git diff --stat` ile file authority matrix
disina yazim yapilip yapilmadigi kontrol edilir. Ihlal: subagent retry.

### 3. Wave Structure (Cascade'in Tersine)

Task dispatch sirasi, **bagimlilik cascade'inin tersine** organize edilir. Cascade endpoint'i
(en çok bagimlilik alan modül) **önce** fix edilir — cascade upstream'leri düzeltmeden önce
temiz bir taban saglar:

```
Cascade graph (bagimlilik yönü):
  RC1 (parser) -> Brain TASK_ASSIGN payload
  RC3 (cache)  -> Brain TASK_ASSIGN payload
  RC2 (collision) -> Brain TASK_ASSIGN payload
                                     |
  RC4 (SpawnLock) -> spawn lock conflict
                                     |
  BUG-HH (claude.ts cleanup) -> ALL prompts deleted  <- ENDPOINT
                                     |
  Cluster A (Hook Chain Steps) -> finalize failures
```

**Dispatch wave order (cascade endpoint first):**

| Wave | Subagents | Kosul |
|------|-----------|-------|
| **Wave 1** (paralel) | C0e (cascade endpoint) + ADR-047 | Hemen baslar |
| **Wave 1.5** | Alperen CHECKPOINT | Wave 1 DONE sonrasi |
| **Wave 2** (paralel) | C0b + C0c + C0a-1 + C0d | Wave 1.5 geçti ise |
| **Wave 3** (sequential) | C0a-2 -> C0a-3 -> C0a-4 | Wave 2 DONE sonrasi |

**Merge order** (cascade endpoint first, bagimlilik sirasiyla):

1. C0e merge
2. C0b
3. C0c
4. C0a-1 / C0a-2 / C0a-3 / C0a-4 (sequential)
5. C0d
6. ADR-047

### 4. Wave 1.5 Serial Gate

**Wave 1.5 serial gate**, kritik kontrat dogrulama için insan-in-the-loop (Alperen) checkpoint'tir.
C0e gibi cascade endpoint fix'ler tamamlandiktan sonra, Wave 2 baslamadan önce asagidakiler
seri olarak dogrulanir:

```
Wave 1.5 Checklist:
  [ ] C0e DONE + commit hash verified
  [ ] ADR-048 MADR v3 format compliance check
  [ ] Cross-backend audit dogrula (Docker + Subprocess + Tmux uniformity)
  [ ] npx deckent memory rebuild veya backfill script -> ADR-048 DB insert verify
  [ ] .deckent/decisions/sprint-NNN-C0e-done.json write (audit trail)
  [ ] npx vitest run skip count delta kontrol (>0 ise retry)
  [ ] Wave 2 dispatch onay
```

**Gerekçe:** Sprint 166 T11 paterni. Cascade endpoint'in biraktigi kontrat (ADR-048) downstream
subagent'lar (Wave 2) tarafindan baz alinir. Kontrat hataliYsa Wave 2 hatAyi çogaltir. Serial gate
bu riski engeller.

### 5. TDD Enforcement Gate

Her subagent için zorunlu TDD disiplini:

1. **Failing test ÖNCE yaz** (TDD red phase) — Implementation öncesi
2. **Run test -> FAIL bekle** — Red dogruLandi
3. **Minimal implementation** — Sadece testi geçirecek kadar
4. **Run test -> PASS bekle** — Green dogruLandi
5. **Atomic commit per step** — Her TDD cycle ayri commit
6. **Skip ekleme YASAK** — Baseline skip count (Sprint 168: 41) korunur
7. **Test PASS olmadan commit YASAK**

**TDD enforcement gate kuralLari:**

- Subagent `.result` dosyasinda `tests_skipped_added: 0` field ZORUNLU
- Alperen review gate: subagent commit sonrasi `npx vitest run` + skip count delta kontrol
- Skip artisi tespit edilirse subagent retry veya manuel fix
- Vitest baseline tolerance: `pass>=16395 + fail<=2 + skip<=41`

**Gerekçe:** Sprint 164-167 skip drift (41 inherited skips). TDD enforcement gate yeni regression
ve technical debt birikmesini engeller. Phase 4.5 trigger kosullarindan biri de "çok sayida
basarisiz fix" — TDD bu döngüyü önler.

### 6. Lock Pattern

Shared file conflict'i önlemek için dispatch lock dosyasi kullanilir:

```json
{
  "version": "1.0",
  "sprint": "sprint-NNN",
  "subagents": {
    "C0a-1": {
      "worktree": "../deckent-sprint-NNN-C0a-1",
      "status": "pending|active|done|merged",
      "files_owned": [
        "src/core/identity-generator.ts",
        "tests/core/identity-regen-default-skip.test.ts"
      ],
      "started_at": null,
      "done_at": null,
      "commit_hash": null
    }
  }
}
```

**Lock file path:** `.deckent/sprint-NNN-dispatch-locks.json`

**Status transitions:** `pending -> active -> done -> merged`

**Sequential lock:** PaylasiLan dosyalar için (örn. `sprint-finalizer.ts`) önceki subagent
`done` olmadan sonraki `active` olamaz. C0a-2/3/4 bu kurala tabidir.

### 7. Manual Survival Fallback

Brain orchestration NO_GO veya güvenilmez ise Sprint N+0.5 replay paterni devreye girer:

| Sprint N Sonucu | Sprint N+0.5 Mod |
|-----------------|------------------|
| **GO** | Brain otonom (`deckent plan + start` normal flow) |
| **GO_WITH_TECH_DEBT** | Brain yari otonom (Brain spawn, Alperen monitoring) |
| **NO_GO** | Manuel subagent dispatch replay (Sprint N paterni, bu ADR) |

**NO_GO durumu protocol:**

- Sprint N'nin fail eden cluster Sprint N+0.5'in ilk task'i olur (gap closure)
- Yeni sprint DIRECTIVES.md Sprint N fail evidence ile baslar
- Worktree isolation Sprint N+0.5 için yeniden kurulur
- TDD enforcement gate ayni baseline kurallari ile devam eder

**Recursion kabul:** Brain repair sirasinda Brain bypass GEREKLI olabilir. Sprint N sonu Brain
otonom OLMAYABILIR — bu durumda Sprint N+0.5 hala manuel survival ile çalisir AMA Sprint N'nin
fix'leri persistent'tir (regression yok). Hedefler gerekirse Sprint N+2'ye kayabilir.

**Catch-22 önleme:** Sprint N NO_GO -> Sprint N+0.5 BLOCKED zinciri YASAK. Sprint N+0.5 her zaman
basLAYabilir — Brain kirik olsa dahi manuel dispatch ile.

---

## Architectural Principles

Bu protokolün alti temel mimari prensibi:

### 1. Worktree Isolation (Subagent Çakisma Protection)

Paralel subagent'lar ayri git worktree'lerde çalisir. Çakisma tespit edilirse resolve yerine
isolation güçlendirilir. Bir subagent'in hatasi digerini kirletmez.

### 2. File Authority Matrix (Scope Kontrolü)

Her subagent için STRICT yazma yetkisi tanimlanir ve Alperen review gate ile denetlenir.
ADR-037 RBAC prensiplerine uygun. Scope ihlali -> retry. Matrix genisletilemez (yeni subagent
için yeni satir eklenir, mevcut satir büyütülemez).

### 3. TDD Enforcement Gate (Regression Protection)

Failing test -> fix -> pass döngüsü zorunludur. Skip ekleme YASAK — bu kural "test geçti" ile
"test var" arasindaki boslugu kapatir. Alperen review gate skip count delta'yi dogrular.

### 4. Wave-Based Execution (Cascade Order)

Dispatch cascade'in tersine organize edilir. Endpoint fix edilmeden upstream fix yapilmaz.
Bu "fix birini bozdu" riskini minimize eder ve her wave'in stabil bir temel üzerine insa
edilmesini saglar.

### 5. Wave 1.5 Serial Gate (Kritik Kontrat Dogrulama)

Cascade endpoint fix + kritik ADR yazimi sonrasi insan onayLi serial checkpoint. Downstream
subagent'lar hatali bir kontrAti baz almadan önce dogrulama yapilir.

### 6. Manual Survival Fallback (Catch-22 Önleme)

Brain repair sirasinda Brain bypass gereklidir — bu paradoks kabul edilir ve explicit fallback
semantigi ile yönetilir. Hiçbir sprint yarim birakilmaz.

---

## Consequences

### Olumlu

- **Sprint 164-168 sprint abandonment = 0.** 23+ incident'ta zero sprint abandonment.
  Manuel dispatch protokolü bu basArIyi mümkün kildi.
- **Brain repair sprint'lerinde formal protocol.** Dokümante ve tekrarlanabilir — gelecek
  Brain kirik dönemlerinde Alperen ve Brain protokolü bilir, icat etmek zorunda kalmaz.
- **Worktree isolation paralel çalismAyi güvenli kilar.** 8 subagent paralel çalisti,
  conflict yasAnmadi (Sprint 168 dogfood kaniti).
- **TDD enforcement gate regression önledi.** Baseline 41 skip Sprint 168 sonu <=41 korundu.
- **Sprint 169+ Brain otonom hedefinin anchor'i.** Sprint 168 GO -> Brain otonom mümkün.
  Bu ADR o gecisin ön kosulunu belgeler.
- **ADR-047 + ADR-048 memory.db'ye insert edildi.** Brain ADR-bazli kararlar için güncel
  governance veriye erisebilir (ADR-046 M1 monitoring metrik).

### Olumsuz

- **Manuel dispatch human-intensive.** Alperen review gate her subagent için manuel onay
  gerektirir. Wave 1.5 serial gate ek zaman alir (30-60 dk tahmin). Brain otonom öncesi
  bu overhead devam eder.
- **Worktree yönetimi complexity.** 9 worktree + cleanup = sprint sonu ek adim. Unutulursa
  disk space birikMesi (her worktree full repo clone).
- **Sprint N+0.5 pattern manuel kalir.** Brain otonom saglanana kadar her repair sprint
  bu protokolü tekrar uygulAyacak. Recursion paradoksu çözülmeden bu overhead sürer.
- **Sprint 169 hedefi kayabilir.** Sprint 168 GO_WTD veya NO_GO durumunda Sprint 169 OSS GA
  Sprint 170+'a ertelenebilir (Manual Survival Fallback Section 7 semantigi).

---

## Compliance

### Sprint 168 Dogfood Evidence

Sprint 168 bu protokolün ilk **hardened** uygulamasidir:

| Kontrol | Beklenti | Gerçek |
|---------|----------|--------|
| Anchor task sayisi | 8 paralel + 1 sequential | 8 + ADR-047 = 9 subagent |
| Worktree isolation | 9 ayri worktree | Olusturuldu (git worktree list dogruladi) |
| File authority matrix | Her subagent STRICT scope | DIRECTIVES.md + plan Section file authority matrix |
| Wave structure | 4 wave (1, 1.5, 2, 3) | DIRECTIVES.md Wave Structure uygulandi |
| Wave 1.5 serial gate | ADR-048 + cross-backend audit | Wave 1 (C0e) DONE sonrasi Alperen CHECKPOINT |
| TDD enforcement gate | 0 yeni skip (baseline 41) | Subagent .result + Alperen review gate |
| Lock pattern | .deckent/sprint-168-dispatch-locks.json | Olusturuldu |
| Manual survival fallback | Sprint 168 NO_GO -> Sprint 168.5 replay | Explicit DIRECTIVES.md Sprint 168.5 section |
| ADR-047 yazili | Sprint 168 Wave 1 | Bu dokuman |

### Sprint 169+ Brain Otonom Hedefi

Sprint 168 GO -> Brain otonom `deckent plan + start` normal flow.

Bu ADR'in protokolü Sprint 169+ Brain otonom orchestration ile **protocol parity** saglamalidir:

| ADR-047 Protokol | Brain Otonom Esdeğeri |
|------------------|-----------------------|
| Worktree isolation | git worktree add -> Brain spawn-time isolation |
| File authority matrix | scope.filesWrite RBAC (ADR-037 V1.0 — compile-time lint + audit-trail; runtime advisory/soft, bloke etmez; hard-flip post-GA V2) |
| TDD enforcement gate | Brain GO/NO_GO evaluation (result evaluator) |
| Wave structure | dependency_pipeline_enabled — Wave scheduling (kod default true; deckent-dev'de bilinçle `false`, Wave geçişleri Brain-manuel — bkz. aşağıdaki not) |
| Wave 1.5 serial gate | Human checkpoint MCP tool (deckent_checkpoint) |
| Lock pattern | .locks/ infrastructure (ADR-037) |
| Manual survival fallback | deckent recover + deckent run chain |

Brain otonom Sprint 169'da bu 7 kontrol için parity saglandiysa manuel dispatch yerine `deckent plan`
+ `deckent start` kullanilir. Parity eksikse ADR-047 paterni devam eder.

### Sprint 168.5 Compliance

Sprint 168 sonucu ne olursa olsun Sprint 168.5 basLAYabilir:

- Sprint 168 GO -> Brain otonom Sprint 168.5
- Sprint 168 GO_WTD -> Yari otonom (Brain spawn, Alperen monitoring)
- Sprint 168 NO_GO -> Sprint 168.5 bu ADR ile manuel dispatch replay

Sprint 168.5 scope: C1 Memory Relations, C2 Bug Z3 Safety, H1-H5 OSS pre-flip hazirlik.

---

## Alternatives Considered

### (a) Brain Otonom ile Sprint 168 Yürütme

Brain'in kirik pipeline'ina ragmen `deckent plan + start` kullanmak.

**Neden reddedildi:** Phase 1+2 audit kanAtladi ki RC1 parser + RC4 SpawnLock + BUG-HH cascade
aktifken Brain spawn 7/7 task'ta basarisiz oldu (Sprint 167 canli kanit). Brain'i kirik Brain
ile tamir etmek — paradox çözümsüz. Manuel dispatch tek güvenilir yol.

### (b) Tek Büyük Subagent (Monolithic Fix)

Tüm 10 bug'i tek subagent ile fix etmek.

**Neden reddedildi:** 5 cluster x farkli modül -> scope collision riski. Tek subagent hata
yapinca rollback zorlasir. Paralel worktree ile 8 subagent her cluster'i bagmsiz fix eder
ve hata izolasyonu kolaydir.

### (c) Sequential (No Paralel) Dispatch

8 subagent sirayla, worktree olmadan.

**Neden reddedildi:** Tahmini süre ~35h sequential. Paralel + wave ile ~10-15h. Worktree
olmadan sequential conflict riski ayni kalir. Paralel + isolation daha hizli ve güvenli.

### (d) Human-Driven (No Subagent — Alperen Codes Directly)

Alperen tüm fix'leri kendisi yazar.

**Neden reddedildi:** 10 bug x 5 cluster ~35h kodlama. Subagent dispatch hem hiz hem expertise
saglar. Subagent dispatch bu projenin product vision'inin dogfood'udur (deckent ile deckent repair).

---

## Related ADRs

- **ADR-046:** Brain Self-Update Hook Architecture — Step Ordering Contract. Bu ADR'in
  hook chain (Cluster A) fix'leri ADR-046 kontratina uygun yazildi. Wave 3 subagent'lar
  (C0a-2/3/4) ADR-046 Step 4/5/12'yi fix ediyor.
- **ADR-037:** Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0. File authority
  matrix bu ADR'in scope.filesWrite kontratini manuel dispatch için genisletir. Auditor
  boundary violation detection bu protokolde Alperen review gate olarak uygulanir.
- **ADR-035:** Brain-Worker-Auditor Verification Protocol Standard. TDD enforcement
  gate ve Alperen review gate bu ADR'in 15-channel verification protocol'ünün manuel
  uyarlamasidir. Subagent .result dosyasi V1.0 verification protocol'e uygun format kullanir.
- **ADR-040:** Nervous System Architecture — Proactive Meta-Orchestrator. Manuel dispatch
  sirasinda Nervous System pasif (observer) modda çalisir — Brain orchestration devredisi iken.
- **ADR-045:** Wave-Based Execution Semantics. Brain otonom wave scheduling (dependency_pipeline)
  ile ADR-047 wave structure paraleli: cascade endpoint'i önce fix etmek, dep_pipeline_enabled
  topological ordering ile esdeger.

---

## References

1. **Sprint 168 Spec (v5):** `docs/superpowers/specs/2026-05-14-sprint-168-design.md`
   — Section 3.2 Execution: Hardened Manuel Subagent Dispatch (dispatch mechanism, file
   authority matrix, lock pattern, TDD enforcement gate, manual survival fallback)
2. **Sprint 168 Plan:** `docs/superpowers/plans/2026-05-14-sprint-168-plan.md`
   — Section "Subagent Dispatch Runbook" (worktree setup, file authority matrix, dispatch
   sequence, cluster prompts)
3. **Sprint 167 T5 Phase 1 Audit:** `.audit/sprint-167/T5-brain-debug-phase1.md`
   — 10 bug x 5 cluster forensic, Phase 4.5 trigger evidence, 23+ incident history
4. **Sprint 167 T5 Phase 2 Audit:** `.audit/sprint-167/T5-brain-debug-phase2.md`
   — Pattern analysis, working vs broken reference compare, cross-cluster dependencies
5. **ADR-046 Sprint 168 Amendment:** `docs/adr/046-brain-self-update-hook-architecture.md`
   — Step 12 archiveDirectives default=false amendment (C0a-4)
6. **ADR-048 Prompt Lifecycle Contract:** `docs/adr/048-prompt-lifecycle-contract.md`
   — C0e subagent tarafindan yazilan cross-backend prompt persistence kontrAti

---

## Notes

Bu ADR, Sprint 164-168 boyunca organik olarak gelisen manuel survival pattern'inin **retrospektif
formalizasyonudur**. Pattern gerçek sprint'lerde test edildi, 23+ incident'ta zero abandonment
sagladi, ve Sprint 168'de hardened protocol olarak standartlastirildi.

Sprint 169+ için hedef: bu ADR'da belgelenen 7 protokol prensibinin Brain otonom orchestration
ile tam parity saglamasi. O noktada ADR-047 "deprecated in favor of Brain otonom" olacak —
bu basarinin belgesi olarak arsivde kalacak.

**Sprint 168 final eval zinciri:**
v1 (fc91fcd): brainstorming -> v5 (f63a8f6): Agent A 96/100 + Agent B 26/100 — cift hedef basarili.
Bu ADR Sprint 168 GO kararinin mimari anchor'idir.

---

> **Note (verified vs code + operating reality, Sprint 172):**
> - **Provenance ✓:** commit `fc91fcd` (Sprint 168 design v1) ve `f63a8f6` (v5 patch) repo git geçmişinde gerçek; `docs/superpowers/specs/2026-05-14-sprint-168-design.md` + `docs/superpowers/plans/2026-05-14-sprint-168-plan.md` mevcut.
> - **ADR-047 deprecated DEĞİL — hâlâ aktif işletim modu.** §Consequences/§"Sprint 169+ Brain Otonom Hedefi"/§Notes "Sprint 169+ Brain otonom → ADR-047 deprecated olacak" hedefi **gerçekleşmedi**. deckent-dev Sprint 172+ boyunca bu protokolle (manuel subagent dispatch) yürütülmeye devam ediyor — bu doküman turu dahil. Brain-otonom protocol parity sağlanmadı; ADR-047 bu projenin fiilî kanonik işletim modudur (CLAUDE.md/DECKENT.md ile hizalı).
> - **ADR-037 düzeltmesi (parity tablosu):** "runtime enforcement" iddiası ADR-037 V1.0 gerçeğine çekildi — compile-time lint + audit-trail aktif; runtime **advisory/soft, bloke ETMEZ** (Layer-2 0-caller `authority-enforcer.ts` always-soft + `worker.ts` violation→true; hard-flip post-GA V2). Manuel dispatch'te bu kontrol fiilen **Alperen review gate** (`git diff --stat`) ile uygulanır — kod-enforce değil.
> - **dependency_pipeline_enabled:** `.deckent/config.json` `false` (Brain-manuel Wave, ADR-045 + bu ADR). "Sprint 167 flip" deckent-dev'de gerçekleşmedi; öz-referans ironisi — flip'in olmama nedeni tam da bu ADR'ın tarif ettiği manuel mod. Kod default `true` kullanıcı-projesi yoludur.
> - **Dangling ref:** §Context/§References'taki `.audit/sprint-167/T5-brain-debug-phase1.md` + `phase2.md` belirtilen yolda **mevcut değil** (transient `.audit/` dizini — forensic artefaktlar arşivlendi/silindi; iddialar formalizasyona dayanır, dosya erişimine değil).
> - **Numaralandırma:** "Step 2/4/5 partial" (§Context) ve §"Related ADRs"daki "Step 4/5/12" — ADR-046'da netleştirildiği gibi `finalizeSprint` 13-adım CLEANUP zinciri numaralandırmasıdır, ADR-046 §5.1'in 4-hook `runPostFinalizeHooks` kontratı değil.
>
> Behavior unchanged; documentation alignment only.


---

## adr-048: Prompt Lifecycle Contract

**Status:** accepted

# ADR-048: Prompt Lifecycle Contract

**Status:** accepted
**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)
**Date:** 2026-05-14
**Sprint:** Sprint 168 (Brain Repair Phase, Cluster E fix)

---

## Status

accepted (Sprint 168 C0e fix — Sprint 167 BUG-HH live evidence, cascade endpoint).

## Context

Sprint 167 audit's live forensic evidence (`.audit/sprint-167/T5-brain-debug-phase1.md` BUG-HH §393-468, `phase2.md` Cluster E §249-369) documented that `src/providers/claude.ts:129 _cleanupOrphanedPromptFiles()` was **non-selective**: every call to `ClaudeAdapter.kill(taskId)` deleted **every** `.tasks/.prompt-*.txt` file in the project, including the prompt files belonging to still-active workers.

This violated the implicit contract documented inline at `src/orchestra/spawn-backend-docker.ts:941-942` (Sprint 156 Task 4):

> `.prompt-*.txt` AND `.worker-*.sh` tmpfiles persist until sprint cleanup. Both are archived together by `archivePromptFiles()` during sprint cleanup phase.

Sprint 167 BUG-HH live replay: when **any** worker was killed (orphan cleanup, scope violation, retry-fix kill), the remaining active workers lost their `.prompt-*.txt` source and several wrote NO_GO stub `.result` files because the Claude CLI could not re-read the prompt mid-execution.

Cascade significance: this BUG-HH was the **endpoint** of Sprint 167's cascade chain. Any kill triggered by Cluster B (spawn-lock asymmetry), Cluster C (plan↔spawn disconnect), or Cluster A (sprint-finalizer step ordering) cascaded into BUG-HH and corrupted the entire sprint. Fixing C0e (this ADR) closes the cascade so that B/C/A fixes ship without downstream sprint corruption.

Three additional gaps surfaced from the forensic:

1. **No cross-sprint orphan handling.** If a sprint crashes mid-execution (Brain SIGKILL, power loss), its `.prompt-*.txt` files remain in `.tasks/` and pollute the next sprint's working set with no archival.
2. **No cross-backend uniformity.** Only the Docker backend had a documented persist-until-cleanup contract. The Subprocess (`spawn-backend.ts`) and Tmux (`tmux.ts`) backends had no contract comment, so future maintainers had no guarantee the lifecycle would remain consistent.
3. **Duplicate active-worker lookup.** `auditor.ts:2162-2168` already maintained an active-worker pattern (via `hb.workerId`), but the pattern was not shared as a helper. Selective filter on claude.ts needed an equivalent lookup (via `hb.taskId`, matching Docker prompt filename embedding `.prompt-{taskId}-{promptId}.txt`).

## Decision

`.tasks/.prompt-*.txt` and `.tasks/.worker-*.sh` tmpfiles follow this lifecycle contract across **all three** spawn backends (Docker, Tmux, Subprocess):

1. **Write at spawn:** Worker spawn writes prompt to `.tasks/` (Docker: `spawn-backend-docker.ts:226-232`; Tmux: `tmux.ts:writePromptFile()`; Subprocess: passes via argv/stdin, no file).
2. **Persist until sprint cleanup:** During the sprint, prompt files are PRESERVED. Per-worker `kill()` MUST NOT delete prompts belonging to other live workers.
3. **Archive at sprint cleanup:** `archivePromptFiles(tasksDir, sprintId)` (`spawn-backend-docker.ts:982`) is the single atomic operation that moves all `.prompt-*.txt` and `.worker-*.sh` files to `.tasks/archive/sprint-{sprintId}/`. Move (not delete) preserves post-mortem forensic value.
4. **Active filter at cleanup edge cases:** `ClaudeAdapter._cleanupOrphanedPromptFiles(activeTaskIds?)` applies a selective filter via the shared helper `getActiveWorkerIds()` (`src/core/active-workers.ts`). A prompt is deleted only when its embedded taskId is absent from the active heartbeat set. When the caller omits `activeTaskIds`, the helper auto-defaults to `getActiveWorkerIds(this.projectDir)`.
5. **Cross-sprint orphan cleanup:** `cleanupPreviousSprintOrphans(projectRoot, previousSprintId)` (`src/orchestra/sprint-lifecycle.ts`) is invoked at sprint startup. It calls `archivePromptFiles(tasksDir, previousSprintId)` — orphans from a crashed prior sprint are archived (not lost, not retained as noise).
6. **Cross-backend uniformity:** All three backends carry an inline `Sprint 168 C0e Cross-Backend Contract` comment so the persist-until-cleanup contract is discoverable from any backend source file.

## Architectural Principles

- **Single source of truth.** `archivePromptFiles()` in `spawn-backend-docker.ts:982` is the one atomic operation responsible for moving tmpfiles. Sprint-end cleanup, cross-sprint startup cleanup, and any future periodic sweeper all delegate to this function.
- **Active worker protection.** Selective filter via `getActiveWorkerIds()` (`src/core/active-workers.ts`). Helper returns `taskId` because Docker prompt filenames embed `taskId` (`.prompt-{taskId}-{promptId}.txt`). Auditor's existing `workerId`-based pattern (`auditor.ts:2162-2168`) is intentionally NOT replaced — it serves a different downstream (lock cleanup) and the two patterns are complementary.
- **Sprint boundary respected.** Intra-sprint kill DOES NOT trigger archive (cleanup is per-sprint-end). Cross-sprint orphans DO archive (the startup hook explicitly moves them to the previous sprint's archive folder).
- **Backend agnostic.** Three backends share the same lifecycle contract via inline `Sprint 168 C0e Cross-Backend Contract` markers; future backends (e.g. MCP) inherit the same contract.

## Consequences

**Positive:**

- BUG-HH eradicated — `_cleanupOrphanedPromptFiles()` protects active workers via taskId selective filter, so the Sprint 167 cascade endpoint is closed.
- Cluster B (spawn-lock asymmetry), Cluster C (plan↔spawn disconnect), Cluster A (sprint-finalizer step ordering) kill operations no longer corrupt the active worker set as a side effect.
- Three backends share an explicit, discoverable persist-until-cleanup contract — multi-provider users (Docker + Tmux + Subprocess) get consistent behavior.
- Cross-sprint orphans no longer pollute the next sprint's `.tasks/` — they are archived under the previous sprint id.
- `getActiveWorkerIds()` shared helper deduplicates the active-worker enumeration that previously lived only as an inline expression in `auditor.ts`; future callers (Sprint 168.5+) can reuse it.

**Negative:**

- During the sprint, `.tasks/.prompt-*.txt` files persist on disk — for a typical sprint with ~50-100 prompts at ~10KB each, this is ~500KB-1MB of disk space until sprint-end archive. Acceptable trade-off against forensic value.
- Tmux backend prompt filenames use random hex (`tmux.ts:60 writePromptFile`), NOT the embedded-taskId pattern of Docker. The selective filter `file.includes(\`-${id}-\`)` therefore does NOT protect tmux prompts (random hex tokens never match a taskId). Tmux prompt protection relies on tmux's per-window kill semantics (the prompt is only meaningful for the killed window) plus the sprint-end archive sweep, not on the selective filter. Subprocess backend writes no `.prompt-*.txt` at all, so the selective filter is also a no-op there. This asymmetry is intentional and documented inline in `tmux.ts:writePromptFile()` and `spawn-backend.ts` TmuxBackend.spawn().
- Sprint cleanup phase is a single atomic operation. If `archivePromptFiles()` fails partway, the next sprint's startup hook (`cleanupPreviousSprintOrphans`) recovers the remainder — but a fully-corrupted `.tasks/archive/` directory would require manual recovery (operator intervention).

## Compliance

**Verification (Sprint 168 test suite):**

- `tests/core/active-workers.test.ts` — 4 cases: taskId extraction, empty dir, malformed JSON tolerance, missing directory tolerance.
- `tests/providers/claude-cleanup-active-protected.test.ts` — 3 cases: explicit active list protection, default-from-heartbeat fallback, no-active legacy delete-all.
- `tests/orchestra/sprint-startup-prev-sprint-orphan.test.ts` — 3 cases: single orphan archive, empty-directory idempotency, multi-file archive.
- `tests/orchestra/cross-backend-prompt-uniformity.test.ts` — 2 cases: contract keyword presence across all 3 backends, Sprint 168 C0e marker presence on the two newly-annotated backends.

**Runtime evidence required for ratification:**

- Sprint 168 Brain otonom smoke test (Plan Section "Brain Otonom Smoke Test Runbook" — 3-task complex). Expected: kill of task 3 preserves prompts of tasks 1+2.
- Sprint 168.5 production replay: previous sprint's `.tasks/.prompt-*.txt` files must be archived into `.tasks/archive/sprint-168/` at Sprint 168.5 startup.

## Related ADRs

- **ADR-046**: Brain Self-Update Hook Architecture — Step 12 archive-directives pattern parallels this archive-prompts pattern; both share the "single atomic operation at sprint boundary" principle.
- **ADR-037**: Brain-Auditor-Worker Authority Matrix — RBAC scope. Sprint cleanup is a Brain authority; Auditor reads but does not write tmpfiles.
- **ADR-035**: Brain ↔ Worker ↔ Auditor Verification Protocol Standard. The `.prompt-*.txt` file is verification-channel evidence; protecting it preserves the chain.
- **ADR-038**: Dead Code Disposition — earlier audit established that tmpfiles have forensic value; this ADR formalizes the persist-until-cleanup contract that follows from that principle.

## References

- Sprint 167 T5 Brain Debug Phase 1: `.audit/sprint-167/T5-brain-debug-phase1.md` §393-468 (BUG-HH forensic).
- Sprint 167 T5 Brain Debug Phase 2: `.audit/sprint-167/T5-brain-debug-phase2.md` §249-369 (Cluster E cascade pattern).
- Sprint 168 plan: `docs/superpowers/plans/2026-05-14-sprint-168-plan.md` lines 409-832 (Task 1 C0e TDD steps).
- Sprint 168 spec v5: `docs/superpowers/specs/2026-05-14-sprint-168-design.md` Cluster E section.
- Sprint 156 Task 4: original `archivePromptFiles()` introduction (`spawn-backend-docker.ts:982-1011`) — the persist-until-cleanup contract this ADR extends.

---

> **Note (deep-verified vs code, Sprint 172):** §Decision 4 + §Architectural Principles kod ile **birebir doğrulandı:**
> - `_cleanupOrphanedPromptFiles(activeTaskIds?)` — opsiyonel param, yoksa `getActiveWorkerIds(this.projectDir)` default (`src/providers/claude.ts:147,150`); selective filter `active.some(id => file.includes(\`-${id}-\`))` (`:157`) ve Docker `.prompt-{taskId}-{promptId}.txt` yorumu birebir.
> - `getActiveWorkerIds()` (`src/core/active-workers.ts:67`) `.hb` dosyalarından `hb.taskId` döndürür; JSDoc'u (`:55-57`) "auditor.ts:2162-2168 workerId pattern KASITLI değiştirilmedi, iki pattern tamamlayıcı" der — §Arch Principles ile aynen. Tolerance (malformed/empty/missing → boş) test 4-case ile uyumlu.
> - **Pozitif nüans (ADR metninde yok):** `getActiveWorkerIds` ek olarak `PENDING_SPAWNS` (henüz `.hb` yazmamış spawn) ile **union** yapar — §Decision 4 kontratının süperseti (çelişki değil, erken-spawn koruması).
> - **Fonksiyon/test ✓:** `cleanupPreviousSprintOrphans` (`sprint-lifecycle.ts:236`, `archivePromptFiles` çağırır), `archivePromptFiles` (`spawn-backend-docker.ts:1003`); 4 test dosyası (`active-workers`, `claude-cleanup-active-protected`, `sprint-startup-prev-sprint-orphan`, `cross-backend-prompt-uniformity`) mevcut.
> - **Satır-ref drift'i:** ADR `claude.ts:129` → gerçek def `:147` (call `:123`); `archivePromptFiles` `:982` → gerçek export `:1003`. Fonksiyonlar mevcut, yalnız satır numaraları eski (kod büyüdü).
> - **§Decision 6 hassasiyet düzeltmesi:** "All three backends carry an inline `Sprint 168 C0e Cross-Backend Contract` comment" abartılıdır — C0e marker yalnız `src/orchestra/spawn-backend.ts` + `src/orchestra/tmux.ts`'te (2 yeni-annote backend); `claude.ts`/`spawn-backend-docker.ts`'te yoktur (Docker'da orijinal Sprint 156 persist-until-cleanup yorumu vardır). ADR'ın kendi §Compliance maddesi zaten daha hassas ("the two newly-annotated backends"); §Decision 6 ile §Compliance arasındaki ifade farkı §Compliance lehine okunmalıdır.
> - **Dangling ref:** §Context + §References'taki `.audit/sprint-167/T5-brain-debug-phase1.md` + `phase2.md` belirtilen yolda mevcut değil (transient `.audit/` — ADR-047 ile aynı; iddialar forensic formalizasyona dayanır). `docs/superpowers/plans|specs/2026-05-14-sprint-168-*` referansları mevcut ✓.
>
> Behavior unchanged; documentation alignment only.

---

## Amendments

### Sprint 182 Amendment — Worker Prompt Quality Contract (2026-05-21)

**Status:** accepted (Sprint 182 Wave 3, Crisis Stabilization Initiative §8d)
**Trigger:** Sprint 181 sistem testi 8 worker prompt quality bulgusu (`docs/superpowers/specs/2026-05-21-worker-prompt-quality-fixes.md`) + anchor memory `feedback_prompt_completeness_over_brevity.md` (token-tasarruf YASAK felsefesi).

ADR-048'in orijinal kapsamı (Sprint 168) `.prompt-*.txt` ve `.worker-*.sh` **tmpfile lifecycle** (yaz/persist/arşivle) ile sınırlıdır. Bu amendment, aynı lifecycle'ın **render/inject aşamasına** dair eksik kontratı şu altı kuralla tamamlar:

1. **Worker prompt truncation YASAK.** `prompt-god-template.ts` içindeki skill section'ı (`EFFORT_TOKEN_MAP`, `perItemMax`, `sectionMax`, `truncateAtParagraph`, `if (... > sectionMax) break`) ve ADR section'ı `ADR_SECTION_MAX = 6000` cap'i kaldırılmıştır. Her atanmış skill **full SKILL.md**, her ilgili ADR **full content** inject edilir. `"(content truncated)"`, `"(ADR content truncated for prompt size)"` gibi marker'lar worker prompt'larında **bulunmaz**. Felsefi temel: prompt tamamlığı > token-tasarrufu (anchor: `feedback_prompt_completeness_over_brevity`).
2. **Agent prompt single source = `PROMPT.md`.** `agent-pool.ts::getAgentPrompt(id)` öncelik sırası: (a) `PROMPT.md` (kanonik), (b) yoksa `agent.json::systemPrompt` (degraded warning ile fallback — hard fail YOK). `systemPrompt` + `PROMPT.md` **concatenation YASAK**. `agent.json::systemPrompt` schema'sı routing scoring + UI display için korunur ama prompt injection pipeline'ına girmez.
3. **DIRECTIVES `Files:` → `task.scope.filesWrite`.** `task-builder.ts::parseDirectives` DIRECTIVES'ten gelen `Files:` satırını parse edip `task.scope.filesWrite` array'ine map'ler. Liste boşsa `Scope:` dizinlerinden inferred listing. Fallback string'i (`"(determined by your task scope)"`) açıkça formüle edilir — sessiz default YOK.
4. **Title / Description ayrı render.** `## Task N: <title>` parse'tan title, `### Description` heading'den sonrası description. Render template'te title kendi satırında, description ayrı paragrafta — markdown korunur. Duplicate `title — description` birleşik satırı **kaldırılmıştır**.
5. **ADR threshold-based selection (default 0.3).** `selectRelevantAdrs(task, allAdrs, maxCount, minScore)` signature genişletildi. Relevance score'u `minScore` (default **0.3**, configurable `.deckent/config.json::prompt.adr_min_relevance`) altında kalan ADR atlanır. 0 ADR kalırsa `=== Mandatory Architecture Rules (ADR) ===` blok header'ı dahil basılmaz (boş blok render yok).
6. **Agent override semantic warning.** `forceAgent` atandığında: (a) activation rules `taskDNA` üzerinde çalıştırılır, (b) min score (default 0.3) altıysa **warning emit** (severity=`warn`, PLAN devam eder, override honored), (c) `Task.routingMeta.overrideWarnings: string[]` field'a kayıt yazılır. Override iptal değildir — semantic skew sadece görünür kılınır.

**Implementation tasks (Sprint 182 Wave 3):**

- **182-007** W3-PQ-1 — F1 `${IDEMPOTENCY_KEY}` injection fix (`src/orchestra/prompt-god-template.ts:455`)
- **182-008** W3-PQ-2 — F2 + F3 truncation kaldır (skill + ADR full content)
- **182-009** W3-PQ-3 — F4 Agent prompt single source = PROMPT.md (`src/core/agent-pool.ts::getAgentPrompt`)
- **182-010** W3-PQ-4 — F5 + F6 DIRECTIVES parser fix (Files → filesWrite + title/description ayrı)
- **182-011** W3-PQ-5 — F7 ADR relevance threshold default 0.3 (`selectRelevantAdrs` + `prompt.adr_min_relevance` config)
- **182-012** W3-PQ-6 — F8 Agent override semantic warning (`Task.routingMeta.overrideWarnings`)
- **182-013** W3-PQ-7 — Integration smoke: Sprint 181-001/002 prompt regression snapshot

**Verification (Sprint 182 GO/NO_GO §GATE-3 PROMPT QUALITY):**

- 7 PQ task DONE → ADR-048 amendment land
- `tests/orchestra/prompt-god-template-skill-completeness.test.ts` + `prompt-god-template-adr-completeness.test.ts` PASS (truncation yok)
- `tests/orchestra/agent-prompt-single-source.test.ts` PASS (PROMPT.md kanonik, fallback warning)
- `tests/orchestra/directives-files-to-scope.test.ts` + `directives-title-description-split.test.ts` PASS
- `tests/orchestra/prompt-god-template-adr-relevance.test.ts` PASS (threshold filter + config override)
- `tests/orchestra/agent-override-semantic-check.test.ts` PASS (low score warning + override honored + routingMeta field)
- `tests/integration/prompt-quality-regression.test.ts` PASS (Sprint 181-001/002 snapshot diff before/after)

**Relation to original ADR-048 scope:**

Sprint 168 ADR-048 = **tmpfile lifecycle** (write → persist → archive). Bu amendment = **prompt content lifecycle** (compose → render → inject → consume). İki katman birlikte "Prompt Lifecycle Contract"in tam karşılığını verir: bir prompt fiziksel olarak nerede yaşar (Sprint 168) **ve** semantic olarak ne içerir (Sprint 182). §Decision 1-6 (tmpfile) ve bu §Amendment §1-6 (content) **tamamlayıcıdır**, çelişmez.

**Backward compatibility:**

- `agent.json::systemPrompt` schema korunur (silinmez) — UI display + routing scoring katmanı için.
- `forceAgent` override mekanizması kalır — yalnızca semantic skew warning ile zenginleştirilir.
- `prompt.adr_min_relevance` config opsiyoneldir; tanımlanmazsa default 0.3 uygulanır.
- DIRECTIVES `Files:` field'ı opsiyoneldir; eski format (yalnızca `Scope:`) inferred listing fallback'i ile çalışmaya devam eder.

**Related amendments:** —
**Supersedes:** —
**Superseded by:** —


---

## adr-053: TaskType Taxonomy — Audit / Document-Write / Code-Development + Extensibility Roadmap

**Status:** accepted

# ADR-053: TaskType Taxonomy — Audit / Document-Write / Code-Development + Extensibility Roadmap

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-12

**Sprint:** Sprint 156

---

## Status

accepted (proposed Sprint 156 → accepted Sprint 172: çekirdek 3-tip taxonomy `rubric-registry.ts`'te shipped & kod-doğrulandı; Extensibility Roadmap + Tek-Kaynak reconciliation deferred/unrealized — aşağıdaki nota bkz.)

---

## Context

Deckent sprint lifecycle boyunca farklı türlerde görevler yürütülür: kaynak kodu yazan worker'lar, denetim raporu üreten worker'lar, yalnızca markdown belgeler oluşturan worker'lar. Sprint 154'e kadar tüm bu görevler tek bir `CODE_RUBRIC` ile değerlendiriliyordu. Bu tasarım Spring 153 ve 154'te ciddi bir sorun ortaya çıkardı: **Bug B** olarak kayıt altına alınan bu hata, `docs/audits/` altına yalnızca tek bir `.md` dosyası yazan audit task'larının `test_coverage: null` döndürmesi nedeniyle hatalı `NO_GO` kararı almasına neden oluyordu. Kod rubriği `test_coverage` için belirlenmiş bir eşik değeri beklediğinden, bu değer yokken görev başarısız sayılıyordu.

Bu sorun görevlerin ne yaptığına dair eksik bir modellemenin belirtisiydi. Deckent'in değerlendirme katmanı (Brain'in `result-evaluator.ts` bileşeni) görevi *tipine* göre değil yalnızca tek bir rubrik üzerinden yargılıyordu. Bu durum şu soruları gündeme getirdi:

1. Bir audit görevi neden kod kapsamı beklesin?
2. Bir doküman yazma görevi neden `correctness` skoru için test çalıştırsın?
3. Bir kod geliştirme görevi neden `audit_completeness` kriteriyle ölçülsün?

Ayrıca **task routing** (ADR-015), **agent selection** (ADR-041) ve **EffectClass** (Sprint 156 T-011) gibi bileşenler de görev tipinden faydalanabilirdi; ancak ortak bir tip tanımı yoktu. `task-router.ts`, `adr-selector.ts`, `task-analyzer.ts` ve yeni eklenen `rubric-registry.ts` her biri kendi `TaskType` tanımını yapıyordu. Bu tutarsızlık kodu anlamayı güçleştiriyor, yeni bileşenler eklendiğinde drift yaratıyordu.

Son olarak genişletilebilirlik eksikti. İleride `db-migration`, `package-publish`, `infrastructure-provision` gibi görev tipleri eklendiğinde bunları nereye yerleştirecek, hangi rubriği, hangi effect sınıfını atayacaktık? Açık bir taxonomi olmadan her ekleme ad-hoc olurdu.

---

## Decision

Deckent'te **üç temel TaskType** tanımlanır ve `rubric-registry.ts` içinde `src/orchestra/rubric-registry.ts` tek kaynak olarak tutulur:

```typescript
export type TaskType = 'audit' | 'document-write' | 'code-development';
```

### Tip Tanımları

**`audit`** — Tek bir denetim raporu dosyası üreten, kodda değişiklik yapmayan görevler.
- Tespit kuralı: `scope.filesWrite` tam olarak 1 girdi içermeli, bu girdi `docs/audits/` ile başlamalı ve `.md` ile bitmeli; `scope.directories` kaynak kodu dizini içermemeli.
- Örnek: T-152-016 ADR Compliance Scan, T-001 Workflow Verify.
- Rubrik: `AUDIT_RUBRIC` — `audit_completeness`, `finding_count`, `citation_density`, `migration_triage`.
- EffectClass: `pure` (sadece okuma + rapor yazma).

**`document-write`** — `docs/` altında (ancak `docs/audits/` dışında) bir veya birden fazla markdown belgesi üreten görevler.
- Tespit kuralı: Tüm `scope.filesWrite` girdileri `docs/` ile başlamalı ve `.md` ile bitmeli; hiçbiri `docs/audits/` ile başlamamalı; kaynak dizin içermemeli.
- Örnek: ADR draft yazma, ROADMAP güncelleme, sprint retrospective belgesi.
- Rubrik: `DOC_WRITE_RUBRIC` — `correctness`, `word_count`, `scope_compliance`, `documentation_quality`.
- EffectClass: `reversible` (git restore ile geri alınabilir).

**`code-development`** — Yukarıdaki kriterlere uymayan tüm görevler (varsayılan).
- Tespit kuralı: `audit` veya `document-write` kategorisine girmeyen her görev.
- Kapsam: kaynak kodu değişikliği, test yazma, refactoring, konfigürasyon değişikliği.
- Rubrik: `CODE_RUBRIC` — `correctness`, `test_coverage`, `scope_compliance`, `documentation`.
- EffectClass: `reversible` (çalışma ağacı değişiklikleri, git ile geri alınabilir).

### Tespit Önceliği

```
audit (ilk eşleşme kazanır)
  ↓ hayır
document-write
  ↓ hayır
code-development (varsayılan)
```

`audit`, `document-write`'tan önce değerlendirilir çünkü denetim raporları da `docs/` altında yaşar; ancak daha katı bir şekle sahiptir (tek dosya, `docs/audits/` prefix).

### Tek Kaynak Prensibi

`rubric-registry.ts` bu taxonominin **tek doğruluk kaynağı** olacak. `task-router.ts:45`, `adr-selector.ts:45` ve `task-analyzer.ts:4` içindeki çakışan `TaskType` tanımları `rubric-registry.ts`'ten re-export ile hizalanacak veya kendi spesifik alanlarını koruyan ama birbiriyle çakışmayan ayrı tipler olarak adlandırılacak. Bu çakışma ADR-008 (tek yönlü bağımlılık) ihlali riski taşımaktadır; yeniden yapılandırma ayrı bir sprint task olarak planlanmalıdır.

### Extensibility Roadmap

Mevcut üç tip temel bir taxonomiyi temsil eder. Aşağıdaki tipler **gelecek sprint'lerde** eklenebilir:

| Gelecek TaskType | EffectClass | Rubrik Odağı | Öncelik |
|---|---|---|---|
| `db-migration` | `idempotent` | migration atomicity, rollback plan | Sprint 162 |
| `package-publish` | `critical-irreversible` | publish gate, version bump, changelogs | Sprint 163 |
| `infrastructure-provision` | `compensable` | IaC diff, rollback script, approval gate | Sprint 165 |
| `security-patch` | `reversible` | CVE fix correctness, regression coverage | Sprint 162 |

Her yeni tip şu genişletme noktalarını güncellemelidir:
1. `TaskType` union (`rubric-registry.ts`)
2. `RUBRIC_REGISTRY` kaydı
3. `EFFECT_CLASS_REGISTRY` kaydı
4. `isXxxTask()` tespit fonksiyonu

Bu dört nokta `rubric-registry.ts` içinde bir arada tutulduğundan, değişim lokal kalır ve sürünüm (drift) riski düşer.

### ADR-053 ile İlgili Enforcement

Sprint 156 T-009 (`assertSpawnSafe`) ve T-010 (Runtime File Lock) güvenlik katmanları; task tipine duyarlı kararlar alabilmek için `detectTaskType()` fonksiyonunu çağırabilir. Örneğin, `critical-irreversible` tipinde bir task spawn edilmeden önce ADR-037 RBAC gereği Alperen onayı alınmalıdır.

---

## Consequences

### Olumlu

- **Yanlış NO_GO oranı düşer.** Audit ve doküman görevleri artık uygulanamaz kriterleri (coverage) taşımayan rubriklerle değerlendiriliyor. Sprint 154 Bug B'nin tekrarlanması engellendi.
- **Routing doğruluğu artar.** Agent seçimi (ADR-041), skill routing (ADR-015) ve ADR önerileri (`adr-selector.ts`) artık daha kesin bir tip üzerinden çalışabilir.
- **Genişletilebilirlik.** Yeni görev tipleri dört noktayı güncelleyerek eklenir; mevcut kodu bozmaz.
- **Güvenlik.** `RUBRIC_REGISTRY` ve `EFFECT_CLASS_REGISTRY` `Object.freeze()` ile korunur; runtime mutasyonu engellenir. Bu, bir worker'ın kendi tipini `critical-irreversible`'dan `reversible`'a düşürerek onay geçidini atlamasını önler.
- **Gözlemlenebilirlik.** `detectTaskType()` dönüş değeri sprint metriklerine ve audit loglarına eklenebilir; hangi görevlerin hangi tipte değerlendirildiği izlenebilir.

### Olumsuz

- **Sınır vakaları belirsiz.** `isAuditTask()` kuralları katıdır (tek dosya, `docs/audits/`). Hybrid bir görev (hem kaynak kodu hem de audit raporu) `code-development` olarak sınıflandırılır ve audit_completeness değerlendirilmez. Bu durum scope ayrımını zorunlu kılar — ama bu zaten ADR-034 Multi-Project Isolation ile uyumludur.
- **Mevcut `TaskType` çakışmaları.** `task-router.ts:45` (`'code' | 'test' | 'doc' | 'design' | 'unknown'`) ve `adr-selector.ts:45` kendi tip tanımlarını korur. Hizalama ayrı bir task gerektirir; şimdilik `rubric-registry.ts` yetki alanı yalnızca değerlendirme katmanı ile sınırlıdır.
- **Tespit, scope shape'e bağlı.** Başlık veya açıklama metninden değil `scope.filesWrite` ve `scope.directories` örüntülerinden tespit yapılır. Bu gaming-proof olmayı sağlar; ancak yanlış scope tanımlamaları (Brain planning hatası) yanlış tip tespitine yol açabilir. ADR-036 validation, scope'u DIRECTIVES'e karşı doğrulamalıdır.

---

## Related ADRs

- **ADR-015** — TaskRouter Module: mevcut `task-router.ts` içindeki `TaskType` bu ADR ile hizalanacak.
- **ADR-035** — Verification Protocol: `CODE_VERIFY_REQUEST` kanalının tetiklenmesi task tipine göre farklılaşabilir (audit task'lar için kod doğrulaması anlamsız).
- **ADR-037** — RBAC: `critical-irreversible` EffectClass → Alperen onay gating.
- **ADR-041** — Agent Taxonomy: Horizontal skill seçimi task tipine göre filtrelenebilir (doc görevleri için `testing-expert` önerme).
- **ADR-055** — Hybrid Scoring Pipeline (proposed): Bu ADR'nin TaskType'ları Hybrid Scoring'in Layer 1 (Schema) ve Layer 4 (Outcome) katmanlarına girdi sağlar.
- **Karpathy 4-Discipline Anchor** (`.claude/rules/karpathy-discipline.md`, Sprint 191 eklendi): Worker agent'ların her TaskType'ı *nasıl* yürüttüğünü belirleyen execution-time disiplin kuralları. TaskType sınıflandırması Brain tarafından (plan-time), 4-discipline uygulaması Worker tarafından (execute-time) yapılır — iki katman tamamlayıcıdır. Her TaskType için vurgu farklılıkları:
  - **`audit`**: Discipline 1 (Think-first: `scope.filesRead` listesindeki kaynak dosyalar rapor yazmadan önce tamamen okunmalı), Discipline 3 (Surgical: tek output dosyası constraint'i, izin verilmemiş dosyaya yazma → otomatik Auditor flag), Discipline 4 (Goal-Driven: her bulgu goCriteria'daki audit kriteri ile birebir eşlenmeli, izlenemeyen bulgu notta not edilmeli).
  - **`document-write`**: Discipline 1 (Think-first: içerik yapısı taslak olarak planlanmalı), Discipline 2 (Simplicity-First: talep edilmeyen bölüm veya ek dosya eklenmemeli — YAGNI), Discipline 4 (Goal-Driven: her başlık ve paragraf goCriteria doküman kalitesi kriteriyle eşlenmeli).
  - **`code-development`**: Tüm 4 discipline eşit ağırlıkla uygulanır; Discipline 3 (Surgical Changes) özellikle kritik — `scope.filesWrite` sınırı dışına çıkmak Auditor tarafından `git diff --stat` ile otomatik tespit edilir ve sprint NO_GO'ya yol açabilir.

---

## Notes

Bu ADR, `rubric-registry.ts` içinde `Sprint 154 Bug B fix` olarak hayata geçirilen uygulamanın geriye dönük belgelenmesidir. Uygulama önce yazıldı; ADR, tasarım kararlarını geç de olsa kayıt altına almaktadır. Sprint 156 dogfood pratiğine göre bu geç-ADR pattern'i kabul edilebilir — ancak ileride tercih edilen sıra şudur: ADR draft → Sprint task → Implementation.

> **Note (verified vs code → status promoted, Sprint 172):** Çekirdek taxonomy **shipped & kod-doğrulandı** (ADR-042 emsali): `src/orchestra/rubric-registry.ts:21` `TaskType = 'audit' | 'document-write' | 'code-development'`; `AUDIT_RUBRIC`/`DOC_WRITE_RUBRIC`/`RUBRIC_REGISTRY` `Object.freeze` (`:92-95`); `isAuditTask`/`detectTaskType` öncelik `audit → document-write → code-development` (`:166-169`) §Tespit Önceliği ile birebir. Bu nedenle status **proposed → accepted** (governance-onaylı). **Deferred/unrealized (gövde gelecek-zamanlı kalmıştır):**
> - **Extensibility Roadmap** tablosundaki hedef sprint'ler (db-migration/security-patch Sprint 162, package-publish Sprint 163, infrastructure-provision Sprint 165) **geçti ve gerçekleşmedi** — Sprint 172 itibarıyla hâlâ 3 temel tip; gelecek tipler yalnız `rubric-registry.ts:272-273`'te "reserved for future" yorumu olarak durur. Roadmap niyet-beyanıdır, taahhüt değil.
> - **Tek Kaynak Prensibi** uygulanmadı: `task-router.ts:45` (`'code'|'test'|'doc'|'design'|'unknown'`) ve `adr-selector.ts:45` çakışan `TaskType` tanımları Sprint 172'ye dek hâlâ bağımsızdır (ADR §Olumsuz bunu zaten kendi flag'ler — `rubric-registry.ts` yetkisi yalnız değerlendirme katmanıyla sınırlı kalır).
>
> Memory'deki taxonomy-vision (ADR-053/055/060 taslak seti) bağlamı korunur; yalnız ADR-053'ün **doğrulanmış çekirdeği** accepted'a alındı, geniş vizyon kapsamı değil. Behavior unchanged; documentation alignment only.

> **Amendment — Sprint 191 (Karpathy cross-reference):** Sprint 191 Worker Discipline Anchor projesi `.claude/rules/karpathy-discipline.md` dosyasını ve `worker-default.md` Karpathy 4-Discipline Anchor bölümünü ekledi. Bu ADR, execute-time disiplin kurallarının **plan-time** tamamlayıcısıdır: ADR-053 *hangi* rubrikle değerlendirileceğini belirler (Brain sorumluluğu, plan-time), Karpathy 4-discipline *nasıl* yürütüleceğini belirler (Worker sorumluluğu, execute-time). §Related ADRs'e Karpathy Anchor referansı eklendi. Behavior unchanged; no code change.


---

## adr-055: Hybrid Scoring 5-Layer Pipeline — Schema / Gates / Quality / Outcome / Auditor

**Status:** proposed

# ADR-055: Hybrid Scoring 5-Layer Pipeline — Schema / Gates / Quality / Outcome / Auditor

**Status:** proposed

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-12

**Sprint:** Sprint 156

---

## Status

proposed (Sprint 156 — EffectClass seed implementasyonu T-011'de tamamlandı; tam pipeline ayrı sprint'e bırakıldı)

---

## Context

Deckent'in değerlendirme sistemi Sprint 139'a kadar `result-evaluator.ts` içindeki tek bir `DEFAULT_RUBRIC` etrafında yapılandırılmıştı. Bu rubrik dört kriter içeriyordu: `correctness`, `test_coverage`, `scope_compliance`, `documentation`. Basit ve tahmin edilebilirdi, ancak birkaç sistemsel sorunun kaynağıydı:

**Sprint 153 ve Sprint 154 Bug B:** Audit raporları ve doküman yazma görevleri `test_coverage: null` döndürüyordu. Rubrik bu alanı zorunlu sayıyordu. Sonuç: geçerli çıktılar üretilmesine rağmen `NO_GO` kararı. ADR-053 (TaskType Taxonomy) bu hatayı rubriği görev tipine göre seçerek giderdi — ancak bu düzeltme değerlendirmenin **şeklini** değiştirdi, **derinliğini** değil.

**Tek katmanlı değerlendirmenin kör noktaları:**
1. **Schema geçersizliği önceden yakalanmıyor.** Bir `.result` dosyası eksik alan içeriyorsa değerlendirme skoru hesaplanmaya çalışır, ancak anlamsız bir skora ulaşır. Schema doğrulaması skorlamadan önce yapılmalıydı.
2. **Gate koşulları yoktu.** Bazı durumlar sayısal skor olmaksızın kesin `NO_GO` gerektiriyordu: scope ihlali, ADR compliance hatası, heartbeat zaman aşımı. Bu koşullar rubrik içinde `0` ağırlıklı kriterler olarak temsil ediliyordu — doğru yapı değildi.
3. **EffectClass (reversibility) skor üzerinde etkisi yoktu.** `critical-irreversible` görevler daha yüksek `correctness` eşiği veya zorunlu Auditor doğrulamasına tabi olmalıydı; ancak tek rubrik bunu ifade edemiyordu.
4. **Auditor ve Brain bağımsız değerlendirme yapıyordu.** Auditor kendi scan sonuçlarını `.dashboard` dosyasına yazıyordu; Brain ise yalnızca `.result` dosyasını okuyordu. İki perspektif birleştirilmiyordu.
5. **Outcome verisi geri besleme döngüsüne girmiyordu.** Görev tipine ve EffectClass'a göre geçmiş outcome verileri (başarı oranı, token kullanımı) değerlendirmeyi etkileyen bir sinyal olabilirdi.

Bu sorunların toplamı, değerlendirmenin yüzeysel kaldığını ve gerçek görev kalitesini her zaman doğru yansıtmadığını ortaya koydu. Daha derin, çok katmanlı bir değerlendirme altyapısına ihtiyaç vardı.

---

## Decision

**5-katmanlı Hybrid Scoring Pipeline** tasarlanır. Her katman girdiye bağımsız olarak çalışır ve kendi kararını `PipelineLayerResult` olarak üretir:

```
Layer 1: Schema Validation
  ↓ PASS / FAIL (hard gate)
Layer 2: Gate Conditions
  ↓ PASS / BLOCK (hard gate)
Layer 3: Quality Scoring
  ↓ numeric score [0–100]
Layer 4: Outcome Weighting
  ↓ weighted score [0–100]
Layer 5: Auditor Verification
  ↓ auditor signal (optional, async)
       ↓
  Final Decision: DONE / GO_WITH_TECH_DEBT / NO_GO
```

### Katman 1 — Schema Validation

Her `.result` dosyası önce JSON schema'ya karşı doğrulanır. Eksik zorunlu alanlar (`taskId`, `selfAssessment`, `filesChanged`, `tokenUsage`) pipeline'ı durdurur ve doğrudan `NO_GO` döndürür. Bu doğrulama zaten Sprint 155'te `validateResultSchema()` fonksiyonu ile hayata geçirilmiştir — ADR-055 bu davranışı resmen Layer 1 olarak sınıflandırır.

```typescript
interface Layer1Result {
  pass: boolean;
  missingFields: string[];
  invalidFields: { field: string; reason: string }[];
}
```

### Katman 2 — Gate Conditions

Sayısal skorla ifade edilemeyen ikili (binary) koşullar burada değerlendirilir. Bir gate başarısız olursa pipeline `NO_GO` döndürür; skora ulaşılmaz.

| Gate ID | Koşul | Kaynak |
|---------|-------|--------|
| `G-001` | Scope ihlali yok (`git diff --stat` scope dışı dosya içermemeli) | Auditor scan |
| `G-002` | ADR compliance: görev sonucu kabul edilmiş ADR'yi ihlal etmemeli | `adr-validator.mjs` |
| `G-003` | Heartbeat timeout aşılmamış | `.hb` dosya timestamp |
| `G-004` | Self-modifying task tespiti negatif | `self-modifying-detector.ts` |
| `G-005` | `critical-irreversible` EffectClass için Alperen onayı alınmış | Checkpoint mechanism |

```typescript
interface Layer2Result {
  pass: boolean;
  blockedByGates: string[];   // gate IDs that failed
  gateDetails: Record<string, string>;
}
```

### Katman 3 — Quality Scoring

ADR-053 tarafından belirlenen görev tipine uygun rubrik (CODE_RUBRIC, AUDIT_RUBRIC, DOC_WRITE_RUBRIC) uygulanır. Mevcut `result-evaluator.ts` mantığı bu katmana karşılık gelir.

```typescript
interface Layer3Result {
  score: number;          // 0–100
  passingScore: number;
  rubricId: 'code' | 'audit' | 'doc-write';
  criteriaBreakdown: Record<string, number>;
}
```

### Katman 4 — Outcome Weighting

EffectClass ve görev tipi bazlı geçmiş outcome verileri (başarı oranı, ortalama retry sayısı) ağırlık çarpanı olarak uygulanır. Bu katman Layer 3 skorunu yukarı veya aşağı çeker:

- `critical-irreversible` görevler: passingScore eşiği 70 → 85 yükseltilir.
- `pure` (audit) görevler: passingScore eşiği 70 → 65 düşürülebilir (no-retry semantics).
- Geçmiş 5 sprint ortalama başarı oranı < %50 olan agent: skor × 0.9 çarpanı.

```typescript
interface Layer4Result {
  adjustedScore: number;    // Layer 3 score × weight
  adjustedThreshold: number;
  effectClass: EffectClass;
  outcomeModifier: number;  // multiplier applied
}
```

### Katman 5 — Auditor Verification (Asenkron)

Auditor'ın bağımsız scan sonuçları (`.dashboard` dosyası) Layer 4 kararını onaylayabilir veya veto edebilir. Bu katman asenkron ve opsiyoneldir; Auditor sonucu zamanında gelmezse varsayılan olarak Layer 4 kararı korunur.

```typescript
interface Layer5Result {
  auditorSignal: 'confirm' | 'veto' | 'absent';
  auditorNotes?: string;
  finalDecision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
}
```

### Final Decision Matrisi

```
Layer1 FAIL              → NO_GO (schema invalid)
Layer2 BLOCK             → NO_GO (gate violated)
Layer4 adjustedScore ≥ adjustedThreshold:
  + Layer5 confirm/absent → DONE
  + Layer5 veto           → GO_WITH_TECH_DEBT
Layer4 adjustedScore < adjustedThreshold:
  + delta < 10            → GO_WITH_TECH_DEBT
  + delta ≥ 10            → NO_GO
```

### Uygulama Yolu

Sprint 156'da yalnızca **seed** tamamlandı:
- Layer 1: `validateResultSchema()` (`result-evaluator.ts`) — canlı
- Layer 3: ADR-053 TaskType rubric selection — canlı
- Layer 4 girdi: `EffectClass` (`rubric-registry.ts` T-011) — canlı

Tam pipeline entegrasyonu Sprint 157+ roadmap:
- `src/orchestra/scoring-pipeline.ts` — yeni modül
- `runScoringPipeline(task, result, auditorSnapshot): ScoringPipelineResult`
- `result-evaluator.ts` yeniden düzenleme: `evaluateResult()` → pipeline çağrısı

---

## Consequences

### Olumlu

- **Daha az yanlış NO_GO.** Schema ve gate katmanları sayısal skor hesaplanmadan önce açık ihlalleri yakalar; rubrik puanlamayı anlamsız vakaların üzerine uygulama riskini ortadan kaldırır.
- **EffectClass entegrasyonu.** `critical-irreversible` görevler artık yüksek eşikle ve zorunlu onay gapıyla değerlendirilir. ADR-037 RBAC ile uyumlu.
- **Auditor-Brain entegrasyonu.** İki bağımsız perspektif (Brain değerlendirmesi + Auditor scan) birleştirilerek daha güvenilir kararlar üretilir. ADR-035 doğrulama protokolü bu birleşimi zaten öngörüyordu.
- **Genişletilebilirlik.** Yeni gate koşulları (`G-006`, ...) pipeline'a eklenir; mevcut rubrik değişmez. Yeni katmanlar (Layer 6: ML scoring) ileride eklenebilir.
- **Gözlemlenebilirlik.** Her katman kendi `PipelineLayerResult`'ını üretir; sprint metriklerine her katmanda hangi kararın verildiği kaydedilebilir. "Layer 2'de bloklanan task sayısı" gibi metrikler NO_GO sebeplerini ayrıştırır.

### Olumsuz

- **Pipeline gecikmesi.** 5 katmanın ardışık çalışması değerlendirme süresini artırır. Layer 5 (async Auditor) bekleme süresi sprint toplam süresini uzatabilir. Timeout mekanizması zorunlu.
- **Karmaşıklık artışı.** `result-evaluator.ts`'in tek-fonksiyon yapısından pipeline mimarisine geçiş test yükümlülüğü doğurur. Her katmanın birim testi yazılmalıdır.
- **Gate G-005 (Alperen onayı) bloklama riski.** `critical-irreversible` görevlerde Alperen cevap vermezse sprint donar. Timeout + fallback (GO_WITH_TECH_DEBT + onay kuyruğu) tasarlanmalıdır.
- **Outcome verisi bootstrap sorunu.** Layer 4 geçmiş başarı oranlarına güvenir; ancak yeni bir agent veya görev tipi için bu veri yoktur. `outcomeModifier = 1.0` (nötr) başlangıç değeri ile bootstrap edilmelidir.

---

## Related ADRs

- **ADR-035** — Verification Protocol Standard: Layer 5 (Auditor Verification) bu ADR'nin `CODE_VERIFY_REQUEST` / `VERIFICATION_RESULT` kanallarını kullanır.
- **ADR-036** — ADR Governance: Layer 2 Gate G-002 (`adr-validator.mjs` entegrasyonu) bu ADR tarafından yönlendirilir.
- **ADR-037** — RBAC Protocol: Layer 2 Gate G-005 (Alperen onayı) `critical-irreversible` görevler için RBAC gate gerektirir.
- **ADR-041** — Agent Taxonomy: Layer 4 outcome weighting, agent başarı oranı verilerini `agent-pool.ts` kayıtlarından çeker.
- **ADR-053** — TaskType Taxonomy (proposed): Layer 1 ve Layer 3'e görev tipi bilgisi sağlar.

---

## Notes

Bu ADR Sprint 156 T-011 (EffectClass Annotation) çalışması sırasında ortaya çıkan mimari vizyonu belgeler. `rubric-registry.ts:197` içindeki `// ADR-055 placeholder` yorumu bu ADR'ye işaret eder. Tam uygulama Sprint 157+ roadmap kapsamındadır.

> **Note (verified vs code, Sprint 172 — `proposed` doğru statü):** Yalnız **seed** kod-doğrulandı:
> - **Layer 1** `validateResultSchema()` → `src/orchestra/result-evaluator.ts:509` mevcut (call `:992`) ✓
> - **Layer 3** ADR-053 TaskType rubric selection → `rubric-registry.ts` (ADR-053 notunda doğrulandı) ✓
> - **Layer 4 girdi** `EffectClass` → `src/orchestra/rubric-registry.ts:259` mevcut; placeholder yorumu `:220` (`EffectClass — Reversibility Tag (ADR-055 placeholder)`), `:255 @see ADR-055 (proposed, Sprint 156)` — kod kendisi `proposed` işaretler.
>
> **Çekirdek karar GERÇEKLEŞMEDİ (gövde gelecek-zamanlı kalmıştır):** `src/orchestra/scoring-pipeline.ts` **yoktur**; `runScoringPipeline` / `ScoringPipelineResult` / `PipelineLayerResult` sembolleri `src/` genelinde **hiç yoktur**. Layer 2 (Gate Conditions G-001..G-005), Layer 5 (Auditor Verification), Final Decision Matrix ve orkestrasyon katmanı uygulanmadı. "Sprint 157+ roadmap" hedefi **geçti ve gerçekleşmedi** (Sprint 172).
>
> **Statü gerekçesi (ADR-053 kontrastı):** ADR-053 terfi etti çünkü çekirdeği (3-tip taxonomy) shipped'di. ADR-055'in çekirdeği = 5-katman pipeline'ın **kendisi** ve o inşa edilmedi — yalnız çevresel seed'ler mevcut. Bu nedenle status doğru biçimde **`proposed` kalır** (terfi dürüst olmazdı). Satır drift'i: ADR `:197` → gerçek `:220`. Behavior unchanged; documentation alignment only.


---

## adr-060: Self-Awareness Propagation — 5-Channel Context Enrichment Architecture

**Status:** proposed

# ADR-060: Self-Awareness Propagation — 5-Channel Context Enrichment Architecture

**Status:** proposed

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-12

**Sprint:** Sprint 156

---

## Status

proposed (Sprint 156 — kanal 5 (worker-enrichment) T-007 ile seed edildi; tam mimari ayrı sprint'e planlandı)

---

## Context

Deckent worker'ları görevlerini bağımsız, izole bir ortamda yürütür. Bu izolasyon kasıtlıdır — ADR-034 (Multi-Project Isolation) ve ADR-037 (RBAC) gereği. Ancak izolasyonun bir yan etkisi vardır: worker'lar proje bağlamından habersiz kalabilir. Bu durum çeşitli sprint'lerde gözlemlenen aşağıdaki sorunların kaynağıdır:

**1. Agent Alignment Drift (Sprint 145–153 boyunca gözlemlendi):** Worker'lar mimari kararlar (ADR'ler) hakkında bilgilendirilmese, uyguladıkları çözümler kabul edilmiş ADR'leri ihlal edebilir. Örneğin, worker `shell: true` kullanarak bir komut çalıştırabilir ve ADR-006 ihlali yaratabilir. Sprint 138'de ADR yönetimi çerçevesi (`queryRelevantADRs()` + `prompt-god-template.ts` "Mandatory Architecture Rules" bloğu) bu sorunun bir kısmını çözdü — ancak bağlam enjeksiyonu yalnızca ADR katmanıyla sınırlı kaldı.

**2. Bağımlılık Sonuçlarının Bilinmezliği (Sprint 135–139 boyunca):** Worker T-002, T-001'in sonucundan haberdar değildi. Sprint 135 T-005 (Planner Priority/Dependencies) ve Sprint 134 T-001 (Task Dependency Pipeline) bağımlılık zincirini pipeline düzeyinde kurdu; ancak T-002 worker'ının prompt'unda T-001'in *ne yaptığı* yer almıyordu. Yalnızca "T-001 tamamlandı" bilgisi vardı. Bu eksiklik Sprint 156 T-007 (Worker Prompt Previous-Result Enrichment) ile giderildi.

**3. Skill ve Agent Bağlamının Parçalı Aktarımı:** Skill seçimi (`selectSkills()`), agent seçimi (`selectAgent()`) ve ADR enjeksiyonu ayrı ayrı fonksiyonlarda gerçekleşiyor, her biri prompt'un farklı bir bölümüne yazıyor. Sonuçta worker prompt'u birbiriyle ilişkili ama koordine edilmemiş bağlam parçalarından oluşuyor. Worker, "Bu skill neden seçildi?" veya "Önceki sprint'teki benzer görevde ne oldu?" bilgisine erişemiyor.

**4. Manifest Uyumsuzluğu.** Worker'ların hangi agent ve skill versiyonunu kullandığını bilmemesi, manifest güncellemesi sonrasında ortaya çıkan uyumsuzlukları Sprint 148'de gözlemlendiği gibi yakalamayı güçleştirdi. Spawn zamanında agent manifest snapshot'ı worker prompt'una eklenseydi, worker beklenen API'yi ve değişiklikleri daha iyi yorumlayabilirdi.

**5. Self-Awareness Eksikliği.** "Self-awareness" terimi burada şu anlama gelir: worker'ın yalnızca kendi görevini değil, görevinin bulunduğu *bağlamı* — sprint kimliği, seçilen agent, seçilen skill'ler, ilgili ADR'ler, bağımlılık sonuçları — bilmesi. Bu bağlam eksikliği, worker'ların tekrarlayan hatalara düşmesine ve Brain'in fazladan FIX döngüsü çalıştırmasına neden olmaktaydı.

Mevcut `prompt-god-template.ts` içindeki `buildHeader()`, `buildAgentBlock()`, `buildSkillBlock()`, `buildDependenciesBlock()`, `buildADRBlock()` fonksiyonları bu bağlam enjeksiyonunu kısmen çözüyor. Ancak koordineli bir mimari eksik. Bu ADR, bağlam yayılımını beş kanalda organize eden bir çerçeve tanımlar.

---

## Decision

**Self-Awareness Propagation Architecture** — 5 kanal tanımlanır. Her kanal farklı bir bağlam tipini worker prompt'una taşır. Kanallar `prompt-god-template.ts` içinde `buildWorkerContext()` çatı fonksiyonu altında koordine edilir:

```typescript
interface WorkerContextBundle {
  channel1_init:         InitChannel;
  channel2_sync:         SyncChannel;
  channel3_manifest:     ManifestChannel;
  channel4_skill_declare: SkillDeclareChannel;
  channel5_enrichment:   EnrichmentChannel;
}

async function buildWorkerContext(task: Task, sprintId: string): Promise<WorkerContextBundle>
```

### Kanal 1 — Init Channel (Sprint + Task Identity)

Worker'ın kim olduğunu ve nerede çalıştığını aktarır.

**İçerik:**
- Sprint kimliği ve numarası (`sprint-156`)
- Task kimliği ve başlığı
- Seçilen model ve effort seviyesi
- Scope tanımı (directories, filesRead, filesWrite)
- GO/NO-GO kriterleri

**Mevcut durum:** `buildHeader()` fonksiyonu bu bilgilerin büyük bölümünü zaten üretiyor. ADR-060, bu fonksiyonun "Kanal 1 sorumluluğu" olduğunu resmen belirler.

**Yeni eklenti:** Sprint kimliğinden türetilen `sprint_sequence_number` (ör. sprint-156 → 156) ve bu sprint'teki görev sırası (ör. "15 task'tan 7.si") worker'a sprint'teki yerini gösterir.

### Kanal 2 — Sync Channel (ADR + Memory Snapshot)

Projenin geçmiş mimari kararlarını ve ilgili sprint öğrenmelerini aktarır.

**İçerik:**
- İlgili ADR'ler (zaten `queryRelevantADRs()` + `buildADRBlock()` ile yapılıyor)
- İlgili sprint learnings (hafıza DB'sinden `searchMemory()` ile)
- Aktif teknik borç maddeleri (görevle ilişkili olanlar)

**Mevcut durum:** ADR enjeksiyonu Sprint 138'de hayata geçti. Öğrenim ve borç snapshot'ı opsiyonel. ADR-060 bu bağlamı zorunlu hale getirir.

**Yeni eklenti:** `sprint_learning_digest` — son 3 sprint'teki benzer görevlerin sonuçlarından çıkarılan 3–5 cümlelik özet.

### Kanal 3 — Manifest Channel (Agent + Skill Version Snapshot)

Görev için seçilen agent ve skill'lerin anlık versiyonlarını aktarır.

**İçerik:**
- Agent tanımı: isim, versiyon, uzmanlık özeti
- Her skill için: isim, kapsam, son güncellenme tarihi
- Agent/skill uyumsuzluğu uyarıları (manifest checksum mevcut versiyonla eşleşmiyorsa)

**Mevcut durum:** `buildAgentBlock()` ve `buildSkillBlock()` prompt içeriğini yazıyor; ancak versiyon ve checksum bilgisi dahil değil.

**Yeni eklenti:** `manifest_checksum` alanı — spawn zamanındaki agent.json hash değeri. Worker bunu bilirse, manifest güncellemesini fark edebilir ve Not uygulanamaz durumlarda Brain'i uyarabilir.

### Kanal 4 — Skill Declare Channel (Active Skill Instructions)

Seçilen skill'lerin tam içeriğini aktarır (önceden kısmen yapılıyor).

**İçerik:**
- Her skill'in tam `SKILL_PROMPT` içeriği
- Skill prioritization: çakışan talimatlar için öncelik sırası
- Anti-pattern listesi: bu skill'i kullanan worker'ların önceki sprint'lerde yaptığı yaygın hatalar

**Mevcut durum:** Skill içerikleri `buildSkillBlock()` ile zaten ekleniyor. ADR-060, anti-pattern listesini yeni bir eklenti olarak tanımlar.

**Yeni eklenti:** `skill_anti_patterns` — `outcome-tracker.ts` kayıtlarından çıkarılan, bu skill ile yapılan yaygın hatalar listesi. Ör: "react-specialist skill kullanırken 3 sprint boyunca `useEffect` cleanup eksikliği gözlemlendi."

### Kanal 5 — Enrichment Channel (Dependency Result Propagation)

Bağımlılık görevlerinin sonuçlarını aktarır.

**İçerik:**
- Her bağımlılık task'ı için `.result` dosyasından `selfAssessment`, `filesChanged`, `notes` alanları
- Bağımlılık tamamlanmamışsa: "Beklemede (henüz tamamlanmadı)"
- Bağımlılık NO_GO ise: NO_GO sebebi ve önerilen çözüm

**Mevcut durum:** Sprint 156 T-007 (Worker Prompt Previous-Result Enrichment) bu kanalı hayata geçirdi. `buildDependenciesBlock()` fonksiyonu güncellendi: artık yalnızca task ID listesi değil, her bağımlılığın `.result` içeriği embed ediliyor.

**Format örneği:**
```markdown
## Dependency 154-001 (DONE)
- Files: src/orchestra/rubric-registry.ts (+196 satır)
- Self-assessment: DONE
- Notes: TaskType taxonomy oluşturuldu. audit/document-write/code-development tipleri ve rubric registry.
```

### Koordinasyon

Tüm kanallar `buildWorkerContext()` içinde birleşir ve tek bir `WorkerContextBundle` nesnesi döndürülür. Bu nesne `spawn-backend-docker.ts` ve `spawn-backend.ts` içinde kullanılarak final worker prompt'u oluşturulur. Token bütçesi aşılırsa (max context window) kanallar öncelik sırasına göre kısaltılır:

```
1 → 2 → 3 → 4 → 5  (öncelik sırası: 1 en yüksek)
Kanal 5 (enrichment) en büyük ve en ilk kesilendir.
```

---

## Consequences

### Olumlu

- **Alignment drift azalır.** Worker'lar ADR'leri, geçmiş öğrenmeleri ve önceki bağımlılık sonuçlarını bilerek çalışır. Sprint 154 boyunca gözlemlenen tekrarlayan hataların önemli bir kısmı bağlam eksikliğinden kaynaklandı.
- **FIX döngüsü sayısı düşer.** Daha zengin bağlam, ilk denemede daha iyi çıktı anlamına gelir. Sprint sonuçlarında FIX → DONE oranı izlenerek doğrulanabilir.
- **Manifest uyumsuzluğu erken yakalanır.** Kanal 3 sayesinde worker, kullandığı agent'ın beklenmedik şekilde güncellendiğini görebilir ve Brain'i uyarabilir.
- **Skill anti-pattern öğrenmesi döngüsel hale gelir.** Her sprint'te `outcome-tracker.ts` yeni anti-pattern verisi üretir; kanal 4 bunu sonraki worker'lara iletir. Bu öğrenme döngüsü ADR-036 (ADR governance) ile uyumludur.

### Olumsuz

- **Prompt token maliyeti artışı.** 5 kanal, mevcut prompt boyutuna önemli bir ek yük getirir. Kanal 5 (dependency enrichment) özellikle büyük olabilir — 10+ bağımlılıklı bir görevde potansiyel olarak binlerce token. Token bütçesi yönetimi ve kanal önceliklendirmesi zorunlu.
- **Uygulama süresi.** Tam 5-kanal entegrasyonu `prompt-god-template.ts`'in yeniden yapılandırılmasını gerektiriyor. Sprint 156 yalnızca Kanal 5'i tamamladı; kalan kanallar Sprint 157+ roadmap.
- **Anti-pattern veri kalitesi.** Kanal 4 anti-pattern verisi `outcome-tracker.ts` kayıtlarına bağımlı. Erken sprint'lerde veri yetersiz olacak; anti-pattern listesi boş döner. Bu durumda kanal 4 gürültü değil sessizlik üretmeli.
- **Manifest checksum false-positive riski.** Kanal 3 checksum eşleşmezliği uyarı üretir; ancak her güncelleme gerçek bir uyumsuzluk değildir (ör. JSDoc güncellemesi). Uyarı seviyesi "warning" olmalı; "block" olmamalı.

---

## Related ADRs

- **ADR-007** — SpawnOptions Interface: `buildWorkerContext()` sonucu spawn options aracılığıyla worker'a iletilir.
- **ADR-035** — Verification Protocol: Kanal 2 (Sync) öğrenme snapshot'ı, `CODE_VERIFY_REQUEST` kanalı hakkında worker'a önceki deneyimleri aktarabilir.
- **ADR-036** — ADR Governance: Kanal 2 zorunlu ADR enjeksiyonunu formalize eder; `queryRelevantADRs()` bu kanalın uygulamasıdır.
- **ADR-041** — Agent Taxonomy: Kanal 3 (Manifest) agent seçim gerekçesini ve versiyon bilgisini aktarır.
- **ADR-053** — TaskType Taxonomy (proposed): Kanal 1 (Init) görev tipini aktarır; kanal 4 bu tipe özgü anti-pattern verisi içerebilir.
- **ADR-055** — Hybrid Scoring Pipeline (proposed): Kanal 1 ve 2'deki bağlam bilgisi, Layer 4 (Outcome Weighting) ve Layer 5 (Auditor) skorlamaya girdi sağlar.

---

## Notes

"Self-awareness" terimi bilerek seçilmiştir ve şu anlamı taşır: worker'ın yalnızca görevini değil, görevinin sistemdeki *yerini* bilmesi. Bu kavramsal çerçeve ADR-040 (Nervous System Architecture) ile örtüşür — nervous system sistemin genel durumunu izlerken, self-awareness kanalları bu bilgiyi görev düzeyinde yayar.

Sprint 156 T-007'nin tamamlanması Kanal 5'in canlıya alındığını kanıtlar. Kalan 4 kanal (özellikle Kanal 1 için sprint_sequence_number ve Kanal 3 için manifest_checksum) Sprint 157 ADR consolidation sprint'inde hayata geçirilecektir.

> **Note (verified vs code, Sprint 172 — `proposed` doğru statü):** Yalnız **seed + mevcut bağımsız builder'lar** kod-doğrulandı:
> - **Kanal 5 seed (Sprint 156 T-007) GERÇEK:** `src/orchestra/prompt-god-template.ts:93` `buildDependenciesBlock(task.dependencies, ctx.dependencies, ctx.tasksDir)`; `:223-238` `.tasks/task-{id}.result` okuyup `selfAssessment` vb. embed eder — §Kanal 5 "Mevcut durum" ile birebir ✓.
> - Önceden var olan builder'lar mevcut: `buildAgentBlock` (`:124`), `buildSkillBlock` (`:131`), `buildDependenciesBlock` (`:291`) ✓.
>
> **Çekirdek karar GERÇEKLEŞMEDİ (gövde gelecek-zamanlı kalmıştır):** Koordineli 5-kanal çatı mimarisi `buildWorkerContext()` ve `WorkerContextBundle` interface'i `src/` genelinde **yoktur** — builder'lar bağımsız çalışır, ADR'nin önerdiği koordinatör altında birleşmez. Kanal 1-4 "Yeni eklenti"leri (`sprint_sequence_number`, `manifest_checksum`, `skill_anti_patterns`) kodda **hiç yoktur**. "Sprint 157+ / Sprint 157 ADR consolidation" roadmap hedefi **geçti ve gerçekleşmedi** (Sprint 172).
>
> **Statü gerekçesi (ADR-055 ile tutarlı, ADR-053 kontrastı):** Bu ADR'nin çekirdeği = koordineli `buildWorkerContext()` mimarisi ve o inşa edilmedi — yalnız Kanal 5 seed + çevresel builder'lar mevcut. Bu nedenle status doğru biçimde **`proposed` kalır** (terfi dürüst olmazdı; ADR-053 ise çekirdeği shipped olduğu için terfi etmişti). Behavior unchanged; documentation alignment only.


---

## adr-061: AEGIS — Agentic Effect-Governed Iterative Stewardship Methodology

**Status:** proposed

# ADR-061: AEGIS — Agentic Effect-Governed Iterative Stewardship Methodology

**Status:** proposed

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-15

**Sprint:** Sprint 170 (planning phase, implementation Sprint 175-200)

---

## Status

proposed (Sprint 175 başlangıç, Sprint 200 god-level GA launch ile birlikte canonical)

---

## Context

Deckent Sprint 170 itibarıyla 14+ özgün mimari yapı içerir (Brain-Worker-Auditor 3-tier, Memory V2 SQLite FTS5, ADR Governance Integration ADR-036, RBAC Authority Matrix ADR-037, EffectClass taksonomisi, Self-Modifying Detection ADR-039, Nervous System ADR-040, TaskType Taxonomy ADR-053 (Sprint 172 accepted — çekirdek shipped), Hybrid Scoring 5-Layer ADR-055 proposed, Wave-Based Execution ADR-045, Brain Self-Update Hook ADR-046, Manuel Subagent Dispatch ADR-047, Prompt Lifecycle ADR-048, Sprint Checkpoint+Resume ADR-043, Sprint State Observability ADR-044). Bu yapılar **kompozit bir disiplin** oluşturuyor; ancak **resmi bir adı ve yayınlanabilir spesifikasyonu yok**. Topluluk + akademik dünya + enterprise pazarda Deckent'i konumlandırmak için disiplinin **tek isim altında formel manifestosu** zorunlu.

Sprint 170 öncesi yapılan kapsamlı metodoloji araştırması (4 paralel research agent, ~95 metodoloji taraması) iki temel bulgu ortaya koydu:

**Birinci bulgu — Deckent zaten convergent endüstri patternlerinin %85'ini içerir:**
Klasik SE'den (DDD strategic + Hexagonal + Lean + CQRS/Event Sourcing + TDD + Trunk-Based Development + Crystal-family + Specification by Example), AI-era patternlerinden (Generator-Critic split, Reflection+Memory, Plan-Execute-Evaluate triad, Anthropic'in Orchestrator-Worker + Evaluator/Optimizer harness'i, MetaGPT'nin role-based SOP encoding'i, Voyager'ın lifelong-learning skill library'si, Constitutional AI'ın principle-based governance'ı), Process/DevOps'tan (SRE error budgets + blameless postmortems, Toyota Production System Jidoka/Andon, Shape Up appetite-driven cycles, CNCF tiered graduation, SOX segregation of duties, OpenSSF SLSA provenance) — Deckent her birinden bir parça benimsemiş ve birleştirmiş.

**İkinci bulgu — 7 boyutta hiçbir mevcut metodoloji Deckent'i tek başına kapsamıyor:**
1. Multi-mode lifecycle discipline (kod/task/process üçlemesi) for AI agents — yok
2. Cross-session/cross-sprint institutional memory with decay + governance + FTS retrieval — Reflexion per-task only, Generative Agents per-simulation only
3. Runtime ADR governance for AI-generated decisions (Constitutional AI training-time only, Deckent runtime-enforceable)
4. Self-Modifying Task Detection (dogfood vs user project discrimination) — hiçbir framework adresiyor
5. Multi-dimensional outcome scoring beyond math/code (PRM math-only, Deckent generic)
6. Provenance manifest for AI-generated artifacts (SLSA build-only, AI provenance gap)
7. Adversarial verification at lifecycle scale (VSDD single-developer scope, Deckent multi-mode multi-agent)

Sprint 170 itibarıyla Deckent OSS GA hazırlığında. **Resmi metodoloji adı + manifestosu olmadan dış dünya Deckent'i** Cursor (IDE-agent), Devin (autonomous SWE), Hermes (life assistant), MetaGPT (multi-agent framework), VSDD (solo-dev verification) gibi mevcut kategorilere yanlış konumlandırır. AEGIS bu boşluğu doldurur — Deckent'in mevcut disiplinine resmi kimlik verir, **kategori liderliği** iddiasını mümkün kılar.

---

## Decision

**AEGIS — Agentic Effect-Governed Iterative Stewardship** Deckent'in resmi metodolojisi olarak benimsenir. AEGIS **mode-agnostic** bir disiplin: Sprint Mode (kod orkestrasyon), Task Mode (life assistant single-task), Process Mode (ERP/business süreç orkestrasyon) — üçünde de aynı çekirdek ile çalışır, mode-spesifik kalibrasyonu EffectClass dağılımı ve verification tier seçimi belirler.

### AEGIS Spesifikasyonu

#### A. 3 Mimari Katman

```
┌─────────────────────────────────────────┐
│ KATMAN 1: AWARENESS                     │
│ Nervous System (ADR-040) +              │
│ Self-Modifying Detection (ADR-039) +    │
│ Brain Self-Audit Gate +                 │
│ Sprint State Observability (ADR-044)    │
├─────────────────────────────────────────┤
│ KATMAN 2: IMPROVEMENT                   │
│ Outcome Tracker + Synergy Matrix +      │
│ Rule Evolver +                          │
│ Promotion Pipeline +                    │
│ Mid-Sprint Adapter (Fresh-Eyes) +       │
│ Quality Assessor                        │
├─────────────────────────────────────────┤
│ KATMAN 3: HEALING                       │
│ Sprint Checkpoint+Resume (ADR-043) +    │
│ Manuel Subagent Dispatch (ADR-047) +    │
│ Notification Dispatcher +               │
│ Spawn Safety + Crash Recovery           │
└─────────────────────────────────────────┘
```

Üç katman birbirine ortogonal ve her workflow'da paralel çalışır. AWARENESS kendini bilir, IMPROVEMENT kendini geliştirir, HEALING kendini onarır. Bu üçleme **AI orkestrasyon disiplininin foundational invariant'ıdır** — herhangi bir katman eksik kalırsa sistem regresyon riski taşır.

#### B. 5 Rol (Separation of Duties — SOX + Linux Foundation governance ilham)

| Rol | Sorumluluk | Yetki Sınırı |
|-----|-----------|--------------|
| **Architect** (insan) | Strategic vision, Charter (DIRECTIVES) yazımı, EffectClass critical-irreversible için onay | Stratejik karar, taktik müdahale yok |
| **Brain** (orchestrator, singleton) | Plan, route, evaluate, finalize | Asla kod yazmaz (ADR-008 single import direction) |
| **Workers** (generators, paralel N) | Code/action + property test + DbC contract üretir | scope.filesWrite STRICT (ADR-037 RBAC) |
| **Auditor** (adversary, separate process) | Adversarial verification, ADR compliance, RBAC enforcement, fresh-context critique | Asla kod yazmaz, sadece okur + skor verir |
| **Nervous** (meta-orchestrator) | Proaktif sağlık izleme, Brain'i izler, recovery proposer | Brain'i restart edebilir, kod değiştirmez |

#### C. 8 Artifact (Specification by Example + SLSA + Living Documentation birleşimi)

1. **Charter** — DIRECTIVES.md, Given/When/Then formalize edilmiş public spec
2. **Tasks** — `.tasks/*.json` + EffectClass + verification tier + mode annotation
3. **Properties** — `tests/properties/` PBT specs (fast-check or domain-specific)
4. **Contracts** — Zod schemas at module boundaries (Sprint 169 sonrası mevcut, formalize)
5. **Adversary Reports** — `.audit/<sprint>/<task>-adverse.md` (yeni)
6. **Provenance Manifest** — `.deckent/provenance/<sprint>.json` Ed25519 imzalı SLSA-style (yeni)
7. **Memory** — `.brain/memory.db` + exports (mevcut Memory V2)
8. **ADRs** — mandatory runtime constraints (mevcut ADR-036 governance)

#### D. 9 Phase Lifecycle

Mevcut Deckent 8-phase (PLAN/SPAWN/EXECUTE/EVALUATE/FIX/RETRO/DECAY/CLEANUP) **5 yenilikle** AEGIS canonical lifecycle'a evrim:

```
Phase 1: SHAPE
  - Spec by Example formalization (Given/When/Then in Charter)
  - Optional: N-planner debate (multi-agent debate at planning, Du et al 2023)
  - Error-budget gate (SRE — önceki sprint NO_GO oranı eşik aşıyorsa freeze)
  - Provenance seed

Phase 2: GOVERN  [YENİ EXPLICIT PHASE]
  - ADR compliance check (ADR-036)
  - EffectClass classification per task
  - RBAC matrix activation (ADR-037)
  - Verification tier per EffectClass

Phase 3: SPAWN
  - Worker dispatch (tmux/subprocess/Docker per ADR-027)
  - Provenance manifest update

Phase 4: EXECUTE
  - Worker writes property + impl + DbC contract
  - [YENİ] Andon authority — worker proactively raises halt (Toyota Jidoka)
  - **Karpathy 4-Discipline** worker execution contract (Sprint 191): Think-Before-Coding → Simplicity-First → Surgical-Changes → Goal-Driven-Execution (`.claude/rules/karpathy-discipline.md`). Discipline 4 (honest self-assessment + Goal-Driven Execution) = AEGIS Principle 3 (Adversarial Verification by Default) worker-side expression.
  - Heartbeat scan (Auditor)

Phase 5: ADVERSE  [YENİ EXPLICIT PHASE]
  - Fresh-context Auditor critique (VSDD Sarcasmotron pattern adopted)
  - Property + mutation + contract checks
  - Differential testing (cross-provider for compensable+ EffectClass)
  - "Zero-slop" exit criterion (VSDD inheritance)

Phase 6: EVALUATE
  - Hybrid Scoring 5-Layer (ADR-055)
  - Schema → Gates → Quality → Outcome → Auditor signal
  - Decision: DONE / GO_WITH_TECH_DEBT / NO_GO

Phase 7: REVIEW  [YENİ — Scrum Sprint Review eşdeğeri]
  - User-facing demonstration
  - Architect sees diff, decides FIX priorities
  - Distinct from internal RETRO

Phase 8: FIX
  - [YENİ alt-step] Explicit ROOT-CAUSE + 5-Whys discipline
  - Incident vs Problem distinction (ITIL inheritance)
  - ADR amendment if Problem (architectural fix)
  - Mid-Sprint Adapter rerouting (Fresh-Eyes Rotation)

Phase 9: COOL-DOWN  [YENİ — DECAY+CLEANUP+RETRO merged, Shape Up cool-down framing]
  - Sprint learnings → memory.db (Reflexion verbal RL)
  - SLSA-style provenance export (signed manifest)
  - Memory decay (existing)
  - Agent/skill promotion-pipeline (existing)
  - Lock release + archive
```

#### E. Verification Stack — EffectClass-Aware (3-Tier)

| EffectClass | Tier 1 (always) | Tier 2 (recommended) | Tier 3 (mandatory) |
|-------------|----------------|---------------------|---------------------|
| **pure** | Branded types + PBT + Zod + Stryker diff + DbC | — | — |
| **reversible** | All Tier 1 | Mutation 75+, Model-Based Testing | — |
| **idempotent** | All Tier 1 + idempotency property | Differential cross-provider | — |
| **compensable** | All Tier 1 + compensation contract DbC | Stateful PBT (do/undo invariant), canary | TLA+ if multi-component |
| **critical-irreversible** | All Tier 1, contracts non-removable | Mutation 90+, MBT, fuzz | **TLA+ specification mandatory** |

Tier 1 (~10% test runtime overhead) her sprint default. Tier 2 (~3-5 sprint deployment) yüksek risk task'larında. Tier 3 (~weeks-months investment) sadece critical-irreversible için.

#### F. Mode Applicability — Sprint / Task / Process

AEGIS üç modda da aynı çekirdek ile çalışır, mode-spesifik kalibrasyon:

| Boyut | Sprint Mode (kod) | Task Mode (life assistant) | Process Mode (ERP/business) |
|-------|-------------------|---------------------------|---------------------------|
| **EffectClass dağılımı** | %70 reversible, %25 idempotent, %5 critical-irreversible | %50 idempotent, %30 reversible, %20 compensable | %40 compensable, %30 critical-irreversible, %20 idempotent, %10 pure |
| **Verification tier modal** | Tier 1 default, Tier 2 selective | Tier 1 sufficient | **Tier 2 default, Tier 3 mandatory for critical-irreversible** |
| **Phase emphasis** | Tüm 9 faz dengeli | Phase 1-4 + Phase 9 (REVIEW/FIX skip optional) | **Phase 2 GOVERN + Phase 5 ADVERSE çift kalın** (compliance + audit trail) |
| **Charter format** | DIRECTIVES.md + Given/When/Then per task | Single-task prompt + outcome | BPMN-like business process spec + compliance metadata |
| **Provenance ağırlık** | Recommended | Optional | **Mandatory** (regulatory audit) |
| **N-planner debate** | Optional (high-effort sprint için) | Skip | **Mandatory** (financial transactions) |
| **Architect onayı** | Sadece critical-irreversible | Sadece critical-irreversible | **Her compensable+ workflow** |

Mode toggle Deckent config'de `deckent_style: sprint | task | process` (ADR-042 Hybrid Mode Architecture proposed temeli).

### AEGIS Çekirdek 8 Prensip

Manifesto-style canonical principles:

1. **Multi-Agent Separation of Duties** — Tek agent hem yazıp hem doğrulamaz. Brain plans, Worker executes, Auditor adversarially verifies. Concentration of power = anti-pattern.

2. **Effect-Aware Verification Rigor** — Bir task'ın blast radius'una orantılı doğrulama uygulanır. `pure` PBT yeterli, `critical-irreversible` TLA+ + Architect approval zorunlu.

3. **Adversarial Verification by Default** — Verification kendini doğrulayan jenerator değil, ayrı süreçteki Auditor'dur. Generator-critic separation gaming-proof discipline'ın foundation'ıdır.

4. **Runtime Governance Enforcement** — Architectural decisions (ADRs / corporate policy / regulations) plan-time'da düşünülmez, runtime'da Brain prompt enrichment + Auditor compliance check ile uygulanır.

5. **Cross-Workflow Institutional Memory** — Her workflow'un öğrenmesi memory.db'ye düşer, decay ile yaşar, FTS5 ile retrieve edilir, ADR'ye yükselir. Single-session amnezi anti-pattern.

6. **Self-* Triad Discipline** — Awareness (kendini bilme), Improvement (kendini geliştirme), Healing (kendini onarma) ortogonal katmanlardır. Üçü olmadan AI orkestrasyon production-grade olamaz.

7. **Provenance as First-Class Artifact** — Her AI-generated output `(workflow, agent, model, prompt-hash, EffectClass, timestamp)` provenance manifest'ine düşer. Ed25519 imzalı, audit-ready.

8. **Mode-Agnostic Discipline, Mode-Specific Calibration** — AEGIS Sprint/Task/Process üç modda aynı çekirdek ile çalışır. Mode-spesifik fark yalnızca EffectClass dağılımı + verification tier seçimi + phase emphasis.

---

## Consequences

### Olumlu

- **Kategori liderliği iddiası mümkün olur.** Deckent "yet another orchestrator" değil, **AEGIS-compliant ilk açık kaynak AI orkestratörü** olarak konumlanır. TDD/BDD/DDD/SDD/VDD/VSDD ailesinin doğal yeni üyesi, **mode-agnostic** olduğu için akademik + enterprise + open-source community'de **eşi olmayan konum**.

- **Multi-mode vizyonu (Sprint+Task+Process) tek metodoloji altında birleşir.** Process Mode ERP/business pivot'u (Sprint 200 god-level hedef) için **mevcut mimariye doğal eşleme**. Pazarlama tek mesaj: "AEGIS — discipline that works across code, life, and business."

- **Akademik citation kapısı açılır.** AEGIS makalesi (target venues: ICSE/FSE software engineering, NeurIPS multi-agent track) dollspace-gay/VSDD prior art credit + Anthropic agent harness + Constitutional AI runtime adaptation üzerine **yapısal katkı** olarak yayınlanabilir. Sprint 200 god-level GA için academic prestige multiplier.

- **Enterprise sales narrative netleşir.** "We use AEGIS methodology" enterprise CISO/CTO için tanıdık-ama-ileri sound. SOC 2 + ISO 27001 audit'larında verification tier mapping + provenance manifest **compliance evidence** olarak doğrudan kullanılabilir.

- **Community standard yaratma fırsatı.** agentskills.io tarzı agentaegis.io standard repo'su, AEGIS-compliant AI orchestrator certification, Deckent **standart belirleyici** rolü alır. Apache way "lazy consensus" + CNCF tiered graduation patterns AEGIS ekosistem governance'ına uyar.

- **Existing Deckent disiplini retroaktif olarak isimlenir.** Worker contract, ADR-036 governance, Auditor RBAC, EffectClass, Hybrid Scoring — hepsi AEGIS phase/role/artifact'larıyla **net eşleme**. Yeniden çalışma yok, sadece adlandırma + 5 yeni faz/gate (REVIEW + andon + 5-Whys + provenance + cool-down).

- **Hermes/Cursor/Devin/OpenClaw rakiplerinden mimari farklılaşma** AEGIS bayrağı altında somut tek mesaj: "Mode-agnostic, governance-enforced, adversarial-verified, multi-agent orchestration discipline." Hiçbir rakip bu kombinasyonu sunmuyor.

### Olumsuz

- **5 yeni faz/gate implementation maliyeti.** REVIEW phase MCP tool, Andon authority worker contract extension, 5-Whys ROOT-CAUSE alt-step, Provenance manifest schema + Ed25519 signing infrastructure, COOL-DOWN consolidation — Sprint 175-185 arası ~5 sprint implementation work, ~3000-5000 LoC.

- **Mode-spesifik kalibrasyon spec maliyeti.** Process Mode için BPMN-like Charter format + compliance metadata schema + Architect approval workflow yeni tasarım gerektirir. Sprint Mode'dan Process Mode'a port etmek mimari refactor (~Sprint 195+ vertical pilot).

- **TLA+ entegrasyonu TypeScript dünyasında zayıf.** `respawnEligibleTasks` + `detectScopeCollisions` için TLA+ spec yazımı + maintenance senior expertise + ekosistem dışı tooling. Tier 3 mandatory uygulaması gerçekten critical-irreversible task'lar için makul, ama TS-native alternative (Z3 binding + branded types) Sprint 195+ exploration gerektirir.

- **AEGIS adı brand çakışma riski.** "Aegis" yazılım ekosisteminde başka projelerde kullanılıyor (örn. AEGIS authenticator, çeşitli security ürünleri). Trademark araştırması Sprint 172 OSS GA öncesi şart. Alternatif aday isimler: MAVEN (Multi-Agent Verified Effect-aware orchestratioN), PRISM (Plan-Run-Inspect-Score-Memorize), OAGD (Orchestrated Adversarial Governance Discipline).

- **Methodology learning curve.** Deckent yeni kullanıcılar için mevcut 8-phase lifecycle bile dik öğrenme; AEGIS 9-phase + 3-layer + 5-role + 8-artifact + 8-principle daha da dik. Documentation site + tutorial + video walkthrough Sprint 172-175 paralel deliverable.

- **Multi-mode unified discipline iddiası provable mı?** Sprint Mode dogfood'u 170 sprint kanıt verdi; Task Mode + Process Mode için canlı kanıt **yok**. AEGIS spec teorik olarak mode-agnostic olsa da empirical validation Sprint 195+ ERP procurement vertical pilot ile gelecek. Önce Sprint Mode'da AEGIS-compliant pilot, sonra Task Mode (Sprint 185-190), sonra Process Mode (Sprint 195-200).

- **Self-Awareness Propagation (ADR-060 proposed) AEGIS'in 5-channel context enrichment adımıyla uyumlu mu test edilmeli.** ADR-060 + ADR-061 entegrasyonu proposed→accepted sürecinde paralel review.

---

## Implementation Roadmap

### Phase 0: Pre-Implementation (Sprint 170-174)
- ADR-061 review + accept (Architect onayı)
- Brand/trademark araştırması (AEGIS vs alternatif isimler)
- Manifesto draft + landing page mockup
- Documentation site structure planning

### Phase 1: Foundation (Sprint 175-180)
- Phase 5 ADVERSE explicit phase wire (mevcut Auditor → fresh-context mode + Sarcasmotron-style prompt template)
- Phase 7 REVIEW MCP tool (`deckent_review` user-facing demonstration)
- Phase 9 COOL-DOWN consolidation (DECAY + CLEANUP + RETRO merge + provenance export)
- AEGIS principle enforcement in Brain prompt enrichment

### Phase 2: Verification Stack (Sprint 181-188)
- fast-check entegrasyonu (Tier 1 PBT)
- Branded types core/types.ts'te (TaskId, SprintId, WorkerId)
- Stryker mutation testing diff-mode CI gate
- Zod schema migration `.contracts/api-surface.md` prose → schemas
- DbC assertion library + boundary insertion

### Phase 3: Provenance + Governance (Sprint 189-194)
- Provenance manifest schema v1
- Ed25519 signing infrastructure (mevcut hub Ed25519 reuse)
- Worker andon authority (proactive halt) implementation
- 5-Whys ROOT-CAUSE structured FIX phase

### Phase 4: Mode Expansion (Sprint 195-200)
- Task Mode AEGIS adaptation (Sprint 185-190 paralel)
- Process Mode ERP procurement vertical pilot (Sprint 195-200)
- TLA+ pilot: `respawnEligibleTasks` + `detectScopeCollisions` (critical-irreversible coverage)
- AEGIS-compliant skill certification spec (agentaegis.io standard draft)
- Sprint 200 god-level GA launch — AEGIS canonical methodology

### Phase 5: Ecosystem (Sprint 200+)
- Academic paper submission (ICSE 2027 / FSE 2027 / NeurIPS 2026 multi-agent track)
- agentaegis.io spec repo public
- AEGIS-compliant orchestrator certification program
- Hub plugin: AEGIS-mandatory verification tier metadata

---

## Related ADRs

- **ADR-036** — ADR Governance Integration: AEGIS Phase 2 GOVERN'in foundation, runtime ADR injection.
- **ADR-037** — RBAC Authority Matrix: AEGIS 5-rol separation of duties'in foundation.
- **ADR-038** — Dead Code Disposition + Spawn Safety: AEGIS Layer 3 HEALING içinde.
- **ADR-039** — Self-Modifying Task Detection: AEGIS Layer 1 AWARENESS içinde, dogfood discrimination.
- **ADR-040** — Nervous System: AEGIS Layer 1 AWARENESS'in çekirdeği.
- **ADR-041** — Agent Taxonomy: AEGIS 5-rol + Workers içinde 15 vertical agent + 21 horizontal skill.
- **ADR-042** — Hybrid Mode Architecture (Sprint 172 accepted — dual-mode shipped): AEGIS mode applicability'nin foundation, Sprint+Task+Process toggle.
- **ADR-043** — Brain Crash Recovery: AEGIS Layer 3 HEALING içinde.
- **ADR-044** — Sprint State Observability Contract: AEGIS Layer 1 AWARENESS içinde.
- **ADR-045** — Wave-Based Execution: AEGIS Phase 3 SPAWN içinde Kahn topological.
- **ADR-046** — Brain Self-Update Hook: AEGIS Phase 9 COOL-DOWN içinde provenance + memory update.
- **ADR-047** — Manuel Subagent Dispatch: AEGIS Layer 3 HEALING içinde, kritik kırık recovery.
- **ADR-048** — Prompt Lifecycle Contract: AEGIS Phase 3 SPAWN + Phase 9 COOL-DOWN cleanup contract.
- **ADR-053** — TaskType Taxonomy (Sprint 172 accepted — çekirdek 3-tip taxonomy shipped; Roadmap/Tek-Kaynak deferred): AEGIS Phase 2 GOVERN içinde EffectClass classification dependency.
- **ADR-055** — Hybrid Scoring 5-Layer (proposed): AEGIS Phase 6 EVALUATE'in canonical implementation.
- **ADR-060** — Self-Awareness Propagation (proposed): AEGIS Layer 1 AWARENESS 5-channel context enrichment specification.
- **Karpathy 4-Discipline Anchor** (`.claude/rules/karpathy-discipline.md`, Sprint 191 eklendi): AEGIS Phase 4 EXECUTE'in **worker-side canonical contract'ı**. 4 disiplin AEGIS prensipleriyle eşlenir: Discipline 1 (Think-Before-Coding) ↔ AEGIS Principle #5 (Cross-Workflow Institutional Memory — read before act), Discipline 3 (Surgical Changes) ↔ AEGIS ADR-037 RBAC scope.filesWrite enforcement, Discipline 4 (Goal-Driven + honest self-assessment) ↔ AEGIS Principle #3 (Adversarial Verification by Default — worker self-critique tier). Karpathy discipline, AEGIS Phase 4 Andon authority'nin yazılı norm halidir.

**Prior art credit:**
- **dollspace-gay/VSDD** — Adversarial verification via fresh-context critique pattern (AEGIS Phase 5 ADVERSE inheritance).
- **dollspace-gay/VDD** — Builder-Adversary separation foundation.
- **Anthropic** — Building Effective Agents + Effective Harnesses for Long-Running Agents (AEGIS lifecycle pattern source).
- **Madaan et al** — Self-Refine (AEGIS Mid-Sprint Adapter pattern source).
- **Bai et al / Anthropic** — Constitutional AI (AEGIS runtime ADR governance source).
- **Lightman et al / OpenAI** — PRM "Let's Verify Step by Step" (AEGIS Phase 6 EVALUATE Hybrid Scoring source).
- **Hong et al** — MetaGPT role-based SOP encoding (AEGIS 5-role separation parallel).
- **Wang et al** — Voyager skill library (AEGIS skill registry promotion-pipeline parallel).
- **Du et al** — Multi-Agent Debate (AEGIS Phase 1 SHAPE optional N-planner debate source).
- **OpenSSF** — SLSA build provenance (AEGIS provenance manifest source).
- **Toyota Production System** — Jidoka/Andon (AEGIS Phase 4 EXECUTE worker andon authority source).
- **Google SRE** — Error budgets + blameless postmortems (AEGIS Phase 1 SHAPE error-budget gate source).
- **Shape Up (Basecamp)** — Cool-down framing (AEGIS Phase 9 COOL-DOWN naming source).
- **Adzic** — Specification by Example (AEGIS Charter Given/When/Then formalization source).

---

## Notes

### Naming Rationale

**AEGIS** seçimi şu kriterlere dayanır:

1. **Mode-agnostic** — "Sprint" / "Code" / "Test" gibi mode-specific terim içermez. Sprint Mode + Task Mode + Process Mode üçü için aynı geçerli.
2. **Acronym açılımı disipline foundational** — Agentic (AI agent-native) + Effect-Governed (EffectClass + ADR governance) + Iterative (lifecycle loops) + Stewardship (multi-role responsibility, Brain orchestrates, Auditor watches, Nervous heals).
3. **Yunan mitoloji çağrışımı** — Athena'nın kalkanı (shield) — Reversibility Layer + Self-Healing + RBAC discipline'ın doğal sembolü. Marka için güçlü hikaye.
4. **5 harf, kolay söylenir, akılda kalır** — Marketing/launch için kritik.
5. **TDD/BDD/DDD/SDD/VDD/VSDD ailesinden çıkar ama doğal evrim** — Acronym pattern bozulur (XDD değil), bu da "yeni kategori" mesajı verir.

**Trademark riski:** "Aegis" yazılım dünyasında çeşitli security/auth ürünlerinde kullanılıyor (AEGIS authenticator, AEGIS encryption library, vb). Sprint 172 OSS GA öncesi:
- USPTO/EUIPO trademark araştırması
- "Agentic Effect-Governed Iterative Stewardship" full-name explicit claim ile çakışma azaltılır
- Domain araştırması: aegis.dev / agentaegis.io / aegis-method.org

**Alternatif isim adayları (Architect final kararı için):**

| Aday | Açılım | Avantaj | Dezavantaj |
|------|--------|---------|------------|
| **AEGIS** (önerilen) | Agentic Effect-Governed Iterative Stewardship | Mode-agnostic, mitolojik metafor, 5 harf | Trademark çakışma riski |
| **MAVEN** | Multi-Agent Verified Effect-aware orchestratioN | "Expert" connotation, friendly | Apache Maven brand confusion |
| **PRISM** | Plan-Run-Inspect-Score-Memorize | Phase-as-acronym, mode-agnostic | Generic, çok proje var |
| **OAGD** | Orchestrated Adversarial Governance Discipline | TDD/BDD ailesinden, akademik | Söylenmesi zor (oh-ay-jee-dee) |
| **HELIX** | Hybrid Effect-aware Lifecycle with Iterative eXamination | Spiral metafor, görsel | "X" zorlama, kelime uzun |

### Geç-ADR Pattern Devam Ediyor

ADR-053 ve ADR-055 gibi, ADR-061 de **mevcut Deckent disiplinin retroaktif belgelenmesi + ileriye dönük formal extension'ı**. Implementasyon önce yazıldı (Brain-Worker-Auditor + 50+ ADR + 14+ self-* layer), AEGIS bunlara isim verir + 5 yeni faz/gate ekler. Sprint 156 dogfood pratiğine göre bu geç-ADR pattern'i kabul edilebilir.

İleride tercih edilen sıra: ADR proposed → Architect review → ADR accepted → Implementation Sprint task'ları. AEGIS için bu sıra Sprint 175 itibarıyla uygulanır.

### Open Source Standard İddiası

Sprint 200 god-level GA sonrası AEGIS'in **agentskills.io tarzı açık standart** repo'sunu açmak (agentaegis.io draft) Deckent'i ekosistem-shaping rolüne taşır. CNCF Sandbox başvurusu, OpenSSF Best Practices Badge, MIT/Apache 2.0 license üçlüsü ile **vendor-neutral standart** iddiası mümkün. Bu Sprint 200+ Phase 5 Ecosystem roadmap'inde detaylanır.

### AEGIS vs VSDD Karşılaştırma Özeti

| Boyut | dollspace-gay/VSDD | AEGIS |
|-------|-------------------|-------|
| Scope | Solo developer workflow | Multi-mode (Sprint/Task/Process) AI orchestration |
| Phases | 6 (Spec/TDD/Adverse/Feedback/Formal/Convergence) | 9 (Shape/Govern/Spawn/Execute/Adverse/Evaluate/Review/Fix/Cool-down) |
| Roles | 4 (Architect/Builder/Tracker/Adversary) | 5 (Architect/Brain/Workers/Auditor/Nervous) |
| Memory | Ephemeral (per session) | Persistent (memory.db + decay + FTS) |
| Governance | Spec supremacy | ADR runtime enforcement (ADR-036) |
| Multi-agent | Builder vs Adversary 1:1 | Brain-Workers-Auditor-Nervous N:N |
| Mode | Single (developer) | Three (code/task/process) |
| Provenance | Implicit (git) | Explicit (signed manifest) |
| Self-* layers | Yok | 3 katman (Awareness/Improvement/Healing) |
| Process scale | Single dev | Sprint + organization |

AEGIS VSDD'nin **superset'idir** — VSDD prensiplerinin çoğunu (adversarial verification, fresh-context critique, spec supremacy, anti-slop bias, formal hardening) içerir + multi-agent orchestration + multi-mode + persistent memory + governance layer + self-* triad ekler.

---

**İmza (proposed):** Brain (orchestrator)
**Diriliş:** Sprint 175 implementation Phase 1 başlangıç ile birlikte canonical
**Sonraki revize:** Sprint 200 god-level GA sonrası empirical validation feedback ile v2.0

---

> **Note (status reconciliation + reality, Sprint 172):**
> - **`proposed` doğru statü:** AEGIS bilinçli ileri-dönük manifestodur; 9-phase/3-layer/5-role/8-artifact spec'in 5 yeni faz/gate'i (REVIEW, andon, 5-Whys, provenance, COOL-DOWN) ve Implementation Roadmap (Sprint 175-200) **henüz başlamadı** (Sprint 172). ADR kendisi her yerde bunu dürüstçe işaretler — overclaim yok.
> - **Çapraz-ADR statü uzlaştırması:** ADR-061 yazıldığında `(proposed)` etiketli iki ADR bu doküman turunda terfi etti — **ADR-042** (Hybrid Mode, dual-mode shipped → accepted) ve **ADR-053** (TaskType, çekirdek shipped → accepted; Roadmap/Tek-Kaynak deferred). §Context + §Related ADRs referansları buna göre güncellendi. **ADR-055 + ADR-060 `proposed` kalır** (çekirdekleri inşa edilmedi — bu ADR'lerdeki notlara bkz.); ADR-061 onları doğru biçimde `proposed` gösterir.
> - **Açık Architect kararı:** "Trademark/isim araştırması Sprint 172 OSS GA öncesi şart" (§Consequences + §Notes, 3×) — Sprint 172 = şu an. AEGIS vs MAVEN/PRISM/OAGD/HELIX seçimi + "Aegis" trademark çakışma riski **çözülmemiş bir Architect kararıdır**; bu not onu yüzeye çıkarır, karara bağlamaz.
> - Ground-truth tutarlı: "15 vertical agent + 21 horizontal skill" (§Related ADR-041) güncel kataloğla eşleşir.
>
> Behavior unchanged; documentation alignment only.

> **Amendment — Sprint 191 (Karpathy cross-reference):** Sprint 191 Worker Discipline Anchor projesi `.claude/rules/karpathy-discipline.md` dosyasını ekledi (4 disiplin: Think-Before-Coding, Simplicity-First, Surgical-Changes, Goal-Driven-Execution). Bu amendment AEGIS Phase 4 EXECUTE lifecycle adımına Karpathy 4-Discipline Anchor referansını ve §Related ADRs'e Karpathy Anchor cross-reference'ını ekler. Karpathy discipline AEGIS prensipleri #3 (Adversarial Verification — Discipline 4 honest self-assessment) ve #1 (Separation of Duties — Discipline 3 scope.filesWrite enforcement) ile örtüşür. No behavior change; documentation cross-reference only.


---

## adr-062: Embedded Web Terminal — PTY Sessions, WS Gateway, Auth & Audit

**Status:** accepted

# ADR-062: Embedded Web Terminal — PTY Sessions, WS Gateway, Auth & Audit

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-19

**Sprint:** Sprint 175 (Embedded Web Terminal — Sub-project #1/4)

---

## Status

accepted — implements the VSCode-like dockable terminal feature for the deckent dashboard.
Sub-project #1/4; sub-projects #2 (prompt/command guard), #3 (multi-tenant/k8s isolation),
#4 (enterprise external integration) are deferred to separate sprints.

> **Numbering note (Sprint 175, RESOLVED):** A collision with
> `docs/adr/062-consent-based-provisioning.md` (Sprint 175 Workstream A, same date)
> was resolved by renaming the consent-based ADR to `063-consent-based-provisioning.md`.
> This file retains `062-` per its spec/plan precedent. `memory.db` `adr-062` already
> points to this Embedded Web Terminal record.

---

## Context

The deckent dashboard (React + Vite + Tailwind) provides sprint monitoring but offers no
way to run interactive AI tools (`claude`, `gemini`, `codex`, `deckent`) or a shell session
directly from the browser. Users must switch between the dashboard and a terminal, breaking
focus during sprint supervision.

Sprint 172–174 stabilised the dashboard and completed OSS GA preparation. Sprint 175 adds
an embedded terminal as sub-project #1 of a 4-part roadmap.

Key constraints established in the verified spec (`docs/superpowers/specs/2026-05-19-embedded-web-terminal-design.md`):

1. **Security invariant (§1c.2):** The terminal WebSocket auth is **independent of and
   stricter than** `DECKENT_API_AUTH_DISABLED`. Disabling the global API auth gate does
   NOT open the shell. This invariant must never be relaxed (RCE surface if violated).

2. **Auth delivery (§1c):** The token is generated per-server-start, injected into the
   index.html page only for `127.0.0.1`/`::1` callers as `window.__DECKENT_TERMINAL_TOKEN__`,
   and presented via the `Sec-WebSocket-Protocol` subprotocol header (never in a plain HTTP
   Authorization header on the WS upgrade).

3. **Audit invariant:** Raw PTY output (ANSI sequences, user keystrokes, command output)
   is **never persisted** to disk or `memory.db`. Only structured, low-volume audit events
   (session created/attached/detached/killed) are stored, scoped by `tenantId`.

4. **Reattach boundary:** A PTY session survives client disconnect (browser tab closed,
   network blip) and can be reattached with scrollback replay. It does NOT survive a server
   restart (in-memory only). Disk persistence is a post-#1 backlog item.

5. **Enterprise seams (§1d):** `AuthProvider` and `SessionBackend` interfaces are defined
   from day one, with exactly one implementation each (`LocalTokenAuthProvider`,
   `LocalPtyBackend`). Multi-tenant SSO, remote backends, and k8s pod exec are deferred
   to sub-project #3.

---

## Decision

A self-contained terminal subsystem is added under `src/api/terminal/` with the following
components and contracts:

### Module Boundary

```
src/api/terminal/
  types.ts          — shared types (TenantId, SessionKind, AiTool, CreateSessionInput,
                       SessionMeta, AuditAction, AuditEvent)
  auth-provider.ts  — AuthProvider interface + LocalTokenAuthProvider
  session-backend.ts — SessionBackend interface + LocalPtyBackend (node-pty)
  session-manager.ts — PtySessionManager (Map, bounded ring buffer, attach/detach, reaper)
  audit.ts          — TerminalAudit (structured events → memory.db, tenant-scoped)
  ws-gateway.ts     — attachTerminalGateway (HTTP upgrade → auth → bridge)
```

`src/api/server.ts` wires the gateway, exposes HTTP control routes (`GET/POST/DELETE
/api/terminal/sessions`), and injects the bootstrap token into `index.html` for localhost
callers only.

`src/cli/commands/serve.ts` adds `--host <addr>` (default `127.0.0.1`) and `--no-terminal`
options; non-localhost `--host` without explicit token triggers a security warning and
leaves terminal disabled unless the user opts in explicitly.

### AuthProvider Interface

```typescript
interface AuthProvider {
  verifyToken(token: string): boolean | Promise<boolean>;
}
```

`LocalTokenAuthProvider` implements this with SHA-256 + `crypto.timingSafeEqual`. It
deliberately ignores `DECKENT_API_AUTH_DISABLED` — auth bypass applies only to the REST
API, not to the PTY shell.

### SessionBackend Interface

```typescript
interface SessionBackend {
  spawn(input: CreateSessionInput, tenantId: TenantId): PtySession;
}
```

`LocalPtyBackend` wraps `node-pty` for in-process PTY spawning. Remote backends (k8s exec,
Docker exec, SSH) are sub-project #3 implementations of this interface.

### PtySessionManager

- Sessions stored in a `Map<string, PtySessionEntry>` keyed by `sessionId` (UUID).
- Each session holds an in-memory bounded ring buffer (configurable `scrollbackBytes`,
  default 256 KiB) for reattach replay. Buffer does not overflow to disk.
- `detach(sessionId)` releases the client WebSocket reference without killing the PTY
  process. `kill(sessionId)` terminates the process and removes the entry.
- Idle reaper runs on a configurable interval; deckent-managed sessions (kind `deckent`)
  are exempt from idle-kill to avoid interrupting active sprints.
- `maxSessions` cap (default 10) rejects new spawns when the limit is reached.

### WS Gateway

`attachTerminalGateway(server, deps)` hooks `server.on('upgrade')`:

1. Token is extracted from `Sec-WebSocket-Protocol: deckent.<token>` — never from
   query string or cookie.
2. `AuthProvider.verifyToken()` is called **before** any session is spawned or a WebSocket
   is accepted. On failure: `socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')` + destroy.
3. On success: `new WebSocket(socket)` with `handleProtocols` returning the matched
   subprotocol; gateway forwards PTY output → WS and WS data → PTY stdin/resize.
4. On WS close: `manager.detach(sessionId)` — session remains alive for reattach.

### TerminalConfig

Added to `DeckentConfig` via the `terminal` key:

```typescript
interface TerminalConfig {
  enabled: boolean;          // default: true
  bind: string;              // default: '127.0.0.1'
  maxSessions: number;       // default: 10
  idleTimeoutMs: number;     // default: 1_800_000 (30 min)
  scrollbackBytes: number;   // default: 262_144 (256 KiB)
  allowShellKind: boolean;   // default: true
}
```

### Audit

`TerminalAudit.record(event)` writes structured `AuditEvent` objects (session lifecycle
only) to `memory.db` via the existing `MemoryStore`. The `memory.db` schema gains an
additive `tenant_id TEXT` column via a non-destructive `ALTER TABLE` migration guarded by
`schema_version`. Raw PTY bytes are never passed to this function.

### Frontend

A `DockPanel` component wraps a `TerminalPanel` (multi-tab, `TerminalTabs` + `TerminalView`
using `@xterm/xterm`). The dock is mounted outside the React Router `<Outlet>` in
`Layout.tsx` so it persists across route navigation. The WS hook (`useTerminalSocket`)
reads `window.__DECKENT_TERMINAL_TOKEN__` and presents it via the `Sec-WebSocket-Protocol`
subprotocol.

---

## Consequences

### Positive

- Dashboard gains real interactive terminal capability without leaving the browser.
- Security-by-default: localhost-only token injection, bypass-independent auth, no raw
  output persistence — RCE surface stays closed.
- Enterprise extensibility built in from day one via `AuthProvider`/`SessionBackend` seams.
- Reattach survives browser disconnect without server-side storage.
- Audit trail (structured events only) integrates with existing `memory.db` infrastructure.

### Negative / Risks

- `node-pty` is a native addon — requires platform-specific prebuilt or compilation.
  Handled by `node-pty`'s prebuilt binary system; `npm install` fails loudly if a platform
  is unsupported (acceptable failure mode, not silent).
- PTY sessions are in-memory: a server restart loses all sessions. Disk persistence is a
  post-#1 backlog item (acceptable, documented boundary).
- `scrollbackBytes` cap means long-running sessions lose early output after the buffer
  wraps. Users requiring full history should pipe to a log file inside the PTY.
- The `--host` non-localhost path requires users to manage their own TLS + token delivery
  (no HTTPS termination built in); spec §5 documents this explicitly.

---

## Alternatives Considered

- **xtermjs hosted via iframe / separate server:** Rejected — cross-origin auth complexity,
  no shared token injection, user must manage a second process.
- **Hand-rolled RFC6455 WebSocket server:** Rejected — security surface (frame parsing bugs,
  masking errors); `ws` library is audited with zero runtime deps of its own.
- **Persist raw PTY output to `memory.db`:** Rejected — ANSI escape sequences + keystrokes
  are PII-adjacent and exceed the "structured audit only" security invariant. Raw output
  may contain passwords, API keys, and personal data.
- **Global auth bypass applies to terminal too:** Rejected — `DECKENT_API_AUTH_DISABLED`
  was designed for local dev API convenience, not for shell access. Conflating the two would
  create an RCE vector (spec §1c.2, B-022).
- **No session limit / unbounded ring buffer:** Rejected — DoS vector; bounded defaults
  with configurable overrides are the correct trade-off.

---

## Related ADRs

- **ADR-006** — spawnSync Security Pattern: `LocalPtyBackend` spawn uses array args,
  `shell: false` (except `win32` npm wrapper), mirroring the existing secure spawn pattern.
- **ADR-010** — Minimal runtime dependencies: `ws` + `node-pty` added as the 8th and 9th
  runtime deps, both ADR-justified (this record).
- **ADR-014** — .deck Secret File System: terminal token uses `randomUUID()` (crypto-random,
  not `.deck`-managed); complementary, not conflicting.
- **ADR-016** — Connector Module: `AuthProvider`/`SessionBackend` follow the same
  interface + local-impl pattern established for connectors.
- **ADR-034** — Multi-Project Isolation: `tenantId` on audit events prepares the audit
  trail for multi-project isolation when sub-project #3 lands.
- **ADR-036** — ADR Governance Integration: this ADR is the runtime constraint record for
  the terminal subsystem; enforced via Brain prompt enrichment.
- **ADR-039** — Self-Modifying Task Detection: terminal touches `src/api/` + `src/dashboard/`
  → dogfood mode triggered → sequential execution mandatory (verified in DIRECTIVES).
- **ADR-045** — Wave-Based Execution Semantics: terminal implementation uses 5-wave
  sequential structure (Wave 0→4) due to self-modifying-detector dogfood mode.
- **ADR-047** — Manuel Subagent Dispatch Protocol: wave gate transitions are Brain-managed
  manually per this ADR (dependency_pipeline_enabled: false for deckent-dev project).

## Notes

DB sync: this `.md` is intended for upsert into `memory.db` via the ADR-046 `adrInsert`
post-finalize hook (`adr-file-sync.ts`) — never via destructive rebuild.

Sub-project roadmap:
- **#1 (this sprint):** Core terminal: PTY sessions, WS gateway, auth, audit, frontend dock
- **#2:** Security: prompt/command guard — prevent dangerous command patterns
- **#3:** Multi-tenant isolation: `AuthProvider`/`SessionBackend` k8s/SSO implementations
- **#4:** Enterprise external integration: remote PTY backends, audit export, SIEM hooks

**İmza:** Brain (orchestrator) — Sprint 175 Wave 0.


---

## adr-063: Consent-Based Prerequisite Provisioning

**Status:** accepted

# ADR-063: Consent-Based Prerequisite Provisioning

> **Numbering note (Sprint 175):** This ADR was originally numbered 062 alongside
> `062-embedded-web-terminal.md` (Sprint 175 concurrent work). Renamed to 063 to
> resolve the collision; the Embedded Web Terminal ADR retains 062 per its
> spec/plan precedent.

**Status:** accepted
**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)
**Date:** 2026-05-19
**Sprint:** Sprint 175 (1 Haziran Beta — Kusursuz Kurulum Deneyimi, Workstream A)

---

## Status

accepted — implements the blueprint §3.4 "anyone can install & use" promise. Documents an
implemented + TDD-tested capability (`src/core/provisioner.ts`, 23 tests). Geç-ADR pattern
(implementation-first documentation), accepted Deckent practice (cf. ADR-053, ADR-061 Notes).

## Context

`deckent init` / `deckent doctor` only **detected** missing prerequisites and printed a hint
string (`getProviderInstallHint` in `doctor.ts:410` + duplicated in `doctor-format.ts:69`).
blueprint §3.4 falsely claimed "tmux auto-installed on first run if missing" — no install path
existed anywhere (`spawnSync('npm', ['install', ...])` was absent from the codebase).

For the 1 Haziran OSS public beta the critical-path goal is a frictionless install experience
("Deckent herkesin kurabileceği kolaylık"). A non-developer running `deckent init` should be
guided to a working setup, not handed a list of manual `npm i -g` commands. But silently
installing global packages / running OS package managers is a security- and trust-sensitive
action that must not happen without explicit user consent.

## Decision

A single provisioning module (`src/core/provisioner.ts`) is the source of truth for "how is a
prerequisite installed", consent-gated and OS-aware:

1. **`planInstall(tool, opts)`** — deterministic, pure mapping `ToolId → InstallPlan`:
   - `claude/codex/gemini` → `method: 'npm-global'`, `npm install -g <pkg>`
   - `tmux` → `method: 'os-package'` — OS-aware instruction (apt/dnf/pacman/brew)
   - `node`, `docker` → `method: 'manual'` — never auto-installed (runtime / privileged)
2. **`installTool`** — only `npm-global` plans are auto-executed, and only when
   `consent === true`. Array args, `shell: false` (shell:true ONLY on win32 for the npm `.cmd`
   wrapper, mirroring `provider.ts:detectCliVersion`). Executable checked against
   `PROVISIONER_BIN_WHITELIST` (frozen, `['npm']` — `sh`/`bash` intentionally absent). Non-zero
   exit returns `{ status: 'failed' }` (never throws). `os-package`/`manual` are surfaced as an
   instruction string the user runs themselves — **no silent sudo**.
3. **`provisionMissing`** — orchestration: `mode` ∈ `prompt | yes | no-install`.
   - `prompt` (default) — per-tool consent prompt
   - `yes` (CLI `--yes`, MCP `installMissing:true`) — install all without prompting (CI)
   - `no-install` (CLI `--no-install`) — legacy hint-only behavior preserved (backward compat)
4. **Single source of truth** — `getProviderInstallHint` (both `doctor.ts` and
   `doctor-format.ts` copies) now delegates the package mapping to `planInstall`; legacy hint
   string format preserved (no test/UX regression).
5. **MCP parity** — `deckent_init` gains an `installMissing` opt-in (MCP has no interactive
   consent channel, so it is explicit opt-in === CLI `--yes`; default reports only).

## Alternatives Considered

- **Silent auto-install (no consent).** Rejected — installing global npm packages / OS
  packages without consent violates user trust and the security DNA (ROADMAP §11 anchor #9).
- **Keep hint-only.** Rejected — does not meet the beta "frictionless install" goal.
- **Bundle provider CLIs as deps.** Rejected — bloats the package, conflicts with ADR-010
  (minimal runtime dependencies) and provider-agnostic vision.

## Consequences

### Positive
- `deckent init` becomes a real provisioner — closes the blueprint §3.4 reality gap.
- Security-preserving: consent-gated, whitelist + shell-free spawn (companion to ADR-006
  spawnSync pattern + `spawn-safety.ts`), no silent sudo.
- Single source of truth removes the duplicated install-hint mapping (DRY across 3 sites).
- Backward compatible: `--no-install` preserves the prior hint-only behavior exactly.

### Negative / Risks
- Global `npm i -g` may require elevated permissions on some setups; failures are reported
  with the manual command (graceful, non-fatal) rather than auto-escalating.
- OS-package (tmux) still requires a manual user step on Linux (sudo) — by design.
- Provider CLI package names (`@anthropic-ai/claude-code`, `@openai/codex`,
  `@google/gemini-cli`) are now centralized; if a vendor renames a package, update one place.

## Related ADRs

- **ADR-006** — spawnSync Security Pattern: provisioner spawn obeys the array-args /
  shell-free invariant; `PROVISIONER_BIN_WHITELIST` is a companion to `spawn-safety.ts`.
- **ADR-010** — Minimal runtime dependencies: provisioner installs *external* CLIs on
  consent rather than bundling them as deps.
- **ADR-011** — node:readline/promises prompt: the interactive consent prompt uses the
  existing `promptConfirm` helper.
- **ADR-036** — ADR Governance: this ADR is the runtime contract for the provisioning
  capability; written as governance record for the implemented behavior.

## Notes

ADR number selected as the next free slot above the highest existing ADR (061). Slots
049–052 / 054 / 056–059 are intentionally left for the TaskType-taxonomy ADR family
(ADR-053/055/060 already exist; cf. `project-task-type-taxonomy-vision` memory) to avoid
cross-family collision. Verified against both `docs/adr/` and `memory.db` (`type='adr'`).

DB sync: this `.md` is upserted into `memory.db` via the ADR-046 `adrInsert` post-finalize
hook (`adr-file-sync.ts`) — never via destructive rebuild (cf. `feedback_db_silmek_yasak`).

**İmza:** Brain (orchestrator) — Sprint 175 Workstream A, behavior implemented + 23 tests PASS.


---

## adr-064: TOPP — Continuous Dispatch (Wave-Barrier Removal)

**Status:** accepted

# ADR-064: TOPP — Continuous Dispatch (Wave-Barrier Removal)

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-20

**Sprint:** Sprint 178 (Task 5 / fix-007 — TOPP B+C implementation)

**Supersedes (in part):** ADR-045 §3 "Wave-Based Execution Semantics" —
the wave-barrier between Wave N completion and Wave N+1 spawn is replaced
by continuous, per-tick re-evaluation.

---

## Status

accepted — contract written before the unified dispatch wire, per
ADR-036 ADR Governance discipline.

---

## Context

ADR-045 §3 codified "wave-based execution": when
`dependency_pipeline_enabled: true`, Brain spawns tasks in topological
waves and only re-evaluates eligible PENDING tasks after Wave N completes.
The runtime wire (`respawnEligibleTasks`) lands one wave at a time, so
Wave N+1 cannot start until at least one Wave N task completes AND the
main loop reaches the next `await maybeRespawn()` call.

`waitForResults` currently maintains two parallel spawn paths:

```ts
const newlyCollected = await collectResults();
await processQueue(newlyCollected);  // legacy FIFO drain
await maybeRespawn();                // dep-pipeline re-eval
```

These paths are mutually exclusive at the data level (the FIFO queue only
has entries when `dependency_pipeline_enabled === false`; otherwise the
queue is empty and only `maybeRespawn` does work). The dual-call sequence
is a vestigial structure from before the wave-pipeline existed and creates
three concrete problems:

1. **Sprint 179 fan-out blocked.** Sprint 179 plans 12 parallel tasks
   with shallow dep chains. Under wave-barrier semantics, the throughput
   collapses to ⌈12/maxWorkers⌉ ticks — for `maxWorkers=2` that is 6
   serial wave boundaries before all 12 finish. Continuous dispatch
   collapses that to a single ladder fill + reactive spawn loop.

2. **Code duplication.** `processQueue` and `maybeRespawn` re-derive
   roughly the same predicate ("which PENDING task is eligible given the
   current set of DONE deps?") in two different forms. Bugs (Sprint
   161/164/165 hayalet-task family) repeatedly arose because the two
   paths diverged on edge cases (deps in the queue tail, force-rescan
   races, the `assignedTaskIds` idempotency guard).

3. **No documented rollback.** When a wave-barrier removal lands in
   production and breaks an unforeseen edge case, there is no flag-flip
   to restore prior behavior. The operator's only escape is a hot revert.

---

## Decision

We introduce a single, flag-agnostic dispatch entry — `planDispatch(state)`
(pure planner) plus `dispatchTick(newlyCollected)` (closure-scoped async
wrapper inside `waitForResults`). The two existing internal helpers
(`processQueue` + `maybeRespawn`) are no longer invoked directly from
the main loop; `dispatchTick` calls them in sequence and supplements them
with the `DECKENT_LEGACY_FIFO=1` rollback escape.

### `planDispatch(state) → DispatchPlan`

Pure function. Inputs: sprint state, config, maxWorkers, assigned/
collected sets, FIFO queue, newly-completed task IDs. Outputs:
`{ toSpawn: Task[]; toKill: string[]; mode: 'continuous' | 'legacy-fifo' }`.

Two modes:

- **continuous** (default — applies whether `dependency_pipeline_enabled`
  is true or false): every tick re-evaluates eligible PENDING tasks.
  Drains the FIFO queue first (respecting deps when the pipeline flag is
  on), then fills remaining slots from PENDING tasks via the standard
  dep-aware filter. The result: as soon as ANY task completes, the next
  eligible task spawns within the same tick. There is no implicit
  barrier between waves.

- **legacy-fifo** (active when `DECKENT_LEGACY_FIFO=1`): drains exactly
  one queue entry per completed task ID and emits a `toKill` for the
  freed slot. This is the pre-Sprint-178 contract preserved verbatim as
  an escape hatch.

### `dispatchTick(newlyCollected)` — internal closure

Wraps `planDispatch` plus the actual spawn/kill calls. Lives inside
`waitForResults` because it depends on closure state
(`spawnIfNotAssigned`, `queueBackend`, etc.). When
`DECKENT_LEGACY_FIFO=1`, `dispatchTick` short-circuits to the legacy
`processQueue` path and skips `maybeRespawn`, preserving exact pre-Sprint
178 semantics.

### TOPP C — Predecessor digest in `buildDependenciesBlock`

Already shipped in `prompt-god-template.ts` via `formatDependencyEntry()`
(Sprint 146 Task 005). When a Wave N+1 task spawns, its prompt's
"## Dependencies" section embeds a per-predecessor digest:

```
## Dependency pred-1 (DONE)
- Files: src/foo.ts, src/bar.ts (+42/-7)
- Notes: <truncated 500 chars from predecessor result>
```

ADR-064 adopts this format as the official TOPP C contract and the
`tests/orchestra/topp-continuous-dispatch.test.ts` G7 test pins it.

---

## Consequences

### Easier
- Sprint 179 12-task fan-out runs with continuous spawn — no per-wave
  barrier. Throughput approaches `maxWorkers` regardless of wave depth.
- `processQueue` and `maybeRespawn` remain as internal back-compat
  shims but the call site is now a single function call, simplifying
  future refactors.
- Operators can pin pre-Sprint-178 behavior without a source revert:
  `DECKENT_LEGACY_FIFO=1` flips the mode.

### Harder
- The dispatch state surface (`DispatchState`) is larger than either of
  the two functions it replaces. Tests now have to construct sprint +
  config + assigned/collected sets rather than mock a single closure.
- The continuous mode does more work per tick (PENDING re-scan even when
  no completion happened). Mitigation: the inner loop is O(n) over
  `sprint.tasks` and breaks early once `slotsAvailable` is hit — the
  dominant cost is FS polling, not scheduling.

### Risks
- Wave-barrier regressions on user projects with very large sprints
  (>50 tasks). Mitigation: `DECKENT_LEGACY_FIFO=1` escape hatch is the
  documented rollback. Telemetry: the `mode` field on `DispatchPlan` is
  logged via debugLog so post-mortems can confirm which path ran.

---

## Alternatives Considered

1. **Inline both helpers into the main loop** — rejected. The two
   helpers are public exports referenced by existing tests
   (`task-queue.test.ts`, `result-collector.test.ts`) and removing them
   would break those suites. Keeping them as internal shims preserves
   the public API surface.

2. **Drop the FIFO queue entirely** — rejected. The
   `dependency_pipeline_enabled: false` mode is the documented contract
   for user projects that opt out of wave scheduling (ADR-045 §2). The
   queue is part of that contract.

3. **Replace `respawnEligibleTasks` with a new function** — rejected.
   `respawnEligibleTasks` does more than spawn — it writes events, emits
   metrics, writes sprint checkpoints. Replacing it would require
   re-implementing five orthogonal concerns. Wrapping it inside
   `dispatchTick` preserves all of those side-effects.

---

## Rollout

- Land in Sprint 178 as Task 005 (continued as 178-007-fix).
- `DECKENT_LEGACY_FIFO=1` ships disabled by default.
- Sprint 179 12-task fan-out is the first dogfood of continuous mode.
- If Sprint 179 surfaces a regression, the rollback is `export
  DECKENT_LEGACY_FIFO=1` in the environment — no source revert needed.

---

## References

- ADR-045 §3 (wave-barrier semantics — superseded in part)
- ADR-035 (verification protocol)
- ADR-036 (ADR Governance)
- Sprint 178 plan: `docs/superpowers/plans/2026-05-22-sprint-178-modernization-topp.md`
- Tests: `tests/orchestra/topp-continuous-dispatch.test.ts` (G1-G10 matrix)


---

## adr-065: Develop / Product Two-Repo Split

**Status:** accepted

# ADR-065: Develop / Product Two-Repo Split

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-31

**Sprint:** Sprint 201 (Task 201-004 — repo-split ADR + audit-report immutable note)

---

## Status

accepted — two-repo model adopted as of Sprint 201 pre-launch preparation.

---

## Context

Deckent's development history lives in a single internal repo (`deckent-develop`).
After 200+ sprints of dogfood the repo contains large internal directories that
are noise for public users:

| Directory | Approx. files | Contents |
|-----------|:------------:|----------|
| `.brain/` | 2 554 | sprint logs, memory.db exports, patterns, retro history |
| `.deckent/archive/` | 1 511 | archived task files from past sprints |
| `docs/audits/` | hundreds | per-sprint internal audit reports |
| `docs/alperen-analysis/`, `docs/superpowers/`, etc. | hundreds | internal analysis, Alperen-personal notes |
| `DIRECTIVES.md` | 1 | sprint-in-progress instructions (user noise) |

Publishing this raw history to a public GitHub repo creates two problems:

1. **Vitrin/internal conflict.** A prospective user landing on the GitHub page sees
   hundreds of internal files and thousands of sprint artifacts before reading a
   single line of product docs. Trust erodes.
2. **Security surface.** Sprint internals can embed partial API keys (captured
   during dogfood), personal notes, and in-progress decisions not meant for public
   consumption.

Additionally, Sprint 200 surfaced the **audit-report drift incident**: an automated
counter (`managed-docs` sprint-metrics generator) modified
`docs/audits/sprint-139/dead-code-report.md`, changing the historical dead-code
count `864` to the current `870`. The change was caught and reverted, but it
revealed a policy gap — historical audit reports were not explicitly marked as
immutable, and the managed-docs tooling had no guard against touching them.

---

## Decision

Maintain **two separate git repositories**:

| Repo | Purpose | History | Visibility |
|------|---------|---------|-----------|
| `deckent-develop` | Full development repo — sprint work, dogfood, internals | Complete history, all sprint artifacts | Private |
| `deckent` | Product repo — clean public snapshot for users and npm | Orphan commits (no internal history) | Public (VerhexIO/deckent) |

Synchronisation from develop → product is performed via the `scripts/sync-to-product.mjs`
script (ADR companion: Sprint 201 Task 201-003). The script:
- Uses `git archive HEAD` to extract only git-tracked files.
- Applies an EXCLUDE list that strips all internal directories.
- Runs a security gate (real key scan) before staging.
- Produces a staging directory; **push is always a manual human action** (public-publish blast-radius).

The npm package (`package.json` `files` field: `dist/`, `bin/`, `README.md`,
`LICENSE`) is unaffected by the repo split — it was already narrowly scoped.

### Audit-report Immutable Policy

Historical sprint audit reports (`docs/audits/sprint-NNN/`) are **immutable** after
the sprint that produced them closes. They record a verified snapshot of codebase
health at a point in time; retroactive counter updates destroy their evidentiary
value.

Enforcement:
- `docs/audits/` is **not** and **must not** be listed in `.deckent/docs.json`
  (the managed-docs registry). The managed-docs system touches only the 11
  explicitly registered docs (CLAUDE/VISION/beta-tracker/IDENTITY/blueprint/
  AGENTS/TOOLS/BOOT/WORKER-GUIDE).
- Any PR or sprint task that modifies a file under `docs/audits/sprint-NNN/`
  for a closed sprint must be blocked unless the change is purely additive
  (appending a post-hoc note) and is signed off by the product owner.
- Root cause of the Sprint 200 incident: the sprint-metrics generator ran over
  a file it should not have had access to. The generator now explicitly skips
  `docs/audits/**` paths.

---

## Consequences

### Easier
- Public GitHub vitrine (`VerhexIO/deckent`) contains only product-relevant files:
  `src/`, `dist/`, `docs/` (reference + guide), `README.md`, `LICENSE`.
- Internal sprint history remains fully intact in `deckent-develop` — no history loss.
- npm publish pipeline is unchanged (`npm publish` already uses the `files` field).
- Historical audit reports are protected from automated modification.

### Harder
- Every public release requires running `sync-to-product.mjs --apply` and then a
  manual `git push` to the product repo — one extra step per release cycle.
- Contributors who fork the product repo do not see sprint history; they must be
  directed to `deckent-develop` for full context.
- The EXCLUDE list in `sync-to-product.mjs` must be kept in sync with new
  internal directories. It is the single authoritative list — no config duplication.

### Risks
- **Stale EXCLUDE list.** If a new internal directory is created in `deckent-develop`
  and is not added to EXCLUDE before the next sync, it leaks into the product repo.
  Mitigation: `sync-to-product.mjs --dry-run` output is reviewed before `--apply`.
- **Orphan commit chain.** Product repo has no shared history with develop repo.
  `git blame` across repos is impossible. Mitigation: commit messages in the product
  repo reference the develop sprint ID (e.g., `"sync from deckent-develop sprint-201"`).

---

## Alternatives Considered

1. **Single public repo with `.gitignore` for internals** — rejected. `.gitignore`
   prevents tracking new files but cannot hide already-tracked files retroactively
   without `git rm --cached`. More importantly, the full sprint history (`.brain/`,
   `.deckent/archive/`, `docs/audits/`) would remain in the git object store and be
   visible via `git log --all`. The vitrin/internal conflict is not resolved.

2. **git-subtree / git-filter-repo to produce a filtered history** — rejected.
   `git filter-repo` produces a rewritten history that diverges from `deckent-develop`
   at the first commit. Any future cherry-pick or merge between the two repos becomes
   a manual conflict-resolution exercise. Orphan commits (our choice) are simpler:
   the product repo does not pretend to share history with the develop repo.

3. **Monorepo with path-scoped publish (`npm publish --workspace`)** — rejected.
   Deckent is a single npm package, not a monorepo of packages. A monorepo structure
   would add tooling complexity (Turborepo, Nx, or similar) with no benefit.

4. **Private npm registry for the product package** — rejected. The product vision
   (ADR-033) is an open-source tool; a private registry contradicts that goal.

---

## References

- ADR-033 (Product Vision — Product Not Service)
- ADR-036 (ADR Governance Integration)
- ADR-029 (Managed-Docs Universalization) — the 11-doc registry that explicitly
  excludes `docs/audits/`
- Sprint 201 Task 201-003 — `scripts/sync-to-product.mjs` implementation
- Sprint 200 incident: automated counter modified `docs/audits/sprint-139/dead-code-report.md`
  (historical `864` → `870`); change reverted in commit cf1ab8e2


---

## adr-066: Provider Independence — Multi-Provider Backend Parity

**Status:** accepted

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

## adr-067: Process Mode + Tenant Isolation — F3 Foundation

**Status:** proposed

# ADR-067: Process Mode + Tenant Isolation — F3 Foundation

**Status:** proposed

**Date:** 2026-05-31

---

## Context

Deckent üç yüz hedefler: AI Developer (Sprint Mode), AI Asistan (Chat Mode), AI System Worker (Process Mode). Process Mode, şirketlerin Deckent'i background agent olarak çalıştırabileceği, scheduled flows, multi-tenant izolasyon ve audit chain'in olduğu mimaridir. F3 sub-project bu yüzü hedefler.

Sprint 204 itibarıyla Process Mode için temel kararlar alınmıştır:
1. **Tenant izolasyon modeli**: Her tenant kendi `isolationRoot` dizinine sahip (`.deckent/tenants/<tenantId>/`). Sprint izolasyonu, task lock'ları, memory snapshots — hepsi tenant-scoped.
2. **tenantId resolver**: `resolveTenant()` — env `DECKENT_TENANT_ID` veya config `tenantId` alanından okur; yoksa `'local'` default (single-tenant/geliştirici modu).
3. **Path scoping**: `TenantContext.isolationRoot` = `<projectRoot>/.deckent/tenants/<tenantId>`. Tüm tenant-scoped I/O bu yol üzerinden yapılır.

Bu kararlar `src/core/tenant-context.ts` skeleton ile hayata geçirilmiştir (Sprint 204 Task 8).

---

## Decision

- `TenantContext` tipi zorunlu alanlar: `tenantId` (string), `isolationRoot` (string), `createdAt` (ISO 8601).
- `resolveTenant(projectRoot, config?)` — deterministik resolver: env önceliği > config > `'local'`.
- Tüm Process Mode bileşenleri (scheduled flows, cron, session dispatch) `TenantContext`'i parametre olarak alır.
- `'local'` tenant = single-tenant/geliştirici modu — Sprint Mode ile backward-compatible.
- Multi-tenant gerçek runtime (k8s pod-exec, audit shard) F3-002/F3-003 ile gelecek.

---

## Consequences

**Positive:**
- Sprint Mode etkilenmez — `tenantId: 'local'` mevcut davranışı korur.
- Process Mode yeni bileşenleri başından tenant-scoped — sonradan refactor yok.
- `isolationRoot` path helper her tenant için dosya sistemi izolasyonu sağlar.

**Negative:**
- F3-002 (scheduled flows) ve F3-003 (k8s pod-exec) henüz implement edilmedi — bu ADR sadece tip + resolver kararını kapsar.
- Gerçek çok-kiracılı yetkilendirme (OIDC, audit shard) F4 kapsamında.

---

## Alternatives Considered

- **Global singleton tenant state** — test izolasyonunu bozar, parallel sprint desteği yok.
- **Config-only tenant ID (env yok)** — CI ortamlarında env override esnekliği kaybolur.
- **Flat `.deckent/<tenantId>-*` prefix** — dizin izolasyonu yerine prefix karmaşası yaratır.

---

## References

- Sprint 204 Task 8 — `src/core/tenant-context.ts` skeleton (tenant isolation foundation)
- ADR-034: Multi-Project Isolation — Per-Project Security Boundaries
- ADR-062: Embedded Web Terminal (tenant-scoped session hook interface mevcut)
- ROADMAP F3: Process Mode sub-project tracker


---

## adr-068: Enterprise Foundation — Audit Query + Multi-Tenant + Scheduled Flows

**Status:** proposed

# ADR-068: Enterprise Foundation — Audit Query + Multi-Tenant + Scheduled Flows

**Status:** proposed

**Date:** 2026-05-31

---

## Context

F4 sub-project hedefi: Deckent'i kurumsal ortamlarda çalıştırılabilir hale getirmek — SOC2/GDPR uyumlu audit trail, OIDC/SSO auth, scheduled flow runtime ve çok-kiracılı yetkilendirme. Sprint 205 itibarıyla F4'ün ilk bileşenleri implement edilmiş ancak resmi ADR kaydı yoktu.

F3 (Process Mode) sprint 205'te tamamlanan bileşenler:
- `src/core/scheduled-flow.ts` — ScheduledFlow tipi + parseCronExpr + nextRun iskeleti (Sprint 205 Task 5)
- `src/core/flow-registry.ts` — CRUD + JSON persist (Sprint 205 Task 6)
- `src/cli/commands/flow.ts` — `deckent flow list/add` CLI (Sprint 205 Task 7)

F4'ün Sprint 205'te başlayan bileşeni:
- `src/core/audit-query.ts` — mevcut event-stream üzerinden tenant/action/time-range filtreli sorgu (Sprint 205 Task 8)

Bu bileşenler ADR-034 (multi-project isolation) ve ADR-067 (process mode + tenant isolation) üzerine inşa edilmiştir.

---

## Decision

Enterprise Foundation üç katmandan oluşur:

**Katman 1: Scheduled Flows**
- `ScheduledFlow` tipi zorunlu alanlar: `id`, `cronExpr`, `action`, `tenantId`, `enabled`.
- `parseCronExpr(expr)` — 5-alan standart cron parse + validation (`* */5 0-23` gibi aralık ve joker).
- `nextRun(flow, from)` — bir sonraki çalışma zamanı hesabı iskeleti (basit, tam scheduler değil).
- `FlowRegistry` — in-memory CRUD + `.deckent/flows/<tenantId>/flows.json` persist.
- `deckent flow list | add` CLI (ADR-012 register pattern).

**Katman 2: Audit Query**
- `queryAudit(params)` — mevcut event-stream (event-stream.ts) üzerinden okuma; yeni audit yazımı yok.
- Filtre boyutları: `tenantId`, `action`, `timeRange` (`from`/`to` ISO 8601).
- Çıktı: `AuditQueryResult[]` — timestamp, action, tenantId, payload özeti.
- Read-only — mevcut audit chain ve HMAC imzasını değiştirmez.

**Katman 3: Multi-Tenant Yetkilendirme (ileride)**
- ADR-067 `TenantContext` üzerine OIDC/SSO yetkilendirme katmanı eklenir (F4-001).
- Audit export API (F4-002) audit-query.ts üzerine inşa edilir.
- Rate/resource limits (F4-003) tenant-scoped throttle ile yönetilir.

---

## Consequences

**Positive:**
- Scheduled flows F3 temelini tamamlar — Process Mode'un kronik olarak eksik olan cron katmanını kapatır.
- Audit query read-only tasarımı mevcut audit chain'i bozmaz — zero regression riski.
- `tenantId` parametresi her katmanda taşınır — F4-001 OIDC entegrasyonu sonradan refactor gerektirmez.
- `'local'` tenant default backward-compat — Sprint Mode etkilenmez (ADR-067 ile tutarlı).

**Negative:**
- Gerçek cron scheduler runtime (k8s CronJob, OS cron) F3-003 kapsamında — bu ADR yalnızca tip + parse katmanı.
- Audit export compliance (SOC2/GDPR sertifikasyon paketi) F4-002'de ayrı ADR gerektirecek.
- `audit-query.ts` şu an event-stream dosya I/O'ya bağlı — veritabanı-backed audit store ileride migration gerektirebilir.

---

## Alternatives Considered

- **Her bileşen için ayrı ADR** — scheduled-flow, flow-registry ve audit-query ayrı ADR'ler olabilirdi. Ancak bunlar aynı F4 enterprise hedefini paylaşan küçük bileşenler; tek foundation ADR'si daha az overhead oluşturur. Gelecekte bileşen büyüdüğünde supersede edilebilir.
- **Audit için harici SIEM entegrasyonu (Datadog, Splunk)** — runtime dep ekler, self-hosted senaryolarda çalışmaz, ADR-010 (tek runtime dep) ile çelişir. Event-stream üzerinden read-only query daha az bağımlılık.
- **Flow registry için SQLite (memory.db)** — memory.db sprint/ADR/memory verisi için tasarlanmış; flow runtime verisi farklı schema ve lifecycle gerektirir. Ayrı JSON persist daha temiz izolasyon sağlar.

---

## References

- Sprint 205 Task 5 — `src/core/scheduled-flow.ts` (ScheduledFlow, parseCronExpr, nextRun)
- Sprint 205 Task 6 — `src/core/flow-registry.ts` (FlowRegistry, CRUD, persist)
- Sprint 205 Task 7 — `src/cli/commands/flow.ts` (deckent flow list/add)
- Sprint 205 Task 8 — `src/core/audit-query.ts` (queryAudit, AuditQueryResult)
- ADR-034: Multi-Project Isolation — Per-Project Security Boundaries
- ADR-067: Process Mode + Tenant Isolation — F3 Foundation
- ROADMAP F3/F4: Process Mode + Enterprise sub-project tracker


---

## adr-069: Event-Driven Triggers + RBAC — F3 Webhook & F4 Role-Based Access Control

**Status:** proposed

# ADR-069: Event-Driven Triggers + RBAC — F3 Webhook & F4 Role-Based Access Control

**Status:** proposed

**Date:** 2026-05-31

---

## Context

Sprint 206 iki yeni bileşen ekledi:

**F3-003 — Event-Driven Triggers (`event-trigger.ts`)**
Scheduled flows (ADR-068, F3-002) yalnızca cron-tabanlı tetikleyicileri destekliyordu. Webhook veya external event kaynaklı akışlar için tip + eşleştirme katmanı yoktu. `matchTrigger(event, triggers)` fonksiyonu gelen bir event'i kayıtlı trigger listesiyle karşılaştırarak hangi flow'ların tetikleneceğini belirler. Gerçek HTTP webhook listener bu ADR kapsamı dışındadır — yalnızca tip + matcher katmanı tanımlanmıştır.

**F4-001 — RBAC Role-Based Access Control (`rbac.ts`)**
F4 enterprise alt-projesi audit-query (ADR-068 Katman 2) ile başladı; ancak erişim denetimi yoktu. Herhangi bir tenant, herhangi bir kaynağa erişebiliyordu. `can(role, action, tenantId)` check fonksiyonu role → permission matrisini tanımlar. Gerçek auth/session entegrasyonu bu ADR kapsamı dışındadır — iskelettir.

Her iki bileşen de ADR-067 (`TenantContext`, `tenantId` zorunlu alan) üzerine inşa edilmiştir.

---

## Decision

### EventTrigger (F3-003)

`EventTrigger` tip tanımı:
```typescript
export interface EventTrigger {
  id: string;
  eventType: string;   // 'webhook' | 'custom' | 'system'
  source: string;      // trigger kaynağı (URL, servis adı, vb.)
  action: string;      // tetiklenecek flow action'ı
  tenantId: string;    // ADR-067 zorunlu alan
  enabled: boolean;
}
```

`matchTrigger(event, triggers)` semantiği:
- `tenantId` eşleşmesi zorunlu — tenant izolasyonu ADR-067 ile tutarlı.
- `eventType` eşleşmesi zorunlu.
- `enabled: false` olan trigger'lar atlanır.
- Eşleşen trigger'lar döndürülür (çoklu eşleşme desteklenir).

### RBAC (F4-001)

`Role` ve `Permission` tanımı:
```typescript
export type Role = 'admin' | 'operator' | 'viewer';

export enum Permission {
  READ   = 'read',
  WRITE  = 'write',
  DELETE = 'delete',
  ADMIN  = 'admin',
}
```

`can(role, action, tenantId)` matrix:
- `admin`: tüm izinler (READ + WRITE + DELETE + ADMIN)
- `operator`: READ + WRITE
- `viewer`: yalnızca READ
- `tenantId` parametresi tenant-scoping için geçirilir; gerçek tenant doğrulaması F4-002'de eklenir.

Bilinmeyen rol → tüm izinler reddedilir (fail-secure).

---

## Consequences

**Positive:**
- event-trigger.ts webhook/event akışını scheduled-flow ile aynı tenant-scoping modelinde birleştirir.
- RBAC iskelet fail-secure — bilinmeyen rol tüm izinleri reddeder, sonradan genişletmek güvenli.
- `tenantId` her iki bileşende zorunlu — ADR-067 ile tam uyum.
- HTTP webhook listener gereksinimsiz — matcher test edilebilir, bağımsız.

**Negative:**
- event-trigger.ts gerçek HTTP listener içermiyor — F3-003 tam tamamlanmadı, ek sprint gerekecek.
- `can()` gerçek auth session'a bağlı değil — F4-002'de OIDC/SSO entegrasyonu gerektirir.
- Role permission matrix hard-coded — kullanıcı-tanımlı rol genişletmesi F4-003 kapsamı.

---

## Alternatives Considered

- **Tam HTTP webhook server (F3-003 kapsamında)** — runtime dependency (http server) ekler, ADR-010 (tek runtime dep) ile çelişir; scope ≤200 LoC kısıtını aşardı. Tip + matcher iskeleti daha sonra HTTP katmanına kolayca bağlanabilir.
- **OIDC/SSO tam entegrasyon (F4-001 kapsamında)** — 200+ LoC, harici auth provider bağımlılığı, sprint effort=normal ile uyumsuz. İskelet → sonraki sprint progressif artış stratejisi tercih edildi.
- **Rol tabanlı config (JSON roles.json)** — hard-coded matrix config yükünü ortadan kaldırır ama runtime I/O ve validation ekler. Çok küçük bir set için overdesign — ADR-010 minimal dep prensibiyle çelişir.
- **tenant-aware can() yerine global can()** — ADR-067 izolasyon garantisini zayıflatır. `tenantId` parametresi şimdi taşınmalı yoksa F4-002 refactor maliyeti artar.

---

## References

- Sprint 206 Task 5 — `src/core/event-trigger.ts` (EventTrigger, matchTrigger, tenantId)
- Sprint 206 Task 8 — `src/core/rbac.ts` (Role, Permission, can())
- ADR-067: Process Mode + Tenant Isolation — F3 Foundation
- ADR-068: Enterprise Foundation — Audit Query + Multi-Tenant + Scheduled Flows
- ROADMAP F3-003: event-driven webhook triggers → `✅ DONE Sprint 206-005`
- ROADMAP F4-001: RBAC iskelet → `🟡 Sprint 206-008 (Role+Permission+can())`


---

## adr-070: Brain Evaluation Integrity — Signal-Based Coverage Exemption + Zero-Hard-Code Principle

**Status:** accepted

# ADR-070: Brain Evaluation Integrity — Signal-Based Coverage Exemption + Zero-Hard-Code Principle

**Status:** accepted

**Date:** 2026-05-31

**Accepted:** Sprint 207

---

## Context

Two systemic problems were identified and fixed in Sprint 207:

### Problem A — False-FIX Cascade from coverage:null

Sprint 206 produced 7 false-FIX cycles where the identical worker result was evaluated as
`DONE` under `bug-fixer` but `NO_GO` under `refactorer`. The root cause was in
`coverageOptional()` (rubric-registry.ts): the function used an agent-name allowlist to
determine whether `coverage:null` was acceptable. `refactorer` was not on the list, so any
refactoring task that didn't produce a numeric coverage value triggered a NO_GO → FIX loop.

This was a **false signal**: a refactorer that rewrites a function and adds new test files
clearly exercised the codebase. The absence of a `coverage` number is an instrumentation
gap, not a quality failure. The agent-based allowlist was a leaky abstraction — it required
manual maintenance every time a new agent type appeared in the system.

### Problem B — Bundled Hard-Coded Model IDs (Zero-Hard-Code Violation)

`model-registry.ts` contained `apiId: 'claude-opus-4-6'` as a bundled snapshot value. The
actual current Opus model is `claude-opus-4-8`. This stale hard-code propagated into:
- `deckent start` cost-estimate output (showed old model name to users)
- `bootstrapFromCatalog` (models.dev live catalog fetch): apiId was not overriding the
  bundled snapshot even when the remote catalog had updated entries
- `cost-calculator.ts` model-label generation: used registry values but the registry itself
  had stale bundled data

The principle: any string that a running deckent instance can derive from live data MUST NOT
be hard-coded in source. Bundled snapshots are an offline fallback, not a source of truth.

---

## Decision

### Decision A — Signal-Based coverage Exemption (agent-independent)

`coverageOptional(task, result)` was extended with a **signal-based path** that runs before
the agent-name allowlist check:

```typescript
if (result) {
  const wroteTests = result.filesChanged?.some(
    f => f.includes('.test.') || f.includes('.spec.')
  ) ?? false;
  if (wroteTests) return true;
}
```

Semantics:
- If a worker changed at least one test file (`.test.*` or `.spec.*`), coverage is optional.
- This is **agent-independent** — the same result evaluates identically regardless of which
  agent ran the task.
- It is **idempotent** — re-evaluating the same result always produces the same decision.
- It is **deterministic** — derived entirely from `result.filesChanged`, which is disk-level
  ground truth.

**Bridge fix (P0-2):** `refactorer` and `code-reviewer` were also added to the
`COVERAGE_OPTIONAL_AGENTS` allowlist as a bridge. The signal-based path is the permanent
solution; the allowlist entries prevent regression during the transition.

Implemented in: `src/orchestra/rubric-registry.ts` (Sprint 207 P0-1 + P0-2).

### Decision B — Zero-Hard-Code: Live Registry as Authoritative Source

Three rules now govern model identity strings in deckent:

1. **Bundled snapshot apiId must be kept current at build time.** If the bundled opus entry
   says `claude-opus-4-6` and the actual model is `claude-opus-4-8`, every cost estimate and
   status output shown to users is wrong. Bundled values are updated in the same PR as model
   promotions.

2. **`bootstrapFromCatalog` overrides bundled apiId from live catalog.** If `models.dev`
   returns an entry for a given model key, its `apiId` field WINS over the bundled snapshot.
   The bundled value is only used when the catalog is unreachable (offline fallback).

3. **`cost-calculator` and all display paths read `registry.get(model).apiId`
   parametrically.** No hard-coded `'anthropic/claude-opus-4-6'` or similar strings in
   display logic. If the registry has a stale value, the display is still consistent — the
   fix goes in one place (the registry), not scattered across callers.

Implemented in: `src/core/model-registry.ts`, `src/core/model-catalog.ts`,
`src/core/cost-calculator.ts` (Sprint 207 001/002/003).

### RBAC Gate Wire (F4-001 progress)

As part of Sprint 207 zero-hard-code + F4 work, `audit-query.ts` was wired to RBAC:
`queryAudit(params, role)` now calls `can(role, 'audit:read', tenantId)` — unauthorized
roles receive an empty/error response. This moves F4-001 from pure skeleton to enforced gate.

---

## Consequences

**Positive:**
- False-FIX cascade eliminated. The Brain no longer generates unnecessary FIX tasks for
  `refactorer`/`code-reviewer` results that include new test files.
- Evaluation is agent-independent: routing decisions cannot change the GO/NO-GO outcome for
  the same work product.
- Cost estimates show accurate model names to users without manual bundled-value maintenance.
- Zero-hard-code principle is now a documented constraint — new callers default to the
  registry API, not inline strings.
- RBAC enforcement on audit-query closes the audit access-control gap opened in Sprint 205.

**Negative:**
- Signal-based path depends on `filesChanged` being populated accurately by workers. A worker
  that wrote test files but omitted them from `filesChanged` would still get NO_GO. This is
  intentional: honest result reporting is a separate contract (ADR-035).
- Bundled apiId updates require a manual step at release time. Automated catalog-to-bundled
  sync is deferred (no Sprint 207 scope).
- `bootstrapFromCatalog` apiId override only fires when the network is available. Offline
  environments always use the bundled value — acceptable, as offline means "last known good."

---

## Alternatives Considered

- **Agent allowlist only (no signal path):** Required adding every new agent type manually.
  Sprint 206's 7 false-FIX cycles were the direct cost of this approach. Rejected.
- **Disable coverage check entirely:** Removes a meaningful quality signal for tasks that
  clearly should produce coverage (e.g., new API endpoint with no test files). Rejected.
- **Remote model catalog as sole source (no bundled fallback):** Breaks offline usage and
  adds a network call to every startup. ADR-010 (minimal runtime dependency) + offline
  resilience requirement both argue against this. Rejected.
- **Hard-coded apiId with comment:** The comment rots; the string stays wrong. Zero-hard-code
  principle requires the live source to win. Rejected.

---

## References

- `src/orchestra/rubric-registry.ts` — `coverageOptional()` signal-based path (Sprint 207 P0-1)
- `src/core/model-registry.ts` — bundled opus apiId updated to `claude-opus-4-8` (Sprint 207-001)
- `src/core/model-catalog.ts` — `bootstrapFromCatalog` apiId merge wire (Sprint 207-002)
- `src/core/cost-calculator.ts` — parametric model-label from registry (Sprint 207-003)
- `src/core/audit-query.ts` — RBAC gate wire via `can()` (Sprint 207-007)
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol Standard
- ADR-037: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0
- ADR-069: Event-Driven Triggers + RBAC — F3 Webhook & F4 RBAC
- ROADMAP F4-001: OIDC/SSO AuthProvider impl + RBAC → Sprint 207-007 gate wire
