# Sprint 171 → 172 Triyaj Ledger

**Amaç:** Fix öncesi sınıflandırma. Her madde: sınıf + doğrulama yöntemi + execution modu + durum. Fix kuyruğu severity değil **sınıf** sırasıyla: önce MANUEL-P0 (bootstrap tehlikesi), sonra YP-RISK doğrula, sonra DECKENT-RUNNABLE içerik sprint'i.

## Sınıf Tanımları

| Sınıf | Anlam | Execution |
|---|---|---|
| **MANUEL-P0** | deckent'in kendi evaluator/orchestration/spawn/schema yolunda. deckent ile fix → bozuk makineyi onarırken kullanmak (bootstrap tehlikesi). | Elle TDD red-green (Sprint 169 `5436497` modeli) |
| **DECKENT-RUNNABLE** | İçerik/doc/dead-code/a11y/frontend — evaluator yolunu etkilemez. İyi dogfood. | `deckent run` / `deckent sprint` |
| **YP-RISK** | Yanlış-pozitif riski yüksek. Fix'ten ÖNCE bağımsız doğrulama şart (yanlış-olmayan-bug'ı "fix"lemek = hasar). | systematic-debugging ile doğrula → sonra sınıf ata |
| **DEFER** | MEDIUM/LOW (137 bulgu) — synthesis §1.3/1.4: Sprint 172 sonrası iterasyon. | Post-GA |

---

## A. MANUEL-P0 (elle fix — bootstrap tehlikesi, ilk sırada)

