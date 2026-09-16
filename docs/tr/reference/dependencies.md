# Bağımlılık Gerekçe Defteri (ADR-D-005)

2026-08-25'te yeniden doğdu (reset-öncesi kopya docs/archive/ altındadır). Bilinçli kabul
edilen her paket için bir satır: yetenek, pin ve bağlayıcı karar. Yeni ekleme; gerçek bir
yetenek, exact bir pin ve buraya bir gerekçe satırı gerektirir.

| Paket | Pin | Tür | Yetenek / gerekçe | Bağlayıcı karar |
|---|---|---|---|---|
| tsx | 4.23.12 (exact) | dev | `docs:generate-cli` (`scripts/generate-cli-docs.ts`) için repo-sahipli çalıştırıcı; önceden ağa/global-cache'e bağımlı çıplak `npx` ile çözülüyordu (surface-truth bulgu #16) | ADR-D-005; owner kabulü 2026-08-25 |
