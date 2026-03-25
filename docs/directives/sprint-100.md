# DIRECTIVES — Sprint 100: Prompt Engine Fix + CLI Perfection (Sprint 056 Borcu Dahil)

## Goal: Prompt analizi 8 kritik bulguyu düzelt (agent activation, skill selection, scope fix, GO/NO-GO, boilerplate). Sprint 056'dan kalan 20 PENDING CLI perfection task'ı tamamla. Prompt kalitesi 2.9/5 → 4.5/5 hedef. Her task test VE implementasyon birlikte.

---

## Task 1: Agent Activation Fix — forceModel Agent Bypass Kaldır
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-controller.ts, src/orchestra/task-builder.ts, src/core/agent-pool.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
**P0 KRİTİK** — 8 tanımlı agent var ama hiçbiri kullanılmıyor. Kök neden: sprint-controller.ts:557-564'te `forceModel` varsa `assignedAgent = 'generic'` atanıyor.

**A) forceModel → Agent Bypass Kaldır:**
`sprint-controller.ts` satır 557-564'teki logic'i değiştir: forceModel olsa bile selectAgent çalışsın, sadece model override'ı korunsun. Agent seçimi model'den bağımsız olmalı.

```typescript
// ÖNCE (hatalı):
if (!task.forceModel) {
  const result = selectAgent(task, pool);
  task.assignedAgent = result.agent?.id ?? 'generic';
} else {
  task.assignedAgent = 'generic'; // ← SORUN
}

// SONRA (düzeltilmiş):
const result = selectAgent(task, pool);
task.assignedAgent = result.agent?.id ?? 'generic';
if (!task.forceModel && result.agent?.preferredModel) {
  task.model = result.agent.preferredModel;
}
```

**B) Agent systemPrompt'larını Yaz:**
`.deckent/agents/*/agent.json` dosyalarına `systemPrompt` string alanı ekle. 8 agent için domain-specific prompt (100-200 kelime):
- security-auditor: OWASP top 10, injection, auth
- test-writer: edge cases, coverage, mocking
- doc-writer: clear docs, examples, API reference
- bug-fixer: root cause, minimal fix, error logs
- code-reviewer: bugs, performance, readability
- refactorer: structure without behavior change
- api-builder: RESTful, validation, error handling
- performance-analyzer: bottlenecks, hot paths, profiling

**C) resolveAgentPrompt'u Güncelle:**
`task-builder.ts` buildWorkerPrompt'ta agent block oluşturulurken systemPrompt'u da dahil et. Mevcut PROMPT.md + yeni systemPrompt birleştir.

**D) Agent Stats Güncelleme:**
Sprint sonrası `updateAgentStats()`: totalUses++, successRate hesapla. `agent-pool.ts`'deki mevcut `AgentPoolManager`'ı kullan.

**Test:** 12+ test — agent atanması (forceModel ile), systemPrompt varlığı, prompt injection, stats update.

---

## Task 2: Skill Selection Fix — Task-Specific Seçim + Truncation Fix
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-controller.ts, src/orchestra/task-builder.ts, src/orchestra/multi-agent.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**P0 KRİTİK** — Her prompt'a aynı 3 skill inject ediliyor. Skill'ler cümle ortasında truncate ediliyor.

**A) Task-Specific Skill Seçimi:**
`selectSkills()` fonksiyonunu iyileştir. Task scope + title + description'a göre farklı skill seti seç:
- `init.ts` → typescript-expert + cli-expert (testing-expert yerine)
- doc task → documentation-writer + changelog-expert (ts-expert yerine)
- API task → api-expert + testing-expert
- Bug fix → bug-fix-expert + testing-expert
Mevcut `selectSkills` score mekanizmasını iyileştir, generic fallback'i azalt.

**B) Skill Truncation Fix:**
`task-builder.ts` satır 344'te `sp.content.slice(0, maxChars)` cümle ortasında kesiyor. Paragraf/bölüm sınırında kes:
```typescript
// Paragraf sınırında kes
const lastParagraph = truncated.lastIndexOf('\n\n');
if (lastParagraph > maxChars * 0.6) {
  truncated = truncated.slice(0, lastParagraph);
}
```

