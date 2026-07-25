# Orphan Deliverables Sweep — 2026-07 (Sprint 374, Task 374-004)

> **Live delta — 2026-07-25:** Bu rapordaki 85 sayısı Sprint 374 tarihsel
> snapshot'ıdır. Fail-loud live scanner bugün 83 orphan raporluyor:
> `src/core/provider-authority-composition.ts` ve
> `src/providers/claude-provider-evidence-sources.ts`,
> `src/providers/provider-authority-runtime-bootstrap.ts` üzerinden production
> call-graph'ına bağlandı; bu bootstrap Goal-v2 autonomous startup tarafından
> tüketiliyor. Bu not wiring kanıtıdır; provider reachability, production key
> provisioning veya default-enable kanıtı değildir.

> **Kapsam:** `src/**/*.{ts,tsx}` (`src/dashboard/` hariç — ayrı bundler-resolution alt-proje,
> kendi tsconfig/test sistemi var; bkz. `docs/audits/sprint-171/02-concern/01-dead-code.md`
> emsali). **844 aday dosya** tarandı, importer evreni **repo-genelinde `tests/` hariç**
> (`src/**` + `scripts/**`, 1036 dosya). **85 orphan** bulundu (aday dosyanın hiçbiri repo'nun
> production tarafından — test'ler ayrı sayıldı — import edilmiyor).
> **Yöntem:** düz import-grep (ts-morph yok) — bkz. `tests/governance/orphan-deliverables.test.ts`
> içindeki `walkSourceFiles` / `extractRelativeImportSpecifiers` / `resolveRelativeImport` /
> `findOrphanFiles`. Her bulgu ayrıca (a) `tests/**` import taraması, (b) tekil export-sembol
> repo-geneli grep'i, (c) ilgili dosyaların başlık yorumları okunarak çapraz-doğrulandı (bkz.
> §5 Yöntem Notları — bir kaç yanlış-pozitif bu ikinci geçişte elendi).

## 1. Özet Sayılar

| Kategori | Sayı | Anlamı |
|---|---:|---|
| Toplam orphan | **85** | Repo-genelinde (testler hariç) hiçbir production dosyası import etmiyor |
| **kasıtlı** | 5 | Tasarım gereği import edilmez (entry-point / subprocess-target / gated public API) |
| **gerçek-orphan** | 11 | Gerçekten ölü — bağlama değil, SİL veya birleştir kararı gerekir |
| **follow-up-öneri** | 69 | Gerçek implementasyon + test var, ama production call-graph'ına hiç bağlanmamış — bu task'ın avladığı asıl desen |

**En çarpıcı bulgu:** 85 orphan'ın **69'u (%81)** tamamen ölü kod DEĞİL — hepsinin çalışan bir
implementasyonu ve testi var (`tests/**` altında en az 1 import), ama hiçbiri `src/cli`, `src/api`,
`src/orchestra`'nın gerçek sprint-pipeline'ı veya `src/mcp`'den çağrılmıyor. Bu tam olarak
DIRECTIVES'te tarif edilen "3 kez yaşanan desen"in (ölü-endpoint, orphan-kart, pool-görünmez
katalog) dosya-seviyesinde sistemik bir tekrarı: **teslim edilmiş, test edilmiş, ama asla
"wire" edilmemiş modüller.**

## 2. kasıtlı (5) — Tasarım Gereği Import Edilmeyenler

