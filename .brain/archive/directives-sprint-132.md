# DIRECTIVES — Sprint 132: Full 360° Enterprise Readiness Audit (Statik Analiz, 7-Worker Paralel)

## Goal: Deckent'in enterprise-ready / god-level olgunluğa ulaşması için kendi kendine kapsamlı bir statik audit çalıştır. Altı paralel uzman worker (W1-W6) güvenlik+multi-tenancy, performans+ölçeklenebilirlik, güvenilirlik, özelleştirilebilirlik, mimari tutarlılık ve rakip konumlandırma boyutlarında bulgular çıkarıp her biri `docs/audits/sprint-132/` altında ayrı standart şablonlu `.md` raporu yazar. Yedinci worker (W7, reducer) diğer altı result dosyasını self-polling ile bekler, raporları birleştirir, executive summary + cross-cutting findings + Sprint 133+ roadmap içeren tek bir `FINAL-EXECUTIVE-REPORT.md` üretir. **Sıfır kod değişikliği** — sadece salt-okunur tarama ve markdown raporu. Yük testi Sprint 133'e ertelendi.

---

## Context

Bu sprint Deckent'in 130+ sprint birikimi sonrası enterprise vitrinini hazırlamadan önceki son "kendi kendine ayna tutma" çalışması. Alperen'in enterprise-ready tanımı: **Güvenli · Çoklu ve izole çalışmaya elverişli · Hızlı · Bugsuz · Ölçeklenebilir · Customize edilebilir**. Bu altı eksen birebir W1-W4'e dağıtıldı; W5 mimari tutarlılığı, W6 ise rakip ürünlere (Devin, OpenHands, Cursor, Copilot Cowork) karşı farkları işliyor.

**Kritik mimari kısıtlama:** `src/orchestra/sprint-controller.ts` içindeki `spawnWorkers()` (satır 919-1018) tüm task'ları paralel fırlatıyor ve `Task.dependencies` alanını kontrol etmiyor. `task-builder.ts` (parseStructuredDirectives, satır 358-439) `- Dependencies:` satırını parse etmiyor. `src/orchestra/parallel-pipeline.ts` içindeki topological sort hiçbir yerde çağrılmıyor. Bu yüzden W7 "son task" olarak sıralanamaz — diğer 6 worker ile aynı anda spawn edilir. **Çözüm:** W7 kendi description'ında açıkça self-polling yapar; diğer altı worker'ın `.tasks/task-132-00X.result` dosyalarının hepsini görene kadar 30 saniyelik aralıklarla bekler.

**Kapsam daraltması:** Bu sprint saf statik analizdir. Worker'lar HİÇBİR dosyayı değiştirmez, silmez, taşımaz. Yalnızca `docs/audits/sprint-132/` altına yeni `.md` dosyaları yazarlar. Yük testi, chaos testing, benchmark çalıştırma gibi runtime aktiviteler Sprint 133+ için ayrıldı.

**Verify loop skip:** Tüm audit worker'ları `tsc --noEmit` ve `vitest run` adımlarını BİLİNÇLİ ATLAYACAK çünkü kod değiştirmiyorlar. Result `notes` alanında "static audit, verify skipped — no code changes" belirtilmeli. `testsPassed: true` (gerçekten hiçbir şey değişmedi).

**use context7:** Her worker, kendi alanındaki endüstri standartlarını doğrulamak için context7 MCP kullanabilir (OWASP, CWE, Node.js perf rehberleri, Clean Architecture, rakip dokümantasyon vs.). Bulguları standartla karşılaştırıp rapora ekleyebilir.

---

## Task 1: W1 — Security & Multi-Tenancy Audit
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: security-auditor
- Files: src/agents/worker.ts, src/core/credentials.ts, src/core/config.ts, src/core/plugin.ts, src/core/plugin-hooks.ts, src/core/marketplace/skill-sandbox.ts, src/core/marketplace/marketplace-auth.ts, src/monitor/auditor.ts, src/orchestra/spawn-backend-docker.ts, src/api, Dockerfile.worker, docker-compose.yml
- Scope: src/agents/, src/core/, src/monitor/, src/orchestra/spawn-backend-docker.ts, src/orchestra/spawn-backend.ts, src/api/, Dockerfile, Dockerfile.worker, docker-compose.yml, docs/audits/sprint-132/

### Description
Deckent'in güvenlik yüzeyini ve çok-tenant izolasyon kapasitesini statik tarama ile incele. **Kod değiştirme. Sadece `docs/audits/sprint-132/W1-security-multi-tenancy.md` dosyasını yaz. `tsc` ve `vitest` çalıştırma — kod değişmedi.**

**Tarama alanları:**

1. **Credential handling & secrets**
   - `src/core/credentials.ts` içinde API key / token nasıl saklanıyor? Plaintext mi, OS keychain mi?
   - `src/core/config.ts` (1110 satır, 3-layer merge) env variable'lar, `.deckent/config.json` ve global config arasında sır sızıntısı riski var mı?
   - `.deckent/config.json.bak.*` yedek dosyaları sırları diske sızdırıyor mu?
   - Grep pattern: `process.env\.`, `API_KEY`, `TOKEN`, `SECRET`, `password`, `credentials`

2. **Scope enforcement / file locking**
   - `src/agents/worker.ts` (997 satır) içinde scope enforcement nasıl yapılıyor? `.locks/` mekanizması race condition'a açık mı?
   - `src/monitor/auditor.ts` (612 satır, 30s cycle) boundary violation nasıl tespit ediliyor? Bypass yolları var mı?
   - Worker scope escape senaryoları: path traversal (`../../../etc/passwd`), symlink attack, absolute path injection

3. **Sandbox & process isolation**
   - `src/core/marketplace/skill-sandbox.ts` — skill kodu gerçekten sandbox'ta mı çalışıyor? vm2 / isolated-vm kullanılıyor mu yoksa naive eval mi?
   - `src/orchestra/spawn-backend-docker.ts` — worker container'ları hangi user ile çalışıyor? root mu? read-only rootfs var mı? capabilities drop ediliyor mu?
   - `Dockerfile.worker` ve `docker-compose.yml` → non-root user, no-new-privileges, seccomp profile kontrolü

