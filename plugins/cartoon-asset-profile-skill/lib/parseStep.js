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
  const text = clean(raw?.text, 80);
  if (!text) return null;
  const evidence = clean(raw?.evidence, 80);
  const fromText = raw?.source === '原文' && evidence && String(body || '').includes(evidence);
  return {
    text,
    source: fromText ? '原文' : '轻推',
    basis: fromText ? evidence : clean(raw?.basis, 40),
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
  const parsedOk = Array.isArray(parsed.characters) || Array.isArray(parsed.scenes);
  const characters = [];
  const seenPeople = new Set();
  for (const item of Array.isArray(parsed.characters) ? parsed.characters : []) {
    const name = clean(item?.name, 16);
    if (!name || seenPeople.has(name) || /^(众人|路人|群众|他|她|它)$/.test(name)) continue;
    seenPeople.add(name);
    characters.push({
      name,
      tone: TONES.has(item?.tone) ? item.tone : '中性',
      tone_words: clean(item?.tone_words, 16),
      slots: slotsOf(item?.slots, PERSON_SLOTS, body),
      chapter_costume: clean(item?.chapter_costume, 80),
    });
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
