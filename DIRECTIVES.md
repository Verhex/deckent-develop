# DIRECTIVES — Sprint 197: Disk-Verify Gate Fix + RAM Mitigation + Retroactive Reclassify Run (3 dalga, 5 task)

## Goal: 1 Haziran 2026 OSS GA beta launch'a **4 gün kala** Brain'in sentetik NO_GO problemini KÖKÜNDEN çöz (disk-verify gate untracked file gap), WSL2 OOM kill problemini önle (max_workers/memory budget), Sprint 191-196 sentetik NO_GO'larını retroactive reclassify ile DONE'a çevir (script Sprint 196'da land etti, sadece run), CHANGELOG 30-sprint backfill scripti çalıştır. Sprint 195/196 öğrenimleri + bugün +5443 LoC disk-verify rescue → Sprint 197 bu fix'leri kalıcı + ileriye sürdürülebilir hale getirir.

Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md`.

Kanıt-temelli:
- Sprint 196 5 NO_GO, disk gerçeği 8/8 DONE → **disk-verify gate untracked yakalamadı** (197-001 fix)
- Sprint 195 195-004 + 196-005 + 196-003-fix + 196-005-fix container OOM (exit 137) → 3 paralel opus WSL2'de patlıyor (197-002 fix)
- 196-001 scripts/sprint-retroactive-reclassify.mjs land etti, henüz çalıştırılmadı → Sprint 191-196 ~20 NO_GO açık (197-003 run)
- 195-002 scripts/changelog-backfill.mjs land etti, 19 sprint backfill yapıldı, **19 sprint daha kalan** (197-004 run)
- temp-react-ts-specialist 3 task atandı 196'da %33 başarı → WP-1 persona matcher canlı test (197-005)

---

## Tüm task'lar için ortak kurallar (Sprint 196 öğrenimi)

- **test scope ZORUNLU explicit:** `scope.filesWrite` test dosyalarını içermeli (`tests/orchestra/`, `tests/scripts/`, `tests/docker/` gibi).
- Worker yalnızca `scope.filesWrite` içine yazar (ADR-037 + honest-gate).
- Her kod task'ı **vitest minimum 4 test**. Script/audit task'ı 3 test yeterli.
- `dosya:satır` kanıtı zorunlu, `.result` notes'una kanıt komutu çıktısı yapıştır.
- ADR ihlali → NO_GO + amendment proposal.
- `.brain/memory.db` write yalnızca core/memory-*.ts yolundan; **DB silmek YASAK**.
- Sprint sonu tsc temiz + test regresyon yok.
- **Dishonest result YASAK** — linesAdded claim disk'le çakışmalı.
- **Sprint çalışırken /login, claude logout, MCP restart YASAK** ([[feedback_no_auth_touch_during_sprint]]).
- **API mode YASAK** — Tier 1 30K tok/min cap.
- **Karpathy 4-disciplines**: `.plan` first, YAGNI, surgical, goal-driven.
- **YENİ Sprint 197**: `scope.filesWrite` test dosyalarını derive-test-scope (Sprint 196 WP-3) ile auto-include — DIRECTIVES'te eksik kalırsa Brain otomatik ekler.

---

## DALGA 0 — Disk-Verify Gate Untracked Fix (1 task — ZORUNLU İLK)

> Sprint 196 BÜYÜK keşif: Brain disk-verify gate runtime'da var (195-001) AMA untracked dosyaları yakalamıyor. 196-005 token-counter.ts YENİ DOSYA + tüm Sprint 196 NO_GO'larının çoğu untracked dosya kaynaklı. Bu fix sentetik NO_GO root cause'unun **son katmanı**.

---

## Task 1: 197-001 — disk-verify gate untracked file detection fix
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/disk-verify.ts, src/orchestra/result-collector.ts, src/orchestra/sprint-checkpoint.ts, tests/orchestra/disk-verify.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**Problem (kanıt-temelli):** Sprint 196'da 196-005 (token-counter.ts YENİ DOSYA) Brain NO_GO yazıldı, disk-verify gate **untracked** yakalayamadı çünkü:
- `verifyDiskAgainstClaim()` muhtemelen sadece `git diff --numstat HEAD` çağırıyor
- Yeni dosyalar `git diff` ile **görünmez** — `git ls-files --others --exclude-standard` gerek
- 195-001 worker'ı helper'ı yazdı (`gitLsOthersProvider` seam mevcut) ama wire eksik

**Çözüm:**

1. **`src/orchestra/disk-verify.ts` (mevcut, +30 LoC):**
   - `verifyDiskAgainstClaim()` return type'ında zaten `untrackedFiles: string[]` var
   - `hasDiskEvidence = linesAdded > 0 || untrackedFiles.length > 0` doğrula
   - `gitLsOthersProvider` integration yap — eğer mock seam doğru ama production wire eksikse fix
   - Scope-filtered: `git ls-files --others --exclude-standard -- ${scope.directories}` ile sadece scope'taki untracked'ı al

2. **`src/orchestra/result-collector.ts` (mevcut, +5-10 LoC):**
   - Sentetik NO_GO öncesi gate çağrısında `hasDiskEvidence` short-circuit kontrol et
   - Event payload'a `untrackedFiles` ekle (audit trail)

3. **`src/orchestra/sprint-checkpoint.ts` (mevcut, +5 LoC):**
   - Recovery NO_GO gate'inde aynı `hasDiskEvidence` kontrol

4. **`tests/orchestra/disk-verify.test.ts` (mevcut, +6 yeni test):**
   - (a) Tracked değişiklik YOK + untracked YENİ DOSYA → hasDiskEvidence:true, MANUAL_REVIEW_REQUIRED
   - (b) Untracked dosya scope dışında → ignore
   - (c) Untracked + tracked karışık → her ikisi de count
   - (d) gitLsOthers fail (sandbox) → graceful (sadece numstat'a düş)
   - (e) result-collector integration (mock setup)
   - (f) sprint-checkpoint integration

**Kanıt:**
- `grep -n "untrackedFiles\|gitLsOthers" src/orchestra/disk-verify.ts src/orchestra/result-collector.ts` → 4+ match
- `npx vitest run tests/orchestra/disk-verify.test.ts` → 24+ pass (mevcut 18 + 6 yeni)
- Manuel canlı test: Sprint 197 worker'ı yeni dosya yazıp .result yazmadan exit ederse Brain MANUAL_REVIEW_REQUIRED yazmalı

**Test:** ≥6 yeni test (a-f).

---

## DALGA 1 — Retroactive Reclassify + CHANGELOG Backfill (2 task, paralel)

> Sprint 196'da land eden script'lerin çalıştırılması. Yeni kod gerekmez, sadece script run + sonuç review.

---

## Task 2: 197-002 — Sprint 191-196 retroactive reclassify çalıştır (script run + audit)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: scripts/reclassify-sprint-191-196.json, .deckent/decisions/decision-reclassify-2026-05-26.json
- Scope: scripts/, .deckent/decisions/

### Description

**Problem:** Sprint 191-196 toplam ~20 sentetik NO_GO task disk-verified DONE ama memory.db sprint outcomes hâlâ NO_GO. Agent stats çarpıtılmış (temp-react-ts-specialist 0/3 → 3/3 olmalı).

**Çözüm:**

1. **`scripts/reclassify-sprint-191-196.json` (yeni veri dosyası, ~30 entry):**
   ```json
   [
     {"sprint":"sprint-191","task":"191-002","decision":"DONE","reason":"Disk verified, commit..."},
     {"sprint":"sprint-194","task":"194-001","decision":"DONE","reason":"+321 LoC, commit 37ba9532"},
     {"sprint":"sprint-194","task":"194-002","decision":"DONE","reason":"+911 LoC, commit a6aa86ce"},
     {"sprint":"sprint-194","task":"194-004","decision":"DONE","reason":"WORKER_NODE_OPTIONS landed"},
     {"sprint":"sprint-194","task":"194-005","decision":"DONE","reason":"+328 LoC, commit 1bec2144"},
     {"sprint":"sprint-195","task":"195-004","decision":"DONE","reason":"selfAssessment DONE, OOM not defect"},
     {"sprint":"sprint-195","task":"195-004-fix","decision":"DONE","reason":"Container OOM, code correct"},
     {"sprint":"sprint-196","task":"196-003","decision":"DONE","reason":"+144 claude.ts + 6 test pass, commit 330d4e80"},
     {"sprint":"sprint-196","task":"196-005","decision":"DONE","reason":"+token-counter.ts + 12 test pass, commit ea18ac05"},
     {"sprint":"sprint-196","task":"196-008","decision":"GO_WITH_TECH_DEBT","reason":"Consolidated entry, format diff"},
     {"sprint":"sprint-196","task":"196-003-fix","decision":"DONE","reason":"OOM not defect"},
     {"sprint":"sprint-196","task":"196-005-fix","decision":"DONE","reason":"OOM not defect"}
   ]
   ```

2. **Script run:**
   ```bash
   node scripts/sprint-retroactive-reclassify.mjs --from-file scripts/reclassify-sprint-191-196.json
   ```

3. **Audit trail check:** `.deckent/decisions/decision-reclassify-2026-05-26.json` 12+ entry içermeli

4. **Memory.db verify:** `deckent agent stats --agent temp-react-ts-specialist` → Sprint 195-196 entries DONE'a güncellenmiş

**Kanıt:**
- `node scripts/sprint-retroactive-reclassify.mjs --from-file scripts/reclassify-sprint-191-196.json` → "Reclassified 12 tasks"
- `ls .deckent/decisions/decision-reclassify-*` → en az 1 dosya
- `cat .deckent/decisions/decision-reclassify-*.json | jq '.entries | length'` → 12

**Test:** Audit task — script Sprint 196'da test edilmişti (25 test pass), bu task sadece RUN + data verification.

---

## Task 3: 197-003 — CHANGELOG Sprint 172-194 kalan 19 entry backfill (script run)
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: docs/CHANGELOG.md
- Scope: docs/

### Description

**Problem:** Sprint 195 195-002 backfill scripti land etti, 19 sprint backfill yapıldı (157-171, 176, 184, 185, 194). Sprint 172-175, 177-183, 186-193 = 19 entry kalan.

**Çözüm:**
```bash
node scripts/changelog-backfill.mjs --since sprint-172 --until sprint-194
```

Script idempotent — mevcut entry'ler skip (Sprint 195'te kanıtlandı "Nothing to do" pattern).

**Kanıt:**
- `grep -cE "^## \[Sprint|sprint196|sprint195" docs/CHANGELOG.md` → öncesi 1 + sprint-196 entry = 2 ana, sonrası ≥20 sprint entry
- `node scripts/changelog-backfill.mjs --since sprint-172 --until sprint-194` → "Reclassified N tasks" (N>0)

**Test:** Audit task.

---

## DALGA 2 — WSL2 OOM Mitigation (1 task)

> Sprint 195/196 4 OOM-killed worker (195-004, 196-005, 196-003-fix, 196-005-fix). 3 paralel opus WSL2 host'ta ~15GB peak, OOM-killer tetikliyor. Config'i kalıcı düzeltmek gerek.

---

## Task 4: 197-004 — WSL2 OOM mitigation (max_workers + worker_memory + adaptive)
- Model: opus
- Effort: normal
- Skills: devops-engineer, docker-expert
- Files: .deckent/config.json, src/orchestra/spawn-coordinator.ts, tests/orchestra/spawn-coordinator-oom.test.ts
- Scope: .deckent/, src/orchestra/, tests/orchestra/

### Description

**Problem:** Sprint 195 195-004 OOM (exit 137). Sprint 196 196-005, 196-003-fix, 196-005-fix OOM. WSL2 host ~12-14GB, 3 paralel opus × 4g cap = 12g peak, host swap dolunca OOM-killer SIGKILL atıyor.

**Çözüm:**

1. **`.deckent/config.json` (mevcut, ~5 satır değişim):**
   - `modes.performance.max_workers: 3 → 2` (3 paralel opus → 2 paralel)
   - `worker_memory_limit: '4g' → '3g'` (opus ~2.5-3GB, 3g cap güvenli)
   - `worker_memory_swap: '6g' → '4g'`
   - Diğer mode (balanced/economic) etkilenmez

2. **`src/orchestra/spawn-coordinator.ts` (Sprint 194 195-005'te land etti, +20 LoC):**
   - `resolveAutoMaxWorkers()` host RAM'a göre dinamik:
     * Host < 8GB → max 1 worker
     * Host 8-16GB → max 2 worker (mevcut WSL2 senaryo)
     * Host 16-32GB → max 3 worker
     * Host 32GB+ → max 4 worker
   - Mevcut suggestMaxWorkers() (Sprint 195 195-005) formula refine

3. **`tests/orchestra/spawn-coordinator-oom.test.ts` (yeni, ≥4 test):**
   - (a) Host 12GB + 4g worker → max 2
   - (b) Host 32GB + 3g worker → max 4
   - (c) Operator override (config max_workers) wins
   - (d) Edge: host detection fail → safe default (1 worker)

**Kanıt:**
- `grep "max_workers" .deckent/config.json | grep performance` → 2
- `grep "worker_memory_limit" .deckent/config.json` → '3g'
- `npx vitest run tests/orchestra/spawn-coordinator-oom.test.ts` → 4+ pass
- Sprint 197 sonu metrics: 0 OOM exit (137) — kanıt sprint sonu

**Test:** ≥4 test.

---

## DALGA 3 — WP-1 Persona Matcher Canlı Doğrulama (1 task)

> Sprint 196'da WP-1 persona matcher land etti (agent-pool.ts + task-builder.ts hook). Sprint 196'da temp-react-ts-specialist hâlâ 3 task'a atandı (mismatch). Demek ki wire eksik veya threshold yanlış. Canlı verification + fix.

---

## Task 5: 197-005 — Persona-task matcher canlı doğrulama + threshold tuning
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/task-builder.ts, src/core/agent-pool.ts, tests/orchestra/persona-task-matcher-live.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description

**Problem:** Sprint 196'da WP-1 persona matcher landed AMA temp-react-ts-specialist hâlâ CLI task'larına atandı (196'da 3 task, %33 başarı). Matcher çağrılıyor mu? Threshold doğru mu? Veya routing override edilmiyor mu?

**Çözüm:**

1. **`src/orchestra/task-builder.ts` ve `src/core/agent-pool.ts` — wire diagnose:**
   - `validatePersonaTaskMatch()` çağrı sayısını log'la (`debugLog('persona-match', ...)`)
   - Mismatch detected ama agent rotation YAPMIYOR mu? Threshold (örn. `mismatch === 'HIGH'` veya score > 70?) doğru mu?
   - Routing override: `selectAgent()` mismatch HIGH ise alternatif agent dön

2. **`src/core/agent-pool.ts` — temp agent domain kalibrasyon:**
   - `temp-react-ts-specialist` agent.json'a `domain: 'react'` ekle (sadece react/UI scope için)
   - 15 built-in agent için domain kalibrasyon güncelle (Sprint 196'da edildi mi check)

3. **`tests/orchestra/persona-task-matcher-live.test.ts` (yeni, ≥5 test):**
   - (a) CLI task (`src/cli/`) + temp-react-ts-specialist → matcher HIGH → agent rotation
   - (b) System task (`src/orchestra/`) + temp-react-ts → matcher HIGH → architect rotated
   - (c) React task (`src/dashboard/`) + temp-react-ts → match, no rotation
   - (d) Multi-domain task → ambiguous, no rotation
   - (e) Brain selectAgent() integration test (mismatch sırasında alternatif önerme)

**Kanıt:**
- Sprint 197 sonu: 0 mismatch task (temp-react-ts hiç CLI/orchestra task'a atanmamış olmalı)
- `grep -n "validatePersonaTaskMatch\|domain.*react" src/core/agent-pool.ts src/orchestra/task-builder.ts` → 4+ match
- `npx vitest run tests/orchestra/persona-task-matcher-live.test.ts` → 5+ pass

**Test:** ≥5 test.

---

## Sprint Sonu Notu

**Beklenen sonuç:** 5/5 DONE. Sprint 197 = Sprint 195/196 öğrenimlerinin **kapanışı**:
- 197-001: Sentetik NO_GO root cause **son katmanı** kapanır (untracked file detection)
- 197-002: Sprint 191-196 ~12 sentetik NO_GO kalıcı DONE'a (script run + audit trail)
- 197-003: CHANGELOG 38/38 sprint backfill tamamlanır
- 197-004: WSL2 OOM 0'a inecek (max_workers=2 + memory_limit=3g)
- 197-005: temp-react-ts mismatch CLI task'larında hiç görünmeyecek

**Pre-beta uyarı:** Sprint 197 koşulurken /login, claude logout, MCP restart YASAK. Sprint başlamadan önce subscription credentials canlı doğrula.

**Tahmini süre:** 1.5-2.5 saat (5 task). Subscription quota ~20-25 mesaj — Pro 45/5h içinde.

Next (Sprint 198 önizleme): Pre-beta final polish — npm publish v1.0.0-beta.1 packaging + Dockerfile.worker image build/push automation + final smoke test + beta announcement materyali. Sprint 198 + 199 = 1 Haziran beta launch günü (29-31 Mayıs paketleme, 1 Haziran release).

Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` — Faz 1 son temizlik + Faz 2 başlangıç köprüsü.
