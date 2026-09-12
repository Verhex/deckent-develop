#!/usr/bin/env node
// Canonical source invocation: node --import tsx scripts/gen-production-wiring-block.mjs <producerId>
//
// Emits the exact `- ProductionWiring: {...}` DIRECTIVES line for a REGISTERED
// host-proof identity. The host fills verifier digests and the platform program;
// this script never authors a digest, an executable path or a platform claim —
// it only prints what the host itself produced. Unregistered identity → exit 2.

import { completeProductionWiringFromProposal } from '../src/core/production-wiring-contract.js';
import { listRegisteredProductionWiringHostProofProposalIdentities as listIds }
  from '../src/core/production-wiring-host-proof.js';

const wanted = process.argv[2];
const ids = listIds();

if (!wanted) {
  console.error('kayıtlı producer id\'leri:');
  for (const i of ids) console.error(`  ${i.producer.producerId}`);
  process.exit(2);
}

const identity = ids.find(i => i.producer.producerId === wanted);
if (!identity) {
  console.error(`kayıtlı değil: ${wanted}`);
  console.error('kayıtlı producer id\'leri:');
  for (const i of ids) console.error(`  ${i.producer.producerId}`);
  process.exit(2);
}

const contract = completeProductionWiringFromProposal({
  version: 1,
  changeKind: 'runtime-change',
  ...identity,
  disposition: { kind: 'production-wiring' },
}, { projectRoot: process.cwd() });

// The host completion returns the COMPLETED contract; DIRECTIVES carries the
// INPUT shape, which the task-builder re-completes at parse time. Strip exactly
// the host-computed fields — emitting them makes the input parser reject the
// block (they are derived, never authored).
const HOST_COMPUTED_PROGRAM_FIELDS = [
  'kind', 'version', 'executionClass', 'shell', 'effect',
  'replayPolicy', 'ambientEnvironment', 'programDigest',
];

const input = structuredClone(contract);
for (const field of HOST_COMPUTED_PROGRAM_FIELDS) delete input.hostProofProgram[field];
for (const platform of input.hostProofProgram.platforms ?? []) {
  for (const probe of platform.probes ?? []) delete probe.probeId;
}

process.stdout.write(`- ProductionWiring: ${JSON.stringify(input)}\n`);
