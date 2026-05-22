# IDE Adapter Dizinleri Audit — `.cursor/` `.codex/` `.gemini/` — 2026-05-22

**Kapsam:** Sprint 186 sonrası `.cursor/`, `.codex/`, `.gemini/` IDE adapter dizinlerinin doğruluğu, güncelliği ve tutarlılığı  
**Metodoloji:** Sistematik debugging (kanıt → kök neden → düzeltme)  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı  
**Referans:** [2026-05-22-claude-rules-audit.md](2026-05-22-claude-rules-audit.md) (aynı seri, `.claude/rules/` audit)

> **Kök neden reframe'i (Alperen yönlendirmesi):** İlk taslakta `.codex/rules/` ve
> `.gemini/rules/` "ölü dizin → sil" olarak çerçevelenmişti. Bu **yanlıştı**.
> Kullanıcılar Claude kullanmayıp yalnızca Gemini/Cursor/Codex kullanabilir —
> her provider `.claude/` olmadan **kendi başına çalışabilir** olmalı. Sorun
> dizinlerin var olması değil, adapter dosyalarının `.claude/rules/`'a
> bağlanmasıydı (claude-coupling).

---

## Dizin Yapısı

```
.cursor/rules/{brain,auditor,worker-default}.mdc   ← Cursor Project Rules (MDC)
.codex/rules/{brain,auditor,worker-default}.md     ← Codex rol kuralları
.gemini/rules/{brain,auditor,worker-default}.md    ← Gemini rol kuralları
.claude/rules/{brain,auditor,worker-default}.md    ← Claude Code rol kuralları
```

Kök adapter (giriş) dosyaları: `CLAUDE.md` (Claude Code), `AGENTS.md` (Codex),
`GEMINI.md` (Gemini), `.cursor/rules/*.mdc` (Cursor). Hepsi `@DECKENT.md` (ortak,
provider-neutral kaynak) import eder. Rol kuralları `src/core/rule-generator.ts`
tarafından üretilir: 4 provider × 3 rol = 12 dosya.

---

## Tespit Edilen Sorunlar

### Sorun 1 — Adapter Dosyaları Yanlış Provider Dizinini İşaret Ediyordu (claude-coupling)

**Öncelik:** Yüksek (kullanıcı-facing)  
**Kök Neden:** `AGENTS.md` (Codex girişi) ve `GEMINI.md` (Gemini girişi)
`@.claude/rules/brain.md` import ediyordu — kendi dizinleri değil. Dahası ortak
`DECKENT.md` da `## Agent Roles` bölümünde `@.claude/rules/*` içeriyordu; tüm
adapter'lar `@DECKENT.md` import ettiği için Codex/Gemini kullanıcısı **dolaylı
olarak** `.claude`'a bağlanıyordu.

**Etki:** Claude kullanmayan bir kullanıcı (`deckent init` yapan Gemini/Codex
kullanıcısı) `.claude/` dizini olmadan çalışamıyordu — her provider bağımsız
olmalıyken değildi.

