# APPENDIX — SIGNAL INVENTORY (kanıt-ajanı tam-çıktısı, 2026-07-14)
> Ana-rapor: `.analysis/routing-v3-system-debug-2026-07-14.md` §4.
> Dosya-kısaltmaları: IC=intent-classifier.ts · RE=routing-engine.ts · AE=activation-engine.ts · AP=agent-pool.ts · TR=task-router.ts · OT=outcome-tracker.ts · RT=routing-types.ts · CE=condition-evaluator.ts · TSG=temp-skill-generator.ts · SP=sprint-planner.ts · MSA=mid-sprint-adapter.ts · SF=sprint-finalizer.ts

## (a) routeTaskV2 EXACT ORDER (RE:855-1157)
1. cfg-merge (RE:867); flags: skillAgentAffinity/kindAffinity/languagePenalty/agentCache default-FALSE (872-875); **domainFromScope default TRUE (RE:882, R-1b)**.
2. classifyIntent → taskDNA (RE:887).
3. born-594 testDominant (RE:896).
4. OpenRouter doc-route flag-off; forceModel/provider ASLA-guard (RE:904-940).
5. unknown-intent SSOT fallback: task.type → taskKindToIntent, conf=0.5 (RE:945-952).
6. resolveOverrides — priority desc, ilk forceAgent/forceSkills kazanır, exclude'lar toplamsal (RE:955→1807).
7. calculateSkillBudget (RE:963→1766).
8. **Skill'ler agent'tan ÖNCE** (RE:966-1006); forceSkills-doğrulama + suggestNearestSkill (979-988).
9. Agent-seçimi (RE:1008-1138): forceAgent→score-100+semantic-warn (1013-1032); getDynamicExclusions (AE:326); agentCache (1045-1083); selectBestAgent (1086→1314); journal (1100); **fallback-zinciri null'da** (1124-1136).
10. assessContextFit (RE:1141→2016). Dönüş: RoutingDecision v2.

### selectBestAgent iç-sırası (RE:1314-1554), agent-başına:
- !enabled skip (1349).
- **HARD write-denied exclude: CONSTRUCTION_INTENTS(impl/bugfix/refactor/config/migration, RE:60) ∩ deniedTools 'Write' → continue, BONUS-ÖNCESİ, bypass-EDİLEMEZ (RE:1359-1365).**
- bypassBonus = surface + test + ciGuardian (1372-1379).
- override-exclude: bypassBonus>0 ise delinir (1385-1399).
- evaluateActivation (1436).
- suppressRefactorerTestCatchAll: refactorer+testDominant+impl → scoring-copy'de primary='unknown' + secondary'den impl silinir (1421-1441).
- activation-exclude: bypassBonus>0 ise delinir (1443-1457).
- finalScore = rule + learning + domain + surface + test + ciGuardian + role + kind + lang (1503).
- agentMinScore-5 eşiği (1524); sıralama desc; beraberlik = getLearningBonus (1542-1545).

