/**
 * D4-2 (SURF-4) — the SINGLE list of `desktop.*` i18n keys the Desktop app
 * uses, shared by BOTH sides of the string bridge:
 *
 *   main   — i18n.ts resolves them via the repo SSOT (src/cli/helpers/
 *            messages.ts) and serves the flat map over `app.getStrings()`;
 *   renderer — app.ts's MSG map may ONLY reference keys from this list
 *            (pinned by tests/desktop-i18n.test.ts), and its English
 *            fallback map is DERIVED from the same SSOT (i18n-fallback.ts)
 *            — zero renderer-local user-facing literals (D4-2 done-criterion).
 *
 * Adding a renderer string = add the en/tr pair to messages.ts under
 * `desktop.*`, add the key here, reference it from MSG. The completeness
 * test fails if any step is skipped.
 */

export const DESKTOP_MESSAGE_KEYS = [
  // ── D4-4: the terminal's state vocabulary, served to the shell VERBATIM
  //    (true reuse of tui.inbox_state_* — the /runs inbox's own labels) ──
  'tui.inbox_state_collecting',
  'tui.inbox_state_proposed',
  'tui.inbox_state_previewing',
  'tui.inbox_state_awaiting_approval',
  'tui.inbox_state_approved',
  'tui.inbox_state_starting',
  'tui.inbox_state_running',
  'tui.inbox_state_completed',
  'tui.inbox_state_failed',
  'tui.inbox_state_cancelled',
  'tui.inbox_state_blocked',
  // SURF-5 kuyruk — zaman-humanize: shared relative-age vocabulary (formatShellTimestamp)
  'tui.inbox_time_just_now',
  'tui.inbox_time_minutes_ago',
  'tui.inbox_time_hours_ago',
  'tui.inbox_time_days_ago',
  // ── tray / menu / window / updates (pre-D4-2 canonical set) ──
  'desktop.tray.open',
  'desktop.tray.quit',
  'desktop.tray.tooltip',
  'desktop.window.minimize_to_tray_hint',
  'desktop.update.available',
  'desktop.update.downloading',
  'desktop.update.restart_to_apply',
  'desktop.update.check_for_updates',
  'desktop.menu.help',
  // ── connection screens (canonical) ──
  'desktop.connection.add_title',
  'desktop.connection.kind.local',
  'desktop.connection.kind.wsl',
  'desktop.connection.kind.ssh',
  'desktop.connection.kind.container',
  'desktop.connection.kind_not_yet_supported',
  'desktop.connection.connect_button',
  'desktop.connection.delete_confirm',
  'desktop.connecting.spawning',
  'desktop.connecting.adopting',
  'desktop.connecting.health_check',
  'desktop.connecting.retry',
  'desktop.error.node_not_found',
  'desktop.error.deckent_not_found',
  'desktop.error.port_conflict',
  'desktop.error.daemon_crashed',
  'desktop.error.health_timeout',
  'desktop.error.view_logs',
  // ── D4-2: former renderer-local supplementary copy, promoted to the SSOT ──
  'desktop.app.browser_fallback_notice',
  'desktop.connection.list_title',
  'desktop.connection.list_loading',
  'desktop.connection.empty_state',
  'desktop.connection.list_error',
  'desktop.connection.field_label',
  'desktop.connection.field_kind',
  'desktop.connection.field_project_path',
  'desktop.connection.field_host',
  'desktop.connection.field_port',
  'desktop.connection.field_auto_start',
  'desktop.connection.field_orphan_shutdown',
  'desktop.connection.submit_button',
  'desktop.connection.delete_button',
  'desktop.connection.validation_required',
  'desktop.connection.validation_port',
  'desktop.connection.add_error',
  'desktop.connection.remove_error',
  'desktop.connecting.title',
  'desktop.connecting.idle',
  'desktop.connecting.connected',
  'desktop.error.title',
  'desktop.error.unknown',
  'desktop.error.back_button',
  // daemon-lifecycle push errorKey'leri (D4-2'de öksüz-anahtar olarak yakalandı)
  'desktop.daemon.spawn_failed',
  'desktop.daemon.health_timeout',
  // ── D4-3 post-connect app shell ──
  'desktop.shell.nav.console',
  'desktop.shell.nav.chat',
  'desktop.shell.nav.approval',
  'desktop.shell.nav.history',
  'desktop.shell.connected_to',
  'desktop.shell.flows_empty',
  'desktop.shell.flag_run_flow_off',
  'desktop.shell.live_events',
  'desktop.shell.approvals_pending',
  // 588/F1 — «Köprü» + Worker-Penceresi
  'desktop.shell.bridge.phase_label',
  'desktop.shell.bridge.workers_title',
  'desktop.shell.bridge.files_title',
  'desktop.shell.bridge.no_sprint',
  'desktop.shell.bridge.hb_age',
  'desktop.shell.worker.back',
  'desktop.shell.worker.tab_live',
  'desktop.shell.worker.tab_task',
  'desktop.shell.worker.tab_plan',
  'desktop.shell.worker.tab_result',
  'desktop.shell.worker.log_unavailable',
  'desktop.shell.worker.go_criteria',
  'desktop.shell.worker.scope',
  'desktop.shell.worker.no_plan',
  'desktop.shell.worker.no_result',
  'desktop.shell.worker.assessment',
  'desktop.shell.worker.not_found',
  'desktop.shell.bridge.past_flows',
  'desktop.shell.bridge.past_flows_more',
  'desktop.shell.worker.stream_on',
  'desktop.shell.worker.stream_down',
  'desktop.shell.worker.files_changed',
  'desktop.shell.worker.notes',
  'desktop.shell.worker.raw',
  // 588/F0 — ray-grupları + «Changes» (CLI runs.commit.* sözlüğü ortak-kelime
  // kuralıyla yeniden-kullanılır — aynı akışın aynı kelimeleri, iki yüzey).
  'desktop.shell.nav.group_voyage',
  'desktop.shell.nav.group_work',
  'desktop.shell.nav.changes',
  'desktop.shell.changes.commit',
  'desktop.shell.changes.gate_off',
  'desktop.shell.runs.goal',
  'desktop.shell.runs.gate',
  'desktop.shell.runs.tasks',
  'desktop.shell.runs.revision',
  'runs.commit.header',
  'runs.commit.suggested',
  'runs.commit.clean',
  'runs.commit.not_git',
  'runs.commit.done',
  // DT-1 «Telsiz» — chat_coming retired (the radio is REAL now); radio.* below.
  'desktop.shell.radio.empty_hint',
  'desktop.shell.radio.placeholder',
  'desktop.shell.radio.send',
  'desktop.shell.radio.role_operator',
  'desktop.shell.radio.role_deckent',
  'desktop.shell.radio.gate_off',
  'desktop.shell.radio.failed',
  'desktop.shell.load_error',
  'desktop.shell.console.course',
  'desktop.shell.console.log',
  'desktop.shell.approval.title',
  'desktop.shell.approval.empty',
  'desktop.shell.history.title',
  'desktop.shell.chat.eyebrow',
  // ── SURF-5 — real-workflow organs («Emir» + preview + «Telgraf» + decide) ──
  'desktop.shell.console.order_placeholder',
  'desktop.shell.console.order_submit',
  'desktop.shell.order_failed',
  'desktop.shell.preview.title',
  'desktop.shell.preview.meta',
  'desktop.shell.preview.gate_findings',
  'desktop.shell.diff.title',
  'desktop.shell.diff.empty',
  'desktop.shell.diff.no_base',
  'desktop.shell.diff.not_git',
  'desktop.shell.diff.truncated',
  'desktop.shell.telegraph.title',
  'desktop.shell.telegraph.stop',
  'desktop.shell.telegraph.slow',
  'desktop.shell.telegraph.full',
  'desktop.shell.console.cancel',
  'desktop.shell.approval.allow',
  'desktop.shell.approval.deny',
  'desktop.shell.approval.decide_off',
  // 583/N3 «Makine Dairesi» — Desktop PTY panel
  'desktop.shell.nav.terminal',
  'desktop.shell.term.title',
  'desktop.shell.term.new_session',
  'desktop.shell.term.kind_shell',
  'desktop.shell.term.kind_deckent',
  'desktop.shell.term.kind_claude',
  'desktop.shell.term.kind_gemini',
  'desktop.shell.term.kind_codex',
  'desktop.shell.term.close_session',
  'desktop.shell.term.connecting',
  'desktop.shell.term.reconnecting',
  'desktop.shell.term.disabled',
  'desktop.shell.term.shell_kind_off',
  'desktop.shell.term.sessions_empty',
  'desktop.shell.term.exited',
  // ── D4-1 «Köprüüstü» watch (vardiya) theme system ──
  'desktop.theme.title',
  'desktop.theme.watch.nova',
  'desktop.theme.watch.day-watch',
  'desktop.theme.watch.night-watch',
  'desktop.theme.watch.open-sea',
] as const;

