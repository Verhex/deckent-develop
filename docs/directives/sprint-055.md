# DIRECTIVES — Sprint 055: CLI Bug Fix & DRY Refactoring (Deep Analysis Recovery)

## Goal: cli-deep-analysis.md'deki ~180 öneriden en kritik 10 tanesini uygula. 2 P0 bug fix (retro parse bozuk, kill task status güncellenmiyor), DRY ihlallerini temizle (readLanguage 4x, readJsonSafe 6x duplicate), config/spawn fonksiyonel eksikleri tamamla, CRUD komutları ekle. %100 başarı hedefi — tüm task'lar GO olmalı.

---

## Task 1: Retro Parse/Write Format Uyumsuzluğu Fix + --compare Bug (P0 KRİTİK)
- Model: opus
- Effort: high
- Files: src/cli/commands/retro.ts, src/orchestra/sprint-reporter.ts
- Scope: src/cli/commands/, src/orchestra/, tests/cli/commands/, tests/orchestra/
- Dependencies: yok (ilk çalışacak, Task 6 buna bağlı)

### Description
**KRİTİK BUG:** `writeRetrospective()` ve `parseRetroToRichSummary()` arasında format uyumsuzluğu var. Retro komutu çalıştırıldığında tüm metrik değerler 0 dönüyor çünkü regex'ler eşleşmiyor.

**A) Parse/Write Format Uyumsuzluğu:**

Yazma formatı (`sprint-reporter.ts` satır 255-281):
```
| What | Value |
|------|-------|
| Tasks completed | 5/8 |
| NO_GO rate | 25% (2/8) |
| Sprint time | 3m 38s |
| Coverage | 85.2% |
```

Okuma formatı (`retro.ts` satır 19-26) — bunlar yazma formatıyla EŞLEŞMIYOR:
- `| Total Tasks |` → yazılan: `| Tasks completed | X/Y |` (X/Y formatı, total ayrı değil)
- `| Completed |` → yazılan: `| Tasks completed | X/Y |` (completed ayrı değil)
- `| No-Go |` → yazılan: `| NO_GO rate | Z% (A/B) |` (format tamamen farklı)
- `| Tech Debt |` → yazılmıyor (hiç yok)
- `| Coverage |` → yazılan: `| Coverage | X% |` (BU TEK EŞLEŞEN)
- `| Duration |` → yazılan: `| Sprint time | Xs |` (isim farklı)

**Çözüm:** `retro.ts`'deki `parseRetroToRichSummary()` fonksiyonunun regex'lerini sprint-reporter.ts'in GERÇEK yazma formatına eşleştir:

1. `| Tasks completed | X/Y |` formatından: totalTasks=Y, completed=X parse et
   - Regex: `/\|\s*Tasks completed\s*\|\s*(\d+)\s*\/\s*(\d+)\s*\|/i` → group1=completed, group2=total
2. `| NO_GO rate | Z% (A/B) |` formatından: noGo=A parse et
   - Regex: `/\|\s*NO_GO rate\s*\|[^|]*\((\d+)\/\d+\)\s*\|/i` → group1=noGo
3. `| Sprint time | ... |` formatından duration parse et
   - Regex: `/\|\s*Sprint time\s*\|\s*(.+?)\s*\|/i`
4. Tech Debt: sprint-reporter.ts `| GO_WITH_TECH_DEBT |` yazmıyor, ayrı satır yok. Sprint log'dan gelmeli veya calculateMetrics'ten. Şimdilik 0 kalabilir, fallback olarak `GO_WITH_TECH_DEBT` string count yap content içinde.
5. Mevcut `| Coverage |` regex'i zaten çalışıyor, dokunma.
6. Mevcut fallback regex'leri (fbTotal, fbCoverage, fbDuration) koru — non-table formatlar için.

**B) `--compare` Kendisiyle Karşılaştırma Bugu:**
`loadPreviousRetro()` fonksiyonu (satır 79-90) `files.at(-1)` kullanıyor. Bu son sprint logu = mevcut sprint'in kendisi. Delta her zaman 0 çıkıyor.

**Çözüm:**
1. `files.at(-1)` yerine `files.at(-2)` kullan (sondan bir önceki sprint)
2. `files.length < 2` ise `null` dön (karşılaştırma için en az 2 sprint lazım)
3. Edge case: mevcut sprint'in ID'sini al, son dosya mevcut sprint ise `at(-2)`, değilse `at(-1)` kullan

