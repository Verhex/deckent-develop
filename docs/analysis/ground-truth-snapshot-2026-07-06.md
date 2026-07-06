# Deckent Ground-Truth Snapshot — 2026-07-06

Kaynaklar: `docs/MASTER-PLAN.md`, `.analysis/hermes-vs-deckent-analysis.md`,
`.analysis/hermes-vs-deckent-direction-decisions.md`,
`.analysis/paperclip-vs-deckent-comparison.md`, repo genelindeki proje-yazımı
`.md` dosyaları, `src/`, `tests/`.

Amaç: plan/analiz dokümanlarındaki iddiaları kod tabanı ile ayırmak. Bu dosya
SSOT değil; docs yenileme borcunu kapatırken kullanılacak doğrulama defteridir.

## Özet

Son 350-372 bandında en büyük gerçek ilerleme terminal, approval, tool-surface,
training trace, provider/cost ve eval/honesty zincirinde. `MASTER-PLAN` bu yeni
işleri büyük ölçüde yakalamış, fakat `docs/adr/`, `docs/architecture/`,
`docs/vision/` ve eski audit/analysis dosyalarının bir kısmı halen eski
"roadmap/unwired/yok" hükümlerini taşıyor.

Kısa hüküm:

| Alan | Kod tabanı durumu | Doküman riski |
|---|---|---|
| Terminal shell | Büyük ölçüde gerçek; bazı kararlar halen gate/ADR bekliyor | ADR-G-034 ve eski terminal docs stale |
| Runtime approval | Broker/store/policy/gate/relay/history gerçek; bazı pack'ler hala broker wire'ına bağlı | Eski ADR/design metinleri "roadmap" diyor |
| Tool progressive disclosure | Search/describe/plan gerçek; REPL meta-tools flag-gated; real call exec seam'i üretimde fail-closed | "call" kelimesi abartılmamalı |
| TrainingTrace | Worker + native REPL + extractor + pipeline gerçek; default-off/local | Eski Hermes analizindeki 0-caller hükmü stale |
| Paperclip enterprise kazanımları | Secrets ve tenant tarafı kısmi ilerledi; budget/portability/plugin hala açık | Paperclip analizi eski "vault yok" hükmünü düzeltmeli |
| Docs | Yeni feature docs var ama üst mimari docs ve ADR enforcement notları güncel değil | Yüksek |

## Doğrulanan İşler

### Terminal

Gerçek kod karşılıkları:

| İş | Kod/test kanıtı | Durum |
|---|---|---|
| Health snapshot | `src/cli/helpers/health-snapshot.ts`, `tests/cli/session-warn.test.ts` | Gerçek |
| Live footer | `src/cli/helpers/live-footer.ts`, `src/cli/repl/app.tsx`, `tests/cli/repl-surface-wire.test.tsx` | Gerçek; `repl_surface.enabled` ile yüzeye bağlanıyor |
| Ask / Run / Control | `src/cli/repl/term-mode.ts`, `tests/cli/term-mode.test.ts` | Gerçek |
| Golden flow | `src/orchestra/golden-flow.ts`, `tests/cli/messages-round8-keys.test.ts` | Gerçek çekirdek |
| Background-turn queue | `src/cli/repl/chat-turn-queue.ts`, `src/cli/repl/native-agent-bridge.ts`, `tests/cli/repl-surface-wire.test.tsx` | Gerçek |
| Kategorili registry / risk dili | `src/cli/command-registry.ts`, `tests/cli/command-registry.test.ts`, `docs/adr/adr-d-012-terminal-risk-language.md` | Registry gerçek; i18n/UI tamlığı karar borcu |
| Connect wizard | `src/cli/helpers/connect-wizard.ts`, `src/cli/commands/connect.ts`, `tests/cli/connect-auth-state.test.ts` | Gerçek |
| Resume picker | `src/cli/helpers/session-resume.ts`, `src/cli/repl/app.tsx`, `tests/cli/session-resume.test.ts` | Gerçek |
| Busy controls | `src/cli/repl/busy-controls.ts`, `src/cli/repl/app.tsx` | Gerçek |
| Simple mode | `terminal.simple_mode`, `tests/cli/term-simple-mode.test.ts` | Gerçek, default-off |
| NL dispatch | `src/cli/commands/chat-native.ts`, `src/connectors/chat-bridge.ts`, `docs/design/nl-dispatch-default-decision.md`, `docs/adr/adr-d-013-nl-dispatch-default.md` | Mekanizma gerçek; default kararı Alperen kapısı |

