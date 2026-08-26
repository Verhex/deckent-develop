import { generateMetadataAndDocumentationOutputs } from './generate-metadata-docs.mjs';
import { generateTypeOutputs } from './generate-types.mjs';
import { outputModeFromArgv, reconcileOutputs } from './io.mjs';

const outputs = new Map([
  ...generateTypeOutputs(),
  ...generateMetadataAndDocumentationOutputs(),
]);
const result = await reconcileOutputs(outputs, { mode: outputModeFromArgv(process.argv) });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.mode === 'check' && result.changed > 0) process.exitCode = 1;
