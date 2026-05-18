# Analysis: src/core/marketplace/skill-sandbox.ts
**Task ID:** 142-007 | **Model:** opus | **LoC:** 391 | **Effort:** max

## 1. Amacı
Marketplace'den indirilen skill'leri güvenlik taramasından geçirir. İki aşamalı tarama: (1) Regex — hızlı, tüm dosyalar, (2) AST (TypeScript compiler API) — doğru, .ts/.js dosyaları. eval(), child_process, fs require, process.env, Proxy gibi tehlikeli pattern'ları tespit eder. Karantina mekanizması ve trusted skill listesi yönetimi de sunar. `plugin-loader.ts` tarafından aktif kullanılıyor.

## 2. Public API
- `interface SafetyReport` — JSDoc YOK ✗
- `interface ManifestValidation` — JSDoc YOK ✗
- `class SkillSandboxError extends Error` — Özel hata
- `function scanCodeAST(content, fileName): string[]` — JSDoc VAR ✓ (@internal) — AST-level güvenlik tarama
- `interface SkillSandboxFS` — FS abstraction
- `class SkillSandbox` — JSDoc YOK ✗
  - `constructor(projectRoot, options?)` — FS ve extraTrusted injection
  - `validateSkillSafety(skillPath): SafetyReport` — JSDoc VAR ✓
  - `validateManifest(manifestPath): ManifestValidation` — JSDoc VAR ✓
  - `quarantine(skillId): boolean` — JSDoc VAR ✓
  - `trustSkill(skillId): void` — JSDoc VAR ✓
  - `isTrusted(skillId): boolean` — JSDoc VAR ✓
  - `getBuiltinTrustedSkills(): string[]` — JSDoc VAR ✓

Dahili (non-exported):
- `SUSPICIOUS_PATTERNS` — 10 regex pattern
- `DANGEROUS_MODULES` — 8 modül adı
- `DANGEROUS_CALLS` — eval, Function
- `DANGEROUS_STRING_ARG_CALLS` — setTimeout, setInterval
- `BUILTIN_TRUSTED_SKILLS` — 5 skill
- `tryResolveStringConcat` — (@internal) String concat çözme

## 3. İç Bağımlılıklar
- HİÇBİR iç import yok. Tamamen bağımsız (createRequire ile lazy ts load hariç).
- Döngüsel bağımlılık riski: İMKANSIZ.

## 4. Dış Bağımlılıklar
- `node:fs` — Built-in ✓
- `node:module` (createRequire) — Built-in ✓ — TypeScript'i lazy-load etmek için
- `node:path` (join, resolve) — Built-in ✓
- `typescript` — **DevDependency**, lazy-loaded. Runtime'da mevcut olmayabilir (AST scan skip edilir). Güvenli fallback ✓
- ADR-010 uyumlu ✓ — Runtime dependency yok, typescript sadece optional dev.

## 5. Complexity
- 1 exported function + 1 sınıf, 7 public + 1 private method.
- Max cyclomatic complexity: `scanCodeAST` (satır 70-168) — 98 satır, recursive visitor, 6 farklı node tipi kontrolü. ~20+ cyclomatic.
- `visit` iç fonksiyonu: CallExpression (eval, Function, require, bracket-access, obfuscated), ImportKeyword, NewExpression, PropertyAccessExpression. Yüksek karmaşıklık ama güvenlik tarama için gerekli.
- En karmaşık: `scanCodeAST.visit` — AST traversal + pattern matching.

## 6. Type Safety
- `any` kullanımı: 0 ✓
- `@ts-ignore`: 0 ✓
- `@ts-expect-error`: 0 ✓
- `as unknown` — **2 kullanım:**
  - Satır 370: `rawEntry as unknown as { name: string; isDirectory(): boolean }` — readdirSync dönüşü type assertion. FS mock uyumu için gerekli.
  - Satır 371: `entry as unknown as string` — typeof guard ile kontrollü.
- Non-null `!`: 0 ✓
- `as typeof import('typescript')` (satır 75) — createRequire dönüşü. Güvenli: try/catch ile sarılmış.
- `as Record<string, unknown>` (satır 298) — JSON.parse sonucu. Güvenli.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — Kullanmıyor.
- **ADR-008 (brain import):** ✓ — Sıfır iç import.
- **ADR-010 (tek dependency):** ✓ — typescript sadece devDependency, lazy-loaded, graceful fallback.
- **ADR-033 (product vision):** ✓ — Lokal güvenlik tarama, ağ bağlantısı yok.
- **ADR-037 (RBAC):** N/A.
- **Memory V2:** N/A.

