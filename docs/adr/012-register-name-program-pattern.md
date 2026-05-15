# ADR-012: register\<Name\>(program) Pattern

**Status:** accepted

**Date:** 2026-04-16

**Sprint:** _To be backfilled_

---

**Status:** accepted

**Decision:** Her CLI komutu kendi dosyasında tanımlanır ve `register<Name>(program: Command): void` fonksiyonu export eder.
**Context:** Tek dosyada tüm komutları tanımlamak bakım zorluğu yaratır. Ayrı dosyalar bağımsız test, kolay ekleme/çıkarma sağlar.
**Consequence:** `src/cli/commands/` dizininde 16 dosya. Entry point (`index.ts`) 16 register çağrısı yapar. Yeni komut eklemek: dosya oluştur + index.ts'e import + register ekle.
