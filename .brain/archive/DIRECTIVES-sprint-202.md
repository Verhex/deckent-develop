# DIRECTIVES — Sprint 202: F1 Provider Independence (kuzey-yıldızı temeli, 3 dalga, 6 task)

## Goal: deckent'i GERÇEKTEN provider-free yap — kuzey yıldızı: "sıfır API key + Ollama kurulu kullanıcı bir sprint koşturabilsin". Kod-doğrulanmış 13-agent analizi (ROADMAP-GOD-LEVEL §EXECUTION TRACKER F1): Ollama adapter 643 satır VAR ama bootstrap'a KAYITLI DEĞİL (provider.ts:405-411 detect yok, :682-695 factory yok) → `worker_provider=ollama` config kabul ediyor ama runtime'da sessizce Claude'a düşüyor. 12 yerde `?? 'claude'` hardcode provider-free'yi engelliyor. Bu sprint F1-P0'ı kapatır: Ollama 1. sınıf spawn hedefi olur + hardcode temizlenir + token throttle (Sprint 198 felaketi önlemi) + dokümanlar dürüstleşir.

Bağlam:
- North star: provider-free + konuşulabilir + 3-yüz, MIT, kur-çalıştır. Locked: subscription-first auth, Ollama 1.sınıf, doc kod-hizalı.
- Ollama subprocess/tmux'ta zaten çalışabilir — sadece bootstrap kaydı eksik. Docker refactor GEREKMEZ (F1-004/005 P1, bu sprint değil).
- Baseline 12 fail (Sprint 201), artmasın.

---

## Tüm task'lar için ortak kurallar

- **Subscription mode ZORUNLU** — sprint `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY` ile başlatılır. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite içine yazar (ADR-037 + honest-gate). Host-facing config'lere `/workspace` mutlak yolu YAZMA, `$CLAUDE_PROJECT_DIR` kullan (Sprint 200 container-path gate aktif).
- Her kod task'ı vitest minimum 4 test (mutlu/edge/hata/regresyon); doc task'ı 3 test.
- `dosya:satır` kanıtı zorunlu, `.result` notes'una kanıt komutu çıktısı yapıştır.
- Sprint sonu `npx tsc --noEmit` temiz + test regresyon yok (12 baseline, artmasın).
- **Dishonest result YASAK** — linesAdded claim disk'le çakışmalı; "zaten var +0/-0 DONE" tuzağına düşme, gerçekten ölç ([[feedback_trust_brain_eval_not_worker]]).
- ESM `.js` import suffix zorunlu (Node16). ADR-010 sıfır yeni runtime dep.

---

## DALGA 0 — Provider-Free Çekirdek (3 task, sıralı bağımlı — KRİTİK)

## Task 1: 202-001 — Ollama provider bootstrap kaydı (detectOllama + factory)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/core/provider.ts, src/orchestra/task-router.ts, src/core/task-types.ts, tests/core/provider-ollama-bootstrap.test.ts
- Scope: src/core/, src/orchestra/, tests/core/

### Description
**Problem (kod-doğrulanmış):** `src/core/provider.ts:405-411` `detectAvailableProviders()` sadece `[detectClaude(), detectCodex(), detectGemini()]` döndürüyor — Ollama YOK. `:682-695` `adapterFactories` map'inde Ollama factory YOK. Sonuç: `worker_provider=ollama` config validation'dan geçiyor (config.ts:252 VALID_PROVIDERS_ALL içinde) ama `getProviderAdapterForTask('ollama')` null dönüyor → sessizce Claude'a fallback.

