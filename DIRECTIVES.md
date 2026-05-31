# DIRECTIVES — Sprint 204: Wave-0 Hijyen (circular + ci-baseline + agent routing) + F2 Chat Streaming + F3 İskelet

## Goal: 3 kök sorunu kapat (DALGA 0) + ileri-vizyon iş (DALGA 1 F2 native chat streaming/multi-turn, DALGA 2 F3 process mode iskelet). YÜRÜTME: bol-küçük-task + 10 worker. Her task TEK dosya/TEK sorumluluk, ≤200 LoC, effort≤normal (high YOK — timeout önlemi). Sprint 203 disk-verify 9/9 landed (Brain "6 NO_GO" sentetikti).

Bağlam (Sprint 203 sonrası tam-suite analizi):
- **16 test fail = PRE-EXISTING circular import** (model-equivalence.ts:15 top-level `modelRegistry.getByTier()` modül-yükleme anında çalışıyor; provider.ts→model-equivalence→model-registry zincirinde TDZ). Sprint 097'den beri var, Sprint 202/203 EKLEMEDİ. İzole testler PASS, tam-suite'te belirli import sırası tetikliyor.
- **ci-baseline.json kronik sahte** (34 fail/0 pass) — sprint-sonu auto-regen API-key env'le vitest'i 0-pass çalıştırıp üzerine yazıyor.
- **Agent routing boşluğu:** built-in 15 agent'ın hiçbiri `intent.primary: "implementation"` için aday değil (architect=design, refactorer=refactor, bug-fixer=bugfix...). Tek aday scope-kör `temp-react-ts-specialist` (impl@6) → her implementation task'ı onu seçiyor. deckent stack=typescript/none, doğru template `ts-architect` mevcut ama üretilmemiş; eski (Sprint 185) react agent'lar yer kapmış. Demote eşiği zayıf (%40 fail < %50).

---

## Tüm task'lar için ortak kurallar

- **Subscription mode ZORUNLU** — sprint `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY` ile başlatılır. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite içine yazar. Host-facing config'lere `/workspace` mutlak yolu YAZMA, `$CLAUDE_PROJECT_DIR`.
- **KÜÇÜK TASK DİSİPLİNİ:** tek-dosya/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- Her kod task'ı vitest min 4 test. `dosya:satır` kanıtı zorunlu.
- **Dishonest YASAK** — gerçekten ölç, "zaten var +0/-0 DONE" tuzağı yok ([[feedback_trust_brain_eval_not_worker]]).
- ESM `.js` import suffix zorunlu. ADR-010 sıfır yeni runtime dep.
- Regresyon: yeni fail EKLEME. Hedef tam-suite fail 16→≤4 (Wave-0 circular düzelince düşer).

---

## DALGA 0 — Hijyen / Kök-Sorun (4 küçük task, paralel)

## Task 1: 204-001 — Circular import fix: MODEL_TIERS lazy-init
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/model-equivalence.ts, tests/core/model-equivalence-lazy.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** model-equivalence.ts:14-19 `export const MODEL_TIERS = { premium: modelRegistry.getByTier('premium')... }` — modül yüklenir yüklenmez (top-level) `modelRegistry`'yi çağırıyor. provider.ts:5 → model-equivalence import edince, model-registry singleton henüz kurulmamışsa `getByTier is not a function` (circular/TDZ). 16 test bu yüzden tam-suite'te fail (izole PASS).
**Çözüm:** MODEL_TIERS'i **lazy** yap — top-level çağrıyı kaldır, `getModelTiers()` fonksiyonu VEYA lazy getter ile sarmala (ilk erişimde hesapla, cache'le). Mevcut `MODEL_TIERS` tüketicilerini bul (`grep -rn "MODEL_TIERS" src/`) ve lazy erişime uyarla. Davranış birebir korunsun.
**Kanıt:** `grep -n "getByTier" src/core/model-equivalence.ts` → top-level değil fonksiyon/getter içinde; `npx vitest run tests/orchestra/archive-directives.test.ts tests/core/model-equivalence-lazy.test.ts` → PASS (circular gitti)
**Test:** ≥4 (lazy init çalışır, tier içerikleri doğru, cache idempotent, circular-import smoke)

## Task 2: 204-002 — ci-baseline auto-regen gerçek-değer fix
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: src/orchestra/sprint-docs-updater.ts, tests/orchestra/ci-baseline-honest.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 204-001

