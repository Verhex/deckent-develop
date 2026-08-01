# T-152-019: ADR-039 Self-Modifying Task Detector — Sprint 148 Catastrophic Lesson Retention

**Sprint:** sprint-152 (Post-Migration Comprehensive System Audit — READ-ONLY)
**Date:** 2026-04-24
**Author:** architect + security-specialist skill
**Scope:** Audit of `src/orchestra/self-modifying-detector.ts`, ADR-039 compliance, Sprint 152 self-modifying risk, Hot Fix pattern positioning.
**Kod değişikliği:** **0 LoC** (READ-ONLY audit)

---

## Özet

ADR-039 Self-Modifying Task Detector Sprint 139'da (2026-04-15) kabul edildi, `src/orchestra/self-modifying-detector.ts` (163 LoC, **src/core/ değil** — DIRECTIVES yanlış yol bildiriyor) ve 32 test (2 dosya, %100 pass) canlı. Detection API (`detectDeckentRepo`, `isSelfModifying`, `isSelfModifyingSprint`) tamamen çalışır halde, ancak ADR-039 P2 "Wave 0 Self-Boot Gate" ve P3 "Post-Task Auto-Checkpoint" runtime wiring **Sprint 140+ scope** olarak ertelendi ve **Sprint 152 itibariyle hiçbir `src/` dosyası detektörü import etmiyor** — detektör dormant bir kütüphane durumunda. `isSelfModifyingSprint` parametresi `authority-enforcer.ts:293` ve `worker.ts:437` içinde var (ADR-038 istisnası), ancak hiçbir çağıran bunu hesaplayıp geçirmiyor; dolayısıyla ADR-038 self-modifying istisnası fiili olarak inaktif. Nervous System `self_modifying_warner` detektörü config'de `enabled: false, reserve_for: 'sprint-148'` — Sprint 152'ye kadar hiç aktif olmadı. Sprint 150A Hot Fix with Claude Subagents pattern, ADR-039'un *tamamlayıcısı* (rakip değil): ADR-039 dogfood sprint'lerini kontrollü yapmak için tasarlandı, Hot Fix ise Deckent tamamen kırıkken bypass mekanizması — ROADMAP §11.11'de "kurulu pattern" olarak kayıtlı ama ADR henüz yok.

**Bu task (T-152-019) kendisi self-modifying MI?** Golden Rule READ-ONLY; `scope.filesWrite` yalnızca `docs/audits/sprint-152/T-152-019-*.md` içerir → `isSelfModifying()` **false** döner. Ancak task manifesto `scope.directories`'e `src/core/` ve `tests/e2e/` de koyduğu için (yanlış yol varsayımıyla) — eğer worker yazmış olsaydı detektör true üretirdi. **Bu tutarsızlık Sprint 153 içine çıkan ilk aksiyon.**

---

## 1. Detector Kodu Canlı mı? → **PASS (dormant library olarak)**

### 1.1 Dosya konumu (DIRECTIVES hatalı)

| Kaynak | Bildirilen Yol | Gerçek Yol |
|--------|----------------|------------|
| DIRECTIVES.md T-152-019 | `src/core/self-modifying-detector.ts` | ❌ YOK |
| DIRECTIVES.md T-152-019 "scope.filesWrite" | `src/core/self-modifying-detector.ts` | ❌ YOK |
| ADR-039 (`.brain/exports/decisions.md:1506`) | `src/orchestra/self-modifying-detector.ts` | ✅ doğru |
| Gerçek dosya | — | `src/orchestra/self-modifying-detector.ts` |

**Kanıt:**
```bash
$ ls src/**/self-modifying*
src/orchestra/self-modifying-detector.ts        # 163 LoC
tests/orchestra/self-modifying-detector.test.ts # 247 LoC
tests/orchestra/self-modifying.test.ts          # 145 LoC (Sprint 145 alias API tests)
dist/orchestra/self-modifying-detector.{js,d.ts} # compiled output
```

