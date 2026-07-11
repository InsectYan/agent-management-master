'use strict';

const { parseDocument } = require('./docParser');
const { llmChat, extractJsonObject, llmAvailable } = require('../../../app/lib/llm/chat');

const ESTIMATE_MAX_TOTAL = 120;

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

function distributeEstimateEvenly(total, targetCount) {
  const n = Math.max(1, Math.round(Number(targetCount) || 1));
  const safeTotal = Math.max(n, Math.round(Number(total) || 0));
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

function analyzeDocumentHeuristic(content, schemeTargets) {
  const text = content || '';
  const len = text.length;
  const sectionCount = (text.match(/^#{1,3}\s+/gm) || []).length;
  const rawApiMethodCount = (text.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/gi) || []).length;
  const rawEndpointCount = (text.match(/\/[a-zA-Z0-9_\-/{:?=.&]+/g) || []).length;
  const uniqueEndpoints = countUniqueMatches(
    text,
    /\/[a-zA-Z0-9_\-/{:?=.&]+/g,
    normalizeEndpointPath,
  );
  const uniqueApiOps = countUniqueMatches(
    text,
    /\b(GET|POST|PUT|PATCH|DELETE)\s+\/[^\s"'`，,;]+/gi,
    s => s.replace(/\s+/g, ' ').trim(),
  );
  const listItemCount = (text.match(/^\s*[-*]\s+/gm) || []).length;
  const tableRowCount = (text.match(/^\|.+\|$/gm) || []).length;
  const codeBlockCount = Math.floor((text.match(/```/g) || []).length / 2);

  const endpointSignal = Math.round(Math.sqrt(Math.max(uniqueEndpoints, 1)) * 2.2 + Math.min(uniqueApiOps, 24) * 0.6);
  const structureSignal = Math.round(sectionCount * 1.2 + Math.sqrt(Math.max(listItemCount, 1)) * 0.5 + tableRowCount * 0.08);
  const lengthSignal = Math.round(Math.sqrt(Math.max(len, 1) / 600));
  const contentBase = Math.max(1, Math.min(
    ESTIMATE_MAX_TOTAL,
    endpointSignal + structureSignal + lengthSignal + codeBlockCount * 0.5,
  ));

  const targetN = Math.max(schemeTargets.length, 1);
  let estimated = applyEstimateBounds(contentBase, targetN);
  if (len < 300) {
    estimated = Math.min(estimated, targetN);
  }
  const targetBreakdown = distributeEstimateEvenly(estimated, targetN);

  const parts = [
    `文档约 ${len} 字`,
    sectionCount ? `${sectionCount} 个章节` : null,
    rawApiMethodCount ? `${rawApiMethodCount} 处 HTTP 方法（去重接口 ${uniqueApiOps || uniqueEndpoints} 个）` : null,
    rawEndpointCount ? `${rawEndpointCount} 处路径/接口（去重 ${uniqueEndpoints} 个）` : null,
  ].filter(Boolean);

  const targetDesc = schemeTargets.length
    ? `${schemeTargets.length} 个生成目标`
    : '默认生成目标';
  const breakdownStr = targetBreakdown.length
    ? `（各目标约 ${targetBreakdown.join('/')} 条）`
    : '';

  return {
    estimated_count: estimated,
    target_breakdown: targetBreakdown,
    reasoning: `${parts.join('、')}；${targetDesc}，建议生成约 ${estimated} 条${breakdownStr}`,
    source: 'heuristic',
  };
}

/**
 * 轻量估算：启发式 + 可选单次 LLM（不走 generate Loop）
 * @param {Object} options
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

  if (llmAvailable(llm)) {
    const meta = input.doc_meta || parseDocument(docContent, { title: input.doc_title });
    const previewLen = Number(loopConfig?.estimateDocPreviewLen) || 3500;
    const llmTimeout = llm.localOllama || llm.provider === 'ollama'
      ? 0
      : Number(loopConfig?.estimateLlmTimeoutMs || 45000);

    const userPrompt = [
      '你是测试用例数量估算助手。仅根据文档内容与生成目标结构（大类、方案、验证类型），估算合理的测试用例总数。',
      '不要参考任何用户填写的条数配置；只输出 JSON：{ "estimated_count": number, "reasoning": string }',
      `文档标题：${input.doc_title || meta.title || '文档'}`,
      `文档约 ${meta.charCount || docContent.length} 字，${meta.sectionCount || 0} 个章节，去重接口约 ${(meta.endpoints || []).length} 个`,
      `生成目标 ${schemeTargets.length} 个（大类×验证组合）`,
      schemeTargets.length
        ? `目标结构：${schemeTargets.map(t => `${t.category_major_id || '?'}/${t.scheme_id || '?'}/${t.validation_id || '?'}`).join(', ')}`
        : '',
      `文档摘要（截断）：\n${docContent.slice(0, previewLen)}`,
      input.options?.hint ? `补充说明：${input.options.hint}` : '',
    ].filter(Boolean).join('\n\n');

    try {
      hooks?.onStatus?.({ phase: 'estimate', label: 'Agent 轻量估算…' });
      const result = await llmChat({
        llm,
        hooks,
        messages: [
          {
            role: 'system',
            content: '仅返回 JSON。estimated_count 为整数，reasoning 为简短中文说明（100字内）。',
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        maxTokens: 512,
        timeoutMs: llmTimeout,
      });
      const parsed = extractJsonObject(result.text || '');
      const agentEstimate = Number(parsed?.estimated_count ?? parsed?.estimate ?? parsed?.count);
      if (Number.isFinite(agentEstimate) && agentEstimate > 0) {
        estimatedCount = applyEstimateBounds(agentEstimate, targetN);
        targetBreakdown = distributeEstimateEvenly(estimatedCount, targetN);
        reasoning = String(parsed?.reasoning || parsed?.summary || reasoning);
        source = 'agent';
      }
    } catch (err) {
      reasoning = `LLM 估算未完成（${String(err.message || '失败').split('\n')[0].slice(0, 80)}），${reasoning}`;
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
      reasoning,
      source,
      scheme: 'loop',
    },
    meta: {
      scheme: 'loop',
      skill_action: 'estimate_case_count',
      source,
    },
  };
}

module.exports = {
  analyzeDocumentHeuristic,
  applyEstimateBounds,
  distributeEstimateEvenly,
  runEstimateCaseCount,
};