**C) Skill Budget Dinamik:**
SKILL_DEFAULT_MAX'i task effort'una göre ayarla: high → 2000, normal → 1500, low → 1000.

**Test:** 10+ test — task-specific seçim, truncation paragraf sınırı, budget dinamik.

---

## Task 3: Scope & GO/NO-GO Fix — filesWrite + Criteria Enrichment
- Model: opus
- Effort: high
- Files: src/orchestra/task-builder.ts, src/orchestra/sprint-controller.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**P1** — Worker'a test yazması söylenip filesWrite'a test dosyası eklenmiyor. GO/NO-GO kriterleri generic.

**A) filesWrite Test Dosyası Ekleme:**
`createTask()` veya `plannerTaskToParams()` fonksiyonunda: scope.directories'de `tests/` veya benzeri test directory varsa, filesWrite'a da test pattern ekle. Veya filesWrite kısıtlamasını directories kapsamına genişlet.

**B) GO/NO-GO Criteria DIRECTIVES'ten Al:**
DIRECTIVES.md'deki task'larda `Test:` satırı var (ör: "10+ test"). Bunu goNogo.goCriteria'ya taşı. Mevcut generic "Tests pass" yerine "10+ test pass, tsc --noEmit clean" gibi spesifik kriter.

**C) Scope Directories'e docs/ Dahil Et:**
DIRECTIVES'te scope alanında `docs/` veya `CHANGELOG.md` varsa task JSON directories'e aktar. Mevcut logic sadece `src/` prefix'li dizinleri alıyor olabilir.

**Test:** 8+ test — filesWrite test inclusion, goNogo enrichment, scope docs inclusion.

---

## Task 4: Prompt Boilerplate Azaltma + Worker Guide Referans
- Model: sonnet
- Effort: normal
- Files: src/orchestra/task-builder.ts, .deckent/workspace/WORKER-GUIDE.md
- Scope: src/orchestra/, .deckent/, tests/orchestra/

### Description
**P2** — Her prompt'un %44'ü aynı boilerplate (heartbeat template, result template, scope rules, error handling). 66 satır → 15 satıra düşür.

**A) Worker Guide Dosyası:**
`.deckent/workspace/WORKER-GUIDE.md` dosyasını oluştur (veya güncelle). Heartbeat format, result format, error handling kurallarını buraya taşı. Prompt'ta sadece referans ver:
```
See .deckent/workspace/WORKER-GUIDE.md for heartbeat, result, and error handling templates.
```

**B) buildWorkerPrompt Kısalt:**
Heartbeat JSON template, result JSON template, "If Something Goes Wrong" bölümünü prompt'tan kaldır. Yerine tek satır referans koy. Sadece task-specific bilgiyi koru: task description, scope rules, what to do.

**C) Prompt Boyutu Hedefi:**
Mevcut: ~150 satır / ~6.5KB → Hedef: ~80 satır / ~3.5KB. Task description oranı %16 → %35.

**Test:** 5+ test — prompt boyutu assertion, referans varlığı, task description oranı.

---

## Task 5: Doc Updater Referans Fix + CHANGELOG Konsolidasyonu (Sprint 056 Task 1)
- Model: sonnet
- Effort: high
- Files: src/orchestra/doc-updaters/sprint-log.ts, src/orchestra/doc-updaters/changelog.ts, CHANGELOG.md, docs/release/changelog.md
- Scope: src/orchestra/doc-updaters/, docs/, CHANGELOG.md, tests/orchestra/doc-updaters/

### Description
Doc updater'larda path uyumsuzluğu var ve root CHANGELOG.md stale.

**A) sprint-log.ts Path Fix:**
`targetFile` satırı `docs/archive/SPRINT-LOG.md` diyor ama gerçek write `join(projectRoot, 'docs', 'SPRINT-LOG.md')` yapıyor. İkisini tutarlı hale getir — `docs/SPRINT-LOG.md` canonical olsun.

