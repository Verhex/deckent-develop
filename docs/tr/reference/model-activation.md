# Model aktivasyonu

Model tespiti (detection), bir sağlayıcının mevcut kimlik doğrulama modu için
**neyi sunduğunu** yanıtlar. Model aktivasyonu ise, tespit edilen modellerden
hangilerinin Deckent'in routing havuzuna girmesine sahibin **izin verdiğini**
yanıtlayan, owner-managed katmandır. Sahibin, sağlayıcının keşfedilmiş
kataloğunu koruyup tek tek modelleri routing dışında tutmasını sağlar.

Aktivasyon kararları proje başına `.deckent/models.db` içinde, sağlayıcı ve model
kimliğine göre anahtarlanarak saklanır. Bir karar, değiştirilene kadar kalıcıdır.
Tespit, devre dışı bırakılmış bir modeli görmeye devam eder; model yalnızca
routing havuzundan çıkarılır.

## Komutlar

Kayıtlı aktivasyon kararlarını göster:

```bash
deckent models activation
```

Kayıtlı karar yoksa bu komut, tespit edilen her modelin aktif olduğunu bildirir.
Varsayılan davranış da budur: kaydı olmayan bir model aktiftir, dolayısıyla mevcut
projeler bir sahip karar kaydedene kadar bugünkü davranışlarını korur.

Tespit edilen bir modeli routing havuzuna al:

```bash
deckent models activate <model> --provider <name>
```

Tespit edilen bir modeli routing havuzundan çıkar:

```bash
deckent models deactivate <model> --provider <name>
```

`--provider <name>` seçeneği her iki değişiklik için de zorunludur. Kararlar, o
sağlayıcı ve model çiftine kapsamlanır.

## Örnek

`codex` sağlayıcısı için tespit edilen `gpt-5-mini` modelini routing dışında
tutmak üzere:

```bash
deckent models deactivate gpt-5-mini --provider codex
deckent models activation
```

İlk komut `codex/gpt-5-mini` modelinin devre dışı bırakıldığını onaylar. İkincisi
onu `inactive` olarak listeleyerek kaydedilen kararı doğrular; sağlayıcı modeli
tespit etmeye devam edebilir, ancak routing onu seçmez.
