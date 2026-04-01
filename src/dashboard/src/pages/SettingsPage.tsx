import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, RefreshCw, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { fetchJson, postJson } from "../lib/api";
import { useTranslation } from "../i18n/LanguageProvider";

interface ConfigData {
  mode?: string;
  language?: string;
  modes?: Record<string, { brain_model?: string; default_model?: string; max_workers?: number }>;
}

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

const MODE_OPTIONS = ["performance", "balanced", "economic", "api", "max_plan", "max5x_plan", "pro_plan"] as const;
const MODEL_OPTIONS = ["opus", "sonnet", "haiku", "gpt-4.1", "o3", "o4-mini", "gemini-2.5-pro", "gemini-2.5-flash"] as const;
const LANGUAGE_OPTIONS = ["en", "tr"] as const;

export default function SettingsPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [mode, setMode] = useState("max_plan");
  const [brainModel, setBrainModel] = useState("opus");
  const [defaultModel, setDefaultModel] = useState("sonnet");
  const [maxWorkers, setMaxWorkers] = useState(8);
  const [language, setLanguage] = useState("en");

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(true);
  const [doctorError, setDoctorError] = useState<string | null>(null);

  const loadConfig = useCallback(() => {
    setConfigLoading(true);
    setConfigError(null);
    fetchJson<ConfigData>("/api/config")
      .then((data) => {
        setConfig(data);
        if (data.mode) setMode(data.mode);
        if (data.language) setLanguage(data.language);
        const activeMode = data.modes?.[data.mode ?? "max_plan"];
        if (activeMode) {
          if (activeMode.brain_model) setBrainModel(activeMode.brain_model);
          if (activeMode.default_model) setDefaultModel(activeMode.default_model);
          if (activeMode.max_workers) setMaxWorkers(activeMode.max_workers);
        }
      })
      .catch((err: unknown) => {
        setConfigError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setConfigLoading(false));
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
    loadConfig();
    loadDoctor();
  }, [loadConfig, loadDoctor]);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const modeKey = mode;
      const updatedModes = {
        ...(config?.modes ?? {}),
        [modeKey]: {
          ...(config?.modes?.[modeKey] ?? {}),
          brain_model: brainModel,
          default_model: defaultModel,
          max_workers: maxWorkers,
        },
      };
      await postJson("/api/config", {
        mode: modeKey,
        language,
        modes: updatedModes,
      });
      setSaveMsg({ type: "success", text: "Configuration saved successfully." });
    } catch (err: unknown) {
      setSaveMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      {/* Config Section */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          {configLoading && (
            <p className="text-muted-foreground">Loading configuration...</p>
          )}
          {configError && (
            <p className="text-red-400">Error: {configError}</p>
          )}
          {!configLoading && !configError && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mode">Mode</Label>
                <Select
                  id="mode"
                  value={mode}
                  onChange={(e) => {
                    const newMode = e.target.value;
                    setMode(newMode);
                    const modeConfig = config?.modes?.[newMode];
                    if (modeConfig) {
                      if (modeConfig.brain_model) setBrainModel(modeConfig.brain_model);
                      if (modeConfig.default_model) setDefaultModel(modeConfig.default_model);
                      if (modeConfig.max_workers) setMaxWorkers(modeConfig.max_workers);
                    } else {
                      // Defaults per mode type
                      const defaults: Record<string, { brain: string; model: string; workers: number }> = {
                        max_plan: { brain: "opus", model: "opus", workers: 8 },
                        max5x_plan: { brain: "opus", model: "sonnet", workers: 4 },
                        pro_plan: { brain: "sonnet", model: "sonnet", workers: 4 },
                        api: { brain: "haiku", model: "haiku", workers: 2 },
                      };
                      const d = defaults[newMode];
                      if (d) {
                        setBrainModel(d.brain);
                        setDefaultModel(d.model);
                        setMaxWorkers(d.workers);
                      }
                    }
                  }}
                >
                  {MODE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="brain-model">Brain Model</Label>
                <Select
                  id="brain-model"
                  value={brainModel}
                  onChange={(e) => setBrainModel(e.target.value)}
                >
                  {MODEL_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default-model">Default Model</Label>
                <Select
                  id="default-model"
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                >
                  {MODEL_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-workers">Max Workers</Label>
                <Input
                  id="max-workers"
                  type="number"
                  min={1}
                  max={10}
                  value={maxWorkers}
                  onChange={(e) => setMaxWorkers(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-end">
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>

              {saveMsg && (
                <div
                  className={`col-span-full rounded-md px-3 py-2 text-sm ${
                    saveMsg.type === "success"
                      ? "bg-green-900/30 text-green-400"
                      : "bg-red-900/30 text-red-400"
                  }`}
                >
                  {saveMsg.text}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Doctor Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>System Health</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDoctor}
            disabled={doctorLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${doctorLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {doctorLoading && !doctor && (
            <p className="text-muted-foreground">Running checks...</p>
          )}
          {doctorError && (
            <p className="text-red-400">Error: {doctorError}</p>
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
                {doctor.ok ? "All required checks passed" : "Some required checks failed"}
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
                        <span className="ml-1 text-xs text-muted-foreground">(required)</span>
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
    </div>
  );
}