**Test:** tests/cli/commands/retro-parse-fix.test.ts — 10+ test:
- writeRetrospective mock çıktısını parseRetroToRichSummary ile parse et → completed, totalTasks, noGo doğru
- `| Tasks completed | 5/8 |` → completed=5, totalTasks=8
- `| Tasks completed | 0/3 |` → completed=0, totalTasks=3
- `| NO_GO rate | 25% (2/8) |` → noGo=2
- `| NO_GO rate | 0% (0/5) |` → noGo=0
- `| Sprint time | 3m 38s |` → duration="3m 38s"
- `| Coverage | 85.2% |` → coverage="85.2%"
- loadPreviousRetro: 3+ dosyada sondan ikincisini dönmeli
- loadPreviousRetro: tek dosyada null dönmeli
- loadPreviousRetro: 0 dosyada null dönmeli
- --compare gerçek delta hesaplamalı (previous != current)
- Boş RETRO.md'de tüm değerler 0/default
- Mevcut fallback regex'ler çalışmalı

IMPORTANT: sprint-reporter.ts'in yazma formatını DEĞİŞTİRME — sadece retro.ts'deki okuma regex'lerini düzelt. Mevcut test dosyaları retro.test.ts ve retro-rich.test.ts'ye DOKUNMA, sadece yeni test dosyası ekle.

---

## Task 2: Kill Komutu Task Status + Lock Temizliği + --all Flag (P0 KRİTİK)
- Model: opus
- Effort: high
- Files: src/cli/commands/kill.ts
- Scope: src/cli/commands/, .tasks/, .locks/, tests/cli/commands/
- Dependencies: yok

### Description
**KRİTİK BUG:** `deckent kill <taskId>` worker'ı öldürüyor ama task dosyası EXECUTING kalıyor ve lock'lar serbest bırakılmıyor. Bu Brain'in "hâlâ çalışıyor" sanmasına ve diğer worker'ların kilitli dosyalara erişememesine yol açıyor.

Mevcut kill.ts (29 satır) sadece `killWorker(taskId)` çağırıyor. 4 iyileştirme:

**A) Task Status Güncelleme:**
Kill başarılı olduktan sonra:
1. `.tasks/` dizininden task dosyasını bul: `task-{taskId}.json` veya `task-*-{taskId}.json` pattern (sprint ID prefix olabilir)
2. JSON oku, `status` alanını `'PAUSED'` olarak güncelle (NO_GO değil — kullanıcı kasıtlı durdurdu)
3. Dosyayı geri yaz
4. Task bulunamazsa sadece uyarı ver, hata fırlatma (tmux kill zaten başarılı)

Import'lar: `readFileSync`, `writeFileSync`, `existsSync`, `readdirSync` from 'node:fs', `join` from 'node:path'
Sabitler: `TASKS_DIR` from '../../core/constants.js'

**B) Lock Temizliği:**
Kill başarılı olduktan sonra:
1. `.locks/` dizinini tara (yoksa atla)
2. Her lock dosyasını oku (JSON)
3. `ownerWorkerId` değeri `w-{taskId}` olan lock dosyalarını sil (`unlinkSync`)
4. Silinen lock sayısını log'la

Sabitler: `LOCKS_DIR` from '../../core/constants.js'

**C) `--all` Flag:**
`deckent kill --all` tüm aktif worker'ları öldürsün:
1. `--all` option ekle
2. `.tasks/` dizininden status=`EXECUTING` veya status=`CLAIMED` olan task'ları bul
3. Her biri için: killWorker + status update + lock cleanup
4. `tmux list-windows` ile de cross-check yap (orphan window'lar için)
5. Toplam öldürülen worker sayısını göster

**D) Prompt Dosyası Temizliği:**
Kill sonrası `.tasks/.prompt-*.txt` dosyalarını temizle. taskId'yi içeren prompt dosyalarını bul ve sil.

