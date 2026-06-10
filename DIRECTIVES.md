# DIRECTIVES — Sprint 276: PLAN-INT-1 (Pre-PLAN Sorgulama) + XVER-1 (Cross-Provider Adversarial Verify)

## Goal: gstack-dersi iki kalite kaldıracı (Alperen 2026-06-10, §14-S). (1) PLAN-INT-1: PLAN'dan ÖNCE opt-in "directive-interrogation" — Brain hedefi zorlayıcı sorularla sınar (yanlış-problem'i koddan önce yakalar), revize DIRECTIVES taslağı önerir; doğrudan-DIRECTIVES yolu ASLA bloke olmaz (power-user atlar). (2) XVER-1: yüksek-riskli task'larda (security/auth/P0/risk-tagged) sonucu FARKLI bir provider'a "bunu ÇÜRÜTMEYE çalış" adversarial doğrulamasıyla denetlet — eval'e advisory sinyal, **config-gated default-OFF**, OAuth-fleet'te $0 (F1-CB), ikinci provider yoksa honest-fail. MİKRO-TASK + DEPENDENCY + MODEL-KATMANLAMA (opus 3 · sonnet 6 · haiku 3).

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable spawn/fs/readline; gerçek ağ/provider YASAK testlerde; spawnSync YASAK.
- **Opt-in + fail-safe:** her iki özellik de default-OFF; hata/sağlayıcı-yokluğu mevcut akışı ASLA bozmaz (interrogation atlanır → düz plan; xverify atlanır → mevcut eval). Davranış korunumu: bayrak/config kapalıyken bayt-bayt aynı.
- **i18n-FIRST:** user-facing TÜM string `getMessage(key, lang)` (en+tr) — interrogation soruları + xverify mesajları dahil.
- **SSOT:** provider seçimi `sprint-utils`/`task-router` mevcut helper'ları; eval `result-evaluator`; YENİDEN İCAT YOK.
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş. Tier-1 smoke CC sprint-sonu (ADR-079).

---

## Task 1: directive-interrogator çekirdeği — zorlayıcı soru üretimi + taslak öneri
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/core/directive-interrogator.ts, tests/core/directive-interrogator.test.ts
- Scope: src/core/, tests/core/

### Description
**YENİ `src/core/directive-interrogator.ts`** (PLAN-INT-1 çekirdeği, LLM-opsiyonel-pure tasarım): `buildInterrogationQuestions(directives: string, opts?): InterrogationQuestion[]` — DIRECTIVES metnini ayrıştırıp (Goal + Task başlıkları) **yapısal zorlayıcı sorular** üretir (gstack /office-hours deseni): (a) pain-vs-feature ("bu gerçek bir acı mı yoksa feature-isteği mi?"), (b) en-dar-shippable-wedge, (c) gizli/varsayılan capability'ler, (d) sorgulanacak premise'ler, (e) effort-alternatifleri. Sorular i18n key-tabanlı (getMessage; soru-şablonları en+tr) + DIRECTIVES içeriğinden parametrik (Goal'daki anahtar isimleri enjekte). + `applyInterrogationAnswers(directives, answers): string` — pure: kullanıcı cevaplarını alıp revize DIRECTIVES TASLAĞI üretir (orijinali SİLMEZ — Goal'a "## Interrogation Refinements" bölümü ekler/günceller; içerik-korunumlu). LLM çağrısı YOK bu task'ta (yapısal sorular yeter; LLM-zenginleştirme opsiyonel-sonraki). Hermetik testler: soru üretimi (boş/çok-task'lı DIRECTIVES), i18n key varlığı, taslak-üretim içerik-korunumu, cevapsız-soru toleransı.

**Kanıt:** `npx vitest run tests/core/directive-interrogator.test.ts` yeşil; `grep -n "buildInterrogationQuestions\|applyInterrogationAnswers" src/core/directive-interrogator.ts | head -2` ≥ 2. **Test:** 8+.

---

## Task 2: interrogation config + i18n soru sözlüğü
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/config-types.ts, src/core/config.ts, src/cli/helpers/messages.ts, tests/core/config-interrogate.test.ts
- Scope: src/core/, src/cli/helpers/, tests/core/

