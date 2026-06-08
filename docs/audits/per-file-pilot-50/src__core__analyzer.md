# Audit: src/core/analyzer.ts

**Sprint:** 186 — Per-File Pilot 50
**Task:** 186-030
**Auditor:** doc-writer (worker w-186-030)
**Date:** 2026-05-21
**Subject path:** `src/core/analyzer.ts`

---

## 1. Inventory

| Field | Value |
|-------|-------|
| LoC (effective) | 345 |
| Module type | Plain TypeScript ESM (no class, no default export) |
| Public exports | `analyzeProject(root: string): ProjectAnalysis`, `analyzeProjectCached(root: string): ProjectAnalysis`, `clearAnalyzeCache(): void` |
| Internal helpers | `getConfigMtime`, `readDiskCache`, `writeDiskCache`, `detectCI`, `getFileCount`, `countFilesFs`, `getAuthorCount`, `getLOCCount`, `countLinesOfFiles`, `countLinesFs`, `classifySize`, `recommendMethodology`, `generateAnalyzerSuggestions` |
| Constants | `ANALYZER_CACHE_FILE`, `CACHE_CHECK_FILES`, `SOURCE_EXTENSIONS`, `_analyzeCache` (module-scoped `Map`) |
| Imports (stdlib) | `node:fs` (existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync), `node:path` (join, dirname), `node:child_process` (spawnSync) |
| Imports (internal) | `./config-types.js` (8 type imports), `./stack-detector.js` (detectProjectStack) |
| External deps | None — stdlib-only |
| Reverse deps (src/) | `src/mcp/tools/init.ts`, `src/mcp/tools/analyze.ts`, `src/cli/commands/init.ts`, `src/cli/commands/analyze.ts`, `src/orchestra/decision-engine.ts`, `src/core/index.ts` |
| Reverse deps (tests/) | 16 test files (analyzer.test.ts, analyzer-overhaul.test.ts, framework-detection.test.ts, readjson-migration.test.ts, mcp/tools.test.ts, mcp/tools-quality-059010.test.ts, mcp/tools/annotations.test.ts, mcp/tools/misc-tools.test.ts, mcp/branch-coverage.test.ts, mcp/tools-debt-061-006.test.ts, mcp/tools-enrichment-004.test.ts, mcp/tools-enrichment.test.ts, cli/init-published.test.ts, cli/analyze-coverage.test.ts, cli/commands/init.test.ts, cli/commands/analyze.test.ts) |

---

## 2. Bağlam (Architectural Context)

`analyzer.ts`, `deckent_analyze_project` MCP aracının ve `deckent analyze` CLI komutunun **arka modülüdür**. Projenin teknoloji yığınını, boyutunu, yazar sayısını ve metodoloji önerisini tek bir `ProjectAnalysis` nesnesinde toplar.

- **Sorumluluk sınırı:** Dosyanın başındaki "A) Thin wrapper" yorumu açıkça belirtir — modül **stack detection logic'ini kendisi yapmaz**; bunu `stack-detector.ts` modülüne `detectProjectStack(root)` çağrısıyla devreder. `analyzer.ts` üstüne yalnızca `(CI, fileCount, locCount, authorCount, size, methodology, subProjects, configSuggestions)` alanlarını ekler.
- **Cache mimarisi:** İki katmanlı — (1) in-memory `Map<string, { result, mtime }>` (modül singleton, line 35), (2) disk-based `.deckent/analyzer-cache.json` (line 24). Geçerlilik `CACHE_CHECK_FILES` (`package.json`, `tsconfig.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`) mtime karşılaştırmasına dayanır.
- **Çağrı zinciri:** `init` (CLI + MCP) → `analyzeProjectCached` → cache miss → `analyzeProject` → `detectProjectStack` + `detectCI` + `getFileCount` + `getLOCCount` + `getAuthorCount` → `classifySize` + `recommendMethodology` + `generateAnalyzerSuggestions`.
- **Tip kaynakları:** Tüm public dönüş tipleri `config-types.ts` içinde tanımlı — `analyzer.ts` runtime davranışı sunar, sözleşme değil.
- **Memoization güvenliği:** `_analyzeCache` modül kapsamında singleton. Test izolasyonu için `clearAnalyzeCache()` exportu sağlanmış.