**B) Root CHANGELOG.md Konsolidasyonu:**
Root `CHANGELOG.md` stale. Canonical dosya `docs/release/changelog.md`. Root dosyayı referansa çevir veya güncel kopyala.

**C) Sprint 055+056+057 CHANGELOG Entry:**
docs/release/changelog.md'ye son sprint entry'lerini ekle.

**Test:** 5+ test

---

## Task 6: init Bug Fix — deepMerge + .deck Security + Provider Wizard (Sprint 056 Task 2)
- Model: opus
- Effort: high
- Files: src/cli/commands/init.ts, src/core/deck-file.ts
- Scope: src/cli/commands/, src/core/, tests/cli/commands/

### Description
init komutunda 4 bug/eksiklik:

**A) Config Merge Sığ → deepMerge:**
`Object.assign(existing, newConfig)` sığ merge → nested field'lar eziliyor. `deepMerge` import edip kullan.

**B) .deck Güvenlik:**
`createDeckTemplate()` `.deck` dosyasını oluşturuyor ama `.gitignore`'a eklemiyor. `ensureDeckGitignore()` init akışına ekle.

**C) Provider Wizard --auto Incomplete:**
`fallback_provider` atanmıyor. İkinci bulunan provider'ı fallback olarak ata.

**D) analyzeProject() Çift Çağrı:**
Satır 240 + satır 455 çift çağrı. İkinci çağrıyı kaldır.

**Test:** 10+ test

---

## Task 7: init UX — Auto Lang, Recommendation, Re-init, Error Recovery (Sprint 056 Task 3)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/init.ts, src/cli/auto-setup.ts
- Scope: src/cli/commands/, src/cli/, tests/cli/commands/

### Description
**A) --auto Dil Algılama:** Sistem locale'inden algıla.
**B) Recommendation Gösterimi:** Auto mode sonunda önerileri listele.
**C) DECKENT.md Build/Test Dinamik:** analyzeProject() sonucundan al.
**D) Re-init Desteği:** `--upgrade` flag.
**E) --env ve Otomatik Detect Çakışması:** Mevcut env dosya varsa uyar.
**F) Error Recovery:** Hangi adımın başarısız olduğunu belirt.

**Test:** 10+ test

---

## Task 8: plan Core — Async Usage, Dry-Run, Idempotency, Safeguard (Sprint 056 Task 4)
- Model: opus
- Effort: high
- Files: src/cli/commands/plan.ts, src/orchestra/sprint-controller.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
**A) checkUsage() Async:** Blocking spawnSync → async checkUsageWithProvider().
**B) --dry-run Flag:** Task JSON'ları diske yazmadan planı göster.
**C) confirmDraftTasks İdempotency:** Plan başında mevcut DRAFT task'ları sil.
**D) Auto Mode Fazla Task Safeguard:** DIRECTIVES task sayısının 2x'inden fazla → uyar.

**Test:** 10+ test

---

## Task 9: plan Quality — Parser, i18n, Context Priority, Error Logging (Sprint 056 Task 5)
- Model: sonnet
- Effort: high
- Files: src/orchestra/planner.ts, src/orchestra/task-builder.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**A) Structured Parser İyileştirmesi:** Bullet list / prose format desteği.
**B) Planner Prompt i18n:** config.language'a göre prompt dili.
**C) Context Truncation Önceliklendirme:** DIRECTIVES > MEMORY > DEBT > PATTERNS.
**D) Agent/Skill Selection Hata Logging:** debugLog() ile neden başarısız.
**E) Usage Safe Default İyileştirme:** Provider'a göre farklı default.

**Test:** 8+ test

---

## Task 10: start Core — Wait Timeout, Spawn Retry, Zero-Config, Phase Persistence (Sprint 056 Task 6)
- Model: opus
- Effort: high
- Files: src/cli/commands/start.ts, src/orchestra/sprint-controller.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
**A) waitForResults Configurable Timeout:** `config.sprint_timeout` veya `--timeout` flag.
**B) Spawn Retry Stratejisi:** Hata analizine göre model downgrade veya scope simplify.
**C) Zero-Config DIRECTIVES Çakışması:** Mevcut varsa sor veya `--force`.
**D) Phase Arası Durum Kaybı:** `.deckent/sprint-state.json` + orphan worker detection.

