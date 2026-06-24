/**
 * @file runReact.js
 * @description ReAct 方案：Thought → Action → Observation 循环，共用 LangChain Tool 注册表。
 */

'use strict';

const { llmChat, llmAvailable } = require('../../llm/chat');
const { resolveTools } = require('../langchain/tools/registry');

/**
 * 解析 ReAct 格式输出
 * @param {string} text
 * @returns {{ thought?: string, action?: string, actionInput?: string, finalAnswer?: string }}
 */
function parseReactOutput(text) {
  const thought = /Thought:\s*([\s\S]*?)(?=Action:|Final Answer:|$)/i.exec(text);
  const action = /Action:\s*(\w+)/i.exec(text);
  const actionInput = /Action Input:\s*([\s\S]*?)(?=Observation:|Thought:|Final Answer:|$)/i.exec(text);
  const finalAnswer = /Final Answer:\s*([\s\S]*?)$/i.exec(text);

  return {
    thought: thought?.[1]?.trim(),
    action: action?.[1]?.trim(),
    actionInput: actionInput?.[1]?.trim(),
    finalAnswer: finalAnswer?.[1]?.trim(),
  };
}

/**
 * 解析 Action Input 为 JSON 或 key=value
 * @param {string} raw
 * @param {import('../langchain/tools/types').LangChainTool} tool
 */
function parseActionInput(raw, tool) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const trimmed = raw.trim();
    const firstProp = tool.parameters?.properties
      ? Object.keys(tool.parameters.properties)[0]
      : 'input';
    return { [firstProp]: trimmed };
  }
}

/**
 * 执行 ReAct 循环
 * @param {Object} options
 */
async function runReact(options) {
  const { llm, skill, input, hooks } = options;
  const reactConfig = skill.config?.react || {};
  const maxIterations = Math.min(Math.max(Number(reactConfig.maxIterations) || 6, 1), 12);
  const toolNames = reactConfig.tools || [ 'calculator', 'echoSearch' ];
  const tools = resolveTools(toolNames);
  const question = String(input.message || input.question || input.query || '');

  if (input.action === 'list') {
    const logs = input.qa_log || [];
    const lines = logs.map(r =>
      `- [${r.created_at}] Q: ${r.question?.slice(0, 40)} → A: ${r.answer?.slice(0, 60)}`
    );
    const reply = lines.length
      ? `最近 ${lines.length} 条问答：\n${lines.join('\n')}`
      : '暂无问答记录';
    return {
      text: reply,
      output: { action: 'list', entries: logs, scheme: 'react' },
      meta: { scheme: 'react', skill_action: 'list' },
    };
  }

  if (!question) {
    return {
      text: '请提供 message 或 question 参数',
      output: { scheme: 'react', error: 'missing_question' },
      meta: { scheme: 'react' },
    };
  }

  if (!llmAvailable(llm)) {
    const stub = `[ReAct 占位] 问题「${question.slice(0, 100)}」— 请配置 LLM 后重试`;
    return {
      text: stub,
      output: { answer: stub, trace: [], scheme: 'react' },
      meta: { scheme: 'react', maxIterations },
    };
  }

  const toolDesc = tools.map(t =>
    `- ${t.name}: ${t.description}`
  ).join('\n');

  const systemPrompt = [
    '你是 ReAct 助手。按以下格式逐步推理：',
    'Thought: <推理>',
    'Action: <tool_name>',
    'Action Input: <JSON 参数>',
    '（等待 Observation 后继续，或输出 Final Answer: <答案> 结束）',
    '',
    '可用工具：',
    toolDesc || '（无）',
    '',
    '若无需工具，直接 Final Answer。',
  ].join('\n');

  /** @type {Array<{ thought?: string, action?: string, observation?: string }>} */
  const trace = [];
  let conversation = `Question: ${question}\n`;
  let finalAnswer = '';

  for (let i = 0; i < maxIterations; i++) {
    hooks?.onStatus?.({ phase: 'react', label: `ReAct 第 ${i + 1}/${maxIterations} 轮…` });

    let text;
    try {
      const result = await llmChat({
        llm,
        hooks,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversation },
        ],
        temperature: 0.3,
        maxTokens: 768,
      });
      text = result.text;
    } catch (err) {
      finalAnswer = `【LLM 错误】${err.message}`;
      break;
    }

    const parsed = parseReactOutput(text);

    if (parsed.finalAnswer) {
      finalAnswer = parsed.finalAnswer;
      trace.push({ thought: parsed.thought, action: 'final', observation: parsed.finalAnswer });
      break;
    }

    const step = { thought: parsed.thought, action: parsed.action };

    if (parsed.action) {
      const tool = tools.find(t => t.name === parsed.action);
      if (tool) {
        const args = parseActionInput(parsed.actionInput || '', tool);
        try {
          const obs = await tool.invoke(args);
          step.observation = JSON.stringify(obs);
          conversation += `\nThought: ${parsed.thought || ''}\nAction: ${parsed.action}\nAction Input: ${parsed.actionInput || ''}\nObservation: ${step.observation}\n`;
        } catch (err) {
          step.observation = `Tool error: ${err.message}`;
          conversation += `\nObservation: ${step.observation}\n`;
        }
      } else {
        step.observation = `未知工具: ${parsed.action}`;
        conversation += `\nObservation: ${step.observation}\n`;
      }
    } else {
      finalAnswer = text;
      step.observation = text;
      trace.push(step);
      break;
    }

    trace.push(step);
  }

  if (!finalAnswer) {
    finalAnswer = trace.length
      ? (trace[trace.length - 1].observation || '未能得出 Final Answer')
      : 'ReAct 循环未产生答案';
  }

  return {
    text: finalAnswer,
    output: {
      answer: finalAnswer,
      question,
      trace,
      scheme: 'react',
    },
    meta: {
      scheme: 'react',
      iterations: trace.length,
      maxIterations,
      model: llm.model,
      tools: toolNames,
    },
  };
}

module.exports = {
  runReact,
  parseReactOutput,
};
