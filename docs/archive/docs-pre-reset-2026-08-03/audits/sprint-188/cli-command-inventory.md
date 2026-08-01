# W1-T01 — CLI Komut Envanteri ve Bütünlük Denetimi

**Sprint:** 188  
**Tarih:** 2026-05-22  
**Denetçi:** Worker w-188-001 (doc-writer agent)  
**Kapsam:** `src/cli/commands/`, `src/cli/index.ts`, `src/cli/entry.ts`  
**Mod:** ANALYSIS-ONLY — kaynak kod değiştirilmedi

---

## 1. Dizin Yapısı ve Dosya Envanteri

`src/cli/commands/` dizininde toplam **57 dosya/klasör** bulunmaktadır. Bunların sınıflandırması:

### 1a. Komut Kayıt Dosyaları (48 adet — `export function register*` içerenler)

| Dosya | Fonksiyon | Satır | Üst-Düzey Komut |
|-------|-----------|-------|-----------------|
| agent.ts | registerAgent | 215 | `agent` |
| analyze.ts | registerAnalyze | 25 | `analyze` |
| archive-debt.ts | registerArchiveDebt | 15 | `archive-debt` |
| attach.ts | registerAttach | 25 | `attach` |
| audit-verify.ts | registerAuditVerify | 21 | `audit-verify` |
| audit.ts | registerAudit | 8 | `audit` |
| checkpoint.ts | registerCheckpoint | 64 | `checkpoint` |
| cleanup.ts | registerCleanup | 62 | `cleanup` |
| config-nervous.ts | registerConfigNervous | 357 | *(config alt-namespace'i genişletir)* |
| config.ts | registerConfig | 70 | `config` |
| cost.ts | **registerCostCommand** | 214 | `cost` |
| dashboard.ts | registerDashboard | 144 | `dashboard` |
| docs.ts | registerDocs | 13 | `docs` |
| doctor.ts | registerDoctor | 940 | `doctor` |
| explain.ts | registerExplain | 362 | `explain` |
| features.ts | registerFeatures | 85 | `features` |
| finalize.ts | registerFinalize | 112 | `finalize` |
| heartbeat.ts | registerHeartbeat | 20 | `heartbeat` |
| help.ts | registerHelp | 122 | `help-info` |
| history.ts | registerHistory | 220 | `history` |
| init.ts | registerInit | 117 | `init` |
| kill.ts | registerKill | 301 | `kill` |
| memory.ts | registerMemory | 14 | `memory` |
| mode.ts | registerMode | 38 | `mode` |
| nervous.ts | registerNervous | 578 | `nervous` |
| onboard.ts | registerOnboard | 220 | `onboard` |
| output.ts | registerOutput | 63 | `output` |
| plan.ts | registerPlan | 14 | `plan` |
| plugin.ts | registerPlugin | 9 | `plugin` |
| recall.ts | registerRecall | 10 | `recall` |
| recover.ts | registerRecover | 102 | `recover` |
| remember.ts | registerRemember | 9 | `remember` |
| resume.ts | registerResume | 22 | `resume` |
| retro.ts | registerRetro | 338 | `retro` |
| review.ts | registerReview | 189 | `review` |
| run.ts | registerRun | 226 | `run` |
| serve.ts | registerServe | 57 | `serve` |
| set-directives.ts | registerSetDirectives | 31 | `set-directives` |
| skill-marketplace.ts | registerSkillMarketplace | 94 | *(skill alt-komutu — skill.ts içinden çağrılır)* |
| skill.ts | registerSkill | 201 | `skill` |
| spawn.ts | registerSpawn | 83 | `spawn` |
| start.ts | registerStart | 151 | `start` |
| status.ts | registerStatus | 230 | `status` |
| sync.ts | registerSync | 447 | `sync` |
| test-run.ts | registerTestRun | 85 | `test-run` |
| upgrade.ts | registerUpgrade | 358 | `upgrade` |
| watch.ts | registerWatch | 112 | `watch` |
| web.ts | registerWeb | 25 | `web` |

### 1b. Destek Dosyaları (9 adet — `export function register*` içermeyen)

Bu dosyalar komut kayıt fonksiyonu içermez; yardımcı modüller olarak komut dosyaları tarafından içe aktarılır:

| Dosya | Amaç |
|-------|------|
| doctor-checks.ts | doctor komutu için kontrol implementasyonları |
| doctor-format.ts | doctor çıktı biçimlendirmesi |
| init-steps.ts | init adım implementasyonları |
| init-templates.ts | init şablon verisi |
| init-wizard.ts | init sihirbazı mantığı |
| quick-start.ts | Zero-config mod yardımcısı (`buildZeroConfigDirectives`) |
| retro-formatter.ts | Retro çıktı biçimlendirmesi |
| retro-parser.ts | Retro parse yardımcısı |
| init-templates/ | Dizin (şablon dosyaları) |

---

## 2. index.ts Wire Analizi

`src/cli/index.ts:1-122` — tüm register çağrıları incelendi.

**İçe aktarılan fonksiyon sayısı:** 47 (satır 4–50)  
**`buildProgram()` içinde çağrılan sayısı:** 47 (satır 73–119)

Her içe aktarma bir çağrıya karşılık gelir. **Eksik wire yok** — tüm 47 fonksiyon hem import edilmiş hem çağrılmıştır.

```
src/cli/index.ts:73   registerInit(program);
src/cli/index.ts:74   registerStart(program);
...
src/cli/index.ts:119  registerHelp(program);
```

---

## 3. Gerçek Komut Sayısı vs. Belge İddiaları

### 3a. Üst-Düzey Komutlar

index.ts'te 47 register çağrısı bulunur. Ancak `registerConfigNervous` (`src/cli/commands/config-nervous.ts:357`) yeni bir üst-düzey komut **değil**, mevcut `config` komutunu genişletir — program içinden `config` komutunu isim eşleşmesiyle bulur (`src/cli/commands/config-nervous.ts:361`):

```typescript
const configCmd = program.commands.find((c) => c.name() === 'config');
```

Bu nedenle **gerçek üst-düzey komut sayısı: 46**. `help-info` komutu da üst-düzey olarak sayılmıştır (bkz. Bölüm 5).

### 3b. Belge İddiaları Karşılaştırması

| Kaynak | İddia | Gerçek | Durum |
|--------|-------|--------|-------|
| `CLAUDE.md` — Architecture | "46 commands" | 46 üst-düzey | **DOĞRU** |
| `.deckent/workspace/IDENTITY.md` — Identity | "CLI Commands: 55+" | 46 üst-düzey | **ABARTILI** (muhtemelen alt-komutlar dahil edilmiş) |
| `.deckent/workspace/IDENTITY.md` — Project Status | "CLI Commands: 56+" | 46 üst-düzey | **ABARTILI** |
| `DECKENT.md` — CLI Commands | "55+/56+ CLI commands" | 46 üst-düzey | **ABARTILI** |

### 3c. Alt-Komut Sayımı

Eğer alt-komutlar da sayılırsa toplam artmaktadır:

| Ana Komut | Alt-Komutlar | Sayı |
|-----------|-------------|------|
| `agent` | list, create, stats, enable, disable, delete, edit, info | 8 |
| `skill` | list, create, install, update, enable, disable, delete, info, search, publish | 10 |
| `config` | set, get, export, import, list, keys, migrate | 7 |
| `config nervous` | set, override, list, reset | 4 |
| `cost` | show, update, budget | 3 |
| `docs` | add, remove, list, update, run | 5 |
| `checkpoint` | list, approve, reject | 3 |
| `plugin` | install, remove, update, list, info, test, create | 7 |
| `mode` | show, sprint, task, auto, global | 5 |
| `nervous` | accept, reject, edit, undo, history, log, accept-panic, baseline-refresh | 8 |
| `memory` | rebuild, export, stats, relations→list, relations→review | 5 |

**Alt-komut toplamı: ~65** | **Genel toplam (üst-düzey + alt): ~111 CLI yolu**

"55+" iddiası, seçili alt-komutların da sayılmasıyla tutarlı hale gelebilir; ancak hangi alt-komutların dahil edildiğine ilişkin net bir kural belgelenmemiştir.

---

## 4. ADR-012 Uyumu Denetimi

ADR-012, komut kayıt fonksiyonları için `register<Name>(program: Command)` desenini zorunlu kılar.

### 4a. Tespit Edilen İhlaller

**İhlal 1 — registerCostCommand (`src/cli/commands/cost.ts:214`):**
```typescript
export function registerCostCommand(program: Command): void {
```
Fonksiyon adı `Command` sonekini taşımaktadır. ADR-012 deseni `registerCost(program)` olmasını gerektirir. Bu isimlendirme tutarsızlığı diğer tüm 46 dosyayla çelişmektedir.

**İhlal 2 — registerSkillMarketplace parametre adı (`src/cli/commands/skill-marketplace.ts:94`):**
```typescript
export function registerSkillMarketplace(parentCmd: Command): void {
```
`program` yerine `parentCmd` kullanılmaktadır. Bu dosya index.ts'e wire edilmemiştir; `skill.ts` içinden (`src/cli/commands/skill.ts:655`) alt-komut olarak çağrılmaktadır. Parametre adı ADR-012 deseninden sapar.

### 4b. Uyumlu Fonksiyonlar (46/48)

Yukarıdaki 2 istisna dışında tüm register fonksiyonları `register<Name>(program: Command): void` desenine uymaktadır. Kanonik örnekler:
- `src/cli/commands/init.ts:117` — `export function registerInit(program: Command): void`
- `src/cli/commands/nervous.ts:578` — `export function registerNervous(program: Command): void`

---

## 5. Komut Bütünlüğü — `.description()`, `.action()`, `.option()` Kontrolü

Tüm üst-düzey komutlarda `.description()` ve `.action()` varlığı doğrulandı. Kritik gözlemler:

**`registerHelp` → komut adı `help-info` (`src/cli/commands/help.ts:124`):**
```typescript
program.command('help-info').description('Show quick-reference help (localized)')
  .alias('info')
```
Komut adı `help` değil `help-info`'dur. Bu tutarsızlık kullanıcı beklentisiyle çelişebilir (`deckent help` CLI'ın kendi built-in yardım sistemini, `deckent help-info` ise bu komutun tanımladığı özel yardım sayfasını çalıştırır). İsim seçimi işlevsel olarak doğrudur ama sezgisel değildir.