### Description
(1) Config: `plan?: { interrogate?: boolean }` opsiyonel (default false=kapalı; mevcut `prompt` bloğuyla aynı düzeyde — `prompt.adr_render` deseni). Validation: boolean kontrolü. (2) i18n: Task 1'in kullandığı interrogation soru/başlık key'lerini `messages.ts`'e en+tr ekle (`interrogate.q_pain`, `interrogate.q_wedge`, `interrogate.q_hidden`, `interrogate.q_premise`, `interrogate.q_effort`, `interrogate.intro`, `interrogate.draft_header` vb. — Task 1 hangi key'leri çağırıyorsa). messages-completeness guard'ı (Sprint 270-019) yeşil kalmalı (key-parite). Testler: config geçerli/geçersiz/default; messages key varlığı en+tr.

**Kanıt:** `npx vitest run tests/core/config-interrogate.test.ts tests/cli/messages-completeness.test.ts` yeşil; `grep -c "interrogate" src/cli/helpers/messages.ts` ≥ 5. **Test:** 5+.

---

## Task 3: deckent plan --interrogate CLI wire
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/plan.ts, tests/cli/plan-interrogate.test.ts
- Dependencies: 276-001, 276-002
- Scope: src/cli/, tests/cli/

### Description
`deckent plan`'e `--interrogate` opsiyonu (kaynak: `plan.ts:14` registerPlan; config `plan.interrogate` true ise bayraksız da aktif). Akış: PLAN'dan ÖNCE → `buildInterrogationQuestions(DIRECTIVES)` → soruları `node:readline/promises` ile sun (ADR-011), cevapları topla → `applyInterrogationAnswers` ile revize taslak üret → kullanıcıya GÖSTER + onay iste ("bu taslağı DIRECTIVES.md'ye yaz ve planla? Y/n"). Onay→yaz+devam; ret→orijinalle devam. `--no-confirm`/non-interactive ortamda interrogation ATLANIR (sessiz, düz plan — bloke etme). Hermetik test: injectable readline ile soru-akışı + onay-evet (taslak yazıldı) + onay-hayır (orijinal korundu) + non-interactive atlama.

