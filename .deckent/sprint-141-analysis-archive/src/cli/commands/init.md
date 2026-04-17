# Analysis: src/cli/commands/init.ts
**Task ID:** 141-003 | **LoC:** 1552

## 1. Amacı
Proje başlatma komutunu uygular. En büyük CLI dosyası. .deckent/, .brain/, .tasks/ dizinleri oluşturur, config.json yazar, stack detection, IDE adapter, provider wizard, DIRECTIVES.md şablon üretimi yapar.

## 2. Public API (export listesi)
- `registerInit(program: Command): void`
- `formatWelcomeBanner(): string`
- `formatDetectedSetup(setup): string`
- `formatSetupProgress(steps): string`
- `formatNextSteps(language): string`
- `generateCursorDeckentMd(): string`
- `generateVscodeMcpJson(): string`
- `applyIdeAdapters(root, opts?): IdeAdapterResult[]`
- `applyEnvConfig(env, root, projectInfo): void`
- `detectSystemLanguage(): string`
- `formatRecommendations(reasons): string`
- `DetectedSetup` interface
- `SetupStep` interface
- `IdeAdapterResult` interface
- `EnvName` type

## 3. İç + Dış Bağımlılıklar
Çok sayıda import — ~25 core/orchestra modülü + helpers

## 4. Complexity
Cyclomatic: 20+ (en yüksek dosya)
1552 satır — ciddi refactor adayı
Ancak kod akışı yorum etiketleri ile iyi belgelenmiş (A, B, C...)

## 5. Type Safety
`options` parametresi implicit any (commander action)
Çeşitli JSON.parse casting'ler — kabul edilebilir

## 6. ADR Compliance
✅ ADR-013: DECKENT.md Adapter Pattern
✅ ADR-018: Multi-Environment Config Generation
✅ ADR-022: CLI/MCP Feature Parity
Tek sorun: init komutu yeni brain kurallarına (DB-first) uygun .claude/rules/brain.md yazıyor mu? Satır 669'daki template hâlâ "Update MEMORY.md" yazıyor — DB-first'e güncellenmeli.

## 7. Test Coverage
Test: `tests/cli/init.test.ts` — kapsamlı test gerekli (en fazla branch)

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
`generateBootContent` — template içinde oluşturulup writeIfNotExists ile yazılıyor; içerik BOOT.md ile paralel mi?

## 10. Security Findings
`appendToGitignore` — kullanıcı input değil, TASKS_DIR sabit ✅
`ensureDeckGitignore` — .deck file güvenliği ✅

## 11. Memory V2 Uyumu
⚠️ Satır 669: `.claude/rules/brain.md` template'i "Update MEMORY.md after every sprint (max 300 lines)" yazıyor — bu V1 kuralı. Memory V2'ye göre "Write learnings to DB: store.insert()" olmalı.
⚠️ `writeIfNotExists(join(root, BRAIN_DIR, MEMORY_FILE), '# Learned Patterns\n')` — MEMORY.md hâlâ yaratılıyor; Memory V2'de bu file artık export snapshot, DB birincil kaynak.

## 12. Öneriler
- **P1:** brain.md template güncellemesi — DB-first kuralları
- **P2:** 1552 satır → `init-setup.ts`, `init-templates.ts`, `init-ide.ts`, `init-docs.ts` gibi split

## 13. Verdict: ANALYZED