**Test:** tests/cli/commands/kill-enhanced.test.ts — 12+ test:
- Kill sonrası task status PAUSED olmalı
- Kill sonrası worker'a ait lock'lar silinmeli
- Kill sonrası başka worker'ların lock'ları DURMALI
- Task dosyası bulunamazsa sadece uyarı (hata değil)
- Lock dizini yoksa hata vermemeli
- --all EXECUTING task'ları durdurmali
- --all CLAIMED task'ları da dahil etmeli
- --all boş task dizininde hata vermemeli
- --all sonrası tüm aktif task'lar PAUSED olmalı
- Prompt dosyaları temizlenmeli
- Olmayan taskId'de TmuxError mesajı
- kill + lock cleanup idempotent olmalı (2 kez çalıştırılabilir)

IMPORTANT: `src/orchestra/tmux.ts`'ye DOKUNMA. Tüm yeni kod kill.ts içinde olacak. Lock okuma/silme için doğrudan fs operasyonları kullan (releaseLock fonksiyonu yerine — worker ID format farkı olabilir). getMessage() ile i18n mesajlarını koru.

---

## Task 3: readLanguage + readJsonSafe Tam DRY Temizliği (P1)
- Model: opus
- Effort: max
- Files: src/cli/helpers/config-reader.ts (yeni), src/cli/commands/cleanup.ts, src/cli/commands/doctor.ts, src/cli/commands/finalize.ts, src/cli/commands/status.ts, src/cli/commands/run.ts, src/monitor/auditor.ts, src/orchestra/sprint-controller.ts, src/orchestra/debt-manager.ts
- Scope: src/cli/, src/monitor/, src/orchestra/, src/core/, tests/
- Dependencies: yok (Task 6 ve Task 7 buna bağlı)

### Description
Projede 2 fonksiyon çok sayıda dosyada duplicate olarak tanımlanmış. Bu DRY ihlali bakım maliyetini artırıyor ve bug fix'lerin tek noktada yapılmasını engelliyor.

**A) readLanguage() → getLangFromConfig() Helper (4 kopya → 1):**

Duplicate konumları:
- `src/cli/commands/cleanup.ts:13` — `function readLanguage(root: string): string`
- `src/cli/commands/doctor.ts:32` — `function readLanguage(root: string): string`
- `src/cli/commands/finalize.ts:14` — `function readLanguage(root: string): string`
- `src/cli/commands/status.ts:63` — `export function getLangFromRoot(root: string): string`

Hepsi aynı pattern: `.deckent/config.json` oku → JSON parse → `language` field → fallback 'en'

**Çözüm:**
1. `src/cli/helpers/config-reader.ts` dosyası oluştur
2. `export function getLangFromConfig(root: string): string` fonksiyonu yaz
3. cleanup.ts, doctor.ts, finalize.ts'deki yerel `readLanguage()` fonksiyonlarını SİL
4. Bu dosyalara `import { getLangFromConfig } from '../helpers/config-reader.js'` ekle
5. Fonksiyon çağrılarını `readLanguage(root)` → `getLangFromConfig(root)` olarak güncelle
6. status.ts'deki `getLangFromRoot` fonksiyonunu da `getLangFromConfig`'e yönlendir:
   - Ya fonksiyonu sil + import ekle
   - Ya da `export { getLangFromConfig as getLangFromRoot } from '../helpers/config-reader.js'` re-export yap (backward compat)
   - status.ts'i import eden dosya varsa kontrol et (api/server.ts?)

**B) readJsonSafe() Duplicate Temizliği (5 kopya → 0, canonical: core/utils.ts):**

Canonical kaynak: `src/core/utils.ts:45` — `export function readJsonSafe<T>(filePath: string): T | null`

Duplicate konumları (hepsi aynı implementasyon):
- `src/cli/commands/finalize.ts:27` — `function readJsonSafe<T>(...)`
- `src/cli/commands/run.ts:37` — `function readJsonSafe<T>(...)`
- `src/monitor/auditor.ts:29` — `function readJsonSafe<T>(...)`
- `src/orchestra/sprint-controller.ts:196` — `function readJsonSafe<T>(...)`
- `src/orchestra/debt-manager.ts:28` — `function readJsonSafe<T>(...)`

**Çözüm:**
Her dosya için:
1. Yerel `readJsonSafe` fonksiyon tanımını SİL
2. `import { readJsonSafe } from '../../core/utils.js'` ekle (path dosyaya göre değişir)
   - finalize.ts, run.ts: `'../../core/utils.js'`
   - auditor.ts: `'../core/utils.js'`
   - sprint-controller.ts: `'../core/utils.js'`
   - debt-manager.ts: `'../core/utils.js'`
