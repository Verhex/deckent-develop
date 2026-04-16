# Analysis: src/cli/commands/init.ts
**Task ID:** 142-017 | **Model:** opus | **LoC:** 1552 | **Effort:** max

## 1. Amaci
`deckent init` CLI komutunu register eder. Proje baslatma wizard'i: dizinleri olusturur (.deckent/, .brain/, .tasks/, .locks/, .claude/rules/, plugins/, i18n/), config.json, DECKENT.md, DIRECTIVES.md, brain dosyalari, worker rules, IDE adapter'lari (.cursor, .vscode, codex), temp skill/agent generation, docs template'leri, provider wizard, MCP guidance olusturur. En buyuk ve en karmasik CLI dosyasi — 1552 satir. Ilk calistirma deneyiminin tamami bu dosyada.

## 2. Public API
**17 export** — cok fazla:
- `registerInit(program: Command): void` — ana kayit fonksiyonu
- `formatWelcomeBanner(): string`
- `formatDetectedSetup(setup): string`
- `formatSetupProgress(steps): string`
- `formatNextSteps(language): string`
- `formatRecommendations(reasons): string`
- `detectSystemLanguage(): string`
- `generateCursorDeckentMd(): string`
- `generateVscodeMcpJson(): string`
- `applyIdeAdapters(root, opts): IdeAdapterResult[]`
- `applyEnvConfig(env, root, projectInfo): void`
- Interfaces: `DetectedSetup`, `SetupStep`, `IdeAdapterResult`, `EnvName`
- 10+ private fonksiyon (generateDeckentContentTR/EN, generateDirectivesTemplateTR/EN, generateQuickStartDoc, generateDirectivesGuideDoc, generateConfigReferenceDoc, generateBootContent, capitalize, ensureDir, writeIfNotExists, appendToGitignore, generateToolsContent)

## 3. Ic Bagimliliklar
- 30+ import satiri — en fazla import'a sahip CLI dosyasi
- `../../core/` → constants (25+ constant), config, analyzer, stack-detector, system-profile, subscription, environment, deck-file, mode-presets, utils, provider
- `../../orchestra/` → temp-skill-generator, managed-docs/docs-config, sprint-reporter, spawn-backend-docker
- `../helpers/` → wizard, prompt, output, messages, process, splash, codex-config, gemini-config, cursor-config, agent-templates
- `./doctor.js` → runDoctorChecks
- Dongusel bagimllik: YOK ama bagimlilik agaci cok genis

## 4. Dis Bagimliliklar
- `commander` (ADR-010)
- `node:fs`, `node:path`, `node:os` → platform (built-in)

## 5. Complexity
- **30+ fonksiyon** — God Object
- Max cyclomatic: ~20+ (registerInit action handler — satir 372-991, 620 satir!)
- En karmasik: registerInit action handler — 20+ ana adim: splash → language → plan mode → dirs → config → stack detect → DECKENT.md → agent files → env configs → .deck → rules → directives → brain files → identity → temp skills → workspace → docs → i18n → gitignore → provider wizard → doctor → IDE → next steps
- **registerInit action handler 620 satirlik monolitik fonksiyon** — refactor gerektirir

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- non-null `!`: 3 — satir 201 (locale split), 749 (dep split), 907 (provider name) — tumu guard ile korunmus
- `as Record<string, unknown>` cast: satir 491, 931 — JSON parse sonrasi, makul
- Genel: IYI — 1552 satirda sifir any

## 7. ADR Compliance
- ADR-006: N/A — spawnSync kullanmiyor (import var ama satir 479'da dynamic import ile tek yerde)
- ADR-008: orchestra/ import — brain.js degil, spawn-backend-docker + temp-skill-generator + managed-docs — direkt orchestra modulleri import ediyor, ADR-008 spirit'ine ters (planner'in brain haricinde orchestra import etmemesi gerekir) — ama init brain degil, CLI komutu, bu yuzden muaf
- ADR-010: UYUMLU
- ADR-013: UYUMLU — IDE adapter'lar @DECKENT.md referansi kullaniliyor
- ADR-018: UYUMLU — multi-environment config
- ADR-022 CLI/MCP parity: UYUMLU — `deckent_init` MCP tool mevcut
- Memory V2: **UYUMSUZLUK** — init Memory V2 DB olusturmuyor! Sadece eski .brain/ .md dosyalari olusturuyor (MEMORY.md, DECISIONS.md, DEBT.md). DB olusturma memory migrate komutuna birakilmis — yeni proje icin gap.