**Çözüm:**
1. **provider.ts:** `detectOllama()` ekle (OLLAMA_HOST veya localhost:11434 erişilebilirlik probe'u). `detectAvailableProviders()`'a ekle. `adapterFactories` map'ine ollama factory ekle (OllamaAdapter import + construct).
2. **task-router.ts:64:** `ProviderName` type guard'a `value === 'ollama'` ekle (şu an union sadece claude|codex|gemini).
3. **task-types.ts (veya ProviderName union nerede):** `ollama`'yı tip union'a ekle.
4. Mevcut OllamaAdapter (ollama.ts, 643 satır) DEĞİŞTİRİLMEZ — sadece kaydı yapılır.

**Kanıt:**
- `grep -n "detectOllama\|ollama" src/core/provider.ts` → detect + factory match
- `node -e "const {detectAvailableProviders}=require('./dist/core/provider.js'); console.log(detectAvailableProviders().map(p=>p.name))"` → ollama listede (Ollama kurulu değilse 'available:false' ama listede)
- `npx vitest run tests/core/provider-ollama-bootstrap.test.ts` → 4+ pass
**Test:** ≥4 (detectOllama probe, factory construct, registry'de görünür, ollama kurulu değilken graceful)

---

## Task 2: 202-002 — Ollama model registry (tier→local model)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/core/model-registry.ts, src/core/ollama-models.ts, tests/core/model-registry-ollama.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 202-001

### Description
**Problem:** `model-registry.ts:62,72,82` sadece claude/codex/gemini modelleri tanımlı. Pure-Ollama config'de `getByProviderAndTier('ollama', tier)` hiçbir model dönmüyor → tier resolution çöküyor.

**Çözüm:**
1. **ollama-models.ts (yeni, ~50 LoC):** Ollama model tanımları — tier mapping: economy→`llama3.2`, standard→`qwen2.5-coder`, premium→`qwen2.5-coder:32b` (veya makul local model id'leri). ModelDefinition shape, `provider: 'ollama'`, cost=0 (local).
2. **model-registry.ts:** ollama-models import + registry'ye ekle. `getByProviderAndTier('ollama', tier)` çalışsın. 13-model invariant'ı bozma — Ollama modelleri opt-in eklenir (registry koşullu büyür).

**Kanıt:**
- `node -e "const {modelRegistry}=require('./dist/core/model-registry.js'); console.log(modelRegistry.getByProviderAndTier('ollama','standard')?.id)"` → bir model id
- `grep -c "provider: 'ollama'\|provider: \"ollama\"" src/core/ollama-models.ts` → ≥3
- `npx vitest run tests/core/model-registry-ollama.test.ts` → 4+ pass
**Test:** ≥4 (3 tier resolve, cost=0, invariant korunmuş, bilinmeyen tier null)

---

## Task 3: 202-003 — Claude-hardcode temizliği (registry-default fallback)
- Model: opus
- Effort: high
- Skills: typescript-expert, code-simplifier, testing-expert
- Files: src/orchestra/task-router.ts, src/orchestra/model-selector.ts, src/orchestra/prompt-god-template.ts, src/orchestra/sprint-utils.ts, src/orchestra/sprint-docs-updater.ts, src/core/provider.ts, tests/orchestra/provider-default-resolution.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/
- Dependencies: 202-001

### Description
**Problem (12/12 doğrulandı):** Provider-neutral modüllerde `?? 'claude'` hardcode provider-free'yi engelliyor — Claude yoksa sistem çöker.

**Çözüm:** `getDefaultProvider()` accessor ekle (provider.ts — registry'nin default/ilk-available provider'ı, son çare 'claude'). Sonra şu siteleri `?? getDefaultProvider()?.name ?? 'claude'` yap:
- task-router.ts:168-172 (No-providers fallback), :253, :272
- model-selector.ts:32, :212
- prompt-god-template.ts:617
- provider.ts:736 (preferredDefault)
- sprint-utils.ts:123, sprint-docs-updater.ts:75-76 (`getByProviderAndTier('claude','premium')` → resolved provider)
- **DOKUNMA:** sprint-utils.ts:96 (`providerName === 'claude'` tmux check — meşru Claude-specific, yorum ekle). config.ts:747 (`brain:'claude',worker:'claude'` — koşullu-default by design, sadece yorum).

**Kanıt:**
- `grep -rn "?? 'claude'" src/orchestra/ src/core/ | grep -v test | wc -l` → öncesi ~10, sonrası ≤2 (sadece son-çare + config.ts)
- `grep -n "getDefaultProvider" src/core/provider.ts` → tanım + kullanım
- `npx vitest run tests/orchestra/provider-default-resolution.test.ts` → 4+ pass
- `npx tsc --noEmit` clean
**Test:** ≥4 (getDefaultProvider çözer, Claude-yok senaryosu, ollama-default resolve, config-default korunur)

---

## DALGA 1 — Quota Güvenliği + Dürüstlük (2 task, paralel)

## Task 4: 202-004 — Token throttle (computeBackoff wire + pre-spawn quota gate)
- Model: opus
- Effort: high
- Skills: typescript-expert, performance-optimizer, testing-expert
- Files: src/core/token-quota.ts, src/orchestra/sprint-spawner.ts, src/core/config.ts, tests/core/token-quota.test.ts, tests/orchestra/sprint-spawner-throttle.test.ts
- Scope: src/core/, src/orchestra/, tests/core/, tests/orchestra/

### Description
**Problem:** `anthropic-http-client.ts:290-316` `computeBackoff()` ÖLÜ KOD (0 caller). Spawn'da inter-worker delay/tpm-awareness YOK. Sprint 198 30K tok/min Tier-1 felaketi tam bu yüzden — önleyici sıfır.

**Çözüm (Layer 1+2, Layer 3/4 ertelenir):**
1. **token-quota.ts (yeni, ~150 LoC):** pre-spawn quota gate — parsed rate-limit header (parseRateLimitHeaders mevcut) + computeBackoff kullan. `shouldThrottle(remaining, limit)` + `nextDelayMs()`.
2. **sprint-spawner.ts:** `config.token_throttle_ms` (default 500ms) `backend.spawn()` çağrıları arası sleep. cascade onRateLimited'da computeBackoff ile delay ölçekle.
3. **config.ts:** `token_throttle_ms` alanı ekle (default 500).
4. computeBackoff'u canlı çağrıya bağla (ölü-kod statüsü kalkar).

**Kanıt:**
- `grep -rn "computeBackoff" src/ | grep -v "anthropic-http-client\|test" | wc -l` → ≥1 (artık caller var)
- `grep -n "token_throttle_ms\|shouldThrottle" src/core/ src/orchestra/` → match
- `npx vitest run tests/core/token-quota.test.ts tests/orchestra/sprint-spawner-throttle.test.ts` → 6+ pass
**Test:** ≥6 (throttle-karar, backoff-hesap, inter-worker-delay, 429-senaryo, config-default, quota-tükenince-bekleme)

---

## Task 5: 202-005 — Doc-align (Gate #8 PARTIAL + chat.ts live + Sprint 185-200 arşiv)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/release/beta-tracker.md, docs/vision/roadmap.md, docs/ROADMAP-GOD-LEVEL.md, tests/docs/doc-honesty.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem (kanıtlı çelişkiler):** (a) beta-tracker Gate #8 "Multi-provider 3/3 ✅" ama Dockerfile sadece Claude (aynı dosya Gate #10/#12 "TODO" diyerek çürütüyor), (b) vision/roadmap "conversational shell unbuilt" ama chat.ts 447 satır canlı, (c) ROADMAP-GOD-LEVEL Sprint 185-200 multi-tenant/AEGIS planı gerçekleşmedi (audit/OSS-blocker'a gitti).

**Çözüm:**
1. **beta-tracker.md:23:** Gate #8 → "⚠ PARTIAL — abstraction ready; Docker runtime=Claude-only; Codex/Gemini tmux/subprocess" + footnote (Docker imaj Claude-only by design).
2. **vision/roadmap.md ~236-267:** Conversational shell bölümüne UPDATE NOTE — "Path B LIVE (Sprint 190), Path A/C unbuilt". Trinity %'leri ~%35-40/%60/%95 güncelle.
3. **ROADMAP-GOD-LEVEL.md:46-95:** Sprint 185-200 spekülatif planı "historical plan (superseded)" başlığı altına al + planned-vs-actual reconciliation tablosu (beta-tracker ledger'dan). SİLME — provenance koru. (§EXECUTION TRACKER zaten eklendi, ona referans ver.)

**Kanıt:**
- `grep -c "PARTIAL\|Docker runtime" docs/release/beta-tracker.md` → ≥1
- `grep -c "Path B.*LIVE\|chat.ts.*Sprint 190" docs/vision/roadmap.md` → ≥1
- `grep -c "historical plan\|superseded\|EXECUTION TRACKER" docs/ROADMAP-GOD-LEVEL.md` → ≥2
- `npx vitest run tests/docs/doc-honesty.test.ts` → 3+ pass
**Test:** ≥3 (Gate#8 partial, chat-live-note, sprint-historical-mark)

---

## DALGA 2 — Canlı Doğrulama (1 task)

## Task 6: 202-006 — Provider-free smoke verify (sıfır-API-key + Ollama senaryosu)
- Model: opus
- Effort: normal
- Skills: devops-engineer, ci-testing
- Files: scripts/provider-free-smoke.mjs, docs/development/provider-free.md, tests/scripts/provider-free-smoke.test.ts
- Scope: scripts/, docs/development/, tests/scripts/
- Dependencies: 202-001, 202-002, 202-003

### Description
**Amaç:** Kuzey yıldızını otomatik kanıtla — "sıfır API key + Ollama config" ile provider çözümlemesi gerçekten Claude'a düşmeden Ollama'ya gidiyor mu.

**Çözüm:**
1. **provider-free-smoke.mjs (~100 LoC):** ANTHROPIC_API_KEY unset + `worker_provider=ollama` simüle et → `detectAvailableProviders()` ollama içeriyor mu, `getProviderAdapterForTask('ollama')` non-null mı, `getByProviderAndTier('ollama','standard')` model dönüyor mu, hardcode-fallback Claude'a düşmüyor mu. Her adım PASS/FAIL.
2. **provider-free.md:** provider-free kullanım rehberi (Ollama kur → config set → çalıştır).
3. Ollama gerçekten kurulu olmayabilir — smoke "resolution doğru" kanıtlar (gerçek spawn değil, routing).

**Kanıt:**
- `node scripts/provider-free-smoke.mjs` → tüm resolution adımları PASS
- `npx vitest run tests/scripts/provider-free-smoke.test.ts` → 4+ pass
**Test:** ≥4 (ollama-detect, adapter-resolve, model-resolve, no-claude-fallback)

---

## Sprint Sonu Notu

**Beklenen:** 6/6 DONE. Sprint 202 = deckent GERÇEKTEN provider-free (Ollama 1.sınıf spawn hedefi) + quota-safe (token throttle) + dokümanlar dürüst. Kuzey-yıldızı F1-P0 kapanır.

**Sprint sonrası:** F1-P1 (Docker multi-CLI), sonra F2 (native chat Path C). Master plan: docs/ROADMAP-GOD-LEVEL.md §EXECUTION TRACKER.

**Pre-flight:** subscription env temiz (`env -u ANTHROPIC_API_KEY`), creds canlı, build güncel, config 6×2g.

İlgili memory:
- [[project_api_mode_deferred_post_beta]] — API mode yasak
- [[feedback_no_auth_touch_during_sprint]] — sprint çalışırken auth touch yasak
- [[feedback_trust_brain_eval_not_worker]] — disk-verify ground truth, zaten-temiz tuzağı yok
- [[project_4cli_subscription_vision]] — multi-provider subscription vizyon
- [[feedback_brain_synthetic_nogo_disk_verify]] — disk-verify gate
