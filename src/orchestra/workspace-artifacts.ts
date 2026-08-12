// ═══ Workspace Artifact Application Service ════════════════════════════════
// One producer for CLI init, MCP init and managed-doc regeneration. Updates
// only registered managed sections and preserves user-owned content so
// re-init/migration never becomes a clobber operation.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { ProjectStack } from '../core/skill-types.js';
import { TASK_RESULT_SCHEMA_VERSION, getRequiredTaskResultFields } from '../core/task-result-schema.js';
import {
  WORKSPACE_ARTIFACT_SCHEMA_VERSION,
  ensureWorkspaceArtifactHeader,
  getWorkspaceArtifactDescriptor,
  inspectManagedContractBlock,
  parseWorkspaceArtifactHeader,
  renderManagedContractBlock,
  type ManagedContractInspection,
  type WorkspaceArtifactHeader,
  type WorkspaceArtifactId,
} from '../core/workspace-artifact-contract.js';
import { getMessage } from '../cli/helpers/messages.js';
import { COMMAND_REGISTRY } from '../core/command-registry.js';
import { TOOL_CATALOG } from '../core/mcp-tool-catalog.js';
import { updateDocSections } from './managed-docs/section-updater.js';

type WorkspaceLanguage = 'en' | 'tr';

export interface WorkspaceArtifactInitInput {
  projectRoot: string;
  projectName: string;
  language: string;
  stack?: Partial<ProjectStack>;
}

export interface WorkspaceArtifactAction {
  id: WorkspaceArtifactId;
  path: string;
  action: 'created' | 'updated' | 'unchanged';
}

export interface WorkspaceArtifactInitResult {
  schemaVersion: typeof WORKSPACE_ARTIFACT_SCHEMA_VERSION;
  actions: WorkspaceArtifactAction[];
}

export type WorkspaceArtifactAuthorityErrorCode =
  | 'E_WORKSPACE_PATH_AUTHORITY'
  | 'E_WORKSPACE_SCHEMA_AHEAD';

/**
 * A typed, fail-closed boundary error. Callers must surface the failed init;
 * an older binary never mutates a newer contract and workspace paths never
 * follow repository-controlled symlinks.
 */
export class WorkspaceArtifactAuthorityError extends Error {
  constructor(
    readonly code: WorkspaceArtifactAuthorityErrorCode,
    readonly artifactId: WorkspaceArtifactId,
    detail: string,
  ) {
    super(`${code}:${artifactId}:${detail}`);
    this.name = 'WorkspaceArtifactAuthorityError';
  }
}

function normalizedLanguage(language: string): WorkspaceLanguage {
  return language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

function contractHeader(id: WorkspaceArtifactId, provenance: string): WorkspaceArtifactHeader {
  return {
    id,
    schemaVersion: WORKSPACE_ARTIFACT_SCHEMA_VERSION,
    authority: id === 'identity' ? 'user' : id === 'stats-snapshot' ? 'snapshot' : 'managed',
    provenance,
  };
}

function assertArtifactPathAuthority(projectRoot: string, id: WorkspaceArtifactId): string {
  const descriptor = getWorkspaceArtifactDescriptor(id);
  const canonicalRoot = realpathSync.native(projectRoot);
  const absolutePath = resolve(canonicalRoot, descriptor.path);
  const fromRoot = relative(canonicalRoot, absolutePath);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || resolve(absolutePath) === resolve(canonicalRoot)) {
    throw new WorkspaceArtifactAuthorityError('E_WORKSPACE_PATH_AUTHORITY', id, 'path-escape');
  }

  const segments = fromRoot.split(sep).filter(Boolean);
  let current = canonicalRoot;
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]!);
    if (!existsSync(current)) break;
    const entry = lstatSync(current);
    if (entry.isSymbolicLink()) {
      throw new WorkspaceArtifactAuthorityError('E_WORKSPACE_PATH_AUTHORITY', id, 'symlink');
    }
    const isTarget = index === segments.length - 1;
    if ((!isTarget && !entry.isDirectory()) || (isTarget && !entry.isFile())) {
      throw new WorkspaceArtifactAuthorityError(
        'E_WORKSPACE_PATH_AUTHORITY',
        id,
        isTarget ? 'target-not-file' : 'parent-not-directory',
      );
    }
  }
  return absolutePath;
}

