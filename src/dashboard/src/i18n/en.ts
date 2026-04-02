export const en = {
  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.settings': 'Settings',
  'nav.history': 'History',
  'nav.memory': 'Memory',
  'nav.config': 'Config',

  // Layout
  'layout.subtitle': 'agent orchestration',
  'layout.auditor': 'Auditor',
  'layout.active': 'Active',
  'layout.inactive': 'Inactive',
  'layout.language': 'Language',

  // Dashboard Page
  'dashboard.title': 'Sprint Dashboard',
  'dashboard.no_sprint': 'No active sprint',
  'dashboard.no_sprint_hint': 'Run `deckent start` to begin a sprint.',
  'dashboard.phase': 'Phase',
  'dashboard.elapsed': 'Elapsed',
  'dashboard.progress': 'Progress',
  'dashboard.tasks': 'Tasks',
  'dashboard.agents': 'Agents',
  'dashboard.alerts': 'Alerts',
  'dashboard.no_alerts': 'No active alerts.',
  'dashboard.usage': 'Usage',
  'dashboard.worker': 'Worker',
  'dashboard.task': 'Task',
  'dashboard.model': 'Model',
  'dashboard.status': 'Status',
  'dashboard.action': 'Action',
  'dashboard.kill': 'Kill',
  'dashboard.done': 'done',
  'dashboard.running': 'running',
  'dashboard.queued': 'queued',
  'dashboard.failed': 'failed',
  'dashboard.new_sprint': 'New Sprint',
  'dashboard.cleanup': 'Cleanup',
  'dashboard.kill_all': 'Kill All',
  'dashboard.confirm_cleanup': 'Archive sprint files?',
  'dashboard.confirm_kill': 'Stop all workers?',
  'dashboard.phase_timeline': 'Sprint Phases',

  // Settings Page
  'settings.title': 'Settings & Health',
  'settings.doctor': 'System Health',
  'settings.run_doctor': 'Run Doctor',
  'settings.check': 'Check',
  'settings.result': 'Result',
  'settings.details': 'Details',
  'settings.passed': 'Passed',
  'settings.failed': 'Failed',
  'settings.warning': 'Warning',
  'settings.health_score': 'Health Score',

  // History Page
  'history.title': 'Sprint History',
  'history.no_history': 'No sprint history found.',
  'history.sprint': 'Sprint',
  'history.date': 'Date',
  'history.total_tasks': 'Tasks',
  'history.completed': 'Done',
  'history.nogo_rate': 'NO_GO %',
  'history.coverage': 'Coverage',
  'history.duration': 'Duration',
  'history.trend': 'Trend',

  // Memory Page
  'memory.title': 'Brain Memory',
  'memory.tab_memory': 'Memory',
  'memory.tab_debt': 'Tech Debt',
  'memory.no_memory': 'No memory content found.',
  'memory.no_debt': 'No technical debt found.',

  // Config Page
  'config.title': 'Configuration',
  'config.save': 'Save',
  'config.saving': 'Saving...',
  'config.saved': 'Configuration saved.',
  'config.error': 'Failed to save configuration.',
  'config.reset': 'Reset to Defaults',
  'config.category.provider': 'Provider',
  'config.category.sprint': 'Sprint',
  'config.category.memory': 'Memory',
  'config.category.auditor': 'Auditor',
  'config.category.output': 'Output',
  'config.category.search': 'Search',
  'config.category.notifications': 'Notifications',
  'config.category.telemetry': 'Telemetry',
  'config.category.environment': 'Environment',
  'config.category.routing': 'Routing',
  'config.category.rollback': 'Rollback',
  'config.category.project': 'Project',
  'config.category.advanced': 'Advanced',

  // Activity Feed
  'activity.title': 'Live Activity',
  'activity.spawned': 'spawned',
  'activity.writing': 'writing',
  'activity.done': 'DONE',
  'activity.nogo': 'NO_GO',
  'activity.stale': 'Stale heartbeat',
  'activity.phase_changed': 'Phase changed →',
  'activity.no_activity': 'Start a sprint, activity will appear here.',
  'activity.waiting': 'Waiting for activity...',

  // Worker Card
  'worker.model': 'Model',
  'worker.agent': 'Agent',
  'worker.skill': 'Skill',
  'worker.elapsed': 'Elapsed',
  'worker.heartbeat': 'Heartbeat',
  'worker.files_changed': 'Files changed',
  'worker.detail': 'Detail',
  'worker.no_workers': 'No workers yet — start a sprint',

  // Welcome Screen
  'welcome.no_sprint': 'No active sprint.',
  'welcome.start_hint': 'Use the New Sprint button to begin.',
  'welcome.last_sprint': 'Last sprint',

  // Dashboard additional
  'dashboard.sprint_status': 'Sprint Status',
  'dashboard.sprint_id': 'Sprint ID',
  'dashboard.updated': 'Updated',
  'dashboard.usage_5hr': '5hr Usage',
  'dashboard.usage_weekly': 'Weekly Usage',
  'dashboard.usage_tokens': 'Sprint Token Estimate',
  'dashboard.usage_cost': 'Total Cost Estimate',
  'dashboard.usage_estimated': 'Estimated',
  'dashboard.usage_note': 'Showing estimates — live usage API not available',
  'dashboard.active': 'Active',
  'dashboard.pending': 'Pending',
  'dashboard.violations': 'violations',
  'dashboard.confirm_kill_worker': 'Kill worker',

  // History additional
  'history.all_sprints': 'All Sprints',
  'history.sprint_id': 'Sprint ID',
  'history.success_rate': 'Success %',
  'history.tech_debt': 'Tech Debt',
  'history.nogo': 'No-Go',
  'history.success_rate_trend': 'Success Rate Trend',
  'history.trend_legend': 'Last 10 sprints',

  // Memory additional
  'memory.technical_debt': 'Technical Debt',

  // Config additional
  'config.save_changes': 'Save Changes',
  'config.loading': 'Loading configuration...',
  'config.reset_field': 'Reset',
  'config.save_success': 'Configuration saved successfully.',
  'config.doctor_ok': 'All required checks passed',
  'config.doctor_fail': 'Some required checks failed',
  'config.required': 'required',

  // New Sprint Modal
  'modal.directives_hint': 'Enter sprint directives below. Each "## Task" block defines a task.',
  'modal.plan_sprint': 'Plan Sprint',
  'modal.planning': 'Planning sprint...',
  'modal.review_tasks_parsed': 'task(s) parsed. Sprint',
  'modal.review_planned_with': 'planned with',
  'modal.review_tasks_suffix': 'task(s):',
  'modal.confirm_start': 'Confirm & Start',
  'modal.starting': 'Starting sprint...',
  'modal.success': 'Sprint started successfully!',
  'modal.try_again': 'Try Again',

  // Agent Detail
  'agent.worker': 'Worker',
  'agent.scope': 'Scope',
  'agent.log_output': 'Log Output',
  'agent.no_log': 'No log output yet.',

  // Common
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.retry': 'Retry',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.yes': 'Yes',
  'common.no': 'No',
} as const;

export type TranslationKey = keyof typeof en;