**Test:** 10+ test

---

## Task 11: start Quality — Provider Cache, Dashboard Usage, Cleanup, Watch (Sprint 056 Task 7)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/start.ts, src/orchestra/sprint-controller.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
**A) Provider Bootstrap Cache:** `.deckent/provider-cache.json` (TTL: 1 saat).
**B) Dashboard Final Update Usage:** Son gerçek usage değerini koru.
**C) Zero-Config Cleanup Finally:** try/catch → finally.
**D) --watch Subprocess Alternatifi:** Log dosyasını tail et.
**E) --sandbox-mode:** Git stash + restore basit sandbox.
**F) Fix Phase Timeout:** Config'den ayarlanabilir.

**Test:** 8+ test

---

## Task 12: status Overhaul — Standalone, ETA, NO_COLOR, fs.watch, Verbose (Sprint 056 Task 8)
- Model: opus
- Effort: high
- Files: src/cli/commands/status.ts, src/cli/helpers/output.ts
- Scope: src/cli/commands/, src/cli/helpers/, tests/cli/

### Description
**A) .dashboard Yoksa Standalone:** Task dosyalarından standalone status.
**B) startedAt → ETA:** Sprint start anını kaydet, ETA hesapla.
**C) NO_COLOR Desteği:** `process.env.NO_COLOR` veya `--no-color` flag.
**D) Watch Mode fs.watch:** setInterval → fs.watch.
**E) --json + --verbose Birlikte:** JSON'a verbose bilgi ekle.
**F) readSprintMeta Regex:** Daha toleranslı.
**G) Budget Check:** Gerçek .brain/ boyutu.
**H) Alert Detayı:** Alert mesajlarını göster.
**I) ETA weighted average:** Son N task hızına göre.
**J) Progress Stale Uyarı:** Dashboard/task tutarsızlığı.

**Test:** 12+ test

---

## Task 13: doctor Improvements — tmux Conditional, .deck Check, Auth, Hints (Sprint 056 Task 9)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/doctor.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
**A) tmux required Multi-Provider Fix:** Codex/Gemini → tmux gerekmez.
**B) .deck Güvenlik Kontrolü:** git tracked ise uyar.
**C) Claude CLI Auth Kontrolü:** Version + auth durumu.
**D) Stale Lock Temizleme Önerisi.**
**E) Disk/Permission Check.**
**F) Memory Bilgisi Tekrarlama Kaldır.**
**G) countOpenDebtItems Tekrar Okuma Fix.**
**H) Error Registry Tutarlılık.**

**Test:** 10+ test

---

## Task 14: retro+explain Quality — Dil, Trend, Agent/Skill, Learnings (Sprint 056 Task 10)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/retro.ts, src/cli/commands/explain.ts, src/orchestra/sprint-reporter.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
**A) Retro Dil Desteği:** config.language kontrol.
**B) --trend Flag:** Son N sprint trend.
**C) Agent/Skill Performance CLI Parse.**
**D) MEMORY.md Learnings Kalitesi:** task.notes dahil et.
**E) Retro Arşivleme:** Overwrite → archive.
**F) Explain Regex Fragile Fix.**
**G) Sprint Log Parse Fragile Fix.**

**Test:** 10+ test

---

## Task 15: cleanup+decay Overhaul — Auto Decay, Combo, Lock Guard, Archive (Sprint 056 Task 11)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/cleanup.ts, src/orchestra/debt-manager.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
**A) Budget Uyarısı.**
**B) --decay + Normal Cleanup Combo.**
**C) Aktif Lock Koruması.**
**D) Task Dosyası Çift Geçiş Fix.**
**E) Decay Truncation İyileştirme:** Sprint başlıkları koru.
**F) Decay Sprint Number Parse Fix.**
**G) Archive .gitignore Fix.**

