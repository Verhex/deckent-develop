// src/cli/helpers/message-catalog/cli-governance.ts
// ═══ CLI-CONTRACT-005 — `cli-governance` message-catalog family ════════════
//
// A message-catalog FAMILY file (same shape as `cli-common.ts`): a standalone
// bilingual key/row map plus the path-level contract table for the
// governance / provider / autonomous / connector command family.
//
// WHY THIS FILE EXISTS
// --------------------
// Three separate defects lived in that family's help surface:
//
//   1. EMPTY DESCRIPTIONS — `provider-observations` and its five subcommands
//      (inspect, migrate, adopt, adopt-runtime, reconcile) registered with no
//      `.description()` at all, so `deckent provider-observations --help`
//      printed a bare command list with nothing to the right of each name.
//
//   2. OPERATION-RESULT TEMPLATES USED AS OPTION HELP — options were
//      described with runtime *result* messages rendered with `-` sentinels
//      (`provider_observation.migration.pending_approval` with
//      `approvalId: '-'`). A result template answers "what happened on one
//      run"; option help must answer "what does this flag permanently do".
//      Those two are not the same contract and must not share a string.
//
//   3. MONOLINGUAL / INTERNAL-LABEL HELP — dozens of options carried English
//      string literals (`'Output as JSON'`, `'Language override (en|tr)'`)
//      that no `tr` speaker ever sees translated, and a few carried internal
//      tracker labels (`T-190-005`, `TOOL-CU`, `G1`, `Phase 1`) that mean
//      nothing to an operator reading `--help`.
//
// WHAT THIS FILE IS THE SSOT FOR
// ------------------------------
//   - `CLI_GOVERNANCE_MESSAGES` — bilingual (en/tr) rows for every path
//     description, option description and help-section note this family owns.
//   - `CLI_GOVERNANCE_SURFACE`  — the path-level access classification: which
//     paths are strictly local reads, which record an operator DECISION, and
//     which perform an AUTHENTICATED MUTATION. `approvals list` vs
//     `approvals decide`, `provider-authority keyring status` vs
//     `init`/`rotate`, and `provider-observations inspect` vs
//     `migrate`/`adopt`/`adopt-runtime`/`reconcile` are the three pairs the
//     surface previously blurred.
//   - `GOVERNANCE_PREREQUISITES` — the platform/provider prerequisite each
//     path needs, paired with the honest-unavailable contract: a missing
//     prerequisite is REPORTED and exits non-zero, never silently degraded
//     into a partial or simulated result.
//
// RESOLUTION — SHARED CATALOG + CYCLE-FREE FAMILY LOOKUP
// ------------------------------------------------------
// `src/cli/helpers/messages.ts` merges this family into the shared `MESSAGES`
// map, so every row is reachable through canonical `getMessage()`. Command
// modules may also use the local `getGovernanceMessage()` helper below. It is
// a thin, behaviour-identical lookup over the same frozen rows and avoids an
// import cycle (`messages.ts` imports catalog families, never the reverse).

import type { MessageFamily, MessageFamilyRow } from './cli-common.js';

export type { MessageFamily, MessageFamilyRow };

/** Language used when the caller's language has no row. */
export const GOVERNANCE_DEFAULT_LANGUAGE = 'en';

/** Languages every row in this family MUST carry. */
export const GOVERNANCE_REQUIRED_LANGUAGES: readonly string[] = Object.freeze(['en', 'tr']);

// ────────────────────────────────────────────────────────────────────────
// Access classification — the axis the old help surface never stated
// ────────────────────────────────────────────────────────────────────────

/**
 * What a path actually DOES to durable state, in plain risk language.
 *
 * The distinction is operator-facing, not cosmetic: `local-read` can be run
 * blind on a production project, `decision` releases a held action under the
 * caller's identity, and `authenticated-mutation` rewrites durable authority
 * state and cannot be undone by re-running the read.
 */
export type GovernanceAccess =
  /** Namespace parent — executes nothing on its own, only groups subcommands. */
  | 'group'
  /** Reads local project/config state. No credential, no write, no network. */
  | 'local-read'
  /** Writes local project/config state. No operator credential required. */
  | 'local-write'
  /** Records an operator decision that releases or refuses a held action. */
  | 'decision'
  /** Requires operator authority and rewrites durable authority/provider state. */
  | 'authenticated-mutation'
  /** Starts, stops or supervises a long-running local process. */
  | 'daemon-control'
  /** Calls a configured provider and spends provider budget. */
  | 'provider-call'
  /** Attaches an interactive session to the terminal until the operator exits. */
  | 'interactive';

/** Prerequisite classes a governed path can depend on. */
export type GovernancePrerequisite =
  | 'os-keyring'
  | 'native-sqlite'
  | 'provider-credential'
  | 'connector-token'
  | 'host-ai-cli'
  | 'local-port';

/** One governed path and the contract it now states in `--help`. */
export interface GovernanceSurfaceRow {
  /** Command path as Commander exposes it, root excluded (`['approvals','list']`). */
  readonly path: readonly string[];
  /** What the path does to durable state. */
  readonly access: GovernanceAccess;
  /**
   * Catalog key this family OWNS for the path's description. Absent when the
   * description already resolves through the shared `messages.ts` catalog and
   * is left untouched (changing its key would break summary binding).
   */
  readonly descriptionKey?: string;
  /** Prerequisite class, when the path can be genuinely unavailable. */
  readonly prerequisite?: GovernancePrerequisite;
}

/**
 * Internal tracker labels that must never reach an operator's `--help`.
 *
 * Sprint ids, task ids, tool codenames and phase numbers are project-internal
 * bookkeeping: they cannot be acted on by the person reading the help text.
 * ADR references are deliberately NOT matched — an ADR is a durable, public
 * design record an operator can look up.
 */
export const GOVERNANCE_INTERNAL_LABEL_PATTERN: RegExp =
  /\bT-\d{2,}|\bTOOL-[A-Z]{2,}\b|\bG\d\b|\bPhase \d\b|\bSprint \d+\b|\bAUT-\d\b|\bENT-\d\b|\bBOT-\d{2,}\b|\bPCOMP\b/;

