# Monitor Module — Cross-Cutting Summary
**Task ID:** 142-027-fix | **Model:** opus | **Sprint:** God Analysis

## Modul Genel Bakisi

| Dosya | LoC | Tests (satir) | any | P0 | P1 | P2 |
|-------|-----|---------------|-----|----|----|-----|
| auditor.ts | 2017 | ~4949 | 8 | 0 | 3 | 4 |
| dashboard-manager.ts | 258 | ~271 | 0 | 0 | 0 | 0 |
| sprint-state.ts | 63 | ~89 | 0 | 0 | 0 | 0 |
| index.ts | 12 | — | 0 | 0 | 1 | 0 |
| **TOPLAM** | **2,350** | **~5,309** | **8** | **0** | **4** | **4** |

---

## Kritik Bulgu 1: auditor.ts God Module (2017 LoC, 8 Sorumluluk)

auditor.ts tek sinifta 8 farkli sorumlulugun bulundugu bir god module'dur:

1. **Scan loop lifecycle** — start/stop, interval yonetimi
2. **Heartbeat monitoring** — stale worker tespiti
3. **Scope violation detection** — git diff ile sinir kontrolu
4. **Lock management** — stale lock tespiti ve temizleme
5. **Dashboard update** — .dashboard dosyasi yazimi
6. **ADR compliance verification** — Sprint 138 Task 3
7. **Worker result verification** — Sprint 138 Task 3
8. **Tech debt validation** — Sprint 138 Task 3

**Etki:** 2017 LoC ile test edilemez karmasiklik, cyclomatic ~22 ile `scan()` fonksiyonu, `any` kullanimi ile tip guvenlik riski.

**Oneri (Sprint 142):**
- Verification pipeline → `src/monitor/audit-pipeline.ts` cikart
- Dashboard update → `DashboardManager.write()` delegate et (zaten var)
- Lock management → `src/core/lock-manager.ts` ayrıstir

---

## Kritik Bulgu 2: parseADRs() Dead Code

`auditor.ts` icinde ~satir 1589'da `parseADRs()` fonksiyonu mevcut:
- V1 DECISIONS.md parse eden eski implementasyon
- Memory V2 sonrasi artik cagrılmiyor
- "Fallback" yorumuyla birakilmis ama ADR-038 V1 fallback'lari yasakliyor
- `legacyADRCache` Map ile birlikte ~70 satir dead code

**Duzeltme:** `parseADRs()` ve `legacyADRCache`'i kaldir.

---

## Kritik Bulgu 3: Barrel Severely Outdated

`index.ts` (12 satir) Sprint 138/139 eklemelerini kapsamamaktadir:
- `DashboardManager` export edilmiyor
- `getCurrentSprintId` export edilmiyor
- `DashboardUpdater` adli yanlis isimli export var (P1)

Dis moduller monitor katmanini dogrudan dosya path'lerinden import etmek zorunda kaliyor.

---

## Guclu Noktalar

1. **dashboard-manager.ts ornek kalite:** validate/repair pattern, atomic write, gercek filesystem testleri, 0 any
2. **sprint-state.ts minimal ve dogru:** 63 satir, 0 any, JSDoc %100
3. **Test coverage genel yuksek:** 5309 satir test, ozellikle auditor kapsamli
4. **Memory V2 uyumu:** auditor.ts MemoryStore kullaniyor (DECISIONS.md parse yok)

---

## Zayif Noktalar Ozeti

| Bulgu | Dosya | Severity |
|-------|-------|---------|
| God module (8 sorumluluk, 2017 LoC) | auditor.ts | P1 |
| parseADRs() dead code (V1 fallback) | auditor.ts | P1 |
| ADR-008 soft violation (event-stream import) | auditor.ts | P1 |
| parseEvidenceCommand injection riski | auditor.ts | P2 |
| Barrel severely outdated | index.ts | P1 |

---

## Sprint 142 Oncelikleri

| Priority | Task | Dosya |
|----------|------|-------|
| P1 | parseADRs() + legacyADRCache kaldir | auditor.ts |
| P1 | barrel eksik export'lari ekle | index.ts |
| P1 | parseEvidenceCommand sanitization | auditor.ts |
| P2 | Verification pipeline extract | auditor.ts → audit-pipeline.ts |
| P2 | scan() god function parcala | auditor.ts |

**Modul genel sagligi: 7/10** (auditor.ts god module ve barrel eksikligi nedeniyle)