3. Fonksiyon imzası aynı olduğu için çağrı noktaları değişmez

**DİKKAT — Zincir İşlem Kuralı:**
- Bu task cleanup.ts, doctor.ts, finalize.ts'ye dokunuyor
- Task 6 (--json flag) doctor.ts ve retro.ts'ye dokunuyor
- Task 7 (--dry-run) cleanup.ts'ye dokunuyor
- **Task 3 MUTLAKA Task 6 ve Task 7'den ÖNCE tamamlanmalı**

**Test:** tests/cli/helpers/config-reader.test.ts — 8+ test:
- getLangFromConfig: config varsa dil dönmeli
- getLangFromConfig: config yoksa 'en' dönmeli
- getLangFromConfig: bozuk JSON'da 'en' dönmeli
- getLangFromConfig: language alanı yoksa 'en' dönmeli
- readJsonSafe import: finalize.ts, run.ts, auditor.ts, sprint-controller.ts, debt-manager.ts'de yerel tanım OLMAMALI
- tsc --noEmit ile tüm import'lar doğrulanmalı
- Mevcut testlerin tümü geçmeli (regresyon kontrolü)

IMPORTANT: Bu task ÇOK SAYIDA dosyaya dokunuyor. Her dosyada SADECE readLanguage/readJsonSafe değişikliği yap. Başka hiçbir şeye dokunma. Her değişiklikten sonra `tsc --noEmit` ile derleme kontrolü yap.

---

## Task 4: Config Set Nested Key + Import DeepMerge + Config Get (P1)
- Model: opus
- Effort: high
- Files: src/cli/commands/config.ts, src/core/config-migration.ts, src/core/config.ts
- Scope: src/cli/commands/, src/core/, tests/cli/commands/
- Dependencies: yok

### Description
Config komutunda 2 fonksiyonel eksik var. Mevcut altyapı zaten hazır ama bağlanmamış.

**A) `config set` Nested Key Desteği:**

Mevcut durum (`config.ts:104-105`):
```typescript
// Simple top-level keys only
(existing as Record<string, unknown>)[key] = parsed;
```

`setNestedValue` fonksiyonu `src/core/config-migration.ts:57`'de tanımlı ve satır 208'de export ediliyor:
```typescript
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void
```

**Çözüm:**
1. `import { setNestedValue } from '../../core/config-migration.js'` ekle
2. Key'de `.` varsa `setNestedValue(existing, key, parsed)` kullan
3. Key'de `.` yoksa mevcut davranışı koru (top-level set)
4. Print mesajını güncelle: nested key'de tam path göster

Örnek: `deckent config set modes.max_plan.max_workers 8`

**B) `config import` Deep Merge:**

Mevcut durum (`config.ts:65`):
```typescript
const merged = { ...existing, ...importData };  // SHALLOW — nested objeler eziliyor
```

`deepMerge` fonksiyonu `src/core/config.ts:124`'te export ediliyor:
```typescript
export function deepMerge<T>(base: T, override: Partial<T>): T
```

**Çözüm:**
1. `import { loadConfig, validatePartialConfig, ConfigValidationError, deepMerge } from '../../core/config.js'` — mevcut import'a `deepMerge` ekle
2. Satır 65'i değiştir: `const merged = deepMerge(existing, importData) as Record<string, unknown>;`

**C) `config get <key>` Alt Komutu:**

`getNestedValue` fonksiyonu `src/core/config-migration.ts:44`'te tanımlı ve satır 208'de export ediliyor.

**Çözüm:**
1. `cmd.command('get <key>')` alt komutu ekle
2. `import { setNestedValue, getNestedValue } from '../../core/config-migration.js'` — import'a ekle
3. `loadConfig(root)` ile resolved config al
4. `getNestedValue(config, key)` ile değeri al
5. undefined ise "Key not found: {key}" hata mesajı
6. Değeri `JSON.stringify(value, null, 2)` ile göster

**Test:** tests/cli/commands/config-nested.test.ts — 12+ test:
- `config set language tr` — top-level key hâlâ çalışmalı
- `config set modes.max_plan.max_workers 8` — nested key setlenmeli
- `config set modes.pro_plan.brain_model sonnet` — 2 seviye nested
- Nested set sonrası diğer nested değerler korunmalı
- `config import` deep merge nested objeleri korumalı
- `config import` top-level alanları override etmeli
- `config import` mevcut nested objeyi nested importla genişletmeli
- `config get language` — string değer dönmeli
- `config get modes.max_plan` — obje dönmeli
- `config get modes.max_plan.max_workers` — number dönmeli
- `config get nonexistent.key` — hata mesajı
- Validation: geçersiz value'da hata

