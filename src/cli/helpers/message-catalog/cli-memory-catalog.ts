// src/cli/helpers/message-catalog/cli-memory-catalog.ts
// ═══ CLI-CONTRACT-004 — `cli-memory-catalog` message-catalog family ════════
//
// A message-catalog FAMILY file (same shape as ./cli-common.ts): a standalone
// bilingual key/row map owned by exactly one task, so that adding help text
// never means editing the ~8.5k-line single object literal in
// src/cli/helpers/messages.ts and colliding with every other concurrent task.
//
// Scope of THIS family: the *option*, *argument* and *path-level* help
// metadata for the memory / evidence / catalog / extension command families —
// `recall`, `remember`, `history`, `explain`, `retro`, `kpi`, `features`,
// `truth`, `docs`, `audit`, `audit-verify`, `archive`, `archive-debt`,
// `cost`, `models`, `local-llm`, `mcp`, `usage`, `agent`, `skill`,
// `skill-marketplace`, `plugin`, `image`, `trace`.
//
// Those commands already served their one-line `.description()` from the base
// catalog, but every `--flag` help string and every positional argument was a
// bare English literal baked into the command module: invisible to the `tr`
// face, invisible to any catalog audit, and free to drift. This family closes
// that gap without widening the base catalog.
//
// ── Editorial contract for the rows below ────────────────────────────────
//
// 1. DB-FIRST TERMINOLOGY. The memory store is the authority. A row written
//    into it is an ENTRY; anything rendered *from* stored rows is a
//    PROJECTION (a read-model), never "the data" and never "the file". Help
//    text says which of the two a path touches.
//
// 2. READ vs MUTATION IS A PATH-LEVEL FACT. `archive inspect` / `archive
//    verify` read; `archive reconcile` / `archive terminal-repair` mutate.
//    `cost show` reads; `cost update` / `cost budget` mutate. `models list`
//    reads; `models activate` / `models policy` mutate. `local-llm status`
//    reads; `local-llm start` / `local-llm stop` mutate. The split is stated
//    on the PATH (a `*.help.paths` row rendered under the parent command),
//    not buried in a flag description, because the path is what the user
//    types.
//
// 3. NO VENDOR NARROWING WHERE THE MECHANISM IS NOT VENDOR-SCOPED. The Model
//    Context Protocol is an open, cross-host standard; `mcp` help therefore
//    describes the standard's own scope instead of framing the command as
//    parity with one particular host.
//
// 4. NO PROMISES THE CODE DOES NOT KEEP. `usage` really does read exactly one
//    transcript authority (Claude Code JSONL transcripts) for its token/limit
//    table, and archived task/result evidence for `--lineage`. The help says
//    exactly that instead of implying provider-neutral aggregation that is
//    not implemented.
//
// 5. NO INTERNAL SPRINT CODES IN USER-FACING TEXT. Sprint IDs, task IDs and
//    internal iteration labels are development bookkeeping; examples in help
//    text use neutral placeholders.

/** One catalog row: language code → rendered text. */
export type MessageFamilyRow = Readonly<Record<string, string>>;

/** A family catalog: message key → bilingual row. */
export type MessageFamily = Readonly<Record<string, MessageFamilyRow>>;

/** Language used when a caller does not pass one, and the final fallback face. */
const DEFAULT_LANGUAGE = 'en';

/**
 * Option / argument / path help for the memory, evidence, catalog and
 * extension command families.
 *
 * Key namespace: `cli.memcat.*` — reserved by this family. Nothing outside
 * this file may declare a key in it.
 */