Not: `docs/adr/adr-g-034-native-agentic-terminal.md` halen bazı delivered
parçaları "roadmap" olarak anlatıyor. Bu ADR'nin enforcement/status paragrafı
amend edilmelidir.

### Approval

Gerçek kod karşılıkları:

| İş | Kod/test kanıtı | Durum |
|---|---|---|
| Approval contract | `src/core/approval-contract.ts` | Gerçek |
| Broker core | `src/core/approval-broker.ts`, `tests/integration/approval-chain.test.ts` | Gerçek |
| Durable store | `src/core/approval-store.ts` | Gerçek |
| Policy | `src/core/approval-policy.ts`, `src/core/approval-rules-load.ts` | Gerçek |
| Fallback | `src/core/approval-fallback.ts` | Gerçek |
| Worker gate | `src/core/approval-worker-gate.ts`, `tests/agents/workergate-wire.test.ts` | Gerçek; flag/policy ile kullanılmalı |
| Relay + event stream | `src/core/approval-relay.ts`, `src/core/approval-eventstream.ts` | Gerçek |
| Terminal card | `src/cli/repl/approval-card.tsx`, `tests/cli/approval-card.test.tsx`, `tests/cli/app-approval-wire.test.tsx` | Gerçek |
| Cross-process feed | `src/core/approval-store-watch.ts`, `src/cli/repl/run.tsx`, `tests/cli/repl/approval-xproc-wire.test.ts` | Gerçek |
| Dashboard/API history | `src/api/approval-history-endpoint.ts`, `src/api/server.ts`, `src/dashboard/src/components/ApprovalHistoryPanel.tsx`, `tests/api/approval-history-wire.test.ts`, `tests/e2e/serve-endpoints-smoke.test.ts` | Gerçek |
| Nervous bridge | `src/nervous/approval-bridge.ts`, `src/nervous/approval-actions.ts` | Gerçek ama mode/config bağları ayrıca doğrulanmalı |

Not: `docs/design/tool-cu-pack.md` gibi bazı tasarım dosyaları ApprovalBroker'ı
"başlamadan önce gereken P0" olarak anlatıyor. Bu doğru cümle artık "bu pack'in
kendi browser/computer-use execution wire'ı broker'a bağlanmalı" diye
daraltılmalı.

### Tool Surface

Gerçek kod karşılıkları:

| İş | Kod/test kanıtı | Durum |
|---|---|---|
| Core tool registry | `src/core/tool-registry.ts`, `tests/core/tool-registry.test.ts` | Gerçek katalog, execution yok |
| Progressive search/describe/plan | `src/core/tool-search.ts`, `tests/core/tool-search.test.ts` | Gerçek |
| Eager core surface | `src/core/tool-core.ts`, `tests/core/tool-core.test.ts` | Gerçek |
| REPL meta-tools | `src/cli/repl/native-tool-registry.ts`, `tests/cli/native-tool-registry.test.ts` | Gerçek; `tool_surface.enabled` ile flag-gated |
| Availability cache/toolsets | `src/core/tool-availability.ts`, `tests/core/tool-availability.test.ts` | Gerçek |
| Schema override | `src/core/tool-schema-override.ts`, `tests/core/tool-schema-override.test.ts` | Gerçek |
| Shadow policy | `src/core/tool-shadow-policy.ts`, `tests/core/tool-shadow-policy.test.ts` | Gerçek |
| Trust catalog/render | `src/core/tool-catalog.ts`, `src/cli/helpers/catalog-render.ts`, `tests/core/tool-catalog.test.ts`, `tests/cli/catalog-render.test.ts` | Gerçek |

Kısıt: `deckent_call_tool` üretimde gerçek `execImpl` verilmezse fail-closed
ediyor. Bu iyi bir güvenlik davranışı ama docs'ta "call" yüzeyi anlatılırken
"plan/risk-gate hazır, production execution seam takip işi" ayrımı korunmalı.

### Training Trace

Gerçek kod karşılıkları:

