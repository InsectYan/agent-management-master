'use strict';

const fs = require('fs');
const path = require('path');

const UNDER_CN = /(?<![二三四五六七八九])(?:十一|十二|十三|十四|十五|十六|十七|十八|十九|二十)岁|(?<![十廿])[一二三四五六七八九]岁/;
const ADULT_CN = /二十[一二三四五六七八九]岁|[三四五六七八九]十[一二三四五六七八九]?岁/;

const SEXUAL_ACT = /性爱|性交|交合|交媾|做爱|云雨|交欢|抽送|抽插|插入|挺入|顶入/;

const CATALOG = [
  { id: 'hold', group: 'intimacy', gate: 'adults', title: '握住、进入或停下', file: 'hold.md', pattern: /握住|进入|停下|抽送|插入/ },
  { id: 'kiss', group: 'intimacy', gate: 'adults', title: '亲吻', file: 'kiss.md', pattern: /吻|亲嘴|嘴唇相贴|唇贴/ },
  { id: 'cloth', group: 'intimacy', gate: 'adults', title: '衣物', file: 'cloth.md', pattern: /解开|褪下|脱下|衣襟|裸露|赤裸/ },
  { id: 'embrace', group: 'intimacy', gate: 'adults', title: '拥抱', file: 'embrace.md', pattern: /拥抱|搂住|抱住|依偎|环住/ },
  { id: 'rest', group: 'intimacy', gate: 'adults', title: '同坐或同卧', file: 'rest.md', pattern: /同床|并排躺|枕在|躺进/ },
  { id: 'near', group: 'intimacy', gate: 'adults', title: '靠近', file: 'near.md', pattern: /靠近|对视|贴着|牵手|十指/ },
];

function agesOf(text) {
  return [ ...String(text || '').matchAll(/(\d{1,3})\s*岁/g) ]
    .map(item => Number(item[1]))
    .filter(age => age >= 0 && age <= 120);
}

function underageCue(text) {
  const source = String(text || '');
  if (/十几岁|未成年|婴儿|幼童|小孩|孩童|少女|少年/.test(source)) return true;
  if (UNDER_CN.test(source)) return true;
  return agesOf(source).some(age => age < 21);
}

function adultsConfirmed(text) {
  const source = String(text || '');
  if (underageCue(source)) return false;
  const ages = agesOf(source);
  if (ages.length && ages.every(age => age >= 21)) return true;
  return ADULT_CN.test(source);
}

function shotText(shot) {
  if (!shot || typeof shot !== 'object') return '';
  return [
    shot.description,
    shot.dialogue,
    shot.draft_positive_zh,
    shot.roster_text,
    shot.asset_facts,
  ].map(item => String(item || '')).join('\n');
}

function collectText(shots) {
  const list = Array.isArray(shots) ? shots : [ shots ];
  return list.map(shotText).join('\n');
}

function intimacySource(shot) {
  return [ shot?.description, shot?.dialogue ].map(item => String(item || '')).join('\n');
}

function sexualAct(shots) {
  const list = Array.isArray(shots) ? shots : [ shots ];
  return list.some(shot => SEXUAL_ACT.test(intimacySource(shot)));
}

function peopleOf(shots) {
  const list = Array.isArray(shots) ? shots : [ shots ];
  const seen = new Set();
  const names = [];
  list.forEach(shot => {
    const source = [ shot?.description, shot?.dialogue, shot?.asset_facts ].map(item => String(item || '')).join('\n');
    for (const match of source.matchAll(/(?:人物|角色)「([^」]+)」/g)) {
      const name = String(match[1] || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  });
  return names;
}

function characterLine(shots) {
  const people = peopleOf(shots);
  if (!people.length) return '这一镜没有人物卡姓名。动作只用镜头描述里已经写出的人名，不要另编人物。';
  return `出场人物：${people.join('、')}。每一拍的动作都写在这些人身上，点名是谁的手、臂、髋、膝在移动。`;
}

function readPack(file) {
  return fs.readFileSync(path.join(__dirname, 'packs', file), 'utf8').trim();
}

function phrasePairs() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'phraseMap.json'), 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    return Object.entries(data)
      .map(([ from, to ]) => [ String(from || '').trim(), String(to || '').trim() ])
      .filter(([ from, to ]) => from && to && from !== to)
      .sort((left, right) => right[0].length - left[0].length);
  } catch {
    return [];
  }
}

