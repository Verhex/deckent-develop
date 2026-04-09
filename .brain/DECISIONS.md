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

## NOTE: Büyük Dosya Split Analizi (Sprint 130)

- sprint-controller.ts (2133 satır) — Split önerisi: sprint-lifecycle.ts (faz yönetimi) + sprint-orchestrator.ts (worker koordinasyonu)
- sprint-reporter.ts (2132 satır) — Split önerisi: retro-writer.ts (retrospektif) + performance-reporter.ts (metrik)
- **Status:** Gelecek sprint'te değerlendirilecek — bu sprint'te sadece belgelendi.
