# `.deckent/ground-truth-overrides.json` Audit — Doc-Sync Ground-Truth Whitelist — 2026-05-22

**Kapsam:** `.deckent/ground-truth-overrides.json` — ne olduğu, içeriği, veri akışı, override'ın güncelliği  
**Metodoloji:** Sistematik debugging — tüketici kod okundu, `measureAgentsCount` kaynağı diskte doğrulandı, override semantiği kanıtla teyit edildi  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı

---

## Bu Dosya Nedir

`.deckent/ground-truth-overrides.json` — **doc-sync ground-truth whitelist**'i (Sprint 166 Task T4, Bug Y2). Deckent'in doc-sync agent'ları stale sayısal iddia üretiyordu (Sprint 164'te "15 vs 16 agents" regresyonu). Buna karşı **3 katmanlı savunma** kuruldu — bu dosya da insan-onaylı bir **istisna listesi**dir.

Mevcut içerik — tek override:
```json
{ "metric": "agents_count", "expected": 15, "approvedBy": "alperen",
  "until_sprint": 170, "reason": "Sprint 148 ADR-041 reform stable — 15 vertical agents" }
```

Anlamı: "Bir task/doc '15 agents' iddia ederse ve ölçülen sayım 15 değilse, bu mismatch'i bastır — çünkü 15 insan-onaylı doğru — sprint 170'e kadar."

**Git durumu:** git-tracked; Sprint 166'da oluşturuldu (`72b49473`), bir daha güncellenmedi.

---

## Veri Akışı — Nereden Beslenir / Nereyi Besler

### Nereden beslenir
**Yalnızca elle** — `approvedBy` alanı insan onayını taşır. Generator yok; `deckent init` bu dosyayı oluşturmaz (opsiyonel). Sprint 166'da elle yazıldı.

### Nereyi besler — 3 katmanlı doc-sync savunması
| Katman | Dosya | Rol |
|--------|-------|-----|
| Plan-time | `src/orchestra/planner.ts` | Plan aşamasında ground-truth claim kontrolü |
| Helper | `src/orchestra/task-builder.ts` | Worker prompt kurarken claim kontrolü |
| Runtime | `src/monitor/auditor.ts` | 30sn scan döngüsünde `scanTasksForGroundTruthMismatches` → `doc_sync_ground_truth_mismatch` violation/alert |

Üç katman da `loadGroundTruthOverrides()` ile dosyayı okur, `current < until_sprint` ile geçerliliği kontrol eder.

**Ground-truth ölçümü:** `measureAgentsCount()` — `src/core/builtins/agents/` altındaki dizinleri sayar (gerçek ölçüm, el-data değil). Dizin yoksa `-1` → kontrol atlanır (fail-safe).

```
ground-truth-overrides.json (elle, insan-onaylı)
        │
        ▼  loadGroundTruthOverrides()
planner.ts (plan-time) · task-builder.ts (helper) · auditor.ts (runtime)
        │                                                  │
        ▼  measureAgentsCount(src/core/builtins/agents/)    ▼
   claim vs measured ──> mismatch? ──> override? ──> doc_sync_ground_truth_mismatch
```

---

## Çekirdek Tasarım — Sağlam Olan

