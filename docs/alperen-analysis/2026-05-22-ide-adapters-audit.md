# IDE Adapter Dizinleri Audit — `.cursor/` `.codex/` `.gemini/` — 2026-05-22

**Kapsam:** Sprint 186 sonrası `.cursor/`, `.codex/`, `.gemini/` IDE adapter dizinlerinin doğruluğu, güncelliği ve tutarlılığı  
**Metodoloji:** Sistematik debugging (kanıt → kök neden → düzeltme)  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı  
**Referans:** [2026-05-22-claude-rules-audit.md](2026-05-22-claude-rules-audit.md) (aynı seri, `.claude/rules/` audit)

---

## Dizin Yapısı

```
.cursor/
└── rules/
    ├── brain.md          (git tracked — rule-generator.ts çıktısı)
    ├── auditor.md
    └── worker-default.md
.codex/
└── rules/                (aynı 3 dosya — .gemini ile byte-identical)
.gemini/
└── rules/                (aynı 3 dosya)
```

İlgili kök adapter dosyaları:
- `AGENTS.md` — Codex CLI girişi (ADR-013 thin-adapter, `@DECKENT.md` pointer)
- `GEMINI.md` — Gemini CLI girişi (aynı desen)
- `.cursor/rules/deckent.mdc` — `deckent init` üretir (`cursor-config.ts`), bu repoda mevcut değil

Üç dizini de **`src/core/rule-generator.ts`** üretir: `PROVIDERS = ['claude', 'codex', 'gemini', 'cursor']` × `ROLES = ['brain', 'auditor', 'worker-default']` = 12 dosya. Sprint sonu `sprint-finalizer` hook'undan çağrılır.

---

## Tespit Edilen Sorunlar

### Sorun 1 — `.codex/rules/` ve `.gemini/rules/` Ölü Dizin

**Öncelik:** Yüksek (dogfooding) / Orta (kullanıcı)  
**Kök Neden:** `rule-generator.ts` `PROVIDERS` dizisi 4 dizine yazar. Ancak `AGENTS.md` (Codex girişi) ve `GEMINI.md` (Gemini girişi) rol kurallarını `@.claude/rules/brain.md` üzerinden import eder — kendi `rules/` dizinlerini değil. Codex/Gemini CLI'larının `<dir>/rules/` otomatik yükleme konvansiyonu yoktur; girdi noktaları kök `AGENTS.md` / `GEMINI.md`.

**Etki:** `.codex/rules/*` ve `.gemini/rules/*` byte-identical 6 ölü dosya — her sprint regen edilir, hiçbir şey okumaz. `.claude/rules/` aksine `constants.ts` sabiti (`CLAUDE_RULES_DIR`) + `permission-guard.ts` kaydı + `@import`'larla gerçekten bağlıdır.

