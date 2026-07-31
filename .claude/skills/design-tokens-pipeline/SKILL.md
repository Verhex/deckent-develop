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

## 6 · Açık karar maddeleri (sessiz kapatma yasak)

- Dashboard mono fontu: IBM Plex Mono → **Geist Mono** birleşimi (öneri: birleştir; onay bekler).
- NOVA accent-ailesi: prototip-turunda Alperen'le seçilir; seçime kadar aday-token olarak işaretli.
- Dashboard light-tema: var mı yok mu — ADR-G-033 observability-lens'iyle birlikte karar.
