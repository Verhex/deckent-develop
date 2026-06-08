# DIRECTIVES — Sprint 230 (sıradaki/aday): Platform + Model-wire + Dormant-activation

## Goal: **Sprint 224 sonrası dogfood-analizinin (feature-manifest + models.dev wiring audit) kod-doğrulanmış kalan iş kalemleri.** Bu dalga, "god-level primitive yazıldı ama 0-caller" desenini (MASTER-PLAN W-K) hedefler: Windows backend, models.dev dinamik routing, ve uykudaki primitive'lerin (ecosystem-intelligence, self-mod enforcement, handoff/heartbeat/shared-memory worker-koordinasyonu) gerçek wire'ı + ölü/orphan disposition + docker canlı-izleme. **Her task DISTINCT filesWrite → tam paralel-güvenli (tek wave).** Kaynak doğrulaması: her iddia file:line düzeyinde grep-doğrulandı (orijinal analizdeki D5-dedup ve E1-modül hataları düzeltildi). **god-level, RUN-VERIFY zorunlu, CI yeşil KORUNUR.**

Not: Brand-foundation (A1) bu sprint'te YOK — renk-tanımları paralel terminaldeki Ink-REPL çekirdeğinde (`src/cli/repl/*`, `chat-render-region.ts`) ve Alperen tarafından elle ele alınıyor (çakışma önleme).

## Ortak kurallar
- **🟢 RUN-VERIFY ([[feedback_proof_of_function_dod]]):** kanıt **çağıran** dosyada (def DIŞLA — wire'ı çağıran modülde grep'le, [[feedback_directive_kanit_letter_vs_goal]]); user-surface task → `Smoke:` gerçek-binary şart. Mock-only = GO_WITH_TECH_DEBT.
- **🔴 HERMETİK ([[project_ci_green_root_causes]]):** tmpdir + sandbox HOME, **async spawn (spawnSync YASAK)**, `test:ci-sim` yeşil. CI yeşil KORUNUR.
- ESM `.js`. Subscription (`env -u ANTHROPIC_API_KEY`). ≤200 LoC tercih, YENİ TEST DOSYASI. **Sadece kendi filesWrite'ına yaz** (paralel-güvenlik). Tek wave (8 task distinct dosya); `dependency_pipeline_enabled=false` → Brain manuel.

---

## Task 1: 230-001 — Windows-native backend (win32 → subprocess, POSIX-sleep → Node timer)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/spawn-backend.ts, src/orchestra/spawn-backend-docker.ts, tests/orchestra/windows-backend.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** `resolveBackend()` (`spawn-backend.ts:253-256`) `'auto'→'docker'` döner, **`process.platform` dalı yok** → Windows'ta docker zorunlu kılınır; docker spawn POSIX `sleep`'e bağlı (`spawn-backend-docker.ts:787-790` `spawnSync('sleep',…)` + `:829` + shell `sleep 15` `:456`) → win32'de kırılır.
**Çözüm:** `resolveBackend('auto')` → **`process.platform==='win32' ? 'subprocess' : 'docker'`** dalı. Docker `sleep` çağrılarını Node timer'a (`await new Promise(r=>setTimeout(r,ms))` veya mevcut async pattern) çevir — POSIX-sleep'i kaldır. Backend kontratı (4 metot) DEĞİŞMEZ, yeni araç YOK. Caller `spawn-backend.ts` (platform-mock ile).
**Kanıt:** `grep -c "win32\|process.platform" src/orchestra/spawn-backend.ts` → ≥1; `npx vitest run tests/orchestra/windows-backend.test.ts` → 3+ pass
**Test:** ≥3 (win32→subprocess, posix→docker, sleep-Node-timer) — hermetik (platform mock, async spawn)
**Smoke:** (Tier-0 orchestra) unit yeterli.