## 8. Test Coverage
- Test dosyası: `tests/core/marketplace/skill-sandbox.test.ts` ✓ MEVCUT
- Beklenen: regex scan (eval, child_process, etc.), AST scan (obfuscated eval, bracket-access), manifest validation, quarantine, trusted skill management, FS mock.

## 9. TODO/FIXME/HACK Inventory
- NONE ✓

## 10. Dead Code
- Aktif kullanımda: `plugin-loader.ts` tarafından `SkillSandbox` ve `SafetyReport` import ediliyor ✓
- `scanCodeAST`: @internal ama dışa aktarılmış (test edilebilirlik için). Kabul edilebilir.
- `BUILTIN_TRUSTED_SKILLS`: 5 skill listesi (`typescript-expert`, `react-expert`, `node-expert`, `test-expert`, `doc-expert`). **DİKKAT:** Bunlar projedeki skill ID'leriyle uyuşmuyor! Projede `testing-expert`, `react-specialist` var ama burada `react-expert`, `test-expert` yazıyor. **P2 tutarsızlık.**

## 11. Security
- **Bu modülün kendisi güvenlik altyapısı.** İyi tasarlanmış:
  - 10 regex pattern (eval, Function, child_process, fs require, process.env, exec, imports, globalThis, Proxy, net)
  - AST-level tarama: bracket-access obfuscation detection ✓ (global['eval']), string concat resolution ✓ (global['ev'+'al'])
  - Dynamic import detection ✓
  - new Function() detection ✓
  - setTimeout/setInterval string arg detection ✓
- **Eksik pattern'lar:**
  - `vm` modülü (node:vm) DANGEROUS_MODULES'da yok — **P2**
  - `worker_threads` DANGEROUS_MODULES'da yok — **P3**
  - `import()` template literal: ``import(`${dangerous}`)`` yakalanmıyor — **P2**
  - WebAssembly.instantiate yakalanmıyor — **P3**
- **Quarantine:** `renameSync` ile atomik (ya tamamen ya hiç).
- **Path traversal:** `resolve(skillPath)` kullanılıyor — iyi. Ama `_collectFiles` derinlik sınırı yok — stack overflow riski düşük ama var.

## 12. Memory V2 Uyumu
- N/A.

## 13. i18n
- Issue descriptions İngilizce: "Use of eval()", "child_process module access" — Teknik güvenlik terminolojisi, çeviri gerekmez.

## 14. Dokümantasyon Tutarlılığı
- Header comment: ✓ "Security validation and quarantine system. Two-pass scanning." — Doğru.
- SUSPICIOUS_PATTERNS: Her pattern'ın description'ı var ✓.
- `BUILTIN_TRUSTED_SKILLS` ↔ gerçek skill ID'leri: ✗ UYUMSUZ (yukarıda belirtildi).
- scanCodeAST JSDoc: ✓ İyi açıklama.

## 15. Performance
- Regex scan: O(n * p) — n dosya, p pattern (10). Hızlı.
- AST scan: TypeScript parser çağrısı — yavaş ama sadece .ts/.js dosyaları. Lazy-loaded.
- `_collectFiles`: Recursive directory walk — node_modules ve hidden dir'lar skip ediliyor ✓.
- Dosya okuma: Tüm dosyalar sync readFileSync. Büyük skill paketlerinde yavaş olabilir.

## 16. Öneriler
- **P1 (High):** `BUILTIN_TRUSTED_SKILLS` skill ID'leri projedeki gerçek skill ID'leriyle uyuşmuyor. `react-expert` → `react-specialist`, `test-expert` → `testing-expert` olmalı. Bu trusted kontrolünü geçersiz kılar.
- **P2 (Medium):** DANGEROUS_MODULES'a `node:vm`, `node:worker_threads` eklenebilir.
- **P2 (Medium):** Dynamic import template literal taraması eksik.
- **P2 (Medium):** `as unknown` cast'leri (satır 370-371) — FS mock uyum sorunu. FS abstraction interface'i iyileştirilebilir.
- **P3 (Low):** `_collectFiles` derinlik sınırı yok.
- **P3 (Low):** Class JSDoc eksik.

## Verdict: ANALYZED
