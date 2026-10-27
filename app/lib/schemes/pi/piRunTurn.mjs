/**
 * @file piRunTurn.mjs
 * @description 完整 Pi 单轮：createAgentSession + DefaultResourceLoader。
 *              人设与 SKILL.md 从插件目录加载，工作区只放会话。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseOutboxJson } = require('./parseOutboxJson.js');
const { resolveChatModel } = require('./model.js');
const {
  initSkillWorkspace,
  materializeTurn,
  sessionJsonlPath,
} = require('./workspace.js');
const {
  truncateSessionJsonl,
  noteCompactFailure,
  resetCompactFailures,
} = require('./memory/short.js');

async function buildRuntime(llm, agentDir) {
  mkdirSync(agentDir, { recursive: true });
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: null,
    refreshOnCreate: false,
  });
  const key = (llm?.apiKey || '').trim();
  if (key) {
    await runtime.setRuntimeApiKey('openai', key);
    await runtime.setRuntimeApiKey('zhipu', key);
  }
  return runtime;
}

function readOptional(filePath) {
  if (!existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf-8');
}

function skillDirectories(skill) {
  const dirs = [ skill.dirPath ];
  const scenes = Array.isArray(skill.config?.pi?.scenes) ? skill.config.pi.scenes : [];
  for (const scene of scenes) {
    dirs.push(join(skill.dirPath, 'scenes', scene));
  }
  return dirs.filter(dir => existsSync(dir));
}

async function createResourceLoader(skill, cwd) {
  const agentDir = join(cwd, '.pi');
  mkdirSync(agentDir, { recursive: true });
  const agents = readOptional(join(skill.dirPath, 'prompts', 'AGENTS.md'));
  const soul = readOptional(join(skill.dirPath, 'prompts', 'SOUL.md'));
  const append = readOptional(join(skill.dirPath, 'prompts', 'APPEND_SYSTEM.md'));
  const systemPrompt = [ soul, agents ].filter(Boolean).join('\n\n');
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: SettingsManager.create(cwd, agentDir),
    additionalSkillPaths: skillDirectories(skill),
    noExtensions: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    systemPrompt: systemPrompt || undefined,
    appendSystemPrompt: append ? [ append ] : [],
  });
  if (typeof loader.reload === 'function') {
    await loader.reload();
  }
  return loader;
}

function extractCurrentLine(enriched) {
  const matched = /(?:^|\n)## 当前消息\r?\n/.exec(enriched);
  if (!matched) return enriched.trim().slice(0, 2000);
  const tail = enriched.slice(matched.index + matched[0].length);
  const nextSec = tail.search(/\r?\n## /);
  const block = nextSec >= 0 ? tail.slice(0, nextSec) : tail;
  for (const line of block.split(/\r?\n/)) {
    const text = line.trim();
    if (text && !/^(session|##|-\s)/.test(text)) return text.slice(0, 2000);
  }
  return block.trim().slice(0, 2000);
}

function toolStatusLabel(toolName) {
  if (toolName === 'read') return '正在读取资料…';
  if (toolName === 'grep' || toolName === 'find') return '正在检索工作区…';
  if (toolName === 'bash') return '正在执行命令…';
  if (toolName === 'write') return '正在撰写回复…';
  if (toolName === 'search_knowledge' || toolName === 'read_knowledge') return '正在查阅知识库…';
  return null;
}

async function waitSessionIdle(session) {
  while (session.isStreaming) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

async function promptAndWait(session, text) {
  await session.prompt(text, { expandPromptTemplates: false });
  await waitSessionIdle(session);
}

async function customToolsFor(skill, knowledgeRoot, knowledgeBaseDir) {
  const names = Array.isArray(skill.config?.pi?.tools) ? skill.config.pi.tools : [];
  if (!names.includes('search_knowledge') && !names.includes('read_knowledge')) return [];
  const { createKnowledgeTools } = await import('./tools/knowledge.mjs');
  return createKnowledgeTools({
    projectId: skill.project,
    knowledgeRoot,
    baseDir: knowledgeBaseDir || '',
    names,
  });
}

/**
 * 完整 Pi runTurn
 * @param {Object} input
 */
