# Sprint 224 — Enterprise Native Terminal: Kontrol Planı & Şeması

> Claude Code el-kodladı (TDD + PTY-harness run-verify, her epic commit'li). **Otomatik
> doğrulama bende tamam** (aşağıda); **son kapsamlı kontrol sende** — bu şemayı izle.

## Başlat
```bash
# Ink REPL artık VARSAYILAN (flag gerekmez):
env -u ANTHROPIC_API_KEY deckent
# /mcp restart önce yap (MCP eski kodu cache'liyorsa). Build güncel.
# Geri-dönüş (eski readline): DECKENT_INK=0 deckent
```

## Otomatik doğrulama durumu (Claude tarafı — TAMAM)
| Kontrol | Sonuç |
|---------|-------|
| `npx tsc --noEmit` | ✅ 0 hata |
| `npm run build` | ✅ temiz |
| `npx vitest run tests/cli` | ✅ 4075 pass, 0 fail |
| `npm run test:ci-sim` (hermetik, CI reprodüksiyonu) | ✅ **1152 dosya pass, exit 0** |
| PTY-harness (`scripts/ink-pty-test.mjs`) | ✅ her epic for run-verified |

## Kontrol Şeması — elle test (sen) 

| # | Epic | Ne yaz / yap | Beklenen |
|---|------|-------------|----------|
| 1 | **E1 markdown** | deckent'e "2x2 tablo + ts kod bloğu + [!WARNING] admonition ver" | Tablo **boxed+hizalı** (┌┬┐), kod **syntax-renkli + çerçeveli + dil-etiketi**, admonition **renkli ikon+sol-bar** |
| 2 | E1 inline | "**kalın** _italik_ ~~üstü-çizili~~ `kod` ve src/cli/entry.ts ver" | bold/italic/strike/code + **dosya-yolu cyan** (VSCode'da tıklanır) |
| 3 | E1 link | `[Docs](https://docs.anthropic.com) ve [yerel](./x.md)` | http **tıklanabilir OSC-8**; göreli **cyan+dim** (kırık-link değil) |
| 4 | **E2 /menü** | `/` yaz, sonra `do` yaz | Menü açılır, **canlı filtre** (→/doctor), ↑↓ ❯ gezer, **Enter çalıştırır**, Esc kapatır, Tab tamamlar |
| 5 | E2 komut | `/status`, `/retro`, `/doctor`, `/models` | Her biri **gerçek deckent çıktısı** (mock değil) |
| 6 | **E3 switch** | `/provider codex` sonra `/model sonnet` | "geçildi" + **status-bar** `deckent codex` / `claude · sonnet` canlı güncellenir |
| 7 | **E4 footer** | herhangi bir mesaj yaz | Cevap altında `⏱ Xs · N tok`; status-bar'da `Σ N tok` (oturum toplam) |
| 8 | **E5 agentic** | "DENEME.md dosyasına merhaba yaz" → onay | `● dosya yazıldı ⎿ +N` (yeşil); edit → **+yeşil/-kırmızı diff** |
| 9 | E5 approve | `/approve auto-edit` | "onay modu: auto-edit" + status-bar `⚡auto-edit`; dosya-ops oto, bash sorar |
| 10 | **E6 paste** | çok-satırlı metin **yapıştır** | **TEK mesaj** (satır-satır submit DEĞİL); Enter ile gönderirsin |
| 11 | E6 kuyruk | deckent çalışırken art-arda yaz | `⋯ kuyrukta N` görünür; `/cancel` temizler |
| 12 | E6 kısayol | `Ctrl+L` / `Ctrl+C` | Ctrl+L ekranı temizler; Ctrl+C temiz çıkış |
| 13 | **oryantasyon** | genel kullanım | **imleç görünür**, ←→/Home/End/↑↓-history çalışır, durum-çapası (düşünüyor/üretiliyor/✓hazır), **mouse-scroll** geçmişte gezer, **kopyala/seç** çalışır |
| 14 | **E7 default** | sadece `deckent` (flag yok) | Ink açılır (çerçeveli kutu) |

## Bilinçli ERTELENENLER (faz-2 / refinement — dürüst not)
- **Cost ($) footer** — token+süre var; $ için cost-config model-fiyat eşleme (follow-up).
- **/compact + /resume** — loop-context cerrahisi ister (sahte versiyon kalite-çıtasına aykırı).
- **Esc-interrupt** (akış ortası durdurma) — persistent-session sinyal-abort ister.
- **Kuyruk edit-in-place** — ↑ history'den çağırır; bekleyen-kuyruk-item düzenleme ayrı UX.
- **Eski yol TAM silme (E7b)** — readline/PinnedTui/render-region/spinner + editInput→line-edit taşıma; Ink günlük-kullanımda kanıtlanınca (riskli big-bang'den kaçınmak için).
- **Niche (faz-2):** vim-mode · image/multimodal · temalar · custom-komutlar · hooks · Ctrl+R search.

## Commit'ler (main'de)
E1 `e841b4da` · E2 `7424359e` · E3 `bba9b86f` · E4 `29f12bf0` · E5 `ce2a3962` · E6 `94592202` · E7 `41cf4826`

## Bir şey bozuksa
`DECKENT_INK_DEBUG=1 deckent` → `/tmp/ink-keys.log`'a tuş-debug. `DECKENT_INK=0` → eski readline.
PTY-harness: `node scripts/ink-pty-test.mjs '[{"afterMs":1500,"send":"/exit<CR>"}]'`.
