import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { postJson } from "../lib/api";
import { useTranslation } from "../i18n/LanguageProvider";

type ModalStep = "directives" | "planning" | "review" | "starting" | "done" | "error";

interface PlanTask {
  id: string;
  title: string;
}

interface PlanResult {
  id: string;
  tasks: PlanTask[];
}

interface NewSprintModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewSprintModal({ open, onOpenChange }: NewSprintModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<ModalStep>("directives");
  const [directives, setDirectives] = useState("");
  const [taskCount, setTaskCount] = useState(0);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [error, setError] = useState("");

  function reset() {
    setStep("directives");
    setDirectives("");
    setTaskCount(0);
    setPlan(null);
    setError("");
  }

  function handleClose() {
    onOpenChange(false);
    reset();
  }

  async function handleSetDirectives() {
    if (!directives.trim()) return;
    setStep("planning");
    setError("");
    try {
      const res = await postJson<{ success: boolean; taskCount: number }>(
        "/api/set-directives",
        { content: directives },
      );
      setTaskCount(res.taskCount);
      const planRes = await postJson<PlanResult>("/api/plan");
      setPlan(planRes);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  async function handleStart() {
    setStep("starting");
    setError("");
    try {
      await postJson("/api/start");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dashboard.new_sprint")}</DialogTitle>
        </DialogHeader>

        {step === "directives" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              {t("modal.directives_hint")}
            </p>
            <Textarea
              value={directives}
              onChange={(e) => setDirectives(e.target.value)}
              placeholder={t("modal.directives_placeholder")}
              rows={10}
              data-testid="directives-textarea"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSetDirectives} disabled={!directives.trim()}>
                {t("modal.plan_sprint")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "planning" && (
          <div className="flex items-center justify-center py-8">
            <p className="text-zinc-400">{t("modal.planning")}</p>
          </div>
        )}

        {step === "review" && plan && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              {taskCount} {t("modal.review_tasks_parsed")} <strong className="text-zinc-100">{plan.id}</strong> {t("modal.review_planned_with")} {plan.tasks.length} {t("modal.review_tasks_suffix")}
            </p>
            <ul className="max-h-48 space-y-1 overflow-auto text-sm">
              {plan.tasks.map((task) => (
                <li key={task.id} className="rounded bg-zinc-800 px-3 py-1.5">
                  <span className="font-mono text-blue-400">{task.id}</span>{" "}
                  <span className="text-zinc-300">{task.title}</span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleStart}>{t("modal.confirm_start")}</Button>
            </DialogFooter>
          </div>
        )}

        {step === "starting" && (
          <div className="flex items-center justify-center py-8">
            <p className="text-zinc-400">{t("modal.starting")}</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <p className="text-green-400">{t("modal.success")}</p>
            <DialogFooter>
              <Button onClick={handleClose}>{t("common.close")}</Button>
            </DialogFooter>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <p className="text-red-400">{error}</p>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                {t("common.close")}
              </Button>
              <Button onClick={() => setStep("directives")}>{t("modal.try_again")}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
