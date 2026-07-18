# DESKTOP-REBORN — Baştan-Tasarım Soru-Seti (2026-07-18)

> **Süreç-kararı (Alperen):** *"Küçük-küçük ilerlemeyle olmuyor — bozuk şeyi yamalıyorsun; bu
> prensibi kabul etmiyorum. Baştan tasarlayalım."* + *"Jarvis hissi; gemi değil DALGALANMA;
> görsel inanılmaz-unique; işlevleri desktoptan yapamıyoruz, böyle olmaz."*
> Bu doküman o sıfırdan-tasarımın TEMEL-ENSTRÜMANI: kapsamlı deckent-analizi üstüne kurulu,
> her maddesi **seçenekli + CC-önerili** soru-seti. Cevaplar bu dokümana işlenir → onaylı
> tasarım-anayasası doğar → prototip-turları → build. Yamalama YOK.

## 0 · Analiz-tabanı (soruların zemini — bugünkü taramalardan)

deckent'in TÜM yetenek-yüzeyi (Desktop bunların ekranı olmak zorunda):
- **Orkestrasyon:** 8-faz sprint-yaşamı · RunFlow (öner→önizle→onayla→başlat→izle→sonuçlan) ·
  20-40-mikro-task paralel-worker koşuları · Brain değerlendirme/FIX-döngüsü · checkpoint/pause
- **Canlı-telemetri:** worker-hb (durum/eylem/dosya/sayaç) · live-trace satır-akışı · faz-durumu ·
  kilitler · ACTIVITY-kanalı · koşu-kapanışları
- **Karar-yüzeyleri:** plan-onayı (Telgraf) · worker-onay-kartları · git-mühürü · checkpoint-kapıları
- **Kurumsal-hafıza:** memory.db (adr-47 · retro-203 · memory-290 · debt-222 · pattern-69 · chat-354)
- **Havuzlar:** 30+ ajan (tanım+prompt+stats) · skill'ler · routing-kuralları
- **Çevre:** MCP-sunucular · connector'lar (Telegram/Discord/WA) · provider'lar (Claude/Codex/Gemini)
- **Ekonomi/sağlık:** cost-config+ledger · usage/KPI · doctor · crashes · capability-audit · prompt-lint
- **Uzman-katman:** PTY-terminal · chat-REPL (29-bridge + exec-araçları + @path + kartlar)
Referans: `desktop-ihtiyac-analizi` (14-aile) + `desktop-enterprise-plan` (veri→ekran tablosu).

