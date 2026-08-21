# GERİ-DEVİR: Codex → Fable (Claude) — devir-paketi sözleşmesi

> **Ne zaman kullanılır:** Anthropic limitleri yenilendiğinde ya da Alperen
> "yetkiyi geri devret" dediğinde. Bu doküman İKİ tarafın sözleşmesidir:
> **Codex** yetkiyi bırakırken buradaki DEVİR-PAKETİNİ eksiksiz üretir;
> **Fable** yetkiyi geri alırken paketi buradaki prosedürle DOĞRULAR.
> Aynı şema ters yönde (Fable→Codex devrinde Fable'ın bırakacağı paket) da
> geçerlidir — şema simetriktir, üreten taraf değişir.

---

## A. DEVİR-PAKETİ (bırakan taraf üretir — 9 bölüm, hepsi zorunlu)

Paket `follow-up-works/current-flow.md`'nin sonuna `## DEVİR-PAKETİ <tarih-saat>`
bölümü olarak yazılır (geçici-pad; tüketilince silinir) ve Alperen'e aynı
içerik mesaj olarak verilir.

1. **Kimlik + an:** kim bırakıyor (provider/model), zaman (ISO), neden
   (limit/owner-talimatı).
2. **Repo durumu:** `git branch -vv` + HEAD sha + push-durumu (origin ile eşit
   mi) + `git status --short` özeti — dirty dosyalar İŞ-BAZLI gruplanmış
   ("dalga-N landing'i bekliyor" / "el-işi X" / "runtime-artıkları").
3. **Canlı süreçler (disk-kanıtlı):** aktif sprint (id, launcher-pid, kaç task
   hangi durumda — `.tasks/*.result` selfAssessment'larıyla), bot (pid), Monitor/
   watcher'lar (hangisi neyi izliyor, hangi log-dosyası), arka-plan xverify'lar.
   Her canlılık iddiası hb-mtime/`kill -0` kanıtlı; süresi dolmuş/öksüz süreç
   varsa AÇIKÇA "öksüz — öldürülmeli" diye işaretlenir.
4. **Onay-durumu:** `approvals list` çıktısı (kısa-kodlarla); hangi pending neyi
   bekliyor, hangileri kural-otomasyonuna uygun (`aprp-*`), hangileri Alperen'lik
   (`aprcdb-*`/critical); aktif approval-rules listesi.
5. **Mühür-durumu:** açık her işin aşaması — tasarım/uygulama/sonuç mühürlerinden
   hangileri CONFIRMED (receipt sha'larıyla), hangisi bekliyor; koşan/başarısız
   xverify'lar ve UNCLEAR-serilerinde denenen daraltmalar.
6. **SSOT güncelliği:** MASTER-PLAN'a yazılmış son blok(lar); flow-pad'in güncel
   olduğu beyanı; YAZILMAMIŞ-ama-hak-edilmiş kayıt varsa listesi ("MASTER-borcu").
7. **Build-durumu:** son `npm run build:all` ne zaman/hangi HEAD'de; dist=src
   eşit mi (değilse hangi değişiklikler build bekliyor); bot hangi build'de.
8. **Dürüstlük-beyanı:** kanıtsız hiçbir iddia paket içinde "DONE" diye geçmez.
   Yarım işler "yarım — şu adımda" diye yazılır; bilinen riskler/blocker'lar ve
   şüpheler ("X'i doğrulayamadım") etiketli listelenir. Erken-zafer = sözleşme-ihlali.
9. **Kuyruk + ilk-adım önerisi:** öncelik-sıralı sonraki 3-5 iş; devralanın
   atması gereken İLK somut adım (tek cümle + neden).

## B. GERİ-ALMA PROSEDÜRÜ (Fable — devir-paketini işlerken)

1. `fallback-rules/for-codex.md` §1 okuma-listesindeki 1-2-3-4 maddelerini
   (CLAUDE.md zaten yüklü; kanonik MEMORY.md + MASTER-grep + flow-pad) tazele —
   Codex döneminde değişmiş olabilirler.
2. Paketi DOĞRULA (beyan ≠ kanıt): `git log/status` paket-2 ile; süreç-canlılığı
   paket-3 ile (hb-mtime + kill -0 + log-tail); `approvals list` paket-4 ile;
   receipt-sha'ları `.analysis/xverify/` raporlarıyla; build-beyanını
   `DECKENT_BINARY_IDENTITY_WARN` var/yok ile.
3. **Tutarsızlık bulursan:** işi İLERLETME — tutarsızlığı typed-HOLD olarak
   Alperen'e raporla (ne beyan edildi / diskte ne var / önerin). Sessiz
   düzeltme YASAK (Alp-Discipline: kayıpta-dur + dürüstlük-normu).
4. Öksüz süreçleri temizle (zaman-sınırlı watcher kuralı — ders-22); bayat
   onay-watcher'ı varsa öldür.
5. Kaynak Codex döneminde değişti ve build alınmadıysa: build-kuralını uygula
   (`npm run build:all` + bot-restart ritüeli) — SPRINT KOŞMUYORKEN.
6. Devir-paketindeki "MASTER-borcu" varsa önce onu kapat (SSOT güncelliği
   kuyruktaki her işten önce gelir — KANUN 4).
7. `## DEVİR-PAKETİ` bölümünü flow-pad'den SİL (tüketildi) ve Alperen'e
   "yetki geri alındı" mesajı ver: doğrulama-sonucu + kuyruk + ilk-adım.

## C. ORTAK KURALLAR (iki yön için)

- Devir ANLIK olabilmelidir: paket üretimi 10 dakikayı aşmamalı — bu yüzden
  flow-pad ve MASTER her zaman güncel tutulur (devir-hazırlığı ayrı bir iş
  değil, günlük disiplinin yan-ürünüdür).
- Devir sırasında KOŞAN sprint öldürülmez (Alperen-onaysız kill yasak) —
  paket-3'te devredilir ve devralan Monitor'u yeniden kurar.
- Transcript/konuşma-geçmişi devir-aracı DEĞİLDİR; devir yalnız bu şemadaki
  disk-artefaktlarıyla yapılır (owner mesaj-taşıyıcısı değildir —
  operating-policy handoff kuralı).
- Bu dosyalar (`fallback-rules/*.md`) KALICIDIR; içerik bayatlarsa güncelleyen
  taraf değişikliği Alperen'e tek-satır raporlar.