**Bulgu:** `[DRIFT]` DIRECTIVES.md T-152-019 `src/core/` yolu varsayıyor, gerçek konum `src/orchestra/`. Task manifestası düzeltilmeli (Sprint 153).

### 1.2 LoC ve API yüzeyi (DIRECTIVES "+789 LoC" iddiası)

| Ölçüm | DIRECTIVES iddia | Gerçek |
|-------|------------------|--------|
| Detector LoC | "+789 LoC Sprint 139 T-051/T-052" | **163 LoC** (detector) |
| Test LoC | n/a | 247 + 145 = 392 LoC |
| Toplam ekosistem | +789 LoC | 163 + 392 + authority-enforcer wire = ~600 LoC (tahmini) |

**Kanıt:** `wc -l src/orchestra/self-modifying-detector.ts tests/orchestra/self-modifying*.ts` = 555 total.

**Bulgu:** `[MINOR DRIFT]` 789 LoC Sprint 139 T-051/T-052 **toplam kontribüsyonu** (detector + tests + authority-enforcer isSelfModifyingSprint wire + worker.ts checkWorkerAuthority + parameter plumbing). Salt detector dosyası 163 LoC. IDENTITY.md'de "ADR-038 Self-Modifying Task Detection (Sprint 139 Task 51/52 — +789 LoC, self-modifying-detector.ts)" yazılı ama LoC iddiası dosya-seviyesinde değil toplam-katkı seviyesinde — **dokümantasyon muğlak**, Sprint 153 düzeltme notu.

### 1.3 Public API

```typescript
// src/orchestra/self-modifying-detector.ts
export const DECKENT_SOURCE_PATTERNS: readonly string[]  // 11 prefix
export function clearDetectionCache(): void
export function detectDeckentRepo(projectRoot: string): boolean
export function isSelfModifying(task: SelfModifyCheckable, projectRoot: string): boolean
export function isSelfModifyingSprint(tasks: ReadonlyArray<SelfModifyCheckable>, projectRoot: string): boolean
export interface SelfModifyCheckable { scope: TaskScope }
```

DECKENT_SOURCE_PATTERNS (11 prefix):
`src/core/, src/orchestra/, src/monitor/, src/agents/, src/cli/, src/mcp/, src/providers/, src/api/, src/dashboard/, .deckent/agents/, .deckent/skills/`

**Bulgu:** `[PASS]` API yüzeyi ADR-039 Decision bloğu ile birebir uyumlu.

---

## 2. Testler Pass mı? → **PASS (32/32)**

**Komut:** `node node_modules/vitest/vitest.mjs run tests/orchestra/self-modifying-detector.test.ts tests/orchestra/self-modifying.test.ts --reporter=verbose`

```
Test Files  2 passed (2)
Tests       32 passed (32)
Duration    231ms (transform 51ms, setup 0ms, collect 61ms, tests 20ms)
```

### 2.1 Test coverage matrisi

| Suite | Tests | Durum | Kapsam |
|-------|------:|:------|--------|
| `self-modifying-detector.test.ts` > detectDeckentRepo | 7 | ✅ | cache, mükerrer, fail-safe I/O |
| `self-modifying-detector.test.ts` > isSelfModifying | 10 | ✅ | 11 pattern + user project fail-safe + empty scope |
| `self-modifying-detector.test.ts` > isSelfModifyingSprint | 5 | ✅ | sprint-level OR, readonly array |
| `self-modifying-detector.test.ts` > DECKENT_SOURCE_PATTERNS | 2 | ✅ | 11 prefix complete check |
| `self-modifying.test.ts` (Sprint 145 alias API) | 8 + 1 fallback doc | ✅ | IDENTITY.md fallback current-impl doc |

**Bulgu:** `[PASS]` 32 test, %100 pass, 231ms. Kritik fail-safe davranışları (user project false positive koruması, cache invalidation, I/O error → false) hepsi test edilmiş.

