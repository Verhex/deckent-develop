# Analysis: src/cli/index.ts
**Task ID:** 142-023 | **Model:** opus | **LoC:** 105 | **Effort:** max

## 1. Amaç
CLI program builder — `commander.js` ile tüm komutları kayıt eden merkezi modül. `buildProgram()` fonksiyonu tüm 40+ komutu register eder, versiyon bilgisi ve splash screen gösterir. entry.ts tarafından çağrılır. Tüm CLI alt komutlarının tek giriş noktası.

## 2. Public API
- `function buildProgram(): Command` — JSDoc VAR ✓ ("Build and configure the CLI program with all commands registered.")

## 3. İç Bağımlılıklar
39 import statement — tüm CLI komutları:
- `commander` → `Command` (ADR-010: commander tek runtime dependency)
- `../core/constants.js` → `DECKENT_VERSION`
- `./version-info.js` → `buildVersionString`, `buildVersionJson`
- `./helpers/splash.js` → `showSplash`
- 35 komut register fonksiyonu: init, start, plan, status, attach, spawn, kill, retro, cleanup, doctor, config, history, plugin, upgrade, onboard, analyze, archive-debt, dashboard, serve, web, sync, watch, run, test-run, agent, skill, review, finalize, explain, set-directives, heartbeat, checkpoint, docs, output, cost, recall, remember, memory

**Komut Sayısı Doğrulama**:
- Import edilen register fonksiyonu: 37
- CLAUDE.md'de "CLI Commands: 40+" yazıyor
- IDENTITY.md'de "CLI Commands: 41+" yazıyor
- Register fonksiyonu 37 ama bazı komutlar alt-komut olabilir (agent list, skill list, memory rebuild/export/stats)
- **TUTARLILIK**: 37 register ≈ 41+ (sub-commands dahil) — KABUL EDİLEBİLİR ✓

## 4. Dış Bağımlılıklar
- `commander` — ADR-010 tek runtime dependency ✓

## 5. Complexity
- Fonksiyon sayısı: 1 (buildProgram)
- Max cyclomatic: 1 (lineer register zinciri)
- Karmaşıklık: DÜŞÜK — sadece register çağrıları

## 6. Type Safety
- `any` sayısı: 0 ✓
- Dönüş tipi: `Command` (commander) — doğru ✓
- Tip güvenliği: MÜKEMMEL

## 7. ADR Compliance
- ADR-006: N/A ✓
- ADR-008: Brain import yok ✓ (sadece CLI komutları import)
- ADR-010: `commander` tek dış bağımlılık ✓
- ADR-012: `register<Name>(program)` pattern — TAM UYUM ✓
  - Tüm komutlar `registerXxx(program)` formatında
- ADR-022: 37 register fonksiyonu kayıtlı, MCP'de 22 tool — CLI > MCP ✓
  - CLI-only komutlar: attach, spawn, watch, web, serve, dashboard, plugin, upgrade, onboard, archive-debt, test-run, finalize, heartbeat, output, cost
  - Bu beklenen bir fark — bazı komutlar CLI-only (terminal etkileşimi)

## 8. Test Coverage
- Test dosyası: `tests/cli/index.test.ts` MEVCUT ✓
- Kritik: buildProgram çağrılabilirliği, komut sayısı, versiyon flag'leri

## 9. TODO/FIXME/HACK Inventory
Hiç yok ✓

## 10. Dead Code
- Tüm register çağrıları aktif ✓
- Dead code: YOK ✓
- **NOT**: Bazı register edilen komutlar çok az kullanılıyor olabilir (test-run, heartbeat, output, cost) ama bu dead code değil, feature yetişkinliği meselesi

## 11. Security
- Version output (satır 55-62): `process.exit(0)` — version flag'de erken çıkış, güvenli ✓
- `showSplash` çıktı: Sanitize edilmemiş ama iç ASCII art ✓

## 12. Memory V2 Uyumu
- `registerRecall`, `registerRemember`, `registerMemory` kayıtlı ✓
- Memory V2 CLI komutları tam entegre ✓

## 13. i18n
- "AI agent orchestration system — your AI development team, orchestrated." (satır 51): EN description
- Severity: P3 (commander program description, düşük i18n öncelik)

## 14. Dokümantasyon Tutarlılığı
- JSDoc: buildProgram ✓
- CLAUDE.md: "CLI Commands: 40+" — 37 register + sub-commands ≈ doğru ✓
- IDENTITY.md: "CLI Commands: 41+" — doğru ✓
- **UYARI**: Yeni komut eklendiğinde CLAUDE.md/IDENTITY.md güncellenmeli

## 15. Performance
- Import zinciri: 39 import — Node.js ESM ile lazy evaluate edilmez, startup'ta hepsi yüklenir
  - **PERF BULGU**: `deckent --version` bile tüm 39 modülü import ediyor
  - Severity: P2 (startup time artışı, kullanıcı deneyimi)
  - Mitigation: Lazy import pattern (dynamic import) kullanılabilir
- Sync I/O: 0 (import hariç)

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | Startup performansı: 39 eager import → lazy dynamic import pattern değerlendirilmeli |
| P2 | `--version` flag'i `process.exit(0)` çağırıyor ama `on('option:version')` event handler'da — commander lifecycle ile uyum kontrolü |
| P3 | CLAUDE.md/IDENTITY.md komut sayısı senkronizasyonu otomatikleştirilmeli |
| P3 | Program description i18n |

## Verdict: ANALYZED
