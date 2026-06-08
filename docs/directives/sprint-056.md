# DIRECTIVES — Sprint 056: CLI Perfection Wave (Deep Analysis Full Completion)

## Goal: cli-deep-analysis.md'deki kalan 158 önerinin TAMAMINI uygula. P1 (42 kritik), P2 (76 orta), P3 (40 kozmetik) — CLI kusursuz hale gelecek. Sprint-055 tech debt temizliği dahil. Her task test + implementasyon birlikte.

---

## Task 1: Doc Updater Referans Fix + CHANGELOG Konsolidasyonu
- Model: sonnet
- Effort: high
- Files: src/orchestra/doc-updaters/sprint-log.ts, src/orchestra/doc-updaters/changelog.ts, CHANGELOG.md, docs/release/changelog.md
- Scope: src/orchestra/doc-updaters/, docs/, CHANGELOG.md, tests/orchestra/doc-updaters/

### Description
Doc updater'larda path uyumsuzluğu var ve root CHANGELOG.md stale.

**A) sprint-log.ts Path Fix:**
`targetFile` satırı `docs/archive/SPRINT-LOG.md` diyor ama gerçek write `join(projectRoot, 'docs', 'SPRINT-LOG.md')` yapıyor. İkisini tutarlı hale getir — `docs/SPRINT-LOG.md` canonical olsun, targetFile'ı düzelt.

**B) Root CHANGELOG.md Konsolidasyonu:**
Root `CHANGELOG.md` (314 satır, pre-sprint-23) stale. Canonical dosya `docs/release/changelog.md` (804 satır). Root dosyayı "See docs/release/changelog.md for full changelog" referansına çevir veya docs/release'den kopyala ve Sprint 055 entry'sini ekle.

**C) Sprint 055+056 CHANGELOG Entry:**
docs/release/changelog.md'ye Sprint 055 entry'si ekle: P0 bug fix (retro parse, kill status), DRY refactoring, 14 yeni CLI flag/komut.

**Test:** 5+ test — path tutarlılığı, CHANGELOG entry format, sprint-log write doğru dosyaya gittiğini doğrula.

---

## Task 2: init Bug Fix — deepMerge + .deck Security + Provider Wizard
- Model: opus
- Effort: high
- Files: src/cli/commands/init.ts, src/core/deck-file.ts
- Scope: src/cli/commands/, src/core/, tests/cli/commands/

### Description
init komutunda 4 bug/eksiklik:

**A) Config Merge Sığ → deepMerge:**
init'te `Object.assign(existing, newConfig)` sığ merge yapıyor. Nested field'lar (skill_routing, modes) eziliyor. `deepMerge` import edip kullan.

**B) .deck Güvenlik:**
`createDeckTemplate()` `.deck` dosyasını oluşturuyor ama `.gitignore`'a eklemiyor. `ensureDeckGitignore()` fonksiyonu var ama init akışında çağrılmıyor. Init akışına ekle.

**C) Provider Wizard --auto Incomplete:**
Çoklu provider tespit edilip `--auto` modda çalışıldığında `fallback_provider` atanmıyor. İlk bulunan provider brain+worker için ayarlanıyor ama fallback boş kalıyor. İkinci bulunan provider'ı fallback olarak ata.

**D) analyzeProject() Çift Çağrı:**
Satır 240'ta `detectedAnalysis` var, satır 455'te tekrar `analyzeProject()` çağrılıyor. İkinci çağrıyı kaldır, `detectedAnalysis`'i kullan.

**Test:** 10+ test

---

## Task 3: init UX — Auto Lang, Recommendation, Re-init, Error Recovery
- Model: sonnet
- Effort: high
- Files: src/cli/commands/init.ts, src/cli/auto-setup.ts
- Scope: src/cli/commands/, src/cli/, tests/cli/commands/

### Description
init UX iyileştirmeleri:

**A) --auto Dil Algılama:**
`--auto` modda dil her zaman `en`. Sistem locale'inden algıla: `Intl.DateTimeFormat().resolvedOptions().locale` veya `process.env.LANG`.

