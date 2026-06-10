import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { SkeletonTable } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Building2, Shield, FileText, Gauge, AlertTriangle } from "lucide-react";
import type { Alert } from "../types";

interface TenantInfo {
  id: string;
  name: string;
  status: string;
  users: number;
  createdAt: string;
}

interface RbacRole {
  role: "admin" | "operator" | "viewer";
  permissions: string[];
}

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  resource: string;
  timestamp: string;
  result: "success" | "denied";
}

interface RateLimitInfo {
  endpoint: string;
  limit: number;
  remaining: number;
  resetAt: string;
}

const ROLE_ORDER: Record<string, number> = { admin: 0, operator: 1, viewer: 2 };

const DOC_SYNC_RE = /CLAUDE\.md|GEMINI\.md|AGENTS\.md|doc.sync|docs not synced/i;
const PROVIDER_LABEL = "CLAUDE/GEMINI/AGENTS";

function dedupDocSyncAlerts(alerts: Alert[]): Alert[] {
  let docSyncSeen = false;
  return alerts.reduce<Alert[]>((acc, alert) => {
    if (DOC_SYNC_RE.test(alert.message)) {
      if (!docSyncSeen) {
        docSyncSeen = true;
        acc.push({ ...alert, message: `Provider docs not synced (${PROVIDER_LABEL})` });
      }
    } else {
      acc.push(alert);
    }
    return acc;
  }, []);
}

