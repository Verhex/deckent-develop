/**
 * help.ts — `deckent help` command with TR/EN i18n support.
 *
 * Provides localized quick-reference help.
 * ADR-012: registerHelp(program) pattern.
 * ADR-010: no external deps.
 */

import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { detectLang } from '../helpers/i18n.js';
import { resolveProjectRoot } from '../helpers/process.js';

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
