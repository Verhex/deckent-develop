## Sprint sprint-084 Learnings
- AgentDetail Penceresi — Okunabilirlik ve Boyut Fix: DONE — Sheet w-[400→600px], sm:w-[500→700px]. Font text-xs→text-sm (badge, agent/skill, elapsed, scope, files, desc). CardTitle text-lg font-bold. Log h-[220→350px]. ScrollArea→overflow-auto div. break-words eklendi.
- i18n Kalan Hardcoded String'ler — Tam Kapsam: DONE — 79 yeni key (en.ts + tr.ts). ConfigPage fieldT() helper: runtime çeviri, fallback İngilizce. CONFIG_FIELDS label/desc değişmedi (fallback olarak kalıyor). Dropdown "— none —", "true", "false" i18n'e taşındı.
- Dashboard Canlı Veri Akışı Doğrulama: DONE — tests/dashboard/live-data.test.ts: 41 test. SSE hook (11), WorkerCard (11), ActivityFeed (11), SprintPhaseTimeline (8). File-based assertion pattern (readFileSync + toContain).
- Dashboard Build Otomasyonu: DONE — package.json: build:dashboard (cd src/dashboard && npx vite build --outDir ../../dist/dashboard), build:all (tsc && npm run build:dashboard), postbuild (npm lifecycle hook).
## Sprint sprint-086 Learnings
- Tech Debt Kapatma — routeTaskV2 Cagri Yerleri + Kalan Catch Bloklari: GO_WITH_TECH_DEBT — A) routeTaskV2 calls updated with sprintId/taskId/projectRoot: sprint-controller.ts planSprint routing-v2 block now pass
- Planner'a Gecmis Bilgisi Enjeksiyonu: GO_WITH_TECH_DEBT — A) outcome-tracker.ts: getWorstCombinations(limit=5) metodu eklendi. Son 5 sprint outcomes dosyalarını okur, agent+skill
## Sprint sprint-087 Learnings
## Sprint sprint-088 Learnings
- Mid-Sprint Reroute Güçlendirme — Max 3 + Config: GO_WITH_TECH_DEBT — Mid-sprint reroute güçlendirme tamamlandı.

A) config-types.ts DOĞRULANDI: max_reroutes ve reroute_on_tech_debt DeckentC
- Checkpoint CLI/MCP Entegrasyonu — Approve/Reject Komutları: GO_WITH_TECH_DEBT — Checkpoint CLI/MCP entegrasyonu tamamlandı. A) CLI: `deckent checkpoint list/approve/reject` komutları eklendi (checkpoi
- Kalan Sessiz Catch Blokları — Son Dalga: GO_WITH_TECH_DEBT — A) README.md: badge'lar 12239+/87+/v0.3.0-beta.3 güncellendi, Key Features'a Heartbeat Daemon/Human Checkpoints/Configur
## Sprint sprint-089 Learnings
- Usage Core Modülleri Kaldır — Tipler, Config, Tracker: GO_WITH_TECH_DEBT — Usage core modülleri tamamen kaldırıldı:

A) src/core/usage-tracker.ts SİLİNDİ (395 satır) — UsageTracker class, UsageEn
- Usage Orchestra + Provider Modülleri Kaldır: GO_WITH_TECH_DEBT — Usage Orchestra + Provider Modülleri tamamen kaldırıldı.