---

## 3. Debt Risk

| Risk | Şiddet | Açıklama | Kanıt |
|------|--------|----------|-------|
| **Sync I/O usage** | Orta | Tüm dosya sistemi çağrıları sync (`readFileSync`, `readdirSync`, `statSync`). ADR-005 (Synchronous I/O) **deprecated** durumda — migration yapılmamış. | line 6, 60, 73, 104, 162, 177, 187 |
| **Magic numbers** | Orta | LOC eşikleri (2000, 50000), file count eşikleri (50, 500), depth limiti (10), 500_000 safety cap — hiçbiri named constant değil. | line 101, 167, 173, 193, 207, 208, 211, 212, 219 |
| **Silent failures** | Orta | 6 adet boş `catch {}` bloğu — okuma/yazma hataları sessizce yutulur, sadece yorum eklenmiş. Disk cache bozulması veya izin sorunu gözlemlenemez. | line 45, 63, 74, 116, 164, 189, 195 |
| **Cache invalidation kapsamı dar** | Düşük | `CACHE_CHECK_FILES` sadece 5 dosya izler. `requirements.txt`, `Gemfile`, `composer.json`, `pom.xml`, `build.gradle` değişiklikleri cache'i invalidate etmez. | line 26-32 |
| **`getFileCount` git fallback ikilemi** | Düşük | `result.status === 0 && result.stdout` doğru ama `count > 0` kontrolü ile git çıktısı boş geldiğinde fs walk'a düşer. Boş git repo'da çift iş. | line 92-97 |
| **`countLinesFs` `break` davranışı** | Düşük | `if (total > 500_000) break` for-loop içinde — dizinin geri kalanı atlanır ama hangi dosyadan sonra durduğu raporlanmaz; nondeterministic ölçüm. | line 193 |
| **Cryptic A/B/C/D/E/N/H yorumları** | Düşük | "// A) Thin wrapper", "// B) Get file count", "// C) Disk-based", "// D) LOC-enhanced", "// N) In-memory cache", "// H) Config Suggestions" — kod-incelemesi için harf kodlarının legend'i yok. | line 1, 34, 52, 90, 121, 133, 203, 224 |
| **`MethodologyRecommendation` fallback dead** | Düşük | `recommendMethodology` son satırı `return 'sprint'` — fonksiyonun tüm if dalları zaten kapsanmış görünüyor (small/medium/large), ama TS tip sistemi yapısal olarak tüm `size` değerlerini exhaustively eşlemiyor. Defensive default. | line 221 |
| **`generateAnalyzerSuggestions` test framework önerisi sertleşmiş** | Düşük | Python değilse otomatik `vitest` öner — Java/Rust/Go için yanlış öneri. | line 263-269 |

---

## 4. Dead Code Candidates

