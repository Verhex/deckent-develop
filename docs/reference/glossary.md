# Deckent Terminoloji Sözlüğü (Glossary)

> **Kaynak:** [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)
> Bu sözlük Blueprint'teki tüm teknik terimleri alfabetik sırayla listeler.
> Her terim için kısa bir tanım ve Blueprint'te ilk geçtiği bölüm numarası verilmiştir.

---

## A

### ADR (Architecture Decision Record)
Yazılım mimarisindeki önemli kararların gerekçesiyle birlikte belgelendiği kayıt formatı. Deckent'te `.brain/DECISIONS.md` dosyasında tutulur.
**Blueprint §5.1** — "Update DECISIONS.md for new architecture decisions"

### Agent Teams
Claude Code'un deneysel özelliği; Brain'in takım lideri, Worker'ların takım üyesi olarak yerel mesajlaşmayla çalışması. Gelecekte `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` ile etkinleştirilecek.
**Blueprint §10** — "Agent Teams Integration (Future)"

### allowedTools
`claude -p` çağrısında her agent tipine izin verilen araçların listesi. Brain, Auditor ve Worker için farklı kümeler tanımlıdır.
**Blueprint §15** — "Claude Code --allowedTools Per Agent"

### analyzer.ts (`deckent_analyze_project`)
Projenin teknoloji yığınını, dosya sayısını ve tavsiye edilen sprint metodolojisini analiz eden modül (`src/core/analyzer.ts`). MCP aracı: `deckent_analyze_project`.
**Blueprint §9** — "Sprint 9: Analyzer & CI Pipeline"

### ANTHROPIC_API_KEY
API modunda kullanılan ortam değişkeni; `claude -p` komutunun API üzerinden çalışabilmesi için gerekli.
**Blueprint §2** — "Auth Chain"

### api-surface.md
`.contracts/api-surface.md` — Brain'in oluşturduğu, tüm agent'ların okuduğu inter-agent API sözleşmesi.
**Blueprint §4.1** — Workspace Structure

### asDraft
`planSprint()` çağrısında `{ asDraft: true }` parametresi; görevlerin `PENDING` yerine `DRAFT` statüsünde oluşturulmasını sağlar.
**Blueprint §9** — "DRAFT task support"

### Auditor
Deckent'in izleme bileşeni. Brain süreci içinde çalışarak (in-process) 30 saniyede bir kalp atışlarını, git diff'ini, kilitlenmeleri ve kapsam ihlallerini tarar.
**Blueprint §5.2** — "Auditor (In-Process Scan Loop)"

### auto (planning mode)
`brain_planning: 'auto'` — AI planlamasını önce dener, başarısız olursa `parseStructuredDirectives()` ile yapılandırılmış ayrıştırmaya geçer. Varsayılan moddur.
**Blueprint §9** — "BrainPlanningMode"

---

## B

### brain.md
`.claude/rules/brain.md` — Brain rolündeyken Claude Code'a uygulanan kural dosyası. Planlama, değerlendirme ve bellek güncelleme kurallarını içerir.
**Blueprint §20** — "Rules Files (.claude/rules/)"

### brain.ts
`src/orchestra/brain.ts` — Sprint yaşam döngüsünün tamamını yöneten orkestratör modülü. Tüm diğer modülleri import eden TEK modüldür.
**Blueprint §5.1** — "Brain + Planner"

### BrainPlanningMode
`'ai' | 'structured' | 'auto'` — Brain'in görev planlama stratejisini belirleyen yapılandırma değeri (`.deckent/config.json` içinde `brain_planning`).
**Blueprint §9** — "BrainPlanningMode"

### brain_planning
`.deckent/config.json` içindeki yapılandırma anahtarı; Brain'in planlama modunu belirler (`'ai'`, `'structured'`, `'auto'`).
**Blueprint §13** — Config structure

### budget_per_sprint
API modunda her sprint için maksimum dolar harcamasını sınırlayan yapılandırma değeri.
**Blueprint §13** — Config (`api` mode)