A) usage-manager.ts SİLİNDİ (462 satır) — checkUsage, adjustSp
- Usage CLI + MCP + API + Dashboard Kaldır: GO_WITH_TECH_DEBT — A) src/cli/commands/usage.ts SİLİNDİ (214 satır — registerUsage, buildUsageOutput, UsageTracker import'ları). B) src/cli
- Usage Test Dosyaları + Dokümantasyon Temizliği: GO_WITH_TECH_DEBT — A) 6 usage test dosyası silindi: tests/core/usage-tracker.test.ts, tests/cli/usage.test.ts, tests/cli/commands/usage.tes
## Sprint sprint-090 Learnings
- src/ Artık Temizliği — MCP Help, Server, Dashboard, Sprint Types: GO_WITH_TECH_DEBT — src/ altındaki tüm usage tracking artıkları temizlendi: (A) help.ts: deckent_usage tool + deckent://usage resource kaldı
- Test Dosyaları Artık Temizliği — Mock, Import, Fixture: NO_GO
- Dokümantasyon + README Artık Temizliği: GO_WITH_TECH_DEBT — Tüm 19 hedef dosyadan usage tracking referansları temizlendi. README: deckent_usage tool/resource satırları kaldırıldı, 
## Sprint sprint-091 Learnings
- Agent Tiebreaker — learnings.json'dan Oku: GO_WITH_TECH_DEBT — Agent tiebreaker V2 fix: pool.get(id)?.stats.successRate (always 0 in V2) replaced with getLearningBonus(id, learningDat
- Promotion/Demotion Execute Et: GO_WITH_TECH_DEBT — finalizeSprint() içindeki promotion/demotion döngülerine pipeline.promote() ve pipeline.demote() çağrıları eklendi. Her 
- Evolved Rules Activation'a Inject Et: GO_WITH_TECH_DEBT — Evolved rules artık planSprint() V2 routing bloğunda agent/skill activation config'lerine inject ediliyor. OutcomeTracke
- updateSkillStats V1 + SkillMap RETRO İçin: GO_WITH_TECH_DEBT — İki kopuk nokta düzeltildi: (A) V1 akışında updateSkillStats() çağrısı eklendi — her task'ın assignedSkills'i için Skill
- Hard-Coded Sabitleri Config'den Oku: NO_GO
- Quality Score Routing Bonus'a Entegre Et: NO_GO
- Integration Test — Tam Evolution Pipeline: NO_GO
## Sprint sprint-092 Learnings
- Config.json Agresif Temizlik + Tip Güvenliği: GO_WITH_TECH_DEBT — Config.json agresif temizlik tamamlandı: (A) 4 mod altındaki usage_thresholds blokları silindi (Sprint 089 artığı), (B) 
- Dashboard i18n — StatusPage + SprintSummary (~34 key): GO_WITH_TECH_DEBT — StatusPage ve SprintSummary bileşenlerindeki tüm hardcoded İngilizce stringler i18n ile çevrildi. ~35 yeni key eklendi (
- Dashboard i18n — TaskCard (~30 key): GO_WITH_TECH_DEBT — TaskCard i18n tamamlandı. 31 yeni key (task_card.* prefix) en.ts ve tr.ts'e eklendi. Component içinde useTranslation imp
- Dashboard i18n — DebtTable + SprintChart + Layout + Kalan (~25 key): GO_WITH_TECH_DEBT — Dashboard i18n Task 4 tamamlandı. 7 bileşendeki hardcoded string'ler i18n ile çevrildi:

A) DebtTable.tsx — useTranslati
- i18n Doğrulama — Hardcoded String Tarama + Key Eşitliği: GO_WITH_TECH_DEBT — i18n doğrulama test dosyası oluşturuldu (tests/dashboard/i18n-coverage.test.ts) — 16 test, 4 describe bloğu:

1) Key cou
## Sprint sprint-093 Learnings
- RETRO.md Skill Performance Tablosu Düzeltme: GO_WITH_TECH_DEBT — RETRO.md Skill Performance tablosu düzeltildi. Kök neden: buildSkillPerformance() guard'ı skillMap boş/undefined olduğun
- avgQualityScore Persist Düzeltme + Agent Done Sayacı: GO_WITH_TECH_DEBT — A) avgQualityScore persist FIX: EntityPerformance'a qualityTaskCount alanı eklendi. updateEntityPerformance() formülü dü
- Sprint Bitişinde Otomatik Output (Job Completion Notification): GO_WITH_TECH_DEBT — Sprint bitişinde otomatik output mekanizması eklendi: (A) finalizeSprint() sonuna .deckent/jobs/{sprintId}.json dosyasın
## Sprint sprint-094 Learnings
- Fix debt: Tech debt from 091-006-fix: Quality Score Routing Bonus entegrasyonu zaten tam o: GO_WITH_TECH_DEBT — Quality Score Routing Bonus entegrasyonu zaten tamamen yapılmıştı (Sprint 093'te tamamlanmış). Doğrulama: (1) sprint-con
- Usage Son Kalıntı Temizliği — README CLI Tablosu: GO_WITH_TECH_DEBT — Tüm aktif docs/ dosyalarındaki 'deckent usage', 'UsageTracker', 'usage-tracker' referansları temizlendi. 5 dosyada değiş
- Stats Sync Doğrulama Notu: GO_WITH_TECH_DEBT — PROJECT-IDENTITY.md güncellendi: (A) Sprint 093-094 Achievements bölümü eklendi — Agent/Skill Stats Sync (V2→manifest) ö
## Sprint sprint-095 Learnings
- Skill İsim Uyumsuzluğu Düzeltme: GO_WITH_TECH_DEBT — Fixed 4 mismatched skill IDs in learnings.json:
- refactoring-expert: removed (no manifest exists, was legacy data from 
## Sprint sprint-096 Learnings
- README.md + README-TR.md Sayı ve Tablo Düzeltmeleri: GO_WITH_TECH_DEBT — README.md ve README-TR.md dosyalarındaki tüm sayılar güncellendi: sprints badge 88→95+, MCP tools 18→19 (3 yerde: featur
- DECKENT.md Skill İsimleri + MCP Tablo + Checkpoint: GO_WITH_TECH_DEBT — DECKENT.md düzeltmeleri tamamlandı: (A) Built-in Skills tablosundaki 6 yanlış isim düzeltildi — security-expert→security
- CLAUDE.md + IDENTITY.md + PROJECT-IDENTITY.md Sayı Düzeltmeleri: GO_WITH_TECH_DEBT — Tüm üç dosyadaki sayısal tutarsızlıklar düzeltildi: (A) CLAUDE.md: orchestra 48→47, core 49→48, MCP 18→19, CLI 33+→34+. 
- docs/reference/cli.md — Usage Komutu Kaldır + Sayılar: GO_WITH_TECH_DEBT — A) TOC'dan `deckent usage` satırı kaldırıldı (satır 38). B) usage komutu tam dokümantasyon bloğu kaldırıldı (satır 412-4
- docs/reference/api.md — Usage + Eski Mod İsimleri Temizliği: GO_WITH_TECH_DEBT — api.md eski referanslar temizlendi: (A) PlanMode tipi max_plan/max5x_plan/pro_plan → performance/balanced/economic günce
- docs/reference/config-reference.md — Mod İsimleri Canonical Güncelleme: GO_WITH_TECH_DEBT — config-reference.md'deki tüm eski mod isimleri canonical olarak güncellendi: max_plan→performance, max5x_plan→balanced, 
- docs/architecture/architecture.md — Tam Güncelleme: GO_WITH_TECH_DEBT — architecture.md tam güncelleme tamamlandı: (A) Version Sprint 065→095+, (B) CLI 28→34+, (C) MCP tools 10→19 (tüm 19 tool
- docs/reference/ Kalan Dosyalar — Mod İsimleri + Usage Temizliği: GO_WITH_TECH_DEBT — All 6 reference docs cleaned: (A) performance.md: max_plan→performance, pro_plan→economic, max5x_plan→balanced canonical
- docs/guide/ + docs/development/ + docs/architecture/ Kalan — Sayı ve Referans Düzeltmeleri: GO_WITH_TECH_DEBT — All documentation fixes applied:

A) quickstart.md + first-sprint.md: 'Max workers: 5 (max_plan)' → 'Max workers: 8 (per
## Sprint sprint-097 Learnings
- ModelRegistry Class + BUILTIN_MODELS Kataloğu: GO_WITH_TECH_DEBT — ModelRegistry class + BUILTIN_MODELS kataloğu tamamlandı. Değişiklikler: (A) ModelStatus, ModelCapabilities, ModelCost a
- task-types.ts Delegasyonu — Registry'den Re-export: GO_WITH_TECH_DEBT — task-types.ts ve model-equivalence.ts artık ModelRegistry'den veri türetiyor. PROVIDER_MODEL_MAP, ALL_MODELS, MODEL_API_
- Provider Adapter Tier Duplicate Kaldırma: GO_WITH_TECH_DEBT — Provider tier duplicate kaldırma tamamlandı. CODEX_TIER_MODELS ve GEMINI_TIER_MODELS sabitleri artık hard-coded değerler
- mode-presets.ts + model_strategy Config Yapısı: GO_WITH_TECH_DEBT — A) mode-presets.ts — ModelStrategy interface + MODE_PRESETS (performance/balanced/economic/api) + TIER_ORDER + compareTi
- MCP + CLI Model Enum Genişletme: GO_WITH_TECH_DEBT — A) src/mcp/tools/run.ts: Hard-coded z.enum(['opus','sonnet','haiku']) replaced with z.enum(ALL_MODELS) — now supports al
- Codex Adapter CLI Uyumluluk Güncellemesi: GO_WITH_TECH_DEBT — Codex adapter CLI uyumluluk güncellemesi tamamlandı:

A) buildArgs/buildCommand/buildPlannerCommand: Rust rewrite uyumlu
- Gemini Adapter CLI Uyumluluk + gemini-3.1-pro-preview: GO_WITH_TECH_DEBT — Gemini Adapter CLI uyumluluk güncellemesi tamamlandı:

A) buildArgs() güncellendi:
  - --model → -m kısa flag (Gemini CL
- Init Wizard Provider-Agnostic Tier Seçimi: GO_WITH_TECH_DEBT — Init wizard provider-agnostic tier seçimine geçirildi. auto-setup.ts: selectModels() → selectTiers() + tierToModel() ref
- token-counter.ts + sprint-reporter.ts Hard-Code Temizliği: GO_WITH_TECH_DEBT — Hard-coded model referansları 4 dosyada temizlendi: (A) token-counter.ts — DEFAULT_BUDGETS artık buildDefaultBudgets() f
- Dashboard Test Fix + Integration Test: GO_WITH_TECH_DEBT — A) TaskCard.test.tsx — 20 failing tests fixed: Added React import, vi/beforeEach/afterEach imports, LanguageProvider wra
## Sprint sprint-098 Learnings
- RETRO Done Sayacı — GO_WITH_TECH_DEBT = Done Olarak Sayılmalı: GO_WITH_TECH_DEBT — buildAgentPerformance() ve buildSkillPerformance() zaten GO_WITH_TECH_DEBT'i done'a sayıyordu (Sprint 093 fix). Ancak sp
- Sprint History — Son 5 Sprint Döndürmeli: GO_WITH_TECH_DEBT — Root cause: MCP deckent_history tool only read .brain/sprints/ directory (2 files), ignoring .brain/archive/ where 85 sp
- ANALYSIS-2026-04-02.md Güncel Durum Güncellemesi: GO_WITH_TECH_DEBT — ANALYSIS-2026-04-02.md Sprint 097 sonuçlarıyla güncellendi: (A) Bölüm IX Sonuç tamamen yeniden yazıldı — Sprint 088→097,
- README + DECKENT.md ModelRegistry Özelliği Dokümante: GO_WITH_TECH_DEBT — README.md ve README-TR.md dosyalarındaki sprint badge sayısı 95+→97+ olarak güncellendi. ModelRegistry, 13 model, 16 bui
- PROJECT-IDENTITY + CLAUDE.md Sayı Güncellemeleri: GO_WITH_TECH_DEBT — Sayılar güncellendi: (A) PROJECT-IDENTITY.md — agent-pool.ts 9→16 built-in, skill-pool.ts 11→21 built-in, core/ 48→50 mo
## Sprint sprint-099 Learnings
- RETRO Done Sayacı — Evaluations Map Debug + Fix: GO_WITH_TECH_DEBT — Kök neden bulundu ve doğrulandı: Sprint 093 commit'inde (2085f0f) buildAgentPerformance() içindeki GO_WITH_TECH_DEBT blo
- Job Output Reform — Detaylı Gerekçe + Metrik: GO_WITH_TECH_DEBT — Job Output Reform tamamlandı: (A) finalizeSprint() job summary bloğu zenginleştirildi — her task için evaluation, reason
- VISION.md + health-check.md + roadmap.md Sayı Güncellemeleri: GO_WITH_TECH_DEBT — 3 dosyadaki tüm eski sayılar güncellendi: VISION.md (6 düzeltme: sprint 82→98+, CLI 33→34+, MCP resource 9→8, agent 9→16
- README Badge + ANALYSIS Sprint 098 Güncelleme: GO_WITH_TECH_DEBT — A) README.md ve README-TR.md: sprint badge 97+ → 98+ güncellendi. B) ANALYSIS-2026-04-02.md: Bölüm I tablosu güncellendi
- PROJECT-IDENTITY Test Count Fix + CLAUDE.md Module Count: GO_WITH_TECH_DEBT — PROJECT-IDENTITY.md: Test Count 12 → 12,193+ düzeltildi. CLAUDE.md zaten günceldi (49 modules orchestra, 52 modules core
## Sprint sprint-100 Learnings
- Config Ölü Alan Temizliği: NO_GO — A) config.json legacy modları (max_plan, max5x_plan, pro_plan) zaten yoktu — Sprint 097'de temizlenmiş. B) config.json'd
- Constants→Config Entegrasyonu: NO_GO
- Dashboard CONFIG_FIELDS Güncelleme: NO_GO — Edit/Write tool permissions denied in don't-ask mode. Cannot modify ConfigPage.tsx without file write permissions. All p
- Init Wizard İyileştirme: NO_GO — Init wizard genişletildi — 15+ yeni config alanı eklendi.