## (b) INTENT ARİTMETİĞİ (IC:131-300)
- text = title + stripGoNogoSection(description), lowercase (IC:97; strip IC:74-86).
- **+2/keyword** containsWord (IC:143-147; word-match.ts:11-15 regex `(^|[^\p{L}\p{N}])term($|[^\p{L}\p{N}])`).
- SCOPE_INTENT_SIGNALS +1-4 (IC:152-164) · ROUTE-1-B1 comment-sweep→refactor+4 (171-177) · ROUTE-W1 refactor-to-spec→refactor+4/bugfix−4 (187-200).
- default-impl-boost +3: yalnız hasStrongNonImplSignal YOK (başka kova <3) + testWriteRatio<0.3 + writeRatio['src/'] varsa (209-222).
- **testWriteRatio≥0.5 → impl+2 (IC:225-232)** (test-sinyali impl'i besliyor!) · docRatio≥0.5 → doc+3 (235-248).
- boşsa: src varsa implementation@0.3, yoksa unknown@0 (253-259).
- **Güven** (264-272): 2. yoksa min(0.95, 0.5+top×0.05); varsa gap=top−second, conf=min(0.95, 0.3+gap/top×0.5+top×0.03). Kalibre DEĞİL.
- Yapısal-demotion: doc-top ama docWrites/writes<0.5 → implementation (282-290).
- **GENERIC-demotion: uzman-kova conf<0.5 → implementation** (295-298; GENERIC={implementation,refactor,unknown,bugfix}).
- Beraberlik: INTENT_KEYWORDS ekleme-sırası (stable-sort) — açık tie-break yok.

## (c) LEARNING/OUTCOME AKIŞI — SPRINT-ONLY CANLI
- Store: `.deckent/routing/learnings.json` (OT:111) · stats-sidecar `.deckent/stats/catalog-stats.json` (AP:413, V2-skorlamada KULLANILMIYOR — "pool stats always 0" RE:1541) · karar-jurnali `.deckent/routing/decisions/<sprint>.jsonl` (RE:766, audit-only).
- Yazma: sprint-finalizer recordOutcome per-task (SF:1475), sprint-başına idempotent (SF:1452).
- Okuma: OutcomeTracker.calculateBonuses (OT:433) → LearningBonus[]. Geçirenler: **SP:604/728 (planSprint) + MSA:231/237**. ÖLÜ: task-mode-runner:224, mcp/run:105, cli/run:323 → learningData=[] (tek-görev run'da öğrenme yok).
- **BUG: SP sampleDNA = classifyIntent(tasks[0]) → TÜM plana uygulanıyor (SP:603).**
- Bonus-matematiği (OT:603-628): MIN_SAMPLES 3; intent-delta ±0.15 → ±min(round(delta×10),3); genel SR≥0.9&≥5→+1, <0.5&≥5→−2; quality≥80→+1,<40→−1; recency yalnız-skill son-3-sprint +3/−2/+1/−1; cap ±3 (RT:211; RE:1906 yeniden-clamp).
- Evolved-rules ayrı-canlı-döngü (SP:634-703): auto-applied kurallar in-memory rules/exclude'a itiliyor; `when:{}` koşulsuz-kural guard'ı (SP:646). Üretici RuleEvolver (SF:1492).

## SİNYAL LİSTESİ (üret→tüket, ağırlık)
- intent.primary — IC:131 → aktivasyon-kuralları, INTENT_TO_AGENT_DOMAIN (RE:131), fallback (RE:64), CONSTRUCTION (RE:60), effort (RE:430-431).
- intent.confidence — IC:264 → reasoning + demotion-kapıları; SSOT-fallback 0.5.
- intent.secondary — IC:304-338 → **%50-krediyle** floor(rule.score×0.5) (AE:114-120).
- subIntent — IC:519-552 (yalnız impl'de, 6 sinyal) → skorlamada TÜKETİLMİYOR (bilgi-amaçlı).
- domains[] — IC:348-363 ilk-path-segmenti → domain-bonus path2 (RE:225), surface (RE:297), skill-map (RE:1996), alias (RE:613).
- operations[] — IC:385-411 → skill-budget single-op −1 (RE:1780).
- complexity — IC:415-443 → SKILL_BUDGET_BY_SIZE (RT:213); crossCutting+moduleCount≥3 → +1 skill.
- scope.writeRatio / testWriteRatio / primaryWriteTarget — IC:447-499 → impl-boost kapıları; TEST_DOMINANT 0.5 (RE:324); ciGuardian (RE:400).
- tags['test-coverage'] — IC:561-576 → testing-expert +2 (RE:1980); surface-sinyalleri (RE:282).
- domain-match DOMAIN_MATCH_BONUS=3 (RE:116) — path1 intent-sürümlü her-zaman; path2 buildTask+scopeDomain-kapılı (RE:205); tüketim RE:1466.
- USER_SURFACE_BONUS=8 (RE:244) — yalnız {api-builder, frontend-designer, ci-guardian}; api-builder security-sinyalinde 0 (RE:289); exclude-deler.
- TEST_OWNERSHIP_BONUS=8 (RE:350) — {ci-guardian, bug-fixer}; isTestDominant (ratio≥0.5 + TEST_NOUN + TEST_FIX_VERB, RE:338); exclude-deler.
- ciGuardian-test-domain +3 (RE:385) — impl-intent + ratio≥0.5; exclude-deler.
- skill→agent affinity +3 (AE:395/450, SKILL_AGENT_MAP-15) — **flag default-OFF** (RE:1406); 1×-cap.
- learning ±3 — RE:1906; tüketim RE:1460/1668; tie-break 1544.
- role-mismatch −3 (RE:1216-1229) — audit→reviewer/analyst istemi; exclusionary DEĞİL (domain+3'ü ancak nötrler); getAgentRole (AP:268, BUILTIN_AGENT_ROLES-15).
- kind-affinity (RE:1248) — yalnız-refactorer refactor+3 / code-dev−2; **flag default-OFF**.
- lang-penalty agent −1 (RE:1297, TR-karakter-oranı≥0.08) **flag-OFF** · skill −6 (RE:125/1643) canlı.
- write-denied exclude — RE:1359 HARD.
- dynamic-exclusions (AE:326) — intent-bazlı (doc→migration/devops/security-auditor-dışla; design→data/migration-dışla) + scope-bazlı (orchestra/cli/dashboard → frontend/a11y/data/migration-dışla).
- minScore — agent 5 / skill 3 (RT:178-208); **activation.minScore alanı doğrulanır ama UYGULANMAZ (AE:99)**.
- temp-agent — TSG:483-493 literal-6, intentHint çoğu 'implementation', LRU-50, 5-sprint-yaş (AP:281-305).
- BUILTIN_IMPLEMENTATION_INTENT_RULES — AP:139 artık yalnız {architect: impl@6} (444-F3 sonrası).
- force* — resolveOverrides (RE:1807); forceAgent 100 + semantic-warn (RE:1015/1172).
- agent-confidence eşikleri (RE:1852): tek-aday&≥5→high; ratio≥0.5&≥5→high; ≥0.3&≥3→medium; ≥0.1→low.
- fallback — AGENT_FALLBACK_CHAIN-12 (RE:64), score-50 conf-low; nihaî 'bug-fixer' (born-638 Write-uyumlu). Skill honest-empty [] (441'de floor söküldü); trivial-non-unknown'da candidates[0]-tabanı (RE:1732).
- skill stack-bonus — lang+3 framework+3 dep+1(1×) (RE:1627-1659); intent-priority +2/+3 (RE:1972/1924).

## CONDITION OPERATORS (CE:40-155)
$gt/$gte/$lt/$lte · $contains · $in · $not · $exists · bare=deep-eq · bilinmeyen-operatör=non-match · $and/$or/$not üst-seviye.

## ÖLÜ / DEPRECATED
- selectAgent (agent-selector.ts) + selectSkills (skill-selector.ts) — @deprecated, 0 üretim-çağrısı (born-699). resolveComposition CANLI (RE:1717).
- routeTask V1-dalı çökertildi (SP:585) · emitTimeoutEvents artık bağlı (TR:439) · ROUTE-1 B4 floor SÖKÜLDÜ (441) · options.effort ölü (RE:640) · OpenRouter doc-route flag-off · activation.minScore uygulanmıyor.

## KOD-İÇİ GÖRÜNÜR HATA-MODLARI
- substring→containsWord (word-match:5-9); 'wire'/'runtime' bugfix'ten düşürüldü (IC:13); 'broken'/'fix' bağlam-kapılı (IC:186).
- sıra-bağımlılık: impl-boost hasStrongNonImplSignal-kapısı; write-denied bonus-öncesi; domainFromScope default-flip.
- çifte-sayım-korumaları: domain 1× (RE:184); affinity 1× (AE:442); dep-match break (RE:1656); DOMAIN_ALIAS cli/terminal-ui + connectors/messaging dışlaması (RE:554-563).
- güven: uzman<0.5→impl-demotion sinyal-maskeliyor; SSOT-fallback 0.5-hardcode.
- learning: tasks[0]-DNA; run-yolları ölü; pool-stats 0.
- 'testing' emekli (S-148) → born-594/440-002/suppressRefactorerTestCatchAll yamaları; secondary %50-kredisi bastırılan catch-all'u kısmen geri-verebiliyor (bu yüzden secondary-strip RE:1432).

## TABLO-BOYUTLARI
INTENT_KEYWORDS 12 kova · OPERATION_KEYWORDS 7 · SCOPE_INTENT_SIGNALS 9 · SUB_INTENT_SIGNALS 6 · KEYWORD_TO_INTENT ~44 · SKILL_AGENT_MAP 15 · INTENT_TO_AGENT_DOMAIN 5 · TASK_DOMAIN_TO_AGENT_ID 14 · SURFACE_DOMAIN_TO_AGENT_ID 9 · SCOPE_DOMAIN_TO_AGENT_ID 4 · SCOPE_DOMAIN_PATTERNS 8 · DOMAIN_ALIAS_GROUPS 4 · INTENT_TO_SKILL_ID 8 · TASK_DOMAIN_TO_SKILL_ID 16 · AGENT_FALLBACK_CHAIN 12 · CONSTRUCTION_INTENTS 5 · USER_SURFACE_AGENTS 3 · TEST_OWNERSHIP_AGENTS 2 · BUILTIN_AGENT_DOMAINS 15 · BUILTIN_AGENT_ROLES 15 · TEMP_AGENT_DOMAINS 1 · AGENT_TEMPLATES 12 (hepsi intentHint='implementation', score-6).

## SAYISAL SABİTLER
agentMinScore 5 · skillMinScore 3 · maxSkills 3 · LEARNING_CAP ±3 · SKILL_BUDGET trivial0/small1/medium2/large3/epic3 · TOKEN_BUDGET 1500/4500, effort 1000/1500/2500 · bonuslar: domain/skill-domain/affinity/ciGuardian/kind = 3 · surface/test-ownership = 8 · kind-code-dev −2 · role −3 · agent-lang −1 · skill-lang −6 · CONTEXT tight 0.75 / overflow 0.90 · MIN_SAMPLES 3 · RECENT_WINDOW 3.
