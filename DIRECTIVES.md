# DIRECTIVES — CACHE-BİRLEŞME TEST SPRİNTİ (owner-tasarımı 2026-08-19; yalnız claude worker)

## Goal

Owner deneyi: aynı abonelik altında ART ARDA doğan claude worker'ların Anthropic
prompt-cache'i PAYLAŞIP paylaşmadığını ölçmek (5-dk cache-TTL penceresi). Altı
görev, iki zincir: opus-5 zinciri 1→2→3 (1 kapsamlı, 2-3 özdeş-basit), sonnet-5
zinciri 4→5 + bağımsız 6 (4 ve 6 özdeş-basit kontrol, 5 yalnız-okuma denetim).
Ölçüm sayaçları her worker'ın kendi provider-envelope billing'inden okunacak
(cacheCreation vs cacheRead). Bu bir DENEY sprintidir: tüm çıktılar
`deneme-kontrol/` klasörüne yazılır ve deney sonrası silinir (delete-on-consume).

## Execution Contract

- Yalnız doküman üretimi: hiçbir görev build, test, lint veya kod değişikliği
  YAPMAZ; `src/`, `tests/`, `docs/` ve diğer repo yollarına DOKUNULMAZ.
- Basit görevler (Task 2,3,4,6): HİÇBİR bash/araç çalıştırma, HİÇBİR dosya
  okuma — yalnız tek küçük markdown dosyası yaz ve result yaz. Görevi
  büyütme/refleme YASAK: kapsam genişletme önerisi bile yazma.
- Task 1 yalnız `deckent --help` ve alt-komut `--help` çıktılarını OKUR
  (read-only); başka komut çalıştırmaz.
- Task 5 yalnız `deneme-kontrol/deckent-arac-rehberi.md` dosyasını OKUR;
  komut çalıştırmaz.
- Her görev YALNIZ kendi Files listesindeki dosyayı yazar; hepsi
  `deneme-kontrol/` altındadır.
- Result'a runPolicyEvidence digest'i prompt'taki Result contract'ına göre yaz.

## Task 1: Deckent araç rehberi (kapsamlı — cache'i dolduran iş)
- Files: deneme-kontrol/deckent-arac-rehberi.md
- Scope: deneme-kontrol/
- Provider: claude
- Model: claude-opus-5

### Description
`deneme-kontrol/` klasörünü oluştur ve `deckent-arac-rehberi.md` yaz: deckent'in
ne olduğunu anlatan kısa giriş + EN AZ 20 CLI komutunu `node dist/cli/entry.js
--help` ve seçtiğin alt-komutların `--help` çıktılarını okuyarak (yalnız help,
başka komut yürütme) her biri için 2-3 cümlelik açıklama. Türkçe yaz.

### GO Criteria
- Dosya mevcut, ≥20 komut başlığı içeriyor; başka hiçbir dosya değişmedi.

## Task 2: Merhaba Dünya (özdeş-basit — cache-hit ölçüm noktası A)
- Files: deneme-kontrol/merhaba-dunya.md
- Scope: deneme-kontrol/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
TEK iş: `deneme-kontrol/merhaba-dunya.md` dosyasına "# Merhaba Dünya" başlığı ve
bir selam cümlesi yaz. HİÇBİR araç çalıştırma, HİÇBİR dosya okuma, hiçbir şey
inceleme. Bu kadar.

### GO Criteria
- Dosya mevcut ve kısa; başka hiçbir dosya değişmedi; hiçbir araç çalıştırılmadı.

## Task 3: Opus-3 notu (özdeş-basit — cache-hit ölçüm noktası B)
- Files: deneme-kontrol/opus-3-notu.md
- Scope: deneme-kontrol/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 2

### Description
TEK iş: `deneme-kontrol/opus-3-notu.md` dosyasına "# Opus-3 Notu" başlığı ve bir
selam cümlesi yaz. HİÇBİR araç çalıştırma, HİÇBİR dosya okuma. Bu kadar.

### GO Criteria
- Dosya mevcut ve kısa; başka hiçbir dosya değişmedi; hiçbir araç çalıştırılmadı.

## Task 4: Selam dokümanı (sonnet özdeş-basit — taban ölçümü)
- Files: deneme-kontrol/selam.md
- Scope: deneme-kontrol/
- Provider: claude
- Model: claude-sonnet-5

### Description
TEK iş: `deneme-kontrol/selam.md` dosyasına "# Selam" başlığı ve bir selam
cümlesi yaz. HİÇBİR araç çalıştırma, HİÇBİR dosya okuma. Bu kadar.

### GO Criteria
- Dosya mevcut ve kısa; başka hiçbir dosya değişmedi; hiçbir araç çalıştırılmadı.

## Task 5: Denetim raporu (yalnız-okuma analiz)
- Files: deneme-kontrol/denetim-raporu.md
- Scope: deneme-kontrol/
- Provider: claude
- Model: claude-sonnet-5
- Dependencies: Task 4, Task 1

### Description
`deneme-kontrol/deckent-arac-rehberi.md` dosyasını OKU (yalnız bu dosya; komut
çalıştırma). İçeriğini denetle, sorgula, analiz et: doğruluk, eksik komut,
anlatım kalitesi. Bulgularını `deneme-kontrol/denetim-raporu.md` dosyasına yaz.
SADECE doküman yaz — düzeltme yapma, başka dosyaya dokunma.

### GO Criteria
- Rapor mevcut; rehber dışında hiçbir dosya okunmadı; yalnız rapor yazıldı.

## Task 6: Sonnet-3 notu (özdeş-basit — bağımsız kontrol)
- Files: deneme-kontrol/sonnet-3-notu.md
- Scope: deneme-kontrol/
- Provider: claude
- Model: claude-sonnet-5

### Description
TEK iş: `deneme-kontrol/sonnet-3-notu.md` dosyasına "# Sonnet-3 Notu" başlığı ve
bir selam cümlesi yaz. HİÇBİR araç çalıştırma, HİÇBİR dosya okuma, hiçbir şey
inceleme. Bu kadar.

### GO Criteria
- Dosya mevcut ve kısa; başka hiçbir dosya değişmedi; hiçbir araç çalıştırılmadı.
