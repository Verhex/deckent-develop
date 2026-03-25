# DIRECTIVES — Sprint 059: CLI + MCP Beta Readiness (Final Polish)

## Goal: Beta'yı engelleyen 4 kritik blokajı çöz: (1) Prompt Engine fix — agent activation, skill selection, scope, boilerplate azaltma, (2) Multi-provider CLI fix — spawn/kill/run/doctor/watch Codex/Gemini desteği, (3) MCP expansion — 6 yeni tool + 4 yeni resource, (4) Format tutarlılığı + dead code + sync genişleme + doc updater fix. cli-deep-analysis.md'deki Sprint 056-058 değişikliklerini [DONE] olarak işaretle. Beta readiness %64 → %90+ hedef.

---

## Task 1: cli-deep-analysis.md Full [DONE] Marking + Doğrulama
- Model: sonnet
- Effort: high
- Files: docs/analysis/cli-deep-analysis.md
- Scope: docs/analysis/

### Description
Sprint 056-058'de yapılan ~130 CLI iyileştirmesi kod tabanında doğrulandı ama cli-deep-analysis.md'de [DONE] olarak işaretlenmemiş. Tüm doğrulanmış önerileri işaretle.

Her komut bölümündeki "Geliştirme Önerileri" listesini tara. Sprint 056-058'de yapılan her değişiklik için:
1. Kaynak kodda grep ile doğrula (fonksiyon/flag/import mevcut mu)
2. Mevcutsa `[DONE]` prefix'i ekle ve `*Sprint 05X: kısa açıklama*` notu koy
3. Mevcut değilse açık bırak

Özellikle şu komutlar için Sprint 056-058 değişikliklerini işaretle:
- init (deepMerge, .deck security, provider wizard, auto lang, recommendation, re-init, error recovery)
- plan (async checkUsage, --dry-run, idempotency, safeguard, parser, i18n, context priority)
- start (wait timeout, spawn retry, zero-config, phase persistence, provider cache, sandbox)
- status (standalone, ETA, NO_COLOR, fs.watch, --json+verbose, budget check, alert, stale uyarı)
- doctor (tmux conditional, .deck check, auth, stale lock hint, disk/permission, memory info, error registry)
- retro (i18n, --trend, agent/skill perf parse, learnings kalite, arşivleme, regex fix)
- cleanup (budget uyarısı, --decay combo, lock guard, çift geçiş fix, truncation, sprint parse, archive fix)
- usage (token tahmin, race condition, canlı usage, --since/--last, trend, task-level, provider, temizlik, fiyat, subscription)
- history (--json, --last, agent/skill writeSprintLog, dead code, numeric sort, archive, usage, format tutarlılık)
- config (list/keys, autoMigrate, validation mesaj, JSON comment import, env var, --raw, modes migration, backup)
- review+finalize (interactive, retry→respawn, entegrasyon, state kalıcılık, completion guard, mixed sprint, duplicate, --approve-all)
- serve (rate limit, body size, deepMerge, auth token, API versioning, CORS dynamic, SSE reconnect, multi-sprint job)
- run+test+web (--timeout, --keep, --auto-approve, agent/skill inject, --verbose, --directives, --sandbox, --model, CI format, MIME, build check, --dev proxy)
- sync+onboard+upgrade (Gemini/Cursor adapter, git date, memory limit, --json, --dry-run, wizard→init, api mode, detectStack, --force, semver, rollback, install strategy, --canary/--beta)
- agent+skill+plugin+marketplace+archive-debt (stats, trigger, systemPrompt, model seçimi, checksum, version pin, update, --stats, node_modules, remove, update, entrypoint, conflict, cache, semver, --dry-run, --before, rotation, parse tutarlılık)
- dashboard+attach+watch (status duplikasyon, fs.watch, terminal adapt, agent/skill info, usage, --list, nested tmux, cleanup temizle, follow hata, re-attach, split ratio, analyzer merge/cache/git fallback, decay parse)

Sonunda istatistik tablosunu güncelle: toplam çözülen / kalan sayısı.

