# Feature Docs — Canlı Özellik Kataloğu

> **Status:** CANONICAL (hand-maintained, Tier-1). `docs/features/` sıfırdan yeniden-dokümantasyon
> (redoc) kapsamında yeniden doğdu — her dosya TEK feature'ı anlatır: ne yapar, hangi config
> parametresiyle açılır, açınca ne değişir, riskleri ve kanıtları nelerdir.
> Makine-okunur karşılığı: `.deckent/settings/features-manifest.json`
> (üretici: `scripts/sync-manifest.mjs` — manifest'i elle DÜZENLEME, script'i düzenle + yeniden üret).

## İçindekiler

| Feature | Config anahtarı | Default | Doküman |
|---------|-----------------|---------|---------|
| REPL Surface — mode-indicator + live-footer + approval-card | `repl_surface.*` | off | [repl-surface.md](repl-surface.md) |
| Tool Surface — progressive-disclosure meta-tool'ları | `tool_surface.*` | off | [tool-surface.md](tool-surface.md) |
| Approval Runtime — runtime-geneli canlı onay zinciri | `approval_gate` + `approval.*` | off | [approval-runtime.md](approval-runtime.md) |
| NPM Advisory — bağımlılık-mutasyonu eskalasyon kanalı | (her zaman açık — prompt-seviyesi) | on | [npm-advisory.md](npm-advisory.md) |

## Yazım kuralları

- Her doküman şu iskeleti izler: **Ne yapar → Parametreler (tablo) → Açınca ne değişir →
  Kapalıyken garanti → Riskler → Kanıt (test + canlı doğrulama)**.
- Parametre tabloları `docs/reference/config.md` ile çelişemez — config referansı alan-düzeyi
  kanondur, buradaki dokümanlar davranış-düzeyi anlatımdır.
- Yeni bir feature eklerken: `scripts/sync-manifest.mjs` `FEATURE_DEFINITIONS`'a kayıt +
  burada doküman + bu index'e satır. Üçü birlikte gider.