**`registerConfig` → alt-komut tanımı (`src/cli/commands/config.ts:72`):**
`config` komutu kendisine `.action()` tanımlamamış görünmektedir; yalnızca alt-komutlar eylem içermektedir. Bu normal bir Commander.js desenidir (grup komutu olarak).

**`cost.ts` docstring eksikliği — `estimate` alt-komutu (`src/cli/commands/cost.ts:1-10`):**
```
 * Subcommands:
 *   deckent cost estimate [--task-count N]          — Quick cost estimate
```
Dosya başlığındaki docstring `deckent cost estimate` alt-komutunu belgeler; ancak `registerCostCommand` içinde (`src/cli/commands/cost.ts:214-245`) yalnızca `show`, `update`, `budget` alt-komutları gerçekleştirilmiştir. `estimate` alt-komutu **koda implement edilmemiştir**. Bu ölü dokümantasyon / eksik implementasyon bulgusudur.

---

## 6. Ölü Register Fonksiyonları (index.ts'te Wire Edilmemiş)

### 6a. registerSkillMarketplace — ölü DEĞİL

`src/cli/commands/skill-marketplace.ts:94`'teki `registerSkillMarketplace` index.ts'e import edilmemiştir. Ancak bu beklenen bir durumdur:

```typescript
// src/cli/commands/skill.ts:11
import { registerSkillMarketplace } from './skill-marketplace.js';
// src/cli/commands/skill.ts:655
registerSkillMarketplace(skillCmd);
```