| Dosya | Neden kasıtlı |
|---|---|
| `src/cli/entry.ts` | `package.json` `bin.deckent` → `dist/cli/entry.js`; process entry point, doğası gereği hiçbir src dosyası import etmez |
| `src/mcp/server.ts` | `package.json` `bin["deckent-mcp"]` → `dist/mcp/server.js`; process entry point |
| `src/index.ts` | `package.json` `main`/`exports["."]` → `dist/index.js`; npm paketinin dış-tüketici public yüzeyi, iç src tarafından import edilmesi beklenmez |
| `src/sdk/index.ts` | Header, `package.json`'da henüz bir `"./sdk"` exports alt-yolu YOK olduğunu ve export'ların "Alperen'in onayını bekleyerek kasıtlı eklenmediğini" belirtiyor — planlı, gate'li bir public-surface, follow-up değil |
| `src/agents/http-agentic-worker.ts` | Statik import değil, **subprocess spawn target**: `src/providers/openai-compatible.ts:91` ve `src/providers/openrouter.ts:95` `new URL('../agents/http-agentic-worker.js', import.meta.url)` ile `node` alt-süreci olarak çalıştırıyor (Ollama adapter'ıyla aynı desen). Statik import-grep bu deseni yakalayamaz — bilinçli mimari, dist-tüketilen bir "entry point" |

## 3. gerçek-orphan (11) — Gerçekten Ölü, Bağlama Değil SİL/Birleştir Kararı Gerekir

| Dosya | Kanıt | Öneri |
|---|---|---|
| `src/agents/auditor.ts` | 13 satırlık re-export shim (`enforceAdrCompliance` ↔ `../orchestra/authority-enforcer.js`). 0 test, 0 caller — tüketiciler (`sprint-phases.ts` vb.) doğrudan `authority-enforcer.ts`'den import ediyor, shim hiç kullanılmıyor | SİL |
| `src/agents/prompt-ab-test.ts` | Header: "re-export stub… Backward-compatible re-export from the unified prompt-analytics module." 0 production caller | SİL (veya gerçekten backward-compat gerekiyorsa gerekçesini `docs/reference/dependencies.md` tarzı bir nottan geçir) |
| `src/agents/prompt-metrics.ts` | Aynı desen — `prompt-analytics.ts`'in re-export stub'ı, 0 caller | SİL |
| `src/core/agent-selector.ts` | `src/core/routing-engine.ts:3` açıkça: `"Replaces selectAgent() + selectSkills() with a unified, intent-based decision."` V1 mekanizma, V2'ye geçişten sonra hiç çağrılmıyor (yalnız kendi testinde) | ADR-G-006 V1→V2 routing migration'ın parçası olarak SİL kararı — routing dispose zaten V2'de tamamlanmış görünüyor, bu sadece unutulmuş artık |
| `src/core/config-validator.ts` | Tüm dosya 6 satır: `export { validateConfig, ConfigValidationError, validatePartialConfig, DEFAULT_TIMEOUT_CONFIG } from './config.js';` — 0 test, 0 caller; her yerde doğrudan `config.js`'den import ediliyor | SİL |
| `src/core/token-counter.ts` | `TokenCounter` class + 4 tip export ediyor; `grep -rn "\bTokenCounter\b" src` → yalnız tanım satırı (0 kullanım, sembol adıyla bile). **Farklı** bir dosya olan `src/orchestra/token-counter.ts` (result-collector.ts tarafından aktif kullanılan) bu isim/alan çakışmasının kaynağı — core/ sürümü muhtemelen daha eski, hiç bağlanmamış bir tahmin-katmanı | KORU+DOC (eğer context-budget tahmini roadmap'te varsa) veya SİL — karar Brain/Alperen'e |
| `src/core/rate-limiter.ts` | `TenantRateLimiter` — Sprint 211 (211-007) F4 enterprise-hardening scaffold'ı. **İki farklı dosyada** (`src/core/provider-failure-classifier.ts:48`, `src/orchestra/sprint-phases.ts:2371`) geçen yorum: *"a KES task deleting `rate-limiter.ts`"* (sprint-324) — yani 50 sprint önce SİLİNMESİ planlanmış/denenmiş bir modül, hâlâ duruyor. 1 test var ama 0 production caller | Sprint-324 KES/FIX zincirini `deckent recall "rate-limiter sprint-324"` ile ara, silinmiş sayılıp sayılmadığını netleştir, sonra kesin SİL |
| `src/mcp/helpers/index.ts` | Barrel (`enrichResponse` vb. re-export). 0 test, 0 caller — gerçek tüketiciler `mcp/helpers/enrich.js` / `format.js`'den DOĞRUDAN import ediyor (ayrıntı: bir ilk-geçiş yanlış-pozitif burada `mcp/tools/index.ts`'i bu dosyayla karıştırdı — path-precise doğrulamada elendi, bkz. §5) | SİL (barrel hiç kullanılmıyor) |
| `src/orchestra/managed-docs/index.ts` | Aynı desen — `managed-docs/` barrel'i, 0 test, 0 caller; gerçek tüketiciler (`sprint-docs-updater.ts`, `mcp/tools/docs.ts`) doğrudan `managed-doc-runner.ts` / `docs-config.ts`'den import ediyor | SİL |
| `src/orchestra/monitor-adapter.ts` | 289 LoC — `MonitorAdapter` interface + 3 implementation class + factory. **Bu tam olarak `docs/audits/sprint-171/02-concern/01-dead-code.md` §1.5.1'de 2026-05-15'te "SİL" önerisiyle flag'lenmiş modül** — 2 ay / ~200 sprint sonra hâlâ temizlenmemiş. `createMonitorAdapter` grep → yalnız tanım | ADR-038 dispose kararını uygula, artık SİL |
| `src/cli/repl/ink-probe.tsx` | Header: `"Ink build-integration probe (Sprint 224 — Ink migration de-risk)."` — tek işi Ink build-zincirinin çalıştığını KANITLAMAKTI; bu görev 150 sprint önce tamamlandı. 0 test, 0 caller, `package.json` script'lerinde hiç referans yok | Görev tamamlandı — SİL |

## 4. follow-up-öneri (69) — Teslim + Test Var, Wire Yok

Aşağıdaki 69 dosyanın **hepsi** derlenen, tutarlı bir implementasyona ve en az 1 teste sahip,
ama `src/cli`, `src/api`, `src/orchestra`'nın gerçek sprint-pipeline'ı veya `src/mcp`'den
**hiç çağrılmıyor**. Okunabilirlik için tema kümelerine ayrıldı; her kümenin altında kısa bir
ortak-payda notu var. Kümeleme, aynı follow-up kararının bir grup dosyayı birden kapsayabileceğini
göstermek içindir — **bağlama/silme kararı bu task'ın kapsamı dışında** (yalnız keşif+pin).

### 4.1 Global-Install Ailesi (7) — Aktif P0 Yönle Örtüşüyor
`src/core/global-config.ts`, `global-store.ts`, `credentials.ts`, `credentials-per-project.ts`,
`auth-session.ts`, `state-paths.ts`, `interaction-policy.ts`.
`global-store.ts` header'ı açıkça **"Intentionally UNWIRED… migrating those owner modules onto
GlobalStore is separate, future work"** diyor ve `docs/design/onb-global-install.md` (mevcut
dosya) §4/§6'ya işaret ediyor. Bu, CLAUDE.md'deki pinned P0 madde **"global-install+proje-scope"**
ile birebir örtüşüyor — yani bu küme rastgele ölü kod değil, **halihazırda planlanmış, dokümante
edilmiş, sıralaması bekleyen** bir iş parçası. Follow-up: global-install WIRE sprint'i bu 7
dosyayı tek seferde entegre etme kapsamına almalı.

