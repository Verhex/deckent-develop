# Tool Surface — Progressive-Disclosure Meta-Tool'ları

> **Config:** `tool_surface.*` (`.deckent/config.json`, top-level) · **Default:** off
> **Kaynak:** `src/core/tool-registry.ts` / `tool-search.ts` / `tool-core.ts` / `tool-dispatch.ts` /
> `tool-scope-gate.ts` + `src/cli/repl/native-tool-registry.ts` · **Doğuş:** sprint-353/354 (354-002)
> **Pivot bağlamı:** Hermes-rol-model "progressive disclosure" (2026-06-29 pivot, TOOL pillar)

## Ne yapar

Native REPL agent'ının tool listesini **kademeli açığa çıkarma** (progressive disclosure) modeline
geçirir. Sorun: onlarca tool'un tamamını her prompt'a gömmek context'i şişirir ve modeli boğar.
Çözüm — Hermes modeli:

1. **Registry** (`tool-registry.ts`): MCP kataloğundan tohumlanan tam tool envanteri.
2. **Core-7 eager set** (`tool-core.ts`): En sık kullanılan 7 çekirdek tool şemasıyla birlikte
   baştan yüklüdür; geri kalan her şey yalnız **isim + tek-satır özet** olan deferred index'te durur.
3. **3 meta-tool** (`native-tool-registry.ts`, REPL'e kayıt): agent gerektiğinde
   `deckent_search_tools` (anahtar kelimeyle keşfet) → `deckent_describe_tool` (tam şemayı getir)
   → `deckent_call_tool` (dispatch köprüsünden çağır) zinciriyle deferred tool'lara ulaşır.
4. **Risk + scope kapıları** (`tool-dispatch.ts` + `tool-scope-gate.ts`): `deckent_call_tool`
   dispatch'i, tool'un risk seviyesi `riskThreshold`'u aşıyorsa reddeder; scope-gate çağrının
   görev kapsamına uygunluğunu denetler.

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `tool_surface.enabled` | `boolean` | `false` | 3 meta-tool'u native REPL tool listesine kaydeder. Kapalıyken (veya blok yokken) hiçbir şey kaydedilmez — mevcut tool listesi değişmez. |
| `tool_surface.riskThreshold` | `ToolRiskLevel` | engine default | `deckent_call_tool` dispatch'inin kabul edeceği azami tool-risk seviyesi. Eşiği aşan tool çağrısı reddedilir (açık hata, sessiz düşme değil). |

## Açınca ne değişir

- REPL agent'ı, prompt'una gömülü olmayan tool'ları arayıp (`search`) şemasını çekip (`describe`)
  çağırabilir (`call`) — context maliyeti sabit kalırken erişilebilir yetenek tüm kataloğa çıkar.
- Çekirdek-7 dışındaki tool'lar artık "yok" değil "sorunca var" durumundadır.

## Kapalıyken garanti

`tool_surface` bloğu yok/`enabled: false` → meta-tool'lar hiç kaydedilmez; native tool listesi
eklenti-öncesiyle aynıdır (354-002 flag-off kanıtı).

## Riskler

- `deckent_call_tool` genel bir dispatch kapısıdır — risk eşiği bilinçli seçilmelidir; yüksek
  eşik + geniş katalog, agent'a geniş eylem yüzeyi verir. Riskli tool'lar için asıl canlı-onay
  katmanı [approval-runtime.md](approval-runtime.md)'dir.
- Deferred index tool açıklamalarına dayanır; kalitesiz açıklama = keşfedilemeyen tool.

## Kanıt

- Testler: tool-registry/search/core/dispatch/scope-gate aileleri + REPL kayıt testi (354-002).
- Dogfood: **2026-07-02'den beri `enabled: true`** (deckent-dev `.deckent/config.json`).