// ────────────────────────────────────────────────────────────────────────
// Bilingual rows
// ────────────────────────────────────────────────────────────────────────

/**
 * Governance/provider/autonomous/connector help rows.
 *
 * Key namespace: `cli.governance.*` — reserved by this family.
 *
 * Every row is a PERMANENT BEHAVIOUR CONTRACT: it describes what the path or
 * flag always does, in terms that stay true across runs. No row may be a
 * rendered operation result, and no row may carry a `-` placeholder sentinel.
 */
export const CLI_GOVERNANCE_MESSAGES: MessageFamily = Object.freeze({
  // ── shared option contracts ───────────────────────────────────────────
  'cli.governance.opt.lang': {
    en: 'Render this command\'s output in the given language (en|tr) instead of the project language.',
    tr: 'Bu komutun çıktısını proje dili yerine verilen dilde (en|tr) üretir.',
  },
  'cli.governance.opt.root': {
    en: 'Resolve project state under this directory instead of the detected project root.',
    tr: 'Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer.',
  },
  'cli.governance.opt.json': {
    en: 'Emit the result as one machine-readable JSON document instead of formatted text.',
    tr: 'Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar.',
  },
  'cli.governance.opt.tenant': {
    en: 'Record the entry under this tenant identifier instead of the default tenant.',
    tr: 'Kaydı varsayılan kiracı yerine bu kiracı kimliği altında oluşturur.',
  },
  'cli.governance.opt.tenant_filter': {
    en: 'Restrict the listing to entries owned by this tenant identifier.',
    tr: 'Listelemeyi bu kiracı kimliğine ait kayıtlarla sınırlar.',
  },
  'cli.governance.opt.reason': {
    en: 'Free-text justification stored verbatim with the recorded decision.',
    tr: 'Kaydedilen karara birebir eklenen serbest metin gerekçe.',
  },
  'cli.governance.opt.limit': {
    en: 'Maximum number of records to print, newest first.',
    tr: 'Yazdırılacak en fazla kayıt sayısı; en yeniden başlar.',
  },

  // ── honest-unavailable contract + prerequisite notes ──────────────────
  'cli.governance.unavailable_contract': {
    en: 'Unavailable prerequisite: the command names the exact missing prerequisite and exits non-zero. It never substitutes a partial, cached or simulated result.',
    tr: 'Eksik ön koşul: komut, eksik olan ön koşulu tam olarak adlandırır ve sıfırdan farklı çıkış kodu döner. Kısmi, önbellekli veya benzetilmiş bir sonuç asla koymaz.',
  },
  'cli.governance.prereq.os_keyring': {
    en: 'Prerequisite: an OS credential store reachable by the current user — Keychain on darwin, Secret Service on linux, Credential Manager on win32.',
    tr: 'Ön koşul: geçerli kullanıcının erişebildiği bir işletim sistemi kimlik deposu — darwin\'de Keychain, linux\'ta Secret Service, win32\'de Credential Manager.',
  },
  'cli.governance.prereq.native_sqlite': {
    en: 'Prerequisite: the native SQLite binding built for this Node runtime, plus a readable provider-execution observation database.',
    tr: 'Ön koşul: bu Node çalışma zamanı için derlenmiş yerel SQLite bağlayıcısı ve okunabilir bir provider-execution gözlem veritabanı.',
  },
  'cli.governance.prereq.provider_credential': {
    en: 'Prerequisite: a configured provider with usable credentials; the call spends that provider\'s budget.',
    tr: 'Ön koşul: kullanılabilir kimlik bilgilerine sahip yapılandırılmış bir sağlayıcı; çağrı o sağlayıcının bütçesinden harcar.',
  },
  'cli.governance.prereq.connector_token': {
    en: 'Prerequisite: a connector token in the current project configuration; the connector stays offline without it.',
    tr: 'Ön koşul: geçerli proje yapılandırmasında bir bağlayıcı jetonu; bu olmadan bağlayıcı çevrimdışı kalır.',
  },
  'cli.governance.prereq.host_ai_cli': {
    en: 'Prerequisite: the selected host AI CLI is installed and on PATH.',
    tr: 'Ön koşul: seçilen ana AI CLI kurulu ve PATH üzerinde olmalıdır.',
  },
  'cli.governance.prereq.local_port': {
    en: 'Prerequisite: the requested bind address and port are free on this host.',
    tr: 'Ön koşul: istenen bağlanma adresi ve portu bu makinede boş olmalıdır.',
  },

  // ── approvals: read vs decision ───────────────────────────────────────
  'cli.governance.approvals.list.note': {
    en: 'Access: local read. Projects the durable approval records through the current lifecycle policy and writes nothing — an expired request is shown as expired without recording that closure.',
    tr: 'Erişim: yerel okuma. Kalıcı onay kayıtlarını geçerli yaşam döngüsü politikasıyla yansıtır ve hiçbir şey yazmaz — süresi geçmiş bir istek, bu kapanış kaydedilmeden süresi geçmiş olarak gösterilir.',
  },
  'cli.governance.approvals.decide.note': {
    en: 'Access: authenticated decision. Requires approval authority to be enabled; releases or refuses the held request under the caller\'s identity and writes a durable decision receipt. Exactly one of --allow or --deny is required.',
    tr: 'Erişim: kimliği doğrulanmış karar. Onay yetkisinin etkin olmasını gerektirir; bekletilen isteği çağıranın kimliği altında serbest bırakır veya reddeder ve kalıcı bir karar makbuzu yazar. --allow veya --deny seçeneklerinden tam olarak biri zorunludur.',
  },
  'cli.governance.approvals.rules.note': {
    en: 'Access: local write. Rule changes alter which future requests are auto-decided; they never retroactively decide a request that is already held.',
    tr: 'Erişim: yerel yazma. Kural değişiklikleri gelecekteki isteklerin hangilerinin otomatik karara bağlanacağını değiştirir; hâlihazırda bekletilen bir isteği geriye dönük olarak karara bağlamaz.',
  },

  // ── confirmations ─────────────────────────────────────────────────────
  'cli.governance.confirmations.decide.note': {
    en: 'Access: authenticated decision. Confirms or rejects a held confirmation and writes the outcome; exactly one of --confirm or --reject is required.',
    tr: 'Erişim: kimliği doğrulanmış karar. Bekletilen bir onayı doğrular veya reddeder ve sonucu yazar; --confirm veya --reject seçeneklerinden tam olarak biri zorunludur.',
  },

  // ── provider-authority keyring: read vs authenticated mutation ────────
  'cli.governance.provider_authority.keyring.status.note': {
    en: 'Access: local read. Reports whether a keyring exists and which revision is current. Never creates, unlocks or rewrites key material.',
    tr: 'Erişim: yerel okuma. Bir anahtarlığın var olup olmadığını ve hangi revizyonun geçerli olduğunu bildirir. Anahtar materyalini asla oluşturmaz, açmaz veya yeniden yazmaz.',
  },
  'cli.governance.provider_authority.keyring.init.note': {
    en: 'Access: authenticated mutation. Creates the provider keyring and its first revision. Refuses to run when a keyring already exists — rotate it instead of re-initializing.',
    tr: 'Erişim: kimliği doğrulanmış değişiklik. Sağlayıcı anahtarlığını ve ilk revizyonunu oluşturur. Anahtarlık zaten varsa çalışmayı reddeder — yeniden başlatmak yerine döndürün.',
  },
  'cli.governance.provider_authority.keyring.rotate.note': {
    en: 'Access: authenticated mutation. Supersedes the current keyring revision with a new one. Pass --expect-revision to make the rotation a compare-and-swap that refuses a concurrently changed keyring.',
    tr: 'Erişim: kimliği doğrulanmış değişiklik. Geçerli anahtarlık revizyonunun yerine yenisini koyar. Döndürmeyi, eşzamanlı olarak değişmiş bir anahtarlığı reddeden karşılaştır-ve-değiştir işlemine dönüştürmek için --expect-revision verin.',
  },

  // ── provider-observations: parent + every subcommand ──────────────────
  'cli.governance.provider_observations.desc': {
    en: 'Inspect and migrate the durable provider-execution observation store: read its schema and counts, migrate it forward, adopt an external preimage, or reconcile recorded runs.',
    tr: 'Kalıcı provider-execution gözlem deposunu inceler ve taşır: şemasını ve sayımlarını okur, ileriye taşır, dış bir ön görüntüyü devralır veya kayıtlı çalışmaları uzlaştırır.',
  },
  'cli.governance.provider_observations.inspect.desc': {
    en: 'Read the observation store and report its schema version and record counts. Read-only: never migrates, adopts or writes.',
    tr: 'Gözlem deposunu okur; şema sürümünü ve kayıt sayımlarını bildirir. Salt okunur: asla taşımaz, devralmaz veya yazmaz.',
  },
  'cli.governance.provider_observations.migrate.desc': {
    en: 'Migrate the observation store to the current schema version. Plans and prints the migration by default; --apply performs it under an approval.',
    tr: 'Gözlem deposunu geçerli şema sürümüne taşır. Varsayılan olarak taşımayı planlar ve yazdırır; --apply bunu bir onay altında uygular.',
  },
  'cli.governance.provider_observations.adopt.desc': {
    en: 'Adopt an external observation preimage into the store as durable records. Plans by default; --apply performs the adoption.',
    tr: 'Dış bir gözlem ön görüntüsünü kalıcı kayıtlar olarak depoya devralır. Varsayılan olarak planlar; --apply devralmayı uygular.',
  },
  'cli.governance.provider_observations.adopt_runtime.desc': {
    en: 'Adopt a runtime-produced observation preimage, keeping the runtime\'s own execution identity. Plans by default; --apply performs the adoption.',
    tr: 'Çalışma zamanının ürettiği bir gözlem ön görüntüsünü, çalışma zamanının kendi yürütme kimliğini koruyarak devralır. Varsayılan olarak planlar; --apply devralmayı uygular.',
  },
  'cli.governance.provider_observations.reconcile.desc': {
    en: 'Compare recorded observations against the runs they claim and report every mismatch. Plans by default; --apply writes the reconciliation.',
    tr: 'Kayıtlı gözlemleri iddia ettikleri çalışmalarla karşılaştırır ve her uyuşmazlığı bildirir. Varsayılan olarak planlar; --apply uzlaştırmayı yazar.',
  },
  'cli.governance.provider_observations.opt.database': {
    en: 'Path to the observation database to operate on instead of the project default.',
    tr: 'Proje varsayılanı yerine üzerinde çalışılacak gözlem veritabanının yolu.',
  },
  'cli.governance.provider_observations.opt.apply': {
    en: 'Perform the planned operation and write its result. Without this flag the command only plans and prints; nothing durable changes.',
    tr: 'Planlanan işlemi uygular ve sonucunu yazar. Bu bayrak olmadan komut yalnızca planlar ve yazdırır; kalıcı hiçbir şey değişmez.',
  },
  'cli.governance.provider_observations.opt.plan_digest': {
    en: 'Digest of the plan this run must match. The operation is refused when the store has changed since that plan was produced.',
    tr: 'Bu çalışmanın eşleşmesi gereken planın özeti. Plan üretildiğinden beri depo değiştiyse işlem reddedilir.',
  },
  'cli.governance.provider_observations.opt.approval_id': {
    en: 'Identifier of the approval that authorizes the write. Required when --apply needs an approval that is not already held.',
    tr: 'Yazma işlemine yetki veren onayın kimliği. --apply, hâlihazırda tutulmayan bir onaya ihtiyaç duyduğunda zorunludur.',
  },
  'cli.governance.provider_observations.opt.preimage': {
    en: 'Path to the observation preimage file to adopt. Read as evidence; the file itself is never modified.',
    tr: 'Devralınacak gözlem ön görüntü dosyasının yolu. Kanıt olarak okunur; dosyanın kendisi asla değiştirilmez.',
  },
  'cli.governance.provider_observations.opt.run_id': {
    en: 'Restrict reconciliation to this run identifier. Repeat the flag to reconcile several runs in one pass.',
    tr: 'Uzlaştırmayı bu çalışma kimliğiyle sınırlar. Tek geçişte birden çok çalışmayı uzlaştırmak için bayrağı tekrarlayın.',
  },

  // ── gateway: pair parent purpose (usage lives in its own help section) ─
  'cli.governance.gateway.pair.desc': {
    en: 'Review and settle device pairing requests: list the codes waiting for an operator, then approve one onto a project or reject it.',
    tr: 'Cihaz eşleştirme isteklerini inceler ve sonuçlandırır: bir operatör bekleyen kodları listeler, ardından birini bir projeye onaylar veya reddeder.',
  },
  'cli.governance.gateway.pair.usage_heading': {
    en: 'Usage:',
    tr: 'Kullanım:',
  },
  'cli.governance.gateway.opt.project': {
    en: 'Absolute path of the project this runtime is bound to for its whole lifetime.',
    tr: 'Bu çalışma zamanının tüm ömrü boyunca bağlı olduğu projenin mutlak yolu.',
  },

  // ── chat: label-free option contracts ─────────────────────────────────
  'cli.governance.chat.opt.tool': {
    en: 'Host AI CLI to launch for this session (claude | codex | gemini).',
    tr: 'Bu oturum için başlatılacak ana AI CLI (claude | codex | gemini).',
  },
  'cli.governance.chat.opt.local': {
    en: 'Route the session to a locally hosted model instead of a remote provider. Not yet available — the command reports it and exits non-zero.',
    tr: 'Oturumu uzak bir sağlayıcı yerine yerel olarak barındırılan bir modele yönlendirir. Henüz kullanılabilir değil — komut bunu bildirir ve sıfırdan farklı çıkış kodu döner.',
  },
  'cli.governance.chat.opt.check_mcp': {
    en: 'Verify the Deckent MCP server is attached before starting, and refuse to launch when it is not.',
    tr: 'Başlatmadan önce Deckent MCP sunucusunun bağlı olduğunu doğrular ve bağlı değilse başlatmayı reddeder.',
  },
  'cli.governance.chat.opt.resume': {
    en: 'Resume the given session id, printing its recent turns before the session attaches.',
    tr: 'Verilen oturum kimliğini sürdürür; oturum bağlanmadan önce son turlarını yazdırır.',
  },
  'cli.governance.chat.opt.resume_limit': {
    en: 'How many prior turns --resume prints before attaching.',
    tr: '--resume, bağlanmadan önce kaç önceki turu yazdırır.',
  },
  'cli.governance.chat.opt.resume_limit_with_default': {
    en: 'How many prior turns --resume prints before attaching (default: {default}).',
    tr: '--resume bağlanmadan önce yazdırılacak önceki tur sayısı (varsayılan: {default}).',
  },
  'cli.governance.chat.opt.native': {
    en: 'Run the built-in tool-use loop in this process instead of spawning a host AI CLI.',
    tr: 'Bir ana AI CLI başlatmak yerine yerleşik araç kullanım döngüsünü bu süreçte çalıştırır.',
  },
  'cli.governance.chat.opt.once': {
    en: 'Send a single turn and exit instead of holding an interactive session.',
    tr: 'Etkileşimli bir oturum tutmak yerine tek bir tur gönderip çıkar.',
  },
  'cli.governance.chat.opt.message': {
    en: 'Message text for single-turn mode; supplying it implies --native --once.',
    tr: 'Tek turlu mod için mesaj metni; verilmesi --native --once anlamına gelir.',
  },

  // ── autonomous / mission / flow / nervous option contracts ────────────
  'cli.governance.autonomous.opt.interval_ms': {
    en: 'Milliseconds the loop sleeps between idle ticks.',
    tr: 'Döngünün boştaki tikler arasında uyuduğu milisaniye.',
  },
  'cli.governance.autonomous.opt.max_iterations': {
    en: 'Stop the loop after this many cycles; omit to run until the operator aborts it.',
    tr: 'Döngüyü bu kadar çevrimden sonra durdurur; operatör durdurana kadar çalışması için verilmez.',
  },
  'cli.governance.autonomous.opt.from': {
    en: 'Artifact reference (file or file#section) whose open checklist items seed the plan.',
    tr: 'Açık kontrol listesi maddeleri planı besleyen yapıt referansı (dosya veya dosya#bölüm).',
  },
  'cli.governance.autonomous.opt.policy': {
    en: 'Policy applied to every generated item: auto, approval-required, or risk-tagged.',
    tr: 'Üretilen her maddeye uygulanan politika: auto, approval-required veya risk-tagged.',
  },
  'cli.governance.autonomous.opt.max_items': {
    en: 'Upper bound on how many items the plan may contain.',
    tr: 'Planın içerebileceği madde sayısının üst sınırı.',
  },
  'cli.governance.autonomous.opt.dry_run': {
    en: 'Generate the plan and print it without writing it to the backlog.',
    tr: 'Planı üretir ve birikim listesine yazmadan yazdırır.',
  },
  'cli.governance.autonomous.opt.decision_reason': {
    en: 'Free-text justification stored verbatim with the recorded trigger decision.',
    tr: 'Kaydedilen tetikleyici kararına birebir eklenen serbest metin gerekçe.',
  },
  'cli.governance.autonomous.opt.entry_id': {
    en: 'Identifier for the backlog entry; must be unique within the backlog.',
    tr: 'Birikim listesi kaydının kimliği; liste içinde benzersiz olmalıdır.',
  },
  'cli.governance.autonomous.opt.entry_title': {
    en: 'Human-readable title shown wherever the entry is listed.',
    tr: 'Kaydın listelendiği her yerde gösterilen, insan tarafından okunabilir başlık.',
  },
  'cli.governance.autonomous.opt.entry_kind': {
    en: 'Entry kind: task, sprint, or capability.',
    tr: 'Kayıt türü: task, sprint veya capability.',
  },
  'cli.governance.autonomous.opt.entry_description': {
    en: 'Task description, or a reference to the directives that define the work.',
    tr: 'Görev açıklaması veya işi tanımlayan yönergelere bir referans.',
  },
  'cli.governance.autonomous.opt.entry_policy': {
    en: 'Policy for this backlog entry: auto, approval-required, or risk-tagged.',
    tr: 'Bu birikim listesi kaydının politikası: auto, approval-required veya risk-tagged.',
  },
  'cli.governance.autonomous.opt.cron': {
    en: 'Five-field cron expression that makes the entry recur; omit for a one-off entry.',
    tr: 'Kaydı yinelemeli yapan beş alanlı cron ifadesi; tek seferlik kayıtlar için verilmez.',
  },
  'cli.governance.autonomous.opt.capability': {
    en: 'Dotted capability verb to invoke (kind=capability only), for example fs.read.',
    tr: 'Çağrılacak noktalı yetenek fiili (yalnızca kind=capability), örneğin fs.read.',
  },
  'cli.governance.autonomous.opt.args': {
    en: 'JSON object of handler arguments (kind=capability only).',
    tr: 'İşleyici argümanlarını içeren JSON nesnesi (yalnızca kind=capability).',
  },
  'cli.governance.autonomous.opt.connector': {
    en: 'Preferred backend or connector for the capability (kind=capability only).',
    tr: 'Yetenek için tercih edilen arka uç veya bağlayıcı (yalnızca kind=capability).',
  },
  'cli.governance.autonomous.opt.remove_id': {
    en: 'Backlog entry id to remove; an alternative to passing the id positionally.',
    tr: 'Kaldırılacak birikim listesi kaydının kimliği; kimliği konumsal olarak vermenin alternatifidir.',
  },
  'cli.governance.mission.opt.item': {
    en: 'Work item to add, as kind or kind:json-spec. Repeat the flag once per item.',
    tr: 'Eklenecek iş maddesi; kind veya kind:json-spec biçiminde. Her madde için bayrağı tekrarlayın.',
  },
  'cli.governance.mission.opt.items_file': {
    en: 'JSON file holding the array of mission items to create the list from.',
    tr: 'Listenin oluşturulacağı görev maddeleri dizisini tutan JSON dosyası.',
  },
  'cli.governance.mission.opt.id': {
    en: 'Mission identifier; one is generated when the flag is omitted.',
    tr: 'Görev kimliği; bayrak verilmediğinde bir tane üretilir.',
  },
  'cli.governance.mission.opt.title': {
    en: 'Mission title; defaults to the goal text when omitted.',
    tr: 'Görev başlığı; verilmediğinde hedef metnine düşer.',
  },
  'cli.governance.mission.opt.accept': {
    en: 'Acceptance criteria the mission is settled against.',
    tr: 'Görevin karşısında sonuçlandırıldığı kabul ölçütleri.',
  },
  'cli.governance.mission.opt.deliver_to': {
    en: 'Channel the settled-mission notification is delivered to.',
    tr: 'Sonuçlanan görev bildiriminin iletileceği kanal.',
  },
  'cli.governance.flow.opt.once': {
    en: 'Run a single scheduler tick and exit instead of staying resident.',
    tr: 'Yerleşik kalmak yerine tek bir zamanlayıcı tiki çalıştırıp çıkar.',
  },
  'cli.governance.nervous.opt.mode': {
    en: 'Authority preset to enable: strict, balanced, autopilot, or full-auto.',
    tr: 'Etkinleştirilecek yetki ön ayarı: strict, balanced, autopilot veya full-auto.',
  },
  'cli.governance.nervous.opt.since': {
    en: 'Only show records newer than this duration, for example 1d, 2h or 30m.',
    tr: 'Yalnızca bu süreden daha yeni kayıtları gösterir; örneğin 1d, 2h veya 30m.',
  },
  'cli.governance.nervous.opt.all': {
    en: 'Include dismissed recommendations; by default only open ones are shown.',
    tr: 'Kapatılmış önerileri de içerir; varsayılan olarak yalnızca açık olanlar gösterilir.',
  },
  'cli.governance.nervous.opt.dismiss': {
    en: 'Dismiss the open recommendation with this id, or a unique id prefix.',
    tr: 'Bu kimliğe veya benzersiz bir kimlik önekine sahip açık öneriyi kapatır.',
  },
  'cli.governance.nervous.opt.follow': {
    en: 'Keep the process attached and print new entries as they are appended.',
    tr: 'Süreci bağlı tutar ve yeni kayıtları eklendikçe yazdırır.',
  },
  'cli.governance.nervous.opt.panic_reason': {
    en: 'Free-text justification stored verbatim with the recorded panic approval.',
    tr: 'Kaydedilen panik onayına birebir eklenen serbest metin gerekçe.',
  },
  'cli.governance.config_nervous.arg.key': {
    en: 'Configuration key to set, for example mode.',
    tr: 'Ayarlanacak yapılandırma anahtarı; örneğin mode.',
  },
  'cli.governance.config_nervous.arg.value': {
    en: 'Value to store under the given configuration key.',
    tr: 'Verilen yapılandırma anahtarı altında saklanacak değer.',
  },

  // ── remaining governance option contracts ─────────────────────────────
  'cli.governance.rbac.opt.tenant': {
    en: 'Tenant identifier the role check is evaluated against.',
    tr: 'Rol denetiminin karşısında değerlendirildiği kiracı kimliği.',
  },
  'cli.governance.evolve.opt.sprints': {
    en: 'How many of the most recent sprints the report analyzes.',
    tr: 'Raporun en son kaç sprinti çözümleyeceği.',
  },
  'cli.governance.resources.opt.log': {
    en: 'Summarize the resource log; pass a path to read a log other than the configured one.',
    tr: 'Kaynak günlüğünü özetler; yapılandırılan dışında bir günlüğü okumak için bir yol verin.',
  },
  'cli.governance.serve.opt.port': {
    en: 'TCP port the dashboard server listens on.',
    tr: 'Kontrol paneli sunucusunun dinlediği TCP portu.',
  },
  'cli.governance.serve.opt.dev': {
    en: 'Proxy asset requests to a running Vite dev server instead of serving the built bundle.',
    tr: 'Varlık isteklerini derlenmiş paket yerine çalışan bir Vite geliştirme sunucusuna yönlendirir.',
  },
  'cli.governance.serve.opt.dev_port': {
    en: 'Port the Vite dev server is expected on when --dev is used.',
    tr: '--dev kullanıldığında Vite geliştirme sunucusunun beklendiği port.',
  },
  'cli.governance.serve.opt.host': {
    en: 'Address the server binds to; the loopback default keeps it off the network.',
    tr: 'Sunucunun bağlandığı adres; geri döngü varsayılanı onu ağdan uzak tutar.',
  },
  'cli.governance.serve.opt.no_terminal': {
    en: 'Serve the dashboard without the embedded web terminal.',
    tr: 'Kontrol panelini gömülü web terminali olmadan sunar.',
  },
  'cli.governance.flow.opt.add_tenant': {
    en: 'Tenant identifier the scheduled flow is created under.',
    tr: 'Zamanlanmış akışın altında oluşturulduğu kiracı kimliği.',
  },

  // ── positional argument contracts ────────────────────────────────────
  'cli.governance.config_nervous.arg.action_id': {
    en: 'Nervous action identifier whose policy override will be changed.',
    tr: 'Policy override’ı değiştirilecek Nervous action kimliği.',
  },
  'cli.governance.config_nervous.arg.policy': {
    en: 'Override policy to assign to the selected action.',
    tr: 'Seçilen action’a atanacak override policy.',
  },
  'cli.governance.nervous.arg.id': {
    en: 'Nervous action or recommendation identifier targeted by this decision.',
    tr: 'Bu kararın hedeflediği Nervous action veya recommendation kimliği.',
  },
  'cli.governance.nervous.arg.action_id': {
    en: 'Previously recorded Nervous action identifier to undo.',
    tr: 'Geri alınacak, daha önce kaydedilmiş Nervous action kimliği.',
  },
  'cli.governance.nervous.arg.task_id': {
    en: 'Task identifier whose panic action is being accepted.',
    tr: 'Panic action’ı kabul edilen task kimliği.',
  },
  'cli.governance.mode.arg.style': {
    en: 'Global execution style to persist: sprint, task, or process.',
    tr: 'Kalıcılaştırılacak global execution style: sprint, task veya process.',
  },
  'cli.governance.flow.arg.cron': {
    en: 'Cron expression that determines when the scheduled flow runs.',
    tr: 'Scheduled flow’un ne zaman çalışacağını belirleyen cron ifadesi.',
  },
  'cli.governance.flow.arg.action': {
    en: 'Action specification the scheduler executes when the cron expression matches.',
    tr: 'Cron ifadesi eşleştiğinde scheduler’ın yürüttüğü action tanımı.',
  },
  'cli.governance.flow.arg.id': {
    en: 'Scheduled-flow identifier to approve.',
    tr: 'Onaylanacak scheduled-flow kimliği.',
  },
  'cli.governance.rbac.arg.role': {
    en: 'RBAC role name used by the check or assignment.',
    tr: 'Check veya atama tarafından kullanılan RBAC role adı.',
  },
  'cli.governance.rbac.arg.action': {
    en: 'Protected action whose permission is checked.',
    tr: 'İzni denetlenen korumalı action.',
  },
  'cli.governance.rbac.arg.user': {
    en: 'User identifier whose role assignment is changed.',
    tr: 'Role ataması değiştirilecek user kimliği.',
  },
  'cli.governance.autonomous.arg.goal': {
    en: 'Goal text the autonomous planner should turn into a governed plan.',
    tr: 'Autonomous planner’ın governed plan’a dönüştüreceği goal metni.',
  },
  'cli.governance.autonomous.arg.trigger_id': {
    en: 'Pending autonomous trigger identifier to approve or reject.',
    tr: 'Onaylanacak veya reddedilecek pending autonomous trigger kimliği.',
  },
  'cli.governance.autonomous.arg.backlog_id': {
    en: 'Backlog item identifier to remove; --id may supply it instead.',
    tr: 'Kaldırılacak backlog item kimliği; bunun yerine --id de kullanılabilir.',
  },
  'cli.governance.mission.arg.title': {
    en: 'Human-readable title of the mission list to create.',
    tr: 'Oluşturulacak mission list’in insan-okur başlığı.',
  },
  'cli.governance.mission.arg.goal': {
    en: 'Goal statement the mission planner should decompose.',
    tr: 'Mission planner’ın ayrıştıracağı goal ifadesi.',
  },
  'cli.governance.gateway.arg.pair_code': {
    en: 'One-time pairing code identifying the pending device request.',
    tr: 'Pending device isteğini tanımlayan tek kullanımlık pairing code.',
  },
  'cli.governance.gateway.arg.project': {
    en: 'Project identifier the approved device is paired with.',
    tr: 'Onaylanan cihazın eşleştirileceği project kimliği.',
  },
  'cli.governance.xverify.arg.claim': {
    en: 'Claim or result statement the independent provider should verify.',
    tr: 'Bağımsız provider’ın doğrulaması gereken claim veya result ifadesi.',
  },
  'cli.governance.approvals.arg.request_id': {
    en: 'Pending approval request identifier to decide.',
    tr: 'Karara bağlanacak pending approval request kimliği.',
  },
  'cli.governance.approvals.arg.rule_id': {
    en: 'Approval-rule identifier to enable, disable, or remove.',
    tr: 'Etkinleştirilecek, devre dışı bırakılacak veya kaldırılacak approval-rule kimliği.',
  },
  'cli.governance.confirmations.arg.id': {
    en: 'Pending confirmation identifier; decisions are routed to the authenticated approval surface.',
    tr: 'Pending confirmation kimliği; kararlar authenticated approval yüzeyine yönlendirilir.',
  },
});

