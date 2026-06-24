/**
 * @file piRunTurn.mjs
 * @description 完整 Pi 单轮：@earendil-works/pi-coding-agent（read/grep/bash/write + outbox）。
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseOutboxJson } = require('./parseOutboxJson.js');
const { resolveChatModel } = require('./model.js');

function sanitize(value) {
  return String(value || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function skillWorkspacePath(workspacesRoot, skillName) {
  return join(workspacesRoot, `skill_${sanitize(skillName)}`);
}

function sessionDir(workspacesRoot, skillName, sessionId) {
  return join(skillWorkspacePath(workspacesRoot, skillName), 'sessions', sanitize(sessionId));
}

function sessionJsonl(workspacesRoot, skillName, sessionId) {
  return join(skillWorkspacePath(workspacesRoot, skillName), `${sanitize(sessionId)}.jsonl`);
}

function initSkillWorkspace({ workspacesRoot, skill }) {
  const cwd = skillWorkspacePath(workspacesRoot, skill.name);
  mkdirSync(cwd, { recursive: true });

  const agentsPath = join(cwd, 'AGENTS.md');
  if (!existsSync(agentsPath)) {
    const purpose = skill.skillDoc?.purpose || skill.description || skill.name;
    writeFileSync(agentsPath, `# ${skill.name}\n\n${purpose}\n\n必须 write sessions/<id>/outbox.json（JSON，含 reply）。\n可用 bash/read/grep/write 工具。\n`, 'utf-8');
  }

  const skillMdSrc = join(skill.dirPath, 'SKILL.md');
  const skillMdDst = join(cwd, 'SKILL.md');
  if (existsSync(skillMdSrc) && !existsSync(skillMdDst)) {
    cpSync(skillMdSrc, skillMdDst);
  }

  const toolsSrc = join(skill.dirPath, 'tools');
  const toolsDst = join(cwd, 'tools');
  if (existsSync(toolsSrc) && !existsSync(toolsDst)) {
    cpSync(toolsSrc, toolsDst, { recursive: true });
  }

  const memoryDst = join(cwd, 'MEMORY.md');
  if (!existsSync(memoryDst)) {
    writeFileSync(memoryDst, `# ${skill.name} 记忆\n\n### 偏好\n\n### 事实\n\n`, 'utf-8');
  }

  return cwd;
}

function materializeTurn({ workspacesRoot, skillName, sessionId, message, context }) {
  const cwd = skillWorkspacePath(workspacesRoot, skillName);
  const dir = sessionDir(workspacesRoot, skillName, sessionId);
  mkdirSync(dir, { recursive: true });
  const outboxPath = join(dir, 'outbox.json');
  if (existsSync(outboxPath)) unlinkSync(outboxPath);

  writeFileSync(join(dir, 'inbox.md'), message, 'utf-8');
  writeFileSync(join(dir, 'context.json'), JSON.stringify({
    skill: skillName,
    session_id: sessionId,
    ...(context || {}),
  }, null, 2), 'utf-8');
  writeFileSync(join(dir, 'PROMPT.md'), '# 本轮\n\n必须 write outbox.json（含 reply、message_type、intent、agent_name）。\n', 'utf-8');

  return { cwd, session_dir: dir, outbox_path: outboxPath };
}

function buildAuth(llm) {
  const data = {};
  const key = (llm?.apiKey || 'ollama').trim();
  if (key) {
    data.openai = { type: 'api_key', key };
    data.zhipu = { type: 'api_key', key };
  }
  const authStorage = AuthStorage.inMemory(data);
  return { authStorage, modelRegistry: ModelRegistry.create(authStorage) };
}

function extractCurrentLine(enriched) {
  const m = /(?:^|\n)## 当前消息\r?\n/.exec(enriched);
  if (!m) return enriched.trim().slice(0, 2000);
  const tail = enriched.slice(m.index + m[0].length);
  const nextSec = tail.search(/\r?\n## /);
  const block = nextSec >= 0 ? tail.slice(0, nextSec) : tail;
  for (const line of block.split(/\r?\n/)) {
    const t = line.trim();
    if (t && !/^(session|##|-\s)/.test(t)) return t.slice(0, 2000);
  }
  return block.trim().slice(0, 2000);
}

function toolStatusLabel(toolName) {
  if (toolName === 'read') return '正在读取资料…';
  if (toolName === 'grep') return '正在检索工作区…';
  if (toolName === 'bash') return '正在执行命令…';
  if (toolName === 'write') return '正在撰写回复…';
  return null;
}

async function waitSessionIdle(session) {
  while (session.isStreaming) {
    await new Promise(r => setTimeout(r, 200));
  }
}

async function promptAndWait(session, text) {
  await session.prompt(text, { expandPromptTemplates: false });
  await waitSessionIdle(session);
}

/**
 * 完整 Pi runTurn
 * @param {Object} input
 */
