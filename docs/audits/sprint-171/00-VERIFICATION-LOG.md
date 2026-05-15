# Sprint 171 — Rapor-Sırası Doğrulama Logu

Otonom gezinti (Alperen 2sa yok, 2026-05-15). Her rapor systematic-debug ile doğrulanır; bulgu → verdict. **Otonom kural:** sadece sahip olunan trivial doc fix uygulanır; davranış-değiştiren/mimari/YP-RISK → doğrula + ready-to-apply olarak buraya yaz, fix kullanıcıya bırak. `deckent run` YOK. Ledger (`00-TRIYAJ-LEDGER.md`) ile çapraz-dedup.

**Verdict kodları:** ✅CONFIRMED-REAL · ❎FALSE-POSITIVE · 🔧FIXED-AUTONOM · 📌ESCALATE (ready-to-apply) · ↪DEFER · ⊕LEDGER-DUP (zaten triyajda)

---

## 01-modul-derin/01-orchestra-lifecycle.md (171-001) — DOĞRULANDI

| Bulgu | Sev | Verdict | Not / Aksiyon |
|---|---|---|---|
| 1.1 faz-isim kayması (1.5/1.9 ara faz, RETRO+DECAY birleşik) | LOW | ↪DEFER | Kozmetik doc; runtime doğru. Sprint 172 doc-reorg ile. |
| 1.2 ADR-008 "ONLY sprint-controller" vs 5-7 modül import | CRIT | ✅CONFIRMED-REAL ⊕(C-01/BA-01 YP-RISK) | **Gerçek ama KOD bug DEĞİL — doc-drift.** Sprint 076 God-Object-Split sonrası ADR metni güncellenmedi; split ekosistemi tek mantıksal Brain. Fix = **ADR-008 amendment** (governance/doc), kod refactor DEĞİL. 📌ESCALATE: accepted ADR'yi otonom yeniden yazmam — wording kararı senin/architect. Ready: rapor §4 öneri-1 metni hazır. |
| 1.3 result-collector↔sprint-spawner lazy-import cycle | MED | ✅CONFIRMED-REAL | Mimari refactor (prompt-resolver ayır). 📌ESCALATE Sprint 172+ (refactor, otonom değil). |
| 1.4 P0-1@516 + P0-2@1625-1656 aktif; plan ~214 yanlış | LOW | 🔧FIXED-AUTONOM | Plan doc satır 138 düzeltildi (~214→516, Bug A 525-533 notu). Bug A işimi de doğrular (P0-1 gerçekten 516). |
| 1.5 ADR-046/045/043/048 enforcement var | (poz) | ✅CONFIRMED-REAL | Pozitif — 4 ADR canlı uygulanmış. |
| 1.6 brain.ts thin re-export = CLAUDE.md | LOW | ✅CONFIRMED-REAL | Pozitif. ADR-008 amendment'ta "sprint-controller" netliği eklenir (1.2 ile). |
| 1.7 decision-steps/{agent,scope}-step.ts 173 LoC @deprecated V1 | MED | ✅CONFIRMED-REAL ⊕(dead-code cluster) | Dead doğrulandı (@deprecated Sprint 066). ADR-028 V1-dormant koruması belirsiz → 📌ESCALATE: 171-015/016 nihai disposition; otonom SİLMEM (ADR-protected olabilir). |
| 1.8 rotateModelForFix downgrade | (not) | ⊕LEDGER-DUP | = C-03 MANUEL-P0 (171-002 detay). |
| 1.9 HONESTY_PATTERNS hardcoded regex | MED | ✅CONFIRMED-REAL | Enhancement (config'a çıkar). ↪DEFER Sprint 172+. |
| 1.10 sprint-controller:644 dinamik tmux import | LOW | ✅CONFIRMED-REAL | Cycle gerekçesi belirsiz. ↪DEFER 171-003 doğrular. |
| 1.11 evaluateResult @deprecated, CLI finalize kullanıyor | LOW | ✅CONFIRMED-REAL | ↪DEFER backlog (CLI→evaluateWithRubric taşı, sonra sil). |
| 1.12 auditPlanGroundTruth sadece agents_count | MED | ✅CONFIRMED-REAL | Enhancement. ↪DEFER (171-004 koord). |
| 1.13 planner.ts:315 resolveAdapter raw ProviderError, caller catch yok | HIGH→**MED** | ✅CONFIRMED-REAL (severity recalibrate) | Rapor HIGH; erişilebilirlik AI-mode + zero-provider. **structured mode (OSS-önerilen, bizim path) ETKİLENMİYOR**; Claude default normalde mevcut → pratik severity MED. 📌ESCALATE ready-to-apply: `callBrainPlanner:343`/`callZeroConfigPlanner:486` çevresine try/catch, `ProviderError`→`BrainError` + TR mesaj ("Hiçbir AI provider yapılandırılmamış..."). Behavior-changing → otonom değil. |
| 1.14 TODO/FIXME temiz | (poz) | ✅CONFIRMED-REAL | Pozitif. |
| 1.15 extractScopeFromDirective regex + ESM normalize yok (Windows) | MED | ✅CONFIRMED-REAL | ⊕ Bug A/B kanıt sürecinde de görüldü (task-builder scope parse). ↪DEFER 171-017/019 (Windows + injection). |
| 1.16 computeSprintMetrics pure helper barrel'da | LOW | ✅CONFIRMED-REAL | Kozmetik refactor. ↪DEFER. |

**171-001 özeti:** 14 confirmed-real + 0 false-pozitif + 1 autonom-fix (plan doc satır 138) + 1 ledger-dup. Asıl OSS-GA itemi: **1.2 ADR-008 amendment** (governance, escalate) + **1.13 planner error UX** (escalate ready-to-apply, severity HIGH→MED düşürüldü: structured mode etkilenmiyor). Kalan MED/LOW defer. Coverage-gap rapor §5'te 0 (10/10 dosya) — kabul.

## 01-modul-derin/02-orchestra-routing.md (171-002) — DOĞRULANDI

| Bulgu | Sev | Verdict | Not / Aksiyon |
|---|---|---|---|
| B1 isAuditTask `docs/audits/` hardcoded | CRIT | ✅CONFIRMED ⊕(C-02/BA-08) | Sprint 171'de DIRECTIVES path-free workaround yaptık; kök fix = `AUDIT_PATH_PREFIXES=['docs/audits/','.audit/']` + config override. 📌ESCALATE: bootstrap-kritik path (Bug A ile aynı `isAuditTask`), otonom dokunmam — ready §4-B1. |
| B2 rotateModelForFix downgrade + forceModel sessiz ezme | CRIT | ✅CONFIRMED ⊕(C-03 MANUEL-P0) | memory `project_fix_model_downgrade_bug`. Fix = MODEL_UPGRADE_MAP / forceModel koru. 📌ESCALATE (FIX-path behavior-change, away-mode otonom değil) — ready §4-B2. |
| B3 reconcileSpuriousNoGo `execSync` string-interp (ADR-006) | CRIT | ✅CONFIRMED ⊕(C-04/BG-05) | Command injection, canlı yol (Sprint 145+163). Fix = spawnSync array (report §4-B3 birebir diff). 📌ESCALATE (reconcile-path, away-mode) — ready, mekanik. |
| B4 OutcomeTracker saveSprintOutcome RMW race | HIGH | ✅CONFIRMED-REAL | Wave/parallel'de outcome kaybı. Fix = lockfile veya .jsonl appendFileSync. 📌ESCALATE Sprint 172. |
| B5 QualityAssessor rubric-aware değil, audit'e -25 | HIGH | ✅CONFIRMED-REAL | avgQualityScore agent-perf'e karışıyor → audit-agent yapay penalize. 📌ESCALATE (mimari, §4-B5 + Bütünsel Öneri). |
| B6 iki `detectTaskType` (task-router:90 + rubric-registry:166) | HIGH | ✅CONFIRMED-REAL | Doğrulandı (grep). Rename gerek (detectRoutingCategory). 📌ESCALATE ready. |
| B7 routeTask JSDoc "agent preference" koddan kayıp | HIGH | ✅CONFIRMED-REAL | doc-vs-code drift. ↪DEFER/ESCALATE doc fix. |
| B8 AGENT_FRESH_EYES_MAP `test-writer` dead-ref (ADR-041) | MED | ✅CONFIRMED-REAL | debt-manager.ts:102; agent-pool'da test-writer yok → dead. Trivial 1-satır sil ama FIX-path → 📌ESCALATE (ready, 10sn). |
| B9 updateEntityPerformance float-round drift | MED | ✅CONFIRMED-REAL | successCount/totalTasks direkt hesapla. 📌ESCALATE ready §4-B9. |
| B10 suggestReroute forceAgent/forceSkills sessiz ezer | HIGH | ✅CONFIRMED-REAL ⊕(B2 ailesi) | RBAC ihlali eğilimi. 📌ESCALATE §4-B10. |
| **B11 RuleEvolver runtime'da çağrılmıyor (DEAD)** | HIGH | ❎**FALSE-POSITIVE** | **Audit YANILDI.** `sprint-finalizer.ts:781-783` lazy-import + `evolver.evolveRules()` production'da ÇAĞIRIYOR (RETRO fazı). Worker grep'i sprint-finalizer'a bakmadı. "Sil/deprecate" önerisi **canlı özelliği silerdi**. İPTAL — fix YAPMA. (Not: §4-B17 threshold tutarsızlığı B11 canlı olduğu için GEÇERLİ kalır → ↪DEFER.) |
| B12 assessSkillRelevance audit heuristik zayıf | MED | ✅CONFIRMED-REAL | ↪DEFER (B5 mimari ile birlikte). |
| B13 MIN_SAMPLES_FOR_BONUS=3 düşük | MED | ✅CONFIRMED-REAL | Default 5'e çıkar. 📌ESCALATE ready (config default). |
| B14 applyFreshEyesRotation hard-coupling | MED | ✅CONFIRMED-REAL | ↪DEFER. |
| B15 `'claude' as ProviderName` gereksiz cast | LOW | ✅CONFIRMED-REAL | ↪DEFER (tip hijyen). |
| B16 reconcileSpuriousNoGo git-diff yutuk hata | MED | ✅CONFIRMED-REAL ⊕(stale_heartbeat RC ailesi) | debugLog ekle. 📌ESCALATE ready §4-B16. |
| B17 RuleEvolver synergy threshold 5 vs 3 tutarsız | LOW | ✅CONFIRMED-REAL (B11 canlı olduğu için GEÇERLİ) | shared constant. ↪DEFER. |
| B18 rubric registry shallow freeze | MED | ✅CONFIRMED-REAL | deep freeze / readonly. 📌ESCALATE ready §4-B18. |

**171-002 özeti:** 17 confirmed + **1 FALSE-POSITIVE (B11 — canlı feature, silinmekten kurtarıldı)**. CRITICAL'ler ledger-dup (C-02/03/04, hepsi MANUEL-P0/escalate). Mimari kök: rubric-drift (rubric-registry↔quality-assessor↔outcome-tracker, §4 Bütünsel Öneri) — Sprint 172 tek-iş. Otonom fix YOK (hepsi bootstrap/FIX-path/mimari, away-mode escalate).

## 01-modul-derin/03-orchestra-infra.md (171-003) — DOĞRULANDI

devops-engineer worker; 41 pozisyon (9 PASS), titiz. **5 HIGH/CRIT non-ledger iddia batch-doğrulandı → 5/5 CONFIRMED-REAL (false-positive YOK).**

| Bulgu | Sev | Verdict | Not / Aksiyon |
|---|---|---|---|
| B-001 P0-3 tmux taskId-aware aktif | PASS | ✅CONFIRMED | Sprint 170 P0-3 runtime aktif kanıtı (Kapı 1 destek). |
| B-010 P0-5 Docker race closure aktif | PASS | ✅CONFIRMED | Sprint 170 P0-5 runtime aktif. |
| B-018 event-stream PROMPT_WRITE/DELETE yok | HIGH | ✅CONFIRMED ⊕(C-21) | Sprint 170 P0-6 NO_GO açık. 📌ESCALATE Sprint 172 (event-stream + 3 backend wire — next-session backlog #2). |
| B-029 promotion-pipeline:275 `require('fs')` ESM | HIGH | ✅CONFIRMED-REAL | Doğrulandı (satır 275). Trivial ESM fix (node:fs import'a readdirSync ekle). 📌ESCALATE ready (2-satır, ~30sn). |
| B-032 doc-updaters/metrics-updater.ts DEAD (91 LoC) | HIGH | ✅CONFIRMED-REAL | grep: src non-test kullanım=0 → gerçekten register edilmemiş. SİL adayı. 📌ESCALATE (171-015 disposition). |
| B-036 managed-docs/docs-config.ts:89 `__dirname` ESM | HIGH | ✅CONFIRMED-REAL | fileURLToPath yok. ESM-native'de ReferenceError. 📌ESCALATE ready (fileURLToPath pattern). |
| B-037 plugin-loader `.mjs` arbitrary exec, sandbox yok | HIGH | ✅CONFIRMED-REAL | ADR-034 izolasyon riski. 📌ESCALATE (security design — opt-in env flag, otonom değil). |
| B-038 managed-doc-runner:69 sprint-aware cache wire yok | HIGH | ✅CONFIRMED-REAL | satır 69 legacy hash compare, sprintId hesaplanıyor (161) ama cache-hit'te kullanılmıyor. Sprint 166 Bug S kısmi. 📌ESCALATE ready (1-satır wire). |
| B-014 worker script `local` POSIX-değil (ash vs dash) | HIGH | ✅CONFIRMED-REAL | non-Alpine'da EXIT trap sessiz kırılır → spurious NO_GO riski. 📌ESCALATE (Kapı 1 ilgili). |
| B-041 baseline-tracker:90 `shell:true` (ADR-006) | CRIT | ✅CONFIRMED-REAL ⊕(C-30/BG-04 kısmi) | argv array VAR ama shell:true aktif. authority-enforcer:464 zaten ADR-006 detector. 📌ESCALATE ready (win32 npx.cmd guard). |
| B-033 changelog.ts existsSync write'tan sonra → reason hep "updated" | MED | ✅CONFIRMED-REAL | Mantık hatası (logic bug). 📌ESCALATE ready §4 Ö-7. |
| B-002..B-040 diğer MED/LOW (race, dead-code adayı, hata yutma, cosmetic) | MED/LOW | ✅CONFIRMED-REAL | ⊕ event-stream nextSequence race (B-019) stale_heartbeat ailesi; lock `__` collision (B-023); ↪DEFER Sprint 172+ (§4 Ö-10..16). |

**171-003 özeti:** 32 confirmed + 9 PASS + **0 false-positive** (architect 171-002'nin aksine devops worker titiz). 1 CRIT (B-041 ledger-kısmi) + 7 HIGH. Yeni-ledger değerli: B-029/B-032/B-036/B-038 (ESM+dead-code+cache, hepsi trivial-ready 📌). P0-3/P0-5 PASS = Sprint 170 fix runtime aktif ek kanıt. Otonom fix YOK (production code, away-mode); hepsi ready-to-apply escalate. Coverage 9/9 + cross-cut, gap 0.