**B) Recommendation Gösterimi:**
`recommendation.reasons` dizisi dolu ama kullanıcıya gösterilmiyor. Auto mode sonunda önerileri listele.

**C) DECKENT.md Build/Test Dinamik:**
`Build: tsc`, `Test: npx vitest run` hardcode. `analyzeProject()` sonucundan build/test komutlarını al.

**D) Re-init Desteği:**
`writeIfNotExists` yüzünden tekrar init'te dosyalar güncellenmez. `--upgrade` flag ekle: mevcut dosyaları güncelle ama kullanıcı customization'ını koru (merge stratejisi).

**E) --env ve Otomatik Detect Çakışması:**
Her ikisi de dosya oluşturabilir. Mevcut env dosya varsa uyar.

**F) Error Recovery:**
Kısmi init'te ne yapılacağını göster. `--repair` flag veya en azından hata mesajında hangi adımın başarısız olduğunu belirt.

**Test:** 10+ test

---

## Task 4: plan Core — Async Usage, Dry-Run, Idempotency, Safeguard
- Model: opus
- Effort: high
- Files: src/cli/commands/plan.ts, src/orchestra/sprint-controller.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
plan komutunun çekirdek sorunları:

**A) checkUsage() Async:**
Mevcut `checkUsage()` `spawnSync` ile 10 saniye blocking. `checkUsageWithProvider()` async versiyonu var ama kullanılmıyor. plan.ts'de async versiyona geç.

**B) --dry-run Flag:**
Task JSON'larını diske yazmadan planı göster. Plan komutu her zaman diske yazıyor. `--dry-run` flag'i ile sadece çıktı göster.

**C) confirmDraftTasks İdempotency:**
Tekrar `deckent plan` çalıştırıldığında eski DRAFT task'lar temizlenmiyor. Plan başında mevcut DRAFT task'ları sil.

**D) Auto Mode Fazla Task Safeguard:**
AI planner fazla task üretirse kontrol yok. DIRECTIVES'teki task sayısının 2x'inden fazla task üretilirse uyar.

**Test:** 10+ test

---

## Task 5: plan Quality — Parser, i18n, Context Priority, Error Logging
- Model: sonnet
- Effort: high
- Files: src/orchestra/planner.ts, src/orchestra/task-builder.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
plan kalite iyileştirmeleri:

**A) Structured Parser İyileştirmesi:**
Sadece `## Task N:` formatını tanıyor. Bullet list veya prose formatındaki directive'leri de parse edebilmeli. En azından `- Task:` veya numaralı liste desteği.

**B) Planner Prompt i18n:**
Prompt Türkçe hardcode. `config.language` kontrol edip prompt dilini ayarla.

**C) Context Truncation Önceliklendirme:**
Satır limiti aşılınca basitçe kesiyor. Öncelik sırası: DIRECTIVES > MEMORY > DEBT > PATTERNS > diğer.

**D) Agent/Skill Selection Hata Logging:**
Sessiz catch. debugLog() ile neden başarısız olduğunu logla.

**E) Usage Safe Default İyileştirme:**
Başarısız olunca %50 varsayıyor. Provider'a göre farklı default veya "unknown" döndür ve sprint boyutunu etkileme.

**Test:** 8+ test

---

## Task 6: start Core — Wait Timeout, Spawn Retry, Zero-Config, Phase Persistence
- Model: opus
- Effort: high
- Files: src/cli/commands/start.ts, src/orchestra/sprint-controller.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
start komutunun çekirdek sorunları:

**A) waitForResults Configurable Timeout:**
30 dakika hardcode. `config.sprint_timeout` veya `--timeout` flag ile ayarlanabilir olsun.

**B) Spawn Retry Stratejisi:**
Tek retry, aynı şeyi deniyor. Retry'da hata analizine göre model downgrade veya scope simplify öner.