4. **Multi-tenancy izolasyonu**
   - Aynı makinede iki farklı proje aynı anda sprint çalıştırabilir mi? `.tasks/`, `.locks/`, `.brain/` yolları nasıl izole ediliyor?
   - Worker'lar arası cross-project memory/state sızıntısı var mı?
   - Global state birden fazla projede ortak mı? Conflict riski?

5. **API & MCP surface**
   - `src/api/` altındaki HTTP / WebSocket endpoint'ler auth gerektiriyor mu?
   - `src/mcp/server.ts` tool handler'ları input validation yapıyor mu? Command injection riski?
   - Plugin loader (`src/core/plugin.ts`, 455 satır; `src/core/plugin-hooks.ts`, 796 satır) keyfi kod çalıştırıyor mu? İmza doğrulama / allow-list var mı?

6. **OWASP Top 10 eşleme**
   - Her bulguyu OWASP 2021 kategorisine ve CWE ID'ye eşle
   - Context7 ile OWASP Top 10 2021 ve CWE Top 25 güncel listesini çek, bulgularını bu standartla karşılaştır

**Çıktı:** `docs/audits/sprint-132/W1-security-multi-tenancy.md` — standart şablon (7 zorunlu heading):

```
# W1 — Security & Multi-Tenancy Audit (Sprint 132)

## Executive Summary
(3-5 cümle: en kritik bulgular, genel güvenlik postürü)

## Methodology
(Hangi dosyalar tarandı, hangi pattern'ler arandı, hangi standartlarla karşılaştırıldı)

## Findings
| # | Severity | Category | Location | Description | Impact | Recommendation |
|---|----------|----------|----------|-------------|--------|----------------|
| 1 | CRITICAL | Credentials | src/core/credentials.ts:XX | ... | ... | ... |

Severity legend: CRITICAL / HIGH / MEDIUM / LOW / INFO
Category: Credentials | Sandbox | IsolationAndTenancy | InputValidation | API | Supply-Chain | Docker | OWASP-A0X

## Metrics
- Dosya tarandı: XX
- Toplam bulgu: XX
- CRITICAL: X, HIGH: X, MEDIUM: X, LOW: X, INFO: X
- OWASP kategorileri tespit edildi: A01, A03, ...

## Evidence
(Her bulgu için dosya:satır referansı ve kısa kod alıntısı — 10 satırı geçmemeli)

## Recommendations (Sprint 133+)
(Prioritized düzeltme listesi: CRITICAL → HIGH → MEDIUM. Her biri 1-2 cümle.)

## Context7 References
(Kullanıldıysa: OWASP Top 10 2021 linkleri, CWE entry'leri, Node.js security best practices)
```

**Worker verify adımını skip et.** `.tasks/task-132-001.result` yazarken `filesChanged: ["docs/audits/sprint-132/W1-security-multi-tenancy.md"]`, `testsPassed: true` (değişmedi), `selfAssessment: "DONE"`, `notes: "static audit, verify skipped — no code changes. [rapor özeti]"`.

**Kanıt:**
- `ls docs/audits/sprint-132/W1-security-multi-tenancy.md` → var
- `grep "^## Executive Summary" docs/audits/sprint-132/W1-security-multi-tenancy.md` → var
- `grep "^## Methodology" docs/audits/sprint-132/W1-security-multi-tenancy.md` → var
- `grep "^## Findings" docs/audits/sprint-132/W1-security-multi-tenancy.md` → var
- `grep "^## Metrics" docs/audits/sprint-132/W1-security-multi-tenancy.md` → var
- `grep "^## Evidence" docs/audits/sprint-132/W1-security-multi-tenancy.md` → var
- `grep "^## Recommendations" docs/audits/sprint-132/W1-security-multi-tenancy.md` → var
- `wc -l docs/audits/sprint-132/W1-security-multi-tenancy.md` → ≥ 150 satır
- `git diff --stat src/` → boş (HİÇBİR src dosyası değişmemiş)