### buildWorkerPrompt
Brain'in Worker için oluşturduğu sistem istemi. Kalp atışı dosyası oluşturma talimatlarını içerir.
**Blueprint §5.1** — "`buildWorkerPrompt` includes heartbeat instruction"

---

## C

### CostEstimator
Provider maliyet karşılaştırma modülü. Her provider'ın `costPerMillionTokens` değerlerini kullanarak task başına maliyet tahmini yapar. `cost_optimization=true` olduğunda en ucuz capable provider seçilir.
**Sprint 037**

### callBrainPlanner
`src/orchestra/planner.ts` içindeki fonksiyon; `claude` CLI'yı çağırarak AI tabanlı görev planı oluşturur ve Zod şemasıyla doğrular.
**Blueprint §9** — "Planner module"

### child_process.fork()
MCP `deckent_start` aracının sprint'i arka planda çalıştırmak için kullandığı Node.js yöntemi; MCP zaman aşımını önler.
**Blueprint §19** — "Sprint 17: Reliability"

### CLAIMED
Worker'ın görevi aldığını bildiren görev statüsü.
**Blueprint §5.3** — "Worker lifecycle"

### cleanup()
Sprint sonunda `.tasks/` altındaki tüm geçici dosyaları (`.json`, `.plan`, `.hb`, `.result`, `.paused`, `.log`) temizleyen fonksiyon.
**Blueprint §19** — "Sprint 17: cleanup()"

### commander.js
Deckent CLI'ının tek çalışma zamanı bağımlılığı; komut ayrıştırma için kullanılır.
**Blueprint §4.1** — "src/cli/" reference

### config.json (`.deckent/`)
Projeye özel çalışma zamanı yapılandırması. Plan modu, model sınırları, kullanım eşikleri ve dil tercihleri içerir.
**Blueprint §4.1** — Workspace Structure

### confirmDraftTasks()
`DRAFT` statüsündeki görevleri `PENDING` statüsüne geçiren Brain fonksiyonu; Worker spawn'dan önce çağrılır.
**Blueprint §9** — "DRAFT task support"

### contracts/
`.contracts/` dizini — Brain tarafından oluşturulan, tüm agent'ların okuduğu sözleşme dosyalarının saklandığı dizin.
**Blueprint §4.1** — Workspace Structure

### coverage
Test kapsamı yüzdesi; Worker `.result` dosyasında raporlar, Brain NO-GO kararında eşik olarak kullanır (< 90% → `GO_WITH_TECH_DEBT`).
**Blueprint §8** — GO/NO-GO Protocol

---

## D

### dashboard (`.dashboard`)
Auditor'ın her taramada üzerine yazdığı canlı sprint durum dosyası; terminalde ve web arayüzünde görüntülenir.
**Blueprint §5.2** — "Writes: .dashboard"

### DashboardState
Web ve terminal gösterge panelinin veri modeli; PLAN fazında sıfırlanır, sprint ID uyuşmazlığında Auditor tarafından yeniden başlatılır.
**Blueprint §19** — "Sprint 17: Dashboard reset"

### DEBT.md
`.brain/DEBT.md` — Teknik borç kayıtlarının tablo formatında tutulduğu dosya; Brain tarafından yazılır, çözüme kavuşturulduğunda güncellenir.
**Blueprint §6** — "Memory Files"

### decay
`.brain/` dizininin 600 satır sınırını aşması durumunda eski bellek girdilerini arşivleyen mekanizma. Her sprint sonunda tetiklenir.
**Blueprint §6** — "Decay Mechanism"

### deckent init
Yeni bir projede Deckent kurulumunu başlatan komut; `DECKENT.md`, `.deckent/`, `.brain/`, `.claude/rules/` dosyalarını oluşturur.
**Blueprint §3.1** — "Installation"

### deckent start
Tam sprint yaşam döngüsünü başlatan CLI komutu; doctor → plan → spawn → execute → evaluate → retro → cleanup sırasını çalıştırır.
**Blueprint §3.2** — "CLI Commands"

