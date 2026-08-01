# T-152-024: Config Integrity — Duplicate Keys + MODE_PRESETS Overlap

**Sprint:** sprint-152 (read-only audit)
**Task:** 152-024
**Effort:** low
**Mode:** opus
**Date:** 2026-04-24
**Scope:** `.deckent/config.json`, `src/core/config.ts`, `src/core/mode-presets.ts`, `src/core/config-migration.ts`, `src/core/deck-interpolation.ts`, global `~/.deckent/config.json`

---

## Özet

Sprint 150 "8-decision matrix" + Sprint 151 kalıntıları sonrası config hijyenine bakıldı. Beş eksen denetlendi: (1) root-level `max_workers` vs `modes.*.max_workers`, (2) `MODE_PRESETS` vs `DEFAULT_MODES` duplication (T-151-NEW-H), (3) `deckent_style: "sprint"` canlılığı, (4) ADR-004 3-layer config merge, (5) `.deck` interpolation leakage. Üç alan **PASS** (deckent_style + 3-layer merge + .deck), iki alan **DRIFT** (root-level `max_workers` dead-key + v1 model name backward-compat layer hâlâ `DEFAULT_MODES`'ta). Kritik duplicate key (claude_backend, flat provider flags) kaynak Sprint 150'de kapatılmış ve live `.deckent/config.json` temiz.

---

## Bulgular

### 1. Root-Level `max_workers` vs `modes.*.max_workers` — [DRIFT — DEAD KEY]

- `.deckent/config.json:92` `max_workers: 6` (root-level)
- `.deckent/config.json:12` `modes.performance.max_workers: 6` (nested)
- `DeckentConfig` type (`src/core/config-types.ts`) kökte `max_workers` alanı **tanımlamıyor** (sadece `PlanModeConfig.max_workers` mevcut, satır 36).
- Runtime tüketicileri **yalnızca** `config.activeModeConfig.max_workers` okuyor:
  - `src/core/config.ts:463` — `resolveEffectiveWorkers()`
  - `src/cli/commands/plan.ts:53`, `src/cli/commands/start.ts:287,342`
  - `src/mcp/tools/start.ts:88`, `src/mcp/tools/plan.ts:57`
  - `src/orchestra/sprint-phases.ts:176`, `src/orchestra/sprint-utils.ts:104`
  - `src/api/server.ts:534`
- Root-level `max_workers`'ı **yazan tek yer**: `src/cli/commands/init-steps.ts:235` ve `:243` (`suggestMaxWorkers(capacity)` + `newConfig.max_workers = suggested`).
- `src/core/config-migration.ts:598` "Preserves: top-level `max_workers` (Decision 2)" yorumu var ama bu preservation hiçbir kod tarafından okunmuyor.
- **Sonuç:** root-level `max_workers` dead-key. Init-steps tarafından yazılıyor, hiçbir runtime path okumuyor. Bugün değeri (6) mode preset ile çakıştığı için fonksiyonel sorun yok, ama mode.performance.max_workers=3 olduğu bir senaryoda kullanıcı "root-level 6 yazılı, neden 3 worker spawn ediyor?" diye şaşıracak. **Gerçek bug potansiyeli.**
- Directive'in "bugün düzeltildi 3→6" notuyla uyumlu: Her iki değer de 6'ya set edildi, ama root-level'ın okunmadığı gerçeği değişmedi.

### 2. `MODE_PRESETS` vs `DEFAULT_MODES` Duplication — [PARTIAL RESOLUTION — T-151-NEW-H HÂLÂ AÇIK]

- `src/core/mode-presets.ts:35-80` **canonical source**: her mode için `{ model_strategy: ModelStrategy, max_workers: number }`.
- `src/core/config.ts:89-120` `DEFAULT_MODES` (`Record<string, PlanModeConfig>`): Sprint 150 yorumu — "Consolidated — mode-presets.ts is the canonical source for max_workers. Brain/default model names kept for PlanModeConfig backward compat".
  - `max_workers`: ✅ artık `MODE_PRESETS['performance']!.max_workers` referansıyla türetiliyor (satır 91, 98, 105, 112) — **duplication kapalı**.
  - `brain_model`, `default_model`, `haiku_allowed`, `brain_planning`: ❌ hâlâ hard-coded (`'opus'`, `'opus'`, `true`, `'auto'` vb.). Bunlar v1 backward-compat layer — v2 `MODE_PRESETS.model_strategy` (tier-based) üzerinden de tüketiliyor.
- **Kasıtlı mı?** Evet — `loadConfig()` satır 761-774'te `MODE_PRESETS[config.mode]` preset'inden `model_strategy` türetilip `resolvedModelStrategy` dolduruluyor. `haiku_allowed → min_tier` migration (satır 779-784) v1 alanını v2'ye köprülüyor.
- **T-151-NEW-H açık mı?** Evet. `docs/ROADMAP-GOD-LEVEL.md:65` ve `:304` referansları P2 opsiyonel debt olarak belirtiyor. Sprint 151 kapatmadı (diff'te değişiklik yok).
- **Sonuç:** Kritik `max_workers` duplication çözüldü. Kalan duplication v1/v2 bridge olarak fonksiyonel; gerçek teknik borç değil, **naming drift**. Tam kaldırma Sprint 156+ v1 deprecation ile yapılabilir.

### 3. `deckent_style: "sprint"` Single-Mode Toggle — [PASS]

- `.deckent/config.json:185` `"deckent_style": "sprint"` — set.
- Validation (`src/core/config.ts:432`): `['sprint', 'task']` whitelist — kabul.
- Runtime tüketicileri:
  - `src/orchestra/sprint-controller.ts:270` mode guard: `if (config.deckent_style === 'task') throw new BrainError(...)`.
  - `src/orchestra/task-mode-runner.ts` — task mode runner (alternatif lifecycle).
  - `src/cli/commands/mode.ts` — `deckent mode show|sprint|task|auto|global` alt komutları.
  - `src/nervous/detector-registry.ts` — nervous system detector gating.
  - `src/orchestra/sprint-docs-updater.ts` — doc güncelleme akışı.
- ENV override canlı: `src/core/config.ts:754` `DECKENT_STYLE` env var → `config.deckent_style`.
- Smoke test: `node dist/cli/entry.js mode show` → `Current: sprint` ✅.
- **Sonuç:** Roadmap 2.1 "single mode toggle" canlı + doğru akış.

### 4. 3-Layer Config Merge (ADR-004) — [PASS]

- Implementation: `src/core/config.ts:676-710`.
- **Öncelik sırası** (düşük → yüksek precedence, deepMerge kurallı):
  1. `createDefaultConfig()` — kod içi defaults (satır 676).
  2. Global: `readJsonFile<Partial<DeckentConfig>>(GLOBAL_CONFIG_PATH)` → `~/.deckent/config.json` (satır 678-681).
  3. Project: `readJsonFile<Partial<DeckentConfig>>(projectConfigPath)` → `.deckent/config.json` (satır 685-710).
  4. ENV overrides (satır 738-757) — project'i de yener (DECKENT_BRAIN_PROVIDER, DECKENT_WORKER_PROVIDER, DECKENT_MODE, DECKENT_LANGUAGE, DECKENT_STYLE).
  5. Grouped-to-flat provider projection (satır 729-734) — ENV'den **önce** çalıştığı için ENV hâlâ yeniyor (yorum satır 727 doğru).
- Canlı kontrol: `ls -la $HOME/.deckent` → global config **yok** (bugünkü yeni sistemde). Defaults → project merge aktif.
- Self-healing: corrupt project config yedekleniyor + fresh default yazılıyor (satır 689-704).
- deepMerge derin nested (recursive isPlainObject). `structuredClone` ile immutable.
- **Sonuç:** ADR-004 öncelik sırası kod tarafından doğru uygulanıyor. Test suite bunu kapsar (`src/core/config.test.ts`). Doctor'ın "global config yok" durumunda sessizce fallback yapması beklenen davranış.

### 5. `.deck` File Interpolation — Config'e Leakage? — [PASS — NO LEAKAGE]

- `src/core/deck-interpolation.ts:3` pattern: `/^\$DECK:([A-Z_][A-Z0-9_]*)$/` — yalnızca **tam string eşleşmesi**, partial interpolation **yok**.
- `loadConfig()` sonu (satır 865): `interpolateConfig(resolved, root)` — sadece `ResolvedConfig` içindeki string alanları tarar.
- `.deck` dosyası auto-gitignored (`src/core/deck-file.ts:161` `ensureDeckGitignore`).
- `loadDeckSecrets` (deck-file.ts:84) `process.env`'e sızdırmıyor — Brain ne geçeceğini kendi kontrol ediyor.
- `grep "\$DECK:" .deckent/config.json` → **0 match** (interpolation placeholder production config'inde kullanılmıyor).
- Connector'larda kullanılıyor: `src/connectors/discord.ts:4` `$DECK:DISCORD_TOKEN`, `src/connectors/telegram.ts:5` `$DECK:TELEGRAM_TOKEN`, `src/connectors/whatsapp-README.md:77-80` `$DECK:WHATSAPP_*`.
- Known keys whitelist: `KNOWN_DECK_KEYS` (`deck-file.ts:11`) **9 entry** (DECKENT_CLAUDE_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, SMTP_HOST/USER/PASS, WEBHOOK_URL, DB_URL, TELEMETRY_ID).
- **Sonuç:** `.deck` → config leakage yok. Ama DIRECTIVES'in "11 known keys" ifadesiyle uyuşmuyor: kod'da 9 key, DISCORD/TELEGRAM/WHATSAPP token'ları connector kodunda referanslanıyor ama **KNOWN_DECK_KEYS listesinde yok** → validateDeckFile bunları "unknown key" warning'i üretir. **Minor documentation/code drift.**

### 6. Duplicate Key Cleanup (Sprint 150 Decision 3+4) — [PASS — LIVE]

- `.deckent/config.json`: `grep "claude_backend"` → **0 match** (Decision 3 uygulandı).
- `.deckent/config.json`: `grep "brain_provider\|worker_provider"` → **0 match** flat alan (Decision 4 uygulandı — providers.brain/worker grouped form canlı, satır 47-50).
- `hasDuplicateKeys()` fonksiyonu (`src/core/config-migration.ts:160`) güvence altına alıyor — yeni bir duplicate ekleme girişimi migration'da otomatik temizlenecek.
- **Sonuç:** Sprint 150 matrix clean.

### 7. `_auto_detected` Marker — [DRIFT — NON-STANDARD KEY]

- `src/cli/commands/init-steps.ts:236,244` `newConfig._auto_detected = { max_workers: true, ... }` yazıyor.
- `DeckentConfig` type'ında tanımlı değil.
- `validateConfig()` bu key'i reddetmiyor (extra key'ler için strict validation yok — sessizce geçiyor).
- Live `.deckent/config.json`'da **yok** (büyük olasılıkla daha önceki init akışında Sprint 151 öncesi silindi, veya WSL migration ile kaybedildi).
- **Sonuç:** Dokümante edilmemiş internal marker. Init'te yazılıp sonradan kullanılmıyor (grep "_auto_detected" → sadece 2 writer, 0 reader). **Sessiz dead-key.**

---

## Sprint 153+ İçin Aksiyon Listesi

### P0 (Kritik — Kullanıcı kafasını karıştırıyor)
1. **Root-level `max_workers` ikilemini kapat.** `init-steps.ts:235,243` satırlarında `newConfig.max_workers` yerine `newConfig.modes = { performance: { max_workers: suggested }, balanced: ..., economic: ..., api: ... }` yazılsın (aktif mode + diğer mode'lar için suggested değeri cap'lı). Alternatif: `DeckentConfig` type'ına `max_workers?: number` eklenip runtime'da `activeModeConfig.max_workers ?? config.max_workers ?? 3` fallback zinciri — ama bu yeni duplication yaratır. **Önerilen:** root-level yazmayı kaldır, sadece nested mode alanına yaz. Effort: ~1h.

### P1 (Önemli — Teknik borç)
2. **T-151-NEW-H tamamlayıcı temizlik.** `DEFAULT_MODES`'taki `brain_model`/`default_model`/`haiku_allowed`/`brain_planning` hard-coded alanlarını `MODE_PRESETS.model_strategy` üzerinden türetmek (veya v1 PlanModeConfig alanlarını ADR-deprecated işaretleyip `modes.*` yerine `model_strategy` kullanımına tam geçmek). Effort: ~2-3h (Sprint 156 v1 deprecation ile birleştirilebilir).
3. **`_auto_detected` marker'ı ya type'a ekle ya da kaldır.** Eğer ilerideki sprint'ler "init-time auto-detect telemetry" istiyorsa `DeckentConfig` içine resmi alan olarak gir. Değilse init-steps'ten kaldır. Effort: ~30min.
4. **`.deck` KNOWN_DECK_KEYS listesini connector kullanımına göre güncelle.** DISCORD_TOKEN, TELEGRAM_TOKEN, WHATSAPP_TOKEN/PHONE_NUMBER_ID/VERIFY_TOKEN eklensin (9 → 14 key). `validateDeckFile` bu connector secret'larını "unknown" olarak warning vermesin. Effort: ~15min.

### P2 (Nice-to-have)
5. **Validation'a "extra-keys strict mode" ekle.** `validateConfig` bilinmeyen top-level key'leri en azından warning olarak raporlasın (errors'a değil, `maxWorkersWarnings` benzeri ayrı bir kanal). Böylece `_auto_detected` gibi driftler early-catch olur. Effort: ~1h.
6. **Migration dokümante et.** Sprint 150 Decision 3+4 geçişi + Sprint 150 `max_workers` consolidation için `docs/MIGRATION-CONFIG.md` yazılsın (veya ADR-004'e "Consolidation History" appendix eklensin). Effort: ~45min (docs).

---

## Kanıt Ekleri

### A. Root-Level `max_workers` Okuyucuları (Grep Evidence)
```
$ grep -rn "config\.max_workers\|\.max_workers" src/ | grep -v "activeModeConfig\|MODE_PRESETS\|DEFAULT_MODES\|Presets\|mc\.max_workers"
# (no matches — nobody reads root-level max_workers)
```
Tüm okuyucular `config.activeModeConfig.max_workers` üzerinden gidiyor (11 dosya, yukarıda listelendi).

### B. `init-steps.ts` Yazarı (Tek Kaynak)
```
src/cli/commands/init-steps.ts:233:      if (existing['max_workers'] === undefined) {
src/cli/commands/init-steps.ts:235:        newConfig.max_workers = suggested;
src/cli/commands/init-steps.ts:243:    newConfig.max_workers = suggested;
```

### C. `DEFAULT_MODES` ↔ `MODE_PRESETS` Birleşimi (Sprint 150 Consolidation)
```typescript
// src/core/config.ts:89-95
export const DEFAULT_MODES: Record<string, PlanModeConfig> = {
  performance: {
    max_workers: MODE_PRESETS['performance']!.max_workers,  // ← türetildi
    brain_model: 'opus',                                    // ← v1 backward-compat
    default_model: 'opus',                                  // ← v1 backward-compat
    haiku_allowed: true,                                    // ← v1 backward-compat
    brain_planning: 'auto',                                 // ← v1 backward-compat
  },
  // ...
};
```

### D. `deckent_style` Smoke
```
$ node dist/cli/entry.js mode show
Current: sprint
$ node dist/cli/entry.js mode --help | head -3
Usage: deckent mode [options] [command]
Get/set deckent_style (sprint|task|auto)
```

### E. Global Config Yokluğu (3-Layer Merge'de 2 Layer Aktif)
```
$ ls -la ~/.deckent 2>/dev/null || echo "no global config"
no global config
$ echo "HOME=$HOME"
HOME=/tmp/deckent-home
```
Yani bugünkü runtime'da **defaults → project** akışı aktif. Global layer eklenirse sorunsuz merge'e dahil olur (kod satır 678-681 guard'lı).

### F. Duplicate Key Temizliği Kanıtı
```
$ grep "claude_backend\|\"brain_provider\"\|\"worker_provider\"" .deckent/config.json
# (no matches — Sprint 150 Decision 3+4 applied)
$ jq '.providers' .deckent/config.json
{
  "brain": "claude",
  "worker": "claude"
}
```

### G. `.deck` Leakage Yok
```
$ grep "\$DECK:" .deckent/config.json
# (no matches)
$ ls .deck 2>/dev/null || echo "no .deck file in project root"
no .deck file in project root
```

### H. Baseline Integrity
```
$ npx tsc --noEmit ; echo "exit=$?"
exit=0
$ git diff --stat src/ tests/
# (no changes — read-only sprint enforced)
```

---

## Acceptance Criteria Check
- [x] Rapor dosyası `docs/audits/sprint-152/T-152-024-config-duplicate.md` yazıldı
- [x] Bulgular `[PASS | DRIFT | ...]` etiketli (7 bulgu)
- [x] Kanıt (komut çıktısı, dosya:satır, grep sonucu) içeriyor (8 ek)
- [x] Sprint 153+ aksiyon listesi var (P0×1, P1×3, P2×2)
- [x] Kod değişikliği YOK (`git diff src/ tests/` boş, `tsc --noEmit` exit=0)
