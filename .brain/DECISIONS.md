# Architecture Decision Records

## ADR-001: TypeScript + ESM

**Status:** accepted

**Decision:** Use TypeScript with `"type": "module"` (ESM) as the project foundation.
**Context:** Deckent is a Node.js CLI tool. ESM is the modern standard, supported by Node 18+.
**Consequence:** All imports must use `.js` extensions. CommonJS interop via `esModuleInterop`.

## ADR-002: Node16 Module Resolution

**Status:** accepted

**Decision:** Use `"module": "Node16"` and `"moduleResolution": "Node16"` in tsconfig.
**Context:** TypeScript 5.2+ requires these to match. Node16 resolution enforces `.js` extensions and `package.json` exports.
**Consequence:** Explicit `.js` in all relative imports. No index file auto-resolution.

## ADR-003: vitest over Jest

**Status:** accepted

**Decision:** Use vitest for testing.
**Context:** Native ESM support, faster startup, v8 coverage provider, compatible API.
**Consequence:** Tests in `tests/` directory, `vitest.config.ts` at root.

## ADR-004: 3-Layer Config Merge

**Status:** accepted

**Decision:** Config loads in 3 layers: hardcoded defaults → `~/.deckent/config.json` → `.deckent/config.json`.
**Context:** Users need global defaults (plan type, language) and per-project overrides.
**Consequence:** `deepMerge` function handles nested object merge. Arrays are replaced, not merged. `undefined` values are skipped.

## ADR-005: Synchronous I/O

**Status:** deprecated

> **Note:** Sprint 132 CRITICAL #1 — Senkron I/O hot path performans sorunlarına yol açtı. Yeni modüller async I/O kullanmalıdır.

**Decision:** Wave 2 modülleri (tmux, auditor, worker) senkron I/O kullanır.
**Context:** tmux komutları <100ms, lock dosyaları <1KB, auditor 30s cycle'da birkaç küçük JSON okur. Async overhead gereksiz.
**Consequence:** Tüm fonksiyonlar senkron. Gelecekte performans sorunları çıkarsa async'e geçilebilir.

## ADR-006: spawnSync Security Pattern

**Status:** accepted

**Decision:** Tüm shell komutları `spawnSync(binary, [...args])` ile çalıştırılır, shell interpretation yok.
**Context:** Command injection riski sıfıra indirilmeli. Prompt ve diğer kullanıcı girdileri argument array olarak geçer.
**Consequence:** Template literal veya string concat ile komut oluşturmak yasak. `{ shell: true }` kullanılmaz.

## ADR-007: SpawnOptions Interface

**Status:** accepted

**Decision:** `SpawnOptions { allowedTools?: string; autoApprove?: boolean }` tmux modülünde tanımlanır.
**Context:** Blueprint 15 gereği her ajan `--allowedTools` ile kısıtlanır. `autoApprove` ise `--dangerously-skip-permissions` ekler.
**Consequence:** Brain, worker scope'una göre allowedTools string'i hesaplar. SpawnOptions her spawn fonksiyonuna opsiyonel parametre olarak geçer.

## ADR-008: Brain Merkezi Import — Tek Yönlü Bağımlılık

**Status:** accepted

**Decision:** Brain, projede diğer modülleri (tmux, auditor, worker) import eden TEK modüldür. Diğer modüller brain'i import etmez.
**Context:** Döngüsel import'lar Node.js ESM'de tanımsız davranışa yol açar. Brain orkestratör rolünde — tmux/auditor/worker'ı çağırır ama onlar brain'den bağımsız çalışır.
**Consequence:** `grep -r "from.*brain" src/orchestra/tmux.ts src/monitor/auditor.ts src/agents/worker.ts` her zaman boş sonuç vermeli. Yeni modüller eklenirken bu kural korunmalı.

## ADR-009: DEBT.md Markdown Tablo Formatı

**Status:** accepted

**Decision:** DEBT.md, 9 kolonlu markdown tablo formatında tutulur. Brain `parseDebtTable`/`generateDebtTable` ile programatik okuma/yazma yapar.
**Context:** DebtItem interface'inin tüm alanlarını (id, description, originTaskId, originSprintId, priority, sprintsOpen, resolved, resolvedInSprintId, createdAt) saklamalıyız. JSON yerine markdown tercih edildi çünkü git diff'lerde okunabilir.
**Consequence:** Tablo parse'ı `|` split + `slice(1,-1)` ile yapılır. Boş kolon değerleri korunur. Yeni kolon eklemek parse/generate'i güncellemeyi gerektirir.

## ADR-010: Tek Runtime Dependency — commander.js

**Status:** accepted

**Decision:** CLI tek runtime dependency olarak `commander@^13.0.0` kullanır. chalk, inquirer, picocolors gibi ek kütüphaneler eklenmez.
**Context:** Deckent CLI minimal footprint hedefler. Node 18+ built-in'leri (readline/promises, Unicode support) çoğu ihtiyacı karşılar. Renk desteği modern terminallerde Unicode ile sağlanabilir.
**Consequence:** `package.json` dependencies bölümünde yalnızca `commander` bulunur. Renkli çıktı gerekirse ileride `picocolors` (1.3KB) eklenebilir.

## ADR-011: node:readline/promises — Built-in Prompt

**Status:** accepted

**Decision:** İnteraktif prompt'lar (text, select, confirm) için `node:readline/promises` modülü kullanılır.
**Context:** `inquirer` (1.2MB) veya `prompts` (200KB) eklemek yerine Node 18+ built-in API yeterli. Basit wrapper'lar (`promptText`, `promptSelect`, `promptConfirm`) tüm init wizard ihtiyacını karşılıyor.
**Consequence:** Rich UI (autocomplete, fuzzy search) yok. Gerekirse Phase 3 TUI'da `ink` veya `blessed` eklenebilir.

## ADR-012: register\<Name\>(program) Pattern

**Status:** accepted

**Decision:** Her CLI komutu kendi dosyasında tanımlanır ve `register<Name>(program: Command): void` fonksiyonu export eder.
**Context:** Tek dosyada tüm komutları tanımlamak bakım zorluğu yaratır. Ayrı dosyalar bağımsız test, kolay ekleme/çıkarma sağlar.
**Consequence:** `src/cli/commands/` dizininde 16 dosya. Entry point (`index.ts`) 16 register çağrısı yapar. Yeni komut eklemek: dosya oluştur + index.ts'e import + register ekle.

## ADR-013: DECKENT.md Adapter Pattern (Sprint 15)

**Status:** accepted

**Context:** CLAUDE.md'yi init sırasında overwrite etmek kullanıcı değişikliklerini kaybettiriyordu.

**Decision:** DECKENT.md = tek gerçek kaynak. CLAUDE.md ve AGENTS.md adaptör dosyalar — sadece `@DECKENT.md` referansı enjekte edilir (ensureDeckentImport). Asla üzerine yazılmaz.

**Consequences:**
- Init idempotent ve güvenli
- Kullanıcının CLAUDE.md özelleştirmeleri korunur
- Gelecek provider'lar (Codex, Gemini) için adapter pattern genişletilebilir
- `deckent sync` komutu adapter'ları yeniden senkronize eder

## ADR-014: .deck Secret File System (Sprint 044)

**Status:** accepted

**Context:** Provider API key'leri .env'de tutmak proje .env dosyasıyla çakışıyordu. Kullanıcının mevcut .env içeriği DECKENT_ prefix'li key'lerle kirleniyor, .gitignore yönetimi karmaşıklaşıyordu.

**Decision:** Ayrı `.deck` dosyası oluşturuldu. DECKENT_ prefix'li key'ler bu dosyada tutulur. Init sırasında `.deck` otomatik olarak `.gitignore`'a eklenir.

**Consequence:** Worker'lar `.deck` içeriğini görmez. Brain sadece gerekli key'leri task scope'una göre inject eder. Kullanıcının .env dosyası hiç dokunulmaz.

## ADR-015: TaskRouter Module — 6-level routing (Sprint 044)

**Status:** accepted

**Context:** Task → provider atama mantığı sprint-controller'da inline'dı ve genişletilemezdi. Yeni routing kuralı eklemek sprint-controller'ı her seferinde değiştirmeyi gerektiriyordu.

**Decision:** Ayrı `TaskRouter` modülü oluşturuldu. 6 seviyeli öncelik sırası: config → force → agent → skill → worker → fallback.

**Consequence:** Yeni routing kuralları sprint-controller'a dokunmadan eklenebilir. Her seviye bağımsız test edilebilir. Router, task metadata'sını (model, effort, scope) okuyarak otomatik provider seçimi yapar.

## ADR-016: Connector Module — provider lifecycle (Sprint 044)

**Status:** accepted

**Context:** Provider'ların sağlık durumu sadece bootstrap'ta kontrol ediliyordu. Sprint sırasında provider düşerse tespit edilemiyordu.

**Decision:** `Connector` class ile runtime health check, lazy init ve auditor entegrasyonu sağlandı. Her provider bağlantısı Connector üzerinden yönetilir.

**Consequence:** Sprint sırasında provider düşerse auditor tespit eder ve alert üretir. Lazy init sayesinde kullanılmayan provider'lar başlatılmaz. Connector, provider sağlık metriklerini `.dashboard`'a yazar.

## ADR-017: MCP-Native Provider Adapters (Sprint 045)

