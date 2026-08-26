const artifacts = Object.freeze(['types', 'metadata', 'docs-en', 'docs-tr', 'equality']);

const primitive = (name) => ({ kind: 'primitive', name });
const literal = (value) => ({ kind: 'literal', value });
const enumType = (...values) => ({ kind: 'enum', values });
const externalRef = (name) => ({ kind: 'externalRef', name });
const ref = (name) => ({ kind: 'ref', name });
const union = (...variants) => ({ kind: 'union', variants });
const object = (fields) => ({ kind: 'object', closed: true, fields });

const providerName = enumType('claude', 'codex', 'gemini', 'cursor', 'ollama', 'openrouter', 'local-llm');
const planMode = enumType('performance', 'balanced', 'economic', 'api', 'max_plan', 'max5x_plan', 'pro_plan');

function field({
  id,
  path,
  categoryKey,
  authoredType,
  authoredPresence = 'optional',
  resolvedType = authoredType,
  resolvedPresence = authoredPresence,
  legacyTs,
  defaultRule = { kind: 'NO_DEFAULT' },
  lifecycle = 'ACTIVE',
  impact = 'next-run',
  sensitivity = 'PUBLIC',
  titleKey,
  descriptionKey,
  key,
  evidence = 'STATIC_TRANSITION_PIN',
}) {
  return {
    id,
    path,
    categoryKey,
    authored: { type: authoredType, presence: authoredPresence, legacyTs },
    resolved: { type: resolvedType, presence: resolvedPresence },
    default: defaultRule,
    lifecycle,
    impact,
    sensitivity,
    messages: { titleKey, descriptionKey },
    key,
    evidence: { disposition: evidence },
    artifacts,
  };
}

