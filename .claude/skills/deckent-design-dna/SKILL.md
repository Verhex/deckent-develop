---
name: deckent-design-dna
description: Use FIRST in any deckent design session — UI/UX work on terminal TUI, dashboard, desktop (NOVA), or Claude Design assets. Loads the approved design constitution, cross-surface rules, the anti-template ban list and the mandatory session process.
---

# Deckent Design DNA — Tasarım Anayasası (operasyonel özet)

> **Authority zinciri:** SSOT = `docs/analysis/desktop-reborn-soru-seti-2026-07-18.md` → "✅ TASARIM-ANAYASASI"
> bölümü (Alperen, 2026-07-18) + DESIGN-SYSTEM-001 kararı (Alperen, 2026-07-31: **kimlik = A —
> NOVA-çekirdek üç yüzeye genişler**). Çelişkide SSOT doküman kazanır; bu skill onun çalışma-özeti.
> Tarihçe/miras: `docs/analysis/surf4-d4-0-art-direction-2026-07-16.md` (Köprüüstü — görsel yönü
> superseded, guardrail'leri yaşıyor).

## 1 · Kimlik çekirdeği (NOVA)

- **Metafor: SAF-JARVIS HUD.** Deniz metaforu görselden emekli; "dalga" yalnız teknik osiloskop
  olarak yaşar. Literal gemi/çapa/harita süsü YASAK.
- **Canlılık: nefes-alan HUD.** Boşta sakin ambient (düşük ışıma); koşu başlayınca sahne uyanır.
  Canlılık gerçek telemetriden beslenir — sahte animasyon canlılığı yasak.
- **Renk: koyu TEK-kimlik + ışıma (glow) accent.** Tema = yoğunluk-varyantları; watch mirası
  (`nova` default · day-watch · night-watch · open-sea) motor-mirası olarak `theme-tokens.ts`'te.
- **Adlar Jarvis-nötr:** Komuta · Akışlar · Onaylar · Terminal · Değişiklikler · Bellek · Insights ·
  Ayarlar. Köprüüstü sahne-adları emekli; i18n kökü yeni adlarla.
- **Etkileşim:** Cmd/Ctrl+K birincil + ince ikon-ray; **her fiil çift-yol** (konuşma-emri + yüzey
  düğmesi); tehlikeli fiiller çift-onay + mandal.
- **Render:** Canvas sahne + DOM UI hibrit (60fps, yüzlerce worker ölçeği — Yasa-2).
- **Doğrulama: GERÇEK-VERİ prototipi zorunlu** — koşan daemon'a bağlı; statik mock YASAK.
  Beğenilmeyen tur ÇÖPE gider; yamalama yok.

## 2 · Tipografi

> **DURUM (Alperen, 2026-07-31): mevcut set REDDEDİLDİ** — "hiçbiri kabul edilmedi; çok klasik;
> tamamen değişmeli". Aşağıdaki tablo yalnız kodun bugünkü envanteridir; YENİ tasarım işinde bu
> fontlar referans alınmaz. Yeni font-yönü aday turu (özgün, klasik-dışı; TR tam destek; OFL
> self-host edilebilir; display+gövde+mono üçlüsü) Alperen seçimine sunulacak — seçim sonrası
> `font.*` token'ları ve tüm yüzeyler birlikte döner.

| Rol | Font (REDDEDİLEN mevcut-durum) | Not |
|---|---|---|
| Display | Bricolage Grotesque | kod envanteri |
| Gövde | Hanken Grotesk | kod envanteri; dashboard'la ortak |
| Veri/mono | Geist Mono (desktop) · IBM Plex Mono (dashboard) | kod envanteri |

## 3 · Renk & token authority

- Renk değerlerinin TEK kaynağı token SSOT'udur (bkz. `design-tokens-pipeline` skill). Bu dosya
  hex taşımaz; taşıyan her yer (kod, preview, doc) üretilmiş çıktıdır.
- Miras-arşiv (yeniden kullanmadan önce Alperen onayı): seyir-haritası paleti (chart-magenta,
  brass, buff — D4-0), dashboard Decko teal/gold (`src/dashboard/src/index.css` @theme).
- NOVA accent-ailesi prototip-turunda birlikte seçilir; seçilene kadar accent "aday" statüsündedir.

## 4 · Motion

- **"Süzülme, sıçrama değil":** geçişler atalet taşır (~240ms, uzun ease-out); hiçbir şey belirmez,
  *yanaşır*. Karar/latch etkileşimleri ise ara-durumsuz **snap**'tir (telgraf mirası).
- Faz sahnenin ışık-tonunu yaşar (EXECUTE=canlı · EVALUATE=süzülen · FIX=uyarı-tonu).
- `prefers-reduced-motion` HER animasyonu kapatır; konumlar anlık. Terminalde eşdeğeri:
  spinner/akış animasyonları TTY-degrade ve `NO_COLOR`/dumb-term'de sessizleşir.

## 5 · Üç-yüzey kuralları

| Yüzey | Bağlayıcı kurallar |
|---|---|
| **Terminal/TUI** | ADR-G-010: zengin çok-bölümlü çıktı, ANSI + `NO_COLOR`, **emoji-ikon yasak**; truecolor→256→16 dürüst degrade; tek palet SSOT hedefi (DT-5 kapanışı — `design-tokens-pipeline`) |
| **Dashboard** | ADR-G-033: yalnız observability (ikinci execution engine yok); Tailwind v4 `@theme` — renk yalnız token utility'si, component içinde çıplak hex yasak |
| **Desktop** | 3-katman token (`--dk-p-*` → `--dk-s-*` → `--dk-c-*`, primitives CSS'e sızmaz); `react-aria-components` davranış katmanı; glow altında **efektif-kontrast** gate (nova-contrast yaklaşımı) |

Ortak omurga: i18n (`src/cli/helpers/messages.ts` — desktop dahil; dashboard kendi `i18n/`'i) —
**i18n-FIRST**: kullanıcıya görünen string hardcode edilmez; mekanizma modülleri string-free.

**Kişiselleştirme birinci-sınıf (Alperen, 2026-07-31):** Desktop «Ayarlar» sahnesi tema/vardiya +
**font** + accent kullanıcı-seçimi sunar (MASTER-PLAN: DESKTOP-CUSTOMIZE-001). Sonuç-kural: her
kimlik seçimi — font dahil — token katmanından **runtime-switchable** tasarlanır; hiçbir yüzeyde
hardcoded `font-family`/renk olamaz, seçenek eklemek = token-set eklemek olmalıdır.

## 6 · Anti-şablon YASAK listesi ("uniq"liğin negatif-uzayı)

Aşağıdakiler tespit edildiği anda tasarım turu FINDINGS ile döner (bkz. `design-critic` agent):

1. **"AI developer tool" klişesi:** OLED-siyah + matrix-yeşili accent + Fira Code/JetBrains Mono
   kombinasyonu; scanline/CRT/glitch süsleri.
2. **"AI SaaS" klişesi:** Inter + mor/mavi gradyan + glassmorphism kartlar + emoji-ikonlar.
3. **Varsayılan-shadcn görünümü:** zinc paleti + default radius + default gölgelerle bırakılmış,
   kimliksiz component'ler.
4. **Stok landing kalıpları:** hero + 3-feature-grid + testimonial + pricing şablonu; sahte
   social-proof; "sparkle" AI-ikonu.
5. **AI-slop metin sesi:** "Unleash/Empower/Seamless/Revolutionize…", TR karşılıkları
   ("gücünü açığa çıkar…", "çığır açan…"); nokta-atışı olmayan pazarlama sıfatları. Ürün sesi:
   `.deckent/workspace/IDENTITY.md`.
6. **Aşırı-temalaştırma:** metafor DİLDE yaşar, süste değil (Köprüüstü guardrail'i NOVA'da da
   geçerli). Dekoratif doku/rozet/maskot serpiştirme yasak.
7. **Emoji-ikon** her yüzeyde yasak (ADR-G-010); ikon seti tek ailedir ve token'lı boyutlanır.

"Basit + god-level": görsel sadelik = az eleman, yüksek işçilik; özellik kısıtlaması değil.
MVP-yasağı (Yasa-3) tasarımda da geçerli — "şimdilik düz kutu" diye bir teslim yoktur.

## 7 · Zorunlu oturum süreci

1. Bu skill + `ui-ux-pro-max` + `frontend-design` yüklenir (MASTER-PLAN 590 mirası; şimdi
   DESIGN-SYSTEM-001 kuralı).
2. Üretim: component işi `component-smith` agent'ına tek-tek verilir; token değişikliği
   `design-tokens-pipeline` skill'ine göre yapılır.
3. Her görsel çıktı Alperen'e sunulmadan ÖNCE: `design-critic` + `a11y-contrast-auditor`
   agent pass'leri (typed verdict). FINDINGS varsa önce kapat ya da açıkça raporla.
4. Claude Design senkronu yalnız `claude-design-sync` skill protokolüyle (incremental; toptan
   replace yasak).
5. Kimlik-kararları (palet, font, metafor, sahne-dili) yalnız Alperen onayıyla değişir;
   onaysız "evrim" yasak. Kanıt = gerçek yüzeyde çalışan görüntü (Proof-of-Function).

## 8 · İlişkili parçalar

- Skills: `design-tokens-pipeline` (token SSOT + build) · `claude-design-sync` (claude.ai/design
  protokolü) · `design-system` (jenerik 3-katman token metodolojisi) · `ui-ux-pro-max` ·
  `frontend-design`.
- Agents: `design-critic` · `a11y-contrast-auditor` · `component-smith`.
- İş-takip: `docs/MASTER-PLAN.md` → DESIGN-SYSTEM-001 (P06). Desktop görsel işleri:
  DESKTOP-REBORN-001 (Legacy 589).