## Task 2: 230-002 — [P0] ⭐ models.dev native wire (PROVIDER_MODEL_MAP statik → dinamik)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/core/task-types.ts, src/providers/claude.ts, src/providers/codex.ts, src/providers/gemini.ts, tests/core/models-dev-wire.test.ts
- Scope: src/core/, src/providers/, tests/core/
### Description
**Problem (doğrulandı):** `PROVIDER_MODEL_MAP` (`task-types.ts:33-46`) **modül-yükleme anında statik** const (`Object.fromEntries(modelRegistry.getAllProviders()…)`); `bootstrapFromCatalog()` (`entry.ts:771`, preAction hook) models.dev'i SONRADAN çeker → harita tazelenmez. `ModelType` union (`task-types.ts:10-19`) hardcoded; adapter guard'ları (`codex.ts` `isOpenAIModel`) statik snapshot'a bakar → **builtin-13 dışı models.dev modeli reddedilir** (provider-selection yolunda ölü).
**Çözüm (Opsiyon A):** `PROVIDER_MODEL_MAP` statik→**dinamik getter/fonksiyon** (her okumada `modelRegistry.getByProvider()` canlı sorgu). Type-guard'ları (`isOpenAIModel`/`isClaudeModel`/`isGeminiModel`) registry-lookup'a gevşet (modül-yükleme snapshot'ı değil). Adapter'lar `spawn()` anında registry'den okusun. `ModelType` union'ı çalışma-zamanı `string` + registry-doğrulama ile uyumlu kıl (type-narrowing korunur). Caller `providers/*` + `task-types.ts`.
**Kanıt:** `grep -c "getByProvider\|modelRegistry\." src/core/task-types.ts` → ≥2 (dinamik sorgu); `npx vitest run tests/core/models-dev-wire.test.ts` → 4+ pass
**Test:** ≥4 (builtin-dışı model registry'de → guard kabul, provider doğru maplenir, bootstrap-sonrası harita taze, builtin korunur) — hermetik (registry fixture)
**Smoke (Tier-1):** models.dev'de var olan **builtin-dışı** model id ile task spawn → **reddedilmez**, doğru provider'a router'lanır (run-proven).

## Task 3: 230-003 — ecosystem-intelligence → routing-engine tüketimi
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/ecosystem-intelligence.ts, src/core/routing-engine.ts, tests/core/ecosystem-routing.test.ts
- Scope: src/orchestra/, src/core/, tests/core/
### Description
**Problem (doğrulandı):** `ecosystem-intelligence.ts` analiz üretir (`analyzeNewSkill`/`persistSkillActivation`) ama sadece `cli/commands/skill.ts` caller'lı; **`routing-engine.ts` tüketmiyor** (grep'te referans yok) → çıktı dead-end.
**Çözüm:** Ecosystem analiz çıktısını (skill aktivasyon sinyali) `routing-engine.ts`'in skill→agent affinity skorlamasına besle (ADR-075 affinity pattern'i izle). Caller `routing-engine.ts` (def `ecosystem-intelligence.ts` DIŞLA).
**Kanıt:** `grep -c "ecosystem\|analyzeNewSkill\|SkillActivation" src/core/routing-engine.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/core/ecosystem-routing.test.ts` → 3+ pass
**Test:** ≥3 (ecosystem-sinyali affinity'yi etkiler, sinyal-yok→nötr, mevcut routing bozulmaz) — hermetik
**Smoke:** (Tier-0) unit yeterli.

## Task 4: 230-004 — self-modifying-detector enforcement (user-project flag-gated)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, security-specialist
- Files: src/orchestra/self-modifying-detector.ts, config wire (sadece kendi scope'unda), tests/orchestra/self-mod-enforce.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** Tespit aktif (`isSelfModifyingTask`/`detectDeckentRepo`); enforcement `authority-enforcer.ts:302`'de `isSelfModifyingSprint` flag-gated (opt-in). ADR-039 dogfood-vs-user ayrımı KORUNMALI.
**Çözüm:** User-project'lerde **flag-gated** enforcement (config opt-in); deckent-dev'de bilinçli advisory (ADR-039). **🔴 RİSKLİ — kör-default-on EDİLMEZ; flag-gated, doğrula-sonra-default** (CLAUDE.md Quality Bar). Caller enforcement-noktası (def detector DIŞLA).
**Kanıt:** `grep -c "isSelfModifying\|enforce\|self_mod" src/orchestra/self-modifying-detector.ts` → ≥1; `npx vitest run tests/orchestra/self-mod-enforce.test.ts` → 3+ pass
**Test:** ≥3 (flag-on→enforce, flag-off→advisory, deckent-dev→advisory korunur) — hermetik
**Smoke:** (Tier-0) unit yeterli.

## Task 5: 230-005 — Ölü/orphan disposition (ADR-038): multi-agent.ts + decision-replay.ts
- Model: sonnet
- Effort: low
- Skills: refactorer
- Files: src/orchestra/multi-agent.ts, src/orchestra/decision-replay.ts, docs/adr/038-dead-code-disposition-sprint-139-audit-results.md
- Scope: src/orchestra/, docs/adr/
### Description
**Problem (doğrulandı + DÜZELTİLDİ):** `multi-agent.ts` modülünün **hiç importeri yok** (gerçek 0-caller orphan — `runPipeline:70` dahil); nervous `runPipeline` (`bootstrap.ts:109`) **farklı imza/semantik ayrı fonksiyon** (DEDUP DEĞİL — birleştirmek nervous'u kırar). `decision-replay.ts` **0-caller** (yalnız self-ref). **⚠️ `decision-engine.ts` CANLI** (nervous `bootstrap.ts:78` + sprint-controller + sprint-spawner) → **disposition adayı DEĞİL**. (Orijinal analizdeki `decision-orchestrator-v1`/`parallel-pipeline-manager-standalone` **mevcut değil**; `ParallelPipelineManager` 2 aktif caller'lı CANLI.)
**Çözüm:** Sprint-anında 0-caller'ı **yeniden doğrula** (`grep -rl "from.*multi-agent"`, `from.*decision-replay` → boş). Sonra ADR-038 disposition: ya **wire et** (gerçek değer varsa) ya **`archive/`'e taşı / sil** + ADR-038'e disposition kaydı. **Karar gerektirir** (sil vs arşivle — sonuç ADR-038'e yazılır). `decision-engine.ts`'e DOKUNMA.
**Kanıt:** `grep -c "multi-agent\|decision-replay\|disposition" docs/adr/038-*.md` → ≥2 (kayıt); 0-caller re-verify çıktısı `.result` notes'ta.
**Test:** ≥2 (kalan modüllerde import kırılmaz, build temiz) — hermetik. **Not:** kod-silme ise test = "tsc temiz + kalan suite yeşil".

## Task 6: 230-006 — Worker-koordinasyon lifecycle wire (handoff + heartbeat-daemon → sprint-controller)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/handoff-protocol.ts, src/orchestra/heartbeat-daemon.ts, src/orchestra/sprint-controller.ts, tests/orchestra/coordination-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** `HandoffProtocol` (`handoff-protocol.ts:18`) **0-caller** — task→task artifact aktarımı için tasarlı, hiç wire değil. `heartbeat-daemon.ts` `runHeartbeat()` (`:146`) sadece `cli/commands/heartbeat.ts` caller — sprint-controller'a wire DEĞİL (manuel invocation). (İki primitive de `sprint-controller.ts`'e wire olduğu için TEK task'ta birleştirildi → paralel-çakışma önleme.)
**Çözüm:** (a) HandoffProtocol'ü bağımlılık-zincirli wave geçişine wire (A→B: A'nın çıktı artifact'i B'ye handoff, EXECUTE/WAVE_BUILD). (b) heartbeat-daemon'u SPAWN'da otomatik başlat, CLEANUP'ta durdur (opt-out config'li). Caller `sprint-controller.ts` (def'ler DIŞLA).
**Kanıt:** `grep -c "HandoffProtocol\|handoff\|heartbeatDaemon\|runHeartbeat" src/orchestra/sprint-controller.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/orchestra/coordination-wire.test.ts` → 4+ pass
**Test:** ≥4 (handoff wave-geçişinde artifact aktarır, heartbeat SPAWN'da başlar, CLEANUP'ta durur, opt-out korunur) — hermetik (tmpdir)
**Smoke:** (Tier-0 orchestra) unit yeterli.

## Task 7: 230-007 — shared-memory wire (worker↔worker, read-mostly)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/shared-memory.ts, src/agents/worker.ts, tests/orchestra/shared-memory-wire.test.ts
- Scope: src/orchestra/, src/agents/, tests/orchestra/
### Description
**Problem (doğrulandı):** `SharedMemory` (`shared-memory.ts:16`) **0-caller** (`errors.ts` yalnız tip-referansı, construct etmez). Aynı sprint worker'ları için paylaşımlı veri alanı tasarlı, hiç wire değil.
**Çözüm:** Aynı sprint worker'ları için paylaşımlı (read-mostly) veri alanını **worker spawn/context'ine** wire et (`worker.ts`). **🔴 Wire-point `worker.ts`/spawn-context — `sprint-controller.ts`'e DÜŞME** (230-006 ile çakışmasın). Caller `worker.ts` (def `shared-memory.ts` DIŞLA).
**Kanıt:** `grep -c "SharedMemory\|sharedMemory" src/agents/worker.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/orchestra/shared-memory-wire.test.ts` → 3+ pass
**Test:** ≥3 (worker shared-memory'e yazar/okur, izolasyon-per-sprint, yok→graceful) — hermetik (tmpdir)
**Smoke:** (Tier-0) unit yeterli.

## Task 8: 230-008 — [P0] Docker live-monitor wire (SSE mount + watch --follow + WorkerCard)
- Model: opus
- Effort: high
- Skills: typescript-expert, devops-engineer
- Files: src/dashboard/api/output-stream.ts, src/api/server.ts, src/cli/commands/watch.ts, src/dashboard/src/components/WorkerCard.tsx
- Scope: src/dashboard/, src/api/, src/cli/commands/
### Description
**Problem (doğrulandı):** Docker çıktısı `logs --tail` (snapshot, canlı akış yok); `output-stream.ts` SSE handler (`src/dashboard/api/output-stream.ts`, `handleOutputStream`/`isOutputStreamRequest`) **`server.ts`'e mount EDİLMEMİŞ** (grep'te referans yok); `watch.ts --follow` (`:116`) var ama sadece tmux/subprocess `tail -f` — docker `logs -f` dalı YOK; `WorkerCard.tsx` mevcut ama canlı-log fan-out yok.
**Çözüm:** (a) `output-stream` SSE'yi `server.ts`'e mount (`isOutputStreamRequest` router'a ekle). (b) `watch --follow` docker dalı → `docker logs -f deckent-w-<id>` (read-only follow). (c) `WorkerCard` canlı-log akışı fan-out. Caller'lar `server.ts`/`watch.ts`/`WorkerCard.tsx`.
**Kanıt:** `grep -c "OutputStream\|output-stream\|handleOutputStream" src/api/server.ts` → ≥1 (MOUNT); `grep -c "logs.*-f\|follow.*docker\|docker.*logs" src/cli/commands/watch.ts` → ≥1
**Test:** ≥4 (SSE mount route, watch docker follow dalı, WorkerCard render canlı-log, non-docker fallback) — hermetik (mock docker, async spawn)
**Smoke (Tier-1 ZORUNLU):** `env -u ANTHROPIC_API_KEY node dist/cli/entry.js watch --follow <taskId>` → docker worker'da **canlı satır akışı** (snapshot DEĞİL) — gerçek-binary çıktı.

---

**Beklenen:** 8/8 DONE, 0 false-FIX, 0 scope-collision (her task distinct dosya → tek wave paralel). **Paralel-güvenli** (A1 brand REPL çekirdeğinde Alperen'de ayrı). 230-002 (models.dev) ve 230-008 (docker-monitor) yüksek-değer P0; gerisi platform/dormant-activation. CI yeşil KORUNUR.

**Pre-flight:** main temiz+commit'li+push'lu (reset-bug güvenli — [[project_deckent_self_git_mutation_bug]]). build:all + restart + RE-PLAN ŞART. **CLI'dan `env -u ANTHROPIC_API_KEY`** (API yasak). Tek wave (8 task paralel ayrık-dosya); `dependency_pipeline_enabled=false` → Brain manuel. Her wave sonrası `git log -1` + `git stash list` (reset kontrol). **Çakışma-notu:** 230-006 `sprint-controller.ts` yazar, 230-007 `worker.ts` yazar (sprint-controller'a DÜŞMEMELİ) — wire-point ayrımına dikkat.

İlgili memory: [[feedback_proof_of_function_dod]] · [[project_ci_green_root_causes]] · [[feedback_directive_kanit_letter_vs_goal]] · [[feedback_zero_hardcode_live_data]] · [[project_deckent_runtime_ecosystem]] · [[project_deckent_self_git_mutation_bug]]
İlgili ADR: ADR-038 (dead-code disposition) · ADR-039 (self-mod dogfood-vs-user) · ADR-075 (skill→agent affinity) · ADR-077 (multi-provider) · ADR-062 (PTY/web terminal) · MASTER-PLAN W-K (verified wire-gaps)
