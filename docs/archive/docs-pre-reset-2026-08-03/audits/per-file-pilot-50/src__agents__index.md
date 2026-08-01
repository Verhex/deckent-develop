# Audit: `src/agents/index.ts`

**Sprint:** sprint-186 (Task 186-006)
**Tarih:** 2026-05-21
**Auditor:** doc-writer (opus, low effort)
**Kaynak LoC:** 19 (18 satır kod + 1 satır boş)
**Dosya türü:** Barrel re-export

> Bu dosya, `src/agents/` modülünün public surface'ini tek bir noktada toplayan barrel re-export'tur. Tüm sembolleri tek bir alt-modülden (`./worker.js`) yeniden ihraç eder ve kendi içinde mantık barındırmaz.

---

## 1. Inventory

| Alan | Değer |
|------|-------|
| Path | `src/agents/index.ts` |
| LoC (raw) | 19 |
| LoC (kod) | 18 |
| LoC (yorum/boş) | 1 |
| File type | TypeScript barrel re-export (ESM, Node16) |
| Module surface | 16 named re-export, 0 default export |
| İçe imports | 0 (sadece `from './worker.js'`) |
| Side effect | Yok |

**Re-export edilen 16 sembol (hepsi `./worker.js`'den):**

| # | Sembol | Tür | Worker.ts kaynak satırı | Asıl origin |
|---|--------|-----|--------------------------|--------------|
| 1 | `readTask` | function | `worker.ts:247` | `worker.ts` |
| 2 | `claimTask` | function | `worker.ts:260` | `worker.ts` |
| 3 | `writeTaskPlan` | function | `worker.ts:289` | `worker.ts` |
| 4 | `acquireLock` | function | `worker.ts:119` | wrapper → `core/file-lock.ts` |
| 5 | `releaseLock` | function | `worker.ts:128` | wrapper → `core/file-lock.ts` |
| 6 | `releaseAllLocks` | function | `worker.ts:143` | wrapper → `core/file-lock.ts` |
| 7 | `checkLock` | function | `worker.ts:136` | wrapper → `core/file-lock.ts` |
| 8 | `createHeartbeat` | function | `worker.ts:295` | `worker.ts` |
| 9 | `writeHeartbeat` | function | `worker.ts:322` | `worker.ts` |
| 10 | `writeResult` | function | `worker.ts:347` | `worker.ts` |
| 11 | `updateTaskStatus` | function | `worker.ts:475` | `worker.ts` |
| 12 | `isWithinScope` | function | `worker.ts:492` | `worker.ts` |
| 13 | `readWorkerLog` | function | `worker.ts:105` (re-export) | `worker-log.ts` |
| 14 | `TaskClaimError` | class | `worker.ts:152` | `worker.ts` |
| 15 | `LockError` | class | `worker.ts:110` (re-export) | `core/file-lock.ts` |
| 16 | `ScopeViolationError` | class | `worker.ts:159` | `worker.ts` |

**Reverse dependency taraması (codebase geneli, `tests/` ve `docs/` hariç):**

```
$ rg "from ['\"][^'\"]*agents/index" src/ --type ts
src/index.ts:4:export * from './agents/index.js';
```

→ **Doğrudan tüketici sayısı: 0** (src/ altında). Yalnızca `src/index.ts` üst seviye barrel'ı bu dosyayı yeniden ihraç eder. Tüm 30+ gerçek tüketici (`src/cli/commands/spawn.ts`, `src/monitor/auditor.ts`, `src/providers/codex.ts`, `src/api/server.ts`, vd.) `src/agents/worker.js` veya alt-modüllere (worker-lifecycle, worker-log, worker-verify, worker-rollback) **doğrudan** import yapar.

---

## 2. Bağlam (Architectural Context)

Bu dosya `src/agents/` paketinin yüzeyini açan **klasik barrel pattern**'in örneğidir. deckent monorepo'sunda dört üst seviye barrel mevcuttur (`src/index.ts`):

```typescript
export * from './core/index.js';
export * from './orchestra/index.js';
export * from './monitor/index.js';
export * from './agents/index.js';  // ← bu audit'in dosyası
```

`src/agents/` modülünün asıl sahibi `worker.ts`'tir (592 LoC) ve kendisi de bir barrel-of-barrels'dir: `worker-lifecycle.ts`, `worker-log.ts`, `worker-rollback.ts`, `worker-verify.ts` ve `core/file-lock.ts`'ten gelen sembolleri toplar. Bu nedenle `agents/index.ts` aslında **iki seviyeli bir barrel** zincirinin uç noktasıdır.

**ADR ile ilişki:**
- **ADR-001 (TypeScript + ESM):** Dosya tip uyumlu, `.js` uzantısı kullanır (Node16 module resolution gereği).
- **ADR-002 (Node16 Module Resolution):** Tüm re-export'lar `./worker.js` uzantısı ile yazılmış → uyumlu.
- **ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık):** Bu dosya planner/brain/orchestrator'a değil yalnızca `./worker.js`'e bağımlı → tek yönlü import korunmuş.
- **ADR-010 (Tek Runtime Dependency — commander.js):** Hiç runtime dependency çağırmaz, saf re-export.

