# `.deckent/cost-config.json` Audit — Parametrik Maliyet Sistemi — 2026-05-22

**Kapsam:** `.deckent/cost-config.json` — ne olduğu, içeriği, veri akışı (kim besler / kimi besler), tutarlılığı  
**Metodoloji:** Sistematik debugging (kanıt → kök neden → düzeltme); tüm iddialar grep/diff/kod okuması ile doğrulandı  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı

---

## Bu Dosya Nedir

`.deckent/cost-config.json` — Deckent'in **parametrik maliyet yönetimi** config'i (Sprint 141 `141-SAFE-01`). **Zero-hardcode ilkesi:** tüm AI provider fiyatları, rate-limit'leri, context-window'ları ve bütçe limitleri bu dosyadan okunur — kaynak kodda hiçbir fiyat sabit değildir.

İçerik (4 blok):
| Blok | İçerik |
|------|--------|
| `providers` | anthropic / openai / google — model başına per-token fiyat, cache fiyatları, context limitleri, `deckent_tier`, `deckent_aliases`, rate-limit tier'ları, subscription-tracking |
| `cost_limits` | `sprint_max_usd`, `daily_max_usd`, `monthly_max_usd`, `auto_confirm_below_usd`, alert eşikleri |
| `update_config` | `sources_priority` (litellm → openrouter → bundled), kaynak URL'leri, delta toleransı |
| `_meta` | `_version`, `_last_updated`, `_update_source`, `_user_notes` |

**Git durumu:** `.deckent/cost-config.json` git-tracked — deckent-dev dogfood projesinin kendi config'i.

---

## Veri Akışı — Nereden Beslenir / Nereyi Besler

### Nereden beslenir (3 kaynak)
1. **Bundled baseline** — `src/core/pricing-data-baseline.json` → build'de `dist/core/`'a kopyalanır (`scripts/copy-assets.mjs`). `initCostConfig()` projeye kopyalar; dosya yoksa `loadCostConfig()` baseline'ı **in-memory fallback** olarak kullanır (ADR-033 offline-first → `npx deckent` zero-setup çalışır).
2. **`deckent cost update`** — `pricing-updater.ts` `updatePricing()` → LiteLLM JSON (GitHub raw) / OpenRouter API'den fiyat çeker → `mergeConfigs()`: model pricing üzerine yazılır, `cost_limits` / `update_config` / `deckent_tier` / `deckent_aliases` / `enabled` **korunur**.
3. **Kullanıcı** — manuel JSON edit veya `deckent cost --set/--daily/--monthly` (`cli/commands/cost.ts`).

### Nereyi besler (3 tüketici)
1. **`cost-calculator.ts`** — `estimateSprintCost()` → sprint maliyet tahmini (3-katman: naive / realistic / worst-case; cache-hit + retry modellemesi).
2. **`start.ts` cost GATE** — sprint başlamadan plan + tahmin yapılır → `!withinBudget` ise sprint **bloke edilir** (`process.exitCode = 1`); `auto_confirm_below_usd` üstündeyse onay promptu.
3. **`cost.ts`** — `deckent cost` komutu — model/fiyat/limit görüntüleme + güncelleme.

```
pricing-data-baseline.json ──┐
deckent cost update (web)  ──┼──> .deckent/cost-config.json ──> cost-calculator ──> start.ts cost GATE
kullanıcı edit / --set     ──┘         (cost-config-loader)  └─> deckent cost (görüntü)
```

---

## Çekirdek Tasarım — Sağlam Olan

- **Zero-hardcode:** Fiyatlar yalnızca config'te; kaynak kodda sabit yok.
- **Unit safety pin:** `validateCostUnit()` — `costPerToken > 0.01` → throw. Sprint 140 "$42 felaketi" koruması (per-MTok ↔ per-token karışıklığı 1.000.000× hata yaratır).
- **Offline-first:** Bundled baseline + in-memory fallback → ağ olmadan çalışır.
- **Hot-reload:** `loadCostConfig()` mtime kontrolüyle dosya değişince yeniden okur.
- **Validation:** `validateCostConfig()` — şema + her model için unit-check. `cost-config-schema.json` yapısal JSON schema.
- **Gerçek enforcement:** `start.ts` cost gate over-budget sprint'i fiilen bloke ediyor (advisory değil).

---

## Tespit Edilen Sorunlar

### Sorun 1 — cost-config Model Listesi ⊄ model-registry (senkronizasyon yok)

**Öncelik:** Orta  
**Kök Neden:** İki ayrı model kaynağı var — `model-registry.ts` (routing, **13 model**) ve `cost-config.json` (pricing, **11 model**) — senkronizasyon mekanizması yok. Farklar:
- `model-registry`'de olan, cost-config'te **olmayan:** `gpt-4.1`, `o4-mini`, `gpt-4.1-mini`.
- cost-config'te olan, registry'de olmayan: `gpt-5-nano`.
- `gemini-3.1-pro-preview` (registry id) — cost-config key `gemini-3-1-pro-preview`, alias'ları `gemini-3.1-pro`/`gemini-3-pro` → registry id alias'larda **yok**.