IMPORTANT: Mevcut `config set`, `config export`, `config import`, `config migrate` davranışlarını BOZMA. Sadece nested key desteği + deep merge + get komutu ekle. `loadConfig` fonksiyonuna DOKUNMA.

---

## Task 5: Spawn Komutu Prompt Zenginleştirme + Status Kontrolü (P1)
- Model: opus
- Effort: high
- Files: src/cli/commands/spawn.ts
- Scope: src/cli/commands/, src/orchestra/, tests/cli/commands/
- Dependencies: yok

### Description
`deckent spawn <taskId>` çok basit bir prompt kullanıyor: `"You are a Worker agent. Read your task file..."`. Oysa `spawnWorkers()` (sprint-controller.ts) zengin prompt oluşturuyor: agent systemPrompt + skill SKILL.md + task detayları + scope bilgisi.

Mevcut spawn.ts'in prompt'u (`src/cli/commands/spawn.ts:22` civarı):
```typescript
const prompt = `You are a Worker agent. Read your task file at .tasks/task-${taskId}.json and execute it.`;
```

**A) Zengin Prompt Oluşturma:**
1. `buildWorkerPrompt` fonksiyonunu import et: `import { buildWorkerPrompt } from '../../orchestra/brain.js'`
   - VEYA doğrudan `sprint-controller.ts`'den: kontrol et hangisi export ediyor
2. Task dosyasını oku (zaten `readTask` ile okunuyor)
3. Agent context: `resolveAgentPrompt(root, task)` import et — task'a atanmış agent'ın PROMPT.md'sini okur
4. Skill context: `resolveSkillPrompts(root, task)` import et — task'a atanmış skill'lerin SKILL.md'lerini okur
5. `buildWorkerPrompt(task, agentPrompt, skillPrompts)` ile zengin prompt oluştur
6. Eğer buildWorkerPrompt import edilemiyorsa (circular dependency riski), basit bir lokal builder yaz:
   - Task bilgisi (title, description, scope, goNogo)
   - Agent PROMPT.md içeriği (varsa)
   - Skill SKILL.md içerikleri (varsa, max 3)
   - Worker rules referansı

**B) Task Status Kontrolü:**
1. Spawn öncesi task status'u kontrol et
2. `DONE` veya `NO_GO` ise uyarı ver: "Task already {status}. Use --force to respawn."
3. `--force` flag ekle (DONE/NO_GO task'ları tekrar spawn etmek için)
4. `EXECUTING` ise uyarı ver: "Task already running. Kill first with `deckent kill {taskId}`."

**C) `--auto-approve` Flag:**
1. Mevcut hardcode `autoApprove: false` yerine CLI flag ekle
2. `--auto-approve` verilirse `spawnWorker` çağrısında `autoApprove: true` geç

**D) Scope Bilgisi Gösterimi:**
Spawn sonrası task'ın scope'unu göster: hangi dizinlere erişim var, hangi dosyaları yazabilir.

**Test:** tests/cli/commands/spawn-enhanced.test.ts — 10+ test:
- Spawn zenginleştirilmiş prompt kullanmalı (basit tek satır DEĞİL)
- Agent atanmış task'ta agent context inject edilmeli
- Skill atanmış task'ta skill context inject edilmeli
- DONE status'lu task'ta uyarı mesajı
- --force ile DONE task respawn edilebilmeli
- EXECUTING task'ta "already running" mesajı
- --auto-approve flag'i geçerli olmalı
- Task dosyası bulunamazsa anlamlı hata
- Scope bilgisi gösterilmeli
- Prompt minimum 100 karakter uzunluğunda olmalı (zengin prompt testi)

IMPORTANT: `sprint-controller.ts`'deki `spawnWorkers()` fonksiyonunu ÇAĞIRMA — bu tüm sprint spawn eder. Sadece prompt builder fonksiyonlarını import et. Circular dependency olursa lokal builder yaz.

---