**Sprint geçmişi:**
- **Sprint 132 (W2 Performance Audit):** Bu dosya 4 üst-barrel'dan biri olarak "StartupTime / 59,375 LoC eager-load" maddesinin tetikleyicilerinden sayılmış. ([docs/audits/sprint-132/W2-performance-scalability.md:34, :142])
- **Sprint 171 (Dead-Code Audit):** `src/index.ts:4` satırında barrel re-export'u dead-code şüphesi olarak listelenmiş, ancak `src/index.ts`'in npm package public API olarak yayınlandığı için silinmemiş.

---

## 3. Debt Risk

| # | Risk | Seviye | Açıklama | Etki |
|---|------|--------|----------|------|
| D1 | **Dead barrel-of-barrel** | MEDIUM | `agents/index.ts`'in src/ içinde 0 doğrudan tüketicisi var; yalnızca `src/index.ts:4` üzerinden public API'ye sızıyor. | Tree-shaking dostu değil; package consumer'lar gereksiz semboller çekmek zorunda. |
| D2 | **Eager-load startup penalty** | MEDIUM | `export *` ile her import `worker.ts`'in 592 LoC'unu + transitive bağımlılıklarını (`worker-lifecycle.ts`, `worker-log.ts`, `core/file-lock.ts`) eager parse eder. | Sprint 132 W2 raporunda belgelenmiş; CLI komutları bile full agent stack'ini yüklüyor. |
| D3 | **Public API drift** | LOW | 16 named export elle bakımlı; `worker.ts`'e yeni public sembol eklendiğinde bu listenin güncellenmesi unutulabilir (ör. `readWorkerLog` Sprint 156'da eklenmiş gibi görünüyor). | Sessiz API gap; consumer'lar `worker.ts`'den dolaylı import etmek zorunda kalır. |
| D4 | **Re-export gürültüsü** | LOW | `LockError` ve `readWorkerLog` aslında `worker.ts`'ten geçen ikinci-el re-export'lardır. Tek-hop'a indirilirse barrel daha şeffaf olur. | Kod okunabilirliği; runtime etkisi yok. |
| D5 | **Tek-hop barrel anti-pattern** | INFO | Modern ESM tree-shaker'lar (Vite, esbuild) bunu çoğunlukla optimize edebilir; Node.js native ESM çözümleyici edemez. | `import { readTask } from 'deckent'` → tüm transitive graph yüklenir. |

---

## 4. Dead Code Candidates

**Adim 1 — Doğrudan tüketim taraması (src/ altında):**

```bash
$ rg "from ['\"][^'\"]*agents/index" src/
src/index.ts:4:export * from './agents/index.js';
```

→ Tek hit: `src/index.ts` üst seviye barrel.

**Adim 2 — Bypass tüketim (worker.js doğrudan):**

```bash
$ rg "from ['\"][^'\"]*agents/(worker|worker-lifecycle|worker-log|worker-verify|worker-rollback)" --type ts | wc -l
37  # ← dosya sayısı (src/ + tests/)
```

→ 37 dosya `agents/` modülüne **barrel'i atlayarak** doğrudan import ediyor.

**Adim 3 — Yalnızca `index.ts` üzerinden ulaşılabilen sembol:**

Yok. 16 sembol de doğrudan `worker.js`'ten ya da alt-modülden ulaşılabiliyor.

