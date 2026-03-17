# DIRECTIVES — Sprint 4: Debt Resolution Doğrulama
# Deckent'in debt resolution lifecycle'ının doğru çalıştığını doğrula.
# Operatör: Alperen @ Verhex
# Tarih: 2026-03-17

## Hedef
Debt resolution lifecycle'ın doğru çalıştığını doğrula.
Mevcut 605 testi bozmadan yeni testler yaz.
Coverage hedefi: değişen her dosyada minimum %80.

---

## Görev 1: resolveDebt fonksiyon doğrulama
- Dosya: src/orchestra/brain.ts
- Sorun: resolveDebt() fonksiyonunun DEBT.md'yi doğru güncellediğini doğrula
- Test: resolveDebt çağrıldığında resolved=true ve resolvedInSprintId yazıldığını kontrol et
- Kapsam: src/orchestra/brain.ts, tests/orchestra/

## Görev 2: calculateMetrics debt parametresi doğrulama
- Dosya: src/orchestra/brain.ts
- Sorun: calculateMetrics'in debt parametresiyle resolvedDebtCount ve totalOpenDebt hesapladığını doğrula
- Test: calculateMetrics'e debt array verildiğinde doğru metriklerin döndüğünü kontrol et
- Kapsam: src/orchestra/brain.ts, tests/orchestra/

## Görev 3: runSprint debt resolution entegrasyon
- Dosya: src/orchestra/brain.ts
- Sorun: DONE evaluation sonrası debt'in resolve edildiğini end-to-end doğrula
- Test: runSprint Phase 4'te DONE/GO_WITH_TECH_DEBT evaluation sonrası resolveDebt çağrıldığını kontrol et
- Kapsam: src/orchestra/brain.ts, tests/orchestra/