export async function runPiTurnFull(input) {
  const {
    skill, message, sessionId, llm, workspacesRoot, hooks, context, memoryContext, knowledgeRoot,
    workId, knowledgeBaseDir,
  } = input;

  initSkillWorkspace({ workspacesRoot, skill, workId });
  const { cwd, session_dir, outbox_path } = materializeTurn({
    workspacesRoot,
    projectId: skill.project,
    skillName: skill.name,
    sessionId,
    message,
    context,
    workId,
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

  const jsonlPath = sessionJsonlPath(workspacesRoot, skill.project, skill.name, sessionId, workId);
  const rel = session_dir.slice(cwd.length).replace(/^[/\\]+/, '').replace(/\\/g, '/');
  const outboxRel = `${rel}/outbox.json`;
  const currentLine = extractCurrentLine(message);

  let sessionManager;
  if (existsSync(jsonlPath)) {
    sessionManager = SessionManager.open(jsonlPath, session_dir, cwd);
  } else {
    sessionManager = SessionManager.create(cwd, session_dir, { id: String(sessionId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) });
    sessionManager.setSessionFile(jsonlPath);
  }

  const agentDir = join(cwd, '.pi');
  const modelRuntime = await buildRuntime(llm, agentDir);
  const resourceLoader = await createResourceLoader(skill, cwd);
  const customTools = await customToolsFor(skill, knowledgeRoot, knowledgeBaseDir);
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    sessionManager,
    settingsManager: SettingsManager.create(cwd, agentDir),
    modelRuntime,
    resourceLoader,
    model: resolveChatModel(llm),
    tools: [ 'read', 'grep', 'bash', 'write' ],
    customTools: customTools.length ? customTools : undefined,
    thinkingLevel: 'off',
    sessionStartEvent: {
      type: 'session_start',
      reason: existsSync(jsonlPath) ? 'resume' : 'startup',
    },
  });

  const memoryHint = memoryContext
    ? `\n长期记忆（系统已注入，不要在工作区另写 MEMORY.md）：\n${memoryContext.slice(0, 1500)}`
    : '';

  const mainPrompt = [
    `【${skill.name}】session=${sessionId}`,
    llm ? `【模型】${llm.label} (${llm.model})` : '',
    `【用户原话】${currentLine}`,
    '',
    '本轮结束前必须 write ' + outboxRel + '（合法 JSON）。',
    '必填：reply、message_type、intent、agent_name。',
    '若用户要求记住偏好，在 outbox 中加 memory_ops。',
    '',
    '步骤：',
    '1. 人设与 SKILL.md 已加载',
    '2. read ' + rel + '/inbox.md',
    memoryHint,
    '3. write ' + outboxRel + ' — 完成后再结束',
  ].filter(Boolean).join('\n');

  hooks?.onStatus?.({ phase: 'pi_turn', label: 'Pi 执行中…' });

  let keptEntryId = '';
  let compactFailed = false;
  const unsub = session.subscribe(event => {
    if (event.type === 'tool_execution_start') {
      const label = toolStatusLabel(event.toolName);
      if (label) hooks?.onStatus?.({ phase: 'tool', label, tool: event.toolName });
    }
    if (event.type === 'compaction_end') {
      if (event.result?.firstKeptEntryId && !event.aborted && !event.errorMessage) {
        keptEntryId = event.result.firstKeptEntryId;
      } else {
        compactFailed = true;
      }
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

  if (keptEntryId) {
    truncateSessionJsonl(jsonlPath, keptEntryId);
    resetCompactFailures(jsonlPath);
  } else if (compactFailed) {
    noteCompactFailure(jsonlPath);
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
  } catch (err) {
    outbox = {
      reply: `outbox.json 格式无效：${err.message}`,
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