| İş | Kod/test kanıtı | Durum |
|---|---|---|
| Trace recorder | `src/agent/trace-recorder.ts`, `tests/agent/trace-recorder.test.ts` | Gerçek |
| Sprint-worker trace wire | `src/orchestra/output-collector.ts`, `tests/orchestra/trn1-sprint-trace-wire.test.ts` | Gerçek; `training_trace.enabled` default-off |
| Native REPL trace wire | `src/cli/repl/trace-wire.ts`, `src/cli/repl/run.tsx`, `tests/cli/trace-wire.test.ts`, `tests/cli/trn2-repl-trace-wire.test.ts` | Gerçek; native path + `DECKENT_TRACE=0` opt-out |
| CC extractor | `src/training/cc-trace-extractor.ts`, `src/cli/commands/trace-extract.ts`, `tests/training/cc-trace-extractor.test.ts` | Gerçek |
| ShareGPT/compressor pipeline | `src/training/pipeline.ts`, `tests/training/trn4-pipeline.test.ts`, `tests/training/trn-pipe-label.test.ts` | Gerçek |

Not: Hermes karşılaştırmasındaki eski "0-caller / UNWIRED" hükmü artık yalnız
tarihsel bağlamdır; bugünkü docs bunu düzeltmeli.

### Paperclip Kaynaklı Enterprise Kazanımları

| Kazanım | Bugünkü Deckent durumu | Sonuç |
|---|---|---|
| Secrets vault | `src/core/credentials-per-project.ts` per-project AES-256-GCM + HKDF + AAD + atomic save gösteriyor; ayrıca legacy `.deck` secret sistemi var | Kısmi. Artık "vault yok/plaintext" mutlak hükmü yanlış; ama Paperclip seviyesinde binding-scoped provider vault + secret access audit yok |
| Scoped budget | `src/core/cost-gate.ts` pre-spawn sprint/per-request USD ve token ceiling yapıyor | Kısmi. Company/agent/project hiyerarşik hard-stop yok |
| Tenant isolation | `src/core/tenant-context.ts`, `src/core/memory-store.ts`, `strict_tenant_isolation` testleri var | Kısmi. Default strict değil; full multi-company plane yok |
| Config revision/rollback | `src/orchestra/rollback.ts`, upgrade rollback, prompt rollback gibi parçalar var | Kısmi/parçalı; Paperclip tarzı immutable runtime config revision yok |
| Company portability | Connector identity bundle testleri var; product-level company/template export-import yok | Açık |
| Out-of-process plugin isolation | Skill/agent pool + MCP var; capability-gated OOP plugin host yok | Açık |
| Webhook/routine security | notification/webhook ve autonomous reactive webhook parçaları var | Kısmi; HMAC/replay-window product contract ayrıca doğrulanmalı |

## Docs Borcu

Öncelikli güncelleme kuyruğu:

1. `docs/adr/adr-g-034-native-agentic-terminal.md`
   - Stale: progressive disclosure ve ApprovalBroker için "roadmap" dili.
   - Yeni gerçek: search/describe/plan + flag-gated REPL meta-tools; ApprovalBroker/terminal card/cross-process feed gerçek.

2. `docs/adr/adr-g-022-nervous-system.md`
   - Stale: approval unification "reader hub, broker değil" dili.
   - Yeni gerçek: `src/nervous/approval-bridge.ts` var; hangi yolların flag/default ile aktif olduğu ayrıca yazılmalı.

3. `.analysis/paperclip-vs-deckent-comparison.md`
   - Stale: "DK `.deck` plaintext, vault yok" mutlak hükmü.
   - Yeni gerçek: per-project encrypted credential store var; yine de Paperclip vault kapsamı tam değil.

4. `.analysis/hermes-vs-deckent-*.md`
   - Stale: TrainingTrace 0-caller hükmü.
   - Yeni gerçek: worker/native/extractor/pipeline wire edildi; default-off ve opt-out ayrımı yazılmalı.

5. `docs/architecture/*` ve `docs/vision/*`
   - Risk: yüksek seviyeli metrikler/sprint sayıları ve feature listeleri eski sprint bandında kalmış.
   - Aksiyon: generated reference check + elle güncellenecek "current product surface" sayfası.

6. Eski audit klasörleri (`docs/audits/last-standing-2026-06`, `docs/audits/doc-refresh-2026-06`)
   - Stale ama tarihsel değerli.
   - Aksiyon: "archive snapshot, not current ground truth" banner'ı veya index ayrımı.

## Markdown Envanteri ve Güncelleme İşleri

Bu turda iki sayı ayrıldı:

| Envanter | Sayı | Yorum |
|---|---:|---|
| Ham `.md` dosyası | 4699 | Vendor/cache/generated alanlar dahil; elle güncelleme kapsamı değil |
| `rg --files -g '*.md'` proje görünür alan | 959 | Güncelleme borcu için gerçek çalışma evreni |

Proje-yazımı dosyaların ana kümeleri:

| Kume | Dosya sayısı | Güncelleme işi | Öncelik |
|---|---:|---|---|
| `docs/audits/` | 434 | Tarihsel audit'lere "archive snapshot, current truth değildir" banner'ı ve index ayrımı ekle | P2 |
| `docs/superpowers/` | 125 | Spec/status dosyalarını current/accepted/obsolete olarak etiketle; bugünkü product surface'e taşınacak kararları ayır | P1 |
| `docs/core-memory/` | 135 | Hafıza export'larını kanıt kaydı olarak bırak; current docs'ta doğrudan SSOT gibi kullanılmasını engelle | P2 |
| `.codex/rules/` | 61 | Agent kuralları; yalnız drift varsa güncelle, docs sprintinde toplu rewrite yapma | P1 |
| `docs/analysis/` | 55 | Karşılaştırma/ground-truth delta kutuları ekle; Hermes/Paperclip stale iddiaları işaretle | P0 |
| `docs/adr/` | 50 | Delivered/future ayrımını güncelle; özellikle terminal, approval, nervous, tool surface | P0 |
| `docs/reference/` | 36 | Generated referansları check ile güncelle; elle metrik yazılan satırları generated kaynağa bağla | P0 |
| `docs/archive/` | 36 | Arşiv olduğunu açıklaştır; güncel iddia gibi linklenmesini azalt | P2 |
| `docs/guide/` + `docs/cookbook/` | 45 | Kullanıcı akışlarını bugünkü komut yüzeyine göre yenile: bare `deckent`, `do`, `chat`, `serve`, approval | P1 |
| `docs/features/` | 17 | `README.md` index'i dosyaların gerisinde: 16 feature dosyasından yalnız 7'sini listeliyor | P0 |
| `docs/architecture/` + `docs/vision/` | 12 | Sprint/metrik/feature cümlelerini güncelle veya generated bloklara bağla | P0 |
| `src/core/builtins/agents/` + `src/core/builtins/skills/` | 51 | Built-in prompt docs; davranış dokümanı değil, prompt contract olarak kalmalı | P1 |
| `deckent-hub/skills/` | 20 | Hub skill belgeleri; ürün docs'undan ayrı indexlenmeli | P2 |

### Stale Signal Register

| Dosya/aile | Bugünkü sinyal | Kod/doğrulama karşılığı | Aksiyon |
|---|---|---|---|
| `.analysis/paperclip-vs-deckent-comparison.md` | "`.deck` plaintext, vault yok" mutlak dili | `src/core/credentials-per-project.ts` per-project AES-256-GCM store gösteriyor | Başına 2026-07-06 delta kutusu ekle: "kısmi encrypted store var; Paperclip binding-scoped audited vault hala açık" |
| `.analysis/hermes-vs-deckent-analysis.md` | Training trace ve ApprovalBroker bölümleri tarihsel/roadmap dili taşıyor | `src/agent/trace-recorder.ts`, `src/cli/repl/trace-wire.ts`, `src/core/approval-broker.ts`, approval history API gerçek | "Eskiden" ve "bugün" ayrımı ekle |
| `.analysis/adr-095-terminal-first-pivot-draft.md` | `training-trace` için 0-caller/UNWIRED | Worker/native/extractor/pipeline wire edildi | Draft üstüne superseded/delta notu |
| `docs/adr/adr-g-034-native-agentic-terminal.md` | Tool disclosure, worker live trace, ApprovalBroker roadmap gibi kalıyor | Progressive tool search/describe/plan, REPL meta-tools, broker/card/xproc gerçek | Delivered/future matrisiyle amend |
| `docs/adr/adr-g-022-nervous-system.md` | Approval unification broker öncesi anlatı | `src/nervous/approval-bridge.ts`, `src/api/nervous-endpoint.ts` var | Nervous bridge aktiflik/default/config ayrımıyla güncelle |
| `docs/features/README.md` | Index 7 feature listeliyor | Klasörde 16 feature dosyası var | Index'i manifest/script ile senkronla |
| `docs/vision/roadmap.md`, `docs/vision/VISION*.md` | Sprint 285+, 34 MCP, ADR 89 gibi eski metrikler | `docs/reference/mcp-tools.md` 42 tool; `command-registry.ts` 77 entry; `IDENTITY.md` başka sayı söylüyor | Tek metrik kaynağı seç; elle sayı yazmayı azalt |
| `.deckent/workspace/IDENTITY.md`, `DECKENT.md`, generated reference | MCP tool sayısı 35/42/46 gibi ayrışıyor | `docs/reference/mcp-tools.md` generated tabloda 42 tool | Ground-truth script ile sayıları tekleştir |
| `docs/design/tool-cu-pack.md` | Browser/computer-use execution'ın approval wire'ı yok diyor | Core ApprovalBroker var; pack execution wire ayrı | Cümleyi daralt: "pack yürütücüsü broker'a bağlanmalı" |
| `docs/features/openrouter.md` | Eski "enabled unreachable/bootstrap path" riski olabilir | `src/providers/openrouter.ts`, `openrouter-probe`, provider registry ayrıca kontrol ister | Canlı config path ve default durumunu yeniden doğrula |

