# SURF-4 · D4-0 — Art-Direction: «KÖPRÜÜSTÜ» (✅ ONAYLANDI)

> **Durum:** ✅ Alperen onayladı (2026-07-16): yön «Köprüüstü» + a11y `react-aria-components@1.19.0` + `zustand@5.0.14`.
> **Görsel (artifact, ekran görüntülü):** https://claude.ai/code/artifact/803cc102-438b-4c5d-9bd7-50b37f8a410a
> **Etkileşimli önizleme (gerçek fontlar + canlı demolar):** `docs/analysis/surf4-d4-0-art-direction-preview.html`
> **Tarihçe:** İlk tur 3 aday (Kontrol Kulesi · Partisyon · Şalter Odası) sunuldu → Alperen üçünü de reddetti; yeni tohum: *"gemi-güverte kavramları, teknolojik ama yapay olmayan, özgün; birden fazla temalı, sade ama unique"*. İlk turun kaydı git-geçmişinde; imza-fikirleri yeni dile katlandı (guard-şalter → telgraf, playhead → rota).

---

## Yön: «Köprüüstü» (seyir)

**Kavram-eşlemesi (deckent'in adından):** deckent = **deck** (güverte). Uygulama köprüüstüdür —
flow = **rota** · sprint = **sefer** · event-log = **seyir defteri** ("log" kelimesi denizcilikten) · onay = **telgraf kolu** · worker'lar = **vardiya görevlileri** · tamamlanan faz = **mevki koyma (fix)** · test-koşusu = **iskandil** (derinlik ölçümü).

**"Teknolojik ama yapay olmayan":** renkler gerçek seyir haritalarının mürekkeplerinden; formlar alet-gerçekliğinden; doku/süs yok.

### Palet — gerçek seyir haritasından
`#F2EDDC` kara/buff · `#BDD7E2` sığ-su · `#2B2F33` mürekkep · **`#C2447C` magenta** (kâğıt haritaların GERÇEK vurgu mürekkebi — gece kırmızı ışıkta okunur; vurgunun gece-temasında kırmızılaşması metafor değil fizik) · `#A98F54` pirinç · `#12151A` gece.

### Vardiyalar — çok-tema kimliğin parçası (süs değil)
1. **Gündüz seyri** (varsayılan): chart-buff zemin, ferah, kâğıt-sıcaklığı.
2. **Gece seyri**: köprüüstünün gerçek kırmızı-ışık disiplini — gece görüşünü bozmayan kırmızıya-kaçık vurgular, bastırılmış mavi.
3. **Açık deniz**: derin-su koyu-mavisi — klasik koyu-tema isteyene.
D4-1 bu üçünü 3-katman CSS-vars token'ı olarak kurar; kullanıcı-özelleştirme aynı token yüzeyinden.

### Tipografi
Display **Bricolage Grotesque** (teknolojik ama eli-değmiş, organik-detaylı grotesk — "yapay olmayan"ın tipografik karşılığı) · Gövde **Hanken Grotesk** (hümanist) · Veri **Geist Mono** (harita-etiketi, tabular).

### Agentic hareket ilkeleri — deniz ritmi
1. **Süzülme, sıçrama değil** — geçişler atalet taşır (uzun ease-out ~240ms); hiçbir şey belirmez, *yanaşır*.
2. **Rota akar** — canlı flow'un kesikli hattı sabit hızda ilerler; durunca çizgi durur (canlılık tek yerden okunur).
3. **Mevki koyma** — tamamlanan faz haritaya kalıcı nokta koyar; geçmiş asla oynamaz.
4. **Telgraf snap'i** — karar kolları konumludur, ara-durumsuz. (reduced-motion: tüm süzülmeler kapalı, konumlar anlık)

### İmza etkileşimler
- **«Rota»** (birincil): flow'un yaşamı harita üstünde seyir hattı — kesikli magenta rota canlıyken akar, fazlar mevki-noktaları (dolu=geçildi, boş=ileride), tekne imi="şimdi", hover=o mevkinin olay kaydı.
- **«Telgraf»** (onay dili): DUR → AĞIR YOL (dry-run) → TAM YOL (--run --yes); kol çekilir, makine dairesi cevap verir.

---

## Kütüphane kilitleri

| Kütüphane | Versiyon | Karar |
|---|---|---|
| **zustand** | 5.0.14 | ✅ KİLİTLİ (stabil v5, React-19 peer ✓) |
| **react-aria-components** | 1.19.0 | ÖNERİ — Alperen onayı bekleniyor |

### A11y kapsamlı karşılaştırma (kriterler: stil-özgürlüğü › stabilite › çok-tema › i18n › focus-derinliği)
| Aday | Sürüm | Stabil | Stil-özgürlüğü | i18n | Bakım | Sonuç |
|---|---|---|---|---|---|---|
| **react-aria-components** | 1.19.0 | ✔ | TAM (davranış-only; `[data-*]` state'leri düz CSS'ten) | ✔ yerleşik (30+ dil aria-metni, TR dahil) | Adobe, aylık | **ÖNERİ** |
| Radix Primitives | 1.1.x | ✔ | yüksek (bazı yapı-varsayımları) | ✘ | 2025'te yavaşladı | dashboard/shadcn çağrışımı |
| Base UI | 1.0.0-rc | ✘ RC | tam | ✘ | aktif | "stabil, bir kez seç"e takılır |
| Ariakit | 2.0-next | ✘ | tam | ✘ | tek-bakımcı | v2 çıkmadı |
| Headless UI | 2.2.x | ✔ | tam | ✘ | dar odak | bileşen seti dar |
| Kütüphanesiz | — | — | mutlak | elle | — | focus-trap/roving-tabindex elle = maliyet+risk |

---

## Karar (2026-07-16)

- **Yön «Köprüüstü»:** ✅ ONAYLANDI. Guardrail: metafor DİLDE yaşar, süste değil — "sade ama unique" ilkesi D4-4 boyunca korunur (aşırı-temalaştırma yasak).
- **A11y kilidi:** ✅ `react-aria-components@1.19.0` (tek tam style-free aday + yerleşik TR-dahil i18n aria-metinleri + Adobe bakımı + React-19 peer).
- **UI-state kilidi:** ✅ `zustand@5.0.14`.
- Sıradaki: **D4-1** — üç vardiyanın (gündüz-seyri/gece-seyri/açık-deniz) 3-katman CSS-vars token mimarisi + runtime tema-switch + preferences-store → D4-2 i18n → D4-3 shell/router/transport → D4-4 dört kabuk bu dille.
