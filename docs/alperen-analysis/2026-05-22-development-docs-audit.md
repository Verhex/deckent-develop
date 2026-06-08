# `docs/development/` Audit — Geliştirici Kılavuzları — 2026-05-22

**Kapsam:** `docs/development/` altındaki 6 geliştirici kılavuzu — doğruluk, güncellik, kod-gerçeğiyle tutarlılık  
**Metodoloji:** Sistematik debugging — her doc iddiası kod/dosya gerçeğine karşı grep + dosya kontrolü ile doğrulandı  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı (OSS okuyucu)

---

## Genel Tablo

| Doküman | Satır | Durum | Özet |
|---------|-------|-------|------|
| `agent-guide.md` | 159 | 🔴 **Ağır stale** | 8 agent (gerçek 15), `test-writer` (kaldırıldı), V1 `agent.json` şeması, V1 keyword routing |
| `brain-guide.md` | 218 | 🔴 **Ağır stale** | Pre-Memory-V2 + pre-controller-split; `.brain/DECISIONS.md`, `MEMORY.md 300` (gerçek 1500), kırık linkler |
| `troubleshooting.md` | 664 | 🔴 **Ağır stale** | "Last updated: Sprint 065" (~120 sprint); Node ≥18 (gerçek ≥24), budget 600 (gerçek 900), MCP komutu yanlış |
| `dashboard-guide.md` | 258 | 🟡 **Orta stale** | 4 web sayfası (gerçek 7), API tablosu eksik, kırık linkler; çekirdek içerik makul |
| `plugin-guide.md` | 731 | 🟡 **Hafif stale** | Hook sistemi doğru; ama §7 olmayan komutları (`enable`/`disable`) belgeliyor, 3 gerçek komutu atlıyor |
| `worker-guide.md` | 3 | ✅ **Sağlam** | Bilinçli 3-satır redirect → `docs/guide/workers.md` (mevcut) |

---

## Kesişen Sorun — Kırık Cross-Reference'lar

`development/*.md` içindeki `.md` linkleri diskte doğrulandı:

| Link | Hedef | Durum |
|------|-------|-------|
| `](../DECKENT-MASTER-BLUEPRINT.md)` | `docs/DECKENT-MASTER-BLUEPRINT.md` | ❌ YOK (kaldırılmış/yeniden adlandırılmış) |
| `](ARCHITECTURE.md)` | `docs/development/ARCHITECTURE.md` | ❌ YOK |
| `](API.md)` | `docs/development/API.md` | ❌ YOK |
| `](CONFIG-REFERENCE.md)` | `docs/development/CONFIG-REFERENCE.md` | ❌ YOK |
| `](TROUBLESHOOTING.md)` | `docs/development/TROUBLESHOOTING.md` | ❌ case-mismatch — gerçek dosya `troubleshooting.md` (Linux case-sensitive) |
| `](../.claude/rules/brain.md)` | `docs/.claude/rules/brain.md` | ❌ yanlış derinlik — repo kökü için `../../.claude/rules/brain.md` gerekir |
| `](../guide/workers.md)` | `docs/guide/workers.md` | ✅ VAR |

`brain-guide.md` + `dashboard-guide.md` "Reference:" başlıkları neredeyse tümüyle ölü link. `troubleshooting.md` da `DECKENT-MASTER-BLUEPRINT.md` referansı veriyor.

---

## Tespit Edilen Sorunlar (doküman bazında)

### agent-guide.md — 🔴 Defunct sürümü anlatıyor

**Kök Neden:** Doküman ADR-041 agent reformu (Sprint 148/166) ve V1→V2 manifest migration'ından önce yazılmış, hiç güncellenmemiş.

- **§2 "8 Agents":** Gerçek **15** built-in agent (`src/core/builtins/agents/` = 15 dizin, doğrulandı). Listelenen 8'in 4'ü yanlış: `test-writer` (ADR-041 ile **kaldırıldı**), `performance-optimizer` (gerçek: `performance-analyzer`), `api-designer` (gerçek: `api-builder`), `devops-agent` (gerçek: `devops-engineer`).
- **§4 `agent.json` şeması:** Doküman V1 şemasını anlatıyor (`triggers[]`, `weight`, `stats{}`). Gerçek builtin (`security-auditor/agent.json`) **V2**: `manifestVersion: 2`, `activation.rules[{when, score}]`, `exclude[]`. Tamamen farklı.
- **§3 "Selection Algorithm":** Keyword-trigger skorlama (`triggerHits * weight + stackBonus`) anlatıyor — bu **V1 routing** (decision-engine, ADR-028 ile deprecated). Gerçek: V2 intent-based routing (`routing-engine.ts`, `intent-classifier.ts`, `routeTaskV2`).
- `deckent agent stats` (argümansız) — gerçek CLI `stats <name>` (isim zorunlu); `list`/`edit` belgelenmemiş.