**Etki:** Bu modellerle task → `cost-calculator` `findModel()` null döner → `calculateTaskCost` null → "Unknown model — skipped in estimation" uyarısı → cost GATE bu task'ları **$0 sayar** → over-budget bir sprint gate'i geçebilir (`withinBudget = totalApiCostUsd <= budgetUsd`, eksik task'lar toplama girmiyor). Etki **sınırlı**: default Claude akışı (opus/sonnet/haiku `deckent_aliases` ile bulunuyor) doğru; gap yalnızca Codex `gpt-4.1`/`o4-mini`/`gpt-4.1-mini` + `gemini-3.1-pro-preview` kullanımında.

**Durum:** Belgelendi — bkz. Gelecek Öneriler #1.

---

### Sorun 2 — `deckent_tier` Değerleri model-registry Tier'larıyla Çelişiyor

**Öncelik:** Düşük (kozmetik)  
**Kök Neden:** cost-config `deckent_tier` ile `model-registry.ts` `tier` (= DECKENT.md tier tablosu) 4 modelde sapıyor:

| Model | cost-config | model-registry |
|-------|-------------|----------------|
| gpt-5-mini | `standard` | `economy` |
| gemini-3-1-pro-preview | `premium` | `premium_plus` |
| gemini-2-5-pro | `standard` | `premium` |
| gemini-2-5-flash | `economy` | `standard` |

**Etki:** `deckent_tier` yalnızca `cost.ts:60`'da `deckent cost` çıktısında **görüntüleniyor** — routing'de kullanılmıyor. Yani `deckent cost` bu 4 model için yanlış tier gösterir. İşlevsel routing etkisi yok.

**Durum:** Belgelendi — bkz. Gelecek Öneriler #2.

---

### Sorun 3 — `cost-config-loader.ts` Docstring Yanlış

**Öncelik:** Trivial  
**Kök Neden:** `initCostConfig()` docstring'i "Called by `deckent init` and lazily by `loadCostConfig`" diyordu. Doğrulama: `initCostConfig` çağıranları yalnızca `deckent start` + `deckent cost`; `deckent init` çağırmıyor, `loadCostConfig` da çağırmıyor (in-memory fallback yapıyor).

**Durum:** Düzeltildi — docstring gerçek çağrı noktalarıyla güncellendi.

---

### Sorun 4 — `.deckent/cost-config.json` ↔ Baseline Farkı (sorun değil — not)

**İnceleme:** `.deckent/cost-config.json` ile `src/core/pricing-data-baseline.json` derin karşılaştırıldı (format/meta hariç): **11 model birebir aynı**, fiyatlar aynı. Tek anlamlı fark `cost_limits.sprint_max_usd` — baseline `5`, proje config `3.5`. Bu deckent-dev'in **bilinçli bütçe override'ı** (`mergeConfigs` `cost_limits`'i korur). Stale değil. Kalan farklar yalnızca JSON formatı (`5e-7` ↔ `0.0000005`, çok-satır dizi).

**Durum:** Sorun yok — belgelendi.

---

## Uygulanan Değişiklikler

| Dosya | Değişiklik |
|-------|-----------|
| `src/core/cost-config-loader.ts` | `initCostConfig` docstring'i gerçek çağrı noktalarıyla düzeltildi (Sorun 3) |

**Doğrulama:** Tüm iddialar grep + JSON deep-diff + kod okumasıyla doğrulandı. Bundled baseline `src/core/` + `dist/core/` ikisinde de mevcut (10186 byte, copy-assets aktif).

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- Parametrik maliyet sistemi sağlam tasarım — zero-hardcode, unit-safety pin, offline-first.
- İki model kaynağı (`model-registry` + `cost-config`) senkron değil — dogfood'da Claude akışı etkilenmiyor ama mimari borç.

**Kullanıcı perspektifi:**
- `npx deckent` zero-setup çalışır (bundled baseline fallback).
- Codex `gpt-4.1`/`o4-mini`/`gpt-4.1-mini` veya `gemini-3.1-pro-preview` kullanan kullanıcı için cost gate eksik tahmin yapar (Sorun 1) — `deckent cost update` ile kısmen kapanabilir.
- `cost_limits` + cost gate gerçek koruma sağlıyor; over-budget sprint bloke ediliyor.

---

## Gelecek Öneriler

1. **Model listesi senkronizasyonu (Sorun 1):** `cost-config` model seti `model-registry` ile hizalanmalı — eksik `gpt-4.1`/`o4-mini`/`gpt-4.1-mini` eklenmeli (doğrulanmış LiteLLM/OpenAI pricing ile — `deckent cost update` LiteLLM'de varsa otomatik çeker), `gemini-3.1-pro-preview` registry id'si cost-config alias'larına eklenmeli. İdeal: `cost-calculator` model bulamadığında sessizce $0 saymak yerine cost gate'i **uyarıyla bloke etmeli** (eksik model = bilinmeyen maliyet = güvenli taraf).
2. **`deckent_tier` hizalama (Sorun 2):** cost-config'teki 4 yanlış tier değeri `model-registry`'ye (routing source-of-truth) göre düzeltilmeli — `.deckent/cost-config.json` + `src/core/pricing-data-baseline.json` ikisinde de.
3. **Tek model source-of-truth:** Uzun vadede `cost-config` model meta'sı (`deckent_tier`, `deckent_aliases`, context limitleri) `model-registry` ile tek kaynağa indirgenmeli — `cost-config` yalnızca fiyat/limit taşımalı.

---

## Kapanış

Audit 2026-05-22'de kapatıldı. `.deckent/cost-config.json` = Deckent'in parametrik maliyet config'i; bundled baseline + `deckent cost update` (LiteLLM/OpenRouter) + kullanıcı edit'inden beslenir; `cost-calculator` → `start.ts` cost gate + `deckent cost`'u besler. Çekirdek tasarım sağlam (zero-hardcode, unit-safety pin, offline-first). **4 sorundan 1'i düzeltildi** (Sorun 3 docstring), 1'i sorun değil (Sorun 4), 2'si belgelendi (Sorun 1 model-list senkronu — orta öncelik; Sorun 2 tier — kozmetik). Kalan maddeler "Gelecek Öneriler"de izleniyor.