**Test:** Rapor dosyası yazıldı, yedi zorunlu heading içeriyor, minimum 150 satır, Findings tablosunda en az 10 satır var, git diff src/ temiz. Verify loop skipped (notes'ta belirtildi).

---

## Task 2: W2 — Performance & Scalability Audit
- Model: opus
- Effort: high
- Skills: performance-optimizer, typescript-expert
- Agent: performance-analyzer
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-reporter.ts, src/orchestra/task-router.ts, src/orchestra/parallel-pipeline.ts, src/orchestra/spawn-backend.ts, src/orchestra/spawn-backend-docker.ts, src/core/lazy-loader.ts, src/core/agent-pool.ts, src/core/skill-pool.ts, src/core/agent-cache.ts, src/core/skill-cache.ts, src/core/routing-engine.ts
- Scope: src/orchestra/, src/core/, src/monitor/, src/mcp/, src/dashboard/, vitest.config.ts, docs/audits/sprint-132/

### Description
Deckent'in performans profilini ve ölçeklenebilirlik tavanını statik olarak incele. **Kod değiştirme. Sadece `docs/audits/sprint-132/W2-performance-scalability.md` yaz. Yük testi YAPMA (Sprint 133). `tsc` ve `vitest` çalıştırma.**

**Tarama alanları:**

1. **God object'ler ve hot path'ler**
   - `src/orchestra/sprint-controller.ts` (2133 satır) — `spawnWorkers` (919-1018), lifecycle fazları. O(n²) loop'lar, senkron fs çağrıları, memory leak riskleri.
   - `src/orchestra/sprint-reporter.ts` (2132 satır) — Retro ve metrik üretiminde allocation pattern'leri, string concatenation ile markdown üretimi (stream vs buffer).
   - `src/core/config.ts` (1110 satır, 3-layer merge) — Her config okumada full merge yapılıyor mu? Cache var mı?

2. **I/O ve filesystem**
   - `fs.readFileSync` / `fs.writeFileSync` kullanım sıklığı (grep ile say) — async olması gereken yerler
   - `.tasks/`, `.locks/`, `.brain/` polling pattern'leri — fsnotify / chokidar mı yoksa setInterval mı?
   - `src/orchestra/result-watcher.ts` poll interval'i scale edilebilir mi?

3. **Caching ve lazy loading**
   - `src/core/agent-cache.ts`, `src/core/skill-cache.ts`, `src/core/lazy-loader.ts`, `src/core/agent-pool.ts`, `src/core/skill-pool.ts` — TTL, eviction, memory budget var mı?
   - Config 3-layer merge sonucu cache'leniyor mu? Global config değişimde invalidation?

4. **Parallelism tavanı**
   - `spawnWorkers` `maxWorkers` nasıl belirliyor? `systemProfile` CPU/RAM'e göre mi? Hard-coded mi?
   - `parallel-pipeline.ts` topological sort kullanılmıyor — dependency-aware scheduling olmayışının maliyeti
   - Worker çıkışında cleanup (tmux session, container) atomic mi?

5. **Token ve model maliyet verimi**
   - `src/orchestra/prompt-token-optimizer.ts` — prompt küçültme agresif mi?
   - `src/core/routing-engine.ts` — her task için ne kadar overhead? Routing decision cache'leniyor mu?

6. **Bottleneck haritası**
   - En pahalı 10 fonksiyonu statik olarak tahmin et (loop nesting + allocation + I/O çağrısı)
   - Hangi dosyalar startup time'ı dominate ediyor? (`index.ts` import grafı)

7. **Context7 referansı:** Node.js performance best practices, Node.js event loop lag patterns, fs.promises vs fs sync karşılaştırması.

**Çıktı:** `docs/audits/sprint-132/W2-performance-scalability.md` — W1 ile aynı 7 zorunlu heading'li standart şablon. Category enum: `GodObject | SyncIO | MissingCache | MemoryLeak | Parallelism | StartupTime | Allocation | Polling`.

**Worker verify adımını skip et.** `.tasks/task-132-002.result` `notes: "static audit, verify skipped — no code changes. [rapor özeti]"`.

**Kanıt:**
- `ls docs/audits/sprint-132/W2-performance-scalability.md` → var
- `grep "^## Executive Summary" docs/audits/sprint-132/W2-performance-scalability.md` → var
- `grep "^## Findings" docs/audits/sprint-132/W2-performance-scalability.md` → var
- `grep "^## Metrics" docs/audits/sprint-132/W2-performance-scalability.md` → var
- `wc -l docs/audits/sprint-132/W2-performance-scalability.md` → ≥ 150 satır
- `git diff --stat src/` → boş

**Test:** Rapor dosyası yazıldı, yedi zorunlu heading içeriyor, ≥ 150 satır, Findings tablosunda ≥ 10 satır, git diff src/ temiz.

---

## Task 3: W3 — Reliability (Bugsuz) Audit
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/orchestra, tests/core, tests/agents, tests/monitor, src/orchestra/task-retry.ts, src/orchestra/rollback.ts, src/orchestra/result-evaluator.ts, src/orchestra/coverage-validator.ts, src/orchestra/handoff-protocol.ts, src/agents/worker.ts, src/monitor/auditor.ts, vitest.config.ts
- Scope: tests/, src/orchestra/, src/agents/, src/monitor/, vitest.config.ts, docs/audits/sprint-132/

### Description
Deckent'in "bugsuz" hedefine ne kadar yakın olduğunu tespit et. 12,225 test var — ama coverage gerçekten enterprise düzeyinde mi? Error handling path'leri tam mı? **Kod değiştirme. Sadece `docs/audits/sprint-132/W3-reliability.md` yaz. Test çalıştırma — sadece mevcut `coverage/coverage-summary.json` varsa onu okuyabilirsin.**

**Tarama alanları:**

1. **Test coverage haritası**
   - `tests/` altında hangi modüllerin test'i var, hangilerinin yok? (`ls tests/orchestra` vs `src/orchestra` karşılaştırması)
   - Test dosyası olmayan kritik modüller listesi
   - Test-to-source oranı (LoC bazında kaba tahmin)
   - Sprint 130'dan kalan `@vitest/coverage-v8` gerçek rakamı hangi dosyadan okunabilir? (`coverage/coverage-summary.json` varsa oku)

2. **Error handling antipattern'leri**
   - Grep pattern: `catch\s*\(\s*\)` (boş catch), `catch\s*\(\s*\w+\s*\)\s*\{\s*\}` (swallowed error), `throw new Error\("TODO"` (placeholder)
   - `console.error` + devam eden akış (error yutma)
   - `process.exit` kullanımları — test edilebilirlik ve temiz kapatma

3. **Retry ve rollback sağlamlığı**
   - `src/orchestra/task-retry.ts` — exponential backoff var mı, max retry saygı gösteriliyor mu?
   - `src/orchestra/rollback.ts` — partial state rollback atomic mi? Idempotent mi?
   - `src/orchestra/handoff-protocol.ts` — iki worker aynı anda handoff alırsa ne olur?

4. **Race condition ve concurrency bug'ları**
   - `.locks/` dosya tabanlı lock — TOCTOU (time-of-check-to-time-of-use) riskleri
   - `src/agents/worker.ts` heartbeat güncellemeleri atomic mi?
   - `src/monitor/auditor.ts` 30s cycle ile worker lifecycle çakışması

5. **Flaky test tespiti**
   - Test dosyalarında `setTimeout`, `Date.now()`, `Math.random()`, `process.env.CI` kullanımı (grep)
   - Sprint 130'da raporlanan `[vitest-worker] Timeout calling onTaskUpdate` hatasının kaynağı
   - `tests/` altında `.skip`, `.only`, `.todo` işaretli testler

6. **Type safety gevşeklikleri**
   - `any`, `as any`, `@ts-ignore`, `@ts-expect-error` sayısı (grep)
   - `src/**/*.ts` içinde `unknown` → runtime cast yapan noktalar

7. **Context7 referansı:** Testing pyramid, chaos engineering primer, Vitest best practices, Node.js async error handling patterns.

**Çıktı:** `docs/audits/sprint-132/W3-reliability.md` — 7 zorunlu heading'li standart şablon. Category enum: `MissingTests | ErrorSwallow | RetryLogic | RaceCondition | FlakyTest | TypeSafety | CoverageGap | Idempotency`.

**Worker verify adımını skip et.** `.tasks/task-132-003.result` `notes: "static audit, verify skipped — no code changes. [rapor özeti]"`.

**Kanıt:**
- `ls docs/audits/sprint-132/W3-reliability.md` → var
- `grep "^## Executive Summary" docs/audits/sprint-132/W3-reliability.md` → var
- `grep "^## Findings" docs/audits/sprint-132/W3-reliability.md` → var
- `wc -l docs/audits/sprint-132/W3-reliability.md` → ≥ 150 satır
- `git diff --stat src/ tests/` → boş

**Test:** Rapor yazıldı, yedi heading var, ≥ 150 satır, Findings tablosunda ≥ 10 satır, git diff temiz.

---

## Task 4: W4 — Customization & Extensibility Audit
- Model: opus
- Effort: high
- Skills: system-architect, typescript-expert
- Agent: architect
- Files: src/core/plugin.ts, src/core/plugin-hooks.ts, src/core/config.ts, src/core/mode-presets.ts, src/orchestra/managed-docs/managed-doc-runner.ts, src/orchestra/managed-docs/plugin-loader.ts, src/orchestra/managed-docs/template-renderer.ts, src/orchestra/managed-docs/content-generators.ts, src/core/marketplace/registry-client.ts, src/core/marketplace/dependency-resolver.ts, .deckent/plugins
- Scope: src/core/, src/orchestra/managed-docs/, src/orchestra/temp-skill-generator.ts, src/agents/adaptive-agent.ts, .deckent/plugins/, examples/, docs/audits/sprint-132/

### Description
Deckent'in enterprise müşterilerin kendi use case'lerine göre özelleştirebilmesi için sahip olduğu extension point'lerini haritala. Plugin sistemi production-grade mi? Customize edilebilirlik yüzeyi Cursor/Copilot-benzeri rakiplerle karşılaştırıldığında nerede? **Kod değiştirme. Sadece `docs/audits/sprint-132/W4-customization.md` yaz. `tsc` ve `vitest` çalıştırma.**

**Tarama alanları:**

1. **Plugin architecture derinliği**
   - `src/core/plugin.ts` (455 satır) — plugin lifecycle (load/activate/deactivate/unload)
   - `src/core/plugin-hooks.ts` (796 satır) — hangi hook point'ler var? Pre/post task, pre/post sprint, router, evaluator
   - Plugin API stability: versioning var mı? Breaking change policy?

2. **Config layering ve user customization**
   - `src/core/config.ts` 3-layer merge (global → project → runtime) — kullanıcı hangi davranışları config ile değiştirebilir?
   - `src/core/mode-presets.ts` — hazır preset'ler ve custom preset yolu
   - `.deckent/config.json` schema — hangi alanlar belgelenmiş?

3. **Managed-docs universalization**
   - `src/orchestra/managed-docs/` (10 dosya) — Sprint 131'de eklenen bu yeni soyutlama gerçekten generic mi yoksa Deckent-spesifik mi?
   - `managed-doc-runner.ts`, `plugin-loader.ts`, `template-renderer.ts`, `content-generators.ts` — kullanıcı kendi managed-doc'unu yazabilir mi?
   - Örnek kullanım senaryosu: "Bir kullanıcı kendi RETRO formatını tanımlamak isterse hangi dosyaları değiştirmek zorunda?"

4. **Agent & skill marketplace**
   - `src/core/marketplace/registry-client.ts`, `dependency-resolver.ts`, `rating-system.ts`, `marketplace-auth.ts`
   - Üçüncü taraf agent/skill yayınlama akışı var mı yoksa sadece schema mı tanımlı?
   - `src/orchestra/temp-skill-generator.ts` — kullanıcı runtime'da skill üretiyor, bu production-safe mi?

5. **Custom routing/decision hooks**
   - `src/core/routing-engine.ts` — routing mantığını kullanıcı override edebiliyor mu? Plugin hook mevcut mu?
   - `src/agents/adaptive-agent.ts`, `src/agents/prompt-evolution.ts` — agent davranışı runtime'da değiştirilebilir mi?

6. **Extension point'lerin kataloğu**
   - Tüm resmi extension point'leri (hooks, config knobs, plugins, managed-docs, marketplace) tek bir tabloda listele
   - Her biri için: stability (stable/experimental), documentation link, örnek

7. **Context7 referansı:** Plugin architecture patterns (VSCode, Obsidian, Grafana), Clean Architecture extensibility rules, Open/Closed principle.

**Çıktı:** `docs/audits/sprint-132/W4-customization.md` — 7 zorunlu heading'li standart şablon + ek bölüm: **## Extension Point Catalog** (tam tablo). Category enum: `PluginAPI | ConfigLayer | ManagedDocs | Marketplace | RoutingHook | UndocumentedKnob | BreakingRisk`.

**Worker verify adımını skip et.** `.tasks/task-132-004.result` `notes: "static audit, verify skipped — no code changes. [rapor özeti]"`.

**Kanıt:**
- `ls docs/audits/sprint-132/W4-customization.md` → var
- `grep "^## Executive Summary" docs/audits/sprint-132/W4-customization.md` → var
- `grep "^## Extension Point Catalog" docs/audits/sprint-132/W4-customization.md` → var
- `grep "^## Findings" docs/audits/sprint-132/W4-customization.md` → var
- `wc -l docs/audits/sprint-132/W4-customization.md` → ≥ 150 satır
- `git diff --stat src/` → boş

**Test:** Rapor yazıldı, yedi heading + Extension Point Catalog var, ≥ 150 satır, git diff temiz.

---

## Task 5: W5 — Architecture & Consistency Audit
- Model: opus
- Effort: high
- Skills: system-architect, code-simplifier
- Agent: architect
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-reporter.ts, src/orchestra/task-builder.ts, src/orchestra/parallel-pipeline.ts, src/agents/worker.ts, src/core/config.ts, src/core/routing-engine.ts, src/core/intent-classifier.ts, src/core/activation-engine.ts, src/orchestra/decision-engine.ts, src/index.ts, .contracts/api-surface.md, .brain/DECISIONS.md
- Scope: src/, .contracts/, .brain/DECISIONS.md, docs/audits/sprint-132/

### Description
Deckent'in iç mimari tutarlılığını incele. God object'ler, coupling, dead code, API surface drift, ADR disiplini. **Kod değiştirme. Sadece `docs/audits/sprint-132/W5-architecture-consistency.md` yaz. `tsc` ve `vitest` çalıştırma.**

**Tarama alanları:**

1. **God object & LoC hotspot'ları**
   - `sprint-controller.ts` (2133), `sprint-reporter.ts` (2132), `config.ts` (1110), `worker.ts` (997), `plugin-hooks.ts` (796), `task-builder.ts` (753), `auditor.ts` (612) — her biri için responsibility sayımı ve split önerileri
   - Sprint 130 ADR-028 sonrası decision-engine V1 @deprecated — dead code gerçekten izole mi?

2. **Coupling & import grafı**
   - `src/index.ts` → downstream import sayısı, circular dependency var mı?
   - `src/core/` ↔ `src/orchestra/` karşılıklı bağımlılık derinliği
   - `src/agents/worker.ts` kaç farklı modülden import yapıyor?

3. **Task dependency kırıklığı (yeniden doğrulama)**
   - `src/orchestra/task-builder.ts` satır 358-439 parseStructuredDirectives — `- Dependencies:` neden parse edilmiyor?
   - `src/orchestra/sprint-controller.ts` satır 919-1018 spawnWorkers — dependencies alanı neden okunmuyor?
   - `src/orchestra/parallel-pipeline.ts` (106 satır) topological sort → kim tarafından çağrılıyor? (cevap: hiç kimse)
   - Bu üçlünün entegre edilmemiş olması ADR'ye bağlı mı? Yoksa teknik borç mu?

4. **API surface ve contract drift**
   - `.contracts/api-surface.md` son ne zaman güncellendi? Sprint 130 eklemeleri (rubricScores, evaluationDecision) var mı?
   - MCP tool listesi (`src/mcp/server.ts` MCP_INSTRUCTIONS) — gerçek `src/mcp/tools/` sayısıyla tutarlı mı? (Sprint 130 fix sonrası 21'e çıktı)
   - Public export'lar (`src/index.ts`, `src/core/index.ts`, `src/orchestra/index.ts`, `src/agents/index.ts`) semver disiplini

5. **ADR disiplini**
   - `.brain/DECISIONS.md` — 28 ADR var. Her ADR gerçekten implement edildi mi?
   - Son 10 sprintte büyük refactor'lar için ADR yazıldı mı? Sprint 131'in özellikleri ADR'ye girdi mi?

6. **Naming & convention tutarlılığı**
   - kebab-case dosya adı vs camelCase import — tutarlı mı?
   - Interface `IFoo` prefix'i veya suffix'i — consistent mi?
   - Error sınıfları `*Error` naming?

7. **Context7 referansı:** Clean Architecture, Hexagonal Architecture, Domain-Driven Design bounded context, module boundary heuristics.

**Çıktı:** `docs/audits/sprint-132/W5-architecture-consistency.md` — 7 zorunlu heading'li standart şablon. Category enum: `GodObject | DeadCode | Coupling | ContractDrift | ADRMissing | NamingInconsistency | DependencyBrokenParsing`.

**Ek bölüm:** **## Module Ownership Map** — her top-level modül için "kim sorumlu, neye bağımlı, ne tarafından kullanılıyor".

**Worker verify adımını skip et.** `.tasks/task-132-005.result` `notes: "static audit, verify skipped — no code changes. [rapor özeti]"`.

**Kanıt:**
- `ls docs/audits/sprint-132/W5-architecture-consistency.md` → var
- `grep "^## Executive Summary" docs/audits/sprint-132/W5-architecture-consistency.md` → var
- `grep "^## Module Ownership Map" docs/audits/sprint-132/W5-architecture-consistency.md` → var
- `grep "^## Findings" docs/audits/sprint-132/W5-architecture-consistency.md` → var
- `wc -l docs/audits/sprint-132/W5-architecture-consistency.md` → ≥ 150 satır
- `git diff --stat src/` → boş

**Test:** Rapor yazıldı, yedi heading + Module Ownership Map var, ≥ 150 satır, git diff temiz.

---

## Task 6: W6 — Competitive Positioning Audit
- Model: opus
- Effort: high
- Skills: documentation-writer, system-architect
- Agent: architecture-planner
- Files: README.md, README-TR.md, VISION.md, VISION-TR.md, docs/COMPETITIVE-ANALYSIS.md, docs/analysis/competitive-analysis.md, docs/DECKENT-MASTER-BLUEPRINT.md, package.json, src/mcp/server.ts, src/cli
- Scope: docs/, README.md, README-TR.md, VISION.md, VISION-TR.md, package.json, src/cli/, src/mcp/, docs/audits/sprint-132/

### Description
Deckent'i rakip ürünlere karşı dürüstçe konumlandır: **Devin (Cognition), OpenHands (All Hands), Cursor Agents, GitHub Copilot Cowork/Workspace**. Deckent'in benzersiz değer teklifleri neler? Nerede geride? Enterprise müşteri için "neden Deckent" hikayesi bugün inandırıcı mı? **Kod değiştirme. README/VISION'ı da düzenleme — sadece `docs/audits/sprint-132/W6-competitive-positioning.md` yaz. `tsc` ve `vitest` çalıştırma.**

**Tarama alanları:**

1. **Mevcut materyalleri oku**
   - `README.md`, `README-TR.md` — şu anki "neden Deckent" argümanı
   - `VISION.md`, `VISION-TR.md` — uzun vadeli iddialar
   - `docs/COMPETITIVE-ANALYSIS.md`, `docs/analysis/competitive-analysis.md` — eski rakip analizleri (güncel mi?)
   - `docs/DECKENT-MASTER-BLUEPRINT.md` — master vizyon

2. **Deckent özellik envanteri**
   - `src/mcp/server.ts` — 21 MCP tool + 8 resource (Sprint 130 sonrası)
   - `src/cli/` — CLI komut yüzeyi
   - `package.json` features ve bağımlılıkları
   - Benzersiz özellikler: multi-agent orchestration, rubric grading, worker question mechanism, context-aware routing, token tracker, managed-docs, plugin system, marketplace scaffold

3. **Rakip haritası (context7 ile güncel dokümantasyon çek)**
   - **Devin** (Cognition Labs): autonomous SWE agent, cloud-hosted, tek-agent model. Deckent farkı: yerel + multi-agent + self-hosted + open
   - **OpenHands** (eski OpenDevin, All Hands AI): open-source, multi-agent capability, container sandbox. Deckent farkı: sprint-based lifecycle, ADR/RETRO disiplini, planning layer
   - **Cursor Agents**: IDE-native, tek-agent, editor-integrated. Deckent farkı: CLI-first, batch/sprint mode, multi-worker
   - **GitHub Copilot Cowork/Workspace**: PR-scoped, GitHub-native. Deckent farkı: local-first, repo-agnostic, provider-agnostic

4. **Feature matrix tablosu**
   | Feature | Deckent | Devin | OpenHands | Cursor Agents | Copilot Cowork |
   |---|---|---|---|---|---|
   | Local-first | Yes | No | Yes | Partial | No |
   | Multi-agent parallel | Yes | No | Partial | No | No |
   | Provider-agnostic | Yes | No | Yes | Partial | No |
   | Sprint/retro discipline | Yes | No | No | No | No |
   | Plugin architecture | Yes | No | Partial | No | No |
   | MCP native | Yes | No | No | No | No |
   | Rubric-based grading | Yes | No | No | No | No |
   | Managed-docs lifecycle | Yes | No | No | No | No |
   | Enterprise SSO | No | Yes | No | Yes | Yes |
   | Cloud-hosted | No | Yes | No | Yes | Yes |

5. **Dürüst SWOT**
   - **Strengths:** benzersiz değerler
   - **Weaknesses:** enterprise gap'leri (SSO, audit log, multi-region, support SLA)
   - **Opportunities:** henüz kimsenin dokunmadığı alanlar
   - **Threats:** rakiplerin yakın zamanda duyurduğu özellikler (context7 ile doğrula)

6. **README/VISION revizyon önerileri**
   - Mevcut README'de hangi iddialar artık doğru değil?
   - Hangi özellikler underplayed? Hangi rakip değişti?

7. **Context7 referansı:** Devin release notes, OpenHands GitHub README son commit, Cursor changelog, GitHub Copilot Workspace blog.

**Çıktı:** `docs/audits/sprint-132/W6-competitive-positioning.md` — 7 zorunlu heading'li standart şablon + ek bölümler: **## Feature Matrix**, **## SWOT**, **## Positioning Statement Revision**. Category enum: `UniqueStrength | EnterpriseGap | OutdatedClaim | CompetitorThreat | MarketingOpportunity`.

**Worker verify adımını skip et.** `.tasks/task-132-006.result` `notes: "static audit, verify skipped — no code changes. [rapor özeti]"`.

**Kanıt:**
- `ls docs/audits/sprint-132/W6-competitive-positioning.md` → var
- `grep "^## Executive Summary" docs/audits/sprint-132/W6-competitive-positioning.md` → var
- `grep "^## Feature Matrix" docs/audits/sprint-132/W6-competitive-positioning.md` → var
- `grep "^## SWOT" docs/audits/sprint-132/W6-competitive-positioning.md` → var
- `grep "^## Positioning Statement Revision" docs/audits/sprint-132/W6-competitive-positioning.md` → var
- `wc -l docs/audits/sprint-132/W6-competitive-positioning.md` → ≥ 150 satır
- `git diff --stat` → sadece docs/audits/sprint-132/ altında değişiklik

**Test:** Rapor yazıldı, yedi heading + Feature Matrix + SWOT + Positioning Revision var, ≥ 150 satır, git diff temiz.

---

## Task 7: W7 — Reducer (Self-Polling Executive Report Synthesizer)
- Model: opus
- Effort: high
- Skills: documentation-writer, system-architect
- Agent: doc-writer
- Files: .tasks/task-132-001.result, .tasks/task-132-002.result, .tasks/task-132-003.result, .tasks/task-132-004.result, .tasks/task-132-005.result, .tasks/task-132-006.result, docs/audits/sprint-132/W1-security-multi-tenancy.md, docs/audits/sprint-132/W2-performance-scalability.md, docs/audits/sprint-132/W3-reliability.md, docs/audits/sprint-132/W4-customization.md, docs/audits/sprint-132/W5-architecture-consistency.md, docs/audits/sprint-132/W6-competitive-positioning.md
- Scope: .tasks/, docs/audits/sprint-132/

### Description
**KRİTİK: Bu task diğer 6 worker ile AYNI ANDA spawn edilir. Deckent `Task.dependencies` alanını kontrol etmiyor. Bu yüzden W7 kendi içinde self-polling yapmak ZORUNDA.** W7'nin tek görevi diğer altı worker'ın raporlarını bekleyip birleştirmek ve `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` üretmek.

**Kod değiştirme. Src dokunma.** Sadece `.tasks/` altını salt-okunur oku ve `docs/audits/sprint-132/` altına yaz. **`tsc` ve `vitest` çalıştırma.**

**Adım adım talimatlar:**

### Adım 1 — Self-polling wait loop (MAX 45 DAKİKA)

Worker başlar başlamaz şu bash polling döngüsünü çalıştır. 30 saniye aralıklarla, maksimum 90 iterasyon (toplam 45 dakika):

```bash
MAX_ITER=90
INTERVAL=30
for i in $(seq 1 $MAX_ITER); do
  ALL_READY=true
  for n in 001 002 003 004 005 006; do
    if [ ! -f ".tasks/task-132-${n}.result" ]; then
      ALL_READY=false
      break
    fi
  done
  if [ "$ALL_READY" = true ]; then
    echo "All W1-W6 results ready at iteration $i"
    break
  fi
  echo "Waiting for W1-W6 (iter $i/$MAX_ITER)..."
  sleep $INTERVAL
done
```

Eğer 45 dakika sonra hâlâ eksik result varsa:
- `.tasks/task-132-007.result` dosyasını `selfAssessment: "NO_GO"` ve `notes: "W7 timeout — missing results: [liste]"` ile yaz
- Sprint yine de kısmi FINAL report üretmeye çalış (hangi worker'lar geldiyse onlarla)

### Adım 2 — Result dosyalarını oku

Her `.tasks/task-132-00X.result` dosyasını oku (JSON format). İçindeki alanlar:
- `taskId`
- `filesChanged` (array) — buradan `docs/audits/sprint-132/WN-*.md` yolunu bul
- `selfAssessment` (DONE / GO_WITH_TECH_DEBT / NO_GO)
- `notes` (worker'ın özeti)
- `testsPassed` (bu sprintte anlamsız — audit, kod değiştirmiyor)

Eğer bir worker NO_GO ise: FINAL report'ta "Worker W_N failed — see notes: [...]" olarak işaretle, ama yine de var olan `.md` dosyasını oku.

### Adım 3 — Altı raporun `.md` içeriğini oku

Her worker'ın standart şablonu var (Executive Summary, Methodology, Findings, Metrics, Evidence, Recommendations, Context7 References). Şu şekilde ayrıştır:

- **Executive Summary** → FINAL report'un "Per-Worker Summary" bölümüne direkt kopyala
- **Findings tablosu** → CRITICAL/HIGH/MEDIUM/LOW bulgu sayısını say
- **Metrics** → FINAL report'un "Aggregate Metrics" bölümüne birleştir
- **Recommendations** → FINAL report'un "Cross-Cutting Recommendations" + "Prioritized Roadmap" bölümlerine feed et

### Adım 4 — Cross-cutting findings çıkarımı

Birden fazla worker tarafından farklı açılardan bahsedilen konuları bul. Örnekler:
- `sprint-controller.ts` 2133 satır — W2 (perf) ve W5 (god object) ikisi de rapor etmiş olabilir
- Task dependency parsing eksikliği — W3 (reliability) ve W5 (architecture) ikisi de yakalamış olabilir
- Plugin sandbox güvenliği — W1 (security) ve W4 (customization) ikisi de işlemiş olabilir

Bu cross-cutting bulguları ayrı bir tabloda listele — bunlar en yüksek öncelik çünkü birden fazla boyutu etkiliyor.

### Adım 5 — Priority matrisi ve Sprint 133+ roadmap

Tüm bulguları CRITICAL/HIGH/MEDIUM/LOW olarak sınıflandır. CRITICAL ve HIGH olanlar Sprint 133 adayı. MEDIUM Sprint 134+. LOW biriktirme listesi.

**Sprint 133 önerisi** (şimdilik tahmin — gerçek kapsam retrospektif sonrası Alperen tarafından belirlenecek):
- Muhtemelen yük testi (mevcut kararla)
- PLUS: bu audit'ten çıkan en kritik 3-5 düzeltme
- Bir tahmin sunulmalı ama nihai kapsam Alperen kararı olarak işaretlenmeli

### Adım 6 — FINAL-EXECUTIVE-REPORT.md şablonu

```
# Sprint 132 — Full 360° Enterprise Readiness Audit — FINAL EXECUTIVE REPORT

**Date:** 2026-04-10
**Sprint:** 132
**Scope:** Static audit, zero code change
**Workers:** W1 (Security+Multi-Tenancy), W2 (Performance+Scalability), W3 (Reliability), W4 (Customization), W5 (Architecture), W6 (Competitive)

## 1. Executive Summary
(8-12 cümle. Enterprise-readiness posture genel skoru. En kritik 3 bulgu. Genel verdict: READY / NEEDS-WORK / NOT-READY.)

## 2. Per-Worker Summaries
### W1 — Security & Multi-Tenancy
(W1 raporunun Executive Summary'si + link: docs/audits/sprint-132/W1-security-multi-tenancy.md)

### W2 — Performance & Scalability
...

### W3 — Reliability
...

### W4 — Customization
...

### W5 — Architecture & Consistency
...

### W6 — Competitive Positioning
...

## 3. Aggregate Metrics
| Worker | Files Scanned | Findings (Total) | CRITICAL | HIGH | MEDIUM | LOW |
|--------|---------------|------------------|----------|------|--------|-----|
| W1 | ... | ... | ... | ... | ... | ... |
| W2 | ... | ... | ... | ... | ... | ... |
| W3 | ... | ... | ... | ... | ... | ... |
| W4 | ... | ... | ... | ... | ... | ... |
| W5 | ... | ... | ... | ... | ... | ... |
| W6 | ... | ... | ... | ... | ... | ... |
| **Total** | **...** | **...** | **...** | **...** | **...** | **...** |

## 4. Cross-Cutting Findings
| # | Category | Workers | Description | Combined Severity | Why It Matters |
|---|----------|---------|-------------|-------------------|----------------|
| 1 | GodObject+Perf | W2, W5 | sprint-controller.ts 2133 satır | HIGH | ... |

## 5. Top 10 Most Critical Findings (Prioritized)
| Rank | Finding | Severity | Source Worker | Estimated Effort | Sprint Target |
|------|---------|----------|---------------|------------------|---------------|
| 1 | ... | CRITICAL | W1 | ... | 133 |

## 6. Enterprise-Readiness Score (Alperen'in 6 Eksenine Göre)
| Axis | Score (1-5) | Evidence | Gap |
|------|-------------|----------|-----|
| Güvenli | X/5 | W1 findings | ... |
| İzole (Multi-tenancy) | X/5 | W1 findings | ... |
| Hızlı | X/5 | W2 findings | ... |
| Bugsuz | X/5 | W3 findings | ... |
| Ölçeklenebilir | X/5 | W2+W5 findings | ... |
| Customize | X/5 | W4 findings | ... |
| **Overall** | **X/5** | - | - |

## 7. Competitive Posture (W6 özet)
(Deckent vs Devin / OpenHands / Cursor / Copilot Cowork — 1 paragraf)

## 8. Sprint 133+ Roadmap Önerisi
### Sprint 133 (Proposed)
- Yük testi (önceden planlanmış)
- CRITICAL bulgu #1: ...
- CRITICAL bulgu #2: ...
- CRITICAL bulgu #3: ...

### Sprint 134+
- HIGH bulgular
- Cross-cutting refactor'lar

### Backlog
- MEDIUM ve LOW bulgular

**NOT:** Bu roadmap W7'nin analitik önerisidir. Nihai sprint kapsamı Alperen kararı.

## 9. Methodology Validation
- Tüm 6 worker paralel çalıştı
- Hiçbir worker kod değiştirmedi (git diff src/ boş)
- W7 self-polling ile diğerlerini bekledi
- (Eğer herhangi bir worker NO_GO ise burada belirt)

## 10. Appendix
- Raw reports: docs/audits/sprint-132/W{1..6}-*.md
- Result files: .tasks/task-132-00{1..6}.result
```

### Adım 7 — Doğrulama ve result yazımı

FINAL dosyayı yazdıktan sonra:
1. `wc -l docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` → ≥ 300 satır olmalı
2. Tüm 10 heading var mı kontrol et
3. `.tasks/task-132-007.result` yaz: `selfAssessment: "DONE"`, `filesChanged: ["docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md"]`, `testsPassed: true` (değişmedi), `notes: "static audit reducer — polled 6 workers, synthesized final report. [özet]. verify skipped — no code changes."`

**Kod değiştirme. Src dokunma.** Worker polling dışında hiçbir bash komutu çalıştırma (sadece cat, grep, ls, wc, jq okuma için). **`tsc` ve `vitest` çalıştırma.**

**Kanıt:**
- `ls docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` → var
- `grep "^# Sprint 132" docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` → var
- `grep "^## 1. Executive Summary" docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` → var
- `grep "^## 4. Cross-Cutting Findings" docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` → var
- `grep "^## 6. Enterprise-Readiness Score" docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` → var
- `grep "^## 8. Sprint 133+ Roadmap" docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` → var
- `wc -l docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` → ≥ 300 satır
- `git diff --stat src/ tests/` → boş
- `git diff --stat docs/audits/sprint-132/` → 7 dosya eklendi (W1-W6 + FINAL)

**Test:** FINAL rapor yazıldı, 10 zorunlu heading içeriyor, ≥ 300 satır, diğer 6 worker'ın `.md` dosyalarına link içeriyor, git diff src/ tests/ temiz.

---

## Quality Rules

1. **SIFIR KOD DEĞİŞİKLİĞİ** — Bu sprint tamamen statik audit. Hiçbir worker src/, tests/, .contracts/, .brain/, package.json dosyalarını değiştirmez. Tek yazma alanı `docs/audits/sprint-132/`.

2. **Her worker kendi `.md` dosyasını yazar** — Dosya çakışması yasak. W1 → `W1-security-multi-tenancy.md`, W2 → `W2-performance-scalability.md`, W3 → `W3-reliability.md`, W4 → `W4-customization.md`, W5 → `W5-architecture-consistency.md`, W6 → `W6-competitive-positioning.md`, W7 → `FINAL-EXECUTIVE-REPORT.md`.

3. **W7 diğer worker'lar bitmeden bitiremez** — Self-polling wait loop zorunlu. 30s interval, max 90 iterasyon (45 dk). Timeout olursa NO_GO ile kısmi rapor üret.

4. **Standart şablon disiplini** — W1-W6 için yedi zorunlu heading: Executive Summary, Methodology, Findings, Metrics, Evidence, Recommendations, Context7 References. W7'nin birleştirme işi bu standartlaşmaya dayanıyor.

5. **Minimum uzunluk** — W1-W6 raporları ≥ 150 satır, FINAL rapor ≥ 300 satır. Findings tablosunda en az 10 satır (W1-W6 için).

6. **Evidence zorunlu** — Her bulgu için dosya:satır referansı. Referans yoksa bulgu tabloya girmez.

7. **Severity tutarlılığı** — CRITICAL / HIGH / MEDIUM / LOW / INFO. Beş seviye dışına çıkma.

8. **Context7 opsiyonel ama önerilen** — Kullanıldıysa References bölümünde link/citation zorunlu.

9. **Yük testi YOK** — Sprint 133'e ertelendi. Hiçbir worker benchmark, load test, chaos test çalıştırmayacak. Sadece statik okuma.

10. **`npx tsc --noEmit` ve `npx vitest run` — ÇALIŞTIRILMAYACAK.** Bu audit kod değiştirmiyor. Mevcut test suite'i etkilenmiyor. Worker sonunda verify loop'u skip edecek — result notes'ta "static audit, verify skipped — no code changes" belirtsin. `testsPassed: true` yazılabilir (gerçekten değişmedi).

11. **Git hygiene** — Sprint sonunda `git diff --stat src/ tests/ .contracts/ .brain/ package.json` tamamen boş olmalı. Tek değişiklik `docs/audits/sprint-132/` altında 7 yeni dosya.

12. **Paralelizasyon güvenliği** — W1-W6 paralel çalışır; dosya çakışması yok (her biri farklı `.md`). W7 aynı anda spawn olur ama self-polling nedeniyle son biter.

---

## Doğrulama (Sprint Tamamlandıktan Sonra Manuel Kontrol)

Alperen sprint sonunda şu adımları elle çalıştırır:

1. **Dosya envanteri**
   ```
   ls -la docs/audits/sprint-132/
   ```
   Beklenen: 7 `.md` dosyası (W1-W6 + FINAL-EXECUTIVE-REPORT)

2. **Kod değişikliği olmadığını doğrula**
   ```
   git status
   git diff --stat src/ tests/ .contracts/ .brain/ package.json
   ```
   Beklenen: src/tests/contracts/brain/package.json altında SIFIR değişiklik

3. **Her raporun heading disiplinini kontrol et**
   ```
   for f in docs/audits/sprint-132/W{1..6}-*.md; do
     echo "=== $f ==="
     grep "^## " "$f"
   done
   ```
   Beklenen: Her dosya en az yedi standart heading içermeli

4. **FINAL raporun bütünlüğünü kontrol et**
   ```
   grep "^## " docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md
   wc -l docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md
   ```
   Beklenen: 10 heading, ≥ 300 satır

5. **Cross-cutting findings FINAL'de var mı**
   ```
   grep -A 5 "^## 4. Cross-Cutting Findings" docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md
   ```
   Beklenen: En az 3 cross-cutting satır

6. **Enterprise-readiness skoru var mı**
   ```
   grep -A 10 "^## 6. Enterprise-Readiness Score" docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md
   ```
   Beklenen: 6 eksen + overall satırı

7. **Result dosyalarını kontrol et**
   ```
   for n in 001 002 003 004 005 006 007; do
     echo "=== task-132-$n.result ==="
     cat .tasks/task-132-$n.result | jq '.selfAssessment, .filesChanged'
   done
   ```
   Beklenen: 7 dosya, hepsinde DONE (veya en fazla 1 GO_WITH_TECH_DEBT)

8. **Sprint retro**
   ```
   deckent retro
   ```
   Beklenen: RETRO.md'de 7 worker için özet; W7'nin self-polling süresi raporlanmış olmalı

Eğer bu 8 kontrol geçerse Sprint 132 **GO**. Aksi halde eksik worker(lar) için tek-task re-run.
