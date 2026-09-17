'use strict';

const { bindFlowKeys } = require('./flowBinding');
const { applyFlowRisks } = require('./flowRisks');

const SCHEMA_ID = 'ops-project/v1';
const TEMPLATE_VERSION = '1.5.0';

const MT_ORDER = [
  'text', 'disambiguation', 'member_switch', 'intent_clarification',
  'plan_form', 'plan_pace_estimate', 'training_plan', 'existing_training_plan',
  'require_form', 'session_plan', 'existing_session', 'existing_draft',
  'session_summary', 'exec_confirm',
  'assessment_nav', 'assessment_launch', 'member_archive',
];

function node(id, name, type, description, x, y, extra = {}) {
  return {
    id,
    name,
    type,
    description: description || '',
    severity: extra.severity === 'risk' || extra.severity === 'warning' ? extra.severity : '',
    risk_note: extra.risk_note || '',
    x,
    y,
  };
}

function edge(id, source, target, label, type) {
  return { id, source, target, label: label || '', type: type || 'next' };
}

function bindRoutes(routes, flowKey, test) {
  for (const route of routes || []) {
    if (!route.flow_key && test(route.path || '', route.name || '')) {
      route.flow_key = flowKey;
    }
  }
}

function catalogSkills(skills) {
  const map = {};
  for (const item of skills || []) {
    const key = item.role && item.role !== 'shared' ? `${item.role}:${item.name}` : item.name;
    map[key] = {
      role: item.role,
      when: item.description || item.name,
      level: item.level || '',
    };
  }
  return map;
}

function catalogMessageTypes(types) {
  const map = {};
  for (const [ key, when ] of Object.entries(types || {})) {
    map[key] = { when, flow_key: key === 'text' ? 'feat-member-turn' : 'feat-coach-turn' };
  }
  return map;
}

