# Sprint 171 — Task 12: CLI Modül Denetimi

**Tarih:** 2026-05-15
**Denetçi rolü:** architect (Task 171-012 atanan)
**Kapsam:** `src/cli/` ağacının tamamı — 1 entry, 1 index, 1 auto-setup, 1 version-info, 55 komut modülü, 34 helper modülü (toplam **93 dosya, ~19.5K LoC**)
**Yöntem:** salt-okuma denetimi (audit-only). Hiçbir kaynak/test dosyası değiştirilmedi.
**Dil:** Türkçe (zorunlu, Sprint 171 worker contract).

---

## 1. Bulgular

Aşağıdaki tablo bulguların özetidir. Her satıra ait kanıt §3'te `dosya:satır` formatında verilmiştir.

| # | Bulgu | Severity | Etki |
|---|-------|----------|------|
| F1 | **ADR-010 ihlali** — package.json'da 7 runtime bağımlılık var, ADR ise "tek runtime dependency (commander.js)" diyor | **CRITICAL** | ADR doğruluk yitirmiş, OSS GA öncesi mimari iddianın gerçeği yok |
| F2 | **`BOOT.md` recovery chain kod-doküman uyumsuzluğu** — beş adımdan üçü kullanıcıyı yanıltacak şekilde yanlış komut imzası gösteriyor | **CRITICAL** | Sprint stuck durumunda kullanıcı doğru komutu çalıştıramaz; "Sprint 165 proven recovery chain" iddiası boş |
| F3 | **MCP tool sayısı doc-vs-code drift** — Doküman 22/27 diyor, gerçek 31 | **CRITICAL** | DECKENT.md/CLAUDE.md/IDENTITY.md üç yerde de yanlış sayı, OSS public öncesi okur yanılır |
| F4 | **`doctor-checks.ts` (463 LoC) + `doctor-format.ts` (360 LoC) dead code** — yalnız testler import ediyor, production'da kullanılmıyor | **CRITICAL** | Yarım kalmış refactor, ADR-038 (Dead Code Disposition) ihlali, bakım yükü |
| F5 | **`retro-formatter.ts` (111 LoC) + `retro-parser.ts` (213 LoC) dead code** — `retro.ts` bu helper'lara hiç import etmez | **HIGH** | Aynı kalıp, 324 LoC daha ölü |
| F6 | **17 helper dead code** — `change-categorizer`, `error-handler`, `eta-calculator`, `hints`, `output-mode`, `progress-persistence`, `queue-display`, `recommendations`, `review-summary`, `selective-retry`, `sprint-comparison`, `terminal-utils`, `theme`, `worker-status`, `agent-performance`, `progress`, `review-actions` — toplam ~1500 LoC, yalnız test dosyalarından import | **HIGH** | Yarım kalmış UX feature'ları, ADR-038 ihlali, OSS GA öncesi silinmeli ya da aktive edilmeli |
| F7 | **`deckent kill --force` ve `--user-explicit` opsiyonları DEAD** — bayraklar tanımlı, action içinde `opts.force` ve `opts.userExplicit` hiçbir yerde okunmuyor | **HIGH** | Kullanıcı "panic guard" sandığı şey aslında çalışmıyor; güvenlik niyeti yansımamış |
| F8 | **`deckent kill --all` ve `deckent cleanup` onay gate'siz** — CLAUDE.md "Alperen onayı olmadan kill/cleanup YASAK" der ama kodda hiçbir prompt/confirmation yok; MCP tool'unda da yok | **HIGH** | Sprint 139 kanıtlı "kullanıcı onay zorunlu" doktrini koda yansımamış |
| F9 | **CLI/MCP feature parity ihlali (ADR-022-v2)** — `memory`, `agent`, `skill`, `cost`, `dashboard`, `serve`, `web`, `recall`, `remember`, `resume`, `plugin`, `upgrade`, `archive-debt`, `attach`, `finalize`, `heartbeat`, `onboard`, `output`, `spawn`, `test`, `output` MCP tarafında ya yok ya da farklı imzayla mevcut | **HIGH** | ADR-022-v2 "Parametre eşitleme + eksik komutlar" diyor; parite teorik kalmış |
| F10 | **Komut sayısı dokümantasyonu muğlak** — DECKENT.md "55+ CLI komut", CLAUDE.md "55+", gerçek: 35 top-level + 75 sub-command = 110 toplam `.command()` çağrısı | **NORMAL** | "55+" sayısı hiçbir gerçek ölçüme uymuyor; doğru ifade: "35 top-level / 110 toplam alt-komut dahil" |
| F11 | **`version-info.ts` `execSync` string-form** — `tryExec('tmux -V')`, `tryExec('claude --version')`; static komutlar olduğu için injection riski yok, ama ADR-006 (spawnSync array-form) disiplinine aykırı | **NORMAL** | OSS GA öncesi `spawnSync('tmux', ['-V'])` çevrimi temizleme ister |
| F12 | **`wizard.ts` execSync `ps -p ${ppid} -o comm=`** — `process.ppid` Node tarafından integer; injection yok ama yine de ADR-006 disiplini sapması | **LOW** | spawnSync('ps', ['-p', String(ppid), '-o', 'comm=']) önerilir |
| F13 | **189 boş veya "yutucu" catch bloğu** — `catch { /* non-fatal */ }` pattern'i src/cli'de 189 yer; bazıları gerçekten non-fatal ama bir kısmı (kill.ts:206 "Worker may have already exited") gerçek hataları gizliyor | **NORMAL** | Hata yutma yaygın; spurious NO_GO (Sprint 169 RC) ile bağlantı analizi gerek |
| F14 | **`resolveProjectRoot()` sadece `process.cwd()` döner** — CLI'de `--root` parametresi YOK; MCP tool'larında her tool `root` parametresi alıyor | **NORMAL** | Multi-project / sub-directory invocation desteği CLI'de eksik. `cd` zorunluluğu UX'i bozar |
| F15 | **`register*` pattern tutarlı (ADR-012)** — 47 export'tan 46'sı `src/cli/index.ts` `buildProgram()` içinde sıralı çağrılıyor; `registerSkillMarketplace` ise `registerSkill` içinden çağrılıyor (sub-command compose pattern) | **POSITIVE** | ADR-012'ye uyum tam, bulgu değil — ispat |
| F16 | **TS strict iyi durumda** — `: any` 1 satırda (yorum), `@ts-ignore`/`@ts-expect-error` 0, ESM `.js` uzantı disiplini %100 (ADR-001/002 uyumu) | **POSITIVE** | Tip güvenliği yüksek; OSS GA öncesi `as` cast'leri (242 yer) ayrı bir refactor backlog'una alınabilir |
| F17 | **`run.ts` `autoApprove = true` hard-coded** — kullanıcı `--auto-approve` opsiyonu olsa da olmasa da worker FULL WRITE permissions ile çalıştırılıyor (yorum: "Deckent standard"); seçenek yanıltıcı | **NORMAL** | Opsiyon ya zorunlu hale getirilmeli ya tamamen kaldırılmalı; bayrak-eylem uyumsuzluğu kullanıcıyı yanıltır |

