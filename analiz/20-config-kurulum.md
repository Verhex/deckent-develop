# 20 — Konfigürasyon ve Kurulum

deckent, katmanlı bir konfigürasyon sistemi kullanır: en genel ayarlardan en özele doğru 4 katman birleşerek nihai çalışma zamanı yapılandırmasını oluşturur. Bu sistem `src/core/config.ts`'de hayata geçirilmiş olup ADR-004 kapsamında belgelenmiştir.

---

## 4-Katmanlı Konfigürasyon (ADR-004)

Önem sırası en düşükten en yükseğe:

```
1. Sabit kodlanmış varsayılanlar (defaults)
    ↓
2. Genel kullanıcı konfigürasyonu — ~/.deckent/config.json (global)
    ↓
3. Proje konfigürasyonu — .deckent/config.json (project)
    ↓
4. Ortam değişkeni geçersiz kılmaları — DECKENT_* (env wins)
```

Sonraki katman her zaman öncekini geçersiz kılar. Katmanlar `deepMerge` fonksiyonuyla birleştirilir; diziler birleştirilmez, tamamen değiştirilir; `undefined` değerler atlanır.

### Örnek Konfigürasyon Dosyası

`.deckent/config.json`:

```json
{
  "brain_provider": "claude",
  "worker_provider": "claude",
  "fallback_provider": "claude",
  "max_workers": 5,
  "mode": "balanced",
  "language": "tr",
  "dependency_pipeline_enabled": true,
  "brain_planning": "ai"
}
```

### Ortam Değişkenleri

| Değişken | Karşılık |
|----------|----------|
| `DECKENT_BRAIN_PROVIDER` | `brain_provider` |
| `DECKENT_MAX_WORKERS` | `max_workers` |
| `DECKENT_API_TOKEN` | `api_auth_token` |
| `DECKENT_API_AUTH_DISABLED` | Auth bypass (yalnızca REST, terminal için geçersiz) |
| `ANTHROPIC_API_KEY` | Claude API anahtarı |
| `OPENAI_API_KEY` | Codex API anahtarı |
| `GOOGLE_API_KEY` | Gemini API anahtarı |

---

## Kurulum Adımları

### Gereksinimler

- **Node.js ≥ 24.0.0**
- Claude Code (MCP entegrasyonu için) *ya da* doğrudan CLI kullanımı
- İsteğe bağlı: `OPENAI_API_KEY` (Codex), `GOOGLE_API_KEY` (Gemini)

### 1. deckent'i Yükle

```bash
npm install -g deckent
# veya
npx deckent@latest init
```

### 2. Projeyi Başlat

Proje kökünde:

```bash
deckent init
```

`deckent init` aşağıdaki dizin yapısını oluşturur:

```
proje-kökü/
├── .deckent/
│   ├── config.json        ← Proje konfigürasyonu (3. katman)
│   ├── agents/            ← Özel agent tanımları
│   └── skills/            ← Özel skill tanımları
├── .brain/
│   ├── memory.db          ← SQLite hafıza DB (gitignore'da)
│   └── exports/
│       ├── summary.md     ← @ referansıyla bağlam özeti
│       ├── decisions.md   ← ADR listesi (git-tracked)
│       ├── memory.md      ← Sprint öğrenimleri (git-tracked)
│       └── debt.md        ← Teknik borç (git-tracked)
├── .tasks/                ← Sprint task JSON dosyaları
├── DIRECTIVES.md          ← Sprint hedefleri (elle düzenlenir)
└── CLAUDE.md              ← Claude Code bağdaştırıcısı (@DECKENT.md referansı)
```

### 3. MCP'yi Kayıt Et (Claude Code ile)

```bash
claude mcp add deckent -- npx deckent-mcp
```

Claude Code'u yeniden başlat veya `/mcp restart` komutuyla MCP katmanını yenile.

### 4. İlk Sprint

```bash
deckent set-directives   # DIRECTIVES.md'yi doldur
deckent plan --mode ai   # Görevleri planla
deckent start            # Sprint başlat
deckent status --watch   # Canlı izle
deckent review           # Sonucu değerlendir
```