function buildOverview(name, agent) {
  const types = agent.message_types || {};
  const ordered = MT_ORDER.filter(key => types[key]);
  const extraTypes = Object.keys(types).filter(key => !MT_ORDER.includes(key) && !/^(lookup_|member_|query_|check_|search_|read_|emit_)/.test(key));
  const allTypes = [ ...ordered, ...extraTypes.filter(key => !ordered.includes(key)) ];

  const nodes = [
    node('start', '开始', 'start', '套壳 turnWorker 取单后内网呼叫后厨。对端：server/ 排队本（黑盒）', 60, 80),
    node('a0', '接开火 HTTP', 'api', '入口；POST /v1/agent/pipeline/{role}-turn；NDJSON；scene_code 校验。对端：套壳', 240, 120, {
      severity: 'warning',
      risk_note: '除 /health /ready 外须内部密钥。密钥泄漏或网关未校验时，公网可直打后厨，绕过套壳 JWT/排队。',
    }),
    node('a2', '查小票幂等', 'decision', '入口 client_turn_id；做过则回旧结果不再开灶。围栏：CachedTurn', 460, 120),
    node('a3', '拼材料 enrich', 'action', 'Frame 会话壳；教练才可能 Marker 附录。事实/记忆走 Extension，不糊进 inbox', 680, 80),
    node('a6', 'Pi 开灶', 'action', 'skill；P1–P10：工作区 / inbox / jsonl / 本角色菜谱 / compact / 工具循环', 680, 180),
    node('p10', 'emit_outbox', 'api', '落盘 outbox.json=Pi 原话。禁止裸 write。一轮一种 message_type', 900, 120),
    node('a7', '校验+记小票', 'action', 'validate*Outbox；写 chat_*。纠偏以套壳 SSE 为准。对端：fitness_agent', 1120, 80),
    node('a9', '异步 MEMORY', 'action', '仅 memory_ops；不挡 SSE。冲突以业务库为准', 1120, 180),
    node('role', '三角色分发', 'decision', 'coach / member / manager 入口分家，禁止 portal 一体', 460, 280),
    node('fail', '失败收口', 'action', 'NDJSON error；幂等占坑失败；emit 校验拒；compact 连跪换本', 900, 280, {
      severity: 'risk',
      risk_note: '失败若当成功出卡，会写错对话小票、重复开灶或丢掉错误码，排障对不上 extra_json.errors。',
    }),
    node('end', '结束', 'end', '套壳 assemble*SsePayload → completeTurnJob → SSE（黑盒）', 1320, 120),
  ];
  const edges = [
    edge('e-s-a0', 'start', 'a0', '鉴权后开火', 'next'),
    edge('e-a0-a2', 'a0', 'a2', '本轮', 'next'),
    edge('e-a2-hit', 'a2', 'end', '已做过', 'success'),
    edge('e-a2-miss', 'a2', 'a3', '未做过', 'next'),
    edge('e-a3-a6', 'a3', 'a6', '开灶', 'next'),
    edge('e-a6-p10', 'a6', 'p10', '出餐', 'success'),
    edge('e-p10-a7', 'p10', 'a7', '落盘', 'next'),
    edge('e-a7-a9', 'a7', 'a9', '后台', 'branch'),
    edge('e-a7-role', 'a7', 'role', '按角色出卡', 'next'),
    edge('e-a6-fail', 'a6', 'fail', '无出餐/工具失败', 'fail'),
    edge('e-p10-fail', 'p10', 'fail', '校验拒绝', 'fail'),
    edge('e-a9-end', 'a9', 'end', '不阻塞', 'success'),
  ];

  allTypes.forEach((key, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const id = `mt-${key}`.slice(0, 40);
    nodes.push(node(
      id,
      key,
      key === 'text' ? 'page' : 'action',
      `入口 turn；skill 见 extra_json.skills；message_type=${key}；${types[key] || ''}；一轮一种 UI；对端套壳按 type 渲染`,
      60 + col * 280,
      400 + row * 110,
    ));
    edges.push(edge(`e-role-${key}`, 'role', id, key, 'branch'));
  });

  const planForm = allTypes.includes('plan_form');
  const pace = allTypes.includes('plan_pace_estimate');
  const training = allTypes.includes('training_plan');
  if (planForm && pace) {
    edges.push(edge('e-pf-pace', 'mt-plan_form', 'mt-plan_pace_estimate', '估时', 'next'));
  }
  if ((pace || planForm) && training) {
    const from = pace ? 'mt-plan_pace_estimate' : 'mt-plan_form';
    nodes.push(node(
      'warn-marker-plan',
      '[PLAN_FORM_SUBMIT]',
      'action',
      '教练提交计划确认表单后的硬标记轮。本步才允许写出 training_plan Draft',
      900,
      400,
      {
        severity: 'warning',
        risk_note: '未提交就出 training_plan，会绕过确认表单把半成品计划当正文落库，套壳 gate 也难以对齐。',
      },
    ));
    edges.push(edge('e-from-marker', from, 'warn-marker-plan', '提交表单', 'branch'));
    edges.push(edge('e-marker-tp', 'warn-marker-plan', 'mt-training_plan', 'Draft', 'success'));
  }
  if (allTypes.includes('require_form') && allTypes.includes('session_plan')) {
    nodes.push(node(
      'warn-marker-sess',
      '[SESSION_FORM_SUBMIT]',
      'action',
      '教练提交课表单后的硬标记轮。本步才允许新建 session_plan（只读展示除外）',
      900,
      510,
      {
        severity: 'warning',
        risk_note: '未提交就新建课时大纲，会把未确认的课表写入业务账，和「只读已有课时」混在一起。',
      },
    ));
    edges.push(edge('e-rf-ms', 'mt-require_form', 'warn-marker-sess', '提交课表单', 'branch'));
    edges.push(edge('e-ms-sp', 'warn-marker-sess', 'mt-session_plan', '大纲', 'success'));
  }
  if (allTypes.includes('assessment_nav') && allTypes.includes('assessment_launch')) {
    edges.push(edge('e-an-al', 'mt-assessment_nav', 'mt-assessment_launch', '已点名单项', 'next'));
  }

  const hasSafety = (agent.skills || []).some(item => item.name === 'training-safety-pain');
  const hasMedical = (agent.skills || []).some(item => item.name === 'medical-boundary');
  if (hasSafety) {
    nodes.push(node(
      'ov-safety',
      '疼/伤闸门',
      'decision',
      'skill=training-safety-pain。话里有疼/伤且要排课或生成训练时，先问部位与程度',
      1180,
      400,
      {
        severity: 'risk',
        risk_note: '未问清或中/重仍出 require_form，可能给伤者开出该痛区常规课，造成二次损伤。',
      },
    ));
    if (allTypes.includes('text')) {
      edges.push(edge('e-text-safety', 'mt-text', 'ov-safety', '疼/伤', 'fail'));
    }
    if (allTypes.includes('require_form')) {
      edges.push(edge('e-rf-safety', 'ov-safety', 'mt-require_form', '仅轻度可出卡', 'branch'));
    }
  }
  if (hasMedical) {
    nodes.push(node(
      'ov-medical',
      '医学边界',
      'action',
      'skill=medical-boundary。孕产/疾病/手术等只给训练边界与转介，不诊断不处方',
      1180,
      510,
      {
        severity: 'risk',
        risk_note: '越界给处方或当普通减脂课处理，会把医疗问题当成训练问题，误导教练执行。',
      },
    ));
    if (allTypes.includes('text')) {
      edges.push(edge('e-text-med', 'mt-text', 'ov-medical', '特殊人群', 'fail'));
    }
  }

  nodes.push(node(
    'ov-delete',
    '删除两轮',
    'action',
    'delete_request_data → 教练确认 → confirm_received。围栏在套壳 gate（黑盒）',
    1180,
    620,
    {
      severity: 'risk',
      risk_note: '未确认就声称已删库，或跳过两轮直接删，会造成账本与对话不一致，且不可用一句话撤回。',
    },
  ));
  nodes.push(node(
    'ov-wipe',
    '云数据 wipe',
    'api',
    'POST /v1/agent/internal/ops/wipe。confirmPhrase=RESET_CLOUD_DATA 且 deployEnv 匹配后清空 NAS 工作区/可选 KB，并 truncate Agent 表。不碰套壳业务库',
    60,
    280,
    {
      severity: 'risk',
      risk_note: '误调用会不可逆清空对话工作区与 Agent 库。phrase/env 能挡住一部分误操作，通过后无法从本接口恢复。',
    },
  ));
  edges.push(edge('e-start-wipe', 'start', 'ov-wipe', '运维入口', 'fail'));
  if (allTypes.includes('existing_training_plan')) {
    edges.push(edge('e-exist-del', 'mt-existing_training_plan', 'ov-delete', '删除计划', 'fail'));
  }

  return {
    key: 'overview',
    name: '项目总览',
    description: `${name || 'Agent'} 总览：开火主链 + 每种 message_type 节点 + 红橙风险。禁止把 19 种 type 收成一句「见分流程」。`,
    ref_path: '/v1/agent/pipeline/turn',
    nodes,
    edges,
  };
}