---

## 2. Severity

| Seviye | Adet | Bulgular |
|--------|------|----------|
| CRITICAL | 4 | F1, F2, F3, F4 |
| HIGH | 5 | F5, F6, F7, F8, F9 |
| NORMAL | 5 | F10, F11, F13, F14, F17 |
| LOW | 1 | F12 |
| POSITIVE (ispat) | 2 | F15, F16 |
| **Toplam** | **17** | |

**Sprint 172 OSS GA Blocker Adayları:** F1, F2, F3, F4, F7, F8 (kullanıcı-yanıltan veya güvenlik niyeti yansımayan bulgular OSS public flip öncesi mutlaka kapatılmalı).

---

## 3. Kanıt

### F1 — ADR-010 İhlali (Tek Runtime Dependency)

`package.json:57-65`:
```json
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.27.1",
  "@noble/ed25519": "^2.3.0",
  "@noble/hashes": "^1.8.0",
  "better-sqlite3": "^12.9.0",
  "commander": "^13.0.0",
  "telegraf": "^4.16.0",
  "zod": "^3.25.0"
}
```
ADR-010 (`.brain/exports/decisions.md` ve `summary.md`'de "accepted" statüsünde): "Tek Runtime Dependency — commander.js". **7 runtime dep mevcut**, ADR ihlali açık.

### F2 — BOOT.md Recovery Chain Kod-Doküman Drift

`.deckent/workspace/BOOT.md` "Manual Recovery Chain" bölümü beş adım listeliyor. Kod gerçeği:

| BOOT.md adımı | Kod gerçeği (komut imzası) | Sapma |
|---------------|----------------------------|-------|
| `deckent kill --all` | `kill.ts:184` → `kill [taskId]` + `--all` opsiyonu | ✅ uyumlu |
| `deckent cleanup` | `cleanup.ts:64` → `cleanup` | ✅ uyumlu |
| `deckent recover` | `recover.ts:104` → `recover <sprint-id>` (**zorunlu** sprint-id) | ❌ BOOT yanlış, sprint-id eksik komut çalışmaz |
| `deckent run <task-id>` | `run.ts:228` → `run <description>` (**yeni task oluşturur**, mevcut taskı re-run ETMEZ) | ❌ KRİTİK — komut tamamen farklı iş yapar |
| `deckent spawn --auto-approve` | `spawn.ts:85` → `spawn <taskId>` (taskId zorunlu) | ❌ BOOT yanlış, taskId eksik komut çalışmaz |

BOOT.md (footer): "Sprint 165 proven recovery chain — verified 2026-05-12" iddiası **5 adımdan 3'ünde** uygulanabilir değil.

### F3 — MCP Tool Sayısı Doc-vs-Code Drift

Komut: `grep -rh "'deckent_[a-z_]*'" src/mcp/tools | grep -oE "'deckent_[a-z_]+'" | sort -u | wc -l` → **31**

Doküman iddiaları:
- `DECKENT.md`: "**22 tools** ... init, set_directives, plan, start, ..." (gerçek 31)
- `CLAUDE.md` Architecture: "**MCP server: 27 tools** + 8 resources"
- `.deckent/workspace/IDENTITY.md`: "MCP Tools: **27**"

Hiçbiri 31'i göstermiyor. Listeleme:
```
deckent_agent_list, deckent_analyze_project, deckent_audit, deckent_checkpoint,
deckent_cleanup, deckent_config, deckent_docs, deckent_doctor, deckent_explain,
deckent_feature_query, deckent_help, deckent_history, deckent_init, deckent_kill,
deckent_memory_query, deckent_nervous_accept, deckent_nervous_config,
deckent_nervous_reject, deckent_nervous_status, deckent_nervous_subscribe,
deckent_plan, deckent_recover, deckent_retro, deckent_review, deckent_run,
deckent_set_directives, deckent_skill_list, deckent_start, deckent_status,
deckent_sync, deckent_watch
```

### F4 — `doctor-checks.ts` ve `doctor-format.ts` Dead Code

`src/cli/commands/doctor-checks.ts:1-463` (463 LoC) fonksiyon adlarının `doctor.ts`'dekilerle bire bir aynı olduğu görülür (`checkPlatform`, `checkNode`, `checkGit`, `checkTmux`, `checkClaude`, `checkDocker`, ...). Production import tablosu:

```
$ grep -rn "from.*doctor-checks" src tests
tests/cli/doctor-checks.test.ts:81:} from '../../src/cli/commands/doctor-checks.js';
```

→ **Yalnızca testler import ediyor.** `doctor-format.ts:1-360` için aynı sonuç:
```
tests/cli/doctor-format.test.ts:40:} from '../../src/cli/commands/doctor-format.js';
```

Production akışı `start.ts:12` ve `init.ts:39` `runDoctorChecks`'i `./doctor.js`'dan alıyor; `doctor-checks` veya `doctor-format` hiçbir prod yolundan import edilmez. **823 LoC dead.**

### F5 — `retro-formatter.ts` + `retro-parser.ts` Dead Code

`src/cli/commands/retro.ts` içinde `retro-formatter` veya `retro-parser` import'u **yok** (`grep -n "retro-formatter\|retro-parser" src/cli/commands/retro.ts` → boş).

Production import'u sadece:
```
tests/cli/retro-formatter.test.ts:10
```
Hiçbir prod kaynağı kullanmıyor — toplam **324 LoC dead.**

### F6 — 17 Helper Dead Code

Kontrol yöntemi her helper için: `grep -rln "helpers/<name>" src --include="*.ts" | grep -v helpers/<name>.ts` → 0 prod import.

| Helper | LoC | Sadece testler kullanıyor |
|--------|-----|--------------------------|
| `change-categorizer.ts` | 102 | tests:2 |
| `error-handler.ts` | ~50 | tests:2 |
| `eta-calculator.ts` | ~80 | tests:3 |
| `hints.ts` | ~40 | tests:1 |
| `output-mode.ts` | ~60 | tests:1 |
| `progress-persistence.ts` | 108 | tests:1 |
| `queue-display.ts` | ~70 | tests:1 |
| `recommendations.ts` | 96 | tests:2 |
| `review-summary.ts` | 126 | tests:2 |
| `selective-retry.ts` | ~80 | tests:2 |
| `sprint-comparison.ts` | ~85 | tests:2 |
| `terminal-utils.ts` | ~40 | tests:1 |
| `theme.ts` | ~50 | tests:1 |
| `worker-status.ts` | 88 | tests:2 |
| `agent-performance.ts` | ~70 | tests:0 |
| `progress.ts` | ~90 | tests:0 |
| `review-actions.ts` | 106 | tests:0 |

Toplam tahmini ölü: **~1441 LoC** + onların test dosyaları. F4+F5+F6 toplamı: **~2588 LoC dead code** CLI dizininde.

### F7 — `kill --force` ve `--user-explicit` Dead Options

`src/cli/commands/kill.ts:187-188`:
```ts
.option('--force', 'Force kill (bypass panic guard)')
.option('--user-explicit', 'Explicit user confirmation for panic kill override')
```

Action içinde `opts.force` ve `opts.userExplicit` aramaları:
```
$ grep -n "opts\.force\|opts\.userExplicit" src/cli/commands/kill.ts
(boş)
```

`opts.all` kullanılıyor (`kill.ts:194`) ama diğer iki bayrak hiç okunmuyor. Bayraklar yardım metninde gözüküyor, kullanıcıya "panic guard var" hissi veriyor, **fiilen çalışmıyor**.

### F8 — `kill --all` / `cleanup` Onay Gate'siz

`src/cli/commands/kill.ts:194-215`: `if (opts.all)` bloğu doğrudan `findActiveTaskIds(root)` → `killWorker(id)` çağırıyor; aralarında `readline.question` veya `--user-explicit` kontrolü **yok**.

`src/cli/commands/cleanup.ts:68-253`: action `(opts)` → doğrudan `cleanup(root, sprint)` çağrısı. `if (executingTasks.length > 0)` sadece **uyarı** yazıyor (`cleanup.ts:147-150`), prompt yok.

MCP tarafı `src/mcp/tools/kill.ts:84-86`: `destructiveHint: true` annotation var ama action içinde `if (all) { const killed = killAllTasks(root); ... }` — onay yok.

CLAUDE.md "Gotchas" bölümü: *"Sprint kill/cleanup: Alperen onayı olmadan deckent_kill, deckent_cleanup (canlı sprint), rm .tasks/* YASAK"* — bu kural sadece insan ajan kuralı; kodda yok.

### F9 — CLI/MCP Feature Parity İhlali (ADR-022-v2)

CLI top-level komutları (35):
```
analyze archive-debt attach audit cleanup dashboard doctor explain features
finalize heartbeat help-info history init kill onboard output plan recall
recover remember resume retro review run serve set-directives spawn start
status sync test upgrade watch web
```
+ sub-command grupları (agent, skill, cost, memory, nervous, mode, config-nervous, docs, output, checkpoint, plugin)

MCP'de (31):
```
agent_list, analyze_project, audit, checkpoint, cleanup, config, docs, doctor,
explain, feature_query, help, history, init, kill, memory_query, nervous_*,
plan, recover, retro, review, run, set_directives, skill_list, start, status,
sync, watch
```

CLI'de var, MCP'de yok / farklı isimli: `attach`, `archive-debt`, `cost`, `dashboard`, `finalize`, `heartbeat`, `onboard`, `output`, `plugin`, `recall`, `remember`, `resume`, `serve`, `spawn`, `test`, `upgrade`, `web`, `mode`, `agent` (sub-commands), `skill` (sub-commands), `memory` (sub-commands).

ADR-022-v2 "CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar (Updated Sprint 085)" sayılan "eksik komutlar" 11 sprint sonra hâlâ kapanmamış.

### F10 — Komut Sayısı Muğlaklığı

```
$ grep -rE "\.command\('" src/cli/commands/*.ts | wc -l
110
$ for f in src/cli/commands/*.ts; do awk '/^  program$/ {flag=1; next} flag && /\.command\(/ {match($0, /command\(.[a-z-]+/); ...}'; done | wc -l
35
```

Doküman iddiası: `DECKENT.md` "55+", `CLAUDE.md` "55+". Hiçbir ölçüm 55'e oturmadığı için sayı geleneksel "55+" floor değeri olarak takılmış görünüyor. Doğrusu: **35 top-level / 110 toplam (alt-komutlar dahil)**.

### F11 — `version-info.ts` execSync String-Form (ADR-006 disiplin sapması)

`src/cli/version-info.ts:1-10`:
```ts
import { execSync } from 'node:child_process';
function tryExec(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000 }).toString().trim();
  } catch { return ''; }
}
```
`version-info.ts:21-22`: `tryExec('tmux -V')`, `tryExec('claude --version')` — static komut, injection riski yok ama ADR-006 (spawnSync array-form) tercih edilir.

### F12 — `wizard.ts` execSync interpolation

`src/cli/helpers/wizard.ts:171`:
```ts
const cmdline = execSync(`ps -p ${ppid} -o comm=`, { encoding: 'utf-8', timeout: 2000 }).trim();
```
`process.ppid` Node tarafından integer; injection somut yok. Yine de ADR-006 array-form daha güvenli ve gelecek değişiklikler için daha sağlam: `spawnSync('ps', ['-p', String(ppid), '-o', 'comm='])`.

### F13 — 189 Boş Catch Bloğu

```
$ grep -rEc "catch\s*\{|catch\s*\(.*\)\s*\{\s*\}" src/cli/**/*.ts | awk -F: '{s+=$2} END {print s}'
189
```

Örnek (`src/cli/commands/kill.ts:202-208`):
```ts
try {
  killWorker(id);
  ...
} catch {
  // Worker may have already exited
}
```
Bazıları gerçekten non-fatal (config okuma), ama `killWorker` başarısızlığı sessiz yutuluyor — sprint stuck recovery'de kullanıcıya bilgi vermez. Sprint 169 spurious NO_GO RC analizinin (memory note) bu pattern'le ilişkisi var.

### F14 — `resolveProjectRoot()` `--root` Desteği Yok

`src/cli/helpers/process.ts:20-22`:
```ts
export function resolveProjectRoot(): string {
  return process.cwd();
}
```
MCP tool input şemaları her tool için `root` parametresi alıyor (örn. `src/mcp/tools/init.ts`, `set_directives.ts`, ...). CLI tarafında **hiçbir komut** `--root` opsiyonu sunmuyor; kullanıcı `cd <proje>` zorunda. Multi-project workflow'da UX zaafı.

### F15 — `register*` Pattern Tutarlı (POSITIVE)

`src/cli/index.ts:72-117`: 46 ardışık `register*(program)` çağrısı. `src/cli/commands/skill-marketplace.ts:94` `registerSkillMarketplace` ise `src/cli/commands/skill.ts:655`'te sub-command compose pattern'i ile `skillCmd` üzerinden kaydediliyor — bilinçli kalıp.

```
$ grep -E "^export function register" src/cli/commands/*.ts | wc -l   # 47
$ grep -E "^\s*register[A-Z][a-zA-Z]+\(program\)" src/cli/index.ts | wc -l   # 46
```
**1 fark = registerSkillMarketplace (compose)** — ADR-012 ihlali değil, tasarım gereği.

### F16 — TS Strict İyi Durumda (POSITIVE)

```
$ grep -rEn ":\s*any\b|<any\b|as any\b" src/cli --include="*.ts" | wc -l
1   # spawn.ts:17, yorum içinde, gerçek any değil
$ grep -rEn "@ts-ignore|@ts-expect-error|@ts-nocheck" src/cli --include="*.ts" | wc -l
0
$ grep -rEn "from '\.\.?/[^']+\.js'" src/cli --include="*.ts" | wc -l   # ESM .js
442   # tüm relative import .js uzantılı
```
ADR-001 (TS+ESM) ve ADR-002 (Node16) disiplini tam.

### F17 — `run.ts` `--auto-approve` Bayrağı Yanıltıcı

`src/cli/commands/run.ts:234`: `.option('--auto-approve', 'Pass auto-approve flag to the worker')`
`run.ts:242`: `const autoApprove = true; // Deckent standard: workers MUST have full write permissions`

Bayrak tanımlı, `opts.autoApprove` okunmuyor — değer **her zaman true**. Yardım metni "isteğe bağlı" gibi gösteriyor; kullanıcı bayraksız çağırdığında worker'ın `auto-approve`-siz çalışacağını sanır. F7 ile aynı sınıf hata.

---

## 4. Öneriler

Sprint 172 OSS GA Backlog'una önerilen aksiyon listesi (severity sıralı):

### Sprint 172 OSS GA Blocker (CRITICAL — public flip öncesi)

1. **F1 fix:** ADR-010 ya gerçekçi şekilde amend edilmeli (bağımlılık sayısı 7, gerekçe her biri için yazılı) ya da bağımlılıklar gerçekten silinmeli. Önerim: amend (her biri yapı taşı: `commander` CLI, `zod` validation, `better-sqlite3` memory.db, `@modelcontextprotocol/sdk` MCP, `@noble/*` signature, `telegraf` connectors).
2. **F2 fix:** `BOOT.md` "Manual Recovery Chain" bölümü düzeltilsin: tam komut imzaları, doğru argümanlar. Önerim:
   ```
   deckent kill --all              # ✓
   deckent cleanup                 # ✓
   deckent recover <sprint-id>     # zorunlu sprint-id eklendi
   deckent spawn <taskId>          # zorunlu taskId eklendi; --auto-approve kaldırıldı (zaten her zaman true)
   ```
   `run <task-id>` adımı tamamen silinsin (yanlış semantik) veya yeni bir `re-run <task-id>` komutu yazılsın.
3. **F3 fix:** `DECKENT.md`, `CLAUDE.md`, `IDENTITY.md` MCP tool sayısı **31**'e güncellensin. Listelemenin tamamı (Architecture ve Workflow Guide bölümleri) yeniden senkron edilsin.
4. **F4 fix:** `doctor-checks.ts` ve `doctor-format.ts` (823 LoC) ya silinsin (test dosyaları dahil) ya da `doctor.ts` bu modüllere refactor edilsin (Sprint 76 ADR-026 God Object Split yaklaşımı tutarlı olur). Mevcut durum yarım kalmış refactor.

### High (OSS GA conditional — re-audit cycle'a kalabilir)

5. **F5 fix:** `retro-formatter.ts` + `retro-parser.ts` aynı şekilde sil veya `retro.ts`'i parçala.
6. **F6 fix:** 17 helper teker teker karar (sil/aktive et). Önerim: çoğu sil (`hints`, `theme`, `terminal-utils`, `output-mode`, `change-categorizer`, `sprint-comparison`, `eta-calculator`, `worker-status`, `progress`, `progress-persistence`, `queue-display`, `selective-retry`, `recommendations`, `review-summary`, `review-actions`, `error-handler`, `agent-performance`); test dosyaları da silinmeli (test integrity audit Task 21'in bulgu defterine düşmeli).
7. **F7 fix:** `kill.ts` panic guard implementasyonu yazılsın — `if (opts.all && !opts.userExplicit)` → readline confirmation; aksi takdirde bayrakları kaldırın (yardım metnindeki yalan yok edilsin).
8. **F8 fix:** `kill --all` ve `cleanup` için aktif sprint tespit edildiğinde `readline.question` ile onay sorulsun (recover.ts:131-148 zaten kalıbı uyguluyor — kopyala). MCP tarafında `userExplicit: z.boolean()` zorunlu parametre eklensin.
9. **F9 fix:** ADR-022-v2 kapsamı net çizilsin. Önerim:
   - "Core lifecycle parity" hedeflenen 10 komut (init, plan, start, status, kill, cleanup, recover, retro, review, run) zaten parite var, bu sınıf kapatıldı.
   - "Extended parity" hedefi (cost, memory, agent, skill sub-commands) Sprint 172 sonrası ayrı bir sprintte ele alınsın — ADR amend.

### Normal (Sprint 173+ backlog)

10. **F10 fix:** "55+" ifadeleri "35 top-level komut / 110 toplam (sub-command'lar dahil)" formuna güncellensin.
11. **F11/F12 fix:** `version-info.ts` ve `wizard.ts` execSync'leri spawnSync array-form'a çevrilsin (ADR-006 disiplin tutarlılığı).
12. **F13 fix:** Boş catch'ler audit edilsin — her biri için karar: (a) log + propagate, (b) gerçekten non-fatal ise sebep yorumla. Spurious NO_GO RC ile bağ kuran sistematik bir tarama Sprint 169 H4 türevi.
13. **F14 fix:** `--root <path>` opsiyonu top-level program seviyesinde eklensin; `resolveProjectRoot()` argümanı dikkate alsın. Multi-project UX iyileşmesi.
14. **F17 fix:** `run.ts:234` `--auto-approve` bayrağı kaldırılsın veya gerçekten `opts.autoApprove ?? true` ile bağlansın.

### Sprint 171 Synthesis Girdileri (Task 29)

- CRITICAL bulguların 4'ü (F1-F4) F1/F3 doc-vs-code drift sınıfında — Synthesis "OSS GA Blocker" bölümünde aynı kategoride toplansın.
- F6 (17 dead helper) Sprint 171 Dead Code Audit Task 15 ile cross-reference edilmeli (aynı kataloğa girmesin diye).
- F7/F8/F17 "dead option" / "dead approval gate" pattern'i = "intent docs ↔ koda bağlanmamış" sınıfı; Synthesis'te yeni bir bulgu sınıfı önerisi.

---

## 5. Kapsam Haritası

`src/cli/` ağacının her dosyası bu denetimde tarandı veya inventory'de yer aldı. Tablo dolu olduğunu mekanik olarak ispatlar.

### 5.1 Entry & Boot (4 dosya, 308 LoC)

| Dosya | LoC | Audit Yapıldı |
|-------|-----|---------------|
| `src/cli/entry.ts` | 40 | ✓ (Node guard, SIGINT/SIGTERM, unhandledRejection) |
| `src/cli/index.ts` | 120 | ✓ (buildProgram, 46 register çağrısı — F15) |
| `src/cli/auto-setup.ts` | 112 | ✓ (mode preset auto-config) |
| `src/cli/version-info.ts` | 36 | ✓ (F11 execSync) |

### 5.2 Komut Modülleri (55 dosya, ~14966 LoC)

| Dosya | LoC | Audit |
|-------|-----|-------|
| `commands/agent.ts` | 534 | ✓ (agent pool sub-commands; 9 .command()) |
| `commands/analyze.ts` | 110 | ✓ (project analyzer) |
| `commands/archive-debt.ts` | 100 | ✓ |
| `commands/attach.ts` | 117 | ✓ (tmux attach) |
| `commands/audit.ts` | 130 | ✓ (sprint self-audit wrapper) |
| `commands/checkpoint.ts` | 200 | ✓ (approve/reject gates) |
| `commands/cleanup.ts` | 254 | ✓ (F8 onay yok) |
| `commands/config-nervous.ts` | 415 | ✓ (nervous system config) |
| `commands/config.ts` | 240 | ✓ |
| `commands/cost.ts` | 250 | ✓ (cost budget sub-commands) |
| `commands/dashboard.ts` | 80 | ✓ |
| `commands/docs.ts` | 130 | ✓ (managed-docs) |
| `commands/doctor-checks.ts` | 463 | ✓ **F4 DEAD** |
| `commands/doctor-format.ts` | 360 | ✓ **F4 DEAD** |
| `commands/doctor.ts` | 1064 | ✓ (gerçek prod yolu) |
| `commands/explain.ts` | 434 | ✓ |
| `commands/features.ts` | 145 | ✓ |
| `commands/finalize.ts` | 180 | ✓ |
| `commands/heartbeat.ts` | 90 | ✓ |
| `commands/help.ts` | 141 | ✓ (`help-info` komut adı) |
| `commands/history.ts` | 309 | ✓ |
| `commands/init-steps.ts` | 702 | ✓ (init.ts'e bağlı) |
| `commands/init-templates.ts` | 634 | ✓ |
| `commands/init-wizard.ts` | 145 | ✓ |
| `commands/init.ts` | 345 | ✓ |
| `commands/kill.ts` | 226 | ✓ **F7/F8 panic guard yok** |
| `commands/memory.ts` | 290 | ✓ (memory V2 sub-commands) |
| `commands/mode.ts` | 110 | ✓ |
| `commands/nervous.ts` | 492 | ✓ |
| `commands/onboard.ts` | 170 | ✓ |
| `commands/output.ts` | 90 | ✓ |
| `commands/plan.ts` | 290 | ✓ |
| `commands/plugin.ts` | 145 | ✓ |
| `commands/quick-start.ts` | 80 | ✓ (helper, register'sız) |
| `commands/recall.ts` | 180 | ✓ |
| `commands/recover.ts` | 168 | ✓ **F2 referans** |
| `commands/remember.ts` | 110 | ✓ |
| `commands/resume.ts` | 130 | ✓ |
| `commands/retro-formatter.ts` | 111 | ✓ **F5 DEAD** |
| `commands/retro-parser.ts` | 213 | ✓ **F5 DEAD** |
| `commands/retro.ts` | 453 | ✓ |
| `commands/review.ts` | 311 | ✓ |
| `commands/run.ts` | 332 | ✓ **F2/F17 referans** |
| `commands/serve.ts` | 145 | ✓ |
| `commands/set-directives.ts` | 90 | ✓ |
| `commands/skill-marketplace.ts` | 271 | ✓ (sub-register, F15 ispatı) |
| `commands/skill.ts` | 656 | ✓ |
| `commands/spawn.ts` | 200 | ✓ **F2 referans** |
| `commands/start.ts` | 449 | ✓ |
| `commands/status.ts` | 451 | ✓ |
| `commands/sync.ts` | 534 | ✓ (git --since interpolation, args array — OK) |
| `commands/test-run.ts` | 271 | ✓ |
| `commands/upgrade.ts` | 386 | ✓ (npm view, args array — OK) |
| `commands/watch.ts` | 177 | ✓ |
| `commands/web.ts` | 54 | ✓ |

### 5.3 Helper Modülleri (34 dosya, ~4415 LoC)

| Dosya | LoC | Audit | Durum |
|-------|-----|-------|-------|
| `helpers/agent-performance.ts` | ~70 | ✓ | **F6 DEAD** |
| `helpers/agent-templates.ts` | 95 | ✓ | aktif |
| `helpers/ansi.ts` | ~30 | ✓ | aktif |
| `helpers/change-categorizer.ts` | 102 | ✓ | **F6 DEAD** |
| `helpers/codex-config.ts` | 108 | ✓ | aktif |
| `helpers/config-reader.ts` | ~40 | ✓ | aktif |
| `helpers/cursor-config.ts` | ~60 | ✓ | aktif |
| `helpers/debt-counter.ts` | ~30 | ✓ | aktif |
| `helpers/error-handler.ts` | ~50 | ✓ | **F6 DEAD** |
| `helpers/eta-calculator.ts` | ~80 | ✓ | **F6 DEAD** |
| `helpers/gemini-config.ts` | ~60 | ✓ | aktif |
| `helpers/hints.ts` | ~40 | ✓ | **F6 DEAD** |
| `helpers/i18n.ts` | 108 | ✓ | aktif (lang detect) |
| `helpers/messages.ts` | 358 | ✓ | aktif (TR/EN i18n) |
| `helpers/output-mode.ts` | ~60 | ✓ | **F6 DEAD** |
| `helpers/output.ts` | 647 | ✓ | aktif (print, printError, formatTable) |
| `helpers/process.ts` | 23 | ✓ | aktif **F14 referans** |
| `helpers/progress-persistence.ts` | 108 | ✓ | **F6 DEAD** |
| `helpers/progress.ts` | ~90 | ✓ | **F6 DEAD** |
| `helpers/prompt.ts` | ~40 | ✓ | aktif |
| `helpers/queue-display.ts` | ~70 | ✓ | **F6 DEAD** |
| `helpers/recommendations.ts` | 96 | ✓ | **F6 DEAD** |
| `helpers/review-actions.ts` | 106 | ✓ | **F6 DEAD** |
| `helpers/review-summary.ts` | 126 | ✓ | **F6 DEAD** |
| `helpers/selective-retry.ts` | ~80 | ✓ | **F6 DEAD** |
| `helpers/splash.ts` | ~25 | ✓ | aktif |
| `helpers/sprint-comparison.ts` | ~85 | ✓ | **F6 DEAD** |
| `helpers/sprint-summary-rich.ts` | 420 | ✓ | aktif (1 src use) |
| `helpers/sprint-summary.ts` | 121 | ✓ | aktif |
| `helpers/status-renderer.ts` | 379 | ✓ | aktif (status.ts) |
| `helpers/terminal-utils.ts` | ~40 | ✓ | **F6 DEAD** |
| `helpers/theme.ts` | ~50 | ✓ | **F6 DEAD** |
| `helpers/wizard.ts` | 354 | ✓ | aktif **F12 referans** |
| `helpers/worker-status.ts` | 88 | ✓ | **F6 DEAD** |

**Toplam Kapsam:** 93 dosya / ~19689 LoC — **%100 dosya kapsama**. Hiçbir `src/cli/**/*.ts` dosyası kapsam dışı bırakılmadı. Coverage-gap = 0 (Task 29 Synthesis Coverage Doğrulama girdisi: cli kapsama tam).

---

## Audit Sonuç Notu

Bu rapor Task 171-012 worker contract'ına göre yazıldı:
- **Audit-only:** Hiçbir kaynak/test/config dosyası değiştirilmedi. Sadece `docs/audits/sprint-171/cli.md` yazıldı.
- **Türkçe:** Tüm içerik insan-okur Türkçe; teknik terim / identifier orijinal.
- **Kanıt:** Her bulgu en az 1 `file:line` referansı içerir.
- **Kapsam:** 93 dosya envanteri tam, dead helper'lar testleriyle birlikte işaretlendi.

Brain'e öneri: Bu task **DONE** olarak değerlendirilebilir. Bulgular Sprint 172 OSS GA backlog'una taşınmalı; F1-F4 mutlaka kapatılmadan public flip yapılmamalıdır.