**Test:** Bu task test gerektirmez — dokümantasyon güncellemesi.

---

## Task 2: Agent Activation Fix — forceModel Agent Bypass Kaldır
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-controller.ts, src/orchestra/task-builder.ts, src/core/agent-pool.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
**P0 KRİTİK** — 8 tanımlı agent var ama hiçbiri kullanılmıyor. Kök neden: sprint-controller.ts'te `forceModel` varsa `assignedAgent = 'generic'` atanıyor.

**A) forceModel → Agent Bypass Kaldır:**
sprint-controller.ts'teki agent seçim logic'ini değiştir: forceModel olsa bile selectAgent çalışsın, sadece model override'ı korunsun. Agent seçimi model'den bağımsız olmalı.

**B) Agent systemPrompt'larını Yaz:**
`.deckent/agents/*/agent.json` dosyalarındaki `systemPrompt` alanlarını zenginleştir. 8 agent için domain-specific prompt (100-200 kelime): security-auditor (OWASP), test-writer (edge cases, coverage), doc-writer (clear docs), bug-fixer (root cause), code-reviewer (bugs, perf), refactorer (structure), api-builder (RESTful), performance-analyzer (bottlenecks).

**C) resolveAgentPrompt Güncelle:**
task-builder.ts buildWorkerPrompt'ta agent block oluşturulurken systemPrompt'u da dahil et. PROMPT.md + systemPrompt birleştir.

**D) Agent Stats Güncelleme:**
Sprint sonrası updateAgentStats(): totalUses++, successRate hesapla.

**Test:** 12+ test

---

## Task 3: Skill Selection Fix — Task-Specific Seçim + Truncation
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-controller.ts, src/orchestra/task-builder.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**P0 KRİTİK** — Her prompt'a aynı 3 skill inject ediliyor. Skill'ler cümle ortasında truncate ediliyor.

**A) Task-Specific Skill Seçimi:**
selectSkills() fonksiyonunu iyileştir. Task scope + title + description'a göre farklı skill seti seç. Mevcut score mekanizmasını iyileştir, generic fallback'i azalt.

**B) Skill Truncation Fix:**
task-builder.ts'te skill content truncation'ı paragraf/bölüm sınırında yap (cümle ortasında kesme).

**C) Skill Budget Dinamik:**
Task effort'una göre skill budget ayarla: high → 2000, normal → 1500, low → 1000.

**Test:** 10+ test

---

## Task 4: Scope & GO/NO-GO Fix — filesWrite + Criteria Enrichment
- Model: opus
- Effort: high
- Files: src/orchestra/task-builder.ts, src/orchestra/sprint-controller.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**A) filesWrite Test Dosyası Ekleme:**
Task scope.directories'de `tests/` varsa, filesWrite'a da test pattern ekle.

**B) GO/NO-GO Criteria DIRECTIVES'ten Al:**
DIRECTIVES.md'deki task'larda `Test:` satırı var (ör: "10+ test"). Bunu goNogo.goCriteria'ya taşı.

**C) Scope Directories'e docs/ Dahil Et:**
DIRECTIVES'te scope alanında `docs/` veya `CHANGELOG.md` varsa task JSON directories'e aktar.

**Test:** 8+ test

---

## Task 5: Prompt Boilerplate Azaltma + Worker Guide
- Model: sonnet
- Effort: high
- Files: src/orchestra/task-builder.ts, .deckent/workspace/WORKER-GUIDE.md
- Scope: src/orchestra/, .deckent/, tests/orchestra/

### Description
**A) Worker Guide Dosyası:**
`.deckent/workspace/WORKER-GUIDE.md` oluştur/güncelle. Heartbeat format, result format, error handling kurallarını buraya taşı.

**B) buildWorkerPrompt Kısalt:**
Heartbeat JSON template, result JSON template, "If Something Goes Wrong" bölümünü prompt'tan kaldır. Yerine tek satır referans koy.

