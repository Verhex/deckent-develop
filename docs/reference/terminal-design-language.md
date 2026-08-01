# Terminal Tasarım-Dili — yazılı SSOT (583 tasarım-turu · DT-5, 2026-07-18)

> Terminalin fiilen oturmuş dili İLK KEZ yazılı kural olur. 5-gün-KABUL pürüz-avı (511-deseni)
> bulguları BU referansa karşı değerlendirilir. Desktop'ın dili ayrı belgedir
> (`docs/analysis/surf4-d4-0-art-direction-2026-07-16.md`, «Köprüüstü») — iki yüzey **aynı
> kelime-hazinesini** paylaşır, tonları farklıdır: Desktop metaforla konuşur, terminal **alçak
> sesle ve küçük harfle** konuşur.

## 1 · Ses ve ton

- **lowercase-vocabulary:** durum-sözcükleri, satır-içi ipuçları ve kart-altbilgileri küçük harfle
  yazılır (`awaiting approval`, `full ahead`, `just now`). Cümle-başı büyük harf yalnız gerçek
  cümlelerde (hata metinleri, açıklamalar).
- **Yormayan yüzey:** terminal ana-yüzeydir (Aktif-Yön) — çıktı yoğunluğu her zaman "operatör
  bir bakışta ne olduğunu görsün" hedefine hizmet eder; dekoratif tekrar yasak.
- **Dürüstlük dili:** belirsizlik açık yazılır (`running (unverified)`), kırpma açık işaretlenir
  (`… diff truncated (size cap)`), eksik ön-koşul adıyla söylenir (bayrak/annotasyon adı verilir).

## 2 · Kart-idyomu (Ink/REPL organları)

Karar ve önizleme YÜZEYLERİ karttır; akış metni kart değildir.

| Kart | Organ | Aksiyon-dili |
|---|---|---|
| Onay-kartı | `approval-card.tsx` | tek-tuş: `y/n/a` (allow/deny/always) — özet TEK satır, i18n'li |
| Inbox-kartı | `inbox-card.tsx` | tek-tuş: `a/f/r/s` (approve · full-ahead · reject · start) |
| Plan-önizleme | `plan-preview-card.tsx` | gate-sonucu görünür (`pass/fail` + bulgu-sayısı) |

Kart-kuralları: (a) kart HER ZAMAN klavyeyle tamamen sürülebilir; (b) tek-tuş harfleri
navigasyon-tuşlarıyla asla çakışmaz (`mapInboxDecisionKey` ayrımı); (c) kartın gövdesi i18n'li,
aksiyon-harfleri evrensel.

## 3 · Ortak-kelime kuralı (iki yüzey tek sözlük)

- Akış-durumlarının TEK kelime-kaynağı `tui.inbox_state_*` anahtarlarıdır — Desktop state-pill'leri
  ve terminal inbox'ı AYNI anahtarları okur (D4-4 kararı). Yeni akış-durumu = önce bu aileye anahtar.
- Zaman-humanize TEK aile: `tui.inbox_time_*` (`just now`, `{m}m ago`, …) — `formatShellTimestamp`
  (Desktop) ve inbox-satırları aynı sözlüğü kullanır; ham ISO hover/detayda yaşar.

## 4 · Protokol-vs-i18n çizgisi (ihlal edilemez)

- **Protokol-string'leri EN-kanoniktir ve i18n YÜZEYİ DEĞİLDİR:** `[deckent] …`, `[mcp-error] …`,
  `[deckent-denied] …`, `[@ref] …` işaretleyicileri modele/makineye giden sözleşmedir — prefix
  kontrat, detay teşhistir. Kullanıcıya görünen her ŞEY (`getMessage`) en/tr çiftiyle gelir.
- Onay-prompt ÖZETLERİ kullanıcı-yüzüdür → `ToolExecLabels` enjeksiyonu (`tool.confirm_*`);
  mekanizma-modülleri (chat-tool-exec, tui/render) string-free kalır.

## 5 · Sembol-dili

| Sembol | Anlam | Yer |
|---|---|---|
| `⚡Live` | canlı-takip aktif | `status --follow` başlığı |
| `·` | alan-ayırıcı (nefes) | satır-içi meta (`8 dosya · +120/−4 · 2m ago`) |
| `?N/★` | satır-numarası + seçim | inbox listesi |
| `+A −R` | ekleme/silme sayacı | evidence, diff-başlık, commit-önerisi |
| `→` | akış/teslim yönü | durum-geçişleri, yönlendirme ipuçları |

Yeni sembol eklemek = bu tabloya satır eklemek; tablosuz sembol pürüzdür.

## 6 · Renk-disiplini

