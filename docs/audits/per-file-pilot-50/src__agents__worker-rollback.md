# Audit Report: `src/agents/worker-rollback.ts`

**Sprint:** sprint-186 (per-file pilot batch 1)
**Auditor:** w-186-019 (doc-writer / typescript-expert / security-specialist)
**Date:** 2026-05-21
**Source LoC:** 329 (task spec'teki 330 LoC, son satır boş)
**Companion test files:** `tests/agents/worker-rollback.test.ts`, `tests/agents/worker-rollback-untracked-safety.test.ts`
**Sprint provenance:** Sprint 177 Task 1 (ilk implementasyon) + Sprint 181 untracked-safe revision (P0 bug fix)

---

## 1. Inventory

| Aspect | Value |
|--------|-------|
| Path | `src/agents/worker-rollback.ts` |
| LoC | 329 (boş son satır dahil 330) |
| Module type | Saf utility modülü — class + interface + free functions |
| Imports | `node:child_process` (`execFileSync`, `execSync`), `node:fs` (`existsSync`, `mkdirSync`, `readFileSync`, `readdirSync`, `rmSync`, `unlinkSync`, `writeFileSync`), `node:path` (`join`) — **yalnızca Node stdlib**, sıfır 3rd-party runtime dep |
| Exports (public) | `WorkerRollbackError` (class), `SnapshotOptions` (interface), `DropOptions` (interface), `snapshotWorkerScope` (fn), `rollbackWorkerScope` (fn), `dropWorkerSnapshot` (fn), `writeStashRef` (fn), `readStashRef` (fn), `clearStashRef` (fn) — **9 export** |
| Internal helpers | `ensureTasksDir`, `stashRefPath`, `collectOutOfScopeUntracked`, `archiveStash`, `pruneArchiveHistory`, `resolveStashRefByMessage` |
| Constants | `STASH_REF_PATTERN = /^stash@\{(\d+\|NOSTASH)\}$/`, `NOSTASH_SENTINEL = 'stash@{NOSTASH}'`, `ARCHIVE_ROOT_REL = '.deckent/worker-rollback-history'`, `ARCHIVE_TTL_SPRINTS = 7` |
| Reverse deps (production `src/`) | **2 dosya:** (a) `src/agents/worker.ts:29-42` — re-export + private-aliased kullanım `setupTaskSnapshot` (l.234-235); (b) `src/orchestra/result-evaluator.ts:256-280` — dynamic import + `applyRollbackVerdict` |
| Reverse deps (tests) | 2 dosya: `tests/agents/worker-rollback.test.ts`, `tests/agents/worker-rollback-untracked-safety.test.ts` (Sprint 181 P0 regression suite) |
| Side effects | `git stash push/drop/list/show`, `git checkout HEAD --`, `git clean -fd`, dosya yazma (`.tasks/`, `.deckent/worker-rollback-history/`), sentinel dosya yazma/silme — **highly destructive** surface |
| Async surface | Yok — tüm fonksiyonlar sync (`execFileSync`/`execSync` sync subprocess) |
| Error model | `WorkerRollbackError` (named class), `try/catch` blokları sessiz fallback (`/* best-effort */`, `/* not in HEAD */`, vb.) |

---

## 2. Bağlam (Architectural Context)

`worker-rollback.ts` Deckent'in **task-level git stash-based snapshot/rollback** primitive'idir. Her worker görev başında çalışma ağacının (worker scope'una sınırlandırılmış) snapshot'ını alır; sonuç değerlendirmesi sonrası ya snapshot atılır (DONE/GO_WITH_TECH_DEBT) ya da snapshot'a geri dönülür (NO_GO).

**Wire haritası (kanıtlanmış call sites):**

| Çağıran | Lokasyon | Hangi fonksiyon | Notes |
|---------|----------|-----------------|-------|
| `worker.ts:setupTaskSnapshot` | `src/agents/worker.ts:229-243` | `snapshotWorkerScope`, `writeStashRef` | **Scope-bounded parametreleri geçirmiyor** — Sprint 181 fix yarım kaldı (bkz. §3 Debt #1) |
| `result-evaluator.ts:applyRollbackVerdict` | `src/orchestra/result-evaluator.ts:251-281` | `readStashRef`, `rollbackWorkerScope`, `dropWorkerSnapshot`, `clearStashRef` | NO_GO → rollback; DONE/GO_WITH_TECH_DEBT → drop; `rollbackWorkerScope` `[]` ile çağrılıyor (global path) |

**Sprint 181 P0 incident özet (header yorumundan + `docs/superpowers/plans/2026-05-25-sprint-181-recovery-nervous-restart.md`):**
- Sprint 179 → 180 geçişinde, çıplak `git stash --include-untracked` komutu önceki sprint'in commit edilmemiş `src/` deliverables'larını (7 dosya) silmek üzere stash'e dahil etti.
- `git stash drop` sonrasında dosyalar gitti. **Recovery yok** — git reflog / fsck dışında.
- Sprint 181 revision: `snapshotWorkerScope` artık `scopedDirs` + `scopedFiles` ile sınırlı stash yapabiliyor (`scopeBounded` branch, l.103-144).

**Aktif ADR ilişkileri:**

| ADR | Bağlam |
|-----|--------|
| **ADR-006** (spawnSync Security Pattern) | Tüm tehlikeli mutating git operasyonları `execFileSync` (arg array) kullanıyor → ✅ uyumlu. Ancak read-only `git status --porcelain` + `git stash list --format` `execSync` (shell string) kullanıyor → ⚠️ kısmi uyum (bkz. §6). |
| **ADR-037** (Brain-Auditor-Worker Authority Matrix RBAC V1.0) | `rollbackWorkerScope` worker'ın scope'u dışındaki dosyaları **silebilir** (empty `scopedPaths` branch → `git clean -fd` global). Runtime hard-enforcement yok (V1.0 advisory), ancak destructive surface auditor visibility'sini hak ediyor. |
| **ADR-001/002** (TypeScript + ESM + Node16) | İmportlarda `.js` uzantısı yok çünkü `node:` built-in protocol kullanılıyor → ✅ uyumlu. |
| **ADR-008** (Brain Merkezi Import) | Modül brain/orchestra/auditor import etmiyor → ✅ uyumlu. |
| **ADR-039** (Self-Modifying Task Detection) | Stash arşivi `.deckent/worker-rollback-history/` Deckent-kendi-projesi (dogfood) için aynı scope altında çalışıyor — self-modification risk yüzeyi. |
| **ADR-046** (Brain Self-Update Hook Architecture) | Step-ordering: snapshot → execute → evaluate → drop/rollback. `applyRollbackVerdict` faz sırasının post-evaluation katmanı. |

---

## 3. Debt Risk

| # | Risk | Severity | Açıklama | Mitigation |
|---|------|----------|----------|------------|
| 1 | **Sprint 181 fix runtime'da DEVRE DIŞI** | **HIGH (P0-recurrent)** | `setupTaskSnapshot` (`worker.ts:234`) `_snapshotWorkerScope(projectRoot, taskId)` çağırırken **`SnapshotOptions` geçirmiyor**. Sonuç: `scopedDirs.length > 0 \|\| scopedFiles.length > 0` her zaman `false` → `!scopeBounded` branch (l.127-132) → **sentinel dosya yazılıyor + `git stash push --include-untracked --keep-index` (path filter YOK)**. Yani Sprint 179→180'i kıran çıplak include-untracked davranışı production code path'inde hâlâ aktif. Yalnızca **test koduyla** scope-bounded path test ediliyor. | `setupTaskSnapshot`'a `scopedDirs`/`scopedFiles` parametresi ekle, task JSON'dan oku ve `_snapshotWorkerScope`'a ilet. ADR-037 ile uyumlu — RBAC scope zaten `task.scope.directories/filesWrite` olarak mevcut. |
| 2 | **`rollbackWorkerScope` empty array → global wipe** | **HIGH** | `result-evaluator.ts:266` `rollbackWorkerScope(projectRoot, stashRef, [])` çağırıyor. `scopedPaths.length === 0` branch (l.199-208) çalıştırıyor: `git checkout HEAD -- .` + `git clean -fd` → working tree TÜMÜYLE HEAD'e döner, tüm untracked dosyalar (diğer worker'ların scope'undakiler dahil) silinir. Bu Sprint 181 fix'inin aynı destructive surface'i restore-side'da tekrar eden simetrik bir hata. | Caller'ı `scopedPaths` ile çağıracak şekilde fix et: `result-evaluator.ts:266` → `rollbackWorkerScope(projectRoot, stashRef, [...task.scope.directories, ...task.scope.filesWrite])`. |
| 3 | **Archive arşivi production'da DEAD CODE** | **MEDIUM** | `archiveStash()` + `pruneArchiveHistory()` yalnızca `options.sprintId && options.taskId` geçirildiğinde çalışır. Tek production caller (`result-evaluator.ts:270`) `dropWorkerSnapshot(projectRoot, stashRef)` ile **options geçirmiyor**. Yani `.deckent/worker-rollback-history/{sprintId}/{taskId}/stash-{iso}.patch` dosyaları **production'da hiç oluşturulmuyor**. Header yorumu (l.11-13) bu özelliği "vardır" gibi sunuyor — gerçeklik kontrolüne uymuyor. | `applyRollbackVerdict`'i `DropOptions` ile çağır; veya feature'ı tamamen kaldır (test + header docs + interface birlikte). |
| 4 | **`execSync` vs `execFileSync` karışımı** | LOW–MEDIUM | `collectOutOfScopeUntracked` (l.70) ve `resolveStashRefByMessage` (l.315) `execSync` kullanıyor (shell string interpolation). Kullanıcı input direkt geçmiyor (sadece literal komut) ama ADR-006 "her zaman `execFileSync`" diyor. Tutarsızlık + shell metakarakter regresyon riski (örn. proje root yolu içinde `;` veya `$()` varsa farklı codepath'lerde kırılma). | İkisini de `execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], …)` ve `execFileSync('git', ['stash', 'list', '--format=%gd:%gs'], …)` olarak değiştir. |
| 5 | **`pruneArchiveHistory` lexicographic sort 4-digit sprint'te bozulur** | LOW | `sprints.sort()` (l.273) string-bazlı: `sprint-100 < sprint-99` (eldeki padding 3 hane). Sprint > 999'da `sprint-1000` lexicographic olarak `sprint-200`'den önce gelir → yeni sprint en eski sayılır → yeni arşivler önce silinir. (Hedef 2026 sonu ~250-300 sprint, kısa vadeli risk yok; ancak kod ölmüyor.) | `.map((d) => { const n = Number(d.name.replace('sprint-', '')); return { name: d.name, n }; }).sort((a,b) => a.n - b.n)` veya `localeCompare(b, undefined, { numeric: true })`. |
| 6 | **Empty-scope stash sessizce no-op** | MEDIUM | `scopeBounded` ama `scopedDirs` ve `scopedFiles` boş veya yalnızca yoksa, `git stash push --` argumentı boş kalır → "No local changes to save" hatası → catch sessizce yutuluyor (l.146-154) → `resolveStashRefByMessage` `NOSTASH_SENTINEL` döner. Bu OK ama dış görünüş ile: `setupTaskSnapshot` yine de `string` döner → caller "snapshot var" zanneder. NO_GO durumunda `rollbackWorkerScope` NOSTASH'ı normal bir ref gibi işler (`STASH_REF_PATTERN` `NOSTASH`'i içerir, l.28) ve `git checkout HEAD -- .` koşar → **boş işlem değil, global checkout/clean**. Risk #2 ile bileşik. | NOSTASH sentinel'ini `rollbackWorkerScope` içinde de no-op olarak ele al; veya empty scope'u snapshot fonksiyonunda erken-return ile reddet. |
| 7 | **Race condition: stash mesajı global namespace** | LOW | `resolveStashRefByMessage` `git stash list` üzerinden mesaj eşleştirir. Aynı milisaniye içinde iki worker aynı `taskId` ile spawn olursa (mümkün değil ama varsayım) mesajlar tek-eşleşmez. Daha kötüsü, kullanıcı kendi başına `git stash push -m "deckent-worker-..."` yapsa Deckent yanlış stash ref'ini sahiplenir. | Mesaja PID + random nonce ekle: `deckent-worker-${taskId}-${pid}-${randomBytes(4).toString('hex')}-${ts}`. |
| 8 | **16 MB stash patch buffer limiti** | LOW | `archiveStash` `maxBuffer: 16 * 1024 * 1024` ile `git stash show -p` çalıştırıyor (l.258). Büyük binary delta'lı sprint'lerde buffer overflow → catch sessizce yutar → arşiv yazılmaz. Şu an dead code olduğu için pratik etki yok (Debt #3) ama wire'lansa veri kaybı. | `execFileSync` `stdio` ile pipe stream'e yaz: `writeFileSync(patchPath, ...)` yerine `execFileSync('git', [...], { stdio: ['ignore', writeStream, 'pipe'] })` veya `spawnSync` + dosyaya yazma. |
| 9 | **Sentinel dosya residue riski** | LOW | Legacy mode'da `.deckent-worker-sentinel-${taskId}` dosyası yazılır → `git stash push` yakalar → sonra `unlinkSync` ile temizlenir (l.156-162). Eğer `execFileSync` exception fırlatırsa (stash başarısız) `unlinkSync` çalışır ama `.gitignore`'da sentinel pattern yok → kullanıcı `git status` çıktısında bunu görebilir. | `.gitignore`'a `.deckent-worker-sentinel-*` ekle; veya tmpdir kullan. |
| 10 | **`WorkerRollbackError` hiç yakalanmıyor** | LOW | Tüm `throw new WorkerRollbackError(…)` çağrıları validation hataları için (`STASH_REF_PATTERN.test` fail). Hiçbir caller `catch (e instanceof WorkerRollbackError)` ile karşılamıyor — `result-evaluator.ts:273-280` generic `catch (err)` ile yakalar ve sessizce `clearStashRef` çağırır. Tip avantajı sıfır. | Ya custom class'ı kaldır (generic `Error` yeterli), ya da caller'a `instanceof` ile branch ekle. |

**Toplam debt risk:** **HIGH** — Debt #1 + #2 birleşik olarak Sprint 181 incident'i tekrar yaşatma potansiyeli taşıyor. Bunlar test koduyla "geçirilmiş" görünüyor ama production wire path'inde gerçek koruma yok.

---

## 4. Dead Code Candidates

| Symbol / Branch | Status | Kanıt |
|-----------------|--------|-------|
| `archiveStash()` | **DEAD in production** | `grep -rn "dropWorkerSnapshot.*sprintId\|dropWorkerSnapshot.*taskId" src/` → yalnızca `worker-rollback.ts:231` (function self-reference). `result-evaluator.ts:270` `dropWorkerSnapshot(projectRoot, stashRef)` — options olmadan. Sadece test koduyla çağrılıyor. |
| `pruneArchiveHistory()` | **DEAD in production** | Sadece `archiveStash` çağrısından sonra koşar (`l.233`); production'da archiveStash hiç çağrılmadığı için bu da koşmaz. |
| `DropOptions` interface | **PARTIAL** — type-only kullanım | `dropWorkerSnapshot(repoRoot, stashRef, options?: DropOptions)` signature'da var ama prod caller geçirmiyor. Test dosyalarında muhtemelen kullanılıyor. |
| `WorkerRollbackError` class | **LIVE ama low-value** | `throw` ediliyor (2 yer) ama hiçbir caller `instanceof` check yapmıyor. Generic `Error`'a indirgenebilir. |
| `NOSTASH_SENTINEL` branch (`rollbackWorkerScope:210`) | **LIVE** | `dropWorkerSnapshot` 227-229'da kontrol ediyor; `rollbackWorkerScope` 210-215'te kontrol ediyor. Empty-scope flow'unda gerçekten oluşabilir. |
| `collectOutOfScopeUntracked()` + `onWarn` callback | **DEAD** | `scopeBounded && options?.onWarn` koşulu (l.105) — tek prod caller `setupTaskSnapshot` `options` geçirmiyor (Debt #1), dolayısıyla bu warning hattı production'da hiç ateşlenmiyor. |
| Sentinel mode (`!scopeBounded` branch, l.127-132) | **LIVE — ve istenmeyen** | Production wire bu branch'tedir (Debt #1). Sprint 181 bug'ının kaynağı bu branch — `--include-untracked` path filter olmadan koşuyor. |
| `args.push('--')` scope-bounded branch (l.141-144) | **DEAD in production** | Yalnızca testler tetikliyor. |

**Grep kanıtları:**

```bash
$ grep -rn "snapshotWorkerScope\|rollbackWorkerScope\|dropWorkerSnapshot" src/ --include='*.ts'
src/agents/worker-rollback.ts: # (tanımlar)
src/agents/worker.ts:30:  snapshotWorkerScope as _snapshotWorkerScope,
src/agents/worker.ts:36-38: (re-export)
src/agents/worker.ts:234:    const ref = _snapshotWorkerScope(projectRoot, taskId);     # NO scope params
src/orchestra/result-evaluator.ts:256: (dynamic import destructure)
src/orchestra/result-evaluator.ts:266:      rollbackWorkerScope(projectRoot, stashRef, []);   # empty scopedPaths
src/orchestra/result-evaluator.ts:270:    dropWorkerSnapshot(projectRoot, stashRef);   # NO DropOptions
```

**Önerilen aksiyon:** Debt #1 ve #2 fix edilirse dead code'lar canlanır. Eğer fix yapılmazsa archive feature kaldırılmalı (header docs + 3 fonksiyon + `DropOptions`).

---

## 5. Documentation Gaps

| Konu | Durum | Eksik |
|------|-------|-------|
| Modül header docstring (l.1-14) | ✅ Var | İyi başlıyor ama Sprint 181 fix'in **tüm production code path'inde devre dışı** olduğunu söylemiyor — okuyucu yanıltıcı şekilde fix'in aktif olduğunu sanıyor. |
| `WorkerRollbackError` class | ❌ JSDoc yok | Hangi durumlarda fırlar? Caller nasıl yakalamalı? |
| `SnapshotOptions` interface | ❌ JSDoc yok | `scopedDirs` vs `scopedFiles` farkı? Boş array vs `undefined` semantiği? `onWarn` callback ne zaman çağrılır? |
| `DropOptions` interface | ❌ JSDoc yok | Hangi koşullarda archive yazılır? Production wire bekleniyor mu? |
| `snapshotWorkerScope` (l.94) | ❌ JSDoc yok | Return value semantiği? NOSTASH sentinel'in callerlar için anlamı? |
| `rollbackWorkerScope` (l.167) | ❌ JSDoc yok | **Kritik:** `scopedPaths === []` davranışının destructive olduğu uyarısı yok. Caller'lar `[]` geçince `git clean -fd` çalıştırdığını bilmeli. |
| `dropWorkerSnapshot` (l.218) | ❌ JSDoc yok | `DropOptions` geçirilmezse archive yazılmadığı söylenmeli. |
| `writeStashRef`/`readStashRef`/`clearStashRef` (l.285-312) | ❌ JSDoc yok | Atomicity? Concurrent access semantics? |
| `STASH_REF_PATTERN` regex | ❌ Yorum yok | `NOSTASH` sentinel'i regex'e neden eklendi (l.28) — okuyucu tarihsel bağlamı kaçırır. |
| `ARCHIVE_TTL_SPRINTS = 7` magic number | ❌ Justification yok | Neden 7 sprint? Config'den okunmamalı mı? ADR-039 ile ilişki var mı? |
| `resolveStashRefByMessage` fallback | ⚠️ Inline yorum var | Yorum (l.326-327) `NOSTASH` dönmesini açıklıyor ama `setupTaskSnapshot` caller'ı bu sentinel'i tanımıyor — uyumsuzluk. |
| Test coverage referansı | ❌ | Header `Sprint 181 untracked-safe revision` derken `tests/agents/worker-rollback-untracked-safety.test.ts`'e link yok. |

**Önerilen header yenilemesi:** Modülün başına bir "Architecture status" bloğu ekle:

```typescript
/**
 * Worker Rollback — Snapshot/restore primitive (Sprint 177 + Sprint 181 revision).
 *
 * ⚠️ Production wire status (Sprint 186 audit):
 *   - setupTaskSnapshot() does NOT pass scopedDirs/scopedFiles → legacy mode is live.
 *   - applyRollbackVerdict() calls rollbackWorkerScope(..., []) → global checkout/clean.
 *   - dropWorkerSnapshot() called without DropOptions → archive is dead code.
 *
 * The scope-bounded code path exists but is only exercised by tests.
 * See docs/audits/per-file-pilot-50/src__agents__worker-rollback.md (Sprint 186).
 */
```

---

## 6. ADR Compliance Check

| ADR | Compliance | Kanıt |
|-----|-----------|-------|
| **ADR-001** (TypeScript + ESM) | ✅ | `node:` protocol imports + `export` syntax, no `require`. |
| **ADR-002** (Node16 Module Resolution) | ✅ | `node:child_process`, `node:fs`, `node:path` — built-in protocol kullanılıyor; relative import yok dolayısıyla `.js` uzantısı tartışması girmiyor. |
| **ADR-006** (spawnSync Security Pattern) | ⚠️ **PARTIAL** | Mutating commands (`git stash push/drop`, `git checkout`, `git clean`) tümü `execFileSync` (arg array, shell-safe) → ✅. Ancak `execSync('git status --porcelain --untracked-files=all', …)` (l.70) ve `execSync('git stash list --format="%gd:%gs"', …)` (l.315) **string-bazlı shell invocation** kullanıyor → ❌ ADR-006 ihlali (literal komut olduğu için pratik exploitable değil ama tutarsızlık). |
| **ADR-007** (SpawnOptions Interface) | ✅ | `{ cwd, encoding, stdio, maxBuffer }` options nesnesi tutarlı kullanılıyor. |
| **ADR-008** (Brain Merkezi Import — Tek Yönlü Bağımlılık) | ✅ | Brain/orchestra modülünden import etmiyor. `result-evaluator.ts` bunu dynamic import ile çekiyor — doğru yön. |
| **ADR-019** (Language-Agnostic Worker Verify) | ✅ | Git-based, dil-agnostik. |
| **ADR-034** (Multi-Project Isolation) | ✅ | `repoRoot` parametresi her fonksiyonda zorunlu — proje sınırı korunuyor. |
| **ADR-035** (Verification Protocol Standard) | ✅ | Snapshot/restore audit-trail için kanal hazır (`onWarn` callback) — ancak callback prod'da aktif değil (Debt #1). |
| **ADR-037** (Brain-Auditor-Worker Authority Matrix RBAC V1.0) | ⚠️ **WEAK** | Rollback worker scope dışındaki dosyaları silebilir (`git clean -fd` global branch). V1.0 advisory enforcement çağında bu beklenebilir; V2 hard-flip post-GA için Debt #2 mutlaka fix gerekir. |
| **ADR-038** (Dead Code Disposition) | ❌ | Archive feature production'da dead. Bu ADR self-referential trigger çağırır. |
| **ADR-039** (Self-Modifying Task Detection) | ⚠️ | `.deckent/worker-rollback-history/` Deckent'in kendi içinde çalıştırılırken self-modification risk artırır. Şu an dead code olduğu için aktif risk değil. |
| **ADR-043** (Brain Crash Recovery Protocol) | ⚠️ | `.tasks/task-{id}.stash-ref` dosyası recovery'de okunur mu? `readStashRef` evet, ancak orphan stash temizliği (sprint crash sonrası kalan `stash@{N}` entry'leri) handler yok. |
| **ADR-046** (Brain Self-Update Hook Architecture — Step Ordering Contract) | ✅ | Adımlar: snapshot → execute → evaluate → drop/rollback → cleanup. Sırada tutarlı. |
| **ADR-048** (Prompt Lifecycle Contract) | N/A | Prompt modülü değil. |

**Özet:** 3 ADR'da PARTIAL/WEAK durum (ADR-006, ADR-037, ADR-043). ADR-038 (dead code) doğrudan tetikleniyor.

---

## 7. Refactor Recommendations

### Priority 0 (Production Risk — yakın sprint)
1. **`setupTaskSnapshot`'a scope geçir** — `worker.ts:setupTaskSnapshot(projectRoot, taskId)` signature'ını `setupTaskSnapshot(projectRoot, taskId, scope: { directories: string[], filesWrite: string[] })` olarak genişlet. Task JSON'dan `scope.directories` + `scope.filesWrite`'ı oku ve `snapshotWorkerScope`'a `SnapshotOptions` olarak ilet. **Bu Sprint 181 fix'in tam wire'ı.**

2. **`applyRollbackVerdict`'i scope-aware yap** — `result-evaluator.ts:266` `rollbackWorkerScope(projectRoot, stashRef, [...task.scope.directories, ...task.scope.filesWrite])` çağır. Empty path branch'i sadece tarihsel uyumluluk için bırak; veya warn + opt-in flag ile koşullandır.

3. **Archive'i production'a wire et VEYA kaldır** — `dropWorkerSnapshot(projectRoot, stashRef, { sprintId: task.sprintId, taskId })` çağır. Eğer arşiv özelliği gereksizse `archiveStash`, `pruneArchiveHistory`, `DropOptions` ve `ARCHIVE_*` constant'ları ile birlikte kaldır.

### Priority 1 (Hygiene)
4. **`execSync` → `execFileSync` migration** — `collectOutOfScopeUntracked` ve `resolveStashRefByMessage` fonksiyonlarını argument array kullanacak şekilde dönüştür. ADR-006 tutarlılığı + tek codepath.

5. **JSDoc yaz** — Tüm 9 export için minimum 3-satır JSDoc: amaç, parametre semantiği, **destructive surface uyarısı** (özellikle `rollbackWorkerScope` için).

6. **`pruneArchiveHistory` numeric sort** — 4-digit sprint için future-proof.

### Priority 2 (Architecture)
7. **`WorkerRollbackError` consume edilsin veya kaldırılsın** — Şu an type-only yarar var. `applyRollbackVerdict` content branch'i `if (err instanceof WorkerRollbackError)` ile özel handling yapsın (örn. validation hatasını NO_GO yerine alert olarak işle).

8. **Stash mesajı uniqueness güçlendir** — `randomBytes(4)` ile collision-resistant.

9. **`NOSTASH_SENTINEL` semantiğini propagate** — `setupTaskSnapshot` `NOSTASH` döndüğünde caller'a "no rollback needed" sinyali ver; `applyRollbackVerdict` bu sentinel'i `'none'` olarak işle.

### Priority 3 (Test Coverage)
10. **Integration test ekle:** `worker.ts:setupTaskSnapshot` çağrısının scope-bounded path'i tetiklediğini doğrulayan e2e test. Şu an unit testler `snapshotWorkerScope`'u scope-bounded çağırıyor — production wire'ı kaplamıyor.

---

## 8. Sprint 188 Follow-up Items

| # | Item | Effort | Owner suggestion |
|---|------|--------|------------------|
| 1 | **[P0]** `setupTaskSnapshot` scope wire (Debt #1) — Sprint 181 fix'i production'a getir | normal | bug-fixer + security-specialist |
| 2 | **[P0]** `applyRollbackVerdict` scope wire (Debt #2) — global `git clean -fd` braknch'ini scope-bounded hale getir | low | bug-fixer |
| 3 | **[P0]** Integration test: scope-bounded snapshot/rollback uçtan uca (`tests/integration/worker-rollback-scope.test.ts`) | normal | ci-guardian |
| 4 | **[P1]** Archive wire kararı: production'a wire et veya kaldır (Debt #3) | low | architect |
| 5 | **[P1]** `execSync` → `execFileSync` migration (Debt #4, ADR-006 hygiene) | low | refactorer |
| 6 | **[P1]** JSDoc full pass — 9 export için (Section 5) | low | doc-writer |
| 7 | **[P1]** `pruneArchiveHistory` numeric sort (Debt #5) | low | refactorer |
| 8 | **[P2]** Stash mesajı uniqueness — PID + nonce (Debt #7) | low | refactorer |
| 9 | **[P2]** `WorkerRollbackError` consume veya kaldır (Debt #10) | low | refactorer |
| 10 | **[P2]** Header docstring "Production wire status" bloğu (Section 5 önerisi) | low | doc-writer |
| 11 | **[P2]** ADR-006 PARTIAL flag düşür: `execSync` kalıntılarını teyit eden lint kuralı | low | ci-guardian |
| 12 | **[P3]** ADR-043 Brain Crash Recovery: orphan stash temizleme kontratı tanımla | normal | architecture-planner |

---

## 9. Summary

`worker-rollback.ts` **329 LoC, 9 export, 4 internal helper** içeren bir git-stash-bazlı snapshot/restore primitive'idir. Sprint 177'de eklendi, Sprint 181'de P0 incident (önceki sprint deliverables'in kaybı) sonrası **scope-bounded** revision aldı.

**Audit'in kritik bulgusu:** Sprint 181 revision'unun kodu mevcut **ama production wire path'inde çalışmıyor**:
- `setupTaskSnapshot` scope parametrelerini geçirmiyor → legacy `--include-untracked` (path filter yok) branch'i hâlâ aktif.
- `applyRollbackVerdict` `rollbackWorkerScope(…, [])` ile global `git checkout HEAD -- . && git clean -fd` çalıştırıyor.
- `dropWorkerSnapshot` archive options'ı geçirmediği için `.deckent/worker-rollback-history/` arşiv klasörü production'da hiç oluşmuyor (header documentation'ı kanıtsız).

Pratik anlamı: **Sprint 179→180 incident'inin tekrar etmesi için aynı koşullar mevcut.** Test paketi (`worker-rollback-untracked-safety.test.ts`) scope-bounded path'i doğruluyor ama bu yol production'dan çağrılmıyor.

İkincil bulgular: ADR-006 (`execSync` karışımı) ve ADR-038 (archive dead code) PARTIAL. JSDoc tamamen eksik — modül public API'si dokümante değil. `pruneArchiveHistory` 4-digit sprint'te bozulur. `WorkerRollbackError` class düşük değer.

**Sprint 188 için P0:** Wire fix (Debt #1+#2) + integration test. Bu üç madde olmadan Sprint 181 incident için kalıcı koruma yoktur. Tahmini effort: normal (3 sprint task'i, bug-fixer + ci-guardian).

**Audit toplam debt risk: HIGH** (P0 wire-gap recurrence riski).

---

*End of audit — 9 sections delivered per Sprint 186 DIRECTIVES contract.*