## Deckent Bugünkü Gücü ve Konumu

Kod tabanına göre Deckent bugün "dashboard'lu bir task runner" değil; terminal-first,
çok-yüzeyli, local-first agentic orchestration runtime. Güçlü olduğu yer
deterministik execution/governance/closed-loop learning; daha eksik olduğu yer
Paperclip tarzı tam enterprise secret vault, binding-scoped plugin isolation ve
company portability.

| Boyut | Bugün ne yapabilir | Nereden kullanılır | Kod/doğrulama | Olgunluk |
|---|---|---|---|---|
| Terminal-first çalışma | Bare `deckent` REPL, mode indicator, live footer, approval card, resume, busy controls | `deckent`, REPL slash commands | `src/cli/repl/*`, `src/cli/helpers/live-footer.ts`, `tests/cli/repl-surface-wire.test.tsx` | Gerçek, bazı yüzeyler flag-gated |
| Komut ve risk kataloğu | 77 registry entry; Core/Run/Memory/MCP/Enterprise/Danger ayrımı; TR risk dili | CLI, REPL, MCP metadata | `src/cli/command-registry.ts` | Gerçek; docs metrikleri güncellenmeli |
| MCP entegrasyonu | 42 generated MCP tool: run, status, memory, nervous, autonomous, cost, docs, audit, cleanup vb. | MCP clients, IDE/tool host | `docs/reference/mcp-tools.md`, `src/mcp/tools/` | Gerçek; tool count SSOT drift var |
| Runtime approval | Broker, durable store, policy, fallback, worker gate, terminal card, xproc feed, dashboard history | Terminal, worker, API/dashboard | `src/core/approval-*`, `src/api/approval-history-endpoint.ts` | Gerçek; bazı pack wire'ları ayrıca açık |
| Tool progressive disclosure | Search/describe/plan, availability, schema override, shadow policy, trust render | REPL meta-tools, core tool catalog | `src/core/tool-search.ts`, `src/cli/repl/native-tool-registry.ts` | Gerçek; production tool-call exec seam fail-closed |
| Training trace | Worker trace, native REPL trace, extractor CLI, ShareGPT/compressor pipeline | `deckent trace`, env/config flags | `src/agent/trace-recorder.ts`, `src/training/*`, `src/cli/repl/trace-wire.ts` | Gerçek; default-off/local |
| Memory/learning | SQLite FTS memory, recall/remember/memory, outcome/rule evolution, promotion data | CLI, MCP, API memory search | `src/core/memory-*`, `/api/memory/search` | Gerçek; docs'ta "current vs memory export" ayrımı lazım |
| Provider/model fleet | Claude, Codex, Gemini, Ollama, OpenAI-compatible, OpenRouter, Bedrock adapter katmanları | CLI/REPL/model registry, provider routing | `src/providers/*`, `src/core/model-registry.ts` | Gerçek; bazı provider'lar credential/live availability'ye bağlı |
| Cost/usage/limits | Token/cost tracking, budget gate, usage command, subscription limit probe | `deckent usage`, `deckent cost`, `/api/limits` | `src/core/cost-gate.ts`, `src/api/limits-endpoint.ts` | Gerçek; hiyerarşik company budget açık |
| Process/autonomous engine | Scheduled/one-off/reactive backlog, approvals, missions, process submit/status/result | CLI `process/autonomous`, API dashboard | `src/api/process-endpoint.ts`, `src/api/autonomous-endpoint.ts`, `src/api/missions-route.ts` | Gerçek; safe defaults/gates kritik |
| Dashboard/API observability | Status, sprint, tasks, workers, events SSE, output stream, KPI, docs health, approvals, terminal sessions | `deckent serve`, dashboard, HTTP API | `src/api/server.ts`, `src/api/*`, `src/dashboard/*` | Gerçek; dashboard izleme/operasyon yüzeyi |
| Enterprise controls | Tenant/RBAC/audit/rate endpoints, OIDC exchange, auth middleware, audit query | `/api/enterprise/*`, CLI `rbac`, config | `src/api/enterprise-endpoint.ts`, `src/api/auth.ts`, `src/core/tenant-context.ts` | Kısmi-gerçek; full multi-company plane değil |
| Secrets | Per-project encrypted credentials + legacy config secrets | Provider credential path, config | `src/core/credentials-per-project.ts` | Kısmi; binding-scoped audited vault açık |
| Integrations/gateway | Bot/gateway/gateway-runtime, reactive webhook, messaging artifacts | CLI, `/api/webhooks/*`, `/api/reactive/webhook` | `src/api/reactive-endpoint.ts`, connectors/gateway kodu | Gerçek parçalar var; security contract docs yenilenmeli |
| Governance/docs | ADR, DIRECTIVES, MASTER-PLAN, rule files, docs health | Repo docs, `deckent docs`, audits | `docs/adr/`, `DIRECTIVES.md`, `src/api/docs-health-endpoint.ts` | Güçlü ama drift borcu yüksek |
| VS Code/SDK/TERM-RPC | Panel, SDK, term-rpc bridge/data/refresh, HTTP RPC write handlers | Extension, `/api/rpc`, feature docs | `docs/features/vscode-panel.md`, `docs/features/sdk.md`, `src/api/rpc-write-handlers.ts` | Gerçek yüzey; docs index eksik |

