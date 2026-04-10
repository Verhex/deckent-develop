# Architecture Decision Records

## ADR-001: TypeScript + ESM

**Decision:** Use TypeScript with `"type": "module"` (ESM) as the project foundation.
**Context:** Deckent is a Node.js CLI tool. ESM is the modern standard, supported by Node 18+.
**Consequence:** All imports must use `.js` extensions. CommonJS interop via `esModuleInterop`.

## ADR-002: Node16 Module Resolution

**Decision:** Use `"module": "Node16"` and `"moduleResolution": "Node16"` in tsconfig.
**Context:** TypeScript 5.2+ requires these to match. Node16 resolution enforces `.js` extensions and `package.json` exports.
**Consequence:** Explicit `.js` in all relative imports. No index file auto-resolution.

## ADR-003: vitest over Jest

**Decision:** Use vitest for testing.
**Context:** Native ESM support, faster startup, v8 coverage provider, compatible API.
**Consequence:** Tests in `tests/` directory, `vitest.config.ts` at root.

## ADR-004: 3-Layer Config Merge

**Decision:** Config loads in 3 layers: hardcoded defaults → `~/.deckent/config.json` → `.deckent/config.json`.
**Context:** Users need global defaults (plan type, language) and per-project overrides.
**Consequence:** `deepMerge` function handles nested object merge. Arrays are replaced, not merged. `undefined` values are skipped.

## ADR-005: Synchronous I/O

**Decision:** Wave 2 modülleri (tmux, auditor, worker) senkron I/O kullanır.
**Context:** tmux komutları <100ms, lock dosyaları <1KB, auditor 30s cycle'da birkaç küçük JSON okur. Async overhead gereksiz.
**Consequence:** Tüm fonksiyonlar senkron. Gelecekte performans sorunları çıkarsa async'e geçilebilir.

## ADR-006: spawnSync Security Pattern

**Decision:** Tüm shell komutları `spawnSync(binary, [...args])` ile çalıştırılır, shell interpretation yok.
**Context:** Command injection riski sıfıra indirilmeli. Prompt ve diğer kullanıcı girdileri argument array olarak geçer.
**Consequence:** Template literal veya string concat ile komut oluşturmak yasak. `{ shell: true }` kullanılmaz.

## ADR-007: SpawnOptions Interface

**Decision:** `SpawnOptions { allowedTools?: string; autoApprove?: boolean }` tmux modülünde tanımlanır.
**Context:** Blueprint 15 gereği her ajan `--allowedTools` ile kısıtlanır. `autoApprove` ise `--dangerously-skip-permissions` ekler.
**Consequence:** Brain, worker scope'una göre allowedTools string'i hesaplar. SpawnOptions her spawn fonksiyonuna opsiyonel parametre olarak geçer.

## ADR-008: Brain Merkezi Import — Tek Yönlü Bağımlılık

**Decision:** Brain, projede diğer modülleri (tmux, auditor, worker) import eden TEK modüldür. Diğer modüller brain'i import etmez.
**Context:** Döngüsel import'lar Node.js ESM'de tanımsız davranışa yol açar. Brain orkestratör rolünde — tmux/auditor/worker'ı çağırır ama onlar brain'den bağımsız çalışır.
**Consequence:** `grep -r "from.*brain" src/orchestra/tmux.ts src/monitor/auditor.ts src/agents/worker.ts` her zaman boş sonuç vermeli. Yeni modüller eklenirken bu kural korunmalı.

## ADR-009: DEBT.md Markdown Tablo Formatı

**Decision:** DEBT.md, 9 kolonlu markdown tablo formatında tutulur. Brain `parseDebtTable`/`generateDebtTable` ile programatik okuma/yazma yapar.
**Context:** DebtItem interface'inin tüm alanlarını (id, description, originTaskId, originSprintId, priority, sprintsOpen, resolved, resolvedInSprintId, createdAt) saklamalıyız. JSON yerine markdown tercih edildi çünkü git diff'lerde okunabilir.
**Consequence:** Tablo parse'ı `|` split + `slice(1,-1)` ile yapılır. Boş kolon değerleri korunur. Yeni kolon eklemek parse/generate'i güncellemeyi gerektirir.

## ADR-010: Tek Runtime Dependency — commander.js

**Decision:** CLI tek runtime dependency olarak `commander@^13.0.0` kullanır. chalk, inquirer, picocolors gibi ek kütüphaneler eklenmez.
**Context:** Deckent CLI minimal footprint hedefler. Node 18+ built-in'leri (readline/promises, Unicode support) çoğu ihtiyacı karşılar. Renk desteği modern terminallerde Unicode ile sağlanabilir.
**Consequence:** `package.json` dependencies bölümünde yalnızca `commander` bulunur. Renkli çıktı gerekirse ileride `picocolors` (1.3KB) eklenebilir.

## ADR-011: node:readline/promises — Built-in Prompt

**Decision:** İnteraktif prompt'lar (text, select, confirm) için `node:readline/promises` modülü kullanılır.
**Context:** `inquirer` (1.2MB) veya `prompts` (200KB) eklemek yerine Node 18+ built-in API yeterli. Basit wrapper'lar (`promptText`, `promptSelect`, `promptConfirm`) tüm init wizard ihtiyacını karşılıyor.
**Consequence:** Rich UI (autocomplete, fuzzy search) yok. Gerekirse Phase 3 TUI'da `ink` veya `blessed` eklenebilir.

## ADR-012: register\<Name\>(program) Pattern

**Decision:** Her CLI komutu kendi dosyasında tanımlanır ve `register<Name>(program: Command): void` fonksiyonu export eder.
**Context:** Tek dosyada tüm komutları tanımlamak bakım zorluğu yaratır. Ayrı dosyalar bağımsız test, kolay ekleme/çıkarma sağlar.
**Consequence:** `src/cli/commands/` dizininde 16 dosya. Entry point (`index.ts`) 16 register çağrısı yapar. Yeni komut eklemek: dosya oluştur + index.ts'e import + register ekle.

## ADR-013: DECKENT.md Adapter Pattern (Sprint 15)

**Context:** CLAUDE.md'yi init sırasında overwrite etmek kullanıcı değişikliklerini kaybettiriyordu.

**Decision:** DECKENT.md = tek gerçek kaynak. CLAUDE.md ve AGENTS.md adaptör dosyalar — sadece `@DECKENT.md` referansı enjekte edilir (ensureDeckentImport). Asla üzerine yazılmaz.

**Consequences:**
- Init idempotent ve güvenli
- Kullanıcının CLAUDE.md özelleştirmeleri korunur
- Gelecek provider'lar (Codex, Gemini) için adapter pattern genişletilebilir
- `deckent sync` komutu adapter'ları yeniden senkronize eder

## ADR-014: .deck Secret File System (Sprint 044)

**Context:** Provider API key'leri .env'de tutmak proje .env dosyasıyla çakışıyordu. Kullanıcının mevcut .env içeriği DECKENT_ prefix'li key'lerle kirleniyor, .gitignore yönetimi karmaşıklaşıyordu.