**C) Prompt Boyutu Hedefi:**
Mevcut ~150 satır / ~6.5KB → Hedef: ~80 satır / ~3.5KB. Task description oranı %16 → %35.

**Test:** 5+ test

---

## Task 6: spawn+kill+run Multi-Provider Desteği
- Model: opus
- Effort: high
- Files: src/cli/commands/spawn.ts, src/cli/commands/kill.ts, src/cli/commands/run.ts
- Scope: src/cli/commands/, src/orchestra/, tests/cli/commands/

### Description
**P0 KRİTİK** — 3 komut sadece tmux (Claude) ile çalışıyor. Codex/Gemini subprocess worker'lar yönetilemiyor.

**A) spawn Multi-Provider:**
Task'ın provider'ına göre spawn yöntemini seç: claude → tmux (mevcut), codex/gemini → ProviderAdapter.spawn() veya SpawnBackend. `getProviderForModel()` ile provider tespit et.

**B) kill Multi-Provider:**
Subprocess worker'lar için: PID-based kill (task JSON'da pid kaydedilmeli) veya adapter.kill(). tmux worker yoksa subprocess approach dene.

**C) run Multi-Provider:**
Provider routing: `--model` flag'inden provider tespit et, uygun backend ile spawn et.

**Test:** 10+ test

---

## Task 7: doctor+watch Provider-Aware Fix
- Model: sonnet
- Effort: high
- Files: src/cli/commands/doctor.ts, src/cli/commands/watch.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
**A) doctor tmux Conditional:**
tmux check'i sadece claude provider kullanılıyorsa required olsun. Config'den `brain_provider` ve `worker_provider` oku, sadece claude ise tmux zorunlu.

**B) watch Subprocess Log Viewer:**
tmux split pane yerine subprocess worker log dosyasını tail et. Log dosyası yolu: `.tasks/task-{id}.log`.

**Test:** 8+ test

---

## Task 8: MCP Tools Expansion (+6 tools)
- Model: opus
- Effort: high
- Files: src/mcp/tools/config.ts (new), src/mcp/tools/usage.ts (new), src/mcp/tools/review.ts (new), src/mcp/tools/run.ts (new), src/mcp/tools/kill.ts (new), src/mcp/tools/cleanup.ts (new), src/mcp/tools/index.ts
- Scope: src/mcp/, tests/mcp/

### Description
6 yeni MCP tool ekle. Her tool mevcut CLI komutunun fonksiyonalitesini MCP'ye taşır:

**A) deckent_config:** Config read (default: resolved config), config set (key+value), config get (key). Input: { action: 'read'|'set'|'get', key?, value? }
**B) deckent_usage:** Mevcut sprint usage bilgisi. Input: { sprintId? }. Output: token/call/cost tablo.
**C) deckent_review:** Sprint review başlat. Input: { auto?: boolean }. Output: review decisions.
**D) deckent_run:** Tek seferlik task çalıştır. Input: { description, model?, scope? }. Output: jobId + result.
**E) deckent_kill:** Worker durdur. Input: { taskId? , all?: boolean }. Output: killed count.
**F) deckent_cleanup:** Sprint temizliği. Input: { decay?: boolean, dryRun?: boolean }. Output: cleaned files.

Tüm tool'ları `src/mcp/tools/index.ts`'de register et. Enriched response pattern kullan.

**Test:** 12+ test

---

## Task 9: MCP Resources Expansion (+4 resources)
- Model: sonnet
- Effort: high
- Files: src/mcp/resources/retro.ts (new), src/mcp/resources/usage.ts (new), src/mcp/resources/tasks.ts (new), src/mcp/resources/agents.ts (new), src/mcp/resources/index.ts
- Scope: src/mcp/, tests/mcp/

### Description
4 yeni MCP resource ekle:

**A) deckent://retro:** RETRO.md içeriğini döndür.
**B) deckent://usage:** Mevcut sprint usage JSON'ı.
**C) deckent://tasks:** Aktif task listesi (.tasks/*.json).
**D) deckent://agents:** Agent pool listesi (.deckent/agents/).

