# Analysis: src/cli/helpers/wizard.ts
**Task ID:** 142-021 | **Model:** opus | **LoC:** 355 | **Effort:** max

## 1. Amaci
Cok adimli TUI (Terminal UI) sihirbaz framework'u + IDE ortam algilama + provider secim sihirbazi. CLI `deckent init` komutu sirasinda kullaniciyi adim adim yonlendiren interaktif wizard sistemi. WizardStep/WizardResult pattern'i ile tip-guvenli, genisletilebilir bir wizard pipeline'i saglar. Ayrica IDE (Claude Code, Cursor, Terminal) otomatik algilama ve MCP rehberligi sunar. Provider (Claude, Codex, Gemini) secim sihirbazi ile multi-provider konfigurasyonu olusturur.

## 2. Public API
- `interface WizardStep` — Adim tanimi (id, prompt, type, choices, default, validate)
- `interface WizardResult` — Sonuc (Record<string, string | boolean>)
- `interface WizardOpts` — Seçenekler (nonInteractive, input, output streams)
- `runWizard(steps: WizardStep[], opts?: WizardOpts): Promise<WizardResult>` — Wizard calistirici
- `type IDEEnvironment = 'claude-code' | 'cursor' | 'terminal'`
- `detectIDEEnvironment(projectRoot?: string): IDEEnvironment` — IDE algilama
- `getMCPGuidance(ide: IDEEnvironment): string[]` — MCP rehberligi
- `interface ProviderConfig` — Provider konfigurasyonu
- `buildProviderWizardSteps(detected: DetectedProvider[]): { autoConfig: ProviderConfig | null; steps: WizardStep[] }` — Provider wizard adimlari
- `resolveProviderWizardResult(result: WizardResult, _detected: DetectedProvider[]): ProviderConfig` — Wizard sonuc cozumleme
- `getProviderMissingAuth(provider: DetectedProvider): string | null` — Eksik auth tespiti
- `formatProviderAuthGuidance(detected: DetectedProvider[]): string[]` — Auth rehberligi
- JSDoc: Kritik fonksiyonlarda mevcut (detectIDEEnvironment, getMCPGuidance, buildProviderWizardSteps, resolveProviderWizardResult)

## 3. Ic Bagimliliklar
- `../../core/provider.js` → `DetectedProvider` (type-only)
- `../../core/task-types.js` → `ProviderName` (type-only)
- Dongusel bagimlilik riski: YOK — sadece type import

## 4. Dis Bagimliliklar
- `node:readline` — ADR-010 uyumlu (native, ADR-011 varyanti — burada sync readline)
- `node:fs` → `existsSync` — ADR-010 uyumlu
- `node:child_process` → `execSync` — **ADR-006 DIKKAT:** `execSync` kullaniliyor (satir 171)
- `node:path` → `join` — ADR-010 uyumlu

## 5. Complexity
- 12 fonksiyon (5 export, 7 private)
- En karmasik: `buildProviderWizardSteps` (satir 230-298, cyclomatic ~5)
- `detectIDEEnvironment` (satir 160-190, cyclomatic ~7) — coklu IDE algilama dallanmasi
- `runInputStep` (satir 122-148, cyclomatic ~4, while loop + validation)

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `as unknown` 1: satir 138 — `(rl as unknown as { output: NodeJS.WritableStream }).output`
  - **P2 SORUN:** node:readline'in output property'sine erisim icin unsafe cast. readline Interface'in `output` property'si TypeScript'te public degil ama runtime'da mevcut. Tip guvenligi ihlali.
- `as string` cast: satir 64, 111, 119, 132 — `step.default as string` — WizardStep.default `string | boolean` union, dogrudan `as string` unsafe ama kontrol sonrasi
- `as ProviderName` cast: satir 307, 308, 310 — wizard result'tan tip narrowing — guvenli (runtime'da string, compile-time tip zorlama)
- Non-null `!`: satir 64 (`step.choices[0]!.value`), satir 115 (`choices[idx - 1]!.value`), satir 249 (`available[0]!.name`), satir 272, 279 — hepsi length check sonrasi, **GUVENLI**

## 7. ADR Compliance
- **ADR-006 (spawnSync security):** `execSync` (satir 171) kullaniliyor — `ps -p ${ppid} -o comm=` komutu. ppid `process.ppid`'den geliyor (number). **GUVENLI** — kullanici girdisi degil, sistem PID'si. Timeout 2000ms ile korunuyor.
- **ADR-008:** N/A (brain import yok)
- **ADR-010:** UYUMLU
- **ADR-011:** `node:readline` (sync) kullaniliyor, `node:readline/promises` degil — `prompt.ts` ile tutarsiz ama islevsel. Wizard callback-based, prompt promise-based.
- **ADR-022:** N/A (CLI-only wizard)
- Memory V2: N/A

