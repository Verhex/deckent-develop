// Throwaway script — Sprint 134 manual recovery Step D.3
// Invokes runSelfAuditGate('sprint-134') from dist/orchestra/sprint-finalizer.js
// and writes SelfAuditResult to .deckent/sprint-134-gate.json.
// This is the authoritative live test of T-014 Brain Self-Audit Gate against
// Sprint 134's own final state.

import { runSelfAuditGate } from '../dist/orchestra/sprint-finalizer.js';
import { writeFile } from 'node:fs/promises';

console.log('Running runSelfAuditGate("sprint-134") live...\n');

const result = await runSelfAuditGate('sprint-134');

await writeFile('.deckent/sprint-134-gate.json', JSON.stringify(result, null, 2));

console.log('SelfAuditResult:');
console.log(JSON.stringify(result, null, 2));
console.log('\nWritten to .deckent/sprint-134-gate.json');
console.log(`overallGate: ${result.overallGate}`);
