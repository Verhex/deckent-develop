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

**Açık maddeler:**
- **Component ürünleşme-önkoşulları** (a11y 2026-07-31): forced-colors focus `outline` yedeği
  (react-aria focus-ring) · error `aria-describedby` bağı · `:has()` yerine `isFocusVisible` ·
  input-kenarlık 1.4.11 muafiyeti = "alan daima prefix/label ile tanınır" sözleşmesi.
- **NOVA-sahne flip-önkoşulları** (kimlik-turu denetimleri, 2026-07-31; pattern-denetimleriyle
  genişletildi 2026-08-01 — prototip: `design/prototypes/kimlik-turu-2026-07-31.html`, spec:
  `patterns/command-scene.html`): (a) worker-segment klavye erişimi (react-aria: ok-tuşu +
  Enter/Escape); (b) idle segment-yayı efektif ≥3:1 (bugün .30 → 1.9:1; ölçüm: .53 → 3.75);
  (c) bayatlığa renk-dışı ikinci taşıyıcı (kesikli stroke + STALE); (d) kenarlıklar ≥3:1 —
  KAPSAM: picker/panel + komuta-girdisi (2.23) + odak-paneli (1.67) + approval metin-eşle input
  (kartta kapatıldı); (e) worker-kategorik palet token'laması (geçici bağlayıcı sözleşme:
  telemetry-river rotasyonu accent→novaGlowBright→go→amber); (f) canvas mikro-metin ≥10px;
  (g) Canvas/CSS nefes-tempo senkronu (≈6.3s vs 4s — tek ritim); (h) transport: poll ölür →
  birleşik `/api/live` SSE (anayasa Teknik); (i) nehir WCAG 2.2.2 pause/freeze + `role="log"`.
- **Pattern/component-turu token-adayları (onay bekler):** `duration.riverArrive` 450ms ·
  `alpha.glowText` .14 · `opacity.riverText` .86 · `selection-overlay` (token-dışı beyaz .55) ·
  `radius.panel` 10px · `radius.pill` 999px · **panel-float ailesi (kanonik ad-seti):**
  `alpha.panelScrim` .86 · `alpha.panelEdge` .25 · `blur.panelFloat` 6px ·
  **progress ailesi:** component-rolleri `progress-track/fill/fill-done/fill-abort/arc`
  (watch-map'e ekleme) + `size.progressHairline/Bold` 2/6px + `size.progressRadialSm/Md`
  40/64px + `duration.progressFlow` 1.6s.
- **Doc-drift kaydı (Alperen'e):** MCP-instruction/CLAUDE.md lifecycle metinleri
  "…DECAY→CLEANUP" yazıyor; typed authority `SprintPhase` enum'unda terminal faz **COMPLETE**
  (cleanup bir komuttur). Metinlerin enum'a hizalanması ayrı iş (critic 2026-08-01 #1 kökü).
- ✅ **Kart-şablonu kuralı YAZILDI** (`design/claude-design/CARD-TEMPLATE.md`, 2026-08-01):
  kabuk ölçüleri + ad-biçimi + EN-kanonik state dili + rozet standardı; eski "kart-şablonu
  kuralı" açık maddesi kapandı — mevcut kartlar sıradaki dokunuşta hizalanır.
- **NOVA accent-ailesi**: gerçek-veri prototip turunda seçilir; seçime kadar aday-token.
- **Dashboard light-tema**: var mı yok mu — ADR-G-033 lens'iyle karar.
- **day-watch muted/focus**: 4.33/4.25 — küçük-punto kullanım kuralı ya da inkMuted koyulaştırma.
- **Rol örtüşmeleri**: nova `caution`≡`brass`; terminal `info`≡`accent` (truecolor'da) — accent
  turunda ayrıştır/belgele.