`skill.ts` içinden `skill` komut nesnesini (`skillCmd`) parametre olarak geçirerek çağrılmaktadır. Bu tasarım bilinçlidir: `skill search` ve `skill publish` alt-komutlarını `skill` komutuna bağlamaktadır.

### 6b. Destek Dosyaları — beklenen durum

`doctor-checks.ts`, `retro-formatter.ts`, `init-steps.ts` vb. utility modülleri register fonksiyonu **içermez** ve index.ts'te wire edilmeleri **beklenmez**. Her biri ilgili ana komut dosyası tarafından içe aktarılmaktadır.

**Sonuç: index.ts'te wire edilmemiş ölü register fonksiyonu yoktur.**

---

## 7. entry.ts Yapısı

`src/cli/entry.ts:1-41` — programın başlatma mantığı:

1. **Shebang** (`satır 1`): `#!/usr/bin/env node`
2. **Node sürüm koruması** (`satır 9-15`): Node.js >= 24 gerektirmektedir
3. **Yakalanmamış reddedilme işleyicisi** (`satır 18-20`): `handleCliError` yönlendirir
4. **Zarif kapanış** (`satır 23-35`): SIGINT → `interruptActiveSprint()` + `killAllSessions()`; SIGTERM → temiz çıkış
5. **Giriş noktası** (`satır 38-40`): `buildProgram().parseAsync(process.argv)`

