import { useTranslation } from "../i18n/LanguageProvider";

const PHASES = [
  "PLAN",
  "SPAWN",
  "EXECUTE",
  "EVALUATE",
  "FIX",
  "RETRO",
  "DECAY",
  "CLEANUP",
] as const;

interface SprintPhaseTimelineProps {
  currentPhase: string;
}

export function SprintPhaseTimeline({ currentPhase }: SprintPhaseTimelineProps) {
  const { t } = useTranslation();

  const currentIndex = PHASES.indexOf(currentPhase as (typeof PHASES)[number]);

  return (
    <div className="mt-3">
      <p className="text-xs text-zinc-400 mb-2">{t("dashboard.phase_timeline")}</p>
      <div className="overflow-x-auto pb-2">
        <div className="flex items-center min-w-max">
          {PHASES.map((phase, index) => {
            const isCompleted = currentIndex >= 0 && index < currentIndex;
            const isActive = index === currentIndex;
            const isFuture = currentIndex < 0 || index > currentIndex;

            return (
              <div key={phase} className="flex items-center">
                {/* Phase node */}
                <div className="flex flex-col items-center">
                  {/* Circle */}
                  <div
                    className={[
                      "flex items-center justify-center rounded-full transition-all duration-300",
                      isActive
                        ? "w-5 h-5 bg-brand-500 ring-2 ring-brand-400 ring-offset-1 ring-offset-zinc-900 shadow-[0_0_0_3px_rgba(84,168,156,0.35)] animate-pulse"
                        : isCompleted
                        ? "w-4 h-4 bg-green-500"
                        : "w-4 h-4 border-2 border-zinc-600 bg-zinc-900",
                    ].join(" ")}
                  >
                    {isCompleted && (
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  {/* Label */}
                  <span
                    className={[
                      "text-xs mt-1 whitespace-nowrap",
                      isActive
                        ? "text-brand-300 font-semibold"
                        : isCompleted
                        ? "text-green-400"
                        : "text-zinc-500",
                    ].join(" ")}
                  >
                    {phase}
                  </span>
                </div>

                {/* Connector line (not after last phase) */}
                {index < PHASES.length - 1 && (
                  <div
                    className={[
                      "h-0.5 w-6 mx-1 mb-4 transition-colors duration-300",
                      isCompleted ? "bg-green-500" : "bg-zinc-600",
                    ].join(" ")}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
