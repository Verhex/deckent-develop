import { getMessage } from '../../../cli/helpers/messages.js';
import type { Mission } from './mission-types.js';

// ─── i18n keys (to be added to messages.ts; graceful fallback when absent) ──
const KEY_TITLE = 'mission.settled.title';
const KEY_SUMMARY = 'mission.settled.summary';

/** Payload delivered to the notify channel when a mission settles. */
export interface MissionNotifyPayload {
  to: string | null;
  title: string;
  status: string;
  summary: string;
}

/** Injected dependencies for makeMissionDeliver. */
export interface MissionDeliverDeps {
  /** Send a notification; may be async. Errors are swallowed (fail-safe). */
  notify(payload: MissionNotifyPayload): void | Promise<void>;
  /** UI language — defaults to 'en'. */
  lang?: string;
}

/**
 * Build an `onMissionSettled` handler suitable for `MissionSchedulerOptions`.
 * Inject `deps.notify` for the actual delivery channel (real or test fake).
 */
export function makeMissionDeliver(
  deps: MissionDeliverDeps,
): (mission: Mission) => void {
  const lang = deps.lang ?? 'en';

  return (mission: Mission): void => {
    const rawTitle = getMessage(KEY_TITLE, lang, { title: mission.title });
    const title = rawTitle === KEY_TITLE ? `Mission settled: ${mission.title}` : rawTitle;

    const rawSummary = getMessage(KEY_SUMMARY, lang, {
      status: mission.status,
      id: mission.id,
    });
    const summary =
      rawSummary === KEY_SUMMARY
        ? `Mission ${mission.id} finished with status: ${mission.status}`
        : rawSummary;

    const payload: MissionNotifyPayload = {
      to: mission.deliverTo ?? null,
      title,
      status: mission.status,
      summary,
    };

    let result: void | Promise<void>;
    try {
      result = deps.notify(payload);
    } catch (err: unknown) {
      console.error(
        '[mission-deliver] notify failed (fail-safe):',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch((err: unknown) => {
        console.error(
          '[mission-deliver] notify failed (fail-safe):',
          err instanceof Error ? err.message : String(err),
        );
      });
    }
  };
}