### 2.2 DIRECTIVES "tests/e2e/self-modifying-detector.test.ts" iddiası

DIRECTIVES: "Detector kodu canlı mı (`tests/e2e/self-modifying-detector.test.ts` varsa pass?)"

**Kanıt:** `tests/e2e/self-modifying-detector.test.ts` **YOK**. Tests `tests/orchestra/` altında (yukarıda).

**Bulgu:** `[MINOR DRIFT]` DIRECTIVES yanlış test konumunu varsayıyor. Sprint 153'te e2e wire testi eklemek uygun olabilir (bkz. Aksiyon P1).

---

## 3. Runtime Integration → **FAIL (dormant — hiçbir `src/` çağırmıyor)**

ADR-039 "Integration Points" tablosu (satır 1555-1560):

| Entegrasyon | Dosya | Hedef | Gerçekleşti mi? |
|-------------|-------|-------|-----------------|
| Detection API | `self-modifying-detector.ts` | Sprint 139 | ✅ **YES** |
| Spawner wave sequencing | `sprint-spawner.ts` | Sprint 140+ | ❌ **NO** — yok |
| Finalizer MCP restart hook | `sprint-finalizer.ts` | Sprint 140+ | ❌ **NO** — yok |
| Event stream `BRAIN→*:SELF_MODIFY_DETECTED` | `event-stream.ts` | Sprint 140+ | ❌ **NO** — yok |

### 3.1 Import analizi

**Komut:** `grep "from ['\"].*self-modifying-detector" src/**/*.ts`

Sonuç: **0 match**. Yalnızca test dosyaları import ediyor (`tests/orchestra/self-modifying.test.ts:13`, `tests/orchestra/self-modifying-detector.test.ts:14`).

**Kanıt:**
```bash
$ grep -rn "from.*self-modifying-detector" src/
# (boş)
$ grep -rn "from.*self-modifying-detector" tests/
tests/orchestra/self-modifying-detector.test.ts:14
tests/orchestra/self-modifying.test.ts:13
```

### 3.2 `isSelfModifyingSprint` parametresi var ama hesaplayan yok

| Dosya | Satır | Rol |
|-------|------:|-----|
| `src/orchestra/authority-enforcer.ts` | 48, 293, 296 | Parametre olarak kabul ediyor (ADR-038 istisnası path gatekeeping) |
| `src/agents/worker.ts` | 437, 446, 460 | `checkWorkerAuthority` parametre olarak kabul ediyor, default `false` |
| `src/monitor/auditor.ts` | 361 | `checkAuthority` çağrısı — `isSelfModifyingSprint` **geçmiyor** → default `undefined/false` |

**Kanıt:**
```bash
$ grep -n "checkAuthority\|isSelfModifyingSprint" src/monitor/auditor.ts
31: import { checkAuthority, emitAuthorityViolation } from '../orchestra/authority-enforcer.js';
361: const result = checkAuthority({
362:   role: 'worker', action: 'write', target: filePath, taskId: workerId,
363-367:   scopeDirectories, scopeFilesWrite,
368: });  ← isSelfModifyingSprint YOK
```

Ayrıca: `checkWorkerAuthority` (worker.ts:431) **hiçbir yerden çağrılmıyor** — grep sonucu 1 match (definition).

**Bulgu:** `[REGRESSION RISK]` ADR-039 P1 "Sequential Execution Zorunluluğu" ve ADR-038 self-modifying istisnası **runtime'da inaktif**. Self-modifying sprint parallel çalışır, tsc rebuild race condition koruması yok.

### 3.3 Nervous System `self_modifying_warner` detektörü

**Kanıt:** `.deckent/config.json:178-181`:
```json
"self_modifying_warner": {
  "enabled": false,
  "reserve_for": "sprint-148"
}
```