export async function runPiTurnFull(input) {
  const {
    skill, message, sessionId, llm, workspacesRoot, hooks, context, memoryContext,
  } = input;

  initSkillWorkspace({ workspacesRoot, skill });
  const { cwd, session_dir, outbox_path } = materializeTurn({
    workspacesRoot,
    skillName: skill.name,
    sessionId,
    message,
    context,
  });

  const apiKey = (llm?.apiKey || '').trim();
  if (!apiKey) {
    const stub = {
      reply: '【开发模式】未配置 LLM。请配置 OLLAMA_BASE_URL 或 API Key。',
      message_type: 'text',
      intent: 'chat',
      agent_name: 'note_assistant',
    };
    writeFileSync(outbox_path, JSON.stringify(stub, null, 2), 'utf-8');
    return { reply: stub.reply, outbox: stub, workspace: cwd, session_dir, pi_engine: 'pi-coding-agent' };
  }

  const jsonlPath = sessionJsonl(workspacesRoot, skill.name, sessionId);
  const rel = session_dir.slice(cwd.length).replace(/^[/\\]+/, '').replace(/\\/g, '/');
  const outboxRel = `${rel}/outbox.json`;
  const currentLine = extractCurrentLine(message);

  let sessionManager;
  if (existsSync(jsonlPath)) {
    sessionManager = SessionManager.open(jsonlPath, session_dir, cwd);
  } else {
    sessionManager = SessionManager.create(cwd, session_dir, { id: sanitize(sessionId) });
    sessionManager.setSessionFile(jsonlPath);
  }

  const { authStorage, modelRegistry } = buildAuth(llm);
  const { session } = await createAgentSession({
    cwd,
    sessionManager,
    settingsManager: SettingsManager.create(cwd),
    authStorage,
    modelRegistry,
    model: resolveChatModel(llm),
    tools: [ 'read', 'grep', 'bash', 'write' ],
    thinkingLevel: 'off',
    sessionStartEvent: {
      type: 'session_start',
      reason: existsSync(jsonlPath) ? 'resume' : 'startup',
    },
  });

  const memoryHint = memoryContext
    ? `\n4. read MEMORY.md（长期记忆）\n${memoryContext.includes('MEMORY') ? '' : `记忆摘要：\n${memoryContext.slice(0, 1500)}`}`
    : '\n4. read MEMORY.md（若有）';

  const mainPrompt = [
    `【${skill.name}】session=${sessionId}`,
    llm ? `【模型】${llm.label} (${llm.model})` : '',
    `【用户原话】${currentLine}`,
    '',
    '本轮结束前必须 write ' + outboxRel + '（合法 JSON）。',
    '必填：reply、message_type、intent、agent_name。',
    '若用户要求记住偏好，在 outbox 中加 memory_ops 或在 MEMORY.md 写入。',
    '',
    '步骤：',
    '1. read AGENTS.md 与 SKILL.md',
    '2. read ' + rel + '/inbox.md',
    memoryHint,
    '5. write ' + outboxRel + ' — 完成后再结束',
  ].filter(Boolean).join('\n');

  hooks?.onStatus?.({ phase: 'pi_turn', label: 'Pi 执行中…' });

  const unsub = session.subscribe(event => {
    if (event.type === 'tool_execution_start') {
      const label = toolStatusLabel(event.toolName);
      if (label) hooks?.onStatus?.({ phase: 'tool', label, tool: event.toolName });
    }
  });

  try {
    await promptAndWait(session, mainPrompt);
    for (let attempt = 0; attempt < 2 && !existsSync(outbox_path); attempt++) {
      hooks?.onStatus?.({ phase: 'pi_turn', label: '补写 outbox…' });
      await promptAndWait(session, `【补写 attempt=${attempt + 1}】仍未检测到 ${outboxRel}，请立刻 write。`);
    }
  } finally {
    unsub();
    session.dispose();
  }

  if (!existsSync(outbox_path)) {
    const fallback = {
      reply: 'Pi 未写入 outbox.json，请重试或缩短输入。',
      message_type: 'text',
      intent: 'error',
      agent_name: 'note_assistant',
    };
    writeFileSync(outbox_path, JSON.stringify(fallback, null, 2), 'utf-8');
  }

  let outbox;
  try {
    outbox = parseOutboxJson(readFileSync(outbox_path, 'utf-8'));
  } catch (e) {
    outbox = {
      reply: `outbox.json 格式无效：${e.message}`,
      message_type: 'text',
      intent: 'error',
      agent_name: 'note_assistant',
    };
  }

  hooks?.onStatus?.({ phase: 'done', label: '完成' });

  return {
    reply: String(outbox.reply || outbox.response || ''),
    outbox,
    workspace: cwd,
    session_dir,
    pi_engine: 'pi-coding-agent',
  };
}
