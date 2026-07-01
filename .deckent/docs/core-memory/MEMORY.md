# Memory Index

> **Nasıl çalışır:** Bu index oturum başında BİR KEZ yüklenir (her promptta değil); topic dosyaları lazy (yalnız okuyunca gelir). Bağlayıcı kurallar `CLAUDE.md`'ye terfi edildi (her-oturum garanti). **Her satır = amaç-önce kanca + kısa durum; commit/`file:line`/tarih topic dosyasında.** Index'i ≤17KB tut, tek-cümle.
> Durum imleri: ✅/☑ çözüldü · 🔴 açık/kritik · ◑ kısmi · ⏳ bekliyor · ⚠ dikkat.

## 🎯 AKTİF ÖNCELİKLER (sıradaki iş — güncel tut)
- **✅ ADR GOVERNANCE REDESIGN — TESLİM (2026-06-30):** 4-katman ADR-G/D/UG/UP (precedence **G>U>D**), 89→41 (34 ADR-G + 7 ADR-D), ID artık `adr-g/d-NNN`; DB+docs+rules+MASTER-PLAN canlı. Detay+crosswalk → [[project_adr_taxonomy_redesign_2026_06]]. **AKIŞ: (1) ADR ✅ → (2) 🔄 Claude-memory overhaul (ŞİMDİ) → (3) yeni-ADR ışığında `docs/MASTER-PLAN.md` geliştir.** Dedicated: ADR-064-W (scheduler dep-semantik) · ADR-087-W (auditor async).
- **🆕 STRATEJİK PİVOT (2026-06-29)** [[project_hermes_deckent_direction_2026_06]] — terminal=ana yönetim+kullanım yüzeyi (tool-driven, derin, zorlamadan) · dashboard=yalnız izleme · çekirdek-derin→tool/terminal'de daha-iyi. **P0:** TERM · APR (ApprovalBroker 🔴 yok) · TRN (training-trace UNWIRED) · TOOL (progressive-disclosure) · ONB · MOAT-bug (worktree-merge-race 🔴 · orphan-start 🟠). İş SSOT: `docs/MASTER-PLAN.md` (tek pillar-tablo, ~239 madde) + [[work_tracking_ledger]] · detay `.analysis/hermes-vs-deckent-direction-decisions.md`.
- **BUILD-GATE** (Alperen build+`/mcp restart`): worker token+cost Step-3 [[project_worker_output_contract_wiring]] · self-git-mutation [[project_deckent_self_git_mutation_bug]] · bot tool-surface+grup-buton [[project_bot_tool_surface_and_group_buttons]].
- **Açık bug:** planner `brain_planning` precedence 🔴 [[project_planner_mode_drops_overrides]] · `finalize --force` orphan-state [[feedback_finalize_force_orphan_state]] · ADR-075 affinity balance [[feedback_agent_routing_imbalance]].

## ⚖️ BAĞLAYICI KURALLAR (özet — tam liste CLAUDE.md'de)
**🔒 3 DEĞİŞTİRİLEMEZ YASA** (CLAUDE.md 🔒; ihlal/değiştir/teklif edilemez; model/oturum/ortam-bağımsız): **(1)** çift-bakış + ölçek (dogfood+user; solo→dünyanın en büyük şirketleri; milyon user/proje) · **(2)** milyonlarca ortam → cross-platform (macOS·Linux·Win-native+WSL)+multi-tenant baştan · **(3)** MVP ASLA (hep god-level). → [[feedback_dual_perspective_dogfood_product]] · [[feedback_millions_environments_scale]] · [[feedback_no_minimum_no_mvp_deckent]].
Günlük: Türkçe · no-MVP/god-level · `.brain/memory.db` silme · sprint'te build/login yok · sprint kill/cleanup Alperen-onayı · commit öncesi `git branch -vv` (+ commit yalnız istenince) · disk-verify ground-truth · haiku yalnız-doc · i18n-first (getMessage) · proof-of-function (gerçek-binary) · iş SSOT=MASTER-PLAN.

## User — Alperen kim, nasıl çalışılır
- [user_language_turkish](user_language_turkish.md) — dil kuralı: her zaman Türkçe (anlatım TR, teknik terim EN).

## Reference — git-dışı dış kaynaklar
- [reference_deckent_core_agent_security_core_v3](reference_deckent_core_agent_security_core_v3.md) — 2-katman "Agent Security Core v3" güvenlik taslağı; Deckent-Core tasarımına bakarken referans.