function coachFlow(agent) {
  const skills = (agent.skills || []).filter(item => item.role === 'coach').map(item => item.name);
  const nodes = [
    node('start', '开始', 'start', '套壳 POST coach-turn', 60, 180),
    node('a0', 'A0 接电话', 'api', '入口 POST /v1/agent/pipeline/coach-turn；NDJSON', 220, 180, {
      severity: 'warning',
      risk_note: '须内部密钥。未校验则公网可直打教练开火接口。',
    }),
    node('a2', 'A2 幂等', 'decision', 'client_turn_id；重复提交不得开两灶', 400, 180),
    node('a3', 'A3 拼材料', 'action', 'Frame；仅 marker 轮附 Payload。禁止意图 if-else', 580, 100),
    node('marker', '硬标记？', 'decision', '意图刚性：硬标记 [PLAN_FORM_SUBMIT]/[SESSION_FORM_SUBMIT]/[SESSION_SUMMARY_REQUEST] 等', 580, 260),
    node('a6', 'A6 开灶', 'action', `skill：${skills.slice(0, 8).join(' / ') || '本角色 skills'}。先工具再 emit`, 780, 180),
    node('p10', 'emit_outbox', 'api', 'message_type 枚举；draft_*.md 长正文；validateCoachOutbox', 980, 180),
    node('gate', '套壳 post-pi', 'action', '对端黑盒：按账本规则验收。盘上 outbox 不回写', 980, 40, {
      severity: 'warning',
      risk_note: 'Active≤1 / 半成品≤1 / 课时进行中 / 删除两轮若被 Agent 自己改账，会和套壳真相打架，出现双 Active。',
    }),
    node('ok', '出卡落地', 'action', 'SSE 按 message_type 渲染；form_id/public_id 以套壳为准', 1180, 120),
    node('fail', '失败收口', 'action', 'emit 拒写、scene_code 围栏、无 outbox 时本端兜底', 1180, 280, {
      severity: 'risk',
      risk_note: '失败当做出卡，会把拒写或无 outbox 的回合显示成成功，后续标记对不上。',
    }),
    node('end', '结束', 'end', '', 1380, 180),
    node('mt-plan', '计划链', 'action', 'plan_form → 估时 → [PLAN_FORM_SUBMIT] → training_plan(Draft)', 780, 320, {
      severity: 'warning',
      risk_note: '未走表单提交就出计划正文，会把未确认内容写入 Draft/Active 路径。',
    }),
    node('mt-sess', '课时链', 'action', 'require_form → [SESSION_FORM_SUBMIT] → session_plan。无 Active 用 form_mode=NO_PLAN', 980, 320, {
      severity: 'warning',
      risk_note: '与「训练计划」混用会打开错误表单；疼/伤未过闸门会排出伤区常规课。',
    }),
    node('mt-sum', '课后总结', 'action', 'skill=post-class-summary；仅 status=active；message_type=session_summary', 1180, 400),
    node('safety', '疼/伤闸门', 'decision', 'skill=training-safety-pain。先问部位/程度再决定能否出卡', 400, 360, {
      severity: 'risk',
      risk_note: '中/重或未问清仍排课，可能加重损伤。',
    }),
    node('medical', '医学边界', 'action', 'skill=medical-boundary。特殊人群只给边界与转介', 220, 360, {
      severity: 'risk',
      risk_note: '当作普通训练咨询处理会给出不安全处方或漏转介。',
    }),
    node('delete', '删除两轮', 'action', 'delete_request_data 后须教练确认，套壳 REST 亦校验', 60, 360, {
      severity: 'risk',
      risk_note: '一轮直接删会让对话声称已删而库未删，或反过来库已删无法恢复。',
    }),
  ];
  const edges = [
    edge('e1', 'start', 'a0', '开火', 'next'),
    edge('e2', 'a0', 'a2', '本轮', 'next'),
    edge('e2h', 'a2', 'ok', '已做过', 'success'),
    edge('e3', 'a2', 'a3', '未做过', 'next'),
    edge('e4', 'a3', 'marker', '是否特殊操作', 'branch'),
    edge('e5', 'marker', 'a6', '自然语言 / 有标记', 'next'),
    edge('e6', 'a6', 'p10', '出餐', 'success'),
    edge('e6f', 'a6', 'fail', '工具/模型失败', 'fail'),
    edge('e7', 'p10', 'gate', '请过账', 'branch'),
    edge('e8', 'p10', 'ok', '合法 type', 'success'),
    edge('e8f', 'p10', 'fail', '校验拒绝', 'fail'),
    edge('e9', 'gate', 'ok', '验收', 'success'),
    edge('e10', 'ok', 'end', 'SSE final', 'success'),
    edge('e-plan', 'a6', 'mt-plan', '强指向生成计划', 'branch'),
    edge('e-sess', 'a6', 'mt-sess', '强指向排课', 'branch'),
    edge('e-sum', 'a6', 'mt-sum', '课后总结', 'branch'),
    edge('e-pain', 'a6', 'safety', '话里有疼/伤', 'fail'),
    edge('e-med', 'a6', 'medical', '特殊人群', 'fail'),
    edge('e-del', 'ok', 'delete', '删除意图', 'fail'),
    edge('e-safe-text', 'safety', 'fail', '中/重或未问清', 'fail'),
    edge('e-safe-ok', 'safety', 'mt-sess', '仅轻度可出卡', 'branch'),
    edge('e-plan-ok', 'mt-plan', 'ok', 'Draft 出卡', 'success'),
    edge('e-sess-ok', 'mt-sess', 'ok', '大纲出卡', 'success'),
    edge('e-sum-ok', 'mt-sum', 'ok', '总结出卡', 'success'),
  ];
  return {
    key: 'feat-coach-turn',
    name: '教练回合',
    description: '教练 A0–A10 完整链：幂等、标记、Pi、出卡、套壳过账；红节点为安全/删除/失败。',
    ref_path: '/v1/agent/pipeline/coach-turn',
    nodes,
    edges,
  };
}

