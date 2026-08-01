# Sprint 171 — Task 19: Tip Güvenliği Denetimi (Type Safety Audit)

**Audit tarihi:** 2026-05-15
**Denetleyen:** w-171-019 (architect agent, opus model, typescript-expert skill)
**Kapsam:** Tüm `src/` kaynak ağacı (orchestra, core, agents, monitor, connectors, providers, api, mcp, cli, dashboard, extensions, nervous) + `tests/` baseline ölçümü + `tsconfig*.json`
**Mod:** Audit-only (kod/test/config değiştirilmez, yalnızca tek rapor dosyası yazılır)
**ADR referansı:** ADR-001 (TypeScript + ESM), ADR-002 (Node16 Module Resolution)

---

## 1. Bulgular

Bu denetim, deckent kaynak tabanının TypeScript tip disiplinini char-level taramıştır. Soruları:
"İhlal mi, kasıtlı kaçış mı, gerçekten gerekli mi, OSS GA öncesi kullanıcıyı/runtime'ı yanıltır mı?"
Her bulgu **tek bir sayısal kanıt** + risk değerlendirmesi ile § 3'te file:line ile çapalanmıştır.

### 1.1. POZİTİF — `tsconfig.json` (Üretim Kaynağı) Strict Disiplini Modern Seviyede

`tsconfig.json:10-22` zaten OSS GA için beklenen taban strict konfigürasyonun büyük çoğunluğunu sağlıyor:

| Flag | Değer | Etki |
|------|-------|------|
| `strict` | `true` | strictNullChecks + strictFunctionTypes + strictBindCallApply + strictPropertyInitialization + noImplicitAny + noImplicitThis + alwaysStrict + useUnknownInCatchVariables (default açık) hepsi açık |
| `noUnusedLocals` | `true` | Ölü lokal değişken derlemeyi kırar |
| `noUnusedParameters` | `true` | Kullanılmayan parametre derlemeyi kırar |
| `noFallthroughCasesInSwitch` | `true` | Switch fall-through derlemeyi kırar |
| `noUncheckedIndexedAccess` | `true` | `arr[i]` artık `T \| undefined` döner — index erişim zorunlu narrowing |
| `forceConsistentCasingInFileNames` | `true` | macOS/Linux importer drift yok |
| `isolatedModules` | `true` | Per-file transpilation güvencesi (esbuild/swc uyum) |
| `module` / `moduleResolution` | `Node16` | ADR-002 ile uyumlu, ESM `.js` uzantı zorunluluğu derleyici tarafından enforce ediliyor |

Bu, deckent için **birinci derece pozitif bulgudur**: 247 kaynak dosyayı tarayan denetim, strict baseline'ı aşacak bir derleme hatasıyla karşılaşmadı (`npx tsc --noEmit` sıfır error — § 3.1 doğrulaması). Bu denetimin geri kalanındaki uyarılar, "iyi bir taban üzerinde nokta iyileştirme" niteliğindedir, "tip disiplini çöküyor" değil.

### 1.2. POZİTİF — `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` Üretim Kaynağında SIFIR

`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` direktifleri **`src/` ağacında bir tane bile yok**. Tek bulunan iki referans:
- `src/core/builtins/skills/typescript-expert/SKILL.md:5` — uzman rehber içerik (bilgi, kod değil).
- `src/core/builtins/skills/ci-testing/SKILL.md:165` — checklist maddesi (rehber).

