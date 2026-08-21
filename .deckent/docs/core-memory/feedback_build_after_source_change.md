# Build-after-source-change (Alperen, 2026-08-21)

Sprint (dogfooding) veya el-kodu sonrası kaynak kod değiştiyse ve süreç
tamamlandıysa MUTLAKA `npm run build:all` ile build alınır: "build almazsan
eklenen özellikler kendisini dogfooding'de doğru şekilde gösteremez; dist=src
olarak yürüyeceğiz — src değişince tekrar build."

**Why:** Dogfooding dist/'ten koşar; build alınmazsa yeni landed özellikler
sonraki sprint/deckent-koşularında görünmez — dist-src drift'i sessiz
yanlış-davranış üretir (DECKENT_BINARY_IDENTITY_WARN bunun sinyalidir).

**How to apply:** Döngü: kod wired+landed → `npm run build:all` → dogfooding/
el-kodu devam. Sprint KOŞARKEN build YASAK kuralı aynen geçerli (ESM-cache +
worker auth-loss) — build sprint-arası alınır; build sonrası bot/MCP restart
ritüeli. Clean-adımı HOLD verirse (bot aktif / xv-artığı): bot-stop →
xv-arşiv-taşıma → build → bot-start.