**Durum:** Düzeltildi —
- `AGENTS.md` → `@.codex/rules/*`
- `GEMINI.md` → `@.gemini/rules/*`
- `DECKENT.md` → `## Agent Roles` bloğu kaldırıldı (ortak doküman artık
  provider-neutral; rol-kuralı wiring'i her adapter dosyasının kendisinde)

---

### Sorun 2 — CUSTOM-START Bloklarında Duplicate İçerik (6 dosya)

**Öncelik:** Orta  
**Kök Neden:** `.claude/rules/` ile aynı kök neden — `rule-generator.ts`
"first-time migration" mantığı. `.codex`/`.gemini` rules dosyaları Sprint 168
AUTO/CUSTOM marker sisteminden önce vardı → eski içerik `CUSTOM-START` bloğuna
kopyalandı, her regen korudu. (`.cursor/rules/` temizdi — Sprint 168'de eklendi.)

**Etki:** Her dosya rol kurallarını iki kez içeriyordu; ~218 satır / ~6 KB
bağlam kirliliği.

**Durum:** Düzeltildi — 6 dosyanın CUSTOM blokları boşaltıldı (`.claude/rules/`
ile aynı biçim).

---

### Sorun 3 — Cursor Yanlış Dosya Formatı (`.md` vs `.mdc`)

**Öncelik:** Yüksek (kullanıcı-facing — Cursor entegrasyonu çalışmıyordu)  
**Kök Neden:** `rule-generator.ts` `cursorAdapter()` `.cursor/rules/{role}.md`
üretiyordu. Cursor Project Rules sistemi yalnızca `.cursor/rules/*.mdc` (MDC
formatı, `description`/`globs`/`alwaysApply` frontmatter) yükler.

**Etki:** `.cursor/rules/*.md` dosyalarını Cursor hiç okumuyordu.

**Durum:** Düzeltildi — `cursorAdapter` `.mdc` üretir; MDC frontmatter satır 1'de
(AUTO bloğundan **önce** — Cursor gereği). `ProviderAdapter`'a `fileExt()` +
`preamble()` eklendi. Repodaki `.cursor/rules/*` `.mdc`'ye çevrildi.

---

### Sorun 4 — `.cursor/rules/` Çoklu Üretim Mekanizması

**Öncelik:** Düşük (Sorun 3 düzeltmesiyle büyük ölçüde çözüldü)  
**Kök Neden:** `rule-generator.ts` (rol kuralları) + `cursor-config.ts`
`generateCursorConfig` (`deckent.mdc` proje-bağlamı) + `agent-templates.ts`
`generateCursorRules`. `init-steps.ts` `deckent.mdc`'yi iki kez yazıyor.

**Durum:** Kısmen — uzantı çatalı (`.md` vs `.mdc`) kapandı; rol kuralları
(`*.mdc`) ile proje-bağlamı (`deckent.mdc`) ayrı amaçlar, birlikte yaşamaları
sorun değil. `init-steps.ts` çift yazımı kalan iş (Gelecek Öneriler #3).

---

### Sorun 5 — MCP Kayıt Komutu Yanlış (BUG-18)

**Öncelik:** Kritik (kullanıcı-facing)  
**Kök Neden:** `deckent` CLI'da `mcp`/`mcp-server` subcommand'ı yok; MCP sunucusu
ayrı bin (`package.json` → `deckent-mcp`). `npx deckent mcp` "unknown command"
veriyordu.

**Durum:** Düzeltildi — 17 dosya `deckent-mcp` (args `[]`) biçimine sabitlendi.

---

### Sorun 6 — `.codex/AGENTS.md` Yanlış Konum

**Öncelik:** Düşük  
**Kök Neden:** `sync.ts:351-360` `.codex/` dizini varsa `.codex/AGENTS.md`
oluşturuyor. Codex CLI **kök** `AGENTS.md` okur.

**Durum:** Belgelendi — öneri (Gelecek Öneriler #4).

---

## Uygulanan Değişiklikler

| Dosya | Değişiklik |
|-------|-----------|
| `src/core/rule-generator.ts` | `ProviderAdapter` + `fileExt()`/`preamble()`; `cursorAdapter` `.mdc` + MDC frontmatter; `generateRules` uzantı + preamble |
| `tests/core/rule-generator.test.ts` | Cursor `.mdc` testleri eklendi; `d4214c41`'in kırdığı `.contracts/*` testi düzeltildi |
| `init-steps.ts` + `mcp/tools/init.ts` + `init.ts` | `deckent init` artık `regenerateRules` ile **4 provider** rule dizinini üretir (tek-kaynak; eski inline `.claude/rules/` yazımı kaldırıldı; `writeClaudeRules` → `writeRuleFiles`) |
| `AGENTS.md` | Rol kuralları `@.codex/rules/*` |
| `GEMINI.md` | Rol kuralları `@.gemini/rules/*` |
| `DECKENT.md` | `## Agent Roles` bloğu kaldırıldı (ortak doküman provider-neutral) |
| `.cursor/rules/*.md → *.mdc` | 3 dosya `.mdc`'ye çevrildi (Cursor-native MDC frontmatter) |
| `.codex/rules/*`, `.gemini/rules/*` | 6 dosya CUSTOM bloğu temizlendi |
| `src/cli/helpers/{codex,cursor,gemini}-config.ts` + `wizard.ts` + `init-templates.ts` | MCP kayıt komutu `deckent-mcp` (BUG-18) |
| 5 test + 7 doküman | MCP komutu `deckent-mcp` ile güncellendi |

**Doğrulama:** `tsc --noEmit` exit 0; rule-generator + MCP test takımları yeşil
(52 + 246 test).

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- Repo artık self-contained adapter modelini gösteriyor: `CLAUDE.md`→`.claude/`,
  `AGENTS.md`→`.codex/`, `GEMINI.md`→`.gemini/`, Cursor→`.cursor/rules/*.mdc`.
- `DECKENT.md` provider-neutral — hiçbir provider'a coupling yok.
- 4 provider rule dizini de canlı ve bağımsız; "ölü dizin" yok.

**Kullanıcı perspektifi:**
- Claude kullanmayan kullanıcı artık `.claude/` olmadan çalışabilir (her adapter
  kendi dizinini işaret ediyor).
- Cursor entegrasyonu artık çalışıyor (`.mdc` formatı).
- MCP kayıt komutu çalışıyor.
- `deckent init` artık `regenerateRules` ile 4 provider rule dizinini de üretiyor
  — Codex/Gemini/Cursor kullanıcısı init anında kendi (self-contained) rule
  dosyalarını alıyor; ilk sprint'i beklemiyor.

---

## Gelecek Öneriler

1. ~~**Tek-kaynak init**~~ — ✅ **TAMAMLANDI:** `init` generator'ları artık
   `regenerateRules` çağırıyor; `deckent init` 4 provider rule dizinini de
   templates'ten tutarlı üretiyor.
2. **init adapter dosyaları self-contained:** `init-templates.ts`
   `generateDeckentContentTR/EN` + `mcp/tools/init.ts` `deckentContent` `DECKENT.md`'ye
   `## Agent Roles` koyuyor — ortak dokümandan çıkar; üretilen `CLAUDE.md`/`AGENTS.md`
   her biri kendi `<provider>/rules/`'ını işaret etsin. (Bu repoda yapıldı,
   generator'larda değil.)
3. **init-steps çift yazım:** `applyEnvConfig('cursor')` `deckent.mdc`'yi iki kez
   yazıyor (`generateCursorConfig` + `generateCursorRules`) — tekille.
4. **`sync.ts` düzelt:** `.codex/AGENTS.md` yerine kök `AGENTS.md` senkronize et.
5. **Bug O kapanışı:** `rule-generator.ts` first-run dalı (`else if (existing)`)
   marker'sız dosyanın içeriğini CUSTOM'a kopyalamasın — boş CUSTOM ile başlatsın.
6. **Phantom path:** `init-templates.ts:79,140` `@.contracts/api-surface.md` —
   gerçek dosya `docs/reference/api-surface.md`; `.contracts/` hiç oluşturulmuyor.
