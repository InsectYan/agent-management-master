'use strict';

const PURPOSES = new Set([ '推进剧情', '揭示人物', '制造冲突', '埋设伏笔', '释放信息' ]);
const TITLE_RE = /^(内|外)(?:景)?·[^·/／、,，]{1,24}·(晨|日|昏|夜)$/;
const CAMERA_RE = /特写|近景|中景|全景|远景|大特写|极远景|内景|外景|运镜|推镜|拉镜|摇镜|跟镜|镜头/;
const MARK_RE = /【\s*场景\s*[0-9０-９一二三四五六七八九十百千]+\s*[：:][^】]{0,30}】/g;
const QUOTE_RES = [
  /「([^」]{2,80})」/g,
  /“([^”]{2,80})”/g,
  /"([^"\n]{2,80})"/g,
];

function textOf(value) {
  return String(value || '').trim();
}

function extractQuotes(text) {
  const found = [];
  const source = String(text || '');
  QUOTE_RES.forEach(re => {
    const flags = new RegExp(re.source, 'g');
    let matched = flags.exec(source);
    while (matched) {
      const line = String(matched[1] || '').trim();
      if (line) found.push(line);
      matched = flags.exec(source);
    }
  });
  return found;
}

const AGE_RE = /岁|少年|青年|中年|老年|幼|婴儿|小孩|孩童|少女|少妇|老者/;
const HAIR_RE = /头发|发型|发丝|短发|长发|光头|秀发|胎发/;
const CLOTH_RE = /白衣|青衣|黑衣|红衣|紫衣|黄衣|蓝衣|绿衣|灰衣|素衣|锦衣|布衣|道衣|法衣|战衣|(?<!另)外衣|内衣|衣裳|衣衫|衣袍|袍|衫|裙|裤|靴|襟|袖|冠|襁褓|铠甲|甲胄|盔甲|战甲|披甲/;
const LOOK_SLOTS = [
  [ '年纪', AGE_RE, /正文未写(?:年纪|年龄|外形)/ ],
  [ '发型', HAIR_RE, /正文未写(?:发型|外形)/ ],
  [ '服装', CLOTH_RE, /正文未写(?:服装|外形)/ ],
];

function stripMissingMarks(text) {
  return text.replace(/正文未写(?:外形|年纪|年龄|发型|服装)/g, '');
}

const ACTION_RE = /脱|解|扯|撩|摸|抚|吻|抱|舔|吸|伸|哼|喘|软|阻止|兴奋|站|走|跑|坐|躺|说|道|问|笑|进|出|拉|推|打|杀|飞|落/;
const PLOT_RE = /望|瞅|盯|瞧|看向|注视|打量|身下|胴体|诱人/;
const MOTION_RE = /吹动|飘扬|飘起|飘动|迎面|而来|降生|就要|即将|走来|跑来/;
const POSTURE_RE = /身材|体态|修长|高挑|魁梧|瘦削|白皙|肤色|冰肌|雪肤/;

