// ─── Tool Hook Seam ─────────────────────────────────────────────────────────
// Sprint 359 Task 15 (Sıra-84) — pre/post_tool + transform hook seam.
// Hermes 24-hook role-model, slice 1: pure core only. Deliberately does NOT
// wire into tool-dispatch — that is an explicit follow-up task (nogo here).
//
// ToolHookRegistry is instance-based (constructed by the caller), not a
// module-level singleton — a future tool-dispatch integration owns its own
// instance rather than sharing hidden global state.

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToolHookPhase = 'pre' | 'post';

export interface PreToolHookContext {
  readonly toolId: string;
  readonly args: unknown;
}

/**
 * `veto: true` forces `reason` at the type level (dispatch rejection must be
 * justified). Otherwise `args` transforms the value seen by the next pre-hook
 * and, eventually, dispatch; omitting `args` means observe-only passthrough —
 * there is no separate sentinel, so a hook cannot transform args to exactly
 * `undefined`.
 */
export type PreToolHookResult =
  | { readonly veto: true; readonly reason: string }
  | { readonly veto?: false; readonly args?: unknown };

export interface PreToolHook {
  readonly name: string;
  readonly phase: 'pre';
  match(toolId: string): boolean;
  run(ctx: PreToolHookContext): PreToolHookResult | void | Promise<PreToolHookResult | void>;
}

export interface PostToolHookContext {
  readonly toolId: string;
  readonly args: unknown;
  readonly result: unknown;
}

/** Omitting `result` means observe-only passthrough (same omit-to-passthrough rule as pre). */
export interface PostToolHookResult {
  readonly result?: unknown;
}

export interface PostToolHook {
  readonly name: string;
  readonly phase: 'post';
  match(toolId: string): boolean;
  run(ctx: PostToolHookContext): PostToolHookResult | void | Promise<PostToolHookResult | void>;
}

export type ToolHook = PreToolHook | PostToolHook;

/** A hook that threw during `match()` or `run()`. Isolated — never stops the pipeline. */
export interface ToolHookError {
  readonly hookName: string;
  readonly phase: ToolHookPhase;
  readonly toolId: string;
  readonly error: unknown;
}

export interface PreDispatchOutcome {
  readonly args: unknown;
  readonly vetoed: boolean;
  readonly vetoReason?: string;
  readonly vetoedBy?: string;
  readonly errors: readonly ToolHookError[];
}

export interface PostDispatchOutcome {
  readonly result: unknown;
  readonly errors: readonly ToolHookError[];
}

// ─── Registry ───────────────────────────────────────────────────────────────

export class ToolHookRegistry {
  private readonly hooks: ToolHook[] = [];

  /** Registration order is execution order — deterministic, no priority/sort. */
  register(hook: ToolHook): void {
    this.hooks.push(hook);
  }

  /**
   * Run all matching pre-hooks in registration order. Each hook may transform
   * `args` for the next hook, or veto (short-circuits — remaining pre-hooks do
   * not run since dispatch will be rejected anyway). A throwing hook is
   * isolated into `errors` and treated as a no-op for that hook.
   */
  async runPre(toolId: string, args: unknown): Promise<PreDispatchOutcome> {
    let currentArgs = args;
    const errors: ToolHookError[] = [];

    for (const hook of this.hooks) {
      if (hook.phase !== 'pre') continue;
      if (!this.safeMatch(hook, toolId, errors)) continue;

      try {
        const outcome = await hook.run({ toolId, args: currentArgs });
        if (!outcome) continue;
        if (outcome.veto) {
          return {
            args: currentArgs,
            vetoed: true,
            vetoReason: outcome.reason,
            vetoedBy: hook.name,
            errors,
          };
        }
        if (outcome.args !== undefined) {
          currentArgs = outcome.args;
        }
      } catch (error) {
        errors.push({ hookName: hook.name, phase: 'pre', toolId, error });
      }
    }

    return { args: currentArgs, vetoed: false, errors };
  }

  /**
   * Run all matching post-hooks in registration order. Each hook may
   * transform `result` for the next hook, or observe only. A throwing hook is
   * isolated into `errors` and treated as a no-op for that hook.
   */
  async runPost(toolId: string, args: unknown, result: unknown): Promise<PostDispatchOutcome> {
    let currentResult = result;
    const errors: ToolHookError[] = [];

    for (const hook of this.hooks) {
      if (hook.phase !== 'post') continue;
      if (!this.safeMatch(hook, toolId, errors)) continue;

      try {
        const outcome = await hook.run({ toolId, args, result: currentResult });
        if (!outcome) continue;
        if (outcome.result !== undefined) {
          currentResult = outcome.result;
        }
      } catch (error) {
        errors.push({ hookName: hook.name, phase: 'post', toolId, error });
      }
    }

    return { result: currentResult, errors };
  }

  private safeMatch(hook: ToolHook, toolId: string, errors: ToolHookError[]): boolean {
    try {
      return hook.match(toolId);
    } catch (error) {
      errors.push({ hookName: hook.name, phase: hook.phase, toolId, error });
      return false;
    }
  }
}
