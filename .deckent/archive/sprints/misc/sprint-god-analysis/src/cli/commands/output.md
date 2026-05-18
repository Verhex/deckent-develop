# Analysis: src/cli/commands/output.ts
**Task ID:** 142-020 | **Model:** opus | **LoC:** 139 | **Effort:** max

## 1. Amaci
Worker cikti izleme komutu. `deckent output <taskId>` ile belirli bir worker'in cikti dosyasini okur. `--tail N` ile son N satir, `--follow` ile canli dosya poll (2sn interval), `--json` ile JSON formati destekler. Cikti dosyalari `.deckent/<sprint>-outputs/task-<id>.out` konumundadir.

## 2. Public API
- `resolveOutputPath(root, taskId, sprintId?): string | null` — JSDoc VAR
- `registerOutput(program: Command): void` — JSDoc YOK, EKSIK
- `readTailLines(filePath, n): string[]` — JSDoc VAR (re-export satir 139)
- `formatLines(lines, json): string` — JSDoc VAR (re-export satir 139)

## 3. Ic Bagimliliklar
- `../../core/constants.js` → DECKENT_DIR
- `../helpers/output.js` → print
- `../helpers/process.js` → resolveProjectRoot
- `../../monitor/sprint-state.js` → getCurrentSprintId
- Dongusel bagimllik riski: YOK

## 4. Dis Bagimliliklar
- `node:fs` (readFileSync, existsSync, statSync) — built-in
- `node:path` (join) — built-in
- `commander` (Command type) — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayisi: 4 (resolveOutputPath, readTailLines, formatLines, registerOutput)
- En karmasik: `registerOutput().action()` (satir 71-135, ~64 satir, follow modunda timer logic)
- Max cyclomatic: ~5 (follow/one-shot + initial/subsequent render)
- Genel karmasiklik: ORTA

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Genel: MUKEMMEL

## 7. ADR Compliance
- **ADR-006 spawnSync:** N/A
- **ADR-008 brain import:** UYUMLU
- **ADR-010 deps:** UYUMLU
- **ADR-022 CLI/MCP parity:** MCP'de dogrudan `deckent_output` tool'u YOK — **PARITY GAP** (worker output izleme MCP'de mantikli olabilir)
- **ADR-025 graceful shutdown:** ✅ SIGINT/SIGTERM follow modunda handle ediliyor (satir 128-132)
- **Memory V2:** N/A

## 8. Test Coverage
- `tests/cli/commands/output.test.ts` — MEVCUT ✅
- resolveOutputPath, readTailLines, formatLines saf fonksiyonlar — kolay test edilebilir
- Follow mode timer testi: mock gerektirir

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz

## 10. Dead Code
- Genel: Temiz — satir 139'da re-export acik ve amacli

## 11. Security
- readFileSync icin hata yakalama var (satir 41-50, satir 118-120) — GUVENLI
- taskId kullanici girdisi → dosya yoluna katiliyor (satir 32): `task-${taskId}.out`
- **P2: Path traversal potansiyeli** — taskId `../../etc/passwd` olursa? join() path'i normalize eder ama `task-../../etc/passwd.out` riski dusuk. Yine de taskId validation eklenebilir
- process.exit(0) — SIGINT/SIGTERM handler'da (satir 130) — follow modunda uygun

## 12. Memory V2 Uyumu
- Memory islemi yok — N/A
- Eski .md parse: YOK — UYUMLU

## 13. i18n
- Tum print mesajlari INGILIZCE hardcoded
- getMessage() KULLANILMIYOR — i18n gap

## 14. Dokumantasyon Tutarliligi
- resolveOutputPath, readTailLines, formatLines JSDoc mevcut — iyi
- registerOutput JSDoc EKSIK
- Dosya basinda yorum blogu aciklayici — iyi

## 15. Performance
- Follow modunda 2sn interval ile poll — **dosya boyutu buyukse** `readFileSync(filePath, 'utf-8')` tum dosyayi okuyor ve `content.slice(lastSize)` yapiliyor
- **P2: Buyuk cikti dosyalarinda performans sorunu** — stat.size ile yeni kismi okumak icin fd+seek kullanilabilir veya stream-based yaklasiim
- readFileSync follow modunda her 2sn'de bir — kabul edilebilir boyutlar icin uygun
- Hot path degil (kullanici aktif izleme yapiyor)

## 16. Oneriler
- **P2:** Follow mode buyuk dosya performansi — `readFileSync` yerine stream/fd-seek yaklasiim
- **P2:** taskId validation — regex ile sinirlandirma (orn. `/^\d{3}-\d{3}$/`)
- **P2:** i18n — print mesajlarini getMessage() ile wrap et
- **P3:** registerOutput JSDoc ekle
- **P3:** ADR-022 parity — MCP'ye worker output tool'u eklenmeli veya CLI-only belgelenmeli

## Verdict: ANALYZED
