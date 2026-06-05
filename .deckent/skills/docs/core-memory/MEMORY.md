# Memory Index

## User
- [user_language_turkish.md](user_language_turkish.md) — Alperen ile HER ZAMAN Türkçe konuş (kalıcı tercih)

## Vision & Strategy (project)
- [project_deckent_everyone_everywhere.md](project_deckent_everyone_everywhere.md) — "Deckent orchestered for everyone everywhere": 6 senaryo (sıfır/geliştirme/bitmiş/gündelik/ERP/enterprise) + AI-tool-first onboarding (init+stack-detect+CLAUDE.md adapter ✅) + memory katmanı işlevsel (6MB/487 entry/FTS5 i18n ✅)
- [project_deckent_positioning.md](project_deckent_positioning.md) — Konumlandırma (2026-06-02): TEK-ÜRÜN MIT (Odoo/edition-split YOK), "anti-X" dili KALDIRILDI (kıyasla-kötüleme), "açık agent'ın god-level orkestre+enterprise hali, bireysele kolay", slogan "open source for open world"
- [project_deckent_god_level_vision.md](project_deckent_god_level_vision.md) — God-level ürün vizyonu (no MVP, no Enterprise Edition, milyon-user, MIT no-gate, evrimsel mimari ana farklılaştırıcı)
- [project_deckent_agentic_os_vision.md](project_deckent_agentic_os_vision.md) — Agentic-OS 3 persona × 3 audience matrix; Sub-project pipeline #1..#5; ICSE/FSE 2027 paper hedef
- [project_deckent_trinity_anchor.md](project_deckent_trinity_anchor.md) — Trinity 3-face anchor (AI Assistant + AI System Worker + Developer Platform), tek motor, üç yüz paralel gelişir
- [project_june1_beta_roadmap.md](project_june1_beta_roadmap.md) — 1 Haziran 2026 KESİN beta launch; v1.0.0-beta.1 Alperen manuel npm publish; scope INCLUDE/EXCLUDE matrix
- [project_4cli_subscription_vision.md](project_4cli_subscription_vision.md) — 4 CLI (Claude/Codex/Gemini/Cursor) subscription mode multi-provider worker spawn; Cursor post-GA
- [project_aegis_methodology.md](project_aegis_methodology.md) — AEGIS methodology 5-discipline; ADR-061 proposed; agentaegis.io Sprint 200 milestone
- [project_karpathy_skill_discipline.md](project_karpathy_skill_discipline.md) — Karpathy 4-Discipline anchor (.claude/rules/karpathy-discipline.md), Sprint 191-197 worker anchor