**Test:** 8+ test

---

## Task 16: usage Overhaul — Real Tokens, Race Condition, Live Usage, Filters (Sprint 056 Task 12)
- Model: opus
- Effort: high
- Files: src/cli/commands/usage.ts, src/core/usage-tracker.ts
- Scope: src/cli/commands/, src/core/, tests/

### Description
**A) Token Tahminleri İyileştirme:** Model bazlı (opus ~15K, sonnet ~8K, haiku ~3K).
**B) recordCall Race Condition:** File lock veya append-only.
**C) Canlı Usage Gösterimi.**
**D) --since / --last Filtre.**
**E) Sprint Arası Karşılaştırma.**
**F) Task-Level Granularity.**
**G) Provider Ayrımı.**
**H) Usage Dosyası Temizlik.**
**I) Maliyet Fiyatları Config'den.**
**J) Subscription Modda Kullanım Yüzdesi.**

**Test:** 12+ test

---

## Task 17: history Overhaul — --json, --last, Agent/Skill, Dead Code, Format (Sprint 056 Task 13)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/history.ts, src/orchestra/sprint-reporter.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
**A) --json Flag.**
**B) --last N Flag.**
**C) writeSprintLog Agent/Skill Bilgisi.**
**D) loadLearningData Dead Code Sil.**
**E) Numeric Sort.**
**F) Archive Sprint Gösterimi.**
**G) Usage Bilgisi Entegrasyonu.**
**H) Sprint Log İçeriği Zenginleştirme.**
**I) Parse ↔ Write Format Tutarlılığı.**
**J) Sprint Log İçeriği Fakir Fix.**

**Test:** 10+ test

---

## Task 18: config Quality — list/keys, autoMigrate, Validation, Env Var (Sprint 056 Task 14)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/config.ts, src/core/config.ts, src/core/config-migration.ts
- Scope: src/cli/commands/, src/core/, tests/

### Description
**A) config list / config keys.**
**B) autoMigrateOnLoad.**
**C) Validation Hata Mesajı İyileştirme.**
**D) JSON Comment Import Desteği.**
**E) Env Var Override Genişlet:** DECKENT_MODE, DECKENT_LANGUAGE.
**F) --raw Flag.**
**G) Migration modes Atlanıyor Fix.**
**H) Backup Temizliği:** Timestamp'li backup.

**Test:** 10+ test

---

## Task 19: review+finalize Overhaul — Interactive, Retry, Guard, Duplicate (Sprint 056 Task 15)
- Model: opus
- Effort: high
- Files: src/cli/commands/review.ts, src/cli/commands/finalize.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
**A) Interactive Review:** Her task için approve/reject/retry prompt.
**B) Retry → Respawn.**
**C) Review → Finalize Entegrasyonu.**
**D) Review State Kalıcılık:** `.brain/reviews/`.
**E) "retry" Decision Kullanılsın.**
**F) Finalize Completion Guard:** EXECUTING/CLAIMED varsa uyar.
**G) Mixed Sprint Detection.**
**H) Duplicate Finalize Koruması.**
**I) --approve-all / --reject-all Shortcuts.**

**Test:** 12+ test

---

## Task 20: serve Security — Rate Limit, Body Size, DeepMerge, Auth, Versioning (Sprint 056 Task 16)
- Model: opus
- Effort: high
- Files: src/api/server.ts, src/api/watcher.ts
- Scope: src/api/, tests/api/

### Description
**A) Rate Limiting:** IP bazlı, 100 req/min, 429 response.
**B) Body Size Limit:** Max 1MB, 413 response.
**C) /api/config POST DeepMerge.**
**D) Auth Token Auto-Generate:** crypto.randomUUID().
**E) API Versioning:** /api/v1/ prefix.
**F) CORS Dynamic.**
**G) SSE Reconnection:** retry field.
**H) Job Tracking Multi-Sprint:** Map<jobId, JobState>.

**Test:** 10+ test

---

