# DIRECTIVES — Sprint 232: Memory-Loss Kökten Kapanış (decay 3-bug zinciri)

## Goal: **Memory-wipe'ı KÖKTEN bitir.** Sprint 226/231 canlı dogfood'unda 3. kez tekrarlayan memory-loss'un kök-neden zinciri file:line grep-doğrulandı (sprint-231 canlı kanıt: memory 91→1, chat 30→0, retro/sprint 4→1; adr 75 exempt kurtuldu): (1) **🔴 PRIMARY — `decay_after_sprints=20` config runDecay'e GEÇMİYOR** → `debt-manager.ts:641` hardcoded `8`'e düşüyor (threshold 223, çok agresif), (2) **learnings (memory/retro/sprint/pattern) decay-exempt DEĞİL** → siliniyorlar (sadece adr/identity exempt), (3) **catastrophic-abort `>` kullanıyor** → tam %50'de (125/250) tetiklenmiyor. **+ §4G handoff 2 edge:** (4) **ci-sim SIGINT-restore yok** → interrupted ci-sim canlı memory.db'yi boş bırakır (sprint-231 empty-backup semptomu), (5) **writeGuardedExports dbCount===0'ı korumuyor** → boş-DB'de dolu disk-export ezilir (decay-dışı boşluk). **5 task DISTINCT filesWrite → tam paralel-güvenli (tek wave). src/dashboard'a DOKUNULMAZ** (paralel dashboard FAZ5 var). **god-level, hermetik, CI yeşil KORUNUR.**

## Ortak kurallar
- **🟢 RUN-VERIFY ([[feedback_proof_of_function_dod]]):** kanıt **çağıran** dosyada (def DIŞLA). Bu sprint çoğunlukla **Tier-0 (orchestra/core)**; 232-003 `memory backup` CLI'sı Tier-1 değil (internal-op) → unit yeterli, ama backup gerçek-dosya üretmeli (run-verify).
- **🔴 HERMETİK ([[project_ci_green_root_causes]]):** tmpdir + sandbox HOME, async spawn (spawnSync YASAK), `test:ci-sim` yeşil. CI yeşil KORUNUR.
- **🔴 NEVER-LOSE-MEMORY ([[feedback_db_silmek_yasak]] · [[project_brain_integrity_sprint226_cluster]]):** learnings asla sessizce uçmaz; decay config'e uyar + abort defansif.
- ESM `.js`. Subscription (`env -u ANTHROPIC_API_KEY`). ≤200 LoC tercih, YENİ TEST DOSYASI. **Sadece kendi filesWrite'ına yaz** (paralel-güvenlik). Tek wave (3 task distinct dosya); `dependency_pipeline_enabled=false` → Brain manuel.

---

## Task 1: 232-001 — [P0] ⭐ decay_after_sprints config wire (PRIMARY kök)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/debt-manager.ts, tests/orchestra/decay-config-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** `sprint-finalizer.ts:782-794` decay'i çağırırken **`config.decay_after_sprints`'i GEÇMİYOR**; `runDecay` (`debt-manager.ts:639-667`, `:641`) `decaySprints` parametresini **hardcoded `8`** default'una düşürüyor. Sonuç: config'de `decay_after_sprints=20` (`config.ts:927`) olmasına rağmen decay 8-sprint penceresiyle (threshold = currentSprint−8 = 223) koşuyor → çok daha derin kesim → memory-loss'un PRIMARY tetikleyicisi.
**Çözüm:** `sprint-finalizer.ts`'te decay çağrılarına (`runDecay(...)` her iki yol: budget-force + normal) `config.decay_after_sprints`'i **explicit geçir**; `runDecay`/`debt-manager.ts` imzasını config-değerini onurlandıracak şekilde wire et (hardcoded 8 fallback yalnızca config undefined ise). **Caller `sprint-finalizer.ts` + `debt-manager.ts` (her ikisi de bu task'ın scope'unda — config akışı).** decay() def (`memory-store.ts`) DIŞLA.
**Kanıt:** `grep -c "decay_after_sprints" src/orchestra/sprint-finalizer.ts src/orchestra/debt-manager.ts` → ≥2 (config akışı wire); `npx vitest run tests/orchestra/decay-config-wire.test.ts` → 3+ pass
**Test:** ≥3 (config decay_after_sprints=20 → runDecay 20 alır/threshold doğru; config undefined → fallback; finalize decay'e config'i geçirir — hermetik, mock store.decay spy ile geçen değeri assert et)
**Smoke:** (Tier-0 orchestra) unit yeterli.