### deckent sync
`CLAUDE.md` ve `AGENTS.md` dosyalarına `@DECKENT.md` referansını ekleyen CLI komutu; `ensureDeckentImport()` fonksiyonunu çağırır.
**Blueprint §4.3** — "`deckent sync`"

### deckent watch
Canlı tmux bölünmüş görünüm oluşturan CLI komutu; gösterge paneli ve Worker pencereleri yan yana gösterilir.
**Blueprint §19** — "Sprint 16: Watch Mode"

### DECKENT.md
Tüm agent yapılandırmasının tek gerçek kaynağı. `CLAUDE.md` ve `AGENTS.md` bu dosyaya `@import` ile başvurur.
**Blueprint §4.3** — "DECKENT.md + Adapter Pattern"

### DECISIONS.md
`.brain/DECISIONS.md` — Kalıcı mimari karar kayıtları (ADR); Brain tarafından yazılır, hiç arşivlenmez.
**Blueprint §6** — "Memory Files"

### DIRECTIVES.md
Operatörün (kullanıcının) sprint hedeflerini yazdığı dosya. Brain planlama sırasında bu dosyayı ilk okur.
**Blueprint §4.1** — Workspace Structure

### DONE
Görev değerlendirme kararı; tüm kriterler karşılandı, Worker serbest bırakıldı.
**Blueprint §8** — "GO/NO-GO/Tech Debt Protocol"

### DRAFT
`asDraft: true` ile oluşturulan görevin başlangıç statüsü; onaylanana kadar Worker'lara atanmaz.
**Blueprint §9** — "DRAFT task support"

---

## E

### effort
Her göreve atanan iş yükü tahmini: `'low' | 'normal' | 'high'`. Brain bu değeri model seçiminde dikkate alır.
**Blueprint §2** — Task JSON format (`.contracts/api-surface.md`)

### ensureDeckentImport()
`src/core/utils.ts` içindeki idempotent yardımcı fonksiyon; bir dosyaya `@DECKENT.md` referansı ekler (dosya yoksa oluşturur, varsa başa ekler, zaten varsa değiştirmez).
**Blueprint §4.3** — "Adapter injection pattern"

### evaluateResult
Brain'in her Worker sonucunu değerlendirdiği fonksiyon; `testsPassed=false` → `NO_GO`, `coverage<90` → `GO_WITH_TECH_DEBT`.
**Blueprint §5.1** — "Brain Lifecycle"

---

## F

### finalizeSprint()
Sprint sonrası tüm işlemleri çalıştıran fonksiyon: sprint log, `MEMORY.md`, `RETRO.md`, `PROJECT-IDENTITY.md` güncelleme, decay, plugin hooks. Structured mode'da eksik kalan post-sprint aksiyonlarını düzeltir. `deckent finalize` CLI komutu ile de çağrılabilir.
**Sprint 038**

### filesWrite (scope)
Görev JSON'unda Worker'ın yazma iznine sahip olduğu dosya yollarının listesi; Auditor bu listeyi kapsam ihlali tespitinde kullanır.
**Blueprint §2** — Task JSON format

---

## G

### GO_WITH_TECH_DEBT
Temel işlevsellik tamamlandı, küçük eksikler ertelenmiş. Worker serbest bırakılır, `DEBT.md` güncellenir.
**Blueprint §8** — "GO/NO-GO/Tech Debt Protocol"

### goNogo
Her görev JSON'unda tanımlanan `goCriteria`, `noGoCriteria` ve `techDebtAcceptable` alanlarından oluşan değerlendirme kriterleri.
**Blueprint §2** — Task JSON format

---

## H

### haiku_allowed
`.deckent/config.json` içinde belirli plan modlarında Haiku modelinin kullanımına izin veren boolean değer.
**Blueprint §13** — Config (`haiku_allowed`)

### heartbeat (`.hb`)
Worker'ın çalışma sırasında periyodik olarak güncellediği JSON dosyası (`.tasks/task-XXX.hb`). Auditor 2 dakikadan eski heartbeat'leri "stale agent" olarak işaretler.
**Blueprint §5.3** — "Worker lifecycle: HEARTBEAT"

