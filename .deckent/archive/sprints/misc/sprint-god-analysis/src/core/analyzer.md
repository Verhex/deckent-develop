# Analysis: src/core/analyzer.ts
**Task ID:** 142-007 | **Model:** opus | **LoC:** 345 | **Effort:** max

## 1. Amacı
Proje analizi: dil, framework, test framework, build tool, CI, dosya/yazar/LOC sayısı, boyut sınıflandırma, metodoloji önerisi ve config tavsiyeleri üretir. `stack-detector.ts` üzerine thin wrapper olarak çalışır — stack algılamasını delege edip üstüne CI detection, git-based metrics ve boyut/metodoloji hesaplaması ekler. In-memory + disk cache ile performans optimize eder.

## 2. Public API
- `analyzeProject(root: string): ProjectAnalysis` — JSDoc VAR ✓ (satır 277-280)
- `analyzeProjectCached(root: string): ProjectAnalysis` — JSDoc VAR ✓ (satır 318-321)
- `clearAnalyzeCache(): void` — JSDoc VAR ✓ (satır 341)

Dahili (non-exported) fonksiyonlar:
- `getConfigMtime`, `readDiskCache`, `writeDiskCache` — Cache yönetimi
- `detectCI` — CI platform algılama
- `getFileCount`, `countFilesFs` — Dosya sayma (git + fallback)
- `getAuthorCount` — Git yazar sayısı
- `getLOCCount`, `countLinesOfFiles`, `countLinesFs` — LOC sayma
- `classifySize` — Boyut sınıflandırma (small/medium/large)
- `recommendMethodology` — Metodoloji önerisi
- `generateAnalyzerSuggestions` — Config tavsiyeleri

## 3. İç Bağımlılıklar
- `import type { ProjectAnalysis, DetectedFramework, ... } from './config-types.js'` — Tip importları
- `import { detectProjectStack } from './stack-detector.js'` — Runtime
- Döngüsel bağımlılık riski: Düşük — stack-detector → analyzer yönünde import yok.

## 4. Dış Bağımlılıklar
- `node:fs` (existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync) — Built-in ✓
- `node:path` (join, dirname) — Built-in ✓
- `node:child_process` (spawnSync) — Built-in ✓
- ADR-010 uyumlu ✓ — Sadece built-in'ler.

## 5. Complexity
- 3 export + 10 dahili fonksiyon.
- Max cyclomatic complexity: `countLinesOfFiles` (satır 154-169) — for loop + if (skip) + if (ext) + try/catch + if (safety cap). ~7.
- En karmaşık fonksiyon: `analyzeProject` (satır 281-315) — Birçok fonksiyonu orchestrate ediyor ama düz akış.