**Sonuç:**
- `agents/index.ts` dosyasının **kendisi** dead değildir (npm public surface'inin parçası, `src/index.ts:4`).
- Ancak **iç tüketici yok** → internal kod için tamamen redundant.
- Sprint 171 dead-code audit'inde MEDIUM olarak işaretlenmiş.

**Önerilen aksiyon:**
- Silmek = breaking change (semver-major) → ertelendi.
- Internal codebase'de bu barrel'a yapılan referans olmadığı için Sprint 188+ planda **deprecation uyarısı** + **next-major'da silinme** plan altına alınabilir.

---

## 5. Documentation Gaps

| # | Gap | Öneri |
|---|-----|-------|
| DG1 | Dosya başında JSDoc `/** @module agents */` veya `@packageDocumentation` yok. | Top-level `@module` blok eklenerek barrel'ın amacı netleştirilebilir (TSDoc/API-Extractor uyumu). |
| DG2 | Re-export edilen 16 sembolün hangisinin "stable public API" hangisinin "internal" olduğu işaretlenmemiş. | `LockError`, `TaskClaimError`, `ScopeViolationError` gibi error class'larına `@public` tag; internal helper'lara `@internal` tag. |
| DG3 | README.md veya `docs/reference/api-surface.md` içinde "agents/" public surface listesi yok. | `docs/reference/api-surface.md` içine "Agents module exports" bölümü eklenmeli; bu dosya o bölümün authoritative kaynağı olmalı. |
| DG4 | CHANGELOG.md'de sembol eklemeleri (ör. `readWorkerLog` ne zaman eklendi) izlenmiyor. | Public API ekleme/değişimlerinde "Added/Changed" bölümüne girilmeli (keepachangelog standardı). |
| DG5 | TS doc generator (TypeDoc) yapılandırması bu dosyayı entry-point olarak işaretlemiyor. | TypeDoc'a `entryPoints: ['src/index.ts']` zaten varsa `agents/index.ts` "namespace" olarak ayrıştırılır; özelleştirme gerekmiyor — onaylanmalı. |

---

## 6. ADR Compliance Check

| ADR | Konu | Uyum | Kanıt / Not |
|-----|------|------|-------------|
| ADR-001 | TypeScript + ESM | ✅ | `export ... from './worker.js'` ESM syntax. |
| ADR-002 | Node16 Module Resolution | ✅ | `.js` uzantısı re-export'ta mevcut (worker.js). |
| ADR-003 | vitest over Jest | N/A | Test dosyası yok; barrel için test gerekmez. |
| ADR-004 | 3-Layer Config Merge | N/A | Config'le ilgisiz. |
| ADR-006 | spawnSync Security Pattern | N/A | Spawn/exec yok. |
| ADR-007 | SpawnOptions Interface | N/A | Spawn yok. |
| ADR-008 | Brain Merkezi Import — Tek Yönlü Bağımlılık | ✅ | Brain/planner/orchestra'a import yok; yalnızca `./worker.js`. |
| ADR-009 | DEBT.md Markdown Tablo Formatı | N/A | DEBT'a yazmıyor. |
| ADR-010 | Tek Runtime Dependency (commander.js) | ✅ | Hiç runtime dep çağırmaz. |
| ADR-029 | Managed-Docs Universalization | N/A | Managed-docs entry değil. |
| ADR-030 | Template Engine + Plugin Loader | N/A | Plugin sistem dışı. |
| ADR-032 | i18n Pattern System | N/A | UI/template değil. |
| ADR-037 | Brain-Auditor-Worker Authority Matrix RBAC | ⚠️ | Re-export ettiği `isWithinScope` ve `ScopeViolationError` ADR-037 V1.0 Layer-2 advisory kontrolünün yüzeyi. Barrel doğrudan ihlal etmez ama runtime advisory bu yüzeyden geçer. |
| ADR-038 | Dead Code Disposition | ⚠️ | Sprint 139 dead-code disposition listesinde değil ama Sprint 171 audit'inde MEDIUM olarak işaretlenmiş — gelecek karar için aday. |
| ADR-039 | Self-Modifying Task Detection | N/A | Self-modify ile ilgisiz. |
| ADR-046 | Brain Self-Update Hook | N/A | Hook entry değil. |

**Sonuç:** Sert ihlal yok; iki ⚠️ (ADR-037 advisory surface, ADR-038 dead-code aday) sadece görünürlük/bilinç için işaretlendi.

---

## 7. Refactor Recommendations

**R1 — Re-export listesini explicit named export'tan koru (status quo).**
Mevcut `export { ... } from './worker.js'` formatı `export * from './worker.js'`'ten daha güvenlidir: yanlışlıkla internal sembol public yapılmaz. Status quo iyi.

**R2 — `@packageDocumentation` JSDoc bloğu ekle.**
```typescript
/**
 * @packageDocumentation
 * `agents/` module — Worker runtime contract: task lifecycle,
 * heartbeat, locks, scope enforcement, error types.
 *
 * @remarks
 * Re-exports surface from {@link ./worker.ts}. Internal modules
 * (worker-lifecycle, worker-log, etc.) are not re-exported here.
 */
```

**R3 — `@public` / `@internal` tag'leri uygula.**
Hangi sembollerin stable API olduğunu açıkça işaretle. Şu anda 16 sembolün tümü implicit "public".

**R4 — Tek-hop barrel'a sadeleş (opsiyonel, kosmetik).**
`LockError` ve `readWorkerLog` `worker.ts` üzerinden ikinci-el re-export. Doğrudan kaynaktan ihraç şeffaflık sağlar:
```typescript
// Mevcut:
export { LockError } from './worker.js';  // worker.ts → core/file-lock.ts
// Yeni:
export { LockError } from '../core/file-lock.js';
```
Trade-off: runtime fark yok; sadece "kim sahibi" sorusunu netleştirir. Sahiplik `worker.ts`'te kalsın isteniyorsa **dokunulmamalı.**

**R5 — Sprint 188+ deprecation planı (uzun vade).**
Iç tüketici 0 olduğu için bu dosya gelecekte:
- a) Silinebilir (semver-major breaking change) → `src/index.ts:4` kaldırılır + CHANGELOG "Removed".
- b) Veya `src/index.ts` doğrudan `./agents/worker.js`'ten re-export edebilir → bir indirection katmanı kaldırılır.
Karar Sprint 188 ADR-038 kapsamında alınmalı.