### Nereden Ne Yapılır

| Yüzey | Kullanım | İyi olduğu işler | Not |
|---|---|---|---|
| Bare terminal | `deckent` | Günlük agentic çalışma, chat/run/control, approval, resume | Birincil ürün yüzeyi |
| CLI komutları | `deckent start/run/do/plan/chat/serve/...` | Scriptlenebilir işler, sprint/task lifecycle, doctor, model/provider, cost | Registry'de 77 entry var |
| REPL slash/meta-tools | `/model`, `/provider`, `/approve`, tool search/describe/plan | Etkileşimli seçim, düşük bilişsel yük | Bazı yetenekler feature flag ile |
| MCP server | `deckent_*` tools | IDE/agent host'larından Deckent runtime'a erişim | Generated referans 42 tool |
| HTTP API/dashboard | `deckent serve`, `/api/*` | İzleme, approvals history, KPI, worker logs, autonomous/missions, enterprise panels | Dashboard control değil, izleme/operasyon ağırlıklı |
| Built-in agents/skills | `deckent agent`, `deckent skill`, manifests | Rol bazlı worker ve prompt/tool kapasitesi | Prompt docs product docs'tan ayrı tutulmalı |
| SDK/TERM-RPC/VS Code | SDK feature, `/api/rpc`, extension panel | Entegrasyon ve dış UI'lar | Feature README güncellenmeli |
| Gateway/bot/webhook | `deckent gateway`, `deckent bot`, `/api/reactive/webhook` | Mesajlaşma, dış olaylardan backlog tetikleme | Security docs ile beraber yenilenmeli |

## Docs Güncelleme Sprint Planı

Karpathy disipliniyle önerilen sıra: önce ground-truth, sonra dar delta patch,
sonra generated check. Büyük rewrite yok; her dosya için "bugün ne gerçek, ne
default-off, ne future" ayrımı yazılmalı.

