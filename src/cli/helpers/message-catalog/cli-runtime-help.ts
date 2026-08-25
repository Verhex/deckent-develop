// User-facing option help for status, doctor, cleanup, and memory maintenance.
// This family describes the existing handlers; it contains no runtime logic.

import type { MessageFamily } from './cli-common.js';

export const CLI_RUNTIME_HELP_MESSAGES: MessageFamily = Object.freeze({
  'cli.runtime.cleanup.opt.decay': {
    en: 'Force the configured memory and debt decay pass during cleanup; managed Brain projections may be rewritten.',
    tr: 'Cleanup sırasında yapılandırılmış bellek ve debt decay geçişini zorlar; yönetilen Brain projeksiyonları yeniden yazılabilir.',
  },
  'cli.runtime.cleanup.opt.dry_run': {
    en: 'Preview the task, lock, prompt, and session artifacts cleanup would remove; write nothing.',
    tr: 'Cleanup işleminin kaldıracağı task, lock, prompt ve session artifact’larını önizler; hiçbir şey yazmaz.',
  },
  'cli.runtime.cleanup.opt.history': {
    en: 'Plan bounded runtime-history retention; the command remains a dry-run unless --apply is supplied.',
    tr: 'Sınırlı runtime-history saklama planı üretir; --apply verilmedikçe komut dry-run olarak kalır.',
  },
  'cli.runtime.cleanup.opt.apply': {
    en: 'Apply the runtime-history plan identified by --plan-digest.',
    tr: '--plan-digest ile tanımlanan runtime-history planını uygular.',
  },
  'cli.runtime.cleanup.opt.plan_digest': {
    en: 'Exact digest of the runtime-history plan required by --apply; changed authority is rejected.',
    tr: '--apply için gereken runtime-history planının exact digest’i; değişmiş authority reddedilir.',
  },
  'cli.runtime.cleanup.opt.json': {
    en: 'Emit the path-free runtime-history plan or receipt as one JSON document.',
    tr: 'Yol içermeyen runtime-history planını veya receipt’i tek bir JSON belgesi olarak yazar.',
  },

  'cli.runtime.doctor.opt.profile': {
    en: 'Show the detected host, runtime, and platform-adapter profile.',
    tr: 'Algılanan host, runtime ve platform-adapter profilini gösterir.',
  },
  'cli.runtime.doctor.opt.legacy': {
    en: 'Render the compatibility output format instead of the current diagnostic view.',
    tr: 'Geçerli tanılama görünümü yerine compatibility çıktı biçimini üretir.',
  },
  'cli.runtime.doctor.opt.json': {
    en: 'Emit doctor checks and evidence as one machine-readable JSON document.',
    tr: 'Doctor check’lerini ve kanıtlarını tek bir makine-okur JSON belgesi olarak yazar.',
  },
  'cli.runtime.doctor.opt.pre_flight': {
    en: 'Run the stricter health gates used before worker dispatch and exit non-zero when dispatch must be held.',
    tr: 'Worker dispatch öncesinde kullanılan daha sıkı sağlık gate’lerini çalıştırır; dispatch bekletilmeliyse sıfırdan farklı çıkar.',
  },
  'cli.runtime.doctor.opt.providers': {
    en: 'Show binary, version, reachability, and authentication evidence for provider adapters supported by doctor.',
    tr: 'Doctor tarafından desteklenen provider adapter’ları için binary, version, reachability ve authentication kanıtını gösterir.',
  },
  'cli.runtime.doctor.opt.memory': {
    en: 'Show detected host RAM, its evidence source, and the resulting max_workers recommendation.',
    tr: 'Algılanan host RAM’i, kanıt kaynağını ve bundan türetilen max_workers önerisini gösterir.',
  },
  'cli.runtime.doctor.opt.ram_experiment': {
    en: 'Evaluate the configured six-worker, 2 GiB-per-worker scenario against detected host RAM.',
    tr: 'Yapılandırılmış altı worker ve worker başına 2 GiB senaryosunu algılanan host RAM’e karşı değerlendirir.',
  },
  'cli.runtime.doctor.opt.fix_image': {
    en: 'After interactive confirmation, rebuild the worker image when doctor finds it missing or stale.',
    tr: 'Doctor worker image’ını eksik veya bayat bulduğunda interactive onaydan sonra image’ı yeniden oluşturur.',
  },
  'cli.runtime.doctor.opt.fix': {
    en: 'Preview the closed whitelist of safe local repairs. It deletes no live data and performs no provider login; use --yes to apply.',
    tr: 'Güvenli yerel onarımların kapalı whitelist’ini önizler. Canlı veri silmez ve provider login yapmaz; uygulamak için --yes kullanın.',
  },
  'cli.runtime.doctor.opt.yes': {
    en: 'Apply the repairs listed by --fix; has no effect without --fix.',
    tr: '--fix tarafından listelenen onarımları uygular; --fix olmadan etkisizdir.',
  },
  'cli.runtime.doctor.opt.dry_run': {
    en: 'Force --fix to remain a no-write preview; wins when --yes is also supplied.',
    tr: '--fix işlemini yazmasız önizleme olarak zorlar; --yes de verilmişse üstün gelir.',
  },

  'cli.runtime.memory.backup.opt.output': {
    en: 'Write the SQLite backup to this path instead of the generated project-local path.',
    tr: 'SQLite backup’ını üretilen proje-yerel yol yerine bu yola yazar.',
  },
  'cli.runtime.memory.backup.opt.checkpoint': {
    en: 'Print WAL checkpoint evidence before backup; the consistency checkpoint runs even when this flag is omitted.',
    tr: 'Backup öncesinde WAL checkpoint kanıtını yazdırır; consistency checkpoint bu bayrak verilmediğinde de çalışır.',
  },

  'cli.runtime.status.opt.watch': {
    en: 'Refresh the rendered status snapshot every two seconds until interrupted.',
    tr: 'Kesilene kadar render edilmiş status snapshot’ını iki saniyede bir yeniler.',
  },
  'cli.runtime.status.opt.follow': {
    en: 'Print the current snapshot, then stream newly appended run events.',
    tr: 'Geçerli snapshot’ı yazdırır, ardından yeni eklenen run event’lerini stream eder.',
  },
  'cli.runtime.status.opt.json': {
    en: 'Emit the canonical status read model as JSON instead of a rendered dashboard.',
    tr: 'Canonical status read modelini render edilmiş dashboard yerine JSON olarak yazar.',
  },
  'cli.runtime.status.opt.raw': {
    en: 'Render the legacy raw dashboard projection for compatibility.',
    tr: 'Compatibility için eski ham dashboard projeksiyonunu render eder.',
  },
  'cli.runtime.status.opt.verbose': {
    en: 'Include detailed agent, skill, and assignment evidence.',
    tr: 'Ayrıntılı agent, skill ve assignment kanıtını dahil eder.',
  },
  'cli.runtime.status.opt.no_color': {
    en: 'Disable ANSI color in rendered text output.',
    tr: 'Render edilmiş metin çıktısında ANSI rengini devre dışı bırakır.',
  },
  'cli.runtime.status.opt.graph': {
    en: 'Render the active run dependency graph as Mermaid text.',
    tr: 'Etkin run dependency graph’ını Mermaid metni olarak render eder.',
  },
  'cli.runtime.status.opt.mode': {
    en: 'Select a render identifier currently accepted by the handler: explainatory (explanatory view), standart (standard view), verbose, or json.',
    tr: 'Handler’ın şu anda kabul ettiği render identifier’ını seçer: explainatory (açıklamalı görünüm), standart (standard görünüm), verbose veya json.',
  },
});
