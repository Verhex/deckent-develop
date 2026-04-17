# Analysis: src/core/marketplace/dependency-resolver.ts
**Task ID:** 141-001 | **LoC:** 272

## 1. Amaci (1-2 cumle)
Skill bağımlılıklarını çözerek sıralı bir kurulum listesi üretir. Kahn algoritması ile topolojik sıralama ve döngüsel bağımlılık tespiti sağlar.

## 2. Public API (export listesi)
- `interface SkillManifestDeps` — skill manifest bağımlılık şeması
- `interface ResolvedDependency` — çözülmüş bağımlılık (name + version)
- `interface ResolveResult` — çözüm sonucu (ordered + resolved map)
- `class CircularDependencyError extends Error` — döngüsel bağımlılık hatası
- `class DependencyConflictError extends Error` — versiyon çakışma hatası
- `interface DependencyResolverFS` — FS abstraction (test için)
- `class DependencyResolver` — ana resolver sınıfı

### DependencyResolver Methods
- `resolve(skillName: string): ResolveResult` — tam bağımlılık çözümü
- `detectCircular(skillName: string): string[] | null` — döngü tespiti
- `resolveConflicts(versions: Map<string, string[]>): Map<string, string>` — versiyon çakışması çözümü
- `installWithDependencies(skillName: string): ResolvedDependency[]` — sıralı kurulum listesi

## 3. Ic + Dis Bagimliliklar
### İç Bağımlılıklar
- node:fs (existsSync, readFileSync) — local manifest okuma
- node:path (join) — dosya yolu birleştirme

### Dış Bağımlılıklar
- Sıfır dış npm bağımlılığı
- Testability için enjekte edilebilir `DependencyResolverFS` ve `registryLookup` Map

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Public metotlar: 4
- Private metotlar: 5 (`_getManifest`, `_buildGraph`, `_topologicalSort`, `_dfs`, `_compareSemver`)
- Cyclomatic complexity (rough): ~12-15 (grafik kurma + DFS + Kahn sort)
- `_buildGraph` → özyinelemeli, döngüsel tespit için ancestors set kullanıyor
- `_topologicalSort` → Kahn algoritması tam implementasyon, in-degree hesabı dahil
- `_compareSemver` → basit regex + split, major.minor.patch karşılaştırması

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any` kullanımı: 0
- `@ts-ignore`: 0
- Non-null assertions (`!`): 0
- Tip dönüşümleri: `JSON.parse(raw) as SkillManifestDeps` — hafif risk, runtime doğrulama yok
- `sorted.at(-1)` → potansiyel undefined, null-coalesced olarak işleniyor ✓
- `graph.get(skillName)` daraltması: `if (edges)` guard ile korunuyor ✓
- Genel tip güvenliği: YÜKSEk

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-001 (ESM):** `import` kullanımı ✓, no require()
- **ADR-006 (spawnSync Security):** spawnSync yok ✓
- **ADR-008 (Brain Import):** Brain import yok ✓
- **ADR-010 (Tek Runtime Dep):** Sadece node: built-ins ✓
- **ADR-040 (Memory V2 DB-first):** Memory V2 ile ilgili değil — marketplace alt modülü

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- Beklenen: `tests/core/marketplace/dependency-resolver.test.ts`
- Kontrol gerekiyor — marketplace test suite kapsamı belirsiz
- Algoritma kritik (Kahn's algorithm, circular detection) → yüksek öncelikli test edilmeli
- Edge cases: döngüsel bağımlılık, versiyon çakışması, eksik manifest

## 8. TODO/FIXME/HACK inventory
- TODO/FIXME/HACK: Yok
- "Injectable manifest lookup for testing" yorumu mevcut — soyutlama niyetli

## 9. Dead Code Candidates
- `DependencyConflictError` sınıfı export ediliyor ama `DependencyResolver` içinde hiç throw edilmiyor — dead code aday
- `resolveConflicts` metodunu çağıran caller belirsiz — marketplace akışına bağlı

## 10. Security Findings
- `readFileSync` + `JSON.parse`: manifest injection riski minimal (local file, ~/.deckent altında değil)
- Skill directory traversal: `join(skillsDir, skillName, 'manifest.json')` — skillName user input olabilir, path traversal riski (`../../../etc/passwd`) mevcut
- **ÖNERİ:** skillName parametresini validate et, `..` içermemeli
- `registryLookup` injectable → test sonrası production'da override riski düşük

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile ilgisi yok — marketplace bağımlılık çözüm modülü
- Dosya sistemi I/O sadece manifest.json dosyaları için — MemoryStore kullanımı beklenmez

## 12. Oneriler (Sprint 142+ input)
1. **Security:** skillName parametresinde path traversal validation ekle (`/[.]{2}/.test(skillName)`)
2. **Dead Code:** `DependencyConflictError` ya kullanılmalı ya silinmeli
3. **Runtime validation:** `JSON.parse` sonrası manifest şemasını doğrula (Zod veya type guard)
4. **Test:** Circular dependency ve conflict senaryoları için kapsamlı test suite'i doğrula

## 13. Verdict: ANALYZED | PARTIAL | UNREADABLE
ANALYZED
