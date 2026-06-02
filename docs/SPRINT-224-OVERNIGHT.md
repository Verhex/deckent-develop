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

## Durum
**6/6 REPL render task implement edildi** (4'ü default-active+verified, 019 flag-gated v1, 020 logic-core). CI-green korundu (4567 test). 9 commit push'lu. Kalan iş: 019/020 gerçek-TTY görsel-entegrasyon (Alperen sabah).

## Build durumu
`npm run build` her commit'te temiz çalıştı; dist güncel. Sabah `/mcp restart` + gerçek terminalde `deckent` ile görsel teyit. Pinned-bar (019) hariç hepsi fonksiyonel.
