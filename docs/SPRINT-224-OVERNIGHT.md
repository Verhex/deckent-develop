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

## 🔴 SABAH (collaborative — gerçek TTY gerek, kör-kodla riskli)

1. **224-019 pinned-input-bar (P0):** prompt altta SABİT + token üste akış. **Render-loop + readline çakışması** çözümü gerek (scroll-region `\x1b[1;rows-1r` + prompt bottom-row, VEYA readline'ı custom keypress ile değiştir). Headless PTY ile escape-doğrulanır ama görsel-akış senin terminalinde kesinleşir. **En çok istediğin P0 — birlikte ~30dk.**
2. **224-020 /menü keypress-wire:** mantık çekirdeği hazır+testli (`chat-slash-menu.ts`); `readline keypress` event'ine bağlama + görsel-tune TTY'de.
3. **TTY-görsel doğrulamalar:** 023 (bold render), 021 (footer), 022 (aktivite), 004 (paste) — hepsi unit+pipe doğrulandı; gerçek terminalde görsel teyit (senin gözünle).
4. **nervous-fix (224-028):** enabled + unwired-panic-gate spawn'ı bloke ediyor (runtime-trace gerekti, bu gece DEĞİL). Çözülene dek nervous OFF.

## Build durumu
`npm run build` her commit'te temiz çalıştı; dist güncel. Sabah `/mcp restart` + gerçek terminalde `deckent` ile görsel teyit. Pinned-bar (019) hariç hepsi fonksiyonel.
