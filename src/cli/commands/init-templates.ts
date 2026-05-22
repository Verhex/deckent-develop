/**
 * init-templates.ts — Content/template generators for deckent init.
 *
 * All functions that produce file content (DECKENT.md, DIRECTIVES.md, docs,
 * BOOT.md, TOOLS.md, IDE adapters) live here.  Pure functions, no side-effects.
 *
 * Split from init.ts (Sprint 144 Task 1).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FullStackResult } from '../../core/stack-detector.js';

// ─── Small Helpers ──────────────────────────────────────────────────

function getExampleSkill(stack: FullStackResult): string {
  const lang = stack.language?.toLowerCase() ?? '';
  if (lang.includes('typescript') || lang.includes('javascript')) return 'typescript-expert';
  if (lang.includes('python')) return 'testing-expert';
  if (lang.includes('go') || lang.includes('rust')) return 'testing-expert';
  return 'testing-expert';
}

function getExampleFiles(stack: FullStackResult): string {
  const lang = stack.language?.toLowerCase() ?? '';
  if (lang.includes('typescript') || lang.includes('javascript')) return 'src/index.ts, src/utils.ts';
  if (lang.includes('python')) return 'src/main.py, src/utils.py';
  if (lang.includes('go')) return 'cmd/main.go, internal/handler.go';
  if (lang.includes('rust')) return 'src/main.rs, src/lib.rs';
  return 'src/';
}

// ─── DECKENT.md Templates ───────────────────────────────────────────

export function generateDeckentContentTR(projectName: string, buildCmd: string, testCmd: string, lintCmd: string): string {
  return `# ${projectName} — Deckent Orchestrated

## Identity
@.deckent/workspace/IDENTITY.md

## Rules
- Brain is the ONLY orchestrator — workers never plan
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Sprint is NEVER left incomplete
- Memory budget: 900 lines max in .brain/

## Workflow
1. \`deckent init\` — Projeyi başlat
2. \`deckent set-directives\` — Sprint hedeflerini yaz (DIRECTIVES.md)
3. \`deckent plan\` — Task'ları planla (mode: ai/structured/auto)
4. \`deckent start\` — Worker'ları başlat
5. \`deckent status\` — İlerlemeyi izle
6. \`deckent review\` — Sonuçları değerlendir (GO/NO_GO/GO_WITH_TECH_DEBT)
7. \`deckent retro\` — Retrospektif oku
8. \`deckent cleanup\` — Temizle

## DIRECTIVES Format
Her task şu yapıda olmalı:
\`\`\`
## Task N: Başlık
- Model: opus/sonnet/haiku
- Effort: low/normal/high
- Skills: typescript-expert, testing-expert, vb.
- Files: değişecek dosyalar
- Scope: izin verilen dizinler
### Description
Detaylı açıklama...
\`\`\`
Detaylı rehber: .deckent/docs/directives-guide.md

## Providers
- Claude (varsayılan), Codex (OPENAI_API_KEY), Gemini (GOOGLE_API_KEY)
- Model eşdeğerleri: opus↔gpt-5↔gemini-2.5-pro, sonnet↔gpt-4.1↔gemini-2.5-flash

## Context
@DIRECTIVES.md
@.brain/exports/summary.md
@.contracts/api-surface.md

## Agent Roles
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Environment
Build: ${buildCmd}
Test: ${testCmd}
Lint: ${lintCmd}

## Boot
@.deckent/workspace/BOOT.md
`;
}

export function generateDeckentContentEN(projectName: string, buildCmd: string, testCmd: string, lintCmd: string): string {
  return `# ${projectName} — Deckent Orchestrated

## Identity
@.deckent/workspace/IDENTITY.md

## Rules
- Brain is the ONLY orchestrator — workers never plan
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Sprint is NEVER left incomplete
- Memory budget: 900 lines max in .brain/

## Workflow
1. \`deckent init\` — Initialize project
2. \`deckent set-directives\` — Write sprint goals (DIRECTIVES.md)
3. \`deckent plan\` — Plan tasks (mode: ai/structured/auto)
4. \`deckent start\` — Launch workers
5. \`deckent status\` — Monitor progress
6. \`deckent review\` — Evaluate results (GO/NO_GO/GO_WITH_TECH_DEBT)
7. \`deckent retro\` — Read retrospective
8. \`deckent cleanup\` — Clean up

## DIRECTIVES Format
Each task should follow this structure:
\`\`\`
## Task N: Title
- Model: opus/sonnet/haiku
- Effort: low/normal/high
- Skills: typescript-expert, testing-expert, etc.
- Files: files to modify
- Scope: allowed directories
### Description
Detailed description...
\`\`\`
Detailed guide: .deckent/docs/directives-guide.md

## Providers
- Claude (default), Codex (OPENAI_API_KEY), Gemini (GOOGLE_API_KEY)
- Model equivalence: opus↔gpt-5↔gemini-2.5-pro, sonnet↔gpt-4.1↔gemini-2.5-flash

## Context
@DIRECTIVES.md
@.brain/exports/summary.md
@.contracts/api-surface.md

## Agent Roles
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Environment
Build: ${buildCmd}
Test: ${testCmd}
Lint: ${lintCmd}

## Boot
@.deckent/workspace/BOOT.md
`;
}

// ─── DIRECTIVES.md Templates ────────────────────────────────────────

export function generateDirectivesTemplateTR(stack: FullStackResult, projectName: string): string {
  const testCmd = stack.commands.test || 'npm test';
  const skill = getExampleSkill(stack);
  const files = getExampleFiles(stack);
  return `# DIRECTIVES — Sprint 001: ${projectName} İlk Sprint

## Goal: Projenizin ilk sprint hedefini buraya yazın. Örnek: "Kullanıcı authentication sistemi ekle" veya "API endpoint'lerini oluştur"

---

## Task 1: Örnek — Bu task'ı düzenleyin veya silin
- Model: sonnet
- Effort: normal
- Skills: ${skill}
- Files: ${files}
- Scope: src/

### Description
Bu örnek task'tır. Kendi hedefinize göre düzenleyin.

Her task şunları içermelidir:
- **Model:** opus (karmaşık), sonnet (genel), haiku (basit)
- **Effort:** low (<1 saat), normal (1-3 saat), high (3+ saat)
- **Skills:** Uzmanlık alanı (typescript-expert, testing-expert, vb.)
- **Files:** Değiştirilecek dosyalar
- **Scope:** İzin verilen dizinler

**Kanıt:** \`${testCmd}\` → tüm testler geçmeli

**Test:** 3+ test (temel davranış, edge case, hata durumu)

---

<!-- DIRECTIVES.md Kullanım Rehberi:
     1. Bu dosyayı düzenleyin — sprint hedefinizi ve task'larınızı yazın
     2. deckent plan — task'ları planlar
     3. deckent start — sprint'i başlatır
     Detaylı format rehberi: .deckent/docs/directives-guide.md -->
`;
}

export function generateDirectivesTemplateEN(stack: FullStackResult, projectName: string): string {
  const testCmd = stack.commands.test || 'npm test';
  const skill = getExampleSkill(stack);
  const files = getExampleFiles(stack);
  return `# DIRECTIVES — Sprint 001: ${projectName} First Sprint

## Goal: Write your first sprint goal here. Example: "Add user authentication" or "Create API endpoints"

---

## Task 1: Example — Edit or delete this task
- Model: sonnet
- Effort: normal
- Skills: ${skill}
- Files: ${files}
- Scope: src/

### Description
This is an example task. Edit it to match your goals.

Each task should include:
- **Model:** opus (complex), sonnet (general), haiku (simple)
- **Effort:** low (<1 hour), normal (1-3 hours), high (3+ hours)
- **Skills:** Expertise area (typescript-expert, testing-expert, etc.)
- **Files:** Files to be modified
- **Scope:** Allowed directories

**Proof:** \`${testCmd}\` → all tests should pass

**Test:** 3+ tests (basic behavior, edge case, error handling)

---

<!-- DIRECTIVES.md Usage Guide:
     1. Edit this file — write your sprint goal and tasks
     2. deckent plan — plans the tasks
     3. deckent start — starts the sprint
     Detailed format guide: .deckent/docs/directives-guide.md -->
`;
}

// ─── Docs Templates ─────────────────────────────────────────────────

export function generateQuickStartDoc(lang: string): string {
  if (lang === 'tr') {
    return `# Hızlı Başlangıç — Deckent ile İlk Sprint

## 1. Hedeflerinizi Yazın
DIRECTIVES.md dosyasını düzenleyin veya CLI ile:
\`\`\`bash
deckent set-directives "Authentication sistemi ekle"
\`\`\`

## 2. Sprint Planlayın
\`\`\`bash
deckent plan
\`\`\`
Bu komut DIRECTIVES.md'yi okur ve task'ları planlar.
- \`--mode ai\` — AI ile akıllı planlama
- \`--mode structured\` — Kural tabanlı, hızlı

## 3. Çalışmaya Başlayın
\`\`\`bash
deckent start
\`\`\`
Worker'lar otomatik başlar ve task'ları uygular.

## 4. İlerlemeyi İzleyin
\`\`\`bash
deckent status --watch
\`\`\`

## 5. Sonuçları Değerlendirin
\`\`\`bash
deckent review    # GO / NO_GO / GO_WITH_TECH_DEBT
deckent retro     # Retrospektif ve öğrenimler
deckent cleanup   # Temizlik
\`\`\`

## Sorun Giderme
\`\`\`bash
deckent doctor    # Sağlık kontrolü
deckent kill --all  # Tüm worker'ları durdur
deckent cleanup   # Temizle ve yeniden başla
\`\`\`

## MCP Entegrasyonu
Claude Code, Cursor veya VS Code'da MCP server olarak kullanabilirsiniz:
\`\`\`bash
claude mcp add deckent -- npx deckent-mcp
\`\`\`
`;
  }
  return `# Quick Start — Your First Sprint with Deckent

## 1. Write Your Goals
Edit DIRECTIVES.md or use the CLI:
\`\`\`bash
deckent set-directives "Add authentication system"
\`\`\`

## 2. Plan the Sprint
\`\`\`bash
deckent plan
\`\`\`
This reads DIRECTIVES.md and plans tasks.
- \`--mode ai\` — AI-powered smart planning
- \`--mode structured\` — Rule-based, fast

## 3. Start Working
\`\`\`bash
deckent start
\`\`\`
Workers start automatically and execute tasks.

## 4. Monitor Progress
\`\`\`bash
deckent status --watch
\`\`\`

## 5. Evaluate Results
\`\`\`bash
deckent review    # GO / NO_GO / GO_WITH_TECH_DEBT
deckent retro     # Retrospective and learnings
deckent cleanup   # Clean up
\`\`\`

## Troubleshooting
\`\`\`bash
deckent doctor      # Health check
deckent kill --all  # Stop all workers
deckent cleanup     # Clean up and restart
\`\`\`

## MCP Integration
Use as MCP server in Claude Code, Cursor, or VS Code:
\`\`\`bash
claude mcp add deckent -- npx deckent-mcp
\`\`\`
`;
}

export function generateDirectivesGuideDoc(lang: string): string {
  if (lang === 'tr') {
    return `# DIRECTIVES Format Rehberi

## Temel Yapı
\`\`\`markdown
# DIRECTIVES — Sprint NNN: Sprint Başlığı

## Goal: Sprint amacını bir paragrafta açıkla.

## Task 1: Task Başlığı
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts
- Scope: src/core/

### Description
Task'ın ne yapacağını detaylı açıkla.

**Kanıt:** \\\`grep "yeniOzellik" src/core/config.ts\\\` → eklendi
**Test:** 3+ test
\`\`\`

## Alan Açıklamaları

| Alan | Değerler | Açıklama |
|------|----------|----------|
| Model | opus, sonnet, haiku | AI modeli — opus: karmaşık, sonnet: genel, haiku: basit |
| Effort | low, normal, high | İş yükü — low: <1 saat, normal: 1-3 saat, high: 3+ saat |
| Skills | skill-id listesi | Uzmanlık alanı (virgülle ayır) |
| Files | dosya yolları | Değiştirilecek dosyalar |
| Scope | dizin yolları | Worker'ın erişebileceği dizinler |
| Kanıt | shell komutu | Tamamlanma kanıtı |
| Test | sayı + açıklama | Beklenen test sayısı ve kapsamı |

## Mevcut Skills
- typescript-expert, testing-expert, documentation-writer
- security-specialist, performance-optimizer, api-builder
- devops-engineer, database-migration, react-specialist
- python-expert, ci-testing

## İpuçları
- Her task bağımsız olmalı — birbirine bağımlı task'lar dependencies ile belirtin
- Scope dar tutun — worker sadece gerekli dizinlere erişsin
- Kanıt satırı spesifik olmalı — "testler geçmeli" yerine "grep X file → var" yazın
`;
  }
  return `# DIRECTIVES Format Guide

## Basic Structure
\`\`\`markdown
# DIRECTIVES — Sprint NNN: Sprint Title

## Goal: Describe the sprint goal in one paragraph.

## Task 1: Task Title
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts
- Scope: src/core/

### Description
Describe what the task will do in detail.

**Proof:** \\\`grep "newFeature" src/core/config.ts\\\` → added
**Test:** 3+ tests
\`\`\`

## Field Reference

| Field | Values | Description |
|-------|--------|-------------|
| Model | opus, sonnet, haiku | AI model — opus: complex, sonnet: general, haiku: simple |
| Effort | low, normal, high | Workload — low: <1h, normal: 1-3h, high: 3+h |
| Skills | skill-id list | Expertise area (comma-separated) |
| Files | file paths | Files to be modified |
| Scope | directory paths | Directories the worker can access |
| Proof | shell command | Completion proof |
| Test | count + description | Expected test count and scope |

## Available Skills
- typescript-expert, testing-expert, documentation-writer
- security-specialist, performance-optimizer, api-builder
- devops-engineer, database-migration, react-specialist
- python-expert, ci-testing

## Tips
- Each task should be independent — use dependencies for related tasks
- Keep scope narrow — workers should only access necessary directories
- Proof lines should be specific — use "grep X file → exists" not "tests pass"
`;
}

export function generateConfigReferenceDoc(lang: string): string {
  if (lang === 'tr') {
    return `# Konfigürasyon Referansı

Tüm ayarlar \`.deckent/config.json\` dosyasında.
CLI ile okuma/yazma: \`deckent config read\` / \`deckent config set key value\`

## Temel Ayarlar

| Ayar | Değerler | Varsayılan | Açıklama |
|------|----------|-----------|----------|
| mode | performance, balanced, economic, api | balanced | Plan modu |
| language | en, tr | en | Arayüz dili |
| projectName | string | dizin adı | Proje adı |
| max_workers | 1-10 | mode'a göre | Eş zamanlı worker sayısı |

## Provider Ayarları

| Ayar | Değerler | Varsayılan | Açıklama |
|------|----------|-----------|----------|
| brain_provider | claude, codex, gemini | claude | Brain provider'ı |
| worker_provider | claude, codex, gemini | claude | Worker provider'ı |
| fallback_provider | claude, codex, gemini | - | Yedek provider |
| spawn_backend | tmux, subprocess | tmux | Worker başlatma (Windows: subprocess) |

## Routing Ayarları

| Ayar | Değerler | Varsayılan | Açıklama |
|------|----------|-----------|----------|
| routing_engine | v1, v2 | v2 | Routing motoru |
| brain_planning | ai, structured, auto | auto | Planlama modu |

## Memory + Decay

| Ayar | Değerler | Varsayılan | Açıklama |
|------|----------|-----------|----------|
| memory_budget | sayı | 900 | .brain/ toplam satır bütçesi |
| decay_after_sprints | sayı | 5 | Kaç sprint sonra decay başlar |

## Sprint Ayarları

| Ayar | Değerler | Varsayılan | Açıklama |
|------|----------|-----------|----------|
| fix_phase_enabled | true/false | true | Başarısız task'ları tekrar dene |
| max_fix_retries | sayı | 2 | Maksimum tekrar deneme |
| scan_interval | saniye | 30 | Auditor tarama aralığı |
| heartbeat_timeout | saniye | 120 | Worker heartbeat zaman aşımı |
| cleanup_delay_ms | ms | 180000 | Cleanup öncesi bekleme |
`;
  }
  return `# Configuration Reference

All settings in \`.deckent/config.json\`.
CLI read/write: \`deckent config read\` / \`deckent config set key value\`

## Core Settings

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| mode | performance, balanced, economic, api | balanced | Plan mode |
| language | en, tr | en | UI language |
| projectName | string | dir name | Project name |
| max_workers | 1-10 | per mode | Concurrent worker count |

## Provider Settings

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| brain_provider | claude, codex, gemini | claude | Brain provider |
| worker_provider | claude, codex, gemini | claude | Worker provider |
| fallback_provider | claude, codex, gemini | - | Fallback provider |
| spawn_backend | tmux, subprocess | tmux | Worker spawn (Windows: subprocess) |

## Routing Settings

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| routing_engine | v1, v2 | v2 | Routing engine |
| brain_planning | ai, structured, auto | auto | Planning mode |

## Memory + Decay

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| memory_budget | number | 900 | .brain/ total line budget |
| decay_after_sprints | number | 5 | Sprints before decay |

## Sprint Settings

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| fix_phase_enabled | true/false | true | Retry failed tasks |
| max_fix_retries | number | 2 | Max retry attempts |
| scan_interval | seconds | 30 | Auditor scan interval |
| heartbeat_timeout | seconds | 120 | Worker heartbeat timeout |
| cleanup_delay_ms | ms | 180000 | Wait before cleanup |
`;
}

// ─── BOOT.md Template ───────────────────────────────────────────────

export function generateBootContent(lang: string): string {
  if (lang === 'tr') {
    return `# Sprint Başlatma Süreci

Bir sprint başlatıldığında (\`deckent start\`) şu adımlar otomatik çalışır:

1. **Plan** — Brain DIRECTIVES.md'yi okur, task'ları planlar
2. **Spawn** — Worker'lar başlatılır (tmux veya subprocess)
3. **Execute** — Worker'lar task'ları uygular, heartbeat yazar
4. **Evaluate** — Brain sonuçları değerlendirir (GO / NO_GO / TECH_DEBT)
5. **Fix** — Başarısız task'lar yeniden denenir
6. **Retro** — Retrospektif yazılır (RETRO.md)
7. **Decay** — Bellek bütçesi kontrol edilir
8. **Cleanup** — Task dosyaları arşivlenir

> İpucu: \`deckent status --watch\` ile süreci canlı izleyebilirsiniz.
> Sorun olursa: \`deckent kill --all\` → \`deckent cleanup\` → \`deckent doctor\`
`;
  }
  return `# Sprint Boot Sequence

When a sprint starts (\`deckent start\`), these steps run automatically:

1. **Plan** — Brain reads DIRECTIVES.md, plans tasks
2. **Spawn** — Workers launched (tmux or subprocess)
3. **Execute** — Workers implement tasks, write heartbeats
4. **Evaluate** — Brain evaluates results (GO / NO_GO / TECH_DEBT)
5. **Fix** — Failed tasks retried
6. **Retro** — Retrospective written (RETRO.md)
7. **Decay** — Memory budget checked
8. **Cleanup** — Task files archived

> Tip: Use \`deckent status --watch\` to monitor in real-time.
> If stuck: \`deckent kill --all\` → \`deckent cleanup\` → \`deckent doctor\`
`;
}

// ─── TOOLS.md Template ──────────────────────────────────────────────

export function generateToolsContent(root: string): string {
  const lines = ['# Tools\n'];
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (scripts) {
      for (const [name, cmd] of Object.entries(scripts)) {
        lines.push(`- **${name}**: \`${cmd}\``);
      }
    }
  } catch {
    lines.push('No package.json found. Add your build/test commands here.');
  }
  return lines.join('\n') + '\n';
}

// ─── IDE Adapter Content ────────────────────────────────────────────

export function generateCursorDeckentMd(): string {
  return `@DECKENT.md

# Deckent — Cursor Integration

This project uses Deckent for AI agent orchestration.

## Workflow
1. \`deckent init\` — Initialize project
2. \`deckent set-directives\` — Set sprint goals in DIRECTIVES.md
3. \`deckent plan\` — Plan sprint tasks (mode: ai/structured/auto)
4. \`deckent start\` — Launch workers
5. \`deckent status\` — Monitor progress
6. \`deckent review\` — Evaluate results (GO/NO_GO/GO_WITH_TECH_DEBT)
7. \`deckent retro\` — Sprint retrospective
8. \`deckent cleanup\` — Archive and clean

## Rules
- Follow DIRECTIVES.md for sprint goals
- Respect file scope boundaries
- Run tests before reporting completion
- Brain is the ONLY orchestrator — workers never plan
`;
}

export function generateVscodeMcpJson(): string {
  return JSON.stringify(
    {
      servers: {
        deckent: {
          command: 'deckent-mcp',
          args: [],
          env: {},
        },
      },
    },
    null,
    2,
  ) + '\n';
}
