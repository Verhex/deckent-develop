# a6-sinav-u3 — AYNI İŞ, İKİ FORMAT (şablonun kanıtı)

## ÖNCE (sınav-1'deki şablonsuz-NL — tek cümle):
> "run-flow-coordinator icindeki event-fold rehydrate yolunda sequence-boşluğu tespiti ekle:
> ardışık-olmayan sequence görülürse typed integrity-hatası fırlat ve mevcut fold davranışını koru"
Eksikleri (442-analizi §3.8 sınıfı): duplicate-sequence?, sequence'sız-legacy-event?,
karışık-set?, iki-process?, hata-tipi-adı?, kanıt=?

## SONRA (şablonlu-spec):
### 1 · AMAÇ
Event-fold rehydrate yolu sessiz state-corruption'a açık: ardışık-olmayan sequence
fold'u bozabilir. Boşluk-tespiti eklenir; fold-davranışı değişmez.
### 2 · DOSYA-KAPSAMI
- Yazılacak: src/orchestra/run-flow-coordinator.ts · yeni: tests/orchestra/run-flow-coordinator-gap.test.ts
- Okunacak-kritik: src/core/run-flow-store.ts (sequence-atama sözleşmesi) · src/core/run-flow-contract.ts
- Ayrık-test-kararı: birlikte
### 3 · EDGE-POLİTİKALARI
- Duplicate sequence → RunFlowSequenceIntegrityError (typed). Boşluk (n, n+2) → aynı hata,
  expected/actual alanlı. TÜMÜ sequence'sız (legacy) → store-sırası korunur, hata YOK.
  KARIŞIK (kimi var kimi yok) → integrity-hatası (sessiz-karışım yasak).
- İki-process: coordinator tek-yazar (SURF-1 sözleşmesi); okuma-yarışı bu task-dışı.
- String-throw yasak; hata RunFlowCoordinatorError-ailesinden türer, cause korunur.
### 4 · DÖNÜŞ/MUTASYON-SEMANTİĞİ
getFlow dönüşü mevcut sözleşmesini korur; hata fold-ÖNCESİ fırlar (yarım-fold state sızmaz).
### 5 · KANIT
Testler: gap-detected · duplicate-detected · all-legacy-passes · mixed-rejected ·
error-carries-expected-actual · fold-davranışı-regresyonsuz (mevcut coordinator-ailesi yeşil).
tsc tek-başına kanıt DEĞİL.
### 6 · YASAKLAR — sabit-blok aynen.
### 7 · BÜYÜKLÜK — mini (tek-modül + test); hedef 3-4 task.