function assertWorkspaceCompatibility(input: WorkspaceArtifactInitInput): void {
  for (const id of ['identity', 'tools', 'boot', 'worker-guide', 'stats-snapshot'] as const) {
    const absolutePath = assertArtifactPathAuthority(input.projectRoot, id);
    const descriptor = getWorkspaceArtifactDescriptor(id);
    if (!existsSync(absolutePath) || descriptor.format !== 'markdown') continue;
    const header = parseWorkspaceArtifactHeader(readFileSync(absolutePath, 'utf8'));
    if (header && header.schemaVersion > WORKSPACE_ARTIFACT_SCHEMA_VERSION) {
      throw new WorkspaceArtifactAuthorityError(
        'E_WORKSPACE_SCHEMA_AHEAD',
        id,
        `found-${header.schemaVersion}-supported-${WORKSPACE_ARTIFACT_SCHEMA_VERSION}`,
      );
    }
  }
}

function runtimeForLanguage(language: string, lang: WorkspaceLanguage): string {
  const value = language.toLowerCase();
  if (value.includes('typescript') || value.includes('javascript')) return 'Node.js';
  if (value.includes('python')) return 'Python';
  if (value.includes('rust')) return 'Rust';
  if (value.includes('go')) return 'Go';
  if (value.includes('java')) return 'Java';
  if (value.includes('c#') || value.includes('csharp')) return '.NET';
  return language === 'unknown' ? getMessage('workspace.common.not_detected', lang) : language;
}

function readableStackValue(value: string | undefined, lang: WorkspaceLanguage): string {
  return value && value !== 'unknown' && value !== 'none'
    ? value
    : getMessage('workspace.common.not_detected', lang);
}

export function renderIdentityDocument(input: WorkspaceArtifactInitInput): string {
  const lang = normalizedLanguage(input.language);
  const stackLanguage = readableStackValue(input.stack?.language, lang);
  const body = getMessage('workspace.identity.template', lang, {
    projectName: input.projectName,
    language: stackLanguage,
    framework: readableStackValue(input.stack?.framework, lang),
    testFramework: readableStackValue(input.stack?.testFramework, lang),
    buildTool: readableStackValue(input.stack?.buildTool, lang),
    runtime: runtimeForLanguage(stackLanguage, lang),
  });
  return `${ensureWorkspaceArtifactHeader(body, contractHeader('identity', 'stack-detector'))}\n`;
}

function readPackageScripts(projectRoot: string): Array<[string, string]> {
  try {
    const parsed = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, unknown>;
    };
    return Object.entries(parsed.scripts ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .sort(([left], [right]) => left.localeCompare(right));
  } catch {
    return [];
  }
}

export function renderEnvironmentToolsSection(projectRoot: string, language: string): string {
  const lang = normalizedLanguage(language);
  const scripts = readPackageScripts(projectRoot);
  if (scripts.length === 0) return getMessage('workspace.tools.no_package', lang);
  return [
    getMessage('workspace.tools.package_intro', lang),
    '',
    `| ${getMessage('workspace.tools.header.script', lang)} | ${getMessage('workspace.tools.header.command', lang)} |`,
    '|---|---|',
    ...scripts.map(([name, command]) => `| \`${name}\` | \`${command.replace(/\|/g, '\\|')}\` |`),
  ].join('\n');
}

function effectLabel(effect: 'read-only' | 'mutating' | 'destructive', lang: WorkspaceLanguage): string {
  return getMessage(`workspace.tools.effect.${effect.replace('-', '_')}`, lang);
}

export function renderMcpToolsSection(language: string): string {
  const lang = normalizedLanguage(language);
  const body = [
    getMessage('workspace.tools.mcp_intro', lang),
    '',
    `| ${getMessage('workspace.tools.header.mcp_name', lang)} | ${getMessage('workspace.tools.header.effect', lang)} | ${getMessage('workspace.tools.header.approval', lang)} | ${getMessage('workspace.tools.header.idempotent', lang)} |`,
    '|---|---|---|---|',
    ...TOOL_CATALOG.map((tool) => {
      const approval = tool.sideEffect === 'read-only'
        ? getMessage('workspace.tools.approval.not_required', lang)
        : getMessage('workspace.tools.approval.required', lang);
      const idempotent = getMessage(tool.annotations.idempotentHint ? 'workspace.common.yes' : 'workspace.common.no', lang);
      return `| \`${tool.name}\` | ${effectLabel(tool.sideEffect, lang)} | ${approval} | ${idempotent} |`;
    }),
    '',
    getMessage('workspace.tools.total', lang, { count: String(TOOL_CATALOG.length) }),
  ].join('\n');
  return renderManagedContractBlock('tools', body);
}