## Task 6: Doctor --json + Retro --json Flag'leri (P2)
- Model: opus
- Effort: medium
- Files: src/cli/commands/doctor.ts, src/cli/commands/retro.ts
- Scope: src/cli/commands/, tests/cli/commands/
- Dependencies: Task 1 (retro.ts), Task 3 (doctor.ts — readLanguage DRY)

### Description
CI/CD entegrasyonu ve programmatic kullanım için `--json` flag'leri eksik.

**A) Doctor --json:**
`runDoctorChecks()` zaten `DoctorResult` objesi dönüyor. Sadece CLI tarafında JSON serialize etmek yeterli.

**Çözüm:**
1. `--json` option ekle: `.option('--json', 'Output results as JSON')`
2. `--json` varsa:
   ```typescript
   const result = runDoctorChecks(root);
   const providers = await detectAvailableProviders();
   print(JSON.stringify({ ok: result.ok, checks: result.checks, providers }, null, 2));
   return;
   ```
3. Human-readable çıktıya DOKUNMA — `--json` sadece alternatif format

**B) Retro --json:**
`parseRetroToRichSummary()` zaten `RichSprintSummary` dönüyor (Task 1'de fix edilmiş hali).

**Çözüm:**
1. `--json` option ekle: `.option('--json', 'Output results as JSON')`
2. `--json` varsa:
   ```typescript
   const summary = parseRetroToRichSummary(content);
   const output: Record<string, unknown> = { ...summary };
   delete output.raw;  // raw markdown'u JSON'dan çıkar
   if (opts.compare) {
     const prevContent = loadPreviousRetro(root);
     if (prevContent) {
       const prevSummary = parseRetroToRichSummary(prevContent);
       output.delta = { ... };  // computeRetroDelta verilerini JSON'a ekle
     }
   }
   print(JSON.stringify(output, null, 2));
   return;
   ```
3. `--raw --json` birlikte verilirse `--json` öncelikli

**DİKKAT:** Bu task retro.ts'ye dokunuyor. Task 1 MUTLAKA önce tamamlanmış olmalı (parse fix). Aynı şekilde doctor.ts'ye dokunuyor, Task 3 önce tamamlanmış olmalı (readLanguage DRY).

**Test:** tests/cli/commands/doctor-json.test.ts (5+ test), tests/cli/commands/retro-json.test.ts (5+ test):
- Doctor --json geçerli JSON dönmeli
- Doctor --json `ok` boolean field içermeli
- Doctor --json `checks` array içermeli
- Doctor --json `providers` array içermeli
- Doctor --json --profile ek bilgi eklemeli
- Retro --json geçerli JSON dönmeli
- Retro --json raw field İÇERMEMELİ
- Retro --json --compare delta obje içermeli
- Retro --raw --json → JSON öncelikli

IMPORTANT: Task 1 ve Task 3'ün tamamlanmasını BEKLEMELİ. retro.ts'deki parse fix'e bağımlı. doctor.ts'deki readLanguage kaldırılmış olmalı.

---

## Task 7: Cleanup --dry-run Flag'i (P2)
- Model: opus
- Effort: medium
- Files: src/cli/commands/cleanup.ts
- Scope: src/cli/commands/, tests/cli/commands/
- Dependencies: Task 3 (cleanup.ts — readLanguage DRY)

### Description
`deckent cleanup` geri dönüşü olmayan silme yapıyor (task dosyaları, lock'lar, prompt dosyaları, tmux session). Preview mekanizması yok.

**Çözüm:**
1. `--dry-run` option ekle
2. Dry-run modda: silinecek dosyaları listele ama hiçbir şeyi SİLME
3. CLI tarafında preview yapılacak (cleanup() fonksiyonuna dokunamayız — sprint-controller.ts'de)

**İmplementasyon:**
```typescript
if (opts.dryRun) {
  // Task dosyalarını say
  const taskFiles = readdirSync(tasksDir).filter(f => f.match(/\.(json|plan|hb|result|paused|log)$/));
  // Lock dosyalarını say
  const lockFiles = existsSync(locksDir) ? readdirSync(locksDir) : [];
  // Prompt dosyalarını say
  const promptFiles = readdirSync(tasksDir).filter(f => f.startsWith('.prompt-'));

  print(`[dry-run] Would delete:`);
  print(`  ${taskFiles.length} task file(s)`);
  print(`  ${lockFiles.length} lock file(s)`);
  print(`  ${promptFiles.length} prompt file(s)`);
  print(`  tmux session: deckent-orchestra`);
  print(`\nRun without --dry-run to execute.`);
  return;
}
```

4. Dosya isimlerini de göster (verbose):
   - Task dosyaları: `task-sprint-055-001.json`, `task-sprint-055-001.plan` vs.
   - Lock dosyaları: `src__cli__commands__config_ts.lock` vs.

**DİKKAT:** Bu task cleanup.ts'ye dokunuyor. Task 3 önce tamamlanmış olmalı (readLanguage DRY).

**Test:** tests/cli/commands/cleanup-dryrun.test.ts — 6+ test:
- --dry-run dosya listesi göstermeli
- --dry-run hiçbir dosya SİLMEMELİ
- --dry-run task dosya sayısı doğru olmalı
- --dry-run lock dosya sayısı doğru olmalı
- Boş dizinlerde hata vermemeli
- --dry-run sonrası dosyalar hâlâ mevcut olmalı

IMPORTANT: Task 3'ün tamamlanmasını BEKLEMELİ. cleanup.ts'deki readLanguage kaldırılmış olmalı. Mevcut cleanup davranışına DOKUNMA.

---

## Task 8: Agent Delete + Edit Komutları (P2)
- Model: opus
- Effort: medium
- Files: src/cli/commands/agent.ts
- Scope: src/cli/commands/, .deckent/agents/, tests/cli/commands/
- Dependencies: yok

### Description
Agent CRUD'da delete ve edit eksik. Kullanıcı agent silmek için dizini elle silmek zorunda.

**A) `agent delete <name>`:**
1. Alt komut ekle: `agentCmd.command('delete <name>')`
2. Agent dizinini kontrol et: `.deckent/agents/{name}/` var mı
3. Yoksa: "Agent '{name}' not found" hata mesajı
4. Varsa: dizini recursive sil (`rmSync(dir, { recursive: true, force: true })`)
5. Başarılı mesaj: "Agent '{name}' deleted."

**B) `agent edit <name>`:**
1. Alt komut ekle: `agentCmd.command('edit <name>')`
2. `--model <model>` option: agent.json'daki model alanını güncelle
3. `--description <desc>` option: description alanını güncelle
4. `--enable` / `--disable` option: enabled alanını güncelle (mevcut enable/disable komutlarının alternatifi)
5. Agent.json'u oku → güncelle → yaz
6. Değişen alanları göster: "Updated: model=opus, description=..."
7. Hiçbir option verilmezse: mevcut agent bilgisini göster (info gibi)

**C) `agent info <name>` iyileştirmesi:**
Mevcut `list` agent bilgilerini gösteriyor ama tek agent detayı yok.
1. `agentCmd.command('info <name>')` alt komut ekle
2. Agent.json + PROMPT.md içeriğini göster
3. Stats: uses, successRate, son kullanım tarihi

