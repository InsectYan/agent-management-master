'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, 'sources');
const SHEET_CAP = 2800;

const FORMULA = {
  character: '按这个顺序写成一段：基础身份（性别、年龄、人种或种族）→ 面部（脸型、眉眼、鼻唇、瞳色、肤色）→ 身材（身高、体态、比例）→ 发型与妆容 → 服装（颜色、材质、款式、细节、工艺）→ 饰品 → 光影 → 镜头 → 项目风格。只写这一个人物。不要写场景陈设，不要写三视图，不要写白底排版。',
  scene: '按这个顺序写成一段：空间类型 → 建筑结构 → 材质纹理 → 光影氛围 → 叙事道具 → 镜头 → 天气 → 项目风格。只写这一个空间。不要写站在里面的人，不要写人影、人脸、手脚和人体局部，不要写多视角排版。',
  prop: '按这个顺序写成一段：物品名称 → 材质 → 结构 → 细节工艺 → 光影 → 项目风格。只写这一件物品，不要写人物。',
};

const KEEP = {
  character: /人物|服装|风格定位|光影|参数|提示词|妆容|五官|身份/,
  scene: /场景|空间|风格定位|光影|参数|提示词|建筑|陈设|材质/,
  prop: /道具|物件|物品|风格定位|光影|参数|提示词|材质/,
};

let cache = null;

function sourceFiles() {
  if (!fs.existsSync(SOURCE_DIR)) return [];
  return fs.readdirSync(SOURCE_DIR)
    .filter(name => name.endsWith('.md'))
    .map(name => path.join(SOURCE_DIR, name));
}

function styleIdFromHeading(line) {
  if (!/^#{1,4}\s/.test(line)) return '';
  const tick = line.match(/`([a-z0-9-]+)`/);
  if (tick) return tick[1];
  const paren = line.match(/[（(]([a-z0-9-]+)/);
  return paren ? paren[1] : '';
}

function loadSections() {
  if (cache) return cache;
  cache = new Map();
  for (const file of sourceFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split(/\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const mark = lines[i].match(/^(#+)\s/);
      const id = styleIdFromHeading(lines[i]);
      if (!mark || !id) continue;
      const level = mark[1].length;
      if (cache.has(id)) continue;
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j].match(/^(#+)\s/);
        if (next && next[1].length <= level) {
          end = j;
          break;
        }
      }
      cache.set(id, lines.slice(i, end).join('\n').trim());
    }
  }
  return cache;
}

function isHead(line) {
  return /^#{2,6}\s/.test(line) || /^\*\*[^*]{2,48}\*\*\s*$/.test(String(line || '').trim());
}

function kindSlice(section, kind) {
  const text = String(section || '').trim();
  if (!text) return '';
  const lines = text.split('\n');
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (isHead(line) && current.length) {
      blocks.push(current);
      current = [ line ];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  const rule = KEEP[kind] || KEEP.character;
  const kept = blocks.filter((block, index) => {
    if (index === 0) return true;
    const title = block[0] || '';
    if (/人景融合|分镜|视频/.test(title)) return false;
    return rule.test(title);
  });
  const chosen = kept.length > 1 ? kept : blocks;
  const joined = chosen.map(block => block.join('\n')).join('\n').trim();
  if (joined.length <= SHEET_CAP) return joined;
  return `${joined.slice(0, SHEET_CAP).replace(/\n[^\n]*$/, '')}\n…`;
}

function packStyles(kind, styleIds) {
  const key = [ 'character', 'scene', 'prop' ].includes(kind) ? kind : 'character';
  const ids = [];
  (Array.isArray(styleIds) ? styleIds : [ styleIds ]).forEach(item => {
    const id = String(item || '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  });
  const parts = ids.map(id => kindSlice(loadSections().get(id) || '', key)).filter(Boolean);
  let styleSheet = parts.join('\n\n');
  if (styleSheet.length > SHEET_CAP) styleSheet = `${styleSheet.slice(0, SHEET_CAP).replace(/\n[^\n]*$/, '')}\n…`;
  return {
    styleId: ids[0] || '',
    formula: FORMULA[key],
    styleSheet,
  };
}

function packStyle(kind, styleId) {
  return packStyles(kind, styleId);
}

const NOTE_CAP = 900;
const NOTE_SLOTS = new Set([
  '面部特征', '光影氛围', '风格质感', '整体风格', '工艺特征',
  '材质', '材质纹理', '镜头构图', '光影统一', '细节设计',
]);

function cleanCell(text) {
  return String(text || '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function promptStyleNote(styleIds) {
  const ids = [];
  (Array.isArray(styleIds) ? styleIds : [ styleIds ]).forEach(item => {
    const id = String(item || '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  });
  const notes = [];
  ids.forEach(id => {
    const section = loadSections().get(id) || '';
    if (!section) return;
    const lines = section.split('\n');
    const intro = [];
    const slots = [];
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^#{2,6}\s/.test(line)) continue;
      if (/^>\s*/.test(line) && !slots.length && intro.length < 1) {
        intro.push(cleanCell(line.replace(/^>\s*/, '')));
        continue;
      }
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map(cell => cleanCell(cell)).filter(Boolean);
      if (cells.length < 2 || cells[0] === '槽位' || cells[0] === 'MJ参数') continue;
      if (!NOTE_SLOTS.has(cells[0])) continue;
      const value = cells[1];
      if (!value || /调用/.test(value)) continue;
      if (slots.some(item => item === value || item.includes(value))) continue;
      slots.push(value);
    }
    let text = [ ...intro, ...slots ].filter(Boolean).join('。').replace(/。{2,}/g, '。');
    if (text && !/[。！？]$/.test(text)) text = `${text}。`;
    if (!text) return;
    if (text.length > NOTE_CAP) text = `${text.slice(0, NOTE_CAP).replace(/。[^。]*$/, '')}。`;
    notes.push(text);
  });
  return notes.join('\n');
}

function enrichStylePrompt(input = {}) {
  const visual = String(input.visual_style || '').trim();
  const note = visual ? promptStyleNote([ visual ]) : '';
  const base = String(input.visual_style_prompt || '').trim();
  if (!note) return base;
  if (base.includes(note.slice(0, 24))) return base;
  return [ note, base ].filter(Boolean).join('\n');
}

module.exports = {
  packStyle,
  packStyles,
  loadSections,
  promptStyleNote,
  enrichStylePrompt,
};
