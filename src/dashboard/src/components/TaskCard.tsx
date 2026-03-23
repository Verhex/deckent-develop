import { useState } from "react";
import {
  CheckCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Pause,
  ChevronDown,
  ChevronRight,
  FileText,
  TestTube,
  RotateCcw,
} from "lucide-react";
import { Badge } from "./ui/badge";

// ─── Types ──────────────────────────────────────────────────────────

export interface TaskCardData {
  id: string;
  title: string;
  status: string;
  provider?: string;
  retries?: number;
  startedAt?: string;
  completedAt?: string;
  currentAction?: string;
  filesChanged?: string[];
  testResults?: { passed: number; failed: number; total: number };
  retryHistory?: Array<{ attempt: number; reason: string }>;
  feedbackLoop?: {
    tscAttempts: number;
    testAttempts: number;
  };
  dependsOn?: string[];
}

export interface TaskCardProps {
  task: TaskCardData;
}

// ─── Helpers (exported for testing) ─────────────────────────────────

export function getCardColor(status: string): string {
  switch (status) {
    case "DONE":
      return "border-green-800/50 bg-green-900/20";
    case "EXECUTING":
    case "CODING":
    case "TESTING":
    case "VERIFYING":
      return "border-blue-800/50 bg-blue-900/20";
    case "NO_GO":
    case "ERROR":
      return "border-red-800/50 bg-red-900/20";
    case "PAUSED":
      return "border-yellow-800/50 bg-yellow-900/20";
    default:
      return "border-zinc-700/50 bg-zinc-800/20";
  }
}

export function getCardIcon(status: string) {
  switch (status) {
    case "DONE":
      return CheckCircle;
    case "EXECUTING":
    case "CODING":
    case "TESTING":
    case "VERIFYING":
      return Loader2;
    case "NO_GO":
    case "ERROR":
      return AlertTriangle;
    case "PAUSED":
      return Pause;
    default:
      return Clock;
  }
}

export function getCardIconColor(status: string): string {
  switch (status) {
    case "DONE":
      return "text-green-400";
    case "EXECUTING":
    case "CODING":
    case "TESTING":
    case "VERIFYING":
      return "text-blue-400";
    case "NO_GO":
    case "ERROR":
      return "text-red-400";
    case "PAUSED":
      return "text-yellow-400";
    default:
      return "text-zinc-500";
  }
}

export function describeCurrentAction(task: TaskCardData): string {
  if (task.currentAction) return task.currentAction;

  switch (task.status) {
    case "DONE":
      return "Completed";
    case "EXECUTING":
      return "Working...";
    case "CODING":
      return "Writing code";
    case "TESTING": {
      const attempts = task.feedbackLoop?.testAttempts ?? 1;
      return attempts > 1
        ? `Running tests (attempt ${attempts}/3)`
        : "Running tests";
    }
    case "VERIFYING":
      return "Type checking";
    case "NO_GO":
      return "Failed — needs attention";
    case "ERROR":
      return "Error occurred";
    case "PAUSED":
      return "Paused";
    case "PENDING": {
      if (task.dependsOn && task.dependsOn.length > 0) {
        return `Waiting for Task ${task.dependsOn[0]}`;
      }
      return "Queued";
    }
    default:
      return "Waiting";
  }
}

export function getBadgeVariant(
  status: string,
): "success" | "info" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "DONE":
      return "success";
    case "EXECUTING":
    case "CODING":
    case "TESTING":
    case "VERIFYING":
      return "info";
    case "NO_GO":
    case "ERROR":
      return "destructive";
    case "PAUSED":
      return "warning";
    default:
      return "secondary";
  }
}

export function getBadgeLabel(status: string): string {
  switch (status) {
    case "DONE":
      return "Done";
    case "EXECUTING":
      return "Active";
    case "CODING":
      return "Writing code";
    case "TESTING":
      return "Running tests";
    case "VERIFYING":
      return "Type checking";
    case "NO_GO":
      return "No-Go";
    case "ERROR":
      return "Error";
    case "PAUSED":
      return "Paused";
    case "PENDING":
      return "Queued";
    case "DRAFT":
      return "Draft";
    default:
      return "Waiting";
  }
}

// ─── Component ──────────────────────────────────────────────────────

export function TaskCard({ task }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const Icon = getCardIcon(task.status);
  const iconColor = getCardIconColor(task.status);
  const cardColor = getCardColor(task.status);
  const action = describeCurrentAction(task);
  const isActive = ["EXECUTING", "CODING", "TESTING", "VERIFYING"].includes(
    task.status,
  );
  const hasDetails =
    (task.filesChanged && task.filesChanged.length > 0) ||
    task.testResults ||
    (task.retryHistory && task.retryHistory.length > 0);

  return (
    <div
      className={`rounded-md border ${cardColor} transition-colors`}
      data-testid={`task-card-${task.id}`}
      data-status={task.status}
    >
      {/* Main row */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        onClick={() => hasDetails && setExpanded(!expanded)}
        data-testid={`task-card-toggle-${task.id}`}
      >
        <div className="flex items-center gap-2">
          {hasDetails ? (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            )
          ) : (
            <span className="inline-block w-4" />
          )}
          <Icon
            className={`h-4 w-4 ${iconColor} ${isActive ? "animate-spin" : ""}`}
          />
          <span className="text-sm font-medium text-zinc-200">
            Task {task.id}
          </span>
          <span className="text-sm text-zinc-400">{task.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs text-zinc-400"
            data-testid={`task-action-${task.id}`}
          >
            {action}
          </span>
          <Badge variant={getBadgeVariant(task.status)}>
            {getBadgeLabel(task.status)}
          </Badge>
        </div>
      </button>

      {/* Expandable details */}
      {expanded && hasDetails && (
        <div
          className="border-t border-zinc-700/30 px-4 py-3 space-y-3"
          data-testid={`task-details-${task.id}`}
        >
          {/* Files changed */}
          {task.filesChanged && task.filesChanged.length > 0 && (
            <div data-testid={`task-files-${task.id}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1">
                <FileText className="h-3.5 w-3.5" />
                Files changed ({task.filesChanged.length})
              </div>
              <ul className="ml-5 space-y-0.5">
                {task.filesChanged.map((file) => (
                  <li key={file} className="text-xs text-zinc-500 font-mono">
                    {file}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Test results */}
          {task.testResults && (
            <div data-testid={`task-tests-${task.id}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1">
                <TestTube className="h-3.5 w-3.5" />
                Test results
              </div>
              <div className="ml-5 flex gap-4 text-xs">
                <span className="text-green-400">
                  {task.testResults.passed} passed
                </span>
                {task.testResults.failed > 0 && (
                  <span className="text-red-400">
                    {task.testResults.failed} failed
                  </span>
                )}
                <span className="text-zinc-500">
                  {task.testResults.total} total
                </span>
              </div>
            </div>
          )}

          {/* Retry history */}
          {task.retryHistory && task.retryHistory.length > 0 && (
            <div data-testid={`task-retries-${task.id}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1">
                <RotateCcw className="h-3.5 w-3.5" />
                Retry history ({task.retryHistory.length})
              </div>
              <ul className="ml-5 space-y-0.5">
                {task.retryHistory.map((retry) => (
                  <li
                    key={retry.attempt}
                    className="text-xs text-zinc-500"
                  >
                    Attempt {retry.attempt}: {retry.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
