export type { DocUpdater, DocUpdateContext, DocUpdateResult, SprintResult } from './types.js';
export { registerUpdater, getRegisteredUpdaters, clearUpdaters, runAllUpdaters } from './registry.js';
export { changelogUpdater } from './changelog.js';
export { sprintLogUpdater } from './sprint-log.js';
export { readmeMetricsUpdater } from './readme-metrics.js';
export { healthCheckUpdater } from './health-check.js';

// ─── Auto-register all updaters ─────────────────────────────────────
import { registerUpdater } from './registry.js';
import { changelogUpdater } from './changelog.js';
import { sprintLogUpdater } from './sprint-log.js';
import { readmeMetricsUpdater } from './readme-metrics.js';
import { healthCheckUpdater } from './health-check.js';

registerUpdater(changelogUpdater);
registerUpdater(sprintLogUpdater);
registerUpdater(readmeMetricsUpdater);
registerUpdater(healthCheckUpdater);