function textRoleFlow(role, path, title) {
  const consult = role === 'member'
    ? '15 个咨询 skill 同构；outbox 仅 text/qa'
    : 'manager-ops；outbox 仅 text/ops';
  return {
    key: `feat-${role}-turn`,
    name: title,
    description: `${title}：步骤同序、文件分家；无 post-pi gate。${consult}`,
    ref_path: path,
    nodes: [
      node('start', '开始', 'start', `套壳 POST ${path}`, 60, 180),
      node('t0', '接开火', 'api', `入口 ${path}；内部密钥；NDJSON`, 240, 180),
      node('t2', '查小票', 'decision', 'client_turn_id 幂等', 420, 180),
      node('t3', '拼材料', 'action', '通常只有会话壳；禁止与教练 enrich 互引', 600, 180),
      node('t6', '开灶', 'action', consult, 780, 180),
      node('emit', 'emit_outbox', 'api', role === 'member' ? 'validateMemberOutbox；text' : 'validateManagerOutbox；text', 960, 180),
      node('ok', '记对话', 'action', '本角色 finalize 写 chat_*；deliver* 今天 identity', 1140, 120),
      node('fail', '失败收口', 'action', '无出餐时走本端合法 text 兜底', 1140, 260, {
        severity: 'risk',
        risk_note: '若复用教练 message_type 出卡，会员/店长会看到不存在的表单 UI，套壳 allowlist 也会拒。',
      }),
      node('bound', '契约分家', 'action', '本端 outbox 仅 text（会员 qa / 店长 ops）。对端套壳按本端 allowlist', 780, 320, {
        severity: 'warning',
        risk_note: '抄教练 plan_form / session_plan 会打开错误气泡，且没有对应过账。',
      }),
      node('end', '结束', 'end', '', 1320, 180),
    ],
    edges: [
      edge('e1', 'start', 't0', '', 'next'),
      edge('e2', 't0', 't2', '', 'next'),
      edge('e2h', 't2', 'ok', '已做过', 'success'),
      edge('e3', 't2', 't3', '未做过', 'next'),
      edge('e4', 't3', 't6', '开灶', 'next'),
      edge('e5', 't6', 'emit', '出餐', 'success'),
      edge('e5f', 't6', 'fail', '失败', 'fail'),
      edge('e6', 'emit', 'ok', '合法', 'success'),
      edge('e6f', 'emit', 'fail', '校验拒绝', 'fail'),
      edge('e7', 't6', 'bound', '勿抄教练 UI', 'branch'),
      edge('e8', 'ok', 'end', 'SSE', 'success'),
    ],
  };
}