function lookClauses(text) {
  return String(text || '')
    .split(/[。！？\n，,、；;]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function isPortrait(clause) {
  const text = String(clause || '').trim();
  if (!text || text.length > 40) return false;
  if (/正文未写/.test(text)) return false;
  if (/^(以及|还有|并且|同时|另外)/.test(text)) return false;
  if (ACTION_RE.test(text) || PLOT_RE.test(text) || MOTION_RE.test(text)) return false;
  return AGE_RE.test(text) || HAIR_RE.test(text) || CLOTH_RE.test(text) || POSTURE_RE.test(text);
}

function statedClause(body, name, evidence) {
  if (!name) return '';
  const sentences = String(body || '').split(/[。！？\n]/);
  for (const sentence of sentences) {
    if (!sentence.includes(name)) continue;
    if (PLOT_RE.test(sentence)) continue;
    const hit = lookClauses(sentence).find(clause => isPortrait(clause) && evidence.test(clause));
    if (hit) return hit;
  }
  return '';
}

function bodyHasNear(body, name, pattern) {
  return Boolean(statedClause(body, name, pattern));
}

function tidyLook(look) {
  const normalized = String(look || '')
    .replace(/年纪正文未写/g, '正文未写年纪')
    .replace(/发型正文未写/g, '正文未写发型')
    .replace(/服装正文未写/g, '正文未写服装')
    .replace(/外形正文未写/g, '正文未写外形');
  const parts = normalized.split(/([，,、；;。！？\n])/);
  const kept = [];
  for (let index = 0; index < parts.length; index += 2) {
    const clause = String(parts[index] || '').trim();
    if (!clause) continue;
    if (/正文未写/.test(clause)) {
      kept.push(clause);
      continue;
    }
    const appearance = AGE_RE.test(clause) || HAIR_RE.test(clause) || CLOTH_RE.test(clause) || POSTURE_RE.test(clause);
    if (!appearance || ACTION_RE.test(clause) || clause.length > 40) continue;
    kept.push(clause);
  }
  return kept.join('，').replace(/^[，\s]+|[，\s]+$/g, '').trim();
}

function portraitClauses(text) {
  return lookClauses(stripMissingMarks(text)).filter(isPortrait);
}

function lookIssues(name, look, body) {
  const raw = textOf(look).trim();
  const issues = [];
  const found = [];
  LOOK_SLOTS.forEach(([ label, evidence ]) => {
    const clause = statedClause(body, name, evidence);
    if (!clause) return;
    found.push(clause);
    if (!raw.includes(clause)) issues.push(`${name}的${label}正文里写了，要按原文写下，不要另编`);
  });
  const posture = statedClause(body, name, POSTURE_RE);
  if (posture && !raw.includes(posture)) issues.push(`${name}的体态正文里写了，要按原文写下，不要另编`);
  portraitClauses(raw).forEach(clause => {
    if (found.includes(clause) || clause === posture) return;
    issues.push(`${name}的外形里有正文没写的内容，不要编`);
  });
  if (!found.length && !posture && raw !== '正文未写') {
    issues.push(`${name}正文没有人物描写，look 只写「正文未写」`);
  }
  return issues;
}

/** 一场正文里标了多个「场景N」时拆开，避免十个节点只落成一条记录。 */
function splitEmbeddedScenes(scenes) {
  const list = Array.isArray(scenes) ? scenes : [];
  const out = [];
  list.forEach(scene => {
    const summary = textOf(scene?.summary);
    const marks = [ ...summary.matchAll(MARK_RE) ];
    if (marks.length < 2) {
      out.push(scene);
      return;
    }
    marks.forEach((mark, index) => {
      const start = mark.index;
      const end = index + 1 < marks.length ? marks[index + 1].index : summary.length;
      const chunk = summary.slice(start, end).replace(/^【\s*场景\s*[^】]*】/, '').trim();
      if (!chunk) return;
      out.push({ ...scene, summary: chunk });
    });
  });
  return out;
}

function collectIssues(script, body, minScenes, options = {}) {
  const issues = [];
  const data = script && typeof script === 'object' ? script : {};
  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  const characters = Array.isArray(data.characters) ? data.characters : [];
  const omissions = Array.isArray(data.omissions) ? data.omissions : [];
  if (!textOf(data.logline)) {
    issues.push('章首要有一句话故事：谁想要什么、被什么挡住、要付什么代价');
  }
  if (!scenes.length) {
    issues.push('没有可拍场次');
    return issues;
  }
  scenes.forEach((scene, index) => {
    const nth = index + 1;
    const title = textOf(scene?.title);
    const summary = textOf(scene?.summary);
    if (!TITLE_RE.test(title)) {
      issues.push(`第${nth}场标题要写成「内·地点·日」或「外·地点·夜」，只保留一个地点`);
    }
    if (!summary) {
      issues.push(`第${nth}场没有可拍正文`);
    } else if (CAMERA_RE.test(summary)) {
      issues.push(`第${nth}场写成了景别或运镜，剧本只写能看见的动作，不替分镜调度镜头`);
    } else if (!summary.includes('精髓') || !summary.includes('△')) {
      issues.push(`第${nth}场要先写「精髓：」这场的变化，再用「△」逐条写下动作路径和物件，不要收成一句结果`);
    }
    if (!PURPOSES.has(textOf(scene?.purpose))) {
      issues.push(`第${nth}场要标明功能：推进剧情、揭示人物、制造冲突、埋设伏笔、释放信息`);
    }
    if (options.requireWardrobe) {
      const wardrobe = textOf(scene?.wardrobe);
      if (!wardrobe.includes('服装统一') || !/状态[:：]/.test(wardrobe)) {
        issues.push(`第${nth}场要写服装状态：一行「服装统一：」本场每人一套衣服，一行「状态：」这一场衣服变成什么样`);
      }
    }
  });
  if (!characters.length) {
    issues.push('要列出本章实际出场的人物');
  }
  characters.forEach(item => {
    const name = textOf(item?.name) || '未命名人物';
    lookIssues(name, item?.look, body).forEach(issue => issues.push(issue));
  });
  const quotes = extractQuotes(body);
  if (quotes.length) {
    const joined = scenes.map(scene => textOf(scene?.summary)).join('\n');
    const missing = quotes.filter(line => !joined.includes(line));
    if (missing.length) {
      issues.push(`原文有 ${quotes.length} 句引语，其中 ${missing.length} 句没有留在场次里`);
    }
  }
  const floor = Number(minScenes) > 0 ? Math.round(Number(minScenes)) : 1;
  const gap = floor - scenes.length;
  if (gap > 0) {
    const covered = omissions.filter(item => textOf(item?.target) && textOf(item?.reason).length >= 8).length;
    if (covered < gap) {
      issues.push(`场次 ${scenes.length} 低于下限 ${floor}，合并掉的情节要拆开；确属删掉的，按少掉的场数逐条写入 omissions`);
    }
  }
  return issues;
}

function repairLines(script, body) {
  const data = script && typeof script === 'object' ? script : {};
  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  const characters = Array.isArray(data.characters) ? data.characters : [];
  const lines = [];
  characters.forEach(item => {
    const name = textOf(item?.name);
    if (!name) return;
    const stated = stripMissingMarks(textOf(item?.look));
    LOOK_SLOTS.forEach(([ label, evidence ]) => {
      if (!bodyHasNear(body, name, evidence) || evidence.test(stated)) return;
      const sentence = statedClause(body, name, evidence);
      if (!sentence) return;
      lines.push(`${name}的${label}按这句原文写进 look，不要改词：${sentence}`);
    });
  });
  const joined = scenes.map(scene => textOf(scene?.summary)).join('\n');
  const missing = extractQuotes(body).filter(line => !joined.includes(line));
  if (missing.length) {
    lines.push('下面这些引语按原句放进对应场次的 summary，引号只用「」，不要改词，不要漏句：');
    missing.forEach((line, index) => lines.push(`${index + 1}. ${line}`));
  }
  return lines;
}

function sourceSentence(body, name, evidence) {
  return statedClause(body, name, evidence);
}

function dropClauses(look, evidence) {
  const parts = String(look || '').split(/([，,、；;。！？\n])/);
  const kept = [];
  for (let index = 0; index < parts.length; index += 2) {
    const clause = parts[index];
    const sep = parts[index + 1] || '';
    if (!clause) continue;
    if (evidence.test(clause)) continue;
    kept.push(clause + sep);
  }
  return kept.join('').replace(/^[，,、；;\s]+|[，,、；;\s]+$/g, '').trim();
}

function fillStatedLooks(name, look, body) {
  let next = textOf(look);
  LOOK_SLOTS.forEach(([ label, evidence ]) => {
    if (!bodyHasNear(body, name, evidence)) return;
    if (evidence.test(stripMissingMarks(next))) return;
    next = next.replace(new RegExp(`正文未写(?:${label}|外形)`, 'g'), '');
    const sentence = sourceSentence(body, name, evidence);
    if (sentence && !next.includes(sentence)) next = [ next.trim(), sentence ].filter(Boolean).join('。');
  });
  return next;
}

function lockLook(name, look, body) {
  const found = [];
  const push = clause => {
    const text = String(clause || '').trim();
    if (text && !found.includes(text)) found.push(text);
  };
  LOOK_SLOTS.forEach(([ , evidence ]) => push(statedClause(body, name, evidence)));
  push(statedClause(body, name, POSTURE_RE));
  if (!found.length) return '正文未写';
  return found.join('。');
}

function placeQuotes(scenes, body) {
  const source = String(body || '');
  const quotes = extractQuotes(source);
  const next = (Array.isArray(scenes) ? scenes : []).map(scene => ({ ...scene, summary: textOf(scene?.summary) }));
  if (!quotes.length || !next.length) return next;
  const places = next.map(scene => {
    const parts = textOf(scene?.title).split('·');
    return parts.length >= 2 ? parts[1] : '';
  });
  quotes.forEach(line => {
    if (next.some(scene => scene.summary.includes(line))) return;
    const at = source.indexOf(line);
    let best = next.length - 1;
    if (at >= 0) {
      let bestAt = -1;
      places.forEach((place, index) => {
        if (!place) return;
        const pos = source.lastIndexOf(place, at);
        if (pos > bestAt) {
          bestAt = pos;
          best = index;
        }
      });
      if (bestAt < 0) best = Math.min(next.length - 1, Math.floor((at / Math.max(source.length, 1)) * next.length));
    }
    next[best].summary = `${next[best].summary}\n「${line}」`.trim();
  });
  return next;
}

function settleScript(script, body, minScenes, options = {}) {
  const data = script && typeof script === 'object' ? script : {};
  const scenes = placeQuotes(splitEmbeddedScenes(data.scenes), body);
  const characters = (Array.isArray(data.characters) ? data.characters : []).map(item => {
    const name = textOf(item?.name);
    if (!name) return item;
    return { ...item, look: lockLook(name, item?.look, body) };
  });
  const next = { ...data, scenes, characters };
  return {
    script: next,
    issues: collectIssues(next, body, minScenes, options),
  };
}

module.exports = {
  extractQuotes,
  lookIssues,
  repairLines,
  splitEmbeddedScenes,
  settleScript,
};