**Status:** accepted

**Context:** Codex/Gemini adapter'ları mock komutlar kullanıyordu. Gerçek CLI davranışı test edilemiyordu.

**Decision:** Gerçek CLI komutlarına geçiş: `codex exec --full-auto` ve `gemini -p --output-format json`. Adapter'lar gerçek binary'leri wrap eder.

**Consequence:** Gerçek provider'larla uçtan uca test mümkün. CI ortamında binary yoksa `describe.skipIf` ile testler atlanır. Mock adapter'lar yalnızca unit test scope'unda kalır.

## ADR-018: Multi-Environment Config Generation (Sprint 046)

**Status:** accepted

**Context:** Her IDE/ortam farklı config dosyası bekliyor. Codex, Gemini, Cursor, VS Code farklı format ve yol tercihlerine sahip.

**Decision:** Ortam başına config generator: Codex → `config.toml`, Gemini → `settings.json`, Cursor → `mcp.json`. `deckent init --all-envs` tüm ortamları tek seferde hazırlar.

**Consequence:** Kullanıcı tek komutla tüm IDE entegrasyonlarını kurar. Her generator bağımsız modül, yeni ortam eklemek kolaylaşır. Mevcut config'ler üzerine yazılmaz, `writeIfNotExists` prensibi korunur.

## ADR-019: Language-Agnostic Worker Verify (Sprint 046)

**Status:** accepted

**Context:** Worker verify loop sadece `tsc --noEmit` ve `vitest run` çalıştırıyordu. TypeScript dışı projelerde Deckent kullanılamıyordu.

**Decision:** `STACK_COMMANDS` ile dil bazlı build/test komutu belirlendi: Python → `pytest`, Go → `go test ./...`, Rust → `cargo test`. `.deckent/project-stack.json` dosyasından stack okunur.

**Consequence:** Deckent TypeScript dışı projelerde de çalışır. Verify döngüsü stack-aware hale geldi. Yeni dil eklemek `STACK_COMMANDS` map'ine bir entry eklemekle yapılır.

## ADR-020: Rich Sprint Output — 7-section summary (Sprint 044)

**Status:** accepted

**Context:** Sprint sonuç çıktısı tek satır metric'ti. Kullanıcı kaç task tamamlandı, hangi dosyalar değişti, ne öğrenildi gibi bilgilere erişemiyordu.

**Decision:** 7 bölümlü rich output: Header, Results, Changes, Tests, Agents, Learnings, Next Steps. ANSI renk desteği ve `NO_COLOR` env var desteği eklendi.

**Consequence:** Her sprint sonunda kullanıcı tam resmi görür. `NO_COLOR=1` ile CI-friendly düz metin çıktısı alınır. Sprint log formatı da güncellendi — `.brain/sprints/sprint-NNN.md` aynı 7 bölüm yapısını kullanır.

## ADR-021: Kraken ASCII Brand Identity (Sprint 044)

**Status:** accepted

**Context:** Deckent'in görsel bir kimliği yoktu. CLI araçlarında ilk izlenim önemli.

