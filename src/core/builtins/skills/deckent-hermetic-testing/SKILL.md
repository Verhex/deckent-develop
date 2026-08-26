# Deckent Hermetic Testing

## Hermetik Test Sınırı

- Her test kendi `mkdtemp`/`mkdtempDisposable` kökünü oluşturur; fixture, SQLite,
  config, task ve çıktı dosyalarını yalnız bu kökün altında tutar ve temizler.
- Teste verilen repo/workspace/home yolları da bu suite-owned kökten türemelidir;
  yalnız çıktı yolunu tmpdir yapmak, üretim kodunun canlı repo kökünü keşfetmesini
  engellemez.
- Test fresh checkout'ta geçmelidir. Önceden var olan `dist/`, kullanıcı home'u,
  global process durumu, sıra bağımlılığı veya başka testten kalan dosya bekleme.
- Repo'nun canlı `.tasks`, `.brain`, `.deckent`, `.locks`, `dist` ya da tracked
  dosyalarını fixture gibi yazma. Üretim varsayılanını sınamak gerekiyorsa repo
  kökünü değil, tmpdir içinde kurulmuş sentetik checkout'u gerçek giriş noktasına ver.
- `process.cwd()`, environment, timer ve module-global singleton değişikliklerini
  test sonunda geri al. Mümkünse bunları değiştirmek yerine clock, store ve root'u
  dependency olarak enjekte et.

## Vitest Kaynak Disiplini

Deckent doğrulamalarını `VITEST_MAX_FORKS=2` ile çalıştır:

```bash
VITEST_MAX_FORKS=2 npx vitest run tests/path/to/target.test.ts
```

Bu üst sınırı kaldırma veya geniş bir suite'i gerekmeden çalıştırma. Hedef test
dosyasını ve görevde ilan edilen gate'i kullan.

## Hermeticity Ledger Ritüeli

Canonical gate `scripts/lint-test-hermeticity.mjs` içindeki source-derived
`UNRESOLVED_BASELINE` count/digest ledger'ıdır. Gate ayrıca
`PRODUCTION_INVENTORY_BASELINE` drift'ini de ölçer; iki fingerprint'i birbirinin
yerine kullanma.

1. Ölçümü temiz, fresh-checkout eşdeğeri ağaçta yap; yorumlarda anlatılan
   build-free koşuluna uy. Kirli ortak worktree ölçümü baseline kanıtı değildir.
2. Yeni etkiyi tmpdir-hermetik hale getir. Canlı authority yazısını baseline'a
   ekleyerek meşrulaştırma.
3. Gerçek ve kaçınılmaz registry değişiminde tarihli yorum ekle: önceki count,
   yeni count, hangi dosya/etki sınıfının değiştiği ve neden hermetik olduğu.
4. Ölçülmüş `count` değerini güncelle. Count değişmese bile içerik/line kayması
   digest'i değiştirebilir; bunu yorumda açıkça `digest-only` olarak belirt.
5. **Digest'i en son pinle.** Test veya kaynak içeriği digest pininden sonra
   değişirse ölçümü yeniden üret; eski digest'i tahmin etme.
6. Gate çıktısındaki gerçek `current=count:digest` değerini kullan. Bir başka
   checkout, eski log veya elle hesaplanan dosya hash'i ledger kanıtı değildir.

Gate'i doğrudan çalıştır:

```bash
node scripts/lint-test-hermeticity.mjs
```

## Mock Factory Only-Shrink Kuralı

`scripts/lint-mock-factories.mjs`, `node:fs` ve `node:fs/promises` mock'larında
Vitest `importOriginal` çağrısını zorunlu tutar. Factory parametreyi gerçekten
çağırıp gerçek modülü almalı ve yalnız gereken üyeleri override etmelidir;
parametreyi yalnız adlandırma veya tüm fs yüzeyini eksik bir obje ile değiştirme.

`MOCK_FACTORY_BASELINE` kuruluş borcudur ve yalnız küçülür:

- Baseline dışındaki ihlal `FULL_NODE_FS_MOCK_FACTORY` ile FRESH hatadır.
- Artık ihlal içermeyen baseline kaydı `MOCK_FACTORY_STALE_BASELINE` hatasıdır;
  kaydı sil. Temizlenmiş kaydı yeniden ekleme.
- Yeni test dosyasını baseline'a eklemek çözüm değildir.

## Runtime Write Guard: `open` Flag Semantiği

`tests/hermeticity/runtime-write-guard.ts` savunma katmanıdır. `open`,
`openSync` ve `fs.promises.open` için path ancak flag write-capable ise korunur:

- omitted/`undefined`/`null`, yalnız `r`/`s` karakterlerinden oluşan string
  shape (normal kullanımda `r` veya `rs`) ve yazma bitleri olmayan numeric flag
  read-only kabul edilir;
- `+`, `w` veya `a` içeren string; `O_WRONLY`, `O_RDWR`, `O_CREAT`, `O_TRUNC`
  veya `O_APPEND` içeren numeric flag write-capable'dır;
- bilinmeyen flag shape fail-closed biçimde write-capable sayılır.

Read-only descriptor'a izin verilmesi sonradan fd üzerinden yazma yetkisi vermez.
Guard kurulumundan önce yakalanmış fonksiyonları veya numeric fd'leri geri alamaz;
bu yüzden static hermeticity gate ve tmpdir tasarımı asıl sınırdır.

## DONE Kontrolü

- Test fresh checkout varsayımıyla, suite-owned tmpdir içinde geçiyor.
- Global state ve tracked/live authority değişmeden kalıyor.
- İlan edilen komut `VITEST_MAX_FORKS=2` ile gerçek koşuldu.
- Gerçek komutun exit code'u ve stdout/stderr'i kanıt olarak saklandı; yalnız
  komut metnini yazmak koşum kanıtı değildir.
- Ledger gerekiyorsa tarihli açıklama + ölçülmüş count güncellendi ve digest en son
  pinlendi; gerekmiyorsa baseline'a dokunulmadı.
- Mock factory baseline'ı büyümedi.

## Anti-Patterns

- Repo içindeki gerçek `.tasks` veya tracked fixture dosyasını test sırasında yazmak.
- Local `dist/` varlığına dayanıp fresh checkout'ta kırılmak.
- Count/digest'i açıklamasız veya kirli tree ölçümünden kopyalamak.
- Digest'i pinledikten sonra taranan içeriği değiştirmek.
- Runtime guard'ı OS sandbox sanmak ya da unknown `open` flag'ini read-only saymak.

## Karpathy Notes
- **Surgical:** a hermeticity fix touches the one leaking test and its
  fixture — never "harden" neighbouring green tests in the same change.
- **Simplicity first:** prefer a tmpdir + explicit fixture over a mocking
  layer; reach for interposition only when the real API cannot be sandboxed.
- **Goal-driven:** DONE means the suite passes on a fresh checkout with the
  ledger pinned last — not that it passes on your warmed-up working tree.