## Architecture (project)
- [project_deckent_runtime_ecosystem.md](project_deckent_runtime_ecosystem.md) — Pozisyon evrimi product→AI runtime ecosystem; 8-provider eşzamanlı + subs/api overflow + evrimleşen agent kimliği + ERP runtime; detay MASTER-PLAN
- [project_ink_native_repl.md](project_ink_native_repl.md) — Native REPL artık Ink (React-for-CLI) + DEFAULT; engine=loop/view=Ink; Sprint 224 enterprise epic E1-E7 (markdown/menü/switcher/footer/agentic-diff/paste/default); PTY-harness scripts/ink-pty-test.mjs
- [project_embedded_web_terminal.md](project_embedded_web_terminal.md) — Sub-project #2 Sprint 175 delivered; PTY + WS gateway + token auth + audit chain; ADR-062 accepted
- [project_dashboard_control_plane.md](project_dashboard_control_plane.md) — F7 Dashboard god-level vizyon: UI/UX harika + tam işlevsel + user-enterprise friendly kontrol düzlemi; API auth-disabled bağımlılığı fix; ROADMAP §F7
- [project_deckent_self_git_mutation_bug.md](project_deckent_self_git_mutation_bug.md) — 🔴 deckent dogfood'da kendi git ağacına reset --hard + otonom commit yapıyor → uncommitted iş kaybı (Sprint 216 silindi); Sprint 218 P0; koruma: her sprint öncesi commit + CLI'dan başlat
- [project_dashboard_realrun_findings.md](project_dashboard_realrun_findings.md) — Dashboard gerçek-kullanım denetimi (2026-06-01): 🔴 sprint-start serve'i donduruyor (event-loop bloke, detach gerek) + chat hollow (status-only) + Evolution/Nervous/Enterprise sayfaları sidebar'da yok (F7 DONE'ları hollow); terminal ✅; native hız hedefi
- [project_nervous_activation_plan.md](project_nervous_activation_plan.md) — Nervous System ADR-040; Phase 1 smoke 12 detector live Sprint 145; Phase 2-3 post-beta
- [project_topp_continuous_dispatch.md](project_topp_continuous_dispatch.md) — TOPP continuous-dispatch ADR-064 Sprint 178; wave-barrier removal; %40 sprint süresi azalış
- [project_task_type_taxonomy_vision.md](project_task_type_taxonomy_vision.md) — TaskType (ADR-053) + EnvironmentType + Hybrid Scoring 5-Layer (ADR-055 proposed)
- [project_api_mode_deferred_post_beta.md](project_api_mode_deferred_post_beta.md) — API mode 1 Haziran 2026 sonrası; Tier 1 30K tok/min cap; subscription default

## Risks & Issues (project)
- [project_test_home_leak.md](project_test_home_leak.md) — Testler HOME=proje sızdırıp kök'e dotfile (.keyring secret/.codex/.gemini) yazıyor; worker değil host-test izolasyon açığı; Sprint 215 fix
- [project_ci_green_root_causes.md](project_ci_green_root_causes.md) — Aylardır kırık CI Sprint 214 yeşertildi; kök aile green-local≠green-CI (non-hermetic + 2-core teardown RPC); 8 fix deseni A-E; CI kırılırsa ilk buraya bak
- [project_system_risk_inventory.md](project_system_risk_inventory.md) — 11 sistem riski + WrongStack pre-beta durum (WS-Z1 fixed, Z2 partial, Z3 incomplete); Sprint 195+ priority
- [project_sprint188_self_analysis.md](project_sprint188_self_analysis.md) — Sprint 188 12 audit raporu 80+ bulgu; W-B work stream kaynağı; master plan anchor

## Feedback (do/don't)
- [feedback_no_minimum_no_mvp_deckent.md](feedback_no_minimum_no_mvp_deckent.md) — ASLA MVP/minimum, hep god-level; "Bu god-level mi?" sorusu zorunlu
- [feedback_db_silmek_yasak.md](feedback_db_silmek_yasak.md) — .brain/memory.db ASLA silinmez; tüm Brain knowledge orada (ADR, sprint, retro, patterns, debt)
- [feedback_break_sprint_bug_cycle.md](feedback_break_sprint_bug_cycle.md) — Sprint-bug döngüsünü kır; her sprint en az 1 ileri-yönlü vizyon task'ı zorunlu
- [feedback_trust_brain_eval_not_worker.md](feedback_trust_brain_eval_not_worker.md) — Brain evaluation karar, worker .result ipucu; disk-verify ground truth (Sprint 195+ gate)
- [feedback_build_requires_user_approval.md](feedback_build_requires_user_approval.md) — npm run build sonrası /mcp restart şart; sprint çalışırken build YASAK
- [feedback_build_mcp_restart_coordination.md](feedback_build_mcp_restart_coordination.md) — kod değişince ben "🔨 BUILD GEREKLİ" sinyali; build+/mcp restart Alperen yapar; sprint'ler CLI+env-u ile (MCP bypass)
- [feedback_docker_oom_false_no_go.md](feedback_docker_oom_false_no_go.md) — Docker exit 137 OOM Brain sentetik NO_GO; disk-verify zorunlu; Sprint 194 1633 LoC rescue kanıt
- [feedback_prompt_completeness_over_brevity.md](feedback_prompt_completeness_over_brevity.md) — Worker prompt brevity için kesme YASAK; Karpathy + ADR + Skills full inject; token cache ile çöz
- [feedback_no_auth_touch_during_sprint.md](feedback_no_auth_touch_during_sprint.md) — Sprint çalışırken /login YASAK; worker auth-lost silent fail
- [feedback_container_auth_precedence.md](feedback_container_auth_precedence.md) — Per-task `- Auth: subscription\|api` wire %100 landed (Sprint 195); Claude CLI subscription invalid'ken API fallback bug
- [feedback_proactive_blocker_disclosure.md](feedback_proactive_blocker_disclosure.md) — Bir eyleme yönlendirmeden ÖNCE bilinen blocker (tier limit, quota, kronik bug) listesi sun
- [feedback_ai_planner_silent_fallback.md](feedback_ai_planner_silent_fallback.md) — AI planner her ortamda fail (MCP açık-hata, CLI sessiz-structured-fallback=dürüstlük ihlali); structured deckent-dev'de zaten mükemmel; Sprint 221-017 fix
- [feedback_finalize_force_orphan_state.md](feedback_finalize_force_orphan_state.md) — finalize --force sprint-state'i COMPLETED yapmıyor+pids temizlemiyor → sonraki start "orphan sprint" hatası; manuel fix (sprint-state.json COMPLETED + rm pids)
- [feedback_planner_dependency_parse_gap.md](feedback_planner_dependency_parse_gap.md) — structured-planner DIRECTIVES "- Dependencies:" satırını task JSON'a yazmıyor → dependencies boş → wave kayması (pipeline true olsa da tek-wave); her plan sonrası dependency-kontrol + elle ekle
- [feedback_brain_synthetic_nogo_disk_verify.md](feedback_brain_synthetic_nogo_disk_verify.md) — 7 sentetik NO_GO kaynak haritası; her NO_GO için disk-verify (Sprint 195: 1570 LoC kurtarıldı)
- [feedback_worker_prompt_engineering_god_level.md](feedback_worker_prompt_engineering_god_level.md) — Worker prompt 10 sorun + WP-1..WP-12 stream; persona mismatch, prompt cache, boundary auto-derive
- [feedback_zero_hardcode_live_data.md](feedback_zero_hardcode_live_data.md) — Zero-hard-code felsefesi; CLI/MCP çıktıları canlı deckent verisinden parametrik; stale model ID (opus-4-6) bundled fallback bulgusu; Sprint 208 tema
- [feedback_brain_rubric_bridge_broken.md](feedback_brain_rubric_bridge_broken.md) — ✅ÇÖZÜLDÜ (6e9c1f8a): Brain false-FIX kökü coverageOptional agent-allowlist'ti (refactorer yoktu→coverage:null schema-NO_GO); sinyal-temelli fix+NaN guard+verdict-persist; refactorer↔bug-fixer idempotent
- [feedback_scale_up_autonomous.md](feedback_scale_up_autonomous.md) — Sprint kapsamını büyüt (12-20+ task), çok-iş paralel, ölçeği zorla; hedef otonom mod (ürün hedefi, sprint-başlatma izni değişmedi)
- [feedback_agent_routing_imbalance.md](feedback_agent_routing_imbalance.md) — Agent routing kronik refactorer-ağırlığı: Sprint 209-210 kısmi düzeldi ama 211'de 12/16'ya nüks; güvenlik/UI task'ları yanlış agent'a; skill routing doğru, agent collapse ediyor
- [feedback_fix_prompt_quality.md](feedback_fix_prompt_quality.md) — FIX prompt sorunları: exit-0-no-result yarışı sahte-NO_GO (209-009 DONE'ken FIX), boş Task bölümü, hep bug-fixer agent; Sprint 210 fix-trigger disk-verify gate
- [feedback_directive_kanit_letter_vs_goal.md](feedback_directive_kanit_letter_vs_goal.md) — Kanıt-grep hedefi değil lafzı ölçerse worker dürüstçe DONE der ama hedef tutmaz; Sprint 211 F5 wire-gap (0-external-caller dormant); fix: grep def-dosyasını dışla + wire scope'u çağıran modülü içersin (✅ Sprint 212 doğrulandı)
- [feedback_wiring_pct_vs_user_working.md](feedback_wiring_pct_vs_user_working.md) — Feature %'leri iç-wiring'i ölçer, user-working'i değil; durum raporlarken serve/chat/UI'yi gerçekten dene; "wired"≠"kullanılabilir"
- [feedback_proof_of_function_dod.md](feedback_proof_of_function_dod.md) — ✅Proof-of-Function DoD (kabul 2026-06-01): user-surface task DONE=gerçek-binary koşu kanıtı (mock test=GO_WITH_TECH_DEBT); deckent kendi sınıflar (isUserSurfaceTask scope-temelli) + in-sprint gate (post-sprint-smoke) + routing besler; Sprint 216 impl; serve-401 hollow-done kanıtı
- [feedback_god_level_i18n_quality_bar.md](feedback_god_level_i18n_quality_bar.md) — Doğrudan el-kodlamada god-level/enterprise çıta: i18n-first (hardcode string YASAK, getMessage), teknik borç bırakma; CLAUDE.md "⚠️ Quality Bar" bölümü (her oturum yüklenir)

# userEmail
The user's email address is alperensartacoglu@gmail.com.
# currentDate
Today's date is 2026-05-26.