export type DesktopMessageKey = (typeof DESKTOP_MESSAGE_KEYS)[number];

/**
 * D4-4 — RunFlow state → served label key. The Desktop shows the SAME
 * localized state words the terminal's `/runs` inbox shows (buildInboxLabels,
 * src/cli/repl/run-flow-inbox.ts) — one vocabulary, two surfaces. A
 * drift-gate test (desktop-i18n.test.ts) asserts this map agrees with the
 * terminal's own mapping.
 */
export const FLOW_STATE_MESSAGE_KEYS = {
  COLLECTING: 'tui.inbox_state_collecting',
  PROPOSAL_READY: 'tui.inbox_state_proposed',
  PREVIEWING: 'tui.inbox_state_previewing',
  AWAITING_APPROVAL: 'tui.inbox_state_awaiting_approval',
  APPROVED: 'tui.inbox_state_approved',
  STARTING: 'tui.inbox_state_starting',
  DETACHED_RUNNING: 'tui.inbox_state_running',
  COMPLETED: 'tui.inbox_state_completed',
  FAILED: 'tui.inbox_state_failed',
  CANCELLED: 'tui.inbox_state_cancelled',
  BLOCKED: 'tui.inbox_state_blocked',
} as const satisfies Record<string, DesktopMessageKey>;
