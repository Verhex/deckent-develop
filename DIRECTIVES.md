# DIRECTIVES — status blocked-etiket dürüstlüğü (dogfood-fabrika; yetki-devri 2026-08-20)

## Goal

`deckent status` çıktısındaki blocked-satırı bugün koşulsuz "blocked by
dependencies" diyor (src/cli/helpers/output.ts satır ~640, hardcode-EN) — oysa
bir görev dependency DIŞINDA file-collision sıralaması ya da başka admission
nedeniyle de bekleyebilir (sprint-589'da yaşandı: dependencies=[] iken 3 görev
collision yüzünden bekledi ve etiket yanılttı). Metin hem i18n'e taşınacak hem
neden-dürüst olacak. Davranış değişmez; yalnız metin-kaynağı ve ifade düzelir.

## Task 1: status blocked-satırı — i18n + neden-dürüst ifade

### Description
src/cli/helpers/output.ts içindeki hardcode blocked-satırı ("Blocked: N task(s)
blocked by dependencies") getMessage anahtarına taşınır (src/cli/helpers/messages.ts,
en+tr, `status.*` ailesi komşu-desenine uy). Metin neden-iddiası TAŞIMAZ —
nötr-dürüst ifade kullanılır: en "Blocked: {n} task(s) waiting (dependencies or
file-collision ordering)" / tr "Bekleyen: {n} görev (bağımlılık ya da
dosya-çakışması sıralaması)". Aynı fonksiyondaki komşu hardcode satırlar
("Next: ... will start as workers free up" ve stale-warning) da AYNI görevde
aynı aileyle i18n'e taşınır. Çoğul-ekleri anahtar-metin içinde {n} ile çözülür
(İngilizce tekil/çoğul için mevcut kataloğun kullandığı desene bak; yoksa tek
metinde "task(s)" biçimi kabul).
- Files: src/cli/helpers/output.ts, src/cli/helpers/messages.ts, tests/cli/status-output.test.ts
- Not: tests/cli/status-output.test.ts YENİ oluşturulur (mevcut değil) — blocked/next satır-render'ını hermetik pinler (tmpdir/fixture, spawnSync yok).
- Test: npx vitest run tests/cli/status-output.test.ts
- Model: claude-sonnet-5

### GO Criteria
src/cli/helpers/output.ts'te blocked/next/stale satırları hardcode değildir ve
blocked-metni "dependencies" tek-nedenini iddia etmez;
tests/cli/status-output.test.ts yeşil (yeni metne pin dahil); tsc --noEmit temiz.