function memoryFlow() {
  return {
    key: 'feat-memory',
    name: '手写本 MEMORY',
    description: '唯一写入：Pi memory_ops → 异步 merge MEMORY.md。不挡 SSE。',
    ref_path: 'src/memory',
    nodes: [
      node('start', '开始', 'start', '本轮 emit 含 memory_ops', 60, 180),
      node('skill', 'memory-persist', 'page', 'skill；何时启用见 SKILL.md；不出独立 UI', 240, 180),
      node('ops', 'memory_ops', 'action', 'outbox 可选 memory_ops：action=add|update|delete，key 如 教练.沟通风格', 440, 180, {
        severity: 'warning',
        risk_note: '当轮 write MEMORY.md 会绕过异步 merge，和下一轮摘录打架；delete 未确认会丢掉偏好。',
      }),
      node('async', '异步 merge', 'action', 'schedulePostTurnMemory；超限进 MEMORY_ARCHIVE.md', 660, 180),
      node('file', 'MEMORY.md', 'action', 'NAS 工作区文件即真相；与 member_profiles 冲突以 DB 为准', 860, 120),
      node('fail', '失败收口', 'action', 'merge 失败不阻塞 SSE', 860, 260, {
        severity: 'risk',
        risk_note: '失败被忽略后，下一轮仍按旧记忆作答；禁止恢复 dream/store.json 当第二真相源。',
      }),
      node('end', '结束', 'end', '', 1060, 180),
    ],
    edges: [
      edge('e1', 'start', 'skill', '', 'next'),
      edge('e2', 'skill', 'ops', '可选', 'next'),
      edge('e3', 'ops', 'async', '不阻塞', 'next'),
      edge('e4', 'async', 'file', '成功', 'success'),
      edge('e5', 'async', 'fail', 'merge 失败', 'fail'),
      edge('e6', 'file', 'end', '', 'success'),
    ],
  };
}

