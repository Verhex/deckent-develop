# DIRECTIVES — Sprint 274: F1-TOK Faz 2 — CACHE-WARM Spawn + Cache-Gate Ölçümü

## Goal: F1-TOK'un cache-ekonomisi fazı: fleet spawn'ı cache-dostu hale gelir (ilk worker paylaşılan prefix'i YAZAR, kalan fleet OKUR — opt-in cache-warm gecikmesi), ledger cache-gate'i ölçülebilir olur (`deckent usage --sprint` PASS/FAIL satırı), retro hit-rate raporlar. 273'ün Skills-first + determinizm + gitignore-stab zemini üstüne oturur; bu sprint'in transcript'i ilk A/B verisini verir (hedef yön: task-başı ≤$0.45, boot-cw payı düşer). MİKRO-TASK + DEPENDENCY + MODEL-KATMANLAMA (opus 1 · sonnet 3 · haiku 2).

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable timer/fs/spawn; gerçek ağ/docker YASAK testlerde; spawnSync YASAK.
- **Fail-safe:** cache-warm/ledger hatası sprint'i ASLA geciktirmez/düşürmez (timer hatası → normal akış; best-effort).
- **Davranış korunumu:** her şey opt-in/additive; default'lar bayt-bayt aynı.
- **i18n-FIRST:** user-facing string `getMessage(key, lang)` (en+tr).
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş. Tier-1 smoke CC sprint-sonu (ADR-079).

---

## Task 1: cache_warm config bloğu
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/config-types.ts, src/core/config.ts, tests/core/config-cache-warm.test.ts
- Scope: src/core/, tests/core/

### Description
Config'e opt-in blok (resource_monitor deseni): `cache_warm?: { enabled: boolean; warm_delay_ms?: number (default 45000, min 5000, max 180000 validasyonu) }`. Blok yokken sıfır davranış değişikliği. Testler: geçerli/geçersiz değerler, sınırlar, default.

**Kanıt:** `npx vitest run tests/core/config-cache-warm.test.ts` yeşil; `grep -n "cache_warm" src/core/config-types.ts` ≥ 1. **Test:** 5+.

---

## Task 2: cache-warm spawn stratejisi — ilk worker yazar, fleet okur (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-spawner.ts, src/orchestra/sprint-phases.ts, tests/orchestra/cache-warm-spawn.test.ts
- Dependencies: 274-001
- Scope: src/orchestra/, tests/orchestra/

### Description
F1-TOK Faz 2 çekirdeği (kanıt: boot-cw fleet yazımının %44-63'ü — N worker aynı anda başlayınca HEPSİ paylaşılan prompt-prefix'ini ayrı ayrı cache'e YAZIYOR; tek worker önce başlasa kalanlar OKURDU). YALNIZ `config.cache_warm?.enabled === true` iken: sprint'in İLK spawn dalgasında dispatch-edilebilir task'lardan İLKİ hemen spawn olur; kalanların spawn'ı `warm_delay_ms` ertelenir (tek seferlik, sprint-başı gecikmesi — sonraki dispatch'ler/TOPP akışı NORMAL). Tasarım serbestliği: en az-invaziv noktayı SEÇ (sprint-spawner'ın ilk-dalga döngüsü ya da sprint-phases dispatch kapısı) ve yorumla belgele; injectable timer/sleep (testlerde gerçek bekleme YOK). Warm worker'ın hangi task olduğu log'lanır (debugLog). Disabled → bayt-bayt mevcut davranış (regresyon testleri). Testler: enabled'da ilk-spawn hemen + kalanlar gecikmeli (sahte timer ile sıra/çağrı doğrulaması); disabled aynılık; timer-throw → fail-safe normal akış; tek-task sprint'te gecikme YOK.

**Kanıt:** `npx vitest run tests/orchestra/cache-warm-spawn.test.ts` yeşil; `grep -n "cache_warm" src/orchestra/sprint-spawner.ts src/orchestra/sprint-phases.ts | head -2` ≥ 1. **Test:** 7+.

---

## Task 3: ledger cache-gate — sprint'in 2.+ worker'ları cache okuyor mu?
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: performance-analyzer
- Skills: typescript-expert, testing-expert
- Files: src/core/limit-ledger-report.ts, src/cli/commands/usage.ts, tests/core/limit-ledger-cache-gate.test.ts
- Scope: src/core/, src/cli/, tests/

### Description
`limit-ledger-report.ts`'e pure ek: `evaluateCacheGate(records, taskMap): CacheGateReport` — sprint'in worker-session'larını kronolojik sırala (ilk çağrı ts'ine göre); İLK session "warmer" sayılır; **2.+ session'ların her birinin İLK çağrısında `cacheRead >= cacheWrite` mi** → `{ pass: boolean, warmTaskId, sessions: [{taskId, firstCallCr, firstCallCw, readsWarm: boolean}], warmShare (2.+ içinde readsWarm oranı) }`. Gate eşiği: warmShare ≥ 0.8 → PASS (yorumla belgele — tek aykırı worker gate'i düşürmesin). `deckent usage --sprint N` çıktısına "Cache gate: PASS/FAIL (warm-share %X, warmer: <taskId>)" i18n satırı + `--json`'a alanlar. Testler: sentetik kayıtlar — pass/fail/karışık, tek-session sprint (gate N/A), warmShare hesabı.