**Durum:** Belgelendi — kaldırma önerisi (bkz. Gelecek Öneriler #1). CUSTOM kirliliği bu turda temizlendi (Sorun 2).

---

### Sorun 2 — CUSTOM-START Bloklarında Duplicate İçerik (6 dosya)

**Öncelik:** Orta  
**Kök Neden:** `.claude/rules/` ile aynı kök neden — `rule-generator.ts:368-377` "first-time migration" mantığı. `.codex/rules/` ve `.gemini/rules/` dosyaları Sprint 168'deki AUTO/CUSTOM marker sisteminden önce mevcuttu → marker'sız eski içerik bütünüyle `CUSTOM-START` bloğuna kopyalandı, her `regenerateRules()` çağrısında korundu. `.cursor/rules/` temizdi çünkü dizin Sprint 168 C0a-2'de eklendi (generator ilk çalıştığında dosya yoktu).

**Kanıt:** CUSTOM bloğundaki `paths:` frontmatter boşlukluydu (`[".tasks/*", ".brain/*"...]` — elle yazım); AUTO bloğunki boşluksuz (`JSON.stringify` çıktısı). İki ayrı kaynak = iki ayrı çağ.

**Etki:** Her dosya rol kurallarını iki kez içeriyordu; ikinci kopya bayattı (ör. ADR-037 honesty note yoktu). Toplam ~218 satır / ~6 KB bağlam kirliliği.

**Durum:** Düzeltildi — 6 dosyanın CUSTOM blokları boşaltıldı (`.claude/rules/` ile aynı biçim: `<!-- CUSTOM-START -->\n\n<!-- CUSTOM-END -->`).

---

### Sorun 3 — Cursor Yanlış Dosya Formatı (`.md` vs `.mdc`)

**Öncelik:** Yüksek (kullanıcı-facing — Cursor entegrasyonu çalışmıyor)  
**Kök Neden:** `rule-generator.ts` `cursorAdapter()` `.cursor/rules/{role}.md` üretir. Cursor Project Rules sistemi yalnızca `.cursor/rules/*.mdc` (MDC formatı, `description`/`globs` frontmatter) yükler. Deckent'in kendi kodu bunu zaten bilir — `cursor-config.ts` `.mdc` üretir. Yani iki dahili mekanizma çelişir.

**Etki:** Repodaki 3 `.cursor/rules/*.md` dosyasını Cursor hiç okumaz.

**Durum:** Belgelendi — öneri: rule-generator'dan `cursor` adapter'ı kaldır; `.cursor/rules/deckent.mdc` (cursor-config) tek kaynak (bkz. Gelecek Öneriler #2).

---

### Sorun 4 — `.cursor/rules/` İçin Üç Çelişen Üretim Mekanizması

**Öncelik:** Orta  
**Kök Neden:** Üç ayrı kod yolu aynı dizine farklı dosya üretir:

| Üreten | Çıktı |
|--------|-------|
| `rule-generator.ts` | `.cursor/rules/{brain,auditor,worker-default}.md` |
| `cursor-config.ts` `generateCursorConfig` | `.cursor/rules/deckent.mdc` |
| `agent-templates.ts` `generateCursorRules` | `.cursor/rules/deckent.mdc` (farklı içerik) |

Ayrıca `init-steps.ts` `applyEnvConfig('cursor')` `deckent.mdc`'yi iki kez yazar (satır 161 `generateCursorConfig` + satır 164 `generateCursorRules`) — ikincisi kazanır.

**Etki:** Hangi dosyanın canonical olduğu belirsiz; `deckent init` çift yazım yapar.

**Durum:** Belgelendi — öneri: tek mekanizma (bkz. Gelecek Öneriler #2-3).

---

### Sorun 5 — MCP Kayıt Komutu Yanlış (BUG-18)

**Öncelik:** Kritik (kullanıcı-facing — IDE MCP entegrasyonu hiç kurulamıyordu)  
**Kök Neden:** Adapter config üreticileri MCP sunucusunu yanlış komutla kaydediyordu:
- `codex-config.ts` / `cursor-config.ts` / `gemini-config.ts` → `npx deckent mcp-server`
- `wizard.ts` / `init-templates.ts` + dokümanlar → `npx deckent mcp`

`deckent` CLI'da `mcp` veya `mcp-server` diye **kayıtlı subcommand yok** — `index.ts` 50 komut register eder, hiçbiri mcp değil; `entry.ts`'te dispatch yok. MCP sunucusu ayrı bir bin'dir: `package.json` → `"deckent-mcp": "./dist/mcp/server.js"`. Doğru biçimi `mcp/tools/init.ts:256` zaten kullanıyordu: `{ command: 'deckent-mcp', args: [] }`. Bu, SPRINT-LOG'da **BUG-18** olarak biliniyordu ama düzeltme tüm çağrı noktalarına yayılmamıştı.

**Etki:** `DECKENT.md` / `README` / `api.md`'den `claude mcp add deckent -- npx deckent mcp` komutunu kopyalayan kullanıcı "unknown command" hatası alıyordu — MCP entegrasyonu hiç kurulmuyordu.

**Durum:** Düzeltildi — 17 dosya `deckent-mcp` (args `[]`) biçimine sabitlendi. `tsc --noEmit` temiz; ilgili 5 test dosyası (246 test) yeşil.

---

### Sorun 6 — `.codex/AGENTS.md` Yanlış Konum

**Öncelik:** Düşük  
**Kök Neden:** `sync.ts:351-360` `.codex/` dizini varsa `.codex/AGENTS.md` oluşturur. Codex CLI **kök** `AGENTS.md` okur (repoda zaten mevcut).

**Etki:** `.codex/AGENTS.md` hiç okunmayan ikinci kopya olur.

**Durum:** Belgelendi — öneri (bkz. Gelecek Öneriler #4).

---

### Minör — `paths:` Frontmatter Tutarsızlığı

`.claude/rules/*` AUTO bloğunda `paths:` frontmatter var, `.codex`/`.gemini`/`.cursor` AUTO bloğunda yok (`claudeAdapter` vs diğer adapter'lar). `paths:` anahtarını ne Claude Code ne deckent runtime tüketiyor görünüyor — rol dosyaları `@import` ile bütün olarak yükleniyor. Belgelendi.

---

## Uygulanan Değişiklikler

| Dosya | Değişiklik |
|-------|-----------|
| `src/cli/helpers/codex-config.ts` | MCP kayıt komutu → `deckent-mcp`, `args = []` |
| `src/cli/helpers/cursor-config.ts` | MCP kayıt komutu → `deckent-mcp`, `args: []` |
| `src/cli/helpers/gemini-config.ts` | MCP kayıt komutu → `deckent-mcp`, `args: []` |
| `src/cli/helpers/wizard.ts` | Cursor MCP rehberi + terminal mesajı → `deckent-mcp` |
| `src/cli/commands/init-templates.ts` | `claude mcp add` satırları + `generateVscodeMcpJson` → `deckent-mcp` |
| `.codex/rules/{brain,auditor,worker-default}.md` | CUSTOM bloğu temizlendi (duplicate kaldırıldı) |
| `.gemini/rules/{brain,auditor,worker-default}.md` | CUSTOM bloğu temizlendi (duplicate kaldırıldı) |
| `tests/cli/helpers/{codex,cursor,gemini}-config.test.ts` | Assertion'lar `deckent-mcp` ile güncellendi |
| `tests/integration/multi-env.test.ts` | Aynı |
| `tests/cli/commands/init.test.ts` | `generateVscodeMcpJson` + MCP guidance assertion'ları güncellendi |
| `DECKENT.md`, `README.md`, `README-TR.md` | MCP kayıt komutu → `npx deckent-mcp` |
| `docs/reference/api.md`, `docs/vision/blueprint.md` | Aynı |
| `DECKENT-ANA-PLAN-TR.md`, `docs/development/troubleshooting.md` | Aynı |

**Doğrulama:** `tsc --noEmit` exit 0; ilgili 5 test dosyası 246/246 test yeşil.

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- 12 rule dosyasından 6'sı (`.codex/rules/` + `.gemini/rules/`) ölü — hiçbir şey referans vermiyor. rule-generator hâlâ 4 dizine yazıyor.
- CUSTOM blok kirliliği tüm adapter dizinlerinden temizlendi (`.claude` + `.codex` + `.gemini`); `.cursor` zaten temizdi.
- AUTO/CUSTOM + `replaceSentinel` mekanizması sağlam tasarım; kök sorun "first-time migration" yan etkisiydi.

**Kullanıcı perspektifi:**
- MCP kayıt komutu artık çalışıyor — bu kritik düzeltme olmadan hiçbir kullanıcı deckent MCP'yi IDE'sine bağlayamıyordu.
- Cursor `.md`/`.mdc` uyumsuzluğu kullanıcı projelerinde Cursor entegrasyonunu sessizce kırıyor — kaldırma/`.mdc` geçişi önerildi.
- `.codex/rules/`, `.gemini/rules/` kullanıcı projesinde de ölü ağırlık olarak üretiliyor.

---

## Gelecek Öneriler

1. **Ölü dizinleri kaldır:** `rule-generator.ts` `PROVIDERS`'tan `codex` + `gemini` çıkar; `.codex/rules/` ve `.gemini/rules/` `git rm`. `AGENTS.md`/`GEMINI.md` zaten `.claude/rules/` kullanıyor.
2. **Cursor tek mekanizma:** rule-generator `cursor` adapter'ı kaldır VEYA `.mdc` üret. `.cursor/rules/deckent.mdc` (cursor-config) canonical olsun.
3. **Çift yazımı tekille:** `init-steps.ts` `applyEnvConfig('cursor')` `deckent.mdc`'yi iki kez yazıyor — `generateCursorConfig` veya `generateCursorRules`'tan biri kalsın.
4. **`sync.ts` düzelt:** `.codex/AGENTS.md` yerine kök `AGENTS.md` senkronize et.
5. **Bug O kapanışı:** `rule-generator.ts` first-run dalı (`else if (existing !== null)`) eski içeriği CUSTOM'a kopyalamasın — boş CUSTOM ile başlatsın. Marker sistemi öncesi dosya kalmadığı için artık dormant ama defansif düzeltme değerli.
6. **`paths:` kararı:** Ya runtime'da tüketilsin ya tüm adapter'lardan kaldırılsın.
