'use strict';

const {
  parseDocument,
  formatEndpointCatalog,
  extractApiEndpointDetails,
} = require('./docParser');
const { llmChat, extractJsonObject, llmAvailable } = require('../../../app/lib/llm/chat');
const { resolveLlmTimeout } = require('../../../app/lib/llm/localLlm');

/** 合计条数硬顶（可用 TESTGEN_ESTIMATE_MAX_TOTAL 覆盖） */
const ESTIMATE_MAX_TOTAL = Number(process.env.TESTGEN_ESTIMATE_MAX_TOTAL || 8000);

/** 以下比例仅用于 Agent 失败时的启发式回落，不作为 AI 成功时的抬升下限 */
const ERROR_SAMPLE_RATIO = Number(process.env.TESTGEN_ESTIMATE_ERROR_RATIO || 0.35);
const ERROR_SAMPLE_MIN = Number(process.env.TESTGEN_ESTIMATE_ERROR_MIN || 3);
const PERF_SAMPLE_MAX = Number(process.env.TESTGEN_ESTIMATE_PERF_MAX || 5);
const PERF_SAMPLE_RATIO = Number(process.env.TESTGEN_ESTIMATE_PERF_RATIO || 0.08);

/** @deprecated 兼容导出 */
const CASES_PER_ENDPOINT_PER_TARGET = 1;

function countUniqueMatches(text, pattern, normalize) {
  const matches = text.match(pattern) || [];
  const seen = new Set();
  for (const raw of matches) {
    const value = (normalize ? normalize(raw) : raw).toLowerCase();
    if (value) seen.add(value);
  }
  return seen.size;
}

function normalizeEndpointPath(path) {
  return String(path || '')
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '')
    .trim();
}

function applyEstimateBounds(estimated, targetCount) {
  const targets = Math.max(Number(targetCount) || 1, 1);
  return Math.max(targets, Math.min(Math.round(estimated), ESTIMATE_MAX_TOTAL));
}

/** 仅封顶、不抬升（AI 主导路径） */
function clampEstimateCap(n) {
  return Math.max(0, Math.min(Math.round(Number(n) || 0), ESTIMATE_MAX_TOTAL));
}

function distributeEstimateEvenly(total, targetCount) {
  const n = Math.max(1, Math.round(Number(targetCount) || 1));
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  if (safeTotal <= 0) return Array.from({ length: n }, () => 0);
  const base = Math.floor(safeTotal / n);
  let remainder = safeTotal - base * n;
  return Array.from({ length: n }, () => {
    if (remainder > 0) {
      remainder -= 1;
      return base + 1;
    }
    return base;
  });
}

function scaleBreakdownToTotal(breakdownRaw, estimated) {
  const rawTotal = breakdownRaw.reduce((s, n) => s + n, 0);
  if (rawTotal <= 0) return distributeEstimateEvenly(estimated, breakdownRaw.length || 1);
  if (rawTotal === estimated) return breakdownRaw.slice();
  const scale = estimated / rawTotal;
  let breakdown = breakdownRaw.map(n => Math.max(0, Math.floor(n * scale)));
  let sum = breakdown.reduce((s, n) => s + n, 0);
  let i = 0;
  while (sum < estimated && i < breakdown.length * 8) {
    breakdown[i % breakdown.length] += 1;
    sum += 1;
    i += 1;
  }
  while (sum > estimated && breakdown.some(n => n > 0)) {
    const idx = breakdown.findIndex(n => n > 0);
    if (idx < 0) break;
    breakdown[idx] -= 1;
    sum -= 1;
  }
  return breakdown;
}

function endpointMethod(ep) {
  if (!ep) return '';
  if (typeof ep === 'string') return String(ep).trim().split(/\s+/)[0].toUpperCase();
  return String(ep.method || '').toUpperCase();
}

