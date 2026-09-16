#!/usr/bin/env node
// TERMINAL-FLUENCY-PROGRAM-001 §3 + 7114 thresholds — real-binary acceptance battery.
// Skip-safe: typed SKIP when dist/, getMessage catalog, node-pty, or local-llm missing.

import { createHash } from 'node:crypto';
import { spawn as childSpawn } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, mkdtempSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
export const REPO_ROOT = resolve(dirname(__filename), '..');

export const MASTER_PLAN_PROMPT = '@docs/MASTER-PLAN.md dokümanını oku ve analiz et';
export const ACCEPTANCE_DOC = 'docs/execution/active/TERMINAL-FLUENCY-PROGRAM-001.md';
export const EVIDENCE_DIR = 'docs/execution/evidence/7107';
export const DEFAULT_SCENARIO_TIMEOUT_MS = 10 * 60 * 1000;
export const FIRST_TOOL_WINDOW = 20;
export const CHECKPOINT_FILE_RE = /^checkpoint-(\d+)-([a-f0-9]{64})\.json$/;

export const THRESHOLDS_7114 = {
  firstVisibleNarrativeMs: 10_000,
  interimDeliverableMs: 90_000,
  interimDeliverableToolCalls: 12,
  interruptAtMs: 60_000,
};

export const USAGE = `Usage: node scripts/terminal-acceptance-battery.mjs [options]

Options:
  --help, -h              Show this help and exit 0
  --dry-run               Print scenario matrix + SKIP reasons; do not run PTY
  --lang <en|tr>          Summary language (default: en)
  --scenario <id>         Run one scenario from the matrix
  --entry <path>          dist/cli/entry.js override
  --timeout-ms <n>        Per-scenario timeout (default: ${DEFAULT_SCENARIO_TIMEOUT_MS})
  --interrupt-test        Include the 7114 interrupt scenario (Ctrl-C ~60 s)
  --local-only            Run only local-llm matrix rows (skip hosted credential rows)

Unknown flags exit 2.`;

export const BATTERY_SCHEMA = 'terminal-acceptance-battery-v3';
export const TURN_END_FOOTER_RE = /(?:^|\n)\s*(?:[⏱@]|Elapsed|Geçen süre)?\s*(\d+\.\d)s(?:\s*[·|]\s*(\d+(?:\.\d+k?)?)\s*tok)?/i;

export function resolveEntryPath(repoRoot = REPO_ROOT, explicit) {
  if (explicit) return resolve(explicit);
  const local = join(repoRoot, 'dist/cli/entry.js');
  if (existsSync(local)) return local;
  const sibling = join(repoRoot, '../deckent-dev/dist/cli/entry.js');
  if (existsSync(sibling)) return sibling;
  return local;
}