// ────────────────────────────────────────────────────────────────────────
// Path-level contract table
// ────────────────────────────────────────────────────────────────────────

/**
 * Every governed path in the governance/provider/autonomous/connector family,
 * with the access classification its help surface now states.
 *
 * Paired reads and mutations are declared next to each other on purpose: the
 * contract test asserts that each pair really carries DIFFERENT access values,
 * so a future edit cannot quietly re-blur them.
 */
export const CLI_GOVERNANCE_SURFACE: readonly GovernanceSurfaceRow[] = Object.freeze([
  // approvals — read vs decision vs rule write
  { path: ['approvals'], access: 'group' },
  { path: ['approvals', 'list'], access: 'local-read' },
  { path: ['approvals', 'decide'], access: 'decision' },
  { path: ['approvals', 'rules'], access: 'group' },
  { path: ['approvals', 'rules', 'list'], access: 'local-read' },
  { path: ['approvals', 'rules', 'apply'], access: 'local-write' },
  { path: ['approvals', 'rules', 'enable'], access: 'local-write' },
  { path: ['approvals', 'rules', 'disable'], access: 'local-write' },
  { path: ['approvals', 'rules', 'remove'], access: 'local-write' },

  // confirmations — read vs decision
  { path: ['confirmations'], access: 'group' },
  { path: ['confirmations', 'list'], access: 'local-read' },
  { path: ['confirmations', 'decide'], access: 'decision' },
  { path: ['confirmations', 'run'], access: 'provider-call', prerequisite: 'provider-credential' },

  // provider-authority — keyring read vs authenticated mutation
  { path: ['provider-authority'], access: 'group' },
  { path: ['provider-authority', 'keyring'], access: 'group' },
  { path: ['provider-authority', 'keyring', 'status'], access: 'local-read', prerequisite: 'os-keyring' },
  { path: ['provider-authority', 'keyring', 'init'], access: 'authenticated-mutation', prerequisite: 'os-keyring' },
  { path: ['provider-authority', 'keyring', 'rotate'], access: 'authenticated-mutation', prerequisite: 'os-keyring' },
  { path: ['provider-authority', 'limits'], access: 'group' },
  { path: ['provider-authority', 'limits', 'init'], access: 'local-write' },

  // provider-observations — inspect read vs migrating/adopting mutations
  {
    path: ['provider-observations'],
    access: 'group',
    descriptionKey: 'cli.governance.provider_observations.desc',
    prerequisite: 'native-sqlite',
  },
  {
    path: ['provider-observations', 'inspect'],
    access: 'local-read',
    descriptionKey: 'cli.governance.provider_observations.inspect.desc',
    prerequisite: 'native-sqlite',
  },
  {
    path: ['provider-observations', 'migrate'],
    access: 'authenticated-mutation',
    descriptionKey: 'cli.governance.provider_observations.migrate.desc',
    prerequisite: 'native-sqlite',
  },
  {
    path: ['provider-observations', 'adopt'],
    access: 'authenticated-mutation',
    descriptionKey: 'cli.governance.provider_observations.adopt.desc',
    prerequisite: 'native-sqlite',
  },
  {
    path: ['provider-observations', 'adopt-runtime'],
    access: 'authenticated-mutation',
    descriptionKey: 'cli.governance.provider_observations.adopt_runtime.desc',
    prerequisite: 'native-sqlite',
  },
  {
    path: ['provider-observations', 'reconcile'],
    access: 'authenticated-mutation',
    descriptionKey: 'cli.governance.provider_observations.reconcile.desc',
    prerequisite: 'native-sqlite',
  },

  // gateway connector — daemon control, pairing decisions
  { path: ['gateway'], access: 'group', prerequisite: 'connector-token' },
  { path: ['gateway', 'listen'], access: 'daemon-control', prerequisite: 'connector-token' },
  { path: ['gateway', 'start'], access: 'daemon-control', prerequisite: 'connector-token' },
  { path: ['gateway', 'stop'], access: 'daemon-control' },
  { path: ['gateway', 'status'], access: 'local-read' },
  {
    path: ['gateway', 'pair'],
    access: 'group',
    descriptionKey: 'cli.governance.gateway.pair.desc',
  },
  { path: ['gateway', 'pair', 'list'], access: 'local-read' },
  { path: ['gateway', 'pair', 'approve'], access: 'decision' },
  { path: ['gateway', 'pair', 'reject'], access: 'decision' },
  { path: ['gateway-runtime'], access: 'daemon-control', prerequisite: 'connector-token' },

  // bot connector
  { path: ['bot'], access: 'group', prerequisite: 'connector-token' },
  { path: ['bot', 'listen'], access: 'daemon-control', prerequisite: 'connector-token' },
  { path: ['bot', 'start'], access: 'daemon-control', prerequisite: 'connector-token' },
  { path: ['bot', 'stop'], access: 'daemon-control' },
  { path: ['bot', 'status'], access: 'local-read' },

  // autonomous
  { path: ['autonomous'], access: 'group' },
  { path: ['autonomous', 'enable'], access: 'local-write' },
  { path: ['autonomous', 'start'], access: 'daemon-control' },
  { path: ['autonomous', 'stop'], access: 'daemon-control' },
  { path: ['autonomous', 'status'], access: 'local-read' },
  { path: ['autonomous', 'cleanup'], access: 'local-write' },
  { path: ['autonomous', 'plan'], access: 'provider-call', prerequisite: 'provider-credential' },
  { path: ['autonomous', 'pending'], access: 'local-read' },
  { path: ['autonomous', 'approve'], access: 'decision' },
  { path: ['autonomous', 'reject'], access: 'decision' },
  { path: ['autonomous', 'backlog'], access: 'group' },
  { path: ['autonomous', 'backlog', 'add'], access: 'local-write' },
  { path: ['autonomous', 'backlog', 'list'], access: 'local-read' },
  { path: ['autonomous', 'backlog', 'remove'], access: 'local-write' },

  // autonomous missions
  { path: ['autonomous-mission'], access: 'group' },
  { path: ['autonomous-mission', 'create-list'], access: 'local-write' },
  { path: ['autonomous-mission', 'create-goal'], access: 'local-write' },
  { path: ['autonomous-mission', 'list'], access: 'local-read' },

  // flow scheduler
  { path: ['flow'], access: 'group' },
  { path: ['flow', 'list'], access: 'local-read' },
  { path: ['flow', 'add'], access: 'local-write' },
  { path: ['flow', 'run'], access: 'daemon-control' },
  { path: ['flow', 'approve'], access: 'decision' },

  // nervous system
  { path: ['nervous'], access: 'group' },
  { path: ['nervous', 'enable'], access: 'local-write' },
  { path: ['nervous', 'accept'], access: 'decision' },
  { path: ['nervous', 'reject'], access: 'decision' },
  { path: ['nervous', 'edit'], access: 'local-write' },
  { path: ['nervous', 'undo'], access: 'local-write' },
  { path: ['nervous', 'history'], access: 'local-read' },
  { path: ['nervous', 'recommendations'], access: 'local-read' },
  { path: ['nervous', 'log'], access: 'local-read' },
  { path: ['nervous', 'accept-panic'], access: 'decision' },
  { path: ['nervous', 'baseline-refresh'], access: 'local-write' },

  // nervous configuration
  { path: ['config', 'nervous'], access: 'interactive' },
  { path: ['config', 'nervous', 'set'], access: 'local-write' },
  { path: ['config', 'nervous', 'override'], access: 'local-write' },
  { path: ['config', 'nervous', 'list'], access: 'local-read' },
  { path: ['config', 'nervous', 'reset'], access: 'local-write' },

  // rbac
  { path: ['rbac'], access: 'group' },
  { path: ['rbac', 'check'], access: 'local-read' },
  { path: ['rbac', 'roles'], access: 'local-read' },
  { path: ['rbac', 'grant'], access: 'local-write' },
  { path: ['rbac', 'revoke'], access: 'local-write' },

  // single-path governance reads and sessions
  { path: ['limits'], access: 'local-read' },
  { path: ['resources'], access: 'local-read' },
  { path: ['cu-status'], access: 'local-read' },
  { path: ['evolve'], access: 'group' },
  { path: ['evolve', 'report'], access: 'local-read' },
  { path: ['execution-authority'], access: 'group' },
  { path: ['execution-authority', 'mount-adopt'], access: 'authenticated-mutation' },
  { path: ['serve'], access: 'daemon-control', prerequisite: 'local-port' },
  { path: ['chat'], access: 'interactive', prerequisite: 'host-ai-cli' },
  { path: ['xverify'], access: 'provider-call', prerequisite: 'provider-credential' },
  { path: ['openrouter-probe'], access: 'provider-call', prerequisite: 'provider-credential' },
]);

