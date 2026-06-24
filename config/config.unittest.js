/**
 * @file config.unittest.js
 * @description 单元测试环境：临时 SQLite、关闭睡梦 worker、零就绪延迟。
 */

'use strict';

const path = require('path');
const os = require('os');

module.exports = appInfo => {
  const tmp = path.join(os.tmpdir(), `agent-mgmt-ut-${process.pid}`);

  return {
    logger: {
      consoleLevel: 'NONE',
    },
    appSettings: {
      sqlitePath: path.join(tmp, 'test.sqlite'),
      databaseUrl: '',
      readyDelayMs: 0,
      workspacesRoot: path.join(tmp, 'workspaces'),
      memorySystem: {
        file: {
          dir: path.join(tmp, 'memory_files'),
        },
        vector: {
          backend: 'keyword',
        },
        dream: {
          workerEnabled: false,
        },
      },
    },
  };
};
