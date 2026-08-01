# F1.5 «CANLANDIRMA» — «Sefer Sahnesi» Tasarım-Eskizi (588 · P13-cevabı)

**Durum:** ESKİZ — Alperen görsel-onayı bekliyor (design-then-approve, D4-0 deseni)
**Görsel:** `588-f15-canlandirma-preview.html` — tarayıcıda aç (3 vardiya-anahtarlı, HAREKETLİ;
palet theme-tokens.ts'ten birebir). **Tetik (Alperen):** *"kutucuk-içinde-yazı deckent'e yakışmıyor;
canlı, muazzam his veren, orkestrasyonu HİSSETTİREN app istiyorum; milyonda-1'indeyiz; MVP yetmez."*

## 1 · Kavram — kart-grid ölür, SAHNE doğar

Köprü bir *liste* değil bir **seyir-sahnesi** olur. Orkestrasyon-hissinin üç yasası:

1. **Her hareket BİLGİ taşır** (süs-animasyon yasak — D4-0 guardrail'i): teknenin hızı=etkinlik,
   baş-fenerinin nabzı=kalp-atışı (yeşil=canlı · sarı=bayat), dümen-suyu izi=süreklilik,
   akan-cümle=worker'ın ŞU-AN'ı.
2. **Sahne asla durmaz, asla kaybolmaz:** detay yan-panelde sahnenin ÜSTÜNE süzülür (navigasyonla
   kaçış yok) — orkestra arkada çalmaya devam eder.
3. **Tek-nehir telemetri:** dört ayrı pencereye bölünmüş dikkat yerine «makine-uğultusu» — tüm
   worker'ların insan-satırları TEK akışta, worker-renk-şeritli; satır-tık → o worker'ın penceresi.

## 2 · Sahne-organları (önizlemedeki birebir)

| Organ | Ne | Veri (BUGÜN var mı) |
|---|---|---|
| **Seyir-hattı** | 8 faz = harita-mevkileri; aktif-bacak kesikli-akar (Rota-imzasının faz-hâli); `sprint-447 · 14dk` damgası | ✅ `/api/sprint/live` (P9-fix'li) |
| **Deniz-şeritleri** | worker-başına şerit: tekne-glifi (salınım+seyir) · baş-feneri=hb-nabzı (bayat→sarı) · sağda hb/dosya/±satır sayaçları · altta ŞU-AN-cümlesi | ✅ live.workers.hb (+± sayılar → result/numstat F2) |
| **Dosya-rıhtımı** | kim-neye-dokunuyor tek-şerit; çift-tutucu kırmızı-yanıp | ✅ filesWrite (+locks) |
| **Makine-uğultusu** | birleşik canlı-telemetri nehri (satır-tık→pencere) | 🟡 per-worker SSE VAR → v1: renderer N-akış birleştirir (4×EventSource); v2: sunucu birleşik-endpoint (586) |
| **Yan-panel** | Worker-Penceresi sahne-üstüne süzülür (route-kaçışı yerine overlay; mevcut sekmeler aynen) | ✅ (F1 penceresinin yeniden-yerleşimi) |

## 3 · Hareket-disiplini (D4-0 deniz-ritmi, TAM uygulama)
- süzülme ~240ms ease-out (yanaşır, belirmez) · tekne-salınımı 3-4sn sinüs · fener-nabzı 1.6sn
- `prefers-reduced-motion` → TÜM hareket ölür (konumlar anlık, bilgi kaybolmaz)
- renk asla tek-taşıyıcı değil (fener-sarısı + "47sn" metni birlikte)

## 4 · Uygulama-dilimleri (onay-sonrası)
1. **C1 Sahne-iskeleti:** BridgePanel → SeaLanes (şeritler+tekneler+sayaçlar+ŞU-AN-cümlesi); kart-grid emekli
2. **C2 Uğultu:** renderer 4-akış birleştirici + nehir-bileşeni (satır-tık→pencere)
3. **C3 Yan-panel:** WorkerView overlay-modu (route korunur; sahne-üstü süzülme)
4. **C4 Rıhtım+cila:** dosya-rıhtımı canlı-bağ (locks) · seyir-hattı damgaları · boş/bitti-sahneleri
Her dilim: hermetik-pin + hot-reload görsel-tur; C-serisi bitince paketli-koşu kanıtı.

## 5 · Alperen-kararları
1. **Sahne-onayı:** önizlemedeki dil (tekne-şeritleri + uğultu + rıhtım + overlay-panel) BU mu? (değişiklik notların?)
2. **Uğultu-yerleşimi:** sahnenin ALTINDA tam-genişlik (önizleme) — mi, sağda dikey-sütun mu?
3. **C1-C4 sırası onayı** — onayla birlikte C1'e başlarım.
