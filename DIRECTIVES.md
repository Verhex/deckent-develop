# DIRECTIVES — SPRINT-361: CARRYOVER + SCHED/FIX-GOVERNANCE + ONB-BAŞLANGIÇ + RPC/CLIENTS ÇEKİRDEK (15 task)

## Goal
360-carryover'ları (limits-gate, doc-route) + born-475/476 governance-fix'leri + codex-retry +
OpenRouter bootstrap; ONB-GLOBAL/ONB-1 ilk dilimler; APR-CLIENTS + TERM-RPC çekirdekleri;
katalog dilim-2 + kalan kapanışlar. DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE** (sprint-phases.ts YALNIZ Task 3 · sprint-spawner.ts YALNIZ Task 4 ·
  core/provider.ts YALNIZ Task 6 · cli/index.ts+messages.ts YALNIZ Task 1 · app.tsx/run.tsx/
  chat-native.ts/server.ts KAPALI).
- **DISK-VERIFY first**; D-004 yön; surgical; YAGNI. **Hermetik test**; gerçek ağ/provider YOK.
  **No build/install/login. npm-install ASLA** (advisory-kanal).
- **Flag-gated default-off** + yeni config-alanı → config-types + resolver-passthrough +
  config-flag-roundtrip kapanına EKLE. **Zero-hardcode. String-free mekanizma. Honest result. No haiku.**

---

## Task 1: LIMIT-GATE-WIRE — `deckent limits` + start-gate (CARRYOVER 360-003, aynı-spec)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/limits.ts, src/cli/index.ts, src/cli/helpers/messages.ts, tests/cli/limits-command.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js limits --json → exit 0 + sessionPct alanı
### Description
CARRYOVER (360-003 hiç-dispatch-edilmedi; born-475). Spec aynen: (a) `deckent limits [--json]` —
src/core/limit-preflight.ts (360-002 DONE, mevcut) probe'unu koşar, insan-okur tablo + --json
(getMessage en/tr); (b) start-gate: config `limit_gate.{enabled,session_max_pct,weekly_max_pct}`
(default-off + roundtrip-kapanı) — enabled iken start-öncesi probe: 'block'→red (mesaj+reset-zamanı,
--force-limits bypass), 'warn'→devam. Start-giriş noktasını DISK-VERIFY; minimal-diff.
### goNogo
- goCriteria: fixture-probe'la komut+--json; gate block/warn/off testli; flag-off byte-aynı;
  roundtrip-kapanı alanları görür; en+tr key'ler; `tsc` temiz.
- nogo: default-on; gerçek probe testte.

## Task 2: OPENROUTER-DOC-ROUTE — doc-kind→free-model önerisi (CARRYOVER 360-008, aynı-spec)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/routing-openrouter.ts, tests/core/routing-openrouter.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
CARRYOVER (360-008). Config `openrouter.{enabled,doc_route,model}` (default-off + roundtrip-kapanı):
`resolveOpenRouterDocRoute(task, config, cache)` — yalnız doc-kind + flag-on + cache'te
(openrouter-models.ts, 360-007 DONE) uygun free-model → `{provider:'openrouter', model}`; kod/tsx
task'ına ASLA (negatif-test). routeTaskV2-wire dilim-2 (notes'a nokta).
### goNogo
- goCriteria: doc+flag-on→öneri; kod→ASLA; flag-off→null; roundtrip-kapanı; `tsc` temiz.
- nogo: routing-engine.ts değişikliği; default-on.