export default function EnterprisePage() {
  const { data: tenants, loading: tenantsLoading, error: tenantsError } = useApi<TenantInfo[]>("/api/enterprise/tenants");
  const { data: rbac, loading: rbacLoading, error: rbacError } = useApi<RbacRole[]>("/api/enterprise/rbac");
  const { data: audit, loading: auditLoading, error: auditError } = useApi<AuditEntry[]>("/api/enterprise/audit");
  const { data: rate, loading: rateLoading, error: rateError } = useApi<RateLimitInfo[]>("/api/enterprise/rate");
  const { data: statusData } = useApi<{ alerts: Alert[] }>("/api/status");
  const { identity } = useAuth();

  const sortedRbac = rbac
    ? [...rbac].sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99))
    : null;

  // Authorization: Bearer token auto-attached by fetchJson (lib/api.ts authHeaders)
  const token = typeof window !== "undefined"
    ? (window as unknown as { __DECKENT_API_TOKEN__?: string }).__DECKENT_API_TOKEN__
    : undefined;
  const rawAlerts: Alert[] = statusData?.alerts ?? [];
  const dedupedAlerts = dedupDocSyncAlerts(rawAlerts);

  return (
    <div className="space-y-6" data-testid="enterprise-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Enterprise</h1>
        <div className="flex items-center gap-2" data-testid="enterprise-auth-status">
          {identity?.role && (
            <Badge className="bg-brand-900 text-brand-300" data-testid="my-role-badge">
              You are: {identity.role}
            </Badge>
          )}
          {identity && !identity.role && identity.mode === 'static' && (
            <Badge className="bg-zinc-700 text-zinc-400" data-testid="my-role-badge">
              local (full access)
            </Badge>
          )}
          <Badge className={token ? "bg-green-900 text-green-300" : "bg-zinc-700 text-zinc-400"}>
            {token ? "Authenticated" : "No auth token"}
          </Badge>
          {token && (
            <span className="text-xs text-zinc-500 font-mono">Authorization: Bearer ···</span>
          )}
        </div>
      </div>

      {dedupedAlerts.length > 0 && (
        <div className="space-y-2" data-testid="enterprise-alerts">
          {dedupedAlerts.map((alert, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2"
              data-testid="enterprise-alert-item"
            >
              <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
              <Badge className={
                alert.level === "CRITICAL" ? "bg-red-900 text-red-300" :
                alert.level === "WARNING" ? "bg-yellow-900 text-yellow-300" :
                "bg-zinc-700 text-zinc-400"
              }>
                {alert.level}
              </Badge>
              <span className="text-sm text-zinc-300">{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="tenants" data-testid="tab-tenants">Tenants</TabsTrigger>
          <TabsTrigger value="rbac" data-testid="tab-rbac">RBAC</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Log</TabsTrigger>
          <TabsTrigger value="rate" data-testid="tab-rate">Rate Limits</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Tenant List</CardTitle>
            </CardHeader>
            <CardContent>
              {tenantsLoading && <div aria-label="loading"><SkeletonTable rows={3} cols={4} /></div>}
              {tenantsError && <p className="text-red-400">Error: {tenantsError}</p>}
              {tenants && tenants.length > 0 && (
                <div className="overflow-x-auto" data-testid="tenant-list">
                  <table className="w-full text-sm text-zinc-300">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left py-2 pr-4 text-zinc-400">Name</th>
                        <th className="text-left py-2 pr-4 text-zinc-400">Status</th>
                        <th className="text-left py-2 pr-4 text-zinc-400">Users</th>
                        <th className="text-left py-2 text-zinc-400">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map((tenant) => (
                        <tr key={tenant.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                          <td className="py-2 pr-4 font-medium">{tenant.name}</td>
                          <td className="py-2 pr-4">
                            <Badge className={tenant.status === "active" ? "bg-green-900 text-green-300" : "bg-zinc-700 text-zinc-400"}>
                              {tenant.status}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4">{tenant.users}</td>
                          <td className="py-2 text-zinc-500">{tenant.createdAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!tenantsLoading && !tenantsError && (!tenants || tenants.length === 0) && (
                <EmptyState icon={Building2} title="No tenants" description="No tenants configured yet." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rbac">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">RBAC Role Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              {rbacLoading && <div aria-label="loading"><SkeletonTable rows={3} cols={2} /></div>}
              {rbacError && <p className="text-red-400">Error: {rbacError}</p>}
              {sortedRbac && sortedRbac.length > 0 && (
                <div className="space-y-4" data-testid="rbac-matrix">
                  {sortedRbac.map((entry) => {
                    const isMyRole = identity?.role === entry.role;
                    return (
                    <div
                      key={entry.role}
                      className={`rounded-md border p-4 ${isMyRole ? "border-brand-500 bg-brand-950/40" : "border-zinc-800"}`}
                      data-testid={isMyRole ? "my-role-row" : undefined}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="w-4 h-4 text-brand-300" />
                        <span className="font-semibold text-zinc-100 capitalize">{entry.role}</span>
                        <Badge className={
                          entry.role === "admin" ? "bg-red-900 text-red-300" :
                          entry.role === "operator" ? "bg-yellow-900 text-yellow-300" :
                          "bg-zinc-700 text-zinc-400"
                        }>
                          {entry.role}
                        </Badge>
                        {isMyRole && (
                          <Badge className="bg-brand-900 text-brand-300 text-xs" data-testid="my-role-indicator">
                            You
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {entry.permissions.map((perm) => (
                          <Badge key={perm} className="bg-zinc-800 text-zinc-300 text-xs">{perm}</Badge>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
              {!rbacLoading && !rbacError && (!sortedRbac || sortedRbac.length === 0) && (
                <EmptyState icon={Shield} title="No RBAC roles" description="No role definitions found." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Audit Log</CardTitle>
            </CardHeader>
            <CardContent>
              {auditLoading && <div aria-label="loading"><SkeletonTable rows={5} cols={5} /></div>}
              {auditError && <p className="text-red-400">Error: {auditError}</p>}
              {audit && audit.length > 0 && (
                <div className="overflow-x-auto" data-testid="audit-table">
                  <table className="w-full text-sm text-zinc-300">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left py-2 pr-4 text-zinc-400">Action</th>
                        <th className="text-left py-2 pr-4 text-zinc-400">Actor</th>
                        <th className="text-left py-2 pr-4 text-zinc-400">Resource</th>
                        <th className="text-left py-2 pr-4 text-zinc-400">Result</th>
                        <th className="text-left py-2 text-zinc-400">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((entry) => (
                        <tr key={entry.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                          <td className="py-2 pr-4 font-mono text-xs">{entry.action}</td>
                          <td className="py-2 pr-4">{entry.actor}</td>
                          <td className="py-2 pr-4 text-zinc-400">{entry.resource}</td>
                          <td className="py-2 pr-4">
                            <Badge className={entry.result === "success" ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}>
                              {entry.result}
                            </Badge>
                          </td>
                          <td className="py-2 text-zinc-500 text-xs">{entry.timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!auditLoading && !auditError && (!audit || audit.length === 0) && (
                <EmptyState icon={FileText} title="No audit entries" description="No audit events recorded yet." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rate">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Rate Limit Status</CardTitle>
            </CardHeader>
            <CardContent>
              {rateLoading && <div aria-label="loading"><SkeletonTable rows={3} cols={4} /></div>}
              {rateError && <p className="text-red-400">Error: {rateError}</p>}
              {rate && rate.length > 0 && (
                <div className="space-y-3" data-testid="rate-status">
                  {rate.map((item) => {
                    const pct = item.limit > 0 ? Math.round((item.remaining / item.limit) * 100) : 0;
                    return (
                      <div key={item.endpoint} className="rounded-md border border-zinc-800 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs text-zinc-300">{item.endpoint}</span>
                          <span className="text-xs text-zinc-500">{item.remaining}/{item.limit}</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${pct > 50 ? "bg-green-500" : pct > 20 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-zinc-600 mt-1">Resets: {item.resetAt}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {!rateLoading && !rateError && (!rate || rate.length === 0) && (
                <EmptyState icon={Gauge} title="No rate limit data" description="No rate limit information available." />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
