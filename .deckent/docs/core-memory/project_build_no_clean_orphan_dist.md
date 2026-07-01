---
name: project_build_no_clean_orphan_dist
description: "FIXED 2026-06-06: build artık clean yapıyor; ayrıca .npmrc ignore-scripts=true TÜM pre/post hook'ları öldürüyor (postbuild/prepublishOnly ölü)"
metadata: 
  node_type: memory
  type: project
  originSessionId: ddfcd565-d6de-48a7-b611-c5c8e4a57209
---

**✅ FIXED 2026-06-06** (`package.json` + `scripts/copy-assets.mjs`):
- `build` ve `build:all` artık `npm run clean && ...` ile başlıyor (orphan `.js` artıkları temizleniyor). Hook DEĞİL, inline — sebebi aşağıda.
- `copy-assets.mjs` `ASSET_EXTENSIONS`'a `.template` eklendi → `docs.json.template` artık dist'e kopyalanıyor (yoksa `docs-config.ts:seedDocsConfig` sessizce inline-fallback'e düşüp `deckent init`'i eksik docs.json ile bırakıyordu).
- Ölü `postbuild` hook'u silindi; yeni `release` script: `docs:stats:check && docs:ref:check && build:all && validate:publish` (Alperen sonra manuel `npm publish`).

**🔴 KÖK-NEDEN GOTCHA — `.npmrc` `ignore-scripts=true` (git-tracked, satır 2):** "postinstall güvenliği" için konmuş ama yan etkisi **TÜM `pre*`/`post*` + lifecycle hook'ları öldürür** (sadece install değil). Sonuç: (1) `postbuild: build:dashboard` HİÇ çalışmamış → `npm run build` dashboard'u build etmez, sadece `build:all` eder (CLAUDE.md doğru); (2) `prepublishOnly` de ölü → `npm publish` `dist/`'te ne varsa gönderir (stale/dashboard'suz). Explicit `npm run X` ise ÇALIŞIR (ignore-scripts sadece otomatik hook'ları atlar) → bu yüzden fix hook ile değil komut gövdesine inline yapıldı.

**Why:** Build-hook tabanlı her çözüm bu repoda sessizce ölür; doğrulama için `pre*/post*` değil, gerçek `npm run build` çıktısına bakılmalı. Orphan kanıtı: `chat-pinned-tui.js` (kaynağı a1dec35e/E7b ile emekli) — fix sonrası temizlendi.

**🆕 FIX 2026-06-15 (`a1eaa2bb`, dashboard-silme footgun):** `.npmrc ignore-scripts` `postbuild:build:dashboard`'ı öldürdüğü için `npm run build` dashboard'ı KURMAZ (bilinen) — AMA `clean: rm -rf dist` dashboard'ı SİLİYORDU. Sonuç: prior `build:all`'dan kalan `dist/dashboard` her `npm run build`'de yok oluyordu → `deckent serve` "Bundled dashboard not found" → sayfalar boş/hata. **Fix:** `clean` artık `node scripts/clean.mjs` — `dist/`'i `dashboard` HARİÇ siler. Yani TS-only `npm run build` vite-bundle'ı korur, serve çalışmaya devam eder; `build:all` aynı clean'i koşar sonra dashboard'ı üstüne kurar (byte-identical). **Kural:** dashboard KODU değişince `build:all`; sadece TS değişince `build` (artık dashboard'ı bozmaz). **🔴 Ayrı setup-gotcha:** kullanıcının `deckent` komutu GLOBAL kuruluydu (lokal değil) → `npm link` yapıldı (global→lokal symlink); artık `deckent serve`/MCP hep lokal build. Bkz [[project_automation_usability_state]].

**How to apply:** Bu repoda build/publish otomasyonu hook'a GÜVENME, komut gövdesine inline et. Yayın için `npm run release` çalıştır, sonra manuel publish. Yeni repo ([[project_community_pro_split_strategy]] iki-repo/ADR-065) publish-setup'ına aynı inline-clean + release script'i taşı. İlgili: [[feedback_proof_of_function_dod]] (gerçek-koşu doğrulaması)