## Task 3: POSTFIX-PENDING-SCAN — FIX-sonrası hiç-başlamamış eligible'ları koştur (born-475)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/postfix-pending-scan.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
born-475 (360 canlı: 003/008 ebeveynleri DONE'ken hiç spawn edilmedi — stall penceresi dispatch'i
yuttu, FIX yalnız fail'leri re-dispatch ediyor). FIX-fazı bitiminde tek-geçiş: status=PENDING +
deps-tamamı-DONE(aggregate) task'ları respawnEligibleTasks-yoluyla koştur ve result'larını bekle
(mevcut wave-mekanizmasını YENİDEN KULLAN — yeni scheduler yazma); hiç-eligible-yoksa byte-aynı akış.
Sonsuz-döngü koruması: tek-tur, yeni-fail'ler normal FIX-sayaçlarına tabi.
### goNogo
- goCriteria: fixture-sprint (parent-DONE+child-PENDING) → post-FIX child koşuldu; eligible-yok →
  davranış byte-aynı (mevcut sprint-phases testleri yeşil); tek-tur koruması testli; `tsc` temiz.
- nogo: FIX-retry mantığını değiştirmek; yeni dispatch-katmanı.

## Task 4: FIX-MODEL-PRESERVE — fix-task orijinalin model/provider/backend mirası (born-476)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-spawner.ts, tests/orchestra/fix-model-preserve.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
born-476 (360 canlı: codex-task'ın fix'i claude/opus'la koştu → deney sonuçsuz + provider-pinning
FIX'te deliniyor). Fix-task üretim noktasını DISK-VERIFY et; fix-task orijinalin
forceModel/provider/backend/modelEffort alanlarını MİRAS alsın; bilinçli-değişim gerekiyorsa
(örn. provider-fallback politikası) debugLog+event ile açık-loglansın, sessiz-değişim YASAK.
### goNogo
- goCriteria: fixture-orijinal (gpt-5/codex/subprocess) → fix-task aynı üçlü (test); mirassız eski
  davranış kalmadı (negatif-test); mevcut fix-phase testleri yeşil; `tsc` temiz.
- nogo: FIX-verdikt mantığı değişikliği.

## Task 5: CODEX-RETRY-RCA — codex-timeout kök-analizi + yeniden-deneme (GERÇEK codex-worker)
- Model: gpt-5
- Backend: subprocess
- Effort: normal
- Skills: doc-writing
- Files: docs/analysis/codex-dogfood-rca-361.md
- Scope: docs/analysis/, .brain/archive/
- Dependencies: none
### Description
CODEX-CLI DOGFOOD YENİDEN-DENEMESİ (360'ta orijinal codex-koşusu timeout'la öldü, fix claude'la
tamamladı — deney sonuçsuzdu). İKİ iş: (1) kendi varlığın kanıt — bu görevi codex-CLI koşuyorsa
rapora "runtime self-report" bölümü yaz (hangi model/CLI, başlangıç-zamanı); (2)
`.brain/archive/sprint-360-tasks/task-360-014.log` + `.timeout`-izlerini oku, orijinal codex-koşusunun
neden timeout olduğuna dair kanıt-temelli hipotez (yavaş-model? CLI-stall? prompt-boyutu?) + öneri.
KISA TUT (≤6KB) — timeout-riskine karşı erken-yaz-erken-bitir.
### goNogo
- goCriteria: doküman var + self-report bölümü + ≥3 kanıt-referanslı bulgu; lint:link temiz.
- nogo: kod değişikliği; 6KB üstü.

## Task 6: OPENROUTER-BOOTSTRAP — adapter'ı provider-bootstrap'a flag'li kaydet
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/provider.ts, tests/core/openrouter-bootstrap.test.ts
- Scope: src/core/, src/providers/, tests/core/, docs/adr/
- Dependencies: none
### Description
360-006'nın OpenRouterProvider'ını provider-bootstrap'a bağla: config `openrouter.enabled` true +
`$DECK:OPENROUTER_API_KEY` çözülüyorsa provider-registry'ye 'openrouter' kaydı; yoksa kayıt YOK
(fail-honest log). bootstrapProviders'ın mevcut desenini DISK-VERIFY (deck_broker parametresi
emsali); flag-off byte-aynı.
### goNogo
- goCriteria: flag-on+key-var→kayıtlı, key-yok→kayıtsız+dürüst-log, flag-off→byte-aynı (testler
  fake-secret'la); `tsc` temiz.
- nogo: diğer provider'ların bootstrap'ını değiştirmek.

## Task 7: ONB-GLOBAL-DESIGN — global-install + proje-scope mimari tasarımı (Sıra-200 dilim-1)
- Model: fable
- Effort: high
- Skills: doc-writing, typescript-expert
- Files: docs/design/onb-global-install.md, src/core/global-scope-resolver.ts, tests/core/global-scope-resolver.test.ts
- Scope: docs/design/, src/core/, tests/core/
- Dependencies: none
### Description
Sıra-200 (P0, "kesinlikle revize edilecek"): tasarım + ilk çekirdek. Doc: global-kurulum (~/.deckent)
↔ proje-scope (.deckent) katman-modeli — hangi state global (auth, model-catalog, skill-marketplace-cache,
limits), hangisi proje (memory.db, tasks, config-precedence: proje>global>default zaten var —
DISK-VERIFY config.ts 3-layer); öğrenimlerin proje-scope kalması (pivot-kuralı); migration + Yasa#2
matrisi (macOS/Linux/Win/WSL yol-çözümü). Çekirdek: `resolveGlobalScopePaths(platform, env)` —
platform-doğru global-dizin çözümü (XDG/AppData/Library kuralları) + testler. ADR-taslak bölümü
(karar Alperen'in).
### goNogo
- goCriteria: design-doc (katman-tablosu + migration + platform-matrisi + ADR-taslak); resolver 4-platform
  testli (env-inject, gerçek-fs yok); lint:link temiz; `tsc` temiz.
- nogo: mevcut config-precedence davranışını değiştirmek; gerçek-migration kodu.

## Task 8: ONB-WIZARD-CORE — install→init sihirbaz çekirdeği (Sıra-201 dilim-1)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/helpers/onboarding-wizard.ts, tests/cli/onboarding-wizard.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Sıra-201 dilim-1: wizard ÇEKİRDEĞİ (Ink-UI değil) — adım-makinesi: provider-tespit (mevcut
provider-discovery/auth-probe modüllerini YENİDEN-KULLAN — 356-007/009, DISK-VERIFY) → auth-durum →
MCP-önerisi → workspace/mode seçimi → config-yazım-planı (yazmadan plan-objesi; uygulama ayrı adım).
String-free (soru/label key'leri caller'dan); her adım injectable-probe'lu.
### goNogo
- goCriteria: 5-adım makinesi fixture-probe'larla uçtan-uca plan üretir; hiçbir gerçek-yazım/ağ yok;
  discovery/auth-probe REUSE kanıtı (import-grep); `tsc` temiz.
- nogo: init.ts/connect davranış değişikliği; Ink-UI (follow-up).

## Task 9: APR-CLIENTS-CORE — Slack/Teams onay-kanal adaptörleri (Sıra-70 dilim-1)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, api-design
- Files: src/connectors/approval-slack.ts, src/connectors/approval-teams.ts, tests/connectors/approval-clients.test.ts
- Scope: src/connectors/, src/core/, tests/connectors/, docs/adr/
- Dependencies: none
### Description
Sıra-70: relay attachChannel kontratına 2 adaptör (355 telegram-emsali — DISK-VERIFY
approval-telegram.ts desenini ve AYNEN izle): pending → masked-özet + approve/deny aksiyonları
(Slack blocks / Teams adaptive-card payload'ı ÜRET — gerçek-gönderim transport-inject), callback →
onDecision. Kanal-hatası relay'i etkilemez.
### goNogo
- goCriteria: fake-transport'la pending→payload (blocks/card şema-doğru) + callback→decision + hata-izolasyon,
  iki adaptör için; `tsc` temiz.
- nogo: gerçek ağ; telegram-adaptörünü değiştirmek; raw-args.

## Task 10: TERM-RPC-CORE — ortak session/action RPC protokol çekirdeği (Sıra-54 dilim-1)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, api-design
- Files: src/core/term-rpc.ts, tests/core/term-rpc.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Sıra-54 (REPL+dashboard+desktop+gateway ortak protokolü) dilim-1: zod-kontrat — `RpcRequest/RpcResponse`
(id/method/params/error), method-kataloğu v1: session.{list,resume}, run.{status,start-detached},
approval.{list,decide}, limits.get; version-alanı + unknown-method dürüst-hata; transport-agnostik
(serialize/parse saf). Mevcut yüzeylerle bağ dilim-2 — burada saf kontrat+dispatcher-iskeleti
(handler-map injectable).
### goNogo
- goCriteria: kontrat round-trip + unknown-method/version-mismatch hataları + handler-dispatch
  (fake-handler'lar) testli; ≥12 test; `tsc` temiz.
- nogo: mevcut api/repl dosyalarına dokunmak.

## Task 11: AGSK-2 — katalog dilim-2: integration-engineer + terminal-ux-engineer agent'ları (Sıra-85)
- Model: sonnet
- Effort: normal
- Skills: doc-writing
- Files: .deckent/agents/integration-engineer/, .deckent/agents/terminal-ux-engineer/, src/core/builtins/agents/integration-engineer/, src/core/builtins/agents/terminal-ux-engineer/
- Scope: .deckent/agents/, src/core/builtins/, docs/adr/
- Dependencies: none
### Description
Sıra-85 dilim-2: 2 yeni VERTICAL agent (İKİ ağaç: builtins-SSOT + .deckent — mevcut agent.json+PROMPT.md
formatı birebir, DISK-VERIFY api-builder örneği): (1) **integration-engineer** — harici-servis
adaptörleri (HTTP-API, secret-deseni, fail-honest, retry-tek) — role: implementer, domain: messaging/
integrations; (2) **terminal-ux-engineer** — Ink/TUI işleri (ink-tui skill'ine referans; string-free,
NO_COLOR, render-test) — role: implementer, domain: terminal-ui (born-470 scope-domain'iyle uyumlu).
Karpathy-hijyen (targeted-test dili); ≤4KB PROMPT.
### goNogo
- goCriteria: 2×2 ağaçta agent.json+PROMPT.md; agent-pool load-smoke; role/domain alanları routing'le
  tutarlı (getAgentRole testine fixture DEĞİL — kendi load-testi); format diff-tutarlı.
- nogo: mevcut agent'ları değiştirmek; 4KB üstü.

## Task 12: TOOL-REG-SHADOW — shadow/override-policy dilimi (Sıra-24 kapanışı)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/tool-shadow-policy.ts, tests/core/tool-shadow-policy.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Sıra-24 son-dilim: shadow/override-policy — aynı-isimli tool birden çok kaynaktan gelirse (builtin vs
MCP vs proje) deterministik öncelik (builtin>proje>MCP default; config `tool_shadow.priority` override,
default-off+roundtrip); gölgelenen kayıt audit-log'a (silinmez, seçilmez). tool-registry'ye dokunmadan
kompozisyon (resolve-katmanı).
### goNogo
- goCriteria: 3-kaynak çakışma fixture'ında deterministik seçim + gölge-audit; config-override testli;
  roundtrip-kapanı; `tsc` temiz.
- nogo: tool-registry.ts değişikliği.

## Task 13: DEFER-002-NERVOUS — nervous MCP undo/edit + askBrain-escalation dilimi (Sıra-75)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/mcp/tools/nervous-edit.ts, tests/mcp/nervous-edit.test.ts
- Scope: src/mcp/, src/nervous/, src/cli/, tests/mcp/, docs/adr/
- Dependencies: none
### Description
Sıra-75 dilimi: MCP'ye `deckent_nervous_edit` — 357-006 nervous-bridge.ts handleEdit'ini MCP'den
kullanılır yap (plan-objesi döner, exec injectable); + `deckent_nervous_undo` — son accept'in
geri-alım PLANI (mevcut nervous public-API'siyle; yoksa dürüst-unsupported yanıtı). Kayıt: index.ts
TOOL_CATALOG+register (42→44 senkron: instructions+lint+test-sayaçları — 359'daki CC-desenini izle,
tests/mcp sayaç-testlerini de güncelle).
### goNogo
- goCriteria: 2 tool zod+hermetik; sayaç-senkron (lint-mcp-instructions yeşil, 44); `tsc` temiz.
- nogo: nervous çekirdeği; gerçek-exec.

## Task 14: F7-MULTISESSION — terminal çok-oturum hardening dilimi (Sıra-65 devam)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/helpers/session-registry.ts, tests/cli/session-registry.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Sıra-65 kalan-dilim: aynı-projede çok-REPL-oturumu güvenliği — `.deckent/settings/repl-sessions.json`
kayıt-defteri (pid+startedAt+tty; atomic; stale-pid temizliği ölü-process kontrolüyle);
`registerSession/listActive/cleanupStale` API. Amaç: /resume picker + "4+ paralel oturum" limit-uyarısı
(usage-katkı dersinden) için veri-tabanı. Wire follow-up.
### goNogo
- goCriteria: kayıt/list/stale-temizlik round-trip (fake-pid-probe); çok-yazar atomicity; `tsc` temiz.
- nogo: app/run wire; gerçek-pid öldürme.

## Task 15: ONB-CHAT-CORE — sohbetle-setup akış çekirdeği (Sıra-202 dilim-1)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/helpers/onboarding-chat-flow.ts, tests/cli/onboarding-chat-flow.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: ONB-WIZARD-CORE
### Description
Sıra-202 dilim-1: "deckent → sohbetle tüm setup" akış-çekirdeği — Task 8 wizard-adım-makinesinin
üstüne NL-katmanı: kullanıcı-cevabını adım-bağlamında yorumlayan intent-eşleyici (deterministik
kural-tabanlı çekirdek: evet/hayır/seçenek-adı/atla; LLM-yorumlama seam'i injectable — gerçek-LLM yok),
adım→soru-key haritası (getMessage), akış-durumu serileştirilebilir (yarıda-kes-devam). Deckent
faydalı-özellik önerisi: tamamlanan-adımlardan öneri-listesi üretici.
### goNogo
- goCriteria: fixture-diyalogla 5-adım uçtan-uca (kural-tabanlı); yarıda-kes-devam round-trip;
  wizard-REUSE kanıtı; `tsc` temiz.
- nogo: gerçek-LLM; init/connect davranışı.
