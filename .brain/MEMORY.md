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