function countMutatingEndpoints(endpoints) {
  const list = Array.isArray(endpoints) ? endpoints : [];
  let n = 0;
  for (const ep of list) {
    const m = endpointMethod(ep);
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') n += 1;
  }
  return n;
}

function classifyTargetKind(target = {}) {
  const blob = [
    target.scheme_id,
    target.scheme_name,
    target.validation_id,
    target.validation_name,
    target.category_major_id,
    target.category_major_name,
    target.template_code,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/ts-09|load|perf|压测|性能|并发|吞吐|qps|stress|benchmark|latency|tps/.test(blob)) {
    return 'perf';
  }
  if (/异常|negative|error|fault|chaos|边界|bound|invalid|fail|拒|驳回|鉴权失败/.test(blob)) {
    return 'error_focus';
  }
  return 'functional';
}

function sampleErrorCount(endpointCount, endpoints) {
  const eps = Math.max(0, Math.round(Number(endpointCount) || 0));
  if (eps <= 0) return 0;
  const mutating = countMutatingEndpoints(endpoints);
  const pool = Math.max(mutating, Math.ceil(eps * 0.4));
  const raw = Math.ceil(pool * ERROR_SAMPLE_RATIO);
  return Math.min(eps, Math.max(Math.min(ERROR_SAMPLE_MIN, eps), raw));
}

function samplePerfCount(endpointCount) {
  const eps = Math.max(0, Math.round(Number(endpointCount) || 0));
  if (eps <= 0) return 0;
  return Math.max(1, Math.min(PERF_SAMPLE_MAX, Math.ceil(eps * PERF_SAMPLE_RATIO)));
}

/** 仅启发式回落用 */
function casesForTarget(endpointCount, endpoints, target) {
  const eps = Math.max(0, Math.round(Number(endpointCount) || 0));
  const kind = classifyTargetKind(target);
  if (eps <= 0) {
    return { count: 1, kind, detail: '无接口清单时保底 1 条' };
  }
  if (kind === 'perf') {
    const n = samplePerfCount(eps);
    return { count: n, kind, detail: `性能/并发抽样 ${n}` };
  }
  if (kind === 'error_focus') {
    const n = Math.min(eps, Math.max(sampleErrorCount(eps, endpoints), Math.ceil(eps * 0.5)));
    return { count: n, kind, detail: `异常焦点抽样 ${n}` };
  }
  const happy = Math.max(1, Math.ceil(eps * 0.4));
  const error = sampleErrorCount(eps, endpoints);
  return {
    count: happy + error,
    kind,
    detail: `回落启发式：主路径抽样 ${happy}+异常 ${error}（非强制全覆盖）`,
  };
}

function tieredCoverageEstimate(endpointCount, endpoints, schemeTargets) {
  const eps = Math.max(0, Math.round(Number(endpointCount) || 0));
  const targets = Array.isArray(schemeTargets) && schemeTargets.length
    ? schemeTargets
    : [ { scheme_id: 'functional' } ];
  if (eps <= 0) return null;

  const perTargetMeta = targets.map(t => casesForTarget(eps, endpoints, t));
  const breakdownRaw = perTargetMeta.map(m => m.count);
  const rawTotal = breakdownRaw.reduce((s, n) => s + n, 0);
  const estimated = applyEstimateBounds(rawTotal, targets.length);
  const breakdown = rawTotal > estimated && rawTotal > 0
    ? scaleBreakdownToTotal(breakdownRaw, estimated)
    : breakdownRaw;

  return {
    estimated_count: estimated,
    per_target: breakdown.length ? Math.round(estimated / breakdown.length) : estimated,
    target_breakdown: breakdown,
    soft_floor: 0,
    per_target_meta: perTargetMeta,
    formula_hint: perTargetMeta.map((m, i) => `目标${i + 1}[${m.kind}] ${m.detail}`).join('；'),
  };
}

function softCoverageFloor() {
  return 0;
}

