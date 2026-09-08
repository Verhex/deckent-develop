import type { Command } from 'commander';
import {
  getDeprecatedForwardingSurface,
  registerDeprecatedForwarding,
} from '../helpers/compatibility-command-help.js';
export { findLatestSprintLog, parseSprintLog, parseSprintNumber, parseRetroLearnings, extractGoalFromDirectives, extractGoalFromSprintLog, buildExplainOutput, formatDuration } from './retro.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerExplain(program: Command): void {
  registerDeprecatedForwarding(program, getDeprecatedForwardingSurface('explain')!);
}
