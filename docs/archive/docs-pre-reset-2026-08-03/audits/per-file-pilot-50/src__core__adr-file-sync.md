# Audit — `src/core/adr-file-sync.ts`

**Sprint:** 186 (pilot 50 — task 186-024)
**File:** `src/core/adr-file-sync.ts`
**LoC:** 244 (task brief reported 245; one trailing newline accounts for the delta)
**ADR-link:** ADR-036 (Governance), ADR-046 (Brain Self-Update Hook — forward FS→DB direction)
**Auditor:** doc-writer / w-186-024 (opus)
**Date:** 2026-05-21

---

## 1. Inventory

| Item | Value |
|------|-------|
| Lines of code (incl. trailing newline) | 244 |
| Module kind | Pure function library (no class, no singleton) |
| Side effects | Reads filesystem; writes to `MemoryStore` only via injected dep |
| Public exports | `ParsedAdr` (interface), `AdrSyncResult` (interface), `parseAdrFile()`, `adrToEntryInput()`, `syncAdrFilesToDb()` |
| Private regex constants | `FILENAME_PATTERN`, `H1_PATTERN`, `STATUS_PATTERN`, `SPRINT_PATTERN`, `SPRINT_INLINE_PATTERN` |
| Direct imports | `node:fs` (`existsSync`, `readdirSync`, `readFileSync`, `statSync`), `node:path` (`join`), `./memory-store.js` (`MemoryStore` — type-only), `./memory-types.js` (`CreateEntryInput` — type-only), `./memory-import.js` (`extractKeywords`), `./utils.js` (`debugLog`) |
| Reverse deps (production code) | `src/core/identity-generator.ts` (Step 3 `adrInsert` postFinalizeHook), `src/cli/commands/memory.ts` (`memory rebuild` CLI subcommand) |
| Reverse deps (scripts) | `scripts/sprint-166-memory-backfill.mjs`, `scripts/memory/export-adr-fs.mjs` (referenced via comment as forward-direction counterpart) |
| Reverse deps (tests) | `tests/core/adr-file-sync.test.ts`, indirectly `tests/core/identity-regen-default-skip.test.ts`, `tests/core/identity-generator-step-order.test.ts` |
| External I/O | Synchronous: `existsSync`, `statSync`, `readdirSync`, `readFileSync` |

---

## 2. Baglam

`adr-file-sync.ts` Memory V2 mimarisinin **forward-direction (filesystem → DB)** taşıyıcısıdır. `docs/adr/*.md` (MADR v3 formatı) dosyalarını parse edip `memory.db` `entries` tablosuna `type = 'adr'` olarak upsert eder. Sistem iki tetikleme noktasından çalıştırılır:

1. **Sprint finalizasyon hook'u** — `src/core/identity-generator.ts` içindeki `postFinalizeHooks` listesinin Step 3 (`adrInsert`) çağrısı sprint sonunda otomatik. ADR-046 Section 5.1 "Step Ordering Contract" gereği unconditional invocation pattern uygulanır (Sprint 166 Bug M fix).
2. **Manuel rebuild** — `deckent memory rebuild` CLI komutu (`src/cli/commands/memory.ts:44`) tüm ADR'leri filesystem'den DB'ye yeniden yükler. `decisions.md` parse'ına göre `docs/adr/*.md` öncelikli kaynak (Sprint 166 öncesi tersi geçerliydi).

ADR-036 ("ADR Governance Integration — Mandatory Architecture Decision Enforcement") bu modülün varlık sebebidir: ADR'lerin yalnızca dokümantasyon değil, runtime'da Brain/Auditor/Worker prompt enjeksiyonunda mandatory constraint olarak kullanılabilmesi için DB'ye taşınması gerekiyor. ADR-046 ise FS↔DB iki-yönlü senkronizasyonun "forward" tarafını tarif ederek bu dosyanın kontract'ını sabitler.

Tasarım pure-function: store dependency injection olarak alınır, modül stateless. Bu, idempotent rebuild ve fixture-based test'lere izin verir (`tests/core/adr-file-sync.test.ts` 99-139 satırlarında doğrulanmış).

---

## 3. Debt Risk