function coverageEstimateFromEndpoints(endpointCount, targetCount, endpoints = [], schemeTargets) {
  const targets = Array.isArray(schemeTargets) && schemeTargets.length
    ? schemeTargets
    : Array.from({ length: Math.max(1, Math.round(Number(targetCount) || 1)) }, () => ({ scheme_id: 'functional' }));
  return tieredCoverageEstimate(endpointCount, endpoints, targets);
}

function analyzeDocumentHeuristic(content, schemeTargets) {
  const text = content || '';
  const len = text.length;
  const sectionCount = (text.match(/^#{1,3}\s+/gm) || []).length;
  const parsedEndpoints = extractApiEndpointDetails(text);
  const uniqueApiOps = parsedEndpoints.length;
  const rawApiMethodCount = (text.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/gi) || []).length;
  const rawEndpointCount = (text.match(/\/[a-zA-Z0-9_\-/{:?=.&]+/g) || []).length;
  const uniqueEndpoints = uniqueApiOps || countUniqueMatches(
    text,
    /\/[a-zA-Z0-9_\-/{:?=.&]+/g,
    normalizeEndpointPath,
  );
  const listItemCount = (text.match(/^\s*[-*]\s+/gm) || []).length;
  const tableRowCount = (text.match(/^\|.+\|$/gm) || []).length;
  const codeBlockCount = Math.floor((text.match(/```/g) || []).length / 2);

  const targetN = Math.max(schemeTargets.length, 1);
  const coverage = tieredCoverageEstimate(uniqueApiOps, parsedEndpoints, schemeTargets);

  let estimated;
  let targetBreakdown;
  let formulaHint = null;

  if (coverage) {
    estimated = coverage.estimated_count;
    targetBreakdown = coverage.target_breakdown;
    formulaHint = coverage.formula_hint;
  } else {
    const endpointSignal = Math.round(
      Math.sqrt(Math.max(uniqueEndpoints, 1)) * 2.2 + Math.min(uniqueEndpoints, 64) * 0.85,
    );
    const structureSignal = Math.round(sectionCount * 1.2 + Math.sqrt(Math.max(listItemCount, 1)) * 0.5 + tableRowCount * 0.08);
    const lengthSignal = Math.round(Math.sqrt(Math.max(len, 1) / 600));
    const contentBase = Math.max(1, Math.min(
      ESTIMATE_MAX_TOTAL,
      endpointSignal + structureSignal + lengthSignal + codeBlockCount * 0.5,
    ));
    estimated = applyEstimateBounds(contentBase, targetN);
    if (len < 300) estimated = Math.min(estimated, targetN);
    targetBreakdown = distributeEstimateEvenly(estimated, targetN);
  }

  const parts = [
    `文档约 ${len} 字`,
    sectionCount ? `${sectionCount} 个章节` : null,
    uniqueApiOps ? `识别接口 ${uniqueApiOps} 个` : null,
    !uniqueApiOps && rawApiMethodCount ? `${rawApiMethodCount} 处 HTTP 方法` : null,
    !uniqueApiOps && rawEndpointCount ? `${rawEndpointCount} 处路径片段` : null,
  ].filter(Boolean);

  return {
    estimated_count: estimated,
    target_breakdown: targetBreakdown,
    endpoint_count: uniqueApiOps,
    endpoints: parsedEndpoints.map(e => e.key),
    soft_floor: 0,
    reasoning: `${parts.join('、')}；Agent 不可用时的回落建议约 ${estimated} 条${formulaHint ? `（${formulaHint}）` : ''}——正式条数应以 AI 逐行分析为准`,
    source: 'heuristic',
  };
}

/**
 * 以 LLM 按「每个生成目标行」独立判断为主；无软下限抬升；硬公式仅 Agent 失败回落
 */
async function runEstimateCaseCount({ llm, input, hooks, loopConfig }) {
  const docContent = String(input.doc_content || '');
  const schemeTargets = input.scheme_targets || input.options?.scheme_targets || [];
  const targetN = Math.max(schemeTargets.length, 1);
  const heuristic = analyzeDocumentHeuristic(docContent, schemeTargets);

  let estimatedCount = heuristic.estimated_count;
  let targetBreakdown = heuristic.target_breakdown || [];
  let reasoning = heuristic.reasoning;
  let source = heuristic.source;
  let endpointCount = heuristic.endpoint_count || 0;
  let endpoints = heuristic.endpoints || [];

  const adoptAiBreakdown = (parsed) => {
    const raw = Array.isArray(parsed?.target_breakdown)
      ? parsed.target_breakdown
      : (Array.isArray(parsed?.counts) ? parsed.counts : null);
    let parts;
    if (raw && raw.length === targetN) {
      parts = raw.map(v => clampEstimateCap(v));
    } else if (raw && raw.length > 0 && targetN === 1) {
      parts = [ clampEstimateCap(raw[0]) ];
    } else {
      const total = clampEstimateCap(parsed?.estimated_count ?? parsed?.estimate ?? parsed?.count);
      if (!(total > 0)) return null;
      parts = distributeEstimateEvenly(total, targetN);
    }
    const sum = parts.reduce((s, n) => s + n, 0);
    const cappedSum = clampEstimateCap(sum);
    if (cappedSum !== sum && cappedSum > 0) {
      parts = scaleBreakdownToTotal(parts, cappedSum);
    }
    return { total: parts.reduce((s, n) => s + n, 0), parts };
  };

  if (llmAvailable(llm)) {
    const meta = input.doc_meta || parseDocument(docContent, { title: input.doc_title });
    endpointCount = meta.endpointCount ?? (meta.endpointDetails || []).length ?? endpoints.length;
    endpoints = meta.endpoints || endpoints;
    const details = meta.endpointDetails || extractApiEndpointDetails(docContent);

    const catalog = formatEndpointCatalog(details);
    const previewLen = Number(loopConfig?.estimateDocPreviewLen) || 2500;
    const catalogMaxChars = Number(loopConfig?.estimateEndpointCatalogMaxChars) || 12000;
    const llmTimeout = resolveLlmTimeout(llm, loopConfig?.estimateLlmTimeoutMs || 45000);

    const catalogBlock = catalog
      ? `接口清单（共 ${endpointCount} 个，供判断「哪些值得测」；不必为每个接口、每个目标都生成用例）：\n${catalog.slice(0, catalogMaxChars)}`
      : '接口清单：未能结构化提取，请结合正文判断。';

    const targetLines = (schemeTargets.length ? schemeTargets : [ { scheme_id: 'default' } ])
      .map((t, i) => {
        const label = [
          t.category_major_id || t.category_major_name,
          t.scheme_id || t.scheme_name,
          t.validation_id || t.validation_name,
        ].filter(Boolean).join(' / ');
        return `${i + 1}. ${label || `目标${i + 1}`}`;
      })
      .join('\n');

    const userPrompt = [
      '你是测试用例数量估算助手。必须根据「文档实际内容」与「每一个生成目标行」的含义，分别决定该行需要多少条用例。',
      '禁止使用固定公式（例如 接口数×2、每接口必须 1 条正常、各目标均分同一总数、软下限抬升）。',
      '不要参考任何用户已填条数；只输出 JSON：',
      '{ "estimated_count": number, "target_breakdown": number[], "reasoning": string }',
      '其中 target_breakdown.length 必须等于生成目标行数；第 i 个数字是第 i 行的推荐条数；estimated_count = sum(target_breakdown)。',
      '判断原则：',
      '1) 不同大类×验证方案关注点不同，各行条数可以差很多，不要默认相同；',
      '2) 正常返回：只对文档中真正需要验收的接口估条数，不必覆盖全部接口；',
      '3) 异常/边界：仅当该行目标相关且文档有校验/错误语义时再估，抽样即可；',
      '4) 并发/性能：通常只选极少数代表性接口；',
      '5) 与该行无关的场景可以为 0 或很小。',
      `合计上限 ${ESTIMATE_MAX_TOTAL}（不要为凑上限注水）。系统不会再抬升你的数字。`,
      `文档标题：${input.doc_title || meta.title || '文档'}`,
      `文档约 ${meta.charCount || docContent.length} 字，章节约 ${meta.sectionCount || 0}，去重接口约 ${endpointCount} 个（仅背景，不是条数下限）。`,
      `生成目标共 ${schemeTargets.length || 1} 行（请逐行估条数）：\n${targetLines}`,
      catalogBlock,
      `文档正文摘录（可能截断，接口清单优先）：\n${docContent.slice(0, previewLen)}`,
      input.options?.hint ? `补充说明：${input.options.hint}` : '',
    ].filter(Boolean).join('\n\n');

    try {
      hooks?.onStatus?.({ phase: 'estimate', label: 'Agent 按目标行分析…' });
      const result = await llmChat({
        llm,
        hooks,
        messages: [
          {
            role: 'system',
            content: '仅返回 JSON。必须含与目标行数等长的 target_breakdown、estimated_count、reasoning（中文，说明各行为何是这个量）。禁止输出「每接口一条」类写死结论。',
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 800,
        timeoutMs: llmTimeout,
      });
      const parsed = extractJsonObject(result.text || '');
      const adopted = adoptAiBreakdown(parsed);
      if (adopted && adopted.parts.length === targetN) {
        estimatedCount = clampEstimateCap(adopted.total);
        targetBreakdown = adopted.parts;
        reasoning = String(parsed?.reasoning || parsed?.summary || '已按各生成目标行由 AI 分析文档给出条数');
        source = 'agent';
      } else {
        const agentEstimate = Number(parsed?.estimated_count ?? parsed?.estimate ?? parsed?.count);
        if (Number.isFinite(agentEstimate) && agentEstimate > 0) {
          estimatedCount = clampEstimateCap(agentEstimate);
          targetBreakdown = distributeEstimateEvenly(estimatedCount, targetN);
          reasoning = String(parsed?.reasoning || reasoning);
          source = 'agent';
        }
      }
    } catch (err) {
      reasoning = `LLM 估算未完成（${String(err.message || '失败').split('\n')[0].slice(0, 80)}），已回落启发式：${reasoning}`;
    }
  }

  return {
    text: reasoning,
    output: {
      action: 'estimate_case_count',
      estimated_count: estimatedCount,
      count: estimatedCount,
      estimate: estimatedCount,
      target_breakdown: targetBreakdown,
      endpoint_count: endpointCount,
      endpoints: endpoints.slice(0, 200),
      document_chars: docContent.length,
      cases_per_endpoint: CASES_PER_ENDPOINT_PER_TARGET,
      soft_floor: 0,
      estimate_strategy: source === 'agent' ? 'ai_per_target' : 'heuristic_fallback',
      reasoning,
      source,
      scheme: 'loop',
    },
    meta: {
      scheme: 'loop',
      skill_action: 'estimate_case_count',
      source,
      endpoint_count: endpointCount,
      estimate_strategy: source === 'agent' ? 'ai_per_target' : 'heuristic_fallback',
    },
  };
}

module.exports = {
  analyzeDocumentHeuristic,
  applyEstimateBounds,
  clampEstimateCap,
  distributeEstimateEvenly,
  coverageEstimateFromEndpoints,
  tieredCoverageEstimate,
  softCoverageFloor,
  classifyTargetKind,
  casesForTarget,
  runEstimateCaseCount,
  ESTIMATE_MAX_TOTAL,
  CASES_PER_ENDPOINT_PER_TARGET,
  ERROR_SAMPLE_RATIO,
  PERF_SAMPLE_MAX,
};