**Kanıt:** `npx vitest run tests/core/limit-ledger-cache-gate.test.ts` yeşil; `grep -n "evaluateCacheGate" src/cli/commands/usage.ts` ≥ 1. **Test:** 7+.

---

## Task 4: retro limit-satırı genişletmesi — hit-rate + warm-share
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/sprint-reporter-usage.test.ts
- Dependencies: 274-003
- Scope: src/orchestra/, tests/orchestra/

### Description
273-004'ün "Limit burn" satırını genişlet (mevcut format korunur, alan eklenir): `Limit burn | $X (task-başı $Y, boot-cw %Z, hit-rate %H, cache-gate PASS/FAIL)` — hit-rate ledger özetinden, gate Task 3'ten (best-effort; gate hesaplanamazsa alan atlanır). Mevcut testler güncellenir + yeni alan testleri.

**Kanıt:** `npx vitest run tests/orchestra/sprint-reporter-usage.test.ts` yeşil; `grep -n "hit-rate\|cache-gate\|hitRate" src/orchestra/sprint-reporter.ts | head -2` ≥ 1. **Test:** 5+.

---

## Task 5: docs — cache_warm + adr_render + usage cache-gate
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/config-reference.md, docs/reference/features.md, docs/reference/cli-commands.md
- Dependencies: 274-001, 274-003
- Scope: docs/reference/

### Description
DİSKTEKİ koddan (inmemişleri yazma + .result'a not): (1) config-reference'a `cache_warm` bloğu + `prompt.adr_render: 'full'|'operative'` alanı (273-012; operative işaret sözleşmesi `<!-- worker-operative-start/end -->` dahil); (2) features.md'ye cache-warm spawn + cache-gate + adr-operative satırları; (3) cli-commands'a `deckent usage` cache-gate satırı notu.

**Kanıt:** `a=$(grep -ciE "cache_warm|adr_render" docs/reference/config-reference.md); [ $a -ge 2 ]` geçer. **Test:** yok — .result YAZ.

---

## Task 6: MASTER-PLAN — F1-TOK Faz 2 işaretleri
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Dependencies: 274-002, 274-003
- Scope: docs/

### Description
Diskte doğruladıklarını işaretle: F1-TOK Faz 2 (cache-warm spawn ✅, cache-gate ölçümü ✅, ADR-037 operative CC-yazıldı ✅, kind-limitler config'e uygulandı ✅) — tek-satır "✅ Sprint 274: ..." ekleri; A/B kanıt ölçümünün CC sprint-sonu yapılacağı notu. Mevcut metni SİLME.

**Kanıt:** `grep -c "Sprint 274" docs/MASTER-PLAN.md` ≥ 2. **Test:** yok — .result YAZ.

---

**Beklenen:** 6 mikro task (opus 1 · sonnet 3 · haiku 2), zincirler: 002→001 · 004→003 · 005→001,003 · 006→002,003. CC sprint sonu: **A/B ölçümü** — bu sprint'in transcript'inde `deckent usage --sprint 274` (273 zemini: Skills-first + determinizm + gitignore-stab + adr-operative + kind-limitler aktif; warm henüz değil — build ister) vs 271-273 baseline'ı: task-başı $, boot-cw payı, hit-rate + tsc + testler + commit/push + 🔨 BUILD. Sonraki: warm'ı dogfood'da aç + gerçek cache-gate PASS ölçümü → F1-TOK kapanış raporu.