function commandRiskLabel(risk: string, lang: WorkspaceLanguage): string {
  const key = risk === 'Oku' ? 'oku' : risk === 'Değiştir' ? 'degistir' : risk === 'Çalıştır' ? 'calistir' : 'otonom';
  return getMessage(`cmdCatalog.risk.${key}`, lang);
}

export function renderCliCommandsSection(language: string): string {
  const lang = normalizedLanguage(language);
  const commands = COMMAND_REGISTRY
    .filter((entry) => entry.surfaces.includes('cli'))
    .sort((left, right) => left.name.localeCompare(right.name));
  const body = [
    getMessage('workspace.tools.cli_intro', lang),
    '',
    `| ${getMessage('workspace.tools.header.command', lang)} | ${getMessage('workspace.tools.header.category', lang)} | ${getMessage('workspace.tools.header.risk', lang)} | ${getMessage('workspace.tools.header.surfaces', lang)} |`,
    '|---|---|---|---|',
    ...commands.map((entry) => `| \`deckent ${entry.name}\` | ${entry.category} | ${commandRiskLabel(entry.risk, lang)} | ${entry.surfaces.join(', ')} |`),
    '',
    getMessage('workspace.tools.total', lang, { count: String(commands.length) }),
  ].join('\n');
  return renderManagedContractBlock('tools', body);
}

export function renderBootSequenceSection(language: string): string {
  const lang = normalizedLanguage(language);
  return renderManagedContractBlock('boot', getMessage('workspace.boot.sequence', lang));
}

export function renderManualRecoverySection(language: string): string {
  const lang = normalizedLanguage(language);
  return renderManagedContractBlock('boot', getMessage('workspace.boot.recovery', lang));
}

export function renderWorkerContractSection(language: string): string {
  const lang = normalizedLanguage(language);
  const body = getMessage('workspace.worker.contract', lang, {
    schemaVersion: TASK_RESULT_SCHEMA_VERSION,
    requiredFields: getRequiredTaskResultFields().join(', '),
    done: getMessage('workspace.worker.dod.done', lang),
    techDebt: getMessage('workspace.worker.dod.tech_debt', lang),
    noGo: getMessage('workspace.worker.dod.no_go', lang),
  });
  return renderManagedContractBlock('worker-guide', body);
}

export function inspectWorkerGuideContract(projectRoot: string): ManagedContractInspection {
  const path = join(projectRoot, getWorkspaceArtifactDescriptor('worker-guide').path);
  if (!existsSync(path)) return { state: 'HOLD', reason: 'missing' };
  try {
    return inspectManagedContractBlock(readFileSync(path, 'utf8'), 'worker-guide');
  } catch {
    return { state: 'HOLD', reason: 'missing' };
  }
}

function writeIfChanged(
  projectRoot: string,
  id: WorkspaceArtifactId,
  content: string,
): WorkspaceArtifactAction {
  const descriptor = getWorkspaceArtifactDescriptor(id);
  const absolutePath = join(projectRoot, descriptor.path);
  const before = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : null;
  if (before === content) return { id, path: descriptor.path, action: 'unchanged' };
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, 'utf8');
  return { id, path: descriptor.path, action: before === null ? 'created' : 'updated' };
}

