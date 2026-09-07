import type { MessageFamily } from './cli-common.js';

export const AUTONOMOUS_PLANNER_MESSAGES: MessageFamily = Object.freeze({
  'autonomous.planner.spawn_failed': {
    en: 'Planner could not start ({provider}): {reason}',
    tr: 'Planner başlatılamadı ({provider}): {reason}',
  },
  'autonomous.planner.timeout': {
    en: 'Planner timed out ({provider}); raise the timeout or narrow the goal',
    tr: 'Planner zaman aşımına uğradı ({provider}); zaman aşımını artırın veya hedefi daraltın',
  },
  'autonomous.planner.response_limit': {
    en: 'Planner response exceeded {bytes} bytes ({provider})',
    tr: 'Planner yanıtı {bytes} bayt sınırını aştı ({provider})',
  },
  'autonomous.planner.exit_failed': {
    en: 'Planner exited with status {status} ({provider}): {reason}',
    tr: 'Planner {status} durumuyla sonlandı ({provider}): {reason}',
  },
});