## 8. Test Coverage
- `tests/cli/helpers/wizard-provider.test.ts` — MEVCUT (provider wizard testleri)
- **UYARI:** `wizard.test.ts` (core wizard) MEVCUT DEGIL — sadece provider wizard testleniyor
- `runWizard`, `runStep`, `runConfirmStep`, `runSelectStep`, `runInputStep` icin dedicated test dosyasi YOK
- `detectIDEEnvironment` icin test YOK
- `getMCPGuidance` icin test YOK
- **P1 TEST GAP:** Core wizard logic test edilmemis — sadece provider-specific kisim testleniyor

## 9. TODO/FIXME/HACK Inventory
- `// eslint-disable-next-line no-constant-condition` (satir 128) — while(true) input loop icin. Kabul edilebilir.

## 10. Dead Code
- `_detected` parametre (satir 305): `resolveProviderWizardResult` ikinci parametreyi kullanmiyor, underscore prefix ile isimlendirilmis. API uyumlulugu icin tutuluyor olabilir.
- `getProviderMissingAuth` (satir 327-337): `available = true` ise null, `authMethod = 'none'` ise switch — `claude` case null dondurur. Mantik doğru ama `authMethod !== 'none'` durumunda da null — yani auth method bilinen ama yine de unavailable provider'lar icin bilgi saglanmiyor. Incomplete logic potansiyeli.
- **DEAD CODE YOK** ama `_detected` kullanilmayan parametre var

## 11. Security
- **execSync** (satir 171): `ps -p ${ppid} -o comm=` — ppid process.ppid'den, number. Command injection riski DUSUK ama template literal icinde. Sabit format, kullanici kontrol edemez.
  - **ONERI:** Yine de `String(ppid)` ile explicit string donusumu guvenlik icin iyi pratik olurdu.
- **existsSync** ile `.cursor` dizin kontrolu — path traversal riski YOK (projectRoot + sabit string)
- readline girdisi: trim/parseInt ile isleniyor — guvenli
- **FORCE_COLOR env emojisi** (satir 349): `⚠` Unicode emoji — terminal uyumlulugu sorun olabilir ama kosmetik

## 12. Memory V2 Uyumu
- N/A — wizard interaksiyon modulu, hafiza erisimi yok

## 13. i18n
- Hardcoded Ingilizce stringler (cok sayida):
  - "Claude Code detected — MCP is auto-configured..." (satir 199)
  - "Cursor detected — add deckent MCP to..." (satir 204)
  - "Terminal mode — MCP tools available via..." (satir 210)
  - "Select brain (planner) provider:" (satir 270)
  - "Select worker (execution) provider:" (satir 276)
  - "Select fallback provider..." (satir 288)
  - "Install CLI (npm i -g @anthropic-ai/claude-code)..." (satir 350)
- **P2 SORUN:** Provider wizard ve IDE guidance tamamen Ingilizce — messages.ts i18n sistemi KULLANILMIYOR

## 14. Dokumantasyon Tutarliligi
- JSDoc: Kritik fonksiyonlarda mevcut ✓
- `detectIDEEnvironment` JSDoc: env var isimleri ve algilama mantigi aciklanmis ✓
- `buildProviderWizardSteps` JSDoc: Single/multiple provider davranisi aciklanmis ✓
- Private fonksiyonlarda JSDoc: EKSIK
- **IYI** seviyede dokumantasyon

## 15. Performance
- `execSync` (satir 171): **BLOCKING** — 2000ms timeout ile korunuyor ama yine de sync
  - Sadece `deckent init` sirasinda 1 kez cagirilir — pratikte sorun degil
- `existsSync` (satir 185): `.cursor` dizin kontrolu — minimal
- Sync I/O toplam: 2 (execSync, existsSync)
- **Hot path DEGIL** — sadece init wizard

## 16. Oneriler
- **P1:** Core wizard fonksiyonlari icin test dosyasi eklenmeli (`wizard.test.ts` — runWizard, detectIDEEnvironment, getMCPGuidance)
- **P2:** `as unknown as { output: NodeJS.WritableStream }` unsafe cast — readline 'output' property'si icin dogru typing arastirilmali veya type-safe bir alternatif bulunmali
- **P2:** i18n: Wizard mesajlari messages.ts'e tasinmali
- **P2:** `node:readline` (sync) vs `node:readline/promises` (prompt.ts) tutarsizligi — wizard icin de promises kullanilabilir
- **P3:** `_detected` kullanilmayan parametre — API stable ise kabul edilebilir, aksi halde kaldirilmali
- **P3:** `getProviderMissingAuth` — authMethod disi durumlar icin daha bilgilendirici mesaj

## Verdict: ANALYZED