### Description
**Problem:** Sprint-sonu ci-baseline.json regen, vitest'i API-key kalıntılı/yanlış env'le çalıştırıp `testPassed:0, testFailed:34` (tüm suite "fail") yazıyor. Gerçek: ~17700 pass. Bu sahte baseline her sprint disk-verify'ı kirletiyor.
**Çözüm:** baseline yazımını **honest** yap: vitest 0-pass döndüyse (açık env/auth hatası) baseline'ı SIFIRLAMA — önceki geçerli değeri koru VEYA "baseline güncellenmedi: suspicious 0-pass" uyarısı yaz, eski değeri bırak. `testPassed===0 && testFailed>0` desenini "şüpheli" kabul et, üzerine yazma. (Nerede yazıldığını `grep -rn "ci-baseline\|testPassed" src/orchestra/` ile bul; sprint-docs-updater veya sprint-reporter olabilir — doğru dosyayı düzelt.)
**Kanıt:** `grep -c "testPassed === 0\|suspicious\|0-pass\|preserve.*baseline" src/orchestra/sprint-docs-updater.ts` → ≥1; `npx vitest run tests/orchestra/ci-baseline-honest.test.ts` → 4+ pass
**Test:** ≥4 (0-pass → eski korunur, gerçek değer → yazılır, ilk-baseline yok → yaz, idempotent)

