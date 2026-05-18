# Analysis: src/core/marketplace/dependency-resolver.ts
**Task ID:** 142-007 | **Model:** opus | **LoC:** 272 | **Effort:** max

## 1. Amacı
Skill bağımlılıklarını çözerek sıralı kurulum listesi üretir. Topological sort (Kahn's algorithm) ve döngüsel bağımlılık tespiti (DFS) kullanır. Marketplace'den indirilen skill'lerin bağımlılık zincirini yönetir. FS abstraction ile test edilebilirlik sağlar.

## 2. Public API
- `interface SkillManifestDeps` — JSDoc YOK ✗ (field isimleri açıklayıcı)
- `interface ResolvedDependency` — JSDoc YOK ✗
- `interface ResolveResult` — JSDoc YOK ✗
- `class CircularDependencyError extends Error` — JSDoc YOK ✗ (ama isim yeterince açıklayıcı)
- `class DependencyConflictError extends Error` — JSDoc YOK ✗
- `interface DependencyResolverFS` — JSDoc YOK ✗
- `class DependencyResolver` — JSDoc YOK ✗
  - `constructor(skillsDir, options?)` — FS ve registryLookup injection
  - `resolve(skillName): ResolveResult` — JSDoc VAR ✓
  - `detectCircular(skillName): string[] | null` — JSDoc VAR ✓
  - `resolveConflicts(versions): Map<string, string>` — JSDoc VAR ✓
  - `installWithDependencies(skillName): ResolvedDependency[]` — JSDoc VAR ✓

## 3. İç Bağımlılıklar
- `node:fs` (existsSync, readFileSync) — Import ediliyor ama defaultFS üzerinden kullanılıyor.
- `node:path` (join)
- Döngüsel bağımlılık riski: YOK ✓ — Sadece Node.js built-in.

## 4. Dış Bağımlılıklar
- YOK — Sadece Node.js built-in. ADR-010 uyumlu ✓

## 5. Complexity
- 1 sınıf, 4 public + 4 private method.
- Max cyclomatic complexity: `_buildGraph` (satır 155-192) — recursion + ancestors check + visited check + for loop. ~8.
- `_topologicalSort` (satır 194-231): Kahn's algorithm implementasyonu, ~6.
- En karmaşık: `_buildGraph` — Recursive graph building with cycle detection.

## 6. Type Safety
- `any` kullanımı: 0 ✓
- `@ts-ignore`: 0 ✓
- `@ts-expect-error`: 0 ✓
- `as unknown`: 0 ✓
- Non-null `!`: 0 ✓
- `as SkillManifestDeps` (satır 149) — JSON.parse sonucu. FS abstraction test'lerde kontrol sağlar.
- `as string` (satır 149) — readFileSync dönüşü. Encoding 'utf-8' verilmiş, güvenli.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — Kullanmıyor.
- **ADR-008 (brain import):** ✓ — Brain modüllerine bağımlılık yok.
- **ADR-010 (tek dependency):** ✓ — Sadece built-in.
- **ADR-033 (product vision):** ✓ — Ağ bağlantısı yok, lokal çözümleme.
- **ADR-037 (RBAC):** N/A.
- **Memory V2:** N/A.

## 8. Test Coverage
- Test dosyası: `tests/core/marketplace/dependency-resolver.test.ts` ✓ MEVCUT
- Beklenen: circular detection, topological ordering, conflict resolution, unknown skill handling, FS mock.

## 9. TODO/FIXME/HACK Inventory
- NONE ✓

## 10. Dead Code
- **🚨 DEAD CODE ALERT:** `DependencyResolver` HİÇBİR src/ dosyasından import edilmiyor.
  - `grep 'from.*dependency-resolver'` sonucu: 0 kullanım (src/ altında).
  - Sadece test dosyasında kullanılıyor.
- **Severity: P1** — Marketplace kurulum pipeline'ı henüz wire edilmemiş.
- `DependencyConflictError`: Export edilmiş ama hiç throw edilmiyor (modül içinde bile). Dead code.
- `resolveConflicts`: Modül içinde çağrılmıyor, sadece external API olarak sunuluyor.

## 11. Security
- Path traversal: `_getManifest` — `join(this.skillsDir, skillName, 'manifest.json')`. skillName dışarıdan geliyor — `../` ile parent directory'e erişim mümkün. **P2 risk.**
- JSON.parse: Güvenli (lokal dosya).
- FS abstraction: Test edilebilirlik iyi ama güvenlik için skill name sanitization eksik.

## 12. Memory V2 Uyumu
- N/A — Memory sistemiyle etkileşim yok.

## 13. i18n
- Error mesajları İngilizce: "Circular dependency detected", "Dependency conflict for" — Teknik, çeviri gerekmez.

## 14. Dokümantasyon Tutarlılığı
- Header comment: ✓ "Resolves skill dependencies to produce an ordered install list."
- _topologicalSort comment (satır 206-208): "Reverse: we need dependencies installed first" — Doğru.
- JSDoc: Method-level ✓, class-level ✗ EKSIK.

## 15. Performance
- Sync I/O: `_getManifest` — 1 existsSync + 1 readFileSync per skill. Graph building sırasında her node için çağrılır. Büyük dependency chain'de (>100 skill) performans sorunu olabilir ama pratik kullanımda düşük risk.
- `ancestors.includes(skillName)` (satır 162): O(n) arama. Set kullanılsa O(1) olurdu. **P3.**

## 16. Öneriler
- **P1 (High):** DEAD CODE — Modül hiçbir yerden import edilmiyor.
- **P2 (Medium):** Path traversal — `skillName` `../` içerebilir. `skillName.includes('..')` kontrolü eklenebilir.
- **P2 (Medium):** `DependencyConflictError` export edilmiş ama throw edilmiyor — silinmeli veya kullanılmalı.
- **P3 (Low):** `ancestors.includes()` — Set'e çevrilebilir.
- **P3 (Low):** Sınıf ve interface JSDoc eksik.

## Verdict: ANALYZED
