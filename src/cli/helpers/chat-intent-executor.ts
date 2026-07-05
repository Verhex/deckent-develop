// src/cli/helpers/chat-intent-executor.ts
// ═══ ONB-CHAT-DILIM-4 — dispatch-descriptor executor engine ════════════════
//
// Runs the not-yet-run `OnboardingChatDispatchDescriptor` values that
// onboarding-chat-flow.ts (ONB-CHAT-DILIM-3, task 370-005) resolves but never
// invokes. This module is the explicit "later slice" that module promised —
// a pure engine with no TTY, no process spawning, and no knowledge of what
// any given command name actually does. Both side-effecting behaviors
// (asking for approval, running the command) are injected by the caller;
// the terminal/REPL wiring that supplies real implementations for them is a
// separate, later slice (ONB-CHAT-DILIM-5+).
//
// String-free by design (i18n-FIRST, CLAUDE.md): this module carries no
// user-facing literal text — callers own all copy via getMessage().

import type { OnboardingChatDispatchDescriptor } from './onboarding-chat-flow.js';

/** Invokes the resolved command. May resolve synchronously or asynchronously; may reject/throw. */
export type IntentExecutorRunner = (
  command: string,
  args: readonly string[],
) => unknown | Promise<unknown>;

/** Asks for approval before a confirm-requiring descriptor runs. May resolve synchronously or asynchronously. */
export type IntentExecutorConfirm = (
  descriptor: OnboardingChatDispatchDescriptor,
) => boolean | Promise<boolean>;

export interface IntentExecutorDeps {
  readonly runner: IntentExecutorRunner;
  /** Optional — absent is treated as "no approval mechanism available", never as implicit approval. */
  readonly confirm?: IntentExecutorConfirm;
}

/** The descriptor ran to completion via `runner`. */
export interface IntentExecutionRan {
  readonly status: 'ran';
  readonly command: string;
  readonly args: readonly string[];
  readonly value: unknown;
}

/** `requiresConfirm` was true and approval did not happen (declined, or no `confirm` was supplied) — `runner` was never called. */
export interface IntentExecutionCancelled {
  readonly status: 'cancelled';
  readonly command: string;
  readonly args: readonly string[];
}

/** `runner` was invoked but threw or rejected. */
export interface IntentExecutionRefused {
  readonly status: 'refused';
  readonly command: string;
  readonly args: readonly string[];
  readonly error: unknown;
}

export type IntentExecutionResult =
  | IntentExecutionRan
  | IntentExecutionCancelled
  | IntentExecutionRefused;

/**
 * Executes a resolved `OnboardingChatDispatchDescriptor`.
 *
 * If `descriptor.requiresConfirm` is true, `deps.confirm` is awaited first —
 * an absent `confirm` or a falsy resolution both produce an honest
 * `'cancelled'` result and `deps.runner` is never called. Otherwise (or once
 * approved), `deps.runner(command, args)` is awaited inside a try/catch: a
 * successful resolution produces `'ran'`, a throw/rejection produces
 * `'refused'` with the error captured.
 */
export async function executeIntentDescriptor(
  descriptor: OnboardingChatDispatchDescriptor,
  deps: IntentExecutorDeps,
): Promise<IntentExecutionResult> {
  const { command, args } = descriptor;

  if (descriptor.requiresConfirm) {
    const approved = deps.confirm ? await deps.confirm(descriptor) : false;
    if (!approved) {
      return { status: 'cancelled', command, args };
    }
  }

  try {
    const value = await deps.runner(command, args);
    return { status: 'ran', command, args, value };
  } catch (error: unknown) {
    return { status: 'refused', command, args, error };
  }
}
