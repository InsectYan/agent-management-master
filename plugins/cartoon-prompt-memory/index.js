'use strict';

module.exports = {
  name: 'cartoon-prompt-memory',
  project: 'cartoon',
  version: '0.1.0',
  description: '只记录单独生成提示词的入参、新提示词和评分，不参与生成，也不把记忆送回项目',
  scheme: 'loop',
  routes: [],
  dbTables: [],
  memoryConfig: { enabled: true, type: 'file', scope: 'record' },
  config: {},
  callbacks: {
    async beforeExecute() {
      const err = new Error('生成提示词记忆只记录快照，不参与生成');
      err.status = 400;
      throw err;
    },
  },
};