**Kanıt:** `npx vitest run tests/cli/plan-interrogate.test.ts` yeşil; `grep -n "interrogate" src/cli/commands/plan.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 4: cross-verify çekirdeği — high-stakes tespit + farklı-provider seçimi
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/core/cross-verify.ts, tests/core/cross-verify.test.ts
- Scope: src/core/, tests/core/

### Description
**YENİ `src/core/cross-verify.ts`** (XVER-1 çekirdeği, pure-karar katmanı): (1) `isHighStakesTask(task): boolean` — security/auth anahtar kelimeleri (scope/desc/agent=security-auditor), priority=CRITICAL/P0, policy=risk-tagged (mevcut task alanlarından; kanıt-temelli, uydurma sinyal yok). (2) `selectVerifierProvider(taskProvider, availableProviders): ProviderName | null` — task'ı koşandan FARKLI bir provider seç (claude→codex/gemini öncelik sırası; tek-provider ortamında `null` → honest-skip). availableProviders caller'dan (bootstrap'tan; bu modül pure). (3) `CrossVerifyDecision { shouldVerify: boolean; verifierProvider?; reason }`. LLM/spawn YOK (karar katmanı; dispatch Task 7). Hermetik testler: high-stakes tespiti (pozitif/negatif), provider-seçim (claude→alt, tek-provider→null), karar birleşimi.

**Kanıt:** `npx vitest run tests/core/cross-verify.test.ts` yeşil; `grep -n "isHighStakesTask\|selectVerifierProvider" src/core/cross-verify.ts | head -2` ≥ 2. **Test:** 8+.

---

## Task 5: cross_verify config bloğu (default-off)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/config-types.ts, src/core/config.ts, tests/core/config-cross-verify.test.ts
- Scope: src/core/, tests/core/

### Description
Config: `cross_verify?: { enabled: boolean; high_stakes_only?: boolean (default true); verifier_priority?: string[] (default ['codex','gemini','claude']) }` — default blok-yok=kapalı. Validation (resource_monitor deseni): enabled boolean; high_stakes_only boolean; verifier_priority string[]. Blok yokken sıfır davranış değişikliği. NOT: config-types.ts'i Task 2 de değiştiriyor — bu task FARKLI alan ekler (plan vs cross_verify), çakışırsa Brain FIX; ama ayrı bloklar olduğu için merge-safe. Testler: geçerli/geçersiz/default + iç içe alan validasyonu.

**Kanıt:** `npx vitest run tests/core/config-cross-verify.test.ts` yeşil; `grep -n "cross_verify" src/core/config-types.ts` ≥ 1. **Test:** 5+.

---

## Task 6: adversarial-refute prompt builder
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/core/cross-verify-prompt.ts, tests/core/cross-verify-prompt.test.ts
- Dependencies: 276-004
- Scope: src/core/, tests/core/

### Description
**YENİ `src/core/cross-verify-prompt.ts`** (Task 4 tiplerini import eder): `buildRefutePrompt(task, result, opts): string` — verifier-worker'a verilecek adversarial prompt: "Bu task'ın sonucunu BAĞIMSIZ doğrula; amacın ONAYLAMAK değil ÇÜRÜTMEK. Diskteki gerçek değişikliği incele (git diff/dosyalar), goCriteria karşıla, gizli hata/eksik/güvenlik-açığı ara. Sonunda VERDICT: REFUTED <neden> | CONFIRMED <kanıt>." Disk-verify temelli (worker gerçek dosyalara bakar), self-onay yanlılığını kıran dil. + `parseRefuteVerdict(output): { verdict: 'refuted'|'confirmed'|'unclear'; reason: string }` — verifier çıktısından sonuç çıkarımı (regex/anahtar, belirsiz→'unclear'). i18n: prompt İngilizce (worker-prompt standardı; mekanizma-string değil içerik). Testler: prompt içeriği (refute-dili + goCriteria enjekte), verdict parse (3 durum + bozuk çıktı).

**Kanıt:** `npx vitest run tests/core/cross-verify-prompt.test.ts` yeşil; `grep -n "parseRefuteVerdict\|REFUTED" src/core/cross-verify-prompt.ts | head -2` ≥ 2. **Test:** 7+.

---

## Task 7: cross-verify dispatch + eval advisory-wire (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/cross-verify-runner.ts, src/orchestra/sprint-phases.ts, tests/orchestra/cross-verify-wire.test.ts
- Dependencies: 276-004, 276-005, 276-006
- Scope: src/orchestra/, tests/orchestra/

### Description
**YENİ `src/orchestra/cross-verify-runner.ts`** + sprint-phases EVALUATE-sonrası wire. YALNIZ `config.cross_verify?.enabled === true` iken: EVALUATE'te bir task DONE/GO_WITH_TECH_DEBT aldıysa VE `isHighStakesTask` (high_stakes_only ise) → `selectVerifierProvider` (bootstrap'tan available list) → verifier yoksa **honest-skip** (debugLog "cross-verify skipped: no second provider", asla sessiz-başarı değil) → varsa `buildRefutePrompt` ile farklı-provider worker spawn (kısa timeout; `spawnWorkerMultiProvider` SSOT, provider override) → `parseRefuteVerdict` → sonucu task .result'ına `crossVerify: { verifier, verdict, reason }` advisory alanı olarak yaz + REFUTED ise brainEvaluation'a uyarı sinyali (downgrade DEĞİL — advisory; Brain/insan karar verir, ADR-070 evaluation-integrity). HER ŞEY best-effort try/catch — xverify hatası sprint'i/eval'i ASLA düşürmez. Hermetik test: enabled+high-stakes+2-provider → refute-worker spawn (mock) + advisory yazım; tek-provider → honest-skip; disabled → hiç çağrı; spawn-throw → eval etkilenmez; REFUTED → advisory sinyal (downgrade yok).

**Kanıt:** `npx vitest run tests/orchestra/cross-verify-wire.test.ts` yeşil; `grep -n "cross_verify\|crossVerify" src/orchestra/sprint-phases.ts | head -2` ≥ 1. **Test:** 8+.

---

## Task 8: cross-verify outcome-tracker beslemesi — öğrenilen verifier eşleşmeleri
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/outcome-tracker.ts, tests/orchestra/cross-verify-outcome.test.ts
- Dependencies: 276-007
- Scope: src/orchestra/, tests/orchestra/

### Description
Task 7'nin crossVerify verdict'ini outcome-tracker'a besle (ROUTE-1 öğrenme yolu): REFUTED verdict → ilgili agent/provider eşleşmesine negatif sinyal (gelecekte o tür task'a farklı routing); CONFIRMED → pozitif (best-effort, mevcut recordOutcome deseni — yeni alan/çağrı minimal). xverify kapalıyken outcome-tracker davranışı bayt-bayt aynı. ADR-008: outcome-tracker orchestra'da, cross-verify tipleri core'da — import yönü uyumlu. Testler: REFUTED→negatif sinyal kaydı (mock store), CONFIRMED→pozitif, crossVerify-yok→mevcut davranış.

**Kanıt:** `npx vitest run tests/orchestra/cross-verify-outcome.test.ts` yeşil; `grep -n "crossVerify\|refute" src/orchestra/outcome-tracker.ts | head -2` ≥ 1. **Test:** 5+.

---

## Task 9: REPL /interrogate slash — pre-plan sorgulamaya REPL erişimi
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-slash-registry.ts, src/cli/commands/chat-native.ts, tests/cli/chat-slash-interrogate.test.ts
- Dependencies: 276-001, 276-002
- Scope: src/cli/, tests/cli/
- ModelEffort: low

### Description
REPL'den pre-plan sorgulamaya erişim: `/interrogate` slash — mevcut DIRECTIVES.md'yi okuyup `buildInterrogationQuestions` ile soruları REPL'de gösterir (cevap-toplama REPL'in mevcut chat-input döngüsünden geçer; basit tutar — soruları LİSTELER, kullanıcı /directives set ile revize edebilir VEYA cevap akışı mümkünse uygula). 3-katman kuralı: bu slash CLI-spawn DEĞİL, REPL-içi meta-komut (chat-native'de doğrudan handle — /nervous deseni gibi), o yüzden tool-bridge/permissions GEREKMEZ; yalnız registry + chat-native handler. i18n. Testler: registry kaydı, handler soru-render (mock DIRECTIVES), DIRECTIVES-yok dürüst mesaj.

**Kanıt:** `npx vitest run tests/cli/chat-slash-interrogate.test.ts` yeşil; `grep -n "interrogate" src/cli/commands/chat-slash-registry.ts | head -1` ≥ 1. **Test:** 5+.

---

## Task 10: api-surface + config-reference — yeni alanlar
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/config-reference.md, docs/reference/api-surface.md
- Dependencies: 276-002, 276-005, 276-007
- Scope: docs/reference/
- ModelEffort: low

### Description
DİSKTEKİ koddan (inmemişleri yazma + .result'a not): config-reference'a `plan.interrogate` + `cross_verify` bloğu (alanlar/default'lar birebir); api-surface.md'ye `.result` formatına `crossVerify` advisory alanı (verifier/verdict/reason — Task 7 yazdıysa). Uydurma YOK.

**Kanıt:** `grep -ciE "interrogate|cross_verify" docs/reference/config-reference.md` ≥ 2. **Test:** yok — .result YAZ.

---

## Task 11: features + cli-commands — PLAN-INT/XVER satırları
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md, docs/reference/cli-commands.md
- Dependencies: 276-003, 276-007, 276-009
- Scope: docs/reference/
- ModelEffort: low

### Description
DİSKTEKİ koddan: features.md'ye PLAN-INT-1 (plan --interrogate + /interrogate slash) + XVER-1 (cross_verify, default-off, high-stakes adversarial) satırları; cli-commands'a `plan --interrogate` + `/interrogate` notu. Tetikleyen bayrak/config ile. Mevcut format.

**Kanıt:** `grep -ciE "interrogate|cross.?verify|adversarial" docs/reference/features.md` ≥ 2. **Test:** yok — .result YAZ.

---

## Task 12: MASTER-PLAN — PLAN-INT-1 + XVER-1 kapanış işaretleri
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Dependencies: 276-003, 276-007
- Scope: docs/
- ModelEffort: low

### Description
Diskte doğruladıklarını işaretle (inmemişleri İŞARETLEME): PLAN-INT-1 ✅ Sprint 276 (pre-plan interrogation: core + plan --interrogate + /interrogate slash; LLM-zenginleştirme opsiyonel-kalan), XVER-1 ✅ Sprint 276 (cross-provider adversarial verify: core + dispatch-wire + outcome-feed, default-off; canlı çok-provider kanıtı kalan). Tek-satır ekler, mevcut metni SİLME.

**Kanıt:** `grep -c "Sprint 276" docs/MASTER-PLAN.md` ≥ 2. **Test:** yok — .result YAZ.

---

**Beklenen:** 12 mikro task (opus 3 — interrogator/cross-verify-core/dispatch-wire · sonnet 6 · haiku 3), zincirler: 003→001,002 · 006→004 · 007→004,005,006 · 008→007 · 009→001,002 · 010→002,005,007 · 011→003,007,009 · 012→003,007. Dosya çakışması: config-types.ts (002 plan-alanı + 005 cross_verify-alanı — ayrı bloklar, merge-safe ama çakışırsa Brain FIX); chat-slash-registry.ts (009 tek sahip); sprint-phases.ts (007 tek sahip). Her şey default-OFF + fail-safe. CC sprint sonu: tsc + testler + `deckent plan --interrogate` smoke + commit/push + 🔨 BUILD. Sonraki: dashboard UI SSO · F9 MCP-client Faz 2 · (en-son) MOD-SPLIT.
