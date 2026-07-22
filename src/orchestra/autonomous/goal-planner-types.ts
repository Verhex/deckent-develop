import { z } from 'zod';

/** Repo-relative dir, no absolute, no parent traversal. */
const ScopeDir = z.string().min(1).refine(
  (s) => !s.startsWith('/') && !s.split('/').includes('..'),
  { message: 'scopeDir must be repo-relative (no absolute path, no "..")' },
);

const Trigger = z.union([
  z.literal('one-off'),
  z.object({ recurring: z.string().min(1) }).strict(),
  z.object({ reactive: z.string().min(1) }).strict(),
]);

/** A lightweight planned work item (Phase 1 output). Detail is generated JIT. */
export const PlannedItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(['task', 'sprint', 'capability', 'process']),
  scopeDir: ScopeDir,
  summary: z.string().min(1),
  policy: z.enum(['auto', 'approval-required', 'risk-tagged']),
  trigger: Trigger,
  fanOut: z.object({ over: z.string().min(1), concurrency: z.number().int().min(1) }).optional(),
  capabilityTarget: z.object({
    capability: z.string().min(1),
    connector: z.string().optional(),
    args: z.record(z.unknown()).optional(),
  }).optional(),
}).strict();

export type PlannedItem = z.infer<typeof PlannedItemSchema>;
export type PlannedItemKind = PlannedItem['kind'];

/** Injectable LLM completion: prompt in, raw model text out. Mocked in tests;
 *  wired to the provider spawn in the CLI. */
export type LlmComplete = (prompt: string) => Promise<string>;
