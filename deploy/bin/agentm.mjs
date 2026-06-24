#!/usr/bin/env node
/**
 * Global CLI: npm link -> agentm <command>
 * e.g. agentm local | agentm local:reset | agentm help
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runMjs = join(__dirname, '../scripts/run.mjs');
const args = process.argv.slice(2);
if (args.length === 0) args.push('help');

const r = spawnSync(process.execPath, [ runMjs, ...args ], { stdio: 'inherit', shell: false });
if (r.error) {
  console.error(r.error.message);
  process.exit(1);
}
process.exit(r.status ?? 1);