- **Gerçek ölçüm:** `measureAgentsCount` diskteki dizinleri sayar — el-data değil. Doğrulandı: `src/core/builtins/agents/` = **15 dizin**.
- **Fail-safe:** Dosya yok/bozuk → `loadGroundTruthOverrides` `[]` döner; ölçüm dizini yok → `-1` → kontrol atlanır. Hiçbir yol exception fırlatmaz.
- **Sıfır-tolerans:** Herhangi bir mismatch → 1 violation.
- **`until_sprint` ile süreli istisna:** İstisnalar kalıcı değil — süre dolunca otomatik etkisizleşir (whitelist'in sonsuza kirlenmesini önler).
- **3 katman tutarlı:** planner / task-builder / auditor aynı yükleme + aynı expiry mantığını kullanır.
- **`approvedBy` audit-trail:** Her override insan onayı taşır.

---

## Tespit Edilen Sorunlar

### Sorun 1 — Tek Override Çifte Ölü (expired + redundant)

**Öncelik:** Düşük (zararsız — fail-safe)  
**Kök Neden:** Dosyadaki tek override iki bağımsız nedenle artık etkisiz:

1. **Expired:** `until_sprint: 170`, mevcut sprint **186**. `overrideApplies` `current < o.until_sprint` (`186 < 170`) → `false`. Sprint 170'ten beri (16 sprint) ölü.
2. **Redundant:** Override yalnızca "bir task `15` iddia eder **ve** ölçülen ≠ 15" durumunda iş yapar. Ama `measureAgentsCount` = **15** (doğrulandı). Task "15 agents" derse `claimed === measured` → mismatch hiç oluşmaz → `overrideApplies` çağrılmaz bile. Yani süresi dolmamış olsaydı bile bu override boşa.

**Etki:** Yok — sistem fail-safe; expired override asla `true` döndürmez, yanlış bastırma olmaz. Ancak dosya, amacı (Sprint 148-149 ADR-041 reform geçiş dönemi "15 vs 16" akışkanlığı) sona ermiş **stale bir kalıntı** taşıyor.

**Durum:** Belgelendi — bkz. Gelecek Öneriler #1. Dosya `approvedBy: alperen` taşıyan bir **insan-onay artefaktı** olduğu için bu turda elle düzenlenmedi (kullanıcı kararı).

---

### Sorun 2 — Süresi Dolmuş Override Hijyeni Yok

**Öncelik:** Düşük (gözlem)  
**Kök Neden:** `loadGroundTruthOverrides` tüm override'ları yükler; `overrideApplies` süresi dolanı sessizce yok sayar. Hiçbir mekanizma "override'ın N sprint önce expired oldu, kaldır ya da yenile" uyarısı vermez. Expired bir override dosyada sonsuza kadar oturur.

**Etki:** İşlevsel zarar yok ama whitelist dosyaları zamanla stale girdilerle dolar; OSS'te bir kullanıcı dosyayı açtığında geçerli/geçersiz ayrımını elle yapmak zorunda.

**Durum:** Belgelendi — bkz. Gelecek Öneriler #2.

---

## Uygulanan Değişiklikler

Bu tur **kod/dosya değişikliği yok** — saf analiz. `ground-truth-overrides.json` `approvedBy: alperen` taşıyan insan-onay artefaktıdır; expired override'ın kaldırılması kullanıcı kararına bırakıldı (Gelecek Öneriler #1).

**Doğrulama:** 3 tüketici (planner/task-builder/auditor) kodu okundu; `measureAgentsCount` kaynağı `src/core/builtins/agents/` diskte doğrulandı (15 dizin); `overrideApplies` expiry semantiği (`current < until_sprint`) kanıtla teyit edildi.

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- Ground-truth savunma sistemi sağlam tasarım — gerçek ölçüm, fail-safe, 3 katman, süreli istisna.
- Tek override expired + redundant — temizlenmeli (stale dead weight).

**Kullanıcı perspektifi:**
- Dosya opsiyonel — yoksa sistem fail-safe çalışır; `deckent init` oluşturmaz.
- Kavram (insan-onaylı, süreli ground-truth istisnası) iyi tasarlanmış; doc-sync agent'larının yanlış sayı üretmesine karşı gerçek koruma.
- Mevcut metrik tek: `agents_count`. `GroundTruthMetric[]` ile genişletilebilir ama şimdilik tek-metrik.

---

## Gelecek Öneriler

1. **Stale override temizliği:** Tek override (`agents_count:15`, expired sprint 170) `overrides: []` yapılarak kaldırılmalı — ölçülen sayım (15) zaten onaylı değerle eşit, override gereksiz. (İnsan-onay dosyası → Alperen kararı.)
2. **Expiry hijyeni:** Auditor, süresi dolmuş override için bir uyarı üretebilir ("override `agents_count` sprint 170'te doldu — kaldır ya da yenile") — whitelist'in stale girdilerle dolmasını önler.
3. **Metrik genişletme (opsiyonel):** Sistem `agents_count` dışına da uygulanabilir (skills_count, mcp_tools_count vb.) — doc-sync stale-sayı regresyonu yalnızca agent sayısında değil; `GroundTruthMetric[]` zaten genişlemeye açık.

---

## Kapanış

Audit 2026-05-22'de kapatıldı. `.deckent/ground-truth-overrides.json` = doc-sync ground-truth whitelist'i (Sprint 166 Bug Y2) — doc-sync agent'larının stale sayısal iddia üretmesine karşı insan-onaylı, süreli istisna listesi. 3 katman (planner/task-builder/auditor) tarafından tüketilir; `measureAgentsCount` ile gerçek ölçüme karşı doğrulanır. Sistem tasarımı sağlam (gerçek ölçüm, fail-safe, süreli istisna). **2 sorun belgelendi** — ikisi de düşük öncelik: tek override çifte ölü (expired sprint 170 + redundant, ölçüm zaten 15), ve expired-override hijyeni yok. İşlevsel risk yok; bulgular OSS temizliği kapsamında "Gelecek Öneriler"de izleniyor.
