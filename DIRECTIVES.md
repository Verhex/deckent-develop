# DIRECTIVES — Sprint 190: God-Level Push Day 2 — Native Chat + Local LLM + OSS Docs (2 dalga, 16 task)

## Goal: Sprint 189 carry-over fix'leri + W-C native `deckent chat` Path B implementation (Trinity AI-Asistan personası) + W-F local LLM provider (Ollama) + models.dev live catalog + W-H README/Getting Started OSS GA-ready + W-I release workflow npm publish prep. 1 Haziran 2026 beta launch için **kritik gün 2** — beta demo `deckent chat` çalışmalı. Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` (Faz 1/2 hybrid, Sprint 190 — Chat Foundation + Provider Repair + Docs).

Tüm task'lar için ortak kurallar (Sprint 189 ile aynı):
- Worker yalnızca `scope.filesWrite` içine yazar; scope dışına dokunmak yasak.
- Her task **test ile geçer** — vitest minimum 3 test (mutlu/edge/hata). Audit task'ları test gerektirmez.
- `dosya:satır` kanıtı zorunlu.
- ADR ihlali → NO_GO + amendment proposal.
- `.brain/memory.db` write yalnızca core/memory-*.ts yolundan.
- Sprint sonu tsc temiz + test regresyon yok (Sprint 189 baseline: 62 fail, **artmamalı**).
- Worker `.result` notes alanına kanıt komutu çıktısı yapıştır.

---

## DALGA 1 — Sprint 189 Carry-Over + Native Chat Foundation (8 task)

---

## Task 1: 190-001 — Sprint 189 IDENTITY.md sat30 + Memory DB retro entry bug fix
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: .deckent/workspace/IDENTITY.md, src/core/identity-generator.ts, src/orchestra/sprint-retro-writer.ts, src/orchestra/sprint-finalizer.ts
- Scope: src/core/, src/orchestra/, .deckent/, tests/orchestra/

### Description
Sprint 189 iki carry-over kapatılır:

**1. IDENTITY.md Project Status sat30 "MCP Tools: 27" → "31":**
Sprint 189 Task 12 worker AUTOGEN bloğunu (sat43) güncelledi ama Project Status tablosu manuel (sat30) drift kaldı. Worker AUTOGEN scope'u genişletmek yerine sadece güncelleme yapmıştı.
- `identity-generator.ts` AUTOGEN block patikasını genişlet — Project Status table'ı da managed-docs alanına dahil et.
- `lint-identity-md.mjs` Project Status drift için non-zero exit.