---

## I

### i18n
Deckent'in çok dilli destek sistemi. Mesajlar `.deckent/i18n/en.json` ve `.deckent/i18n/tr.json` dosyalarında saklanır; agent istemleri her zaman İngilizce kalır.
**Blueprint §14** — "i18n & Multi-Language"

### IDENTITY.md
`.deckent/workspace/IDENTITY.md` — Projenin adını, dilini, runtime'ını ve platform bilgilerini içeren kimlik kartı.
**Blueprint §4.1** — Workspace Structure

### inferModelFromDirective()
Direktif başlığını, açıklamasını ve kapsamını analiz ederek görev için uygun modeli (`opus`/`sonnet`/`haiku`) öneren heuristik fonksiyon.
**Blueprint §19** — "Sprint 16: model inference"

---

## J

### jobId
MCP `deckent_start` aracının arka planda başlattığı sprint için döndürdüğü benzersiz iş tanımlayıcısı. Durum `.deckent/jobs/{jobId}.json` dosyasında izlenir.
**Blueprint §19** — "Sprint 17: MCP background jobs"

---

## L

### last_sprint_id
Sprint numarasının geriye gitmemesini garantilemek için `.deckent/config.json` içinde saklanan son sprint ID değeri.
**Blueprint §19** — "Sprint 17: Sprint ID safety"

### lock file (`.lock`)
`.locks/` dizininde tutulan dosya kilidi; JSON formatında `filePath`, `ownerWorkerId`, `acquiredAt` ve `taskId` alanlarını içerir. 5 dakikadan eski kilitler Auditor tarafından "stale" olarak işaretlenir.
**Blueprint §4.1** — Workspace Structure

---

## M

### ModelTier
Model kalite seviyesi: `premium` (opus, gpt-5, gemini-2.5-pro), `standard` (sonnet, gpt-4.1, gemini-2.5-flash), `economy` (haiku, gpt-5-mini, gemini-2.0-flash). Cross-provider model eşleştirmesinde kullanılır.
**Sprint 037** — `src/core/model-equivalence.ts`

### max_workers
Bir sprintte eş zamanlı çalışabilecek maksimum Worker sayısı; plan moduna göre 3–10 arasında değişir.
**Blueprint §13** — Config

### MCP (Model Context Protocol)
Claude Code'un araç ve kaynak entegrasyonu için kullandığı protokol. Deckent, stdio transportuyla MCP sunucusu olarak çalışır.
**Blueprint §21** — "MCP Server Architecture"

### MEMORY.md
`.brain/MEMORY.md` — Tier 1 bellek dosyası; maks. 100 satır, her sprintin sonunda Brain tarafından güncellenir, tüm agent'ların bağlamına `@import` ile eklenir.
**Blueprint §6** — "Tier 1: Always Loaded"

---

## N

### NO-GO
Kritik sorun var, Worker kilitli, düzeltme görevi oluşturuldu. Çapraz bağımlılık kuralı devreye girebilir.
**Blueprint §8** — "GO/NO-GO/Tech Debt Protocol"

---

## O

### operator
Deckent sisteminin en üst izin seviyesindeki kullanıcısı; `DIRECTIVES.md` yazar, sprint planlarını onaylar, herhangi bir agent'ı durdurabilir.
**Blueprint §15** — "Permission Model: Level 1"

---

## P

### parseStructuredDirectives()
`DIRECTIVES.md` içindeki `## Task N:` / `## Görev N:` bloklarını ayrıştırarak görev listesi oluşturan fonksiyon. `'structured'` planlama modunda kullanılır.
**Blueprint §9** — "BrainPlanningMode"

### PATTERNS.md
`.brain/PATTERNS.md` — Auditor'ın tespit ettiği kalıpları sakladığı dosya; maks. 80 satır, 5 sprint kullanılmayanlara decay uygulanır.
**Blueprint §6** — "Memory Files"

### pipe-pane
Worker'ların terminal çıktısını `.tasks/task-{id}.log` dosyasına yönlendiren tmux mekanizması (`tmux pipe-pane -t ... "cat >> logPath"`).
**Blueprint §19** — "Sprint 16: Worker log capture"