---

## CLAUDE.md Bağdaştırıcısı

`deckent init`, `CLAUDE.md` dosyasına `@DECKENT.md` referansını ekler. Bu sayede Claude Code, deckent'in tüm kural ve kısıtlarını otomatik olarak yükler. `DECKENT.md` ana kural belgesidir; `CLAUDE.md` onun salt bir iletici noktasıdır.

---

## Mode Preset'leri

`deckent mode` komutu ya da konfigürasyonun `mode` alanıyla seçilir. `src/core/mode-presets.ts`'de tanımlanmıştır.

### performance

Maksimum kalite, daha yüksek maliyet:

```json
{
  "brain_tier": "premium",
  "worker_tier": "premium",
  "max_tier": "premium_plus",
  "auto_upgrade": true,
  "auto_downgrade": false,
  "max_workers": 8
}
```

### balanced

Kalite-maliyet dengesi (önerilen):

```json
{
  "brain_tier": "standard",
  "worker_tier": "premium",
  "max_tier": "premium",
  "auto_upgrade": true,
  "auto_downgrade": true,
  "max_workers": 5
}
```

### economic

Minimum maliyet, temel geliştirme görevleri:

```json
{
  "brain_tier": "standard",
  "worker_tier": "standard",
  "max_tier": "standard",
  "auto_upgrade": false,
  "auto_downgrade": true,
  "max_workers": 3
}
```

### api

API anahtarı kullanılan ortamlar için optimize (CI/CD, otomasyon):

```json
{
  "brain_tier": "premium",
  "worker_tier": "standard",
  "max_tier": "premium_plus",
  "auto_upgrade": true,
  "auto_downgrade": true,
  "max_workers": 10
}
```

```bash
deckent mode set performance    # mod seç
deckent mode show               # mevcut mod
```

---

## Önemli Konfigürasyon Alanları

| Alan | Varsayılan | Açıklama |
|------|-----------|----------|
| `brain_provider` | `claude` | Orkestratör provider'ı |
| `worker_provider` | `claude` | Worker'lar için varsayılan provider |
| `fallback_provider` | `claude` | Hata durumunda yedek provider |
| `brain_tier` | `standard` | Brain model tier'ı |
| `worker_tier` | `standard` | Worker model tier'ı |
| `max_workers` | `5` | Eş zamanlı maksimum worker sayısı |
| `mode` | `balanced` | Plan modu (`performance`/`balanced`/`economic`/`api`) |
| `language` | `en` | Arayüz dili (`en`/`tr`) |
| `brain_planning` | `auto` | Planlama modu (`ai`/`structured`/`auto`) |
| `dependency_pipeline_enabled` | `true` | Dalga tabanlı yürütme (ADR-045) |
| `auth_mode` | `subscription` | Kimlik doğrulama (`subscription`/`api`) |

---

## Konfigürasyon Okuma ve Güncelleme

```bash
deckent config read                         # tüm konfigürasyonu oku
deckent config set max_workers 4            # tek alan güncelle
deckent config set brain_provider claude    # provider değiştir
deckent config set mode economic            # modu değiştir
```

MCP üzerinden:

```typescript
deckent_config({ action: "read", root: "." })
deckent_config({ action: "set", key: "max_workers", value: "4", root: "." })
```

---

## Global Konfigürasyon

`~/.deckent/config.json` tüm projelerde geçerli olan genel ayarları tutar. Örneğin varsayılan provider veya dil tercihi buraya yazılır; proje konfigürasyonu her zaman bunu geçersiz kılabilir.

```bash
# Genel varsayılanları güncelle
deckent config --global set language tr
deckent config --global set mode balanced
```

---

## Sorun Giderme

```bash
deckent doctor          # konfigürasyon ve bağımlılık sorunlarını tespit et
deckent sync            # manifest'leri ve konfigürasyonu senkronize et
deckent config read     # mevcut birleştirilmiş konfigürasyonu kontrol et
```

Yapılandırma sorunlarının büyük çoğunluğu `deckent doctor` çıktısıyla teşhis edilebilir.
