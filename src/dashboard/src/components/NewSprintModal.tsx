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
          <DialogTitle>Yeni Sprint</DialogTitle>
        </DialogHeader>

        {step === "directives" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Enter sprint directives below. Each &quot;## Task&quot; block defines a task.
            </p>
            <Textarea
              value={directives}
              onChange={(e) => setDirectives(e.target.value)}
              placeholder="# Sprint Directives&#10;&#10;## Task 1: ..."
              rows={10}
              data-testid="directives-textarea"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSetDirectives} disabled={!directives.trim()}>
                Plan Sprint
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "planning" && (
          <div className="flex items-center justify-center py-8">
            <p className="text-zinc-400">Planning sprint...</p>
          </div>
        )}

        {step === "review" && plan && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              {taskCount} task(s) parsed. Sprint <strong className="text-zinc-100">{plan.id}</strong> planned with {plan.tasks.length} task(s):
            </p>
            <ul className="max-h-48 space-y-1 overflow-auto text-sm">
              {plan.tasks.map((t) => (
                <li key={t.id} className="rounded bg-zinc-800 px-3 py-1.5">
                  <span className="font-mono text-blue-400">{t.id}</span>{" "}
                  <span className="text-zinc-300">{t.title}</span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleStart}>Confirm &amp; Start</Button>
            </DialogFooter>
          </div>
        )}

        {step === "starting" && (
          <div className="flex items-center justify-center py-8">
            <p className="text-zinc-400">Starting sprint...</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <p className="text-green-400">Sprint started successfully!</p>
            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <p className="text-red-400">{error}</p>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={() => setStep("directives")}>Try Again</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