## 6. Type Safety
- `any` kullanımı: 0 ✓ (satır 319'daki "any" bir JSDoc comment içinde)
- `@ts-ignore`: 0 ✓
- `@ts-expect-error`: 0 ✓
- `as unknown`: 0 ✓
- Non-null `!`: 0 ✓
- Unsafe cast: `as ProjectAnalysis` (satır 62) — JSON.parse sonucu. Güvenliği `data && typeof data === 'object' && data.framework` kontrolüyle sağlanmış. Kabul edilebilir ama tam schema validation değil.
- `as DetectedFramework` (satır 298), `as DetectedLanguage` (satır 287), `as DetectedTestFramework` (satır 302), `as DetectedBuildTool` (satır 303) — stack-detector dönüş tipi string, burada concrete tiplere cast. Güvenli (stack-detector zaten bu değerleri üretiyor).

## 7. ADR Compliance
- **ADR-006 (spawnSync):** ✓ Kullanıyor — `spawnSync('git', ['ls-files'])` (satır 92), `spawnSync('git', ['log', '--format=%aN'])` (satır 123), `spawnSync('git', ['ls-files'])` (satır 136-137). Güvenli: hardcoded komutlar, kullanıcı girdisi yok, shell: false (varsayılan).
- **ADR-008 (brain import):** ✓ — Sadece core modüllerden import (config-types, stack-detector).
- **ADR-010 (tek dependency):** ✓ — Sadece Node.js built-in'ler.
- **ADR-033 (product vision):** ✓ — Dış ağ bağlantısı yok, sadece lokal analiz.
- **ADR-037 (RBAC):** N/A.
- **Memory V2:** N/A — Doğrudan memory etkileşimi yok. Disk cache `.deckent/analyzer-cache.json`'a yazıyor (bu Memory V2 kapsamı dışında).

## 8. Test Coverage
- Test dosyaları:
  - `tests/core/analyzer.test.ts` ✓ MEVCUT
  - `tests/core/analyzer-overhaul.test.ts` ✓ MEVCUT (ek test suite)
- İyi: 2 ayrı test dosyası. Kapsamlı test beklenir.

## 9. TODO/FIXME/HACK Inventory
- NONE ✓

## 10. Dead Code
- Tüm public export'lar aktif:
  - `analyzeProject`: cli/analyze.ts, cli/init.ts, mcp/analyze.ts, mcp/init.ts tarafından import ediliyor ✓
  - `analyzeProjectCached`: Potansiyel olarak kullanılıyor olabilir (daha derin kontrol gerekir)
  - `clearAnalyzeCache`: Test cleanup için export — makul.
- `SOURCE_EXTENSIONS` set'i: Kullanılıyor ✓
- `CACHE_CHECK_FILES`: Kullanılıyor ✓
- `_analyzeCache`: Kullanılıyor ✓
- Dead code: YOK ✓

## 11. Security
- **spawnSync güvenlik:** Komutlar hardcoded ('git', ['ls-files']), kullanıcı girdisi yok, shell: false (varsayılan). Command injection riski YOK ✓
- **Disk cache:** `readDiskCache` — JSON.parse sonucunu `as ProjectAnalysis` ile cast ediyor. Temel validasyon var (`data.framework` kontrolü) ama tam schema validation yok. Cache dosyası lokal olduğundan pratik risk düşük.
- **Path traversal:** Cache dosyası sabit yolda (`.deckent/analyzer-cache.json`). Risk yok.
- **readFileSync LOC counting:** `countLinesOfFiles` içinde 500K satır safety cap var (satır 167). İyi.

## 12. Memory V2 Uyumu
- N/A — Bu modül Memory sistemiyle doğrudan etkileşimde bulunmuyor. Analiz sonuçları `.deckent/analyzer-cache.json`'da saklanıyor (ayrı cache mekanizması).

## 13. i18n
- `generateAnalyzerSuggestions` fonksiyonu İngilizce mesajlar üretiyor (satır 234-271): "Large project with multiple authors...", "Small project can use economic mode..." vb.
- CLI/MCP'de gösterilirse i18n gerekir.
- turkishNormalize: N/A.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: Public API'de ✓, dahili fonksiyonlarda kısmen var (A, B, C, D, H, N harfli yorumlar — muhtemelen geliştirme aşamalarını gösteriyor).
- Header comment: ✓ "Thin wrapper around stack-detector.ts" — Doğru.
- `classifySize` LOC eşikleri: <2000 small, <50000 medium, ≥50000 large. Makul.

## 15. Performance
- **Sync I/O YOĞUN:** Bu dosya en ağır sync I/O tüketicisi:
  - `getFileCount`: 1 spawnSync + potansiyel fs walk
  - `getAuthorCount`: 1 spawnSync
  - `getLOCCount`: 1 spawnSync + N readFileSync (tüm source dosyaları!)
  - `readDiskCache`: 1 existsSync + 1 statSync + 1 readFileSync
  - `writeDiskCache`: 1 mkdirSync + 1 writeFileSync
  - Cache: İyi — mtime-based invalidation hem in-memory hem disk cache ile.
- **Hot path:** analyzeProject büyük projelerde ağır (LOC counting). Ama caching iyi çalışıyor.
- **Safety cap:** 500K satır limiti ve depth 10 limiti. İyi savunma.

## 16. Öneriler
- **P2 (Medium):** `readDiskCache` — JSON.parse sonucunu `as ProjectAnalysis` ile cast ediyor. Zod veya basit schema validasyonu eklenebilir.
- **P2 (Medium):** `getLOCCount` — Büyük projelerde (>10K dosya) tüm dosyaları readFileSync ile okuyor. Async versiyonu veya wc -l kullanımı düşünülebilir.
- **P2 (Medium):** Comment'lardaki A, B, C, D, H, N harfleri geliştirme artifact'ı gibi görünüyor — temizlenebilir.
- **P3 (Low):** `generateAnalyzerSuggestions` İngilizce hardcoded mesajlar — i18n düşünülmeli.
- **P3 (Low):** `classifySize` — LOC ve fileCount eşikleri hardcoded. Config'den okunabilir ama mevcut hali makul.
- **Genel:** İyi yapılandırılmış, savunmacı kodlama, etkili caching. Ana risk: LOC counting performansı çok büyük projelerde.

## Verdict: ANALYZED