**R6 — Eager-load mitigation (Sprint 132 W2 follow-up).**
`agents/index.ts` `worker.ts` + transitive grafı eager yükler. CLI komut path'leri (`src/cli/commands/*.ts`) dynamic `import()` ile lazy yüklenmiş olsa bile `src/index.ts` barrel'ı yine eager. Çözüm public package surface dışında değil; node ESM tree-shaking sınırlaması.

---

## 8. Sprint 188 Follow-up Items

| # | Item | Sahip | Öncelik | Tahmin |
|---|------|-------|---------|--------|
| F1 | `@packageDocumentation` + `@public`/`@internal` JSDoc tag'leri ekle | doc-writer | NORMAL | low (~30 dk) |
| F2 | `docs/reference/api-surface.md` içine "Agents module exports" tablosu ekle | doc-writer | NORMAL | low (~20 dk) |
| F3 | ADR-038 kapsamında `agents/index.ts` dead-barrel olarak kararlaştırılsın: KEEP (public surface) vs DEPRECATE vs DELETE | architect | LOW | normal (~1 sa) |
| F4 | TypeDoc / API-Extractor entegrasyonu doğrulaması (entry-point chain düzgün mü?) | doc-writer | LOW | low (~30 dk) |
| F5 | `readWorkerLog` ve `LockError` ikinci-el re-export'larını gözden geçir (R4 kararı) | code-reviewer | LOW | low (~15 dk) |
| F6 | Sprint 132 W2 "StartupTime" maddesinin canlı ölçümü (cold-start delta `agents/index.ts` removed vs kept) | performance-analyzer | LOW | normal (~2 sa) |

---

## 9. Summary

`src/agents/index.ts` 19 LoC'lik bir **public-surface barrel re-export**'tur ve mantık içermez. `./worker.js`'ten 16 sembolü explicit named export ile yeniden ihraç eder. ADR uyumu temiz (ADR-001/002/008/010 ✅), iki ADR'da ⚠️ (037 advisory surface, 038 dead-barrel aday).

**Kritik bulgu:** dosyanın `src/` içinde **0 doğrudan tüketicisi** var — yalnızca `src/index.ts:4` üst-barrel'ı sayesinde npm public API yüzeyine taşınıyor. Internal kod (37 dosya) barrel'ı atlayarak doğrudan `worker.ts` veya alt-modüllere import yapıyor.

**Debt Risk:** D1 (dead barrel-of-barrel, MEDIUM) ve D2 (eager-load startup, MEDIUM — Sprint 132 W2'de belgelenmiş) ana maddeler. Silmek breaking change olduğundan Sprint 188'de ADR-038 kapsamında resmi karar gerekli.

**Hızlı kazanımlar:** JSDoc `@packageDocumentation` + `@public`/`@internal` tag'leri (F1) ve `api-surface.md` güncellemesi (F2) düşük efor / yüksek netlik sağlar. Sprint 188'e iyi follow-up.

**Genel sağlık:** Yeşil. Refactor zorunlu değil; iyileştirmeler doc-quality odaklı.

---

**Audit footer:**
- Section sayısı: 9 (H2)
- Toplam satır: 30+
- Kaynak: `src/agents/index.ts` (1-19), `src/agents/worker.ts` (95-160, 247-495), `src/index.ts` (1-5)
- Reverse dep komutu: `rg "from ['\"][^'\"]*agents/index" src/ --type ts`
- Sprint 132/171 referansları: `docs/audits/sprint-132/W2-performance-scalability.md:34,142`, `docs/audits/sprint-171/02-concern/01-dead-code.md:247`