| Sembol | Durum | Kanıt | Karar |
|--------|-------|-------|-------|
| `clearAnalyzeCache` | Test-only | Yalnızca test dosyalarında çağrılır (analyzer.test.ts, analyzer-overhaul.test.ts). Production kodunda kullanılmaz. | **Tut** — test izolasyonu için zorunlu. JSDoc yorumunda "useful for tests" yazıyor; explicit `@internal` etiketi düşünülebilir. |
| `_analyzeCache` modül singleton | Aktif | `analyzeProjectCached` içinde okunur/yazılır, `clearAnalyzeCache` boşaltır. | **Tut** — memoization için gerekli. |
| `countFilesFs` & `countLinesFs` ortak iskelet | Tekrarlı kod | İkisi de aynı depth-limit (10) + skipDirs Set + readdirSync(... withFileTypes) iskeleti kullanır. | **Refactor adayı** — generic `walkSourceFiles(dir, depth, visitor)` helper'ına çıkarılabilir; ama dead kod değil. |
| `SOURCE_EXTENSIONS` ile `.c .cpp .cc .cxx .h .hpp .hxx .vue .svelte .css .scss .html` | Şüpheli kapsam | `stack-detector` tarafından desteklenen dillerle uyumsuz olabilir — `.vue`/`.svelte`/`.css` LOC sayımı yapılır ama `DetectedLanguage` enum'unda bu diller yok. | **Tut + doğrula** — LOC sayımı dil-agnostik olmak isteniyor olabilir; intent docs'a yazılmalı. |
| Methodology `'agile'`, `'hybrid'`, `'micro-sprint'` dönüşleri | Kullanım belirsiz | `recommendMethodology` dört farklı değer döndürür ama deckent runtime'ı yalnızca `sprint` üzerine kurulu (Sprint Lifecycle Phases). Diğer üç değerin downstream consumer'ı yok gibi. | **Doğrula** — `grep "agile\|hybrid\|micro-sprint" src/` analizi gerekli (Sprint 188 follow-up). |

Kanıt grep komutları (Sprint 188 takip için):
```bash
grep -rn "clearAnalyzeCache" src/        # → tests/ only
grep -rn "'agile'\|'hybrid'\|'micro-sprint'" src/  # → recommendation consumer mı?
```

---

## 5. Documentation Gaps

1. **Modül-üst JSDoc yok.** Dosya başında 6 satırlık serbest yorum var ama `@module`, `@since`, `@see` gibi yapısal tag yok.
2. **Harf-kodu yorumları (`A) ... N) ... H)`)** efsanesi yok — kod arkeologisi gerektiriyor. Muhtemel kaynak: ilgili PR'larda madde madde değişiklik listesinden referans alınmış (Sprint 044-072 arasında eklenmiş gözüküyor) ama dosyada legend eksik.
3. **`CACHE_CHECK_FILES` seçim kriteri belgelenmemiş.** Neden bu 5 dosya? `requirements.txt`, `Gemfile` neden yok?
4. **`SOURCE_EXTENSIONS` seçimi belgelenmemiş.** `.vue`, `.svelte`, `.html` LOC'a dahil edilirken `.rb`, `.php`, `.swift`, `.kt` neden hariç?
5. **`500_000` safety cap rationale yok.** Memory? Performance? Dokümantasyon eksik.
6. **`classifySize` eşikleri (2000, 50000, 50, 500) için bir gerekçe yok.** Empirical mi, sezgisel mi?
7. **`recommendMethodology` döndürdüğü değerlerin downstream sözleşmesi yok.** `'agile'` ne anlama gelir? Hangi config alanını etkiler?
8. **`generateAnalyzerSuggestions` `field` adlarının `config-types.ts` ile birebir eşleşmesi runtime'da doğrulanmaz.** "max_workers", "mode", "brain_planning", "ci", "testFramework" string-literal — yazım hatası fark edilmez.
9. **In-memory cache `_analyzeCache`'in multi-process davranışı belgelenmemiş.** Test sırasında paralel worker'lar farklı process'lerde olduğundan disk cache primary olur, ama bu hiçbir yerde söylenmemiş.

---

## 6. ADR Compliance Check