export const CLI_MEMORY_CATALOG_MESSAGES: MessageFamily = Object.freeze({
  // ══ shared flags ═══════════════════════════════════════════════════════
  // One row per *meaning*, not per call site: every `--json` below renders a
  // stored projection, so they share a key instead of drifting apart.
  'cli.memcat.shared.opt.json': {
    en: 'Emit the read-model projection as JSON instead of a rendered table',
    tr: 'Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır',
  },
  'cli.memcat.shared.opt.json_raw': {
    en: 'Emit the raw projection as JSON and print nothing else',
    tr: 'Ham projeksiyonu JSON olarak yazdır ve başka hiçbir şey yazdırma',
  },
  'cli.memcat.shared.opt.lang': {
    en: 'Language override for this invocation: en | tr',
    tr: 'Bu çağrı için dil geçersiz kılma: en | tr',
  },

  // ══ recall — read path over memory entries ═════════════════════════════
  'cli.memcat.recall.arg.query': {
    en: 'Full-text query matched against stored memory entries (title, summary, content)',
    tr: 'Kayıtlı bellek entry’lerine (başlık, özet, içerik) karşı eşleştirilen tam metin sorgusu',
  },
  'cli.memcat.recall.opt.type': {
    en: 'Restrict to these entry types, comma-separated: adr, memory, sprint, debt, pattern',
    tr: 'Yalnızca bu entry tiplerine kısıtla, virgülle ayrılmış: adr, memory, sprint, debt, pattern',
  },
  'cli.memcat.recall.opt.limit': {
    en: 'Maximum number of matched entries in the projection',
    tr: 'Projeksiyondaki eşleşen entry sayısı üst sınırı',
  },
  'cli.memcat.recall.opt.sprint_min': {
    en: 'Drop entries recorded before this sprint number',
    tr: 'Bu sprint numarasından önce kaydedilen entry’leri ele',
  },
  'cli.memcat.recall.opt.mode': {
    en: 'Full-text token join: or (default, broader) | and (every token must match)',
    tr: 'Tam metin token birleştirme: or (varsayılan, daha geniş) | and (her token eşleşmeli)',
  },
  'cli.memcat.recall.help.paths': {
    en:
      '\nRead path: this command only queries the memory store; it never writes an entry.\n' +
      'Use `deckent remember` to add one.\n',
    tr:
      '\nOkuma yolu: bu komut yalnızca bellek deposunu sorgular, asla entry yazmaz.\n' +
      'Entry eklemek için `deckent remember` kullanın.\n',
  },

  // ══ remember — mutation path over memory entries ═══════════════════════
  'cli.memcat.remember.arg.note': {
    en: 'Note body stored as the entry content',
    tr: 'Entry içeriği olarak saklanan not gövdesi',
  },
  'cli.memcat.remember.opt.type': {
    en: 'Entry type recorded on the new row (default: memory)',
    tr: 'Yeni satıra kaydedilen entry tipi (varsayılan: memory)',
  },
  'cli.memcat.remember.opt.tags': {
    en: 'Comma-separated tags indexed with the entry',
    tr: 'Entry ile birlikte indekslenen, virgülle ayrılmış etiketler',
  },
  'cli.memcat.remember.opt.title': {
    en: 'Entry title (default: the first 60 characters of the note)',
    tr: 'Entry başlığı (varsayılan: notun ilk 60 karakteri)',
  },
  'cli.memcat.remember.help.paths': {
    en:
      '\nMutation path: this command inserts one entry into the memory store.\n' +
      'Read it back with `deckent recall`.\n',
    tr:
      '\nMutasyon yolu: bu komut bellek deposuna bir entry ekler.\n' +
      '`deckent recall` ile geri okuyun.\n',
  },

  // ══ history ════════════════════════════════════════════════════════════
  'cli.memcat.history.opt.agent': {
    en: 'Restrict the projection to entries recorded for this agent',
    tr: 'Projeksiyonu bu agent için kaydedilen entry’lere kısıtla',
  },
  'cli.memcat.history.opt.skill': {
    en: 'Restrict the projection to entries recorded for this skill',
    tr: 'Projeksiyonu bu skill için kaydedilen entry’lere kısıtla',
  },

  // ══ explain ════════════════════════════════════════════════════════════
  'cli.memcat.explain.opt.sprint': {
    en: 'Project a single stored sprint entry by its sprint ID',
    tr: 'Sprint ID’si ile tek bir kayıtlı sprint entry’sini projekte et',
  },
  'cli.memcat.explain.opt.task': {
    en: 'Project the stored routing-decision log for one task ID',
    tr: 'Tek bir task ID için kayıtlı routing-decision günlüğünü projekte et',
  },
  'cli.memcat.explain.opt.verbose': {
    en: 'Project every stored learning and the full task detail (default caps learnings at 3)',
    tr: 'Kayıtlı tüm öğrenimleri ve tam task detayını projekte et (varsayılan öğrenimleri 3 ile sınırlar)',
  },

  // ══ retro ══════════════════════════════════════════════════════════════
  'cli.memcat.retro.opt.raw': {
    en: 'Print the stored RETRO.md source instead of the rendered projection',
    tr: 'Render edilmiş projeksiyon yerine kayıtlı RETRO.md kaynağını yazdır',
  },
  'cli.memcat.retro.opt.compare': {
    en: 'Add a delta projection against the previous sprint entry',
    tr: 'Önceki sprint entry’sine karşı bir delta projeksiyonu ekle',
  },
  'cli.memcat.retro.opt.perf': {
    en: 'Add the agent and skill performance projections',
    tr: 'Agent ve skill performans projeksiyonlarını ekle',
  },
  'cli.memcat.retro.opt.trend': {
    en: 'Add a success-rate trend projection across the last N sprint entries (default: 5)',
    tr: 'Son N sprint entry’si boyunca başarı oranı trend projeksiyonu ekle (varsayılan: 5)',
  },

  // ══ kpi ════════════════════════════════════════════════════════════════
  'cli.memcat.kpi.opt.sprint': {
    en: 'Sprint ID to score (defaults to the current sprint entry)',
    tr: 'Puanlanacak sprint ID (varsayılan: mevcut sprint entry’si)',
  },
  'cli.memcat.kpi.opt.trend': {
    en: 'Project the trend series for a single KPI ID',
    tr: 'Tek bir KPI ID için trend serisini projekte et',
  },
  'cli.memcat.kpi.opt.n': {
    en: 'Number of sprint entries included in the trend projection (default: 10)',
    tr: 'Trend projeksiyonuna dahil edilen sprint entry sayısı (varsayılan: 10)',
  },

  // ══ features ═══════════════════════════════════════════════════════════
  'cli.memcat.features.opt.category': {
    en: 'Filter the projection by category: active, lightly_used, dormant, dead, all',
    tr: 'Projeksiyonu kategoriye göre filtrele: active, lightly_used, dormant, dead, all',
  },
  'cli.memcat.features.opt.id': {
    en: 'Project the detail view for a single feature ID',
    tr: 'Tek bir feature ID için detay görünümünü projekte et',
  },

  // ══ truth ══════════════════════════════════════════════════════════════
  'cli.memcat.truth.opt.json': {
    en: 'Emit the raw truth projection as JSON',
    tr: 'Ham truth projeksiyonunu JSON olarak yazdır',
  },
  'cli.memcat.truth.opt.check': {
    en:
      'Ratchet: compare current half-wire candidates against the pinned baseline ' +
      '(exit 1 = new candidate, exit 2 = no baseline)',
    tr:
      'Ratchet: mevcut half-wire adaylarını sabitlenmiş baseline ile karşılaştır ' +
      '(çıkış 1 = yeni aday, çıkış 2 = baseline yok)',
  },
  'cli.memcat.truth.opt.write': {
    en: 'With --check: rewrite the pinned baseline to the current candidate set (mutation)',
    tr: '--check ile birlikte: sabitlenmiş baseline’ı mevcut aday kümesine göre yeniden yaz (mutasyon)',
  },
  'cli.memcat.truth.baseline_note': {
    en: 'Pinned half-wire candidate ratchet. Regenerate with `deckent truth --check --write`.',
    tr: 'Sabitlenmiş half-wire aday ratchet’i. `deckent truth --check --write` ile yeniden üretin.',
  },

  // ══ docs ═══════════════════════════════════════════════════════════════
  'cli.memcat.docs.arg.path': {
    en: 'Path of the document to track as a doc entry',
    tr: 'Doc entry olarak takip edilecek dokümanın yolu',
  },
  'cli.memcat.docs.arg.path_or_id': {
    en: 'Tracked document path, or the doc entry ID',
    tr: 'Takip edilen doküman yolu veya doc entry ID’si',
  },
  'cli.memcat.docs.opt.auto': {
    en: 'Comma-separated section headings the doc runner may rewrite',
    tr: 'Doc runner’ın yeniden yazabileceği, virgülle ayrılmış bölüm başlıkları',
  },
  'cli.memcat.docs.opt.protect': {
    en: 'Comma-separated section headings the doc runner must never touch',
    tr: 'Doc runner’ın asla dokunmaması gereken, virgülle ayrılmış bölüm başlıkları',
  },
  'cli.memcat.docs.opt.skills': {
    en: 'Comma-separated skill IDs attached to the doc entry',
    tr: 'Doc entry’sine iliştirilen, virgülle ayrılmış skill ID’leri',
  },
  'cli.memcat.docs.opt.max_lines': {
    en: 'Line cap for auto-updated sections',
    tr: 'Otomatik güncellenen bölümler için satır üst sınırı',
  },
  'cli.memcat.docs.opt.set_max_lines': {
    en: 'Replace the line cap for auto-updated sections',
    tr: 'Otomatik güncellenen bölümler için satır üst sınırını değiştir',
  },
  'cli.memcat.docs.opt.add_auto': {
    en: 'Add auto-update sections to the entry (comma-separated)',
    tr: 'Entry’ye otomatik güncellenen bölümler ekle (virgülle ayrılmış)',
  },
  'cli.memcat.docs.opt.add_protect': {
    en: 'Add protected sections to the entry (comma-separated)',
    tr: 'Entry’ye korumalı bölümler ekle (virgülle ayrılmış)',
  },
  'cli.memcat.docs.opt.remove_auto': {
    en: 'Remove auto-update sections from the entry (comma-separated)',
    tr: 'Entry’den otomatik güncellenen bölümleri kaldır (virgülle ayrılmış)',
  },
  'cli.memcat.docs.opt.no_cache': {
    en: 'Clear the doc cache before the run',
    tr: 'Çalıştırmadan önce doc önbelleğini temizle',
  },
  'cli.memcat.docs.opt.no_write': {
    en: 'Record scan results in the store only; leave document front-matter untouched',
    tr: 'Tarama sonuçlarını yalnızca depoya kaydet; doküman front-matter’ına dokunma',
  },
  'cli.memcat.docs.opt.prune': {
    en: 'Delete doc entries whose document no longer exists',
    tr: 'Dokümanı artık var olmayan doc entry’lerini sil',
  },
  'cli.memcat.docs.opt.check': {
    en: 'After the scan, exit non-zero if any CRITICAL_STALE doc entry remains (CI gate)',
    tr: 'Tarama sonrasında CRITICAL_STALE bir doc entry kalırsa sıfırdan farklı çık (CI kapısı)',
  },
  'cli.memcat.docs.opt.max_rank': {
    en: 'With --check, gate only on entries whose doc_rank is at most n',
    tr: '--check ile birlikte, yalnızca doc_rank değeri en fazla n olan entry’lerde kapı uygula',
  },
  'cli.memcat.docs.opt.stale': {
    en: 'Restrict the projection to DRIFT, STALE and CRITICAL_STALE entries',
    tr: 'Projeksiyonu DRIFT, STALE ve CRITICAL_STALE entry’lerine kısıtla',
  },
  'cli.memcat.docs.opt.rank': {
    en: 'Restrict the projection to entries whose doc_rank is at most n',
    tr: 'Projeksiyonu doc_rank değeri en fazla n olan entry’lere kısıtla',
  },

  // ══ audit / audit-verify ═══════════════════════════════════════════════
  'cli.memcat.audit.arg.sprint_id': {
    en: 'Sprint ID to audit; omit it and use a subcommand for the query/compliance paths',
    tr: 'Denetlenecek sprint ID; query/compliance yolları için bunu boş bırakıp alt komut kullanın',
  },
  'cli.memcat.audit.opt.sprint': {
    en: 'Sprint ID used by the query, compliance, forward and retention subcommands',
    tr: 'query, compliance, forward ve retention alt komutlarının kullandığı sprint ID',
  },
  'cli.memcat.audit.opt.tenant': {
    en: 'query path: keep only audit events recorded for this tenant ID',
    tr: 'query yolu: yalnızca bu tenant ID için kaydedilen audit olaylarını tut',
  },
  'cli.memcat.audit.opt.action': {
    en: 'query path: keep only audit events recorded for this action/channel',
    tr: 'query yolu: yalnızca bu action/channel için kaydedilen audit olaylarını tut',
  },
  'cli.memcat.audit.opt.since': {
    en: 'query path: keep only audit events at or after this ISO 8601 timestamp',
    tr: 'query yolu: yalnızca bu ISO 8601 zaman damgasında veya sonrasındaki audit olaylarını tut',
  },
  'cli.memcat.audit.opt.role': {
    en: 'query path: caller role enforced by RBAC — admin | operator | viewer',
    tr: 'query yolu: RBAC tarafından uygulanan çağıran rolü — admin | operator | viewer',
  },
  'cli.memcat.audit.opt.out': {
    en: 'forward path: output file (default: .deckent/siem-export.jsonl)',
    tr: 'forward yolu: çıktı dosyası (varsayılan: .deckent/siem-export.jsonl)',
  },
  'cli.memcat.audit.opt.url': {
    en: 'forward path: POST audit records to an HTTP(S) SIEM endpoint (takes precedence over --syslog and --out)',
    tr: 'forward yolu: audit kayıtlarını bir HTTP(S) SIEM uç noktasına POST et (--syslog ve --out’tan önceliklidir)',
  },
  'cli.memcat.audit.opt.syslog': {
    en: 'forward path: send audit records to an RFC 5424 syslog collector (takes precedence over --out)',
    tr: 'forward yolu: audit kayıtlarını RFC 5424 syslog toplayıcısına gönder (--out’tan önceliklidir)',
  },
  'cli.memcat.audit.opt.syslog_protocol': {
    en: 'forward path: syslog wire protocol — udp | tcp',
    tr: 'forward yolu: syslog aktarım protokolü — udp | tcp',
  },
  'cli.memcat.audit.opt.keep_days': {
    en: 'retention path: prune audit events older than n days',
    tr: 'retention yolu: n günden eski audit olaylarını buda',
  },
  'cli.memcat.audit.opt.keep_count': {
    en: 'retention path: archive audit events beyond the most recent n',
    tr: 'retention yolu: en yeni n olayın ötesindeki audit olaylarını arşivle',
  },
  'cli.memcat.audit.opt.apply': {
    en: 'retention path: apply the plan — without it the run stays a dry-run',
    tr: 'retention yolu: planı uygula — bu olmadan çalıştırma dry-run kalır',
  },
  'cli.memcat.audit.error.sprint_required': {
    en: 'audit: a sprint ID is required (for example `deckent audit <sprint-id>`), or use `deckent audit query [options]`',
    tr: 'audit: bir sprint ID gerekli (örneğin `deckent audit <sprint-id>`) ya da `deckent audit query [seçenekler]` kullanın',
  },
  'cli.memcat.audit.help.paths': {
    en:
      '\nRead paths: `audit <sprint-id>`, `audit query`, `audit compliance` — they only project stored audit events.\n' +
      'Mutation paths: `audit forward` writes an export target, `audit retention --apply` prunes or archives stored events.\n' +
      'Without --apply the retention path is a dry-run projection.\n',
    tr:
      '\nOkuma yolları: `audit <sprint-id>`, `audit query`, `audit compliance` — yalnızca kayıtlı audit olaylarını projekte eder.\n' +
      'Mutasyon yolları: `audit forward` bir dışa aktarma hedefine yazar, `audit retention --apply` kayıtlı olayları budar veya arşivler.\n' +
      '--apply olmadan retention yolu bir dry-run projeksiyonudur.\n',
  },

  // ══ archive / archive-debt ═════════════════════════════════════════════
  'cli.memcat.archive.help.paths': {
    en:
      '\nRead paths: `archive inspect`, `archive verify`, `archive terminal-inspect`, `archive terminal-verify`\n' +
      '  — they build projections over archived evidence and change no archive state.\n' +
      'Mutation paths: `archive reconcile --apply` and `archive terminal-repair` rewrite archive state.\n' +
      '  `archive reconcile` without --apply stays a dry-run projection.\n',
    tr:
      '\nOkuma yolları: `archive inspect`, `archive verify`, `archive terminal-inspect`, `archive terminal-verify`\n' +
      '  — arşivlenmiş kanıt üzerinde projeksiyon üretir, arşiv durumunu değiştirmez.\n' +
      'Mutasyon yolları: `archive reconcile --apply` ve `archive terminal-repair` arşiv durumunu yeniden yazar.\n' +
      '  `archive reconcile` --apply olmadan dry-run projeksiyonu olarak kalır.\n',
  },
  'cli.memcat.archive_debt.opt.count': {
    en: 'Project only the open/resolved counts, not the individual entries',
    tr: 'Tek tek entry’leri değil, yalnızca açık/çözülmüş sayılarını projekte et',
  },
  'cli.memcat.archive_debt.opt.before': {
    en: 'Also project resolved entries that originate before this sprint ID',
    tr: 'Bu sprint ID’sinden önce ortaya çıkan çözülmüş entry’leri de projekte et',
  },

  // ══ cost ═══════════════════════════════════════════════════════════════
  'cli.memcat.cost.opt.provider_filter': {
    en: 'Restrict the pricing projection to one provider (anthropic, openai, google)',
    tr: 'Fiyatlandırma projeksiyonunu tek bir provider ile sınırla (anthropic, openai, google)',
  },
  'cli.memcat.cost.opt.model': {
    en: 'Project the detail view for a single model ID',
    tr: 'Tek bir model ID için detay görünümünü projekte et',
  },
  'cli.memcat.cost.opt.provider_update': {
    en: 'Refresh stored pricing for this provider only',
    tr: 'Yalnızca bu provider için kayıtlı fiyatlandırmayı yenile',
  },
  'cli.memcat.cost.opt.dry_run': {
    en: 'Project the pricing delta without writing it back',
    tr: 'Fiyatlandırma deltasını geri yazmadan projekte et',
  },
  'cli.memcat.cost.opt.skip_validation': {
    en: 'Skip the OpenRouter delta cross-check before writing',
    tr: 'Yazmadan önceki OpenRouter delta çapraz kontrolünü atla',
  },
  'cli.memcat.cost.opt.set': {
    en: 'Write the per-sprint maximum budget, in USD',
    tr: 'Sprint başına maksimum bütçeyi USD olarak yaz',
  },
  'cli.memcat.cost.opt.daily': {
    en: 'Write the daily maximum budget, in USD',
    tr: 'Günlük maksimum bütçeyi USD olarak yaz',
  },
  'cli.memcat.cost.opt.monthly': {
    en: 'Write the monthly maximum budget, in USD',
    tr: 'Aylık maksimum bütçeyi USD olarak yaz',
  },
  'cli.memcat.cost.help.paths': {
    en:
      '\nRead path: `cost show` projects stored pricing and writes nothing.\n' +
      'Mutation paths: `cost update` refreshes stored pricing from upstream sources;\n' +
      '  `cost budget` with any of --set/--daily/--monthly writes budget configuration.\n' +
      '  `cost budget` with no flag is a read-only projection.\n',
    tr:
      '\nOkuma yolu: `cost show` kayıtlı fiyatlandırmayı projekte eder, hiçbir şey yazmaz.\n' +
      'Mutasyon yolları: `cost update` kayıtlı fiyatlandırmayı yukarı akış kaynaklarından yeniler;\n' +
      '  `cost budget` --set/--daily/--monthly bayraklarından biriyle bütçe yapılandırmasını yazar.\n' +
      '  Bayraksız `cost budget` salt-okunur bir projeksiyondur.\n',
  },

  // ══ models ═════════════════════════════════════════════════════════════
  'cli.memcat.models.arg.model': {
    en: 'Model ID exactly as the catalog entry records it',
    tr: 'Katalog entry’sinde kayıtlı olduğu şekliyle model ID’si',
  },
  'cli.memcat.models.arg.policy_provider': {
    en: 'Provider whose activation policy is read or written; omit to project every provider',
    tr: 'Aktivasyon policy’si okunacak veya yazılacak provider; tümünü projekte etmek için boş bırakın',
  },
  'cli.memcat.models.arg.policy_mode': {
    en: 'Policy mode to write: implicit-active | explicit-active; omit to read the current mode',
    tr: 'Yazılacak policy modu: implicit-active | explicit-active; mevcut modu okumak için boş bırakın',
  },
  'cli.memcat.models.opt.provider_filter': {
    en: 'Restrict the catalog projection to one provider ({providers})',
    tr: 'Katalog projeksiyonunu tek bir provider ile sınırla ({providers})',
  },
  'cli.memcat.models.opt.offline': {
    en: 'Read the cached or bundled catalog only; never reach the network',
    tr: 'Yalnızca önbellekteki veya paketlenmiş katalogu oku; ağa hiç çıkma',
  },
  'cli.memcat.models.opt.provider_required': {
    en: 'Provider that serves this model',
    tr: 'Bu modeli sunan provider',
  },
  'cli.memcat.models.help.paths': {
    en:
      '\nRead paths: `models list`, `models activation`, `models active-set`, `models tier`,\n' +
      '  and `models policy <provider>` with no mode — all project the stored catalog.\n' +
      'Mutation paths: `models activate`, `models deactivate`, `models refresh`, and\n' +
      '  `models policy <provider> <mode>` — all write catalog or activation state.\n',
    tr:
      '\nOkuma yolları: `models list`, `models activation`, `models active-set`, `models tier`\n' +
      '  ve mod verilmeden `models policy <provider>` — tümü kayıtlı katalogu projekte eder.\n' +
      'Mutasyon yolları: `models activate`, `models deactivate`, `models refresh` ve\n' +
      '  `models policy <provider> <mode>` — tümü katalog veya aktivasyon durumunu yazar.\n',
  },

  // ══ local-llm ══════════════════════════════════════════════════════════
  'cli.memcat.local_llm.help.paths': {
    en:
      '\nRead path: `status` probes health and the advertised model list; it starts nothing.\n' +
      'Mutation paths: `start` launches the project-scoped server, `stop` terminates it.\n',
    tr:
      '\nOkuma yolu: `status` sağlığı ve sunulan model listesini yoklar; hiçbir şey başlatmaz.\n' +
      'Mutasyon yolları: `start` proje kapsamlı sunucuyu başlatır, `stop` sonlandırır.\n',
  },

  // ══ mcp — an open, cross-host standard ═════════════════════════════════
  'cli.memcat.mcp.desc': {
    en: 'Manage Model Context Protocol servers — an open standard, portable across every MCP-capable host',
    tr: 'Model Context Protocol sunucularını yönetin — MCP destekleyen her host arasında taşınabilir açık bir standart',
  },
  'cli.memcat.mcp.arg.name': {
    en: 'Server name, unique within the selected scope',
    tr: 'Seçilen scope içinde benzersiz olan sunucu adı',
  },
  'cli.memcat.mcp.arg.cmd_or_url': {
    en: 'Launch command for a stdio server, or the endpoint URL for an http server',
    tr: 'stdio sunucusu için başlatma komutu ya da http sunucusu için uç nokta URL’si',
  },
  'cli.memcat.mcp.arg.args': {
    en: 'Extra arguments passed to a stdio server launch command',
    tr: 'stdio sunucusu başlatma komutuna geçirilen ek argümanlar',
  },
  'cli.memcat.mcp.opt.scope_add': {
    en: 'Config scope written to: project | user | local',
    tr: 'Yazılacak yapılandırma scope’u: project | user | local',
  },
  'cli.memcat.mcp.opt.scope_remove': {
    en: 'Restrict removal to one scope: project | user | local (default: search all)',
    tr: 'Kaldırmayı tek bir scope ile sınırla: project | user | local (varsayılan: tümünde ara)',
  },
  'cli.memcat.mcp.opt.transport': {
    en: 'Transport: stdio | http (auto-detected when omitted)',
    tr: 'Taşıma: stdio | http (verilmezse otomatik algılanır)',
  },
  'cli.memcat.mcp.opt.header': {
    en: 'HTTP header as key=value; repeat for several headers',
    tr: 'key=value biçiminde HTTP başlığı; birden fazlası için tekrarlayın',
  },
  'cli.memcat.mcp.opt.env': {
    en: 'stdio environment variable as key=value; repeat for several variables',
    tr: 'key=value biçiminde stdio ortam değişkeni; birden fazlası için tekrarlayın',
  },
  'cli.memcat.mcp.help.paths': {
    en:
      '\nMCP is a host-neutral standard: a server registered here is described by the protocol,\n' +
      'not by any single client, and the same entry can be consumed by any MCP-capable host.\n' +
      'Read paths: `mcp list` and `mcp get` project the merged view (local > project > user).\n' +
      'Mutation paths: `mcp add` and `mcp remove` rewrite the .mcp.json of the selected scope.\n',
    tr:
      '\nMCP host’tan bağımsız bir standarttır: burada kayıtlı bir sunucu tek bir istemciye göre değil,\n' +
      'protokole göre tanımlanır ve aynı entry MCP destekleyen her host tarafından tüketilebilir.\n' +
      'Okuma yolları: `mcp list` ve `mcp get` birleşik görünümü projekte eder (local > project > user).\n' +
      'Mutasyon yolları: `mcp add` ve `mcp remove` seçilen scope’un .mcp.json dosyasını yeniden yazar.\n',
  },

  // ══ usage — one transcript authority, stated plainly ═══════════════════
  'cli.memcat.usage.help.authority': {
    en:
      '\nAuthority: the token/limit table is parsed from Claude Code JSONL transcripts on this machine.\n' +
      'That is the only source it reads — no other provider transcript format is aggregated, so a\n' +
      'session run through another provider does not appear in this table.\n' +
      '`--lineage` switches to a different authority: archived task and result evidence, not transcripts.\n',
    tr:
      '\nOtorite: token/limit tablosu bu makinedeki Claude Code JSONL transcript’lerinden ayrıştırılır.\n' +
      'Okuduğu tek kaynak budur — başka bir provider transcript formatı toplanmaz, dolayısıyla başka bir\n' +
      'provider üzerinden çalıştırılan bir oturum bu tabloda görünmez.\n' +
      '`--lineage` farklı bir otoriteye geçer: transcript’ler değil, arşivlenmiş task ve result kanıtı.\n',
  },

  // ══ agent ══════════════════════════════════════════════════════════════
  'cli.memcat.agent.arg.name': {
    en: 'Agent name exactly as the agent entry records it',
    tr: 'Agent entry’sinde kayıtlı olduğu şekliyle agent adı',
  },
  'cli.memcat.agent.arg.new_name': {
    en: 'Name for the new agent entry',
    tr: 'Yeni agent entry’si için ad',
  },
  'cli.memcat.agent.delete.opt.force': {
    en: 'Delete without the interactive confirmation prompt',
    tr: 'Etkileşimli onay istemi olmadan sil',
  },
  'cli.memcat.agent.edit.opt.model': {
    en: 'Write a new model onto the agent entry',
    tr: 'Agent entry’sine yeni bir model yaz',
  },
  'cli.memcat.agent.edit.opt.description': {
    en: 'Write a new description onto the agent entry',
    tr: 'Agent entry’sine yeni bir açıklama yaz',
  },
  'cli.memcat.agent.edit.opt.enable': {
    en: 'Mark the agent entry enabled',
    tr: 'Agent entry’sini etkin olarak işaretle',
  },
  'cli.memcat.agent.edit.opt.disable': {
    en: 'Mark the agent entry disabled',
    tr: 'Agent entry’sini devre dışı olarak işaretle',
  },
  'cli.memcat.agent.edit.opt.triggers': {
    en: 'Replace the trigger keywords on the agent entry',
    tr: 'Agent entry’sindeki tetikleyici anahtar kelimeleri değiştir',
  },
  'cli.memcat.agent.edit.opt.sync_prompt': {
    en: 'Re-read PROMPT.md and write it back onto the entry as systemPrompt',
    tr: 'PROMPT.md dosyasını yeniden okuyup entry’ye systemPrompt olarak geri yaz',
  },
  'cli.memcat.agent.reclassify.opt.sprint': {
    en: 'Sprint ID whose stored task entry is being reclassified',
    tr: 'Kayıtlı task entry’si yeniden sınıflandırılan sprint ID',
  },
  'cli.memcat.agent.reclassify.opt.task': {
    en: 'Task ID within that sprint',
    tr: 'O sprint içindeki task ID',
  },
  'cli.memcat.agent.reclassify.opt.decision': {
    en: 'Replacement evaluation: DONE | GO_WITH_TECH_DEBT | NO_GO',
    tr: 'Yerine yazılacak değerlendirme: DONE | GO_WITH_TECH_DEBT | NO_GO',
  },
  'cli.memcat.agent.reclassify.opt.reason': {
    en: 'Free-form justification recorded on the audit-trail entry',
    tr: 'Audit-trail entry’sine kaydedilen serbest biçimli gerekçe',
  },
  'cli.memcat.agent.reclassify.opt.no_audit': {
    en: 'Do not write the audit-trail entry into the memory store',
    tr: 'Audit-trail entry’sini bellek deposuna yazma',
  },

  // ══ skill / skill-marketplace / plugin ═════════════════════════════════
  'cli.memcat.skill.arg.name': {
    en: 'Skill name exactly as the skill entry records it',
    tr: 'Skill entry’sinde kayıtlı olduğu şekliyle skill adı',
  },
  'cli.memcat.skill.arg.new_name': {
    en: 'Name for the new skill entry',
    tr: 'Yeni skill entry’si için ad',
  },
  'cli.memcat.skill.arg.source': {
    en: 'Install source: a local path, or a marketplace/registry reference',
    tr: 'Kurulum kaynağı: yerel bir yol ya da bir marketplace/registry referansı',
  },
  'cli.memcat.skill.opt.category': {
    en: 'Restrict the projection to one category',
    tr: 'Projeksiyonu tek bir kategoriye kısıtla',
  },
  'cli.memcat.skill.opt.force': {
    en: 'Overwrite an existing entry instead of failing',
    tr: 'Hata vermek yerine mevcut entry’nin üzerine yaz',
  },
  'cli.memcat.skill.opt.stats': {
    en: 'Add the recorded usage statistics to the projection',
    tr: 'Kaydedilmiş kullanım istatistiklerini projeksiyona ekle',
  },
  'cli.memcat.skill_marketplace.arg.query': {
    en: 'Search query matched against published registry entries',
    tr: 'Yayımlanmış registry entry’lerine karşı eşleştirilen arama sorgusu',
  },
  'cli.memcat.skill_marketplace.arg.skill_path': {
    en: 'Local path of the skill to sign and publish',
    tr: 'İmzalanıp yayımlanacak skill’in yerel yolu',
  },
  'cli.memcat.skill_marketplace.opt.category': {
    en: 'Restrict registry results to one category',
    tr: 'Registry sonuçlarını tek bir kategoriye kısıtla',
  },
  'cli.memcat.skill_marketplace.opt.limit': {
    en: 'Maximum registry results per page',
    tr: 'Sayfa başına maksimum registry sonucu',
  },
  'cli.memcat.skill_marketplace.opt.dry_run': {
    en: 'Validate and sign locally without uploading to the registry',
    tr: 'Registry’ye yüklemeden yerel olarak doğrula ve imzala',
  },
  'cli.memcat.skill_marketplace.opt.key_dir': {
    en: 'Keypair directory (default: ~/.deckent/keys)',
    tr: 'Anahtar çifti dizini (varsayılan: ~/.deckent/keys)',
  },
  'cli.memcat.skill_marketplace.opt.no_sign': {
    en: 'Skip Ed25519 signing and upload to the registry unsigned',
    tr: 'Ed25519 imzalamayı atla ve registry’ye imzasız yükle',
  },
  'cli.memcat.plugin.arg.name': {
    en: 'Plugin name exactly as the plugin entry records it',
    tr: 'Plugin entry’sinde kayıtlı olduğu şekliyle plugin adı',
  },
  'cli.memcat.plugin.arg.new_name': {
    en: 'Name for the new plugin entry',
    tr: 'Yeni plugin entry’si için ad',
  },
  'cli.memcat.plugin.arg.source': {
    en: 'Install source: a local path or a remote plugin reference',
    tr: 'Kurulum kaynağı: yerel bir yol ya da uzak bir plugin referansı',
  },
  'cli.memcat.plugin.arg.dir': {
    en: 'Plugin directory to inspect',
    tr: 'İncelenecek plugin dizini',
  },
  'cli.memcat.plugin.opt.force': {
    en: 'Overwrite an existing plugin entry instead of failing',
    tr: 'Hata vermek yerine mevcut plugin entry’sinin üzerine yaz',
  },

  // ══ help-info ══════════════════════════════════════════════════════════
  'cli.memcat.help_info.opt.lang': {
    en: 'Language override for the quick reference: en | tr',
    tr: 'Hızlı başvuru için dil geçersiz kılma: en | tr',
  },
});

/** `{name}` placeholders substituted into a row, mirroring `getMessage`. */
export type MessageVars = Readonly<Record<string, string>>;

function interpolate(text: string, vars: MessageVars | undefined): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

/**
 * Resolve one `cli.memcat.*` key.
 *
 * Self-contained on purpose: this family is consumed directly by the command
 * modules that own the help text, so it must not import the base catalog (a
 * later registration of this family inside `messages.ts` would otherwise
 * create an import cycle).
 *
 * Falls back language → English → the key itself, so a missing row degrades
 * to something diagnosable rather than to an empty help line.
 */
export function memoryCatalogMessage(
  key: string,
  lang?: string,
  vars?: MessageVars,
): string {
  const row = CLI_MEMORY_CATALOG_MESSAGES[key];
  if (!row) return key;
  const text = (lang !== undefined ? row[lang] : undefined) ?? row[DEFAULT_LANGUAGE];
  return text === undefined ? key : interpolate(text, vars);
}

/** Every key this family owns — lets tests enumerate without re-parsing the source. */
export const CLI_MEMORY_CATALOG_KEYS: readonly string[] = Object.freeze(
  Object.keys(CLI_MEMORY_CATALOG_MESSAGES),
);