/** Prerequisite class → the catalog key that states it in `--help`. */
export const GOVERNANCE_PREREQUISITES: Readonly<Record<GovernancePrerequisite, string>> =
  Object.freeze({
    'os-keyring': 'cli.governance.prereq.os_keyring',
    'native-sqlite': 'cli.governance.prereq.native_sqlite',
    'provider-credential': 'cli.governance.prereq.provider_credential',
    'connector-token': 'cli.governance.prereq.connector_token',
    'host-ai-cli': 'cli.governance.prereq.host_ai_cli',
    'local-port': 'cli.governance.prereq.local_port',
  });

/**
 * Access values that mean "this path can change durable state".
 *
 * Used by the contract test to prove the read/mutation split is real rather
 * than decorative.
 */
export const GOVERNANCE_MUTATING_ACCESS: readonly GovernanceAccess[] = Object.freeze([
  'local-write',
  'decision',
  'authenticated-mutation',
]);

// ────────────────────────────────────────────────────────────────────────
// Resolution
// ────────────────────────────────────────────────────────────────────────

/**
 * Resolve a `cli.governance.*` row for the requested language.
 *
 * Falls back to {@link GOVERNANCE_DEFAULT_LANGUAGE} when the language has no
 * row, and returns the key itself when the key is unknown — the same
 * observable contract as the shared `getMessage`, so a missing key is visible
 * in help output instead of silently rendering as an empty description.
 */