## İş-Takip — aktif projeler (durumu en sık değişen kayıtlar)
- [project_social_identity_rbac_engine](project_social_identity_rbac_engine.md) — per-user RBAC authorization motoru; Faz 1a+1b ✅ merged (opt-in, L2 gate canlı); follow-up dinamik /bind + SCIM/OIDC.
- [project_worker_output_contract_wiring](project_worker_output_contract_wiring.md) — worker result'a provider-agnostik token+cost wiring; Steps 1-2 ✅, Step 3 (strict TaskResultV1) + build-gate.
- [project_hermes_deckent_direction_2026_06](project_hermes_deckent_direction_2026_06.md) — 🆕 Hermes-vs-Deckent analiz→stratejik pivot (terminal-merkez) + tek-tablo MASTER-PLAN; yön-kararı verirken İLK durak.
- [project_adr_taxonomy_redesign_2026_06](project_adr_taxonomy_redesign_2026_06.md) — ✅ ADR redesign teslim (2026-06-30): 4-katman G/D/UG/UP, 89→41, ID=adr-g/d-NNN, crosswalk; ADR'lere bakarken İLK durak.
- [work_tracking_ledger](work_tracking_ledger.md) — TÜM açık iş'in tek aynası (SSOT=MASTER-PLAN); açık follow-up'a bakarken İLK durak.
- [project_claude_md_doc_bloat_cleanup](project_claude_md_doc_bloat_cleanup.md) — CLAUDE.md'yi yalın+kaliteli tutma; P1-P3 ✅, P4-P7 ⏳ (auto-load bloat generator fix).
- [project_messaging_gateway_rearch](project_messaging_gateway_rearch.md) — Telegram deneyimi baştan re-arch; G1 gateway kod main'de, build+T9 bekliyor; ⚠️ auth-gate'siz, publike açma.
- [project_bot_tool_surface_and_group_buttons](project_bot_tool_surface_and_group_buttons.md) — bot tool yüzeyi (cost/usage/kpi) + riskli-tool butonlu onay; ✅ kod/test, build+restart bekliyor; 🔴 start/run/process detached-exec gap.

## Vizyon & Strateji — ne inşa ediyoruz, neden (yön kararı verirken oku)
- [project_autonomous_first_dogfood_grand_vision](project_autonomous_first_dogfood_grand_vision.md) — grand-vizyon: sistem kendi loop-işini üretir + sürekli-backlog motoru (MERGED) + task⇄sprint⇄process mod-geçişi; ilk dogfood ✅.
- [project_automation_usability_state](project_automation_usability_state.md) — autonomous/process/nervous mod kod-durumu + make-usable + notify/approval omurgası.
- [project_deckent_native_terminal_agent](project_deckent_native_terminal_agent.md) — REPL→native-agent (kök: REPL'in agent-loop'u yok) + cc-grade UX-çıtası; M1-M4 ✅ (flag-gated), M5 cutover bekliyor.
- [project_deckent_core_model_and_provider](project_deckent_core_model_and_provider.md) — kendi fine-tune LLM + PROVIDER (vLLM) + 4-CLI subscription mixed-fleet (temel-kat) + opt-in telemetri.
- [project_deckent_sdk_spec](project_deckent_sdk_spec.md) — gömülebilir TS SDK taslak-spec (impl ertelendi).
- [project_clean_repo_migration_and_training_data](project_clean_repo_migration_and_training_data.md) — eğitim-veri madeni + temiz-repo + develop→product flip (GA-2); 🔴 geri-dönülmez, geçiş-öncesi arşivle.
- [project_sp2_training_data_pipeline](project_sp2_training_data_pipeline.md) — qwen fine-tune JSONL pipeline; Phase 1+2 ✅, fine-tune recipe sıradaki.
- [project_ifs_erp_first_connector](project_ifs_erp_first_connector.md) — ilk ERP=IFS; read-side landed; round-trip+write post-beta.
- [project_deckent_everyone_everywhere](project_deckent_everyone_everywhere.md) — 6 onboarding senaryosu + AI-tool-first + memory katmanı.
- [project_community_pro_split_strategy](project_community_pro_split_strategy.md) — MOD-SPLIT: aynı-kod + modüler enterprise-layer (ayrı-repo DEĞİL) + lisans/positioning (MIT-core / enterprise-depth); "en son".
- [project_deckent_god_level_vision](project_deckent_god_level_vision.md) — çalışma-kalite çapası: her iş god-level, MVP yok, tam-kapsam.
- [project_air_gapped_offline_pillar](project_air_gapped_offline_pillar.md) — AS-7 offline pillar (~%80); --offline wire/enforce/bundle açık.
- [project_aegis_methodology](project_aegis_methodology.md) — AEGIS 5-discipline metodolojisi; ⚠ ADR-061 SİLİNDİ → sıfırdan AEGIS-RD (timeline bayat).
- [project_karpathy_skill_discipline](project_karpathy_skill_discipline.md) — Karpathy 4-Discipline worker-anchor; CLAUDE.md'de aktif.
- [project_deckent_runtime_ecosystem](project_deckent_runtime_ecosystem.md) — agentic-OS + agentic-run ecosystem + 3×3 persona-matrix + Trinity-anchor + DeckentHub; 8-provider fleet + ERP runtime.
- [project_mcp_writer_lease_split](project_mcp_writer_lease_split.md) — MCP read/write-split + writer-lease (çoklu-pencere -32000 fix); impl edilmedi.
- [project_task_type_taxonomy_vision](project_task_type_taxonomy_vision.md) — TaskType ✅ + Hybrid-Scoring 5-Layer (merged → ADR-G-028, eski 053/055).
- [project_embedded_web_terminal](project_embedded_web_terminal.md) — Sub-project #2 delivered; ADR-G-029 (eski 062) accepted.
- [project_native_repl_tool_parity_gap](project_native_repl_tool_parity_gap.md) — REPL web-search/skill-dispatch parite açığı (F11 adayı).
- [project_nervous_activation_plan](project_nervous_activation_plan.md) — Nervous (ADR-G-022, eski 040) aktivasyon; Phase 1 (12 detector) live.
- [project_topp_continuous_dispatch](project_topp_continuous_dispatch.md) — TOPP (ADR-G-026, eski 064) sürekli-dispatch; dogfood `true`; 064-W scheduler-reconcile dedicated.