## Task 2: 232-002 — [P0] learnings decay-exempt (memory/retro/sprint/pattern)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-retro-writer.ts, src/orchestra/auditor.ts, tests/orchestra/learnings-decay-exempt.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** Learning-tipi entry'ler `decay_exempt` set ETMEDEN insert ediliyor → default `false` → decay siliyor. `sprint-retro-writer.ts` (sprint `:761-771`, retro `:775-784`, memory `:790-811`) + `auditor.ts` (pattern `:640-649`) hiçbiri `decay_exempt:true` vermiyor; oysa adr (`adr-seed.ts`) + identity (`identity-generator.ts:338`) exempt. Kullanıcı TÜM history'yi recall etmek istiyor → learnings asla auto-silinmemeli.
**Çözüm:** `sprint-retro-writer.ts`'teki memory + retro + sprint insert/upsert çağrılarına ve `auditor.ts`'teki pattern insert'ine **`decay_exempt: true`** ekle. Böylece learnings ADR gibi kalıcı (git memory.md export zaten arşiv; DB de kaybetmesin). **Caller `sprint-retro-writer.ts` + `auditor.ts`.** memory-store.ts def DIŞLA. (chat: bu task kapsamı dışı — ayrı, ephemeral.)
**Kanıt:** `grep -c "decay_exempt: true\|decay_exempt:true" src/orchestra/sprint-retro-writer.ts src/orchestra/auditor.ts` → ≥4; `npx vitest run tests/orchestra/learnings-decay-exempt.test.ts` → 4+ pass
**Test:** ≥4 (insert edilen memory/retro/sprint/pattern entry'leri decay_exempt=1; bu entry'ler decay()'de SURVIVE eder (eski sprint_num olsa bile); adr/identity etkilenmez — hermetik tmpdir DB)
**Smoke:** (Tier-0) unit yeterli.

## Task 3: 232-003 — [P1] abort `>=` operatörü + WAL-safe `deckent memory backup` CLI
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/memory-store.ts, src/cli/commands/memory.ts, tests/core/memory-backup-and-abort.test.ts
- Scope: src/core/, src/cli/, tests/core/
### Description
**Problem (doğrulandı):** (a) `memory-store.ts:883` catastrophic-abort `toDecay.length / nonExemptTotal > CATASTROPHIC_RATIO` **strict `>`** → tam %50'de (125/250=0.5) tetiklenmiyor; `>=` olmalı (defansif, sınır-dahil). (b) WAL-safe backup CLI yok → pre-sprint `cp memory.db` WAL modunda BOŞ kopya üretiyor (sprint-231 kanıt: 100KB boş yedek). `MemoryStore.getRawDb()` (`:1235`) + better-sqlite3 `db.backup()` + `pragma wal_checkpoint` mevcut.
**Çözüm:** (a) `memory-store.ts:883` `>` → `>=` (tek-karakter, abort %50-dahil yakalar). (b) `cli/commands/memory.ts`'e (`stats`'tan sonra, `:139`) **`memory backup [--output <path>] [--checkpoint]`** subcommand ekle: `store.getRawDb()` → `pragma('wal_checkpoint(TRUNCATE)')` → `db.backup(out)` → non-boş checkpoint'li .db üretir; default out `.brain/memory.db.bak-<sprintId>-<ts>` (ts caller'dan/Date değil — i18n mesajı `getMessage`). **Caller memory-store.ts (operatör) + cli/commands/memory.ts (subcommand).**
**Kanıt:** `grep -c "wal_checkpoint\|\.backup(" src/cli/commands/memory.ts` → ≥1; `grep -c ">= CATASTROPHIC_RATIO\|>=CATASTROPHIC" src/core/memory-store.ts` → ≥1; `npx vitest run tests/core/memory-backup-and-abort.test.ts` → 4+ pass
**Test:** ≥4 (tam %50 decay → aborted:true (>= fix); >%50 → aborted; backup non-boş + entry-count korunur (gerçek tmpdir DB backup); backup WAL-checkpoint'li) — hermetik
**Smoke:** backup gerçek-dosya üretir (run-verify: tmpdir DB → backup → entry-count eşit, dosya>0).

## Task 4: 232-004 — [P1] ci-sim SIGINT/SIGTERM restore handler (GAP A)
- Model: sonnet
- Effort: low
- Skills: ci-testing, typescript-expert
- Files: scripts/test-ci-sim.mjs, tests/scripts/ci-sim-signal-restore.test.ts
- Scope: scripts/, tests/scripts/
### Description
**Problem (doğrulandı):** `scripts/test-ci-sim.mjs` try/finally + `restorePaths` (`:53`) var ama **SIGINT/SIGTERM handler YOK** → Ctrl-C ile yarıda kesilen ci-sim'de finally ÇALIŞMAZ → `.brain/memory.db` stash'te kalır, canlı memory.db kalıcı BOŞ (veri stash'te güvende ama operatör "DB silindi" görür — sprint-231 empty-backup'ın gerçek nedeni).
**Çözüm:** `process.on('SIGINT', ...)` + `process.on('SIGTERM', ...)` ekle → `restorePaths(stashed)` çağır → temiz exit (kod 2). Mevcut try/finally korunur (restorePaths zaten idempotent/try-catch'li → çift-restore zararsız). Caller test-ci-sim.mjs.
**Kanıt:** `grep -cE "process.on\(.(SIGINT|SIGTERM)" scripts/test-ci-sim.mjs` → ≥2; `npx vitest run tests/scripts/ci-sim-signal-restore.test.ts` → 2+ pass
**Test:** ≥2 (spawn ci-sim child → SIGINT gönder → memory.db geri yüklendi assert; SIGTERM → restore) — async hermetik (spawn, tmpdir, spawnSync YASAK)
**Smoke:** (script) unit yeterli.

## Task 5: 232-005 — [P1] writeGuardedExports dbCount===0 disk-protect (GAP B)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/memory-export.ts, tests/core/export-empty-db-guard.test.ts
- Scope: src/core/, tests/core/
### Description
**Problem (doğrulandı):** `writeGuardedExports` guard (`memory-export.ts:427`) SADECE `if (dbCount > 0 && renderIsEmpty)` → **dbCount===0'da guard düşer** → diskteki DOLU .md `writeFileSync` ile BOŞ ezilir. DB herhangi bir sebeple boşken (ci-sim penceresi / interrupted ci-sim / manuel) export çalışırsa sağlam exports silinir; guard mevcut DİSK dosyasını kontrol etmiyor (yalnız DB-count vs render). 231-003 decay-floor decay'den-boşalmayı kapattı, bu decay-DIŞI boşluk için kalan açık.
**Çözüm:** guard'a ek koşul — `dbCount===0 && existsSync(filePath) && mevcut-dosya-DOLU (içerik emptyMarker İÇERMİYOR / anlamlı satır var) → yazmayı REDDET + warn + skipped'a ekle`. Böylece boş-DB'de dolu disk-export korunur. Caller memory-export.ts (231-002 ile aynı fonksiyon, çakışma yok — 232 hiçbir task memory-export'a dokunmuyor).
**Kanıt:** `grep -cE "dbCount === 0|existsSync" src/core/memory-export.ts` → ≥1; `npx vitest run tests/core/export-empty-db-guard.test.ts` → 3+ pass
**Test:** ≥3 (boş DB + dolu disk decisions.md → KORUNDU/skipped; boş DB + boş/yok disk → normal yaz; dbCount>0 normal akış regresyon-yok) — hermetik tmpdir
**Smoke:** (Tier-0) unit yeterli.

---

**Beklenen:** 5/5 DONE, 0 NO_GO, 0 scope-collision (distinct: sprint-finalizer+debt-manager / sprint-retro-writer+auditor / memory-store+cli-memory / test-ci-sim / memory-export → tek wave). **src/dashboard'a SIFIR dokunuş.** Bu sprint, memory-loss'u **5 katmanda** kapatır: config-doğru (232-001 PRIMARY) + learnings-kalıcı (232-002) + abort-defansif & WAL-safe-backup (232-003) + ci-sim-interrupt-safe (232-004) + boş-DB-export-koruma (232-005). Build sonrası bir daha wipe OLMAMALI. CI yeşil KORUNUR.

**Pre-flight:** main temiz+commit'li+push'lu ✅ (reset-bug — [[project_deckent_self_git_mutation_bug]]). **DB WAL-checkpoint'li yedek alındı** (`bak-sprint231-recovered`, 206 entry — çıplak cp DEĞİL). **CLI'dan `env -u ANTHROPIC_API_KEY`**. `brain_planning=structured` (AI-hang yok). Tek wave (3 paralel ayrık-dosya). Her wave sonrası git log + git stash list (reset kontrol). Sprint sonrası DB entry-count ≥206 korunmalı (`deckent memory stats` → memory≥91); wipe olursa `bak-sprint231-recovered`'dan restore.

İlgili memory: [[project_brain_integrity_sprint226_cluster]] · [[feedback_db_silmek_yasak]] · [[feedback_trust_brain_eval_not_worker]] · [[project_ci_green_root_causes]] · [[feedback_proof_of_function_dod]]
İlgili ADR: ADR-070 (eval/memory integrity) · ADR-046 (self-update hook) · ADR-009 (debt format)
