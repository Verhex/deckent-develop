# Audit — `src/core/adr-seed.ts`

> Sprint 186 (carry over → 187) Per-File Pilot · Task `186-025`
> Tarih: 2026-05-21 · Auditor: doc-writer (worker, opus)

## 1. Inventory

| Field | Value |
|-------|-------|
| Path | `src/core/adr-seed.ts` |
| LoC (raw) | 469 satır (son satır boş; DIRECTIVES manifesti 470 olarak listeler — `wc -l` boundary farkı) |
| Module type | Pure data + bir tane factory fonksiyonu, side-effect yok |
| Imports | `import type { CreateEntryInput } from './memory-types.js'` — **tek import**, üstelik `type-only** |
| Exports | `export const ADR_SEED_DATA: CreateEntryInput[]` (40 element), `export function createIdentitySeed(projectName: string): CreateEntryInput` |
| Element count | 40 ADR (`adr-001` → `adr-039` + `adr-022-v2`) |
| Status distribution | 38 `accepted`, 1 `deprecated` (`adr-005`), 1 `superseded` (`adr-022`) — identity helper `active` döner ama array dışında |
| `decay_exempt` | Tüm girişlerde `true` (kalıcı bilgi) |
| `source` field | `'import'` (array), `'system'` (identity helper) |
| Reverse deps (prod) | `src/cli/commands/init-steps.ts:45,462,465` — `deckent init` DB preload akışı |
| Reverse deps (tests) | `tests/cli/init.test.ts:9-68` — 7 spec (count, fields, status set, uniqueness, spot-check, ADR-005 deprecated, identity helper) |
| Reverse deps (docs) | `docs/superpowers/plans/2026-04-17-sprint-143-implementation-plan.md:727-728`, `docs/directives/sprint-143.md:160-164` |
| ESM `.js` ext | ✅ `'./memory-types.js'` (ADR-001/002 uyumlu) |
| Runtime deps | Yok — yalnızca built-in TS type (`CreateEntryInput`) |

## 2. Baglam

Bu dosya Sprint 143'te `archive-decisions-md` çalışmasıyla birlikte doğmuştur (header yorumu satır 3-9). `.brain/DECISIONS.md` (1505 satırlık root düzeyi ADR dosyası) `.brain/archive/decisions-root-pre-sprint143/`'a taşınınca, "yeni bir proje deckent ile init edildiğinde Memory V2 DB hangi ADR'ları taşımalı?" sorusuna cevap üretmek için seed bundle olarak tasarlanmış. Sözleşme şudur: dosya **yalnızca** `deckent init` zamanı tüketilir; runtime'da Brain ADR sorguları `store.getByType('adr')` üzerinden `.brain/memory.db`'den gelir, bu dosyadan değil.

Mimari rol → bootstrap-only veri kataloğu. ADR-008 (Brain Merkezi Import) ihlali yok çünkü dosya `orchestra/`, `agents/` veya `monitor/` paketlerinden hiçbir şey çekmez; aksine `core/`'da bir leaf modül. ADR-029/030 (Managed-Docs) ile teması yok. ADR-046 (Brain Self-Update Hook) işlevsel olarak bu dosyaya yazmayı tetikleyebilirdi — fakat halihazırda yeni ADR'lar `.brain/exports/decisions.md`'e yazılırken bu seed dosyası **manuel bakımda** kalmış.

## 3. Debt Risk

| # | Risk | Sev. | Kanıt | Etki |
|---|------|------|-------|------|
| D1 | **Seed drift** — Live registry adr-040 → adr-064 (25 ADR) içeriyor; seed yalnızca adr-039'a kadar. Yeni init projesi 25 ADR'dan habersiz. | HIGH | `.brain/exports/summary.md` adr-064'e kadar listeler; `adr-seed.ts:445-454` adr-039'da biter. | Yeni proje boot'unda 25 mandatory constraint eksik → ADR-036 governance gate "boş" çalışır. |
| D2 | **Placeholder content** — adr-029 → adr-039 girişlerinde `title == content == summary`. Tam metin DECISIONS.md arşivinde bırakılmış. | MEDIUM | satır 335-454 — örn. `content: 'Managed-Docs Universalization — …'` (sadece başlık tekrarı). | `store.insert` sonrası FTS5 search bu ADR'lar için sadece başlık match'i bulur → recall düşer. |
| D3 | **Tests min 40 lock-in** — `tests/cli/init.test.ts:21` `>=40` der; seed tam 40 → eleman çıkarma testleri kırar, fakat `adr-022-v2` "v2" naming convention'ı geleceğe uygun değil. | LOW | `tests/cli/init.test.ts:42-46` ID uniqueness ister. | İleride ADR amendment versiyonlama tasarımı tekrarlanırsa naming koşulu sıkışır. |
| D4 | **Title escape inconsistency** — `adr-012` başlığı `'register\\<Name\\>(program) Pattern'` (escape), diğerleri ham UTF-8 (`Tek Yönlü Bağımlılık`). | LOW | satır 139 vs satır 95. | Markdown render farkı; ekspot edilen `decisions.md`'de `\<` görünür. |
| D5 | **`source: 'import'` semantik kayması** — Tüm ADR'lar `'import'` olarak işaretli; oysa yeni eklenecekler doğrudan seed'e yazılırsa `'system'` veya `'manual'` olmalı. Memory-types provenance gevşek. | LOW | satır 21 vs `createIdentitySeed.source = 'system'` (satır 464). | Provenance filtreleri ileride bu seed'i "kullanıcı içe aktarımı" sanır. |

## 4. Dead Code Candidates

| Sembol | Kanıt | Karar |
|--------|-------|-------|
| `ADR_SEED_DATA` | `src/cli/commands/init-steps.ts:462 — for (const adr of ADR_SEED_DATA) { store.insert(adr); }` + tests | **CANLI** — silme |
| `createIdentitySeed` | `src/cli/commands/init-steps.ts:465 — store.insert(createIdentitySeed(projectName));` + `tests/cli/init.test.ts:61-67` | **CANLI** — silme |
| Tek tek ADR objeleri | Tümü array içinde tüketiliyor | **CANLI** — array, atomik tüketiliyor |
| `decay_exempt: true` | `memory-types.ts` field; `store.decay()` bu bayrağı kontrol eder | **CANLI** — semantik korunuyor |

Grep `adr-seed|ADR_SEED_DATA|createIdentitySeed` (workspace, node_modules hariç): 5 dosya match → 2 prod (`src/...`), 1 test, 2 docs/plan. Hiç ölü sembol bulunamadı.

## 5. Documentation Gaps

| Gap | Konum | Öneri |
|-----|-------|-------|
| `createIdentitySeed` JSDoc'ta `@param projectName` ve `@returns` yok | satır 457-468 | Tek satır JSDoc parametre + dönüş semantiği — `identity-project` ID'sinin tekil olduğu netleştirilmeli (insert idempotency). |
| `ADR_SEED_DATA` için "bu liste manuel güncellenir, regen scripti yok" notu eksik | satır 13-14 | Header yorumda bakım protokolü: "yeni ADR `.brain/exports/decisions.md`'e yazıldığında bu array ne zaman senkron edilir?" |
| adr-005 `deprecated`'in **neden** deprecated olduğu seed'de görünmez | satır 60-69 | `content` alanına "deprecated by adr-024" gibi `supersedes`/`caused_by` ipucu eklenmeli (memory-types `relations` ile zaten desteklenir ama seed bu kanalı kullanmıyor). |
| adr-022 ve adr-022-v2 ilişkisi şart yokken seed'de implicit | satır 247-256, 301-311 | `relations: [{ kind: 'supersedes', target: 'adr-022' }]` v2 üzerinde olmalı — yoksa Brain "iki adr-022 var" zannedebilir. |
| Stub içerikli ADR'lar (adr-029..adr-039) için "tam metin için `.brain/exports/decisions.md`'e bak" notu yok | 9 entry | Kısa pointer satırı her stub content alanına. |

## 6. ADR Compliance Check

| ADR | Beklenti | Durum | Kanıt |
|-----|----------|-------|-------|
| ADR-001 (TypeScript + ESM) | ESM, `.ts` source | ✅ | `import type … from './memory-types.js'` |
| ADR-002 (Node16 Module Resolution) | `.js` uzantı zorunlu | ✅ | satır 11 |
| ADR-008 (Brain Merkezi Import — Tek Yönlü) | core/ leaf, orchestra/agents import yok | ✅ | Tek import: `memory-types.js` (same dir) |
| ADR-010 (Minimal Runtime Deps) | Runtime dependency eklenmemeli | ✅ | Yalnızca built-in tip; runtime import 0 |
| ADR-036 (ADR Governance Integration) | Mandatory ADR'lar enforcement edilir | ⚠️ | Seed adr-039'da biter → adr-040..adr-064 (25 ADR) seed'de **yok**. Yeni init'lerde governance "boş" başlar (D1). |
| ADR-046 (Brain Self-Update Hook) | Brain yeni ADR yazınca seed senkron olmalı | ❌ | Hook seed'i update etmiyor; manuel drift D1 oluşmuş. |
| ADR-035 (Verification Protocol) | Bu dosya pure-data, doğrulama yüzeyi yok | N/A | İlgisiz. |
| ADR-038 (Dead Code Disposition) | Ölü kod yok | ✅ | §4 |
| ADR-039 (Self-Modifying Task Detection) | Self-modify riskli mi? | ⚠️ | Seed güncellemesi deckent-dogfood'da self-modifying task'tır → `.deckent/config.json:198` `dependency_pipeline_enabled:false` ile manuel wave gerekir. |
| ADR-044 (Sprint State Observability) | Bu dosya state üretmez | N/A | İlgisiz. |

## 7. Refactor Recommendations

1. **Seed regen scripti (R1, öncelik HIGH).** `scripts/regen-adr-seed.mjs` ekle: `.brain/memory.db` → `getByType('adr')` → bu dosyayı (sadece import + `export const` blokları) yeniden üretir. Brain ADR insert hook'unu (ADR-046) bu script'i tetikleyecek şekilde wire et. Manuel drift (D1) elimine olur.
2. **Stub content hidratasyonu (R2, öncelik MEDIUM).** adr-029..adr-039 girişlerinin `content` alanlarına `.brain/archive/decisions-root-pre-sprint143/DECISIONS.md`'den tam metni kopyala (veya en azından özet + arşiv pointer). FTS5 recall artar (D2).
3. **`relations` field kullanımı (R3, öncelik MEDIUM).** adr-005 (deprecated) ve adr-022 (superseded) entry'lerine `relations: [{ kind: 'superseded_by', target: 'adr-022-v2' }]` veya `supersedes` ekle. `memory-types.ts` zaten destekliyor (relations tablosu). Bugün boş.
4. **Resource externalization (R4, öncelik LOW).** Eğer TS const yerine `src/core/adr-seed.json` veya `.brain/seeds/adr.json` tutulursa, regen scripti TS recompile gerektirmez. Trade-off: type safety kaybedilir → Zod runtime validation eklenmesi gerek (ADR-010 izinli).
5. **`source: 'import'` vs `'system'` ayrımı (R5, öncelik LOW).** Seed entry'leri `'system'` olarak işaretlenmeli (kullanıcı tarafından *import* edilmedi, deckent'in *built-in*'i). `provenance` filtreleri netleşir.
6. **JSDoc tamamlama (R6, öncelik LOW).** `createIdentitySeed` için `@param`/`@returns` ekle; `ADR_SEED_DATA` üstüne bakım protokolü notu yaz.

## 8. Sprint 188 Follow-up Items

- [ ] **F1 (HIGH):** R1'i task olarak aç — "Sprint 188 Task X: adr-seed.ts regen script + ADR-046 hook wire". Live registry sayımı ≥ seed sayımı garantisi.
- [ ] **F2 (MEDIUM):** R2'yi task olarak aç — adr-029..adr-039 + adr-040..adr-064 (≥36 entry) için içerik hidratasyonu, FTS5 sanity test.
- [ ] **F3 (MEDIUM):** `tests/cli/init.test.ts:21` `>=40` eşiği için "live count" dinamik testi ekle: seed length = ADR registry length.
- [ ] **F4 (LOW):** R3'ü tek bir refactor PR olarak aç (`relations` ekleme, adr-022 ↔ adr-022-v2 + adr-005 ↔ adr-024).
- [ ] **F5 (LOW):** Doc lint kuralı — `adr-seed.ts` header yorumda "Last synced: sprint-NNN" satırı zorunlu, lint script kontrol etsin.
- [ ] **F6 (BLOK):** Eğer F1 kabul edilmezse, **CHANGELOG / DECKENT.md "Known Limitations" bölümüne** "yeni init'ler adr-039 sonrasını otomatik tanımıyor" notu eklenmeli — ADR-036 governance saydamlığı için.

## 9. Summary

`src/core/adr-seed.ts` Sprint 143'te `.brain/DECISIONS.md` parçalanırken doğmuş, 40 ADR girişi + 1 identity factory içeren saf veri modülüdür. Mimari olarak `core/` leaf seviyesinde, runtime dep'i yok, ADR-001/002/008/010 uyumlu. Aktif kullanım: `deckent init` Memory V2 DB preload (`init-steps.ts:462-465`) + 7 vitest specifikasyonu. **Tek ciddi borç D1 — seed drift**: live ADR registry adr-064'e kadar gitmişken seed adr-039'da donmuş; bu ADR-036 governance ve ADR-046 self-update kontratlarını sessizce zayıflatıyor. İkincil borç D2: adr-029..adr-039 girişlerinde content alanı placeholder (title kopyası), FTS5 recall'u kısıtlıyor. Önerilen tek-PR çözümü: **R1 (regen scripti + Brain ADR insert hook wire)**, D1 ve D2'yi birlikte kapatır. Dead code yok, lint/test riski düşük, refactor güvenli sınırlı yüzey. Sprint 188 için F1+F2+F3 üçlüsü öncelikli; gerisi opportunistic.