| ID | Bulgu | Kanıt | Doğrulama |
|---|---|---|---|
| **BUG-A** ✅ FIX | Schema gate `testsPassed` spurious-NO_GO. P0-1 sadece `coverage` relax etti. **TEK katman** (görünen Layer-2 test artefaktıydı — reorg path; systematic-debug yanlış-fix'i önledi). Fix: `result-evaluator.ts:525-533` `testsPassed`'i `coverageOptional(task)` guard'ına aldı (test-yürütme-bağımlı alan grubu — P0-1 genelleştirmesi). TDD 5 yeni test, 196/196 regresyon GREEN. | `result-evaluator.ts:525-533`, `tests/orchestra/spurious-nogo-169-cascade.test.ts` | ✅ systematic-debug + TDD tamam — **dist rebuild + MCP restart gerek (runtime aktif olması için)** |
| **BUG-B** ✅ FIX | **İlk çerçeveleme systematic-debug ile DÜZELTİLDİ.** (a) "Re-eval yok" = YANLIŞ — `runFixPhase:1105-1115` re-eval ediyor, 171-014 retro=DONE reconcile KANITI. (b) "TERMINAL NO_GO=0 yanlış" = benim monitor artefaktım (silinen .result taradım); deckent retrosu DOĞRU (014=DONE, 023=NO_GO). RETRACTED. (c) **Gerçek RC:** FIX re-eval `writeEvaluationAudit`'e yazılmıyordu (sadece runEvaluatePhase:856) → forensic ledger FIX kararlarına kör → post-mortem "reconcile olmadı" yanlış sonucu (benim ilk hatam). 023 reconcile-yok = Bug-A-driven (fix result schema'ya tekrar çarptı; Bug A fix'i zinciri kırar). Fix: `recordFixEvaluationAudit` helper + runFixPhase wire (`<fixId>-attempt-1` + reconcile'da `<orig>-attempt-2`). TDD 3 test, 225/227 regresyon GREEN. | `sprint-phases.ts` recordFixEvaluationAudit + runFixPhase wire, `tests/orchestra/fix-eval-audit-trail.test.ts` | ✅ systematic-debug + TDD tamam — **dist rebuild + MCP restart gerek** |
| C-03 | `rotateModelForFix` ters downgrade + `forceModel` sessiz override (FIX yolu, Bug-B ailesi) | `src/orchestra/debt-manager.ts:127-178` | memory `project_fix_model_downgrade_bug` ile çapraz |
| C-04 / BG-05 | `no-go-reconciler.ts:118` `execSync` taskId interpolasyon — injection + evaluator yolunda | `src/orchestra/no-go-reconciler.ts:118` | grep + spawnSync array form |
| C-13 / BG-08 / BA-04 | ADR-037 RBAC `checkWorkerAuthority` soft mode (violation'da return true) | `src/agents/permission-guard.ts` | systematic-debug: runtime wire + hard mode |
| C-14 / BG-09 | `enforceVerifyLoop` 0 production caller — worker lifecycle/eval değişir | `src/agents/worker-verify.ts` (import grafı 0) | import grafı doğrula → wire |
| C-29 / BG-03 | `plugin-hooks.ts` `spawn(...,{shell:true})` — spawn yolunda injection | `src/orchestra/plugin-hooks.ts` | shell:false + arg array |
| C-05/06/07 | `dependency_pipeline_enabled` 3-katman drift + `DeckentConfig` tip eksik (wave scheduling — Sprint 171'de bu yüzden 171-029 erken spawn oldu) | `src/core/config.ts:138`, `src/core/types.ts` | config+type hizala; flip kararı ayrı |

## B. YP-RISK (fix ÖNCESİ doğrula — yanlış-pozitif riski yüksek)

| ID | Bulgu | Neden şüpheli | Doğrulama |
|---|---|---|---|
| C-01 / BA-01 | ADR-008 "Brain merkezi import drift" 5+ modül | `brain.ts` CLAUDE.md'de açıkça "re-export layer" — import'lar kasıtlı katman olabilir, ihlal değil. ADR-008 niyeti yanlış okunmuş olabilir | ADR-008 tam metni + amaçlanan katmanlama oku → gerçek ihlal mi? |
| C-16/17/18 / BA-02 | ADR-040 Nervous "dead pipeline" | ADR-040 `accepted` ama sistem opt-in/feature-flagged tasarlanmış olabilir (kasıtlı pasif ≠ regresyon) | ADR-040 metni + nervous wire niyeti (flag var mı?) |
| C-08/46 / BA-07 | api-surface "8 phase vs enum 9 (WAVE_BUILD)" | api-surface.md'de `2a WAVE_BUILD` zaten alt-faz olarak listeli — "drift" yanlış okuma olabilir | api-surface.md:Sprint Phases tam oku |
| C-25 / BA-03 | ADR-010 "tek dependency" 7 dep ihlali | ADR-010 metni bu dep'leri zaten justify ediyor olabilir (synthesis eski ADR ifadesi okumuş olabilir) | ADR-010 güncel metni oku |
| C-32/33 / BA-05/06 | Sprint 167 DB'de 0 satır + ADR-061 DB'de yok | Sprint 167 "0 satır" sprint_id format uyumsuzluğu olabilir (C-45 naming bug ailesi). ADR-061 DB-yok kısmen teyitli (summary.md ADR listesinde 061 yok) | SQL re-verify: `sprint_id` format varyantları |
| Coverage ~92 potansiyel | core/orchestra alt-dizin tam-liste eksiği | synthesis kendisi "POTANSIYEL / re-audit cycle" diyor — audit-metodoloji artefaktı, gerçek gap olmayabilir (modül raporları alt-dizini tek tek listelemedi) | Sprint 172 mini re-audit; `src/index.ts` (1 kesin) gerçek |

## C. DECKENT-RUNNABLE (içerik — deckent sprint, iyi dogfood)

| Küme | ID'ler | Not |
|---|---|---|
| **Güvenlik (script/adapter, eval-dışı)** | BG-01/C-31 (discord token log), BG-02/C-22 (gemini secret), BG-04/C-30 (baseline-tracker sh-c), BG-06/C-24 (mcp explain path traversal), BG-07/C-42 (deckent-hub pubkey) | spawnSync array / redact / validateSprintId |
| **Doc-drift (OSS vitrin)** | BD-01..12, C-23/35/36/37/38/39/40/41, C-26/47 (BOOT.md), C-34 (DEBT.md) | Auto-gen pipeline (README/CLAUDE/IDENTITY/api-surface/MCP-count tek-hakikat) |
| **Dead code (~3500 LoC)** | C-27 (doctor-checks/format), §1.5 cluster (Decision-Engine V1, 17 cli helper, monitor-adapter, retro-formatter, prompt-evolution, StatusPage) | ADR-038 disposition — ama her biri "test-only" iddiası YP-RISK (verify-first) |
| **A11y (dashboard)** | §1.5 cluster 5 (8 HIGH: lang, klavye, aria-modal, kontrast, focus trap) | frontend-designer agent |
| **İzole kod fix** | C-10 (turkishNormalize ß), C-11 (skill-sandbox ghost), C-20 (dashboard XSS), C-28 (dashboard tsc), C-44 (examples workspace:*) | Odaklı, eval-dışı |
| **Repo hijyen** | C-43 (.brain/archive 12MB → .gitignore), C-02/BA-08 (audit_paths_prefix config — Sprint 171'de DIRECTIVES'te workaround yaptık, kök fix gerek) | Doc-reorg §4 ile birlikte |

## D. DEFER (post-GA)

137 MEDIUM/LOW bulgu (synthesis §1.3 = 94, §1.4 = 43). Sprint 172 GA sonrası iterasyon. Tematik kümeler (synthesis §1.5) Sprint 173/174 focus sprint adayı.

---

## Synthesis Self-Correction (kritik)

`00-SYNTHESIS.md` §6.1 satır 450: "Spurious NO_GO: 0 ✅" — synthesis EVALUATE öncesi yazıldı. Düzeltilmiş gerçek: Bug A 014/023'te 2 schema spurious NO_GO üretti. 014 FIX ile reconcile oldu (retro DONE), 023 Bug-A-driven cascade ile NO_GO kaldı (retro NO_GO). Verdict GO_WITH_TECH_DEBT **hâlâ geçerli**; Bug A+B Sprint 172 ZORUNLU blocker (§2'deki 29'a + = 31). **Bug A+B artık FIX** (commit'li) — kalan: dist rebuild + MCP restart, sonra §2 blocker'lar + YP-RISK + DECKENT-RUNNABLE. Not: benim ilk Bug B çerçevelemem ("re-eval yok / TERMINAL yanlış") systematic-debug ile düzeltildi — gerçek RC audit-trail yazım boşluğuydu (yukarı BUG-B satırı).

## Önerilen Fix Sırası

1. **MANUEL-P0 batch** (A bölümü) — elle TDD. Bug A + Bug B önce (OSS GA + meta-bootstrap kritik), sonra C-04/13/14/29/03/05-07.
2. **YP-RISK doğrulama batch** (B bölümü) — systematic-debugging ile her birini doğrula → gerçek/yanlış-pozitif → gerçekse sınıfa ata.
3. **DECKENT-RUNNABLE sprint** (C bölümü) — Sprint 172 deckent ile (bootstrap fix + Bug A/B kapandıktan SONRA, böylece güvenli dogfood). Doc-reorg §4 ile birleşir.
4. **DEFER** (D) — Sprint 173+.

**Durum kolonu:** [ ] beklemede / [~] doğrulanıyor / [x] fix / [!] yanlış-pozitif (iptal)
