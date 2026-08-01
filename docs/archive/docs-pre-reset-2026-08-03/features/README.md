# Feature Docs — Canlı Özellik Kataloğu

> **Status:** CANONICAL (hand-maintained, Tier-1). `docs/features/` sıfırdan yeniden-dokümantasyon
> (redoc) kapsamında yeniden doğdu — her dosya TEK feature'ı anlatır: ne yapar, hangi config
> parametresiyle açılır, açınca ne değişir, riskleri ve kanıtları nelerdir.
> Makine-okunur karşılığı: `.deckent/settings/features-manifest.json`
> (üretici: `scripts/sync-manifest.mjs` — manifest'i elle DÜZENLEME, script'i düzenle + yeniden üret).

## İçindekiler

Durum etiketleri: **stable** (tamamlanmış, çalışıyor) · **default-off** (kodu gerçek,
bir config/flag ile açılana kadar kapalı) · **partial** (bir parçası gerçek/testli, bir
parçası kablosuz/erişilemez — dokümanın kendi Riskler bölümünde disk-doğrulanmış) ·
**design-only** (yalnız sözleşme/şema var, çalışan adapter/execution yok).

| Feature | Config anahtarı | Default | Durum | Doküman |
|---------|-----------------|---------|-------|---------|
| REPL Surface — mode-indicator + live-footer + approval-card | `repl_surface.*` | off | default-off | [repl-surface.md](repl-surface.md) |
| Tool Surface — progressive-disclosure meta-tool'ları | `tool_surface.*` | off | default-off | [tool-surface.md](tool-surface.md) |
| Approval Runtime — runtime-geneli canlı onay zinciri | `approval_gate` + `approval.*` | off | default-off | [approval-runtime.md](approval-runtime.md) |
| Approval History — SETTLED (approved/denied/expired) salt-okunur audit trail | (yok — endpoint her zaman mount) | on (kod) | partial | [approval-history.md](approval-history.md) |
| NPM Advisory — bağımlılık-mutasyonu eskalasyon kanalı | (her zaman açık — prompt-seviyesi) | on | stable | [npm-advisory.md](npm-advisory.md) |
| Computer-Use Contract — TOOL-CU dilim-1 sözleşme katmanı (aksiyon şeması + taksonomi, adapter'sız) | `computer_use.*` | off | design-only | [computer-use-contract.md](computer-use-contract.md) |
| Connect Auth-State — config-tabanlı, ağsız kimlik-doğrulama raporu (`doctor`/`connect`) | (yok — her zaman çalışır, read-only) | on | stable | [connect-auth-state.md](connect-auth-state.md) |
| Doctor Fix — `deckent doctor --fix` kapalı-whitelist onarım | (yok — CLI flag) | dry-run | stable | [doctor-fix.md](doctor-fix.md) |
| Limit Gate — subscription-window probe + start-gate | `limit_gate.{enabled,session_max_pct,weekly_max_pct}` | off (absent) | default-off | [limit-gate.md](limit-gate.md) |
| Onboarding — `deckent onboard` sihirbazı | (yok — CLI komutu) | interaktif/scripted | stable | [onboarding.md](onboarding.md) |
| Onboarding Apply — `deckent onboard --apply/--dry-run/--yes` plan→yaz zinciri | (yok — CLI flag) | dry-run önizleme | stable | [onboarding-apply.md](onboarding-apply.md) |
| OpenRouter — adapter + free-model probe + doc-route öneri motoru | `openrouter.enabled` + `openRouterDocRoute` | off/unreachable | partial | [openrouter.md](openrouter.md) |
| Provider→CLI Routing — Model:-pin → plan → spawn-CLI zinciri | (yok — DIRECTIVES `Model:`/`Provider:` direktifi) | n/a | stable | [provider-cli-routing.md](provider-cli-routing.md) |
| SDK — embeddable programmatic client (`createDeckentClient`) | (yok — programmatic import) | n/a | stable | [sdk.md](sdk.md) |
| TERM-RPC — paylaşımlı session/action RPC kontratı | (yok — kontrat her zaman aktif) | n/a | partial | [term-rpc.md](term-rpc.md) |
| VS Code Panel — TERM-RPC bridge/data/refresh soy-zinciri (extension'ın salt-okunur durum paneli) | (yok — extension-seviyesi kod) | n/a | stable | [vscode-panel.md](vscode-panel.md) |

## Yazım kuralları

- Her doküman şu iskeleti izler: **Ne yapar → Parametreler (tablo) → Açınca ne değişir →
  Kapalıyken garanti → Riskler → Kanıt (test + canlı doğrulama)**.
- Parametre tabloları `docs/reference/config.md` ile çelişemez — config referansı alan-düzeyi
  kanondur, buradaki dokümanlar davranış-düzeyi anlatımdır.
- Yeni bir feature eklerken: `scripts/sync-manifest.mjs` `FEATURE_DEFINITIONS`'a kayıt +
  burada doküman + bu index'e satır. Üçü birlikte gider.