function updateManagedMarkdown(
  input: WorkspaceArtifactInitInput,
  id: 'tools' | 'boot' | 'worker-guide',
  title: string,
  sections: Map<string, string>,
): WorkspaceArtifactAction {
  const descriptor = getWorkspaceArtifactDescriptor(id);
  const absolutePath = join(input.projectRoot, descriptor.path);
  let content = existsSync(absolutePath)
    ? readFileSync(absolutePath, 'utf8')
    : id === 'tools'
      ? `# ${getMessage('workspace.title.environment_tools', normalizedLanguage(input.language))}\n${renderEnvironmentToolsSection(input.projectRoot, input.language)}\n`
      : id === 'boot'
        ? `# ${getMessage('workspace.title.boot', normalizedLanguage(input.language))}\n\n## Boot Sequence\n`
        : `# ${title}\n`;

  // One-time, exact legacy migration: the old fallback link is known to be
  // dangling and the entire Anti-Patterns section was Deckent-generated. User
  // sections outside it are preserved byte-for-byte.
  if (id === 'worker-guide') {
    content = content.replace(
      /> \*\*Canonical location moved\.\*\*[\s\S]*?> canonical worker guide — do not follow a dangling pointer\.\n\n/,
      '',
    );
    content = content.replace(/^## Anti-Patterns$/m, '## Worker Contract');
  }
  if (id === 'boot') {
    content = content.replace(/^# Boot Sequence$/m, '# Boot\n\n## Boot Sequence');
  }

  content = updateDocSections(content, {
    id: `${id}-md`,
    path: descriptor.path,
    autoSections: [...sections.keys()],
    protectedSections: [...descriptor.protectedSections],
  }, sections);
  content = ensureWorkspaceArtifactHeader(content, contractHeader(id, 'workspace-artifact-registry'));
  if (!content.endsWith('\n')) content += '\n';
  return writeIfChanged(input.projectRoot, id, content);
}

function statsSnapshotContent(language: string): string {
  const lang = normalizedLanguage(language);
  return `${JSON.stringify({
    $schemaVersion: WORKSPACE_ARTIFACT_SCHEMA_VERSION,
    $comment: getMessage('workspace.stats.comment', lang),
    sprint: null,
    coverage: null,
    refreshedAt: null,
  }, null, 2)}\n`;
}

export function initializeWorkspaceArtifacts(input: WorkspaceArtifactInitInput): WorkspaceArtifactInitResult {
  // Validate every registered target before the first write. This makes the
  // application service atomic with respect to path/schema authority failures.
  assertWorkspaceCompatibility(input);
  const lang = normalizedLanguage(input.language);
  const identityDescriptor = getWorkspaceArtifactDescriptor('identity');
  const identityPath = join(input.projectRoot, identityDescriptor.path);
  const actions: WorkspaceArtifactAction[] = [];

  if (existsSync(identityPath)) {
    let identity = readFileSync(identityPath, 'utf8');
    const existingHeader = parseWorkspaceArtifactHeader(identity);
    if (
      existingHeader?.id !== 'identity'
      || existingHeader.schemaVersion !== WORKSPACE_ARTIFACT_SCHEMA_VERSION
      || existingHeader.authority !== 'user'
    ) {
      identity = ensureWorkspaceArtifactHeader(identity, contractHeader('identity', 'user-authored-or-migrated'));
    }
    if (!identity.endsWith('\n')) identity += '\n';
    actions.push(writeIfChanged(input.projectRoot, 'identity', identity));
  } else {
    actions.push(writeIfChanged(input.projectRoot, 'identity', renderIdentityDocument(input)));
  }

  actions.push(updateManagedMarkdown(input, 'tools', 'Environment Tools', new Map([
    ['MCP Tools', renderMcpToolsSection(lang)],
    ['CLI Commands', renderCliCommandsSection(lang)],
  ])));

  actions.push(updateManagedMarkdown(input, 'boot', 'Boot Sequence', new Map([
    ['Boot Sequence', renderBootSequenceSection(lang)],
    ['Manual Recovery Chain', renderManualRecoverySection(lang)],
  ])));
  actions.push(updateManagedMarkdown(
    input,
    'worker-guide',
    getMessage('workspace.title.worker_guide', lang),
    new Map([
    ['Worker Contract', renderWorkerContractSection(lang)],
    ]),
  ));

  const snapshotPath = join(input.projectRoot, getWorkspaceArtifactDescriptor('stats-snapshot').path);
  actions.push(existsSync(snapshotPath)
    ? { id: 'stats-snapshot', path: getWorkspaceArtifactDescriptor('stats-snapshot').path, action: 'unchanged' }
    : writeIfChanged(input.projectRoot, 'stats-snapshot', statsSnapshotContent(input.language)));

  return { schemaVersion: WORKSPACE_ARTIFACT_SCHEMA_VERSION, actions };
}