### plan mode (CLI)
`deckent plan` komutuyla çalışan, Brain'in sprint planı oluşturduğu ancak Worker'ları başlatmadığı özel mod.
**Blueprint §3.2** — "CLI Commands"

### planner.ts
`src/orchestra/planner.ts` — AI tabanlı görev planlama modülü; yalnızca `core/` modüllerinden import eder (ADR-008 kuralı).
**Blueprint §5.1** — "Brain+Planner Separation (ADR-008)"

### priority
Görev JSON'unda tanımlanan önem seviyesi: `'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'`.
**Blueprint §2** — Task JSON format

### PROJECT-IDENTITY.md
Kalıcı proje hafızası dosyası (`.brain/` altında). Decay'den muaf. Proje kimliği, mimari, güncel durum, konfigürasyon ve modül haritası içerir. Her sprint sonunda güncellenir.
**Sprint 037**

### provider abstraction layer
Gelecek fazda (Sprint 20+) planlanmış, farklı AI sağlayıcılarını (Claude, OpenAI, Gemini) Worker olarak kullanmayı mümkün kılacak soyutlama katmanı.
**Blueprint §1** — "What Deckent Is NOT" + §23

### ProviderAdapter
Provider soyutlama arayüzü. `spawn()`, `kill()`, `listWorkers()`, `isAvailable()`, `buildCommand()` metotlarını tanımlar. `ClaudeAdapter`, `CodexAdapter`, `GeminiAdapter` bu interface'i implement eder.
**Sprint 037** — `src/core/provider.ts`

### ProviderName
Desteklenen AI provider'ları: `'claude' | 'codex' | 'gemini'`.
**Sprint 037** — `src/core/task-types.ts`

### ProviderRegistry
Singleton provider kayıt sistemi. `register()`, `get()`, `getDefault()` metotları. `bootstrapProviders()` ile startup'ta doldurulur.
**Sprint 037** — `src/core/provider.ts`

### ProviderRouter
`spawnWorkers()` içindeki provider yönlendirme mantığı. `task.provider` alanına göre her task'ı doğru `ProviderAdapter`'a yönlendirir. Mixed sprint desteği sağlar.
**Sprint 037** — `src/orchestra/sprint-controller.ts`

---

## R

### RETRO.md
`.brain/RETRO.md` — Son sprintin retrospektif özeti; Brain tarafından her sprint sonunda üzerine yazılır, maks. 100 satır.
**Blueprint §6** — "Memory Files"

### runDecay
Brain'in `.brain/` dizinini 600 satır sınırı altında tutmak için çalıştırdığı sıkıştırma/arşivleme fonksiyonu.
**Blueprint §6** — "Decay Mechanism"

### runSprint
Brain'in tam sprint yaşam döngüsünü yürüten ana fonksiyonu (16 adım: check usage → plan → spawn → … → cleanup).
**Blueprint §5.1** — "Brain Lifecycle"

---

## S

### scan loop
Auditor'ın Brain süreci içinde `setInterval(30000)` ile çalıştırdığı periyodik tarama döngüsü; Sprint SPAWN fazından önce başlar, değerlendirmeden önce durur.
**Blueprint §5.2** — "startScanLoop"

### scope
Her görev için tanımlanan `directories`, `filesRead` ve `filesWrite` alanları; Worker yalnızca bu kapsam içinde çalışabilir.
**Blueprint §2** — Task JSON format

### shadcn/ui
Web gösterge panelinde kullanılan React bileşen kütüphanesi; 14 UI bileşeni içerir.
**Blueprint §12** — "Phase 2: Web Dashboard"

### SKILL.md
Plugin sistemindeki her yeteneğin (skill) talimat dosyası; YAML frontmatter + Markdown kuralları içerir.
**Blueprint §11** — "SKILL.md Format"

### sprint
Deckent'in temel iş birimi; bir direktifi (hedefi) alıp planlama → uygulama → değerlendirme → retrospektif döngüsünde işleme koyan yinelemeli süreç.
**Blueprint §7** — "Sprint Lifecycle"