| ADR | Title | Durum | Not |
|-----|-------|-------|-----|
| ADR-001 | TypeScript + ESM | ✅ Uyumlu | Tüm internal import'lar `.js` uzantılı (line 19, 20). |
| ADR-002 | Node16 Module Resolution | ✅ Uyumlu | `node:fs`, `node:path`, `node:child_process` prefix kullanılıyor. |
| ADR-005 | Synchronous I/O | ⚠️ Deprecated yapı kullanımı | ADR-005 **deprecated** olmasına rağmen modül tamamen sync I/O üzerine kurulu. Migration yapılmamış — bilinen tech debt. |
| ADR-006 | spawnSync Security Pattern | ✅ Uyumlu | `spawnSync('git', [...], { cwd, encoding })` — argv array, shell flag yok, kullanıcı input'u command line'a girmiyor (line 92, 123, 137). |
| ADR-007 | SpawnOptions Interface | ⚠️ Kısmi | `SpawnOptions` tipi import edilmemiş; opsiyonlar inline (`{ cwd: root, encoding: 'utf-8' }`). ADR-007 contract'ı modüle uygulanmamış. |
| ADR-008 | Brain Merkezi Import | ✅ Uyumlu | Hiçbir brain/orchestra import'u yok. `core/` modülü olduğu için doğru. |
| ADR-010 | Tek Runtime Dependency | ✅ Uyumlu | Hiçbir external package import etmiyor — yalnızca stdlib + internal tipler. |
| ADR-036 | ADR Governance Integration | ✅ Uyumlu | Modül ADR enforcement zincirinde hedef değil — sadece okuyucu/consumer. |

---

## 7. Refactor Recommendations

1. **`stack-detector` ile sync FS walk paylaşımı** — `countFilesFs` ve `countLinesFs` arasındaki ortak gezinme iskeletini tek bir `walkSourceFiles(dir, options, visitor)` helper'a çıkar. ~50 LoC tasarrufu.
2. **Magic constant ekstraksiyonu**
   ```ts
   const MAX_LOC_SAFETY_CAP = 500_000;
   const MAX_WALK_DEPTH = 10;
   const SIZE_THRESHOLDS = {
     loc: { small: 2_000, medium: 50_000 },
     fileCount: { small: 50, medium: 500 },
   } as const;
   ```
3. **Async I/O migration** — ADR-005 deprecated; `analyzeProject` çağrı yolu CLI başlangıcında (init, analyze) — async hale getirmek event loop blokajını ortadan kaldırır. Karşılık olarak public API imzası `Promise<ProjectAnalysis>` olur (breaking change → ayrı `analyzeProjectAsync` co-export).
4. **Harf-kodu yorumlarını sil veya legend ekle.** "// A) ... // N) ..." ya tamamen kaldır ya da dosya başına `// Markers: A = wrapper, B = git-fallback, C = disk-cache, D = LOC enhancement, E = lang-detection (stack-detector), H = suggestions, N = in-memory cache` ekle.
5. **`CACHE_CHECK_FILES` genişletmesi** — Python (`requirements.txt`, `setup.py`), Ruby (`Gemfile`), Java (`pom.xml`, `build.gradle`), .NET (`*.csproj`) eklenmeli; ya da `stack-detector`'dan `getStackManifestFiles(root)` helper'ı al.
6. **Test framework önerisi düzeltmesi** — `generateAnalyzerSuggestions`'da Python dışı diller için hep `vitest` öner mantığı yanlış. `language` switch:
   ```ts
   const tfMap: Record<DetectedLanguage, string> = {
     python: 'pytest', rust: 'cargo-test', go: 'go-test',
     java: 'junit', typescript: 'vitest', javascript: 'vitest',
     mixed: 'vitest', unknown: 'vitest',
   };
   ```
7. **Suggestion `field` string-literal'larını typed yap** — `AnalyzerSuggestion['field']` union type olarak `'max_workers' | 'mode' | 'brain_planning' | 'ci' | 'testFramework' | ...` tanımlanmalı; yazım hatası compile-time yakalanır.
8. **`writeDiskCache` atomicity** — `writeFileSync` doğrudan target'a yazıyor; partial write riski var. `write-tempfile + renameSync` pattern'ine geç (atomic replace).
9. **`getAuthorCount` fallback davranışı** — `git log` boş döndüğünde `existsSync('.git') ? 1 : 0` kontrolü doğru ama silly result; yeni init edilmiş repo'da 0 commit ile `1` döndürmek `recommendMethodology`'i etkiler. Açık not eklenmeli.

