'use strict';

/**
 * 离线校验：Apifox 风格文档解析
 * 用法: node plugins/testgen-skill/lib/docParser.selftest.js [可选md路径]
 */

const path = require('path');
const fs = require('fs');
const {
  extractApiEndpoints,
  extractApiEndpointDetails,
  parseDocument,
  buildDocumentContextForLlm,
} = require('./docParser');

const fixture = `
# 全局公共参数

## 用户反馈-查询

**接口URL**

> /miniapp/feedback/select

**请求方式**

> POST

## 用户反馈-新增

**接口URL**

> /miniapp/feedback/add

**请求方式**

> POST

## 同行写法

\`GET /api/health\`
POST /api/ping
`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runFixture() {
  const details = extractApiEndpointDetails(fixture);
  const keys = extractApiEndpoints(fixture);
  assert(details.length >= 4, `fixture details expect >=4, got ${details.length}`);
  assert(keys.includes('POST /miniapp/feedback/select'), 'missing apifox select');
  assert(keys.includes('POST /miniapp/feedback/add'), 'missing apifox add');
  assert(keys.includes('GET /api/health'), 'missing backtick endpoint');
  assert(keys.includes('POST /api/ping'), 'missing inline endpoint');

  const meta = parseDocument(fixture);
  assert(meta.endpointCount === details.length, 'endpointCount mismatch');
  const ctx = buildDocumentContextForLlm(fixture, meta, 4000);
  assert(ctx.includes('接口清单'), 'context missing catalog');
  assert(ctx.includes('/miniapp/feedback/select'), 'context missing path');
  console.log('[ok] fixture endpoints=', details.length);
}

function runOptionalFile(filePath) {
  if (!filePath) return;
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.warn('[skip] file not found:', abs);
    return;
  }
  const text = fs.readFileSync(abs, 'utf8');
  const details = extractApiEndpointDetails(text);
  const meta = parseDocument(text);
  console.log(`[ok] file=${abs}`);
  console.log(`     chars=${text.length} endpoints=${details.length} sections=${meta.sectionCount}`);
  console.log('     sample:', details.slice(0, 5).map(d => d.key).join(' | '));
  assert(details.length >= 2, 'expected multiple endpoints in sample file');
}

runFixture();
runOptionalFile(process.argv[2]);
console.log('docParser.selftest passed');