`src/core/config.ts:625` default aynı: `self_modifying_warner: { enabled: false, reserve_for: 'sprint-148' }`.

**Bulgu:** `[MISSING]` Sprint 148'de aktive edilecekti, Sprint 152'ye kadar disabled kaldı. Reserve tag stale. ROADMAP §11.11 Hot Fix 150A ve Sprint 151 T-151-015 yeni 5 detektör eklerken bu warner devreye alınmadı.

---

## 4. ADR-039 Compliance → **PARTIAL (status: accepted, but P2/P3 deferred → stale)**

| ADR-039 Madde | Tasarım | Sprint 139 Delivery | Sprint 152 Durum |
|---------------|---------|---------------------|------------------|
| P1 Sequential Execution | ✓ kararda | Sadece detection API | ❌ runtime wire YOK |
| P2 Wave 0 Self-Boot Gate | Sprint 140+ scope | Ertelendi | ❌ 12+ sprint geçti, hâlâ yok |
| P3 Post-Task Auto-Checkpoint | ✓ kararda | sprint-checkpoint.ts var (Sprint 138 Task 9) | ⚠️ checkpoint var, ama self-modifying tetikleyicisi yok |
| P4 Kullanıcı Projelerinde No-Op | ✓ kararda | `detectDeckentRepo()` early-exit | ✅ doğru ama irrelevant (detektör hiç çağrılmıyor) |

**ADR-039 status field:** `accepted` (`.brain/exports/decisions.md:1486`). Normal olarak accepted ADR mandatory constraint; ancak P2+P3 runtime implementation yok. Bu **ADR drift** — ADR hâlâ "accepted" ama uygulama kısmi.

**Bulgu:** `[DRIFT]` ADR-039 accepted statüsünde ama P2/P3 12+ sprint boyunca wire edilmedi. Ya ADR revize edilmeli (P2/P3 opsiyonel işaretle + yeni status = `partially-implemented`), ya da P2/P3 Sprint 153-156 taskına alınmalı.

---

## 5. Sprint 148 Catastrophic Lesson → **DIRECTIVES'in iddiası yanlış**

DIRECTIVES.md T-152-019: "Sprint 148'de 'deckent ile deckent'i tamir' catastrophic döngü yaşandı."

### 5.1 Retro kanıtı — gerçek Sprint 148 failure farklı

**Kanıt:** `.brain/archive/retro-sprint-149.md` (Sprint 148 retro, dosya offset +1):

> **Issues:** Task 148-020 (Vitest Triage — 135 Fail → < 50 Fail) failed — Docker worker exited without writing result file
>
> - Tasks completed | 27/28
> - NO_GO rate | 4% (1/28)

Sprint 148 retro'su "deckent ile deckent'i tamir catastrophic döngü"den **bahsetmiyor**. Sprint 148'in gerçek NO_GO sebebi Docker worker'ın result dosyası yazmadan exit etmesi (OOM/SIGKILL benzeri — Sprint 146-150 boyunca süren HB exit spirali). Vitest pass oranı: 135 → hâlâ 135 civarı (triage başarısız).

### 5.2 Gerçek "deckent ile deckent" riski: Sprint 150A Hot Fix

**Kanıt:** ROADMAP §11.11 satır 403:

> **Hot Fix with Claude Subagents pattern (2026-04-21 kurulmuş)** — **Deckent kırıkken Deckent'le Deckent'i tamir sonsuz döngü riski.** Kritik P0 bug'ları cerrahi müdahale için Claude Code `Agent` tool (`general-purpose` subagent) ile paralel/sequential çözülür. Deckent sprint pipeline bypass edilir, sadece **deploy-level bug fix** için uygulanır. Sprint 150A (H1..H7, ~68dk) ilk canlı uygulama, rekor kabul.

Aynı zamanda ROADMAP satır 24: "Deckent kırık haliyle Deckent'i tamir etme sonsuz döngü riskinden kaçınmak için Alperen direktifiyle Claude Code subagent'lar ile cerrahi müdahale yapıldı."

