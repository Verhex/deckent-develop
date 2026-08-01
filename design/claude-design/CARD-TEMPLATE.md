# Kart-Şablonu Kuralı (bağlayıcı — design-critic 2026-08-01 #5 kapanışı)

Her yeni DS kartı (foundations · components · patterns · rounds · surfaces) bu kurala uyar;
mevcut kartlar sıradaki dokunuşta hizalanır. Denetçiler sapmayı bulgu sayar.

## Kabuk (kanonik ölçüler — status-pill soyu)
- `body{font:13px/1.5 var(--f-b); padding:48px}` · `.wrap{max-width:1040-1080px}`
- `section{margin-top:40px; border-top:1px solid var(--border); padding-top:22px}`
- `.label{11px var(--f-m); letter-spacing:.14em; color:var(--text-muted); margin-bottom:16px}`
- eyebrow: `11px var(--f-m) .18em` renk **accent** · h1: `var(--f-d) 700 40-44px`
- footer: kaynak-satırı (`design/tokens/...` + tarih), `11px var(--f-m) text-muted`

## Adlandırma + dil
- h1 = doğal boşluklu ad (`Approval Dialog`, `Status Pill`); dosya/dizin kebab-case.
- State adları **EN-kanonik** (`default/hover/focus-visible/active/disabled`; sonuçlar
  `allowed/denied`; süreçler `pending/working/complete/aborted`). TR yalnız annotasyon/anlatım.
- Faz-sözlüğü tek kaynak: `SprintPhase` enum (`PLAN…COMPLETE`) — `cleanup` komuttur, faz değil.

## Zorunlu bölümler
1. Spec tablosu (element/varyant × token rolleri) — rol kaynakta yoksa **ADAY** etiketi + §6 kaydı.
2. **Bilinçli boşluklar** (+ ürünleşme-şartları) — gövdedeki her boşluk burada görünür; sessiz borç yasak.
3. Canlı-WCAG rozet bloğu (etkileşimli/renk-taşıyan kartlarda): `pass → AA/OK`,
   `fail+declared → BEYAN` (amber), `fail+beyansız → FAIL` (abort) — declared alanı OKUNUR.

## Değer disiplini
- Renk yalnız `:root` "generated-from design/tokens" bloğundan; rgba yalnız token kanallarından.
- Temsilî token-dışı değer → `@parity-allow` tipli muafiyet (kart içinde, gerekçeli).
- Ölçü/opaklık/blur literal'i = token-adayı olarak beyan + pipeline §6 kaydı; token'lananlar
  "Token'landı (tarih)" diline çevrilir.
- Fontlar `/*__FONTS__*/` marker; orkestratör makine-izi setini enjekte eder.

## Motion + a11y tabanı
- `prefers-reduced-motion` TÜM animasyon/transition'ı kapatır (JS-akışlar dahil davranış beyanı).
- Çift-taşıyıcı zorunlu; emoji yasak (ADR-G-010); örnek-data EN-jenerik, AI-slop yasak.
