import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXECUTION_LANDING_PROPOSAL_MAX_BYTES,
  LANDING_PROPOSAL_MALFORMED,
  LandingProposalMalformedError,
  parseExecutionLandingProposalJson,
  writeExecutionLandingProposal,
} from '../core/execution-landing-proposal.js';

export interface LandingProposalEntryResult {
  exitCode: number;
  diagnostic?: string;
}

async function readInput(argv: readonly string[]): Promise<string> {
  if (argv[2] !== undefined) return argv[2];
  process.stdin.setEncoding('utf8');
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

export async function runLandingProposalEntry(
  argv: readonly string[],
  projectRoot: string,
): Promise<LandingProposalEntryResult> {
  const [taskId, attemptId] = argv;
  try {
    if (!taskId || !attemptId) {
      throw new LandingProposalMalformedError(
        'Expected <taskId> <attemptId> and proposal JSON on stdin or as the third argument',
      );
    }
    const raw = await readInput(argv);
    if (Buffer.byteLength(raw) > EXECUTION_LANDING_PROPOSAL_MAX_BYTES) {
      throw new LandingProposalMalformedError(
        'Execution landing proposal input exceeds its byte ceiling',
      );
    }
    const proposal = parseExecutionLandingProposalJson(raw, { taskId, attemptId });
    writeExecutionLandingProposal(projectRoot, proposal);
    return { exitCode: 0 };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      diagnostic: `${LANDING_PROPOSAL_MALFORMED}: ${detail}`,
    };
  }
}

const isMain = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const result = await runLandingProposalEntry(process.argv.slice(2), process.cwd());
  if (result.diagnostic) process.stderr.write(`${result.diagnostic}\n`);
  process.exitCode = result.exitCode;
}
