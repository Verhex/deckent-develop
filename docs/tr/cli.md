# Deckent CLI

CLI, Deckent’in primary terminal control surface’idir. Kurulu binary’yi
`deckent <komut>` biçiminde; repository build’ini ise
`node dist/cli/entry.js <komut>` biçiminde kullanın.

Tam referans canonical path contract ve canlı Commander tree üzerinden üretilir. Her public
command path, option, positional argument, effect, default execution, authority, output mode,
desteklenen platform ve alias bilgisini kapsar:

- [Tam Türkçe CLI referansı](../generated/tr/reference/cli.md)
- [Makine-okur iki dilli manifest](../generated/cli-manifest.json)

Aynı sözleşmeyi terminalde görmek için `deckent <path> --help` çalıştırın. Türkçe help yüzeyi
için `DECKENT_LANGUAGE=tr` ayarlayın.

Internal `gateway-runtime` child public referans sayfalarına bilinçli olarak alınmaz;
registration drift denetimi kaybolmasın diye makine manifestinde `hidden: true` olarak kalır.

## Terminal çıktısı ve splash davranışı

Deckent terminalde üç ayrı sözleşmeyi ayırır:

- **Artwork** — Kraken splash yetenekli terminallerde Unicode block art kullanır. Ortam
  Unicode'a güvenemiyorsa (`TERM=dumb`, UTF‑8 olmayan locale veya `DECKENT_ASCII=1`) CLI
  printable ASCII art'a düşer. Locale çözümü `LC_ALL` → `LC_CTYPE` → `LANG` önceliğini izler;
  boş/ayarsız anahtarlar yok sayılır. Yalnız terminal-owned dekorasyon etkilenir — yerelleştirilmiş
  kullanıcı metni UTF‑8 kalır.
- **Renk** — bastırma önceliği `--no-color` (bayrak) → `FORCE_COLOR=0` → `NO_COLOR`
  (varlık, boş string dahil) yalnızca `FORCE_COLOR` ayarsızken. `FORCE_COLOR` pozitif
  (`1`, `2` veya `3`) iken renk açılır ve `NO_COLOR` yok sayılır (Node bu kombinasyonda
  uyarı verebilir). Renk bastırma Unicode/ASCII artwork seçimini değiştirmez.
- **Makine çıktısı** — stdout TTY değilken `deckent --version` tam olarak tek düz sürüm satırı
  basar; splash veya ANSI süsleme yoktur. Pipe için yapılandırılmış JSON gerekiyorsa
  `deckent --version-json` kullanın; stdout parse edilebilir JSON kalmalı, banner karışmamalı
  (çok satırlı JSON kabul edilir).

Yerelleştirilmiş help için `deckent --help` öncesinde `DECKENT_LANGUAGE=tr` (veya yapılandırılmış
diliniz) ayarlayın. Türkçe help `Usage:` yerine `Kullanım:` gibi yerelleştirilmiş başlıklar kullanır.
Pipe/redirect senaryolarında dekoratif terminal çıktısı yerine yukarıdaki makine-güvenli yüzeylere
güvenin. Bu rehberdeki davranış Linux/WSL üzerinde doğrulanmıştır; diğer platformlar iddia edilmez.

### `deckent init` splash

`deckent init` çalıştığında Kraken splash, TTY `--version` ile aynı capability ve renk kurallarıyla
başlangıçta basılır. Splash, hoş geldin banner'ından ve kurulum ilerlemesinden önce gelir; init
sonuç bloğunun dili (`Setup outcome:` / `Kurulum sonucu:`) ile bağımsızdır. Etkileşimsiz kanıt
için `deckent init --yes --no-install --no-image` (veya sistem dilinin outcome mesajlarını
sürüklemesi için `--auto --yes …`) kullanılır. Init tamamlanması ile provider/doctor durumu,
splash glyph/renk sözleşmesinden ayrıdır.
