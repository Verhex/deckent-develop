#!/usr/bin/env node

import { buildProgram } from './index.js';
import { handleCliError } from './helpers/process.js';

buildProgram().parseAsync(process.argv).catch((err: unknown) => {
  handleCliError(err);
});