## 8. Test Coverage
- `tests/cli/commands/init.test.ts` — MEVCUT
- Kapsam: Temel init akisi test edilmis. IDE adapter, multi-env, provider wizard gibi karmasik path'lerin coverage'i bilinmiyor.

## 9. TODO/FIXME/HACK inventory
- YOK (1552 satirda hicbir marker bulunamadi)

## 10. Dead Code
- `ALL_ENV_NAMES` (satir 192) — kullaniliyor (allEnvs option)
- Template fonksiyonlari (generateDeckentContentTR, generateDirectivesTemplateTR, vb.) — hepsi aktif
- `formatWelcomeBanner` — basit ama export ediliyor, test'lerden kullaniliyor olabilir

## 11. Security
- `createDeckTemplate(root)` + `ensureDeckGitignore(root)` — .deck dosyasi guvenlik onlemi
- `appendToGitignore` — .tasks/, .locks/, .dashboard ekleniyor
- `writeIfNotExists` — mevcut dosyayi korur, overwrite riski yok
- `JSON.parse(readFileSync(...))` — birden fazla yerde, hepsi try/catch ile sarili
- **POTANSIYEL RISK:** satir 479: `const { spawnSync: sp } = await import('node:child_process')` — dynamic import icinde spawnSync('docker', ...) — arguman sabit, risk dusuk

## 12. Memory V2 Uyumu
- **UYUMSUZLUK:** init hala eski .brain/ .md dosyalari olusturuyor:
  - satir 687: `writeIfNotExists(MEMORY_FILE, '# Learned Patterns\n')`
  - satir 688: `writeIfNotExists(DECISIONS_FILE, '# Architecture Decisions\n')`
  - satir 689: `writeIfNotExists(DEBT_FILE, '# Tech Debt\n')`
- Memory V2 DB (memory.db) olusturma **YOK** — yeni proje `deckent init` sonrasi DB olmadan baslar
- **ONERI:** init sırasında bos MemoryStore olusturulmali (schema bootstrap)

## 13. i18n
- `getMessage()` KULLANIYOR — init.select_plan, init.enter_project_name
- BUYUK i18n effort: generateDeckentContentTR/EN, generateDirectivesTemplateTR/EN, generateQuickStartDoc(tr/en), generateDirectivesGuideDoc(tr/en), generateConfigReferenceDoc(tr/en), generateBootContent(tr/en) — IYI, cifte dil template'leri mevcut
- `detectSystemLanguage()` — LANG env var + Intl API — IYI
- `formatNextSteps(language)` — TR/EN — IYI
- **GAP:** Bazi mesajlar hala EN: "Warning:", IDE adapter mesajlari

## 14. Dokumantasyon Tutarliligi
- JSDoc: Cogu export icin MEVCUT — iyi
- **UYUMSUZLUK:** Olusturulan brain.md rules dosyasi (satir 668-669) DB-first kurallari ICERMIYOR — "Update MEMORY.md after every sprint" diyor, ama dogru kural "Write to memory.db via MemoryStore" olmali
- **UYUMSUZLUK:** Olusturulan DECKENT.md template'inde `@.brain/MEMORY.md` referansi var ama Memory V2'de dogru referans `@.brain/exports/summary.md` olmali
- **UYUMSUZLUK:** Template icindeki "Memory budget: 900 lines max" — V2'de entry count, line count degil

## 15. Performance
- Sync I/O: readFileSync (8), writeFileSync (20+), existsSync (20+), mkdirSync (10+) = 60+ sync cagri — COKK YUKSEK
- Ama init one-shot komut — startup performance kritik degil
- `detectFullStack(root)` — package.json parse — hizli
- `analyzeProject(root)` — proje analizi — potansiyel yavas (buyuk projeler)
- `detectAvailableProviders()` — async, CLI check'ler — ~5-10sn

## 16. Oneriler
- **P0:** God Object: 1552 satir, 620 satirlik action handler — `init-steps.ts` (dizin/dosya olusturma), `init-templates.ts` (content generation), `init-wizard.ts` (interactive flow), `init.ts` (CLI kayit) olarak 4'e bolunmeli
- **P0:** Memory V2 DB bootstrap eklenmeli — `new MemoryStore(dbPath)` init sırasında cagrilmali
- **P1:** brain.md template DB-first kurallari icermeli
- **P1:** DECKENT.md template `@.brain/exports/summary.md` referansi kullanmali
- **P1:** "900 lines" → "900 entries" terminoloji duzeltmesi
- **P2:** Template fonksiyonlari ayri dosyaya tasinmali (1000+ satir sadece template)
- **P3:** IDE adapter fonksiyonlari ayri dosyaya (init-adapters.ts)

## Verdict: ANALYZED
