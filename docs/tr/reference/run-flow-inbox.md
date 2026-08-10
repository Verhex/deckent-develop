# Run-flow gelen kutusu

`deckent runs`, run-flow gelen kutusunu gösterir: Deckent'in run yaşam döngüsüne
girmiş olan mevcut flow kümesi. Bir run-flow, önerilen bir koşuyu önce bir karara,
sonra (onaylanıp başlatıldığında) detached arka plan yürütmesine ve nihayetinde
terminal sonucuna taşır. Gelen kutusu, bu flow'ları görmek ve birine müdahale etmek
için ortak operatör görünümüdür.

Gelen kutusunu listelemek için `deckent runs` çalıştırın. Tek bir flow'u incelemek
için ya güncel liste konumunu ya da benzersiz bir flow-id ön ekini verin:

```bash
deckent runs 2
deckent runs bbbb2222
```

Liste konumları, gelen kutusu tazelendikçe veya yeniden sıralandıkça değişebilir;
benzersiz flow-id ön eki ise kararlı tutamaçtır. Tam olarak bir flow'u tanımlamayan
bir ön ek tahmin edilmez.

## Kararlar

Karar bayrakları bir hedef gerektirir (`<n>` veya benzersiz flow-id ön eki).

- `--approve` seçili flow için onayı kaydeder (SLOW AHEAD). `--start` ile
  birleştirilmediği sürece yürütmeyi başlatmaz.
- `--start` seçili onaylı flow'u detached arka plan koşusu olarak başlatır.
  Onaysız bir flow'u başlatmak run service tarafından reddedilir. `--approve` ile
  birlikte kullanıldığında flow'u önce onaylar, sonra başlatır (FULL AHEAD).
- `--reject` seçili flow için STOP kararını kaydeder. `--approve` ile birlikte
  kullanılamaz.
- `--reason <text>` `--reject` ile birlikte bir gerekçe kaydeder; `--reject`
  olmadan geçersizdir.

## Bayat koşu sınıflandırması

Hâlâ canlı olduğunu iddia eden ama ölü bir process'i ya da doğrulanamayan bir
pre-process kaydı olan flow'ları sınıflandırmak için `--close-stale` kullanın.
Varsayılan olarak dry-run'dır: komut adayları raporlar, hiçbir yazma yapmaz.
Bunları kalıcı olarak kapatmak için `--yes` ekleyin: ölü olduğu kanıtlanan
process'ler failed olarak, operatör onayıyla doğrulanamayan kayıtlar ise cancelled
olarak kapatılır.

## Örnek

Gelen kutusunu inceleyin, ardından şu anda 2. konumdaki flow'u onaylayıp başlatın:

```bash
deckent runs
deckent runs 2 --approve --start
```

İkinci komut o flow için tazelenmiş detayı basar; böylece görüntülenen durum,
ortaya çıkan kalıcı kararı ve başlatma denemesini yansıtır.