### 4.2 Model-Catalog Kümesi (5) — Muhtemel "pool-görünmez-katalog" Deseninin Tekrarı
`src/core/catalog/catalog-registry.ts` (küme başı — `register/sync/get/getAll`),
`local-static-source.ts`, `models-dev-source.ts`, `openrouter-source.ts`, `cache-archetype.ts`.
Bu 5 dosya birbirini `types.js`/`catalog-source.js` üzerinden referanslıyor (tutarlı bir alt-sistem)
ama **küme başı `catalog-registry.ts` hiçbir yerden import edilmiyor** → tüm alt-sistem
production'a hiç bağlanmamış. DIRECTIVES'in bahsettiği "pool-görünmez-katalog" tam olarak bu
şekle benziyor — isim benzerliği tesadüf olmayabilir, önceki bir sprint'te kısmen çözülmüş olan
"katalog" sorununun bu kez `core/catalog/` alt-dizininde yeniden ortaya çıkmış hali olabilir.
Follow-up: bu kümenin `model-registry.ts`/`model-catalog.ts` ile ilişkisi netleştirilip ya
`catalog-registry.ts` gerçek çağıran koda bağlanmalı ya da eski/deneysel olduğu dokümante edilip
SİL kararı alınmalı.

### 4.3 Cache-Adapter Çifti (2)
`src/providers/cache-adapter.ts` (4 archetype implementasyonu: Implicit/Explicit/LocalKv/None),
`cache-adapter-resource.ts` (Archetype-C). `cache-archetype.ts`'i import ETMİYORLAR (kendi tip
sözleşmelerini ayrı tutmuşlar) — yani §4.2'nin bir parçası değil, ayrı bir follow-up.