Test ağacında 3 dosyada toplam **9 adet `@ts-expect-error`** kullanımı var (§ 3.2). Hepsi runtime safety testleri için kasıtlı (tipte hata bekleniyor, runtime'da kaçınılan kontrol test ediliyor). Bu bir tip disiplini açığı değil; testin doğası gereği gerekli.

### 1.3. DÜŞÜK — Üretim Kaynağında `: any` Annotation İki Yere İndirgenmiş, Diğer "any" Eşleşmeleri Yorum İçinde

`src/` üzerinde gerçek `: any` annotation **iki yerde**, her ikisi de aynı modülde ve aynı sebepten:
- `src/core/memory-query.ts:194` — `db: any` (eslint-disable-next-line ile beraber)
- `src/core/memory-query.ts:256` — `db: any` (eslint-disable-next-line ile beraber)

Diğer 14 grep eşleşmesi (`src/monitor/auditor.ts:867,1349,2153`, `src/core/utils.ts:27`, `src/orchestra/sprint-controller.ts:397`, `src/orchestra/sprint-phases.ts` 9 satır) **JSDoc/inline yorum** içinde "any I/O error" gibi İngilizce ifadelerden geliyor — gerçek tip annotation değil. Sayıların temizlenmiş hali: 2 gerçek `: any`.

**Risk:** Bu iki kullanım, `better-sqlite3` `Database` tipinin doğrudan import edilebilir olmasına rağmen tercih edilmemiş. `import type { Database } from 'better-sqlite3'` ile değiştirildiğinde `db.prepare(sql).all(...)` çağrısı tipli olur ve `as FtsResultRow[]` çift cast'i (line 236) hala gerekir ancak `db` parametresi runtime kontratını yansıtır. Sadece **iki yer** ve eslint-disable ile işaretli olduğundan **LOW severity**.

### 1.4. POZİTİF — `as any` Üretim Kaynağında SIFIR Gerçek Kullanım

`src/` üzerinde `as any` regex eşleşmesi yalnızca **`src/core/memory-import.ts:313`'te bir adet** ve bu **yorum içinde** geçiyor:
```
// MemoryStore does not yet expose a typed migration API, but the better-sqlite3
// Database instance is reachable through `store as any`. The transaction
```
Gerçek kullanım hemen bir sonraki satırda (`memory-import.ts:315`) **doğru pattern** olan `as unknown as { db: Database }` çift-cast'i ile yapılıyor. Yani üretim kaynağında **sıfır** runtime kontrolsüz `as any`.

Test ağacında ise `as any` kullanımı **708 adet, 107 dosyada** (§ 3.3) — bu mock/stub kurulumunu kolaylaştıran test kalıbı, üretim runtime'ına dokunmuyor, ancak çok yüksek bir sayı (Sprint 172 OSS GA'nın test bakım maliyetini etkiler — § 4.6 öneri).

### 1.5. POZİTİF — `Record<string, any>` ve `any[]` Üretim Kaynağında SIFIR

`Record<string, any>` ve `any[]` formları için tüm `src/` ağacında grep eşleşmesi: **0**. Buna karşılık `Record<string, unknown>` 80 dosyada 277 kullanım var. Bu, deckent'in tipsiz container'lardan tamamen kaçındığını ve doğru `unknown` pattern'ını sistematik biçimde uyguladığını gösteren güçlü bir disiplin sinyalidir.

### 1.6. ORTA — Non-Null Assertion `!` Operatörü Aşırı Kullanımı (38 yer)

`src/` üzerinde non-null assertion `!` operatörü **38 yerde** yayılı (§ 3.4 toplu file:line listesi). Üç alt kategoriye ayrılır:

**(a) `arr[i]!` — `noUncheckedIndexedAccess` Kompansatörü (≈ 30 kullanım):**
`tsconfig.json:22`'de `noUncheckedIndexedAccess: true` açık olduğundan TS derleyicisi `arr[i]`'nin `T | undefined` döndüğünü kabul ediyor. Geliştirici bunu `arr[i]!` ile susturuyor. Örnekler:
- `src/orchestra/task-builder.ts:612,626,725,734,746,752` — DIRECTIVES parser döngülerinde
- `src/orchestra/outcome-tracker.ts:369,386,401,405` — istatistik biriktirme döngülerinde
- `src/orchestra/managed-docs/section-updater.ts:20,24,30,31` — markdown bölüm güncelleyicisinde
- `src/cli/helpers/wizard.ts:64,115,249,272,279` — wizard akışlarında

Bu pattern çoğunlukla **for-loop içinde index garantili** olduğu için pratikte güvenli. Ama runtime'da array beklenmedik biçimde boşalırsa `TypeError: Cannot read property of undefined` üretir — `noUncheckedIndexedAccess`'in koruma niyetini sıfırlıyor.

**(b) Map/Record Get Sonrası `!` (≈ 5 kullanım):**
- `src/core/memory-export.ts:178` — `groups.get(key)!.push(mem)` (set edildikten hemen sonra get)
- `src/orchestra/sprint-metrics.ts:570` — `fileSprintMap.get(f)!.add(sprintId)` (aynı pattern)
- `src/cli/commands/cost.ts:90` — `byProvider.get(m.provider)!.push(m)` (aynı pattern)
- `src/core/pricing-updater.ts:347` — `newData.get(provider)!.set(...)` (aynı pattern)

Bu kullanımların çoğu **set sonrası get** desenidir; pratikte güvenli ama tip-zayıflığı. Refactor önerisi § 4.3'te.

**(c) Object Index ile Static-Known Key Erişimi (≈ 4 kullanım):**
- `src/core/config.ts:107,114,121,128` — `MODE_PRESETS['performance']!.max_workers` (literal key, MODE_PRESETS static)
- `src/cli/commands/config-nervous.ts:282` — `PRESET_DESCRIPTIONS[p]!.description`