**Test:** tests/cli/commands/agent-crud.test.ts — 8+ test:
- agent delete mevcut agent'ı silmeli
- agent delete sonrası dizin OLMAMALI
- agent delete olmayan agent'ta hata mesajı
- agent edit --model agent.json'u güncellemeli
- agent edit --description agent.json'u güncellemeli
- agent edit olmayan agent'ta hata
- agent info agent bilgilerini göstermeli
- agent info PROMPT.md içeriğini dahil etmeli

IMPORTANT: Mevcut `agent list`, `agent create`, `agent enable`, `agent disable` komutlarına DOKUNMA. Sadece yeni alt komutlar ekle.

---

## Task 9: Skill Enable/Disable + Delete Komutları (P2)
- Model: opus
- Effort: medium
- Files: src/cli/commands/skill.ts
- Scope: src/cli/commands/, .deckent/skills/, tests/cli/commands/
- Dependencies: yok

### Description
Agent'ta enable/disable var ama skill'de yok. Skill delete de eksik.

**A) `skill enable <name>`:**
1. Alt komut ekle
2. `.deckent/skills/{name}/manifest.json` oku
3. `enabled: true` yap, dosyayı yaz
4. "Skill '{name}' enabled."

**B) `skill disable <name>`:**
1. Alt komut ekle
2. manifest.json'da `enabled: false` yap
3. "Skill '{name}' disabled."

**C) `skill delete <name>`:**
1. Alt komut ekle
2. `.deckent/skills/{name}/` dizinini kontrol et
3. Recursive sil
4. "Skill '{name}' deleted."