**C) Zero-Config DIRECTIVES Çakışması:**
Mevcut DIRECTIVES.md varsa sessizce geçiliyor. Kullanıcıya "Existing DIRECTIVES.md found. Override? (y/n)" sor veya `--force` ile override.

**D) Phase Arası Durum Kaybı / Orphan Worker Detection:**
Process crash'te orkestrasyon kaybolur. `.deckent/sprint-state.json` dosyasına phase durumunu yaz. Restart'ta orphan tmux window'ları tespit et.

**Test:** 10+ test

---

## Task 7: start Quality — Provider Cache, Dashboard Usage, Cleanup Finally, --watch Alt
- Model: sonnet
- Effort: high
- Files: src/cli/commands/start.ts, src/orchestra/sprint-controller.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
**A) Provider Bootstrap Cache:**
Her start'ta 5-15 saniye provider tespit. `.deckent/provider-cache.json` ile cache'le (TTL: 1 saat).

**B) Dashboard Final Update Usage:**
Sprint bittiğinde `fiveHourPercent: 0` yazılıyor. Son gerçek usage değerini koru.

**C) Zero-Config Cleanup Finally:**
try/catch'te çağrılıyor ama `finally` daha temiz. Geçici DIRECTIVES.md temizliğini finally bloğuna taşı.

**D) --watch Subprocess Alternatifi:**
Subprocess worker'lar için tmux alternatifi: log dosyasını tail et.

**E) --sandbox-mode Stub İyileştirme:**
Sadece "not implemented" mesajı. En azından git stash + restore mekanizmasıyla basit sandbox sağla.

**F) Fix Phase Timeout:**
10 dakika hardcode. Config'den ayarlanabilir olsun.

**Test:** 8+ test

---

## Task 8: status Overhaul — Standalone, ETA, NO_COLOR, fs.watch, Verbose
- Model: opus
- Effort: high
- Files: src/cli/commands/status.ts, src/cli/helpers/output.ts
- Scope: src/cli/commands/, src/cli/helpers/, tests/cli/

### Description
status komutunun kapsamlı iyileştirmesi (10 öneri):

