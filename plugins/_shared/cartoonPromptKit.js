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
    '每一条 shot = 一段 8—15 秒剧情视频（优先 10 秒），不是约 4 秒的单一切镜；段内可多次切景别/运镜，时间轴必须从 0.0 连续写到 duration_sec。',
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

function buildPromptSystemPrompt(basePrompt, input = {}) {
  const isXianxia = detectXianxia(input);
  const styleCatalog = readRef('style-catalog.md');
  const xianxiaRef = isXianxia ? readRef('xianxia-15s.md') : '';
  const generalRefs = [
    [ '分镜10-15s 中与画面提示词 / 负面约束 / 连续性相关的完整原文', readRef('shot-10-15s.md') ],
    [ 'Seedance2.5 中与执行段提示词 / 表演 / 防错相关的完整原文', readRef('seedance-2.5.md') ],
  ];
  if (isXianxia && xianxiaRef) {
    generalRefs.push([ '修仙15漫剧提示词完整原文（修仙场景强制）', xianxiaRef ]);
  }

  const refsText = generalRefs
    .filter(([, text ]) => text)
    .map(([ title, text ]) => `===== ${title} 开始 =====\n${text}\n===== ${title} 结束 =====`)
    .join('\n\n');

  return [
    String(basePrompt || '').trim(),
    '',
    '—— 本平台产出优先级（高于附录精简条款）——',
    'positive_zh 开头写一次【风格】【场记】【时长】。每一个时间片内部都要写画面、对白、光影、表演、动态、承接，不要只在整段末尾各写一次。对白原句写进该时间片，production_note 只核对对白并写音效。',
    '每一条对应一段 8—15 秒视频；【时间轴】从 0.0 连续写到 duration_sec，段内可多次切镜，禁止拆成互不衔接的 4 秒碎片。',
    '写这一镜看得见的内容，不要把章节原文再贴进提示词。整段必须是闭合 JSON，写完 negative_zh 就结束。',
    '附录中「提示词压缩」「不超过3200字」「台词不超过30字」等精简条款不适用。',
    '',
    '—— 风格与题材路由（补充）——',
    '当前是否修仙：' + (isXianxia ? '是' : '否'),
    '画面风格 value：' + String(input.visual_style || ''),
    '画面风格展示名：' + String(input.visual_style_label || ''),
    '画面风格提示词描述（写入 positive_zh 时必须明确写出，不可只写短标签）：' + String(input.visual_style_prompt || input.visual_style_label || input.visual_style || ''),
    '示例格式：色粉画【柔和朦胧，适合肖像，粉质感】；作为提示词时写清“色粉画风格：柔和朦胧，适合肖像，粉质颗粒触感……”',
    '',
    styleCatalog ? `===== 风格大全（完整原文）开始 =====\n${styleCatalog}\n===== 风格大全（完整原文）结束 =====` : '',
    '',
    '—— 实用性参考文档（只允许原样遵守与落实，禁止优化删减简化）——',
    refsText,
  ].filter(Boolean).join('\n');
}

module.exports = {
  detectXianxia,
  loadStoryboardRefs,
  buildStoryboardSystemPrompt,
  buildPromptSystemPrompt,
  readRef,
};
