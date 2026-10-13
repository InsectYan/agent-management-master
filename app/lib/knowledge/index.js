/**
 * @file index.js
 * @description 知识库只读出口。不提供写盘。
 */

'use strict';

const { readPage } = require('./read');
const { search } = require('./search');

module.exports = {
  readPage,
  search,
};
