/**
 * @file skillModules.js
 * @description 调用插件登记的确定性函数。未登记则空操作。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {Object} skill
 * @param {string} moduleName
 * @param {Object} input
 * @returns {Promise<Array<{ name: string, ok: boolean, reason?: string }>>}
 */
async function runRegisteredModules(skill, moduleName, input) {
  const root = path.join(skill.dirPath || '', 'modules', moduleName);
  if (!skill.dirPath || !fs.existsSync(root)) return [];

  const results = [];
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const file = path.join(root, ent.name, 'index.js');
    if (!fs.existsSync(file)) {
      results.push({ name: ent.name, ok: false, reason: 'skill_not_registered' });
      continue;
    }
    try {
      delete require.cache[require.resolve(file)];
      const mod = require(file);
      if (typeof mod.run !== 'function') {
        results.push({ name: ent.name, ok: false, reason: 'skill_not_registered' });
        continue;
      }
      const out = await mod.run(input);
      results.push({
        name: ent.name,
        ok: Boolean(out && out.ok),
        reason: out && out.reason,
      });
    } catch (err) {
      results.push({ name: ent.name, ok: false, reason: err.message });
    }
  }
  return results;
}

module.exports = { runRegisteredModules };