| Adım | Kapsam | Çıktı |
|---|---|---|
| P0.1 | `docs/features/README.md` | 16 feature dosyasının tamamını listeleyen güncel index; manifest/script uyumu |
| P0.2 | `docs/vision/*`, `DECKENT.md`, `.deckent/workspace/IDENTITY.md` | Sprint/MCP/command/provider/test metrikleri için tek kaynak; sayı drift'i kapanır |
| P0.3 | `docs/adr/adr-g-034-native-agentic-terminal.md`, `docs/adr/adr-g-022-nervous-system.md` | Delivered/future tabloları; terminal/approval/nervous gerçek statüsü |
| P0.4 | `.analysis/hermes-vs-deckent-*`, `.analysis/paperclip-vs-deckent-comparison.md` | 2026-07-06 delta kutuları; eski iddialar tarihsel bağlama alınır |
| P1.1 | `docs/architecture/*` | Terminal-first runtime, Memory V2, approval, trace, provider/cost mimarisi güncel akış olarak yazılır |
| P1.2 | `docs/guide/*`, `docs/cookbook/*` | "Nereden ne yapılır" kullanıcı akışları: terminal, CLI, MCP, dashboard, API |
| P1.3 | `docs/superpowers/*`, `docs/design/*` | Accepted/current/obsolete etiketleri; pack-specific future işleri netleşir |
| P2.1 | `docs/audits/*`, `docs/archive/*`, `docs/core-memory/*` | Tarihsel kayıt banner'ı ve index ayrımı |
| P2.2 | Built-in agent/skill docs | Product docs değil prompt contract olarak ayrıştırılmış index |

## Önerilen Docs Sprinti

P0:
- ADR-G-034 ve ADR-G-022 enforcement/status paragraflarını bugünkü koda göre amend et.
- Paperclip ve Hermes analizlerinin başına "2026-07-06 delta" kutusu ekle.
- `docs/reference` generated docs için `npm run docs:ref:check` ve link lint çalıştır.

P1:
- `docs/features/README.md` altında feature status indeksini güncelle: `stable`, `default-off`, `partial`, `design-only`.
- `docs/architecture/architecture.md` ve `docs/architecture/memory-system.md` içinde Memory V2 / tenant / trace / approval statülerini tekleştir.

P2:
- Eski audit dosyalarına current-vs-archive uyarısı ekle.
- `docs/vision/*` metriklerini generated bloklara veya `IDENTITY.md` kaynaklarına bağla.

## Açık Karar Kapıları

- TERM-5: sade risk dili registry'de gerçek; UI/i18n ve tek mapping guard kararı açık.
- NL-DISPATCH: default kararı açık; CLI/TUI ve connector default'ları farklı.
- TOOL-CALL: progressive disclosure var; production execution seam için ayrı karar/iş gerekiyor.
- ENTERPRISE-SECRETS: per-project encrypted credential var; binding-scoped audited vault ayrı iş.
- ENTERPRISE-TENANT: strict tenant isolation var; default ve full management plane ayrı karar.

## İşlendi (2026-07-06 P0 turu — Task 375-006)

Bu snapshot'ın "Önerilen Docs Sprinti" P0 kuyruğundan hangi maddelerin bu turda
kapandığını, hangilerinin açık kaldığını işaretler.

| Madde | Kapsam | Durum | Not |
|---|---|---|---|
| P0.1 — `docs/features/README.md` | 16 feature dosyasının tamamını status-etiketiyle (stable/default-off/partial/design-only) listeleyen index | ✅ Kapandı | Bu task'ın write-authority'si içinde; index artık 16/16 dosyayı listeliyor (önceki 7/16 drift kapandı) |
| P0.4 — `.analysis/hermes-vs-deckent-*.md` + `.analysis/paperclip-vs-deckent-comparison.md` başına 2026-07-06 delta kutusu | Stale Signal Register'daki düzeltmeler (trace-wired, encrypted-credentials-kısmi vb.) | ⛔ Açık kaldı | Bu task'ın canonical write-authority listesi yalnız `docs/features/README.md` + bu snapshot dosyasını içeriyor — `.analysis/` dosyaları scope dışı kaldığı için düzenlenmedi. Takip: scope.filesWrite'ına `.analysis/hermes-vs-deckent-analysis.md`, `.analysis/hermes-vs-deckent-claude-analysis.md`, `.analysis/hermes-vs-deckent-direction-decisions.md`, `.analysis/paperclip-vs-deckent-comparison.md` eklenmiş yeni bir task gerekir |

Diğer P0 maddeleri (ADR-G-034/ADR-G-022 amend, `docs/reference` generated check)
bu task'ın kapsamı dışında — ayrı task'larda izlenmeli.
