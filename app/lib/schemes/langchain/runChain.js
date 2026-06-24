/**
 * @file runChain.js
 * @description LangChain 轻量 Chain 执行：tool-agent / llm 两种模式。
 */

'use strict';

const { llmChat, llmAvailable } = require('../../llm/chat');
const { resolveTools } = require('./tools/registry');
const { mockWeatherData } = require('./tools/getWeather');

/**
 * 用 LLM 将 tool 结果格式化为用户回复
 * @param {Object} options
 */
async function formatWithLlm(options) {
  const { llm, systemPrompt, userContent, hooks } = options;
  if (!llmAvailable(llm)) {
    return null;
  }
  try {
    const result = await llmChat({
      llm,
      hooks,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.5,
      maxTokens: 512,
    });
    return result.text;
  } catch {
    return null;
  }
}

/**
 * tool-agent 链：先调 Tool，再 LLM 润色（或模板兜底）
 * @param {Object} options
 * @param {import('../../llm/types').LlmRuntimeConfig} options.llm
 * @param {Object} options.skill
 * @param {Record<string, unknown>} options.input
 * @param {Object} [options.hooks]
 */
async function runToolAgentChain(options) {
  const { llm, skill, input, hooks } = options;
  const chainConfig = skill.config?.chain || {};
  const tools = resolveTools(chainConfig.tools || [ 'getWeather' ]);
  const city = String(input.city || '北京');
  const action = input.action || 'query';

  if (action === 'history') {
    return {
      text: `「${city}」历史记录见 output.history`,
      output: { city, action: 'history', history: input.history, scheme: 'langchain' },
      meta: { scheme: 'langchain', tools_used: [] },
    };
  }

  hooks?.onStatus?.({ phase: 'tool', label: '调用 getWeather…' });

  let toolData = mockWeatherData(city);
  const weatherTool = tools.find(t => t.name === 'getWeather');
  if (weatherTool) {
    toolData = await weatherTool.invoke({ city });
  }

  const templateReply = `${toolData.city}：${toolData.condition}，约 ${toolData.temperature}°C，湿度 ${toolData.humidity}%`;

  const systemPrompt = chainConfig.systemPrompt
    || '你是天气助手。根据工具返回的结构化数据，用简洁中文回答用户。';
  const llmReply = await formatWithLlm({
    llm,
    hooks,
    systemPrompt,
    userContent: `用户查询城市：${city}\n工具数据：${JSON.stringify(toolData)}`,
  });

  const reply = llmReply || templateReply;

  return {
    text: reply,
    output: {
      reply,
      city: toolData.city,
      action: 'query',
      temperature: toolData.temperature,
      condition: toolData.condition,
      humidity: toolData.humidity,
      scheme: 'langchain',
      tool_data: toolData,
    },
    meta: {
      scheme: 'langchain',
      tools_used: weatherTool ? [ 'getWeather' ] : [],
      model: llm.model,
      llm_formatted: Boolean(llmReply),
    },
  };
}

/**
 * 纯 LLM 链
 * @param {Object} options
 */
async function runLlmChain(options) {
  const { llm, skill, input, hooks } = options;
  const chainConfig = skill.config?.chain || {};
  const systemPrompt = chainConfig.systemPrompt || `你是 Skill「${skill.name}」助手。`;
  const userContent = JSON.stringify(input);

  hooks?.onStatus?.({ phase: 'llm', label: 'LangChain LLM 链…' });

  if (!llmAvailable(llm)) {
    return {
      text: '【开发模式】未配置 LLM',
      output: { scheme: 'langchain', input },
      meta: { scheme: 'langchain' },
    };
  }

  const result = await llmChat({
    llm,
    hooks,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  });

  return {
    text: result.text,
    output: { reply: result.text, scheme: 'langchain', input },
    meta: { scheme: 'langchain', model: llm.model, usage: result.usage },
  };
}

/**
 * 执行 LangChain 链
 * @param {Object} options
 */
async function runLangChain(options) {
  const chainConfig = options.skill.config?.chain || {};
  const type = chainConfig.type || 'tool-agent';

  if (type === 'llm') {
    return runLlmChain(options);
  }
  return runToolAgentChain(options);
}

module.exports = {
  runLangChain,
  runToolAgentChain,
  runLlmChain,
};