**D) `skill info <name>`:**
1. Alt komut ekle
2. manifest.json detaylarını göster: id, name, version, category, enabled, triggers, priority
3. SKILL.md varsa ilk 10 satırı göster

**Test:** tests/cli/commands/skill-crud.test.ts — 8+ test:
- skill enable manifest.json enabled=true yapmalı
- skill disable manifest.json enabled=false yapmalı
- skill delete dizini silmeli
- skill delete olmayan skill'de hata
- skill info manifest bilgilerini göstermeli
- skill enable/disable olmayan skill'de hata
- Mevcut manifest alanları korunmalı (sadece enabled değişmeli)
- skill info SKILL.md snippet göstermeli

IMPORTANT: Mevcut `skill list`, `skill create`, `skill install` komutlarına DOKUNMA. Sadece yeni alt komutlar ekle. `skill-marketplace` alt komutuna DOKUNMA.

---

## Task 10: Explain --sprint Flag + Goal Bilgisi + Dil Desteği (P2)
- Model: opus
- Effort: medium
- Files: src/cli/commands/explain.ts
- Scope: src/cli/commands/, tests/cli/commands/
- Dependencies: yok

### Description
Explain komutu sadece son sprint'i gösteriyor ve goal her zaman "No goal recorded" diyor.

**A) `--sprint <id>` Flag:**
1. Option ekle: `--sprint <id>`
2. Verilmezse: mevcut davranış (son sprint)
3. Verilirse: `.brain/sprints/sprint-{id}.md` dosyasını oku
4. Dosya yoksa: "Sprint {id} not found" hata mesajı

**B) Goal Bilgisi:**
Mevcut durum: `buildExplainOutput` her zaman "No goal recorded" yazıyor.

**Çözüm:**
1. DIRECTIVES.md'den goal extraction: ilk `## Goal:` satırını al
2. Sprint log'dan goal extraction: `# Sprint sprint-NNN` sonrası ilk satır
3. Fallback chain: DIRECTIVES.md goal → sprint log goal → "No goal recorded"

**C) `--json` Flag:**
1. Option ekle
2. JSON formatında çıktı (sprintId, goal, metrics, learnings)

**D) Dil Desteği:**
1. `getLangFromConfig(root)` ile dil al (Task 3'te oluşturulan helper)
2. Türkçe çıktı desteği (veya en azından getMessage() kullanımı)
3. "What happened" → "Ne oldu", "Key learnings" → "Temel öğrenmeler" vs.

**Test:** tests/cli/commands/explain-enhanced.test.ts — 8+ test:
- --sprint belirli sprint'i göstermeli
- --sprint olmayan ID'de hata mesajı
- Default: son sprint
- Goal DIRECTIVES.md'den gelmeli ("No goal recorded" DEĞİL)
- Goal yoksa fallback mesaj
- --json geçerli JSON dönmeli
- Boş sprint log'da graceful handling
- Dil desteği: Türkçe config'te Türkçe çıktı

IMPORTANT: Mevcut explain davranışını BOZMA. --sprint ve --json sadece ek özellikler. parseSprintLog fonksiyonuna DOKUNMA (gelecek sprint'te DRY temizliği yapılacak).

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression (10,500+ test geçmeli)
- Her task test VE implementasyon birlikte yazmalı — sadece test yazmak KABUL EDİLMEZ
- Task 1 ve 2 P0 öncelikli — bunlar bitmeden diğer task'lara geçİLMEMELİ
- Task 3 bitmeden Task 6 ve Task 7'ye başlanmamalı (aynı dosya zinciri)
- Tüm task'lar %100 GO hedefli — GO_WITH_TECH_DEBT kabul edilebilir ama NO_GO KABUL EDİLMEZ

## Bağımlılık Grafiği
```
Task 1 (retro P0) ──────────┐
Task 2 (kill P0)             │
Task 3 (DRY) ───────────┐   ├──→ Task 6 (doctor+retro --json)
Task 4 (config)          ├──→ Task 7 (cleanup --dry-run)
Task 5 (spawn)           │
Task 8 (agent CRUD)      │
Task 9 (skill CRUD)      │
Task 10 (explain)        │
```

Task 1-5, 8-10: paralel çalışabilir
Task 6: Task 1 + Task 3'e bağımlı
Task 7: Task 3'e bağımlı