Static-known key olduğundan **fonksiyonel olarak güvenli**, ama TypeScript bunu kendisi çözebilirdi eğer `MODE_PRESETS` `Record<string, ...>` yerine `Record<PlanMode, ...>` typed olsaydı. § 4.3 öneri.

**Severity dağılımı:** 38 kullanımın hiçbiri **gerçek runtime crash kanıtlı değil**, ama hepsi `noUncheckedIndexedAccess`'in tip-güvenliği kazançlarını silikleştiriyor. **MEDIUM** olarak sınıflandı.

### 1.7. ORTA — Üç Adet "Validation'sız Cast" Üretim Hot-Path'inde

Genel olarak 1131 `as <Type>` eşleşmesinin çoğu güvenli pattern (`as const`, `as readonly string[]`, narrow-after-includes-check). Üç pattern ise kullanıcı ya da disk üzerinden gelen veriyi runtime validation olmadan tipli sayıyor:

**(a) `src/core/config-migration.ts:542-544`** — Project config'i yüklenirken üç field için kontrolsüz cast:
```ts
const brainProvider = config['brain_provider'] as ProviderName | undefined;
const workerProvider = config['worker_provider'] as ProviderName | undefined;
const fallbackProvider = config['fallback_provider'] as ProviderName | undefined;
```
JSON dosyasından okunan değer `ProviderName` (`'claude' | 'codex' | 'gemini'`) olarak işaretleniyor, ama `if (brainProvider && ...)` sonrası `providers.brain = brainProvider` atamasına geçiliyor — kullanıcı `"brain_provider": "openai"` yazarsa runtime'da `ProviderName` kontratı kırılır, downstream `providers.brain === 'claude'` switch'leri bilinmeyen değer alır. **MEDIUM** — kullanıcı kontrolündeki bir input. Önerilen düzeltme: validation function (`isProviderName(x): x is ProviderName`) sonrası narrow.

**(b) `src/orchestra/task-builder.ts:998`** — Routing meta'sından gelen DNA için cast:
```ts
effectiveSkillPrompts = filterSkillPromptsByDNA(skillPrompts, rawDNA as TaskDNA);
```
`task.routingMeta?.taskDNA` zaten `unknown` tipli (api-surface.md kontratına göre). `rawDNA as TaskDNA` cast'i runtime şekli garanti etmiyor. `filterSkillPromptsByDNA` içinde validation yapılıyorsa pratikte güvenli; yapılmıyorsa boundary çatlağı. **LOW–MEDIUM** — kapsam, deckent kendi yazdığı routing meta — kullanıcı doğrudan dokunmuyor.

**(c) `src/nervous/detectors/dead-event-stream.ts:144`** — Event stream satırı parse edilirken:
```ts
const event = JSON.parse(lines[i]!) as { timestamp?: string };
```
`JSON.parse` zaten `any` döner; `as { timestamp?: string }` runtime garanti etmiyor. Disk dosyasından okunan satır, deckent'in kendi yazdığı stream olsa bile, korruptse `event.timestamp` access'i `undefined` dönebilir ki bu durum üst kod'da kontrol edilmiyor (sonraki satır `new Date(event.timestamp)` çağırıyor). **MEDIUM** — boundary'de validation eksik.

### 1.8. ORTA — `useUnknownInCatchVariables` Default Davranışına Bağlanmış, Explicit Set Yok

