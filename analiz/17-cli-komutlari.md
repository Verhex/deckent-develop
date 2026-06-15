# 17 — CLI Komutları

deckent, `src/cli/` altında konuşlandırılmış 57+ komuttan oluşan güçlü bir komut satırı arayüzü sunar. Tüm komutlar `register<Name>(program)` kalıbıyla (`src/cli/index.ts`) bağımsız dosyalar halinde kayıt edilir; bu yapı yeni komut eklemeyi, test etmeyi ve bakımı kolaylaştırır (ADR-012).

---

## Ana Sprint Akışı

deckent ile tipik bir sprint bu sırayı izler:

```
init → set-directives → plan → start → status → review → retro → cleanup
```

### 1. `deckent init`

Projeyi başlatır. `.deckent/`, `.brain/`, `.tasks/` dizinlerini oluşturur; CLAUDE.md, DECKENT.md ve DIRECTIVES.md bağlantı noktalarını kurar. Ortam tespit edilerek (Claude Code, Cursor, VS Code) gerekli MCP bağdaştırıcıları yapılandırılır.

```bash
deckent init
deckent init --root /benim/projem
```

### 2. `deckent set-directives`

DIRECTIVES.md dosyasını günceller. Sprint hedeflerini, task tanımlarını (model, effort, skills, scope) yazmanın standart yolu budur.

```bash
deckent set-directives
```

### 3. `deckent plan`

DIRECTIVES.md'yi okur, görevleri `.tasks/` altında JSON dosyaları olarak üretir. `--mode ai` ile yapay zeka tabanlı, `--mode structured` ile kural tabanlı planlama yapılır.

```bash
deckent plan --mode ai
deckent plan --mode structured
deckent plan --mode auto   # proje boyutuna göre otomatik
```

### 4. `deckent start`

Sprint'i başlatır. Worker'ları tmux veya subprocess ile spawn eder; Auditor tarama döngüsü başlar. `--dry-run` ile task listesi görüntülenir, spawn yapılmaz.

```bash
deckent start
deckent start --dry-run
deckent start --sprint sprint-001
```

### 5. `deckent status`

Aktif worker'ları, tamamlanan task'ları, uyarıları ve ilerleme oranını gösterir. `--watch` ile canlı izleme moduna geçilir.

```bash
deckent status
deckent status --watch
deckent status --json       # ham JSON çıktısı
```

### 6. `deckent review`

Sprint sonucunu değerlendirir: **GO** / **NO_GO** / **GO_WITH_TECH_DEBT** kararını verir. Hangi task'ların başarısız olduğunu ve teknik borç bırakılıp bırakılmadığını açıklar.

```bash
deckent review
```

### 7. `deckent retro`

Son sprint retrospektifini gösterir. Öğrenmeler, kazanımlar, bir sonraki sprint için öneriler içerir.

```bash
deckent retro
deckent retro --sprint sprint-001
```

### 8. `deckent cleanup`

Task dosyalarını arşivler, kilitleri serbest bırakır, tmux session'larını kapatır. Sprint'i temizler.

```bash
deckent cleanup
deckent cleanup --force     # onay sormadan
```

---

## Hafıza Komutları

### `deckent recall`

`.brain/memory.db` içinde FTS5 tam metin araması yapar. ADR, sprint öğrenimi, teknik borç ve örüntü kayıtlarında arama yapılabilir.

```bash
deckent recall "docker heartbeat"
deckent recall "auth middleware"
```

### `deckent remember`

Yeni bir hafıza girdisi oluşturur.

```bash
deckent remember "Docker backend'de HB atomik yazım kritik"
```

### `deckent memory`

Hafıza alt komutlarını yönetir:

```bash
deckent memory stats      # DB istatistikleri
deckent memory rebuild    # .md dosyalarından DB yeniden oluştur
deckent memory export     # DB → .md snapshot oluştur
```

---

## Tam Komut Listesi (57 kayıtlı komut)

`src/cli/index.ts`'de `register<Name>(program)` çağrısıyla kayıt edilen komutlar:

| Kategori | Komutlar |
|----------|----------|
| **Sprint çekirdeği** | `init`, `plan`, `start`, `status`, `review`, `retro`, `cleanup` |
| **Direktifler** | `set-directives` |
| **Task yönetimi** | `run`, `spawn`, `kill`, `attach`, `resume`, `recover` |
| **İzleme** | `watch`, `doctor`, `audit`, `audit-verify` |
| **Hafıza** | `recall`, `remember`, `memory` |
| **Yapılandırma** | `config`, `mode`, `sync` |
| **Agent & Skill** | `agent`, `skill` |
| **MCP** | `mcp`, `resources` |
| **Sohbet & REPL** | `chat` |
| **Dashboard** | `dashboard`, `serve`, `web` |
| **Belgeleme** | `docs`, `explain`, `retro` |
| **Analiz** | `analyze`, `features`, `models`, `usage`, `cost` |
| **Onboarding** | `onboard`, `upgrade`, `plugin` |
| **Checkpoint** | `checkpoint`, `finalize` |
| **Nervous System** | `nervous`, `config-nervous` |
| **Otonom** | `autonomous`, `flow`, `bot` |
| **Erişim** | `rbac`, `evolve`, `help`, `output` |
| **CI/Test** | `heartbeat`, `test-run`, `history` |

---

## ADR-012: register<Name>(program) Kalıbı

Her CLI komutu kendi dosyasında tanımlanır ve `register<Name>(program: Command): void` fonksiyonu export eder. Örnek:

```typescript
// src/cli/commands/start.ts
export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Sprint\'i başlat, worker\'ları spawn et')
    .option('--dry-run', 'Spawn etmeden task listesini göster')
    .action(async (opts) => { ... });
}
```

`src/cli/index.ts` tüm komutları `buildProgram()` fonksiyonu içinde kayıt eder:

```typescript
export function buildProgram(): Command {
  const program = new Command().name('deckent')...;
  registerInit(program);
  registerStart(program);
  registerPlan(program);
  // ...57 adet register çağrısı
  return program;
}
```

**Yeni komut ekleme:** `src/cli/commands/yeni-komut.ts` dosyası oluştur → `registerYeniKomut(program)` fonksiyonunu export et → `index.ts`'e import ekle + `registerYeniKomut(program)` çağrısı yap.

---

## Ek Yardımcı Komutlar

```bash
deckent doctor          # Codebase sağlığını kontrol et
deckent models          # Model registry listesi (tier + provider)
deckent cost            # Token kullanım maliyeti özeti
deckent history         # Sprint geçmişini listele
deckent checkpoint      # Checkpoint onay/red
deckent recover         # Çökmüş sprint kurtarma
deckent bot             # Bot entegrasyonu (Discord/Telegram/WhatsApp)
deckent flow            # Autonomous akış yönetimi
deckent rbac            # Rol tabanlı erişim kontrolü
deckent evolve          # Agent/skill evrim pipeline'ı
```

---

## argümansız deckent — Agentic REPL

`deckent` komutu argümansız çalıştırıldığında tam agentic REPL moduna girer (ADR-081). Doğal dil komutları desteklenir; `claude`, `codex` veya `gemini` altyapısıyla desteklenen interaktif bir orkestrasyon deneyimi sunar.

```bash
deckent   # REPL başlar — Kraken ASCII splash + prompt
```