function wikiFlow() {
  return {
    key: 'feat-wiki',
    name: '百科只读',
    description: '组织知识：Pi 按需 search_knowledge / read_wiki_page。Agent 不写百科。',
    ref_path: 'src/wiki',
    nodes: [
      node('start', '开始', 'start', '咨询需要门店知识', 60, 180),
      node('tool', 'search_knowledge', 'api', '工具查 KnowledgeBase；默认不进 Frame', 260, 180),
      node('read', 'read_wiki_page', 'api', '按 slug 读页；raw 审计只读', 460, 180),
      node('readonly', '百科只读边界', 'action', '写在仓外 wiki-knowledge sync。Pi 只 search / read', 660, 100, {
        severity: 'warning',
        risk_note: '后厨若改百科或声称已改，会和 sync 快照分叉，组织知识不再是单真相。',
      }),
      node('ok', '用于作答', 'action', 'message_type=text；knowledge-member-apply 可个体化', 660, 220),
      node('fail', '失败收口', 'action', '知识库缺失或路径越界时的失败分支', 860, 180, {
        severity: 'risk',
        risk_note: '把百科缺失说成「没有该会员档案」，会用错数据源，覆盖 member_profiles。',
      }),
      node('end', '结束', 'end', '', 1060, 180),
    ],
    edges: [
      edge('e1', 'start', 'tool', '', 'next'),
      edge('e2', 'tool', 'read', '命中', 'next'),
      edge('e3', 'read', 'readonly', '只读', 'branch'),
      edge('e4', 'read', 'ok', '引用', 'success'),
      edge('e5', 'tool', 'fail', '未找到', 'fail'),
      edge('e6', 'ok', 'end', '', 'success'),
    ],
  };
}

function cloudOpsFlow() {
  return {
    key: 'feat-cloud-ops',
    name: '云数据运维',
    description: 'SharedKernel HTTP：dump/wipe 只能经此后厨出口。不碰 fitness_shell。',
    ref_path: '/v1/agent/internal/ops/wipe',
    nodes: [
      node('start', '开始', 'start', 'fitness-cli / 运维调用', 60, 180),
      node('cli', 'CLI 签名', 'action', 'FITNESS_CLI 签名头 + 内部密钥。未启用 token 则拒绝', 240, 80, {
        severity: 'warning',
        risk_note: '签名关闭或密钥泄漏时，任何人都能打到 dump/wipe 出口。',
      }),
      node('status', 'GET status', 'api', '/v1/agent/internal/ops/status 工作区/库体量', 240, 220),
      node('dump', '导出', 'api', 'POST export-rds / export-nas；NAS tar 流', 440, 220),
      node('wipe', 'POST wipe', 'api', 'confirmPhrase=RESET_CLOUD_DATA 且 deployEnv 匹配后清空 workspaces、可选 KB、truncate agent 表', 660, 180, {
        severity: 'risk',
        risk_note: '误 wipe 不可逆。应先 dump。通过校验后无法从本接口恢复工作区或 Agent 表。',
      }),
      node('fail', '失败收口', 'action', 'phrase/env 不匹配返回 400；执行失败返回内部错误', 860, 80, {
        severity: 'risk',
        risk_note: '把校验失败当成已清空，后续运维会在半清空状态继续操作。',
      }),
      node('ok', '已清空', 'action', '返回 removed 列表；套壳业务库仍在', 860, 240),
      node('end', '结束', 'end', '', 1060, 180),
    ],
    edges: [
      edge('e1', 'start', 'cli', '鉴权', 'branch'),
      edge('e2', 'cli', 'status', '通过', 'next'),
      edge('e3', 'status', 'dump', '可选备份', 'next'),
      edge('e4', 'dump', 'wipe', '确认后', 'fail'),
      edge('e5', 'wipe', 'ok', 'phrase+env 通过', 'success'),
      edge('e6', 'wipe', 'fail', '校验失败或执行失败', 'fail'),
      edge('e7', 'ok', 'end', '', 'success'),
      edge('e8', 'cli', 'fail', '签名失败', 'fail'),
    ],
  };
}