`tsconfig.json:10` `strict: true` açıldığı için `useUnknownInCatchVariables` flag'i TypeScript tarafından **default açık** kabul ediliyor. Yani `catch (e)` blokları `e` üzerinde `unknown` tipi atıyor. Üretim kaynağında **496 catch bloğunda yalnızca 29'unda explicit `: unknown` annotation** var (§ 3.5). Geri kalan 467 catch bloğu davranışsal olarak `e: unknown` ama explicit yazılmamış. Bu işlevsel olarak sorun değil; ancak Sprint 172 OSS GA için tsconfig'e flag'i **explicit yazmak** geleceğin TypeScript versiyon değişikliklerine karşı koruyucu olur (TS 5.x'te değişme planı yok ama defense-in-depth). **LOW–MEDIUM** disiplin önerisi.

### 1.9. ORTA — `tsconfig.json` Üç Opsiyonel "Aşırı-Strict" Flag Kapalı

OSS GA seviyesi için aşağıdaki flag'ler opsiyonel ama yüksek değerli:

| Flag | Mevcut | Önerilen | Etki |
|------|--------|----------|------|
| `exactOptionalPropertyTypes` | (yok / false) | `true` | `{ x?: T }` artık `{ x: T \| undefined }` ile farklı tip — undefined explicit set'lenemez |
| `noPropertyAccessFromIndexSignature` | (yok / false) | `true` | `Record<string,T>` üyelerine `.foo` yerine `['foo']` zorunlu |
| `noImplicitOverride` | (yok / false) | `true` | Class override için `override` keyword zorunlu (sınıf hiyerarşisi azaldı ama mevcut nervous/* için faydalı) |

Bu üçü açılırsa olası tip iyileştirmeleri Sprint 172 OSS GA için "yeni katman bug yakalar" niteliğindedir. Tek başına eksiklik **LOW** ama OSS olgunluğu için **MEDIUM**.

### 1.10. DÜŞÜK — Eksik Explicit Return Type Sadece Bir Yerde

Üretim kaynağında `function NAME(...) {` formatında — yani açık `): ReturnType` yazılmamış — sadece **bir adet** export edilmiş fonksiyon var: `src/api/auth.ts:66` `bearerAuthMiddleware`. TypeScript inference doğru çıkarım yapıyor (closure return type), ama API yüzeyinde explicit return type yazılması okunabilirlik + Public API kararlılığı için tercih edilir. Diğer bütün exported function'lar explicit return type taşıyor. **LOW** — tek nokta.

### 1.11. DÜŞÜK — `dashboard/src` Strict Konfigürasyon Birebir Aynı + `any` SIFIR

`src/dashboard/tsconfig.json:8` `strict: true` açık. `src/dashboard/src` ağacında ne `: any` annotation ne `as any` cast eşleşmesi var. Bu, dashboard React tabanının (büyük ekosistem tip-zayıflığına ünlü bir alandır) deckent'te tip disiplinini koruduğunu gösteren ikinci pozitif bulgudur. `noUncheckedIndexedAccess` dashboard tsconfig'inde **set edilmemiş** — bu **LOW** öneri (üretim tsconfig'i ile parity sağlanması).

### 1.12. NOT — Test Tabanı Tip Tutumu (Bağımsız Severity Hesaplaması)

Test ağacında özet:
- `: any` annotation: 152 (36 dosya)
- `as any` cast: **708** (107 dosya)
- `@ts-expect-error`: 9 (3 dosya, kasıtlı)

Test'lerde `as any` çok yaygın; mock kurulumunda standart pattern. Üretim runtime'ı etkilemiyor ama Sprint 172 OSS GA için bir kullanıcı:
- Test örneklerini referans alıp kendi kodunda `as any` yayar (zararlı pattern transfer)
- Test maintenance maliyeti artar (mock drift Sprint 170 170-001'de zaten yaşandı — § 4.6 öneri)

Bu severity ayrı bir kapsam; üretim disiplini etkilenmiyor.

---

## 2. Severity

### 2.1. Severity Tablosu

| ID | Bulgu | Severity | Etkilenen Yüzey | OSS GA Blocker? |
|----|-------|----------|------------------|------------------|
| 1.1 | Strict baseline tam | **POZİTİF** | Tüm src/ | — |
| 1.2 | Üretim'de `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` sıfır | **POZİTİF** | Tüm src/ | — |
| 1.3 | `: any` annotation 2 yer (memory-query.ts) | **LOW** | memory-query.ts | Hayır |
| 1.4 | Üretim'de `as any` sıfır | **POZİTİF** | Tüm src/ | — |
| 1.5 | `Record<string,any>` / `any[]` sıfır | **POZİTİF** | Tüm src/ | — |
| 1.6 | Non-null `!` operator 38 kullanım | **MEDIUM** | task-builder, outcome-tracker, wizard, config | Hayır (operasyonel risk) |
| 1.7 | Validation'sız 3 cast (provider, taskDNA, event-stream) | **MEDIUM** | config-migration, task-builder, dead-event-stream | **Kısmen** — config-migration kullanıcı input boundary'si |
| 1.8 | `useUnknownInCatchVariables` explicit yazılmamış | **LOW–MEDIUM** | tsconfig.json | Hayır (defense-in-depth) |
| 1.9 | 3 opsiyonel strict flag kapalı | **MEDIUM** | tsconfig.json | Hayır (olgunluk işareti) |
| 1.10 | api/auth.ts:66 eksik return type | **LOW** | api/auth.ts | Hayır |
| 1.11 | dashboard tsconfig'de `noUncheckedIndexedAccess` yok | **LOW** | dashboard/tsconfig.json | Hayır |
| 1.12 | Test'lerde 708 `as any` | **MEDIUM (operasyonel)** | tests/** | Hayır (üretim runtime'ı dışı) |

### 2.2. Severity Sayım Özeti

- **CRITICAL:** 0
- **HIGH:** 0
- **MEDIUM:** 5 (1.6, 1.7, 1.9, 1.12 + 1.8 alt sınır)
- **LOW:** 4 (1.3, 1.8 alt sınır, 1.10, 1.11)
- **POZİTİF:** 5 (1.1, 1.2, 1.4, 1.5, 1.11 ikinci kısım)

**Genel verdict (tip güvenliği axis'inde):** deckent kaynak tabanının tip disiplini OSS GA için **GO**. Hiçbir CRITICAL/HIGH bulgu yok; tüm MEDIUM bulgular nokta iyileştirme. Sprint 172 OSS GA blokeri yok.

---

## 3. Kanıt

### 3.1. `tsc --noEmit` Baseline

```
$ npx tsc --noEmit && echo "TSC_PASS"
TSC_PASS
```
- Komut: `npx tsc --noEmit`
- Sonuç: 0 error, 0 warning (denetim sırasında doğrulanmıştır: 2026-05-15T10:25:38Z)
- `tsconfig.json:24` `include: ["src/**/*.ts"]`, `exclude: ["node_modules","dist","tests","src/dashboard"]` — yani üretim koleksiyonu (~247 dosya) sınanmıştır.

### 3.2. `@ts-ignore` / `@ts-expect-error` Tam Liste

Tüm src/ ağacında üretim kullanımı **sıfır**. Test ağacında:

| Dosya | Satır | Tip | Bağlam |
|-------|-------|-----|--------|
| `tests/agents/worker-ipc.test.ts` | 259 | `@ts-expect-error` | — intentionally removing off |
| `tests/agents/worker-ipc.test.ts` | 362 | `@ts-expect-error` | — temporarily remove |
| `tests/agents/worker-ipc.test.ts` | 374 | `@ts-expect-error` | (boş) |
| `tests/agents/worker-ipc.test.ts` | 448 | `@ts-expect-error` | (boş) |
| `tests/agents/worker-ipc.test.ts` | 461 | `@ts-expect-error` | (boş) |
| `tests/agents/worker-ipc.test.ts` | 474 | `@ts-expect-error` | (boş) |
| `tests/agents/worker-ipc.test.ts` | 482 | `@ts-expect-error` | — intentionally removing off |
| `tests/core/memory-stub-backfill.test.ts` | 16 | `@ts-expect-error` | — ESM .mjs import (no .d.ts shipped for ops script) |
| `tests/orchestra/result-evaluator.test.ts` | 115 | `@ts-expect-error` | — testing runtime safety |

`@ts-ignore` ve `@ts-nocheck` hiçbir test dosyasında bulunmuyor.

### 3.3. Üretim'de `: any` ve `as any` Tam Liste

`: any` annotation (gerçek annotation, JSDoc/yorum hariç):

| Dosya | Satır | Bağlam |
|-------|-------|--------|
| `src/core/memory-query.ts` | 194 | `db: any` (`ftsSearch` parametresi, `// eslint-disable-next-line @typescript-eslint/no-explicit-any` ile işaretli) |
| `src/core/memory-query.ts` | 256 | `db: any` (`structuredSearch` parametresi, aynı eslint-disable yorumu) |

Diğer 14 grep eşleşmesi (`auditor.ts:867,1349,2153`, `utils.ts:27`, `sprint-controller.ts:397`, `sprint-phases.ts:101,200,327,351,607,624,651,692,847`) JSDoc içinde **"any I/O error"** vb. ifadelerin bir parçası, gerçek annotation değil.

`as any` cast:
- Üretim'de gerçek kullanım: **0**.
- `src/core/memory-import.ts:313` üzerinde tek eşleşme **yorum içinde** (`// ... is reachable through \`store as any\`. ...`). Gerçek cast bir sonraki satırda (`memory-import.ts:315`) doğru pattern olan `as unknown as { db: Database }` ile yapılıyor.

Test ağacında `as any` sayımı:
- Toplam: **708** (107 dosya)
- En yoğun: `tests/core/agent-pool.test.ts:40`, `tests/cli/commands/init.test.ts:63`, `tests/mcp/tools/plan.test.ts:28`, `tests/orchestra/sprint-controller.test.ts:27`

### 3.4. Non-Null `!` Operatör Tam Listesi (38 yer)

`arr[i]!` patterni (`noUncheckedIndexedAccess` kompansatörü):
- `src/core/memory-import.ts:79,145`
- `src/orchestra/planner.ts:98`
- `src/orchestra/task-builder.ts:612,626,725,734,746,752`
- `src/orchestra/outcome-tracker.ts:369,386,401,405`
- `src/orchestra/conflict-resolver.ts:203,204`
- `src/orchestra/managed-docs/section-updater.ts:20,30,31`
- `src/orchestra/sprint-docs-updater.ts:358`
- `src/orchestra/event-stream.ts:272`
- `src/orchestra/sprint-planner.ts:103,117`
- `src/nervous/detectors/dead-event-stream.ts:144`
- `src/dashboard/analytics/success-chart-data.ts:58,59`
- `src/dashboard/analytics/skill-heatmap-data.ts:33,34`
- `src/cli/helpers/terminal-utils.ts:41`
- `src/cli/helpers/wizard.ts:64,115,249,272,279`
- `src/cli/commands/config-nervous.ts:282`
- `src/cli/commands/recall.ts:46`
- `src/cli/commands/nervous.ts:197,246,269,294`
- `src/cli/commands/init-steps.ts:527`
- `src/cli/commands/init-wizard.ts:108`
- `src/cli/commands/init.ts:279,285`
- `src/cli/commands/cleanup.ts:50,54,56` (string literal `'!.brain/archive/'` — bunlar `.gitignore` pattern değeri, non-null operator değil; raporda dışlandı)

Map/Set `get()!`:
- `src/core/memory-export.ts:178`
- `src/orchestra/sprint-metrics.ts:570`
- `src/cli/commands/cost.ts:90`
- `src/core/pricing-updater.ts:347`

Static-known key index:
- `src/core/config.ts:107,114,121,128` (MODE_PRESETS)
- `src/cli/commands/config-nervous.ts:282` (PRESET_DESCRIPTIONS)
- `src/orchestra/event-stream.ts:272` (yukarıda da var)

Diğer:
- `src/monitor/auditor.ts:1963` — `rule.targetFiles!.some(...)`
- `src/core/memory-export.ts:259,260` — `numMatch[1]!.padStart(...)`
- `src/core/adr-file-sync.ts:74` — `filenameMatch[1]!.padStart(...)`
- `src/orchestra/managed-docs/section-updater.ts:24` — `match[1]!.length`

### 3.5. Catch Bloğu Davranış Analizi

- Toplam `catch (\w+) {` (parametre-li): **496** (128 dosya) — kanıt için Grep query `catch\s*\(\s*\w+\s*\)\s*\{`
- Bunlardan explicit `catch (\w+: unknown)` annotation taşıyan: **29** (14 dosya) — Grep query `catch\s*\(\s*\w+\s*:\s*unknown\s*\)`
- Parametre-siz `catch {}` (TS 4.4+ özelliği, hata yutma): **599** (197 dosya) — Grep query `catch\s*\{`

`useUnknownInCatchVariables` default açık olduğu için 467 parametre-li catch davranışsal olarak `unknown` ama explicit yazılmamış. Parametre-siz catch sayısı (599) ayrı bir konudur — bu tip güvenliği değil error handling alanına girer (bkz. Task 171-020 Error Handling Audit).

### 3.6. Validation'sız Üç Cast (§ 1.7 Kanıtları)

**(a) `src/core/config-migration.ts:540-544`:**
```ts
let providersChanged = false;
const brainProvider = config['brain_provider'] as ProviderName | undefined;
const workerProvider = config['worker_provider'] as ProviderName | undefined;
const fallbackProvider = config['fallback_provider'] as ProviderName | undefined;
```
`config` parametresi `Record<string, unknown>` tipli (line 197). Cast sonrası `ProviderName` runtime garantisi yok. `isProviderName(x): x is ProviderName` type-guard'ı `src/core/provider.ts` içinde tanımlı olabilir (kontrol edilmedi — out of scope) ama burada kullanılmıyor.

**(b) `src/orchestra/task-builder.ts:995-998`:**
```ts
const rawDNA = task.routingMeta?.taskDNA;
let effectiveSkillPrompts = skillPrompts;
if (isV2 && rawDNA && skillPrompts && skillPrompts.length > 1) {
  effectiveSkillPrompts = filterSkillPromptsByDNA(skillPrompts, rawDNA as TaskDNA);
}
```
`task.routingMeta?.taskDNA` `unknown` tipli (api-surface.md kontratı). `if (... && rawDNA ...)` sadece truthy check, runtime şekli garanti etmiyor. `filterSkillPromptsByDNA` içsel validation yapıyorsa pratikte güvenli (kanıt için fonksiyon imzasına bakılmalı, Task 171-006 kapsam).

**(c) `src/nervous/detectors/dead-event-stream.ts:144`:**
```ts
const event = JSON.parse(lines[i]!) as { timestamp?: string };
```
`JSON.parse` `any` döner. `as { timestamp?: string }` runtime şekli zorunlu kılmıyor. `event.timestamp` kullanım'ı bir sonraki satırlarda `new Date(...)`'a geçiyor — corrupt satır için fail-safe yok.

### 3.7. Eksik Explicit Return Type — Tek Yer

`src/api/auth.ts:66`:
```ts
export function bearerAuthMiddleware(config: AuthConfig) {
  // returns a closure typed (req, res) => boolean
```
Komut: `grep -rnE "^(export )?function \w+\([^)]*\)\s*\{" /workspace/src --include="*.ts"` → tek eşleşme.

### 3.8. Dashboard `any` Sıfır

- `grep -rnE ":\s*any(\s|;|,|\)|\]|>|=)" /workspace/src/dashboard/src` → **No matches found**
- `grep -rnE "\bas\s+any\b" /workspace/src/dashboard` → **No matches found**

### 3.9. `Record<string, any>` ve `any[]` Sıfır

- `grep -rnE "Record<\s*string\s*,\s*any\s*>|Record<[^>]+,\s*any\s*>|any\[\]" /workspace/src` → **No matches found**

### 3.10. tsconfig Opsiyonel Strict Flag'leri Kapalı

- `grep -E "useUnknownInCatchVariables|noPropertyAccessFromIndexSignature|exactOptionalPropertyTypes|noImplicitOverride|alwaysStrict" /workspace/tsconfig*.json` → **No matches found**

Yani `tsconfig.json` ve `src/dashboard/tsconfig.json`'da hiçbir opsiyonel strict flag explicit olarak set edilmemiş. `strict: true` ile gelen default'lar geçerli.

---

## 4. Öneriler

### 4.1. (LOW) `memory-query.ts` `db: any` → `Database` Typed (Çabuk Kazanç)

**Mevcut:** `src/core/memory-query.ts:194,256` üzerinde `db: any` parametresi.

**Öneri:**
```ts
import type { Database } from 'better-sqlite3';
function ftsSearch(db: Database, params: MemoryQueryParams, limit: number) { ... }
```
Tek import + iki annotation değişikliği. eslint-disable yorumlarını da kaldırır. **Sprint 172 OSS GA öncesi 15 dakikalık iyileştirme.** Bu task audit-only olduğundan değişiklik yapılmaz; Sprint 172 backlog'una "M1" olarak eklenmeli.

### 4.2. (MEDIUM) Config Boundary'sinde Runtime Validation Zorunluluğu (§ 1.7a)

**Mevcut:** `src/core/config-migration.ts:542-544` JSON'dan okunan `brain_provider`/`worker_provider`/`fallback_provider` doğrudan `ProviderName` cast'leniyor.

**Öneri:** Type-guard pattern:
```ts
function isProviderName(x: unknown): x is ProviderName {
  return x === 'claude' || x === 'codex' || x === 'gemini';
}
const raw = config['brain_provider'];
const brainProvider = isProviderName(raw) ? raw : undefined;
```
3 satır, runtime kontratlı. **OSS GA'nın "kullanıcı arızalı config yazınca anlamlı hata almalı" beklentisine doğrudan hitap eder.** Sprint 172 backlog'una "M2" olarak.

### 4.3. (MEDIUM) Non-Null `!` Operatörünü `noUncheckedIndexedAccess` ile Birlikte Azaltmak

**Mevcut:** 38 non-null `!` kullanım. `noUncheckedIndexedAccess` açık olmasına rağmen pratik olarak `arr[i]!` ile susturuluyor.

**Öneri (alternatif kalıplar):**
- `for-of` döngüsüne dönüştürmek (`for (const item of arr)`) — index'i kaldır, `!` gerek yok.
- `Map.get(k)` sonucunu önce kontrol etmek: `const v = m.get(k); if (!v) continue; v.push(...)` — `m.get(k)!.push(...)` yerine.
- Strict typed key map'leri için `Record<PlanMode, ModeConfig>` (string yerine union literal) — derleyici `!` istemez.

Sprint 172 "M3" olarak: 38 → ~10 hedef. Hot-path'ler önce (task-builder, outcome-tracker), CLI helper'lar sonra. **Audit-only** olduğundan bu sprint'te yapılamaz.

### 4.4. (LOW–MEDIUM) `tsconfig.json` Üç Opsiyonel Strict Flag Açılması

**Öneri (Sprint 172 "M4"):**
```jsonc
{
  "compilerOptions": {
    // mevcut...
    "useUnknownInCatchVariables": true,          // explicit
    "exactOptionalPropertyTypes": true,           // optional vs undefined ayrı
    "noPropertyAccessFromIndexSignature": false   // dashboard React props ile çelişebilir, deneyip karar verilmeli
  }
}
```
İlk iki flag derleme regresyonu üretebilir; Sprint 172 öncesi 1 saatlik patlamış-hata triyajı gerektirir. **OSS GA olgunluk işareti.** ⚠️ `exactOptionalPropertyTypes` açıldığında `src/core/config-types.ts` üzerinde optional alanlarda mevcut atamaların yeniden gözden geçirilmesi gerekir.

### 4.5. (LOW) `api/auth.ts:66` Explicit Return Type

```ts
export function bearerAuthMiddleware(
  config: AuthConfig,
): (req: IncomingMessage, res: ServerResponse) => boolean { ... }
```
Tek satır. Public API yüzeyi için disiplin.

### 4.6. (MEDIUM, OPERASYONEL) Test'lerde `as any` Yayılımına Linter Sınırı

**Mevcut:** 708 `as any` cast, 107 test dosyası.

**Öneri:** ESLint kuralı `@typescript-eslint/no-explicit-any` test dosyalarında `warn` seviyesinde açılması. Yeni eklenen `as any`'ler PR'da görünür hale gelir; mevcutlar regression korunarak temizlenir.

Sprint 170 Bug 170-001'in (5 legacy literal-string fixture mock drift) ana sebebi mock'un üretim kontratıyla senkron olmaması. `as any` cast'leri mock'u tipsiz hale getirip drift'i sessizleştirdiği için Sprint 172 OSS GA test maintenance baseline'ı bu sayıyı azaltmaktan kazanır. **Bu, test mimarisi alanı (Task 171-021 kapsam)** — bu rapor sadece pointer veriyor.

### 4.7. (LOW) Dashboard tsconfig'inde `noUncheckedIndexedAccess` Parity

`src/dashboard/tsconfig.json:1-22` üzerinde `noUncheckedIndexedAccess` set edilmemiş. Üretim tsconfig'i ile parity için açılması faydalı; küçük React kod tabanı olduğundan büyük regresyon beklenmez (mevcut dashboard testleri 413 adet, hızlı validate edilir).

### 4.8. (BİLGİLENDİRME) ADR-001 Tip Disiplini Güncellemesi Önerilebilir

Bu denetim ADR-001'in (TypeScript + ESM) **kod düzeyinde tam enforce edildiğini** gösteriyor. ADR-001 metnine "strict baseline = `noUncheckedIndexedAccess` + `noUnusedLocals` + `noUnusedParameters` (Sprint 171 audit doğruladı)" şeklinde bir kanıt satırı eklenmesi geleceğin OSS katkıcılarına net bir disiplin standardı verir. Sprint 172 backlog'unda **D1 doc-update** olarak.

---

## Özet (Tip Güvenliği Axis Verdict)

Deckent kaynak tabanı (~247 üretim TS dosyası), TypeScript strict disiplinini sistemli ve modern düzeyde uyguluyor. CRITICAL ya da HIGH severity tip güvenliği bulgusu **yok**. Tüm MEDIUM bulgular nokta iyileştirme; Sprint 172 OSS GA blokajı değil.

- **`@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` üretim'de sıfır.**
- **`as any` üretim'de sıfır gerçek kullanım.**
- **`: any` annotation üretim'de yalnızca 2 yer**, ikisi de aynı modülde + eslint-disable işaretli.
- **`Record<string,any>` / `any[]` üretim'de sıfır.**
- **`tsc --noEmit` 0 error.**
- **Dashboard React tabanı `any`-free.**

Ana iyileştirme aksiyonları Sprint 172 OSS GA backlog'una eklenmeli:
- **M1**: `memory-query.ts` `db: any` → `Database` typed (LOW, 15 dk)
- **M2**: `config-migration.ts` provider field'larında runtime type-guard (MEDIUM, 30 dk)
- **M3**: Non-null `!` operatör 38 → ~10 azaltma (MEDIUM, 2-3 saat)
- **M4**: tsconfig opsiyonel strict flag'leri (`exactOptionalPropertyTypes` vb.) açılması — Sprint 172 ön-incelemesi gerekli (LOW–MEDIUM)
- **D1**: ADR-001 metnine strict baseline doğrulama satırı (doc update)
