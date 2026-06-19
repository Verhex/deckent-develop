import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth.js";
import { useTranslation } from "../i18n/LanguageProvider";
import type { TranslationKey } from "../i18n/en";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { SkeletonTable } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Building2, Shield, FileText, Gauge, AlertTriangle, Plus, Pencil, Trash2, X, Save, Loader2, ScrollText } from "lucide-react";
import type { Alert } from "../types";

type TenantStatus = "active" | "suspended" | "inactive";
const TENANT_STATUSES: TenantStatus[] = ["active", "suspended", "inactive"];

interface TenantFormState {
  mode: "create" | "edit";
  id: string;
  name: string;
  status: TenantStatus;
}

interface RbacFormState {
  mode: "create" | "edit";
  role: string;
  // Comma/whitespace-separated permission tokens (parsed on submit).
  permissions: string;
}

interface RateFormState {
  mode: "create" | "edit";
  id: string;
  endpoint: string;
  limit: string;
}

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
  const { data: tenants, loading: tenantsLoading, error: tenantsError, refetch: refetchTenants } = useApi<TenantInfo[]>("/api/enterprise/tenants");
  const { data: rbac, loading: rbacLoading, error: rbacError, refetch: refetchRbac } = useApi<RbacRole[]>("/api/enterprise/rbac");
  const { data: audit, loading: auditLoading, error: auditError } = useApi<AuditEntry[]>("/api/enterprise/audit");
  const { data: rate, loading: rateLoading, error: rateError, refetch: refetchRate } = useApi<RateLimitInfo[]>("/api/enterprise/rate");
  const { data: missionsAudit, loading: missionsAuditLoading, error: missionsAuditError } = useApi<AuditEntry[]>("/api/enterprise/missions-audit");
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

  // ─── Tenant CRUD (282-010, DASH-UX-6) ──────────────────────────────
  const { t } = useTranslation();
  const [form, setForm] = useState<TenantFormState | null>(null);
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ─── RBAC role CRUD (DASH-D3) ──────────────────────────────────────
  const [rbacForm, setRbacForm] = useState<RbacFormState | null>(null);
  const [rbacMutating, setRbacMutating] = useState(false);
  const [rbacMutationError, setRbacMutationError] = useState<string | null>(null);
  const [rbacConfirmDeleteId, setRbacConfirmDeleteId] = useState<string | null>(null);

  // ─── Rate-limit rule CRUD (DASH-D3) ────────────────────────────────
  const [rateForm, setRateForm] = useState<RateFormState | null>(null);
  const [rateMutating, setRateMutating] = useState(false);
  const [rateMutationError, setRateMutationError] = useState<string | null>(null);
  const [rateConfirmDeleteId, setRateConfirmDeleteId] = useState<string | null>(null);

  // Admin-only management: OIDC admins or the local static-token owner (full
  // access). Non-admin OIDC roles see the read-only view (buttons hidden); the
  // server enforces the same rule with a 403 regardless of the UI.
  const canManage = identity?.role === "admin" || identity?.mode === "static";

  // Shared mutation helper (fetch + bearer auth + JSON error surface). Used by
  // the Tenant, RBAC, and Rate CRUD flows so the auth/error block lives once.
  async function mutate(method: string, path: string, payload?: unknown): Promise<void> {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (payload !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(path, {
      method,
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        if (j?.error?.message) message = j.error.message;
      } catch { /* non-JSON error body — keep status message */ }
      throw new Error(message);
    }
  }

  function openCreate(): void {
    setMutationError(null);
    setConfirmDeleteId(null);
    setForm({ mode: "create", id: "", name: "", status: "active" });
  }

  function openEdit(tenant: TenantInfo): void {
    setMutationError(null);
    setConfirmDeleteId(null);
    const status = (TENANT_STATUSES as string[]).includes(tenant.status)
      ? (tenant.status as TenantStatus)
      : "active";
    setForm({ mode: "edit", id: tenant.id, name: tenant.name, status });
  }

  function closeForm(): void {
    setForm(null);
    setMutationError(null);
  }

  async function submitForm(): Promise<void> {
    if (!form) return;
    if (!form.id.trim() || !form.name.trim()) {
      setMutationError(t("enterprise.required_fields"));
      return;
    }
    setMutating(true);
    setMutationError(null);
    try {
      if (form.mode === "create") {
        await mutate("POST", "/api/enterprise/tenants", {
          id: form.id.trim(),
          name: form.name.trim(),
          status: form.status,
        });
      } else {
        await mutate("PUT", `/api/enterprise/tenants/${encodeURIComponent(form.id)}`, {
          name: form.name.trim(),
          status: form.status,
        });
      }
      setForm(null);
      refetchTenants();
    } catch (err: unknown) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutating(false);
    }
  }

  async function deleteTenant(id: string): Promise<void> {
    setMutating(true);
    setMutationError(null);
    try {
      await mutate("DELETE", `/api/enterprise/tenants/${encodeURIComponent(id)}`);
      setConfirmDeleteId(null);
      refetchTenants();
    } catch (err: unknown) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutating(false);
    }
  }

  // ─── RBAC role CRUD handlers (DASH-D3) ─────────────────────────────
  function openRbacCreate(): void {
    setRbacMutationError(null);
    setRbacConfirmDeleteId(null);
    setRbacForm({ mode: "create", role: "", permissions: "" });
  }

  function openRbacEdit(entry: RbacRole): void {
    setRbacMutationError(null);
    setRbacConfirmDeleteId(null);
    setRbacForm({ mode: "edit", role: entry.role, permissions: entry.permissions.join(", ") });
  }

  function closeRbacForm(): void {
    setRbacForm(null);
    setRbacMutationError(null);
  }

  /** Parse a comma/whitespace-separated permission list into a deduped token array. */
  function parsePermissions(raw: string): string[] {
    return [...new Set(raw.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean))];
  }

  async function submitRbacForm(): Promise<void> {
    if (!rbacForm) return;
    if (!rbacForm.role.trim()) {
      setRbacMutationError(t("enterprise.rbac_required_role"));
      return;
    }
    setRbacMutating(true);
    setRbacMutationError(null);
    try {
      const permissions = parsePermissions(rbacForm.permissions);
      if (rbacForm.mode === "create") {
        await mutate("POST", "/api/enterprise/rbac", {
          role: rbacForm.role.trim(),
          permissions,
        });
      } else {
        await mutate("PUT", `/api/enterprise/rbac/${encodeURIComponent(rbacForm.role)}`, {
          permissions,
        });
      }
      setRbacForm(null);
      refetchRbac();
    } catch (err: unknown) {
      setRbacMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setRbacMutating(false);
    }
  }

  async function deleteRbacRole(role: string): Promise<void> {
    setRbacMutating(true);
    setRbacMutationError(null);
    try {
      await mutate("DELETE", `/api/enterprise/rbac/${encodeURIComponent(role)}`);
      setRbacConfirmDeleteId(null);
      refetchRbac();
    } catch (err: unknown) {
      setRbacMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setRbacMutating(false);
    }
  }

  // ─── Rate-limit rule CRUD handlers (DASH-D3) ───────────────────────
  function openRateCreate(): void {
    setRateMutationError(null);
    setRateConfirmDeleteId(null);
    setRateForm({ mode: "create", id: "", endpoint: "", limit: "" });
  }

  function openRateEdit(item: RateLimitInfo): void {
    setRateMutationError(null);
    setRateConfirmDeleteId(null);
    setRateForm({ mode: "edit", id: item.endpoint, endpoint: item.endpoint, limit: String(item.limit) });
  }

  function closeRateForm(): void {
    setRateForm(null);
    setRateMutationError(null);
  }

  async function submitRateForm(): Promise<void> {
    if (!rateForm) return;
    const limitNum = Number(rateForm.limit);
    if (!rateForm.id.trim() || !rateForm.endpoint.trim()) {
      setRateMutationError(t("enterprise.rate_required_fields"));
      return;
    }
    if (!Number.isInteger(limitNum) || limitNum <= 0) {
      setRateMutationError(t("enterprise.rate_invalid_limit"));
      return;
    }
    setRateMutating(true);
    setRateMutationError(null);
    try {
      if (rateForm.mode === "create") {
        await mutate("POST", "/api/enterprise/rate", {
          id: rateForm.id.trim(),
          endpoint: rateForm.endpoint.trim(),
          limit: limitNum,
        });
      } else {
        await mutate("PUT", `/api/enterprise/rate/${encodeURIComponent(rateForm.id)}`, {
          endpoint: rateForm.endpoint.trim(),
          limit: limitNum,
        });
      }
      setRateForm(null);
      refetchRate();
    } catch (err: unknown) {
      setRateMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setRateMutating(false);
    }
  }

  async function deleteRateRule(id: string): Promise<void> {
    setRateMutating(true);
    setRateMutationError(null);
    try {
      await mutate("DELETE", `/api/enterprise/rate/${encodeURIComponent(id)}`);
      setRateConfirmDeleteId(null);
      refetchRate();
    } catch (err: unknown) {
      setRateMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setRateMutating(false);
    }
  }

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
          <TabsTrigger value="missions-audit" data-testid="tab-missions-audit">{t("enterprise.missions_audit_tab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-zinc-100">Tenant List</CardTitle>
              {canManage && !form && (
                <button
                  type="button"
                  onClick={openCreate}
                  data-testid="tenant-create-btn"
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 hover:bg-brand-600 px-3 py-1.5 text-sm text-white"
                >
                  <Plus className="h-4 w-4" />
                  {t("enterprise.new_tenant")}
                </button>
              )}
            </CardHeader>
            <CardContent>
              {mutationError && (
                <div
                  data-testid="tenant-mutation-error"
                  className="mb-3 flex items-center gap-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{t("enterprise.mutation_error", { msg: mutationError })}</span>
                </div>
              )}

              {form && (
                <div data-testid="tenant-form" className="mb-4 rounded-md border border-zinc-700 bg-zinc-950/60 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-zinc-400">
                      {t("enterprise.tenant_id")}
                      <input
                        data-testid="tenant-form-id"
                        value={form.id}
                        disabled={form.mode === "edit" || mutating}
                        onChange={(e) => setForm({ ...form, id: e.target.value })}
                        placeholder="acme-corp"
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-400">
                      {t("enterprise.tenant_name")}
                      <input
                        data-testid="tenant-form-name"
                        value={form.name}
                        disabled={mutating}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-400">
                      {t("enterprise.tenant_status")}
                      <select
                        data-testid="tenant-form-status"
                        value={form.status}
                        disabled={mutating}
                        onChange={(e) => setForm({ ...form, status: e.target.value as TenantStatus })}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50"
                      >
                        {TENANT_STATUSES.map((s) => (
                          <option key={s} value={s}>{t(`enterprise.status_${s}` as TranslationKey)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void submitForm()}
                      disabled={mutating}
                      data-testid="tenant-form-submit"
                      className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 hover:bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {mutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {mutating ? t("enterprise.saving") : form.mode === "create" ? t("enterprise.create") : t("enterprise.save")}
                    </button>
                    <button
                      type="button"
                      onClick={closeForm}
                      disabled={mutating}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      {t("enterprise.cancel")}
                    </button>
                  </div>
                </div>
              )}

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
                        <th className="text-left py-2 pr-4 text-zinc-400">Created</th>
                        {canManage && <th className="text-right py-2 text-zinc-400">{t("enterprise.actions")}</th>}
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
                          <td className="py-2 pr-4 text-zinc-500">{tenant.createdAt}</td>
                          {canManage && (
                            <td className="py-2 text-right whitespace-nowrap">
                              {confirmDeleteId === tenant.id ? (
                                <span className="inline-flex items-center gap-2" data-testid="tenant-confirm-delete">
                                  <span className="text-xs text-zinc-400">{t("enterprise.confirm_delete")}</span>
                                  <button
                                    type="button"
                                    onClick={() => void deleteTenant(tenant.id)}
                                    disabled={mutating}
                                    data-testid={`tenant-delete-confirm-${tenant.id}`}
                                    className="rounded-md bg-red-800 hover:bg-red-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                                  >
                                    {t("enterprise.delete")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    disabled={mutating}
                                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                                  >
                                    {t("enterprise.cancel")}
                                  </button>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(tenant)}
                                    aria-label={t("enterprise.edit")}
                                    title={t("enterprise.edit")}
                                    data-testid={`tenant-edit-${tenant.id}`}
                                    className="rounded-md border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setConfirmDeleteId(tenant.id); setMutationError(null); }}
                                    aria-label={t("enterprise.delete")}
                                    title={t("enterprise.delete")}
                                    data-testid={`tenant-delete-${tenant.id}`}
                                    className="rounded-md border border-zinc-700 p-1.5 text-red-300 hover:bg-red-950/60"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              )}
                            </td>
                          )}
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-zinc-100">RBAC Role Matrix</CardTitle>
              {canManage && !rbacForm && (
                <button
                  type="button"
                  onClick={openRbacCreate}
                  data-testid="rbac-create-btn"
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 hover:bg-brand-600 px-3 py-1.5 text-sm text-white"
                >
                  <Plus className="h-4 w-4" />
                  {t("enterprise.new_role")}
                </button>
              )}
            </CardHeader>
            <CardContent>
              {rbacMutationError && (
                <div
                  data-testid="rbac-mutation-error"
                  className="mb-3 flex items-center gap-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{t("enterprise.mutation_error", { msg: rbacMutationError })}</span>
                </div>
              )}

              {rbacForm && (
                <div data-testid="rbac-form" className="mb-4 rounded-md border border-zinc-700 bg-zinc-950/60 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-zinc-400">
                      {t("enterprise.role_name")}
                      <input
                        data-testid="rbac-form-role"
                        value={rbacForm.role}
                        disabled={rbacForm.mode === "edit" || rbacMutating}
                        onChange={(e) => setRbacForm({ ...rbacForm, role: e.target.value })}
                        placeholder="auditor"
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-400">
                      {t("enterprise.role_permissions")}
                      <input
                        data-testid="rbac-form-permissions"
                        value={rbacForm.permissions}
                        disabled={rbacMutating}
                        onChange={(e) => setRbacForm({ ...rbacForm, permissions: e.target.value })}
                        placeholder="read, write"
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void submitRbacForm()}
                      disabled={rbacMutating}
                      data-testid="rbac-form-submit"
                      className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 hover:bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {rbacMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {rbacMutating ? t("enterprise.saving") : rbacForm.mode === "create" ? t("enterprise.create") : t("enterprise.save")}
                    </button>
                    <button
                      type="button"
                      onClick={closeRbacForm}
                      disabled={rbacMutating}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      {t("enterprise.cancel")}
                    </button>
                  </div>
                </div>
              )}

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
                        {canManage && (
                          <span className="ml-auto inline-flex items-center gap-1.5">
                            {rbacConfirmDeleteId === entry.role ? (
                              <span className="inline-flex items-center gap-2" data-testid="rbac-confirm-delete">
                                <span className="text-xs text-zinc-400">{t("enterprise.confirm_delete_role")}</span>
                                <button
                                  type="button"
                                  onClick={() => void deleteRbacRole(entry.role)}
                                  disabled={rbacMutating}
                                  data-testid={`rbac-delete-confirm-${entry.role}`}
                                  className="rounded-md bg-red-800 hover:bg-red-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                                >
                                  {t("enterprise.delete")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRbacConfirmDeleteId(null)}
                                  disabled={rbacMutating}
                                  className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                                >
                                  {t("enterprise.cancel")}
                                </button>
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openRbacEdit(entry)}
                                  aria-label={t("enterprise.edit")}
                                  title={t("enterprise.edit")}
                                  data-testid={`rbac-edit-${entry.role}`}
                                  className="rounded-md border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setRbacConfirmDeleteId(entry.role); setRbacMutationError(null); }}
                                  aria-label={t("enterprise.delete")}
                                  title={t("enterprise.delete")}
                                  data-testid={`rbac-delete-${entry.role}`}
                                  className="rounded-md border border-zinc-700 p-1.5 text-red-300 hover:bg-red-950/60"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </span>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-zinc-100">Rate Limit Status</CardTitle>
              {canManage && !rateForm && (
                <button
                  type="button"
                  onClick={openRateCreate}
                  data-testid="rate-create-btn"
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 hover:bg-brand-600 px-3 py-1.5 text-sm text-white"
                >
                  <Plus className="h-4 w-4" />
                  {t("enterprise.new_rate_rule")}
                </button>
              )}
            </CardHeader>
            <CardContent>
              {rateMutationError && (
                <div
                  data-testid="rate-mutation-error"
                  className="mb-3 flex items-center gap-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{t("enterprise.mutation_error", { msg: rateMutationError })}</span>
                </div>
              )}

              {rateForm && (
                <div data-testid="rate-form" className="mb-4 rounded-md border border-zinc-700 bg-zinc-950/60 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-zinc-400">
                      {t("enterprise.rate_id")}
                      <input
                        data-testid="rate-form-id"
                        value={rateForm.id}
                        disabled={rateForm.mode === "edit" || rateMutating}
                        onChange={(e) => setRateForm({ ...rateForm, id: e.target.value })}
                        placeholder="api-sprints"
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-400">
                      {t("enterprise.rate_endpoint")}
                      <input
                        data-testid="rate-form-endpoint"
                        value={rateForm.endpoint}
                        disabled={rateMutating}
                        onChange={(e) => setRateForm({ ...rateForm, endpoint: e.target.value })}
                        placeholder="/api/sprints"
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-zinc-400">
                      {t("enterprise.rate_limit")}
                      <input
                        data-testid="rate-form-limit"
                        type="number"
                        min={1}
                        value={rateForm.limit}
                        disabled={rateMutating}
                        onChange={(e) => setRateForm({ ...rateForm, limit: e.target.value })}
                        placeholder="100"
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void submitRateForm()}
                      disabled={rateMutating}
                      data-testid="rate-form-submit"
                      className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 hover:bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {rateMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {rateMutating ? t("enterprise.saving") : rateForm.mode === "create" ? t("enterprise.create") : t("enterprise.save")}
                    </button>
                    <button
                      type="button"
                      onClick={closeRateForm}
                      disabled={rateMutating}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      {t("enterprise.cancel")}
                    </button>
                  </div>
                </div>
              )}

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
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-zinc-500">{item.remaining}/{item.limit}</span>
                            {canManage && (
                              rateConfirmDeleteId === item.endpoint ? (
                                <span className="inline-flex items-center gap-2" data-testid="rate-confirm-delete">
                                  <span className="text-xs text-zinc-400">{t("enterprise.confirm_delete_rate")}</span>
                                  <button
                                    type="button"
                                    onClick={() => void deleteRateRule(item.endpoint)}
                                    disabled={rateMutating}
                                    data-testid={`rate-delete-confirm-${item.endpoint}`}
                                    className="rounded-md bg-red-800 hover:bg-red-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                                  >
                                    {t("enterprise.delete")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRateConfirmDeleteId(null)}
                                    disabled={rateMutating}
                                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                                  >
                                    {t("enterprise.cancel")}
                                  </button>
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openRateEdit(item)}
                                    aria-label={t("enterprise.edit")}
                                    title={t("enterprise.edit")}
                                    data-testid={`rate-edit-${item.endpoint}`}
                                    className="rounded-md border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setRateConfirmDeleteId(item.endpoint); setRateMutationError(null); }}
                                    aria-label={t("enterprise.delete")}
                                    title={t("enterprise.delete")}
                                    data-testid={`rate-delete-${item.endpoint}`}
                                    className="rounded-md border border-zinc-700 p-1.5 text-red-300 hover:bg-red-950/60"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )
                            )}
                          </span>
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
        <TabsContent value="missions-audit">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">{t("enterprise.missions_audit_title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {missionsAuditLoading && <div aria-label="loading"><SkeletonTable rows={5} cols={5} /></div>}
              {missionsAuditError && <p className="text-red-400">{t("enterprise.missions_audit_error")}</p>}
              {missionsAudit && missionsAudit.length > 0 && (
                <div className="overflow-x-auto" data-testid="missions-audit-table">
                  <table className="w-full text-sm text-zinc-300">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left py-2 pr-4 text-zinc-400">{t("enterprise.missions_audit_col_mission")}</th>
                        <th className="text-left py-2 pr-4 text-zinc-400">{t("enterprise.missions_audit_col_action")}</th>
                        <th className="text-left py-2 pr-4 text-zinc-400">{t("enterprise.missions_audit_col_actor")}</th>
                        <th className="text-left py-2 pr-4 text-zinc-400">{t("enterprise.missions_audit_col_result")}</th>
                        <th className="text-left py-2 text-zinc-400">{t("enterprise.missions_audit_col_time")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missionsAudit.map((entry) => (
                        <tr key={entry.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                          <td className="py-2 pr-4 font-mono text-xs">{entry.resource}</td>
                          <td className="py-2 pr-4 font-mono text-xs">{entry.action}</td>
                          <td className="py-2 pr-4">{entry.actor}</td>
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
              {!missionsAuditLoading && !missionsAuditError && (!missionsAudit || missionsAudit.length === 0) && (
                <EmptyState icon={ScrollText} title={t("enterprise.missions_audit_empty")} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
