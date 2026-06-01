import { useState } from "react";
import { Terminal, FileText, Play, CheckCircle } from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  guide: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "init",
    title: "Initialize your project",
    description: "Set up deckent in your project directory to get started.",
    guide: "Run `deckent init` in your project root. This creates the .deckent/ config and .brain/ memory directories.",
    icon: Terminal,
  },
  {
    id: "directives",
    title: "Write your sprint directives",
    description: "Describe the tasks you want your AI workers to complete.",
    guide: "Use the New Sprint button or edit DIRECTIVES.md directly. List tasks with scope, model, and acceptance criteria.",
    icon: FileText,
  },
  {
    id: "start",
    title: "Start your first sprint",
    description: "Launch AI workers to execute your tasks in parallel.",
    guide: "Click 'New Sprint' or run `deckent start`. Workers will be spawned and you can monitor progress here.",
    icon: Play,
  },
];

interface OnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const step = ONBOARDING_STEPS[currentStep];
  const isLast = currentStep === ONBOARDING_STEPS.length - 1;
  const Icon = step.icon;

  function handleNext() {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[400px] p-8"
      data-testid="onboarding-wizard"
    >
      {/* Step progress indicators */}
      <div className="flex items-center gap-2 mb-8" data-testid="onboarding-steps">
        {ONBOARDING_STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                i < currentStep
                  ? "bg-green-600 text-white"
                  : i === currentStep
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-500"
              }`}
              data-testid={`onboarding-step-indicator-${i}`}
            >
              {i < currentStep ? <CheckCircle className="w-4 h-4" /> : i + 1}
            </div>
            {i < ONBOARDING_STEPS.length - 1 && (
              <div
                className={`h-px w-12 transition-colors ${
                  i < currentStep ? "bg-green-600" : "bg-zinc-700"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step icon */}
      <div className="rounded-full bg-zinc-800 p-5 mb-6">
        <Icon className="w-10 h-10 text-blue-400" />
      </div>

      {/* Step content */}
      <h2
        className="text-xl font-semibold text-zinc-100 mb-2 text-center"
        data-testid="onboarding-step-title"
      >
        {step.title}
      </h2>
      <p className="text-sm text-zinc-400 max-w-sm text-center mb-4">
        {step.description}
      </p>
      <div className="bg-zinc-800/60 rounded-lg px-4 py-3 mb-8 max-w-md w-full">
        <p className="text-xs text-zinc-400 font-mono leading-relaxed">
          {step.guide}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSkip}
          className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          data-testid="onboarding-skip"
        >
          Skip
        </button>
        <button
          onClick={handleNext}
          className="px-5 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          data-testid="onboarding-next"
        >
          {isLast ? "Get started" : "Next"}
        </button>
      </div>
    </div>
  );
}
