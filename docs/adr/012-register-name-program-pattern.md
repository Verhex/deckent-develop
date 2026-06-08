# ADR-012: register\<Name\>(program) Pattern

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Her CLI komutu kendi dosyasında tanımlanır ve `register<Name>(program: Command): void` fonksiyonu export eder.
**Context:** Tek dosyada tüm komutları tanımlamak bakım zorluğu yaratır. Ayrı dosyalar bağımsız test, kolay ekleme/çıkarma sağlar.
**Consequence:** Her CLI komutu `src/cli/commands/` altında kendi dosyasında; entry point (`src/cli/index.ts`) her biri için bir `register<Name>(program)` çağrısı yapar. Yeni komut eklemek: dosya oluştur + `index.ts`'e import + `register` çağrısı ekle. (Güncel komut/dosya sayısı drift-eğilimli olduğu için burada sabit yazılmaz — kanonik liste auto-generated `docs/reference/cli.md`'de; çapraz-kontrol: `grep -c 'register[A-Z][A-Za-z]*(program' src/cli/index.ts`.)