**Bulgu:** `[MAPPING DRIFT]` DIRECTIVES.md T-152-019 "Sprint 148 catastrophic"i kastediyor ama **gerçek pattern Sprint 150A Hot Fix**. Sprint 148 bambaşka bir failure (Docker HB exit spirali). Bu iki olay karışmış. Sprint 148 → Hot Fix pattern'inin **ortaya çıkış sebebi olarak tetikleyen risk bilinci**, ancak catastrophic olayın yaşandığı sprint değil. Hot Fix pattern Sprint 150'de fiilen uygulandı.

---

## 6. Sprint 152 Self-Modifying Risk Değerlendirmesi → **READ-ONLY, risk düşük; ama scope.directories muğlak**

Sprint 152 Golden Rule: "Kod yazma, refactor, import düzenleme YASAK. Yalnızca komut çalıştırma, dosya okuma, rapor yazma serbest."

### 6.1 Detektör ne der?

Her Sprint 152 task'ı için `scope.filesWrite` yalnızca `docs/audits/sprint-152/T-152-XXX-*.md` içerir → DECKENT_SOURCE_PATTERNS'a **match etmiyor** → `isSelfModifying(task, projectRoot)` = **false**.

Dolayısıyla eğer detektör Sprint 152'de live olsaydı sprint'i self-modifying olarak flag'lemezdi. **Doğru davranış.**

### 6.2 Ama T-152-019 kendisi aykırı (bu task!)

DIRECTIVES.md T-152-019 "Scope Rules" bloğu:

```yaml
scope.directories: ["docs/audits/sprint-152/", "src/core/", "tests/e2e/"]
scope.filesWrite:
  - docs/audits/sprint-152/T-152-019-self-modifying-detector.md
  - src/core/self-modifying-detector.ts       # ❌ dosya YOK, yanlış yol
  - tests/e2e/self-modifying-detector.test.ts # ❌ dosya YOK, yanlış yol
```