## Task 3: 204-003 — Implementation intent için built-in agent adaylığı
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/agent-pool.ts, tests/core/agent-impl-candidate.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** Built-in 15 agent'ın HİÇBİRİ `intent.primary: "implementation"` activation kuralına sahip değil (architect=design@8, refactorer=refactor@10, bug-fixer=bugfix@10...). Bu yüzden her implementation task'ı scope-kör `temp-react-ts-specialist` (impl@6) tarafından kapılıyor. deckent React değil — yanlış agent.
**Çözüm:** Built-in agent tanımlarında `refactorer` VE `architect`'e `implementation` intent'i için **orta puanlı** aday kuralı ekle (örn `{intent.primary:"implementation"}@7` refactorer, `@6` architect — kod-geliştirme genel implementation'ın doğal sahibi). Böylece built-in (≥6) scope-kör temp-react'i (6) tie-break + learning bonus ile geçer. Mevcut intent kuralları korunur (sadece ekleme). agent-pool.ts'teki built-in tanımlara dokun.
**Kanıt:** `grep -c "implementation" src/core/agent-pool.ts` → ≥2; `npx vitest run tests/core/agent-impl-candidate.test.ts` → 4+ pass (implementation task'ı built-in agent seçer, temp değil)
**Test:** ≥4 (impl→refactorer/architect aday, temp-react kazanmaz, design hâlâ architect, refactor hâlâ refactorer)

## Task 4: 204-004 — Stale temp-agent demote eşiği + react-template stack-guard
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, code-simplifier
- Files: src/orchestra/promotion-pipeline.ts, tests/orchestra/temp-agent-demote.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem:** `temp-react-ts-specialist` %60 success (=%40 fail) `maxFailRate=0.50` eşiğini geçemiyor → demote edilmiyor, 119 task boyunca takılı kaldı. Ayrıca react template'i TS-only (framework=none) projede üretilmemeli ama eski state kalmış.
**Çözüm:** (1) Demote eşiğini **akıllılaştır**: `successRate < 0.65 && totalTasks >= 20` → düşük-performans demote (mevcut %50 fail eşiğine EK, OR mantığı). Built-in/permanent guard'ı koru (asla built-in demote etme). (2) Mevcut underperforming temp-react agent'ları bu eşik yakalasın. Stack-guard düzeltmesi opsiyonel-not (temp-agent-generator stack match) — bu task sadece demote logic.
**Kanıt:** `grep -c "0.65\|underperform\|successRate <" src/orchestra/promotion-pipeline.ts` → ≥1; `npx vitest run tests/orchestra/temp-agent-demote.test.ts` → 4+ pass
**Test:** ≥4 (%60@120task → demote, %85 → korunur, built-in asla demote, az-task → wait)

---

## DALGA 1 — F2 Native Chat Streaming + Multi-turn (3 küçük task)

## Task 5: 204-005 — Native chat streaming response (Path C)
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat-native.ts, tests/cli/chat-native-stream.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 204-001

### Description
**Problem:** Sprint 203 chat-native.ts iskeleti tool-use loop var ama yanıt streaming değil (blocking). F2-003 streaming.
**Çözüm:** chat-native loop'a streaming yanıt ekle — provider adapter streaming interface (varsa kullan, yoksa chunk-yield iskeleti). stdout'a incremental yaz. Gerçek SDK değil, adapter interface üzerinden (mock'lanabilir). ≤200 LoC ekleme.
**Kanıt:** `grep -c "stream\|chunk\|write.*stdout\|async.*yield" src/cli/commands/chat-native.ts` → ≥2; `npx vitest run tests/cli/chat-native-stream.test.ts` → 4+ pass
**Test:** ≥4 (stream chunk akışı, tam yanıt birleşir, boş stream, hata mid-stream)

## Task 6: 204-006 — Multi-turn context window (son N turn inject)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/chat-native-multiturn.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 204-005

### Description
**Problem:** chat-native her turn'ü bağımsız işliyor; önceki turn'ler context'e girmiyor (multi-turn yok).
**Çözüm:** appendChatTurn ile kaydedilen son N turn'ü (Sprint 203'te wire edildi) provider çağrısına context olarak inject et. Sliding window (örn son 10 turn). Token-aware truncation basit.
**Kanıt:** `grep -c "slice(-\|lastN\|recentTurns\|context.*turn" src/cli/commands/chat-native.ts` → ≥1; `npx vitest run tests/cli/chat-native-multiturn.test.ts` → 4+ pass
**Test:** ≥4 (son N inject, window taşması truncate, ilk turn boş-context, sıra korunur)

## Task 7: 204-007 — Chat resume (--resume son oturumu yükle)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/chat.ts, tests/cli/chat-resume-flag.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 204-005

### Description
**Problem:** chat oturumu kapanınca geçmiş kayboluyor; resume yok.
**Çözüm:** `deckent chat --native --resume` flag'i → memory'den son oturum turn'lerini yükle, devam et. appendChatTurn okuma.
**Kanıt:** `grep -c "resume" src/cli/commands/chat.ts` → ≥2; `npx vitest run tests/cli/chat-resume-flag.test.ts` → 3+ pass
**Test:** ≥3 (resume flag parse, geçmiş yükle, geçmiş yok → temiz başla)

---

## DALGA 2 — F3 Process Mode İskelet (2 küçük task)

## Task 8: 204-008 — Multi-tenant tenantId iskelet
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/tenant-context.ts, tests/core/tenant-context.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** F3 process mode (AI System Worker yüzü) için tenant izolasyon temeli yok. ROADMAP F3-001.
**Çözüm:** İSKELET — `tenant-context.ts` yeni dosya: `TenantContext` tipi (tenantId, isolationRoot, createdAt) + `resolveTenant()` (default 'local' tenant, env/config'ten okuma) + path-scoping helper (tenant başına `.deckent/tenants/<id>/` izolasyon yolu). Gerçek multi-tenant runtime DEĞİL, tip + resolver iskeleti. ≤200 LoC.
**Kanıt:** `ls src/core/tenant-context.ts`; `grep -c "TenantContext\|resolveTenant\|tenantId" src/core/tenant-context.ts` → ≥3; `npx vitest run tests/core/tenant-context.test.ts` → 4+ pass
**Test:** ≥4 (default local tenant, custom tenantId, isolation path, geçersiz id reddi)

## Task 9: 204-009 — F3 ADR taslağı + ROADMAP tracker güncelle
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/067-process-mode-tenancy.md, docs/ROADMAP-GOD-LEVEL.md, tests/docs/adr-067.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem:** F3 process mode kararı ADR'ye geçmemiş; ROADMAP tracker F2/F3 ilerlemeyi yansıtmıyor.
**Çözüm:** ADR-067 taslağı (process mode + tenant izolasyon kararı, MADR formatı, status: proposed). ROADMAP §EXECUTION TRACKER: F2-003 streaming/multi-turn/resume DONE işaretle, F3-001 tenantId iskelet DONE, provider-free/konuşulabilir yüzdeleri güncelle.
**Kanıt:** `grep -c "tenant\|process.mode\|isolation" docs/adr/067-process-mode-tenancy.md` → ≥2; `npx vitest run tests/docs/adr-067.test.ts` → 3+ pass
**Test:** ≥3 (ADR-067 MADR yapı, tenant bölümü, ROADMAP F2/F3 güncel)

---

## Sprint Sonu Notu

**Beklenen:** 8-9/9 DONE. Sprint 204 = hijyen kapanış (circular fix → tam-suite yeşile yakın, ci-baseline honest, agent routing düzeldi → built-in agent'lar implementation'a aday) + F2 chat streaming/multi-turn/resume + F3 tenant iskelet.

**Sprint sonrası:** F3 process mode tamamla (scheduled flows + cron) → F4 enterprise. ROADMAP §EXECUTION TRACKER.

**Pre-flight:** subscription env temiz (`env -u ANTHROPIC_API_KEY`), creds canlı, **build güncel (Alperen build:all + /mcp restart yaptı)**, config max_workers=10.

İlgili memory:
- [[feedback_trust_brain_eval_not_worker]] — disk-verify ground truth, zaten-temiz tuzağı yok
- [[feedback_build_mcp_restart_coordination]] — build+restart Alperen yapar
- [[project_api_mode_deferred_post_beta]] — API mode yasak
- [[project_4cli_subscription_vision]] — multi-provider subscription vizyon
- [[feedback_brain_synthetic_nogo_disk_verify]] — sentetik NO_GO, disk-verify zorunlu
