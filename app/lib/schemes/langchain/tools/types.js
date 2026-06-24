/**
 * @file types.js
 * @description LangChain Tool 类型约定（JSDoc）。
 */

'use strict';

/**
 * @typedef {Object} LangChainTool
 * @property {string} name
 * @property {string} description
 * @property {Record<string, unknown>} [parameters]
 * @property {(args: Record<string, unknown>) => Promise<unknown>} invoke
 */

module.exports = {};
