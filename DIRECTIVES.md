# DIRECTIVES — Sprint 15 (Deckent Bağımsızlık + Self-Hosting)

## Hedef: Deckent CLAUDE.md'ye bağımlı olmaktan çıkar. Kendi .deckent/ yapısıyla çalışır. Kendi reposunda dogfooding-ready olur.

---

## Görev 1: DECKENT.md — Bağımsız Ana Yapı
- Dosya: src/core/constants.ts, src/cli/commands/init.ts, src/mcp/tools/init.ts
- Kapsam: src/core/, src/cli/commands/, src/mcp/tools/

### Problem
Deckent şu an AGENTS.md → CLAUDE.md symlink/kopya zinciriyle çalışıyor. Bu Claude Code'a sıkı bağımlılık yaratıyor. İleride Codex, Gemini gibi provider'lar desteklendiğinde her biri için ayrı adapter lazım.

### Çözüm: DECKENT.md + Otomatik Adapter Pattern

1. **Yeni sabit ekle:** `DECKENT_FILE = 'DECKENT.md'` (constants.ts'e)

2. **DECKENT.md = tek gerçek kaynak.** Init sırasında oluşturulacak, Blueprint Bölüm 4.3'teki zengin yapıyı içerecek:

```markdown
# {projectName} — Deckent Orchestrated

## Identity
@.deckent/workspace/IDENTITY.md

## Rules
- Brain is the ONLY orchestrator — workers never plan
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Sprint is NEVER left incomplete
- Memory budget: 300 lines max in .brain/

## Context
@DIRECTIVES.md
@.brain/MEMORY.md
@.contracts/api-surface.md

## Agent Roles
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Environment
Build: {scripts.build || "tsc"}
Test: {scripts.test || "npx vitest run"}
Lint: {scripts.lint || "tsc --noEmit"}

## Boot
@.deckent/workspace/BOOT.md
```

3. **CLAUDE.md = kullanıcının dosyası, Deckent sadece enjekte eder.**
   - CLAUDE.md **zaten varsa** → dokunma, sadece `@DECKENT.md` satırını ekle (en üste, yoksa)
   - CLAUDE.md **yoksa** → oluştur: `@DECKENT.md` + temel proje bilgisi
   - Kullanıcının mevcut kuralları, @import'ları, yapısı **korunur**
   - `writeIfNotExists` KULLANMA — bunun yerine `ensureDeckentImport(filePath)` helper yaz:
     ```typescript
     function ensureDeckentImport(filePath: string): void {
       if (existsSync(filePath)) {
         const content = readFileSync(filePath, 'utf-8');
         if (!content.includes('@DECKENT.md')) {
           // Mevcut içeriğin EN ÜSTÜNE ekle
           writeFileSync(filePath, `@DECKENT.md\n\n${content}`);
         }
         // Zaten varsa hiçbir şey yapma
       } else {
         // Dosya yok — oluştur
         writeFileSync(filePath, `@DECKENT.md\n`);
       }
     }
     ```
   - Bu pattern **additive, asla destructive değil**

4. **AGENTS.md — aynı enjeksiyon pattern'i.** Varsa dokunma, sadece `@DECKENT.md` ekle (yoksa). Yoksa oluştur. Kullanıcının mevcut AGENTS.md yapısı korunur.

5. **`deckent sync` komutu ekle** (yeni CLI komutu): DECKENT.md'den adapter dosyalarını günceller. CLAUDE.md ve AGENTS.md'ye `@DECKENT.md` enjekte eder (yoksa). İleride CODEX.md, GEMINI.md gibi adapter dosyaları da üretebilir.

**KRİTİK PRENSİP: Deckent hiçbir zaman kullanıcının mevcut dosyalarını silmez veya sıfırlamaz. Sadece kendi referansını ekler. Additive, not destructive.**

### MCP + CLI Birlikte Yaşam Kuralları
İki giriş noktası var: `deckent init` (CLI) ve `deckent_init` (MCP tool). Her ikisi de aynı core işlemi yapıyor. Kurallar:

1. **İdempotent olmalı:** CLI init sonrası MCP init çalışsa (veya tersi) hiçbir şey bozulmamalı
2. **CLAUDE.md asla writeFileSync ile üzerine yazılmamalı.** Mevcut init.ts'teki `writeFileSync(join(root, CLAUDE_FILE), agentsContent)` satırını `ensureDeckentImport()` ile değiştir
3. **DECKENT.md = writeIfNotExists.** Zaten varsa dokunma. Kullanıcı elle düzenlemiş olabilir
4. **.deckent/config.json** → zaten varsa merge et (yeni alanlar ekle, mevcutları koru), yoksa oluştur
5. **settings.json MCP kaydı** → zaten kontrol ediliyor (mevcut test'te doğrulanmış), değişiklik gerekmez
6. **ensureDeckentImport() = shared utility.** `src/core/utils.ts`'e ekle, hem CLI hem MCP buradan çağırsın. Kod tekrarı olmasın
7. **Kullanıcı akışları:**
   - Sadece CLI: `npm i -g deckent && deckent init` → her şey kurulur
   - Sadece MCP: `claude mcp add deckent` → CC'de "Deckent kur" → deckent_init çağrılır
   - İkisi birden: Sorun yok, idempotent. İlk gelen oluşturur, ikinci gelen sadece eksikleri tamamlar

### Init Güncelleme
- **src/core/utils.ts**: `ensureDeckentImport(filePath)` helper ekle (shared, CLI+MCP ortak kullanır)
- init.ts (CLI): DECKENT.md oluştur (writeIfNotExists) + CLAUDE.md/AGENTS.md → `ensureDeckentImport()`
- init.ts (CLI): CLAUDE.md'deki `writeFileSync` → `ensureDeckentImport()` ile değiştir (BREAKING FIX)
- mcp/tools/init.ts: Aynı güncelleme — `ensureDeckentImport()` kullan
- Her iki init: config.json merge pattern (mevcut config varsa üzerine yazma, eksik alanları ekle)

### Test
- DECKENT.md oluşturuluyor ve tüm @import'lar içeriyor
- CLAUDE.md mevcut → içerik korunuyor, sadece @DECKENT.md ekleniyor
- CLAUDE.md yok → oluşturuluyor, @DECKENT.md içeriyor
- CLAUDE.md'de zaten @DECKENT.md var → hiçbir şey değişmiyor (idempotent)
- AGENTS.md mevcut → içerik korunuyor, sadece @DECKENT.md ekleniyor
- CLI init sonrası MCP init → idempotent, hiçbir şey bozulmuyor
- MCP init sonrası CLI init → idempotent, hiçbir şey bozulmuyor
- config.json mevcut → merge, üzerine yazma yok
- package.json'dan build/test/lint scripts okunuyor
- Mevcut DECKENT.md varsa üzerine yazmıyor (writeIfNotExists)
- ensureDeckentImport shared utility CLI ve MCP'den çağrılabiliyor
- 12+ yeni test

---

## Görev 2: Init Çıktısı Blueprint Kalitesine Yükseltme
- Dosya: src/cli/commands/init.ts, src/mcp/tools/init.ts
- Kapsam: src/cli/commands/, src/mcp/tools/

### Problem
Init'in ürettiği .claude/rules/ dosyaları çok kısa (2 satır). Blueprint'te tanımlanan zengin rules dosyaları (paths frontmatter, 10+ kural) üretilmiyor. Yeni kullanıcı yetersiz konfigürasyon alıyor.

### Çözüm

**brain.md template** (init'te oluşturulacak):
```markdown
---
paths: [".tasks/*", ".brain/*", ".contracts/*"]
---
# Brain Rules
- Always read DIRECTIVES.md first
- Always check usage before planning
- Plan mode required before execution
- Write sprint plan as task JSON files in .tasks/
- Assign model and effort per task with reason
- Define scope (directories, filesRead, filesWrite) for each task
- Define GO/NO-GO criteria for each task
- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO
- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix
- Update MEMORY.md after every sprint (max 100 lines)
- Write RETRO.md (overwrite, max 60 lines)
- Trigger decay if .brain/ exceeds 300 lines
- Sprint is NEVER left incomplete
```

**auditor.md template:**
```markdown
---
paths: [".dashboard", ".brain/PATTERNS.md"]
---
# Auditor Rules
- NEVER write source code
- Scan every 30 seconds
- Read all heartbeat files → detect stale agents (>2min = alert)
- Run git diff --stat → detect boundary violations
- Check .locks/ → detect stale locks (>5min)
- Detect circular dependencies / deadlocks
- Overwrite .dashboard on every scan (never append)
- Append new patterns to PATTERNS.md (never overwrite)
- Write alerts for critical issues
```

**worker-default.md template:**
```markdown
---
paths: ["src/**", "tests/**"]
---
# Worker Rules
- Read your task file first
- Write plan before writing code
- Check .locks/ before writing any file
- Create and update heartbeat file (.tasks/task-{id}.hb)
- Run tests before marking done (npx vitest run)
- Coverage goal: minimum 80%
- Document changes
- Stay within your assigned scope
- Write result file (.tasks/task-{id}.result) — REQUIRED
```

### Test
- brain.md paths frontmatter içeriyor
- auditor.md 8+ kural içeriyor
- worker-default.md heartbeat ve result talimatları içeriyor
- Mevcut dosya varsa üzerine yazmıyor
- 6+ yeni test

---

## Görev 3: Deckent'in Kendi .deckent/ Self-Hosting
- Dosya: .deckent/config.json, .deckent/workspace/IDENTITY.md, .deckent/workspace/TOOLS.md, .deckent/workspace/BOOT.md, .deckent/i18n/en.json, .deckent/i18n/tr.json, DECKENT.md, .gitignore
- Kapsam: .deckent/, root dosyalar

### Problem
deckent-dev reposunun kendi .deckent/ yapısı git'te yok veya .gitignore'da. Deckent kendini yönetemiyor.

### Çözüm

1. **deckent-dev root'unda `deckent init` çalıştır** (veya elle oluştur):

`.deckent/config.json`:
```json
{
  "mode": "max_plan",
  "language": "tr",
  "projectName": "deckent",
  "brain_planning": "auto"
}
```

`.deckent/workspace/IDENTITY.md`:
```markdown
# Deckent
AI Agent Orchestration System
Author: Alperen @ Verhex
Domain: deckent.agency
License: MIT
Stack: TypeScript, Node.js 18+, vitest, commander.js, zod, @modelcontextprotocol/sdk
```

`.deckent/workspace/TOOLS.md`:
```markdown
# Environment Tools
Build: tsc
Test: npx vitest run
Lint: tsc --noEmit
Dev: tsc --watch
Coverage: npx vitest run --coverage
Dashboard: deckent web
```

`.deckent/workspace/BOOT.md`:
```markdown
# Boot Sequence
1. Brain reads DIRECTIVES.md
2. Brain checks context (MEMORY, RETRO, DEBT, PATTERNS)
3. Brain plans sprint (AI mode with Zod validation)
4. Workers spawned via tmux, auditor scan loop starts (in-process)
5. Workers execute tasks, write heartbeats (.hb files)
6. Brain waits for results, evaluates (GO/NO-GO/TECH_DEBT)
7. Retrospective → memory update → decay → sprint complete
```

`DECKENT.md` (deckent-dev root'unda, Görev 1'deki template ile):
- Identity: @.deckent/workspace/IDENTITY.md
- Rules, Context, Agent Roles, Environment, Boot

2. **.gitignore güncelle** — .deckent/ dizinini **izlemeye al** (gitignore'dan çıkar):
   - `.deckent/config.json` → git'te takip et
   - `.deckent/workspace/` → git'te takip et
   - `.deckent/i18n/` → git'te takip et
   - `.deckent/plugins/` → boş dizin, .gitkeep ile

3. **CLAUDE.md güncelle** → `ensureDeckentImport()` ile @DECKENT.md enjekte et (mevcut içerik korunur)

4. **Sprint state doğrula**: .brain/ içindeki dosyalar mevcut sprint numarasını (15) yansıtmalı. getNextSprintId() doğru çalışması için .brain/sprints/ dizininde en az son 2 sprint log dosyası olmalı.

### Test (Manuel doğrulama — CC'de)
- `.deckent/config.json` var ve valid JSON
- `.deckent/workspace/IDENTITY.md` var
- `.deckent/workspace/TOOLS.md` var ve package.json'la tutarlı
- `DECKENT.md` var ve tüm @import'lar geçerli dosyalara işaret ediyor
- `CLAUDE.md` sadece `@DECKENT.md` içeriyor
- `deckent doctor` clean geçiyor

---

## Görev 4: checkUsage Gerçek Entegrasyon (DEBT-002 Kapatma)
- Dosya: src/orchestra/brain.ts, src/core/constants.ts
- Kapsam: src/orchestra/, src/core/

### Problem
checkUsage() her zaman { fiveHourPercent: 0, weeklyPercent: 0 } döndürüyor. Brain usage limiti görmüyor, sprint boyutunu asla kısmıyor.

### Çözüm

Claude CLI `claude --usage` veya `/usage` output'unu parse et:

```typescript
export function checkUsage(projectRoot: string): UsageMetrics {
  try {
    // Attempt to read Claude CLI usage
    const result = spawnSync('claude', ['usage'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10_000,
    });

    if (result.status === 0 && result.stdout) {
      return parseUsageOutput(result.stdout);
    }
  } catch {
    // Fallback: return zero (graceful degradation)
  }

  return { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() };
}
```

`parseUsageOutput`: stdout'tan yüzde değerlerini regex ile çıkar. Format değişirse graceful fallback (sıfır döner).

Eğer `claude usage` komutu yoksa veya farklı çalışıyorsa:
- `claude` CLI'ın `--help` çıktısını kontrol et
- Alternatif: `.claude/usage.json` veya benzeri dosyadan oku
- Son çare: stub kalır ama DEBT.md'de "DEBT-002 investigated, CLI has no usage endpoint" olarak kapatılır

### Test
- parseUsageOutput bilinen format ile doğru yüzde çıkarıyor
- Bilinmeyen format → graceful fallback (sıfır)
- spawnSync hata → graceful fallback
- Timeout → graceful fallback
- 6+ yeni test

---

## Görev 5: `deckent sync` Komutu + MCP Sync Tool + Resource
- Dosya: src/cli/commands/sync.ts, src/cli/index.ts, src/mcp/tools/sync.ts, src/mcp/tools/index.ts, src/mcp/resources/deckent-md.ts, src/mcp/resources/index.ts
- Kapsam: src/cli/, src/mcp/

### Problem
DECKENT.md güncellendiğinde CLAUDE.md'nin de güncellenmesi gerekiyor. Manuel senkronizasyon hata eğilimli. Ayrıca MCP tarafından sync çağrılamıyor ve DECKENT.md resource olarak okunamıyor.

### Çözüm A: CLI komutu — `deckent sync`

```typescript
// src/cli/commands/sync.ts
export function registerSync(program: Command): void {
  program
    .command('sync')
    .description('Sync adapter files (CLAUDE.md, AGENTS.md) with DECKENT.md reference')
    .action(() => {
      const root = resolveProjectRoot();

      // 1. DECKENT.md var mı kontrol et
      if (!existsSync(join(root, DECKENT_FILE))) {
        printError(new Error('DECKENT.md not found. Run deckent init first.'));
        return;
      }

      // 2. CLAUDE.md — additive enjeksiyon
      ensureDeckentImport(join(root, CLAUDE_FILE));
      print('CLAUDE.md synced → @DECKENT.md ensured');

      // 3. AGENTS.md — additive enjeksiyon
      ensureDeckentImport(join(root, AGENTS_FILE));
      print('AGENTS.md synced → @DECKENT.md ensured');

      print('Sync complete. Existing file contents preserved.');
    });
}
```

İleride: `deckent sync --provider codex` → CODEX.md adapter oluşturur.

### Çözüm B: MCP tool — `deckent_sync` (10. tool)

```typescript
// src/mcp/tools/sync.ts
// Aynı core logic: ensureDeckentImport() çağırır
// Input: yok (parametre gerektirmez)
// Output: { success, synced: ['CLAUDE.md', 'AGENTS.md'] }
```

Böylece Claude Code'da "Deckent sync et" dendiğinde çalışır.

### Çözüm C: MCP resource — `deckent://config` (5. resource)

```typescript
// src/mcp/resources/config.ts
// URI: deckent://config
// MIME: application/json
// Döndüren: .deckent/config.json içeriği (mode, language, projectName, brain_planning)
```

DECKENT.md'yi resource olarak eklemeye GEREK YOK çünkü Claude Code zaten @import ile okuyor. Ama config.json'u resource olarak eklemek faydalı — Claude "hangi modda çalışıyorum?" diye sorabilir.

### Test
- CLI sync: DECKENT.md yoksa hata veriyor
- CLI sync: CLAUDE.md oluşturuluyor/güncelleniyor (additive)
- CLI sync: AGENTS.md'ye @DECKENT.md ekleniyor (duplicate kontrolü)
- MCP sync: tool çağrılıyor, aynı sonuç
- MCP config resource: valid JSON döndürüyor
- 6+ yeni test

---

## Kalite Kuralları
- tsc --noEmit MUST pass
- npx vitest run MUST pass — hedef: 965+ test (938 + ~27 yeni)
- Coverage düşmemeli (%97+)
- Circular dependency yok
- Brain→auditor tek yönlü import korunsun
- Mevcut 938 test 0 regresyon
- DECKENT.md → CLAUDE.md adapter pattern tüm init yollarında tutarlı (CLI + MCP)
- MCP: 9→10 tool (deckent_sync eklendi), 4→5 resource (deckent://config eklendi)
- ensureDeckentImport() shared utility — CLI ve MCP aynı fonksiyonu kullanmalı