**Decision:** Ayrı `.deck` dosyası oluşturuldu. DECKENT_ prefix'li key'ler bu dosyada tutulur. Init sırasında `.deck` otomatik olarak `.gitignore`'a eklenir.

**Consequence:** Worker'lar `.deck` içeriğini görmez. Brain sadece gerekli key'leri task scope'una göre inject eder. Kullanıcının .env dosyası hiç dokunulmaz.

## ADR-015: TaskRouter Module — 6-level routing (Sprint 044)

**Context:** Task → provider atama mantığı sprint-controller'da inline'dı ve genişletilemezdi. Yeni routing kuralı eklemek sprint-controller'ı her seferinde değiştirmeyi gerektiriyordu.

**Decision:** Ayrı `TaskRouter` modülü oluşturuldu. 6 seviyeli öncelik sırası: config → force → agent → skill → worker → fallback.

**Consequence:** Yeni routing kuralları sprint-controller'a dokunmadan eklenebilir. Her seviye bağımsız test edilebilir. Router, task metadata'sını (model, effort, scope) okuyarak otomatik provider seçimi yapar.

## ADR-016: Connector Module — provider lifecycle (Sprint 044)

**Context:** Provider'ların sağlık durumu sadece bootstrap'ta kontrol ediliyordu. Sprint sırasında provider düşerse tespit edilemiyordu.

**Decision:** `Connector` class ile runtime health check, lazy init ve auditor entegrasyonu sağlandı. Her provider bağlantısı Connector üzerinden yönetilir.

**Consequence:** Sprint sırasında provider düşerse auditor tespit eder ve alert üretir. Lazy init sayesinde kullanılmayan provider'lar başlatılmaz. Connector, provider sağlık metriklerini `.dashboard`'a yazar.

## ADR-017: MCP-Native Provider Adapters (Sprint 045)

**Context:** Codex/Gemini adapter'ları mock komutlar kullanıyordu. Gerçek CLI davranışı test edilemiyordu.

**Decision:** Gerçek CLI komutlarına geçiş: `codex exec --full-auto` ve `gemini -p --output-format json`. Adapter'lar gerçek binary'leri wrap eder.

**Consequence:** Gerçek provider'larla uçtan uca test mümkün. CI ortamında binary yoksa `describe.skipIf` ile testler atlanır. Mock adapter'lar yalnızca unit test scope'unda kalır.

## ADR-018: Multi-Environment Config Generation (Sprint 046)

**Context:** Her IDE/ortam farklı config dosyası bekliyor. Codex, Gemini, Cursor, VS Code farklı format ve yol tercihlerine sahip.

**Decision:** Ortam başına config generator: Codex → `config.toml`, Gemini → `settings.json`, Cursor → `mcp.json`. `deckent init --all-envs` tüm ortamları tek seferde hazırlar.

**Consequence:** Kullanıcı tek komutla tüm IDE entegrasyonlarını kurar. Her generator bağımsız modül, yeni ortam eklemek kolaylaşır. Mevcut config'ler üzerine yazılmaz, `writeIfNotExists` prensibi korunur.

## ADR-019: Language-Agnostic Worker Verify (Sprint 046)

**Context:** Worker verify loop sadece `tsc --noEmit` ve `vitest run` çalıştırıyordu. TypeScript dışı projelerde Deckent kullanılamıyordu.

**Decision:** `STACK_COMMANDS` ile dil bazlı build/test komutu belirlendi: Python → `pytest`, Go → `go test ./...`, Rust → `cargo test`. `.deckent/project-stack.json` dosyasından stack okunur.

**Consequence:** Deckent TypeScript dışı projelerde de çalışır. Verify döngüsü stack-aware hale geldi. Yeni dil eklemek `STACK_COMMANDS` map'ine bir entry eklemekle yapılır.

## ADR-020: Rich Sprint Output — 7-section summary (Sprint 044)

**Context:** Sprint sonuç çıktısı tek satır metric'ti. Kullanıcı kaç task tamamlandı, hangi dosyalar değişti, ne öğrenildi gibi bilgilere erişemiyordu.

**Decision:** 7 bölümlü rich output: Header, Results, Changes, Tests, Agents, Learnings, Next Steps. ANSI renk desteği ve `NO_COLOR` env var desteği eklendi.

**Consequence:** Her sprint sonunda kullanıcı tam resmi görür. `NO_COLOR=1` ile CI-friendly düz metin çıktısı alınır. Sprint log formatı da güncellendi — `.brain/sprints/sprint-NNN.md` aynı 7 bölüm yapısını kullanır.

## ADR-021: Kraken ASCII Brand Identity (Sprint 044)

**Context:** Deckent'in görsel bir kimliği yoktu. CLI araçlarında ilk izlenim önemli.

