# Audit — `src/agents/specialization-drift.ts`

> **Sprint:** sprint-186 (per-file pilot, 50-task batch)
> **Task:** 186-015
> **Auditor:** doc-writer (worker w-186-015, claude/opus)
> **Date:** 2026-05-21

---

## 1. Inventory

| Field | Value |
|---|---|
| Path | `src/agents/specialization-drift.ts` |
| LoC (incl. blanks/comments) | 108 |
| Module type | ESM (TypeScript) |
| Exports | `interface RecentResult`, `interface DriftReport`, `class SpecializationDriftDetector` |
| Public methods (1) | `detect(agentId, triggerKeywords, recentResults): DriftReport` |
| Private-by-convention methods (3, `_` prefix — **not** TS `private`) | `_extractActualKeywords`, `_computeDriftScore`, `_computeRecommendation` |
| Module-level constants | `DRIFT_THRESHOLD = 0.6`, `RESPECIALIZE_THRESHOLD = 0.8` |
| Imports (runtime) | — none — (zero-dependency module) |
| Imports (internal) | — none — |
| Reverse deps (src/) | **0 files** — `grep -rn "specialization-drift\|SpecializationDriftDetector" src/` returns only the file itself (2 hits: header comment + class declaration) |
| Reverse deps (tests/) | **1 file** — `tests/agents/specialization-drift.test.ts` (145 LoC, 15 `it(...)` cases) |
| Persistence | None — purely in-memory computation, no file/DB I/O |
| Constructor | implicit (no fields) — stateless detector |
| Side effects | None — pure functions wrapped in a class |

**Data shapes:**

```ts
RecentResult { taskType: string; taskTitle: string; evaluation: string }
DriftReport {
  agentId: string;
  originalSpecialization: string[];
  currentSpecialization: string[];
  driftScore: number;                 // 0 = aligned, 1 = fully drifted
  recommendation: 'keep' | 'respecialize' | 'create_new_agent';
}
```

**Algorithm summary:** Tokenize `taskType + taskTitle` of recent results → build set of actual keywords → compute Jaccard-style overlap with declared `triggerKeywords` → `driftScore = 1 - (matchCount / max(|original|, |actual|))` rounded to 2 decimals → threshold map to recommendation.

---

## 2. Bağlam (Architectural Context)

`SpecializationDriftDetector` modülü, agent havuzunda (`src/core/agent-pool.ts`) yaşayan bir agent'ın **ilan ettiği uzmanlık alanı (`triggerKeywords`)** ile **gerçekte aldığı görevlerin içeriği** arasındaki sapmayı (drift) ölçen bir sezgisel analizör olarak tasarlanmıştır. Niyet, agent havuzunun zaman içinde "amacından koparak çöp halini almasını" engellemek; drift eşiği aşıldığında promosyon pipeline'ına (`src/orchestra/promotion-pipeline.ts`) "respecialize" veya "create_new_agent" sinyali göndermektir.

| Mimari katman | Bağlantı durumu |
|---|---|
| `agent-pool.ts` (15 built-in + temp havuzu, LRU eviction) | **Hayır** — `SpecializationDriftDetector` import edilmiyor |
| `promotion-pipeline.ts` (temp→permanent promosyon/demosyon) | **Hayır** — drift sinyali tüketilmiyor |
| `outcome-tracker.ts` (routing outcome → learning bonuses) | **Hayır** — drift verisi bonus matrisine beslenmiyor |
| `agent-genealogy.ts` (lineage prototipi) | **Hayır** — paralel ölü modül, birbirini tetiklemiyor |
| `cross-sprint-analyzer.ts` (cross-sprint drift candidate) | **Hayır** — özellik kodu da reverse-dep'siz |
| Persistence | Yok — `driftScore` hiçbir yerde saklanmıyor |

**ADR ilişkisi:**

