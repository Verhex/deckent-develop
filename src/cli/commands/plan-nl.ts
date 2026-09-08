import type { Command } from 'commander';
import {
  getDeprecatedForwardingSurface,
  registerDeprecatedForwarding,
} from '../helpers/compatibility-command-help.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerPlanNl(program: Command): void {
  registerDeprecatedForwarding(program, getDeprecatedForwardingSurface('plan-nl')!);
}
