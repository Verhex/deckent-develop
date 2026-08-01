---
name: design-tokens-pipeline
description: Use when creating or changing ANY design token (color, typography, spacing, radius, motion) for any deckent surface, or when wiring theme output for dashboard/desktop/terminal. Defines the single DTCG token source → Style Dictionary build → per-surface outputs contract.
---

# Design Tokens Pipeline — tek kaynak, üç yüzey

> **Kontrat durumu:** Bu skill pipeline'ın bağlayıcı kontratını tanımlar. Kurulum
> DESIGN-SYSTEM-001 (docs/MASTER-PLAN.md, P06) altında dilimlenir — kurulmadan önce token işi
> yapılacaksa bile bu kontrata uygun yapılır (elle çıktı üretilse dahi kaynak-dosya önce yazılır).
> Amaç: bugün üç yüzeyde üç bağımsız renk/tema sistemi var; bu pipeline onları tek SSOT'a bağlar.

## 1 · Kaynak (SSOT)

- Konum: **`design/tokens/*.tokens.json`** (repo kökü). Format: **W3C DTCG** (`$value`/`$type`;
  grup-seviyesi `$type` delegation; alias `{group.token}` referansları).
- Katmanlar desktop'taki kanıtlanmış mimariyle bire-bir: **primitive → semantic → component**
  (`src/desktop/src/shared/theme-tokens.ts`'in `--dk-p/s/c` üç-katmanı genelleşir).
- Tema/yoğunluk varyantları (nova default + watch mirası) kaynakta ayrı token-set dosyalarıdır;
  yüzeyler varyantı runtime'da seçer, build tüm varyantları üretir.
- **Hex/renk/spacing literal'i YALNIZ bu kaynakta yaşar.** Kod-yolunda literal = ihlal
  (ADR-G-036 0-hardcode ratchet ile aynı disiplin; `feedback_zero_hardcode_live_data` kanunu).

## 2 · Build

- Araç: **Style Dictionary v5** (ESM; DTCG desteği yerleşik — `$value`/`$type` auto-detect).
  Bağımlılık girişi ADR-D-005'e göre kaydedilir (`docs/reference/dependencies.md`).
- Script: `scripts/build-design-tokens.mjs`; npm script: `npm run build:tokens`
  (+ `--check` drift modu).
- Platform çıktıları (üçü de commit edilir — generated başlık yorumuyla):

| Yüzey | Çıktı | Format |
|---|---|---|
| Dashboard | `src/dashboard/src/generated/theme.css` | `@theme { --color-*/--font-*/--radius-* }` bloğu — `index.css` bunu import eder; elle `@theme` düzenleme biter |
| Desktop | `src/desktop/src/shared/generated/theme-tokens.gen.ts` | `--dk-p/s/c` üç-katman veri yapısı; mevcut zod-validated `theme-tokens.ts` bunu tüketir (el-yazımı değer taşımaz hale gelir) |
| Terminal | `src/cli/helpers/generated/palette.ts` | her semantic token için `{ hex, ansi256, ansi16 }` eşlemesi + rol adları; `NO_COLOR`/`FORCE_COLOR`/TTY gating MEVCUT `src/cli/helpers/theme.ts` üzerinden kalır |

- Terminal eşlemesi **dürüst degrade** üretir: truecolor → en yakın xterm-256 → en yakın ANSI-16;
  kontrast kaybı eşiği aşılıyorsa build UYARI basar (a11y-contrast-auditor bunu denetler).

## 3 · Tüketim kuralları (yüzey başına)

- **Dashboard:** component'lerde yalnız token-utility (`bg-background`, `text-brand-500`…);
  çıplak hex PR'da reddedilir. Not: `ThemeProvider`'ın `.light` yolu bugün kırık
  (`@custom-variant dark` yok) — light-tema kararı verilene kadar dark tek-kimlik; kırık toggle
  bu iş kapsamında ya onarılır ya dürüstçe kaldırılır (sessiz sahte-toggle bırakılmaz).
- **Desktop:** CSS yalnız `--dk-s-*`/`--dk-c-*` tüketir; `--dk-p-*` CSS'e sızmaz (mevcut disiplin
  korunur). Kullanıcı-özelleştirme yalnız semantic katmanı override eder.