## Mimari / Gotcha — tuzaklar + çözülmüş kök-nedenler (bir şey kırılınca buraya bak)
- [project_docs_security_features_redoc](project_docs_security_features_redoc.md) — docs/security+features kasıtlı silindi (sıfırdan redoc); boş=kasıtlı, yeniden-yazma sanma.
- [project_limit_ledger_broken_chain_20260611](project_limit_ledger_broken_chain_20260611.md) — ☑ usage 2.4× düşük (stale-key $0) kök-neden + fix; P2/P3 follow-up.
- [project_repl_dashboard_usage_dogfood](project_repl_dashboard_usage_dogfood.md) — ⏳ REPL/dashboard aktif-kullanım dogfood'u henüz başlamadı.
- [project_ollama_sprint_task_sizing](project_ollama_sprint_task_sizing.md) — kural: ollama=küçük/düşük-stakes, substantial iş=claude.
- [project_tsconfig_dashboard_exclude_runtime_crash](project_tsconfig_dashboard_exclude_runtime_crash.md) — gotcha: derlenen ağaçtan dashboard import = dist-eksik crash; server-side src/api/.
- [project_nervous_observer_feedback_loop_rootcause](project_nervous_observer_feedback_loop_rootcause.md) — ☑ nervous-CPU bug GERÇEK kökü (observer fs.watch loop) + fix; panic-gate'i supersede.
- [project_build_no_clean_orphan_dist](project_build_no_clean_orphan_dist.md) — ☑ build inline-clean; gotcha: `.npmrc ignore-scripts=true` hook'ları öldürür.
- [project_deckent_self_git_mutation_bug](project_deckent_self_git_mutation_bug.md) — dogfood kendi git'ine reset --hard riski + koruma kuralları.
- [project_human_interaction_wire_gap](project_human_interaction_wire_gap.md) — feedback/approval wire haritası; çoğu epic ✅; REPL/DASH/BOT açık.
- [project_spurious_bot_checkpoint_notify](project_spurious_bot_checkpoint_notify.md) — ☑ sahte "checkpoint onay" bildirimi; non-blocking, yok say.
- [project_nervous_accept_pending_not_cleared](project_nervous_accept_pending_not_cleared.md) — nervous accept pending'i silmez (reject siler) → re-notify döngüsü; reject ile temizle.
- [project_planner_mode_drops_overrides](project_planner_mode_drops_overrides.md) — ◑ Provider/Model override-drop ☑; top-level `brain_planning` precedence 🔴 AÇIK + AI-planner Agent/Skills override-drop kısmi.
- [project_doc_audit_286_287](project_doc_audit_286_287.md) — DERS: dogfood doc'u sayar ama RUN'lamaz → CC hand-verify şart.
- [project_sprint188_self_analysis](project_sprint188_self_analysis.md) — periyodik full self-audit kuralı (tetik geçti).
- [project_worker_prompt_cache_finding](project_worker_prompt_cache_finding.md) — ☑ AMPİRİK: claude-CLI worker'lar prompt-cache PAYLAŞMIYOR; gerçek-sharing yalnız direct-HTTP-API.
- [project_persistence_direction_sqlite_evolution](project_persistence_direction_sqlite_evolution.md) — 🔒 KARAR VERİLİ: persistence = better-sqlite evrim + sqlite-vec opt-in; Postgres/vector-DB göçü REDDEDİLDİ (ADR-G-035); persistence/ölçek konuşurken İLK durak.