export function getGovernanceMessage(key: string, lang?: string): string {
  const row: MessageFamilyRow | undefined = CLI_GOVERNANCE_MESSAGES[key];
  if (row === undefined) return key;
  const requested = lang !== undefined ? row[lang] : undefined;
  return requested ?? row[GOVERNANCE_DEFAULT_LANGUAGE] ?? key;
}

interface GovernanceArgumentHost {
  readonly registeredArguments: readonly { name(): string; description: string }[];
}

/**
 * Bind catalog descriptions to positional arguments declared inline in a
 * Commander command string. Parsing shape is left untouched.
 */
export function bindGovernanceArgumentDescriptions<T extends GovernanceArgumentHost>(
  command: T,
  lang: string | undefined,
  bindings: Readonly<Record<string, string>>,
): T {
  for (const argument of command.registeredArguments) {
    const key = bindings[argument.name()];
    if (key !== undefined) argument.description = getGovernanceMessage(key, lang);
  }
  return command;
}

/**
 * Render the help block appended to a path that has a prerequisite: the
 * prerequisite itself, followed by the honest-unavailable contract.
 */
export function governancePrerequisiteHelp(
  prerequisite: GovernancePrerequisite,
  lang?: string,
): string {
  const prerequisiteText = getGovernanceMessage(GOVERNANCE_PREREQUISITES[prerequisite], lang);
  const unavailableText = getGovernanceMessage('cli.governance.unavailable_contract', lang);
  return `\n${prerequisiteText}\n${unavailableText}\n`;
}

/** Normalize a governed path to the space-joined key Commander walks report. */
export function governancePathKey(path: readonly string[] | string): string {
  return typeof path === 'string' ? path : path.join(' ');
}

/** Look up the governed row for a path, or `undefined` when unclassified. */
export function getGovernanceRow(
  path: readonly string[] | string,
): GovernanceSurfaceRow | undefined {
  const key = governancePathKey(path);
  return CLI_GOVERNANCE_SURFACE.find((row) => governancePathKey(row.path) === key);
}
