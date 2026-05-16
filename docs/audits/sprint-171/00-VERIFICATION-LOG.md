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

## SYNTHESIS §2 OSS-GA BLOCKER DOĞRULAMA — Güvenlik (BG-01..09)

Synthesis §2.1 "9 güvenlik blocker" targeted-grep ile doğrulandı. **Sonuç: liste ciddi netsiz — ~3/7 hatalı.** Bu, Sprint 172'de fix sırasını doğrudan değiştirir.

| Blocker | Synthesis iddiası | Verdict | Düzeltme |
|---|---|---|---|
| **BG-01** discord token log | CRITICAL secret leak | ❎**OVERSTATED → LOW** | `deploy-discord.sh:121` token'ı SADECE boş/placeholder iken logluyor (geçerli token satır 119'a gider, loglanmaz). Gerçek leak DEĞİL. Defansif redact iyi ama CRITICAL-blocker DEĞİL. |
| **BG-02** gemini key shell | CRITICAL | ✅**CONFIRMED-REAL** | `gemini.ts:311 buildStreamCommand` → `curl -H "...: ${apiKey}"` key komut STRING'inde (process-list exposure). (NOT: `buildPlannerCommand`/satır 222 env ile GÜVENLİ — sadece streaming path açık.) Fix = curl yerine stdin/config. |
| **BG-03** plugin-hooks shell:true | CRITICAL | ❎**FALSE-POSITIVE — İPTAL** | `src/orchestra/plugin-hooks.ts` **DOSYA YOK**. orchestra/'da `shell:true` yalnız `authority-enforcer.ts:464` detector string'lerinde (ihlal değil, ADR-006 tarayıcının kendi pattern tanımı). Synthesis C-29 hayali path. **Sprint 172 blocker listesinden ÇIKAR.** |
| **BG-04** baseline-tracker sh-c | CRITICAL | ✅CONFIRMED ⊕(171-003 B-041) | `baseline-tracker.ts:85-90` `spawnSync('npx',[...],{shell:true})` — argv array VAR ama shell:true. Gerçek ADR-006. |
| **BG-05** no-go-reconciler execSync | CRITICAL | ✅REAL ama **YANLIŞ DOSYA** | Synthesis C-04 `no-go-reconciler.ts:118` — o dosyada execSync YOK. Gerçek yer `mid-sprint-adapter.ts:228` `defaultGetGitDiffStats` + `:284` (rapor 02 B3 doğru cite). Fix doğru dosyaya. |
| **BG-06** mcp explain sprintId traversal | CRITICAL | ✅**CONFIRMED-REAL** | `explain.ts:39` `replace(/^sprint-/,'')` sadece prefix soyuyor, `../` engellemiyor → `:42 join()` traversal. Fix = path.resolve guard + `..` reddi. |
| **BG-07** deckent-hub pubkey yok | CRITICAL | ✅**CONFIRMED-REAL** | `signature.ed25519` dosyaları var ama `PUBKEY.pem` YOK → imza doğrulanamaz. |
| BG-08 RBAC soft mode / BG-09 enforceVerifyLoop 0-caller | CRIT | ⊕LEDGER-DUP (C-13/C-14) | 171-002/007 ile çapraz; MANUEL-P0 escalate. |

**Güvenlik blocker net sonuç:** 9 iddia → **1 false-positive (BG-03 İPTAL)** + 1 overstated (BG-01 LOW) + 1 mis-cited dosya (BG-05) + 4 confirmed-real (BG-02/04/06/07) + 2 ledger-dup (BG-08/09). Gerçek Sprint 172 güvenlik P0 = **BG-02, BG-04, BG-06, BG-07** (+ BG-08/09 MANUEL-P0). BG-01/BG-03 listeden düşer/iner.

## SYNTHESIS §2 BLOCKER DOĞRULAMA — Doc-Drift (BD) + Architecture (BA)