A) CLI init config bloğuna 10 yeni alan eklendi: routing_engi
- Worker Result Yazma Güvenilirliği — tmux Timeout + Fallback: NO_GO
- Sprint Status + Dashboard Stale Data Fix: NO_GO
## Sprint sprint-101 Learnings
- Fix debt: Tech debt from 098-001: buildAgentPerformance() ve buildSkillPerformance() zaten: NO_GO — Edit/Write tool permissions denied in don't-ask mode. Root cause fully analyzed: (1) handleEvaluation() in debt-manager.
- Fix debt: Tech debt from 098-002: Root cause: MCP deckent_history tool only read .brain/sp: GO_WITH_TECH_DEBT — debt-098-002 already fully resolved. collectSprintFiles() in sprint-reporter.ts (line 2051) reads both .brain/sprints/ a
- Fix debt: Tech debt from 098-004: README.md ve README-TR.md dosyalarındaki sprint badge sa: GO_WITH_TECH_DEBT — Fixed debt-098-004: (A) Removed obsolete 'Usage-Aware Planning' from Key Features in both README.md and README-TR.md — u
- Sprint Singleton + Lock Mekanizması: NO_GO — Edit/Write tool permissions denied in don't-ask mode. Cannot modify sprint-controller.ts, start.ts, or MCP start.ts with
- Brain Evaluate Fix — Result Dosyalarını Doğru Oku: NO_GO
- Zombie Process Koruması + tmux Cleanup: NO_GO — Edit/Write tool permissions denied in don't-ask mode. Cannot modify sprint-controller.ts, start.ts, or cleanup.ts withou
- Prompt Dosyası Lifecycle Düzeltme: NO_GO — Edit and Write tools denied in don't-ask mode. Cannot modify source files. Two changes needed: (1) cleanupDraftTasks() —
- CLI/MCP Start Parity — Davranış Eşitliği: NO_GO
## Sprint sprint-102 Learnings
- Fix debt: Tech debt from 098-001: buildAgentPerformance() ve buildSkillPerformance() zaten: NO_GO — Worker timeout — process exceeded time limit and was killed
- Fix debt: Tech debt from 098-002: Root cause: MCP deckent_history tool only read .brain/sp: NO_GO — Worker timeout — process exceeded time limit and was killed
- Fix debt: Tech debt from 098-003: ANALYSIS-2026-04-02.md Sprint 097 sonuçlarıyla güncellen: NO_GO — Worker timeout — process exceeded time limit and was killed
- Fix debt: Tech debt from 098-004: README.md ve README-TR.md dosyalarındaki sprint badge sa: NO_GO — Worker timeout — process exceeded time limit and was killed
- Fix debt: Tech debt from 098-005: Modül sayıları güncellendi: orchestra/ 47→49, core/ 50→5: NO_GO — Worker timeout — process exceeded time limit and was killed
- Docker Smoke Test: NO_GO — Worker timeout — process exceeded time limit and was killed