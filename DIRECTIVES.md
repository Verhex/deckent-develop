# DIRECTIVES — SPRINT-363: CODEX-GERÇEK-SINAV + RPC-YAZMA + ONB-ENTEGRASYON + SDK-2 (12 task)

## Goal
479-fix'li dist'le codex-v4 (model-pin gerçek sınavı); RPC yazma-metotları; ONB global-precedence +
entry-wire; SDK dilim-2; 362-debt kapanışları; TERM-5 karar-paketi; katalog dilim-3.
DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE** (config.ts YALNIZ Task 3 · api/server.ts KAPALI (RPC-yazma endpoint-modülü ayrı
  dosyada) · app.tsx/run.tsx/chat-native.ts/sprint-planner.ts KAPALI).
- DISK-VERIFY; D-004; surgical; YAGNI. Hermetik test; gerçek ağ YOK (Task 1 hariç — gerçek codex).
  No build/install/login. npm-install ASLA. Flag default-off + roundtrip-kapanı. Zero-hardcode.
  String-free. Honest result. No haiku.

---

## Task 1: CODEX-V4 — model-pin gerçek sınavı (479-fix'li plan)
- Model: gpt-5
- Backend: subprocess
- Effort: normal
- Skills: doc-writing
- Files: docs/analysis/codex-v4-selfreport-363.md
- Scope: docs/analysis/
- Dependencies: none
### Description
DÖRDÜNCÜ ve belirleyici deneme — bu plan 479-fix'li dist'le yazıldı; task-JSON'da model:gpt-5
bekleniyor. (1) runtime self-report (model/CLI/başlangıç); (2) kendi task-JSON'ını oku
(.tasks/task-<id>.json) ve model/provider alanlarını rapora yaz — zincirin uçtan-uca kanıtı.
≤3KB, erken-yaz-erken-bitir.
### goNogo
- goCriteria: doküman + self-report + kendi-JSON alıntısı; lint:link temiz.
- nogo: kod; 3KB üstü.

## Task 2: RPC-WRITE-METHODS — run.start-detached + approval.decide (dilim-2c)
- Model: sonnet
- Effort: high
- Skills: api-design, typescript-expert
- Files: src/api/rpc-write-handlers.ts, tests/api/rpc-write-handlers.test.ts
- Scope: src/api/, src/core/, src/cli/, tests/api/, docs/adr/
- Dependencies: none
### Description
362-008'in `unsupported` bıraktığı iki yazma-metodu, AYRI handler-modülünde:
run.start-detached → detached-start.ts reuse (358-003); approval.decide → broker.decide (karar-kanalı
'rpc'). Handler-map'e kayıt: 362-008'in injectable-map desenine EK (server.ts'e DOKUNMADAN — map'i
dolduran modül-fonksiyonu export et, wire tek-satırsa notes'a). Auth zaten üst-zincirde; yine de
handler-içi requester-alanı zorunlu (audit).
### goNogo
- goCriteria: iki metot hermetik (fake-spawn/fake-broker); requester'sız istek reddi; unsupported-listesi
  güncel; `tsc` temiz.
- nogo: server.ts; auth-zayıflatma; gerçek-spawn.

## Task 3: ONB-GLOBAL-PRECEDENCE — global-katmanı config-zincirine bağla (dilim-3)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/config.ts, tests/core/global-precedence.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
DİKKATLİ görev (config.ts kritik): 3-katman merge zaten global(~/.deckent/config.json) okuyor —
DISK-VERIFY: GLOBAL_CONFIG_PATH mevcut zincir. Bu dilim: global-yolu resolveGlobalScopePaths'tan
(361-008) türet (platform-doğru; mevcut sabit-yol davranışı DEĞİŞMEZSE no-op refactor + testler;
farklıysa geriye-uyum: eski-yol fallback okunur, yeni-yol tercih). born-464 dersi: değişen her alan
roundtrip-kapanıyla.
### goNogo
- goCriteria: 4-platform yol-testi (env-inject); eski-yol geriye-uyum testi; mevcut config-testleri
  (config-flag-roundtrip dahil) BYTE-yeşil; `tsc` temiz.
- nogo: precedence-sırası değişikliği; cache-semantiği bozma.

## Task 4: ONB-ENTRY-WIRE — wizard'ı `deckent onboard` komutuna bağla
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/onboard.ts, src/cli/index.ts, src/cli/helpers/messages.ts, tests/cli/onboard-command.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js onboard --plan-only → exit 0
### Description
361-009 makinesi + 362-011 Ink-UI'yi komuta bağla: `deckent onboard` — TTY'de Ink-akışı, `--plan-only`
non-interaktif plan-çıktısı (CI/test yolu); init'e DOKUNMA (onboard ayrı-komut; init-entegrasyonu
Alperen-kararı sonrası). getMessage en/tr.
### goNogo
- goCriteria: --plan-only hermetik (fixture-probe) plan basar; komut kayıtlı (command-registry
  envanter-testi güncel); en+tr; `tsc` temiz.
