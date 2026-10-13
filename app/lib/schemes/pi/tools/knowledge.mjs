/**
 * @file knowledge.mjs
 * @description 按项目只读的知识库工具。技能未在 config.pi.tools 点名时不装入会话。
 */

import { createRequire } from 'node:module';
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';

const require = createRequire(import.meta.url);
const { readPage, search } = require('../../../knowledge/index.js');

function textResult(text) {
  return {
    content: [{ type: 'text', text }],
    details: {},
  };
}

/**
 * @param {{ projectId: string, knowledgeRoot: string, names: string[] }} options
 */
export function createKnowledgeTools(options) {
  const { projectId, knowledgeRoot, names } = options;
  const tools = [];

  if (names.includes('search_knowledge')) {
    tools.push(defineTool({
      name: 'search_knowledge',
      label: '检索知识库',
      description: '在当前项目知识库中按关键词检索。不能读取其它项目。',
      parameters: Type.Object({
        query: Type.String(),
      }),
      async execute(_id, params) {
        const hits = search(knowledgeRoot, projectId, params.query, 5);
        if (!hits.length) return textResult('没有匹配的知识页。');
        const text = hits.map(hit => `## ${hit.page}\n${hit.snippet}`).join('\n\n');
        return textResult(text);
      },
    }));
  }

  if (names.includes('read_knowledge')) {
    tools.push(defineTool({
      name: 'read_knowledge',
      label: '阅读知识页',
      description: '阅读当前项目知识库中的一页。路径必须是相对路径。',
      parameters: Type.Object({
        page: Type.String(),
      }),
      async execute(_id, params) {
        try {
          return textResult(readPage(knowledgeRoot, projectId, params.page));
        } catch (err) {
          return textResult(err.message || '无法阅读该页');
        }
      },
    }));
  }

  return tools;
}
