# Cross-provider xverify netleştirme seçeneği

Codex/Brain, kök-neden veya tasarım kararı ciddi biçimde belirsiz kaldığında
`deckent xverify` üzerinden farklı provider ile bağımsız ikinci görüş alabilir.
Tercih edilen verifier Fable 5'tir; exact provider/model effective config,
registry, reachability ve entitlement evidence üzerinden çözülür.

Bu seçenek:

- otomatik karar veya kod değiştirme yetkisi vermez;
- ana agent'ın kanıt toplama ve kullanıcı onayı sorumluluğunu devretmez;
- same-provider self-verify'a düşmez;
- verifier authority doğrulanamıyorsa typed `unavailable/HOLD` olarak kalır.

Kaynak: Alperen onayı, 2026-07-30.