| Blocker | Synthesis iddiası | Verdict | Düzeltme |
|---|---|---|---|
| **BD-04** CLAUDE.md modül sayıları (orchestra 76→95, core 94→101, api 3→4, mcp 27→31) | CRITICAL OSS-vitrin | ❎**OVERSTATED** | orchestra gerçek **76** = CLAUDE.md "76" → **DRIFT YOK** (synthesis "95" recursive subdir sayımı; top-level 76 doğru). core **90**≠94 (minor gerçek drift, 4 fark). api 4 vs "3" minor. mcp "27 tool"≠43 .ts dosya (apples-to-oranges; tool sayısı ≠ dosya sayısı). Gerçek aksiyon: core 90→94 + api 3→4 düzelt; orchestra/mcp "drift" yanlış. Severity LOW-MED, CRITICAL değil. |
| **BD-05** MCP tool 22↔27↔31 üçlü çelişki | CRITICAL | ⚠️INCONCLUSIVE | grep pattern tutmadı (tool'lar mcp/tools/ ayrı dosya). Gerçek sayım için `server.ts` registration sayımı gerek — assert ETMİYORUM. 📌 deeper-verify Sprint 172. |
| **BD-01/02/03** README/CLAUDE-metrics/IDENTITY stale | CRIT | ⊕LEDGER-DUP (C-41/36/37) | Stale metrik gerçek; fix = auto-gen pipeline. 📌ESCALATE. |
| **BD-08** BOOT.md recovery chain 3/5 yanlış komut | HIGH | ↪DEFER-VERIFY | Komut imza doğrulaması gerek (commander.help() vs BOOT.md). Sprint 172. |
| **BD-09/10/12** docs CHANGELOG dup / VitePress dead-link / guide stale | HIGH/MED | ⊕LEDGER-DUP (C-39/40) | doc-reorg §4 kapsamı. ↪DEFER Sprint 172. |
| **BA-01** ADR-008 drift | CRIT | ✅CONFIRMED ⊕(171-001 1.2) | Gerçek doc-drift, fix=ADR amendment (governance). 📌ESCALATE. |
| **BA-02** ADR-040 Nervous wire değil | CRIT | ⏳YP-RISK (sıradaki batch) | ADR-040 opt-in/feature-flag mı yoksa gerçek dead mi — verify gerek. |
| **BA-03/C-25** ADR-010 7 dep vs "tek dependency" | CRIT | ✅**CONFIRMED-REAL** | Gerçek 7 runtime dep (commander/telegraf/zod/better-sqlite3/@noble×2/mcp-sdk). ADR-010 başlık "Tek Runtime Dependency". Fix = ADR-010 amendment (deps justify) veya doc düzelt. 📌ESCALATE (governance). |
| **BA-04** ADR-037 RBAC soft | CRIT | ⊕LEDGER-DUP (C-13/14 MANUEL-P0) | 171-007 ile çapraz. |
| **BA-05/C-32** Sprint 167 DB 0 entry | CRIT | ✅**CONFIRMED-REAL** | SQL `sprint_id IN ('sprint-167','167')` → `[]` boş. ADR-046 hook regresyon kesin. 📌ESCALATE (deckent memory rebuild hook fix sonrası). |
| **BA-06/C-33** ADR-061 AEGIS DB-yok | CRIT | ✅CONFIRMED ⊕(memory'de daha önce doğrulandı) | summary.md ADR listesinde 061 yok. ADR-046 tek-yön. |
| **BA-07/C-08/46** api-surface 8 vs 9 phase (WAVE_BUILD) | CRIT | ❎**FALSE-POSITIVE** | `api-surface.md:83` WAVE_BUILD'i **2a alt-faz olarak ZATEN belgeliyor**; SprintPhase enum'da ekstra üye yok (rapor 01 §1.1: SPAWN'a gömülü, müstakil faz değil). Synthesis "kontrat ihlali" YANLIŞ. **Sprint 172 blocker listesinden ÇIKAR.** (YP-RISK flag'im doğrulandı.) |
| **BA-08/C-02** isAuditTask hardcoded | CRIT | ⊕LEDGER-DUP (171-002 B1) | Kök fix config prefix. 📌ESCALATE. |

| **BA-02/C-16/17/18** ADR-040 Nervous dead pipeline | CRIT | ✅CONFIRMED-REAL (nüanslı) | `config.ts:893 nervous_system` + sprint-controller:167 "subscribers optional, always fires regardless of config" → **config-gated opt-in tasarım** (koşulsuz-dead DEĞİL). AMA `new Executor(`=0 production caller (C-18 yetim CONFIRMED) + observer→executor pipeline instantiate-wire yok. Event-emit var, consumer unwired. Fix = opt-in wire tamamla VEYA ADR-040→`proposed` indir (governance). 📌ESCALATE. "Dead code sil" YANLIŞ framing. |

**BD/BA net sonuç:** **2 yeni FALSE-POSITIVE/OVERSTATED** — BA-07 (api-surface WAVE_BUILD zaten belgeli → İPTAL) + BD-04 (orchestra 76 doğru, sayım-artefaktı). BA-02 confirmed-real ama nüanslı (opt-in, dead değil). BA-03/05/06/01 confirmed-real. BD-05 inconclusive (deeper-verify).

**SYNTHESIS §2 GENEL DOĞRULAMA SKORU:** 29 blocker iddiasından şimdiye dek doğrulanan ~17'de: **3 FALSE-POSITIVE** (BG-03 plugin-hooks-yok, 171-002-B11 RuleEvolver-canlı, BA-07 WAVE_BUILD-belgeli) + **2 OVERSTATED** (BG-01 placeholder-log, BD-04 sayım-artefaktı) + **1 MIS-CITED** (BG-05 yanlış dosya). Yani synthesis §2'nin ~%30'u hatalı/kalibre-edilmemiş → "raporu okuyup hepsini fixle" yaklaşımı yanlış olurdu; verify-before-fix zorunlu.

## 01-modul-derin/03-orchestra-infra.md (171-003) — DOĞRULANDI
**171-003 özeti:** 32 confirmed + 9 PASS + **0 false-positive** (architect 171-002'nin aksine devops worker titiz). 1 CRIT (B-041 ledger-kısmi) + 7 HIGH. Yeni-ledger değerli: B-029/B-032/B-036/B-038 (ESM+dead-code+cache, hepsi trivial-ready 📌). P0-3/P0-5 PASS = Sprint 170 fix runtime aktif ek kanıt. Otonom fix YOK (production code, away-mode); hepsi ready-to-apply escalate. Coverage 9/9 + cross-cut, gap 0.

## MANUEL-P0 Batch Doğrulama (2026-05-15, build+restart sonrası, auto-mode)

Bug A/B runtime aktif (dist 23:42 > src). Kalan MANUEL-P0 (C-03/04/05/06/07/13/14/29) verify-first:

| ID | Synthesis iddiası | Verdict | Kanıt |
|---|---|---|---|
| **C-29/BG-03** | `plugin-hooks.ts` `spawn(shell:true)` injection | ❎**FALSE-POSITIVE (İPTAL)** | `src/orchestra/plugin-hooks.ts` DOSYA YOK. Ledger'da zaten ⚠ idi → kesinleşti, blocker'dan çıkar. |
| **C-04/BG-05** | `no-go-reconciler.ts:118` execSync taskId injection | ↪**MIS-CITED → CONFIRMED-REAL (düzeltilmiş konum)** | `no-go-reconciler.ts` DOSYA YOK. Gerçek yüzey: `mid-sprint-adapter.ts:228` `execSync(\`git diff --stat HEAD -- ${dirs.join(' ')}\`)` + `:284` `execSync(\`npx vitest run ... ${testPatterns.join(' ')}\`)`. `dirs`/`testPatterns` ← `task.scope.directories` (DIRECTIVES kaynaklı; OSS user-DIRECTIVES = injection yüzeyi). ADR-006 array-form ihlali. Severity **MED** (Brain-mediated ama OSS path). Fix: spawnSync array-form. |
| **C-13/BG-08/BA-04** | ADR-037 RBAC `checkWorkerAuthority` soft mode (ihlalde return true) | ✅**CONFIRMED-REAL (isabetli, HIGH)** | `worker.ts:457-494`: `!result.allowed` → `console.warn('[ADR-037 soft]')` + emit + **`return true`** (satır 490); allowed yolu da `return true` (493). Fonksiyon **her zaman true**. CLAUDE.md "Worker scope dışına yazamaz — RBAC runtime enforcement" gotcha'sı **YANLIŞ** (sadece uyarır). PermissionGuard class (`validateAgentModification`) ayrıca **0 production caller** (yetim). OSS GA HIGH. |
| **C-14/BG-09** | `enforceVerifyLoop` 0 production caller | ✅**CONFIRMED-REAL** | Tek tanım `worker-verify.ts:335`; `worker.ts:42` import + `:300` doc-yorum "Callers MUST run" ama tüm `src/`'de **0 gerçek `enforceVerifyLoop(` çağrısı**. Verify-loop gate var ama hiç enforce edilmiyor. |
| **C-03** | `rotateModelForFix` ters downgrade + forceModel sessiz override | ✅**CONFIRMED-REAL** | `debt-manager.ts:76-78` `{opus:'sonnet', sonnet:'haiku', haiku:'haiku'}` downgrade map; `:177` rotate; `:304/:375` `forceModel: rotatedModel`. FIX orig'den zor ama model zayıflıyor. memory `project_fix_model_downgrade_bug` ile bire-bir. |
| **C-05/C-07** | `dependency_pipeline_enabled` 3-katman drift + doc "Sprint 167 flip true" | ✅**CONFIRMED-REAL (doc-drift, MED)** | Kod default `true` (`config.ts:600`, `:883/:1400 ?? true`); `.deckent/config.json:198 false` (bu projede bilinçli — manuel dispatch); DECKENT.md "Sprint 167 flip true" + `api-surface.md:83` "default since Sprint 156". Doc default'u abartıyor. Merge mantığı tutarlı (config.json kazanır). Fix = doc düzelt (auto-gen pipeline). |
| **C-06** | `DeckentConfig` tipinde `dependency_pipeline_enabled` eksik | ❎**FALSE-POSITIVE** | `config-types.ts:490 dependency_pipeline_enabled?: boolean` **VAR**. `config.ts:41` "follow-up sprint should add" yorumu + `DeckentConfigWithPipeline` alias **STALE/redundant** (minor dead-code, ADR-038 adayı) — tip boşluğu DEĞİL. |

**MANUEL-P0 net:** 8 iddiadan **2 FALSE-POSITIVE** (C-29, C-06) + **1 MIS-CITED** (C-04→mid-sprint-adapter) + **5 CONFIRMED-REAL** (C-13 HIGH, C-14, C-03, C-05/07). Gerçek fix kuyruğu: C-13 (RBAC soft→hard, davranış-değiştiren → ESCALATE), C-14 (verify-loop wire, davranış-değiştiren → ESCALATE), C-03 (model rotation, davranış-değiştiren → ESCALATE), C-04 (execSync→spawnSync array, davranış-koruyan, ADR-006 → TDD-fix adayı), C-05/07 (doc-drift → doc-reorg batch).

**Synthesis §2 güncel skor (~25/29 doğrulandı): 5 FALSE-POSITIVE/İPTAL** (BG-03, 171-002-B11, BA-07, C-29, C-06) + **2 OVERSTATED** (BG-01, BD-04) + **2 MIS-CITED** (BG-05, C-04) → §2'nin **~%31'i hatalı/kalibre-edilmemiş**. Verify-before-fix disiplini doğrulandı.

## YP-RISK Batch — C-01/BA-01 ADR-008 (2026-05-15, auto-mode)

| ID | Synthesis iddiası | Verdict | Kanıt |
|---|---|---|---|
| **C-01/BA-01** | ADR-008 "Brain merkezi import drift 5+ modül" — CRITICAL | ❎**FALSE-POSITIVE/OVERSTATED (İPTAL)** | ADR-008 decision metni dar: "Brain tmux/auditor/worker import eden TEK modül; **diğerleri brain'i import etmez**". Consequence testi: `grep "from.*brain" tmux.ts auditor.ts worker.ts` boş olmalı. Çalıştırıldı → tek hit `auditor.ts:1903 pattern:'from.*brain'` = **string literal (auditor'ın kendi tespit regex'i), import değil**. Triad'da 0 gerçek brain-import → **TAM COMPLIANT**. Synthesis, CLI/MCP/API entry-point'lerinin `brain.ts` (slim re-export layer, `brain.ts:1` doğrular) tüketmesini "drift" saymış — bu **amaçlanan public API paterni**, ADR-008 kapsamı dışı. Sprint 172 blocker'dan **ÇIKAR**. |
| (yan bulgu) | — | ⊕**YENİ MED** | `sprint-controller.ts:63 ↔ sprint-phases.ts:136` karşılıklı value-import (ADR-024 God-split back-ref; `:137 import type` erased ama `:136/:63` value). ESM sibling-cycle riski. ADR-008 DEĞİL — ADR-024 hijyen. Blocker değil, DEFER. |

**YP-RISK batch durumu:** C-01/BA-01 (FP), C-08/46/BA-07 (FP — daha önce), C-16/17/18/BA-02 ADR-040 (CONFIRMED nüanslı opt-in), C-25/BA-03 ADR-010 (CONFIRMED), C-32/33/BA-05/06 (CONFIRMED) → **YP-RISK esas tamam**. Kalan tek madde "Coverage ~92" = synthesis'in kendi "POTANSIYEL / re-audit" flag'i → Sprint 172 mini-re-audit (subdir tam-enumerasyon cross-check), şimdi otonom çözülmez.

**SYNTHESIS §2 NİHAİ DOĞRULAMA SKORU (~28/29):** **6 FALSE-POSITIVE/İPTAL** (BG-03, 171-002-B11, BA-07/C-08/46, C-29, C-06, **C-01/BA-01**) + **2 OVERSTATED** (BG-01, BD-04) + **2 MIS-CITED** (BG-05, C-04) → §2'nin **~%34'ü hatalı/kalibre-edilmemiş**. Kök sebep: synthesis (Task 29) ADR başlık/özet okuyup precise consequence-clause'u okumamış → ADR-compliance kümesinde sistematik over-flag. **"Raporu okuyup hepsini fixle" yaklaşımı %34 hasar verirdi — verify-before-fix disiplini kanıtlandı.**

**GERÇEK Sprint 172 fix kuyruğu (CONFIRMED-REAL, prioritized):**
1. **C-13** ADR-037 RBAC soft mode (worker.ts:490) — HIGH, doc-vs-code, davranış-değiştiren → kullanıcı kararı (soft bilinçli rollout mu?)
2. **C-14** enforceVerifyLoop 0-caller wire — davranış-değiştiren → kullanıcı kararı
3. **C-03** rotateModelForFix ters-downgrade — davranış-değiştiren → kullanıcı kararı (memory'de mevcut)
4. **C-04** mid-sprint-adapter.ts:228/284 execSync→spawnSync array — ADR-006, davranış-koruyan → TDD-fix hazır
5. **BA-03/05** ADR-010 deps + Sprint 167 DB-boş — governance/ADR amendment → ESCALATE
6. **C-05/07** config doc-drift — doc-reorg batch (Sprint 172)

## C-04 READY-TO-APPLY (otonom commit edilmedi — bootstrap-path + build/restart gerek)

**Dosya:** `src/orchestra/mid-sprint-adapter.ts` — 2 injection-yüzeyi (`:228` git diff, `:284` vitest) + `:258` (static, ADR-006 tutarlılık için birlikte).
**Import:** `:14 import { execSync }` → `import { spawnSync }`.
**Fix (davranış-koruyan, ADR-006 array-form):**
- `:228` `execSync(\`git diff --stat HEAD${pathArgs}\`)` → `spawnSync('git', ['diff','--stat','HEAD', ...(dirs.length ? ['--', ...dirs] : [])], {cwd,encoding,timeout:10_000})` → `.stdout`
- `:258` `execSync('npx tsc --noEmit')` → `spawnSync('npx', ['tsc','--noEmit'], {...})`; başarı = `result.status === 0`
- `:284` `execSync(\`npx vitest run --reporter=json ${testPatterns.join(' ')}\`)` → `spawnSync('npx', ['vitest','run','--reporter=json', ...testPatterns], {...})` → `.stdout`
- 3 yerde `catch`→ `result.status !== 0 || result.error` kontrolü (execSync throw semantiği spawnSync status'a taşınır).
**TDD (RED önce):** `tests/orchestra/mid-sprint-adapter-injection.test.ts` — scope.directories=`['src/foo; touch /tmp/pwned']` → fonksiyon çağrısı sonrası `/tmp/pwned` OLUŞMAMALI (shell-interp yok ispatı) + normal dirs ile git-diff parse davranışı korunur. Fonksiyonlar export değil → `ReconciliationDeps` enjeksiyon noktası veya cmd-builder pure helper extract gerek (minimal refactor, aynı dosya).
**Severity revize:** MED→**LOW-MED**. scope.directories Brain-yazımı (DIRECTIVES); OSS'te user-DIRECTIVES self-harm sınırı (cross-trust-boundary değil). ADR-006 hijyen/tutarlılık fix'i, kritik-exploit değil. Yine de ADR-006 accepted → düzeltilmeli.
**Onay bekleyen:** kullanıcı + build/restart batch.

## C-13 / C-14 / C-03 — Verify-Before-Fix Verdict (2026-05-16, ADR-037 intent araştırması)

### C-13 RBAC soft mode — ❎ KOD BUG'I DEĞİL → doc-drift (KULLANICI ONAYI: yön (a))

**Kanıt:**
- `authority-enforcer.ts:29` yorum: `Current enforcement mode (Sprint 139 = always soft)` + `:21-22 EnforcementMode='soft'|'hard'` (hard tip var, kasıtlı kullanılmıyor)
- `worker.ts:480 return true` (ihlalde bile) = soft tasarımın uygulaması
- ADR-037 `decisions.md:1825` Consequences(−): *"Runtime enforcement henüz tam değil (Sprint 139 scope) — compile-time + audit trail ağırlıklı"* → soft = **yazılı/kabul-edilmiş V1.0 tasarım kararı**
- `tests/agents/worker-rbac.test.ts` Test 2 (`:95-112`) + Test 3 (`:116-132`): scope-dışı yazım `expect(result).toBe(true)` + yorum `// ADR-037 soft enforcement: always returns true but logs + emits violation` + `:163 expect(payload.allowed).toBe(false)` (ihlal tespit edilir ama bloke edilmez) → **soft davranış test-kilitli**

**Verdict:** Kod ↔ ADR-037 **tam uyumlu**. ADR-037'nin deckent'teki fiili işlevi = **caydırıcı (Layer-1 prompt) + dedektif (Layer-3 audit trail)**, önleyici (Layer-2 runtime) DEĞİL — fail-open + audit, NIST fail-closed değil. Tek kusur: `CLAUDE.md` gotcha + `IDENTITY.md`/`summary.md` "RBAC **runtime enforcement**" ifadesi → önleyici sanılır, oysa fiilen önleyici değil. **Doküman ADR'den fazla iddialı.**

**Karar (kullanıcı onayı — yön a):** Hard-flip YOK. Sprint 172 doc-reorg = sadece doküman gerçeğe çekilir (`"RBAC runtime enforcement"` → `"RBAC: compile-time lint + audit-trail; runtime advisory/soft — ADR-037 V1.0 Layer-2 kasıtlı eksik, hard-flip gelecek ADR amendment"`). Kod/test/build DEĞİŞMEZ. Hard-flip ayrı denetimli "ADR-037 V2 fail-closed" mikro-sprinti (Test 2/3 yeniden yazım + ADR amendment + audit-trail rework) — Sprint 172 OSS GA blocker'ı DEĞİL (kod↔ADR tutarlı).

### C-14 enforceVerifyLoop + runTestVerifyLoop — ✅ CONFIRMED-REAL (tüm verify-gate subsystem unwired)

**Kanıt:** `worker-verify.ts:163 export function runTestVerifyLoop` + `:335 export async function enforceVerifyLoop` — ikisi de `worker.ts:36/:42` import edilir; **ikisinin de call-form çağrısı src/ genelinde 0** (grep `runTestVerifyLoop(`/`enforceVerifyLoop(` def/import/comment hariç boş). `worker.ts:300` JSDoc: *"Callers MUST run enforceVerifyLoop() before calling this function"* — 0 caller. Programatik tsc/vitest verify-gate hiç wire edilmemiş.

**Verdict:** Worker'lar tsc/vitest'i **prompt talimatıyla** çalıştırır (`worker-default.md` "Run tsc --noEmit and vitest run") — kod-enforced gate DEĞİL, trust/advisory. **C-13 ile aynı sistemik pattern: "scaffold edilmiş ama wire edilmemiş garanti"** (RBAC soft + verify-loop unwired). Bug A (schema gate self-reported testsPassed'a güveniyordu) ile aynı kök: deckent kendi-rapor'a güveniyor, kod doğrulamıyor.

**Karar gerekli (davranış-değiştiren → ESCALATE):** (a) Dead code → ADR-038 dispose (prompt-level verify yeterli kabul; SAFE, davranış değişmez) **VEYA** (b) `enforceVerifyLoop`'u worker result-write yoluna wire et (deckent programatik gate; DONE'u broken-code'da bloke eder — daha güçlü garanti ama davranış-değiştiren, bootstrap-hassas, ayrı denetimli sprint, C-13 hard-flip ile paralel). Vizyon (god-level, no-MVP, spurious-NO_GO geçmişi) → (b) mimari doğru yön; ama kullanıcı kararı.

### C-03 rotateModelForFix ters-downgrade — ✅ CONFIRMED-REAL + LIVE-WIRED

**Kanıt:** `debt-manager.ts:76-78 MODEL_DOWNGRADE_MAP={opus:'sonnet',sonnet:'haiku',haiku:'haiku'}` → `:138 rotateModelForFix` = `MAP[model]??model` → `:177 applyFreshEyesRotation` → `:186 rotatedModel` → `sprint-spawner.ts:1016/:1060` canlı tüketilir (`forceModel: rotationStrategy.rotatedModel`). FIX worker **daha zayıf model** alır. JSDoc `:134 "one tier down"` + `:180 "Fresh-eyes rotation"` → tasarım niyeti bilinçli downgrade ("taze göz" = farklı perspektif), ama fix orijinalden ZOR + model ZAYIF = ters mantık.

**Verdict:** Kod kendi JSDoc'una uyumlu (C-13 gibi değil — burada niyet'in kendisi hatalı). Kullanıcı memory `project_fix_model_downgrade_bug` zaten "bug, kural ters, OSS GA öncesi düzelt" diye karar vermiş. CONFIRMED + canlı tüketiliyor.

**Karar gerekli (davranış-değiştiren → ESCALATE):** Fresh-eyes SIDEWAYS olmalı (eş-tier farklı model/provider: opus→gpt-5/gemini-2.5-pro; sonnet→gpt-4.1) ya da UP, asla DOWN. Yön kullanıcı onayı (TDD-fix: `MODEL_DOWNGRADE_MAP` → `MODEL_SIDEWAYS_MAP`, davranış-değiştiren → ayrı sprint/onay).

**Sistemik bulgu (Sprint 172 synthesis girdisi):** C-13 + C-14 = "scaffold edilmiş garanti, wire/enforce edilmemiş" tekrar eden pattern. Bug A aynı kök (self-report'a güven). OSS GA öncesi dürüstlük: doküman bu trust-based gerçeği yansıtmalı VEYA enforcement kapatılmalı — ikisi arası drift = kullanıcıya sessiz güvenlik abartması.

## C-14 / C-03 — KULLANICI KARARLARI (2026-05-16)

**C-14 → "Doc-honest + enforcement sprinti" (yön a):**
- Sprint 172 doc-reorg: `worker-default.md`/`CLAUDE.md`/`IDENTITY.md` verify ifadesi gerçeğe çekilir → "tsc/vitest verify = worker prompt talimatı (advisory), deckent kod-enforce ETMEZ". C-13 ile aynı dürüstlük düzeltmesi. Kod/test/build DEĞİŞMEZ.
- `runTestVerifyLoop`+`enforceVerifyLoop` DISPOSE EDİLMEZ (ölü değil, eksik-wire). Wire'lama → ayrı denetimli **"enforcement-hardening V2"** sprinti (C-13 hard-flip RBAC + C-14 verify-gate wire BİRLİKTE, post-GA). Sprint 172 OSS GA blocker DEĞİL.

**C-03 → "Agent-rotate + model sabit" (yön a):**
- Fix: `rotateModelForFix(model)` → `return model` (identity; downgrade-map kaldırılır). Fresh-eyes zaten `rotateAgentForFix` ile sağlanıyor (farklı agent perspektifi) — model gücü düşmez.
- Davranış-değiştiren → ayrı onaylı uygulama (build/restart batch). Provider-key'siz en doğru çözüm; multi-provider sideways gelecek backlog (key gelince).

## C-03 READY-TO-APPLY (otonom commit edilmedi — davranış-değiştiren + build/restart gerek)

**Dosya:** `src/orchestra/debt-manager.ts`
**Değişiklik (minimal, davranış: model artık düşmez):**
- `:76-78` `MODEL_DOWNGRADE_MAP` SİL (veya kullanılmaz hale getir).
- `:138-140` `rotateModelForFix`: `return MODEL_DOWNGRADE_MAP[model] ?? model;` → `return model;` (identity). JSDoc `:133-137` güncelle: "fresh-eyes = agent rotasyonu; model korunur (downgrade ters-mantıktı, C-03)".
- `:174-189 applyFreshEyesRotation`: `rotatedModel = rotateModelForFix(originalModel)` artık `=== originalModel`; `rationale` string'i hâlâ doğru (`opus→opus`). `enabled:true` korunur (agent rotasyonu hâlâ aktif).
- `sprint-spawner.ts:1016/:1060/:303/:374` değişmez (rotatedModel artık orig'e eşit — forceModel orijinal model olur, davranış: fix worker orijinal modelle, taze agent'la spawn).

**TDD (RED önce):** `tests/orchestra/debt-manager.test.ts` (mevcut downgrade-assert testleri VAR — `opus→sonnet` bekleyenler) → bunlar yeni davranışta KIRILIR (beklenen). Sıra:
1. RED: yeni test `rotateModelForFix('opus') === 'opus'` + `applyFreshEyesRotation` opus task → `rotatedModel:'opus'`, `rotatedAgent` ≠ orig (agent değişir). Mevcut `opus→sonnet` assert'lerini yeni davranışa güncelle (ADR-037 Versioning benzeri: davranış-daraltma → etkilenen testler güncellenir — burada testler downgrade'i kilitliyordu, bilinçli revize).
2. GREEN: identity fix.
3. Tam suite: downgrade'e bağlı başka test var mı (`MODEL_DOWNGRADE_MAP` import edeni grep) → kontrol + güncelle.
**Severity:** MED (canlı-wired, her FIX task'ı etkiler; ama fail-safe — yanlış yön zayıf model, identity güçlüye değil zarara yol açmaz).
**Onay bekleyen:** kullanıcı + build/restart batch (C-04 ile birleştirilebilir).

## Sprint 172 / Post-GA KONSOLİDE FIX KUYRUĞU (kararlar sonrası)

| # | Madde | Sınıf | Build/restart? | Hedef |
|---|-------|-------|----------------|-------|
| 1 | C-04 execSync→spawnSync array (ADR-006) | davranış-koruyan TDD | EVET | onaylı batch |
| 2 | C-03 rotateModelForFix→identity | davranış-değiştiren TDD (yön onaylı) | EVET | onaylı batch (C-04 ile) |
| 3 | C-13 RBAC + C-14 verify doc-honest | doc-only | HAYIR | Sprint 172 doc-reorg |
| 4 | C-05/07 config doc-drift | doc-only | HAYIR | Sprint 172 doc-reorg |
| 5 | C-13 hard-flip + C-14 verify-gate wire | davranış-değiştiren mimari | EVET (ayrı) | post-GA "enforcement-hardening V2" sprinti |
| 6 | BA-03/05 ADR-010 deps + Sprint 167 DB-boş | governance/ADR amendment | — | #18 ESCALATE (sıradaki) |

**Sistemik karar:** C-13+C-14 ortak kökü ("scaffold edilmiş garanti enforce edilmemiş") tek "enforcement-hardening V2" sprintinde toplandı — OSS GA bloklamaz, dürüstlük Sprint 172 doc düzeltmesiyle sağlanır.