### 4.4 Marketplace + Notification (5)
`src/core/marketplace/dependency-resolver.ts`, `rating-system.ts`,
`src/core/notification-config.ts`, `notification-providers/discord.ts`, `notification-providers/slack.ts`,
`src/core/provider-capabilities.ts`. Skill-marketplace ve bildirim-kanalı alt-sistemleri — her
biri kendi başına tutarlı ama hiçbiri CLI/API/orchestra tarafında somutlaşmamış.

### 4.5 TOOL-REG / TOOL-CU / TOOL-SCOPE Dilimleri (7)
`src/core/tool-availability.ts` ("TOOL-REG slice 1"), `tool-schema-override.ts` ("TOOL-REG-2"),
`tool-shadow-policy.ts`, `tool-scope-gate.ts` ("TOOL-SCOPE"), `computer-use-exec.ts` ("TOOL-CU
dilim-3"), `spawn-safety.ts` (ADR-006), `lazy-loader.ts`. Bunlar aynı büyük "tool registry
refactor" girişiminin ardışık dilimleri — her biri kendi sprint'inde teslim edilmiş ve test
edilmiş ama zincirin son halkası (gerçek tool-dispatch/registry'ye seeding) hiç gelmemiş.

### 4.6 Approval / Nervous Ailesi (6)
`src/core/approval-expiry-driver.ts`, `approval-fallback.ts`,
`src/connectors/approval-clients-wire.ts`, `approval-telegram.ts`,
`src/nervous/approval-actions.ts`, `ask-brain-escalation.ts`. Birkaçının header'ı **açıkça**
"wiring into those handlers is explicit follow-up work, outside this task's scope" diyor —
yani bu dosyaların yazarları zaten follow-up'ı öngörmüş, sadece takip task'ı hiç açılmamış/
kapatılmamış. En düşük belirsizlikli küme.

### 4.7 CLI Yardımcıları (9)
`src/cli/commands/agentic-session.ts`, `chat-status-line.ts`, `retro-formatter.ts`,
`src/cli/helpers/agent-templates.ts`, `chat-intent-executor.ts`, `hints.ts`, `output-mode.ts`,
`sprint-summary.ts`, `src/cli/repl/cursor-model.ts`. Her biri test edilmiş, bağımsız birer CLI
katmanı (repl status-line, cursor modeli, output-mode global state, session persistence vb.) ama
`src/cli/entry.ts`'in gerçek komut ağacına hiçbiri bağlanmamış.

### 4.8 VS Code Uzantısı — Hiç Paketlenmemiş 4-Dilimlik Prototip (2 + bağlam)
`src/extensions/vscode/src/deckent-panel.ts`, `panel-refresh.ts`. Bu iki dosya `rpc-bridge.ts` ve
`panel-data.ts` (bu ikisi orphan DEĞİL, çünkü birbirlerini import ediyorlar) ile birlikte 4
ardışık "dilim" (dilim-1 rpc-bridge → dilim-2 panel-data → dilim-3 panel-refresh, + deckent-panel)
oluşturuyor. Ama **hiçbirinde `vscode` paketi import edilmiyor, `activate()` fonksiyonu yok,
`src/extensions/vscode/` altında bir `package.json` (uzantı manifest'i) hiç yok**. Yani bu
komple alt-sistem şu ana kadar **gerçek bir VS Code uzantısı olarak hiç paketlenmemiş** — tek
tek dosya orphan'ı değil, bütün bir "teslim edilmiş ama entegre edilmemiş özellik" örneği.
Follow-up: extension manifest + `activate()` + gerçek `vscode.window.registerWebviewViewProvider`
bağlantısı — ya da özellik iptal edilmişse 4 dosya birlikte dispose kararı.

### 4.9 Orchestra Dağınık Dilimler (14)
`src/orchestra/autonomous/mission-store/mission-events.ts`, `brain-context.ts`,
`capability-realizer.ts` ("AS4-P1 integration point, default-off"),
`codex-spawn-readiness.ts` ("produces SUGGESTION, never touches spawn" — kasıtlı advisory-only
ama yine de hiç çağrılmıyor), `doc-updaters/metrics-updater.ts`, `multi-agent.ts`,
`output-collector.ts` ("TRN-1… config-gated training wire" — farklı bir `src/core/output-collector.ts`
zaten aktif kullanımda, isim çakışması var), `pattern-reader.ts`, `reconciler.ts`
(kendi header'ı "consumed by finalize summary & dashboard" diyor ama gerçek caller yok — doküman-kod
drift'i), `result-assembler.ts`, `spawn-backend-mock.ts`, `spawn-backend-subprocess.ts`,
`task-analyzer.ts`, `timeout-watcher.ts` (`runtime_extension_enabled: false` ile kasıtlı
default-off — ama yine de bağlı değil).

### 4.10 Diğer (3)
`src/agents/cross-sprint-analyzer.ts`, `permission-guard.ts`, `prompt-evolution.ts`,
`src/api/rpc-write-handlers.ts` ("follow-up wiring" olarak açıkça not düşülmüş),
`src/connectors/identity/verify-bind.ts`, `src/monitor/alert-emitter.ts` ("Sprint 166 T9"),
`src/training/corpus-lint.ts` ("CLI-wiring is a follow-up task" — header'ın kendisi zaten
follow-up'ı itiraf ediyor).

## 5. Yöntem Notları — Elenen Yanlış-Pozitifler

İlk araştırma turunda, sembol-adı bazlı ikincil bir grep (path-resolution YAPMADAN, yalnız
`grep -rn "\bSymbolName\b"`) birkaç dosyayı yanlışlıkla "kullanılıyor" gösterdi — hepsi
**aynı-basename-farklı-dizin** çakışmasıydı (ör. `src/mcp/tools/index.ts` ile
`src/mcp/helpers/index.ts`, ya da `src/core/output-collector.ts` ile
`src/orchestra/output-collector.ts` — iki farklı dosya, aynı ad). Path-precise resolution
(`resolveRelativeImport` — `dirname(fromFile)` + specifier'ı gerçekten çözüp `existsSync` ile
doğrulayan yöntem, ki bu governance testindeki YÖNTEMİN TA KENDİSİ) bu yanlış-pozitifleri
elemek için tekrar tekrar kullanıldı (bkz. §3'teki `mcp/helpers/index.ts` notu). **Ders:** bir
dosyanın "kullanılıp kullanılmadığını" kontrol ederken salt isim-grep'i YETERSİZ VE YANILTICI —
tam yol çözümlemesi şart. Bu, governance testinin neden ts-morph olmadan da path-aware bir
resolver içermesi gerektiğinin kanıtı.

Ayrıca doğrulandı: `src/` altında **hiçbir computed/template-literal dynamic import**
(`import(\`...${x}...\`)` biçimi) yok — yani statik `from`/`import('...')` taraması, bu repo için
"gizli" bir çalışma-zamanı yükleme mekanizmasını (plugin-registry tarzı string-key'den dosya
yükleme) atlamıyor. Tek atladığı meşru desen **subprocess-spawn hedefleri**
(`new URL(...)` + `node` spawn — bkz. §2 `http-agentic-worker.ts`), ve o da elle tek tek
doğrulandı.

## 6. Bu Task'ın Sınırı (NO-GO Notu)

Bu task yalnızca **keşif + pin**tir. Yukarıdaki 85 bulgunun hiçbiri bu task kapsamında
bağlanmadı, silinmedi veya değiştirilmedi — `tests/governance/orphan-deliverables.test.ts`
mevcut 85'i bir allowlist ile pinliyor (bkz. o dosyanın başlığı): yeni bir orphan eklenirse test
sesli kırılır (regression sinyali); listedeki bir dosya bağlanır/silinirse allowlist'ten
çıkarılması gerekir (test o zaman da kırılır — "artık orphan değil" sinyali, gap'in kapandığını
kanıtlar). §3 ve §4'teki öneriler **Brain'in gelecekteki sprint planlama girdisidir**, bu task'ın
kendisi tarafından uygulanmamıştır.