| Risk | Severity | Açıklama | Mevcut Mitigasyon |
|------|----------|----------|-------------------|
| Senkron I/O (`readFileSync`, `readdirSync`, `statSync`, `existsSync`) | LOW | 57 ADR dosyası mevcut; sprint finalize'da blocking bir kerelik yük (<100ms). ADR-005 "Synchronous I/O" deprecated olsa da burada batch boyutu küçük. | Bilinçli kabul edilmiş — Sprint 166 backfill scripti aynı paterni kullanır. |
| H1 ve filename numarası tutarsızlık verifikasyonu yok | MEDIUM | Satır 68 yorumu "H1 number is verified against it" diyor ama `filenameNum` ile `h1Match[1]` arasında karşılaştırma kodda yok. Yanlış-eşleşmiş ADR dosyası (`043-foo.md` H1'i `ADR-044:`) sessizce filename'i otorite kabul eder. | Yorum vaadi koda dökülmemiş — refactor önerisi (§7). |
| `parseInt(..., 10)` `NaN` koruması yok | LOW | `SPRINT_PATTERN` regex'i `\d+` yakaladığından `NaN` üretmez; teorik problem. | Regex constraint güvenli. |
| `extractKeywords` import'u `memory-import.ts`'den | LOW | Circular dep değil; ama "import" semantik olarak ait olmadığı yerden geliyor (sync ≠ import). | Tag çıkarımı saf string işlemi, kabul edilebilir. |
| `errors[]` listesi gevşek bir sözleşme | MEDIUM | `result.errors` hem malformed file (`malformed: foo.md`) hem `upsert ${id}: ${e}` hem `adr dir not found` mesajlarını karışık tutuyor. Programatik filtreleme zor. | Caller'lar şu an log'luyor — kategorize edilmemiş. |
| `existing.deleted_at` durumu görmezden geliniyor | MEDIUM | `getById(id, { includeDeleted: true })` çağrılıyor; ama soft-deleted bir entry alanlar farklıysa `upsert` çağrılır. `deleted_at` flag'i restore semantiği için kontrol edilmiyor. | Davranış muhtemelen kasıtlı (rebuild = restore), ama dokümante değil. |
| ADR-038 dead-code-disposition spec kontract'ı yok | LOW | Dosya rename'lendiğinde (örn. `046-foo.md` → `046-bar.md`) eski ID kayıt korunmaya devam eder; sync sadece insert/update. Stale ID purge stratejisi tarif edilmemiş. | Şu an manuel cleanup; küçük ADR seti için tolere edilebilir. |

---

## 4. Dead Code Candidates

Tüm export'lar canlı tüketicilere sahip — **dead code yok**:

| Export | Tüketici (grep evidence) |
|--------|--------------------------|
| `parseAdrFile` | `tests/core/adr-file-sync.test.ts:21`, `scripts/sprint-166-memory-backfill.mjs:56` |
| `syncAdrFilesToDb` | `src/cli/commands/memory.ts:8,44`; `src/core/identity-generator.ts` (postFinalizeHooks Step 3 — referans `docs/audits/sprint-167/T5-brain-wire-audit.md:71`); `scripts/sprint-166-memory-backfill.mjs:20,71`; `tests/core/adr-file-sync.test.ts:22` |
| `adrToEntryInput` | `tests/core/adr-file-sync.test.ts:23` |
| `ParsedAdr` interface | parse output type; internal + test |
| `AdrSyncResult` interface | sync output type; CLI render |

Regex constant'lar dosya-içi private, hepsi en az bir match call'una bağlı:
- `FILENAME_PATTERN`: filter (197) + match (70)
- `H1_PATTERN`, `STATUS_PATTERN`, `SPRINT_PATTERN`, `SPRINT_INLINE_PATTERN`: parse path'inde tek call.

**`debugLog('parseAdrFile:read', ...)`** satır 64 — error path; production'da rare ama legitimate. Tutulmalı.

---

## 5. Documentation Gaps

| Eksik | Etki |
|-------|------|
| Dosya başlığı yorum bloğu (1-11) `decisions.md` rolünden bahsetmiyor | Eski sistem terkedildikten sonra `memory-import.ts`'deki `parseDecisionsMd` ile ilişki belirsiz. ADR-046 cross-reference yok. |
| `parseAdrFile` JSDoc'u `null` dönüş koşullarını listelemiyor (5 sebep: read error, filename mismatch, no H1, empty title, no status) | Caller davranış sözleşmesi belirsiz; testlerden çıkarılması gerekiyor. |
| `adrToEntryInput` `decay_exempt` mantığı (`status === 'accepted'`) tek satır yorum, ADR-046 dekayy stratejisine link yok | Yeni statü (`superseded`, `deprecated`) eklendiğinde implicit davranış değişikliği riski. |
| `syncAdrFilesToDb` JSDoc'u `existing.deleted_at` davranışını söylemiyor | Soft-delete restore davranışının kasıtlı olduğu net değil. |
| `errors[]` semantiği (warning vs fatal) tarif edilmemiş | Caller'lar tüm error'ları aynı şekilde işliyor; `result.inserted + result.updated + result.skipped > 0 && result.errors.length > 0` legitimate bir state. |
| `changedBy` parametresinin entry_history etkisi açıklanmamış | MemoryStore audit-trail davranışına dair sessiz bir sözleşme. |
| TR/EN comment karışıklığı yok ama dosya-içi i18n notu yok | ADR-032 i18n politikasıyla şu an çelişmiyor (server-side mantık). |

---

## 6. ADR Compliance Check

| ADR | Compliance | Kanıt |
|-----|-----------|-------|
| ADR-001 (TypeScript + ESM) | OK | `.js` uzantılı import (`memory-store.js`, `memory-types.js`, `memory-import.js`, `utils.js`); `node:fs`, `node:path` ESM prefix. |
| ADR-002 (Node16 Module Resolution) | OK | Tüm relative import'lar `.js` ile bitiyor. |
| ADR-005 (Synchronous I/O — deprecated) | TOLERATED | `readFileSync`/`readdirSync`/`statSync`/`existsSync` kullanımı var ama ADR-005 deprecated; küçük batch (≤57 file) ve startup hook bağlamı kabul edilir. |
| ADR-006 (spawnSync Security Pattern) | N/A | Process spawning yok. |
| ADR-008 (Brain Merkezi Import — tek yönlü) | OK | Core modülü; orchestra'ya import yok. `memory-store.js` (core) ve `utils.js` (core) yatay bağımlılıkları kabul edilebilir. |
| ADR-009 (DEBT.md Markdown Tablo Formatı) | N/A | DEBT.md yazımı yok. |
| ADR-010 (Tek Runtime Dependency — commander.js) | OK | Hiç extra runtime dep yok; sadece `node:*` built-in'leri + internal modüller. |
| ADR-029/030/031/032 (Managed-Docs) | N/A | Doc pipeline değil. |
| **ADR-036 (ADR Governance Integration — mandatory enforcement)** | **OK — primary enabler** | Bu dosya ADR-036'nın runtime enforcement zincirini başlatır: filesystem ADR'leri DB'ye taşıyıp Brain prompt enjeksiyonuna açar. `decay_exempt: adr.status === 'accepted'` rule ADR-036'ya uyumlu. |
| **ADR-046 (Brain Self-Update Hook — FS↔DB)** | **OK — forward direction implementer** | `syncAdrFilesToDb` ADR-046 Table "Forward (FS→DB)" satırının çağrı noktası. ADR-046:359-364 bu fonksiyonu nominal olarak referans eder. |
| ADR-037 (Authority Matrix RBAC) | OK | Read-only filesystem + write-only injected store; cross-role yetki ihlali yok. |
| ADR-038 (Dead Code Disposition) | PARTIAL | ADR rename/delete senaryosunda stale `entries` row purge mantığı yok (§3 row 7). |
| ADR-039 (Self-Modifying Task Detection) | N/A | Task scope dışı. |
| ADR-044 (Sprint State Observability Contract) | OK | `AdrSyncResult` sayaçları observable; CLI çıktısı `inserted/updated/skipped/errors` raporlar. |

Net violation tespit edilmedi. ADR-038 partial gap, ADR-005 tolerated.

---

## 7. Refactor Recommendations

1. **H1 numarası ↔ filename numarası mismatch koruması** — satır 68 yorumu vaat ettiği gibi `parseInt(h1Match[1], 10) !== parseInt(filenameNum, 10)` ise `errors[]`'a "h1/filename mismatch: NNN.md says ADR-MMM" eklenmeli. Şu an silent. *(low effort, defensive)*
2. **`errors[]` kategori tag'i** — `result.errors` yerine `result.diagnostics: { level: 'warn'|'error'; message: string; fileName?: string }[]` formatı. Caller'lar gerçek hata vs malformed warning ayrımı yapabilir. *(medium effort, breaks API — Sprint 188+ candidate)*
3. **`decay_exempt` rule extraction** — `adr.status === 'accepted'` mantığı `core/adr-governance.ts` (yeni veya mevcut) içinde `isDecayExemptStatus(status)` olarak izole edilsin; yeni statü desteği (`superseded`, `deprecated_but_kept`) tek noktadan değişebilir. *(low effort)*
4. **`existsSync` + `statSync` + `readdirSync` zinciri** — node 20+ için `fs.statSync(path, { throwIfNoEntry: false })` tek call ile dir/file/missing ayrımı yapabilir; üç ayrı try/catch yerine tek branch. *(cosmetic, low priority)*
5. **Stale entry purge stratejisi** — `syncAdrFilesToDb`'ye `opts.purgeMissing?: boolean` ekleyip DB'de mevcut ama FS'de olmayan ADR id'leri için soft-delete. ADR-038 gap'i kapatır. *(medium effort, requires ADR amendment)*
6. **JSDoc'u 5 null sebebine genişlet** — `parseAdrFile` null dönüş koşulları açıkça listelensin. *(trivial)*
7. **`changedBy` default'unu CLI tarafından zorla** — `opts.changedBy ?? 'adr-file-sync'` default'u test'lerde audit-trail kirletiyor; CLI/hook caller'ları daima geçirmeli (örnek: `'memory-rebuild'`, `'sprint-{N}-finalize'`). *(call-site convention, not file change)*

---

## 8. Sprint 188 Follow-up Items

| ID | Item | Effort | Priority |
|----|------|--------|----------|
| FU-024-1 | H1↔filename mismatch defensive check + test fixture | low | HIGH |
| FU-024-2 | `parseAdrFile` JSDoc — 5 null sebebi enumerate | low | LOW |
| FU-024-3 | `decay_exempt` rule helper'a extract + unit test | low | NORMAL |
| FU-024-4 | Stale ADR id purge stratejisi tartışması (ADR amendment gerekir) | high | NORMAL |
| FU-024-5 | `result.diagnostics` API genişletmesi (warn/error ayrımı) | medium | LOW |
| FU-024-6 | Soft-deleted `existing` row için restore davranışını doc'a ekle | low | NORMAL |
| FU-024-7 | ADR-046 Table 1 link'i dosya başlığı yorumuna eklensin | trivial | LOW |
| FU-024-8 | `statSync({ throwIfNoEntry: false })` ile triple-call sadeleştirmesi | low | LOW |

Sprint 188 prioritizasyonu: FU-024-1 (silent data corruption riski) > FU-024-3 > FU-024-4.

---

## 9. Summary

`src/core/adr-file-sync.ts` küçük (244 LoC), tek-sorumluluk, well-tested ve mimari olarak ADR-036/ADR-046 zincirinin merkezindeki kritik bir modüldür. Pure-function tasarımı (dependency injection ile `MemoryStore`) idempotent rebuild ve fixture testlerini destekler.

**Sağlık skoru:** YEŞİL.
- **Dead code:** YOK. Tüm export'lar canlı tüketicilere sahip.
- **Build/lint risk:** YOK (changes-free audit).
- **Mimari uyum:** Yüksek — ADR-036 ve ADR-046'nın runtime implementer'ı.
- **Tespit edilen MEDIUM risk'ler:** (a) H1/filename mismatch sessiz tolerans, (b) `errors[]` kategorilenmemiş, (c) ADR-038 stale id purge yok, (d) soft-delete restore davranışı dokümante değil. Hiçbiri P0 değil; sprint 188 backlog'una uygun.
- **LOW risk'ler:** sync I/O (ADR-005 deprecated ama batch küçük), JSDoc null-conditions eksik, decay_exempt rule inline.

Refactor önerileri (§7) toplam <1 günlük iş; en kritik ikisi (FU-024-1 + FU-024-3) Sprint 188'de değerlendirilmeli. Modül `git mv` ya da split gerektirmez — mevcut konum (`src/core/`) doğru katman. Çalışmaya devam etmesi için herhangi bir engel yok.
