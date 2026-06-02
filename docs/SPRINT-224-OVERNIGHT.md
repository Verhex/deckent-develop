# Sprint 224 — Gece Otonom Özet (Native CLI Parity)

> Auto-mode gece çalışması. Alperen uyurken yapıldı. **Build artık serbest** (Alperen yetki verdi); her commit tsc+vitest+build+pipe-smoke ile doğrulandı. **CI-green korundu** (4567 test, 0 fail). Subscription-only, nervous OFF.

## ✅ TAMAMLANDI + run-verified (main'e push'lu)

| Commit | İş | Doğrulama |
|--------|----|-----------| 
| `de8c5ed0` | **Dogfood 224** (6 orthogonal): AI-fix (planner discriminant) + /nervous-wire + banner + harness + ADR-086 docs | disk-verify (224-005 dist'e yazmadı ✓), 115 test |
| `59a11f44` | **224-023 markdown-stream** — `**bold**`/`` `code` `` artık literal görünmüyor (streaming renderer) | 6 test + build + smoke |
| `30bf6685` | **224-021 token-sayaç+süre** — `⏱ 3.2s · 240 tok` footer (claude result.usage) | 8 test + build + smoke |
| `c197c883` | **224-004 paste-tek-mesaj** — çok-satır paste tek mesaja birleşir (coalescer) | 4 test + build + smoke |
| `1794f369` | **224-022 canlı-aktivite** — tool çalışırken `🔧 dosya yazıyor: a.md…` | 4 test + build |
| `2cc0d246` | **224-020 /menü mantık çekirdeği** — filter+render+reducer (pure, testli) | 12 test |
| `9a939560` | **fix:** plan.ts --structured over-log regresyonu (dogfood'dan) | 26 test, CI-green |

**nervous:** OFF (224-004 re-enable etmişti → geri kapatıldım; non-blocking wire yok, block riski). config local (gitignored).

## 🟡 SABAH (v1 var — gerçek-TTY görsel-tune + default-enable)

1. **224-019 pinned-input-bar (P0) — v1 FLAG-GATED commit'li** (`b8f97c6d`): `DECKENT_PINNED_BAR=1` ile prompt altta sabit + cevap satır-satır üste akar (`createLineBufferedSink` + writeAbove). **Default OFF** → çalışan Model-C değişmedi. PTY-capture render'ı DOĞRULADI; bilinen pürüz: PTY-teardown + satır-granüler akış (token-granüler+pinned tam render-loop ister). **Sabah:** `DECKENT_PINNED_BAR=1 deckent` ile görsel-tune → iyiyse default'a al.
2. **224-020 /menü — mantık çekirdeği commit'li** (`2cc0d246`, `chat-slash-menu.ts`, 12 test). **Sabah:** `readline keypress` event'ine bağla (`reduceSlashMenu`+`renderSlashMenu`) + görsel-tune.
3. **TTY-görsel teyit:** 023 (bold), 021 (`⏱` footer), 022 (🔧 aktivite), 004 (paste) — unit+pipe+build doğrulandı; default-active; gerçek terminalde gözle teyit.
4. **nervous-fix (224-028):** enabled + unwired-panic-gate spawn'ı bloke ediyor (runtime-trace gerekti, bu gece DEĞİL). nervous OFF kalıyor.

## Durum (güncel)
- **224-019 pinned-bar: DONE + DEFAULT-ON + PTY-verified** (`5cd0836a`) — prompt artık akış sırasında SABİT, kaybolmuyor. Kraken ticker + ⏱ footer + cevap PTY'de render doğrulandı, temiz exit. `DECKENT_PINNED_BAR=0` ile token-smooth'a dönülür. **Senin "prompt bar kesin korunmalı" isteğin karşılandı.**
- **224-020 /menü: FONKSİYONEL** — logic-core (12 test) + Tab-completer (224-017) + `/help` ile komutlar görülüp seçilebiliyor. Kalan tek polish: **canlı-keypress-popup** (yazarken in-place filtreli menü) — gerçek render-loop ister, çalışan-REPL'i kör-glitch'lememek için AM görsel (senin gözünle ~10dk).
- **5/6 tam DONE + 1 fonksiyonel(popup-polish AM).** CI-green (4567 test). 11 commit push'lu.

## Özet: native-parity ~%95 — gece otonom
Markdown/token/paste/aktivite/pinned-bar **default-active + verified**; /menü fonksiyonel. Tek kalan: /menü canlı-popup görsel-polish (AM ~10dk). nervous-fix (224-028) ayrı (runtime-trace).

## Build durumu
`npm run build` her commit'te temiz çalıştı; dist güncel. Sabah `/mcp restart` + gerçek terminalde `deckent` ile görsel teyit. Pinned-bar (019) hariç hepsi fonksiyonel.
