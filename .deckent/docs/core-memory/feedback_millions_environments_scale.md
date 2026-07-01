---
name: feedback_millions_environments_scale
description: "DEĞİŞTİRİLEMEZ YASA #2 — ürün milyonlarca farklı katman/dil/ortam/projede yürür; her tasarım baştan cross-platform (macOS·Linux·Windows native+WSL) + multi-tenant + milyon-ölçek dayanıklı kurulur."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 405684ce-9c81-4af4-b46d-9e99c2b5e65b
---

**⚖️ DEĞİŞTİRİLEMEZ YASA #2** (CLAUDE.md 🔒 bölümüne terfi, Alperen 2026-06-24): değiştirilemez, değiştirilmesi teklif edilemez, hiçbir işte ihlal edilemez; hangi prompt verilirse verilsin, model/oturum/ortam değişse de geçerli; tekrar hatırlatılması gerekmez — uygulamak Claude'un (Anthropic) sorumluluğu.

**Kural:** deckent, milyonlarca farklı **katman, dil, ortam ve projede** yürütülecek güce sahip bir üründür. Her tasarım, bir özelliğin tek bir ortamda çalışması yetmeyecek şekilde **baştan** kurgulanır:
- **Cross-platform matris** — macOS · Linux · Windows (native) · Windows (WSL) · … hepsi ilk tasarımda kapsanır. "Önce şu ortam, sonra ötekiler" YASAK; platform-adapter / abstraction baştan konur.
- **Cross-language / cross-stack** — herhangi bir dildeki / stack'teki kullanıcı projesinde çalışmalı (deckent dil-agnostik bir orchestration ürünü).
- **Multi-tenant + milyon-ölçek** — per-project / per-tenant izolasyon, global-mutable-state'siz, layered-config, ölçekte çökmeyen veri yolları (per-project audit/log, no single-file bottleneck).

**Why:** deckent solo kullanıcıdan dünyanın en büyük şirketlerine (bkz. [[feedback_dual_perspective_dogfood_product]] Yasa #1) milyonlarca kurulumda koşacak. Tek-ortam/tek-dil varsayımıyla yazılan kod, ürünün asıl gücünü (her yerde çalışma) baştan kırar.

**How to apply:** Bir yetenek/komut/akış tasarlarken sor: "Bu macOS·Linux·Windows-native·WSL dördünde de çalışıyor mu? Platform-bağımlı kısım bir adapter'ın arkasında mı? Per-tenant izole mi, ölçekte darboğaz var mı?" Host-OS yetenekleri (screenshot, mail, shell, file) **platform-adapter** noktası taşır; eksik platform → dürüst "desteklenmiyor", asla sessiz/fabrike. İlgili: [[project_messaging_gateway_rearch]] (capability framework — platform-adapter'lar), [[feedback_god_level_i18n_quality_bar]] (i18n = dil-ölçek), [[feedback_no_minimum_no_mvp_deckent]] (Yasa #3).