## Riskler & Sorunlar — açık riskler (planlamadan önce gözden geçir)
- [project_anthropic_subscription_credit_postponed](project_anthropic_subscription_credit_postponed.md) — Anthropic kredi-sistemi ertelendi; spawn modeli aynı; hedge koru.
- [project_test_home_leak](project_test_home_leak.md) — ☑ test HOME-leak fix; hermetiklik kuralı kalıcı.
- [project_ci_green_root_causes](project_ci_green_root_causes.md) — CI yeşil kök-neden ailesi (11 desen, +2026-06-28: lockfile-drift/process.exit-truncate/coverage-only-leak/build:all/untracked-deadlink); CI kırılınca İLK buraya bak.
- [project_system_risk_inventory](project_system_risk_inventory.md) — ⏳ 11 sistem riski; hangileri kapandı doğrula.
- [project_api_mode_deferred_post_beta](project_api_mode_deferred_post_beta.md) — ⏳ API-mode worker-auth post-beta'ya ertelendi; subscription default; rate-limit/cost-cap geçerli.

## Feedback — do/don't kalıcı çalışma kuralları (her iş öncesi geçerli)
- [feedback_governance_aligns_with_direction_pivot](feedback_governance_aligns_with_direction_pivot.md) — 🆕 tüm governance katmanları (mimari/workspace/worker/brain/auditor/ADR/docs) 2026-06-29 yön-pivotuyla hizalı ilerlemeli; pivot ADR'ye bağlanmalı.
- [feedback_adr_documents_today_and_tomorrow](feedback_adr_documents_today_and_tomorrow.md) — ADR'ler bugünü+yarını şeffaf belgeler; ADR-G-019 (eski 036) authoring-standard.
- [feedback_vitest_16gb_local_cap](feedback_vitest_16gb_local_cap.md) — BAĞLAYICI: lokal test ≤16GB; full-suite tek-process YASAK (WSL OOM), VITEST_MAX_FORKS=2 + bölünmüş batch.
- [feedback_explain_technical_terms](feedback_explain_technical_terms.md) — teknik terimleri AÇIKLAYARAK kullan.
- [feedback_no_minimum_no_mvp_deckent](feedback_no_minimum_no_mvp_deckent.md) — 🔒 YASA #3: MVP ASLA, hep god-level.
- [feedback_god_level_i18n_quality_bar](feedback_god_level_i18n_quality_bar.md) — el-kodda god-level + i18n-first (getMessage), borç bırakma.
- [feedback_dual_perspective_dogfood_product](feedback_dual_perspective_dogfood_product.md) — 🔒 YASA #1: çift-bakış (dogfood+user) + ölçek.
- [feedback_millions_environments_scale](feedback_millions_environments_scale.md) — 🔒 YASA #2: cross-platform + multi-tenant + milyon-ölçek baştan.
- [feedback_db_silmek_yasak](feedback_db_silmek_yasak.md) — `.brain/memory.db` ASLA silinmez.
- [feedback_prompt_completeness_over_brevity](feedback_prompt_completeness_over_brevity.md) — worker prompt kesme yok; full inject, cache ile çöz.
- [feedback_proof_of_function_dod](feedback_proof_of_function_dod.md) — user-surface DONE = gerçek-binary koşu; mock = TECH_DEBT.
- [feedback_trust_brain_eval_not_worker](feedback_trust_brain_eval_not_worker.md) — worker ipucu, Brain karar, disk-verify ground-truth.
- [feedback_brain_synthetic_nogo_disk_verify](feedback_brain_synthetic_nogo_disk_verify.md) — her sentetik NO_GO için disk-verify.
- [feedback_docker_oom_false_no_go](feedback_docker_oom_false_no_go.md) — Docker OOM sentetik NO_GO; disk-verify.
- [feedback_no_auth_touch_during_sprint](feedback_no_auth_touch_during_sprint.md) — sprint'te `/login` YASAK (worker auth-loss).
- [feedback_proactive_blocker_disclosure](feedback_proactive_blocker_disclosure.md) — eyleme yönlendirmeden önce blocker listesi sun.
- [feedback_build_requires_user_approval](feedback_build_requires_user_approval.md) — build sonrası `/mcp restart` Alperen; sprint'te build yok.
- [feedback_build_mcp_restart_coordination](feedback_build_mcp_restart_coordination.md) — kod değişince "BUILD GEREKLİ" sinyali ver.
- [feedback_shared_worktree_branch_hazard](feedback_shared_worktree_branch_hazard.md) — commit öncesi `git branch -vv` (HEAD-drift).
- [feedback_dashboard_no_emoji_lucide](feedback_dashboard_no_emoji_lucide.md) — dashboard EMOJI YASAK; lucide-react ikon.
- [feedback_haiku_doc_only_no_code](feedback_haiku_doc_only_no_code.md) — haiku yalnız doc, kod/tsx değil.
- [feedback_masterplan_living_ledger](feedback_masterplan_living_ledger.md) — tüm iş `docs/MASTER-PLAN.md`'ye (canlı defter).
- [feedback_masterplan_lossless_consolidation](feedback_masterplan_lossless_consolidation.md) — konsolidasyon %100 kayıpsız + kapsama-doğrula.
- [feedback_break_sprint_bug_cycle](feedback_break_sprint_bug_cycle.md) — fix-only sprint yok; her sprint ≥1 vizyon task.
- [feedback_directive_kanit_letter_vs_goal](feedback_directive_kanit_letter_vs_goal.md) — kanıt-grep hedefi ölçsün, lafzı değil; def-dosyası dışla.
- [feedback_wiring_pct_vs_user_working](feedback_wiring_pct_vs_user_working.md) — wiring% ≠ kullanılabilir; serve/chat/UI'yi gerçekten dene.
- [feedback_zero_hardcode_live_data](feedback_zero_hardcode_live_data.md) — CLI/MCP çıktıları canlı veriden; stale model-ID yok.
- [feedback_scale_up_autonomous](feedback_scale_up_autonomous.md) — sprint kapsamını büyüt (mikro task + `- Dependencies:` grafiği).
- [feedback_cross_check_anthropic_openai](feedback_cross_check_anthropic_openai.md) — Anthropic↔OpenAI karşılıklı cross-check (XVER-1).
- [feedback_autonomous_loop_build_self](feedback_autonomous_loop_build_self.md) — otonom sprint-döngüsü: CC build koşar, onay yok, kill yok.
- [feedback_telegram_rich_approval_bot](feedback_telegram_rich_approval_bot.md) — ✅ inline buton→nervous-accept wired+doğrulandı; DERS: dist-rebuild→bot-restart şart.
- [feedback_ccverify_full_affected_suite](feedback_ccverify_full_affected_suite.md) — CC-verify değişen-modülü import eden TÜM test'i koşmalı; "pre-existing"i worktree ile doğrula.
- [feedback_container_auth_precedence](feedback_container_auth_precedence.md) — auth-wire ✅; subscription→API fallback'i doğrula.
- [feedback_finalize_force_orphan_state](feedback_finalize_force_orphan_state.md) — `finalize --force` orphan-state bug + manuel reçete (açık).
- [feedback_agent_routing_imbalance](feedback_agent_routing_imbalance.md) — ☑ multi-signal scoring live; KALAN: ADR-075 skill→agent affinity dead-code.
- [feedback_dont_relitigate_decided_architecture](feedback_dont_relitigate_decided_architecture.md) — verili mimari kararı (accepted ADR-G) yeni-fikir gibi geri açma + ölçekle MVP-hedge önerme; öneri öncesi ADR+memory tara.
