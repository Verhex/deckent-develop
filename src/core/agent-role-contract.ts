/**
 * Persona output-role contract shared by routing, prompt gates and FIX
 * projection. Kept dependency-free so lifecycle code can classify a persona
 * without loading the filesystem-backed agent pool and model registry.
 */
export type AgentRole = 'implementer' | 'reviewer' | 'analyst';

export const BUILTIN_AGENT_ROLES: Readonly<Record<string, AgentRole>> = Object.freeze({
  architect: 'implementer',
  'architecture-planner': 'analyst',
  'bug-fixer': 'implementer',
  'code-reviewer': 'reviewer',
  refactorer: 'implementer',
  'api-builder': 'implementer',
  'frontend-designer': 'implementer',
  'accessibility-auditor': 'reviewer',
  'doc-writer': 'implementer',
  'ci-guardian': 'implementer',
  'security-auditor': 'reviewer',
  'performance-analyzer': 'analyst',
  'data-engineer': 'implementer',
  'devops-engineer': 'implementer',
  'migration-specialist': 'implementer',
});

/** Unknown/custom personas retain the existing implementation-safe default. */
export function getAgentRole(
  agent: Readonly<{ id: string; role?: AgentRole }>,
): AgentRole {
  return agent.role ?? BUILTIN_AGENT_ROLES[agent.id] ?? 'implementer';
}