**Decision:** Kraken ASCII mascot: teal gövde (#4db8a4), gold DECKENT yazısı (#c4a855), dim tagline. `deckent --version` ve `deckent init` komutlarında splash gösterilir.

**Consequence:** Marka tanınırlığı artar. `NO_COLOR` veya `CI` env var varsa splash atlanır. ASCII art sabit string olarak `src/cli/splash.ts`'de tutulur, runtime üretilmez.

## ADR-022: CLI/MCP Feature Parity — Tek Yapı, Çoklu Ortam (Sprint 067)

**Status:** superseded

**Superseded by:** ADR-022 v2 (Sprint 085)

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

**Status:** accepted

**Context:** Plan tier isimleri Claude'a özgüydü: `max_plan`, `max5x_plan`, `pro_plan`. Bu isimler Codex ve Gemini kullanıcıları için anlamsızdı. Provider-agnostic bir CLI olarak Deckent, belirli bir sağlayıcıya atıfta bulunmamalı.

**Decision:** Tier isimleri genelleştirildi:
- `max_plan` → `performance` (en yüksek kalite, en yüksek maliyet)
- `max5x_plan` → `balanced` (kalite/maliyet dengesi)
- `pro_plan` → `economic` (düşük maliyet, temel görevler)
- `unlimited` korundu (sınırsız kullanım planları için)

Init wizard da güncellendi: "Select your Claude plan" → "Select your plan". Eski isimler geriye dönük uyumluluk için config migration'da alias olarak tanındı.

**Consequence:** Yeni kullanıcılar provider-agnostic terminoloji görür. Mevcut config'ler autoMigrateOnLoad ile otomatik güncellenir. Tüm belgeler yeni tier isimlerini kullanır. DECKENT.md ve CLAUDE.md provider.ts model equivalence tablosunu güncellenmiş tier isimleriyle gösterir.

## ADR-024: sprint-controller.ts God Object Split — sprint-phases.ts Extract (Sprint 072)

**Status:** accepted

**Context:** `sprint-controller.ts` 1300+ satıra büyüdü ve 8 sprint fazının tamamını içeriyordu. Bu durum bakım güçlüğü, yüksek cognitive load ve bağımsız test yazımını zorlaştırıyordu. Sprint 036'daki brain.ts split'inin ardından sprint-controller da god object haline geldi.

**Decision:** Sprint fazları `sprint-phases.ts` adlı yeni dosyaya çıkarıldı. `runSprint()` içindeki 7 faz fonksiyonu extract edildi:
- `runPlanPhase`, `runSpawnPhase`, `runEvaluatePhase`, `runFixPhase`
- `runRetroPhase`, `runDecayPhase`, `runCleanupPhase`

`sprint-controller.ts` orchestration mantığını korur, fazları import eder. Backward compatibility sprint-controller re-export layer üzerinden sağlandı.

**Consequence:** Her faz bağımsız olarak test edilebilir. `sprint-controller.ts` boyutu önemli ölçüde azaldı. Yeni faz eklemek veya mevcut fazı değiştirmek tek dosyayı etkiler. orchestra/ modül sayısı 36'dan 37'ye çıktı.

## ADR-025: Graceful Shutdown Stratejisi — SIGINT → interruptActiveSprint (Sprint 076)

**Status:** accepted

**Context:** Kullanıcı Ctrl+C yaptığında veya process SIGINT aldığında, çalışan sprint aniden sonlanıyordu. Worker'lar temizlenmeden çıkıyor, task dosyaları yarım kalıyor, tmux sessionlar arka planda çalışmaya devam ediyordu. Bu durum .tasks/ dizininde stale heartbeat ve kilit dosyalarına yol açıyordu.

**Decision:** `entry.ts` içindeki SIGINT handler genişletildi:
1. `interruptActiveSprint()` çağrılır — aktif sprintin graceful shutdown koordinasyonunu yapar
2. `killAllSessions()` çağrılır — tüm tmux session'larını temizler
3. İşlem sırayla yapılır: önce sprint state kayıt, sonra session kill

**Consequence:** Ctrl+C sonrası temiz state bırakılır. Sprint INTERRUPTED olarak işaretlenir, review komutu bu durumu gösterir. Worker'lar SIGTERM sinyali alır ve kendi .hb dosyalarını DONE olarak işaretleyebilir. `deckent cleanup` sonrasında orphan dosya kalmaz.

## ADR-026: God Object Split Stratejisi — Faz 1-3 Tamamlandı (Sprint 076)

**Status:** accepted

**Context:** `sprint-controller.ts` zamanla god object haline geldi (1300+ satır). Sprint 036'da brain.ts split'i yapılmıştı ama sprint-controller yeniden şişti. Test ve bakım güçlüğü arttı.

**Decision:** 3 fazlı kademeli split stratejisi:
- **Faz 1 (Sprint 072):** `sprint-phases.ts` — 7 sprint faz fonksiyonu extract edildi (`runPlanPhase`, `runSpawnPhase`, vb.)
- **Faz 2 (Sprint 075):** `sprint-utils.ts` — shared sprint utility fonksiyonları extract edildi
- **Faz 3 (Sprint 076):** `result-collector.ts` — `waitForResults()` ve IPC+fs.watch döngüsü extract edildi

Her fazda backward compatibility sprint-controller re-export layer üzerinden korundu.

**Consequence:** `sprint-controller.ts` orchestration koordinatörü rolüne döndü — iş mantığı bağımsız modüllerde. orchestra/ modül sayısı 37'den 47'ye çıktı. Her yeni modül bağımsız unit test kapsamı kazandı. Kademeli split stratejisi büyük refactor riskini minimize etti.

## ADR-022: CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar (Updated Sprint 085)

**Status:** accepted

**Supersedes:** ADR-022 v1 (Sprint 067)

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

## ADR-027: Hybrid Spawn Backend (Sprint 123, Revisited Sprint 139)

**Status:** accepted

**Decision:** Hibrit backend desteği **kalıcı olarak reddedildi** (Option B: reject). Mevcut tek-backend modeli yeterli ve Sprint 139 backend parity çalışması bu kararı güçlendirdi. `SpawnBackendFactory` docker → tmux → subprocess fallback zinciriyle TEK bir backend seçer; hibrit mod (worker Docker'da, auditor subprocess olarak) implementasyona alınmayacak.

**Context (Sprint 123 — Özgün):** Auditor scan loop `sprint-controller.ts` içinde in-process olarak çalışır — tmux/subprocess/docker backend'lerinden tamamen bağımsızdır. Worker'lar backend üzerinden spawn edilirken auditor dosya sistemi üzerinden `.hb` heartbeat dosyalarını okur. Auditor'ın backend seçimiyle hiçbir doğrudan bağlantısı olmadığından, hibrit mod için ayrı bir mekanizma gerekmez. Worker isolation Docker container'larıyla sağlanmaktadır.

**Sprint 139 Revisit Analizi:**

Sprint 139'da 3 backend'in (Docker, subprocess, tmux) E2E test coverage'ı tamamlandı ve aşağıdaki bulgular elde edildi:

1. **ADR-035 Event Stream (Sprint 138) hibrit gereksinimini ortadan kaldırıyor:** `.deckent/sprint-NNN-events.jsonl` append-only event stream tüm backend'lerin üzerinde ortak iletişim kanalı sağlıyor. Worker hangi backend'de çalışırsa çalışsın, auditor event stream'den okuyarak bağımsız doğrulama yapabiliyor. "Auditor'ın ayrı process olarak çalışması" senaryosu event stream sayesinde zaten çözüldü.

2. **3-backend parity (Sprint 139 Task 17-19):** Docker, subprocess ve tmux backend'lerinin her biri kendi E2E test suite'ine sahip. Her backend `SpawnBackend` arayüzünü tam olarak implement ediyor. Hybrid senaryosu için gereken "farklı backend'lerin birbirini tamamlaması" ihtiyacı yok — her backend zaten tam özellikli.

3. **Hibrit senaryosunun anlamsızlığı:** "Worker Docker'da, auditor subprocess olarak" senaryosu ADR-035 sonrasında gereksiz:
   - Auditor zaten in-process (sprint-controller içinde)
   - Event stream file-based olduğundan tüm backend'ler transparently mesaj üretiyor
   - Docker worker'lar shared `.tasks/` volume üzerinden heartbeat ve event yazıyor

4. **Complexity cost vs benefit:** Hibrit backend implementasyonu `SpawnBackend` interface'ini genişletmeyi, multi-backend lifecycle yönetimi eklemeyi ve `SpawnBackendFactory` sinyal koordinasyonu yazmayı gerektirir — zero user-visible benefit karşılığında ~400 LoC complexity.

5. **Product vision uyumu (ADR-033):** "Kur-çalıştır" prensibi konfigürasyon complexity'sini minimumda tutar. Kullanıcının "hangi backend'i ne için kullanayım?" sorusuna cevap vermek zorunda kalması ürün deneyimini kırar.

**Karar Rationale (Alperen'e Sunulan):**

| Seçenek | Değerlendirme | Karar |
|---------|--------------|-------|
| **Option A:** Sprint 140'ta hybrid implement et | ADR-035 event stream zaten bu ihtiyacı karşılıyor; ek complexity getirir, net fayda yok | **Reddedildi** |
| **Option B:** Kalıcı olarak reddet (tek backend at a time) | Mevcut model çalışıyor, test coverage tam, event stream entegrasyonu sorunsuz | **Kabul edildi** |
| **Option C:** Yeniden ertele | 3. deferred → kararsızlık işareti; net karar verilmeli | **Reddedildi** |

**Consequence(s):**
- Hibrit backend implementasyonu yapılmayacak — kalıcı karar.
- `SpawnBackendFactory` tek-backend-seçer semantiğini korur.
- Event stream (ADR-035) hibrit senaryosunun gerçek ihtiyacını (cross-backend observability) doldurdu.
- Sprint 140'ta backend ile ilgili çalışma olursa: mevcut 3 backend'in stabilizasyonu ve edge case fix'i üzerine yoğunlaşılır, hibrit mod değil.
- Distributed sprint execution ihtiyacı doğarsa (Sprint 145+), bu ADR revisit edilmeli ve event stream üzerine inşa edilen lightweight coordinator pattern değerlendirilmeli.

**References:**
- Sprint 123 özgün deferred kararı
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol — event stream hibrit ihtiyacı ortadan kaldırdı
- Sprint 139 Task 17: Docker E2E tests
- Sprint 139 Task 18: Tmux E2E tests
- Sprint 139 Task 19: Subprocess E2E tests (DONE — 33 test, 1.2s)
- ADR-033: Product Vision — complexity minimization principle

## ADR-028: Decision-Engine V1 → V2 Routing Migration

**Status:** accepted

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

## ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol Standard (Sprint 138)

**Status:** accepted

**Date:** 2026-04-14

**Context:**

Sprint 137 meta-dogfood analizi kritik bir iletişim sorununu ortaya koydu: Task 137-001 worker `status: DONE exitCode: 0` bildirdi, ancak vitest 53 fail test bıraktı. Worker "kod var" → DONE kısayolu. Bu sapmanın temel nedeni, Brain ↔ Worker ↔ Auditor arasındaki mesaj akışının formal bir protokole sahip olmamasıydı — her bileşen kendi dosya formatını üretiyordu (.hb heartbeat, .result, git diff çıktısı) ama bu mesajlar versiyonlanmış, kanonik, parse edilebilir değildi.

Sorunlar:

1. **Doğrulama eksikliği:** Worker `DONE` bildirdiğinde Auditor bağımsız doğrulama yapamıyordu. Auditor sadece `.result` dosyasının varlığını kontrol ediyor, içeriğinin doğruluğunu değil.
2. **Kanal belirsizliği:** `WORKER→BRAIN` yönünde sadece `.result` dosyası vardı; `WORKER→AUDITOR` doğrudan iletişim kanalı yoktu.
3. **Replay edilemezlik:** Sprint sonunda hangi olayların hangi sırada yaşandığını reconstruct etmek imkânsızdı. `.hb` timestamp'leri kaba granülaritede, `.result` tek snapshot.
4. **Mesaj versiyonlaması yok:** Yeni alan eklendiğinde eski consumer'lar uyumsuz hale geliyordu. Örn. Sprint 136 `rubricScores` alanı eski Brain evaluate kodunu bozdu.

Sprint 138 bu sorunu formal mesaj protokolü ile çözer. Dosya tabanlı state (`.hb`, `.result`) geriye dönük uyumluluk için Sprint 142'ye kadar devam eder, ancak event stream kanonik truth olur.

**Decision:**

Brain ↔ Worker ↔ Auditor iletişimi için versiyonlanmış mesaj protokolü (Protocol Version 1.0). Append-only event stream (`.deckent/sprint-NNN-events.jsonl`) tüm mesajları sıralı olarak kaydeder. Dosya tabanlı state paralel devam eder (fail-safe fallback), ancak event stream kanonik gerçek kabul edilir.

### Mesaj Formatı

```json
{
  "timestamp": "2026-04-14T10:00:00.000Z",
  "sequence": 42,
  "protocol_version": "1.0",
  "source": "worker | brain | auditor | deckent",
  "target": "brain | worker | auditor | user | *",
  "channel": "CHANNEL_CODE",
  "payload": {}
}
```

- `sequence`: sprint başından itibaren monoton artan tam sayı, 1'den başlar
- `protocol_version`: sabit "1.0" (Sprint 138), yeni majör değişiklikler 2.0 olacak
- `target: "*"`: broadcast mesaj (tüm consumer'lar dinler)
- `payload`: kanal koduna göre değişir, JSON object, forward-compatible (ekstra alanlar ignore edilir)

### Kanal Kodları (15 adet, Protocol Version 1.0)

**Brain ↔ Worker Kanalları:**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `BRAIN→WORKER:TASK_ASSIGN` | brain | worker | Task atama, scope + model + skills payload'ı |
| `WORKER→BRAIN:HEARTBEAT` | worker | brain | Periyodik canlılık sinyali (30s interval) |
| `WORKER→BRAIN:RESULT` | worker | brain | Task sonucu (selfAssessment, filesChanged, rubricScores) |
| `WORKER→BRAIN:QUESTION` | worker | brain | Checkpoint/blocker sorusu |
| `BRAIN→WORKER:ANSWER` | brain | worker | Checkpoint cevabı veya blocker çözümü |

**Worker ↔ Auditor Kanalları:**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | worker | auditor | Worker result'ını bağımsız doğrulama talebi |
| `AUDITOR→BRAIN:VERIFICATION_RESULT` | auditor | brain | Doğrulama sonucu: PASS \| DOWNGRADE \| FAIL |
| `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` | auditor | brain | İki worker aynı dosyaya yazıyor, plan-time bypass |
| `AUDITOR→BRAIN:ADR_VIOLATION` | auditor | brain | Pilot ADR kural ihlali (ADR-006, ADR-008, ADR-010) |
| `AUDITOR→BRAIN:GATE_COMPUTED` | auditor | brain | Sprint gate hesaplandı (PASS \| WARNING \| FAIL) |
| `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN` | auditor | brain | load-test-report.md yazıldı |

**Broadcast / Sprint Kanalları:**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `BRAIN→*:METRIC_EMITTED` | brain | * | Sprint metric noktası (coverage, duration, worker count) |
| `BRAIN→WORKER:FIX_REQUEST` | brain | worker | NO_GO sonrası fix yeniden deneği |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | brain | * | Faz geçişi (PLAN→SPAWN→EXECUTE→...) |

**User Notification (Sprint 139 Seed):**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `DECKENT→USER:NOTIFY` | deckent | user | Kullanıcıya bildirim (Sprint 139 dispatcher, Sprint 138'de sadece tanımlı) |

### Backward Compatibility Roadmap

| Sprint | Durum |
|--------|-------|
| Sprint 138 | `.hb` + `.result` dosyaları **paralel devam eder**, event stream ek katman |
| Sprint 139-140 | Event stream primary, file-based secondary |
| Sprint 140+ | File-based **soft-deprecated** (consumer'lar event stream'e migrate edilir) |
| Sprint 142 | File-based **removed** (sadece event stream) |

### Fail-Safe Davranış

Event stream write başarısız olursa (disk tam, permission hata) → `console.warn` + file-based fallback. Sprint asla event stream I/O hatası nedeniyle durmamalı.

**Consequences (+):**

- Sprint sonunda tüm olaylar replay edilebilir → post-mortem analiz mümkün
- Auditor `WORKER→AUDITOR:CODE_VERIFY_REQUEST` ile aktif doğrulayıcı rolüne geçer (Sprint 137 kısayol kapatılır)
- `SCOPE_COLLISION_DETECTED` plan-time saptanabilir → manual wave barrier ihtiyacı azalır
- Protocol versiyonlaması → breaking change'ler kontrollü, consumer'lar protocol_version'ı okur
- `DECKENT→USER:NOTIFY` kanalı Sprint 139 dispatcher'a temiz extension point sağlar

**Consequences (-):**

- Her olay için disk I/O artışı — `.jsonl` append performance testi gerekebilir
- `sequence` monotonicity multi-worker concurrent write'ta race condition riski — atomik increment gerekir (file lock veya process-level counter)
- Event stream büyüyebilir — Sprint 143'te rotation/cleanup mekanizması düşünülmeli
- Sprint 142 file-based remove, legacy consumer'lar için migration burden

**Alternatives Considered:**

- **gRPC/Protobuf:** Tip güvenli, binary verimli. Reddedildi — schema compiler toolchain bağımlılığı, Node.js subprocess'lerde kurulum karmaşıklığı, Deckent "kur-çalıştır" ilkesiyle çelişiyor (ADR-010).
- **WebSocket:** Gerçek zamanlı, bidirektional. Reddedildi — Docker backend'de port mapping karmaşıklığı, Worker container'ların WebSocket server'a erişimi garanti değil, HTTP API zaten var.
- **Redis Pub/Sub:** Yüksek throughput, kanıtlı. Reddedildi — ADR-010 tek runtime dependency ilkesi ihlali, ADR-033 "kur-çalıştır" product vizyonuyla çelişiyor, Redis kurulu olmayan makinelerde sıfır fallback.
- **SQLite:** ACID garantili, structured query. Reddedildi — dosya tabanlı append'den daha karmaşık, basit olmak Deckent kimliğinin temelidir, WAL mode multi-writer complexity ekler.
- **Mevcut dosya tabanlı devam:** Değişiklik yok, `.hb` + `.result` yeterli. Reddedildi — Sprint 137 meta-dogfood canlı kanıtı: file-based state functional doğrulama yapmıyor, replay imkânsız.

**References:**

- Sprint 137 Task 137-001 retrospektif — worker DONE kısayolu canlı kanıtı
- Sprint 138 design spec: `docs/superpowers/specs/2026-04-14-sprint-138-architectural-pivot-design.md` Section 6
- Sprint 138 plan: `docs/superpowers/plans/2026-04-14-sprint-138-architectural-pivot-plan.md`
- ADR-008: Brain Merkezi Import — mesaj akışı sınır disiplini
- ADR-010: Minimal Dependencies — Redis/SQLite reddetme gerekçesi
- ADR-033: Product Vision — WebSocket/Redis reddetme gerekçesi (kur-çalıştır)
- `src/orchestra/event-stream.ts` — Sprint 138 Task 4 implementasyonu
- `src/monitor/auditor.ts` — Sprint 138 Task 3 Auditor Authority Extension
- `.deckent/sprint-138-events.jsonl` — canlı runtime event log

---

## ADR-036: ADR Governance Integration — Mandatory Architecture Decision Enforcement

**Status:** accepted

**Date:** 2026-04-14

**Context:**

Deckent 135+ sprint boyunca `.brain/DECISIONS.md` dosyasında mimari kararları (ADR) kayıt altına aldı. Ancak bu ADR'ler yalnızca bilgilendirme amaçlıydı — brain veya worker'lar tarafından aktif olarak okunmuyor, uyumluluk kontrol edilmiyordu. Açık kaynak repoya geçişle birlikte kullanıcılar kendi `.brain/DECISIONS.md` dosyalarını yazıp Deckent'tan enforce ettirmeyi bekleyecek.

Sorunlar:
1. ADR format standardize değildi — bazı ADR'lerde Status alanı vardı, bazılarında yoktu
2. Worker prompt'larında ADR bilgisi yoktu — worker'lar mimari kısıtlamalardan habersiz çalışıyordu
3. ADR yaşam döngüsü (accepted → deprecated → superseded) takip edilemiyordu
4. ADR governance CI pipeline'a entegre değildi — format hataları build'de yakalanmıyordu

**Decision:**

ADR governance'ı kullanıcı-facing ürün özelliğine dönüştürmek. 5 bileşen:

1. **MADR v3 Hibrit Format:** Tüm ADR'lere zorunlu `**Status:**` alanı eklendi. Geçerli değerler: accepted, deprecated, superseded, proposed, rejected. Parantezli açıklama desteklenir (örn. `accepted (Sprint 131)`).

2. **Mandatory Read Wiring:** DECKENT.md'ye `@.brain/DECISIONS.md` referansı eklendi. brain.md ve worker-default.md kurallarına ADR compliance zorunluluğu eklendi.

3. **Worker Prompt ADR Injection:** `buildWorkerPrompt()` fonksiyonu `.brain/DECISIONS.md` içeriğini worker prompt'una enjekte eder. Worker'lar mimari kısıtlamaları bilir, ihlal durumunda NO_GO + ADR amendment proposal yazar.

4. **Validator Script:** `scripts/adr-validator.mjs` — format doğrulama, status enum kontrolü, duplicate ID tespiti. `npm run lint:adr` ile CI'da çalıştırılır.

5. **ADR/SDL Naming Split:** `.brain/DECISIONS.md` = ADR (kalıcı mimari kararlar), `.deckent/decisions/*.json` = SDL (sprint taktik kararları).

**Consequences (+):**
- Worker'lar her sprint'te mimari kısıtlamaları bilir — bilinçsiz ihlaller azalır
- `npm run lint:adr` CI pipeline'da format tutarlılığını garanti eder
- Kullanıcılar kendi projelerinde ADR governance'ı kurabilir
- MADR v3 standardıyla uyumlu format — topluluk alışkanlıklarıyla uyum

**Consequences (-):**
- Worker prompt boyutu ADR injection ile büyür (~3000 char ek)
- Validator basit regex-based — karmaşık markdown edge case'leri gözden kaçabilir
- ADR enforcement runtime'da değil, compile-time'da — aktif kod analizi yok

**References:**
- Sprint 138 Task 138-001 implementasyonu
- `scripts/adr-validator.mjs` — validator script
- `src/orchestra/task-builder.ts:loadADRContent()` — prompt injection
- ADR-013: DECKENT.md Adapter Pattern — mandatory read wiring pattern
- MADR v3: https://adr.github.io/madr/

---

## ADR-037: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0

**Status:** accepted

**Date:** 2026-04-15

**Context:**

Deckent'in üç temel bileşeni — Brain (orkestratör), Auditor (doğrulayıcı), Worker (uygulayıcı) — Sprint 138'e kadar örtük güven (implicit trust) modeliyle çalışıyordu. Yetki sınırları `.claude/rules/*.md` dosyalarında doğal dil kuralları olarak tanımlı, ancak bu kurallar:

1. **Enforceable değildi:** Worker'ın scope dışına yazması yalnızca post-hoc `git diff` ile tespit ediliyordu. Brain'in `src/**`'e doğrudan müdahalesi engelleyen mekanizma yoktu. Auditor'ın kaynak kod yazmasını engelleyen tek şey doğal dil talimatıydı.

2. **Formal olarak tanımlı değildi:** ADR-008 Brain merkezi import kuralını, ADR-034 per-project izolasyonu, ADR-035 mesaj protokolünü tanımlıyordu — ama bu üç ADR'nin kesişiminde oluşan "kim neyi yapabilir?" sorusu hiçbir yerde tek tablo olarak cevaplanmıyordu.

3. **Enterprise ölçeğe hazır değildi:** Milyon kullanıcı hedefiyle (Q3 2026 vizyonu), bir bileşenin yetkisini aştığında ne olacağının deterministik, denetlenebilir, versiyonlanmış bir protokolü yoktu. NIST SP 800-162 (ABAC) ve RBAC standartları referans alınmalıydı.

4. **Sprint 137-138 canlı kanıtları:**
   - Sprint 137 Task 137-001: Worker `DONE` bildirdi, vitest 53 fail — worker kendi doğrulama yetkisini aşıyordu (self-assessment = judge of own work).
   - Sprint 138 Task 138-003: Auditor Authority Extension 3-Pipeline ile auditor aktif doğrulayıcı oldu, ama bu yetki genişlemesi formal RBAC kaydı olmadan yapıldı.
   - Sprint 138 Task 138-004: Event stream kanal kodları (ADR-035) "source" ve "target" alanlarıyla örtük role bilgisi taşıyor, ama hangi kanalı kimin kullanabileceği tanımlı değil.

5. **Tehdit modeli (ADR-034'ü genişletir):**
   - **Privilege escalation:** Worker'ın `.brain/DECISIONS.md`'yi değiştirerek kendi scope kurallarını gevşetmesi
   - **Lateral movement:** Worker A'nın Worker B'nin task dosyalarını okuması/yazması
   - **Audit bypass:** Brain'in auditor verification'ı atlayarak doğrudan GO kararı vermesi
   - **Role confusion:** Auditor'ın kaynak kodu yazması (audit bağımsızlığını bozar)

**Decision:**

Brain, Auditor ve Worker bileşenleri için formal Role-Based Access Control (RBAC) authority matrix tanımlanır. Bu matrix, Protocol Version 1.0 (ADR-035) üzerine inşa edilir ve her bileşenin dosya sistemi erişim hakları, event stream kanal kullanım hakları ve sprint yaşam döngüsü eylem yetkilerini belirler.

### Temel Prensipler

1. **Least Privilege (En Az Yetki):** Her bileşen yalnızca görevini yerine getirmek için gereken minimum yetkilere sahiptir. Ek yetki açıkça tanımlanmalı ve bu ADR'de kayıt altına alınmalıdır.

2. **Separation of Duties (Görev Ayrılığı):** Aynı bileşen hem uygulayıcı hem denetleyici olamaz. Worker kod yazar, Auditor doğrular, Brain karar verir. Bu üçlü hiçbir bileşende birleşmez.

3. **Auditability (Denetlenebilirlik):** Her yetki kullanımı event stream'e (ADR-035) kaydedilir. Yetkisiz erişim girişimleri `SCOPE_VIOLATION` olayı olarak loglanır.

4. **Fail-Closed (Kapalı Hata):** Yetki doğrulaması başarısız olursa varsayılan karar "erişim yok" olur. Açıkça izin verilmeyen her eylem yasaklanmış kabul edilir.

### Brain Authority Matrix

Brain, sprint orkestratörüdür. Planlama, karar verme ve koordinasyon yetkilerine sahiptir.

**Dosya Sistemi — YAZMA İZNİ:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.tasks/*` | ✅ WRITE | Task JSON oluşturma, durum güncelleme, sprint yönetimi |
| `.deckent/config.json` | ✅ WRITE | Konfigürasyon güncelleme (config set komutu) |
| `.deckent/sprint-state.json` | ✅ WRITE | Sprint faz geçişi, aktif sprint kaydı |
| `.deckent/sprint-*-events.jsonl` | ✅ APPEND | Event stream yazma (yalnızca append, overwrite yasak) |
| `.deckent/sprint-*-checkpoint.json` | ✅ WRITE | Checkpoint yazma (resume capability) |
| `.deckent/sprint-*-metrics.jsonl` | ✅ APPEND | Metrik noktaları kaydetme |
| `.deckent/cache/*` | ✅ WRITE | Managed-docs cache, build cache |
| `.brain/MEMORY.md` | ✅ WRITE | Sprint öğrenimleri kaydetme (max 300 satır) |
| `.brain/RETRO.md` | ✅ WRITE | Retrospektif yazma (overwrite, max 120 satır) |
| `.brain/DEBT.md` | ✅ WRITE | Teknik borç tablosu yönetimi |
| `.brain/PATTERNS.md` | ✅ WRITE | Desen kayıtları güncelleme |
| `.brain/sprints/sprint-*.md` | ✅ WRITE | Sprint log dosyaları (max 80 satır) |
| `.brain/archive/*` | ✅ WRITE | Sprint arşivleme (DIRECTIVES, tasks) |

**Dosya Sistemi — YAZMA YASAĞI:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `src/**` | ❌ DENY | Brain kaynak kodu yazmaz — ADR-038 istisnası hariç (gelecek ADR) |
| `tests/**` | ❌ DENY | Brain test yazmaz — worker görevi |
| `.brain/DECISIONS.md` | ❌ DENY | ADR'ler yalnızca insan (Alperen) veya ADR governance süreci ile değişir |
| `docs/vision/roadmap.md` | ❌ DENY | Vizyon dokümanı yalnızca insan tarafından güncellenir |
| `.dashboard` | ❌ DENY | Auditor'ın münhasır yazma alanı |
| `.locks/*` | ❌ DENY | Lock yönetimi auditor + worker sorumluluğu |

**Sprint Yaşam Döngüsü Eylemleri:**

| Eylem | İzin | Koşul |
|-------|------|-------|
| Task oluşturma (PLAN fazı) | ✅ | DIRECTIVES.md okunmuş olmalı |
| Worker spawn | ✅ | SPAWN fazı aktif olmalı |
| Worker kill | ✅ | Timeout veya NO_GO sonrası |
| GO / NO_GO / GO_WITH_TECH_DEBT label | ✅ | EVALUATE fazı aktif olmalı |
| Cross-dependency fix spawn | ✅ | FIX fazı aktif, bağımlılık analizi tamamlanmış |
| Auditor doğrulamasını atlama | ❌ | Brain, auditor verification sonuçlarını beklemek ZORUNDADIR |
| Kendi kararını doğrulama | ❌ | Self-audit gate (Sprint 134 T-014) auditor tarafından kontrol edilir |

**Event Stream Kanal Hakları (ADR-035 V1.0):**

| Kanal | Hak | Rol |
|-------|-----|-----|
| `BRAIN→WORKER:TASK_ASSIGN` | ✅ EMIT | Kaynak |
| `BRAIN→WORKER:ANSWER` | ✅ EMIT | Kaynak |
| `BRAIN→WORKER:FIX_REQUEST` | ✅ EMIT | Kaynak |
| `BRAIN→*:METRIC_EMITTED` | ✅ EMIT | Kaynak |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | ✅ EMIT | Kaynak |
| `WORKER→BRAIN:*` | ✅ CONSUME | Hedef |
| `AUDITOR→BRAIN:*` | ✅ CONSUME | Hedef |
| `WORKER→AUDITOR:*` | ❌ | Ne kaynak ne hedef |
| `DECKENT→USER:NOTIFY` | ❌ | Deckent CLI katmanı sorumlu |

### Auditor Authority Matrix

Auditor, bağımsız doğrulayıcıdır. Gözlemleme, doğrulama ve raporlama yetkilerine sahiptir. Kaynak kodu ASLA yazmaz.

**Dosya Sistemi — YAZMA İZNİ:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.dashboard` | ✅ WRITE | Sprint durumu dashboard'u (30s scan cycle'da overwrite) |
| `.deckent/sprint-*-gate.json` | ✅ WRITE | Sprint gate hesaplama sonucu |
| `.deckent/sprint-*-events.jsonl` | ✅ APPEND | Event stream'e doğrulama sonuçları yazma |
| `docs/audits/*` | ✅ WRITE | Audit raporları, load-test raporları |
| `.brain/PATTERNS.md` | ✅ APPEND | Yeni pattern ekleme (mevcut içerik korunur, yalnızca append) |

**Dosya Sistemi — OKUMA İZNİ:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.tasks/*.hb` | ✅ READ | Worker heartbeat kontrolü (stale detection) |
| `.tasks/*.result` | ✅ READ | Worker sonuç doğrulaması |
| `.tasks/*.json` | ✅ READ | Task tanımı okuma (scope doğrulama) |
| `.locks/*` | ✅ READ + WRITE | Stale lock tespiti ve temizleme (>5 min) |
| `src/**` | ✅ READ | Kod analizi, ADR compliance kontrolü (sadece okuma!) |
| `tests/**` | ✅ READ | Test sonuç doğrulaması |
| `.brain/DECISIONS.md` | ✅ READ | ADR compliance kontrolü |
| `git diff --stat` | ✅ EXEC | Boundary violation tespiti |

**Dosya Sistemi — YAZMA YASAĞI:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `src/**` | ❌ DENY | Auditor kaynak kodu ASLA yazmaz — audit bağımsızlığı |
| `tests/**` | ❌ DENY | Auditor test yazmaz — bağımsızlık ilkesi |
| `.tasks/*.json` | ❌ DENY | Task tanımı değiştirme yetkisi yok — Brain münhasır |
| `.brain/MEMORY.md` | ❌ DENY | Bellek yönetimi Brain sorumluluğu |
| `.brain/RETRO.md` | ❌ DENY | Retrospektif yazma Brain sorumluluğu |
| `.brain/DECISIONS.md` | ❌ DENY | ADR değişikliği governance süreci gerektirir |
| `.deckent/sprint-state.json` | ❌ DENY | Sprint faz geçişi Brain sorumluluğu |

**Sprint Yaşam Döngüsü Eylemleri:**

| Eylem | İzin | Koşul |
|-------|------|-------|
| Verification 3-pipeline (`verifyWorkerResult`) | ✅ | Worker `.result` dosyası mevcut |
| Functional verification (`verifyFunctional`) | ✅ | EXECUTE veya EVALUATE fazı |
| Tech debt validation (`validateTechDebt`) | ✅ | Worker GO_WITH_TECH_DEBT bildirdi |
| ADR compliance check (`checkADRCompliance`) | ✅ | Pilot ADR'ler (ADR-006, ADR-008, ADR-010) |
| Sprint gate hesaplama (`GATE_COMPUTED`) | ✅ | EVALUATE fazı tamamlandı |
| PASS / DOWNGRADE / FAIL verdict | ✅ | 3-pipeline sonucu |
| GO / NO_GO label kararı | ❌ | Brain münhasır — auditor yalnızca verdict önerir |
| Worker spawn / kill | ❌ | Brain münhasır |
| Task oluşturma / değiştirme | ❌ | Brain münhasır |

**Event Stream Kanal Hakları (ADR-035 V1.0):**

| Kanal | Hak | Rol |
|-------|-----|-----|
| `AUDITOR→BRAIN:VERIFICATION_RESULT` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:ADR_VIOLATION` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:GATE_COMPUTED` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN` | ✅ EMIT | Kaynak |
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | ✅ CONSUME | Hedef |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | ✅ CONSUME | Broadcast dinleyici |
| `BRAIN→*:METRIC_EMITTED` | ✅ CONSUME | Broadcast dinleyici |
| `BRAIN→WORKER:*` | ❌ | Ne kaynak ne hedef |
| `WORKER→BRAIN:*` | ❌ | Ne kaynak ne hedef (Brain'e ait) |

### Worker Authority Matrix

Worker, görev uygulayıcısıdır. Atanan task scope'u içinde kaynak kodu yazar, test çalıştırır ve sonuç raporlar.

**Dosya Sistemi — YAZMA İZNİ:**

| Yol Pattern | İzin | Koşul |
|-------------|------|-------|
| `scope.filesWrite` (task JSON'dan) | ✅ WRITE | Yalnızca atanan task'ın scope.filesWrite listesindeki dosyalar |
| `scope.directories` (task JSON'dan) | ✅ WRITE | Yalnızca atanan task'ın scope.directories içindeki yeni dosyalar |
| `.tasks/task-{ownId}.hb` | ✅ WRITE | Kendi heartbeat dosyası |
| `.tasks/task-{ownId}.result` | ✅ WRITE | Kendi sonuç dosyası |
| `.tasks/task-{ownId}.plan` | ✅ WRITE | Kendi yürütme planı |
| `.tasks/task-{ownId}.verify-delta.json` | ✅ WRITE | Honest assessment kanıt dosyası |
| `.locks/{ownScope}` | ✅ WRITE | Kendi scope'undaki dosyalar için lock alma/bırakma |

**Dosya Sistemi — OKUMA İZNİ:**

| Yol Pattern | İzin | Koşul |
|-------------|------|-------|
| `.tasks/task-{ownId}.json` | ✅ READ | Kendi task tanımı |
| `scope.filesRead` (task JSON'dan) | ✅ READ | Task scope'undaki okuma listesi |
| `.brain/DECISIONS.md` | ✅ READ | ADR compliance kontrolü (zorunlu okuma — ADR-036) |
| `.locks/*` | ✅ READ | File lock kontrolü (yazma öncesi) |
| `DIRECTIVES.md` | ✅ READ | Sprint hedefleri bağlamı |

**Dosya Sistemi — YAZMA YASAĞI:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.tasks/task-{otherId}.*` | ❌ DENY | Başka worker'ın dosyalarına erişim yasak — lateral movement engeli |
| `.brain/DECISIONS.md` | ❌ DENY | ADR değişikliği governance süreci gerektirir — privilege escalation engeli |
| `.brain/MEMORY.md` | ❌ DENY | Brain münhasır |
| `.brain/RETRO.md` | ❌ DENY | Brain münhasır |
| `.deckent/sprint-state.json` | ❌ DENY | Sprint durumu Brain münhasır |
| `.dashboard` | ❌ DENY | Auditor münhasır |
| `docs/audits/*` | ❌ DENY | Auditor münhasır |
| Scope dışı `src/**` | ❌ DENY | Scope violation — auditor `git diff --stat` ile tespit eder |

**Sprint Yaşam Döngüsü Eylemleri:**

| Eylem | İzin | Koşul |
|-------|------|-------|
| Task claim (PENDING → CLAIMED) | ✅ | Task kendisine atanmış olmalı |
| Kod yazma | ✅ | Scope dahilinde |
| Test çalıştırma (`tsc --noEmit`, `vitest run`) | ✅ | Verify loop (max 3 attempt) |
| Self-assessment yazma | ✅ | Honest assessment kuralları geçerli (ADR-035 V1.0 honest block) |
| Checkpoint question (`WORKER→BRAIN:QUESTION`) | ✅ | Blocker durumunda |
| Başka worker'ı spawn/kill | ❌ | Brain münhasır |
| Sprint faz değiştirme | ❌ | Brain münhasır |
| GO / NO_GO kararı | ❌ | Brain münhasır — worker yalnızca self-assessment yazar |
| Verification çalıştırma | ❌ | Auditor münhasır — worker kendi çalışmasını judge edemez |

**Event Stream Kanal Hakları (ADR-035 V1.0):**

| Kanal | Hak | Rol |
|-------|-----|-----|
| `WORKER→BRAIN:HEARTBEAT` | ✅ EMIT | Kaynak |
| `WORKER→BRAIN:RESULT` | ✅ EMIT | Kaynak |
| `WORKER→BRAIN:QUESTION` | ✅ EMIT | Kaynak |
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | ✅ EMIT | Kaynak |
| `BRAIN→WORKER:TASK_ASSIGN` | ✅ CONSUME | Hedef |
| `BRAIN→WORKER:ANSWER` | ✅ CONSUME | Hedef |
| `BRAIN→WORKER:FIX_REQUEST` | ✅ CONSUME | Hedef |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | ✅ CONSUME | Broadcast dinleyici |
| `AUDITOR→BRAIN:*` | ❌ | Ne kaynak ne hedef (Brain'e ait) |
| `BRAIN→*:METRIC_EMITTED` | ❌ | Worker metrik tüketmez |

### Cross-Role Interaction Rules (Çapraz Rol Kuralları)

**Kural 1: Separation of Assessment and Verification**
Worker self-assessment yazar (DONE / GO_WITH_TECH_DEBT / NO_GO). Auditor bağımsız olarak doğrular (PASS / DOWNGRADE / FAIL). Brain her iki sonucu değerlendirerek nihai GO / NO_GO kararı verir. Hiçbir bileşen hem uygulayıcı hem doğrulayıcı olamaz.

**Kural 2: No Direct Worker-to-Worker Communication**
Worker'lar birbirleriyle doğrudan iletişim kuramaz. Tüm koordinasyon Brain üzerinden yapılır. Worker A'nın Worker B'nin çıktısına ihtiyacı varsa, Brain dependency resolution yapar (FIX fazı, cross-dep priority).

**Kural 3: Auditor Independence**
Auditor hiçbir koşulda kaynak kodu (src/**, tests/**) yazmaz. Bu kural ADR-037'nin "dokunulamaz" maddesidir. Auditor bağımsızlığı kırılırsa self-audit mekanizması anlamsızlaşır.

**Kural 4: Brain Orchestration Boundary**
Brain planlama, koordinasyon ve karar verme yapar. Doğrudan kaynak kod üretimi yapmaz (src/** yazma yasağı). Brain'in kodu etkilemesi gereken durumlarda worker spawn eder. İstisna: gelecek ADR-038 meta-refactoring capability (şu an tanımlı değil, bu ADR'de referans olarak belirtilmiştir).

**Kural 5: Event Stream Integrity**
Her bileşen yalnızca kendi kanal haklarında belirtilen kanalları kullanabilir. Event stream append-only'dir — mevcut event'ler değiştirilemez veya silinemez. Event stream bozulması durumunda file-based fallback devreye girer (ADR-035 backward compatibility).

### Enforcement Mekanizması

**Katman 1 — Compile-Time (Static)**
- `npm run lint:adr` ADR-037 authority matrix'ini parse eder ve scope kurallarını doğrular
- Worker prompt injection (ADR-036) authority matrix'i worker'a bildirir
- `isWithinScope()` fonksiyonu (ADR-034) symlink-aware dosya erişim kontrolü yapar

**Katman 2 — Runtime (Dynamic)**
- Auditor 30s scan cycle: `git diff --stat` ile scope violation tespiti
- Event stream `source` alanı doğrulaması: yanlış source ile yazılan event → `SCOPE_VIOLATION` alert
- File lock çakışma tespiti: aynı dosyaya iki worker yazarsa → `SCOPE_COLLISION_DETECTED` event

**Katman 3 — Post-Hoc (Audit Trail)**
- Event stream replay: sprint sonunda tüm yetki kullanımları reconstruct edilebilir
- `.deckent/sprint-*-gate.json`: sprint gate hesaplamasında authority violation sayısı raporlanır
- `docs/audits/sprint-*/`: her sprint'in audit raporu authority matrix compliance içerir

### Versioning & Evolution

Bu RBAC matrix Protocol Version 1.0 ile birlikte tanımlanmıştır. Değişiklikler:

| Değişiklik Türü | Gereksinim |
|-----------------|------------|
| Yeni yetki ekleme (izin genişletme) | Bu ADR'ye amendment + `npm run lint:adr` geçmeli |
| Yetki kaldırma (izin daraltma) | Bu ADR'ye amendment + etkilenen bileşen testleri güncellenmeli |
| Yeni rol ekleme | Yeni ADR (ADR-037 bu ADR'yi supersede eder) |
| Kanal hakkı değişikliği | ADR-035 ve bu ADR birlikte güncellenmeli |

**Consequences (+):**

- Her bileşenin yetki sınırları tek tablo olarak okunabilir — onboarding kolaylığı
- Privilege escalation vektörleri (worker → `.brain/DECISIONS.md` yazma) formal olarak kapatılır
- Audit trail event stream üzerinden reconstruct edilebilir — post-mortem analiz mümkün
- Enterprise-ready RBAC pattern: NIST SP 800-162 prensiplerine uyumlu (least privilege, separation of duties, fail-closed)
- Yeni bileşen eklendiğinde (örn. Notifier, Scheduler) authority matrix genişletme pattern'ı belirli
- Sprint 137/138 canlı kanıtlarından türetilen kurallar — teorik değil, gerçek ihlallerden öğrenilmiş

**Consequences (-):**

- Authority matrix bakımı gerektirir — her yeni dosya pattern'ı veya kanal eklenmesinde güncellenmeli
- Runtime enforcement henüz tam değil (Sprint 139 scope) — şu an compile-time + audit trail ağırlıklı
- Matrix karmaşıklığı yeni katkıda bulunanlar için başlangıçta zorlayıcı olabilir
- File-system level enforcement (OS capability) implementasyonu yok — güven modeli hâlâ process-level

**Alternatives Considered:**

- **Implicit trust (örtük güven):** Sprint 138'e kadarki model. Reddedildi: Sprint 137 canlı kanıtı gösterdi ki worker self-assessment güvenilmez, formal boundary'ler gerekli.
- **OS-level capability model (Linux capabilities, seccomp):** Her bileşen ayrı process, OS-level file permission. Reddedildi: cross-platform uyumsuzluk (macOS seccomp yok), Docker backend'de container-in-container karmaşıklığı, ADR-033 "kur-çalıştır" ilkesiyle çelişir.
- **CI lint-only enforcement:** Authority matrix'i yalnızca CI pipeline'da kontrol et, runtime'da enforce etme. Reddedildi: runtime violation'lar CI'da yakalanamaz, post-hoc tespit yetersiz (Sprint 137 kanıtı).
- **Centralized policy engine (OPA/Rego):** Policy-as-code engine. Reddedildi: ADR-010 tek runtime dependency ilkesi ihlali, kur-çalıştır friction'ı artırır, Deckent'in mevcut ölçeği için overkill.
- **Per-sprint dynamic RBAC:** Her sprint'te farklı yetki matrisi. Reddedildi: öngörülemezlik yaratır, debug zorlaştırır, authority matrix'in sabit olması güvenlik garantisi verir.

**References:**

- NIST SP 800-162: Guide to Attribute Based Access Control (ABAC) Definition and Considerations — least privilege, separation of duties prensipleri
- ADR-008: Brain Merkezi Import — tek yönlü bağımlılık (import boundary = authority boundary temeli)
- ADR-034: Multi-Project Isolation — per-project security boundaries (symlink-aware scope enforcement)
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol Standard V1.0 — event stream kanal kodları
- ADR-036: ADR Governance Integration — mandatory read wiring, validator enforcement
- Sprint 137 Task 137-001 retrospektif — worker self-assessment güvenilmezlik kanıtı
- Sprint 138 Task 138-003 — Auditor Authority Extension 3-Pipeline implementasyonu
- Sprint 134 T-014 — Brain Self-Audit Gate
- `.claude/rules/brain.md`, `.claude/rules/auditor.md`, `.claude/rules/worker-default.md` — mevcut doğal dil yetki kuralları (bu ADR ile formalize edildi)
- `src/agents/worker.ts:isWithinScope()` — runtime scope check implementasyonu
- `src/monitor/auditor.ts:verifyWorkerResult()` — 3-pipeline verification implementasyonu

---

## ADR-038: Dead Code Disposition — Sprint 139 Audit Results

**Status:** accepted

**Date:** 2026-04-15

**Context:**

Sprint 139 Dead Code Audit (Task 139-037 `scripts/dead-code-audit.mjs`) 11 modülü analiz etti ve 4 kategoride sınıflandırdı: Dead (6 modül, ~1042 LoC), Dormant/ADR-protected (4 modül, ~495 LoC), Active (1 modül — false positive). Audit, Sprint 132'deki güvenlik denetiminden gelen şüphelileri ve ADR-028 koruması altındaki V1 decision engine ekosistemini kapsadı.

Sorun: 1042 satır dead code bakım maliyeti yaratıyor (tsc derleme süresi, IDE noise, yeni katkıda bulunanlar için kafa karışıklığı). Ancak bazı dead modüller gelecek roadmap öğeleriyle (distributed execution Sprint 145+, ML-driven routing) doğrudan ilişkili — acele silme değerli mimari bilgiyi kaybettirir.

**Decision:**

Sprint 139 dead code audit sonuçları için 4 kademeli disposition kararı:

### Kademe 1: Remove (Sprint 140 Adım 4)

Aşağıdaki modüller **tamamen silinecek** (kaynak + test dosyaları):

| Modül | LoC | Gerekçe |
|-------|-----|---------|
| `src/orchestra/learning-decay.ts` | 151 | Deprecated learning sistemiyle bağlı, V2 routing farklı decay mekanizması kullanıyor. Pattern basit — gerekirse 30 dakikada yeniden yazılır. |
| `src/orchestra/learning-migration.ts` | 229 | Hardcoded keyword-to-taskType mapping, eski veri formatı migrasyonu. Yeni learning sistemi kurulursa sıfırdan tasarlanmalı. |
| `src/orchestra/batch-stats.ts` | 141 | Queue + delayed batch write pattern'ı jenerik. Gerekirse `node:stream` veya basit buffer ile yeniden implement edilir. Mevcut implementation 0 consumer. |

**Toplam:** 3 modül, ~521 LoC silme, 3 test dosyası silme.

**Rollback planı:** `git revert` ile tek commit geri alınır. Silme öncesi son commit hash'i `docs/audits/sprint-139/dead-code-decisions.md`'de kayıt altına alınır.

### Kademe 2: Defer (Sprint 145+ Değerlendirme)

Aşağıdaki modüller **silinmeyecek** — gelecek roadmap öğeleriyle doğrudan ilişkili:

| Modül | LoC | Gelecek Bağlantı | Yeniden Değerlendirme |
|-------|-----|-------------------|----------------------|
| `src/orchestra/combination-scorer.ts` | 101 | ML-driven routing scoring, outcome-tracker entegrasyonu | Sprint 145 (routing evolution) |
| `src/orchestra/handoff-protocol.ts` | 152 | Distributed execution, multi-task artifact exchange | Sprint 145 (distributed sprint) |
| `src/orchestra/brain-context.ts` | 268 | Context-aware planner enrichment, planner.ts entegrasyonu | Sprint 142 (planner evolution) |

**Toplam:** 3 modül, ~521 LoC korunacak. Test dosyaları da korunur.

Bu modüller `@deprecated` JSDoc tag'i ile işaretlenecek ve dosya başına `// DEFERRED: ADR-038, reassess Sprint 145` yorumu eklenecek. Sprint 145'te yeniden değerlendirilecek — ya revive edilecek (dogfood + test), ya da silinecek.

**Rollback planı:** `@deprecated` tag kaldırılır, modül aktif routing'e bağlanır.

### Kademe 3: Deprecate + Warning (ADR-028 Amendment — Sprint 142+)

ADR-028 koruması altındaki 4 dormant modül statüsü değişmiyor:

| Modül | LoC | ADR-028 Statüsü |
|-------|-----|------------------|
| `src/orchestra/decision-engine.ts` | 170 | Korunuyor — V1 referans |
| `src/orchestra/decision-replay.ts` | 150 | Korunuyor — audit tool |
| `src/orchestra/decision-steps/agent-step.ts` | 83 | Korunuyor — V1 step |
| `src/orchestra/decision-steps/scope-step.ts` | 92 | Korunuyor — V1 step |

**Toplam:** 4 modül, ~495 LoC — ADR-028 amendment gerektirir, Sprint 142+ değerlendirilecek.

Bu ADR, ADR-028'in removal'ını TALEP ETMİYOR — yalnızca Sprint 142'de reassessment öneriyor. V2 routing engine 10+ sprint boyunca stabil çalıştığında, V1 referans değerinin devam edip etmediği yeniden değerlendirilmeli.

### Kademe 4: False Positive Düzeltme

`src/orchestra/parallel-pipeline.ts` dead code olarak **yanlış raporlanmıştır**. Modül 4 src/ dosyası tarafından aktif olarak import edilmektedir (`sprint-spawner.ts`, `sprint-controller.ts`, `conflict-resolver.ts`). Rapordaki "0 import" yalnızca `PipelineTask` type export'u için geçerlidir — modülün kendisi kritik altyapıdır. Dead code raporundan çıkarılmalıdır.

**Consequences (+):**

- 521 LoC dead code güvenle silinecek (Sprint 140 Adım 4) — derleme süresi ve IDE noise azalır
- 521 LoC yüksek değerli kod korunacak — gelecek roadmap öğeleri için yatırım kaybı önlenir
- Her karar formal gerekçe, risk değerlendirmesi ve rollback planı ile belgelenmiştir
- False positive (parallel-pipeline) düzeltilerek audit doğruluğu artırılmıştır
- ADR-028 dormant modülleri Sprint 142'de reassessment'a takvimlenmiştir

**Consequences (-):**

- Deferred modüller (521 LoC) bakım yükü devam eder — `@deprecated` tag + periodic reassessment gerektirir
- Sprint 145 reassessment'ta modüllerin hâlâ relevant olup olmadığı belirsiz — roadmap değişebilir
- ADR-028 dormant modüller artık 15+ sprint boyunca untouched — reference value tartışmalı

**Alternatives Considered:**

- **Tümünü sil:** 1042 LoC + 495 LoC = ~1537 LoC silme. Reddedildi: combination-scorer ve handoff-protocol'ün yeniden yazım maliyeti yüksek, mimari bilgi kaybı.
- **Hiçbirini silme:** Tüm dead code korunsun. Reddedildi: learning-decay/migration/batch-stats gerçekten değersiz, bakım maliyeti artıyor.
- **Tümünü deprecate:** `@deprecated` işaretle, silme erteleme. Reddedildi: learning-decay/migration/batch-stats için deprecation gereksiz — doğrudan silme daha temiz.
- **Monorepo archive:** Dead kodu `packages/archive/` dizinine taşı. Reddedildi: ADR-010 minimal dependency, monorepo yapısı yok.

**References:**

- Sprint 139 Task 139-037: `scripts/dead-code-audit.mjs` — audit tool
- Sprint 139 Task 139-037: `docs/audits/sprint-139/dead-code-report.md` — audit raporu
- ADR-028: Decision-Engine V1 → V2 Routing Migration — dormant modül koruması
- ADR-033: Product Vision — bakım maliyeti minimizasyonu
- `docs/audits/sprint-139/dead-code-decisions.md` — detaylı decision matrix

---

## ADR-039: Self-Modifying Task Detection — Deckent Dogfood vs User Project Discrimination

**Status:** accepted

**Date:** 2026-04-15

**Context:**

Deckent iki farklı modda çalışır:

1. **Deckent-Dogfood modu:** Deckent kendi kaynak kodunu sprint ile değiştirir (örn. Sprint 139 Wave 5 `src/orchestra/` modülleri). Bu durumda Brain'in runtime cache'i invalidate olur, MCP server eski kodu çalıştırır ve `tsc` rebuild gerekir. Sprint 138 Layer 4 fail'in root cause'u tam olarak budur: worker `src/orchestra/sprint-finalizer.ts`'i değiştirdi ama Brain hâlâ eski pre-build cache'teki kodu çalıştırıyordu.

2. **Kullanıcı-Projesi modu:** Deckent, kullanıcının projesini (Rails app, React app, Go service vb.) orkestre eder. Kullanıcının kaynak kodu Deckent'in runtime'ını etkilemez — cache invalidation ve MCP restart gereksizdir.

Bu iki mod arasındaki ayrım hiçbir yerde formalize edilmemişti. Sonuçlar:

- Sprint 138 Task 6 (Layer 4 Wire Forensic Fix): 3-sprint üst üste runtime fail. Worker `sprint-finalizer.ts`'i değiştirdi, Brain eski kodu çalıştırdı, gate.json/load-report/metrics.jsonl üretilmedi.
- Self-modifying sprint'lerde parallel execution riskli: iki worker aynı anda `src/orchestra/` modüllerini değiştirirse tsc rebuild çakışır.
- Kullanıcı projelerinde gereksiz restart/rebuild overhead: her sprint sonunda MCP restart tetiklemek anlamsız.

**Decision:**

`src/orchestra/self-modifying-detector.ts` modülü ile runtime self-modification tespiti. Üç public fonksiyon:

### 1. `detectDeckentRepo(projectRoot: string): boolean`

Proje dizininin Deckent'in kendi repo'su olup olmadığını tespit eder. İki koşulun **ikisi birden** sağlanmalı:
- `.deckent/` dizini mevcut (gerekli ama yeterli değil — kullanıcı projeleri de bunu içerir)
- `package.json` dosyasının `name` alanı `'deckent'` (kesin ayırıcı)

### 2. `isSelfModifying(task: Pick<Task, 'scope'>, projectRoot: string): boolean`

Tek bir task'ın Deckent'in kendi kaynak kodunu değiştirip değiştirmediğini tespit eder. İki koşul:
- `detectDeckentRepo(projectRoot) === true`
- Task'ın `scope.directories` veya `scope.filesWrite` listesinde en az bir Deckent source pattern'ı bulunuyor

**Deckent Source Patterns:**
```
src/core/
src/orchestra/
src/monitor/
src/agents/
src/cli/
src/mcp/
src/providers/
src/api/
src/dashboard/
.deckent/agents/
.deckent/skills/
```

### 3. `isSelfModifyingSprint(tasks: ReadonlyArray<Pick<Task, 'scope'>>, projectRoot: string): boolean`

Sprint seviyesinde tespit: en az bir task self-modifying ise sprint self-modifying kabul edilir.

### Policy Kararları

**P1: Sequential Execution Zorunluluğu**
Self-modifying task'lar aynı wave içinde **sequential** çalıştırılmalı (parallel: false). İki worker aynı anda `src/orchestra/` modüllerini değiştirirse tsc rebuild race condition oluşur.

**P2: Wave 0 Self-Boot Gate (Gelecek Sprint)**
Self-modifying sprint tespit edildiğinde Brain otomatik Wave 0 `tsc && vitest run` gate prepend eder — mevcut codebase sağlığı doğrulanır. Bu ADR tasarımı tanımlar, runtime wiring Sprint 140+ scope.

**P3: Post-Task Auto-Checkpoint**
Self-modifying task tamamlandıktan sonra otomatik checkpoint yazılır (sprint-checkpoint.ts). MCP restart gerekiyorsa checkpoint'ten resume edilebilir.

**P4: Kullanıcı Projelerinde No-Op**
`detectDeckentRepo() === false` → tüm self-modifying kontrolleri atlanır. Zero overhead kullanıcı projeleri için.

### Integration Points

| Entegrasyon | Dosya | Açıklama | Sprint |
|-------------|-------|----------|--------|
| Detection API | `self-modifying-detector.ts` | 3 public fonksiyon | Sprint 139 (bu ADR) |
| Spawner wave sequencing | `sprint-spawner.ts` | `isSelfModifyingSprint` → sequential wave | Sprint 140+ |
| Finalizer MCP restart hook | `sprint-finalizer.ts` | Post-task rebuild + MCP restart | Sprint 140+ |
| Event stream integration | `event-stream.ts` | `BRAIN→*:SELF_MODIFY_DETECTED` channel | Sprint 140+ |

**Consequences (+):**

- Sprint 138 Layer 4 fail root cause formalize edildi — gelecekte aynı hata sınıfı önlenir
- Kullanıcı projeleri sıfır overhead — `detectDeckentRepo()` tek `readFileSync` + JSON.parse
- Self-modifying sprint'ler runtime-aware: Brain cache invalidation, sequential execution, auto-checkpoint
- Deckent-dogfood sprint'lerde `tsc` rebuild race condition riski ortadan kalkar (sequential wave)
- ADR-035 event stream'e `SELF_MODIFY_DETECTED` channel eklenebilir (Sprint 140+ extension point)

**Consequences (-):**

- `package.json` name check heuristic — fork'lar farklı name kullanabilir (edge case, kabul edilebilir)
- Deckent source pattern listesi bakım gerektirir — yeni `src/` alt dizini eklenirse güncellenmeli
- Wave 0 gate ve MCP restart wiring Sprint 140+ ertelendi — Sprint 139'da yalnızca detection API

**Alternatives Considered:**

- **Compile-time detection (tsc plugin):** TypeScript compiler plugin ile import graph analizi. Reddedildi: plugin maintenance cost yüksek, runtime'da tsc plugin API instabil.
- **Git-based detection (`git diff --name-only`):** Değişen dosyaları git'ten oku. Reddedildi: plan-time'da (sprint başlamadan) henüz değişiklik yok — scope'tan tespit etmek daha erken ve daha güvenilir.
- **Environment variable (`DECKENT_DOGFOOD=1`):** Manual flag. Reddedildi: ADR-033 "kur-çalıştır" ilkesi — otomatik tespit tercih edilir, kullanıcı konfigürasyon burden'ı minimize edilmeli.
- **Tüm sprint'leri self-modifying kabul et:** Her sprint sonrası rebuild + restart. Reddedildi: kullanıcı projeleri için gereksiz overhead, Sprint 138 audit 799 sync I/O hot path bulgusuyla çelişir.

**References:**

- Sprint 138 Task 6: Layer 4 Runtime Wire Forensic Fix — root cause (Brain pre-build cache)
- Sprint 138 Task 4: Event Stream + Plan-Time Scope Collision Detection — sequential wave pattern
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol — event stream extension point
- ADR-033: Product Vision — kur-çalıştır ilkesi (otomatik detection, manual flag değil)
- ADR-037: RBAC Authority Matrix — Brain/Worker dosya erişim sınırları
- `src/orchestra/self-modifying-detector.ts` — Sprint 139 implementasyonu
- `src/orchestra/sprint-spawner.ts` — Sprint 140+ sequential wave wiring
