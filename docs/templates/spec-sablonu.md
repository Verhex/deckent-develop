# SPEC-ŞABLONU (PCOMP-8 U3 · G7+G20) — do/sprint NL'leri için ZORUNLU-BÖLÜMLÜ format

> Kural: Brain/CC bir `deckent do`-NL'i ya da sprint-spec'i bu şablonun TÜM zorunlu
> bölümleri dolu olmadan GÖNDEREMEZ. "Boş bölüm = gönderilemez." Bölüm gerçekten
> uygulanamıyorsa `—: neden-uygulanamaz` yazılır (sessiz-atlama yasak).
> Kaynak-kusurlar: Alperen 442-analizi §3.5-3.9 (muğlak dikiş/semantik/sıralama) +
> A3-matrisi G7/G20. İleride `do --spec <dosya>` bu şablonu makine-okur alır.

## 1 · AMAÇ (tek paragraf)
Ne değişiyor, kimin için, hangi kusuru/özelliği. Görev-DIŞI olan şeyler ("YAPMA"
listesi buraya değil — §6'ya).

## 2 · DOSYA-KAPSAMI
- **Yazılacak:** tam-yollu dosya listesi (dizinsiz-ad yasak). Yeni-dosya "yeni:" önekiyle.
- **Okunacak-kritik:** işin doğru yapılması için MUTLAKA okunması gereken sözleşme-dosyaları.
  (Normalize-katmanı import/mention-tamamlaması yapar; buradakiler ONUN ÜSTÜNE insan-bilgisi.)
- **Ayrık-test-kararı:** testler bu task'ta mı ayrı-task'ta mı? (`birlikte` | `ayrık-task`)

## 3 · EDGE-POLİTİKALARI (asgari üç soru cevaplanır)
- Sıralama/eşzamanlılık: (ör. duplicate/eksik-sequence, iki-process yarışı → beklenen davranış?)
- Legacy/geriye-uyum: eski-format/eski-kayıt görülürse?
- Hata-yolu: hangi durum TYPED hata, hangi durum sessiz-tolerans? (string-throw yasak)

## 4 · DÖNÜŞ/MUTASYON-SEMANTİĞİ
Public-yüzey ekleniyorsa: dönüş-tipi, mutable-iç-referans sızıntısı yasağı
(clone/readonly kararı), idempotency, adlandırma↔davranış tutarlılığı
(ör. listFlows adı ne vaat ediyorsa onu döndürür — kaynağı açık yaz).

## 5 · KANIT (davranış-koşusu ZORUNLU)
- `tsc temiz` TEK BAŞINA KANIT DEĞİLDİR (sıralama/fold/state kusurlarını yakalayamaz).
- Zorunlu: davranışı kanıtlayan hedefli-test senaryoları (isimleriyle) VE/VEYA
  gerçek-binary koşu komutu + beklenen çıktı.
- Task-ID-referansı: başka task'a bırakılan dikiş varsa TAM task-tanımıyla
  ("Task-2 doldurur" yasak — "<plan-içi-başlık> şu sözleşmeyle doldurur: …").

## 6 · YASAKLAR (sabit-blok — her spec'e aynen girer)
- Rapor/özet/doğrulama markdown-dosyası ÜRETME (kanıt=test+koşu-çıktısı).
- goNogo'da yalnız bu task'ta gerçekten yazılacak dosya-yolları; örnek/uydurma yol YASAK.
- Task başlıklarında virgül/ayraç yok. String-throw yok; typed-error ailesi.
- Mevcut export-imzaları görev açıkça istemedikçe DEĞİŞMEZ.
- ADR-kısıtları bağlayıcı (planner-prompt'unda listelenir); çelişki → task yerine amendment-notu.

## 7 · BÜYÜKLÜK
Hedef task-sayısı/parçalama notu (mikro-task kanunu: yüklü-iş = 20-40 mikro;
küçük-iş açıkça "mini" işaretlenir). `DECKENT_PLANNER_MIN/MAX_TASKS` gerekiyorsa belirt.
