# DIRECTIVES — Sprint 086: Usage Düzeltme + Version Bump + Test/Docs Cleanup

## Goal: Usage dashboard'u gerçekçi hale getir, version bump, kalan test/docs borçlarını temizle. CI yeşil kalmalı.

---

## Task 1: Usage Manager — Gerçekçi Tahmin + Dashboard Düzeltme
- Model: sonnet
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/usage-manager.ts, src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/orchestra/, src/dashboard/

### Description
Usage tracking şu an `claude -p '/usage'` çağırıyor ama bu komut çalışmıyor ("Unknown skill: usage"). Düzelt:

A) `usage-manager.ts` — `checkUsage()` fonksiyonunu güncelle:
- `claude -p '/usage'` çağrısını kaldır (çalışmıyor)
- Yerine sprint-bazlı usage tahmini koy:
  - Sprint sırasında kaç task çalıştı, kaç worker spawn edildi
  - Tahmini token kullanımı: Brain planlama ~2000, worker task ~5000, auditor scan ~500, eval ~1000, retro ~2000
  - Bu tahminleri `.deckent/usage/` dizinine sprint bazlı kaydet
- `SAFE_DEFAULT` değerini `{ fiveHourPercent: 0, weeklyPercent: 0 }` yap (bilinmeyen = 0, sabit 50% değil)
- Yeni fonksiyon: `getSprintUsageEstimate(sprintId): { estimatedTokens, estimatedCost, taskCount }`

B) Dashboard usage card'ını güncelle:
- "5hr Usage" / "Weekly Usage" yerine "Sprint Token Tahmini" / "Toplam Maliyet Tahmini" göster
- Eğer gerçek kullanım verisi yoksa "Tahmini gösteriliyor" notu ekle
- Yeni i18n key'leri: `dashboard.usage_estimated`, `dashboard.usage_tokens`, `dashboard.usage_cost`, `dashboard.usage_note`

C) Dokümantasyon notu: Usage tracking şu an tahmini — Claude CLI programatik usage API'si mevcut değil.

**Kanıt:** `grep "SAFE_DEFAULT\|fiveHourPercent: 0" src/orchestra/usage-manager.ts` → sabit 50% kaldırılmış

**Test:** `tsc --noEmit` temiz. Mevcut usage testlerinde 0 regresyon.

---

## Task 2: Package Version Bump + CHANGELOG
- Model: haiku
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: package.json, src/dashboard/package.json, README.md, BETA-ROADMAP.md, docs/CHANGELOG.md
- Scope: package.json, src/dashboard/, README.md, BETA-ROADMAP.md, docs/

### Description
Version bump:

A) `package.json` version: `0.2.0-beta.3` → `0.3.0-beta.1`

B) README.md badge: version badge → `v0.3.0-beta.1`

C) BETA-ROADMAP.md: tamamlanan sprintler tablosundaki version güncellemesi

D) docs/CHANGELOG.md: Yeni `[0.3.0-beta.1]` entry — Sprint 078-086 tüm değişiklikler (Dashboard overhaul, i18n, MCP/CLI parity, usage fix)

**Kanıt:** `grep "0.3.0-beta.1" package.json README.md` → güncel

**Test:** Bu task test gerektirmez.

---

## Task 3: Init Test Mock Düzeltme
- Model: sonnet
- Effort: normal
- Agent: test-writer
- Skills: typescript-expert, testing-expert
- Files: tests/integration/lifecycle.test.ts
- Scope: tests/

### Description
Skipped test'i düzelt — init language-first akışına uygun mock sırası.

it.skip kaldır, mockPrompts sırasını language-first olarak düzelt. Config'de mode ve language doğru yazılmalı.

**Kanıt:** `grep "it.skip" tests/integration/lifecycle.test.ts` → 0

**Test:** Skip kaldırılmış test geçmeli.

---

## Task 4: AGENTS.md + Kalan Docs Tutarlılık
- Model: haiku
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: AGENTS.md, .brain/PROJECT-IDENTITY.md
- Scope: AGENTS.md, .brain/

### Description
A) AGENTS.md: MCP tool sayısı 19, resource 9 olmalı
B) PROJECT-IDENTITY.md: Test 12,192+, sprint 80+, MCP 19 tools, CLI 33, Dashboard 4 sayfa
C) Kalan docs'ta eski "17 tools" referanslarını düzelt (tarihsel olanlar hariç)

**Kanıt:** `grep "19 tools" AGENTS.md .brain/PROJECT-IDENTITY.md` → güncel

**Test:** Bu task test gerektirmez.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- Skip kalan test 0
- %100 GO hedefli
