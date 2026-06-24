'use strict';

const { strict: assert } = require('node:assert');
const { calculator } = require('../../../../app/lib/schemes/langchain/tools/calculator');
const { getWeather, mockWeatherData } = require('../../../../app/lib/schemes/langchain/tools/getWeather');
const { echoSearch } = require('../../../../app/lib/schemes/langchain/tools/echoSearch');

describe('test/lib/schemes/langchain/tools.test.js', () => {
  describe('calculator', () => {
    it('计算表达式', async () => {
      const r = await calculator.invoke({ expression: '2+3*4' });
      assert.equal(r.result, 14);
    });

    it('拒绝非法字符', async () => {
      const r = await calculator.invoke({ expression: 'process.exit()' });
      assert.ok(r.error);
    });

    it('空 expression 报错', async () => {
      const r = await calculator.invoke({ expression: '' });
      assert.equal(r.error, 'expression 不能为空');
    });
  });

  describe('getWeather', () => {
    it('mockWeatherData 同城市结果稳定', () => {
      const a = mockWeatherData('上海');
      const b = mockWeatherData('上海');
      assert.deepEqual(a, b);
      assert.equal(a.city, '上海');
      assert.ok(typeof a.temperature === 'number');
    });

    it('invoke 返回结构化天气', async () => {
      const r = await getWeather.invoke({ city: '北京' });
      assert.equal(r.city, '北京');
      assert.equal(r.source, 'mock');
    });
  });

  describe('echoSearch', () => {
    it('返回占位检索结果', async () => {
      const r = await echoSearch.invoke({ query: 'Egg.js' });
      assert.equal(r.query, 'Egg.js');
      assert.equal(r.results.length, 1);
      assert.ok(r.results[0].snippet.includes('Egg.js'));
    });
  });
});