### sprintId
Her sprintin benzersiz tanımlayıcısı (`sprint-NNN` formatı); `.deckent/config.json` içindeki `last_sprint_id` değeri geriye gitmesini önler.
**Blueprint §19** — "Sprint 17: Sprint ID safety"

### SSE (Server-Sent Events)
Web gösterge panelinin gerçek zamanlı güncellemeler için kullandığı `GET /api/events` endpoint'i; `.dashboard` dosyasındaki değişiklikleri yayınlar.
**Blueprint §12** — "Phase 2: Web Dashboard"

### startScanLoop
Brain'in sprint SPAWN fazında başlattığı, Auditor tarama döngüsünü çalıştıran fonksiyon; değerlendirme öncesinde `clearInterval` ile durdurulur.
**Blueprint §5.2** — "`startScanLoop`"

### structured (planning mode)
`brain_planning: 'structured'` — `DIRECTIVES.md` içindeki `## Task N:` bloklarını ayrıştırarak görev listesi oluşturur; AI çağrısı yapmaz.
**Blueprint §9** — "BrainPlanningMode"

---

## T

### Tech Debt Escalation
Çözülmemiş teknik borcun önceliğini artıran kural: NORMAL → 2 sprint → HIGH → 3+ sprint → CRITICAL (otomatik bir sonraki sprinte dahil edilir).
**Blueprint §8** — "Tech Debt Escalation"

### tmux
Deckent'in Worker'ları dinamik olarak başlatıp sonlandırdığı terminal çoklayıcı. Her Worker kendi tmux penceresinde çalışır.
**Blueprint §10** — "Dynamic Terminal Management"

### tmux.ts
`src/orchestra/tmux.ts` — tmux oturum yönetimi modülü; Worker pencerelerini oluşturur, `claude -p` komutlarını gönderir.
**Blueprint §4.1** — Architecture

---

## U

### usage-aware planning
Brain'in sprint boyutunu belirlemeden önce Claude planının mevcut kullanımını kontrol etme zorunluluğu; sprint hiçbir zaman yarıda bırakılmaz.
**Blueprint §9** — "Usage-Aware Planning"

---

## V

### Verhex
Deckent'in geliştirildiği şirket/ekip adı.
**Blueprint §1** — "Author: Alperen @ Verhex"

---

## W

### watcher.ts
`src/api/watcher.ts` — `.dashboard` dosyasındaki değişiklikleri izleyerek SSE stream üzerinden web istemcilerine ileten modül.
**Blueprint §18** — File-by-File Reference

### Worker
Deckent'in uygulama bileşeni; planlama, kodlama, test ve belgeleme işlemlerini kendi kapsamında (`scope`) yürüten tmux tabanlı agent.
**Blueprint §5.3** — "Worker"

### worker-default.md
`.claude/rules/worker-default.md` — Worker rolündeyken Claude Code'a uygulanan kural dosyası; kapsam uyumu, heartbeat güncelleme ve test zorunluluklarını tanımlar.
**Blueprint §20** — "Rules Files"

### writeIfNotExists
Var olmayan dosyaları oluşturan, mevcut dosyaları hiçbir zaman üzerine yazmayan yardımcı fonksiyon; `DECKENT.md` ve rule şablonları için kullanılır.
**Blueprint §4.3** — "writeIfNotExists"

### writeScanToDashboard()
Auditor tarama sonuçlarını mevcut gösterge paneli durumuyla birleştirerek `.dashboard` dosyasını güncelleyen fonksiyon.
**Blueprint §5.2** — "`writeScanToDashboard()`"

---

## Z

### Zod
Brain planlayıcısının (`planner.ts`) AI yanıtlarını doğrulamak için kullandığı TypeScript şema doğrulama kütüphanesi.
**Blueprint §5.1** — "Planner uses Zod schema validation"

---

*Toplam terim sayısı: 68+. Sözlük son olarak Sprint 037-038'de güncellenmiştir.*
