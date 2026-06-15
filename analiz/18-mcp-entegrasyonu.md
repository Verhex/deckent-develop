# 18 — MCP Entegrasyonu

deckent, Model Context Protocol (MCP) üzerinden 34 araç ve 8 kaynak sunar. MCP entegrasyonu sayesinde Claude Code, Cursor gibi IDE'ler ve uyumlu tüm MCP istemcileri, deckent'in tüm sprint orkestrasyon yeteneklerine doğrudan erişebilir. Araç tablosunun tam ve yetkili kaynağı `docs/reference/mcp-tools.md` dosyasıdır (`npm run docs:ref` ile otomatik üretilir).

---

## Kurulum

deckent MCP sunucusu, `npx deckent-mcp` ile başlatılır. Kayıt için:

```bash
claude mcp add deckent -- npx deckent-mcp
```

Bu komut, Claude Code'un MCP yapılandırmasına deckent sunucusunu ekler. Ardından Claude Code'u yeniden başlatmak gerekir (ya da `/mcp restart` komutuyla MCP katmanı yenilenir).

### Doğrulama

```bash
claude mcp list       # deckent listelenmeli
claude mcp status     # bağlantı durumu
```

---

## 34 MCP Aracı

| Araç | Açıklama | Salt-Okunur | Yıkıcı |
|------|----------|-------------|---------|
| `deckent_init` | Projeyi başlat, dizinleri oluştur, ortam adapter'larını kur | Hayır | Hayır |
| `deckent_set_directives` | DIRECTIVES.md'yi güncelle, sprint hedeflerini tanımla | Hayır | Hayır |
| `deckent_plan` | DIRECTIVES'i oku, task JSON'larını oluştur | Hayır | Hayır |
| `deckent_start` | Sprint'i başlat, worker'ları spawn et | Hayır | Hayır |
| `deckent_status` | Aktif sprint durumunu göster (worker'lar, alertler, ilerleme) | Evet | Hayır |
| `deckent_doctor` | Codebase sağlığını kontrol et, sorunları tespit et | Evet | Hayır |
| `deckent_retro` | Son sprint retrospektifini göster | Evet | Hayır |
| `deckent_history` | Sprint geçmişini listele | Evet | Hayır |
| `deckent_analyze_project` | Proje stack'ini, bağımlılıkları, sağlığı analiz et | Evet | Hayır |
| `deckent_sync` | Konfigürasyon ve manifest'leri senkronize et | Hayır | Hayır |
| `deckent_config` | Konfigürasyon oku veya güncelle | Hayır | Hayır |
| `deckent_review` | Sprint sonucunu değerlendir: GO / NO_GO / GO_WITH_TECH_DEBT | Evet | Hayır |
| `deckent_run` | Tek bir task'ı arka planda çalıştır | Hayır | Hayır |
| `deckent_kill` | Aktif sprint'i veya belirli worker'ları durdur | Hayır | **Evet** |
| `deckent_cleanup` | Task dosyalarını arşivle, sprint'i temizle | Hayır | **Evet** |
| `deckent_help` | Runtime yetenekleri, proje durumu ve kullanım rehberi göster | Evet | Hayır |
| `deckent_agent_list` | Kayıtlı agent'ları listele (built-in ve temp) | Evet | Hayır |
| `deckent_skill_list` | Kayıtlı skill'leri listele (manifest ve AST sandbox info) | Evet | Hayır |
| `deckent_checkpoint` | Checkpoint approve/reject | Hayır | Hayır |
| `deckent_docs` | Sprint lifecycle doküman yönetimi (add/remove/list) | Hayır | Hayır |
| `deckent_explain` | Sprint geçmişini ve sonuçlarını açıkla | Evet | Hayır |
| `deckent_memory_query` | Proje hafızasında cross-source arama (ADR, sprint, debt, pattern) | Evet | Hayır |
| `deckent_watch` | Sprint event'lerini gerçek zamanlı akışla izle | Evet | Hayır |
| `deckent_feature_query` | Özellik manifestini sorgula (active/dormant/dead/all) | Evet | Hayır |
| `deckent_audit` | Herhangi bir sprint için Brain Self-Audit Gate çalıştır | Evet | Hayır |
| `deckent_recover` | Çökmüş veya takılmış sprint'i kurtar | Hayır | **Evet** |
| `deckent_nervous_subscribe` | Nervous System bildirimlerine abone ol | Hayır | Hayır |
| `deckent_nervous_accept` | Bekleyen nervous bildirimini kabul et | Hayır | Hayır |
| `deckent_nervous_reject` | Bekleyen nervous bildirimini reddet | Hayır | Hayır |
| `deckent_nervous_status` | Nervous System mevcut durumunu göster | Evet | Hayır |
| `deckent_nervous_config` | Nervous System detector'larını yapılandır | Hayır | Hayır |
| `deckent_autonomous` | Otonom motor: status/stop/backlog yönetimi | Hayır | Hayır |
| `deckent_models` | Model registry'yi listele (provider/tier/apiId, canlı veri) | Evet | Hayır |
| `deckent_usage` | Token kullanım istatistikleri | Evet | Hayır |

**Toplam: 34 araç** — 20'si salt-okunur (Evet), 14'ü durumu değiştirir (Hayır), 3'ü yıkıcı (kill, cleanup, recover).

---

## 8 MCP Kaynağı

MCP kaynakları, IDE'lerin bağlam penceresine doğrudan çekebileceği yapılandırılmış veri akışlarıdır:

| Kaynak | URI | İçerik | Açıklama |
|--------|-----|--------|----------|
| dashboard | `deckent://dashboard` | JSON | Aktif sprint durumu: worker'lar, fazlar, alertler, metrikler |
| directives | `deckent://directives` | Markdown | Mevcut DIRECTIVES.md içeriği |
| memory | `deckent://memory` | Markdown | Brain bellek özeti: öğrenim, kararlar, desenler |
| debt | `deckent://debt` | Markdown | Teknik borç tablosu: açık ve çözülmüş maddeler |
| config | `deckent://config` | JSON | Güncellenmiş proje konfigürasyonu |
| retro | `deckent://retro` | Markdown | Son sprint retrospektif raporu |
| tasks | `deckent://tasks` | JSON | Mevcut sprint task listesi ve durumları |
| agents | `deckent://agents` | JSON | Kayıtlı agent havuzu, istatistikler, kullanım oranları |

---

## Salt-Okunur / Yıkıcı Ayrımı

MCP araçları iki kritere göre sınıflandırılır:

**Salt-Okunur (ReadOnly: Evet):** Yalnızca mevcut durumu okur, hiçbir dosya veya state değiştirmez. `deckent_status`, `deckent_history`, `deckent_review`, `deckent_retro` gibi araçlar bu kategoridedir. Güvenle çağrılabilir.

**Durum Değiştiren (ReadOnly: Hayır):** Task JSON dosyaları oluşturur, konfigürasyon yazar veya worker spawn eder. `deckent_plan`, `deckent_start`, `deckent_config` örnek verilebilir.

**Yıkıcı (Destructive: Evet):** Geri alınamaz işlemler gerçekleştirir.
- `deckent_kill` — Aktif worker'ları durdurur
- `deckent_cleanup` — Task dosyalarını arşivler, sprint'i temizler
- `deckent_recover` — Çökmüş sprint state'ini sıfırlar

> **Not:** `deckent_kill` ve `deckent_cleanup` canlı sprint üzerinde çalışılırken Alperen onayı olmadan çağrılmamalıdır (proje kısıtı).

---

## Kullanım Örnekleri

```typescript
// Proje başlat
deckent_init({ root: "/path/to/project", projectName: "my-app" })

// Sprint planla (AI modu)
deckent_plan({ mode: "ai", root: "/path/to/project" })

// Sprint başlat
deckent_start({ dryRun: false, root: "/path/to/project" })

// Durum izle
deckent_status({ watch: false, json: false, root: "/path/to/project" })

// Konfigürasyon oku
deckent_config({ action: "read", root: "/path/to/project" })

// Konfigürasyon güncelle
deckent_config({ action: "set", key: "max_workers", value: "4", root: "/path/to/project" })

// Hafıza sorgusu
deckent_memory_query({ query: "docker heartbeat" })
```

---

## MCP Sunucusu Mimarisi

deckent MCP sunucusu `src/mcp/` altında konuşlandırılmış olup `stdio` transport kullanır. Araçlar `src/mcp/tools/` dizininde, kaynaklar ise `src/mcp/resources/` altında modüler olarak tanımlanmıştır.

Kanonnik araç listesi `npm run docs:ref` komutuyla otomatik olarak `docs/reference/mcp-tools.md`'ye yazılır — elle düzenlenmez, koddan üretilir.
