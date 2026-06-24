#!/usr/bin/env node
/**
 * Task dispatcher. Daily entry: agentm <command>
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const task = process.argv[2] || 'help';
const arg = process.argv[3];

const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.error) fail(`${cmd} ${args.join(' ')}: ${r.error.message}`);
  process.exit(r.status ?? 1);
}

function runBash(shRel, extraArgs = []) {
  const sh = join(__dirname, shRel);
  if (!existsSync(sh)) fail(`Missing script: ${sh}`);
  if (isWin && existsSync(GIT_BASH)) {
    return run(GIT_BASH, [ sh, ...extraArgs ]);
  }
  if (isWin) {
    return runPs1(shRel.replace(/\.sh$/, '.ps1'), extraArgs);
  }
  return run('bash', [ sh, ...extraArgs ]);
}

function runPs1(ps1Rel, psArgs = []) {
  const ps1 = join(__dirname, ps1Rel);
  if (!existsSync(ps1)) fail(`Missing ${ps1}`);
  return run('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    ps1,
    ...psArgs,
  ]);
}

function printHelp() {
  console.log(`agent-management-master — Docker CLI

First time:
  cd deploy && npm link

Local Docker:
  agentm local                 server + ollama (default, lighter)
  agentm local:full            + postgres (port 5433)
  agentm local:host-ollama     server only, use host Ollama
  agentm local:dev               local + plugins rw (dev override)
  agentm local:down              stop all profiles
  agentm local:reset             down -v, rebuild, smoke
  agentm local:status            compose ps + /health
  agentm local:wait              wait until /health ok
  agentm local:logs              follow agent-server logs
  agentm local:pull-model        ollama pull in container

Without link:
  npm run docker:local
  node deploy/scripts/run.mjs local

npm dev (no Docker):
  npm run dev && npm run selftest:all
`);
}

switch (task) {
  case 'help':
  case '-h':
  case '--help':
    printHelp();
    process.exit(0);
    break;
  case 'local':
    if (isWin) runPs1('start-local.ps1', [ 'docker-ollama', '-Wait' ]);
    else {
      process.env.AGENTM_WAIT = '1';
      runBash('start-local.sh', [ 'docker-ollama' ]);
    }
    break;
  case 'local:full':
    if (isWin) runPs1('start-local.ps1', [ 'full', '-Wait' ]);
    else {
      process.env.AGENTM_WAIT = '1';
      runBash('start-local.sh', [ 'full' ]);
    }
    break;
  case 'local:host-ollama':
    if (isWin) runPs1('start-local.ps1', [ 'host-ollama', '-Wait' ]);
    else {
      process.env.AGENTM_WAIT = '1';
      runBash('start-local.sh', [ 'host-ollama' ]);
    }
    break;
  case 'local:dev':
    if (isWin) runPs1('start-local.ps1', [ 'docker-ollama', '-Dev', '-Wait' ]);
    else {
      process.env.AGENTM_DEV = '1';
      process.env.AGENTM_WAIT = '1';
      runBash('start-local.sh', [ 'docker-ollama' ]);
    }
    break;
  case 'local:reset':
    if (isWin) runPs1('reset-dev.ps1', [ arg || 'docker-ollama' ]);
    else runBash('reset-dev.sh', [ arg || 'docker-ollama' ]);
    break;
  case 'local:down':
    if (isWin) {
      runPs1('compose.ps1', [ '--profile', 'local', '--profile', 'ollama', '--profile', 'postgres', 'down' ]);
    } else {
      runBash('compose.sh', [ '--profile', 'local', '--profile', 'ollama', '--profile', 'postgres', 'down' ]);
    }
    break;
  case 'local:status':
    if (isWin) runPs1('status-local.ps1');
    else runBash('status-local.sh');
    break;
  case 'local:wait':
    if (isWin) runPs1('wait-health.ps1');
    else runBash('wait-health.sh');
    break;
  case 'local:logs':
    if (isWin) runPs1('compose.ps1', [ '--profile', 'local', 'logs', '-f', 'agent-server' ]);
    else runBash('compose.sh', [ '--profile', 'local', 'logs', '-f', 'agent-server' ]);
    break;
  case 'local:pull-model':
    if (isWin) runPs1('pull-model.ps1');
    else runBash('pull-model.sh');
    break;
  case 'local:smoke':
    if (isWin) runPs1('smoke-docker.ps1');
    else runBash('smoke-docker.sh');
    break;
  default:
    fail(`Unknown task: ${task}\nRun agentm help`);
}