---

## 8. Sprint 188 Follow-up Items

| # | Açıklama | Etiket | Tahmini effort |
|---|----------|--------|----------------|
| F1 | ADR-005 deprecated sync I/O — async migration için karar yenilemesi veya ADR resurrect | adr-review | normal |
| F2 | Magic constant ekstraksiyonu (SIZE_THRESHOLDS, MAX_LOC_SAFETY_CAP, MAX_WALK_DEPTH) | refactor | low |
| F3 | `CACHE_CHECK_FILES` Python/Ruby/Java/.NET genişletmesi (veya `stack-detector` ile birleşik manifest helper) | bug-feature | low |
| F4 | `clearAnalyzeCache` JSDoc'una `@internal` etiketi + test-only kullanım not | docs | low |
| F5 | Harf-kodu (A/B/C/D/E/N/H) yorumlarına legend ekle veya tamamen sil | docs | low |
| F6 | `recommendMethodology` dönüş değerlerinin (`'agile'`, `'hybrid'`, `'micro-sprint'`) downstream consumer audit'i — kullanılmıyorsa kaldır | dead-code | low |
| F7 | `generateAnalyzerSuggestions` test framework önerisini dil-spesifik tabloya çevir | bug-feature | low |
| F8 | `AnalyzerSuggestion.field` union type — string-literal yerine typed alan | type-safety | low |
| F9 | `writeDiskCache` atomic write pattern (tempfile + rename) | reliability | low |
| F10 | Silent `catch {}` bloklarına debug-log integration (DEBUG=deckent:analyzer ortam değişkeniyle opt-in) | observability | normal |
| F11 | `countFilesFs` + `countLinesFs` ortak walker'a refactor | refactor | normal |
| F12 | `SOURCE_EXTENSIONS` listesinin gerekçesi + dil-coverage audit (Ruby, PHP, Swift, Kotlin eksik) | docs + bug | low |

---

## 9. Summary

`src/core/analyzer.ts` (345 LoC), `stack-detector.ts` üzerine ince bir wrapper'dır ve `deckent_analyze_project` ile `deckent analyze` komutlarının arka beyni olarak proje karakterizasyonu üretir. Modül **fonksiyonel olarak sağlam**, single-responsibility'e büyük ölçüde uyar (CI + count + size + methodology + suggestions) ve sıfır external runtime dependency taşır (ADR-010 uyumlu). Cache mimarisi (in-memory + disk) makul; test izolasyonu için `clearAnalyzeCache` doğru biçimde export edilmiş.

**Belirgin tech debt:** (a) ADR-005 deprecated olmasına rağmen tüm I/O sync — async migration ertelenmiş; (b) magic number'lar (LOC eşikleri, depth, safety cap) named constant değil; (c) 6 adet silent `catch {}` bloğu observability'yi azaltır; (d) `CACHE_CHECK_FILES` Python/Ruby/Java/.NET projelerinde cache-staleness'a yol açıyor; (e) harf-kodu yorum sistemi (A/B/C/D/E/N/H) legend olmadan kod arkeolojisi gerektiriyor.

**Risk seviyesi:** **DÜŞÜK** — modül kararlı, 16 test dosyası tarafından test ediliyor, kritik sprint döngüsünde yer almıyor (analyze MCP/CLI girişlerinden çağrılıyor, brain orchestrator'unun hot path'inde değil). Sprint 188 önerileri çoğunlukla **low-effort polish** (F2, F4, F5, F8, F9, F12) ve birkaç **medium-effort enhancement** (F1, F10, F11).

**Tahmini tech debt skor (1-10):** 3/10 — kontrolsüz büyüme riski yok, ama hijyenik temizlik birikmiş.
