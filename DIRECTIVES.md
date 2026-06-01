# DIRECTIVES — Sprint 212: F5 Evrim Crowning (dormant→CANLI gerçek caller) + Routing skew fix + Doc-reality sync + IDE seed

## Goal: BÜYÜK ÖLÇEK (15 task, 4 dalga, 10 worker). MASTER-PLAN §10 önceliği #1 = STABİLİTE/HİJYEN + EVRİM CROWNING. DALGA A: F5 evrimsel modülleri (prompt-evolution, adaptive-agent, agent-genealogy, agent-retirement, specialization-drift, prompt-rollback) sprint lifecycle'a GERÇEK external caller ile bağla — dormant→canlı. DALGA B: evrimi GÖRÜNÜR kıl (retro "Next Sprint Behavior Changes") + routing skew fix (skill→agent sinyali). DALGA C: doc-reality sync (managed-docs generator code-derived sayılar). DALGA D: IDE extension scaffold (Sprint 213-214 tohumu) + ADR-075. Her task TEK dosya odaklı/TEK sorumluluk, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI zorunlu.

Bağlam:
- Sprint 211: 16/16 DONE, tam-suite 18390+570 pass / 0 fail. F4 enterprise %100, F2 native chat ~%80, F7 dashboard polish başladı.
- **AÇIK BORÇ (Sprint 211 disk-verify):** F5 wire-gap — prompt-evolution + adaptive-agent + 4 dormant evrim modülü (prompt-rollback/agent-genealogy/agent-retirement/specialization-drift) implement+test EDİLMİŞ ama **0 external caller** (sadece test bağlamında çalışıyor, runtime'da çağrılmıyor). cross-sprint-analyzer gerçekten bağlı (evolve CLI). Routing skew geri döndü (12/16 refactorer).
- F5 evrimsel mimari = ürünün ANA farklılaştırıcısı ([[project_deckent_god_level_vision]]). "wire DONE" ama 0-caller = ölü kod. Bu sprint onu CANLI yapar.

---

## Tüm task'lar için ortak kurallar
- **Subscription mode ZORUNLU** — `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY`. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite. Host-facing'e `/workspace` YAZMA.
- **KÜÇÜK TASK:** tek-dosya odaklı/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- **Her kod task'ı YENİ TEST DOSYASI** (min 4 test) — Brain coverage muafiyeti buna bağlı ([[feedback_brain_rubric_bridge_broken]]).
- **🔑 WIRE-GAP DERSİ ZORUNLU ([[feedback_directive_kanit_letter_vs_goal]]):** "dormant→canlı / wire" task'larında: (1) scope.filesWrite **ÇAĞIRAN modülü İÇERİR** (sadece modül-tanımı değil), (2) kanıt-grep **def-dosyasını DIŞLAR** — `grep -rl "X" src/ | grep -v test | grep -v "<def-file>.ts"` → external caller ≥1. Modül-içi helper eklemek "wire" SAYILMAZ. Gerçek runtime caller şart.
- **Dishonest YASAK** — gerçekten ölç, +0/-0 tuzağı yok. Modül-seviye çöp/placeholder BIRAKMA ([[feedback_fix_prompt_quality]]). CLI komutları index.ts'e WIRE et (registerX import+çağrı).
- **ADR-008 layering:** Brain (sprint-controller) tek-yönlü import. orchestra→agents import gerekiyorsa ADR-008'i ihlal ETME — gerekirse sprint-controller veya core/ interface üzerinden route et.
- **Test dosyası doğru dizinde:** dashboard testleri `tests/dashboard/`, diğerleri `tests/<modül>/`.
- ESM `.js` suffix. ADR-010 (yeni runtime dep YASAK — node built-in veya mevcut paket). Hedef: tam-suite 0 fail KORUNUR, regresyon yok.

---

## DALGA A — F5 Evrim Crowning: dormant→CANLI gerçek caller (6 task)

## Task 1: 212-001 — prompt-evolution RETRO'ya gerçek caller (sprint-reporter wire)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/prompt-evolution-retro-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies:

### Description
**Problem:** prompt-evolution.ts `wirePromptEvolutionFromOutcomes` VAR ama hiçbir runtime modül çağırmıyor (0 external caller).
**Çözüm:** sprint-reporter.ts RETRO/learnings yazımında `wirePromptEvolutionFromOutcomes`'u ÇAĞIR — sprint sonu outcome'larından prompt iyileştirme önerisi üret, retro çıktısına/memory'ye yaz (uygulamaz, önerir). Caller sprint-reporter.ts'te (def-dosyası prompt-evolution.ts DEĞİL).
**Kanıt:** `grep -rl "wirePromptEvolutionFromOutcomes\|evolvePrompt" src/ | grep -v test | grep -v "prompt-evolution.ts"` → ≥1 (gerçek external caller); `npx vitest run tests/orchestra/prompt-evolution-retro-wire.test.ts` → 4+ pass
**Test:** ≥4 (caller tetikler, öneri üretilir, boş outcome no-op, retro çıktısına yazılır)

## Task 2: 212-002 — adaptive-agent outcome-tracker'a gerçek caller wire
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/orchestra/outcome-tracker.ts, tests/orchestra/adaptive-agent-outcome-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies:

### Description
**Problem:** adaptive-agent.ts `adaptAgentRuntime` VAR ama 0 external caller (Sprint 211 scope outcome-tracker'a wire'ı engellemişti).
**Çözüm:** outcome-tracker.ts sprint outcome kaydında `adaptAgentRuntime`'ı ÇAĞIR — agent başarı oranına göre skill ekle/çıkar önerisi üret, outcome metadata'ya yaz. ADR-008 layering'e dikkat (agents/→orchestra import yönü: orchestra→agents OK, forbidden trio değil; gerekirse core/ interface). Caller outcome-tracker.ts'te.
**Kanıt:** `grep -rl "adaptAgentRuntime\|adaptAgent" src/ | grep -v test | grep -v "adaptive-agent.ts"` → ≥1 external caller; `npx vitest run tests/orchestra/adaptive-agent-outcome-wire.test.ts` → 4+ pass
**Test:** ≥4 (caller tetikler, başarılı agent no-change, başarısız agent skill önerisi, idempotent)

## Task 3: 212-003 — agent-genealogy promotion-pipeline'a gerçek caller wire
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/promotion-pipeline.ts, tests/orchestra/agent-genealogy-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies:

### Description
**Problem:** agent-genealogy.ts implement+test edilmiş ama 0 external caller.
**Çözüm:** promotion-pipeline.ts temp→permanent promosyon/demotion sırasında agent-genealogy'yi ÇAĞIR — agent soyağacını (parent agent, mutation, sprint) kaydet. Caller promotion-pipeline.ts'te.
**Kanıt:** `grep -rl "genealogy\|AgentGenealogy\|recordLineage" src/ | grep -v test | grep -v "agent-genealogy.ts"` → ≥1 external caller; `npx vitest run tests/orchestra/agent-genealogy-wire.test.ts` → 4+ pass
**Test:** ≥4 (promosyonda lineage kayıt, demotion, parent zinciri, boş)

## Task 4: 212-004 — agent-retirement DECAY/promotion'a gerçek caller wire
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/promotion-pipeline.ts, tests/orchestra/agent-retirement-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 212-003

### Description
**Problem:** agent-retirement.ts implement+test edilmiş ama 0 external caller.
**Çözüm:** promotion-pipeline.ts demotion/LRU-evict akışında agent-retirement'ı ÇAĞIR — düşük başarılı temp agent'ı emekliye ayır (retire kaydı + sebep). Caller promotion-pipeline.ts'te. (212-003 ile aynı dosya — sıralı, çakışma önlemi.)
**Kanıt:** `grep -rl "retirement\|AgentRetirement\|retireAgent" src/ | grep -v test | grep -v "agent-retirement.ts"` → ≥1 external caller; `npx vitest run tests/orchestra/agent-retirement-wire.test.ts` → 4+ pass
**Test:** ≥4 (düşük-başarı retire, yüksek-başarı koru, retire sebebi, idempotent)

## Task 5: 212-005 — specialization-drift retro/outcome'a gerçek caller wire
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/specialization-drift-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 212-001

### Description
**Problem:** specialization-drift.ts implement+test edilmiş ama 0 external caller.
**Çözüm:** sprint-reporter.ts retro/performans bölümünde specialization-drift'i ÇAĞIR — agent'ların uzmanlık alanından sapmasını (drift) tespit et, rapora yaz. Caller sprint-reporter.ts'te. (212-001 ile aynı dosya — sıralı.)
**Kanıt:** `grep -rl "specializationDrift\|SpecializationDrift\|detectDrift" src/ | grep -v test | grep -v "specialization-drift.ts"` → ≥1 external caller; `npx vitest run tests/orchestra/specialization-drift-wire.test.ts` → 4+ pass
**Test:** ≥4 (drift tespit, drift yok, çoklu agent, boş veri)

## Task 6: 212-006 — prompt-rollback evolution flow'a gerçek caller wire
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/prompt-evolution.ts, tests/orchestra/prompt-rollback-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 212-001

### Description
**Problem:** prompt-rollback.ts implement+test edilmiş ama 0 external caller.
**Çözüm:** prompt-evolution.ts içinde, evrilen prompt düşük performans gösterdiğinde prompt-rollback'i ÇAĞIR — önceki prompt versiyonuna geri dön önerisi. Caller prompt-evolution.ts'te (rollback için bu meşru caller; def-dosyası prompt-rollback.ts'i dışla).
**Kanıt:** `grep -rl "rollback\|PromptRollback\|revertPrompt" src/ | grep -v test | grep -v "prompt-rollback.ts"` → ≥1 external caller; `npx vitest run tests/orchestra/prompt-rollback-wire.test.ts` → 4+ pass
**Test:** ≥4 (düşük-perf rollback, iyi-perf koru, versiyon zinciri, boş)

---

## DALGA B — Evrimi Görünür Kıl + Routing Skew Fix (3 task)

## Task 7: 212-007 — Retro "Next Sprint Behavior Changes" bölümü (evrim görünürlüğü)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-retro-writer.ts, tests/orchestra/retro-behavior-changes.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 212-002

### Description
**Problem:** ([[project_deckent_god_level_vision]] MASTER-PLAN §5 #3-ext) retro Summary/Highlights/Metrics/Learnings yazıyor ama evrimin GÖRÜNÜR çıktısı yok — kullanıcı "kazanım hissedemiyorum" diyor.
**Çözüm:** sprint-retro-writer.ts'e **"Next Sprint Behavior Changes"** bölümü ekle — agent prompt mutasyonu, skill repertuvarı (kazanılan/güçlenen/emekli), Brain karar-pattern değişikliği (212-002 adaptive + 212-003/004 genealogy/retirement çıktılarından). Her sprint ≥3 görünür değişiklik hedefi.
**Kanıt:** `grep -c "Behavior Changes\|behaviorChanges\|nextSprintChanges" src/orchestra/sprint-retro-writer.ts` → ≥2; `npx vitest run tests/orchestra/retro-behavior-changes.test.ts` → 4+ pass
**Test:** ≥4 (bölüm render, agent mutasyon listele, skill değişim, boş→graceful)

## Task 8: 212-008 — Routing skew fix: skill→agent aktivasyon sinyali
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/activation-engine.ts, tests/core/skill-agent-signal.test.ts
- Scope: src/core/, tests/core/
- Dependencies:

### Description
**Problem:** ([[feedback_agent_routing_imbalance]]) Skill routing çeşitli (frontend-design, security-specialist atanıyor) ama AGENT seçimi 12/16 refactorer'a collapse ediyor. Skill→agent sinyali eksik.
**Çözüm:** activation-engine.ts'e skill→agent affinity sinyali ekle — assignedSkills'e göre agent skorunu artır: frontend-design/react-specialist → frontend-designer, security-specialist → security-auditor, api-builder skill → api-builder agent, documentation-writer → doc-writer. refactorer aday KALIR ama tek-kazanan olmasın ([[feedback_agent_routing_imbalance]] DİKKAT: Sprint 205 fix'i geri alma).
**Kanıt:** `grep -c "skillAgentAffinity\|skill.*agent.*signal\|SKILL_AGENT_MAP" src/core/activation-engine.ts` → ≥1; `npx vitest run tests/core/skill-agent-signal.test.ts` → 4+ pass
**Test:** ≥4 (frontend skill→frontend-designer, security→security-auditor, refactorer hâlâ aday, çoklu-skill)

## Task 9: 212-009 — Routing çeşitlilik guard testi (regresyon önleme)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/core/routing-diversity-guard.test.ts
- Scope: tests/core/
- Dependencies: 212-008

### Description
**Problem:** Routing skew sessizce geri dönüyor (Sprint 209-210 düzeldi, 211 nüks). Regresyon guard yok.
**Çözüm:** `routing-diversity-guard.test.ts` — temsili 16-task karışık DNA seti (UI, security, API, doc, impl) route et, agent dağılımının çeşitli olduğunu assert et (tek agent ≤%60, ≥4 farklı agent). 212-008 sinyalini doğrular.
**Kanıt:** `npx vitest run tests/core/routing-diversity-guard.test.ts` → 4+ pass; tek-agent payı ≤%60 assert
**Test:** ≥4 (karışık set çeşitlilik, UI→frontend, security→security-auditor, tek-agent cap)

---

## DALGA C — Doc-Reality Sync (3 task)

## Task 10: 212-010 — managed-docs generator: code-derived module sayıları
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/managed-docs/content-generators.ts, tests/orchestra/content-generators-counts.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies:

### Description
**Problem:** ([[feedback_zero_hardcode_live_data]]) CLAUDE.md/DECKENT.md "core 90 modules, orchestra 76" diyor; gerçek **core 111, orchestra 88**. Generator stale/hardcoded sayı üretiyor.
**Çözüm:** content-generators.ts'te architecture module sayılarını **runtime'da diskten say** (fs okuma: `src/core/*.ts`, `src/orchestra/*.ts` vb.) — hardcode kaldır. Regen sonrası CLAUDE/DECKENT doğru.
**Kanıt:** `grep -c "readdirSync\|countModules\|\.ts.*length\|moduleCount" src/orchestra/managed-docs/content-generators.ts` → ≥1; `npx vitest run tests/orchestra/content-generators-counts.test.ts` → 4+ pass
**Test:** ≥4 (core sayı code-derived, orchestra sayı, hardcode yok, dizin değişince güncellenir)

## Task 11: 212-011 — VISION/IDENTITY "by the numbers" generator: live MCP/CLI sayıları
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/managed-docs/content-generators.ts, tests/orchestra/content-generators-numbers.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 212-010

### Description
**Problem:** VISION.md "by the numbers" 28 MCP tools / 62+ CLI gösteriyor; gerçek **32 MCP / 49+ CLI** (IDENTITY canonical). Generator drift. (212-010 ile aynı dosya — sıralı.)
**Çözüm:** content-generators.ts MCP tool + CLI command sayısını kod kayıtlarından türet (mcp registry + cli registerX). VISION/IDENTITY/CLAUDE tutarlı 32/49+ üretsin.
**Kanıt:** `grep -c "mcpToolCount\|cliCommandCount\|deckent_.*length\|registerCount" src/orchestra/managed-docs/content-generators.ts` → ≥1; `npx vitest run tests/orchestra/content-generators-numbers.test.ts` → 4+ pass
**Test:** ≥4 (MCP=32 code-derived, CLI live, tutarlılık, drift yok)

## Task 12: 212-012 — README badge + Memory V2 benchmark proof
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/benchmark/memory-v2.md, tests/docs/memory-v2-benchmark.test.ts
- Scope: docs/, tests/docs/
- Dependencies:

### Description
**Problem:** ([[feedback_zero_hardcode_live_data]]) README "96% context reduction" iddiası kanıtsız (proof dosyası yok); MASTER-PLAN §9 doc-debt.
**Çözüm:** `docs/benchmark/memory-v2.md` — Memory V2 context-reduction ölçüm metodolojisi + gerçek sayılar (eski .md tüketimi vs FTS5 summary). İddiayı KANITLA veya gerçek ölçülen yüzdeye düzelt (dürüst). README badge notu bu dosyaya bağlanır.
**Kanıt:** `ls docs/benchmark/memory-v2.md`; `grep -c "context\|reduction\|FTS5\|token" docs/benchmark/memory-v2.md` → ≥2; `npx vitest run tests/docs/memory-v2-benchmark.test.ts` → 3+ pass
**Test:** ≥3 (benchmark dosyası var, metodoloji bölümü, sayı doğrulanabilir)

---

## DALGA D — IDE Extension Seed + ADR (3 task)

## Task 13: 212-013 — extensions/vscode/ scaffold (Sprint 213-214 tohumu)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: extensions/vscode/package.json, extensions/vscode/src/extension.ts, tests/extensions/vscode-activation.test.ts
- Scope: extensions/, tests/extensions/
- Dependencies:

### Description
**Problem:** ([[project_dashboard_control_plane]] MASTER-PLAN §6 IDE ext) `extensions/vscode/` diskte YOK — CLAUDE.md mimari satırı yanlış. IDE'de `deckent` komutu için temel yok.
**Çözüm:** VS Code extension scaffold — `package.json` (extension manifest: name, engines.vscode, contributes.commands), `src/extension.ts` (activate/deactivate + `deckent.startSprint`/`deckent.showDashboard` komut kayıt iskeleti, gerçek impl Sprint 213-214). Minimal, derlenir, test edilir. YENİ runtime dep YASAK (vscode types devDep olur — package.json'da, kök package.json'a dokunma).
**Kanıt:** `ls extensions/vscode/package.json extensions/vscode/src/extension.ts`; `grep -c "activate\|contributes\|deckent\." extensions/vscode/package.json extensions/vscode/src/extension.ts` → ≥2; `npx vitest run tests/extensions/vscode-activation.test.ts` → 4+ pass
**Test:** ≥4 (activate çağrılır, komut kaydı, manifest geçerli, deactivate)

## Task 14: 212-014 — VS Code command palette + status bar stub
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: extensions/vscode/src/commands.ts, tests/extensions/vscode-commands.test.ts
- Scope: extensions/, tests/extensions/
- Dependencies: 212-013

### Description
**Problem:** Extension scaffold var ama komut handler'ları + status bar yok.
**Çözüm:** `commands.ts` — `deckent.startSprint` (terminal'de `deckent start` çağırma iskeleti), `deckent.showDashboard` (dashboard URL aç), status bar item (sprint progress placeholder). Gerçek MCP bağlantısı Sprint 213-214; bu stub + test.
**Kanıt:** `grep -c "registerCommand\|StatusBar\|startSprint\|showDashboard" extensions/vscode/src/commands.ts` → ≥2; `npx vitest run tests/extensions/vscode-commands.test.ts` → 4+ pass
**Test:** ≥4 (startSprint handler, showDashboard handler, status bar create, bilinmeyen komut)

## Task 15: 212-015 — ADR-075 (F5 runtime wiring + routing skill→agent + doc-generator) + MASTER-PLAN status
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/075-evolution-runtime-wiring.md, docs/MASTER-PLAN.md, tests/docs/adr-075.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 212-001, 212-008, 212-010

### Description
**Problem:** F5 evrim runtime wiring + routing skill→agent sinyali + doc-generator code-derived kararları ADR/MASTER-PLAN'e geçmemiş.
**Çözüm:** ADR-075 (F5 evolutionary modules runtime caller wiring + routing skill→agent affinity + managed-docs code-derived counts, MADR v3, accepted). MASTER-PLAN §4 F5 + §3 + §7 W-E status güncelle (212 sonuçlarına göre: dormant→canlı). MASTER-PLAN status güncellemesi DOC-POLICY Tier-1 kuralına uygun (tek roadmap).
**Kanıt:** `grep -c "evolution\|runtime\|caller\|routing\|affinity" docs/adr/075-evolution-runtime-wiring.md` → ≥2; `grep -c "F5-004\|212" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-075.test.ts` → 3+ pass
**Test:** ≥3 (ADR-075 MADR bölümleri, MASTER-PLAN F5 güncel, accepted status)

---

## Sprint Sonu Notu

**Beklenen:** 13-15/15 DONE, 0 false-FIX. F5 evrimsel mimari CANLI (6 modül gerçek external caller — dormant→canlı, wire-gap kapandı), evrim GÖRÜNÜR (retro behavior-changes), routing çeşitlilik fix (skill→agent), doc-reality sync (code-derived sayılar), IDE extension scaffold (Sprint 213-214 tohumu). tam-suite 0 fail KORUNUR.

**Sprint sonrası:** Sprint 213-214 IDE extension tam impl (MASTER-PLAN §10). Routing çeşitlilik canlı dağılımda doğrulanır. F5 evrim runtime'da görünür kazanım.

**Pre-flight:** subscription env temiz, creds canlı, **build+restart + RE-PLAN YAPILDI** (routing canlı), config max_workers=10. Sprint start Alperen manuel.

İlgili memory:
- [[feedback_directive_kanit_letter_vs_goal]] — 🔑 wire-gap dersi: scope çağıran modülü içerir, kanıt def-dosyasını dışlar
- [[feedback_agent_routing_imbalance]] — routing skew fix, çeşitlilik korunmalı, Sprint 205 fix geri alma
- [[feedback_brain_rubric_bridge_broken]] — Brain sağlam, yeni test şart
- [[feedback_fix_prompt_quality]] — FIX prompt + CLI index.ts wire
- [[feedback_scale_up_autonomous]] — büyük ölçek + otonom mod
- [[feedback_trust_brain_eval_not_worker]] — disk-verify ground truth
- [[feedback_zero_hardcode_live_data]] — code-derived sayılar, hardcode yok
- [[feedback_build_mcp_restart_coordination]] — build Alperen + RE-PLAN şart
- [[project_deckent_god_level_vision]] — evrimsel mimari ana farklılaştırıcı
- [[project_api_mode_deferred_post_beta]] — API mode yasak (subscription)