- nogo: init.ts davranışı; gerçek-yazım default'ta.

## Task 5: SDK-2 — sprint-yüzeyi: startDetached + results + retro (F2-008 dilim-2)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, api-design
- Files: src/sdk/deckent-client.ts, tests/sdk/deckent-client-sprint.test.ts
- Scope: src/sdk/, src/core/, src/orchestra/, src/cli/, tests/sdk/, docs/adr/
- Dependencies: none
### Description
360-012 client'ına sprint-yüzeyi: `startSprintDetached()` (detached-start reuse; pid+log döner),
`getSprintResults(sprintId)` (arşiv/tasks okuyucu), `getRetro(sprintId)`. Zero-CLI-prereq korunur
(spawn yalnız startDetached'te ve injectable).
### goNogo
- goCriteria: 3 metot hermetik round-trip (fixture-arşiv; fake-spawn); mevcut sdk-testleri yeşil;
  `tsc` temiz.
- nogo: package.json; runSprint çekirdeğine dokunmak.

## Task 6: 362-DEBT-CLOSE — 362'nin 4 debt-notunu oku-kapat
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/api/approval-history-endpoint.ts, tests/api/approval-history-endpoint.test.ts, docs/analysis/debt-close-362.md
- Scope: src/api/, src/core/, tests/, docs/analysis/, docs/adr/
- Dependencies: none
### Description
`.brain/archive/sprint-362-tasks/` debt-notlarını (001-zinciri, 004, 008-brain-debt, +1) OKU;
yazı-yetkin dahilinde kapat (approval-history ailesi yetkinde); yetki-dışı kalanları
docs/analysis/debt-close-362.md'ye net-followup listesi olarak yaz (dosya+satır+öneri).
### goNogo
- goCriteria: yetki-içi debt'ler kapalı (önce/sonra notes); yetki-dışılar dokümante; testler yeşil;
  `tsc` temiz.
- nogo: DISTINCT-KAPALI dosyalar.

## Task 7: TERM5-EVIDENCE — sade risk-dili karar-paketi (Sıra-45 🔬→karar)
- Model: sonnet
- Effort: normal
- Skills: doc-writing
- Files: docs/design/term5-risk-language.md
- Scope: docs/design/, src/cli/
- Dependencies: none
### Description
Sıra-45 (P0 🔬): Oku/Değiştir/Çalıştır/Otonom 4-seviyeli sade risk-dili önerisi — mevcut yüzeylerin
(command-registry risk-etiketleri, tool trust-tier, approval risk-5'lisi) envanteri (DISK-VERIFY,
satır-ref'li) + tek-eşleme tablosu önerisi + 10 örnek-komutun önce/sonra diliyle + getMessage-key
taslağı. Karar Alperen'in — ADR-taslak bölümü.
### goNogo
- goCriteria: envanter satır-ref'li + eşleme-tablosu + 10 örnek + ADR-taslak; lint:link temiz.
- nogo: kod.

## Task 8: AUTONOMOUS-APPROVAL-MCP — DEFER-001 kalan yüzey
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/mcp/tools/autonomous-approval.ts, tests/mcp/autonomous-approval.test.ts
- Scope: src/mcp/, src/orchestra/, tests/mcp/, docs/adr/
- Dependencies: none
### Description
Sıra-74 kalanı: `deckent_autonomous_approve` / `deckent_autonomous_reject` — autonomous policy-gate'in
approval-required backlog-girişlerine MCP'den karar (mevcut approval-adapter public-API'siyle;
exec-siz karar-yazımı). Katalog+register+sayaç-senkron (44→46; 359/361 CC-desenini AYNEN uygula:
index.ts TOOL_CATALOG + registerTools + server.ts instructions + tests sayaçları — HEPSİ bu task'ın işi).
### goNogo
- goCriteria: 2 tool hermetik; lint-mcp 46/46 yeşil; sayaç-testleri güncel-yeşil; `tsc` temiz.
- nogo: autonomous çekirdek; eksik sayaç-senkron.

## Task 9: AGSK-3 — rpc-protocol + onboarding-ux skill'leri (dilim-3)
- Model: sonnet
- Effort: low
- Skills: doc-writing
- Files: .deckent/skills/rpc-protocol/, .deckent/skills/onboarding-ux/, src/core/builtins/skills/rpc-protocol/, src/core/builtins/skills/onboarding-ux/
- Scope: .deckent/skills/, src/core/builtins/, docs/adr/
- Dependencies: none
### Description
2 yeni skill (iki-ağaç, ≤4KB): rpc-protocol (term-rpc kontrat-desenleri: zod-first, unknown-method
dürüstlüğü, çift-tüketici testi) + onboarding-ux (wizard-adım-makinesi + plan-önce-uygula + degrade-safe
teaser desenleri). Sprint-361/362 derslerinden künyeli.
### goNogo
- goCriteria: 2×2 ağaç; load-smoke; format-tutarlı; ≤4KB.
- nogo: mevcut skill değişikliği.

## Task 10: WATCH-SESSION-WARN — 4+ paralel-oturum uyarısı (session-registry wire)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/helpers/health-snapshot.ts, tests/cli/session-warn.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
361-015 session-registry'sini health-snapshot'a bağla: açılışta aktif-oturum sayısı; ≥4 ise usage-katkı
uyarısı satırı ("paralel oturumlar tek limiti paylaşır" — getMessage; /usage dersinden). Fail-soft.
### goNogo
- goCriteria: fixture-registry ile 1/4/stale senaryoları; snapshot mevcut testleri yeşil; en+tr; `tsc` temiz.
- nogo: registry değişikliği.

## Task 11: VSCODE-EXT-1 — CHAT-IDE gerçek-impl dilim-1 (Sıra-64)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/extensions/vscode/src/deckent-panel.ts, src/extensions/vscode/src/rpc-bridge.ts, tests/extensions/vscode-panel.test.ts
- Scope: src/extensions/, src/core/, tests/extensions/, docs/adr/
- Dependencies: none
### Description
Sıra-64 stub→gerçek dilim-1: mevcut ext-iskeletini DISK-VERIFY; webview-panel (status+limits+approvals
read-only — TERM-RPC http-client'ıyla; RPC'nin ÜÇÜNCÜ tüketicisi) + rpc-bridge (fetch-injectable).
Paket/publish YOK; unit-test'ler node-tarafı (webview-mock).
### goNogo
- goCriteria: rpc-bridge 4 read-metot testli; panel veri-bağlama unit'li (mock-webview); ext derlenir
  (`tsc` ext-config'iyle de temiz — DISK-VERIFY nasıl derleniyor).
- nogo: publish/paketleme; ana-tsconfig bozulması.

## Task 12: TOOLCU-DESIGN — computer-use/browser pack tasarım-notu (Sıra-83, P2)
- Model: sonnet
- Effort: low
- Skills: doc-writing
- Files: docs/design/tool-cu-pack.md
- Scope: docs/design/
- Dependencies: none
### Description
Sıra-83 (P2) tasarım-dilimi: opsiyonel automation-pack sınırları — playwright-MCP mevcut-emsali,
risk-sınıfı (Danger-tier), approval-zorunluluğu, sandbox-gereksinimi; uygulama post-7-Tem önerisi.
### goNogo
- goCriteria: kapsam+risk+entegrasyon-önerisi (satır-ref'li); lint:link temiz.
- nogo: kod.