export const registry = Object.freeze({
  schemaVersion: 1,
  registryId: 'deckent.config.prototype',
  containers: [
    { path: 'bot_agent', authoredPresence: 'optional', resolvedPresence: 'optional' },
    { path: 'execution_budget', authoredPresence: 'optional', resolvedPresence: 'optional' },
    { path: 'identity', authoredPresence: 'optional', resolvedPresence: 'optional' },
    { path: 'modes', authoredPresence: 'required', resolvedPresence: 'required' },
    { path: 'prompt', authoredPresence: 'optional', resolvedPresence: 'required' },
    { path: 'routing_v3', authoredPresence: 'optional', resolvedPresence: 'required' },
    { path: 'routing_v3.weights', authoredPresence: 'optional', resolvedPresence: 'required' },
    { path: 'timeout', authoredPresence: 'optional', resolvedPresence: 'required' },
  ],
  externalTypes: {
    ExecutionBudget: { importFrom: '../../../src/core/work-model.js' },
    ModelType: { importFrom: '../../../src/core/task-types.js' },
    NotificationConfig: { importFrom: '../../../src/core/notifications.js' },
    TaskKind: { importFrom: '../../../src/core/work-model.js' },
  },
  types: {
    ExecutionBudgetRolePolicy: object([
      { name: 'default', presence: 'optional', type: externalRef('ExecutionBudget') },
      {
        name: 'by_task_kind',
        presence: 'optional',
        type: {
          kind: 'record',
          key: { kind: 'finite', memberPresence: 'optional', tsType: 'TaskKind', values: ['audit', 'code-development', 'config', 'data', 'design', 'devops', 'documentation', 'generic', 'refactor', 'security', 'test'] },
          value: externalRef('ExecutionBudget'),
        },
      },
    ]),
    IdentityProvider: {
      kind: 'discriminatedUnion',
      discriminator: 'kind',
      variants: [
        { tag: 'local', type: object([{ name: 'kind', presence: 'required', type: literal('local') }]) },
        {
          tag: 'scim',
          type: object([
            { name: 'kind', presence: 'required', type: literal('scim') },
            {
              name: 'scim',
              presence: 'required',
              type: object([
                { name: 'baseUrl', presence: 'required', type: primitive('string') },
                { name: 'token', presence: 'required', type: primitive('string') },
                { name: 'userFilter', presence: 'optional', type: primitive('string') },
              ]),
            },
          ]),
        },
        {
          tag: 'oidc-claims',
          type: object([
            { name: 'kind', presence: 'required', type: literal('oidc-claims') },
            {
              name: 'oidc',
              presence: 'required',
              type: object([
                { name: 'issuer', presence: 'required', type: primitive('string') },
                { name: 'audience', presence: 'optional', type: primitive('string') },
                { name: 'groupsClaim', presence: 'optional', type: primitive('string') },
                { name: 'roleClaim', presence: 'optional', type: primitive('string') },
              ]),
            },
          ]),
        },
      ],
    },
  },
  descriptors: [
    field({
      id: 'config.mode', path: 'mode', categoryKey: 'config.category.core', authoredType: planMode,
      authoredPresence: 'required', resolvedPresence: 'required', legacyTs: 'PlanMode',
      defaultRule: { kind: 'EFFECTIVE_DEFAULT', value: 'performance', provenance: 'CFG-011_OWNER_PROPOSAL' },
      impact: 'next-run', titleKey: 'config.field.mode.title', descriptionKey: 'config.field.mode.description',
    }),
    field({
      id: 'config.language', path: 'language', categoryKey: 'config.category.core', authoredType: primitive('string'),
      resolvedPresence: 'required', legacyTs: 'string', defaultRule: { kind: 'EFFECTIVE_DEFAULT', value: 'en', provenance: 'DEFAULT_LANGUAGE' },
      impact: 'next-run', titleKey: 'config.field.language.title', descriptionKey: 'config.field.language.description',
    }),
    field({
      id: 'config.output.splash', path: 'output_splash', categoryKey: 'config.category.output', authoredType: primitive('boolean'),
      resolvedPresence: 'required', legacyTs: 'boolean', defaultRule: { kind: 'EFFECTIVE_DEFAULT', value: true, provenance: 'createDefaultConfig' },
      impact: 'hot-reload', titleKey: 'config.field.output_splash.title', descriptionKey: 'config.field.output_splash.description',
    }),
    field({
      id: 'config.memory.legacy_budget', path: 'memory_budget', categoryKey: 'config.category.memory', authoredType: primitive('integer'),
      resolvedPresence: 'required', legacyTs: 'number', defaultRule: { kind: 'EFFECTIVE_DEFAULT', value: 5000, provenance: 'CFG-011_OWNER_PROPOSAL' },
      lifecycle: 'DEPRECATED', impact: 'next-run', titleKey: 'config.field.memory_budget.title', descriptionKey: 'config.field.memory_budget.description',
    }),
    field({
      id: 'config.memory.legacy_decay', path: 'decay_after_sprints', categoryKey: 'config.category.memory', authoredType: primitive('integer'),
      resolvedPresence: 'required', legacyTs: 'number', defaultRule: { kind: 'EFFECTIVE_DEFAULT', value: 20, provenance: 'CFG-011_OWNER_PROPOSAL' },
      lifecycle: 'DEPRECATED', impact: 'next-run', titleKey: 'config.field.decay_after_sprints.title', descriptionKey: 'config.field.decay_after_sprints.description',
    }),
    field({
      id: 'config.execution.spawn_backend', path: 'spawn_backend', categoryKey: 'config.category.execution',
      authoredType: enumType('docker', 'tmux', 'subprocess', 'auto'), resolvedType: enumType('docker', 'tmux', 'subprocess'),
      resolvedPresence: 'required', legacyTs: "'docker' | 'tmux' | 'subprocess' | 'auto'",
      defaultRule: { kind: 'PLATFORM_RESOLVED', strategy: 'resolveSpawnBackendWithCapabilityEvidence', provenance: 'CFG-011_OWNER_PROPOSAL' },
      impact: 'next-run', titleKey: 'config.field.spawn_backend.title', descriptionKey: 'config.field.spawn_backend.description',
    }),
    field({
      id: 'config.execution.docker_timeout', path: 'docker_timeout', categoryKey: 'config.category.execution', authoredType: primitive('integer'),
      resolvedPresence: 'required', legacyTs: 'number', defaultRule: { kind: 'EFFECTIVE_DEFAULT', value: 1200, provenance: 'CFG-011_OWNER_PROPOSAL' },
      impact: 'next-run', titleKey: 'config.field.docker_timeout.title', descriptionKey: 'config.field.docker_timeout.description',
    }),
    field({
      id: 'config.execution.dependency_pipeline', path: 'dependency_pipeline_enabled', categoryKey: 'config.category.execution', authoredType: primitive('boolean'),
      resolvedPresence: 'required', legacyTs: 'boolean', defaultRule: { kind: 'EFFECTIVE_DEFAULT', value: true, provenance: 'ADR-045' },
      impact: 'next-run', titleKey: 'config.field.dependency_pipeline.title', descriptionKey: 'config.field.dependency_pipeline.description',
    }),
    field({
      id: 'config.prompt.adr_render', path: 'prompt.adr_render', categoryKey: 'config.category.prompt', authoredType: enumType('full', 'operative'),
      resolvedPresence: 'required', legacyTs: "'full' | 'operative'", defaultRule: { kind: 'EFFECTIVE_DEFAULT', value: 'full', provenance: 'DEFAULT_PROMPT_CONFIG' },
      impact: 'next-run', titleKey: 'config.field.prompt_adr_render.title', descriptionKey: 'config.field.prompt_adr_render.description',
      evidence: 'HOLD_OWNER_ADR_SEMANTICS',
    }),
    field({
      id: 'config.prompt.adr_min_relevance', path: 'prompt.adr_min_relevance', categoryKey: 'config.category.prompt', authoredType: primitive('number'),
      resolvedPresence: 'required', legacyTs: 'number', defaultRule: { kind: 'EFFECTIVE_DEFAULT', value: 0.3, provenance: 'DEFAULT_PROMPT_CONFIG' },
      impact: 'next-run', titleKey: 'config.field.prompt_adr_min_relevance.title', descriptionKey: 'config.field.prompt_adr_min_relevance.description',
    }),
    field({
      id: 'config.timeout.model_multiplier', path: 'timeout.model_multiplier.*', categoryKey: 'config.category.execution', authoredType: primitive('number'),
      authoredPresence: 'optional', resolvedPresence: 'optional', legacyTs: 'number', defaultRule: { kind: 'NO_DEFAULT' },
      key: { kind: 'finite', memberPresence: 'optional', tsType: 'ModelTier', values: ['economy', 'standard', 'premium', 'premium_plus'] },
      impact: 'next-run', titleKey: 'config.field.timeout_model_multiplier.title', descriptionKey: 'config.field.timeout_model_multiplier.description',
    }),
    field({
      id: 'config.api_keys.dynamic', path: 'api_keys.*', categoryKey: 'config.category.provider', authoredType: primitive('string'),
      authoredPresence: 'optional', resolvedPresence: 'optional', legacyTs: 'string', defaultRule: { kind: 'NO_DEFAULT' },
      key: { kind: 'dynamic', tsType: 'string', pattern: '^[A-Z][A-Z0-9_]{0,127}$', maxLength: 128 },
      lifecycle: 'DEPRECATED', sensitivity: 'SECRET_MATERIAL_FORBIDDEN', impact: 'restart',
      titleKey: 'config.field.api_keys.title', descriptionKey: 'config.field.api_keys.description',
    }),
    field({
      id: 'config.provider_overrides.dynamic', path: 'provider_overrides.*', categoryKey: 'config.category.provider', authoredType: providerName,
      authoredPresence: 'optional', resolvedPresence: 'optional', legacyTs: 'ProviderName', defaultRule: { kind: 'NO_DEFAULT' },
      key: { kind: 'dynamic', tsType: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$', maxLength: 64 },
      impact: 'next-run', titleKey: 'config.field.provider_overrides.title', descriptionKey: 'config.field.provider_overrides.description',
    }),
    field({
      id: 'config.modes.brain_model', path: 'modes.*.brain_model', categoryKey: 'config.category.core', authoredType: externalRef('ModelType'),
      authoredPresence: 'required_when_parent_present', resolvedPresence: 'required_when_parent_present', legacyTs: 'ModelType', defaultRule: { kind: 'NO_DEFAULT' },
      key: { kind: 'dynamic', tsType: 'string', pattern: '^[a-z][a-z0-9_-]{0,63}$', maxLength: 64 },
      impact: 'next-run', titleKey: 'config.field.mode_brain_model.title', descriptionKey: 'config.field.mode_brain_model.description',
    }),
    field({
      id: 'config.modes.max_workers', path: 'modes.*.max_workers', categoryKey: 'config.category.core', authoredType: union(primitive('number'), literal('auto')),
      authoredPresence: 'required_when_parent_present', resolvedPresence: 'required_when_parent_present', legacyTs: "number | 'auto'", defaultRule: { kind: 'NO_DEFAULT' },
      key: { kind: 'dynamic', tsType: 'string', pattern: '^[a-z][a-z0-9_-]{0,63}$', maxLength: 64 },
      impact: 'next-run', titleKey: 'config.field.mode_max_workers.title', descriptionKey: 'config.field.mode_max_workers.description',
    }),
    field({
      id: 'config.bot_agent.providers', path: 'bot_agent.providers', categoryKey: 'config.category.provider',
      authoredType: { kind: 'array', element: enumType('ollama', 'claude', 'openai'), maxItems: 3 },
      authoredPresence: 'optional', resolvedPresence: 'optional', legacyTs: "Array<'ollama' | 'claude' | 'openai'>",
      defaultRule: { kind: 'STARTER_VALUE', value: ['ollama', 'claude', 'openai'], profile: 'bot-agent' },
      impact: 'next-run', titleKey: 'config.field.bot_agent_providers.title', descriptionKey: 'config.field.bot_agent_providers.description',
    }),
    field({
      id: 'config.identity.provider', path: 'identity.provider', categoryKey: 'config.category.identity', authoredType: ref('IdentityProvider'),
      resolvedType: ref('IdentityProvider'), authoredPresence: 'optional', resolvedPresence: 'optional', legacyTs: 'IdentityProviderConfig',
      defaultRule: { kind: 'NO_DEFAULT' }, sensitivity: 'CONFIDENTIAL', impact: 'restart',
      titleKey: 'config.field.identity_provider.title', descriptionKey: 'config.field.identity_provider.description',
    }),
    field({
      id: 'config.notifications', path: 'notifications', categoryKey: 'config.category.notifications', authoredType: externalRef('NotificationConfig'),
      resolvedType: externalRef('NotificationConfig'), authoredPresence: 'optional', resolvedPresence: 'optional', legacyTs: 'NotificationConfig',
      defaultRule: { kind: 'NO_DEFAULT' }, lifecycle: 'OPT_IN', impact: 'hot-reload',
      titleKey: 'config.field.notifications.title', descriptionKey: 'config.field.notifications.description',
    }),
    field({
      id: 'config.routing_v3.weights.content', path: 'routing_v3.weights.content', categoryKey: 'config.category.routing', authoredType: primitive('number'),
      authoredPresence: 'required_when_parent_present', resolvedPresence: 'required_when_parent_present', legacyTs: 'number', defaultRule: { kind: 'EFFECTIVE_DEFAULT', value: 0.5, provenance: 'DEFAULT_ROUTING_V3_CONFIG' },
      impact: 'next-run', titleKey: 'config.field.routing_content_weight.title', descriptionKey: 'config.field.routing_content_weight.description',
    }),
    field({
      id: 'config.execution_budget.roles', path: 'execution_budget.roles.*', categoryKey: 'config.category.budget', authoredType: ref('ExecutionBudgetRolePolicy'),
      resolvedType: ref('ExecutionBudgetRolePolicy'), authoredPresence: 'optional', resolvedPresence: 'optional',
      legacyTs: 'ExecutionBudgetRolePolicyConfig', defaultRule: { kind: 'POLICY_INHERITED', strategy: 'resolveExecutionBudgetRolePolicy' },
      key: { kind: 'finite', memberPresence: 'optional', tsType: 'ExecutionBudgetRole', values: ['brain', 'worker', 'auditor'] },
      sensitivity: 'CONFIDENTIAL', impact: 'next-run', titleKey: 'config.field.execution_roles.title', descriptionKey: 'config.field.execution_roles.description',
    }),
  ],
});
