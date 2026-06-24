/**
 * @file calculator.js
 * @description 简单计算器 Tool（ReAct / LangChain 共用）。
 */

'use strict';

/** @type {import('./types').LangChainTool} */
const calculator = {
  name: 'calculator',
  description: '计算数学表达式，参数 expression 如 "2+3*4"',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: '数学表达式' },
    },
    required: [ 'expression' ],
  },
  async invoke(args) {
    const expression = String(args.expression || '').trim();
    if (!expression) return { error: 'expression 不能为空' };
    if (!/^[\d+\-*/().%\s]+$/.test(expression)) {
      return { error: '表达式含非法字符' };
    }
    try {
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${expression})`)();
      return { expression, result: value };
    } catch (err) {
      return { error: err.message };
    }
  },
};

module.exports = { calculator };
