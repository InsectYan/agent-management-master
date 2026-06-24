/**
 * @file runTurn.js
 * @description Pi 单轮：优先 pi-coding-agent，失败时回退轻量 LLM outbox。
 */

'use strict';

const { llmChat, llmChatStream, extractJsonObject, llmAvailable } = require('../../llm/chat');
const {
  initSkillWorkspace,
  materializeTurn,
  writeOutbox,
} = require('./workspace');

async function runPiTurnLight(input) {
  const { skill, message, sessionId, llm, workspacesRoot, hooks, stream, context, memoryContext } = input;

  initSkillWorkspace({ workspacesRoot, skill });
  const { cwd, session_dir, outbox_path } = materializeTurn({
    workspacesRoot,
    skillName: skill.name,
    sessionId,
    message,
    context,
  });

  if (!llmAvailable(llm) || !(llm.apiKey || '').trim()) {
    const stub = {
      reply: '【开发模式】未配置 LLM。',
      message_type: 'text',
      intent: 'chat',
      agent_name: 'note_assistant',
    };
    writeOutbox(outbox_path, stub);
    return { reply: stub.reply, outbox: stub, workspace: cwd, session_dir, pi_engine: 'light' };
  }

  hooks?.onStatus?.({ phase: 'pi_turn', label: 'Pi 思考中…' });
  const userContent = memoryContext
    ? `${message}\n\n## 长期记忆\n${memoryContext}`
    : message;
  const messages = [
    { role: 'system', content: `Skill「${skill.name}」助手。输出 JSON：reply, message_type, intent, agent_name，可选 memory_ops。` },
    { role: 'user', content: userContent },
  ];

  let text;
  try {
    if (stream && hooks?.onDelta) {
      text = (await llmChatStream({ llm, messages, hooks })).text;
    } else {
      text = (await llmChat({ llm, messages, hooks })).text;
    }
  } catch (err) {
    const stub = { reply: `【LLM 错误】${err.message}`, message_type: 'text', intent: 'error', agent_name: 'note_assistant' };
    writeOutbox(outbox_path, stub);
    return { reply: stub.reply, outbox: stub, workspace: cwd, session_dir, pi_engine: 'light' };
  }

  let outbox = extractJsonObject(text) || {
    reply: text,
    message_type: 'text',
    intent: 'chat',
    agent_name: 'note_assistant',
  };
  writeOutbox(outbox_path, outbox);
  return {
    reply: String(outbox.reply || text),
    outbox,
    workspace: cwd,
    session_dir,
    pi_engine: 'light',
  };
}

/**
 * @param {import('./runTurn.js').PiTurnInput} input
 */
async function runPiTurn(input) {
  const useLight = process.env.PI_LIGHTWEIGHT === '1' || process.env.PI_ENGINE === 'light';
  if (!useLight) {
    try {
      const mod = await import('./piRunTurn.mjs');
      return mod.runPiTurnFull(input);
    } catch (err) {
      if (input.hooks?.onStatus) {
        input.hooks.onStatus({ phase: 'pi_fallback', label: `Pi 引擎回退: ${err.message}` });
      }
    }
  }
  return runPiTurnLight(input);
}

module.exports = {
  runPiTurn,
  runPiTurnLight,
};