- **ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık):** Modül hiçbir orchestra/agent modülünden import etmediği için ADR-008 ihlali yok; ancak hiçbir downstream tüketici olmadığı için ADR-008'in koruduğu "Brain yegâne çağıran" semantiği test edilemiyor.
- **ADR-038 (Dead Code Disposition — Sprint 139 Audit Results):** Bu dosya, Sprint 139 dead-code envanterinde **açıkça orphan** olarak kayıtlı (`.deckent/archive/sprints/misc/sprint-god-analysis/meta/dead-code-type-safety.md` satır 63: `src/agents/specialization-drift.ts:1 | 107 | DEAD | 0 importers`). ADR-038'in disposition kararı (delete / consume / archive) henüz uygulanmamıştır.
- **ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents):** Drift detection, "vertical agent" evrimini matematiksel olarak izlemenin temel parçası olabilirdi; konsept ADR-041 vizyonu ile hizalı ama wire edilmedi.

---

## 3. Debt Risk

| Risk | Severity | Açıklama | Kanıt |
|---|---|---|---|
| **Tamamen consumer’sız modül** | **HIGH** | `agent-pool`, `promotion-pipeline`, `outcome-tracker` hiçbiri drift sinyalini sorgulamıyor; modülün **yalnızca testlere yönelik canlılığı** mevcut | `grep -rn 'specialization-drift\|SpecializationDriftDetector' src/` → 2 hit, ikisi de dosyanın kendi tanımı |
| **Sabit eşik kodlu** | MEDIUM | `DRIFT_THRESHOLD = 0.6`, `RESPECIALIZE_THRESHOLD = 0.8` hard-coded; proje veya agent tipi bazında ayarlanamıyor; config layer'dan okunmuyor | Satır 22-23 |
| **`max(|original|, |actual|)` normalizasyonu yanıltıcı olabilir** | MEDIUM | Çok büyük token havuzları (uzun taskTitle'lar) `actualSet.size`'ı şişirir → matchCount sabit kalsa bile overlap düşer → suni drift artışı | `_computeDriftScore` satır 95 |
| **Tokenizer fazla agresif** | LOW | `/[\s\-_.,;:!?()[\]{}"'`/\\|@#$%^&*+=<>~]+/` regex'i kebab/camel case'i parçalamıyor; `userAuth` tek token, ama `user-auth` iki token — agent keyword'leri ile karışık kullanımda tutarsız sonuç | Satır 71 |
| **`evaluation` alanı sinyale dahil edilmiyor** | LOW | `RecentResult.evaluation` (`DONE`/`NO_GO`/`GO_WITH_TECH_DEBT`) tipte var ama `_extractActualKeywords` sadece `taskType + taskTitle` kullanıyor → başarısız task'lar başarılı olanlarla aynı ağırlıkta drift'e katılıyor | Satır 69 |
| **No persistence / no history** | LOW | Drift skoru sprint sonunda hesaplansa bile saklanmadığı için zaman serisi yok; "ani drift" ile "yavaş drift" ayırt edilemiyor | Dosya genelinde I/O yok |
| **Boyut ölçeklenebilirliği denetlenmemiş** | LOW | 100+ result × 100+ token senaryosunda `Set` operasyonları O(n) ama benchmark veya cap yok | `_extractActualKeywords` satır 67-75 |

---

## 4. Dead Code Candidates

| Sembol | Sat. | Sebep | Kanıt |
|---|---:|---|---|
| **Modülün tamamı** (`SpecializationDriftDetector`, `RecentResult`, `DriftReport`) | 1-108 | `src/` içinde **0 importer** — yalnızca test dosyası referans veriyor | `grep -rn 'specialization-drift\|SpecializationDriftDetector\|DriftReport' src/` → yalnızca dosyanın kendi 2 satırı; `tests/agents/specialization-drift.test.ts` 145 LoC dedicated spec |
| `DRIFT_THRESHOLD`, `RESPECIALIZE_THRESHOLD` | 22-23 | Sabit eşikler kullanım dışı çünkü `detect()` hiç çağrılmıyor; ayrıca config'den okunmuyor — eşik tuning workflow'u olmadığı için yarı-yararsız | Modül kullanımına bağımlı |
| `_extractActualKeywords` regex separator listesi | 71 | Liste hard-coded, ne pluggable ne i18n-aware (Türkçe karakterler ayraç sayılmıyor: `ı`, `ğ`, `ş`) → ADR-032 (i18n Pattern System) ile zayıf hizalama | Regex satır 71 |
| `originalSpecialization` field'ı `DriftReport`'ta | 14 | Çağıran kod yoksa tüketici de yok; backwards-compat değeri sıfır | Reverse-dep analizi |

> **Not — Sprint 139 envanteri ile kesişim:** Sprint 139 dead-code envanteri zaten bu dosyayı `DEAD | 0 importers` olarak işaretlemiş (`.deckent/archive/sprints/misc/sprint-god-analysis/meta/dead-code-type-safety.md:63`). Sprint 141 analizi (`.deckent/archive/sprints/sprint-141/.../specialization-drift.md`) yalnızca "ANALYZED" verdikti ile bıraktı, disposition kararı vermedi. Sprint 186 audit'i durumun **değişmediğini doğruluyor**.

---

## 5. Documentation Gaps

| Boşluk | Etki |
|---|---|
| **README / docs/ içinde tek satır mention yok** — özellik kullanıcıya görünmüyor | Yüksek — özelliğin ne olduğunu kimse bilmiyor, dolayısıyla wire etme isteği de oluşmuyor |
| **JSDoc'lar formula seviyesinde yüzeysel** — `detect()` üzerinde `driftScore: 0 = perfectly aligned, 1 = completely drifted` var, ama Jaccard formülü, normalize cebri (`max(|A|,|B|)`), tokenizer behaviour belgelenmemiş | Orta — eşik tuning için reverse-engineering gerekir |
| **`DRIFT_THRESHOLD` ve `RESPECIALIZE_THRESHOLD` "neden 0.6 / 0.8" gerekçesiz** — sezgisel olarak seçilmişe benziyor | Orta — agent türüne göre farklı eşikler gerekebilir, ama tartışma izi yok |
| **Recommendation enum'ı (`keep|respecialize|create_new_agent`) downstream contract yok** — hangi modülün hangi action'ı alacağı belirsiz | Yüksek — wire etmek isteyen geliştirici karar tablosu üretmek zorunda |
| **`RecentResult.evaluation` field'ı kullanılmıyor ama tipte var** — okuyucuyu yanıltıyor | Düşük — dead field, kaldırılmalı veya tüketilmeli |
| **ADR yok / mention yok** — bu modülün doğuşu, niyeti, vazgeçilme gerekçesi `.brain/memory.db`'de ADR olarak yer almıyor | Yüksek — ADR-038 disposition kararını desteklemek için forensic boşluk |
| **Test dosyası 15 case ama davranış-tabanlı; matematiksel invariant test'i yok** (ör. "Jaccard simetrisi", "boş input idempotency") | Düşük |

---

## 6. ADR Compliance Check

| ADR | Konu | Uyum | Not |
|---|---|---|---|
| **ADR-001** | TypeScript + ESM | ✅ | TS strict; ESM compatible (no CJS imports) |
| **ADR-002** | Node16 Module Resolution | ✅ | `.js` uzantısı zorunluluğu — import yok, ihlal etme şansı yok |
| **ADR-003** | vitest over Jest | ✅ | `tests/agents/specialization-drift.test.ts` vitest |
| **ADR-006** | spawnSync Security Pattern | N/A | Subprocess kullanmıyor |
| **ADR-008** | Brain Merkezi Import — Tek Yönlü Bağımlılık | ✅ (vakum uyumu) | Hiç import etmediği için ihlal etmiyor; ancak Brain tarafından da tüketilmediği için "tek yönlü" topolojisi test edilmiyor |
| **ADR-027** | Hybrid Spawn Backend | N/A | Backend bağımsız |
| **ADR-032** | i18n Pattern System (TR/EN içerik) | ⚠️ | Tokenizer regex Türkçe karakterleri (`ı`, `ğ`, `ş`) ayraç olarak görmüyor ama kelime gövdesine dahil etmiyor da; TR taskTitle'larında `proje-yönetimi` → `['proje', 'yönetimi']` doğru çalışır ama `İngilizce-büyük-İ` sorunlu (`I` küçültme behaviour) |
| **ADR-035** | Verification Protocol Standard | N/A | Brain↔Worker iletişim protokolü ile ilgisiz |
| **ADR-037** | Authority Matrix RBAC | ✅ | Pure compute; izin/scope gerektirmiyor |
| **ADR-038** | Dead Code Disposition — Sprint 139 Audit | ❌ **İHLAL** | Sprint 139'da `DEAD \| 0 importers` olarak işaretli; disposition (delete/wire/archive) yapılmadı; Sprint 141'de "analyze" geçirildi ama karar verilmedi |
| **ADR-041** | Agent Taxonomy — Horizontal Skills vs Vertical Agents | ⚠️ | Vertical agent evrimine destek vermesi gereken altyapı, wire edilmediği için ADR vizyonuna hizmet etmiyor |
| **ADR-046** | Brain Self-Update Hook Architecture | N/A | Brain self-update'i ile ilgisiz |

**Net durum:** ADR-038 ile uyumsuzluk net bir teknik borç. Diğer ADR'ler nötr/uyumlu. ADR-032 ve ADR-041 ile zayıf hizalama dokümantasyon ve disposition fazında ele alınmalı.

---

## 7. Refactor Recommendations

Önerileri **disposition seçimine** bağlı olarak iki kola ayırıyorum.

### A. Modül wire edilecekse (consume option)

1. **`agent-pool.ts` veya `outcome-tracker.ts` içinde sprint sonunda `detect()` çağrısı** ekle; her agent için son N sprint sonucunu derle, drift score'u `agent-pool.ts:AgentMetadata`'ya yaz, retry/promotion kararlarında girdi olarak kullan.
2. **Eşikleri config layer'a taşı** — `.deckent/config.json` → `agent_evolution.drift_threshold`, `agent_evolution.respecialize_threshold`. Default'lar yine `0.6`/`0.8`.
3. **`evaluation` alanını ağırlık olarak entegre et** — `DONE` 1.0, `GO_WITH_TECH_DEBT` 0.6, `NO_GO` 0.2 katsayıları ile token frekansını ölç (başarısız task'lar drift'e tam dahil olmamalı).
4. **Time-windowed drift** — son `N` sprint vs öncekiler arasında delta hesapla; "ani drift" patterni Brain'in alert'leyebileceği bir sinyale dönüştürülmeli (Nervous System / ADR-040 ile entegrasyon).
5. **Tokenizer'ı i18n-aware yap** — Unicode-aware separator class kullan, `.toLowerCase()`'i locale-aware (`'tr'` collator) yap; ADR-032 ile hizala.
6. **Persistence** — drift history'yi `memory.db` içine `type: 'agent_drift'` entry olarak yaz; sprint snapshot'larında trend gözlemlenebilir.

### B. Modül wire edilmeyecekse (archive option)

1. **Dosyayı `src/agents/` altından kaldır**, gerekirse `.deckent/archive/dead-code/sprint-186/` altına taşı.
2. **Test dosyasını da arşivle** — `tests/agents/specialization-drift.test.ts` 145 LoC + 15 test, CI suite'inde gereksiz yük.
3. **ADR-038 entry'sini güncelle** — disposition: ARCHIVED, sprint 186 audit reference'ı ile.
4. **`agent-genealogy.ts` ile birlikte değerlendir** — aynı kategori "vertical-agent evolution prototype, wire'lanmamış" — ikisini birlikte arşivlemek envanter tutarlılığı için tercih edilir.

### Her iki yolda ortak (no-regret)

1. `RecentResult.evaluation` field'ı ya tüketilmeli ya kaldırılmalı (B yolunda otomatik düşer; A yolunda implementasyona dahil et).
2. JSDoc'a algoritma formülü, normalize seçimi gerekçesi, tokenizer sınırları eklenmeli.
3. Eğer A seçilirse: `_extractActualKeywords`/`_computeDriftScore` `private` (TS keyword) yapılmalı veya `private`-by-convention dokümantasyonu netleştirilmeli.

---

## 8. Sprint 188 Follow-up Items

1. **Disposition kararı (BLOCKING):** Brain + Alperen, `specialization-drift.ts` için **wire / archive / replace** kararını ADR-038 amendment olarak versin. `agent-genealogy.ts` ile birlikte değerlendirilmesi öneriliyor (aynı tema, aynı semptom).
2. **Eğer wire kararı verilirse:** Sprint 188 task taslağı —
   - Task 1: `agent-pool.ts` içinde `recordOutcomeForAgent()` hook'una drift compute entegrasyonu.
   - Task 2: Config schema'da `agent_evolution.drift_threshold` & `agent_evolution.respecialize_threshold` ekle.
   - Task 3: `RecentResult.evaluation` ağırlık entegrasyonu + i18n-aware tokenizer.
   - Task 4: Drift history persistence (`memory.db` type `agent_drift`) + Nervous System alert kuralı.
3. **Eğer archive kararı verilirse:** Sprint 188 tek task'lı temizlik —
   - Dosya + test'i `.deckent/archive/dead-code/sprint-186/` altına taşı; ADR-038 entry güncelle; `architecture.md` ve `DEAD-CODE.md` referanslarını sil.
4. **Test kapsama review (P2):** 15 test'ten matematiksel invariant (idempotency, simetri, boundary) test sayısını çıkar; davranış-tabanlı kapsam zaten iyi, ama formal property test yararlı olabilir (vitest `it.each`).
5. **ADR-032 hizalaması:** Tokenizer Unicode/locale-aware hale getirilmediği sürece Türkçe agent'lar için drift sinyali güvenilmez — bunu disposition kararı ile birlikte not düş.
6. **`agent-genealogy ↔ specialization-drift ↔ promotion-pipeline ↔ outcome-tracker` 4'lü grafiğin** mimari diyagram olarak `architecture.md`'e eklenmesi (currently "wire missing" üçgeni görünmüyor).

---

## 9. Summary

| Boyut | Değerlendirme |
|---|---|
| **Statü** | **Dead code** — `src/` içinde 0 importer; yalnızca 145 LoC dedicated test suite tarafından canlı tutuluyor |
| **Risk** | HIGH — modül havuzda "false signal of capability" yaratıyor (var ama çalışmıyor) |
| **ADR uyumu** | ADR-001/002/003/008/037 ✅ • ADR-038 ❌ ihlal (Sprint 139'dan beri açık disposition) • ADR-032/041 ⚠️ zayıf hizalama |
| **Kod kalitesi** | Düşük-orta karmaşıklıkta, pure-function class, `any` yok, side-effect yok — özünde "iyi yazılmış ama bağlanmamış" |
| **Disposition önerisi** | Sprint 188'de Brain + Alperen tarafından **WIRE veya ARCHIVE** olarak karar verilmeli; durum belirsiz bırakılırsa Sprint 187+ envanter borcu büyür |
| **Acil aksiyon** | ADR-038 amendment proposal — bu dosya için disposition kararı ve `agent-genealogy.ts` ile birlikte değerlendirme |

**Verdict:** **AUDIT COMPLETE — DISPOSITION PENDING.** Modül teknik olarak temiz ama mimari olarak orphan; Sprint 139 audit'inden beri çözülmemiş bir teknik borç noktası. Sprint 188 entry kriteri: ADR-038 amendment.
