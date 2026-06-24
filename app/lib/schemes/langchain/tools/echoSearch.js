/**
 * @file echoSearch.js
 * @description 占位搜索 Tool（ReAct 示例用）。
 */

'use strict';

/** @type {import('./types').LangChainTool} */
const echoSearch = {
  name: 'echoSearch',
  description: '搜索知识库，参数 query 为搜索词',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索词' },
    },
    required: [ 'query' ],
  },
  async invoke(args) {
    const query = String(args.query || '');
    return {
      query,
      results: [
        { title: `关于「${query}」的说明`, snippet: `这是「${query}」的占位检索结果，用于 ReAct 演示。` },
      ],
    };
  },
};

module.exports = { echoSearch };