**2. Memory DB retro entry yazımı ([[project_sprint167_db_gap]] kronik bug):**
Sprint 189 tamamlandı ama `memory.db`'de sprint-189 retro entry YAZILMADI (sadece `pattern-sprint-189-stale_heartbeat` var). ADR-046 Brain Self-Update Hook chronic incomplete — sprint-finalizer retro hook'u DB write yapmıyor.
- `sprint-retro-writer.ts` veya `sprint-finalizer.ts`'te DB write hook'unu kontrol et.
- Bug RC tespit (memory store insert/upsert hatası mı, hook chain'i mi).
- Fix + Sprint 190 sonunda retro entry DB'ye yazıldığını doğrula.

**Kanıt:** `grep "MCP Tools.*31" .deckent/workspace/IDENTITY.md` → 2 match (sat30 + sat43); `sqlite3 .brain/memory.db "SELECT * FROM entries WHERE sprint_id='sprint-190' AND type='retro';"` → 1 row (Sprint 190 sonu).
**Test:** 3+ test — (a) Project Status AUTOGEN extend, (b) drift lint catches manual edit, (c) retro entry persistence after finalize.

---

## Task 2: 190-002 — Provider isAvailable complete fix (partial-available + auth chain)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/providers/gemini.ts, src/providers/codex.ts, src/providers/claude.ts, src/cli/commands/doctor.ts
- Scope: src/providers/, src/cli/commands/, tests/providers/

### Description
Sprint 189 Task 7 carry-over: `gemini.isAvailable()` ve `codex.isAvailable()` hâlâ `false` döndürüyor (build sonrası post-test). Binary PATH'te var ama auth check fail ediyor.

**Yöntem:**
1. Sprint 189 worker'ın yaptığı değişiklikleri oku (`src/providers/gemini.ts`, `codex.ts`). Hangi adımda fail eden noktayı tespit et.
2. **Partial-available davranışı**:
   - `isAvailable()` artık 3-state dönsün: `true` (binary + auth OK), `'partial'` (binary OK, auth eksik), `false` (binary yok).
   - Alternatif: `isAvailable()` boolean kalsın, yanı sıra `detect()` metodu `{ binary, version, auth, ready }` döndürsün.
3. `deckent doctor --providers` çıktısı her 3 state için açık mesaj versin: "✓ Claude (ready)", "⚠ Codex (binary OK, auth missing — set OPENAI_API_KEY)", "✗ Gemini (binary not found)".
4. Auth detection: API key env var + `codex login` config + Claude Code session — her provider için özgün yol.

**Kanıt:** `node -e "import('./dist/providers/gemini.js').then(async m => console.log(await new m.GeminiAdapter().detect()))"` → `{binary: true, version: 'X.Y.Z', auth: false, ready: 'partial'}` benzeri.
**Test:** 3+ test per provider — (a) binary yok, (b) binary var auth yok, (c) tam ready.

---

## Task 3: 190-003 — Release workflow npm publish + provenance + --access public (9 fail fix)
- Model: opus
- Effort: normal
- Skills: devops-engineer, ci-testing
- Files: .github/workflows/release.yml, tests/github/workflows/release.test.ts, tests/workflows/publish.test.ts
- Scope: .github/, tests/github/, tests/workflows/

### Description
Sprint 189 Task 15 audit: **9 release workflow fail** — `.github/workflows/release.yml` `Publish to npm` step yok, `npm publish --provenance --access public` regex match etmiyor. WrongStack WS-Z2 + W-I OSS publish bloker.

**Yöntem:**
1. `release.yml` mevcut yapıyı oku — şu an `actions/checkout` + `setup-node` + tests + build + `softprops/action-gh-release` + dist upload var.
2. **Yeni step ekle: Publish to npm**
   ```yaml
   - name: Publish to npm
     env:
       NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
     run: npm publish --provenance --access public
   ```
3. Step sıralaması: `build` → `changelog` → `Create GitHub Release` → `Publish to npm` → `Upload dist artifacts`.
4. Permissions: `id-token: write` + `contents: write` mevcut — provenance için yeterli.
5. 9 fail testin tümü yeşillenmeli.

**Kanıt:** `npx vitest run tests/github/workflows/release.test.ts tests/workflows/publish.test.ts` → tümü pass.
**Test:** Audit task — mevcut 9 test fail durumunu fix; yeni test eklenmesine gerek yok.

---

## Task 4: 190-004 — `src/cli/commands/chat.ts` Path B implementation (Trinity AI-Asistan kalbi)
- Model: opus
- Effort: high
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat.ts, src/cli/index.ts
- Scope: src/cli/, tests/cli/

### Description
Master plan W-C C-1: `deckent chat` komutu Path B (~150 LoC). Kullanıcının `claude`/`codex`/`gemini` CLI'ını subprocess spawn + Deckent MCP server auto-attach + tty forward. Alperen 2026-05-23: "Deckent native sohbet aracı olmasını istiyorum, kendi Claude gibi arayüzü olmalı naïve sohbetle de çalışmalı". Trinity AI-Asistan personasının kalbi.

**Yöntem:**
1. `src/cli/commands/chat.ts` oluştur:
   - `registerChat(program)` ADR-012 deseni
   - Provider tercih: `--tool <claude|codex|gemini>` veya auto-detect (Sprint 189 + 190-002'den isAvailable())
   - Subprocess: `spawn('claude', [...args])` veya benzeri
   - tty forward: stdin/stdout/stderr passthrough (Node `inherit`)
   - Process lifecycle: SIGINT/SIGTERM forward
2. `src/cli/index.ts`'e `registerChat(program)` ekle.
3. MCP auto-attach: subprocess env'sine `DECKENT_MCP_AUTO_ATTACH=1` set et veya kullanıcının config'ine MCP server entry inject et.
4. Hata kanalları: provider bulunamazsa açık mesaj + alternatif öner ("No AI CLI found. Install one of: claude (Anthropic), codex (OpenAI), gemini (Google), or use `deckent chat --local` for Ollama").
5. Help text: "Start a conversational session with Deckent. Uses your installed AI CLI; works in any terminal."

**Kanıt:** `deckent chat --help` → açık çıktı + `deckent chat --tool claude` → subprocess başlar.
**Test:** 3+ test — (a) auto-detect en yüksek öncelikli provider, (b) `--tool` override, (c) provider yok → açık hata mesajı.

---

## Task 5: 190-005 — `deckent chat` MCP auto-attach + tool-use loop kontrolü
- Model: opus
- Effort: high
- Skills: anthropic-sdk, typescript-expert
- Files: src/cli/commands/chat.ts, src/cli/helpers/mcp-attach.ts, src/mcp/server.ts
- Scope: src/cli/, src/mcp/, tests/cli/

### Description
Master plan W-C C-2: Host CLI tool-use loop'u yönetir, Deckent 31 MCP tool'u sunar. Path B kritik gereksinim.

**Yöntem:**
1. `src/cli/helpers/mcp-attach.ts` oluştur — Claude/Codex/Gemini CLI'larına MCP server attach mekanizması:
   - **Claude CLI:** `claude mcp add deckent -- npx deckent-mcp` (zaten DECKENT.md'de belge)
   - **Codex CLI:** Codex MCP attach syntax (codex'in MCP desteği varsa)
   - **Gemini CLI:** Gemini MCP attach syntax (varsa)
   - Otomatik check: MCP zaten attach edilmişse skip
2. `deckent chat` başlangıcında attach kontrolü + missing ise prompt: "Attach Deckent MCP to <tool>? [y/N]"
3. Attach edilmişse stdout'a "Deckent MCP ready — 31 tools available" mesajı.
4. Tool-use loop kontrolü: host CLI'ın MCP tool çağrılarını route ettiğini doğrula (smoke test).

**Kanıt:** `deckent chat --tool claude --check-mcp` → "✓ Deckent MCP attached" + tool listesinde 31 tool görünür.
**Test:** 3+ test — (a) attach skip if already, (b) attach prompt user, (c) attach success path.

---

## Task 6: 190-006 — Chat history — `memory.db` yeni `chat` entry type
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/memory-types.ts, src/core/memory-store.ts, src/cli/commands/chat.ts
- Scope: src/core/, src/cli/, tests/core/

### Description
Master plan W-C C-4: `deckent chat --resume <session-id>` için chat history persistance. Memory V2 DB-first additive schema.

**Yöntem:**
1. `src/core/memory-types.ts` `EntryType` enum'una `'chat'` ekle.
2. `src/core/memory-store.ts` chat-specific helper'lar: `createChatSession()`, `appendChatTurn(sessionId, role, content)`, `getChatHistory(sessionId)`.
3. Chat entry shape: `{ type: 'chat', session_id, turn_index, role: 'user'|'assistant', content, timestamp }`.
4. FTS5 indexable — chat geçmişi `deckent recall "<sorgu>"` ile aranabilir olsun.
5. `deckent chat --resume <id>` opsiyonu — son N turn'ü göster, devam et.

**Kanıt:** `sqlite3 .brain/memory.db "PRAGMA table_info(entries);"` chat type validation + `deckent chat --resume <id>` çalışır.
**Test:** 3+ test — (a) yeni chat session create, (b) turn append + retrieve, (c) FTS5 chat search.

---

## Task 7: 190-007 — Naïve sohbet modu (task-driven değil, conversational)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk
- Files: src/cli/commands/chat.ts, docs/guide/chat-mode.md
- Scope: src/cli/, docs/guide/, tests/cli/

### Description
Alperen 2026-05-23: "naïve sohbetle de çalışmalı". `deckent chat` sadece task-driven ("X yapsana") değil casual conversation ("merhaba", "bugün ne yapsam") da yanıtlamalı. Brain task'a çevirme yerine doğrudan model konuşsun.

**Yöntem:**
1. `deckent chat` system prompt'una "naïve mode" yönergesi ekle:
   ```
   You are Deckent's conversational assistant. The user may chat casually (greetings, questions about Deckent, brainstorming) OR request task execution. For casual chat, respond naturally without invoking MCP tools. For task requests (start sprint, run command), use the appropriate MCP tool.
   ```
2. Decision heuristic system prompt içinde: "If the user says 'start a sprint' or 'fix this bug', use deckent_start/deckent_run. Otherwise, just chat."
3. `docs/guide/chat-mode.md` dokümantasyon — naïve vs task-driven kullanım örnekleri.
4. Trinity AI-Asistan personası ilk somut tezahür.

**Kanıt:** `deckent chat` → "merhaba" → MCP tool çağrılmadan natural response.
**Test:** 3+ test (provider mock ile) — (a) casual greeting → no MCP, (b) "start sprint" → MCP tool, (c) ambiguous query → clarification.

---

## Task 8: 190-008 — Sprint 189 19 yeni TDD test'in yeşillenmesi + 7 env-fail fix
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Files: tests/docs/api-md-no-stale-refs.test.ts, tests/docs/no-stale-identity-refs.test.ts, tests/providers/codex-config.test.ts, tests/monitor/alert-emitter.test.ts (+ kardeş test'ler)
- Scope: tests/, src/

### Description
Sprint 189 Task 15 raporundan: **19 fail yeni TDD test** (kardeş task fix tamamlanmadığı için fail) + **7 env-issue fail** (ENOSPC tmpfs, env tooling). Bu sprintte yeşillenmeli.

**Yöntem:**
1. `tests/docs/api-md-no-stale-refs.test.ts` (15 fail) — Sprint 189 Task 4 api.md temizliği eksik kaldıysa tamamla; testin beklediği exact pattern'leri uygula.
2. `tests/docs/no-stale-identity-refs.test.ts` (4 fail) — Sprint 189 Task 5 cli.md/cli-commands.md PROJECT-IDENTITY.md temizliği eksik kaldıysa tamamla.
3. `tests/providers/codex-config.test.ts` (6 fail) — ENOSPC tmpfs sorununu çöz (test isolation veya disk cleanup hook).
4. `tests/monitor/alert-emitter.test.ts` (1 fail) — env tooling fix.
5. **Hedef:** Sprint 190 sonu fail count ≤ 36 (Sprint 189 başlangıç baseline'ı + 9 release workflow fail Task 3'te fix edildikten sonra 36 - 9 = 27 daha düşük olmalı).

**Kanıt:** `npx vitest run tests/docs/api-md-no-stale-refs.test.ts tests/docs/no-stale-identity-refs.test.ts tests/providers/codex-config.test.ts tests/monitor/alert-emitter.test.ts` → tüm pass.
**Test:** Audit + fix — mevcut test fail'leri çözmek; yeni test eklemek gerekmez.

---

## DALGA 2 — Local LLM + Provider Catalog + OSS Docs (8 task)

---

## Task 9: 190-009 — `src/providers/ollama.ts` adapter (Local LLM provider)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/providers/ollama.ts, src/core/types.ts, .deckent/config.json (template), src/core/config.ts
- Scope: src/providers/, src/core/, tests/providers/

### Description
Master plan W-F F-11: Local LLM provider. Alperen 2026-05-23: "local llm modeli eklemek istiyorum". Vision §195 referans (RTX 5090 + CUDA + 70B model). Ollama HTTP API en kolay başlangıç.

**Yöntem:**
1. `src/providers/ollama.ts` — `OllamaAdapter implements ProviderAdapter`:
   - `isAvailable()` → `fetch('http://localhost:11434/api/tags')` 200 mu kontrol et
   - `detect()` → model listesini çek, version bilgisi
   - `complete()` / `stream()` — Ollama API `/api/generate` veya `/api/chat`
2. `src/core/types.ts` `Provider` enum'a `'ollama'` ekle.
3. `src/core/config.ts` `providers.worker` etc. opsiyonlarına `ollama` ekle.
4. Model registry entegrasyonu — Ollama'dan çekilen modelleri tier'a map et (qwen-coder-32b → premium, llama-3-8b → standard, vb.).
5. `deckent config set worker_provider ollama` ile tam local sprint çalışabilmeli.

**Kanıt:** `node -e "import('./dist/providers/ollama.js').then(async m => console.log(await new m.OllamaAdapter().isAvailable()))"` → ollama localhost varsa true.
**Test:** 3+ test — (a) localhost ollama yok → false, (b) mock ollama yanıtı → true + model list, (c) complete() basic call.

---

## Task 10: 190-010 — models.dev live catalog `src/core/model-catalog.ts` (3 çatal #1)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/core/model-catalog.ts, src/core/model-registry.ts
- Scope: src/core/, tests/core/

### Description
Master plan W-F F-6/F-7 + 3 çatal kararı #1: models.dev live + 24h cache + fallback. `model-registry.ts` 13 hardcoded model kaldırılır → runtime fetch. ADR-023 tier-based routing korunur.

**Yöntem:**
1. `src/core/model-catalog.ts` oluştur:
   - `fetchCatalog()` → `fetch('https://models.dev/api/v1/catalog')` + JSON parse
   - 24h cache: `~/.deckent/cache/models-catalog.json` + TTL check
   - Fallback chain: fresh → cached → bundled-fallback
2. `model-registry.ts` `loadModels()` → catalog'tan beslenir; hardcoded liste kaldırılır.
3. Provider mapping: catalog response'dan Claude/Codex/Gemini/Ollama modellerini ayır.
4. Tier mapping: catalog metadata + Deckent tier kuralları (premium/standard/economy/premium_plus).
5. Offline modu: `--offline` flag veya network yok → bundled fallback kullan.

**Kanıt:** `deckent models list` → models.dev'den çekilen güncel liste; cache 24h içinde tekrar fetch yok.
**Test:** 3+ test — (a) live fetch + cache write, (b) cache hit, (c) fallback offline.

---

## Task 11: 190-011 — `deckent models list` + `deckent models refresh` CLI
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/models.ts, src/cli/index.ts, src/mcp/tools/models.ts
- Scope: src/cli/, src/mcp/, tests/cli/, tests/mcp/

### Description
Master plan W-F F-9/F-10: Kullanıcı katalogu görür, manuel refresh edebilir.

**Yöntem:**
1. `src/cli/commands/models.ts`:
   - `deckent models list [--provider <name>]` — aktif provider'ların modelleri + tier mapping tablosu
   - `deckent models refresh` — 24h cache invalidate + fresh fetch
   - `deckent models tier <model>` — bir modelin tier'ını sorgula
2. `src/mcp/tools/models.ts` paralel parite — `deckent_models` MCP tool (CLI/MCP parity ADR-022-v2).
3. `src/cli/index.ts`'e `registerModels(program)` ekle.
4. MCP `DECKENT_MCP_INSTRUCTIONS` güncelle (32 tools — Sprint 189 lint script otomatik yakalar).

**Kanıt:** `deckent models list` → renkli tablo + tier annotation.
**Test:** 3+ test — (a) list output format, (b) provider filter, (c) refresh cache invalidate.

---

## Task 12: 190-012 — README.md baştan yaz — Trinity vision ön planda (W-H H-1)
- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Files: README.md
- Scope: ., tests/docs/

### Description
Master plan W-H H-1 + Alperen 2026-05-23: "dokümantasyon kusursuz olsun istiyorum sadece sayı değil içerik olarak". OSS GA blockerı.

**Yöntem:**
1. Mevcut README'yi oku — teknik ağırlıklı, vision dağınık.
2. Yeniden yapı:
   - **Hero**: "Deckent — AI Agent Orchestration That Actually Ships"
   - **3 Faces (Trinity)**: AI Asistan / AI System Worker / Developer — vision ön planda
   - **Why Deckent**: Devin/Cursor/Aider/Copilot vs Deckent — 3 paragraf
   - **Install**: `npm install -g deckent` → 5 dakikada ilk sprint
   - **Quick Start**: `deckent init` → `deckent chat` veya `deckent set-directives` → `deckent start`
   - **Architecture**: tek diyagram + 4 modül linki (Brain/Worker/Auditor/Memory)
   - **Features**: 11 ana özellik (canlı 96/113 = %85 oran ile)
   - **OSS principles**: 4 immovable principles (ADR-033)
   - **Links**: docs/guide/, docs/cookbook/, contributing
3. Badge'leri güncelle — sprint count + version + license + ci status.
4. Türkçe README ayrı dosya (`README-TR.md`) — i18n hazırlık (ADR-032).

**Kanıt:** `wc -l README.md` → ≥120 satır, `grep -c "^## " README.md` → ≥8 başlık.
**Test:** 3+ test — (a) link checker temiz, (b) heading structure, (c) install command syntactically valid.

---

## Task 13: 190-013 — Getting Started 5-dakika kullanıcı yolculuğu (W-H H-2)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/guide/getting-started.md, docs/guide/first-sprint.md, docs/guide/chat-mode.md
- Scope: docs/guide/, tests/docs/

### Description
Master plan W-H H-2: 5 dakikalık deneyim. OSS GA bloker.

**Yöntem:**
1. `docs/guide/getting-started.md`:
   - Prerequisite (Node ≥24, optional Claude/Codex/Gemini CLI)
   - `npm install -g deckent` veya `npx deckent`
   - İlk komut: `deckent init my-app` veya `cd my-app && deckent init`
   - `deckent chat` ile soru sor: "What can I do here?"
   - VEYA `deckent set-directives` + `deckent start` ile ilk sprint
2. `docs/guide/first-sprint.md`:
   - DIRECTIVES format örneği (1 task minimal)
   - `deckent plan` → `deckent start` → `deckent status`
   - Beklenen çıktı + screenshot/ASCII
3. `docs/guide/chat-mode.md`:
   - Path B yöntemi (kullanıcının AI CLI'ı + Deckent MCP)
   - Naïve sohbet örnekleri
   - Task-driven örnekleri
4. README'den her birine bağ.

**Kanıt:** `wc -l docs/guide/*.md` her biri ≥40 satır.
**Test:** Audit task — link check + heading structure.

---

## Task 14: 190-014 — `docs/cookbook/` 3 örnek tarif (W-H H-7)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/cookbook/add-rest-api.md, docs/cookbook/fix-bug.md, docs/cookbook/update-docs.md
- Scope: docs/cookbook/, tests/docs/

### Description
Master plan W-H H-7: Tarif/örnek koleksiyonu — "Bir REST API ekle", "Bir bug fix yap", "Doc güncelle".

**Yöntem:**
1. `docs/cookbook/add-rest-api.md`:
   - Senaryo: Express/FastAPI projesine yeni endpoint ekleme
   - DIRECTIVES tam metni (kopyala-yapıştır kullanılabilir)
   - `deckent plan + start` çıktı örneği
   - Worker'ın yaptıkları + GO/NO_GO yorumu
2. `docs/cookbook/fix-bug.md`:
   - Senaryo: Bilinen test fail bug-fixer agent ile düzeltme
   - DIRECTIVES örneği
   - Bug-fixer agent davranışı + FIX phase
3. `docs/cookbook/update-docs.md`:
   - Senaryo: README + API docs güncelleme
   - doc-writer agent + sonnet model
   - Audit task tipi açıklaması

**Kanıt:** Her dosya ≥50 satır + DIRECTIVES örneği + komut çıktısı snippet'i.
**Test:** Audit task — link check.

---

## Task 15: 190-015 — API E2E test extension (rate limiting + auth — G-4/G-5)
- Model: opus
- Effort: high
- Skills: api-builder, testing-expert, security-specialist
- Files: tests/api/rate-limit.test.ts, tests/api/auth.test.ts, tests/api/sse.test.ts
- Scope: tests/api/, src/api/

### Description
Master plan W-G G-4/G-5: Sprint 189 Task 11 envanter + happy path test başlangıç; bu task **derinleştirme** — rate limiting + auth + SSE detaylı E2E.

**Yöntem:**
1. `tests/api/rate-limit.test.ts`:
   - Token bucket per IP test — 100 req/min default
   - 101. request → 429 + Retry-After header
   - Reset after window
2. `tests/api/auth.test.ts`:
   - Bearer token middleware — `DECKENT_API_TOKEN` env
   - Missing token → 401
   - Invalid token → 401
   - Health endpoint exempt
3. `tests/api/sse.test.ts`:
   - `/api/events` veya benzeri SSE channel
   - Event stream consumer + format kontrolü
   - Disconnect/reconnect davranışı
4. Test server helper'ı genişlet (Sprint 189'da yazıldı, ek senaryolar).

**Kanıt:** `npx vitest run tests/api/rate-limit.test.ts tests/api/auth.test.ts tests/api/sse.test.ts` → tüm pass.
**Test:** 15+ test (3 dosya × 5+ test).

---

## Task 16: 190-016 — `CONTRIBUTING.md` + `CODE_OF_CONDUCT.md` + GitHub templates (W-I prep)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: CONTRIBUTING.md, CODE_OF_CONDUCT.md, .github/ISSUE_TEMPLATE/bug.md, .github/ISSUE_TEMPLATE/feature.md, .github/ISSUE_TEMPLATE/question.md, .github/PULL_REQUEST_TEMPLATE.md
- Scope: ., .github/, tests/docs/

### Description
Master plan W-I I-7/I-8/W-H H-9/H-10: OSS community altyapı. Public repo öncesi zorunlu.

**Yöntem:**
1. `CONTRIBUTING.md`:
   - Setup (clone, install, build, test)
   - Development workflow (sprint mode + manual)
   - Conventional Commits guide
   - Test policy (minimum 3 test per task, ADR-053)
   - PR review process
2. `CODE_OF_CONDUCT.md`:
   - Contributor Covenant v2.1 (standart OSS)
   - Reporting kanal: `conduct@<domain>` (yer tutucu)
3. `.github/ISSUE_TEMPLATE/`:
   - `bug.md` (reproduce + expected + actual + env)
   - `feature.md` (problem + solution + alternatives)
   - `question.md` (FAQ yönlendirme)
4. `.github/PULL_REQUEST_TEMPLATE.md`:
   - Summary, related issue, test plan, breaking change checklist
5. Conventional Commits link + ADR-009 referans.

**Kanıt:** Tüm dosyalar ≥30 satır + GitHub render preview clean.
**Test:** Audit task — link check + markdown structure.

---

## Sprint Sonu Notu

Bu sprint **8-day push'un 2. günü** — kritik gün çünkü `deckent chat` Path B ve OSS docs OSS GA bloker. Beklenen sonuçlar:
- 16/16 task DONE (Sprint 189 baseline: 16/16 ✓)
- Test fail ≤ 36 (Sprint 189 Task 3 ile 9 workflow yeşillendi + Task 8 ile 19 TDD + 7 env yeşillendi = 62 - 35 ≈ 27 hedef)
- `deckent chat` çalışan demo (Path B ile Claude/Codex/Gemini host)
- Local LLM provider Ollama wire
- models.dev live catalog runtime fetch
- README + Getting Started OSS GA-ready
- Release workflow npm publish provenance

Sprint 190 retro otomatik (sprint-reporter.ts). Bu DIRECTIVES'te retro task YOK ([[feedback_no_retro_task_in_directives]]).

Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` — Faz 1 son sprint + Faz 2 başlangıç.
