'use strict';

const { strict: assert } = require('node:assert');
const { getDialect, setDialect, isPostgres, toPgParams } = require('../../../app/lib/db/dialect');

describe('test/lib/db/dialect.test.js', () => {
  afterEach(() => {
    setDialect('sqlite');
  });

  it('isPostgres 随 dialect 切换', () => {
    setDialect('sqlite');
    assert.equal(isPostgres(), false);
    assert.equal(getDialect(), 'sqlite');

    setDialect('postgres');
    assert.equal(isPostgres(), true);
  });

  it('toPgParams 将 ? 转为 $1,$2', () => {
    const { text, values } = toPgParams(
      'SELECT * FROM t WHERE a = ? AND b = ?',
      [ 'x', 42 ]
    );
    assert.equal(text, 'SELECT * FROM t WHERE a = $1 AND b = $2');
    assert.deepEqual(values, [ 'x', 42 ]);
  });

  it('toPgParams 无占位符时原样返回', () => {
    const { text, values } = toPgParams('SELECT 1', []);
    assert.equal(text, 'SELECT 1');
    assert.deepEqual(values, []);
  });
});