function assembleAgentDocument({ scan, basic, hint }) {
  const name = String(basic.name || '').trim() || '健身 Agent';
  const agent = scan.agent || { skills: [], message_types: {}, markers: [], http_routes: [], tools: {} };
  const routes = [ ...(agent.http_routes || scan.routes || []) ];

  bindRoutes(routes, 'feat-coach-turn', p => /coach-turn|\/workspace\/coach|structured-extract/.test(p));
  bindRoutes(routes, 'feat-member-turn', p => /member-turn|\/workspace\/member/.test(p));
  bindRoutes(routes, 'feat-manager-turn', p => /manager-turn/.test(p));
  bindRoutes(routes, 'feat-cloud-ops', p => /\/ops\/|wipe|export-rds|export-nas/.test(p));
  bindRoutes(routes, 'feat-wiki', p => /knowledge|wiki/.test(p));
  bindRoutes(routes, 'feat-memory', p => /memory/.test(p));
  bindRoutes(routes, 'feat-chat-ledger', p => /\/chat\/|\/sessions/.test(p));
  for (const route of routes) {
    if (!route.flow_key && /pipeline\/turn/.test(route.path || '')) route.flow_key = 'feat-coach-turn';
  }

  const featureFlows = [
    coachFlow(agent),
    textRoleFlow('member', '/v1/agent/pipeline/member-turn', '会员回合'),
    textRoleFlow('manager', '/v1/agent/pipeline/manager-turn', '店长回合'),
    memoryFlow(),
    wikiFlow(),
    cloudOpsFlow(),
  ];

  const overview = buildOverview(name, agent);
  if (hint) overview.description = `${overview.description}；补充：${String(hint).slice(0, 200)}`;

  const errors = {
    HTTP_VALIDATION: 'wipe phrase/env 不匹配或入参非法',
    HTTP_INTERNAL: '后厨内部错误',
    emit_reject: 'emit_outbox 校验失败（缺载荷 / 无 draft / type 非法）',
    compact_fail: 'session.jsonl compact 连续失败后换本 .bak',
    idempotency_conflict: '同一 client_turn_id 并发占坑',
  };

  const document = {
    schema: SCHEMA_ID,
    version: TEMPLATE_VERSION,
    name,
    type: 'agent',
    description: String(basic.description || 'Embedded Pi Agent：三角色回合、出餐契约、MEMORY、只读百科、云数据 wipe。'),
    repo_url: String(basic.repo_url || ''),
    source_path: scan.source_path,
    status: basic.status || 'draft',
    directory_tree: scan.directory_tree || [],
    routes,
    flows: [ overview, ...featureFlows ],
    extra_json: {
      detail_required: true,
      node_legend: '入口；skill；意图刚性；查/op；围栏/错误码；回包字段；对端黑盒；红=风险；橙=警告',
      message_types: catalogMessageTypes(agent.message_types),
      shell_ops: {},
      api_ops: Object.fromEntries((routes || []).slice(0, 80).map(item => [
        `${item.component} ${item.path}`,
        { flow_key: item.flow_key || '', when: item.meta?.title || item.path },
      ])),
      skills: catalogSkills(agent.skills),
      markers: agent.markers || [],
      tools: agent.tools || {},
      errors,
      risks: {},
    },
  };
  return applyFlowRisks(bindFlowKeys(document), scan);
}

module.exports = {
  assembleAgentDocument,
};
