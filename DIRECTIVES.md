# DIRECTIVES — SPRINT-13: KURAL-REWRITE + DEBT-ECHO (born-601·603, 3 task)

## Goal
Havuz devamı: vocab-lint'in gerekçeli-borç 11 kalemi (alias ÇÖZMEZ — kural-içerik fix'i; kanıt:
`node scripts/lint-rule-vocabulary.mjs` çıktısındaki per-kalem gerekçeler + `.analysis/sprint-agent-skill-prompt-audit-2026-07-10.md`)
+ planner'ın no-op-debt yankı-enjeksiyonu (born-603, canlı-vaka 2026-07-10). SSOT: marathon GOAL-v2. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- **TEK-YAZAR:** `sprint-planner.ts` YALNIZ Task 3. `routing-engine.ts` bu sprint'te TAMAMEN KAPALI
  (alias-map/skorlama işi DEĞİL — yalnız manifest-içerik + planner). Diğer kapalılar aynen.
- git stash/reset/checkout/clean YASAK · hermetik test · spawnSync yasak · `notes` TEK STRING · Self DÜRÜST · surgical.
- **Routing-KARAR-değişimi olan kalemler test-PİNLİ:** co-fire-collapse (integration-engineer, terminal-ux-engineer)
  seçim-flip'i yaratabilir — her collapse için önce mevcut-davranış testi, sonra hedef-davranış pin'i (gevşetme yok).
- Her task sonunda: `node scripts/lint-rule-vocabulary.mjs` → "Known debt" listesi kendi kalemlerinden ARINMIŞ + 0 yeni ölü-kelime.

## Task 1: born-601a — AGENT-RULE-REWRITE — 4 agent-manifest kural-onarımı (P1)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: .deckent/agents/architecture-planner/agent.json, .deckent/agents/data-engineer/agent.json, .deckent/agents/integration-engineer/agent.json, .deckent/agents/terminal-ux-engineer/agent.json, tests/core/agent-rule-rewrite.test.ts
- Scope: .deckent/agents/, tests/core/
- Dependencies: none
### Description
Lint-dökümündeki gerekçeler BAĞLAYICI tasarım-girdisi (aynen oku): **architecture-planner** 'architecture' =
cross-cutting, gerçek segment yok → kuralı intent-tabanlıya çevir (örn. intent.primary=architecture/planning
mevcutsa; yoksa uygun mevcut-intent + stackDetection). **data-engineer** 'database' → AGENT-tarafında stackDetection KANALI YOK
(advisor-kanıt: selectBestAgent stackBonus hesaplamaz; when-clause yalnız intent/domains/operations/complexity/scope
görür) → kuralı intent/operations/scope-tabanlıya çevir. **integration-engineer** 'messaging'+'integrations' →
**collapse = TEK `$or`-of-`$contains` kuralı, GERÇEK kuralın skorunda (8)** — condition-evaluator `$or` destekler,
590-şeması geçer; DÜZ-SİLME YASAK (Yasa-#2: builtin-manifest yabancı projede gerçek `src/messaging/` varsa BUGÜN
ateşler — silme onu sessizce kaybeder). Bu-repo'da byte-identik kalır (ölü-kelimeler alias-map'te bilinçli-yok,
hiç ateşlenmiyor) — pin-test bunu doğrular. **terminal-ux-engineer** 'terminal-ui' → aynı `$or`-collapse ama
**skor=6 (gerçek 'cli'-kuralının skoru; ölünün 8'i DEĞİL** — 8 seçmek her cli-task'ını 6→8 kaydırır, flip-riski).
### goNogo
- goCriteria: 4 manifest'te ölü-kelime kalmaz (lint "Known debt"ten 5 kalem düşer: architecture·database·messaging·integrations·terminal-ui); collapse'lı iki agent için seçim-davranışı test-pinli (flip yok YA DA bilinçli-flip ayrı-assert+gerekçe-yorumlu); routing suite (routing-engine/route-domain-scope/domain-alias/affinity/health) yeşil; lint 0-yeni-ölü.
- nogo: routing-engine.ts'e dokunma; skor-enflasyonu (co-fire toplamını tek-kurala aynen taşımak YASAK — mevcut etkin-davranışı koru); başka agent-manifest'ine dokunma.
- Kanıt: `node scripts/lint-rule-vocabulary.mjs` + `npx vitest run tests/core/agent-rule-rewrite.test.ts tests/core/routing-engine.test.ts tests/core/route-domain-scope.test.ts tests/core/routing-domain-alias.test.ts tests/orchestra/routing-affinity-enable.test.ts tests/orchestra/agent-routing-health.test.ts` → 0 fail.