**Bugünün dürüst-durumu:** transport/servis-katmanı ÇALIŞIYOR (bugün kanıtlandı: canlı-sprint verisi,
SSE'ler, git/chat/terminal kontratları). Sorun iki yerde: (1) GÖRSEL-KİMLİK (kutu-grid ≠ his),
(2) İŞLEV-KAPSAMI (kontrol-fiillerinin çoğu hâlâ terminalde). Sorular bu ikisini SIFIRDAN kurar.

---

## BÖLÜM A · KİMLİK & HİS

**A1. Ana görsel-metafor nedir?**
- **(a) Dalga-Jarvis** *(ÖNERİM)*: deniz-teması SOYUTLAŞIR — her canlı-şey bir DALGA-FORMU
  (worker=canlı-dalga: amplitüd=aktivite, frekans=tempo, sönüm=bayatlama); koyu-zemin, ışıma
  (glow), ambient-derinlik. "Jarvis" hissi ile projenin deniz-DNA'sı tek dilde birleşir; literal
  gemi/çapa YOK.
- (b) Saf-Jarvis: holografik/radial/HUD dili; deniz-metaforu tamamen bırakılır.
- (c) Alperen görsel-yönetir: sen (gerekirse AI-görselle) referans-tasarım üretirsin, ben birebir uygularım.
- (d) Başka bir yön (tarif et).

**A2. Canlılık-yoğunluğu nasıl davranır?**
- **(a) Nefes-alan sahne** *(ÖNERİM)*: boşta sakin-ambient (hafif dalga-salınımı, düşük-ışıma);
  koşu başlayınca sahne UYANIR (dalgalar yükselir, telemetri-nehri coşar, ışıma artar). His:
  "uygulama yaşıyor ve işin ritmini hissettiriyor".
- (b) Hep-yoğun: sürekli zengin data-viz (uzay-üssü hissi; yorabilir).
- (c) Hep-sakin: minimal; canlılık yalnız sayı/metinle.

**A3. Renk-kimliği?**
- **(a) Koyu-birincil yeni-kimlik + vardiya-mirası** *(ÖNERİM)*: Jarvis-his koyu-zeminde doğar
  (open-sea'nin derin-mavisi evrimleşir; ışıma-accent'leri eklenir); 3-vardiya sistemi KORUNUR ama
  yeni dilde yeniden-türetilir (gündüz=parlak-hologram varyantı).
- (b) Tamamen yeni palet (vardiyalar sıfırlanır).
- (c) Mevcut paletler aynen; yalnız form-dili değişir.

**A4. Görsel-üretim süreci?**
- **(a) Canlı-prototip turları** *(ÖNERİM)*: ben HAREKETLİ HTML/canvas prototipler üretirim
  (bugünkü gibi ama GERÇEK-VERİYE bağlı — mock değil, koşan daemon'dan beslenir); sen her turda
  "şu kalsın/şu gitsin" dersin; beğenilmeyen tur ÇÖPE (yamalanmaz).
- (b) Önce sen görsel-referans tasarlatırsın (Figma/AI-görsel) → ben uygularım.
- (c) Hibrit: ben 2-3 zıt-yön prototip → sen seç/işaretle → gerekirse görsel-referansla düzelt.

## BÖLÜM B · BİLGİ-MİMARİSİ (sıfırdan)

**B1. Uygulamanın ANA-SAHNESİ nedir (açılınca ne var)?**
- **(a) Komuta-merkezi: Konuşma+Orkestra BİRLEŞİK** *(ÖNERİM — Jarvis'in özü)*: tek ana-sahne;
  ortada deckent'le KONUŞMA (emir/soru/karar tek-girdi), çevresinde canlı-orkestra
  görselleştirmesi (dalgalar/faz/telemetri). Jarvis'e konuşursun, Jarvis işi gösterir. Ayrı
  "chat-sekmesi" kavramı ölür — konuşma HER YERDE merkezdedir.
- (b) Operasyon-merkezi (görselleştirme-önce; konuşma yan-panel).
- (c) Proje-genel-bakış (özet-kokpit; her şey oradan dallanır).

**B2. Navigasyon-modeli?**
- **(a) Komut-paleti-birincil + ince-ray** *(ÖNERİM)*: Cmd/Ctrl+K her-şeye-ulaşım (Jarvis:
  "yazarsın, olur"); solda İNCE ikon-ray (5-7 çekirdek-sahne); derin-ekranlar paletten/bağlamdan.
- (b) Mevcut-gibi tam-ray (metinli, gruplu).
- (c) Yalnız palet (ray yok — çok radikal).

**B3. Kontrol-fiilleri nerede yaşar?** ("işlevleri desktoptan yapamıyoruz"un cevabı)
- **(a) HER fiil hem konuşmadan hem yüzeyden** *(ÖNERİM)*: start/plan/kill/pause/checkpoint/
  cleanup/config — tümü (i) konuşma-emriyle ("447'yi durdur"), (ii) bağlam-menüsü/düğmeyle;
  tehlikeliler çift-onay+mandal. Terminal-parite: Desktop'tan yapılamayan ORKESTRASYON-fiili
  kalmaz.
- (b) Fiiller yalnız yüzey-düğmeleri (konuşma yalnız sohbet).
- (c) Fiiller yalnız konuşma (yüzey salt-izleme).

**B4. Çekirdek-sahne SETİ (v1'de var-olacaklar — çoklu-seç):**
Aday: (1) Komuta-merkezi (2) Koşu-arşivi+karar-izi (3) Changes/mühür (4) Onaylar
(5) Terminal(PTY) (6) Brain-gezgini (7) Agents/Skills (8) Insights(maliyet/KPI/sağlık)
(9) Settings(config-editörü) (10) Integrations (11) Workspace(çoklu-proje)
- **ÖNERİM:** v1 = 1-2-3-4-5-9 çekirdek + 6-8 hızlı-takip; 7-10-11 v2.

## BÖLÜM C · CANLI-ORKESTRASYON GÖRSELLEŞTİRMESİ

**C1. Worker-temsili (dalga-kararın somutlaşması)?**
- **(a) Canlı-dalga-formları** *(ÖNERİM)*: her worker bir yatay dalga-izi (EKG/ses-dalgası
  melezi): satır-aktivitesi dalgayı yükseltir, sessizlik söndürür (bayat=düzleşen+sararan iz);
  dosya-yazımları dalga-üstü kıvılcım-imleri; tıkla→worker-odağı. Uğultu-nehriyle doğal birleşir.
- (b) Parçacık-akışları: orchestrator'dan worker'lara akan ışık-parçacıkları (graf-hissi).
- (c) Radial-HUD: merkezde sprint-halkası, worker'lar çevre-segmentler (saf-Jarvis).
- (d) a+c melezi: ana-sahne dalga; sprint-fazı radial-halka.

**C2. Telemetri-nehri (uğultu) yerleşimi?**
- **(a) Sahneyle İÇ-İÇE** *(ÖNERİM)*: satırlar İLGİLİ dalganın üzerinden doğar, nehre akar
  (kaynağını GÖRÜRSÜN); nehir altta toplanır. — (b) Ayrı alt-şerit (bugünkü eskiz). — (c) Sağ-sütun.

**C3. Faz/sefer-durumu?**
- **(a) Ortam-durumu + halka** *(ÖNERİM)*: faz sahnenin IŞIK-TONUNU değiştirir (EXECUTE=canlı,
  EVALUATE=süzülen, FIX=uyarı-tonu) + köşede ince faz-halkası (radial-ilerleme). — (b) Yatay-hat
  (bugünkü). — (c) Yalnız-metin.

**C4. Ses-katmanı?**
- **(a) v1 YOK; v2 opsiyonel-kapalı-default ambient** *(ÖNERİM)*. — (b) v1'de hafif-ambient. — (c) Asla.

## BÖLÜM D · İŞLEV-PARİTE (fiil-fiil karar — çoklu-seç)

**D1. v1'de Desktop'a gelecek KONTROL-fiilleri:**
start · plan(+DIRECTIVES-editörü) · approve/reject · **kill** · **pause/resume** · **checkpoint-karar** ·
cleanup · retro-görüntüle · config-yaz · git-mühür · run(tek-task)
- **ÖNERİM:** TÜMÜ v1 (mandal+çift-onay'la) — "yapamadığım fiil var" cümlesi ölür.

**D2. Konuşma (Telsiz'in yeni-hâli) hangi seviye?**
- **(a) TAM-REPL-parite** *(ÖNERİM)*: Desktop-konuşması = native-REPL motoru (29-bridge +
  exec-araçları + onay-kartları + @dosya + slash) — terminal-REPL'in birinci-sınıf GUI'si.
- (b) Bugünkü basit-chat + emirler. — (c) Aşamalı (önce emir-fiilleri, sonra araçlar).

**D3. Worker-onay-kartları (izin-motoru) Desktop'ta?**
- **(a) Evet — kart Jarvis-diyaloğu olur** *(ÖNERİM)*: worker izin istediğinde sahnede diyalog-
  kartı belirir (aynı risk/özet; onay klavye+tık). — (b) Yalnız Approvals-listesinde. — (c) v2.

## BÖLÜM E · TEKNİK-TEMEL

**E1. "Baştan" kapsamı?**
- **(a) Görünüm-katmanı SIFIRDAN; çekirdek-altyapı korunur** *(ÖNERİM)*: bugün kanıtlanan
  transport/servisler (SSE'ler, sprint-live, git, chat, PTY, i18n-köprüsü, tema-token-mimarisi)
  MOTOR olarak kalır; TÜM görünümler+kabuk yeni-kimlikle sıfırdan yazılır (eski Shell emekli).
  "Yamalama-yok" ile "kanıtlanmışı-çöpe-atma-yok" dengesi.
- (b) Renderer komple sıfırdan (transport dahil). — (c) Electron-katmanı dahil her şey.

**E2. Canlılık-transportu?**
- **(a) SSE-birincil birleşik-akış** *(ÖNERİM)*: 586 öne çekilir — tek `/api/live` birleşik-kanal
  (sprint+worker+telemetri+faz); poll ölür; "muazzam-his" gecikmesiz-akışla mümkün.
- (b) Bugünkü poll+parça-SSE karışımı yeter.

**E3. Dalga/sahne render-teknolojisi?**
- **(a) Hibrit** *(ÖNERİM)*: sahne/dalgalar **Canvas** (60fps, yüzlerce-worker'a ölçek — Yasa-2);
  UI/metin DOM+token. — (b) Saf-SVG/CSS (basit ama ölçek-tavanlı). — (c) WebGL (en-güçlü; maliyetli).

**E4. Prototip-doğrulama?**
- **(a) Gerçek-veri prototipi** *(ÖNERİM)*: her tur koşan-daemon'a bağlı çalışır-prototip
  (canlı sprint'le izlersin); statik-mock yasak. — (b) Statik-görsel turlar yeter.

## BÖLÜM F · SÜREÇ

**F1. Tren & KABUL ilişkisi?**
- **(a) 589 «DESKTOP-REBORN» treni açılır** *(ÖNERİM)*: 588 durur (yamalama-yasağı); KABUL-sayacı
  askıya — REBORN v1 çıkınca KABUL yeniden başlar (o zaman gerçek-ürünü test edersin). 
- (b) 588 içinde devam. — (c) KABUL paralel sürsün.

**F2. Tur-ritmi?**
- **(a)** Soru-seti-cevapları → TASARIM-ANAYASASI (onaylı) → Konsept-prototip-turu (2-3 zıt-yön,
  gerçek-veri) → seçim → v1-build (dilimli ama HER dilim anayasaya-karşı, yamasız) *(ÖNERİM)*.
- (b) Doğrudan tek-prototip → düzelt-turları.

---
*Cevaplama: chat'ten 4'lü-turlarla (CC soru-kartları) ya da bu dosyaya işaretle. Her cevap
dokümana işlenir; tamamlanınca «tasarım-anayasası» bölümü doğar ve SSOT olur.*


---

# ✅ TASARIM-ANAYASASI (20/20 cevaplandı — Alperen 2026-07-18; SSOT)

## Kimlik
- **Metafor: SAF-JARVIS (HUD)** — deniz-metaforu görselden TAMAMEN emekli (dalga yalnız teknik-osiloskop olarak yaşar)
- **Canlılık: nefes-alan HUD** — boşta sakin-ambient; koşuda sahne UYANIR
- **Renk: koyu TEK-kimlik + ışıma-accent** (accent-ailesi prototip-turunda birlikte seçilir); vardiya-sistemi emekli → tema=yoğunluk-varyantları
- **Adlar: Jarvis-nötr** — Komuta · Akışlar · Onaylar · Terminal · Değişiklikler · Bellek · Insights · Ayarlar (i18n yeni-kök; Köprüüstü-adları emekli)

## Bilgi-mimarisi
- **Ana-sahne: KOMUTA-MERKEZİ** — konuşma+orkestra BİRLEŞİK (ayrı chat-sekmesi ölür)
- **Gezinme: Cmd/Ctrl+K birincil + ince ikon-ray** (5-8 sahne)
- **Fiiller: TÜMÜ çift-yol** — konuşma-emri + yüzey-düğmesi (start/plan/kill/pause/checkpoint/cleanup/config/mühür…); tehlikeliler çift-onay+mandal — "desktoptan yapamadığım" cümlesi ölür
- **v1-set (8 sahne):** Komuta + Akışlar + Onaylar + Değişiklikler + Terminal + Ayarlar + **Bellek + Insights**

## Sahne (Komuta-merkezi görselleştirmesi)
- **Worker-temsili: RADIAL-ÇEKİRDEK + OSİLOSKOP melezi** — merkez sprint-halkası (faz+nabız); worker'lar yörünge-segmentleri (ışıma=aktivite, sarı=bayat); seçili-worker osiloskop-izi
- **Telemetri: sahne-içi doğuş → nehir** (satır segmentten doğar, nehre süzülür)
- **Faz: ambient-ışık-tonu + çekirdek-halka** (faz sahneyi YAŞAR)
- **Worker-izin-kartı: sahne-diyaloğu** (orkestra durmadan karar)
- **Ses: v1 YOK; v2 opsiyonel default-kapalı**

## Konuşma
- **TAM-REPL-parite:** 29-bridge + exec-araçları + onay-kartları + @dosya + slash — native-REPL motorunun GUI'si

## Teknik
- **Kapsam: görünüm-katmanı SIFIRDAN; motor korunur** (SSE/servisler/kontratlar/i18n-köprüsü/token-mimarisi = motor; eski Shell tamamı emekli)
- **Transport: SSE-birincil BİRLEŞİK /api/live** (586 öne çekilir; poll ölür)
- **Render: Canvas-sahne + DOM-UI hibrit** (60fps; yüzlerce-worker ölçeği — Yasa-2)
- **Doğrulama: GERÇEK-VERİ prototipi** (koşan-daemon'a bağlı; statik-mock YASAK)

## Süreç
- **Tren: 589 «DESKTOP-REBORN»**; 588 DONDU (yamalama-yasağı); **KABUL askıda** — REBORN-v1 çıkınca gerçek-ürünle yeniden başlar
- **Ritim: ANAYASA (bu) → 2 ZIT-YÖN gerçek-veri prototipi → Alperen-seçimi → v1-build** (her dilim anayasaya-karşı; yama yok, beğenilmeyen çöpe)