function applyPhraseMap(text) {
  const source = String(text || '');
  const pairs = phrasePairs();
  if (!source || !pairs.length) return source;
  return source.split(/(「[^」]*」)/).map(part => {
    if (part.startsWith('「')) return part;
    return pairs.reduce((next, [ from, to ]) => next.split(from).join(to), part);
  }).join('');
}

function matchActions(text) {
  const adult = adultsConfirmed(text);
  return CATALOG.filter(item => item.pattern.test(text)).map(item => {
    const allowed = item.gate !== 'adults' || adult;
    return {
      id: item.id,
      group: item.group,
      title: item.title,
      allowed,
      reason: allowed ? '' : '未写明双方都已满二十一岁，或出现未满二十一岁',
    };
  });
}

function sexualBlock(shots, options = {}) {
  const list = Array.isArray(shots) ? shots : [ shots ];
  const confirmed = options.confirmed === true || sexualAct(list);
  if (!confirmed) {
    return '这一镜没有描述性爱。视频、首帧、尾帧沿用常规稿，不要补身体接触，也不要调用性爱模版。';
  }
  const who = characterLine(list);
  if (!adultsConfirmed(collectText(list))) {
    return [
      '这一镜写了性爱，但没有确认双方都满二十一岁。不要调用性爱模版，不要补身体接触。',
      who,
      readPack('plain.md'),
    ].join('\n\n');
  }
  const extra = matchActions(collectText(list)).filter(item => item.allowed && item.id !== 'hold');
  const parts = [
    '这一镜已确认是性爱互动。按模版写紧密的动作：起始姿态、肢体路径和结束姿态都落在点名的人身上。不要写成没有人名的慢动作，不要用比喻代替关节。',
    who,
    fs.readFileSync(path.join(__dirname, 'body.md'), 'utf8').trim(),
    `【动作模版·握住、进入或停下】\n${readPack('hold.md')}`,
  ];
  extra.forEach(item => {
    const spec = CATALOG.find(row => row.id === item.id);
    parts.push(`【动作模版·${item.title}】\n${readPack(spec.file)}`);
  });
  parts.push([
    '—— 男女体征知识库 ——',
    '下面的名称只用来写镜头里已经出现的部位。没写到的部位不要补进画面。',
    fs.readFileSync(path.join(__dirname, 'anatomy.md'), 'utf8').trim(),
  ].join('\n'));
  return parts.join('\n\n');
}

function anatomyBlock(shots) {
  const text = collectText(shots);
  if (!adultsConfirmed(text)) return '';
  const allowed = matchActions(text).some(item => item.allowed && item.group === 'intimacy');
  if (!allowed) return '';
  return [
    '—— 男女体征知识库 ——',
    '下面的名称只用来写镜头里已经出现的部位。没写到的部位不要补进画面。',
    fs.readFileSync(path.join(__dirname, 'anatomy.md'), 'utf8').trim(),
  ].join('\n');
}

function actionBlock(shots) {
  const hits = matchActions(collectText(shots));
  if (!hits.length) return '';
  const applied = hits.filter(item => item.allowed);
  const blocked = hits.filter(item => !item.allowed);
  const parts = [ '—— 公共动作知识库 ——' ];
  if (applied.length) {
    parts.push(fs.readFileSync(path.join(__dirname, 'body.md'), 'utf8').trim());
    applied.forEach(item => {
      const spec = CATALOG.find(row => row.id === item.id);
      parts.push(`【动作模版·${item.title}】\n${readPack(spec.file)}`);
    });
  }
  if (blocked.length) {
    parts.push([
      '这些动作命中了镜头，但使用条件不满足，不要按亲密模版补写身体接触：',
      blocked.map(item => `${item.title}（${item.reason}）`).join('；'),
      readPack('plain.md'),
    ].join('\n'));
  }
  return parts.join('\n\n');
}

module.exports = {
  CATALOG,
  adultsConfirmed,
  underageCue,
  matchActions,
  sexualAct,
  peopleOf,
  sexualBlock,
  actionBlock,
  anatomyBlock,
  applyPhraseMap,
};
