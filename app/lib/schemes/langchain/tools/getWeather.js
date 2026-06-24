/**
 * @file getWeather.js
 * @description 天气 Tool：基于城市名生成结构化天气（可对接真实 API，当前为确定性 mock + 可选 LLM 润色）。
 */

'use strict';

const CONDITIONS = [ '晴', '多云', '阴', '小雨', '雷阵雨' ];

/**
 * 确定性 mock 天气（同城市同天结果稳定）
 * @param {string} city
 * @returns {{ city: string, temperature: number, condition: string, humidity: number, source: string }}
 */
function mockWeatherData(city) {
  const normalized = city || '北京';
  const seed = normalized.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return {
    city: normalized,
    temperature: 15 + (seed % 18),
    condition: CONDITIONS[seed % CONDITIONS.length],
    humidity: 40 + (seed % 50),
    source: 'mock',
  };
}

/** @type {import('./types').LangChainTool} */
const getWeather = {
  name: 'getWeather',
  description: '查询指定城市的当前天气，参数 city 为城市名',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名' },
    },
    required: [ 'city' ],
  },
  /**
   * @param {Record<string, unknown>} args
   */
  async invoke(args) {
    const city = String(args.city || '北京');
    return mockWeatherData(city);
  },
};

module.exports = {
  getWeather,
  mockWeatherData,
};
