/**
 * @file registry.js
 * @description LangChain Tool 注册表：Skill 通过 config.chain.tools 引用。
 */

'use strict';

const { getWeather } = require('./getWeather');
const { calculator } = require('./calculator');
const { echoSearch } = require('./echoSearch');

/** @type {Map<string, import('./types').LangChainTool>} */
const TOOLS = new Map([
  [ 'getWeather', getWeather ],
  [ 'calculator', calculator ],
  [ 'echoSearch', echoSearch ],
]);

/**
 * 按名称获取 Tool
 * @param {string} name
 * @returns {import('./types').LangChainTool|undefined}
 */
function getTool(name) {
  return TOOLS.get(name);
}

/**
 * 列出已注册 Tool 名称
 * @returns {string[]}
 */
function listToolNames() {
  return Array.from(TOOLS.keys());
}

/**
 * 解析 Skill 声明的 tools 列表
 * @param {string[]} names
 * @returns {import('./types').LangChainTool[]}
 */
function resolveTools(names) {
  const resolved = [];
  for (const name of names || []) {
    const tool = TOOLS.get(name);
    if (tool) resolved.push(tool);
  }
  return resolved;
}

/**
 * 注册新 Tool（扩展用）
 * @param {import('./types').LangChainTool} tool
 */
function registerTool(tool) {
  if (!tool?.name) throw new Error('Tool 必须定义 name');
  TOOLS.set(tool.name, tool);
}

module.exports = {
  getTool,
  listToolNames,
  resolveTools,
  registerTool,
};