**A) .dashboard Yoksa Standalone:**
Task dosyalarından (.tasks/*.json) standalone status oluştur. Dashboard'a bağımlı olmadan çalış.

**B) startedAt → ETA:**
`sprint.startedAt` config'e yazılmıyor → ETA hesaplanamıyor. Sprint start anını kaydet, task hızına göre ETA hesapla.

**C) NO_COLOR Desteği:**
`process.env.NO_COLOR` veya `--no-color` flag'i ile ANSI renk kodlarını kapat. Pipe/CI ortamlarında temiz çıktı.

**D) Watch Mode fs.watch:**
`setInterval(2000)` polling yerine `fs.watch` kullan. CPU dostu + anlık güncelleme.

**E) --json + --verbose Birlikte:**
`--json --verbose` çalışmaz. JSON'a verbose bilgi (agent/skill assignments) ekle.

**F) readSprintMeta Regex İyileştirme:**
Çok spesifik format, genelde match etmez. Daha toleranslı regex.

**G) Budget Check:**
"Budget: OK" hardcode. Gerçek .brain/ boyutuna bak.

**H) Alert Detayı:**
Sadece alert sayısı gösteriliyor, içerik yok. Alert mesajlarını göster.

**I) ETA İyileştirme:**
Lineer hesap yerine son N task hızına göre weighted average.

**J) Progress Stale Uyarı:**
Dashboard 30s güncelleme, task dosyaları anlık. Tutarsızlık varsa uyar.

**Test:** 12+ test

---

## Task 9: doctor Improvements — tmux Conditional, .deck Check, Auth, Hints
- Model: sonnet
- Effort: high
- Files: src/cli/commands/doctor.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
doctor komutunun 8 iyileştirmesi:

**A) tmux required Multi-Provider Fix:**
Codex/Gemini subprocess kullanıyorsa tmux gerekmez ama doctor FAIL verir. Provider config'e bak, sadece claude provider varsa tmux required.

**B) .deck Güvenlik Kontrolü:**
`.deck` dosyasının git'te track edilip edilmediğini kontrol et. `isDeckFileCommitted()` var ama çağrılmıyor. Çağır ve uyar.

**C) Claude CLI Auth Kontrolü:**
Sadece version check. `claude --version` başarılı ama login olmamış olabilir. Auth durumunu kontrol et.

**D) Stale Lock Temizleme Önerisi:**
Sadece stale lock sayısı gösteriliyor. "Run `deckent cleanup` to remove stale locks" önerisi ekle.

**E) Disk/Permission Check:**
.tasks/ ve .brain/ dizinlerine yazma izni kontrolü.

**F) Memory Bilgisi Tekrarlama Kaldır:**
"Your Project" ve "System Health"'te aynı veri. Birini kaldır.

**G) countOpenDebtItems Tekrar Okuma:**
checkDebt() zaten okumuş. Sonucu paylaş.

**H) Error Registry Tutarlılık:**
Bazı check'ler ErrorRegistry, bazıları düz string. Tutarlı hale getir.

**Test:** 10+ test

---

## Task 10: retro+explain Quality — Dil, Trend, Agent/Skill Perf, Learnings
- Model: sonnet
- Effort: high
- Files: src/cli/commands/retro.ts, src/cli/commands/explain.ts, src/orchestra/sprint-reporter.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
retro ve explain kalite iyileştirmeleri:

**A) Retro Dil Desteği:**
İngilizce hardcode. config.language kontrol et, Türkçe etiketler ekle.

**B) --trend Flag:**
Son N sprint trend görünümü. `.brain/sprints/` dizininden son 5 sprint'i parse et, success rate/noGo/coverage trend göster.

**C) Agent/Skill Performance CLI Parse:**
RETRO.md'ye yazılıyor ama `deckent retro` komutunda parse edilmiyor. Agent/skill performance tablosunu göster.

**D) MEMORY.md Learnings Kalitesi:**
Sadece `task.title: evaluation`. Task result.notes'u da ekle, neden/detay içersin.

**E) Retro Arşivleme:**
Overwrite → tarihçe kaybı. Retro yazmadan önce eskiyi `.brain/archive/retro-sprint-NNN.md` olarak arşivle.

**F) Explain Regex Fragile Fix:**
Whitespace-sensitive regex'leri daha toleranslı hale getir.

**G) Sprint Log Parse Fragile Fix:**
Header formatları tutarsız. Daha toleranslı regex.

**Test:** 10+ test

---

## Task 11: cleanup+decay Overhaul — Auto Decay, Combo, Lock Guard, Archive
- Model: sonnet
- Effort: high
- Files: src/cli/commands/cleanup.ts, src/orchestra/debt-manager.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
cleanup ve decay iyileştirmeleri:

**A) Budget Uyarısı:**
Cleanup sonrası .brain/ boyutunu kontrol et. Budget aşılıyorsa "Run `deckent cleanup --decay` to reduce memory" öner.

**B) --decay + Normal Cleanup Combo:**
`--decay` early return yapıyor, normal cleanup yapmıyor. Her ikisini de yapsın.

**C) Aktif Lock Koruması:**
EXECUTING task'ların lock'ları da silinir. Status kontrol et, aktif lock'ları koru.

**D) Task Dosyası Çift Geçiş:**
İlk geçiş hepsini sildi, ikinci geçiş bir şey bulamaz. Tek geçişe indir.

**E) Decay Truncation İyileştirme:**
"Son çare" 50 satıra kırpma agresif. Önemli erken learnings kaybı. Sprint başlıklarını koru, sadece detayları kırp.

**F) Decay Sprint Number Parse:**
"## Sprint 1-5 Özet" formatı match etmez. Daha toleranslı regex.

**G) Archive .gitignore Fix:**
Arşiv `.gitignore`'da. Arşivin git'te takip edilmesini sağla.

**Test:** 8+ test

---

## Task 12: usage Overhaul — Real Tokens, Race Condition, Live Usage, Filters
- Model: opus
- Effort: high
- Files: src/cli/commands/usage.ts, src/core/usage-tracker.ts
- Scope: src/cli/commands/, src/core/, tests/

### Description
usage komutunun kapsamlı yeniden yapılandırması (10 öneri):

**A) Token Tahminleri İyileştirme:**
Sabit 5000/2000/1000 yerine model bazlı tahmin: opus ~15K, sonnet ~8K, haiku ~3K. Prompt boyutuna göre ayarla.

**B) recordCall Race Condition:**
Concurrent write → last-write-wins. File lock veya append-only JSON Lines format.

**C) Canlı Usage Gösterimi:**
5hr/weekly rate limit durumunu göster. `checkUsageWithProvider()` sonucunu kullan.

**D) --since / --last Filtre:**
`--since 2026-03-20` veya `--last 3` ile filtreleme.

**E) Sprint Arası Karşılaştırma:**
Son N sprint usage trend'i. Token/call artış/azalış.

**F) Task-Level Granularity:**
Hangi task en çok harcadı. Task ID + token sütunu.

**G) Provider Ayrımı:**
Claude/Codex/Gemini ayrı maliyet. Provider sütunu ekle.

**H) Usage Dosyası Temizlik:**
Sonsuza kadar birikir. Eski sprint usage dosyalarını arşivle (configurable retention).

**I) Maliyet Fiyatları:**
Hardcode fiyatlar. Config'den okunabilir hale getir.

**J) Subscription Modda Faydalı Bilgi:**
Rate limit bilgisi göster, maliyet yerine kullanım yüzdesi.

**Test:** 12+ test

---

## Task 13: history Overhaul — --json, --last, Agent/Skill, Dead Code, Format
- Model: sonnet
- Effort: high
- Files: src/cli/commands/history.ts, src/orchestra/sprint-reporter.ts
- Scope: src/cli/commands/, src/orchestra/, tests/

### Description
history komutunun 10 iyileştirmesi:

**A) --json Flag:**
Sprint history'yi JSON formatında çıktıla.

**B) --last N Flag:**
Son N sprint'i göster (default: tüm).

**C) writeSprintLog Agent/Skill Bilgisi:**
sprint-reporter.ts'deki writeSprintLog'a agent/skill bilgisi ekle → history'de "-" yerine gerçek değerler.

**D) loadLearningData Dead Code:**
`.brain/learning/` hiçbir yerde oluşturulmuyor. Dead code'u sil.

**E) Numeric Sort:**
Alphabetical sıralama sprint-1000+'da bozulur. Numeric sort kullan.

**F) Archive Sprint Gösterimi:**
Decay sonrası eski sprint'ler kayıp. Archive'dan da oku.

**G) Usage Bilgisi Entegrasyonu:**
Token/call sütunu ekle (usage dosyasından).

**H) Sprint Log İçeriği Zenginleştirme:**
Dosya değişiklik sayısı, süre, hata detayları.

**I) Parse ↔ Write Format Tutarlılığı:**
history.ts ve sprint-reporter.ts header'ları tutarlı olsun.

**J) Sprint Log İçeriği Fakir Fix:**
Dosya, süre, hata detayları eklenmeli.

**Test:** 10+ test

---

## Task 14: config Quality — list/keys, autoMigrate, Validation, Comment, Env Var
- Model: sonnet
- Effort: high
- Files: src/cli/commands/config.ts, src/core/config.ts, src/core/config-migration.ts
- Scope: src/cli/commands/, src/core/, tests/

### Description
config komutunun 8 kalan iyileştirmesi:

**A) config list / config keys:**
Tüm parametreleri kategorileriyle listele. CONFIG_METADATA'dan oku.

**B) autoMigrateOnLoad:**
loadConfig içinde needsMigration() kontrol et, otomatik migration uygula.

**C) Validation Hata Mesajı:**
Mode context yok, teknik mesajlar. "Invalid value 'xyz' for field 'mode'. Valid options: max_plan, pro_plan, ..." formatında.

**D) JSON Comment Import Desteği:**
Export'ta var, import'ta yok. stripJsonComments'i import'ta da kullan.

**E) Env Var Override Genişlet:**
Sadece 2 env var (DECKENT_BRAIN_PROVIDER, DECKENT_WORKER_PROVIDER). DECKENT_MODE, DECKENT_LANGUAGE ekle.

**F) --raw Flag:**
Resolved config yerine raw config göster (default'larla merge edilmemiş).

**G) Migration modes Atlanıyor:**
Yeni mode field'ları algılanmaz. Mode nesting'i de migration'a dahil et.

**H) Backup Temizliği:**
Her migration'da .bak ezilir. Timestamp'li backup: config.json.bak.{timestamp}.

**Test:** 10+ test

---

## Task 15: review+finalize Overhaul — Interactive, Retry, Guard, Duplicate
- Model: opus
- Effort: high
- Files: src/cli/commands/review.ts, src/cli/commands/finalize.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
review ve finalize kapsamlı iyileştirme:

**A) Interactive Review:**
`--auto` olmadan çalıştırınca her task için approve/reject/retry prompt göster. promptSelect kullan.

**B) Retry → Respawn:**
retry decision'ı alan task'ı tekrar spawn et. killWorker + task status PENDING + respawn.

**C) Review → Finalize Entegrasyonu:**
Rejected task'lar finalize'da NO_GO sayılsın. Review state'i finalize okumalı.

**D) Review State Kalıcılık:**
`.tasks/review-*.json` cleanup'ta siliniyor. `.brain/reviews/review-sprint-NNN.json` olarak kalıcı sakla.

**E) "retry" Decision Kullanılsın:**
Enum'da var ama hiçbir zaman atanmıyor. DONE + testsPassed=false → retry (mevcut logic zaten bu, ama retry sonrası aksiyon yok — B'de çözülüyor).

**F) Finalize Completion Guard:**
EXECUTING/CLAIMED task varsa uyar, `--force` olmadan reddet.

**G) Mixed Sprint Detection:**
Farklı sprintId'li task'lar varsa uyar.

**H) Duplicate Finalize Koruması:**
Aynı sprint 2 kez finalize edilirse MEMORY.md'de duplicate learning. Sprint log kontrol et.

**I) --approve-all / --reject-all Shortcuts.**

**Test:** 12+ test

---

## Task 16: serve Security — Rate Limit, Body Size, DeepMerge, Auth, Versioning
- Model: opus
- Effort: high
- Files: src/api/server.ts, src/api/watcher.ts
- Scope: src/api/, tests/api/

### Description
serve güvenlik hardening (8 öneri):

**A) Rate Limiting:**
Basic in-memory rate limiter. IP bazlı, configurable (default: 100 req/min). 429 Too Many Requests.

**B) Body Size Limit:**
parseBody boyut kontrolü yapmıyor. Max 1MB body limit. 413 Payload Too Large.

**C) /api/config POST DeepMerge:**
`{ ...existing, ...parsed.data }` shallow merge. deepMerge kullan.

**D) Auth Token Auto-Generate:**
Token yoksa startup'ta crypto.randomUUID() ile üret, console'a yazdır.

**E) API Versioning:**
`/api/v1/...` prefix. Mevcut endpoint'ler `/api/` olarak backward compat koru, yeni endpoint'ler `/api/v1/`.

**F) CORS Dynamic:**
`http://localhost:${DEFAULT_PORT}` hardcode. Request origin'den port al veya `*` fallback (localhost-only binding zaten koruyor).

**G) SSE Reconnection:**
Client disconnect sonrası `retry:` field ile reconnection bilgisi gönder.

**H) Job Tracking Multi-Sprint:**
`activeJob` tek global variable. Map<jobId, JobState> ile çoklu sprint desteği.

**Test:** 10+ test

---

## Task 17: run+test+web Flags — Timeout, Keep, Sandbox, CI, MIME
- Model: sonnet
- Effort: high
- Files: src/cli/commands/run.ts, src/cli/commands/test-run.ts, src/cli/commands/serve.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
run, test ve web komut iyileştirmeleri:

**A) run --timeout:**
5 dakika hardcode. `--timeout <ms>` flag.

**B) run --keep:**
Sonuç dosyalarını koruma. Cleanup atla.

**C) run --auto-approve:**
Permission yönetimi flag'i.

**D) run Agent/Skill Injection:**
buildWorkerPrompt agent/skill olmadan çağrılıyor. resolveAgentPrompt + resolveSkillPrompts ekle.

**E) run --verbose:**
Worker'ın canlı çıktısını gösterme (tail -f log).

**F) test --directives <file>:**
Proje DIRECTIVES yerine test-specific DIRECTIVES.

**G) test --sandbox:**
Git stash + restore ile worker'ların projeyi değiştirmesini engelle.

**H) test --model <model>:**
Tüm task'ları belirli modelle çalıştır.

**I) test CI Çıktı Formatı:**
`--reporter junit` veya `--reporter tap` flag.

**J) web MIME Type Genişlet:**
Sadece 5 tip. Resim (.png, .jpg, .gif, .ico), font (.woff, .woff2, .ttf) ekle.

**K) web Build Check:**
dist/ yoksa 404 yerine uyarı mesajı ve build komutu önerisi.

**L) web --dev Proxy:**
Gerçek Vite dev server proxy setup.

**Test:** 10+ test

---

## Task 18: sync+onboard+upgrade Polish
- Model: sonnet
- Effort: high
- Files: src/cli/commands/sync.ts, src/cli/commands/onboard.ts, src/cli/commands/upgrade.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
sync, onboard, upgrade iyileştirmeleri:

**A) Sync: Gemini/Cursor Adapter:**
Sadece CLAUDE.md ve AGENTS.md sync ediliyor. GEMINI.md ve .cursor/rules de sync'e dahil et.

**B) Sync: Git Commit Date:**
mtime yerine `git log -1 --format=%aI` kullan.

**C) Sync: MEMORY.md Şişme Limiti:**
100+ dosya değişmişse hepsini listeliyor. Max 50 dosya, "and N more..." ile kırp.

**D) Sync: --json + --dry-run:**
Programmatic kullanım ve preview.

**E) Onboard: Wizard → Init Argüman:**
Language ve mode seçimleri init'e argüman olarak geç.

**F) Onboard: API Mode:**
Wizard'da 3 seçenek. `api` modu ekle.

**G) Onboard: detectProjectStack():**
Daha zengin proje analizi kullan.

**H) Onboard: --force:**
Already initialized olsa bile re-run.

**I) Upgrade: Semver Library:**
`parseFloat` tabanlı karşılaştırma pre-release'de bozulur. Segment-by-segment karşılaştırma iyileştir.

**J) Upgrade: Rollback:**
Install başarısız olursa geri dönüş mekanizması. Önceki versiyonu kaydet.

**K) Upgrade: Install Strategy Detection:**
Global mı, local mı, npx mi tespit et.

**L) Upgrade: --canary / --beta:**
Pre-release channel desteği.

**Test:** 12+ test

---

## Task 19: agent+skill+plugin+marketplace+archive-debt Completeness
- Model: sonnet
- Effort: high
- Files: src/cli/commands/agent.ts, src/cli/commands/skill.ts, src/cli/commands/plugin.ts, src/cli/commands/archive-debt.ts
- Scope: src/cli/commands/, src/core/, tests/cli/commands/

### Description
Kalan CRUD ve kalite iyileştirmeleri:

**A) Agent: stats Command:**
`agent stats <name>` — sprint-by-sprint performans.

**B) Agent: Trigger Pattern Validation:**
Trigger keyword doğrulama.

**C) Agent: systemPrompt Field:**
agent.json'a systemPrompt string field ekle. PROMPT.md'den otomatik doldur.

**D) Agent: Model Seçimi Create'de:**
Default sonnet yerine interactive seçim.

**E) Skill: Git Install Checksum:**
İndirilen skill'in SHA-256 hash'ini doğrula.

**F) Skill: Version Pinning:**
Git URL'de versiyon/tag belirtilebilsin.

**G) Skill: update Command:**
Source'u hatırlayıp re-clone.

**H) Skill: --stats Flag:**
Skill kullanım istatistikleri.

**I) Skill: node_modules Exclude:**
Local install'da node_modules kopyalanır. Exclude et.

**J) Plugin: remove + update:**
Plugin kaldırma ve güncelleme komutları.

**K) Plugin: Entrypoint Validation:**
manifest.json'daki dosya var mı kontrol.

**L) Plugin: Conflict Detection:**
Aynı isimli plugin install edilirse uyar.

**M) Marketplace: Registry Cache:**
Her arama HTTP istek. In-memory cache (TTL: 5 min).

**N) Marketplace: Semver Validation:**
Loose regex'i strict semver'a çevir.

**O) Archive-debt: --dry-run + --before + rotation:**
Preview, sprint filtre, dosya boyutu kontrolü.

**P) Archive-debt: parseDebtTable Tutarlılık:**
debt-manager.ts ve archive-debt.ts'deki parser'ları birleştir veya shared util kullan.

**Test:** 15+ test

---

## Task 20: dashboard+attach+watch+cross-cutting
- Model: sonnet
- Effort: high
- Files: src/cli/commands/dashboard.ts, src/cli/commands/attach.ts, src/cli/commands/watch.ts, src/cli/commands/analyze.ts, src/core/analyzer.ts, src/core/stack-detector.ts
- Scope: src/cli/commands/, src/core/, src/orchestra/, tests/

### Description
Kalan cross-cutting sorunlar ve görüntüleme komutları:

**A) Dashboard + Status Duplikasyon:**
İki komut neredeyse aynı işi yapıyor. Dashboard'u status --raw'a yönlendir veya dashboard'a status özelliklerini ekle.

**B) Dashboard fs.watch:**
setInterval polling → fs.watch. Dashboard ve status ortak watcher kullanabilir.

**C) Dashboard Terminal Adapt:**
Genişlik 62 sabit. `process.stdout.columns` ile dinamik.

**D) Dashboard Agent/Skill Bilgisi:**
Worker tablosunda agent ve skill göster.

**E) Dashboard Usage Metriği:**
Usage bilgisini dashboard'a ekle.

**F) Attach: --list Flag:**
Mevcut tmux window listesini göster.

**G) Attach: Nested tmux:**
`$TMUX` kontrolü. Nested tmux uyarısı.

**H) Watch: Cleanup'ta Temizleme:**
Watch window kaldırılmıyor. Cleanup'ta temizle.

**I) Watch: Follow Hata Mesajı:**
Neden bulunamadığı açıklanmıyor. "Worker finished" veya "Wrong provider" gibi detay ver.

**J) Watch: Re-attach Fix:**
Eski sprint'ten kalmış window tekrar kullanılır. Sprint ID kontrolü.

**K) Watch: Split Ratio Dinamik:**
Terminal boyutuna göre ayarla.

**L) Analyzer Duplikasyon:**
analyzer.ts ve stack-detector.ts aynı iş. stack-detector.ts'i canonical yap, analyzer.ts'i wrapper olarak koru.

**M) Analyzer Git Bağımlılık:**
Git repo olmayanda fileCount=0. fs-based fallback ekle.

**N) Analyzer Cache:**
Her çağrıda git çalıştırır. stack-detector gibi cache ekle.

**O) Decay Sprint Number Parse:**
"## Sprint 1-5 Özet" formatı match etmez. Daha toleranslı regex.

**Test:** 12+ test

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression (10,600+ test geçmeli)
- Her task test VE implementasyon birlikte yazmalı
- cli-deep-analysis.md'deki TÜM 158 önerinin çözülmesi hedef
- %100 GO hedefli — NO_GO KABUL EDİLMEZ
