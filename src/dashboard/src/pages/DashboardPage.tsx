import { useState, useEffect, useCallback } from "react";
import { Activity, AlertTriangle, Info, XOctagon, Skull, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { NewSprintModal } from "../components/NewSprintModal";
import { useSSE } from "../hooks/useSSE";
import { fetchJson, postJson, ApiError } from "../lib/api";
import type { DashboardState, AgentInfo, Alert } from "../types";

const PHASE_COLORS: Record<string, string> = {
  DIRECTIVE: "secondary",
  PLAN: "info",
  SPAWN: "info",
  EXECUTE: "warning",
  EVALUATE: "warning",
  FIX: "critical",
  RETRO: "success",
  DECAY: "secondary",
  TRANSITION: "secondary",
  COMPLETE: "success",
};

const ALERT_VARIANT: Record<string, "info" | "warning" | "critical"> = {
  info: "info",
  INFO: "info",
  warn: "warning",
  WARNING: "warning",
  error: "critical",
  CRITICAL: "critical",
};

const ALERT_ICON: Record<string, typeof Info> = {
  info: Info,
  INFO: Info,
  warn: AlertTriangle,
  WARNING: AlertTriangle,
  error: XOctagon,
  CRITICAL: XOctagon,
};

const STATUS_VARIANT: Record<string, "info" | "success" | "critical" | "secondary"> = {
  EXECUTING: "info",
  DONE: "success",
  ERROR: "critical",
  IDLE: "secondary",
};

function elapsed(startedAt?: string): string {
  if (!startedAt) return "-";
  const ms = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function relativeTime(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function DashboardPage() {
  const sseState = useSSE("/api/events");
  const [fallbackState, setFallbackState] = useState<DashboardState | null>(null);
  const [noSprint, setNoSprint] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!sseState) {
      fetchJson<DashboardState>("/api/status")
        .then((data) => {
          setFallbackState(data);
          setNoSprint(false);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) {
            setNoSprint(true);
          }
        });
    }
  }, [sseState]);

  const state = sseState ?? fallbackState;

  const handleKill = useCallback(async (agentId: string) => {
    if (!confirm(`Kill worker ${agentId}?`)) return;
    try {
      await postJson(`/api/kill/${agentId}`);
      if (!sseState) {
        fetchJson<DashboardState>("/api/status")
          .then(setFallbackState)
          .catch(() => {});
      }
    } catch {
      // error handled silently
    }
  }, [sseState]);

  const agents = state?.agents ?? [];
  const alerts = state?.alerts ?? [];
  const progress = state?.progress;

  const done = progress?.done ?? 0;
  const active = progress?.active ?? 0;
  const blocked = progress?.blocked ?? 0;
  const total = progress?.total ?? 0;
  const pending = total - done - active - blocked;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Yeni Sprint
        </Button>
      </div>

      {/* Sprint Status Card */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-zinc-100">
            <Activity className="h-5 w-5 text-blue-400" />
            Sprint Status
          </CardTitle>
          {state?.sprint?.phase && (
            <Badge
              variant={
                (PHASE_COLORS[state.sprint.phase] as "info" | "warning" | "critical" | "success" | "secondary") ?? "secondary"
              }
            >
              {state.sprint.phase}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {state ? (
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-zinc-400">Sprint ID</p>
                <p className="font-mono text-zinc-100">
                  {state.sprint.id ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-zinc-400">Phase</p>
                <p className="text-zinc-100">{state.sprint.phase}</p>
              </div>
              <div>
                <p className="text-zinc-400">Status</p>
                <p className="text-zinc-100">{state.sprint.status}</p>
              </div>
              <div>
                <p className="text-zinc-400">Updated</p>
                <p className="text-zinc-100">
                  {state.updatedAt ? relativeTime(state.updatedAt) : "—"}
                </p>
              </div>
            </div>
          ) : noSprint ? (
            <p className="text-zinc-500">No active sprint. Run <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-300">deckent start</code> first.</p>
          ) : (
            <p className="text-zinc-500">No sprint data available.</p>
          )}
        </CardContent>
      </Card>

      {/* Progress Section */}
      {total > 0 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-zinc-100">Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress
              total={total}
              segments={[
                { value: done, color: "bg-green-500", label: `Done: ${done}` },
                { value: active, color: "bg-blue-500", label: `Active: ${active}` },
                {
                  value: Math.max(0, pending),
                  color: "bg-zinc-600",
                  label: `Pending: ${Math.max(0, pending)}`,
                },
              ]}
            />
            <p className="text-sm text-zinc-400">
              {done}/{total} done, {active} active, {Math.max(0, pending)}{" "}
              pending
            </p>
          </CardContent>
        </Card>
      )}

      {/* Worker Table */}
      {agents.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-zinc-100">Workers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Elapsed</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent: AgentInfo) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-mono">
                      {agent.id}
                    </TableCell>
                    <TableCell>{agent.taskId ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[agent.status] ?? "secondary"}
                      >
                        {agent.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{elapsed(agent.spawnedAt)}</TableCell>
                    <TableCell className="text-right">
                      {agent.status === "EXECUTING" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleKill(agent.id)}
                        >
                          <Skull className="mr-1 h-3 w-3" />
                          Kill
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-zinc-100">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {alerts.map((alert: Alert, i: number) => {
                const Icon = ALERT_ICON[alert.level] ?? Info;
                return (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-md bg-zinc-800/50 px-3 py-2"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={ALERT_VARIANT[alert.level] ?? "info"}>
                          {alert.level.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-zinc-500">
                          {alert.timestamp}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-300">
                        {alert.message}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* New Sprint Modal */}
      <NewSprintModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