export function repoRootForEntry(entryPath) {
  return resolve(dirname(entryPath), '../..');
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export async function gitHead(repoRoot, spawnFn = childSpawn) {
  if (!existsSync(join(repoRoot, '.git'))) return null;
  return new Promise((resolvePromise) => {
    const child = spawnFn('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.on('close', (code) => resolvePromise(code === 0 ? stdout.trim() : null));
    child.on('error', () => resolvePromise(null));
  });
}

export const stripAnsi = (text) =>
  String(text)
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\r/g, '\n');

export function splitAnsiPending(raw) {
  const value = String(raw ?? '');
  if (!value) return { consumable: '', pending: '' };
  const oscPending = value.match(/\x1b\][^\x07]*$/);
  if (oscPending) {
    return { consumable: value.slice(0, -oscPending[0].length), pending: oscPending[0] };
  }
  const csiPending = value.match(/\x1b\[[\d;?]*$/);
  if (csiPending) {
    return { consumable: value.slice(0, -csiPending[0].length), pending: csiPending[0] };
  }
  return { consumable: value, pending: '' };
}

export function decodePtyPlainCarry(plainCarry, ansiPending, rawPiece) {
  const combined = ansiPending + (rawPiece ?? '');
  const { consumable, pending } = splitAnsiPending(combined);
  const plain = stripAnsi(consumable);
  return {
    plainCarry: plainCarry + plain.replace(/\r/g, '\n'),
    ansiPending: pending,
  };
}

export function buildScenarioMatrix(options = {}) {
  const windows = options.windows ?? [131072, 32768];
  const modes = options.modes ?? ['suggest', 'full-auto'];
  const scenarios = [];
  for (const contextSize of windows) {
    for (const approvalMode of modes) {
      scenarios.push({
        id: `local-llm-${contextSize}-${approvalMode}`,
        provider: 'local-llm',
        contextSize,
        approvalMode,
        requiresLocalLlm: true,
        interruptTest: false,
        prompt: MASTER_PLAN_PROMPT,
      });
    }
  }
  if (options.includeInterrupt) {
    scenarios.push({
      id: 'local-llm-131072-interrupt',
      provider: 'local-llm',
      contextSize: 131072,
      approvalMode: 'full-auto',
      requiresLocalLlm: true,
      interruptTest: true,
      prompt: MASTER_PLAN_PROMPT,
    });
  }
  scenarios.push({
    id: 'hosted-claude-suggest',
    provider: 'anthropic-api',
    contextSize: null,
    approvalMode: 'suggest',
    requiresLocalLlm: false,
    requiresCredential: 'anthropic-api',
    interruptTest: false,
    prompt: MASTER_PLAN_PROMPT,
  });
  scenarios.push({
    id: 'hosted-openai-suggest',
    provider: 'openai-compatible',
    contextSize: null,
    approvalMode: 'suggest',
    requiresLocalLlm: false,
    requiresCredential: 'openai-compatible',
    interruptTest: false,
    prompt: MASTER_PLAN_PROMPT,
  });
  return scenarios;
}

export function readProjectNativeConfig(configRoot) {
  const path = join(configRoot, '.deckent/config.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Config-resolved provider/model/context the scenario expects at native boot. */
export function resolveScenarioBinding(scenario, { localLlm, configRoot } = {}) {
  const cfg = readProjectNativeConfig(configRoot) ?? {};
  const provider = scenario.provider ?? cfg.native_provider ?? 'local-llm';
  const preferredModel = cfg.native_model ?? localLlm?.models?.[0] ?? 'Qwen3.8-27B-Q4_K_M';
  const model = localLlm?.models?.includes(preferredModel)
    ? preferredModel
    : (localLlm?.models?.[0] ?? preferredModel);
  const contextSize = scenario.contextSize
    ?? cfg.local_llm?.contextSize
    ?? localLlm?.effectiveContextSize
    ?? null;
  return { provider, model, contextSize };
}

/** Each scenario owns its cwd; runtime evidence never lands in the source checkout. */
export function resolveScenarioWorkspace({ configRoot, scenario, localLlm }) {
  const cfg = readProjectNativeConfig(configRoot) ?? {};
  const root = mkdtempSync(join(tmpdir(), 'deckent-battery-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  for (const rel of ['docs', 'DIRECTIVES.md', 'CLAUDE.md', 'DECKENT.md']) {
    const src = join(configRoot, rel);
    if (!existsSync(src)) continue;
    cpSync(src, join(root, rel), { recursive: true, dereference: true });
  }
  // Copy only native execution settings; no account/auth or unrelated project state.
  const patched = Object.fromEntries(['native_provider', 'native_model',
    'native_context_tokens', 'native_structured_output_control', 'execution_budget'].filter((key) => cfg[key] !== undefined)
    .map((key) => [key, cfg[key]]));
  patched.native_provider = scenario.provider ?? patched.native_provider ?? 'local-llm';
  patched.local_llm = {
    ...Object.fromEntries(['endpoint', 'contextSize'].filter((key) => cfg.local_llm?.[key] !== undefined)
      .map((key) => [key, cfg.local_llm[key]])),
    ...(localLlm?.endpoint ? { endpoint: localLlm.endpoint } : {}),
    ...(scenario.contextSize != null ? { contextSize: scenario.contextSize } : {}),
  };
  if (localLlm?.models?.length) {
    patched.native_model = patched.native_model && localLlm.models.includes(patched.native_model)
      ? patched.native_model
      : localLlm.models[0];
  }
  writeFileSync(join(root, '.deckent/config.json'), `${JSON.stringify(patched, null, 2)}\n`, { mode: 0o600 });
  return { workspace: root, disposable: true };
}

export function buildUiLineCatalog(getMessage, lang = 'en') {
  const toolRan = getMessage('native.tool_ran', lang);
  const triggers = {
    token_pressure: getMessage('native-context.trigger.token_pressure', lang),
    overflow: getMessage('native-context.trigger.overflow', lang),
    manual: getMessage('native-context.trigger.manual', lang),
    planned: getMessage('native-context.trigger.planned', lang),
    cadence: getMessage('native-context.trigger.cadence', lang),
  };
  const triggerTemplate = getMessage('native-context.slash.trigger', lang);
  return {
    approvalHints: [
      getMessage('tui.confirm_hint', lang),
      getMessage('approval_card.hint', lang),
    ],
    checkpointNotices: [
      getMessage('native-context.checkpoint_token_pressure', lang),
      getMessage('native-context.checkpoint_cadence', lang),
      getMessage('native.checkpoint.saved', lang),
      ...Object.values(triggers).map((t) => triggerTemplate.replace('{trigger}', t)),
    ],
    toolLineSuffix: ` — ${toolRan}`,
    interimRequiredPrefix: getMessage('native.interim_deliverable_required', lang).split('{toolCalls}')[0].trim(),
    interimStructuredMarkers: [
      'known so far · remaining · next step',
      'bilinen · kalan · sonraki adım',
    ],
    contextInterimPrefix: getMessage('native-context.slash.interim_deliverable', lang).split('{calls}')[0].trim(),
    turnInterruptedPrefix: getMessage('native.turn_interrupted', lang).split('{toolCalls}')[0].trim(),
    measurementStateExact: getMessage('native-context.measurement.state_exact', lang),
    measurementStateFailed: getMessage('native-context.measurement.state_failed', lang),
    measurementExactBootLine: getMessage('native.measurement_authority.exact', lang),
    measurementAuthorityExactLine: getMessage('native-context.slash.measurement_authority', lang)
      .replace('{state}', getMessage('native-context.measurement.state_exact', lang))
      .replace('{reason}', ''),
    tokenPressureLines: [
      getMessage('native-context.checkpoint_token_pressure', lang),
    ],
    typedFailureSurfaces: buildReferenceTypedFailureSurfaces(getMessage, lang),
    hostNoticeSurfaces: buildReferenceHostNoticeSurfaces(getMessage, lang),
    interimRequestSurfaces: buildInterimRequestSurfaces(getMessage, lang),
  };
}

export function countLineMatches(plain, needles) {
  const lines = plain.split('\n');
  let count = 0;
  for (const line of lines) {
    if (needles.some((needle) => needle && line.includes(needle))) count++;
  }
  return count;
}

export function extractToolLines(plain, catalog) {
  return plain.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes(catalog.toolLineSuffix));
}

export function countScratchCheckpoints(workspaceRoot) {
  const sessionsRoot = join(workspaceRoot, '.deckent/runtime/sessions');
  const files = [];
  if (!existsSync(sessionsRoot)) return { count: 0, files: [] };
  for (const sessionId of readdirSync(sessionsRoot)) {
    const cpDir = join(sessionsRoot, sessionId, 'checkpoints');
    if (!existsSync(cpDir)) continue;
    for (const name of readdirSync(cpDir)) {
      if (CHECKPOINT_FILE_RE.test(name)) files.push(join(cpDir, name));
    }
  }
  return { count: files.length, files };
}

export function scanTraceFiles(workspaceRoot) {
  const tracesDir = join(workspaceRoot, '.deckent/traces');
  if (!existsSync(tracesDir)) return [];
  return readdirSync(tracesDir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => join(tracesDir, name));
}

export function parseLocalLlmStatus(stdout) {
  const jsonLine = String(stdout).trim().split('\n').find((line) => line.startsWith('{'));
  if (!jsonLine) return { ok: false, reason: 'status-not-json' };
  try {
    const parsed = JSON.parse(jsonLine);
    if (parsed.healthy !== true) return { ok: false, reason: 'local-llm-unhealthy', detail: parsed };
    return {
      ok: true,
      endpoint: parsed.endpoint,
      models: parsed.models?.map((m) => m.id) ?? [],
      configuredContextSize: parsed.configuredContextSize,
      effectiveContextSize: parsed.effectiveContext?.effectiveContextSize ?? parsed.configuredContextSize,
    };
  } catch {
    return { ok: false, reason: 'status-parse-error' };
  }
}

export async function probeLocalLlm({ entryPath, spawnFn = childSpawn } = {}) {
  const entry = resolve(entryPath);
  if (!existsSync(entry)) return { ok: false, reason: 'dist-missing', entry };
  const probeCwd = repoRootForEntry(entry);
  return new Promise((resolvePromise) => {
    const child = spawnFn(process.execPath, [entry, 'local-llm', 'status'], {
      cwd: probeCwd, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (code !== 0) {
        resolvePromise({ ok: false, reason: 'local-llm-status-exit', code, stderr: stderr.slice(0, 500) });
        return;
      }
      const parsed = parseLocalLlmStatus(stdout);
      resolvePromise(parsed.ok ? parsed : { ...parsed, stderr: stderr.slice(0, 500) });
    });
    child.on('error', (err) => resolvePromise({ ok: false, reason: 'spawn-error', detail: String(err) }));
  });
}

export function hasHostedCredential(provider, env = process.env) {
  if (provider === 'anthropic-api') return Boolean(env.DECKENT_CLAUDE_API_KEY || env.ANTHROPIC_API_KEY);
  if (provider === 'openai-compatible') return Boolean(env.OPENAI_API_KEY || env.DECKENT_OPENAI_API_KEY);
  return false;
}

export function classifyScenarioSkip(scenario, { localLlm, entryExists, messagesAvailable, ptyAvailable, env = process.env } = {}) {
  if (!entryExists) return { skip: true, reason: 'DIST_MISSING' };
  if (!messagesAvailable) return { skip: true, reason: 'MESSAGES_CATALOG_MISSING' };
  if (!ptyAvailable) return { skip: true, reason: 'PTY_MISSING' };
  if (scenario.requiresLocalLlm && !localLlm?.ok) return { skip: true, reason: 'LOCAL_LLM_UNAVAILABLE', detail: localLlm };
  if (scenario.requiresCredential && !hasHostedCredential(scenario.requiresCredential, env)) {
    return { skip: true, reason: 'HOSTED_CREDENTIAL_MISSING', provider: scenario.requiresCredential };
  }
  return { skip: false };
}

const TRANSPORT_FAIL = /native\.transport|Connection to the provider|Sağlayıcıyla bağlantı/i;
const BOOT_CHROME_RE = /^[\s●◆▶❯>|/]|^deckent[_/]|^\/(?:approve|context|help|mcp)\b|^Context\b|^Bağlam\b|^Running\b|^Çalışıyor\b|^generating|^üretiliyor|^ready ·|^hazır ·|^[✓✔]\s*(?:hazır|ready)\s·|^⋯\s*kuyrukta|^deckent · docs\//i;
const USER_PROMPT_ECHO_RE = /^›\s/;
const REFERENCE_PROGRESS_RE = /okunuyor · (?:kabul ediliyor|haritalanıyor)/i;
const REFERENCE_CHILD_RE = /alt istek:\s*(\d+)\s*map\s*·\s*(\d+)\s*reduce/i;
const REFERENCE_PARTIAL_RE = /referans özeti:.*(?:·\s*)?(?:kısmi|partial)\b|reference digest:.*(?:·\s*)?(?:partial|kısmi)\b/i;
const REFERENCE_FAILED_RE = /referans özeti:.*(?:·\s*)?(?:başarısız|failed)\b|reference digest:.*(?:·\s*)?(?:failed|başarısız)\b/i;
const REFERENCE_INVALID_RE = /REFERENCE_OUTPUT_INVALID|native\.reference\.unavailable|\[native\.reference\.unavailable\]/i;
const REFERENCE_PROVIDER_NOTIFY_RE = /sağlayıcı bildirimleri:.*?\bbildirim\s+(\d+)|provider notifications:.*?\bnotifications?\s+(\d+)/i;
const REFERENCE_CHILD_USAGE_RE = /kullanım\s+(\d+)\s+giriş|usage\s+(\d+)\s+in/i;
const CONTEXT_SLASH_FIELD_RE = /^(?:\s{2})?(?:son (?:gerçek istek|isteğin penceresi)|sağlayıcı\/model|ölçüm:|ölçüm kaynağı:|istek kapasitesi|istek özeti|sağlayıcı bildirimleri|bağlam epoch|mesaj:|checkpoint:|otomatik sıkıştırma|ön metin|ölçüm otoritesi|ara teslimat|tur araç bütçesi|referans özeti|kaynak:|alt istek|saklanan özet|kalan süre|son hata)/i;

/** Canonical reason codes from cli-terminal-slash native.reference.failure.* family. */
const REFERENCE_FAILURE_REASON_CODES = [
  'reference_scope_refused',
  'reference_source_changed',
  'reference_source_unsupported',
  'reference_encoding_invalid',
  'reference_source_too_large',
  'reference_budget_invalid',
  'reference_budget_insufficient',
  'reference_cancelled',
  'reference_output_invalid',
  'reference_usage_uncertain',
  'reference_thinking_control_unavailable',
  'reference_structured_output_unavailable',
  'reference_provider_failed',
  'reference_deadline',
  'reference_store_failed',
  'reference_range_invalid',
  'reference_journal_mismatch',
];

const REFERENCE_REMEDY_REASON_CODES = [
  'reference_structured_output_unavailable',
];

/** Canonical reason codes from native.reference.interim-skip.* family (7113-E B-2). */
const REFERENCE_INTERIM_SKIP_REASON_CODES = [
  'not-due',
  'budget-refused',
  'unconfirmed-reservation',
  'empty-answer',
  'invalid-answer',
  'seam-closed',
  'stopped',
];

function messageOrNull(getMessage, key, lang) {
  const value = getMessage(key, lang);
  return value === key ? null : value;
}

function splitReasonTemplate(template) {
  if (!template || !template.includes('{reason}')) {
    return { prefix: null, suffix: null };
  }
  const [prefix, suffix = ''] = template.split('{reason}');
  return { prefix: prefix.trim(), suffix: suffix.trim() };
}

function splitTemplateParam(template, param) {
  if (!template || !template.includes(`{${param}}`)) {
    return { prefix: null, suffix: null };
  }
  const [prefix, suffix = ''] = template.split(`{${param}}`);
  return { prefix: prefix.trim(), suffix: suffix.trim() };
}

function msFromPrompt(observedAtMs, promptSentAtMs, startedAtMs) {
  const anchor = promptSentAtMs ?? startedAtMs;
  if (observedAtMs == null || anchor == null) return null;
  return observedAtMs - anchor;
}

function collectLocalizedFragments(getMessage, langs, messageKey) {
  const fragments = [];
  for (const lg of langs) {
    const fragment = messageOrNull(getMessage, messageKey, lg);
    if (fragment) fragments.push(fragment);
  }
  return fragments;
}

export function buildReferenceTypedFailureSurfaces(getMessage, lang = 'en') {
  const langs = lang === 'tr' ? ['tr', 'en'] : ['en', 'tr'];
  const unavailablePrefixes = [];
  const unavailableSuffixes = [];
  for (const lg of langs) {
    const template = messageOrNull(getMessage, 'native.reference.unavailable', lg);
    if (!template) continue;
    const { prefix, suffix } = splitReasonTemplate(template);
    if (prefix) unavailablePrefixes.push(prefix);
    if (suffix) unavailableSuffixes.push(suffix.replace(/\.$/, ''));
  }
  const failureFragments = REFERENCE_FAILURE_REASON_CODES.flatMap((code) =>
    collectLocalizedFragments(getMessage, langs, `native.reference.failure.${code}`));
  const remedyFragments = REFERENCE_REMEDY_REASON_CODES.flatMap((code) =>
    collectLocalizedFragments(getMessage, langs, `native.reference.remedy.${code}`));
  const remedyPrefixes = remedyFragments.flatMap((fragment) => {
    const beforeConfigKey = fragment.split(/native_structured_output_control|structuredOutputControl/i)[0]?.trim() ?? '';
    const normalized = beforeConfigKey.replace(/[,:]\s*$/, '').trim();
    return normalized.length >= 24 ? [normalized] : [];
  });
  const outputInvalidFragments = REFERENCE_FAILURE_REASON_CODES
    .filter((code) => code === 'reference_output_invalid')
    .flatMap((code) => collectLocalizedFragments(getMessage, langs, `native.reference.failure.${code}`));
  const phasePartial = langs.map((lg) => messageOrNull(getMessage, 'native.reference.phase.partial', lg)).filter(Boolean);
  const phaseFailed = langs.map((lg) => messageOrNull(getMessage, 'native.reference.phase.failed', lg)).filter(Boolean);
  return {
    unavailablePrefixes,
    unavailableSuffixes,
    failureFragments,
    remedyFragments,
    remedyPrefixes,
    outputInvalidFragments,
    phasePartial,
    phaseFailed,
    unavailableExact: ['[native.reference.unavailable]'],
  };
}

function splitCountTemplate(template) {
  if (!template || !template.includes('{count}')) {
    return { prefix: null, suffix: null };
  }
  const [prefix, suffix = ''] = template.split('{count}');
  return { prefix: prefix.trim(), suffix: suffix.trim() };
}

export function buildReferenceHostNoticeSurfaces(getMessage, lang = 'en') {
  const langs = lang === 'tr' ? ['tr', 'en'] : ['en', 'tr'];
  const interimSkippedEnvelopePrefixes = [];
  const interimSkippedEnvelopeSuffixes = [];
  for (const lg of langs) {
    const template = messageOrNull(getMessage, 'native.reference.interim-skipped', lg);
    if (!template) continue;
    const { prefix, suffix } = splitReasonTemplate(template);
    if (prefix) interimSkippedEnvelopePrefixes.push(prefix);
    if (suffix) interimSkippedEnvelopeSuffixes.push(suffix.replace(/\.$/, ''));
  }
  const interimSkipReasonFragments = REFERENCE_INTERIM_SKIP_REASON_CODES.flatMap((code) =>
    collectLocalizedFragments(getMessage, langs, `native.reference.interim-skip.${code}`));
  const usageHoldPrefixes = [];
  for (const lg of langs) {
    const template = messageOrNull(getMessage, 'native.reference.usage-hold', lg);
    if (!template) continue;
    const { prefix } = splitCountTemplate(template);
    if (prefix) usageHoldPrefixes.push(prefix);
  }
  return {
    interimSkippedEnvelopePrefixes,
    interimSkippedEnvelopeSuffixes,
    interimSkipReasonFragments,
    usageHoldPrefixes,
  };
}

export function isReferenceHostNoticeLine(line, catalog) {
  const trimmed = stripAnsi(String(line ?? '')).trim();
  if (!trimmed) return false;
  const surfaces = catalog?.hostNoticeSurfaces;
  if (!surfaces) {
    return /^\[(?:Henüz ara cevap yok|No interim answer yet)/i.test(trimmed)
      || /^(?:Okuma tamamlandı|The reading finished),/i.test(trimmed);
  }
  for (const prefix of surfaces.interimSkippedEnvelopePrefixes) {
    const bracketed = `[${prefix}`;
    if (trimmed.startsWith(bracketed) || trimmed.includes(bracketed)) return true;
  }
  for (const prefix of surfaces.usageHoldPrefixes) {
    if (trimmed.startsWith(`[${prefix}`) || trimmed.startsWith(prefix) || trimmed.includes(`[${prefix}`)) {
      return true;
    }
  }
  return false;
}

export function buildInterimRequestSurfaces(getMessage, lang = 'en') {
  const langs = lang === 'tr' ? ['tr', 'en'] : ['en', 'tr'];
  const requestPrefixes = [];
  for (const lg of langs) {
    const paramKeys = [
      ['native.interim_deliverable_required', 'toolCalls'],
      ['native.interim_deliverable_overdue', 'elapsed'],
      ['native.interim_deliverable_final', 'toolCalls'],
      ['native.interim_deliverable_failure_stop', 'attempts'],
    ];
    for (const [messageKey, param] of paramKeys) {
      const template = messageOrNull(getMessage, messageKey, lg);
      if (!template) continue;
      const { prefix } = splitTemplateParam(template, param);
      if (prefix) requestPrefixes.push(prefix);
    }
    for (const messageKey of [
      'native-context.slash.interim_deliverable_pending',
      'native-context.slash.interim_overdue',
      'native-context.slash.interim_exhausted',
    ]) {
      const fragment = messageOrNull(getMessage, messageKey, lg);
      if (fragment) requestPrefixes.push(fragment);
    }
    const interrupted = messageOrNull(getMessage, 'native.turn_interrupted', lg);
    if (interrupted) {
      const { prefix } = splitTemplateParam(interrupted, 'toolCalls');
      if (prefix) requestPrefixes.push(prefix);
    }
  }
  return { requestPrefixes: [...new Set(requestPrefixes)] };
}

export function isInterimRequestNoticeLine(line, catalog) {
  const trimmed = stripAnsi(String(line ?? '')).trim();
  if (!trimmed) return false;
  const prefixes = [
    ...(catalog?.interimRequestSurfaces?.requestPrefixes ?? []),
    catalog?.interimRequiredPrefix,
    catalog?.turnInterruptedPrefix,
  ].filter(Boolean);
  if (!prefixes.length) {
    return /^\[(?:ara yanıt istendi|interim answer requested)/i.test(trimmed);
  }
  for (const prefix of prefixes) {
    const bracketed = `[${prefix}`;
    if (trimmed.startsWith(bracketed) || trimmed.startsWith(prefix) || trimmed.includes(bracketed)) {
      return true;
    }
  }
  return false;
}

export function isInterimStructuredDeliverableLine(line, catalog) {
  const trimmed = line.trim();
  if (!trimmed || isInterimRequestNoticeLine(trimmed, catalog)) return false;
  if (isReferenceHostNoticeLine(trimmed, catalog)) return false;
  if (CONTEXT_SLASH_FIELD_RE.test(trimmed)) return false;
  const markers = catalog?.interimStructuredMarkers ?? [];
  return markers.some((marker) => marker && trimmed.includes(marker));
}

/**
 * Reconstruct logical PTY lines across chunk boundaries. Native PTY chunks are
 * transport fragments, not line or event boundaries — carry incomplete lines
 * until newline or final flush; completion timestamp uses the latest chunk that
 * contributed to the line (conservative observation, no synthetic merge).
 */
export function reconstructPtyLogicalLines(ptyChunks) {
  const lines = [];
  if (!ptyChunks?.length) return lines;

  let carry = '';
  let ansiPending = '';
  let carryObservedAtMs = null;

  for (const chunk of ptyChunks) {
    const observedAtMs = chunk.observedAtMs ?? null;
    if (!chunk.text) continue;
    if (!carry) carryObservedAtMs = observedAtMs;
    ({ plainCarry: carry, ansiPending } = decodePtyPlainCarry(carry, ansiPending, chunk.text));

    let newlineIdx;
    while ((newlineIdx = carry.indexOf('\n')) >= 0) {
      const rawLine = carry.slice(0, newlineIdx);
      carry = carry.slice(newlineIdx + 1);
      const line = rawLine.trim();
      if (line) {
        lines.push({
          line,
          rawLine,
          observedAtMs: observedAtMs ?? carryObservedAtMs,
        });
      }
      carryObservedAtMs = observedAtMs;
    }
    if (carry) {
      carryObservedAtMs = observedAtMs ?? carryObservedAtMs;
    } else {
      carryObservedAtMs = null;
    }
  }

  if (ansiPending) {
    carry += stripAnsi(ansiPending);
  }

  if (carry.trim()) {
    lines.push({
      line: carry.trim(),
      rawLine: carry,
      observedAtMs: carryObservedAtMs,
      flushed: true,
    });
  }

  return lines;
}

export function forEachPtyContentUnit(ptyChunks, visitor) {
  let insideBracketEnvelope = false;
  let envelopeBuffer = '';
  let envelopeObservedAtMs = null;

  for (const { line, observedAtMs } of reconstructPtyLogicalLines(ptyChunks)) {
    if (insideBracketEnvelope) {
      envelopeBuffer += line;
      const closeIdx = envelopeBuffer.indexOf(']');
      if (closeIdx >= 0) {
        visitor({
          kind: 'envelope',
          line: envelopeBuffer.slice(0, closeIdx + 1).trim(),
          observedAtMs: envelopeObservedAtMs ?? observedAtMs,
        });
        const tail = envelopeBuffer.slice(closeIdx + 1).trim();
        insideBracketEnvelope = false;
        envelopeBuffer = '';
        if (tail) visitor({ kind: 'line', line: tail, observedAtMs });
      }
      continue;
    }

    let rest = line;
    while (rest.length > 0) {
      const openIdx = rest.indexOf('[');
      if (openIdx < 0) {
        const trimmed = rest.trim();
        if (trimmed) visitor({ kind: 'line', line: trimmed, observedAtMs });
        break;
      }
      if (openIdx > 0) {
        const prefix = rest.slice(0, openIdx).trim();
        if (prefix) visitor({ kind: 'line', line: prefix, observedAtMs });
      }
      rest = rest.slice(openIdx);
      const closeIdx = rest.indexOf(']');
      if (closeIdx >= 0) {
        visitor({ kind: 'envelope', line: rest.slice(0, closeIdx + 1).trim(), observedAtMs });
        rest = rest.slice(closeIdx + 1);
        continue;
      }
      insideBracketEnvelope = true;
      envelopeBuffer = rest;
      envelopeObservedAtMs = observedAtMs;
      break;
    }
  }

  if (insideBracketEnvelope && envelopeBuffer.trim()) {
    visitor({
      kind: 'envelope',
      line: envelopeBuffer.trim(),
      observedAtMs: envelopeObservedAtMs,
      incomplete: true,
    });
  }
}

export function scanPtyChunkLines(ptyChunks, visitor) {
  for (const row of reconstructPtyLogicalLines(ptyChunks)) {
    visitor({ line: row.line, observedAtMs: row.observedAtMs, rawLine: row.rawLine });
  }
}

export function deriveTimedContentMetricsFromPtyChunks(ptyChunks, {
  catalog,
  promptText,
  promptSentAtMs,
  startedAtMs,
  promptEchoed,
  referenceRoute,
}) {
  let firstVisibleNarrativeMs = null;
  let firstVisibleNarrativeText = null;
  let firstInterimDeliverableMs = null;
  let hasVisibleAnalysis = false;
  let allowPostRequestDeliverable = false;
  let promptAnchorSeen = !promptText || promptEchoed === true;
  const promptAnchor = String(promptText ?? '').replace(/^@/, '').trim().slice(0, 24);

  const considerContentLine = (line, observedAtMs) => {
    if (promptSentAtMs != null && observedAtMs != null && observedAtMs < promptSentAtMs) return;

    if (promptText && !promptAnchorSeen) {
      if (line.includes('@docs/MASTER-PLAN') || (promptAnchor.length >= 8 && line.includes(promptAnchor))) {
        promptAnchorSeen = true;
      }
    }

    if (firstInterimDeliverableMs == null) {
      const structuredDeliverable = isInterimStructuredDeliverableLine(line, catalog);
      const postRequestDeliverable = allowPostRequestDeliverable
        && referenceRoute.referenceIngressExercised
        && promptAnchorSeen
        && isNarrativeCandidateLine(line, catalog, promptText);
      if (structuredDeliverable || postRequestDeliverable) {
        firstInterimDeliverableMs = msFromPrompt(observedAtMs, promptSentAtMs, startedAtMs);
      }
    }

    if (firstVisibleNarrativeText == null) {
      if (promptAnchorSeen
        && isNarrativeCandidateLine(line, catalog, promptText)
        && !(promptSentAtMs != null && !promptEchoed)) {
        firstVisibleNarrativeMs = msFromPrompt(observedAtMs, promptSentAtMs, startedAtMs);
        firstVisibleNarrativeText = line.slice(0, 200);
        hasVisibleAnalysis = true;
      }
    }
  };

  forEachPtyContentUnit(ptyChunks, ({ kind, line, observedAtMs }) => {
    if (kind === 'envelope') {
      if (isInterimRequestNoticeLine(line, catalog)) {
        allowPostRequestDeliverable = true;
        return;
      }
      if (isReferenceHostNoticeLine(line, catalog) || isTypedFailureOrUnavailableLine(line, catalog)) {
        return;
      }
      considerContentLine(line, observedAtMs);
      return;
    }
    considerContentLine(line, observedAtMs);
  });

  return {
    firstVisibleNarrativeMs,
    firstVisibleNarrativeText,
    hasVisibleAnalysis,
    firstInterimDeliverableMs,
  };
}

export function isRemedyOrConfigurationGuidanceLine(line, catalog) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const surfaces = catalog?.typedFailureSurfaces;
  const remedies = surfaces?.remedyFragments ?? [];
  const prefixes = surfaces?.remedyPrefixes ?? [];
  if (remedies.some((fragment) => trimmed === fragment)) return true;
  if (prefixes.some((prefix) => prefix && trimmed.startsWith(prefix))) return true;
  return false;
}

export function scrollbackHasTypedReferenceUnavailable(plain, catalog) {
  return plain.split('\n').some((line) => isTypedFailureOrUnavailableLine(line, catalog));
}

export function isTypedFailureOrUnavailableLine(line, catalog) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const surfaces = catalog?.typedFailureSurfaces;
  if (/^\[native\.reference\.unavailable\]$/i.test(trimmed)) return true;
  if (isRemedyOrConfigurationGuidanceLine(trimmed, catalog)) return true;
  if (!surfaces) {
    return /^\[(?:Referans analizi tamamlanamadı|Reference analysis could not finish)/i.test(trimmed);
  }
  if (surfaces.unavailableExact.some((exact) => trimmed === exact)) return true;
  for (const prefix of surfaces.unavailablePrefixes) {
    const bracketed = `[${prefix}`;
    if (trimmed.startsWith(bracketed) || trimmed.startsWith(prefix)) {
      // Wrapped unavailable envelopes may truncate before suffix/remedy; prefix is authoritative.
      return true;
    }
  }
  if (/^\[.+\]$/.test(trimmed)
    && surfaces.failureFragments.some((fragment) => trimmed.includes(fragment))) {
    return true;
  }
  return false;
}

export function parseBootStatus(plain, expected, catalog) {
  const providerModelToken = `${expected.provider}/${expected.model}`;
  const bootProviderModelSeen = plain.includes(providerModelToken)
    || (plain.includes(expected.provider) && plain.includes(expected.model));
  const measurementExactSeen = Boolean(
    (catalog?.measurementExactBootLine && plain.includes(catalog.measurementExactBootLine.trim()))
    || (catalog?.measurementAuthorityExactLine && plain.includes(catalog.measurementAuthorityExactLine.trim())),
  );
  return {
    expectedProvider: expected.provider,
    expectedModel: expected.model,
    bootProviderModelSeen,
    measurementExactSeen,
    providerMatch: bootProviderModelSeen,
  };
}

export function detectTurnCompleted(plain, { promptSentAtMs } = {}) {
  const match = plain.match(TURN_END_FOOTER_RE);
  if (!match) {
    return { completed: false, turnEndMs: null };
  }
  if (promptSentAtMs == null) {
    return { completed: false, turnEndMs: null };
  }
  const turnEndMs = Math.round(Number.parseFloat(match[1]) * 1000);
  return { completed: true, turnEndMs };
}

export function promptEchoedInScrollback(plain, prompt) {
  const trimmed = String(prompt).trim();
  if (!trimmed) return false;
  if (plain.includes(trimmed)) return true;
  const anchor = trimmed.replace(/^@/, '').slice(0, 24);
  return anchor.length >= 8 && plain.includes(anchor);
}

export function isUserPromptEchoLine(line, promptText) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (USER_PROMPT_ECHO_RE.test(trimmed)) return true;
  if (promptText && trimmed.includes(String(promptText).trim())) return true;
  const anchor = String(promptText ?? '').replace(/^@/, '').trim();
  if (anchor.length >= 12 && trimmed.includes(anchor)) return true;
  return false;
}

export function parseReferenceRouteEvidence(plain, catalog) {
  const childMatch = plain.match(REFERENCE_CHILD_RE);
  const childMapRequests = childMatch ? Number(childMatch[1]) : 0;
  const childReduceRequests = childMatch ? Number(childMatch[2]) : 0;
  const referenceFailed = REFERENCE_FAILED_RE.test(plain)
    || (catalog?.typedFailureSurfaces?.phaseFailed ?? []).some((phase) => (
      new RegExp(`referans özeti:.*(?:·\\s*)?${escapeRegExp(phase)}\\b|reference digest:.*(?:·\\s*)?${escapeRegExp(phase)}\\b`, 'i').test(plain)
    ));
  const referencePartial = !referenceFailed && (
    REFERENCE_PARTIAL_RE.test(plain)
    || (catalog?.typedFailureSurfaces?.phasePartial ?? []).some((phase) => (
      new RegExp(`referans özeti:.*(?:·\\s*)?${escapeRegExp(phase)}\\b|reference digest:.*(?:·\\s*)?${escapeRegExp(phase)}\\b`, 'i').test(plain)
    ))
  );
  const outputInvalidFragments = catalog?.typedFailureSurfaces?.outputInvalidFragments ?? [];
  const referenceTypedUnavailable = scrollbackHasTypedReferenceUnavailable(plain, catalog);
  const failureEvidenceLines = plain.split('\n').filter((line) => (
    /son hata:|last failure:|referans özeti:|reference digest:/i.test(line)
  ));
  const referenceOutputInvalid = /REFERENCE_OUTPUT_INVALID/i.test(plain)
    || failureEvidenceLines.some((line) => outputInvalidFragments.some((fragment) => line.includes(fragment)));
  const zeroChildUsage = /kullanım\s+0\s+giriş\s*\/\s*0\s*çıkış|usage\s+0\s+in\s*\/\s*0\s+out/i.test(plain);
  const referencePreDispatchUnavailable = referenceTypedUnavailable
    && !referenceFailed
    && childMapRequests === 0
    && childReduceRequests === 0
    && zeroChildUsage;
  const referenceIngressExercised = referencePartial
    || referenceFailed
    || referenceOutputInvalid
    || referenceTypedUnavailable
    || /referans özeti:|reference digest:/i.test(plain)
    || childMapRequests > 0
    || childReduceRequests > 0;

  let referenceChildInvoked = childMapRequests > 0 || childReduceRequests > 0;
  let referenceChildInvocationAuthority = 'rendered-slash-receipt';
  if (!referenceChildInvoked) {
    const notifyMatch = plain.match(REFERENCE_PROVIDER_NOTIFY_RE);
    const usageMatch = plain.match(REFERENCE_CHILD_USAGE_RE);
    const notifyCount = notifyMatch ? Number(notifyMatch[1] ?? notifyMatch[2] ?? 0) : 0;
    const usageInTokens = usageMatch ? Number(usageMatch[1] ?? usageMatch[2] ?? 0) : 0;
    if (notifyCount > 0 || usageInTokens > 0) {
      referenceChildInvoked = null;
      referenceChildInvocationAuthority = 'unknown-no-slash-receipt';
    } else {
      referenceChildInvoked = false;
    }
  }

  return {
    referenceIngressExercised,
    referencePartial,
    referenceFailed,
    referenceTypedUnavailable,
    referencePreDispatchUnavailable,
    referenceOutputInvalid,
    childMapRequests,
    childReduceRequests,
    referenceChildInvoked,
    referenceChildInvocationAuthority,
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replayPtyObservation(observation, parseOpts = {}) {
  const scrollback = (observation.ptyChunks ?? []).map((c) => c.text).join('');
  return parseScrollbackMetrics(scrollback, {
    startedAtMs: observation.startedAtMs ?? Date.now(),
    promptSentAtMs: observation.promptSentAtMs ?? null,
    observedAtMs: observation.ptyChunks?.at(-1)?.observedAtMs ?? Date.now(),
    observation,
    ...parseOpts,
  });
}

export function isNarrativeCandidateLine(line, catalog, promptText) {
  const trimmed = line.trim();
  if (trimmed.length < 40) return false;
  if (isUserPromptEchoLine(trimmed, promptText)) return false;
  if (BOOT_CHROME_RE.test(trimmed)) return false;
  if (REFERENCE_PROGRESS_RE.test(trimmed)) return false;
  if (catalog?.approvalHints?.some((h) => trimmed.includes(h))) return false;
  if (catalog?.toolLineSuffix && trimmed.includes(catalog.toolLineSuffix)) return false;
  if (catalog?.checkpointNotices?.some((n) => n && trimmed.includes(n))) return false;
  if (/measurement authority:|ölçüm otoritesi:|Measurement:|Ölçüm:/i.test(trimmed)) return false;
  if (/^[\w-]+\/[\w.-]+(?:\s*[·|]|$)/.test(trimmed)) return false;
  if (/^deckent\s+[\w.-]+\s+·\s+/i.test(trimmed)) return false;
  if (/^[\s\d|:-]+$/.test(trimmed)) return false;
  if (/^[\u2500-\u257F╭╰│─]/.test(trimmed)) return false;
  if (/^⏱\s*\d/.test(trimmed)) return false;
  if (/^\[getMessage\]/i.test(trimmed)) return false;
  if (CONTEXT_SLASH_FIELD_RE.test(trimmed)) return false;
  if (/^\[native\.reference\.unavailable\]/i.test(trimmed)) return false;
  if (isTypedFailureOrUnavailableLine(trimmed, catalog)) return false;
  if (isReferenceHostNoticeLine(trimmed, catalog)) return false;
  if (isInterimRequestNoticeLine(trimmed, catalog)) return false;
  if (isRemedyOrConfigurationGuidanceLine(trimmed, catalog)) return false;
  if (/^Bağlam$/i.test(trimmed) || /^Context$/i.test(trimmed)) return false;
  return true;
}

export function deriveMeasurementAuthority(plain, catalog) {
  if (catalog.measurementAuthorityExactLine && plain.includes(catalog.measurementAuthorityExactLine.trim())) {
    return 'exact';
  }
  if (plain.includes(`measurement authority: ${catalog.measurementStateFailed}`)
    || plain.includes(`ölçüm otoritesi: ${catalog.measurementStateFailed}`)) {
    return 'measurement-failed';
  }
  return 'unknown';
}

export function firstMatchingLineMs(plain, needles, startedAtMs, { exclude = () => false, observedAtMs = Date.now() } = {}) {
  const lines = plain.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || exclude(trimmed)) continue;
    if (needles.some((n) => n && trimmed.includes(n))) {
      return observedAtMs - startedAtMs;
    }
  }
  return null;
}

export function parseScrollbackMetrics(scrollback, {
  startedAtMs = Date.now(),
  catalog,
  workspaceRoot,
  scenario,
  expectedBinding,
  promptText,
  promptSentAtMs,
  observedAtMs = Date.now(),
  observation,
} = {}) {
  const plain = stripAnsi(scrollback);
  const scratch = workspaceRoot ? countScratchCheckpoints(workspaceRoot) : { count: 0, files: [] };
  const uiApprovalCount = catalog ? countLineMatches(plain, catalog.approvalHints) : 0;
  const uiCheckpointCount = catalog ? countLineMatches(plain, catalog.checkpointNotices) : 0;
  const checkpointCount = Math.max(scratch.count, uiCheckpointCount);
  const toolLines = catalog ? extractToolLines(plain, catalog) : [];
  const toolCallCount = toolLines.length;
  const tokenPressureCount = catalog
    ? countLineMatches(plain, catalog.tokenPressureLines)
    : 0;
  const transportFailureCount = (plain.match(new RegExp(TRANSPORT_FAIL.source, 'gi')) ?? []).length;
  const measurementAuthority = catalog ? deriveMeasurementAuthority(plain, catalog) : 'unknown';
  const bootStatus = expectedBinding
    ? parseBootStatus(plain, expectedBinding, catalog)
    : null;
  const promptEchoed = promptText ? promptEchoedInScrollback(plain, promptText) : null;
  const promptSent = promptSentAtMs != null;
  const turn = detectTurnCompleted(plain, { promptSentAtMs, startedAtMs });
  const referenceRoute = parseReferenceRouteEvidence(plain, catalog);

  let firstVisibleNarrativeMs = null;
  let firstVisibleNarrativeText = null;
  let hasVisibleAnalysis = false;
  let firstInterimDeliverableMs = null;
  const ptyChunks = observation?.ptyChunks ?? null;
  const computedFromChunks = Boolean(ptyChunks?.length && promptSentAtMs != null);

  if (computedFromChunks) {
    const timed = deriveTimedContentMetricsFromPtyChunks(ptyChunks, {
      catalog,
      promptText,
      promptSentAtMs,
      startedAtMs,
      promptEchoed,
      referenceRoute,
    });
    firstVisibleNarrativeMs = timed.firstVisibleNarrativeMs;
    firstVisibleNarrativeText = timed.firstVisibleNarrativeText;
    hasVisibleAnalysis = timed.hasVisibleAnalysis;
    firstInterimDeliverableMs = timed.firstInterimDeliverableMs;
  } else {
    const promptAnchorIdx = promptText ? plain.indexOf('@docs/MASTER-PLAN') : -1;
    for (const line of plain.split('\n')) {
      if (!isNarrativeCandidateLine(line, catalog, promptText)) continue;
      const lineIdx = plain.indexOf(line);
      if (promptSentAtMs != null && promptAnchorIdx >= 0 && lineIdx <= promptAnchorIdx) continue;
      if (promptSentAtMs != null && !promptEchoed) continue;
      firstVisibleNarrativeMs = observedAtMs - (promptSentAtMs ?? startedAtMs);
      firstVisibleNarrativeText = line.trim().slice(0, 200);
      hasVisibleAnalysis = true;
      break;
    }
    const interimMarkers = [
      ...(catalog?.interimStructuredMarkers ?? []),
    ].filter(Boolean);
    firstInterimDeliverableMs = firstMatchingLineMs(plain, interimMarkers, promptSentAtMs ?? startedAtMs, {
      observedAtMs,
      exclude: (line) => isInterimRequestNoticeLine(line, catalog),
    });
  }

  if (firstVisibleNarrativeText && (
    CONTEXT_SLASH_FIELD_RE.test(firstVisibleNarrativeText.trim())
    || isTypedFailureOrUnavailableLine(firstVisibleNarrativeText, catalog)
    || isReferenceHostNoticeLine(firstVisibleNarrativeText, catalog)
    || isInterimRequestNoticeLine(firstVisibleNarrativeText, catalog)
  )) {
    firstVisibleNarrativeText = null;
    firstVisibleNarrativeMs = null;
    hasVisibleAnalysis = false;
  }
  if (!toolCallCount && (
    referenceRoute.referenceFailed
    || referenceRoute.referencePreDispatchUnavailable
    || (referenceRoute.referenceTypedUnavailable && !referenceRoute.referencePartial)
    || (referenceRoute.referenceOutputInvalid && !referenceRoute.referencePartial)
    || (referenceRoute.referencePartial && referenceRoute.referenceOutputInvalid)
  )) {
    firstVisibleNarrativeText = null;
    firstVisibleNarrativeMs = null;
    hasVisibleAnalysis = false;
  }

  // A snapshot supplies observation time, never historical event time. Only the
  // live collector can retain the first observation across later screen parses.
  if (observation && promptSent) {
    if (!computedFromChunks) {
      observation.firstVisibleNarrativeMs ??= firstVisibleNarrativeMs;
      observation.firstVisibleNarrativeText ??= firstVisibleNarrativeText;
      if (firstInterimDeliverableMs !== null && observation.firstInterimDeliverableMs == null) {
        observation.firstInterimDeliverableMs = firstInterimDeliverableMs;
        observation.toolRowsAtFirstInterim = toolCallCount;
      }
      firstVisibleNarrativeMs = observation.firstVisibleNarrativeMs ?? null;
      firstVisibleNarrativeText = observation.firstVisibleNarrativeText ?? null;
      firstInterimDeliverableMs = observation.firstInterimDeliverableMs ?? null;
    } else {
      if (firstVisibleNarrativeMs != null && (
        observation.firstVisibleNarrativeMs == null
        || firstVisibleNarrativeMs < observation.firstVisibleNarrativeMs
      )) {
        observation.firstVisibleNarrativeMs = firstVisibleNarrativeMs;
        observation.firstVisibleNarrativeText = firstVisibleNarrativeText;
      } else if (firstVisibleNarrativeMs == null && observation.firstVisibleNarrativeMs != null) {
        firstVisibleNarrativeMs = observation.firstVisibleNarrativeMs;
        firstVisibleNarrativeText = observation.firstVisibleNarrativeText ?? null;
        hasVisibleAnalysis = Boolean(firstVisibleNarrativeText);
      }
      if (firstInterimDeliverableMs != null && (
        observation.firstInterimDeliverableMs == null
        || firstInterimDeliverableMs < observation.firstInterimDeliverableMs
      )) {
        observation.firstInterimDeliverableMs = firstInterimDeliverableMs;
        observation.toolRowsAtFirstInterim = toolCallCount;
      } else if (firstInterimDeliverableMs == null && observation.firstInterimDeliverableMs != null) {
        firstInterimDeliverableMs = observation.firstInterimDeliverableMs;
      }
    }
    if (firstVisibleNarrativeText && (
      isReferenceHostNoticeLine(firstVisibleNarrativeText, catalog)
      || isInterimRequestNoticeLine(firstVisibleNarrativeText, catalog)
    )) {
      firstVisibleNarrativeText = null;
      firstVisibleNarrativeMs = null;
      hasVisibleAnalysis = false;
    } else if (firstVisibleNarrativeText) {
      hasVisibleAnalysis = true;
    }
  }
  const interimDeliverableSeen = firstInterimDeliverableMs !== null;

  let interruptPartialOnScreen = false;
  let interruptPartialInTranscript = false;
  if (scenario?.interruptTest) {
    interruptPartialOnScreen = Boolean(firstVisibleNarrativeText);
    const traces = workspaceRoot ? scanTraceFiles(workspaceRoot) : [];
    interruptPartialInTranscript = traces.some((file) => {
      try {
        const body = readFileSync(file, 'utf8');
        return body.includes('assistant') && body.length > 200;
      } catch { return false; }
    });
  }

  return {
    approvalCount: uiApprovalCount,
    toolCallCount,
    toolCountAuthority: 'rendered-rows-only',
    toolRowsAtFirstInterim: observation?.toolRowsAtFirstInterim ?? null,
    toolLines,
    checkpointCount,
    scratchCheckpointCount: scratch.count,
    uiCheckpointCount,
    tokenPressureCheckpointCount: tokenPressureCount,
    transportFailureCount,
    measurementAuthority,
    bootStatus,
    promptSent,
    promptEchoed,
    turnCompleted: turn.completed,
    turnEndMs: turn.turnEndMs,
    hasVisibleAnalysis,
    firstVisibleNarrativeMs,
    firstVisibleNarrativeText,
    firstInterimDeliverableMs,
    interimDeliverableSeen,
    fakeContextCheckpointsInFirstWindow: toolCallCount <= FIRST_TOOL_WINDOW ? tokenPressureCount : null,
    interruptPartialOnScreen,
    interruptPartialInTranscript,
    scrollbackBytes: Buffer.byteLength(plain, 'utf8'),
    elapsedMs: observedAtMs - (promptSentAtMs ?? startedAtMs),
    ...referenceRoute,
  };
}

export function evaluateAcceptanceCriteria(metrics, scenario, { timeoutMs = DEFAULT_SCENARIO_TIMEOUT_MS } = {}) {
  if (scenario.interruptTest) {
    const checks = [{
      id: '7114-interrupt-partial-preserved',
      pass: metrics.interruptPartialOnScreen && metrics.interruptPartialInTranscript,
      detail: {
        interruptPartialOnScreen: metrics.interruptPartialOnScreen,
        interruptPartialInTranscript: metrics.interruptPartialInTranscript,
      },
    }];
    const failed = checks.filter((c) => c.pass === false);
    return { checks, overall: failed.length === 0 ? 'pass' : 'fail', failedIds: failed.map((c) => c.id) };
  }

  const checks = [
    {
      id: 'scenario-provider-match',
      pass: metrics.bootStatus?.bootProviderModelSeen === true,
      detail: metrics.bootStatus ?? { reason: 'boot-status-not-captured' },
    },
    {
      id: 'prompt-sent-and-echoed',
      pass: metrics.promptSent === true && metrics.promptEchoed === true,
      detail: { promptSent: metrics.promptSent, promptEchoed: metrics.promptEchoed },
    },
    {
      id: 'turn-completed-before-timeout',
      pass: metrics.turnCompleted === true && metrics.elapsedMs <= timeoutMs,
      detail: { turnCompleted: metrics.turnCompleted, turnEndMs: metrics.turnEndMs, elapsedMs: metrics.elapsedMs, timeoutMs },
    },
    {
      id: 'tool-calls-nonzero-or-reference-child',
      pass: metrics.toolCallCount > 0 || metrics.referenceChildInvoked === true,
      disposition: metrics.referenceChildInvoked === null ? 'hold' : 'evaluated',
      detail: {
        toolCallCount: metrics.toolCallCount,
        toolCountAuthority: metrics.toolCountAuthority ?? 'rendered-rows-only',
        referenceChildInvoked: metrics.referenceChildInvoked === null
          ? null
          : (metrics.referenceChildInvoked ?? false),
        referenceChildInvocationAuthority: metrics.referenceChildInvocationAuthority ?? 'rendered-slash-receipt',
        childMapRequests: metrics.childMapRequests ?? 0,
        childReduceRequests: metrics.childReduceRequests ?? 0,
      },
    },
    {
      id: 'visible-analysis-within-10m',
      pass: metrics.hasVisibleAnalysis === true && metrics.elapsedMs <= timeoutMs,
      disposition: (metrics.referencePartial && !metrics.referenceFailed && !metrics.referencePreDispatchUnavailable && !metrics.hasVisibleAnalysis)
        ? 'hold'
        : 'evaluated',
      detail: {
        hasVisibleAnalysis: metrics.hasVisibleAnalysis,
        firstVisibleNarrativeText: metrics.firstVisibleNarrativeText,
        referencePartial: metrics.referencePartial ?? false,
        referenceFailed: metrics.referenceFailed ?? false,
        referenceTypedUnavailable: metrics.referenceTypedUnavailable ?? false,
        referencePreDispatchUnavailable: metrics.referencePreDispatchUnavailable ?? false,
        elapsedMs: metrics.elapsedMs,
        timeoutMs,
      },
    },
    {
      id: 'no-fake-context-checkpoint-first-20-tools',
      pass: metrics.tokenPressureCheckpointCount === 0,
      // Exact tokenization does not prove a checkpoint was caused by real pressure.
      detail: {
        toolCallCount: metrics.toolCallCount,
        tokenPressureCheckpointCount: metrics.tokenPressureCheckpointCount,
        measurementAuthority: metrics.measurementAuthority,
      },
    },
    {
      id: '7114-first-visible-narrative-10s',
      pass: metrics.firstVisibleNarrativeMs !== null
        && metrics.firstVisibleNarrativeMs <= THRESHOLDS_7114.firstVisibleNarrativeMs,
      disposition: (metrics.referencePartial && !metrics.referenceFailed && !metrics.referencePreDispatchUnavailable && metrics.firstVisibleNarrativeMs === null)
        ? 'hold'
        : 'evaluated',
      detail: {
        firstVisibleNarrativeMs: metrics.firstVisibleNarrativeMs,
        referencePartial: metrics.referencePartial ?? false,
        referenceFailed: metrics.referenceFailed ?? false,
        limitMs: THRESHOLDS_7114.firstVisibleNarrativeMs,
      },
    },
    {
      id: '7114-interim-deliverable-bound',
      pass: metrics.interimDeliverableSeen && (
        (metrics.firstInterimDeliverableMs !== null && metrics.firstInterimDeliverableMs <= THRESHOLDS_7114.interimDeliverableMs)
        && metrics.toolRowsAtFirstInterim != null
        && metrics.toolRowsAtFirstInterim <= THRESHOLDS_7114.interimDeliverableToolCalls
      ),
      disposition: (metrics.referenceIngressExercised && !metrics.interimDeliverableSeen)
        ? 'hold'
        : 'evaluated',
      detail: {
        firstInterimDeliverableMs: metrics.firstInterimDeliverableMs,
        toolCallCount: metrics.toolCallCount,
        referenceIngressExercised: metrics.referenceIngressExercised ?? false,
        referencePartial: metrics.referencePartial ?? false,
        referenceFailed: metrics.referenceFailed ?? false,
        holdReason: (metrics.referenceIngressExercised && !metrics.interimDeliverableSeen)
          ? 'reference-program-no-interim-nudge-actual-product-hold'
          : null,
        limits: {
          ms: THRESHOLDS_7114.interimDeliverableMs,
          toolCalls: THRESHOLDS_7114.interimDeliverableToolCalls,
        },
      },
    },
    {
      id: 'standard-readonly-approval-posture',
      pass: scenario.approvalMode !== 'suggest' || metrics.approvalCount === 0,
      detail: { approvalMode: scenario.approvalMode, approvalCount: metrics.approvalCount },
    },
    {
      id: 'measurement-authority-exact',
      pass: metrics.measurementAuthority === 'exact',
      detail: { measurementAuthority: metrics.measurementAuthority },
    },
  ];

  const failed = checks.filter((c) => c.pass === false && c.disposition !== 'hold');
  const holds = checks.filter((c) => c.disposition === 'hold');
  const overall = failed.length > 0
    ? 'fail'
    : holds.length > 0
      ? 'hold'
      : 'pass';
  return {
    checks,
    overall,
    failedIds: failed.map((c) => c.id),
    holdIds: holds.map((c) => c.id),
  };
}

export function formatBatterySummary(payload, getMessage, lang = 'en') {
  const lines = [
    getMessage('terminal.battery.summary.header', lang),
    getMessage('terminal.battery.summary.generated', lang).replace('{at}', payload.generatedAt),
    getMessage('terminal.battery.summary.entry', lang).replace('{entry}', payload.entry),
    '',
  ];
  for (const row of payload.scenarios) {
    const statusKey = row.skipped
      ? 'terminal.battery.summary.scenario_skipped'
      : row.acceptance.overall === 'pass'
        ? 'terminal.battery.summary.scenario_pass'
        : 'terminal.battery.summary.scenario_fail';
    lines.push(getMessage(statusKey, lang)
      .replace('{id}', row.scenario.id)
      .replace('{reason}', row.skipReason ?? '')
      .replace('{elapsed}', String(row.metrics?.elapsedMs ?? '—'))
      .replace('{approvals}', String(row.metrics?.approvalCount ?? '—'))
      .replace('{checkpoints}', String(row.metrics?.checkpointCount ?? '—')));
  }
  lines.push('');
  lines.push(getMessage('terminal.battery.summary.footer', lang));
  return lines.join('\n');
}

export function writeEvidence(payload, { repoRoot = REPO_ROOT, stamp = new Date().toISOString().replace(/[:.]/g, '') } = {}) {
  const dir = join(repoRoot, EVIDENCE_DIR);
  mkdirSync(dir, { recursive: true });
  const base = `battery-${stamp}`;
  const jsonPath = join(dir, `${base}.json`);
  const mdPath = join(dir, `${base}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  return { jsonPath, mdPath, base };
}

export function parseBatteryArgv(argv) {
  const parsed = {
    lang: 'en',
    dryRun: false,
    help: false,
    includeInterrupt: false,
    localOnly: false,
    scenarioId: undefined,
    entryPath: undefined,
    timeoutMs: DEFAULT_SCENARIO_TIMEOUT_MS,
    unknown: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--interrupt-test') parsed.includeInterrupt = true;
    else if (arg === '--local-only') parsed.localOnly = true;
    else if (arg === '--lang') parsed.lang = argv[++i] ?? parsed.lang;
    else if (arg === '--scenario') parsed.scenarioId = argv[++i];
    else if (arg === '--entry') parsed.entryPath = argv[++i];
    else if (arg === '--timeout-ms') parsed.timeoutMs = Number(argv[++i]);
    else if (arg.startsWith('-')) parsed.unknown.push(arg);
  }
  return parsed;
}

async function loadMessagesCatalog(entryPath) {
  const runtimeRoot = repoRootForEntry(entryPath);
  const messagesPath = join(runtimeRoot, 'dist/cli/helpers/messages.js');
  if (!existsSync(messagesPath)) return null;
  const { getMessage } = await import(pathToFileURL(messagesPath).href);
  return getMessage;
}

async function loadPtySpawn(repoRoot = REPO_ROOT) {
  for (const root of [join(repoRoot, 'node_modules'), join(repoRoot, '../deckent-dev/node_modules')]) {
    const ptyPath = join(root, '@lydell/node-pty');
    if (!existsSync(ptyPath)) continue;
    try {
      const mod = await import(pathToFileURL(join(ptyPath, 'index.js')).href);
      if (typeof mod.spawn === 'function') return mod.spawn;
    } catch { /* try next */ }
  }
  try {
    const mod = await import('@lydell/node-pty');
    return mod.spawn;
  } catch {
    return null;
  }
}

export async function probeRuntimeMetadata({ entryPath, localLlm, spawnFn = childSpawn }) {
  const runtimeRoot = repoRootForEntry(entryPath);
  return {
    entryPath,
    entrySha256: existsSync(entryPath) ? sha256File(entryPath) : null,
    gitHead: await gitHead(runtimeRoot, spawnFn),
    modelId: localLlm?.models?.[0] ?? null,
    effectiveContextSize: localLlm?.effectiveContextSize ?? null,
    configuredContextSize: localLlm?.configuredContextSize ?? null,
    endpoint: localLlm?.endpoint ?? null,
  };
}

export async function runScenarioPty(scenario, {
  entryPath,
  timeoutMs = DEFAULT_SCENARIO_TIMEOUT_MS,
  repoRoot = REPO_ROOT,
  localLlm,
  ptySpawn,
  getMessage,
  lang = 'en',
  catalog,
} = {}) {
  const configRoot = repoRootForEntry(entryPath);
  const { workspace } = resolveScenarioWorkspace({ configRoot, scenario, localLlm });
  const expectedBinding = resolveScenarioBinding(scenario, { localLlm, configRoot });
  const startedAtMs = Date.now();
  let scrollback = '';
  const observation = {};
  const ptyChunks = [];
  let exitCode = null;
  let promptSentAtMs = null;
  const uiCatalog = catalog ?? buildUiLineCatalog(getMessage, lang);
  const effectiveTimeout = scenario.interruptTest ? THRESHOLDS_7114.interruptAtMs + 5000 : timeoutMs;
  const interruptAt = scenario.interruptTest ? THRESHOLDS_7114.interruptAtMs : null;

  const env = {
    ...process.env,
    DECKENT_INK: '1',
    DECKENT_NATIVE_AGENT: '1',
    DECKENT_LANG: lang,
    DECKENT_NATIVE_MODEL: expectedBinding.model,
    DECKENT_CONFIG_RELOAD: '1',
  };
  if (scenario.requiresLocalLlm) {
    delete env.ANTHROPIC_API_KEY;
    delete env.DECKENT_CLAUDE_API_KEY;
  }

  const pty = ptySpawn(process.execPath, [entryPath, '--native'], {
    name: 'xterm-256color', cols: 120, rows: 40, cwd: workspace, env,
  });

  let lastApprovalCount = 0;
  const timers = [];
  const schedule = (delayMs, fn) => { timers.push(setTimeout(fn, delayMs)); };

  schedule(2500, () => {
    try { if (scenario.approvalMode === 'full-auto') pty.write('/approve full-auto\r'); } catch { /* exited */ }
  });
  schedule(4000, () => {
    try {
      pty.write(`${scenario.prompt}\r`);
      promptSentAtMs = Date.now();
    } catch { /* exited */ }
  });
  schedule(8000, () => { try { pty.write('/context\r'); } catch { /* exited */ } });
  schedule(60_000, () => { try { pty.write('/context\r'); } catch { /* exited */ } });
  if (interruptAt !== null) {
    schedule(interruptAt, () => { try { pty.write('\x03'); } catch { /* exited */ } });
  }

  pty.onData((chunk) => {
    const observedAtMs = Date.now();
    const text = chunk.toString();
    ptyChunks.push({ observedAtMs, text });
    observation.ptyChunks = ptyChunks;
    scrollback += text;
    if (promptSentAtMs != null) parseScrollbackMetrics(scrollback, {
      startedAtMs, observedAtMs, observation, catalog: uiCatalog,
      promptText: scenario.prompt, promptSentAtMs,
    });
  });

  await new Promise((resolvePromise) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolvePromise(); } };

    const deadline = setTimeout(() => {
      try { pty.write('\x03'); } catch { /* exited */ }
      setTimeout(() => { try { pty.kill(); } catch { /* dead */ } finish(); }, 500);
    }, effectiveTimeout);

    const poll = setInterval(() => {
      const metrics = parseScrollbackMetrics(scrollback, {
        startedAtMs,
        observation,
        catalog: uiCatalog,
        workspaceRoot: workspace,
        scenario,
        expectedBinding,
        promptText: scenario.prompt,
        promptSentAtMs,
      });
      if (metrics.approvalCount > lastApprovalCount && scenario.approvalMode === 'suggest') {
        lastApprovalCount = metrics.approvalCount;
        try { pty.write('n'); } catch { /* exited */ }
      }
      const measurementReady = metrics.bootStatus?.measurementExactSeen === true
        || metrics.measurementAuthority === 'exact';
      const routeComplete = metrics.toolCallCount > 0 || metrics.referenceIngressExercised === true;
      if (!scenario.interruptTest && promptSentAtMs && metrics.turnCompleted && routeComplete
        && measurementReady) {
        clearTimeout(deadline);
        clearInterval(poll);
        try { pty.write('\x03'); } catch { /* exited */ }
        setTimeout(() => { try { pty.kill(); } catch { /* dead */ } finish(); }, 300);
      }
    }, 1500);

    pty.onExit(({ exitCode: code }) => {
      exitCode = code ?? 0;
      clearTimeout(deadline);
      clearInterval(poll);
      finish();
    });
  });

  timers.forEach(clearTimeout);

  const metrics = parseScrollbackMetrics(scrollback, {
    startedAtMs,
    observation,
    catalog: uiCatalog,
    workspaceRoot: workspace,
    scenario,
    expectedBinding,
    promptText: scenario.prompt,
    promptSentAtMs,
  });
  const acceptance = evaluateAcceptanceCriteria(metrics, scenario, { timeoutMs });

  // Retain exact observations for review; explicit owner cleanup is separate.
  const observationPath = join(workspace, 'pty-observations.json');
  writeFileSync(observationPath, JSON.stringify({ startedAtMs, promptSentAtMs, ptyChunks }), { mode: 0o600 });

  return {
    scenario,
    expectedBinding,
    workspace,
    metrics,
    acceptance,
    exitCode,
    firstToolLines: metrics.toolLines.slice(0, 12),
    observation,
    observationPath,
    observationSha256: sha256File(observationPath),
    firstVisibleNarrativePreview: metrics.firstVisibleNarrativeText,
    scrollbackPreview: stripAnsi(scrollback).split('\n').filter(Boolean).slice(-40).join('\n'),
  };
}

export async function runBattery(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const lang = options.lang ?? 'en';
  const entryPath = resolveEntryPath(repoRoot, options.entryPath);
  const entryExists = existsSync(entryPath);
  const getMessage = options.getMessage ?? await loadMessagesCatalog(entryPath);
  const messagesAvailable = typeof getMessage === 'function';
  const ptySpawn = options.ptySpawn ?? await loadPtySpawn(repoRoot);
  const ptyAvailable = typeof ptySpawn === 'function';
  const localLlm = options.localLlm ?? await probeLocalLlm({ entryPath, spawnFn: options.spawnFn });
  const configRoot = repoRootForEntry(entryPath);
  const binding = resolveScenarioBinding(
    { provider: 'local-llm', contextSize: localLlm?.effectiveContextSize },
    { localLlm, configRoot },
  );
  const runtime = {
    ...(await probeRuntimeMetadata({ entryPath, localLlm, spawnFn: options.spawnFn })),
    modelId: binding.model,
    effectiveContextSize: binding.contextSize ?? localLlm?.effectiveContextSize ?? null,
  };
  const catalog = messagesAvailable ? buildUiLineCatalog(getMessage, lang) : null;

  const matrix = buildScenarioMatrix({ includeInterrupt: options.includeInterrupt });
  let selected = options.scenarioId ? matrix.filter((s) => s.id === options.scenarioId) : matrix;
  if (options.localOnly) {
    selected = selected.filter((s) => s.requiresLocalLlm);
  }

  if (selected.length === 0) {
    return { ok: false, reason: 'UNKNOWN_SCENARIO', scenarios: [] };
  }

  if (!entryExists) {
    return { ok: true, skipped: true, reason: 'DIST_MISSING', entryPath, scenarios: [] };
  }
  if (!messagesAvailable) {
    return { ok: true, skipped: true, reason: 'MESSAGES_CATALOG_MISSING', entryPath, scenarios: [] };
  }
  if (options.dryRun) {
    const scenarios = selected.map((scenario) => {
      const skip = classifyScenarioSkip(scenario, { localLlm, entryExists, messagesAvailable, ptyAvailable, env: options.env });
      return { scenario, skipped: skip.skip, skipReason: skip.reason, detail: skip.detail ?? skip.provider ?? null };
    });
    return { ok: true, dryRun: true, runtime, scenarios, getMessage, lang };
  }
  if (!ptyAvailable) {
    return { ok: true, skipped: true, reason: 'PTY_MISSING', scenarios: [] };
  }

  const scenarioResults = [];
  for (const scenario of selected) {
    const skip = classifyScenarioSkip(scenario, { localLlm, entryExists, messagesAvailable, ptyAvailable, env: options.env });
    if (skip.skip) {
      scenarioResults.push({
        scenario, skipped: true, skipReason: skip.reason,
        detail: skip.detail ?? skip.provider ?? null,
        metrics: null, acceptance: { overall: 'skipped', checks: [], failedIds: [] },
      });
      continue;
    }
    const result = await runScenarioPty(scenario, {
      entryPath, timeoutMs: options.timeoutMs, repoRoot, localLlm, ptySpawn, getMessage, lang, catalog,
    });
    scenarioResults.push({ ...result, skipped: false, skipReason: null });
  }

  const payload = {
    schema: BATTERY_SCHEMA,
    generatedAt: new Date().toISOString(),
    acceptanceDoc: ACCEPTANCE_DOC,
    runtime,
    scenarios: scenarioResults,
  };

  const { jsonPath, mdPath } = writeEvidence(payload, { repoRoot });
  payload.evidence = { jsonPath, mdPath };
  writeFileSync(mdPath, `${formatBatterySummary({
    generatedAt: payload.generatedAt,
    entry: runtime.entryPath,
    scenarios: scenarioResults,
  }, getMessage, lang)}\n`);

  const runnable = scenarioResults.filter((s) => !s.skipped);
  const allSkipped = runnable.length === 0;
  const allPassed = runnable.length > 0 && runnable.every((s) => s.acceptance.overall === 'pass');

  return {
    ok: allSkipped ? true : allPassed,
    skipped: allSkipped,
    reason: allSkipped ? 'ALL_SCENARIOS_SKIPPED' : undefined,
    payload,
    jsonPath,
    mdPath,
    getMessage,
    lang,
  };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseBatteryArgv(argv);
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (args.unknown.length > 0) {
    console.error(`${USAGE}\n\nUnknown option(s): ${args.unknown.join(', ')}`);
    process.exit(2);
  }

  const result = await runBattery({
    lang: args.lang,
    scenarioId: args.scenarioId,
    entryPath: args.entryPath,
    timeoutMs: args.timeoutMs,
    includeInterrupt: args.includeInterrupt,
    localOnly: args.localOnly,
    dryRun: args.dryRun,
  });

  if (result.dryRun) {
    console.log(JSON.stringify({ runtime: result.runtime, scenarios: result.scenarios }, null, 2));
    process.exit(0);
  }

  if (result.skipped) {
    console.log(`SKIP: ${result.reason}${result.entryPath ? ` (${result.entryPath})` : ''}`);
    process.exit(0);
  }

  console.log(formatBatterySummary({
    generatedAt: result.payload.generatedAt,
    entry: result.payload.runtime.entryPath,
    scenarios: result.payload.scenarios,
  }, result.getMessage, result.lang ?? args.lang));

  if (result.ok) {
    console.log(`PASS: evidence → ${result.jsonPath}`);
    process.exit(0);
  }
  console.log(`FAIL: evidence → ${result.jsonPath}`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