**Decision:** Kraken ASCII mascot: teal gövde (#4db8a4), gold DECKENT yazısı (#c4a855), dim tagline. `deckent --version` ve `deckent init` komutlarında splash gösterilir.

**Consequence:** Marka tanınırlığı artar. `NO_COLOR` veya `CI` env var varsa splash atlanır. ASCII art sabit string olarak `src/cli/splash.ts`'de tutulur, runtime üretilmez.

## ADR-022: CLI/MCP Feature Parity — Tek Yapı, Çoklu Ortam (Sprint 067)

**Context:** CLI'da 33+ komut, MCP'de 16 tool + 9 resource var. CLI'da olan bazı özellikler (spawn, attach, watch, agent, skill, plugin, onboard, upgrade, explain, finalize, dashboard, web, serve, archive-debt, quick-start, test-run, skill-marketplace) MCP tarafında yok. Kullanıcılar CLI'dan MCP'ye geçtiğinde özellik kaybı yaşıyor. Ayrıca MCP tool'ları ile CLI komutları farklı kod yolları kullanıyor — CLI doğrudan fonksiyon çağırırken, MCP HTTP/stdio üzerinden wrapper çalıştırıyor. Bu tutarsızlık hata kaynağı.

**Decision:** CLI ve MCP tam özellik eşliği (feature parity) sağlanmalı. Her yeni CLI komutu aynı zamanda MCP tool olarak da kaydedilmeli. Ortak iş mantığı `src/core/` veya `src/orchestra/` altında paylaşılan fonksiyonlarda olmalı — CLI ve MCP sadece thin wrapper (giriş/çıkış adaptörü). Yeni özellik eklerken:
1. İş mantığını core/orchestra'ya yaz
2. CLI komutu: `src/cli/commands/<name>.ts` — `register<Name>(program)` pattern
3. MCP tool: `src/mcp/tools/<name>.ts` — `registerTool()` pattern
4. Her ikisi de aynı core fonksiyonu çağırmalı

**Consequence:**
- Kullanıcı CLI'da yapabildiği her şeyi MCP üzerinden de yapabilir (Claude Code, VS Code, JetBrains)
- Test coverage iki kat artabilir — CLI testleri + MCP testleri aynı iş mantığını doğrular
- Yeni özellik ekleme maliyeti artar (2 wrapper) ama tutarlılık garantilenir
- MCP tool sayısı 16'dan 25+'a çıkacak (bazı CLI komutları birleştirilebilir)
- README, CONTRIBUTING ve docs güncellenirken her iki taraf da sayılmalı

## ADR-023: Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri (Sprint 072)

**Context:** Plan tier isimleri Claude'a özgüydü: `max_plan`, `max5x_plan`, `pro_plan`. Bu isimler Codex ve Gemini kullanıcıları için anlamsızdı. Provider-agnostic bir CLI olarak Deckent, belirli bir sağlayıcıya atıfta bulunmamalı.

**Decision:** Tier isimleri genelleştirildi:
- `max_plan` → `performance` (en yüksek kalite, en yüksek maliyet)
- `max5x_plan` → `balanced` (kalite/maliyet dengesi)
- `pro_plan` → `economic` (düşük maliyet, temel görevler)
- `unlimited` korundu (sınırsız kullanım planları için)

Init wizard da güncellendi: "Select your Claude plan" → "Select your plan". Eski isimler geriye dönük uyumluluk için config migration'da alias olarak tanındı.

**Consequence:** Yeni kullanıcılar provider-agnostic terminoloji görür. Mevcut config'ler autoMigrateOnLoad ile otomatik güncellenir. Tüm belgeler yeni tier isimlerini kullanır. DECKENT.md ve CLAUDE.md provider.ts model equivalence tablosunu güncellenmiş tier isimleriyle gösterir.

## ADR-024: sprint-controller.ts God Object Split — sprint-phases.ts Extract (Sprint 072)

**Context:** `sprint-controller.ts` 1300+ satıra büyüdü ve 8 sprint fazının tamamını içeriyordu. Bu durum bakım güçlüğü, yüksek cognitive load ve bağımsız test yazımını zorlaştırıyordu. Sprint 036'daki brain.ts split'inin ardından sprint-controller da god object haline geldi.

**Decision:** Sprint fazları `sprint-phases.ts` adlı yeni dosyaya çıkarıldı. `runSprint()` içindeki 7 faz fonksiyonu extract edildi:
- `runPlanPhase`, `runSpawnPhase`, `runEvaluatePhase`, `runFixPhase`
- `runRetroPhase`, `runDecayPhase`, `runCleanupPhase`

`sprint-controller.ts` orchestration mantığını korur, fazları import eder. Backward compatibility sprint-controller re-export layer üzerinden sağlandı.

**Consequence:** Her faz bağımsız olarak test edilebilir. `sprint-controller.ts` boyutu önemli ölçüde azaldı. Yeni faz eklemek veya mevcut fazı değiştirmek tek dosyayı etkiler. orchestra/ modül sayısı 36'dan 37'ye çıktı.

## ADR-025: Graceful Shutdown Stratejisi — SIGINT → interruptActiveSprint (Sprint 076)

**Context:** Kullanıcı Ctrl+C yaptığında veya process SIGINT aldığında, çalışan sprint aniden sonlanıyordu. Worker'lar temizlenmeden çıkıyor, task dosyaları yarım kalıyor, tmux sessionlar arka planda çalışmaya devam ediyordu. Bu durum .tasks/ dizininde stale heartbeat ve kilit dosyalarına yol açıyordu.

**Decision:** `entry.ts` içindeki SIGINT handler genişletildi:
1. `interruptActiveSprint()` çağrılır — aktif sprintin graceful shutdown koordinasyonunu yapar
2. `killAllSessions()` çağrılır — tüm tmux session'larını temizler
3. İşlem sırayla yapılır: önce sprint state kayıt, sonra session kill

**Consequence:** Ctrl+C sonrası temiz state bırakılır. Sprint INTERRUPTED olarak işaretlenir, review komutu bu durumu gösterir. Worker'lar SIGTERM sinyali alır ve kendi .hb dosyalarını DONE olarak işaretleyebilir. `deckent cleanup` sonrasında orphan dosya kalmaz.

## ADR-026: God Object Split Stratejisi — Faz 1-3 Tamamlandı (Sprint 076)

**Context:** `sprint-controller.ts` zamanla god object haline geldi (1300+ satır). Sprint 036'da brain.ts split'i yapılmıştı ama sprint-controller yeniden şişti. Test ve bakım güçlüğü arttı.

**Decision:** 3 fazlı kademeli split stratejisi:
- **Faz 1 (Sprint 072):** `sprint-phases.ts` — 7 sprint faz fonksiyonu extract edildi (`runPlanPhase`, `runSpawnPhase`, vb.)
- **Faz 2 (Sprint 075):** `sprint-utils.ts` — shared sprint utility fonksiyonları extract edildi
- **Faz 3 (Sprint 076):** `result-collector.ts` — `waitForResults()` ve IPC+fs.watch döngüsü extract edildi

Her fazda backward compatibility sprint-controller re-export layer üzerinden korundu.

**Consequence:** `sprint-controller.ts` orchestration koordinatörü rolüne döndü — iş mantığı bağımsız modüllerde. orchestra/ modül sayısı 37'den 47'ye çıktı. Her yeni modül bağımsız unit test kapsamı kazandı. Kademeli split stratejisi büyük refactor riskini minimize etti.

## ADR-022: CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar (Updated Sprint 085)

**Context:** Sprint 085'te MCP tool parametreleştirilmesi tamamlandı. `deckent_init`, `deckent_start`, `deckent_status`, `deckent_doctor`, `deckent_retro`, `deckent_history` araçlarına CLI karşılıkları olanyla eşit parametreler eklendi. Ayrıca `deckent_agent_list` ve `deckent_skill_list` araçları CLI-only olan `deckent agent list` ve `deckent skill list` komutlarını MCP'ye getirdi.

**Decision:** CLI-only komutlar altyapı/terminal işlemleridir ve MCP'de yer almaz:
- **Altyapı:** `attach`, `spawn`, `watch` — tmux oturum yönetimi
- **Sunucu/UI:** `dashboard`, `web`, `serve` — arabirim başlatma
- **Kurulum:** `upgrade`, `onboard` — setup sihirbazları
- **Eklenti:** `plugin install`, `plugin list`, `plugin create` — eklenti yönetimi

MCP-only komutlar yoktur — tüm MCP araçlarının CLI karşılığı mevcuttur.

**Tam Parity:** 19 MCP araç = 19 CLI komutu (Sprint 085 sonrası):
- Core: `init`, `set-directives`, `plan`, `start`, `status`, `doctor`, `retro`, `history`
- Management: `analyze`, `sync`, `config`, `usage`, `review`
- Execution: `run`, `kill`, `cleanup`
- Meta: `help`, `agent-list`, `skill-list`

**Consequence:**
- Kullanıcı CLI'da yapabildiği her şeyi MCP (Claude Code, VS Code, JetBrains) üzerinden de yapabilir
- MCP tool sayısı 16'dan 19'a çıktı (`deckent_agent_list`, `deckent_skill_list` eklendi)
- CLI komut sayısı 32'den 33'e çıktı (`set-directives` eklendi)
- Parametre parity: tüm MCP araçları CLI komutlarıyla aynı giriş/çıkış şemasını kullanır
- Altyapı komutları (attach, web, serve, plugin) sadece CLI'da tutulur, MCP'de eksik kalır intentional olarak

## ADR-027: Hybrid Spawn Backend (Sprint 123)

**Decision:** Hibrit backend desteği DEFERRED. Mevcut tek-backend modeli yeterli. `SpawnBackendFactory` docker → tmux → subprocess fallback zinciriyle TEK bir backend seçer; hibrit mod (worker Docker'da, auditor subprocess olarak) implementasyona alınmayacak.

**Context:** Auditor scan loop `sprint-controller.ts` içinde in-process olarak çalışır — tmux/subprocess/docker backend'lerinden tamamen bağımsızdır. Worker'lar backend üzerinden spawn edilirken auditor dosya sistemi üzerinden `.hb` heartbeat dosyalarını okur. Auditor'ın backend seçimiyle hiçbir doğrudan bağlantısı olmadığından, hibrit mod için ayrı bir mekanizma gerekmez. Worker isolation Docker container'larıyla sağlanmaktadır.

**Consequence(s):** Hibrit backend implementasyonu yapılmayacak. Auditor zaten backend-agnostic olduğundan ek değişiklik gerektirmez. Gelecekte auditor'ın ayrı bir process olarak çalıştırılması gerekirse (örn. distributed sprint execution), bu ADR revisit edilecek ve hibrit mod tekrar değerlendirilecek.

## ADR-028: Decision-Engine V1 → V2 Routing Migration

**Context:** Sprint 031'de keyword-based DecisionOrchestrator tasarlandı (6-step pipeline). Sprint 066'da intent-based V2 routing engine (routeTaskV2) ile değiştirildi.

**Decision:** V1 kod silinmeyecek — referans implementasyonu olarak korunacak. @deprecated ile işaretlendi.

**Consequences:** 4 kaynak dosya + 38 test maintained but unused in production. decision-logger.ts hâlâ V2 tarafından kullanılıyor.

**Status:** ACCEPTED (Sprint 130)

## ADR-029: Managed-Docs Universalization — Sprint Lifecycle Template-Based Document Generation

**Status:** ACCEPTED (Sprint 131)

**Context:**
Önceki sprintlerde `sprint-reporter.ts` içindeki `updateProjectDocs()` fonksiyonu yalnızca hard-coded dokümanlara (CLAUDE.md, IDENTITY.md, README.md gibi) güncelleme yapabiliyordu. Kullanıcı kendi dokümanlarını (ARCHITECTURE.md, ONBOARDING.md, KPI dashboards) sprint döngüsüne dahil etmek istediğinde doğrudan `sprint-reporter.ts` kodunu değiştirmek zorunda kalıyordu. Bu durum:
- Kullanıcı konfigürasyonunu kaynak koduyla karıştırıyordu (separation of concerns ihlali)
- Her sprint sonrasında kullanıcı dokümanları stale kalıyordu
- Multi-language (TR/EN) proje dokümanları için tutarsız içerik üretiliyordu
- Plugin sistemi yok — yeni bölüm türü eklemek kaynak kodu değişikliği gerektiriyordu

Deckent'in hedef vizyonu "sprint lifecycle'ı herhangi bir proje türüne uygulayabilme" iken, doküman sistemi TypeScript mono-repo'ya hard-coded kalmıştı.

**Decision:**
`src/orchestra/managed-docs/` modül paketi oluşturuldu. Sprint finalizasyonunda `updateProjectDocs()` built-in updater'lardan sonra `runManagedDocUpdates()` çağırır. Sistem şu bileşenlerden oluşur:

1. **`.deckent/docs.json` konfigürasyon şeması** — `ManagedDocEntry` arayüzü: `path`, `autoSections`, `protectedSections`, `skills`, `maxLines`, `templates` alanları. Kullanıcı hangi dosyanın hangi bölümlerinin otomatik güncelleneceğini bildirir.
2. **`SectionGenerator` arayüzü** — `{ id, patterns, patternsByLang, generate(ctx) }`. Her generator bir bölüm başlığı deseni eşleştirir ve `DocUpdateContext`'ten markdown içeriği üretir.
3. **`content-generators.ts`** — 8 built-in generator: sprint-metrics, active-debt, sprint-history, agent-performance, changelog, test-coverage, module-map, dependencies. Generator registry runtime-extensible.
4. **`section-updater.ts`** — Mevcut dosyayı parse eder, sadece `autoSections` bölümlerini değiştirir, `protectedSections` ve kullanıcı içeriğini korur.
5. **`managed-doc-runner.ts`** — Orchestration: config okuma → user generator yükleme → cache kontrol → içerik üretimi → bölüm güncelleme → cache yazma.

Yeni doküman eklemek sıfır kaynak kodu değişikliği gerektirir — sadece `.deckent/docs.json` düzenlemesi yeterlidir.

**Consequences (+):**
- Kullanıcı herhangi bir markdown dokümanı sprint döngüsüne dahil edebilir
- `protectedSections` ile el ile yazılan bölümler hiç dokunulmaz
- `autoSections` match case-insensitive ve kısmi eşleşme destekler (TR/EN başlıkları)
- `templates` alanıyla built-in generator olmayan bölümler için `{{placeholder}}` syntax ile custom içerik tanımlanabilir
- `maxLines` ile uzun otomatik bölümler kırpılır

**Consequences (-):**
- `.deckent/docs.json` yoksa sistem hiçbir şey yapmaz — opt-in
- Büyük projelerde onlarca doküman için sprint bitişinde ek I/O yükü
- `section-updater.ts` markdown heading parse'ı stdlib yokluğundan regex-based — edge case'ler mümkün

**Alternatives Considered:**
- Hard-coded `sprint-reporter.ts` güncellemeleri — ölçeklenmez, kullanıcı özelleştirme yok, her yeni bölüm tipi kaynak kodu değişikliği gerektirir
- Harici template engine (Handlebars, Mustache) — runtime dependency, format vendor lock-in, ADR-010 minimal-dependency politikasıyla çelişir
- Ayrı CLI komutu (`deckent docs run`) — sprint döngüsüne entegre değil, kullanıcıların her seferinde manuel çağırması gerekir, tutarsız state riski
- Git-based template merge (patch stratejisi) — conflict resolution kompleks, merge çakışmaları kullanıcı deneyimini bozar

**Migration Impact:**
Mevcut projeler `.deckent/docs.json` oluşturmadan bu sistemi kullanmaz — backward-compat sağlanmıştır. İlk kez etkinleştirmek için `deckent docs add <path>` komutu veya dosyayı manuel oluşturmak yeterlidir.

**References:**
- Sprint 131 commit: `e1da3c7` — feat: Sprint 131 — Managed Docs Universalization
- Kaynak: `src/orchestra/managed-docs/managed-doc-runner.ts`, `types.ts`, `docs-config.ts`
- Entegrasyon noktası: `src/orchestra/sprint-reporter.ts` → `updateProjectDocs()` → `runManagedDocUpdates()`

---

## ADR-030: Template Engine + Plugin Loader — Managed-Docs Render Pipeline

**Status:** ACCEPTED (Sprint 131)

**Context:**
Managed-Docs sistemi built-in `SectionGenerator`'ları sprint context'inden markdown üretir. Ancak bazı kullanıcılar:
- TypeScript yazmadan özel bölüm içeriği oluşturmak istiyor
- Proje-spesifik metrikler üretmek için kendi JavaScript mantığını çalıştırmak istiyor
- Farklı dillerdeki bölüm başlıkları için aynı generator'ı kullanmak istiyor

Built-in generator sistemi genişletilemez yapıda kalırsa, her yeni section türü `content-generators.ts` kaynak kodu değişikliği gerektirir.

**Decision:**
İki katmanlı extensibility sistemi tasarlandı:

**Katman 1: Template Renderer (`template-renderer.ts`)**
- `{{path.to.value}}` placeholder syntax — `DocUpdateContext`'e karşı çözümlenir
- `buildTemplateScope()` — sprint result, config, metrikler, agent/skill sayıları, paket versiyonu gibi standart değerleri scope'a ekler
- `resolvePath()` — nokta-ayrılmış yol üzerinden nested nesne/Map erişimi
- `renderTemplate()` — regex replace, unresolved placeholder → boş string (non-fatal)
- Konfigürasyon-level: `ManagedDocEntry.templates: Record<sectionTitle, templateString>`

**Katman 2: Plugin Loader (`plugin-loader.ts`)**
- `.deckent/generators/` dizininden kullanıcı generator'ları yüklenir
- **Format A — Declarative JSON** (`.json` uzantısı): `{ id, patterns, patternsByLang, template }` — güvenli, kod çalıştırmaz, `renderTemplate()` ile işlenir
- **Format B — Executable MJS** (`.mjs` uzantısı): `default export` olarak `SectionGenerator` — `loadUserGeneratorsAsync()` ile dinamik import, sprint pipeline'da *varsayılan olarak* çalışmaz (`--with-plugins` flag gerekir)
- User generator'lar built-in generator'lardan **önce** denenir (override semantiği)

Güvenlik kararı: JSON generator'lar `loadUserGeneratorsSync()` ile sync olarak sprint içinde çalışır; MJS generator'lar ise ayrı `loadUserGeneratorsAsync()` çağrısı gerektirir ve yalnızca güvenilen kaynaklardan yüklenmelidir.

**Consequences (+):**
- Template syntax öğrenme eğrisi düşük — `{{metrics.coveragePercent}}%` yeterli
- JSON format code review kolaylığı ve static analysis uyumluluğu sağlar
- MJS format güçlü extensibility (herhangi bir hesaplama yapılabilir)
- User generator'lar built-in'leri override edebilir — proje-spesifik davranış mümkün

**Consequences (-):**
- MJS generator'lar için güvenlik modeli geliştirilmemiş — keyfi kod çalıştırma riski
- `buildTemplateScope()` context-snapshot; generator çalışırken yeni değerler scope'a giremez
- `renderTemplate()` hata toleransı (unresolved → empty string) sessiz hataları gizleyebilir

**Alternatives Considered:**
- Sadece built-in generator'lar — extensibility yok, her özelleştirme PR gerektirir
- Tam template engine (Nunjucks, EJS) — ağır bağımlılık, XSS riski context-injection'da
- WebAssembly sandbox'lı plugin'ler — aşırı karmaşıklık, current requirements ötesinde

**References:**
- Sprint 131 commit: `e1da3c7`
- Kaynak: `src/orchestra/managed-docs/template-renderer.ts`, `plugin-loader.ts`
- Güvenlik notu: MJS loader gelecekte `src/core/plugin-loader.ts` SkillSandbox entegrasyonuyla güçlendirilebilir (Sprint 133 Task 1)

---

## ADR-031: Content Hash Cache — Sprint Dokümanları Hash-Based Invalidation

**Status:** ACCEPTED (Sprint 131)

**Context:**
`runManagedDocUpdates()` her sprint bitişinde tüm konfigüre edilmiş dokümanlar için içerik üretimi çalıştırır. Büyük projelerde:
- 10+ managed doküman, her biri için built-in generator chain çalışır
- `readdirSync`, `readFileSync`, `JSON.parse` → her doküman için disk I/O
- AgentPoolManager, SkillPoolManager, modelRegistry instantiation → her bölüm üretiminde

Eğer sprint aralarında doküman içeriği ve konfigürasyon değişmediyse (örn. hotfix sprint — yalnızca küçük bug düzeltmeleri), tüm bu işlem gereksizdir.

Sprint 132 audit'i sync I/O'yu 799 kaynak satırda tespit etti. Cache olmaksızın managed-docs bu sayıyı her sprint'te anlamlı ölçüde artırır.

**Decision:**
**Dual-key SHA-1 cache** tasarlandı (`doc-cache.ts`):

- **Cache dosyası:** `.deckent/cache/managed-docs-cache.json` — `Record<docId, { entryHash, fileHash, updatedAt }>`
- **`entryHash`:** `ManagedDocEntry`'nin `autoSections + templates + protectedSections + maxLines` alanlarının JSON serialization hash'i — konfigürasyon değişikliklerini tespit eder
- **`fileHash`:** Hedef dosyanın mevcut içeriğinin hash'i — dışarıdan yapılan değişiklikleri (manuel düzenleme, başka araç) tespit eder
- **`contentHash(input)`:** `node:crypto` SHA-1, 40 hex karakter — çarpışma-güvenli yerel cache invalidation için yeterli
- **Cache skip mantığı:** `cached.entryHash === entryHash && cached.fileHash === fileHash` → `reason: 'cached_no_change'`, generator çalışmaz
- **Cache yenileme:** Doküman güncellendikten sonra yeni `fileHash` yazılır; hiç değişmese bile `updatedAt` güncellenir
- **Cache temizleme:** `clearDocCache()` → CLI `docs run --no-cache` tarafından çağrılır

**Consequences (+):**
- Değişmeyen dokümanlar için sıfır I/O — repeated sprint'lerde anlamlı hız farkı
- Cache dosyası küçük (doküman başına ~100 byte JSON), `.gitignore`'a eklenebilir
- İki ayrı key sayesinde konfigürasyon değişikliği veya dosya değişikliği ikisi de ayrı ayrı invalidation tetikler
- `--no-cache` escape hatch ile kullanıcı her zaman tam yenileme yapabilir

**Consequences (-):**
- SHA-1 artık kriptografik güvenlik için önerilmez — ancak burada yalnızca cache invalidation için kullanılıyor, güvenlik riski yok
- Cache dosyası stale olabilir (örn. generator mantığı kaynak kodda değiştiğinde) — major version bump'ta `clearDocCache()` çağrılmalı
- `node:crypto` ek I/O — ancak tek `createHash` çağrısı generator chain I/O'sunu geçemez

**Alternatives Considered:**
- mtime-based invalidation — symlink ve cross-filesystem mount'larda güvenilmez; WSL2 üzerinde mtime'lar zaman zaman tutarsız davranır
- MD5 hash — SHA-1 kadar hızlı, ancak SHA-1 Node.js `crypto` built-in API'de standart ve daha yaygın kabul görür
- In-memory cache (process lifetime) — Sprint restart'larında ve yeni terminal session'larında korunmaz; uzun-süren sprint'lerde tutarlı ama genel çözüm değil
- No cache — her sprint'te gereksiz I/O (rejected, Sprint 132 audit bulgusu: 799 sync I/O hot path)
- File watcher (fs.watch) — event-driven invalidation gereksiz karmaşıklık, doküman sayısı az, polling yeterli

**Cache Key Design Rationale:**
Dual-key (entryHash + fileHash) tasarımı şu senaryoları bağımsız olarak ele alır:
- Sadece konfigürasyon değişti (yeni autoSection eklendi) → entryHash değişir, rebuild gerekir
- Sadece dosya değişti (kullanıcı manual düzenledi) → fileHash değişir, rebuild gerekir
- İkisi de değişmedi → cache hit, rebuild atlanır
Tek-key (yalnızca fileHash) konfigürasyon değişikliklerini gözden kaçırırdı.

**References:**
- Sprint 131 commit: `e1da3c7`
- Kaynak: `src/orchestra/managed-docs/doc-cache.ts`, `managed-doc-runner.ts:60-71`
- İlgili: Sprint 132 Task 4 (loadConfig module-level cache) — benzer dual-key pattern, aynı motivasyon

---

## ADR-032: i18n Pattern System — TR/EN İçerik Çeşitliliği Desteği

**Status:** ACCEPTED (Sprint 131)

**Context:**
Deckent TR ve EN kullanıcı tabanına sahip. Sprint 131 öncesinde:
- `content-generators.ts` built-in generator'ları yalnızca İngilizce başlık desenleri eşleştiriyordu
- Türkçe dokümanlar (`## Sprint Metrikleri`, `## Agent Performansı`) için generator match yoktu
- Sabit string'ler (tablo başlıkları, hata mesajları) EN-only hard-coded
- Kullanıcı Türkçe bölüm başlığı kullandığında generator hiç çalışmıyor, bölüm boş kalıyordu

Sprint 092'de `Dashboard i18n` implementasyonu (React tarafı) yapılmıştı; ancak server-side doküman üretim sistemi dil-agnostik hale getirilmemişti.

**Decision:**
İki katmanlı i18n stratejisi:

**Katman 1: `patternsByLang` — Dil-Spesifik Başlık Eşleştirme**
`SectionGenerator` arayüzüne `patternsByLang?: Record<string, string[]>` eklendi:
```typescript
{
  patterns: ['sprint metrics', 'metrics'],
  patternsByLang: {
    tr: ['sprint metrikleri', 'metrikler', 'sprint istatistikleri'],
    de: ['sprint-metriken', 'metriken'],
    es: ['métricas', 'estadísticas del sprint'],
  }
}
```
`findGenerator()` hem `patterns` hem tüm `patternsByLang` değerlerini birleştirerek arar. Konfigürasyon dil anahtarı kullanılmaz — tüm diller her zaman aranır (language-agnostic match). Bu yaklaşım mixed-language dokümanları da destekler.

**Katman 2: `I18nStrings` — Üretilen İçerik Lokalizasyonu**
`content-generators.ts` içinde:
- `I18nStrings` interface — tablo başlıkları, durum mesajları, hata string'leri
- `EN` ve `TR` sabit objeleri — compile-time derleme, runtime yük yok
- `i18n(ctx)` helper — `ctx.config?.language === 'tr' ? TR : EN` — EN default
- Her built-in generator `i18n(ctx)` çağırır: `const s = i18n(ctx)` → `| ${s.metric} | ${s.value} |`

Dil konfigürasyonu: `.deckent/config.json`'da `"language": "tr"` veya `"en"`. `buildStandaloneDocContext()` config.json'dan okur, sprint pipeline'da `ctx.config.language` üzerinden taşınır.

**Consequences (+):**
- Tüm built-in generator'lar TR ve EN çıktı üretir — zero configuration
- `patternsByLang` ile DE, ES, FR gibi yeni diller ekleme kolaylığı — tek obje değişikliği
- User-defined JSON generator'lar da `patternsByLang` kullanabilir — tam extensibility
- Mixed-language dokümanlarda hem Türkçe hem İngilizce başlıklar eşleşir

**Consequences (-):**
- Yalnızca TR ve EN tam string tablosu — DE/ES/FR için `patternsByLang` match yapar ama içerik EN çıkar
- `i18n()` helper context-based, statik — runtime dil değişimi desteklenmiyor (sprint restart gerektirir)
- Yeni built-in string eklemek hem `EN` hem `TR` objelerini güncellemeyi gerektirir — senkronizasyon riski

**Alternatives Considered:**
- ICU message format (i18next, formatjs) — ağır bağımlılık, Deckent minimal-dependency politikasıyla çelişir (ADR-010)
- Harici `.json` locale dosyaları — runtime file I/O, deployment karmaşıklığı
- Yalnızca İngilizce — TR kullanıcı deneyimini kırar, Deckent TR-first tasarım vizyonuyla çelişir
- Enum-based dil anahtarı yerine string — `'tr' | 'en'` union type daha iyi tip güvenliği sağlardı (gelecek iyileştirme)

**References:**
- Sprint 131 commit: `e1da3c7`
- Kaynak: `src/orchestra/managed-docs/content-generators.ts:15-66` (I18nStrings, EN, TR, i18n)
- Kaynak: `src/orchestra/managed-docs/types.ts:64-65` (patternsByLang field)
- İlgili: Sprint 092 Dashboard i18n (React tarafı), Sprint 084 i18n kapsam genişletmesi

---

## ADR-033: Product Vision — Product Not Service

**Status:** ACCEPTED

**Date:** 2026-04-11

**Context:**
Deckent, Sprint 134 itibarıyla kritik bir kavramsal dönüm noktasına ulaştı. 130+ sprint sürecinde organik büyüme, zaman zaman "SaaS platform" ya da "kurumsal servis" yönünde baskı yarattı: cloud deployment fikirleri, paywall tartışmaları, enterprise tier düşünceleri, SOC2 sertifikasyonu önerileri. Bu baskıların tamamı tek bir tutarsızlık kaynağından besleniyor:

**Deckent'in ne olduğu hiçbir zaman formal olarak kayıt altına alınmamıştı.**

Kullanıcı deneyimi gözlemleri:
- Yeni geliştirici `npx deckent init && deckent start` ile <5 dakikada sprint başlatabilmeli
- Kurulum, lisans, bulut hesabı, API anahtarı, ödeme bilgisi gerektirmemeli
- Deckent offline çalışabilmeli (Claude Code local session ile)
- Her proje kendi `.deckent/` dizinine sahip — veri hiçbir yerde paylaşılmıyor

Sprint 133 post-mortem'de "product-not-service" ifadesi üç ayrı bağlamda kullanıldı ve herhangi bir şekilde formalize edilmedi. Sprint 134 DIRECTIVES bu boşluğu kapatmak için T-007'yi "DOKUNULAMAZ VİZYON" olarak işaretledi.

Referans bellek: `.claude/projects/-home-alperen-deckent-dev/memory/project_vision_product_not_service.md`

**Decision:**
Deckent bir **üründür (product)**, **servis değildir (not service)**.

Bu kararın dört dokunulamaz prensibi:

1. **Product, not service** — Deckent bulutta yaşamaz. Kullanıcının makinesinde çalışır. Bir API endpoint'e bağımlı değildir. Sunucu yoktur, uptime SLA'sı yoktur, oncall ekibi yoktur.

2. **Kur-çalıştır kolay** — `npx deckent init && deckent start` iki komutla tam işlevsel bir sprint orkestrasyon sistemi kurulur. Kurulum friction'ı sıfıra yakın olmalıdır. Wizard, interaktif setup, README-first onboarding.

3. **Açık kaynak, ücretsiz** — Deckent'in hiçbir özelliği ödeme duvarının arkasında olamaz. Tüm core özellikler MIT lisansı altında. Topluluk katkısı teşvik edilir. Fiyatlandırma modeli yoktur.

4. **Herkese, her yerde** — macOS, Linux, WSL2, Docker, CI ortamları. Dil engeli yoktur (TR/EN i18n). Bant genişliği kısıtlı ortamlarda çalışır. Local model desteği roadmap'te.

**Kaldırılan / Yasak Boyutlar:**

Bu karar aşağıdaki yönlerin Deckent roadmap'inden kalıcı olarak çıkarıldığını ilan eder:

| Boyut | Neden Yasak |
|-------|-------------|
| SaaS model | Sunucu bağımlılığı yaratır, product kimliğiyle çelişir |
| Cloud-hosted deployment | Kullanıcı verisini dışarı taşır, gizlilik ilkesini kırar |
| Paywall / premium tier | Açık kaynak taahhüdüyle uyumsuz |
| Enterprise edition | İki kod tabanı yaratır, topluluk bölünmesine yol açar |
| SOC2 / ISO 27001 sertifikasyonu | Kurumsal servis modeli gerektirir, ürün kimliğiyle çelişir |
| Oncall / SLA / uptime monitoring | Servis sorumluluğu gerektirir — ürün mimarisinde geçersiz |
| Multi-tenant cloud infrastructure | ADR-034 ile net ayrım: multi-project ≠ multi-tenant SaaS |
| Subscription billing | Ödeme altyapısı = servis olmak demektir |
| Vendor lock-in | Belirli bir bulut sağlayıcısına bağımlılık kabul edilemez |

**Korunan / Güçlendirilen Boyutlar:**

Bu karar aşağıdaki yönlerin öncelikli geliştirme alanları olduğunu teyit eder:

| Boyut | Gerekçe |
|-------|---------|
| Local observability | Kullanıcı kendi sprint metriklerini kendi makinesinde görür (T-011) |
| God object split | Modüler, anlaşılabilir kod = ürün kalitesi (T-009, T-010) |
| Task dependency pipeline | Gerçek orkestrasyon zekası, ürün değer önerisi (T-001) |
| Distribution | `npx deckent` — sıfır kurulum, her yerde çalışır |
| Setup wizard | İlk deneyim mükemmel olmalı — kur-çalıştır hedefi |
| Local model support | Offline-first, API key gerektirmeyen sprint modu (roadmap) |
| i18n / TR-EN | Ürün her kullanıcıya kendi dilinde konuşur |
| Cross-platform | macOS + Linux + WSL2 + Docker = herkese her yerde |
| Açık kaynak ekosistemi | OpenHands, Aider, OpenClaw ile ittifak — değer paylaşımı |

**Consequences (+):**

- Tüm mühendislik kararları net bir lens üzerinden geçer: "Bu özellik local product deneyimini mi güçlendiriyor?"
- Roadmap tartışmalarında "SaaS yapalım mı?" sorusu geçerliliğini yitirir — ADR-033 referans gösterilir
- Katkıda bulunanlar ürün kimliğini anlar, yanlış yönlü PR'lar azalır
- OpenHands ve Aider gibi open-source CLI araçlarla ekosistem uyumu artar
- Kullanıcı trust'ı: veri asla dışarı çıkmıyor, garantisi var

**Consequences (-):**

- Gelecekte kurumsal gelir modeli kurmak isteyenler için kapı kapalı
- Hosting hizmeti sunmak isteyen community fork'ları bu ADR'a aykırı davranır
- "Managed Deckent cloud" gibi ticari girişimlerin core repo'ya merge edilmesi reddedilir
- SaaS rakiplerine karşı "anında erişim" avantajı kaybolur (kurulum gerekir, kayıt yok)

**Alternatives Considered:**

- **Freemium SaaS** — Ücretsiz tier + premium bulut özellikleri. Reddedildi: iki kimlik yaratır, açık kaynak taahhüdünü sulandırır.
- **Enterprise self-hosted** — Kurumsal lisans, on-prem deployment. Reddedildi: farklı destek altyapısı gerektirir, topluluktan kopuş başlar.
- **Hibrit model** — Core açık kaynak, bulut senkronizasyon eklentisi. Reddedildi: "her şey local" ilkesini kırar, veri akışı gizlilik sorusu yaratır.
- **Platform agnostik (karar erteleme)** — Şimdilik karar verme, her iki yöne açık kal. Reddedildi: belirsizlik mühendislik maliyeti yaratır, yanlış yönlü feature'lar birikmesine neden olur.

**References:**

- Sprint 134 DIRECTIVES — "DOKUNULAMAZ VİZYON" bölümü
- `.claude/projects/-home-alperen-deckent-dev/memory/project_vision_product_not_service.md`
- ADR-034: Multi-Project Isolation (kardeş ADR — multi-project ≠ SaaS multi-tenant)
- ADR-010: Minimal Dependencies (bağımlılık minimizasyonu, product kimliğiyle uyumlu)
- `docs/vision/roadmap.md` — Halka açık yol haritası, product vizyonu pazarlama diliyle
- OpenClaw GitHub — kur-çalıştır referans implementasyon
- Sprint 134 design spec: `docs/superpowers/specs/2026-04-11-sprint-134-design.md`
- ADR-008: Module Import Rules — brain/worker sınır disiplini tek-kod-tabanı product kimliğini güçlendirir (SaaS servis katmanına ihtiyaç bırakmaz, community fork'lar aynı sınırları korur)

---

## ADR-034: Multi-Project Isolation — Per-Project Security Boundaries

**Status:** ACCEPTED

**Date:** 2026-04-11

**Context:**

Deckent, tek bir kullanıcının aynı makinesinde birden fazla proje orkestre etmesini destekler. Her proje kendi `.deckent/`, `.brain/`, `.tasks/` dizinlerine sahiptir ve bu izolasyon fiilen var olsa da hiçbir zaman formal olarak tanımlanmamıştır.

**KRİTİK AYIRIM: multi-project ≠ SaaS multi-tenant.**

Bu ADR, aynı kullanıcının aynı makinede yan yana çalıştırdığı birden fazla proje arasındaki izolasyonu tanımlar. 10.000 tenant'ın paylaştığı bir sunucu senaryosu (SaaS multi-tenant) Deckent'in kapsamı dışındadır ve ADR-033 tarafından kalıcı olarak yasaklanmıştır.

Sprint 132 Week 1 güvenlik denetimi şu bulguları ortaya çıkardı:
- MEDIUM #10: Worker scope check'i symlink'leri takip etmiyor — `fs.realpath()` ile resolve edilmiş hedef path'in scope içinde olduğu doğrulanmıyor
- LOW #4: Sibling project dizinlerine erişim denetimi yalnızca scope matcher'a dayanıyor — scope dışı proje dosyalarına symlink oluşturularak bypass edilebilir
- LOW #7: Global `~/.deckent/config.json` hangi alanların paylaşıldığını, hangilerinin proje-özgü olduğunu belgelemiyor

Sprint 133'te implementasyonu tamamlanan AES-256-GCM per-project credential encryption bu izolasyonun temelini güçlendirdi; ancak scope bypass ve global state paylaşım kuralları formal olarak tanımlanmamıştı.

Tehdit modeli:
1. **Sibling project scope bypass** — Proje A'daki worker, `../proje-b/src/secret.ts` yoluna symlink oluşturup scope check'i geçerek Proje B'nin kaynak koduna erişir
2. **Credential leakage** — Global config'deki proje-özgü API anahtarları yanlışlıkla sibling proje tarafından okunur
3. **Global state pollution** — Bir proje'nin `.deckent/config.json` değişikliği global config'i etkiler, diğer projelerin davranışını değiştirir
4. **Symlink cycle DoS** — Recursive symlink'ler scope resolver'ı sonsuz döngüye sokar

**Decision:**

Deckent multi-project izolasyonu şu dört katmandan oluşur:

### Katman 1: Per-Project Directory Isolation (Mevcut, Formalize Ediliyor)

Her proje kendi bağımsız dizin yapısına sahiptir:
- `.deckent/` — proje konfigürasyonu, agent/skill pool, metric data
- `.brain/` — karar kayıtları, bellek, retrospektif, desenler
- `.tasks/` — sprint task dosyaları, heartbeat, result, lock
- `.locks/` — file lock dosyaları

Bu dizinler arasında cross-reference yoktur. Bir projenin `.brain/MEMORY.md`'si yalnızca o projenin sprint geçmişini içerir.

### Katman 2: Per-Project Credential Encryption

Sprint 133'te implementasyonu tamamlanan sistem:
- Her proje `.deckent/credentials.enc` dosyasına AES-256-GCM ile şifrelenmiş credential'lar saklar
- Encryption key per-project `projectRoot` path hash'inden türetilir
- Sibling proje'nin `.deckent/credentials.enc` dosyası farklı key ile şifrelenmiştir — çapraz okuma başarısız olur
- Decryption yalnızca proje dizini context'inde gerçekleşir

### Katman 3: Symlink-Aware Scope Enforcement

`isWithinScope()` fonksiyonu symlink-aware hale getirilir:
- `fs.realpathSync()` ile path resolve edilir — symlink hedef dosyanın gerçek konumu belirlenir
- Resolve edilmiş path scope matcher'a verilir
- Symlink hedefi scope dışındaysa → `ScopeViolationError` fırlatılır
- Recursive symlink (cycle) tespit edilirse → `ScopeViolationError` fırlatılır (`ELOOP` error code)

### Katman 4: Global vs Project-Specific Config Boundary

`~/.deckent/config.json` (global) ile `.deckent/config.json` (proje) arasında net ayrım:

| Alan | Scope | Paylaşım Kuralı |
|------|-------|------------------|
| `brain_provider`, `worker_provider` | Global OR Project | Proje override'ı tercih edilir |
| `max_workers` | Global OR Project | Proje override'ı tercih edilir |
| `brain_planning` | Global OR Project | Proje override'ı tercih edilir |
| `min_tier`, `mode_preset` | Global OR Project | Proje override'ı tercih edilir |
| `OPENAI_API_KEY`, `GOOGLE_API_KEY` | Environment | İşletim sistemi env var, config'de saklanmaz |
| `telemetry_enabled` | Hard-coded FALSE | ADR-033 gereği her zaman false |
| `verify_loop` | Project | Proje-özgü, global default true |
| `auto_archive_directives` | Project | Proje-özgü |
| Agent/skill pool | Project | Per-project `.deckent/agents/`, `.deckent/skills/` |
| Sprint history | Project | Per-project `.brain/sprints/` |

API anahtarları config dosyalarında saklanmaz — environment variable olarak iletilir. Bu, global config'in credential leakage vektörü olmasını engeller.

**Consequences (+):**

- Symlink scope bypass güvenlik açığı kapatılır (Sprint 132 MEDIUM #10)
- Per-project izolasyon kuralları formal ve test edilebilir hale gelir
- Global vs project config boundary belgelenir — yeni alan eklenirken hangi scope'a ait olduğu açıktır
- Credential isolation zaten AES-256-GCM ile sağlanıyor — bu ADR formalize eder
- "multi-project ≠ multi-tenant" ayrımı netleşir — yanlış yönlü PR'lar önlenir

**Consequences (-):**

- `isWithinScope()` artık `fs.realpathSync()` çağrısı yapar — her scope check'te bir disk I/O ekstra
- `realpathSync()` symlink hedefi silinmişse hata fırlatır — hata yönetimi gerekir
- Recursive symlink tespiti `ELOOP` error code'una dayanır — farklı OS'lerde davranış farkı olabilir
- Global config boundary kuralları yeni alan eklendiğinde güncellenmeli — yoksa belirsiz paylaşım kuralı oluşur

**Alternatives Considered:**

- **Sandboxed worker process** — Her worker'ı chroot/namespace ile izole et. Reddedildi: aşırı karmaşıklık, cross-platform uyumsuzluk (macOS chroot sınırlı), Deckent ürün kimliğiyle orantısız.
- **Yalnızca path normalization** — `path.normalize()` ile `..` segmentlerini çöz, symlink'leri ignore et. Reddedildi: hardlink ve symlink bypass'ı hâlâ mümkün.
- **Worker-level filesystem virtualization** — Sanal dosya sistemi katmanı. Reddedildi: Node.js native fs API uyumsuz, performans maliyeti yüksek.
- **Yalnızca dökümantasyon** — İzolasyon kurallarını belgeleyip enforce etme. Reddedildi: güvenlik açığı açık kalır, audit bulgusu kapatılmaz.
- **Docker isolation per project** — Her projeyi ayrı container'da çalıştır. Reddedildi: Docker dependency = kurulum friction, ADR-033'ün "kur-çalıştır" ilkesiyle çelişir.

**References:**

- Sprint 132 Week 1 güvenlik denetimi — MEDIUM #10 (symlink scope bypass)
- Sprint 133 credential encryption implementasyonu (AES-256-GCM per-project)
- ADR-033: Product Vision — Product Not Service (multi-tenant yasağı)
- ADR-004: 3-Layer Config Merge (global vs project config mekanizması)
- `src/agents/worker.ts:isWithinScope()` — symlink-aware scope check implementasyonu
- `docs/design/multi-project-isolation.md` — detaylı tasarım dokümanı ve test stratejisi

---

## NOTE: Büyük Dosya Split Analizi (Sprint 130)

- sprint-controller.ts (2133 satır) — Split önerisi: sprint-lifecycle.ts (faz yönetimi) + sprint-orchestrator.ts (worker koordinasyonu)
- sprint-reporter.ts (2132 satır) — Split önerisi: retro-writer.ts (retrospektif) + performance-reporter.ts (metrik)
- **Status:** Gelecek sprint'te değerlendirilecek — bu sprint'te sadece belgelendi.
