// src/cli/helpers/message-catalog/cli-run.ts
// ═══ CLI-CONTRACT-003 — `cli-run` message-catalog + contract family ════════
//
// Scope of THIS family: the CORE and RUN-LIFECYCLE command paths — the
// commands that plan, start, observe, settle and finalize Deckent work
// (`analyze attach checkpoint config connect dashboard do finalize heartbeat
// init inspect kill onboard output plan plan-nl process recover resume review
// run runs set-directives spawn start sync task test upgrade watch`).
//
// It carries TWO things for every path in that family:
//
//   1. `CLI_RUN_MESSAGES` — a bilingual (en/tr) catalog family, same row shape
//      as `cli-common.ts`, covering every OPTION and ARGUMENT help string in
//      the family plus the per-command contract help blocks. Option help used
//      to be English literals baked into the `.option(...)` call sites; those
//      call sites now read from here, so `deckent <cmd> --help` is bilingual
//      the same way the command SUMMARY line already was.
//
//   2. `CLI_RUN_FAMILY_CONTRACTS` — machine-readable contract metadata per
//      path: effect, default execution (dry-run vs apply), confirmation,
//      authority, output mode, platform matrix and platform/backend
//      prerequisites, plus the option/argument → description-key bindings.
//      `tests/cli/cli-run-family-contract.test.ts` verifies every row against
//      the LIVE Commander tree and against the path-level SSOT in
//      `src/core/cli-command-contract.ts`, in BOTH languages.
//
// NAMESPACE — this family owns `cliContract.*` and nothing else. The prefix is
// deliberately distinct from the `cli.*` / per-command namespaces already used
// by `src/cli/helpers/messages.ts`. The shared catalog merges this family as a
// pure addition and rejects duplicate keys.
//
// RESOLUTION — `cliContractMessage()` reads this file directly and never
// imports `messages.ts`. That keeps the module free of an import cycle
// (`messages.ts` imports catalog families, not the other way round) and makes
// the bilingual face a property of this file alone.
//
// HONESTY NOTES baked into the text below (see the `notes` rows):
//   • `run "<description>"` (one-shot) and `run start|status|retro|history`
//     (compatibility aliases) share ONE Commander namespace. The four reserved
//     names win. That collision is DOCUMENTED here, not fixed — behaviour is
//     deliberately unchanged.
//   • `test` runs a Deckent TEST SPRINT, not the project's unit-test runner.
//   • `output` reads PERSISTED worker stdout/stderr/`.result` evidence from
//     disk; it never attaches to a live process.
//   • `finalize` publishes the DB-first terminal projection of a sprint.
//
// Internal engineering codes (`TERM-*`, `B1b`, `<sprint>/<slice>` labels,
// `NNN-NNN` task ids) are NOT user-facing text and are absent from every row
// below; the test enforces that with a regex over the live help surface.

import type { MessageFamily } from './cli-common.js';

/** Language used when a row has no entry for the requested language. */
const DEFAULT_LANGUAGE = 'en';

// ─── Contract metadata shapes ───────────────────────────────────────────────

/** What the command does to the world. Mirrors the path-level SSOT `effect`. */
export type CliContractEffect = 'group' | 'read' | 'mixed' | 'local-write' | 'process' | 'dangerous';

/** What happens when the command is run with NO extra flags. */
export type CliContractExecution = 'read' | 'dry-run' | 'apply';

/** Which surfaces the command's stdout can be consumed as. */
export type CliContractOutput = 'text' | 'text-and-json' | 'stream';

/** How consent for a side effect is obtained. */
export type CliContractConfirmation =
  /** No consent step — the command is read-only or its effect is local+reversible. */
  | 'none'
  /** An interactive prompt is shown unless a non-interactive flag is passed. */
  | 'interactive'
  /** Nothing happens until an explicit opt-in flag is passed. */
  | 'flag-opt-in';

/** Which authority must admit the command before it can take effect. */
export type CliContractAuthority =
  | 'none'
  /** A human must approve through the run/checkpoint approval surface. */
  | 'approval-gate'
  /** A named operator must attest, in writing, on the command line. */
  | 'operator-attestation'
  /** Provider admission (auth + budget policy) is preflighted before dispatch. */
  | 'provider-admission';

/** A platform-, backend- or state-level thing that must exist first. */
export type CliContractPrerequisite =
  | 'project-init'
  | 'active-sprint'
  | 'tmux'
  | 'docker'
  | 'git'
  | 'network'
  | 'provider-auth';

/** Platform matrix values, identical to the path-level SSOT. */
export type CliContractPlatform = 'darwin' | 'linux' | 'win32';

/** Every platform the family supports. */
export const CLI_CONTRACT_PLATFORMS: readonly CliContractPlatform[] = Object.freeze([
  'darwin',
  'linux',
  'win32',
]);

/** One option on a family path, bound to its bilingual help row. */
export interface CliContractOptionBinding {
  /** Verbatim Commander flags string, e.g. `--tail <n>`. */
  readonly flags: string;
  /**
   * Catalog key rendering this option's help text. `cliContract.*` keys are
   * served by THIS family; any other key is served by the base catalog.
   * Hidden options remain catalog-bound for contract/manifest inspection even
   * though Commander omits them from public `--help` output.
   */
  readonly descriptionKey: string;
  /** Registered with `.hideHelp()` — deliberately absent from `--help`. */
  readonly hidden?: boolean;
  /**
   * Help text is rendered with runtime substitutions (a provider list, a
   * reason-code list). Exact-text comparison is not meaningful for these.
   */
  readonly templated?: boolean;
}

/** One positional argument on a family path, bound to its bilingual help row. */
export interface CliContractArgumentBinding {
  /** Commander argument name, e.g. `taskId`. */
  readonly name: string;
  readonly required: boolean;
  readonly variadic: boolean;
  /** Catalog key rendering this argument's help text. */
  readonly descriptionKey: string;
  /**
   * `true` when the description is wired onto the live Commander argument.
   * `false` when the argument is declared inline in `.command('x <y>')` and
   * carries contract metadata only — see `bindArgumentDescriptions`.
   */
  readonly bound: boolean;
}

/** The full contract for one command path in this family. */
export interface CliContractRow {
  /** Path segments, e.g. `['checkpoint', 'list']`. */
  readonly path: readonly string[];
  readonly effect: CliContractEffect;
  readonly defaultExecution: CliContractExecution;
  readonly output: CliContractOutput;
  readonly confirmation: CliContractConfirmation;
  readonly authority: CliContractAuthority;
  readonly prerequisites: readonly CliContractPrerequisite[];
  readonly platforms: readonly CliContractPlatform[];
  /** The path-level SSOT summary key this row must agree with. */
  readonly summaryKey: string;
  readonly options: readonly CliContractOptionBinding[];
  readonly arguments: readonly CliContractArgumentBinding[];
  /** Extra honesty notes rendered under the contract help block. */
  readonly notes?: readonly string[];
  /** When true, `renderContractHelp()` output is attached to `--help`. */
  readonly rendersHelpBlock?: boolean;
}

// ─── Resolution ─────────────────────────────────────────────────────────────