Tüm resource'ları index.ts'de register et.

**Test:** 8+ test

---

## Task 10: MCP Tool Quality — Enrichment + Error Handling
- Model: sonnet
- Effort: high
- Files: src/mcp/helpers/enrich.ts, src/mcp/helpers/format.ts, src/mcp/tools/*.ts
- Scope: src/mcp/, tests/mcp/

### Description
Mevcut + yeni tüm MCP tool'ların kalitesini artır:

**A) Enriched Response:** Her tool response'una `_enriched: { summary, hints[], timestamp }` ekle (mevcut pattern'i yeni tool'lara uygula).
**B) Error Handling:** Tüm tool'larda tutarlı try/catch + anlamlı hata mesajları.
**C) Input Validation:** Zod schema ile input validation (mevcut tool'larda eksik olanları ekle).

**Test:** 6+ test

---

## Task 11: Format Tutarlılığı + Dead Code Temizliği
- Model: sonnet
- Effort: high
- Files: src/orchestra/sprint-reporter.ts, src/cli/commands/history.ts, src/cli/commands/archive-debt.ts, src/orchestra/debt-manager.ts
- Scope: src/orchestra/, src/cli/commands/, tests/

### Description
**A) Sprint Log Header Tutarlılığı:**
sprint-reporter.ts writeSprintLog ve history.ts parseSprintLog arasındaki header naming tutarlı olsun.

**B) loadLearningData Dead Code:**
history.ts'deki `loadLearningData()` — `.brain/learning/` hiçbir yerde oluşturulmuyor. Fonksiyonu sil.

**C) parseDebtTable Birleştirme:**
archive-debt.ts ve debt-manager.ts'de ayrı parser var. core/utils.ts'deki `parseDebtTable` canonical olsun, archive-debt bunu import etsin.

**Test:** 6+ test

---

## Task 12: Sync Genişleme (Gemini/Cursor/Codex Adapters)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/sync.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
Sync sadece CLAUDE.md ve AGENTS.md güncelliyor. Diğer provider adapter dosyalarını da dahil et:

**A) GEMINI.md Sync:** DECKENT.md referansını GEMINI.md'ye de ensure et (ensureDeckentImport pattern).
**B) .cursor/rules/ Sync:** .cursor/rules/ dizinindeki dosyaları DECKENT.md referansıyla güncelle.
**C) Codex Config Sync:** .codex/ dizini varsa AGENTS.md benzeri sync yap.
**D) Provider-Specific Config Mapping:** Her provider'ın config formatına uygun sync yapısı.

**Test:** 8+ test

---

## Task 13: Doc Updater Fix + CHANGELOG Konsolidasyonu
- Model: sonnet
- Effort: high
- Files: src/orchestra/doc-updaters/sprint-log.ts, src/orchestra/doc-updaters/changelog.ts, CHANGELOG.md, docs/release/changelog.md, docs/SPRINT-LOG.md
- Scope: src/orchestra/doc-updaters/, docs/, tests/orchestra/doc-updaters/

### Description
**A) sprint-log.ts Path Fix:**
targetFile satırı `docs/archive/SPRINT-LOG.md` diyor ama gerçek write `docs/SPRINT-LOG.md` yapıyor. Tutarlı hale getir.

**B) Root CHANGELOG.md Konsolidasyonu:**
Root CHANGELOG.md stale. Canonical dosya docs/release/changelog.md. Root dosyayı referansa çevir.

**C) Sprint 055-058 CHANGELOG Entry:**
docs/release/changelog.md'ye Sprint 055-058 entry'lerini ekle.

**Test:** 5+ test

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression (11,000+ test geçmeli)
- Her task test VE implementasyon birlikte yazmalı
- MCP: 16 tool + 9 resource çalışır durumda olmalı
- Multi-provider: doctor Codex/Gemini kurulumda PASS vermeli
- Prompt engine: Worker prompt'unda agent systemPrompt + task-specific skills görülmeli
- %100 GO hedefli — NO_GO KABUL EDİLMEZ
