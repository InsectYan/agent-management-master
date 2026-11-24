'use strict';

const fs = require('fs');
const path = require('path');

const REFS_DIR = path.join(__dirname, 'cartoonRefs');

const XIANXIA_STYLE_VALUES = new Set([
  '3d-guofeng-xuanhuan',
  '3d-neo-guofeng',
  'guofeng-illust',
  'ink-concept',
  'film-xuanhuan-guofeng',
  'xianxia',
  'ink-wuxia',
  'guofeng',
  'neo-guofeng',
  'gongbi',
  'ink',
  'dunhuang',
]);

const XIANXIA_TEXT_RE = /修仙|仙侠|玄幻|神魔|飞升|灵气|御剑|丹药|宗门|法宝|法器|灵根|渡劫|筑基|金丹|元婴|化神|凡人修仙|仙门|灵石|剑修|体修/;

function readRef(name) {
  const filePath = path.join(REFS_DIR, name);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8').trim();
}

function detectXianxia(input = {}) {
  if (input.is_xianxia === true || input.is_xianxia === 1 || input.is_xianxia === '1' || input.is_xianxia === 'true') {
    return true;
  }
  if (input.is_xianxia === false || input.is_xianxia === 0 || input.is_xianxia === '0' || input.is_xianxia === 'false') {
    return false;
  }
  const styleValue = String(input.visual_style || '').trim();
  if (XIANXIA_STYLE_VALUES.has(styleValue)) return true;
  const text = [
    styleValue,
    input.visual_style_label,
    input.visual_style_prompt,
    input.genre,
    input.genre_subcategory,
    input.novel_type,
    input.title,
    input.summary,
    input.story_overview,
    input.chapter_title,
    input.body,
  ].filter(Boolean).join('\n');
  return XIANXIA_TEXT_RE.test(text);
}

function loadStoryboardRefs(isXianxia) {
  const blocks = [
    [ '分镜10-15s 总控母指令（完整原文，禁止删减简化）', readRef('shot-10-15s.md') ],
    [ 'Seedance2.5 漫剧分镜构建师（完整原文，禁止删减简化）', readRef('seedance-2.5.md') ],
  ];
  if (isXianxia) {
    blocks.push([ '修仙15漫剧提示词（完整原文，禁止删减简化；当前为修仙场景必须启用）', readRef('xianxia-15s.md') ]);
  }
  return blocks
    .filter(([, text ]) => text)
    .map(([ title, text ]) => `===== ${title} 开始 =====\n${text}\n===== ${title} 结束 =====`)
    .join('\n\n');
}

function buildStoryboardSystemPrompt(basePrompt, input = {}) {
  const isXianxia = detectXianxia(input);
  const refs = loadStoryboardRefs(isXianxia);
  const route = isXianxia
    ? [
      '当前场景判定：修仙 / 仙侠 / 玄幻神魔。',
      '必须同时遵守下方三份完整参考文档，其中《修仙15漫剧提示词》对时长、特效、兵器法宝、站位人数锁定、画面活化与粒子爆发具有强制约束力。',
      '非冲突时以修仙模板的 15 秒分镜细化为优先执行细则；连续性、台词逐字锁、空间锚点、AI 生成稳定性等总控规则仍全部保留，不得省略。',
    ].join('\n')
    : [
      '当前场景判定：非修仙。',
      '必须遵守下方《分镜10-15s》与《Seedance2.5漫剧分镜构建师》完整原文。',
      '不要套用修仙专用的法宝 / 神兽 / 灵气粒子爆发模板，除非剧情原文明确出现。',
    ].join('\n');

  return [
    String(basePrompt || '').trim(),
    '',
    '—— 本平台产出优先级（高于附录精简条款）——',
    '描写必须丰富、动人、场景齐全。镜头描述和提示词不设字数上限；对白密集时单条写到数千字，把过程写全。',
    '每一条 shot = 一段 5—12 秒的剧情视频，秒数按这段剧情需要取，5 到 12 都成立。时间轴必须从 0.0 连续写到 duration_sec。动作密、变化快或多次切镜时，时间轴按 0.5 秒一档写细，段数不设上限。一镜到底时保持一条运镜，并在各档里把动作路径写清。',
    '附录中「提示词压缩」「不超过3200字」「台词不超过30字」「短句」等以精简为主的条款，对本平台产出不适用。',
    '冲突时以输出合同的完整时间轴、光影、动作、站位、表演、对白备注为准。',
    '',
    '—— 题材路由（补充，不替代下方原文）——',
    route,
    'is_xianxia：' + (isXianxia ? 'true' : 'false'),
    'visual_style：' + String(input.visual_style || ''),
    'visual_style_label：' + String(input.visual_style_label || ''),
    'visual_style_prompt：' + String(input.visual_style_prompt || ''),
    'genre：' + String(input.genre || ''),
    'genre_subcategory：' + String(input.genre_subcategory || ''),
    '',
    '—— 实用性参考文档（只允许原样遵守与落实，禁止优化删减简化）——',
    refs,
  ].filter(Boolean).join('\n');
}

function requirementBlock(text) {
  const requirement = String(text || '').trim();
  if (!requirement) return '';
  return [
    '要求提示是这次必须参考的额外说明。写视频提示词、首帧、尾帧时都要落到画面里，不要漏掉，也不要改写成旁白。',
    `要求提示：${requirement}`,
    '它和上面的合同冲突时，画面内容按要求提示改。对白原句、时长和项目画面风格仍然保留。',
  ].join('\n');
}

function buildPromptSystemPrompt(basePrompt, input = {}) {
  const isXianxia = detectXianxia(input);
  return [
    String(basePrompt || '').trim(),
    '',
    '—— 本平台产出优先级 ——',
    'positive_zh 是视频模型的拍摄指令，不是故事复述。开头写一次【风格】【场记】【时长】。每一段内部都要写画面、对白、光影、表演、动态、承接。shot.dialogue 里的原句必须原样留在对应段的对白里。心理描写收成眉、眼、视线、呼吸，不要把情节总结写进画面。',
    '秒数用这一镜的 duration_sec，不要改成别的区间。【时间轴】从 0.0 连续写到 duration_sec，时间可以细到 0.5 秒。段数不设上限。动作变化多、快，或有多次切镜时按每次变化切开。一镜到底保持一条运镜，档内仍写清姿态路径和表情变化。多段而且需要连着拍时，后一段写承接上一片段。各段时间首尾相接，仍是同一条视频。',
    '画面、对白、光影、表演、动态、承接都按格式写全。写完再闭合 JSON，不要写到一半就停，也不要用一段概述代替这些栏。',
    '',
    '—— 风格与题材 ——',
    '当前是否修仙：' + (isXianxia ? '是。落实修仙特效、动态和人数锁定，不要硬删粒子与氛围。' : '否。不要硬塞灵气法宝。'),
    '画面风格 value：' + String(input.visual_style || ''),
    '画面风格展示名：' + String(input.visual_style_label || ''),
    '画面风格提示词描述（写入 positive_zh 的【风格】时必须明确写出，不可只写短标签）：' + String(input.visual_style_prompt || input.visual_style_label || input.visual_style || ''),
    '【风格】先写画风公式说明，再写风格层。皮肤、光线、景深、色彩按画风公式留全，不能只留风格层那一段。',
  ].filter(Boolean).join('\n');
}

module.exports = {
  detectXianxia,
  loadStoryboardRefs,
  buildStoryboardSystemPrompt,
  buildPromptSystemPrompt,
  requirementBlock,
  readRef,
};