## Task 2: born-601b — SKILL-RULE-REWRITE — 6 skill-manifest kural-onarımı (P1)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: .deckent/skills/code-simplifier/manifest.json, .deckent/skills/database-migration/manifest.json, .deckent/skills/git-expert/manifest.json, .deckent/skills/monorepo-expert/manifest.json, .deckent/skills/onboarding-ux/manifest.json, .deckent/skills/provider-cli-matrix/manifest.json, tests/core/skill-rule-rewrite.test.ts
- Scope: .deckent/skills/, tests/core/
- Dependencies: none
### Description
Lint-gerekçeleri aynen: **code-simplifier** 'simplification' = zararsız-ölü-ağırlık (diğer kuralı tek-başına
yeterli) → kaldır ya da intent-kurala çevir. **database-migration** 'database' → data-engineer'la aynı kök:
stackDetection+intent'e çevir. **git-expert** 'git' → segment yok; stackDetection.files/commands ZATEN var →
ölü domain-kuralını kaldır/gerçek-sinyale bağla. **monorepo-expert** 'monorepo' → bu repo'da anlamsız;
stackDetection (turbo.json/nx.json/pnpm-workspace) kuralına çevir. **onboarding-ux** 'onboarding' → 'cli'ye
alias YASAK (her CLI-task'ta ateşlenir) → dar-sinyal: intent + trigger-kelimeler (onboarding/init/wizard).
**provider-cli-matrix** 'provider-cli' → src/providers'ın dar-alt-kümesi → intent+trigger'a çevir; A-tier
proje-doğumlu skill'in ERİŞİLEBİLİR kaldığını (uygun fixture'da seçilebilir) testle kanıtla.
**Advisor-notları:** (i) manifest `minScore` ÖLÜDÜR (evaluateActivation okumaz; global skill=3/agent=5 geçerli) —
"tune" etmeye kalkma; (ii) skill `stackDetection` = +1-max/break-after-first — tek başına eşiği GEÇEMEZ, skoru
intent-kuralı taşımalı; (iii) intent'e çevrilen kurallar secondary-intent'te YARIM-skorla da ateşler
(evaluateRuleViaSecondary) — domain-kurallarında bu kanal yoktu: çevrilen her kural için 1 secondary-intent
pin-fixture'ı ekle.
### goNogo
- goCriteria: 6 manifest'te ölü-kelime kalmaz (lint-borç 6 kalem düşer); provider-cli-matrix + git-expert erişilebilirlik-fixture'ı yeşil (A-tier skill'ler görünmez kalmasın — audit'in ana şikâyeti); routing suite yeşil; lint 0-yeni-ölü.
- nogo: skill İÇERİĞİNE (SKILL.md) dokunma; activation-şemasını bozma (590 validation'ı geçmeli); başka skill'e dokunma.
- Kanıt: `node scripts/lint-rule-vocabulary.mjs` + `npx vitest run tests/core/skill-rule-rewrite.test.ts tests/core/pool-activation-validation.test.ts tests/core/skill-pool.test.ts` → 0 fail (varsa).

## Task 3: born-603 — DEBT-INJECTION-NOOP-ECHO — dürüst no-op fix-wave debt'i yeniden doğmasın (P2)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-planner.ts, tests/orchestra/debt-injection-noop-echo.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
Canlı-vaka (sprint-395 planı): fix-wave'in "no defect found / no source change" arastırma-notlu DEBT kayıtları
"Priority fix for critical debt item" olarak CRITICAL yeniden-enjekte edildi; biri taze-güvenlik-dosyalarına
stale-scope'la binecekti (elle resolveDebt+re-plan ile çözüldü). FIX (sprint-planner TEK-YAZAR; :1000-1035
skip-class bölgesi): (a) skip-sınıflandırmasına "honest no-op" sınıfı ekle — **KONJONKTİF desen (ikisi birden ŞART):**
fix-wave-köken (originTaskId `-fix`/`-xfix` deseni) **VE** debt-notunda no-defect-işareti ('no defect'/'no source
change'/'no code change'). ⚠️ Advisor-düzeltmeleri: `filesChanged` injection-anında ERİŞİLEMEZ (DebtItem'da yok) —
kullanma; eşleşmeyi 80-karakter-kesik `title/description` üzerinde DEĞİL, sprint-planner İÇİNDEKİ row→DebtItem
mapper'ında (satır ~180-196) tam `content` alanını yüzeye çıkarıp onda yap. ⚠️ KALICILIK: skip edilen id'ler
`resolveDebt` ile KALICI kapanıyor (:290-292) — false-positive gerçek-debt'i sonsuza dek kapatır → bu sınıf için
YA skip-without-resolve YA ayrı-etiketli resolve (denetlenebilir kapanış) uygula; regresyon-fixture: fix-köken AMA
defect-tarifli not → AYNEN enjekte. (b) enjekte edilen task-description'ı jenerik metin yerine tam debt-NOTU
(`content`) taşısın. REPRODUCE-first: RED-test = 395-vakası fixture'ı. (Üretici-taraf yapısal `'no-defect-found'`
DebtClass = v2, born-604 — debt-manager bu sprint'te KAPALI.)
### goNogo
- goCriteria: no-op fix-wave-debt fixture → SKIP+sayım; gerçek-actionable debt injection AYNEN (regresyon-test); description debt-notu taşır; mevcut planner testleri (override-warning-surface dahil) yeşil; tsc temiz.
- nogo: debt-manager'a dokunma; skip'i genişletip GERÇEK debt'i düşürme (dar-desen); overrideWarnings bölgesine dokunma.
- Kanıt: `npx vitest run tests/orchestra/debt-injection-noop-echo.test.ts tests/orchestra/override-warning-surface.test.ts tests/orchestra/sprint-planner*.test.ts` → 0 fail.