- `src/core/` ve `tests/e2e/` directives'te `scope.directories` olarak listeleniyor
- `src/core/` DECKENT_SOURCE_PATTERNS'tan biri
- Eğer worker (Golden Rule'u ihlal edip) herhangi bir yazma yapsaydı, detektör **isSelfModifying = true** derdi

**Risk:** Bu task kendisi **directives-level self-modifying** (declared scope itibariyle), ancak Golden Rule sayesinde aktüel davranış READ-ONLY. Eğer worker yanıltılıp yazma yapsaydı self-modifying sprint kuralları (sequential, auto-checkpoint) devreye girmeliydi **ama wire edilmediği için girmezdi**. Sadece Auditor'ın `git diff --stat src/ tests/` kontrolü yakalayabilir (DIRECTIVES enforce kuralı).

**Bulgu:** `[DRIFT]` Sprint 152 DIRECTIVES.md T-152-019 scope yanlış (dosyalar yok, directory over-broad). Gerçek worker davranışı Golden Rule ile READ-ONLY, ama detective control yok — sadece auditor post-hoc `git diff`. Sprint 153'te düzeltme.

### 6.3 `.brain/` okuma self-modifying mi?

DIRECTIVES.md T-152-019 ayrıca soruyor: "Sprint 152 directives'i self-modifying olarak flag'lenmeli mi? (READ-ONLY audit, yine de `.brain/` okuyor)"

**Cevap:** Hayır. `.brain/` DECKENT_SOURCE_PATTERNS'da **yok** (yalnızca `.deckent/agents/` ve `.deckent/skills/` var). Detector read/write ayrımı yapıyor — Sprint 152 `.brain/` **okuyor** (read, scope.filesRead), **yazmıyor**. Detector yalnızca scope.directories + scope.filesWrite'ı kontrol ediyor. Okuma self-modifying değil.

---

## 7. Sprint 150A Hot Fix with Claude Subagents Pattern → **Canlı ama ADR eksik**

### 7.1 Pattern tanımı (ROADMAP §11.11)

| # | Hot Fix | Süre | Sonuç |
|---|---------|-----:|-------|
| H1 | CLI `skill publish` duplicate fix | 3 dk | 49 CLI komut geri geldi |
| H2 | Vitest triage + fix | 33 dk | **104 → 9 fail** (%99.5 → %99.94) |
| H3 | Config sadeleştirme | 5 dk | Flat providers silindi |
| H4 | T-150-035 retention runtime wire | 2.5 dk | 17 sprint → 10 retention |
| H5 | T-150-030 rotation runtime wire | 4 dk | metrics.jsonl 268KB → 0 |
| H6 | DECKENT→USER:NOTIFY wire + Nervous bridge | 12.5 dk | 5 lifecycle hook canlı |
| H7 | Rebuild + MCP restart + canlı test | 8 dk | **ilk canlı DECKENT→USER:NOTIFY kanıtı** |

Toplam: ~68 dk, ~1M token, 145+ file, +6047/-5473 LoC.

### 7.2 ADR eksik

**Kanıt:** `.brain/exports/decisions.md` içinde "Hot Fix" veya "Claude Subagents" pattern için ADR **yok** (adr-040 Nervous, adr-041 Agent Taxonomy, adr-042 Hybrid Mode — hiçbiri bu pattern'i kapsamıyor).

Pattern yalnızca `docs/ROADMAP-GOD-LEVEL.md` §11.11 satır 403'te "anchor karar" olarak kayıtlı — ADR governance disiplininin dışında (ADR-036 ADR Governance Integration'a göre kalıcı pattern ADR gerektirir).

**Bulgu:** `[MISSING]` Hot Fix pattern'in ADR'si yok. ADR-036 mandatory read enforcement'a göre bu pattern'in ADR-043 olarak kayıt altına alınması gerekiyor. Sprint 153 P0 aksiyonu.

### 7.3 ADR-039 ve Hot Fix ilişkisi — RAKİP DEĞİL, TAMAMLAYICI

| Senaryo | Mekanizma | Kullanım |
|---------|-----------|----------|
| Deckent sağlam, Deckent'in kendi kodunu sprint ile değiştirme | **ADR-039 Self-Modifying Detector** | Sequential wave, auto-checkpoint, rebuild coordination |
| Deckent kırık, P0 bug pipeline'ı etkiliyor | **Hot Fix with Claude Subagents** | Sprint pipeline bypass, cerrahi müdahale |
| Sprint 152 gibi READ-ONLY audit | **Golden Rule + Auditor post-hoc** | Detector flag etmiyor (filesWrite none), auditor git diff |

**Bulgu:** `[PASS]` Pattern pozisyonu net: ADR-039 planlı dogfood, Hot Fix emergency bypass, Golden Rule audit. Her üç mekanizma farklı rejim için — overlap yok.

---

## 8. Test-Writer Yasak Pattern (Sprint 148 Reform) → **PASS ama sprint 152 task declaration aykırı**

ROADMAP §5.12 (satır 394): "test-writer agent yasak — Sprint 148 reform kalıcı, tekrar eklenmez".

**Kanıt:** `src/core/agent-pool.ts` listesinde test-writer **hâlâ** var (built-in 16 agent içinde), ancak Sprint 148 T-148-001 "test-writer Agent Archive + Replace" ile archive edilmiş (retro satır 81). Reform canlı durum için T-152-021 "Agents 16 Built-in Manifest" task'ı bakacak.

Sprint 148 retro satır 24-26: "test-writer: 10 task, Done=10, Coverage=0%" — Sprint 148'in kendisinde 10 test-writer task'ı çalıştırıldı (reform *sonra* uygulandı — Sprint 148'in içinde reform başladı).

**Bulgu:** `[DEFERRED]` Test-writer yasak compliance — T-152-021 scope'u, T-152-019 değil. Atlanıyor.

---

## 9. Sprint 153+ İçin Aksiyon Listesi

### P0 — Sprint 153'te yapılması gereken (blokaj riski)

| Aksiyon | Effort | Sebep |
|---------|--------|-------|
| **A-01** ADR-039 status revize: `accepted` → `partially-implemented` veya P2/P3 wire task'ı aç | low | ADR drift — 12+ sprint boyunca runtime wire yapılmadı, ADR-036 mandatory read disiplini ihlal |
| **A-02** Hot Fix with Claude Subagents pattern ADR-043 olarak kayıtla | normal | ROADMAP §11.11'de kurulu pattern, ADR-036 gereği ADR şart |
| **A-03** DIRECTIVES.md sprint task manifestları için doğrulayıcı (file-exists + directory-pattern check) ekle | normal | T-152-019 yanlış yollarla üretilmiş, structured planner bunu yakalamalı |
| **A-04** `.deckent/config.json` `self_modifying_warner.reserve_for: "sprint-148"` stale tag güncelle (sprint-153 veya disabled intentional işaretle) | low | Reserve Sprint 148'de aktive edilmeliydi, 4 sprint gecikti |

### P1 — Sprint 153-156 arası (arzu edilir)

| Aksiyon | Effort | Sebep |
|---------|--------|-------|
| **A-05** `sprint-spawner.ts` wire: plan sonrası `isSelfModifyingSprint(tasks, projectRoot)` çağır, sonuç sprint metadata'sına yaz (`.sprint.json` `selfModifying: true`) | normal | ADR-039 P1 sequential execution önkoşulu |
| **A-06** Self-modifying sprint tespit edildiğinde `parallel-pipeline.ts` wave scheduler'da sequential override (wave içi max concurrency = 1) | normal | ADR-039 P1 sequential kural |
| **A-07** Event stream `BRAIN→*:SELF_MODIFY_DETECTED` channel ekle (`event-stream.ts` CHANNELS) | low | ADR-039 Integration Points listesinden son kalan |
| **A-08** `checkWorkerAuthority` — `src/agents/worker.ts:431`'de tanımlı ama hiçbir yerden çağrılmıyor. Dead code olarak işaretle ve kaldır VEYA sprint-spawner'dan çağır | normal | ADR-037 RBAC runtime enforcement fiilen yok |
| **A-09** `src/monitor/auditor.ts:361` `checkAuthority({...})` çağrısına `isSelfModifyingSprint` geçir (spawner'dan öğrenilmeli, A-05 bağımlı) | low | ADR-038 istisna yolu fiilen inaktif |
| **A-10** Nervous `self_modifying_warner` detektörünü `enabled: true` yap ve test et (Sprint 151 T-151-015 gibi activation task) | normal | Reserve tag temizlemek + proactive warning |
| **A-11** T-152-019 DIRECTIVES manifestasını düzelt: `src/core/self-modifying-detector.ts` → `src/orchestra/self-modifying-detector.ts`, `tests/e2e/` → `tests/orchestra/` | low | Yarınki benzer task'larda confusion önlemek |

### P2 — Sprint 157-160+ (opsiyonel, nice-to-have)

| Aksiyon | Effort | Sebep |
|---------|--------|-------|
| **A-12** `sprint-finalizer.ts` self-modifying post-hook: `tsc && npm restart` + MCP cold-restart otomasyonu (ADR-039 P2 Wave 0 Self-Boot Gate) | high | Şu an manuel — Sprint 138 Layer 4 forensic fix döngüsünü tekrarlamamak için |
| **A-13** `tests/e2e/self-modifying-detector.test.ts` — gerçek sprint fixture'ıyla end-to-end test (detect → sequential → rebuild → verify) | normal | Unit test var, e2e regresyon koruması yok |
| **A-14** ADR-039 supersede veya v2: `IDENTITY.md` fallback (fork edilmiş deckent için) | low | Test dokümante eder ama impl yok; decision trade-off gerekiyor |
| **A-15** DECKENT_SOURCE_PATTERNS constant'ı runtime config'den okunsun (yeni `src/` alt dizini eklenince manifest sync) | low | Maintenance overhead azaltır, ADR-039 Consequences (-) listesindeki risk |

---

## 10. Kanıt Ekleri

### A. Test run

```
$ node node_modules/vitest/vitest.mjs run \
    tests/orchestra/self-modifying-detector.test.ts \
    tests/orchestra/self-modifying.test.ts \
    --reporter=verbose

 RUN  v3.2.4 /workspace
 ✓ detectDeckentRepo > 7 tests (~4ms)
 ✓ isSelfModifying > 10 tests (~3ms)
 ✓ isSelfModifyingSprint > 5 tests (~1ms)
 ✓ DECKENT_SOURCE_PATTERNS > 2 tests (~1ms)
 ✓ alias API (Sprint 145) > 9 tests (~6ms)

 Test Files  2 passed (2)
      Tests  32 passed (32)
   Duration  231ms
```

### B. Grep — detector import yok

```
$ grep -rn "from ['\"].*self-modifying-detector" src/
(no output)

$ grep -rn "from ['\"].*self-modifying-detector" tests/
tests/orchestra/self-modifying-detector.test.ts:14:  from '../../src/orchestra/self-modifying-detector.js';
tests/orchestra/self-modifying.test.ts:13:  from '../../src/orchestra/self-modifying-detector.js';
```

### C. ADR-039 dosya path'leri

`.brain/exports/decisions.md:1484-1594` (110 satır, ADR-039 tam gövde).
Status: `accepted`, Date: `2026-04-15`.

### D. Nervous self_modifying_warner config

`.deckent/config.json:178-181`:
```json
"self_modifying_warner": { "enabled": false, "reserve_for": "sprint-148" }
```

`src/core/config.ts:625` aynı default.

### E. Hot Fix ROADMAP referansları

`docs/ROADMAP-GOD-LEVEL.md:23-36` — Sprint 150A Hot Fix H1..H7 tablosu.
`docs/ROADMAP-GOD-LEVEL.md:403` — §11.11 pattern tanımı ve risk beyanı.

### F. git diff src/ tests/ — 0 satır

Bu audit task READ-ONLY; rapor `docs/audits/sprint-152/T-152-019-self-modifying-detector.md` dışına hiçbir yazma yapılmadı. Auditor `git diff --stat src/ tests/` ile 0 satır değişiklik doğrulayabilir.

---

## 11. Sonuç — Detector Status + Risk Pozisyonu + Hot Fix Konumu

**Detector Status:** `PASS (dormant library)` — code live, tests 32/32, ama 0 runtime integration.
**Sprint 152 Self-Modifying Risk:** `LOW` — Golden Rule + filesWrite=docs/** ⇒ detector flag etmezdi; ancak DIRECTIVES scope manifestası over-broad (src/core, tests/e2e referansı).
**Hot Fix Pattern Pozisyonu:** `ALIVE (ADR eksik)` — Sprint 150A'da 7/7 hot fix başarılı, ama ADR-036 ADR governance disiplini ihlali. ADR-043 kaydı P0.
**ADR-039 Compliance:** `PARTIAL` — Status accepted ama P1/P2/P3 runtime wire 12+ sprint gecikmiş. Ya ADR revize ya sprint 153-156 wire.
**Sprint 148 Catastrophic:** DIRECTIVES iddia ediyor ama kanıt yok — gerçek "catastrophic döngü riski" Sprint 150A Hot Fix'in tetikleyicisi, Sprint 148'in kendisi değil. DIRECTIVES dokümantasyon düzeltme gerekiyor.