function interpolate(
  text: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

/**
 * Resolve a `cliContract.*` key for a language.
 *
 * Falls back to English for an unknown language and returns the key verbatim
 * for an unknown key — same contract as `getMessage`, so a missing row is
 * visible in output instead of silently rendering an empty string.
 */
export function cliContractMessage(
  key: string,
  lang?: string,
  params?: Readonly<Record<string, string | number>>,
): string {
  const row = CLI_RUN_MESSAGES[key];
  if (row === undefined) return key;
  const text = row[lang ?? DEFAULT_LANGUAGE] ?? row[DEFAULT_LANGUAGE];
  if (text === undefined) return key;
  return params === undefined ? text : interpolate(text, params);
}

/** Languages a `cliContract.*` key declares. Empty for an unknown key. */
export function cliContractMessageLanguages(key: string): readonly string[] {
  const row = CLI_RUN_MESSAGES[key];
  return row === undefined ? [] : Object.keys(row);
}

/** Join path segments the same way the path-level SSOT does. */
export function cliContractPathKey(path: readonly string[] | string): string {
  return Array.isArray(path) ? path.join(' ') : String(path);
}

/** The contract row for a path, or `undefined` when the path is not in this family. */
export function getCliContractRow(path: readonly string[] | string): CliContractRow | undefined {
  const key = cliContractPathKey(path);
  return CLI_RUN_FAMILY_CONTRACTS.find((row) => cliContractPathKey(row.path) === key);
}

// ─── Commander wiring helpers ───────────────────────────────────────────────

/**
 * The narrow slice of Commander's public `Argument` API this module touches.
 *
 * `description` is the public field Commander's help formatter reads; writing
 * it changes NOTHING about parsing (name / required / variadic are untouched).
 * This exists because `.command('set <key> <value>')` declares positionals
 * inline and Commander offers no inline way to describe them — calling
 * `.argument()` afterwards would append a SECOND argument and change
 * behaviour, which this family is explicitly forbidden from doing.
 */
interface DescribableArgument {
  name(): string;
  description: string;
}

interface ArgumentHost {
  readonly registeredArguments: readonly DescribableArgument[];
}

/**
 * Attach bilingual help text to already-declared positional arguments,
 * matched by argument NAME (never by index, so re-ordering cannot mis-bind).
 * Unknown names are ignored; parsing behaviour is untouched. Returns the same
 * command so it can be used inline at the head of a Commander chain.
 */
export function bindArgumentDescriptions<T extends ArgumentHost>(
  command: T,
  lang: string | undefined,
  bindings: Readonly<Record<string, string>>,
): T {
  for (const argument of command.registeredArguments ?? []) {
    const key = bindings[argument.name()];
    if (key !== undefined) argument.description = cliContractMessage(key, lang);
  }
  return command;
}

/**
 * Render the bilingual contract block appended under a command's `--help`.
 *
 * Every line is catalog-sourced; the function itself holds no display text
 * beyond structural punctuation.
 */
export function renderContractHelp(
  path: readonly string[] | string,
  lang?: string,
): string {
  const row = getCliContractRow(path);
  if (row === undefined) return '';
  const label = (name: string): string => cliContractMessage(`cliContract.label.${name}`, lang);
  const lines: string[] = [
    '',
    `${cliContractMessage('cliContract.label.contract', lang)}:`,
    `  ${label('effect')}: ${cliContractMessage(`cliContract.effect.${row.effect}`, lang)}`,
    `  ${label('execution')}: ${cliContractMessage(`cliContract.execution.${row.defaultExecution}`, lang)}`,
    `  ${label('confirmation')}: ${cliContractMessage(`cliContract.confirmation.${row.confirmation}`, lang)}`,
    `  ${label('authority')}: ${cliContractMessage(`cliContract.authority.${row.authority}`, lang)}`,
    `  ${label('output')}: ${cliContractMessage(`cliContract.output.${row.output}`, lang)}`,
    `  ${label('prerequisites')}: ${
      row.prerequisites.length === 0
        ? cliContractMessage('cliContract.prerequisite.none', lang)
        : row.prerequisites
            .map((p) => cliContractMessage(`cliContract.prerequisite.${p}`, lang))
            .join(', ')
    }`,
  ];
  for (const note of row.notes ?? []) lines.push(`  ${cliContractMessage(note, lang)}`);
  return `${lines.join('\n')}\n`;
}

// ─── Catalog ────────────────────────────────────────────────────────────────

/**
 * Bilingual help rows for the core / run-lifecycle command family.
 *
 * Key namespace: `cliContract.*` — reserved by this family.
 */
export const CLI_RUN_MESSAGES: MessageFamily = Object.freeze({
  // ── contract block vocabulary ─────────────────────────────────────────
  'cliContract.label.contract': { en: 'Contract', tr: 'Sözleşme' },
  'cliContract.label.effect': { en: 'Effect', tr: 'Etki' },
  'cliContract.label.execution': { en: 'Default execution', tr: 'Varsayılan yürütme' },
  'cliContract.label.confirmation': { en: 'Confirmation', tr: 'Onay' },
  'cliContract.label.authority': { en: 'Authority', tr: 'Yetki' },
  'cliContract.label.output': { en: 'Output', tr: 'Çıktı' },
  'cliContract.label.prerequisites': { en: 'Prerequisites', tr: 'Ön koşullar' },

  'cliContract.effect.read': {
    en: 'read-only — nothing on disk or in the database is modified',
    tr: 'salt-okunur — diskte veya veritabanında hiçbir şey değiştirilmez',
  },
  'cliContract.effect.group': {
    en: 'Command group; a bare invocation only renders help and selects no operation',
    tr: 'Komut grubu; çıplak çağrı yalnız help render eder ve işlem seçmez',
  },
  'cliContract.effect.mixed': {
    en: 'reads by default; an explicit option or argument may write state or start work',
    tr: 'varsayılan olarak okur; explicit seçenek veya argüman state yazabilir ya da iş başlatabilir',
  },
  'cliContract.effect.local-write': {
    en: 'writes project-local files and/or database rows',
    tr: 'proje-yerel dosyalara ve/veya veritabanı satırlarına yazar',
  },
  'cliContract.effect.process': {
    en: 'starts, drives or attaches to a process (workers, sessions, upgrades)',
    tr: 'süreç başlatır, yönetir veya sürece bağlanır (worker, oturum, güncelleme)',
  },
  'cliContract.effect.dangerous': {
    en: 'terminates running work — the effect is not reversible',
    tr: 'çalışan işi sonlandırır — etki geri alınamaz',
  },

  'cliContract.execution.read': {
    en: 'reads and reports; there is nothing to apply',
    tr: 'okur ve raporlar; uygulanacak bir şey yoktur',
  },
  'cliContract.execution.dry-run': {
    en: 'previews only; an explicit opt-in flag is required to apply',
    tr: 'yalnızca önizler; uygulamak için açık bir opt-in bayrağı gerekir',
  },
  'cliContract.execution.apply': {
    en: 'applies immediately when run without extra flags',
    tr: 'ek bayrak olmadan çalıştırıldığında hemen uygular',
  },

  'cliContract.confirmation.none': {
    en: 'none — no consent step is taken',
    tr: 'yok — onay adımı uygulanmaz',
  },
  'cliContract.confirmation.interactive': {
    en: 'interactive prompt, skippable with a non-interactive flag',
    tr: 'etkileşimli soru; etkileşimsiz bayrakla atlanabilir',
  },
  'cliContract.confirmation.flag-opt-in': {
    en: 'nothing is applied until an explicit opt-in flag is passed',
    tr: 'açık bir opt-in bayrağı verilmeden hiçbir şey uygulanmaz',
  },

  'cliContract.authority.none': {
    en: 'none — the command is its own authority',
    tr: 'yok — komut kendi yetkisidir',
  },
  'cliContract.authority.approval-gate': {
    en: 'a human approval gate decides whether the work proceeds',
    tr: 'işin devam edip etmeyeceğine insan onay kapısı karar verir',
  },
  'cliContract.authority.operator-attestation': {
    en: 'a named operator must attest on the command line before anything is written',
    tr: 'hiçbir şey yazılmadan önce adı verilen bir operatörün komut satırında beyanı gerekir',
  },
  'cliContract.authority.provider-admission': {
    en: 'provider admission (auth + budget policy) is preflighted before dispatch',
    tr: 'dispatch öncesi provider admission (kimlik + bütçe politikası) ön kontrolden geçer',
  },

  'cliContract.output.text': { en: 'human-readable text', tr: 'insan-okur metin' },
  'cliContract.output.text-and-json': {
    en: 'human-readable text, or a machine document with --json',
    tr: 'insan-okur metin veya --json ile makine dokümanı',
  },
  'cliContract.output.stream': {
    en: 'a continuous stream that keeps the terminal occupied',
    tr: 'terminali meşgul tutan sürekli akış',
  },

  'cliContract.prerequisite.none': { en: 'none', tr: 'yok' },
  'cliContract.prerequisite.project-init': {
    en: 'an initialized Deckent project (.deckent/)',
    tr: 'başlatılmış bir Deckent projesi (.deckent/)',
  },
  'cliContract.prerequisite.active-sprint': {
    en: 'an active or previously recorded sprint',
    tr: 'etkin veya daha önce kaydedilmiş bir sprint',
  },
  'cliContract.prerequisite.tmux': {
    en: 'a running tmux server (not available on win32 without a POSIX layer)',
    tr: 'çalışan bir tmux sunucusu (POSIX katmanı olmadan win32 üzerinde yoktur)',
  },
  'cliContract.prerequisite.docker': {
    en: 'a reachable Docker daemon when the docker spawn backend is selected',
    tr: 'docker spawn backend seçiliyse erişilebilir bir Docker daemon',
  },
  'cliContract.prerequisite.git': {
    en: 'a git working tree',
    tr: 'bir git çalışma ağacı',
  },
  'cliContract.prerequisite.network': {
    en: 'outbound network access',
    tr: 'dışa açık ağ erişimi',
  },
  'cliContract.prerequisite.provider-auth': {
    en: 'a configured, authenticated model provider',
    tr: 'yapılandırılmış ve kimliği doğrulanmış bir model provider',
  },

  // ── run: one-shot vs. compatibility namespace (documented, not changed) ─
  'cliContract.run.long': {
    en: 'Runs one provider-backed task and waits for its recorded result; it does not execute the full sprint lifecycle. The reserved first words start, status, retro, and history select compatibility subcommands instead.',
    tr: 'Provider-backed tek bir task çalıştırır ve kayıtlı sonucunu bekler; full sprint lifecycle yürütmez. Ayrılmış start, status, retro ve history ilk kelimeleri bunun yerine compatibility subcommand seçer.',
  },
  'cliContract.start.long': {
    en: 'Plans new work or consumes an explicitly approved RunFlow, performs the configured admission checks, and dispatches workers through the selected backend. Dry-run plans without dispatch; hidden exact-start capabilities are coordinator-owned and are never entered by hand.',
    tr: 'Yeni işi planlar veya açıkça onaylanmış bir RunFlow’u tüketir, yapılandırılmış admission check’lerini uygular ve worker’ları seçili backend üzerinden dispatch eder. Dry-run dispatch yapmadan planlar; gizli exact-start capability’leri coordinator’a aittir ve elle girilmez.',
  },
  'cliContract.plan.long': {
    en: 'Builds the canonical task plan from the active directives. Dry-run prints without task-file writes; normal execution follows the command’s approval and exact-projection checks before persisting plan artifacts.',
    tr: 'Etkin directives üzerinden canonical task planını kurar. Dry-run task file yazmadan gösterir; normal execution plan artifact’larını persist etmeden önce komutun approval ve exact-projection check’lerini uygular.',
  },
  'cliContract.status.long': {
    en: 'Projects the current run lifecycle, logical task progress, worker evidence, and alerts. Text views are for operators; --json emits the machine-readable read model, while --watch and --follow keep the terminal attached.',
    tr: 'Geçerli run lifecycle, logical task progress, worker evidence ve alert projeksiyonunu üretir. Metin görünümleri operator içindir; --json makine-okur read model üretir, --watch ve --follow ise terminali bağlı tutar.',
  },
  'cliContract.do.long': {
    en: 'Turns one goal into the governed golden-flow preview. The default is no-write preview; --run admits execution, and explicit confirmation or --yes controls the transition.',
    tr: 'Tek bir goal’ü governed golden-flow önizlemesine dönüştürür. Varsayılan yazmasız önizlemedir; --run execution admission’ı açar, explicit confirmation veya --yes geçişi kontrol eder.',
  },
  'cliContract.run.arg.description': {
    en: 'What the one-shot task should accomplish. The first word must not be start, status, retro or history — those are reserved sub-command names.',
    tr: 'Tek seferlik görevin ne yapması gerektiği. İlk kelime start, status, retro veya history olamaz — bunlar ayrılmış alt-komut adlarıdır.',
  },
  'cliContract.run.opt.model_effort': {
    en: 'Native model reasoning-effort (claude: low|medium|high|xhigh|max, codex: minimal|low|medium|high). Opt-in; unsupported or invalid levels are ignored',
    tr: 'Yerel model muhakeme-eforu (claude: low|medium|high|xhigh|max, codex: minimal|low|medium|high). Opt-in; desteklenmeyen veya geçersiz seviyeler yok sayılır',
  },
  'cliContract.run.opt.scope': {
    en: 'Worker scope directory (default: ./)',
    tr: 'Worker kapsam dizini (varsayılan: ./)',
  },
  'cliContract.run.opt.timeout': {
    en: 'Maximum wait time in milliseconds (default: 300000)',
    tr: 'Milisaniye cinsinden azami bekleme süresi (varsayılan: 300000)',
  },
  'cliContract.run.opt.keep': {
    en: 'Keep task files after completion (skip cleanup)',
    tr: 'Tamamlandıktan sonra görev dosyalarını koru (temizliği atla)',
  },
  'cliContract.run.opt.auto_approve': {
    en: 'Pass auto-approve flag to the worker',
    tr: 'Worker’a auto-approve bayrağını geçir',
  },
  'cliContract.run.opt.verbose': {
    en: 'Stream worker log output to stdout in real-time',
    tr: 'Worker log çıktısını gerçek zamanlı olarak stdout’a akıt',
  },
  'cliContract.run.arg.alias_args': {
    en: 'Arguments forwarded verbatim to the top-level command this alias delegates to',
    tr: 'Bu takma adın devrettiği üst-düzey komuta birebir iletilen argümanlar',
  },
  'cliContract.run.note.namespace': {
    en: '- Namespace: `run` carries BOTH a one-shot `run "<description>"` form and the compatibility sub-commands `run start|status|retro|history`. Commander resolves the sub-command first, so a one-shot description whose FIRST word is one of those four names is not reachable through `run` — call the top-level command instead. This overlap is deliberate and unchanged.',
    tr: '- Ad alanı: `run` hem tek seferlik `run "<açıklama>"` biçimini hem de uyumluluk alt-komutları `run start|status|retro|history` biçimini taşır. Commander önce alt-komutu çözer; bu nedenle İLK kelimesi bu dört addan biri olan tek seferlik bir açıklamaya `run` üzerinden ulaşılamaz — bunun yerine üst-düzey komutu çağırın. Bu örtüşme bilinçlidir ve değiştirilmemiştir.',
  },
  'cliContract.run.note.evidence': {
    en: '- The task runs outside the sprint cycle: no plan, no retro, no memory update. Its result lands as one task settlement record; `deckent output <taskId>` reads the persisted evidence afterwards.',
    tr: '- Görev sprint döngüsünün dışında çalışır: plan yok, retro yok, memory güncellemesi yok. Sonucu tek bir görev settlement kaydı olarak düşer; ardından `deckent output <taskId>` kalıcı kanıtı okur.',
  },

  // ── analyze ───────────────────────────────────────────────────────────
  'cliContract.analyze.opt.json': {
    en: 'Output raw JSON',
    tr: 'Ham JSON çıktısı ver',
  },
  'cliContract.analyze.opt.bootstrap_vocabulary': {
    en: 'Derive and write the project routing-vocabulary layer (.deckent/routing/vocabulary.json)',
    tr: 'Proje routing-vocabulary katmanını türet ve yaz (.deckent/routing/vocabulary.json)',
  },

  // ── attach ────────────────────────────────────────────────────────────
  'cliContract.attach.opt.list': {
    en: 'List all tmux windows without attaching',
    tr: 'Hiçbir oturuma bağlanmadan tüm tmux pencerelerini listele',
  },

  // ── checkpoint ────────────────────────────────────────────────────────
  'cliContract.checkpoint.arg.sprintId': {
    en: 'Sprint the checkpoint belongs to',
    tr: 'Checkpoint’in ait olduğu sprint',
  },
  'cliContract.checkpoint.arg.phase': {
    en: 'Sprint phase the checkpoint was raised in',
    tr: 'Checkpoint’in oluşturulduğu sprint aşaması',
  },

  // ── config ────────────────────────────────────────────────────────────
  'cliContract.config.opt.raw': {
    en: 'Show raw project config without merging defaults',
    tr: 'Varsayılanlarla birleştirmeden ham proje config’ini göster',
  },
  'cliContract.config.arg.key': {
    en: 'Configuration key (dot notation, e.g. terminal.run_flow_v2)',
    tr: 'Yapılandırma anahtarı (nokta gösterimi, örn. terminal.run_flow_v2)',
  },
  'cliContract.config.arg.value': {
    en: 'New value; JSON literals are parsed, anything else is stored as a string',
    tr: 'Yeni değer; JSON değişmezleri ayrıştırılır, diğer her şey metin olarak saklanır',
  },
  'cliContract.config.arg.export_file': {
    en: 'Destination file; omit to write the export to stdout',
    tr: 'Hedef dosya; dışa aktarımı stdout’a yazmak için boş bırakın',
  },
  'cliContract.config.arg.import_file': {
    en: 'JSON file to import the project configuration from',
    tr: 'Proje yapılandırmasının içe aktarılacağı JSON dosyası',
  },
  'cliContract.config.opt.dry_run': {
    en: 'Show what would be changed without modifying files',
    tr: 'Hiçbir dosyayı değiştirmeden neyin değişeceğini göster',
  },

  // ── connect ───────────────────────────────────────────────────────────
  'cliContract.connect.opt.provider': {
    en: 'Scope the report to a single provider ({providers})',
    tr: 'Raporu tek bir provider ile sınırla ({providers})',
  },
  'cliContract.connect.opt.json': {
    en: 'Output the report as JSON',
    tr: 'Raporu JSON olarak yazdır',
  },

  // ── dashboard ─────────────────────────────────────────────────────────
  'cliContract.dashboard.opt.interval': {
    en: 'Refresh interval in milliseconds (used as fallback when fs.watch unavailable)',
    tr: 'Milisaniye cinsinden yenileme aralığı (fs.watch kullanılamadığında yedek olarak kullanılır)',
  },
  'cliContract.dashboard.opt.no_color': {
    en: 'Disable ANSI colors (also respects NO_COLOR env var)',
    tr: 'ANSI renklerini kapat (NO_COLOR ortam değişkenine de uyar)',
  },
  'cliContract.dashboard.opt.json': {
    en: 'Output dashboard state as raw JSON and exit (shared format with deckent status --raw)',
    tr: 'Dashboard durumunu ham JSON olarak yazdırıp çık (deckent status --raw ile aynı format)',
  },

  // ── do ────────────────────────────────────────────────────────────────
  'cliContract.do.arg.goal': {
    en: 'The outcome the sprint should achieve, in one sentence',
    tr: 'Sprint’in ulaşması gereken sonuç, tek cümleyle',
  },
  'cliContract.do.opt.run': {
    en: 'Approve and start the sprint for real (default is a dry-run preview only)',
    tr: 'Sprint’i gerçekten onayla ve başlat (varsayılan yalnızca dry-run önizlemedir)',
  },
  'cliContract.do.opt.yes': {
    en: 'Non-interactive approval when RunFlow (terminal.run_flow_v2) is enabled — required together with --run to actually start; otherwise an honest reject (no interactive prompt)',
    tr: 'RunFlow (terminal.run_flow_v2) etkinken etkileşimsiz onay — gerçekten başlatmak için --run ile birlikte gereklidir; aksi hâlde dürüst bir ret döner (etkileşimli soru sorulmaz)',
  },
  'cliContract.do.opt.force_scope': {
    en: 'Bypass the pre-spawn scope gate (front-door mirror AND the detached child) — same consent as `deckent start --force-scope`',
    tr: 'Spawn öncesi kapsam kapısını atla (ön-kapı aynası VE ayrık alt süreç) — `deckent start --force-scope` ile aynı rıza',
  },

  // ── finalize ──────────────────────────────────────────────────────────
  'cliContract.finalize.note.projection': {
    en: '- Terminal projection: finalize publishes the sprint\'s terminal state DB-first — the database row is written first and the Markdown artifacts (MEMORY.md, RETRO.md, IDENTITY.md) are projected from it, so the files never become the source of truth.',
    tr: '- Terminal projeksiyon: finalize sprint’in terminal durumunu DB-first yayımlar — önce veritabanı satırı yazılır, Markdown çıktıları (MEMORY.md, RETRO.md, IDENTITY.md) ondan projekte edilir; böylece dosyalar asla doğruluk kaynağı hâline gelmez.',
  },
  'cliContract.finalize.note.terminal': {
    en: '- Finalizing is terminal for the sprint: re-running it on an already-finalized sprint is refused unless --force is passed.',
    tr: '- Finalize sprint için terminaldir: zaten finalize edilmiş bir sprintte yeniden çalıştırmak --force verilmedikçe reddedilir.',
  },

  // ── heartbeat ─────────────────────────────────────────────────────────
  'cliContract.heartbeat.opt.daemon': {
    en: 'Run in daemon mode (keeps running in foreground)',
    tr: 'Daemon modunda çalış (ön planda çalışmayı sürdürür)',
  },
  'cliContract.heartbeat.opt.interval': {
    en: 'Heartbeat interval in minutes (default: 30)',
    tr: 'Dakika cinsinden heartbeat aralığı (varsayılan: 30)',
  },
  'cliContract.heartbeat.opt.stop': {
    en: 'Stop a running heartbeat daemon',
    tr: 'Çalışan bir heartbeat daemon’ını durdur',
  },

  // ── init ──────────────────────────────────────────────────────────────
  'cliContract.init.opt.auto': {
    en: 'Auto-detect system, subscription, and project to generate recommendations',
    tr: 'Öneri üretmek için sistemi, aboneliği ve projeyi otomatik algıla',
  },
  'cliContract.init.opt.manual': {
    en: 'Skip auto-detection, use interactive prompts only',
    tr: 'Otomatik algılamayı atla, yalnızca etkileşimli soruları kullan',
  },
  'cliContract.init.opt.cursor': {
    en: 'Configure for Cursor IDE environment',
    tr: 'Cursor IDE ortamı için yapılandır',
  },
  'cliContract.init.opt.claude_code': {
    en: 'Configure for Claude Code environment (default)',
    tr: 'Claude Code ortamı için yapılandır (varsayılan)',
  },
  'cliContract.init.opt.env': {
    en: 'Comma-separated environments to configure (codex,cursor,gemini,vscode,shell)',
    tr: 'Yapılandırılacak ortamlar, virgülle ayrılmış (codex,cursor,gemini,vscode,shell)',
  },
  'cliContract.init.opt.all_envs': {
    en: 'Configure ALL environment configs',
    tr: 'TÜM ortam yapılandırmalarını hazırla',
  },
  'cliContract.init.opt.upgrade': {
    en: 'Update existing files while preserving user customizations (merge strategy)',
    tr: 'Kullanıcı özelleştirmelerini koruyarak mevcut dosyaları güncelle (birleştirme stratejisi)',
  },
  'cliContract.init.opt.force': {
    en: 'Force overwrite of existing env files without warning',
    tr: 'Mevcut ortam dosyalarını uyarmadan zorla üzerine yaz',
  },
  'cliContract.init.opt.repair': {
    en: 'Show which init steps failed and how to fix them',
    tr: 'Hangi init adımlarının başarısız olduğunu ve nasıl düzeltileceğini göster',
  },
  'cliContract.init.opt.no_image': {
    en: 'Skip the opt-in worker Docker image build offer (no prompt)',
    tr: 'Opsiyonel worker Docker imajı derleme teklifini atla (soru sorulmaz)',
  },

  // ── inspect ───────────────────────────────────────────────────────────
  'cliContract.inspect.arg.taskId': {
    en: 'Task to inspect; omit to inspect the canonical run list',
    tr: 'İncelenecek görev; canonical run listesini incelemek için boş bırakın',
  },

  // ── kill ──────────────────────────────────────────────────────────────
  'cliContract.kill.arg.taskId': {
    en: 'Worker task to terminate; omit together with --all to terminate every active worker',
    tr: 'Sonlandırılacak worker görevi; her etkin worker’ı sonlandırmak için --all ile birlikte boş bırakın',
  },
  'cliContract.kill.opt.all': {
    en: 'Kill all active workers',
    tr: 'Tüm etkin worker’ları sonlandır',
  },
  'cliContract.kill.opt.force': {
    en: 'Force kill (bypass panic guard)',
    tr: 'Zorla sonlandır (panik korumasını atla)',
  },
  'cliContract.kill.opt.user_explicit': {
    en: 'Explicit user confirmation for panic kill override',
    tr: 'Panik sonlandırma geçersiz kılma için açık kullanıcı onayı',
  },

  // ── onboard ───────────────────────────────────────────────────────────
  'cliContract.onboard.opt.non_interactive': {
    en: 'Skip interactive prompts, use defaults',
    tr: 'Etkileşimli soruları atla, varsayılanları kullan',
  },
  'cliContract.onboard.opt.force': {
    en: 'Re-run onboarding even if already initialized',
    tr: 'Zaten başlatılmış olsa bile onboarding’i yeniden çalıştır',
  },
  'cliContract.onboard.opt.plan_only': {
    en: 'Print the onboarding plan without prompting (non-interactive, CI/test path)',
    tr: 'Soru sormadan onboarding planını yazdır (etkileşimsiz, CI/test yolu)',
  },
  'cliContract.onboard.opt.json': {
    en: 'Output the --plan-only report as JSON',
    tr: '--plan-only raporunu JSON olarak yazdır',
  },
  'cliContract.onboard.opt.apply': {
    en: 'Apply the onboarding config plan: plan preview -> confirm -> write (project-scope)',
    tr: 'Onboarding config planını uygula: plan önizleme -> onay -> yazma (proje kapsamı)',
  },
  'cliContract.onboard.opt.dry_run': {
    en: 'Preview the onboarding apply without writing anything (implies --apply)',
    tr: 'Hiçbir şey yazmadan onboarding uygulamasını önizle (--apply anlamına gelir)',
  },
  'cliContract.onboard.opt.yes': {
    en: 'Skip the apply confirmation prompt (implies --apply)',
    tr: 'Uygulama onay sorusunu atla (--apply anlamına gelir)',
  },

  // ── output ────────────────────────────────────────────────────────────
  'cliContract.output.arg.taskId': {
    en: 'Worker task whose persisted output evidence should be read',
    tr: 'Kalıcı çıktı kanıtı okunacak worker görevi',
  },
  'cliContract.output.opt.tail': {
    en: 'Show the last N lines of the persisted worker output (default: 50)',
    tr: 'Kalıcı worker çıktısının son N satırını göster (varsayılan: 50)',
  },
  'cliContract.output.opt.follow': {
    en: 'Re-read the persisted output file every 2 seconds (polling, not a live process attach)',
    tr: 'Kalıcı çıktı dosyasını her 2 saniyede yeniden oku (yoklama; canlı sürece bağlanma değil)',
  },
  'cliContract.output.opt.sprint_id': {
    en: 'Sprint to read the persisted evidence from (defaults to the current sprint)',
    tr: 'Kalıcı kanıtın okunacağı sprint (varsayılan: geçerli sprint)',
  },
  'cliContract.output.opt.json': {
    en: 'Output raw JSON',
    tr: 'Ham JSON çıktısı ver',
  },
  'cliContract.output.note.evidence': {
    en: '- Reads only what the worker already persisted: its captured stdout/stderr log and the settled task result evidence on disk. It does not attach to a live process and cannot resurrect output a worker never wrote.',
    tr: '- Yalnızca worker’ın hâlihazırda kalıcılaştırdığını okur: yakalanmış stdout/stderr logu ve diskteki uzlaşmış görev sonucu kanıtı. Canlı bir sürece bağlanmaz ve worker’ın hiç yazmadığı çıktıyı geri getiremez.',
  },
  'cliContract.output.note.live': {
    en: '- For a live worker stream use `deckent watch --follow <taskId>` instead; --follow here only re-reads the file on a timer.',
    tr: '- Canlı worker akışı için bunun yerine `deckent watch --follow <taskId>` kullanın; buradaki --follow yalnızca dosyayı zamanlayıcıyla yeniden okur.',
  },

  // ── plan / plan-nl ────────────────────────────────────────────────────
  'cliContract.plan.opt.no_confirm': {
    en: 'Skip confirmation, auto-approve plan',
    tr: 'Onayı atla, planı otomatik onayla',
  },
  'cliContract.plan.opt.yes': {
    en: 'Non-interactive: auto-approve the plan (DRAFT → PENDING) without prompting',
    tr: 'Etkileşimsiz: planı soru sormadan otomatik onayla (DRAFT → PENDING)',
  },
  'cliContract.plan.opt.structured': {
    en: 'Force structured parsing (skip AI)',
    tr: 'Yapısal ayrıştırmayı zorla (AI’ı atla)',
  },
  'cliContract.plan.opt.dry_run': {
    en: 'Show plan without writing task files to disk',
    tr: 'Görev dosyalarını diske yazmadan planı göster',
  },
  'cliContract.plan.opt.interrogate': {
    en: 'Challenge directives with structural questions before planning',
    tr: 'Planlamadan önce direktifleri yapısal sorularla sorgula',
  },
  'cliContract.plan.opt.force_prompt_gate': {
    en: 'Bypass the plan-time prompt-gate BLOCK (persona-capability mismatch)',
    tr: 'Plan zamanı prompt-gate BLOCK kararını atla (persona-yetenek uyuşmazlığı)',
  },
  'cliContract.plan_nl.arg.goal': {
    en: 'Free-form description of what the sprint should accomplish',
    tr: 'Sprint’in ne başarması gerektiğinin serbest biçimli açıklaması',
  },
  'cliContract.plan_nl.opt.write': {
    en: 'Write the scaffold to DIRECTIVES.md (any existing file is backed up first)',
    tr: 'İskeleti DIRECTIVES.md dosyasına yaz (mevcut dosya önce yedeklenir)',
  },

  // ── process ───────────────────────────────────────────────────────────
  'cliContract.process.arg.description': {
    en: 'What the submitted execution should accomplish',
    tr: 'Gönderilen yürütmenin ne başarması gerektiği',
  },
  'cliContract.process.arg.executionId': {
    en: 'Execution id returned by `process submit`',
    tr: '`process submit` tarafından döndürülen yürütme kimliği',
  },
  'cliContract.process.opt.kind': {
    en: 'Execution kind: task (default), sprint, capability',
    tr: 'Yürütme türü: task (varsayılan), sprint, capability',
  },
  'cliContract.process.opt.scope_dir': {
    en: 'Scope directory for a code task (drives risk classification)',
    tr: 'Kod görevi için kapsam dizini (risk sınıflandırmasını belirler)',
  },
  'cliContract.process.opt.provider': {
    en: 'Provider override',
    tr: 'Provider geçersiz kılma',
  },
  'cliContract.process.opt.model': {
    en: 'Model override',
    tr: 'Model geçersiz kılma',
  },
  'cliContract.process.opt.root': {
    en: 'Project root override',
    tr: 'Proje kökü geçersiz kılma',
  },
  'cliContract.process.opt.lang': {
    en: 'Language override (en|tr)',
    tr: 'Dil geçersiz kılma (en|tr)',
  },

  // ── recover / resume ──────────────────────────────────────────────────
  'cliContract.recover.arg.sprint_id': {
    en: 'Sprint to recover',
    tr: 'Kurtarılacak sprint',
  },
  'cliContract.resume.arg.sprintId': {
    en: 'Sprint to resume, in the form sprint-<number>',
    tr: 'Devam ettirilecek sprint, sprint-<numara> biçiminde',
  },
  'cliContract.resume.opt.auto_approve': {
    en: 'Auto-approve all worker actions (skip permission prompts)',
    tr: 'Tüm worker eylemlerini otomatik onayla (izin sorularını atla)',
  },
  'cliContract.resume.opt.dry_run': {
    en: 'Show what would be resumed without actually running',
    tr: 'Gerçekten çalıştırmadan neyin devam ettirileceğini göster',
  },
  'cliContract.resume.opt.root': {
    en: 'Project root directory (defaults to cwd)',
    tr: 'Proje kök dizini (varsayılan: geçerli dizin)',
  },
  'cliContract.resume.opt.test_mode': {
    en: 'Internal test harness switch; hidden from public help and unsupported for operator use.',
    tr: 'Internal test harness anahtarıdır; public help yüzeyinden gizlidir ve operator kullanımı desteklenmez.',
  },
  'cliContract.resume.opt.outcome_file': {
    en: 'Internal path for the resume outcome receipt; hidden from public help and supplied by the harness.',
    tr: 'Resume outcome receipt’i için internal yoldur; public help yüzeyinden gizlidir ve harness tarafından sağlanır.',
  },

  // ── review ────────────────────────────────────────────────────────────
  'cliContract.review.opt.auto': {
    en: 'Auto-approve/reject based on task results',
    tr: 'Görev sonuçlarına göre otomatik onayla/reddet',
  },
  'cliContract.review.opt.json': {
    en: 'Output review state as JSON',
    tr: 'İnceleme durumunu JSON olarak yazdır',
  },
  'cliContract.review.opt.approve_all': {
    en: 'Approve all pending tasks',
    tr: 'Bekleyen tüm görevleri onayla',
  },
  'cliContract.review.opt.reject_all': {
    en: 'Reject all pending tasks',
    tr: 'Bekleyen tüm görevleri reddet',
  },

  // ── runs ──────────────────────────────────────────────────────────────
  'cliContract.runs.arg.n': {
    en: 'Run to target: the list number, or (for decide flags) a unique flowId prefix',
    tr: 'Hedeflenecek run: liste numarası veya (karar bayrakları için) benzersiz bir flowId öneki',
  },
  'cliContract.runs.opt.limit': {
    en: 'Show up to n inbox rows (default: the recent window; a flow-id prefix always resolves against every flow)',
    tr: 'En fazla n gelen kutusu satırı göster (varsayılan: son pencere; flow-id öneki her zaman tüm flow’lar arasında çözülür)',
  },
  'cliContract.runs.opt.close_stale': {
    en: 'Classify stale runs (dead process / unverifiable record); dry-run unless --yes',
    tr: 'Bayatlamış run’ları sınıflandır (ölü süreç / doğrulanamaz kayıt); --yes verilmedikçe dry-run',
  },
  'cliContract.runs.opt.retire_superseded': {
    en: 'Classify pending-approval runs a newer plan over the same source replaced; dry-run unless --yes',
    tr: 'Aynı kaynak üzerine gelen daha yeni bir planın yerini aldığı onay bekleyen run’ları sınıflandır; --yes verilmedikçe dry-run',
  },
  'cliContract.runs.opt.yes': {
    en: 'With --close-stale/--retire-superseded: durably write the closures',
    tr: '--close-stale/--retire-superseded ile: kapanışları kalıcı olarak yaz',
  },
  'cliContract.runs.opt.approve': {
    en: 'Approve run #n (SLOW AHEAD; add --start for FULL AHEAD)',
    tr: 'Run #n’i onayla (YAVAŞ İLERİ; TAM YOL İLERİ için --start ekleyin)',
  },
  'cliContract.runs.opt.reject': {
    en: 'Reject run #n (STOP)',
    tr: 'Run #n’i reddet (DUR)',
  },
  'cliContract.runs.opt.retire': {
    en: 'Retire an unstarted approved run #n (CANCELLED)',
    tr: 'Başlatılmamış onaylı run #n’i emekliye ayır (İPTAL EDİLDİ)',
  },
  'cliContract.runs.opt.reason': {
    en: 'Reason recorded with --reject',
    tr: '--reject ile birlikte kaydedilen gerekçe',
  },
  'cliContract.runs.opt.start': {
    en: 'Start the approved run #n as a detached background run',
    tr: 'Onaylı run #n’i ayrık arka plan run’ı olarak başlat',
  },
  'cliContract.runs.opt.diff': {
    en: 'Show run #n\'s real footprint as a unified diff',
    tr: 'Run #n’in gerçek ayak izini birleşik diff olarak göster',
  },
  'cliContract.runs.opt.commit': {
    en: 'Review-then-commit run #n\'s changes (shows the proposal, prompts unless --yes)',
    tr: 'Run #n’in değişikliklerini önce incele sonra commit et (öneriyi gösterir, --yes verilmedikçe sorar)',
  },
  'cliContract.runs.opt.message': {
    en: 'With --commit: use this commit message instead of the suggested one',
    tr: '--commit ile: önerilen mesaj yerine bu commit mesajını kullan',
  },

  // ── set-directives ────────────────────────────────────────────────────
  'cliContract.set_directives.opt.content': {
    en: 'Directive content to write directly',
    tr: 'Doğrudan yazılacak direktif içeriği',
  },
  'cliContract.set_directives.opt.file': {
    en: 'Read content from a file',
    tr: 'İçeriği bir dosyadan oku',
  },

  // ── spawn ─────────────────────────────────────────────────────────────
  'cliContract.spawn.arg.taskId': {
    en: 'Task the worker should be spawned for',
    tr: 'Worker’ın başlatılacağı görev',
  },
  'cliContract.spawn.opt.force': {
    en: 'Force respawn even if task is DONE or NO_GO',
    tr: 'Görev DONE veya NO_GO olsa bile yeniden başlatmayı zorla',
  },
  'cliContract.spawn.opt.auto_approve': {
    en: 'Enable auto-approve mode for the worker',
    tr: 'Worker için auto-approve modunu etkinleştir',
  },

  // ── start ─────────────────────────────────────────────────────────────
  'cliContract.start.arg.description': {
    en: 'One-line sprint description for zero-config mode; omit to plan from DIRECTIVES.md',
    tr: 'Zero-config mod için tek satırlık sprint açıklaması; DIRECTIVES.md üzerinden planlamak için boş bırakın',
  },
  'cliContract.start.opt.auto_approve': {
    en: 'Auto-approve worker actions (--dangerously-skip-permissions)',
    tr: 'Worker eylemlerini otomatik onayla (--dangerously-skip-permissions)',
  },
  'cliContract.start.opt.sandbox_mode': {
    en: 'Run in sandbox mode (git stash + restore)',
    tr: 'Sandbox modunda çalıştır (git stash + geri yükleme)',
  },
  'cliContract.start.opt.sandbox': {
    en: 'Use sandbox spawn backend (memory-cap + path-jail isolation, no Docker required)',
    tr: 'Sandbox spawn backend’ini kullan (bellek sınırı + yol hapsi yalıtımı, Docker gerekmez)',
  },
  'cliContract.start.opt.dry_run': {
    en: 'Plan sprint without spawning workers',
    tr: 'Worker başlatmadan sprint’i planla',
  },
  'cliContract.start.opt.force': {
    en: 'Skip doctor pre-flight checks',
    tr: 'Doctor ön uçuş kontrollerini atla',
  },
  'cliContract.start.opt.force_scope': {
    en: 'Bypass the pre-spawn scope gate (allow write paths that do not exist / look like typos)',
    tr: 'Spawn öncesi kapsam kapısını atla (var olmayan / yazım hatası gibi görünen yazma yollarına izin ver)',
  },
  'cliContract.start.opt.force_prompt_gate': {
    en: 'Bypass the plan-time prompt-gate BLOCK (persona-capability mismatch)',
    tr: 'Plan zamanı prompt-gate BLOCK kararını atla (persona-yetenek uyuşmazlığı)',
  },
  'cliContract.start.opt.force_replan': {
    en: 'Consciously bypass the approved-flow guard: plan fresh even though an approved, not-yet-executed RunFlow snapshot exists',
    tr: 'Onaylı-flow korumasını bilinçli olarak atla: onaylanmış ve henüz çalıştırılmamış bir RunFlow anlık görüntüsü olsa bile sıfırdan planla',
  },
  'cliContract.start.opt.consume_approved': {
    en: 'Consume a specific approved, not-yet-executed RunFlow snapshot through the canonical run-flow machinery (needed only when several approved flows exist)',
    tr: 'Onaylanmış ve henüz çalıştırılmamış belirli bir RunFlow anlık görüntüsünü canonical run-flow mekanizmasıyla tüket (yalnızca birden çok onaylı flow varsa gerekir)',
  },
  'cliContract.start.opt.watch': {
    en: 'Automatically open watch mode after sprint spawns workers',
    tr: 'Sprint worker’ları başlattıktan sonra izleme modunu otomatik aç',
  },
  'cliContract.start.opt.timeout': {
    en: 'Sprint timeout in milliseconds (default: 30 minutes)',
    tr: 'Milisaniye cinsinden sprint zaman aşımı (varsayılan: 30 dakika)',
  },
  'cliContract.start.opt.force_directives': {
    en: 'Override existing DIRECTIVES.md in zero-config mode',
    tr: 'Zero-config modda mevcut DIRECTIVES.md dosyasını geçersiz kıl',
  },
  'cliContract.start.opt.flow_id': {
    en: 'Consume an approved RunFlow snapshot instead of planning fresh — requires --revision, --plan-digest and config.terminal.run_flow_v2=true',
    tr: 'Sıfırdan planlamak yerine onaylı bir RunFlow anlık görüntüsünü tüket — --revision, --plan-digest ve config.terminal.run_flow_v2=true gerektirir',
  },
  'cliContract.start.opt.revision': {
    en: 'RunFlow proposal revision to CAS-verify against the approved snapshot (used with --flow-id)',
    tr: 'Onaylı anlık görüntüye karşı CAS ile doğrulanacak RunFlow öneri revizyonu (--flow-id ile kullanılır)',
  },
  'cliContract.start.opt.plan_digest': {
    en: 'RunFlow planDigest to CAS-verify against the approved snapshot (used with --flow-id)',
    tr: 'Onaylı anlık görüntüye karşı CAS ile doğrulanacak RunFlow planDigest değeri (--flow-id ile kullanılır)',
  },
  'cliContract.start.opt.exact_attempt_id': {
    en: 'Internal exact-start attempt identifier; hidden from public help and supplied by the run-flow coordinator.',
    tr: 'Internal exact-start attempt kimliğidir; public help yüzeyinden gizlidir ve run-flow coordinator tarafından sağlanır.',
  },
  'cliContract.start.opt.exact_owner_nonce': {
    en: 'Internal owner-capability nonce for exact start; hidden from public help and never entered by hand.',
    tr: 'Exact start için internal owner-capability nonce değeridir; public help yüzeyinden gizlidir ve elle girilmez.',
  },
  'cliContract.start.opt.exact_log_ref': {
    en: 'Internal exact-start log reference; hidden from public help and supplied by the detached-run coordinator.',
    tr: 'Internal exact-start log referansıdır; public help yüzeyinden gizlidir ve detached-run coordinator tarafından sağlanır.',
  },

  // ── sync ──────────────────────────────────────────────────────────────
  'cliContract.sync.opt.git_only': {
    en: 'Only detect git changes (skip adapter file sync)',
    tr: 'Yalnızca git değişikliklerini tespit et (adapter dosya eşitlemesini atla)',
  },
  'cliContract.sync.opt.adapters_only': {
    en: 'Only sync adapter files (skip git change detection)',
    tr: 'Yalnızca adapter dosyalarını eşitle (git değişiklik tespitini atla)',
  },
  'cliContract.sync.opt.dry_run': {
    en: 'Preview changes without writing anything',
    tr: 'Hiçbir şey yazmadan değişiklikleri önizle',
  },
  'cliContract.sync.opt.json': {
    en: 'Output result as JSON',
    tr: 'Sonucu JSON olarak yazdır',
  },

  // ── task settle ───────────────────────────────────────────────────────
  'cliContract.task.arg.taskId': {
    en: 'One-shot task whose settlement evidence should be inspected',
    tr: 'Settlement kanıtı incelenecek tek seferlik görev',
  },

  // ── test (Deckent test sprint) ────────────────────────────────────────
  'cliContract.test.opt.keep': {
    en: 'Skip cleanup — leave task files in place',
    tr: 'Temizliği atla — görev dosyalarını yerinde bırak',
  },
  'cliContract.test.opt.timeout': {
    en: 'Maximum sprint duration in milliseconds',
    tr: 'Milisaniye cinsinden azami sprint süresi',
  },
  'cliContract.test.opt.directives': {
    en: 'Path to a custom directives file (overrides DIRECTIVES.md)',
    tr: 'Özel bir direktif dosyasının yolu (DIRECTIVES.md yerine geçer)',
  },
  'cliContract.test.opt.sandbox': {
    en: 'Stash working tree changes before running, restore after (git stash)',
    tr: 'Çalıştırmadan önce çalışma ağacı değişikliklerini stash’le, sonra geri yükle (git stash)',
  },
  'cliContract.test.opt.model': {
    en: 'Force all tasks to use a specific model',
    tr: 'Tüm görevleri belirli bir modeli kullanmaya zorla',
  },
  'cliContract.test.opt.reporter': {
    en: 'Output format: default, junit, tap',
    tr: 'Çıktı biçimi: default, junit, tap',
  },
  'cliContract.test.opt.min_coverage': {
    en: 'Fail if coverage falls below this percentage (0-100)',
    tr: 'Kapsam bu yüzdenin altına düşerse başarısız say (0-100)',
  },
  'cliContract.test.note.scope': {
    en: '- This is a Deckent TEST SPRINT: it plans and runs real Deckent tasks end to end with retro, memory update and decay switched off. It is NOT the project\'s own unit-test runner — for that, run the project test command directly.',
    tr: '- Bu bir Deckent TEST SPRINT’idir: gerçek Deckent görevlerini uçtan uca planlar ve çalıştırır; retro, memory güncellemesi ve decay kapalıdır. Projenin kendi birim-test koşucusu DEĞİLDİR — onun için proje test komutunu doğrudan çalıştırın.',
  },
  'cliContract.test.note.reporter': {
    en: '- --reporter selects how the sprint outcome is printed (default, junit, tap); --min-coverage turns a reported coverage figure into a non-zero exit code.',
    tr: '- --reporter sprint sonucunun nasıl yazdırılacağını seçer (default, junit, tap); --min-coverage raporlanan kapsam değerini sıfırdan farklı bir çıkış koduna dönüştürür.',
  },

  // ── upgrade ───────────────────────────────────────────────────────────
  'cliContract.upgrade.opt.check': {
    en: 'Only check for updates, do not install',
    tr: 'Yalnızca güncelleme olup olmadığını denetle, kurma',
  },
  'cliContract.upgrade.opt.changelog': {
    en: 'Show changelog for the latest version and exit',
    tr: 'En son sürümün değişiklik günlüğünü göster ve çık',
  },
  'cliContract.upgrade.opt.canary': {
    en: 'Install from canary channel (pre-release)',
    tr: 'Canary kanalından kur (ön sürüm)',
  },
  'cliContract.upgrade.opt.beta': {
    en: 'Install from beta channel (pre-release)',
    tr: 'Beta kanalından kur (ön sürüm)',
  },
  'cliContract.upgrade.opt.rollback': {
    en: 'Roll back to the previous version',
    tr: 'Önceki sürüme geri dön',
  },
  'cliContract.upgrade.opt.local': {
    en: 'Install from a local .tgz file (beta development)',
    tr: 'Yerel bir .tgz dosyasından kur (beta geliştirme)',
  },

  // ── watch ─────────────────────────────────────────────────────────────
  'cliContract.watch.opt.follow': {
    en: 'Follow a specific worker live — docker logs -f (docker backend), tmux pane, or subprocess log',
    tr: 'Belirli bir worker’ı canlı takip et — docker logs -f (docker backend), tmux paneli veya alt süreç logu',
  },
});

// ─── Contract rows ──────────────────────────────────────────────────────────

const ALL: readonly CliContractPlatform[] = CLI_CONTRACT_PLATFORMS;

/**
 * Contract metadata for every core / run-lifecycle command path.
 *
 * `effect`, `defaultExecution` and `output` are asserted equal to the
 * path-level SSOT (`src/core/cli-command-contract.ts`) by the family test, so
 * this file can never drift into a second, disagreeing truth. `confirmation`,
 * `authority` and `prerequisites` are the axes this family ADDS; the test
 * proves each declared value is user-renderable in both languages and is
 * backed by a real flag where the value implies one.
 */
export const CLI_RUN_FAMILY_CONTRACTS: readonly CliContractRow[] = Object.freeze([
  {
    path: ['analyze'],
    effect: 'mixed',
    defaultExecution: 'read',
    output: 'text-and-json',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.analyze.desc',
    options: [
      { flags: '--json', descriptionKey: 'cliContract.analyze.opt.json' },
      { flags: '--bootstrap-vocabulary', descriptionKey: 'cliContract.analyze.opt.bootstrap_vocabulary' },
    ],
    arguments: [],
  },
  {
    path: ['attach'],
    effect: 'process',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['tmux'],
    platforms: ALL,
    summaryKey: 'cli.attach.desc',
    options: [{ flags: '--list', descriptionKey: 'cliContract.attach.opt.list' }],
    arguments: [],
  },
  {
    path: ['checkpoint'],
    effect: 'group',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: [],
    platforms: ALL,
    summaryKey: 'cli.checkpoint.desc',
    options: [],
    arguments: [],
  },
  {
    path: ['checkpoint', 'list'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text-and-json',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.checkpoint.list.desc',
    options: [
      { flags: '--pending', descriptionKey: 'checkpoint.pending_option' },
      { flags: '--json', descriptionKey: 'checkpoint.json_option' },
      { flags: '--lang <code>', descriptionKey: 'checkpoint.lang_option' },
    ],
    arguments: [],
  },
  {
    path: ['checkpoint', 'approve'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'approval-gate',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.checkpoint.approve.desc',
    options: [{ flags: '--lang <code>', descriptionKey: 'checkpoint.lang_option' }],
    arguments: [
      { name: 'sprintId', required: true, variadic: false, descriptionKey: 'cliContract.checkpoint.arg.sprintId', bound: true },
      { name: 'phase', required: true, variadic: false, descriptionKey: 'cliContract.checkpoint.arg.phase', bound: true },
    ],
  },
  {
    path: ['checkpoint', 'reject'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'approval-gate',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.checkpoint.reject.desc',
    options: [{ flags: '--lang <code>', descriptionKey: 'checkpoint.lang_option' }],
    arguments: [
      { name: 'sprintId', required: true, variadic: false, descriptionKey: 'cliContract.checkpoint.arg.sprintId', bound: true },
      { name: 'phase', required: true, variadic: false, descriptionKey: 'cliContract.checkpoint.arg.phase', bound: true },
    ],
  },
  {
    path: ['config'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.config.desc',
    options: [{ flags: '--raw', descriptionKey: 'cliContract.config.opt.raw' }],
    arguments: [],
  },
  {
    path: ['config', 'set'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.config.set.desc',
    options: [],
    arguments: [
      { name: 'key', required: true, variadic: false, descriptionKey: 'cliContract.config.arg.key', bound: true },
      { name: 'value', required: true, variadic: false, descriptionKey: 'cliContract.config.arg.value', bound: true },
    ],
  },
  {
    path: ['config', 'get'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.config.get.desc',
    options: [],
    arguments: [
      { name: 'key', required: true, variadic: false, descriptionKey: 'cliContract.config.arg.key', bound: true },
    ],
  },
  {
    path: ['config', 'export'],
    effect: 'mixed',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.config.export.desc',
    options: [],
    arguments: [
      { name: 'file', required: false, variadic: false, descriptionKey: 'cliContract.config.arg.export_file', bound: true },
    ],
  },
  {
    path: ['config', 'import'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.config.import.desc',
    options: [],
    arguments: [
      { name: 'file', required: true, variadic: false, descriptionKey: 'cliContract.config.arg.import_file', bound: true },
    ],
  },
  {
    path: ['config', 'list'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.config.list.desc',
    options: [],
    arguments: [],
  },
  {
    path: ['config', 'keys'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.config.keys.desc',
    options: [],
    arguments: [],
  },
  {
    path: ['config', 'migrate'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.config.migrate.desc',
    options: [{ flags: '--dry-run', descriptionKey: 'cliContract.config.opt.dry_run' }],
    arguments: [],
  },
  {
    path: ['connect'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text-and-json',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['network'],
    platforms: ALL,
    summaryKey: 'cli.connect.desc',
    options: [
      { flags: '--provider <name>', descriptionKey: 'cliContract.connect.opt.provider', templated: true },
      { flags: '--json', descriptionKey: 'cliContract.connect.opt.json' },
    ],
    arguments: [],
  },
  {
    path: ['dashboard'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text-and-json',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['active-sprint'],
    platforms: ALL,
    summaryKey: 'cli.dashboard.desc',
    options: [
      { flags: '--interval <ms>', descriptionKey: 'cliContract.dashboard.opt.interval' },
      { flags: '--no-color', descriptionKey: 'cliContract.dashboard.opt.no_color' },
      { flags: '--json', descriptionKey: 'cliContract.dashboard.opt.json' },
    ],
    arguments: [],
  },
  {
    path: ['do'],
    effect: 'process',
    defaultExecution: 'dry-run',
    output: 'text',
    confirmation: 'flag-opt-in',
    authority: 'approval-gate',
    prerequisites: ['project-init', 'provider-auth'],
    platforms: ALL,
    summaryKey: 'cli.do.desc',
    options: [
      { flags: '--run', descriptionKey: 'cliContract.do.opt.run' },
      { flags: '--yes', descriptionKey: 'cliContract.do.opt.yes' },
      { flags: '--force-scope', descriptionKey: 'cliContract.do.opt.force_scope' },
      { flags: '--write-allowlist <paths...>', descriptionKey: 'do.write_allowlist_option' },
    ],
    arguments: [
      { name: 'goal', required: true, variadic: false, descriptionKey: 'cliContract.do.arg.goal', bound: true },
    ],
  },
  {
    path: ['finalize'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init', 'active-sprint'],
    platforms: ALL,
    summaryKey: 'finalize.description',
    options: [
      { flags: '--sprint <id>', descriptionKey: 'finalize.sprint_option' },
      { flags: '--skip-decay', descriptionKey: 'finalize.skip_decay_option' },
      { flags: '--skip-hooks', descriptionKey: 'finalize.skip_hooks_option' },
      { flags: '--force', descriptionKey: 'finalize.force_option' },
    ],
    arguments: [],
    notes: ['cliContract.finalize.note.projection', 'cliContract.finalize.note.terminal'],
    rendersHelpBlock: true,
  },
  {
    path: ['heartbeat'],
    effect: 'process',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.heartbeat.desc',
    options: [
      { flags: '--daemon', descriptionKey: 'cliContract.heartbeat.opt.daemon' },
      { flags: '--interval <minutes>', descriptionKey: 'cliContract.heartbeat.opt.interval' },
      { flags: '--stop', descriptionKey: 'cliContract.heartbeat.opt.stop' },
    ],
    arguments: [],
  },
  {
    path: ['init'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'interactive',
    authority: 'none',
    prerequisites: [],
    platforms: ALL,
    summaryKey: 'cli.init.desc',
    options: [
      { flags: '--auto', descriptionKey: 'cliContract.init.opt.auto' },
      { flags: '--manual', descriptionKey: 'cliContract.init.opt.manual' },
      { flags: '--cursor', descriptionKey: 'cliContract.init.opt.cursor' },
      { flags: '--claude-code', descriptionKey: 'cliContract.init.opt.claude_code' },
      { flags: '--env <envs>', descriptionKey: 'cliContract.init.opt.env' },
      { flags: '--all-envs', descriptionKey: 'cliContract.init.opt.all_envs' },
      { flags: '--upgrade', descriptionKey: 'cliContract.init.opt.upgrade' },
      { flags: '--force', descriptionKey: 'cliContract.init.opt.force' },
      { flags: '--repair', descriptionKey: 'cliContract.init.opt.repair' },
      { flags: '-y, --yes', descriptionKey: 'init.option_yes' },
      { flags: '--install', descriptionKey: 'init.option_install' },
      { flags: '--no-install', descriptionKey: 'init.option_no_install' },
      { flags: '--no-image', descriptionKey: 'cliContract.init.opt.no_image' },
    ],
    arguments: [],
  },
  {
    path: ['inspect'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text-and-json',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'inspect.description',
    options: [
      { flags: '--json', descriptionKey: 'inspect.option.json' },
      { flags: '--follow', descriptionKey: 'inspect.option.follow' },
    ],
    arguments: [
      { name: 'taskId', required: false, variadic: false, descriptionKey: 'cliContract.inspect.arg.taskId', bound: true },
    ],
  },
  {
    path: ['kill'],
    effect: 'dangerous',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'interactive',
    authority: 'none',
    prerequisites: ['active-sprint'],
    platforms: ALL,
    summaryKey: 'cli.kill.desc',
    options: [
      { flags: '--all', descriptionKey: 'cliContract.kill.opt.all' },
      { flags: '--force', descriptionKey: 'cliContract.kill.opt.force' },
      { flags: '--user-explicit', descriptionKey: 'cliContract.kill.opt.user_explicit' },
    ],
    arguments: [
      { name: 'taskId', required: false, variadic: false, descriptionKey: 'cliContract.kill.arg.taskId', bound: true },
    ],
  },
  {
    path: ['onboard'],
    effect: 'local-write',
    defaultExecution: 'dry-run',
    output: 'text-and-json',
    confirmation: 'flag-opt-in',
    authority: 'none',
    prerequisites: [],
    platforms: ALL,
    summaryKey: 'cli.onboard.desc',
    options: [
      { flags: '--non-interactive', descriptionKey: 'cliContract.onboard.opt.non_interactive' },
      { flags: '--force', descriptionKey: 'cliContract.onboard.opt.force' },
      { flags: '--plan-only', descriptionKey: 'cliContract.onboard.opt.plan_only' },
      { flags: '--json', descriptionKey: 'cliContract.onboard.opt.json' },
      { flags: '--apply', descriptionKey: 'cliContract.onboard.opt.apply' },
      { flags: '--dry-run', descriptionKey: 'cliContract.onboard.opt.dry_run' },
      { flags: '-y, --yes', descriptionKey: 'cliContract.onboard.opt.yes' },
    ],
    arguments: [],
  },
  {
    path: ['output'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text-and-json',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.output.desc',
    options: [
      { flags: '--tail <n>', descriptionKey: 'cliContract.output.opt.tail' },
      { flags: '--follow', descriptionKey: 'cliContract.output.opt.follow' },
      { flags: '--sprint-id <sprintId>', descriptionKey: 'cliContract.output.opt.sprint_id' },
      { flags: '--json', descriptionKey: 'cliContract.output.opt.json' },
    ],
    arguments: [
      { name: 'taskId', required: true, variadic: false, descriptionKey: 'cliContract.output.arg.taskId', bound: true },
    ],
    notes: ['cliContract.output.note.evidence', 'cliContract.output.note.live'],
    rendersHelpBlock: true,
  },
  {
    path: ['plan-nl'],
    effect: 'mixed',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'flag-opt-in',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.plan_nl.desc',
    options: [{ flags: '--write', descriptionKey: 'cliContract.plan_nl.opt.write' }],
    arguments: [
      { name: 'goal', required: true, variadic: false, descriptionKey: 'cliContract.plan_nl.arg.goal', bound: true },
    ],
  },
  {
    path: ['plan'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'interactive',
    authority: 'approval-gate',
    prerequisites: ['project-init', 'provider-auth'],
    platforms: ALL,
    summaryKey: 'cli.plan.desc',
    options: [
      { flags: '--no-confirm', descriptionKey: 'cliContract.plan.opt.no_confirm' },
      { flags: '-y, --yes', descriptionKey: 'cliContract.plan.opt.yes' },
      { flags: '--structured', descriptionKey: 'cliContract.plan.opt.structured' },
      { flags: '--dry-run', descriptionKey: 'cliContract.plan.opt.dry_run' },
      { flags: '--interrogate', descriptionKey: 'cliContract.plan.opt.interrogate' },
      { flags: '--force-prompt-gate', descriptionKey: 'cliContract.plan.opt.force_prompt_gate' },
      { flags: '--force-scope', descriptionKey: 'plan.force_scope_option' },
      { flags: '--write-allowlist <paths...>', descriptionKey: 'do.write_allowlist_option' },
      { flags: '--adopt-existing <sprintId>', descriptionKey: 'plan.adopt_existing_option' },
      { flags: '--expected-plan-digest <sha256>', descriptionKey: 'plan.expected_plan_digest_option' },
      { flags: '--expected-projection-digest <sha256>', descriptionKey: 'plan.expected_projection_digest_option' },
      { flags: '--expected-canonical-projection-digest <sha256>', descriptionKey: 'plan.expected_canonical_projection_digest_option' },
      { flags: '--adoption-actor <actorId>', descriptionKey: 'plan.adoption_actor_option' },
      { flags: '--adoption-justification <text>', descriptionKey: 'plan.adoption_justification_option' },
    ],
    arguments: [],
  },
  {
    path: ['process'],
    effect: 'group',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: [],
    platforms: ALL,
    summaryKey: 'cli.process.desc',
    options: [],
    arguments: [],
  },
  {
    path: ['process', 'submit'],
    effect: 'process',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'approval-gate',
    prerequisites: ['project-init', 'provider-auth'],
    platforms: ALL,
    summaryKey: 'cli.process.submit.desc',
    options: [
      { flags: '--kind <kind>', descriptionKey: 'cliContract.process.opt.kind' },
      { flags: '--scope-dir <dir>', descriptionKey: 'cliContract.process.opt.scope_dir' },
      { flags: '--provider <provider>', descriptionKey: 'cliContract.process.opt.provider' },
      { flags: '--model <model>', descriptionKey: 'cliContract.process.opt.model' },
      { flags: '--root <path>', descriptionKey: 'cliContract.process.opt.root' },
      { flags: '--lang <code>', descriptionKey: 'cliContract.process.opt.lang' },
    ],
    arguments: [
      { name: 'description', required: true, variadic: false, descriptionKey: 'cliContract.process.arg.description', bound: true },
    ],
  },
  {
    path: ['process', 'status'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.process.status.desc',
    options: [
      { flags: '--root <path>', descriptionKey: 'cliContract.process.opt.root' },
      { flags: '--lang <code>', descriptionKey: 'cliContract.process.opt.lang' },
    ],
    arguments: [
      { name: 'executionId', required: true, variadic: false, descriptionKey: 'cliContract.process.arg.executionId', bound: true },
    ],
  },
  {
    path: ['process', 'result'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.process.result.desc',
    options: [
      { flags: '--root <path>', descriptionKey: 'cliContract.process.opt.root' },
      { flags: '--lang <code>', descriptionKey: 'cliContract.process.opt.lang' },
    ],
    arguments: [
      { name: 'executionId', required: true, variadic: false, descriptionKey: 'cliContract.process.arg.executionId', bound: true },
    ],
  },
  {
    path: ['recover'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text-and-json',
    confirmation: 'interactive',
    authority: 'none',
    prerequisites: ['project-init', 'active-sprint'],
    platforms: ALL,
    summaryKey: 'recover.description',
    options: [
      { flags: '--dry-run', descriptionKey: 'recover.dry_run_option' },
      { flags: '--force', descriptionKey: 'recover.force_option' },
      { flags: '--skip-audit', descriptionKey: 'recover.skip_audit_option' },
      { flags: '--restore-tasks', descriptionKey: 'recover.restore_tasks_option' },
      { flags: '--resume', descriptionKey: 'recover.resume_option' },
      { flags: '--auto-approve', descriptionKey: 'recover.auto_approve_option' },
      { flags: '--force-scope', descriptionKey: 'recover.force_scope_option' },
      { flags: '--json', descriptionKey: 'recover.json_option' },
    ],
    arguments: [
      { name: 'sprint-id', required: true, variadic: false, descriptionKey: 'cliContract.recover.arg.sprint_id', bound: true },
    ],
  },
  {
    path: ['resume'],
    effect: 'process',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init', 'active-sprint'],
    platforms: ALL,
    summaryKey: 'cli.resume.desc',
    options: [
      { flags: '--auto-approve', descriptionKey: 'cliContract.resume.opt.auto_approve' },
      { flags: '--dry-run', descriptionKey: 'cliContract.resume.opt.dry_run' },
      { flags: '--force-scope', descriptionKey: 'recover.force_scope_option' },
      { flags: '--root <path>', descriptionKey: 'cliContract.resume.opt.root' },
      { flags: '--test-mode', descriptionKey: 'cliContract.resume.opt.test_mode', hidden: true },
      { flags: '--outcome-file <path>', descriptionKey: 'cliContract.resume.opt.outcome_file', hidden: true },
    ],
    arguments: [
      { name: 'sprintId', required: true, variadic: false, descriptionKey: 'cliContract.resume.arg.sprintId', bound: true },
    ],
  },
  {
    path: ['review'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text-and-json',
    confirmation: 'none',
    authority: 'approval-gate',
    prerequisites: ['project-init', 'active-sprint'],
    platforms: ALL,
    summaryKey: 'cli.review.desc',
    options: [
      { flags: '--auto', descriptionKey: 'cliContract.review.opt.auto' },
      { flags: '--json', descriptionKey: 'cliContract.review.opt.json' },
      { flags: '--approve-all', descriptionKey: 'cliContract.review.opt.approve_all' },
      { flags: '--reject-all', descriptionKey: 'cliContract.review.opt.reject_all' },
    ],
    arguments: [],
  },
  {
    path: ['run'],
    effect: 'process',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'provider-admission',
    prerequisites: ['project-init', 'provider-auth'],
    platforms: ALL,
    summaryKey: 'cli.run.desc',
    options: [
      { flags: '--model <model>', descriptionKey: 'run.opt_model' },
      { flags: '--provider <name>', descriptionKey: 'run.opt_provider', templated: true },
      { flags: '--model-effort <level>', descriptionKey: 'cliContract.run.opt.model_effort' },
      { flags: '--scope <dir>', descriptionKey: 'cliContract.run.opt.scope' },
      { flags: '--timeout <ms>', descriptionKey: 'cliContract.run.opt.timeout' },
      { flags: '--keep', descriptionKey: 'cliContract.run.opt.keep' },
      { flags: '--auto-approve', descriptionKey: 'cliContract.run.opt.auto_approve' },
      { flags: '--verbose', descriptionKey: 'cliContract.run.opt.verbose' },
    ],
    arguments: [
      { name: 'description', required: true, variadic: false, descriptionKey: 'cliContract.run.arg.description', bound: true },
    ],
    notes: ['cliContract.run.note.namespace', 'cliContract.run.note.evidence'],
    rendersHelpBlock: true,
  },
  {
    path: ['run', 'start'],
    effect: 'process',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'run.alias_note',
    options: [],
    arguments: [
      { name: 'args', required: false, variadic: true, descriptionKey: 'cliContract.run.arg.alias_args', bound: true },
    ],
  },
  {
    path: ['run', 'status'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'run.alias_note',
    options: [],
    arguments: [
      { name: 'args', required: false, variadic: true, descriptionKey: 'cliContract.run.arg.alias_args', bound: true },
    ],
  },
  {
    path: ['run', 'retro'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'run.alias_note',
    options: [],
    arguments: [
      { name: 'args', required: false, variadic: true, descriptionKey: 'cliContract.run.arg.alias_args', bound: true },
    ],
  },
  {
    path: ['run', 'history'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'run.alias_note',
    options: [],
    arguments: [
      { name: 'args', required: false, variadic: true, descriptionKey: 'cliContract.run.arg.alias_args', bound: true },
    ],
  },
  {
    path: ['runs'],
    effect: 'mixed',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'flag-opt-in',
    authority: 'approval-gate',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.runs.desc',
    options: [
      { flags: '--limit <n>', descriptionKey: 'cliContract.runs.opt.limit' },
      { flags: '--close-stale', descriptionKey: 'cliContract.runs.opt.close_stale' },
      { flags: '--retire-superseded', descriptionKey: 'cliContract.runs.opt.retire_superseded' },
      { flags: '--yes', descriptionKey: 'cliContract.runs.opt.yes' },
      { flags: '--approve', descriptionKey: 'cliContract.runs.opt.approve' },
      { flags: '--reject', descriptionKey: 'cliContract.runs.opt.reject' },
      { flags: '--retire', descriptionKey: 'cliContract.runs.opt.retire' },
      { flags: '--reason <text>', descriptionKey: 'cliContract.runs.opt.reason' },
      { flags: '--start', descriptionKey: 'cliContract.runs.opt.start' },
      { flags: '--diff', descriptionKey: 'cliContract.runs.opt.diff' },
      { flags: '--commit', descriptionKey: 'cliContract.runs.opt.commit' },
      { flags: '--message <text>', descriptionKey: 'cliContract.runs.opt.message' },
    ],
    arguments: [
      { name: 'n', required: false, variadic: false, descriptionKey: 'cliContract.runs.arg.n', bound: true },
    ],
  },
  {
    path: ['set-directives'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'cli.set_directives.desc',
    options: [
      { flags: '--content <string>', descriptionKey: 'cliContract.set_directives.opt.content' },
      { flags: '--file <path>', descriptionKey: 'cliContract.set_directives.opt.file' },
    ],
    arguments: [],
  },
  {
    path: ['spawn'],
    effect: 'process',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'provider-admission',
    prerequisites: ['project-init', 'provider-auth', 'docker'],
    platforms: ALL,
    summaryKey: 'cli.spawn.desc',
    options: [
      { flags: '--force', descriptionKey: 'cliContract.spawn.opt.force' },
      { flags: '--auto-approve', descriptionKey: 'cliContract.spawn.opt.auto_approve' },
    ],
    arguments: [
      { name: 'taskId', required: true, variadic: false, descriptionKey: 'cliContract.spawn.arg.taskId', bound: true },
    ],
  },
  {
    path: ['start'],
    effect: 'process',
    defaultExecution: 'apply',
    output: 'stream',
    confirmation: 'interactive',
    authority: 'provider-admission',
    prerequisites: ['project-init', 'provider-auth', 'tmux'],
    platforms: ALL,
    summaryKey: 'cli.start.desc',
    options: [
      { flags: '--auto-approve', descriptionKey: 'cliContract.start.opt.auto_approve' },
      { flags: '--sandbox-mode', descriptionKey: 'cliContract.start.opt.sandbox_mode' },
      { flags: '--sandbox', descriptionKey: 'cliContract.start.opt.sandbox' },
      { flags: '--dry-run', descriptionKey: 'cliContract.start.opt.dry_run' },
      { flags: '--force', descriptionKey: 'cliContract.start.opt.force' },
      { flags: '--force-scope', descriptionKey: 'cliContract.start.opt.force_scope' },
      { flags: '--force-prompt-gate', descriptionKey: 'cliContract.start.opt.force_prompt_gate' },
      { flags: '--force-replan', descriptionKey: 'cliContract.start.opt.force_replan' },
      { flags: '--consume-approved <flowId>', descriptionKey: 'cliContract.start.opt.consume_approved' },
      { flags: '--watch', descriptionKey: 'cliContract.start.opt.watch' },
      { flags: '--timeout <ms>', descriptionKey: 'cliContract.start.opt.timeout' },
      { flags: '--force-directives', descriptionKey: 'cliContract.start.opt.force_directives' },
      { flags: '--flow-id <id>', descriptionKey: 'cliContract.start.opt.flow_id' },
      { flags: '--revision <n>', descriptionKey: 'cliContract.start.opt.revision' },
      { flags: '--plan-digest <digest>', descriptionKey: 'cliContract.start.opt.plan_digest' },
      { flags: '--exact-attempt-id <id>', descriptionKey: 'cliContract.start.opt.exact_attempt_id', hidden: true },
      { flags: '--exact-owner-nonce <nonce>', descriptionKey: 'cliContract.start.opt.exact_owner_nonce', hidden: true },
      { flags: '--exact-log-ref <path>', descriptionKey: 'cliContract.start.opt.exact_log_ref', hidden: true },
    ],
    arguments: [
      { name: 'description', required: false, variadic: false, descriptionKey: 'cliContract.start.arg.description', bound: true },
    ],
  },
  {
    path: ['sync'],
    effect: 'local-write',
    defaultExecution: 'apply',
    output: 'text-and-json',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['project-init', 'git'],
    platforms: ALL,
    summaryKey: 'cli.sync.desc',
    options: [
      { flags: '--git-only', descriptionKey: 'cliContract.sync.opt.git_only' },
      { flags: '--adapters-only', descriptionKey: 'cliContract.sync.opt.adapters_only' },
      { flags: '--dry-run', descriptionKey: 'cliContract.sync.opt.dry_run' },
      { flags: '--json', descriptionKey: 'cliContract.sync.opt.json' },
    ],
    arguments: [],
  },
  {
    path: ['task'],
    effect: 'group',
    defaultExecution: 'read',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: [],
    platforms: ALL,
    summaryKey: 'task.cmd_desc',
    options: [],
    arguments: [],
  },
  {
    path: ['task', 'settle'],
    effect: 'local-write',
    defaultExecution: 'dry-run',
    output: 'text-and-json',
    confirmation: 'flag-opt-in',
    authority: 'operator-attestation',
    prerequisites: ['project-init'],
    platforms: ALL,
    summaryKey: 'task.settle.desc',
    options: [
      { flags: '--apply', descriptionKey: 'task.settle.opt_apply' },
      { flags: '--attestation-reason <text>', descriptionKey: 'task.settle.opt_attestation_reason' },
      { flags: '--operator <id>', descriptionKey: 'task.settle.opt_operator' },
      { flags: '--reason-code <code>', descriptionKey: 'task.settle.opt_reason_code', templated: true },
      { flags: '--json', descriptionKey: 'task.settle.opt_json' },
    ],
    arguments: [
      { name: 'taskId', required: true, variadic: false, descriptionKey: 'cliContract.task.arg.taskId', bound: true },
    ],
  },
  {
    path: ['test'],
    effect: 'process',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'provider-admission',
    prerequisites: ['project-init', 'provider-auth'],
    platforms: ALL,
    summaryKey: 'cli.test_run.test.desc',
    options: [
      { flags: '--keep', descriptionKey: 'cliContract.test.opt.keep' },
      { flags: '--timeout <ms>', descriptionKey: 'cliContract.test.opt.timeout' },
      { flags: '--directives <file>', descriptionKey: 'cliContract.test.opt.directives' },
      { flags: '--sandbox', descriptionKey: 'cliContract.test.opt.sandbox' },
      { flags: '--model <model>', descriptionKey: 'cliContract.test.opt.model' },
      { flags: '--reporter <format>', descriptionKey: 'cliContract.test.opt.reporter' },
      { flags: '--min-coverage <percent>', descriptionKey: 'cliContract.test.opt.min_coverage' },
    ],
    arguments: [],
    notes: ['cliContract.test.note.scope', 'cliContract.test.note.reporter'],
    rendersHelpBlock: true,
  },
  {
    path: ['upgrade'],
    effect: 'process',
    defaultExecution: 'apply',
    output: 'text',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['network'],
    platforms: ALL,
    summaryKey: 'cli.upgrade.desc',
    options: [
      { flags: '--check', descriptionKey: 'cliContract.upgrade.opt.check' },
      { flags: '--changelog', descriptionKey: 'cliContract.upgrade.opt.changelog' },
      { flags: '--canary', descriptionKey: 'cliContract.upgrade.opt.canary' },
      { flags: '--beta', descriptionKey: 'cliContract.upgrade.opt.beta' },
      { flags: '--rollback', descriptionKey: 'cliContract.upgrade.opt.rollback' },
      { flags: '--local <path>', descriptionKey: 'cliContract.upgrade.opt.local' },
    ],
    arguments: [],
  },
  {
    path: ['watch'],
    effect: 'read',
    defaultExecution: 'read',
    output: 'stream',
    confirmation: 'none',
    authority: 'none',
    prerequisites: ['active-sprint', 'tmux'],
    platforms: ALL,
    summaryKey: 'cli.watch.desc',
    options: [{ flags: '--follow <taskId>', descriptionKey: 'cliContract.watch.opt.follow' }],
    arguments: [],
  },
]);

/** Every path key this family declares. */
export const CLI_RUN_FAMILY_PATHS: readonly string[] = Object.freeze(
  CLI_RUN_FAMILY_CONTRACTS.map((row) => cliContractPathKey(row.path)),
);
