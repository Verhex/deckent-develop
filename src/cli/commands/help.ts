/**
 * help.ts — `deckent help-info` (alias `deckent info`) localized quick-reference.
 *
 * Provides a curated TR/EN quick-reference of common commands. Registered as
 * `help-info` (alias `info`) because commander reserves the built-in `help`
 * command: `deckent help` / `deckent --help` auto-lists ALL registered commands,
 * while `deckent info` shows this curated localized reference. The program's
 * top-level help text points users here (see buildProgram `addHelpText`).
 * ADR-012: registerHelp(program) pattern.
 * ADR-010: no external deps.
 */

import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { detectLang } from '../helpers/i18n.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { AgentPoolManager } from '../../core/agent-pool.js';
import { SkillPoolManager } from '../../core/skill-pool.js';

// ─── Localized Help Content ─────────────────────────────────────────

const HELP_CONTENT = {
  en: {
    title: 'deckent — AI Agent Orchestration CLI',
    subtitle: 'Quick Reference',
    sections: [
      {
        heading: 'Sprint Workflow',
        items: [
          ['deckent init', 'Initialize a new Deckent project'],
          ['deckent start', 'Start a sprint (spawn workers)'],
          ['deckent status', 'Show current sprint status'],
          ['deckent doctor', 'Check system health'],
          ['deckent retro', 'Read sprint retrospective'],
          ['deckent cleanup', 'Archive completed sprint'],
        ],
      },
      {
        heading: 'Operations & Monitoring',
        items: [
          ['deckent watch --follow <taskId>', 'Follow a worker live (docker logs / tmux pane)'],
          ['deckent status --watch', 'Live sprint progress'],
          ['deckent resources', 'Live docker worker resource usage'],
          ['deckent serve', 'Start the HTTP API + dashboard server'],
          ['deckent dashboard', 'Open the web dashboard'],
          ['deckent audit <sprintId>', 'Run the self-audit gate'],
        ],
      },
      {
        heading: 'Memory',
        items: [
          ['deckent recall <query>', 'Search project memory'],
          ['deckent remember <note>', 'Save a memory note'],
          ['deckent memory stats', 'Show memory statistics'],
        ],
      },
      {
        heading: 'Configuration',
        items: [
          ['deckent config read', 'Read current configuration'],
          ['deckent config set <key> <value>', 'Update a config value'],
          ['deckent plan', 'Plan sprint tasks from DIRECTIVES.md'],
        ],
      },
    ],
    tip: 'Tip: Run `deckent <command> --help` for detailed options.',
    docs: 'Docs: https://github.com/deckent/deckent',
  },
  tr: {
    title: 'deckent — AI Ajan Orkestrasyon CLI',
    subtitle: 'Hızlı Başvuru',
    sections: [
      {
        heading: 'Sprint İş Akışı',
        items: [
          ['deckent init', 'Yeni bir Deckent projesi başlat'],
          ['deckent start', 'Sprint başlat (worker\'ları çalıştır)'],
          ['deckent status', 'Mevcut sprint durumunu göster'],
          ['deckent doctor', 'Sistem sağlığını kontrol et'],
          ['deckent retro', 'Sprint retrospektifini oku'],
          ['deckent cleanup', 'Tamamlanan sprinti arşivle'],
        ],
      },
      {
        heading: 'İşlem & İzleme',
        items: [
          ['deckent watch --follow <taskId>', 'Bir worker\'ı canlı izle (docker logs / tmux pane)'],
          ['deckent status --watch', 'Canlı sprint ilerlemesi'],
          ['deckent resources', 'Canlı docker worker kaynak kullanımı'],
          ['deckent serve', 'HTTP API + dashboard sunucusunu başlat'],
          ['deckent dashboard', 'Web dashboard\'ı aç'],
          ['deckent audit <sprintId>', 'Öz-denetim gate\'ini çalıştır'],
        ],
      },
      {
        heading: 'Bellek',
        items: [
          ['deckent recall <sorgu>', 'Proje belleğinde ara'],
          ['deckent remember <not>', 'Bellek notu kaydet'],
          ['deckent memory stats', 'Bellek istatistiklerini göster'],
        ],
      },
      {
        heading: 'Yapılandırma',
        items: [
          ['deckent config read', 'Mevcut yapılandırmayı oku'],
          ['deckent config set <anahtar> <değer>', 'Yapılandırma değeri güncelle'],
          ['deckent plan', 'DIRECTIVES.md\'den sprint görevlerini planla'],
        ],
      },
    ],
    tip: 'İpucu: Ayrıntılı seçenekler için `deckent <komut> --help` çalıştırın.',
    docs: 'Belgeler: https://github.com/deckent/deckent',
  },
} as const;

// ─── Formatter ─────────────────────────────────────────────────────

function formatHelp(lang: 'en' | 'tr'): string {
  const content = HELP_CONTENT[lang];
  const lines: string[] = [];

  lines.push('');
  lines.push(`  ${content.title}`);
  lines.push(`  ${content.subtitle}`);
  lines.push('');

  for (const section of content.sections) {
    lines.push(`  ${section.heading}:`);
    for (const [cmd, desc] of section.items) {
      const padding = ' '.repeat(Math.max(1, 36 - cmd.length));
      lines.push(`    ${cmd}${padding}${desc}`);
    }
    lines.push('');
  }

  lines.push(`  ${content.tip}`);
  lines.push(`  ${content.docs}`);
  lines.push('');

  return lines.join('\n');
}

// ─── Exports for testing ────────────────────────────────────────────

export { formatHelp, HELP_CONTENT };

// ─── Dynamic Capability Counts ──────────────────────────────────────

export interface CapabilityCounts {
  agents: number;
  skills: number;
  tools: number;
}

/**
 * Returns agent/skill counts from the runtime registries and tool count
 * from the caller (MCP layer knows the real count). Never hardcodes totals.
 * Zero-hardcode compliant per ADR-070.
 */
export function getCapabilityCounts(root: string, overrideToolCount = 0): CapabilityCounts {
  let agents = 0;
  let skills = 0;
  try {
    agents = new AgentPoolManager(root).listAgents().length;
  } catch {
    // registry unavailable — return 0 gracefully
  }
  try {
    skills = new SkillPoolManager(root).listSkills().length;
  } catch {
    // registry unavailable — return 0 gracefully
  }
  return { agents, skills, tools: overrideToolCount };
}

// ─── Command Registration ───────────────────────────────────────────

export function registerHelp(program: Command): void {
  program
    .command('help-info')
    .description('Show quick-reference help (localized)')
    .alias('info')
    .option('--lang <lang>', 'Language override: en or tr')
    .action((opts: { lang?: string }) => {
      let root: string;
      try {
        root = resolveProjectRoot();
      } catch {
        root = process.cwd();
      }

      const rawLang = opts.lang ?? detectLang(root);
      const lang: 'en' | 'tr' = rawLang === 'tr' ? 'tr' : 'en';

      print(formatHelp(lang));
    });
}
