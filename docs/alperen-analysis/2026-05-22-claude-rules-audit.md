# `.claude/rules/` Dizin Audit — 2026-05-22

**Kapsam:** Sprint 186 sonrası `.claude/rules/` dizininin doğruluğu, güncelliği ve tutarlılığı  
**Metodoloji:** Sistematik debugging (kanıt → kök neden → düzeltme)  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı

---

## Dizin Yapısı

```
.claude/
├── rules/
│   ├── brain.md          (git tracked — Brain role rules)
│   ├── auditor.md        (git tracked — Auditor role rules)
│   └── worker-default.md (git tracked — Worker role rules)
└── settings.local.json   (gitignored — session permissions)
```

`.claude/rules/` Claude Code'un resmi "rule files" özelliğidir. `paths:` frontmatter ile belirli dosya/dizin bağlamlarında otomatik aktive olur. Kapsam: proje bazlı (proje kökü). Global değil.

---

## Tespit Edilen Sorunlar

### Sorun 1 — CUSTOM-START Bloklarında Duplicate İçerik

**Öncelik:** Orta  
**Kök Neden:** Rule generator (`rule-generator.ts`) ilk çalıştığında marker içermeyen mevcut dosyaları `CUSTOM-START` bloğuna koydu (satır 370–374'teki "first-time migration" mantığı). Sonraki her `regenerateRules()` çağrısında korundu.

**Etki:**
- Her dosyada kural içeriği iki kez okunuyordu (AUTO + CUSTOM)
- `worker-default.md` CUSTOM bloğunda benzersiz ADR-037 honesty note vardı ama template'de yoktu
- Token israfı + bağlam kirliliği

**Durum:** Düzeltildi — CUSTOM bloklar temizlendi (`\n`)

---

### Sorun 2 — ADR-037 Honesty Note Template'de Eksik

**Öncelik:** Yüksek  
**Kök Neden:** `worker-default.template.md` Verify Loop bölümünde ADR-037 V1.0 transparency notu yoktu. Not yalnızca bu projenin CUSTOM bloğunda yaşıyordu — başka kullanıcılar ve diğer provider'lar (codex, gemini, cursor) almıyordu.

**Etki:** `deckent init` ile kurulan C#, Python, Go projeleri worker'larının Verify Loop'un prompt-only (kod-enforce değil) olduğunu bilmemesi.

**Durum:** Düzeltildi — `src/core/rule-templates/worker-default.template.md` Verify Loop bölümüne eklendi

---

### Sorun 3 — worker-default.template.md TypeScript-Specific Komutlar

**Öncelik:** Yüksek  
**Kök Neden:** Template doğrudan `tsc --noEmit` ve `npx vitest run` içeriyordu.

```markdown
# Öncesi
- Run `tsc --noEmit` after code changes — fix errors (max 3 attempts)
- Run `npx vitest run` after code changes — fix failures (max 3 attempts)

# Sonrası
- Run lint/build check after code changes — fix errors (max 3 attempts; use project-specific command)
- Run test suite after code changes — fix failures (max 3 attempts; use project-specific command)
```

**Etki:** C#, Python, Go, Rust kullanan Deckent kullanıcıları için hatalı/anlamsız worker kuralları.

**Durum:** Düzeltildi — dil-bağımsız hale getirildi

---

### Sorun 4 — Brain paths'te Hayalet Referans

**Öncelik:** Düşük  
**Kök Neden:** `brain.md` paths frontmatter: `[".tasks/*",".brain/*",".contracts/*"]` — `.contracts/` dizini `deckent init`'te hiç oluşturulmuyor.

**Etki:** Claude Code rule matching'de etkisiz ama dokümantasyon kirliliği. Kullanıcı projesine `deckent init` yapıldığında da bu hayalet path geçiyordu.

**3 kaynak dosyada vardı:**
- `src/core/rule-generator.ts` `claudeAdapter()` pathsMap
- `src/cli/commands/init-steps.ts` `writeClaudeRules()`
- `src/mcp/tools/init.ts` hardcoded inline rules

**Durum:** Düzeltildi — üç kaynaktan da kaldırıldı

---

### Sorun 5 — MCP init vs CLI init Senkronizasyon Açığı

**Öncelik:** Orta  
**Kök Neden:** İki ayrı code path:
- `mcp/tools/init.ts`: hardcoded inline rules — eski/eksik (`MEMORY.md` tabanlı, `max 200 lines`)
- `cli/commands/init-steps.ts`: `writeClaudeRules()` — biraz daha güncel (`max 300 lines`) ama yine hardcoded

Her iki path da `src/core/rule-templates/` şablonlarını kullanmıyor.

**Etki:** MCP üzerinden `deckent_init` yapan kullanıcı farklı (daha eski) kurallar alıyor.

**Düzeltme:** MCP ve CLI brain.md içeriği Memory V2 DB-first terminolojisiyle (`store.insert`, `store.upsert`, `store.decay`) senkronize edildi.

**Kalan teknik borç:** Her iki path da hâlâ hardcoded. Uzun vadede her ikisi de `generateRules({ projectRoot, adrs: [] })` çağrısına geçmeli (tek kaynak).

---

## Uygulanan Değişiklikler

| Dosya | Değişiklik |
|-------|-----------|
| `src/core/rule-templates/worker-default.template.md` | Dil-bağımsız Verify Loop + ADR-037 honesty note eklendi |
| `src/core/rule-generator.ts` | `pathsMap.brain`'den `.contracts/*` kaldırıldı |
| `src/cli/commands/init-steps.ts` | brain paths `.contracts/*` kaldırıldı + Memory V2 terminolojisi |
| `src/mcp/tools/init.ts` | brain paths `.contracts/*` kaldırıldı + Memory V2 ile senkronize |
| `.claude/rules/brain.md` | `paths` düzeltildi + CUSTOM bloğu temizlendi |
| `.claude/rules/auditor.md` | CUSTOM bloğu temizlendi |
| `.claude/rules/worker-default.md` | CUSTOM bloğu temizlendi |

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- Rule files git'te tracked — referans olarak değerli
- `settings.local.json` gitignored — session debris açık kaynak repo'ya gitmiyor
- AUTO/CUSTOM mekanizması doğru tasarım; kök sorun "first-time migration" yan etkisiydi

**Kullanıcı perspektifi:**
- `deckent init` ile oluşan rules artık dil-bağımsız (C#, Python, Go dahil)
- MCP ve CLI aynı brain kurallarını üretiyor
- `.contracts/` phantom path kaldırıldı — tüm üretim noktalarından temizlendi
- `settings.local.json` gitignored — kullanıcı projesindeki session kirliliği repo'ya gitmez

---

## Gelecek Öneriler

1. **Tek kaynak init:** `writeClaudeRules()` ve MCP inline rules → `generateRules({ projectRoot, adrs: [] })` çağrısına geçiş (ADR-047 uyumlu)
2. **`deckent upgrade` sonrası rule sync:** Package upgrade sonrası kullanıcıya `deckent init --upgrade` önerisi
3. **Stack-aware template placeholders:** `worker-default.template.md`'de `{{TEST_CMD}}` / `{{LINT_CMD}}` placeholder (stack detection entegrasyonu)