`entry.ts` yalnızca `buildProgram()` çağrısı yapar; komut kaydı yalnızca `index.ts` içinde gerçekleşir. Temiz ayrım.

---

## 8. Komut Adları Tam Listesi (46 üst-düzey)

```
init, start, plan, status, attach, spawn, kill, retro, cleanup, doctor,
config, history, plugin, upgrade, onboard, analyze, archive-debt, dashboard,
serve, web, sync, watch, run, test-run, agent, skill, review, finalize,
explain, set-directives, heartbeat, checkpoint, docs, output, cost,
recall, remember, memory, resume, nervous, mode, features, audit,
audit-verify, recover, help-info
```

---

## Özet

| Bulgu | Durum | Ciddiyet |
|-------|-------|---------|
| Gerçek üst-düzey komut sayısı: **46** | ✓ Tespit edildi | — |
| CLAUDE.md "46 commands" iddiası | **DOĞRU** | — |
| IDENTITY.md / DECKENT.md "55+/56+" iddiası | **ABARTILI** (alt-komutlar belirsiz sayılmış) | Düşük |
| `registerCostCommand` — ADR-012 ihlali | **İHLAL** (Command soneki) | Düşük |
| `registerSkillMarketplace` parametre adı | **KISMİ UYUMSUZLUK** (parentCmd vs program) | Çok Düşük |
| `cost estimate` sub-command belgelendi ama implement edilmedi | **EKSİK IMPLEMENTASYON** | Orta |
| `help-info` komut adı (`registerHelp`) | **İSİM UYUMSUZLUĞU** (sezgisel değil) | Çok Düşük |
| Wire edilmemiş ölü register fonksiyonu | **YOK** | — |
| Destek dosyaları (doctor-checks, retro-parser vb.) | **BEKLENEN** (utility modüller) | — |
| Tüm 47 import → 47 çağrı (index.ts) | **TAM** | — |
| Tüm komutlarda `.description()` + `.action()` | **MEVCUT** | — |

---

## Sprint 189 Follow-up

1. **`registerCostCommand` → `registerCost` yeniden adlandırması:** ADR-012 tam uyumu için `cost.ts:214`'teki fonksiyon adını ve `index.ts:38,107`'deki import/çağrısını güncellemek gerekir. (Düşük öncelik — işlevsel etki yok.)

2. **`cost estimate` alt-komutu tamamlanması veya kaldırılması:** `cost.ts:1-10` docstring'i, implement edilmemiş `estimate` alt-komutunu ilan etmektedir. Sprint 189'da ya implement edilmeli ya da docstring'den kaldırılmalıdır. (Orta öncelik — kullanıcı beklentisi yanıltıcı.)

3. **IDENTITY.md / DECKENT.md komut sayısı düzeltmesi:** "55+/56+ CLI commands" iddiasının hangi sayım yöntemini kullandığı (üst-düzey mi, tüm komut yolları mı) netleştirilmeli; ya sayı güncellenmeli ya da sayım yöntemi belgelenmeli. (Düşük öncelik.)

4. **`help-info` → `help` takma adı düzeltmesi veya belgelenmesi:** `registerHelp` `help-info` + `info` takma adı oluşturur ama `help` takma adı yoktur. Commander.js'in kendi `help` komutuyla çakışma riskini göz önünde bulundurarak bilinçli bir karar belgelenmeli.
