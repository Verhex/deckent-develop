import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { postJson } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { SkeletonCard } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Brain, ShieldAlert, Check, X, Activity } from "lucide-react";

interface PendingApproval {
  id: string;
  type: string;
  description: string;
  detector: string;
  createdAt: string;
  risk: "low" | "medium" | "high";
}

interface DetectorInfo {
  id: string;
  name: string;
  enabled: boolean;
  triggerCount: number;
}

interface NervousStatus {
  panicGuard: boolean;
  detectors: DetectorInfo[];
  pendingCount: number;
}

export default function NervousPage() {
  const { data: status, loading: statusLoading, error: statusError, refetch: refetchStatus } =
    useApi<NervousStatus>("/api/nervous/status");
  const { data: pending, loading: pendingLoading, error: pendingError, refetch: refetchPending } =
    useApi<PendingApproval[]>("/api/nervous/pending");

  const [actionError, setActionError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  async function handleAccept(id: string) {
    setActioning(id);
    setActionError(null);
    try {
      await postJson(`/api/nervous/accept/${id}`);
      refetchPending();
      refetchStatus();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActioning(null);
    }
  }

  async function handleReject(id: string) {
    setActioning(id);
    setActionError(null);
    try {
      await postJson(`/api/nervous/reject/${id}`);
      refetchPending();
      refetchStatus();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActioning(null);
    }
  }

  return (
    <div className="space-y-6" data-testid="nervous-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Nervous System</h1>
        {status && (
          <Badge
            data-testid="panic-guard-badge"
            className={status.panicGuard ? "bg-red-900 text-red-300" : "bg-green-900 text-green-300"}
          >
            {status.panicGuard ? "Panic Guard ACTIVE" : "Panic Guard off"}
          </Badge>
        )}
      </div>

      {actionError && (
        <p className="text-red-400 text-sm" data-testid="action-error">Error: {actionError}</p>
      )}

      {/* Detector Status */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-300" />
            Detector Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statusLoading && <SkeletonCard />}
          {statusError && <p className="text-red-400">Error: {statusError}</p>}
          {status && status.detectors.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="detector-list">
              {status.detectors.map((detector) => (
                <Badge
                  key={detector.id}
                  data-testid={`detector-${detector.id}`}
                  className={detector.enabled ? "bg-brand-bg text-brand-300" : "bg-zinc-700 text-zinc-500"}
                  title={`Triggered ${detector.triggerCount} times`}
                >
                  {detector.name}
                </Badge>
              ))}
            </div>
          )}
          {!statusLoading && !statusError && (!status || status.detectors.length === 0) && (
            <EmptyState
              icon={Activity}
              title="No detectors"
              description="No Nervous System detectors are configured."
            />
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            Pending Approvals
            {pending && pending.length > 0 && (
              <Badge className="ml-2 bg-yellow-900 text-yellow-300">{pending.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingLoading && <SkeletonCard />}
          {pendingError && <p className="text-red-400">Error: {pendingError}</p>}
          {pending && pending.length > 0 && (
            <div className="space-y-3" data-testid="pending-list">
              {pending.map((approval) => (
                <div
                  key={approval.id}
                  data-testid={`approval-${approval.id}`}
                  className="rounded-md border border-zinc-800 p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldAlert className="w-4 h-4 text-yellow-400 shrink-0" />
                      <span className="font-medium text-zinc-100 text-sm">{approval.type}</span>
                      <Badge className={
                        approval.risk === "high" ? "bg-red-900 text-red-300 text-xs" :
                        approval.risk === "medium" ? "bg-yellow-900 text-yellow-300 text-xs" :
                        "bg-zinc-700 text-zinc-400 text-xs"
                      }>
                        {approval.risk}
                      </Badge>
                    </div>
                    <p className="text-sm text-zinc-400 mb-1">{approval.description}</p>
                    <p className="text-xs text-zinc-600">detector: {approval.detector} · {approval.createdAt}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      data-testid={`accept-${approval.id}`}
                      onClick={() => void handleAccept(approval.id)}
                      disabled={actioning === approval.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-green-900/60 text-green-300 hover:bg-green-900 disabled:opacity-50 transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      Accept
                    </button>
                    <button
                      data-testid={`reject-${approval.id}`}
                      onClick={() => void handleReject(approval.id)}
                      disabled={actioning === approval.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-red-900/60 text-red-300 hover:bg-red-900 disabled:opacity-50 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!pendingLoading && !pendingError && (!pending || pending.length === 0) && (
            <EmptyState
              icon={Brain}
              title="No pending approvals"
              description="All Nervous System proposals have been reviewed."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
