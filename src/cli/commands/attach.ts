import type { Command } from 'commander';
import {
  getDeprecatedForwardingSurface,
  registerDeprecatedForwarding,
} from '../helpers/compatibility-command-help.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerAttach(program: Command): void {
  registerDeprecatedForwarding(program, getDeprecatedForwardingSurface('attach')!);
}
