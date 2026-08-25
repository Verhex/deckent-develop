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
