import { useState, useEffect, useCallback } from "react";
import { Save, RotateCcw, Info, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { SkeletonCard } from "../components/Skeleton";
import { fetchJson, postJson } from "../lib/api";
import { useTranslation } from "../i18n/LanguageProvider";
import type { TranslationKey } from "../i18n/en";

// ─── Doctor Types ─────────────────────────────────────────────────

interface DoctorCheck {
  name: string;
  passed: boolean;
  message: string;
  required: boolean;
}

interface DoctorData {
  ok: boolean;
  checks: DoctorCheck[];
}

// ─── Config Metadata ─────────────────────────────────────────────

type FieldType = "select" | "number" | "boolean" | "text";

interface ConfigFieldMeta {
  key: string;
  label: string;
  description: string;
  type: FieldType;
  category: string;
  defaultValue: unknown;
  options?: string[];
}

const PLANNED_CATEGORY = "Planned";

const CONFIG_FIELDS: ConfigFieldMeta[] = [
  // ─── Provider ───────────────────────────────────────────────
  { key: "brain_provider", label: "Brain Provider", description: "AI provider for Brain planning", type: "select", category: "Provider", defaultValue: "claude", options: ["claude", "codex", "gemini"] },
  { key: "worker_provider", label: "Worker Provider", description: "Default AI provider for workers", type: "select", category: "Provider", defaultValue: "claude", options: ["claude", "codex", "gemini"] },
  { key: "fallback_provider", label: "Fallback Provider", description: "Fallback when primary provider is unavailable", type: "select", category: "Provider", defaultValue: null, options: ["claude", "codex", "gemini"] },
  { key: "cost_optimization", label: "Cost Optimization", description: "Auto-select cheapest capable provider", type: "boolean", category: "Provider", defaultValue: false },
  { key: "claude_backend", label: "Claude Backend", description: "Claude execution backend", type: "select", category: "Provider", defaultValue: "tmux", options: ["tmux", "subprocess", "mcp"] },
  { key: "auth_mode", label: "Auth Mode", description: "Authentication mode", type: "select", category: "Provider", defaultValue: "subscription", options: ["subscription", "api", "hybrid"] },

  // ─── Sprint ─────────────────────────────────────────────────
  { key: "mode", label: "Plan Mode", description: "Active plan tier determining resource allocation", type: "select", category: "Sprint", defaultValue: "performance", options: ["performance", "balanced", "economic", "api"] },
  { key: "spawn_backend", label: "Spawn Backend", description: "Worker spawn backend", type: "select", category: "Sprint", defaultValue: "auto", options: ["tmux", "subprocess", "auto"] },
  { key: "fix_phase_enabled", label: "Fix Phase Enabled", description: "Enable automatic fix phase after evaluation", type: "boolean", category: "Sprint", defaultValue: true },
  { key: "max_fix_retries", label: "Max Fix Retries", description: "Maximum number of fix retries per task", type: "number", category: "Sprint", defaultValue: 2 },
  { key: "coverage_threshold", label: "Coverage Threshold", description: "Minimum coverage % to pass without tech debt", type: "number", category: "Sprint", defaultValue: 90 },
  { key: "max_reroutes", label: "Max Reroutes", description: "Max reroute attempts per task during mid-sprint adapter", type: "number", category: "Sprint", defaultValue: 3 },
  { key: "reroute_on_tech_debt", label: "Reroute on Tech Debt", description: "Also reroute GO_WITH_TECH_DEBT tasks, not just NO_GO", type: "boolean", category: "Sprint", defaultValue: false },
  { key: "sprint_timeout_minutes", label: "Sprint Timeout (min)", description: "Sprint timeout in minutes. 0 = unlimited", type: "number", category: "Sprint", defaultValue: 0 },
  { key: "routing_engine", label: "Routing Engine", description: "Routing engine version", type: "select", category: "Sprint", defaultValue: "v2", options: ["v1", "v2"] },
  { key: "cleanup_delay_ms", label: "Cleanup Delay (ms)", description: "Delay before cleanup deletes .tasks/ files", type: "number", category: "Sprint", defaultValue: 180000 },
  { key: "human_checkpoints", label: "Human Checkpoints", description: "Sprint phases requiring human approval", type: "select", category: "Sprint", defaultValue: "", options: ["plan", "evaluate", "fix"] },

  // ─── Model Strategy ─────────────────────────────────────────
  { key: "brain_tier", label: "Brain Tier", description: "Tier-based brain model selection (provider-agnostic)", type: "select", category: "Model Strategy", defaultValue: "premium", options: ["premium_plus", "premium", "standard", "economy"] },
  { key: "worker_tier", label: "Worker Tier", description: "Tier-based worker model selection (provider-agnostic)", type: "select", category: "Model Strategy", defaultValue: "standard", options: ["premium_plus", "premium", "standard", "economy"] },
  { key: "auto_upgrade", label: "Auto Upgrade", description: "Auto-upgrade tier when task complexity is high", type: "boolean", category: "Model Strategy", defaultValue: true },
  { key: "auto_downgrade", label: "Auto Downgrade", description: "Auto-downgrade tier for doc/test tasks", type: "boolean", category: "Model Strategy", defaultValue: true },

  // ─── Adaptive ───────────────────────────────────────────────
  { key: "adaptive_thresholds", label: "Adaptive Thresholds", description: "Auto-adjust routing parameters based on sprint NO_GO rate", type: "boolean", category: "Adaptive", defaultValue: false },
  { key: "agent_min_score", label: "Agent Min Score", description: "Minimum agent score for routing selection (range: 2-8)", type: "number", category: "Adaptive", defaultValue: 5 },
  { key: "adaptive_config.min_samples", label: "Min Samples", description: "Minimum past sprints required before adjusting", type: "number", category: "Adaptive", defaultValue: 3 },
  { key: "adaptive_config.no_go_threshold", label: "NO_GO Threshold", description: "NO_GO rate threshold (0-1) above which agent_min_score is lowered", type: "number", category: "Adaptive", defaultValue: 0.3 },
  { key: "adaptive_config.coverage_lookback", label: "Coverage Lookback", description: "Number of recent sprints to consider for coverage averaging", type: "number", category: "Adaptive", defaultValue: 3 },

  // ─── Auto Docs ──────────────────────────────────────────────
  { key: "auto_docs.tier1", label: "Tier 1 Docs", description: "Auto-generate CHANGELOG, SPRINT-LOG", type: "boolean", category: "Auto Docs", defaultValue: true },
  { key: "auto_docs.tier2", label: "Tier 2 Docs", description: "Auto-generate README counts, CONTRIBUTING, HEALTH-CHECK", type: "boolean", category: "Auto Docs", defaultValue: false },
  { key: "auto_docs.tier3", label: "Tier 3 Docs", description: "Auto-generate BLUEPRINT, ARCHITECTURE", type: "boolean", category: "Auto Docs", defaultValue: false },

  // ─── Memory ───────────────────────────────────────────────
  { key: "memory_budget", label: "Memory Budget", description: "Maximum total lines for .brain/ directory (MEMORY + PATTERNS + RETRO + sprint logs)", type: "number", category: "Memory", defaultValue: 900 },
  { key: "decay_after_sprints", label: "Decay After Sprints", description: "Number of sprints before memory decay", type: "number", category: "Memory", defaultValue: 5 },
  { key: "patterns_enabled", label: "Patterns Enabled", description: "Enable pattern detection and storage", type: "boolean", category: "Memory", defaultValue: true },
  { key: "project_identity_enabled", label: "Project Identity Enabled", description: "Enable project identity tracking", type: "boolean", category: "Memory", defaultValue: true },

  // ─── Auditor ──────────────────────────────────────────────
  { key: "scan_interval", label: "Scan Interval", description: "Auditor scan interval in seconds", type: "number", category: "Auditor", defaultValue: 30 },
  { key: "heartbeat_timeout", label: "Heartbeat Timeout", description: "Worker heartbeat timeout in seconds", type: "number", category: "Auditor", defaultValue: 120 },
  { key: "boundary_enforcement", label: "Boundary Enforcement", description: "Enable scope boundary enforcement", type: "boolean", category: "Auditor", defaultValue: true },

  // ─── Output ─────────────────────────────────────────────────
  { key: "output_splash", label: "Show Splash", description: "Show kraken splash on init/version", type: "boolean", category: "Output", defaultValue: true },
  { key: "output_mode", label: "Output Mode", description: "Output verbosity level", type: "select", category: "Output", defaultValue: "normal", options: ["quiet", "normal", "verbose"] },

  // ─── Environment ────────────────────────────────────────────
  { key: "detected_env", label: "Detected Environment", description: "Auto-detected IDE/environment", type: "select", category: "Environment", defaultValue: null, options: ["vscode", "codex", "gemini", "cursor", "tmux", "shell"] },

  // ─── Skill Routing ──────────────────────────────────────────
  { key: "skill_routing.design", label: "Design Skill Route", description: "Provider for design-related skills", type: "select", category: "Skill Routing", defaultValue: null, options: ["claude", "codex", "gemini"] },
  { key: "skill_routing.testing", label: "Testing Skill Route", description: "Provider for testing-related skills", type: "select", category: "Skill Routing", defaultValue: null, options: ["claude", "codex", "gemini"] },
  { key: "skill_routing.docs", label: "Docs Skill Route", description: "Provider for documentation skills", type: "select", category: "Skill Routing", defaultValue: null, options: ["claude", "codex", "gemini"] },
  { key: "skill_routing.default", label: "Default Skill Route", description: "Default provider for skills", type: "select", category: "Skill Routing", defaultValue: "claude", options: ["claude", "codex", "gemini"] },

  // ─── Rollback ─────────────────────────────────────────────
  { key: "rollback_policy", label: "Rollback Policy", description: "When to rollback failed changes", type: "select", category: "Rollback", defaultValue: "never", options: ["never", "on_failure", "always"] },

  // ─── Project ──────────────────────────────────────────────
  { key: "language", label: "Language", description: "UI and output language (en, tr)", type: "select", category: "Project", defaultValue: "en", options: ["en", "tr"] },
  { key: "projectName", label: "Project Name", description: "Project display name", type: "text", category: "Project", defaultValue: null },
  { key: "version", label: "Version", description: "Project version", type: "text", category: "Project", defaultValue: null },

  // ─── Advanced ─────────────────────────────────────────────
  { key: "auto_clean_locks", label: "Auto Clean Locks", description: "Automatically clean stale lock files", type: "boolean", category: "Advanced", defaultValue: false },

  // ─── Planned (not yet implemented) ─────────────────────────
  // Previously: "Search", "Notifications", "Telemetry" categories — moved to Planned
  { key: "output_theme", label: "Output Theme", description: "Output display theme", type: "select", category: PLANNED_CATEGORY, defaultValue: "default", options: ["default", "minimal", "rich"] },
  { key: "search_enabled", label: "Search Enabled", description: "Enable online search for documentation", type: "boolean", category: PLANNED_CATEGORY, defaultValue: true },
  { key: "search_provider", label: "Search Provider", description: "Documentation search provider", type: "select", category: PLANNED_CATEGORY, defaultValue: "context7", options: ["context7", "web", "none"] },
  { key: "search_cache_ttl", label: "Search Cache TTL", description: "Search cache TTL in seconds", type: "number", category: PLANNED_CATEGORY, defaultValue: 3600 },
  { key: "notify_on_complete", label: "Notify on Complete", description: "Send notification when sprint completes", type: "boolean", category: PLANNED_CATEGORY, defaultValue: false },
  { key: "notify_channel", label: "Notify Channel", description: "Notification delivery channel", type: "select", category: PLANNED_CATEGORY, defaultValue: null, options: ["slack", "discord", "email", "webhook"] },
  { key: "notify_url", label: "Notify URL", description: "Webhook URL for notifications", type: "text", category: PLANNED_CATEGORY, defaultValue: null },
  { key: "telemetry_enabled", label: "Telemetry Enabled", description: "Enable usage telemetry", type: "boolean", category: PLANNED_CATEGORY, defaultValue: false },
  { key: "telemetry_anonymous", label: "Anonymous Telemetry", description: "Keep telemetry anonymous", type: "boolean", category: PLANNED_CATEGORY, defaultValue: true },
  { key: "multi_ide_mode", label: "Multi-IDE Mode", description: "Enable multi-IDE support", type: "boolean", category: PLANNED_CATEGORY, defaultValue: false },
];

const CATEGORIES = [
  "Provider", "Sprint", "Model Strategy", "Adaptive", "Auto Docs",
  "Memory", "Auditor", "Output", "Environment", "Skill Routing",
  "Rollback", "Project", "Advanced", PLANNED_CATEGORY,
] as const;

const CATEGORY_KEY_MAP: Record<string, string> = {
  "Provider": "config.category.provider",
  "Sprint": "config.category.sprint",
  "Model Strategy": "config.category.model_strategy",
  "Adaptive": "config.category.adaptive",
  "Auto Docs": "config.category.auto_docs",
  "Memory": "config.category.memory",
  "Auditor": "config.category.auditor",
  "Output": "config.category.output",
  "Environment": "config.category.environment",
  "Skill Routing": "config.category.routing",
  "Rollback": "config.category.rollback",
  "Project": "config.category.project",
  "Advanced": "config.category.advanced",
  [PLANNED_CATEGORY]: "config.category.planned",
};

// ─── Helpers ──────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const result = { ...obj };
  const parts = path.split(".");
  if (parts.length === 1) {
    result[parts[0]!] = value;
    return result;
  }
  const parent = parts[0]!;
  const rest = parts.slice(1).join(".");
  const existing = (result[parent] as Record<string, unknown>) ?? {};
  result[parent] = setNestedValue({ ...existing }, rest, value);
  return result;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseFieldValue(value: string, type: FieldType): unknown {
  if (value === "" || value === "null") return null;
  if (type === "boolean") return value === "true";
  if (type === "number") return Number(value);
  return value;
}

// ─── Component ────────────────────────────────────────────────────

export default function ConfigPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [defaults, setDefaults] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const fieldT = (field: ConfigFieldMeta, suffix: 'label' | 'desc') => {
    const key = `config.field.${field.key.replace(/\./g, '_')}.${suffix}` as TranslationKey;
    const translated = t(key);
    return translated === key ? (suffix === 'label' ? field.label : field.description) : translated;
  };

  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(true);
  const [doctorError, setDoctorError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchJson<Record<string, unknown>>("/api/config"),
      fetchJson<Record<string, unknown>>("/api/config/defaults"),
    ])
      .then(([cfg, defs]) => {
        setConfig(cfg);
        setDefaults(defs);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  const loadDoctor = useCallback(() => {
    setDoctorLoading(true);
    setDoctorError(null);
    fetchJson<DoctorData>("/api/doctor")
      .then(setDoctor)
      .catch((err: unknown) => {
        setDoctorError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setDoctorLoading(false));
  }, []);

  useEffect(() => {
    loadData();
    loadDoctor();
  }, [loadData, loadDoctor]);

  function handleChange(field: ConfigFieldMeta, rawValue: string) {
    const value = parseFieldValue(rawValue, field.type);
    setConfig((prev) => setNestedValue(prev, field.key, value));
    setDirty((prev) => new Set(prev).add(field.key));
    setSaveMsg(null);
  }

  function handleResetField(field: ConfigFieldMeta) {
    const defaultVal = getNestedValue(defaults, field.key) ?? field.defaultValue;
    setConfig((prev) => setNestedValue(prev, field.key, defaultVal));
    setDirty((prev) => new Set(prev).add(field.key));
    setSaveMsg(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const result = await postJson<Record<string, unknown>>("/api/config", config);
      setConfig(result);
      setDirty(new Set());
      setSaveMsg({ type: "success", text: t('config.save_success') });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('config.error');
      setSaveMsg({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  }

  function isModified(key: string): boolean {
    return dirty.has(key);
  }

  function isDefault(field: ConfigFieldMeta): boolean {
    const current = getNestedValue(config, field.key);
    const def = getNestedValue(defaults, field.key) ?? field.defaultValue;
    return current === def;
  }

  if (loading) {
    return (
      <div className="space-y-6 p-4">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-800" />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400 p-4">{t('common.error')}: {error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('config.title')}</h1>
        <Button onClick={handleSave} disabled={saving || dirty.size === 0} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? t('config.saving') : t('config.save')}
        </Button>
      </div>

      {/* System Health */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t('settings.doctor')}</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDoctor}
            disabled={doctorLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${doctorLoading ? "animate-spin" : ""}`} />
            {t('settings.run_doctor')}
          </Button>
        </CardHeader>
        <CardContent>
          {doctorLoading && !doctor && (
            <p className="text-muted-foreground">{t('common.loading')}</p>
          )}
          {doctorError && (
            <p className="text-red-400">{t('common.error')}: {doctorError}</p>
          )}
          {doctor && (
            <div className="space-y-3">
              <div
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  doctor.ok
                    ? "bg-green-900/30 text-green-400"
                    : "bg-red-900/30 text-red-400"
                }`}
              >
                {doctor.ok ? t('config.doctor_ok') : t('config.doctor_fail')}
              </div>
              <ul className="space-y-2">
                {doctor.checks.map((check) => (
                  <li key={check.name} className="flex items-start gap-2 text-sm">
                    {check.passed ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    )}
                    <div>
                      <span className="font-medium">{check.name}</span>
                      {check.required && (
                        <span className="ml-1 text-xs text-muted-foreground">({t('config.required')})</span>
                      )}
                      <p className="text-muted-foreground">{check.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {saveMsg && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            saveMsg.type === "success"
              ? "bg-green-900/30 text-green-400"
              : "bg-red-900/30 text-red-400"
          }`}
          data-testid="save-message"
        >
          {saveMsg.text}
        </div>
      )}

      {CATEGORIES.map((category) => {
        const fields = CONFIG_FIELDS.filter((f) => f.category === category);
        if (fields.length === 0) return null;
        const isPlanned = category === PLANNED_CATEGORY;

        return (
          <Card key={category} data-testid={`config-category-${category.toLowerCase().replace(/\s+/g, "-")}`} className={isPlanned ? "opacity-50" : ""}>
            <CardHeader>
              <CardTitle>
                {CATEGORY_KEY_MAP[category] ? t(CATEGORY_KEY_MAP[category] as TranslationKey) : category}
                {isPlanned && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(not yet implemented)</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((field) => {
                  const currentValue = getNestedValue(config, field.key);
                  const modified = isModified(field.key);
                  const isDefault_ = isDefault(field);

                  return (
                    <div key={field.key} className="space-y-1.5" data-testid={`config-field-${field.key}`}>
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor={`config-${field.key}`} className="text-sm">
                          {fieldT(field, 'label')}
                          {modified && <span className="ml-1 text-yellow-400 text-xs">*</span>}
                        </Label>
                        <span className="group relative cursor-help" title={fieldT(field, 'desc')}>
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      </div>

                      <div className="flex gap-2">
                        {field.type === "select" && (
                          <Select
                            id={`config-${field.key}`}
                            value={formatValue(currentValue)}
                            onChange={(e) => handleChange(field, e.target.value)}
                            disabled={isPlanned}
                          >
                            <option value="">{t('config.none' as TranslationKey)}</option>
                            {field.options?.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </Select>
                        )}

                        {field.type === "boolean" && (
                          <Select
                            id={`config-${field.key}`}
                            value={currentValue === true ? "true" : currentValue === false ? "false" : ""}
                            onChange={(e) => handleChange(field, e.target.value)}
                            disabled={isPlanned}
                          >
                            <option value="">{t('config.none' as TranslationKey)}</option>
                            <option value="true">{t('config.true' as TranslationKey)}</option>
                            <option value="false">{t('config.false' as TranslationKey)}</option>
                          </Select>
                        )}

                        {field.type === "number" && (
                          <Input
                            id={`config-${field.key}`}
                            type="number"
                            value={currentValue !== null && currentValue !== undefined ? String(currentValue) : ""}
                            onChange={(e) => handleChange(field, e.target.value)}
                            disabled={isPlanned}
                          />
                        )}

                        {field.type === "text" && (
                          <Input
                            id={`config-${field.key}`}
                            type="text"
                            value={formatValue(currentValue)}
                            onChange={(e) => handleChange(field, e.target.value)}
                            placeholder={fieldT(field, 'desc')}
                            disabled={isPlanned}
                          />
                        )}

                        {!isDefault_ && !isPlanned && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 gap-1 text-xs"
                            onClick={() => handleResetField(field)}
                            title={t('config.reset_to_default' as TranslationKey, { value: formatValue(field.defaultValue) || "null" })}
                            data-testid={`reset-${field.key}`}
                          >
                            <RotateCcw className="h-3 w-3" />
                            {t('config.reset_field')}
                          </Button>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {fieldT(field, 'desc')}
                        {!isDefault_ && (
                          <span className="ml-1 text-zinc-500">
                            {t('config.default_value' as TranslationKey, { value: formatValue(field.defaultValue) || "null" })}
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Separator />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || dirty.size === 0} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? t('config.saving') : t('config.save_changes')}
        </Button>
      </div>
    </div>
  );
}