Terminal renkleri SEMANTİK üçlüde kalır: **go/yeşil** (tamam/ileri) · **caution/sarı** (borç/uyarı)
· **abort/kırmızı** (hata/red). Vurgu tek-renk (accent) yalnız SEÇİM ve CANLILIK için. Süs-rengi
yasak; renk körü-güvenliği için renk hiçbir yerde TEK taşıyıcı değildir (yanında sözcük/sembol olur).

### 6.1 · Renk-kapısı SSOT (DESIGN-SYSTEM-001 slice-2, 2026-07-31)

Tek otorite `src/cli/helpers/theme.ts`; yeni kod kendi env-kontrolünü YAZAMAZ, kapıdan import eder.
Öncelik zinciri: **`--no-color` (flag/argv) > FORCE_COLOR > NO_COLOR > TTY** — `NO_COLOR` değeri
ne olursa olsun (boş string dahil, no-color.org) bastırır; `FORCE_COLOR>0` NO_COLOR'ı ezer,
`FORCE_COLOR=0` bastırır. İki kapı fonksiyonu (ikisi de bastırmayı dinler):

- `shouldUseColor()`/`colorTier()` — TTY-farkındalı: `Theme` ve genel çıktı.
- `isColorSuppressed()`/`suppressionTier()` — TTY şartı YOK: interaktif-TUI yardımcıları
  (`ansi.ts`→status-renderer, `splash.ts`) tarihsel davranışı korur. `output.ts isNoColor()`
  buna delege eder (API sabit).

Tarihî borç: ~24 dosyada çıplak `\x1b[` escape'i — dokunulan her dosya kapıya göçürülür
(big-bang sweep yok).

### 6.2 · Kademe merdiveni (işlevsellik-önce)

`none → ansi16 → ansi256 → truecolor`. **Taban = ansi16** — SGR kodları terminalin kendi
şemasında çözülür; flip-öncesi davranışla birebir parite `tests/cli/color-gate.test.ts` ile
kilitli. Tırmanma yalnız: (a) `FORCE_COLOR=2/3` açık-istek, ya da (b) yetenek
(`COLORTERM`/`TERM`) + **koyu zemin güvenle biliniyorsa** (`COLORFGBG` son alan 0-6|8) — çünkü
palet hex'leri NOVA koyu-zemin optimize; açık terminalde 1.6–2.8:1'e düşer (a11y ölçümü).
`none` kademesinde bilgi kaybı sıfır.

### 6.3 · Palet rolleri (üretilmiş — elle SGR yazmak yasak)

Kaynak `design/tokens/terminal.map.json` → `npm run build:tokens` → `src/cli/helpers/generated/palette.ts`
→ tüketici `Theme`: success `32`/novaGo · error `31`/novaAbort · warning `33`/novaAmber ·
info `34`/novaGlow · muted `2`/novaTextMuted · accent `36`/novaGlow. Yeni rol = önce token
kaynağına. Splash marka-renkleri tarihîdir ve kademe-degrade'e tabidir.
`info`≡`accent` truecolor-örtüşmesi BİLİNÇLİDİR (belgele-kabul, Alperen 2026-08-01): ansi16
kademesinde `34` vs `36` ile zaten ayrışırlar; semantic roller ayrı kalır, ayrıştırma ancak
gerçek karışıklık kanıtında yeni karar olur.

### 6.4 · Test sözleşmesi

Renkli çıktı doğrulayan test `FORCE_COLOR=1/2/3` ile açık-istek yapar; bastırma `NO_COLOR`/
`--no-color` ile test edilir; TTY-varsayılanına yaslanan assert yazılmaz (CI'da TTY yok).

## 7 · Girdi-yüzeyi kuralları

- `/` = komut-menüsü, `@` = dosya-menüsü — iki menü AYNI etkileşim-gramerini paylaşır
  (↑↓ gezin · Tab/Enter tamamla · Esc kapat; Enter menü-açıkken asla satır göndermez).
- `@@` ve mid-word `@` kaçıştır (e-posta güvenliği); menü yalnız kelime-başı `@`'ta açılır.
- Tehlikeli işler karta düşer (bkz. §2); silent-tier araçlar akışı BÖLMEZ.

## 8 · Kanıt-dili (çıktıda dürüstlük)

- Her `--yes`/onaysız yol, ne yaptığını SONUÇ-satırıyla söyler (`Staged 3 file(s).` →
  `Committed ab12cd3.`); sessiz başarı yasak.
- Uzun işler fire-and-forget ise log-yolu/handle geri verilir (detached-start deseni).
- `unverified/no-base/not-a-git-repo` gibi bilgi-eksikliği durumları çıktıda AD ile taşınır.

---

*Bakım: bu belge davranış eklemez — mevcut dili kayda geçirir. Dile aykırı yeni çıktı = pürüz
(born'lanır); dili değiştirmek = önce bu belgeye PR.*