## Task 21: run+test+web Flags — Timeout, Keep, Sandbox, CI, MIME (Sprint 056 Task 17)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/run.ts, src/cli/commands/test-run.ts, src/cli/commands/serve.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
**A) run --timeout.**
**B) run --keep.**
**C) run --auto-approve.**
**D) run Agent/Skill Injection.**
**E) run --verbose.**
**F) test --directives <file>.**
**G) test --sandbox.**
**H) test --model <model>.**
**I) test CI Çıktı Formatı.**
**J) web MIME Type Genişlet.**
**K) web Build Check.**
**L) web --dev Proxy.**

**Test:** 10+ test

---

## Task 22: sync+onboard+upgrade Polish (Sprint 056 Task 18)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/sync.ts, src/cli/commands/onboard.ts, src/cli/commands/upgrade.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
**A) Sync: Gemini/Cursor Adapter.**
**B) Sync: Git Commit Date.**
**C) Sync: MEMORY.md Şişme Limiti.**
**D) Sync: --json + --dry-run.**
**E) Onboard: Wizard → Init Argüman.**
**F) Onboard: API Mode.**
**G) Onboard: detectProjectStack().**
**H) Onboard: --force.**
**I) Upgrade: Semver Library.**
**J) Upgrade: Rollback.**
**K) Upgrade: Install Strategy Detection.**
**L) Upgrade: --canary / --beta.**

**Test:** 12+ test

---

## Task 23: agent+skill+plugin+marketplace+archive-debt Completeness (Sprint 056 Task 19)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/agent.ts, src/cli/commands/skill.ts, src/cli/commands/plugin.ts, src/cli/commands/archive-debt.ts
- Scope: src/cli/commands/, src/core/, tests/cli/commands/

### Description
**A) Agent: stats Command.**
**B) Agent: Trigger Pattern Validation.**
**C) Agent: systemPrompt Field.**
**D) Agent: Model Seçimi Create'de.**
**E) Skill: Git Install Checksum.**
**F) Skill: Version Pinning.**
**G) Skill: update Command.**
**H) Skill: --stats Flag.**
**I) Skill: node_modules Exclude.**
**J) Plugin: remove + update.**
**K) Plugin: Entrypoint Validation.**
**L) Plugin: Conflict Detection.**
**M) Marketplace: Registry Cache.**
**N) Marketplace: Semver Validation.**
**O) Archive-debt: --dry-run + --before + rotation.**
**P) Archive-debt: parseDebtTable Tutarlılık.**

**Test:** 15+ test

---

## Task 24: dashboard+attach+watch+cross-cutting (Sprint 056 Task 20)
- Model: sonnet
- Effort: high
- Files: src/cli/commands/dashboard.ts, src/cli/commands/attach.ts, src/cli/commands/watch.ts, src/cli/commands/analyze.ts, src/core/analyzer.ts
- Scope: src/cli/commands/, src/core/, src/orchestra/, tests/

### Description
**A) Dashboard + Status Duplikasyon Fix.**
**B) Dashboard fs.watch.**
**C) Dashboard Terminal Adapt:** process.stdout.columns.
**D) Dashboard Agent/Skill Bilgisi.**
**E) Dashboard Usage Metriği.**
**F) Attach: --list Flag.**
**G) Attach: Nested tmux.**
**H) Watch: Cleanup'ta Temizleme.**
**I) Watch: Follow Hata Mesajı.**
**J) Watch: Re-attach Fix.**
**K) Watch: Split Ratio Dinamik.**
**L) Analyzer Duplikasyon:** stack-detector.ts canonical.
**M) Analyzer Git Bağımlılık:** fs-based fallback.
**N) Analyzer Cache.**
**O) Decay Sprint Number Parse Fix.**

**Test:** 12+ test

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression (10,600+ test geçmeli)
- Her task test VE implementasyon birlikte yazmalı
- Task 1-4 (Prompt Engine) öncelikli — diğer task'lar bundan faydalanacak
- Prompt kalitesi 2.9/5 → 4.5/5 hedef
- %100 GO hedefli — NO_GO KABUL EDİLMEZ