**Durum:** Belgelendi — tam yeniden yazım gerekiyor (öneri #1).

---

### brain-guide.md — 🔴 Pre-Memory-V2 + pre-controller-split

**Kök Neden:** Memory V2 (DB-first) ve `sprint-controller.ts` ayrımından önceki mimariyi anlatıyor.

- **"Brain (`brain.ts`) is the sole orchestrator":** Gerçekte `brain.ts` re-export katmanı; lifecycle `sprint-controller.ts`'te (DECKENT.md mimari).
- **`.brain/DECISIONS.md` / `.brain/DEBT.md` / "appends to MEMORY.md":** Memory V2 **DB-first** — `.brain/memory.db` tek kaynak, `.md`'ler generated export. Bu yollar artık `archive/pre-v2/` veya `exports/`.
- **3-Tier tablo "MEMORY.md 300 satır":** Gerçek `MEMORY_MAX_LINES = 1500` (`constants.ts:67`, 300→1500 5x bump).
- **`.contracts/api-surface.md`:** Phantom yol — gerçek dosya `docs/reference/api-surface.md` (`.contracts/` hiç oluşturulmuyor; cost-config + init audit'lerinde de görüldü).
- GO/NO-GO bölümü basit `coverage < 90` mantığı anlatıyor — gerçek `result-evaluator` rubric scoring + CODE_VERIFIED_DONE + TECH_DEBT downgrade içeriyor.
- Kırık linkler: `ARCHITECTURE.md`, `CONFIG-REFERENCE.md`, `DECKENT-MASTER-BLUEPRINT.md`, `../.claude/rules/brain.md`.

**Durum:** Belgelendi — yeniden yazım gerekiyor (öneri #1).

---

### troubleshooting.md — 🔴 Sprint 065'te donmuş (~120 sprint stale)

**Kök Neden:** Başlıkta açıkça "Last updated: Sprint 065 (2026-03-26)". Mevcut sprint 186.

- **Node.js ≥18:** Gerçek **≥24** (`entry.ts:10` `< 24` guard, IDENTITY.md "Node.js >=24.0.0"). 5+ yerde ≥18 (satır 41/48/61/159/638).
- **Brain Budget 600 satır:** Gerçek **900** (`debt-manager.ts:523` `budget = 900`). Satır 214/221/645 hep 600.
- **MCP kayıt JSON'u (satır 322-329):** `{ "command": "deckent", "args": ["mcp"] }` — **yanlış** (BUG-18). Doğru: `deckent-mcp`, `args: []`. Çok-satırlı olduğu için önceki 17-dosyalık BUG-18 düzeltmesi bunu atladı.
- Ölü referanslar: `DECKENT-MASTER-BLUEPRINT.md`, `.contracts/api-surface.md`, `.brain/DECISIONS.md`/`.brain/DEBT.md` (Memory V2).

**Durum:** Belgelendi — yeniden yazım + tarih damgası güncelleme gerekiyor (öneri #1).

---

### dashboard-guide.md — 🟡 Orta stale

- **Web sayfaları:** Doküman 4 sayfa (Dashboard/History/Settings/Memory). Gerçek **7** (`src/dashboard/src/pages/`: Chat, Config, Dashboard, History, Memory, Settings, Status). IDENTITY.md de "Dashboard Pages: 7".
- **API tablosu eksik:** `server.ts`'te var ama tabloda yok: `/api/chat`, `/api/health`, `/api/config/defaults`, `/api/tasks`. Belgelenen endpoint'ler mevcut.
- Kırık linkler: `ARCHITECTURE.md`, `API.md`, `TROUBLESHOOTING.md` (case).
- Çekirdek içerik (TUI, SSE, auditor 30s döngüsü, DashboardState şeması) makul.

**Durum:** Belgelendi — sayfa sayısı + API tablosu + linkler güncellenmeli (öneri #2).

---

### plugin-guide.md — 🟡 En sağlamı, ama komut listesi yanlış

- **Hook sistemi doğru:** `plugin-hooks.ts:20` `PluginHook = 'beforeSprint'|'afterSprint'|'beforeTask'|'afterTask'` — dokümanla birebir. Hook context tipleri makul.
- **§7 komut listesi yanlış:** Doküman `deckent plugin enable`/`disable` belgeliyor — bu komutlar **yok**. Gerçek `plugin.ts` subcommand'ları: `install`, `remove`, `update`, `list`, `info`, `test`, `create`. Yani `update`/`info`/`test` belgelenmemiş, `enable`/`disable` hayalet.
- manifest.json formatı + SKILL.md rehberi makul (plugin sistemi `core/plugin.ts` + `plugin-loader.ts` + `plugin-hooks.ts` ile gerçek).

**Durum:** Belgelendi — §7 komut tablosu düzeltilmeli (öneri #2).

---

### worker-guide.md — ✅ Sağlam

3-satır bilinçli redirect stub → `docs/guide/workers.md` (mevcut, doğrulandı). Değişiklik gerekmiyor.

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- `worker-guide.md` doğru redirect deseni — diğerleri için de model olabilir (tek kaynak + redirect).
- 4 kılavuz (agent/brain/troubleshooting + kısmen dashboard) kod-gerçeğinin onlarca sprint gerisinde.

**Kullanıcı perspektifi (kritik):**
- `docs/development/` bir OSS okuyucusunun ilk başvuracağı yer. Mevcut hâliyle **yanlış bilgi yayıyor**: olmayan agent'lar, yanlış `agent.json` şeması, yanlış Node sürümü, çalışmayan MCP kayıt komutu, ölü linkler.
- Bu, ground-truth/doc-sync savunmasının (Sprint 166 Bug Y2) tam da engellemeye çalıştığı "stale sayısal/yapısal iddia" sınıfı — ama o savunma yalnızca task açıklamalarını tarıyor, statik `docs/`'u değil.

---

## Gelecek Öneriler

1. **3 kılavuz yeniden yazılmalı veya redirect'e indirgenmeli:** `agent-guide.md`, `brain-guide.md`, `troubleshooting.md` kod-gerçeğiyle baştan hizalanmalı. Alternatif: `worker-guide.md` gibi `docs/guide/` veya `docs/reference/` altındaki canonical sayfalara redirect — eğer içerik orada zaten varsa. Bu kılavuzların stale kalma eğilimi yüksek; tek-kaynak + redirect daha sürdürülebilir.
2. **Orta düzeltmeler:** `dashboard-guide.md` sayfa sayısı 4→7 + API tablosu tamamlama; `plugin-guide.md` §7 komut tablosu (`enable`/`disable` çıkar, `update`/`info`/`test` ekle).
3. **Kırık link taraması:** `ARCHITECTURE.md`/`API.md`/`CONFIG-REFERENCE.md`/`DECKENT-MASTER-BLUEPRINT.md` referansları kaldırılmalı veya mevcut hedeflere (`docs/reference/`) repoint edilmeli; `TROUBLESHOOTING.md` → `troubleshooting.md` case fix; `../.claude/` → `../../.claude/`.
4. **MCP kayıt JSON'u (troubleshooting.md:322-329):** BUG-18 — `deckent`+`["mcp"]` → `deckent-mcp`+`[]`. Yeniden yazımda mutlaka düzeltilmeli.
5. **Doküman link-lint CI:** VitePress dead-link kontrolü veya basit bir `docs/` link-checker CI adımı, bu sınıf regresyonu önler.

---

## Kapanış

Audit 2026-05-22'de kapatıldı. `docs/development/` 6 kılavuzu kod-gerçeğine karşı doğrulandı. **1 sağlam** (`worker-guide.md` redirect), **2 orta stale** (`dashboard-guide.md`, `plugin-guide.md` — nokta düzeltmeler), **3 ağır stale** (`agent-guide.md`, `brain-guide.md`, `troubleshooting.md` — defunct mimari/sürüm anlatıyor, yeniden yazım gerekiyor). Kesişen sorun: 5+ kırık cross-reference. Bu tur **kod/doküman değişikliği yapılmadı** — saf analiz; düzeltme kapsamı (3 kılavuz yeniden yazımı) ayrı bir karar/efor olduğu için "Gelecek Öneriler"e bırakıldı. Tüm bulgular grep + dosya kontrolü ile kanıtlandı.
