# Analysis: src/core/marketplace/skill-sandbox.ts
**Task ID:** 141-001 | **LoC:** 391

## 1. Amaci (1-2 cumle)
Marketplace'ten gelen skill'lerin güvenlik doğrulamasını ve karantina yönetimini sağlar. İki katmanlı tarama: regex (hızlı, tüm dosyalar) + AST (doğru, TypeScript compiler API ile .ts/.js).

## 2. Public API (export listesi)
- `interface SafetyReport` — güvenlik tarama sonucu (safe, issues[], scannedFiles)
- `interface ManifestValidation` — manifest doğrulama sonucu (valid, errors[])
- `class SkillSandboxError extends Error` — sandbox hatası
- `function scanCodeAST(content, fileName): string[]` — AST tabanlı güvenlik taraması (exported, @internal)
- `interface SkillSandboxFS` — FS abstraction (test için)
- `class SkillSandbox` — ana sandbox yöneticisi

### SkillSandbox Methods
- `validateSkillSafety(skillPath): SafetyReport` — skill dizinini tara
- `validateManifest(manifestPath): ManifestValidation` — manifest doğrula
- `quarantine(skillId): boolean` — skill'i .quarantine/ dizinine taşı
- `trustSkill(skillId): void` — skill'i güvenilir olarak işaretle
- `isTrusted(skillId): boolean` — güvenilir mi kontrol et
- `getBuiltinTrustedSkills(): string[]` — built-in güvenilir skill listesi

## 3. Ic + Dis Bagimliliklar
### İç Bağımlılıklar
- node:fs (existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync)
- node:module (createRequire) — TypeScript lazy load
- node:path (join, resolve)

### Dış Bağımlılıklar
- `typescript` (lazy require, devDependency) — AST taraması için

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Public fonksiyonlar: 1 (`scanCodeAST`)
- Public metotlar: 6
- Private metotlar: 1 (`_collectFiles`)
- Internal fonksiyonlar: 1 (`tryResolveStringConcat`)
- Cyclomatic complexity (rough): ~25-30 (AST visitor pattern, multiple node type checks)
- `scanCodeAST`: TypeScript AST traversal, `visit` closure — karmaşık ✓
- `tryResolveStringConcat`: obfuscated eval tespiti için recursive concat resolver
- `_collectFiles`: recursive dizin tarama, node_modules atlama

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any` kullanımı: 1 — `rawEntry as unknown as { name: string; isDirectory(): boolean }` (readdirSync compat)
- `@ts-ignore`: 0
- Non-null assertions: 0
- `entry as unknown as string` — compat hack, düzeltilebilir
- `ts = esmRequire('typescript') as typeof import('typescript')` — güvenli lazy load pattern ✓
- Genel tip güvenliği: ORTA

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-001 (ESM):** import + createRequire ile lazy TS load ✓
- **ADR-006 (spawnSync Security):** eval/child_process kendisi tespit ediyor, kullanmıyor ✓
- **ADR-008 (Brain Import):** Brain import yok ✓
- **ADR-010 (Tek Runtime Dep):** typescript devDependency — runtime'da optional, graceful fallback ✓

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- Beklenen: `tests/core/marketplace/skill-sandbox.test.ts`
- `scanCodeAST` — karmaşık AST visitor, kapsamlı test kritik
- Test senaryoları: eval tespiti, bracket eval (obfuscated), dynamic import, require('fs') pattern

## 8. TODO/FIXME/HACK inventory
- `// @internal` annotation: `scanCodeAST` — internal ama export ediliyor (test için gerekli olabilir)

## 9. Dead Code Candidates
- BUILTIN_TRUSTED_SKILLS içindeki bazı skill ID'leri skill-pool'daki gerçek ID'lerle uyuşmuyor olabilir (örn: `react-expert` vs `react-specialist`)
- `SkillSandboxError` throw edilmiyor — kullanılmıyor olabilir

## 10. Security Findings
- **EXCELLENT:** İki katmanlı güvenlik taraması (regex + AST) ✓
- **EXCELLENT:** Obfuscated eval tespiti (`global['ev'+'al']`) ✓
- **EXCELLENT:** Dynamic import tespiti ✓
- **GOOD:** node_modules ve . ile başlayan dizinler atlanıyor ✓
- **CONCERN:** `renameSync` ile quarantine — target dizin zaten varsa sessiz hata
- **CONCERN:** `SUSPICIOUS_PATTERNS` içindeki `process.env` — deckent kendi kodunda da kullanıyor (false positive riski)
- **CONCERN:** Regex pattern `.exec\s*\(` — false positive (String.prototype.exec yasal kullanım)

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile ilgisi yok — güvenlik taraması modülü

## 12. Oneriler (Sprint 142+ input)
1. `_collectFiles` → readdirSync tip sorununu resolve et (as unknown kaldır)
2. SUSPICIOUS_PATTERNS whitelist ekle (kendi deckent kodu için false positive azaltma)
3. Quarantine target dizin çakışma durumunu handle et (rename yerine rename-or-move-with-timestamp)
4. `BUILTIN_TRUSTED_SKILLS` → skill-pool.ts'deki gerçek ID'lerle senkronize et

## 13. Verdict: ANALYZED | PARTIAL | UNREADABLE
ANALYZED
