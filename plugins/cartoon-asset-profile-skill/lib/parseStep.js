'use strict';

const { readJsonObject } = require('../../_shared/productionSource');

const TONES = new Set([ '正向', '负向', '中性' ]);
const PERSON_SLOTS = [ '性别', '年龄', '身高', '体态', '脸型', '眉眼', '鼻唇', '发型', '肤色', '服装' ];
const SCENE_SLOTS = [ '空间', '尺度', '陈设', '光线' ];

function clean(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function placeName(value) {
  return clean(value, 24)
    .replace(/^(内|外)(?:景)?[·•]/, '')
    .replace(/[·•](晨|日|昏|夜)$/, '')
    .trim();
}

function slotOf(raw, body) {
  const rawText = String(raw?.text || '').replace(/\s+/g, ' ').trim();
  if (!rawText || rawText.length > 60 || /[。！？]/.test(rawText)) return null;
  const text = clean(rawText, 60);
  const evidence = clean(raw?.evidence, 24);
  const fromText = raw?.source === '原文'
    && evidence
    && evidence.length <= 24
    && !/[。！？]/.test(evidence)
    && String(body || '').includes(evidence);
  return {
    text,
    source: fromText ? '原文' : '轻推',
    basis: fromText ? evidence : clean(raw?.basis, 24),
  };
}

const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNDERAGE_WORD = /未成年|婴儿|幼童|小孩|孩童|少女|少年|十几岁/;

function agesIn(text) {
  const source = String(text || '');
  const found = [ ...source.matchAll(/(\d{1,3})\s*岁/g) ]
    .map(item => Number(item[1]))
    .filter(age => age >= 0 && age <= 120);
  const spans = [];
  const teen = /([一二三四五六七八九])?十([一二三四五六七八九])?岁/g;
  let matched = teen.exec(source);
  while (matched) {
    const tens = matched[1] ? CN_DIGIT[matched[1]] * 10 : 10;
    const ones = matched[2] ? CN_DIGIT[matched[2]] : 0;
    found.push(tens + ones);
    spans.push([ matched.index, matched.index + matched[0].length ]);
    matched = teen.exec(source);
  }
  const single = /([一二三四五六七八九])岁/g;
  matched = single.exec(source);
  while (matched) {
    const inside = spans.some(([ start, end ]) => matched.index >= start && matched.index < end);
    if (!inside) found.push(CN_DIGIT[matched[1]]);
    matched = single.exec(source);
  }
  return found;
}

function nameSentences(body, name) {
  const source = String(body || '');
  if (!name || !source.includes(name)) return [];
  return source.split(/[。！？\n]/).filter(sentence => sentence.includes(name));
}

function floorAvAge(character, body) {
  const sentences = nameSentences(body, character.name);
  const stated = sentences.flatMap(sentence => agesIn(sentence));
  if (sentences.some(sentence => UNDERAGE_WORD.test(sentence)) || stated.some(age => age < 21)) {
    return character;
  }
  const written = agesIn(character.slots?.年龄?.text);
  if (written.length && written.every(age => age >= 21)) return character;
  if (stated.length && stated.every(age => age >= 21)) {
    return {
      ...character,
      slots: {
        ...character.slots,
        年龄: { text: `${Math.min(...stated)}岁`, source: '轻推', basis: '正文岁数' },
      },
    };
  }
  return {
    ...character,
    slots: {
      ...character.slots,
      年龄: { text: '21岁', source: '轻推', basis: 'AV至少二十一岁' },
    },
  };
}

function slotsOf(raw, labels, body) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const slots = {};
  labels.forEach(label => {
    const slot = slotOf(source[label], body);
    if (slot) slots[label] = slot;
  });
  return slots;
}

function parseProfileStep(rawText, context = {}) {
  const parsed = readJsonObject(rawText);
  const body = String(context.input?.body || '');
  const avMode = context.input?.av_mode === true || context.input?.av_mode === 1 || context.input?.av_mode === '1' || context.input?.av_mode === 'true';
  const parsedOk = Array.isArray(parsed.characters) || Array.isArray(parsed.scenes);
  const characters = [];
  const seenPeople = new Set();
  for (const item of Array.isArray(parsed.characters) ? parsed.characters : []) {
    const name = clean(item?.name, 16);
    if (!name || seenPeople.has(name) || /^(众人|路人|群众|他|她|它)$/.test(name)) continue;
    seenPeople.add(name);
    const character = {
      name,
      tone: TONES.has(item?.tone) ? item.tone : '中性',
      tone_words: clean(item?.tone_words, 16),
      slots: slotsOf(item?.slots, PERSON_SLOTS, body),
      chapter_costume: clean(item?.chapter_costume, 80),
    };
    characters.push(avMode ? floorAvAge(character, body) : character);
    if (characters.length >= 24) break;
  }
  const scenes = [];
  const seenPlaces = new Set();
  for (const item of Array.isArray(parsed.scenes) ? parsed.scenes : []) {
    const name = placeName(item?.name);
    if (!name || seenPlaces.has(name)) continue;
    seenPlaces.add(name);
    scenes.push({
      name,
      slots: slotsOf(item?.slots, SCENE_SLOTS, body),
    });
    if (scenes.length >= 16) break;
  }
  const reply = parsedOk
    ? `人物 ${characters.length}，场景 ${scenes.length}`
    : '没有读成资产描述';
  return {
    continue: false,
    done: parsedOk,
    thinking: clean(parsed.thinking, 200),
    reply,
    summary: reply,
    characters,
    scenes,
  };
}

module.exports = { parseProfileStep, PERSON_SLOTS, SCENE_SLOTS };
