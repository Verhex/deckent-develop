import type { Command } from 'commander';
import {
  getDeprecatedForwardingSurface,
  registerDeprecatedForwarding,
} from '../helpers/compatibility-command-help.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerOutput(program: Command, _deps?: unknown): void {
  registerDeprecatedForwarding(program, getDeprecatedForwardingSurface('output')!);
}