- **Terminal:** üç rakip sistem (`helpers/theme.ts` · `helpers/ansi.ts` · Ink `color=` propları +
  24 dosyadaki çıplak `\x1b[` escape'leri) tek `palette.ts`'e bağlanır. Yeni TUI kodu Ink
  component'lerine rengi **palette rolü** olarak verir ("green" değil `palette.ok`). Bu, DT-5
  borcunun (terminal-design-language SSOT) kod-ayağıdır; doküman-ayağı
  `docs/reference/terminal-design-language.md` olarak DESIGN-SYSTEM-001 içinde yazılır.

## 4 · Drift-gate

- `npm run build:tokens -- --check` → üretilmiş üç çıktı committed hallerinden saparsa exit≠0.
- `lint:gates` zincirine `lint:design-tokens` olarak eklenir (mevcut gate pattern'i:
  `scripts/lint-*.mjs`). Kaynak değişip çıktı commit edilmemişse CI kırmızı.

## 5 · Token değişim süreci

1. Değişikliği `design/tokens/`'ta yap (tek yer).
2. `npm run build:tokens` → üç çıktı yenilenir.
3. Görsel doğrulama **gerçek binary'de** (Proof-of-Function): etkilenen yüzey(ler)de çalışan
   ekran/çıktı görüntüsü — mock/test-yeşili tek başına kanıt değildir.
4. `design-critic` + `a11y-contrast-auditor` pass (typed verdict).
5. Alperen onayı → commit (kaynak + üç çıktı aynı commit'te).

## 6 · Karar günlüğü + açık maddeler (sessiz kapatma yasak)

**Kararlaştırıldı (Alperen, 2026-07-31):**
- ✅ **`go-text`/`caution-text`/`abort-text` rolleri eklendi** (durum-üstü mürekkep; a11y BLOCKER
  kapanışı). day-watch `caution` primitive'i ölçümle `#A8741A → #8F6212` (caution-text 5.03 ·
  caution/bg 4.57 — AA).
- ✅ **Terminal stratejisi = işlevsellik-önce:** zemin bilinmiyorsa ansi16 (terminal şeması çözer);
  truecolor yalnız zemin güvenle biliniyorsa (OSC-11/COLORFGBG sezgisi). Gating SSOT birleşimi
  (`theme.ts` ≠ `output.ts` ≠ `splash.ts`) slice-2'nin İLK işi — birleşmeden palette tellenmez.
- ❌ **FONT SETİ REDDEDİLDİ** ("hiçbiri; çok klasik; tamamen değişmeli"): Bricolage + Hanken +
  Geist/IBM Plex tamamı. `font.*` token'ları mevcut-durum envanteri statüsünde; YENİ font-yönü
  aday turu açık. Eski "IBM Plex → Geist birleşimi" maddesi geçersiz (ikisi de gidiyor).
- ✅ **Kişiselleştirme gereksinimi:** desktop «Ayarlar» sahnesinde tema + font + accent seçimi
  (DESKTOP-CUSTOMIZE-001) → font token'ları da vardiya gibi **set-değiştirilebilir** modellenir
  (tek sabit üçlü değil, seçilebilir font-setleri).

- ✅ **Font yönü A «MAKİNE İZİ» seçildi (Alperen 2026-07-31, "şuanlık")**: Tektur (display 700) ·
  Chakra Petch (gövde 400/600) · Spline Sans Mono (veri 400/600). Set `fontSet.makine-izi`
  token'larında stage'li, dosyalar `design/fonts/makine-izi/` (OFL, vendored). **Kalıcı flip
  (font.* rolleri + üç yüzey + foundations kartı) gerçek-veri prototip doğrulaması SONRASI** —
  accent turuyla birleşik yapılması planlı. "Şuanlık" kaydı: Alperen fikir değiştirirse tur
  yeniden açılır, flip yapılmadığı için geri alma maliyeti sıfır.

- ✅ **FONT FLIP TAMAM (2026-07-31):** kimlik-turu gerçek-veri doğrulaması (canlı daemon,
  `design/prototypes/kimlik-turu-2026-07-31.html`) + Alperen onayı → `font.*` rolleri
  `{fontSet.makine-izi.*}` alias'ı oldu; dashboard (self-host @font-face + @theme + xterm),
  desktop (styles.css + CommandScene canvas + EngineRoom xterm) ve foundations kartı döndü.
  IBM Plex ayrımı emekli (`font.dashboardMono` → data). Google-CDN font linki kaldırıldı.
- ✅ **NOVA accent-ailesi = CAM GÖBEĞİ (mevcut novaGlow) — KALICI** (Alperen, kimlik-turu
  2026-07-31; adaylar MACENTA #FF5FA8 ve KOR #FFB84D elendi). Accent token değişikliği yok.
- ✅ **Terminal wiring slice-2 TAMAM (2026-07-31):** renk-gating tek SSOT (`theme.ts` çift-kapı:
  TTY-farkındalı `shouldUseColor/colorTier` + TUI için `isColorSuppressed/suppressionTier`);
  `output.ts isNoColor` delege, `splash.ts` boş-NO_COLOR bug'ı + kademe-degrade, `ansi.ts`
  kapıya bağlandı; `Theme` palet-tüketici (ansi16 parite testli — flip-öncesi birebir), tier
  merdiveni COLORFGBG işlevsellik-önce. DT-5 dokümanına §6.1-6.4 eklendi
  (`docs/reference/terminal-design-language.md`). Kanıt: color-gate 23/23, etkilenen TUI
  testleri yeşil (fail-delta=0 baseline'a karşı), root tsc, tsx source-smoke. Kalan: dist
  rebuild + host-adapter restart (owner-koordinasyonlu) sonrası binary-koşu; çıplak-escape
  24-dosya göçü dokunuldukça.

- ✅ **Flip binary-doğrulaması KAPANDI (2026-07-31, sprint-485 settle sonrası):**
  `build:dashboard` yeşil (10 woff2 bundle'da), daemon-servisli dashboard canlı tarayıcıda
  yeni setle görüntülendi (Playwright screenshot — Chakra Petch UI + Spline Sans Mono mono,
  TR glifler temiz); `build:desktop` (electron-vite) yeşil. Guard-notu: sprint sırasında
  `build:tokens` kalıba takılmıştı → doğrudan `node scripts/build-design-tokens.mjs`
  koşulmuştu (dist'e dokunmaz; kural-amacı-içi, şeffaf kayıt).

- ✅ **Component token-adayları KABUL + kaynakta (Alperen 2026-07-31):** `brightness.hover/active`
  (1.18/.85) · `alpha.accentHover` (.28) · `alpha.glowFocus` (.14) · `opacity.disabled` (.45 —
  disabled efektif-kontrast bilinen-durumu kayıtta) · `space.statuspillPadSmY/X` (3px/8px).
  Kartlar "token'landı" notuna çevrildi.
- ✅ **Dashboard = dark TEK-KİMLİK (Alperen 2026-07-31, karar 1-a):** kırık `.light` yolu dürüstçe
  söküldü (ThemeProvider + toggle'lar + ölü `lib/theme.ts` + tema i18n anahtarları); `dark:`
  utilities `@custom-variant dark` + statik `html.dark` ile OS-bağımsız always-on. Kontrat-testleri
  yeni mimariye çevrildi; canlı-binary doğrulandı. Kalan borç değil-karar: light istenirse yeni
  token-seti + kontrast turu olarak açılır.

- ✅ **Toplu karar turu (Alperen, 2026-08-01 — 4/4 onay):** (1) lifecycle doc-drift hizalandı —
  8 dosyada "DECAY→CLEANUP" → "DECAY→COMPLETE (cleanup=komut)"; (2) TÜM token-aday havuzu
  kaynağa alındı (panel-float ailesi · progress rolleri+ölçüleri [arc hariç — accent-bright
  semantic rolü ister, bilinçli-aday] · river süreleri/alfaları · selectionOverlay ·
  radius.panel/pill · accentSwatch); (3) day-watch `inkMuted` #6B6F72→**#63676a** (buff 4.87 AA;
  validator muted/bg eşiği 3→4.5 — 4 vardiya geçiyor); (4) `fontSet.envanter-legacy` seçilebilir
  set olarak kaynakta + **preferences-v2 ONAYLI-İŞ** (fontSet alanı + VERSION bump + migration —
  implementasyon desktop/REBORN dilimi). Kartlardaki ADAY etiketleri "token'landı"ya çevrildi.

- ✅ **Açık-defter karar turu (Alperen, 2026-08-01 — 7/7):** (1) **accent-bright TAM ROL** —
  3 yeni ölçülmüş bright primitive (day `magentaBright` #A93368 · night `nightAccentBright`
  #F0938A · sea `magentaSeaBright` #F5A8CC; vurgu-adımı 1.24–1.31 simetrik) + nova
  `novaGlowBright`; `progress-arc` token'landı. Ek tasarım-sonucu: **arc-idle katı-kompozit
  rolü** (4 primitive, bg-bandı 3.48–3.77 — tek-alpha day-watch fiziğinde ≥3'ü tutamıyordu;
  alpha-compositing kontrast-kritik katmanda emekli) + **border-strong rolü** (muted kanalı,
  ≥4.8 her vardiya; `input-border → border-strong` CANLI, `panelfloat-border` yeni; accent-glow
  kenarı dekoratif-beyanlı). Validator: 6 yeni non-text eşiği (min 3). (2) **prefs-v2 ŞİMDİ
  ELLE — TAMAM:** `DESKTOP_PREFERENCES_VERSION 1→2`, `fontSet` alanı, v1→v2 KAYIPSIZ migration,
  `FONT_SETS`/`GEN_FONT_SETS` drift-kilidi (generator emisyonu + eşitlik-testi),
  `applyWatch` font-değişken uygulaması, envanter-legacy `@font-face` geri-eklendi; desktop
  205/205. Typed-seam kaydı: settings-UI seçici ürünleşme-dilimi işidir. (3) **flip-önkoşulları
  A11Y-ÖNCE İKİ DİLİM:** (b)+(d) tasarım/token katmanında KAPANDI; (a)·(c)·(f) üretim-flip
  dilimi, (e)·(g)·(h SSE) mimari dilim. (4) **dashboard light-tema YOK — kapandı** (ileride
  istenirse YENİ karar: yeni token-seti + kontrast turu). (5) **rol örtüşmeleri BELGELE-KABUL**
  (nova caution≡brass, terminal info≡accent — semantic ayrım korunur, görsel paylaşım bilinçli).
  (6) **restart penceresi AÇILDI:** bot SIGTERM→build→bot yeni-dist (pid kaydı), binary
  color-gate 4/4 kanıt (FORCE boyar · boş-NO_COLOR bastırır · FORCE>NO_COLOR · pipe boyasız);
  MCP reconnect Alperen'de. (7) **day-watch focus-ring maddesi KAPANDI** (non-text 1.4.11
  eşiği 3:1; magenta/buff 4.25 geçer — metin rolleri 4.5'te ayrıca korunuyor).

- ✅ **Rol-turu çift-denetim + düzeltmeleri (2026-08-01):** a11y-auditor 24/24 çifti bağımsız
  doğruladı (FINDINGS-7). Düzeltilenler: TÜM desktop girdi-kenarları `--dk-c-input-border`'a
  tellendi (generic input/select + radio + changes-textarea + nova-cmd + nova-palette — nova-cmd
  eski efektif 2.32:1 idi; glow dekoratif kaldı); nehir `#7be8ff` hardcode'u
  `var(--dk-p-novaGlowBright)` oldu (kanun-10); arc-idle bandı 3.38→**3.48**–3.77 düzeltildi
  (3.38 sea'nın .56-zam öncesi bayat sayımıydı); colors-kartı rozeti non-text satırda artık AAA
  basmıyor; `applyWatch` fontSet-omit semantiği "fontlara dokunma" oldu (sessiz set-geri-dönüşü
  ölür). Kayıtlı-kalan: (b-render) CommandScene canvas'ı hâlâ accent@.30 çizer — arc-idle/
  progress-arc token tüketimi üretim-flip diliminin İLK işi; WCOL kalanları (#c792ea/#ff9e64)
  önkoşul-(e) kapsamında.

**Açık maddeler:**
- **DT-5 `⚡Live` sembolü** (critic 2026-08-01 #10): sembol-tablosundaki `⚡` DNA §7 /
  ADR-G-010 emoji-ikon yasağıyla gerilimde — ya ASCII karşılık ya "belgele-kabul istisnası"
  kaydı; karar Alperen'in (bugünkü diff dışı, mekanik taramada çıktı).
- **Component ürünleşme-önkoşulları** (a11y 2026-07-31): forced-colors focus `outline` yedeği
  (react-aria focus-ring) · error `aria-describedby` bağı · `:has()` yerine `isFocusVisible` ·
  input-kenarlık 1.4.11 muafiyeti = "alan daima prefix/label ile tanınır" sözleşmesi.
- **NOVA-sahne flip-önkoşulları** (2026-08-01 dilim-kararı: a11y-önce): ~~(b) idle-yay~~ ve
  ~~(d) kenarlıklar~~ tasarım/token katmanında KAPANDI (arc-idle + border-strong rolleri —
  yukarıdaki 7/7 turu). KALAN — üretim-flip dilimi: (b-render) CommandScene
  idle-yayının arc-idle/progress-arc token tüketimi (bugün accent@.30 alpha yolu — İLK iş);
  (a) worker-segment klavye erişimi (react-aria: ok-tuşu + Enter/Escape); (c) bayatlık ikinci-taşıyıcı canvas implementasyonu
  (kesikli stroke + STALE; hedef-durum spec'te çizili); (f) canvas mikro-metin ≥10px;
  (i) nehir WCAG 2.2.2 pause/freeze + `role="log"`. KALAN — mimari dilim: (e) worker-kategorik
  palet token'laması (geçici sözleşme: accent→novaGlowBright→go→amber rotasyonu);
  (g) Canvas/CSS nefes-tempo senkronu (≈6.3s vs 4s); (h) poll ölür → birleşik `/api/live` SSE.
- ✅ **Pattern/component-turu token-aday havuzu KAPANDI:** tamamı toplu-karar (2026-08-01 4/4)
  + rol-turu (2026-08-01 7/7) ile kaynakta — arc dahil. Tek kalan ürün-işi: sergi-min-genişlik
  220px (kart-içi ölçü, token değil) + `desktop.settings.appearance.*` i18n anahtarları
  (settings-UI diliminde).
- **settings-customize ürünleşme-şartları** (a11y 2026-08-01): ~~inkMuted~~ ÇÖZÜLDÜ (#63676a,
  toplu-karar 3). Kalan: custom-accent doğrulaması AKTİF vardiya zemininde (yalnız-nova yetmez) ·
  Custom = Radio + koşullu TextField (input asla radio rolü almaz) · hex hatası
  `aria-invalid`+`describedby` · font-set "Selected" sözcük-taşıyıcı + "Active" pili
  `aria-checked`'e bağlı (kartta kapatıldı) · settings-UI seçici (fontSet alanını yüzeye çıkarır).
- ✅ **Doc-drift kaydı KAPANDI** (toplu-karar 2026-08-01 karar-1): 8 dosya enum'a hizalandı —
  "…DECAY→COMPLETE (cleanup = komut)".
- ✅ **Kart-şablonu kuralı YAZILDI** (`design/claude-design/CARD-TEMPLATE.md`, 2026-08-01):
  kabuk ölçüleri + ad-biçimi + EN-kanonik state dili + rozet standardı; eski "kart-şablonu
  kuralı" açık maddesi kapandı — mevcut kartlar sıradaki dokunuşta hizalanır.
- ✅ **NOVA accent-ailesi KAPANDI** (kimlik-turu 2026-07-31: CAM GÖBEĞİ kalıcı).
- ✅ **Dashboard light-tema KAPANDI** (2026-08-01 karar: YOK — ileride istenirse yeni token-seti
  + kontrast turu olarak YENİ karar açılır).
- ✅ **day-watch muted/focus KAPANDI** (muted #63676a → 4.87 AA; focus-ring non-text 1.4.11
  eşiği 3:1 — 4.25 geçer, 2026-08-01 karar-7).
- ✅ **Rol örtüşmeleri KAPANDI — belgele-kabul** (2026-08-01 karar-5): nova `caution`≡`brass`
  (novaAmber) ve terminal `info`≡`accent` (truecolor) görsel paylaşımı bilinçli; semantic ayrım
  korunur, ayrıştırma ancak gerçek karışıklık kanıtında yeni karar olur (watch-map + DT-5 notlu).
