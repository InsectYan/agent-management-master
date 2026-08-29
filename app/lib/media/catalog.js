/**
 * @file catalog.js
 * @description 多模态（图片 / 视频）模型 catalog。密钥只读 env，不返回给客户端。
 *              文本 LLM 见 app/lib/llm/catalog.js，禁止混用。
 */

'use strict';

const CAPABILITY_LABELS = {
  image: '文生图',
  image_edit: '图生图',
  video: '文生视频',
  vision: '读图',
};

/**
 * 市场上常见图片 / 视频模型（可选项）。generateReady 为 true 的才会走 POST /api/media/generate。
 * 其余条目用于侧栏展示能力与选中（后续接厂商 API）。
 */
const MEDIA_CATALOG = [
  {
    id: 'openai-gpt-image',
    label: 'OpenAI · GPT Image',
    provider: 'openai',
    model: 'gpt-image-1',
    modalities: [ 'image' ],
    generateReady: true,
    defaultSize: '1024x1536',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    notes: 'OpenAI 当前主力文生图',
  },
  {
    id: 'openai-dall-e-3',
    label: 'OpenAI · DALL·E 3',
    provider: 'openai',
    model: 'dall-e-3',
    modalities: [ 'image' ],
    generateReady: true,
    defaultSize: '1024x1792',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    notes: '竖版封面友好',
  },
  {
    id: 'zhipu-cogview-4',
    label: '智谱 · CogView-4',
    provider: 'zhipu',
    model: 'cogview-4-250304',
    modalities: [ 'image' ],
    generateReady: true,
    defaultSize: '1024x1024',
    apiKeyEnv: 'ZHIPU_API_KEY',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    notes: '国内文生图',
  },
  {
    id: 'dashscope-wanx',
    label: '通义万相 · 文生图',
    provider: 'dashscope',
    model: 'wanx2.1-t2i-plus',
    modalities: [ 'image' ],
    generateReady: false,
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    notes: '阿里云万相，异步任务接口待接',
  },
  {
    id: 'openai-sora',
    label: 'OpenAI · Sora',
    provider: 'openai',
    model: 'sora',
    modalities: [ 'video' ],
    generateReady: false,
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    notes: '文生视频',
  },
  {
    id: 'zhipu-cogvideox',
    label: '智谱 · CogVideoX',
    provider: 'zhipu',
    model: 'cogvideox-flash',
    modalities: [ 'video' ],
    generateReady: false,
    apiKeyEnv: 'ZHIPU_API_KEY',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    notes: '智谱文生视频',
  },
  {
    id: 'dashscope-wanxiang-t2v',
    label: '通义万相 · 文生视频',
    provider: 'dashscope',
    model: 'wanx2.1-t2v-plus',
    modalities: [ 'video' ],
    generateReady: false,
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    notes: '阿里云万相视频',
  },
  {
    id: 'kling-v2',
    label: '可灵 · Kling',
    provider: 'kling',
    model: 'kling-v2',
    modalities: [ 'video', 'image' ],
    generateReady: false,
    apiKeyEnv: 'KLING_ACCESS_KEY',
    extraEnv: [ 'KLING_SECRET_KEY' ],
    notes: '快手可灵，图/视频',
  },
  {
    id: 'minimax-hailuo',
    label: 'MiniMax · Hailuo',
    provider: 'minimax',
    model: 'video-01',
    modalities: [ 'video' ],
    generateReady: false,
    apiKeyEnv: 'MINIMAX_API_KEY',
    notes: '海螺视频',
  },
  {
    id: 'runway-gen3',
    label: 'Runway · Gen-3',
    provider: 'runway',
    model: 'gen3a_turbo',
    modalities: [ 'video', 'image' ],
    generateReady: false,
    apiKeyEnv: 'RUNWAY_API_KEY',
    notes: 'Runway 图/视频',
  },
  {
    id: 'luma-ray',
    label: 'Luma · Ray / Dream Machine',
    provider: 'luma',
    model: 'ray-2',
    modalities: [ 'video' ],
    generateReady: false,
    apiKeyEnv: 'LUMA_API_KEY',
    notes: 'Luma 文生视频',
  },
  {
    id: 'google-veo',
    label: 'Google · Veo',
    provider: 'google',
    model: 'veo-3.0-generate-preview',
    modalities: [ 'video' ],
    generateReady: false,
    apiKeyEnv: 'GOOGLE_API_KEY',
    notes: 'Google 文生视频',
  },
  {
    id: 'vidu-q2',
    label: 'Vidu · 文生视频',
    provider: 'vidu',
    model: 'vidu-q2',
    modalities: [ 'video', 'image' ],
    generateReady: false,
    apiKeyEnv: 'VIDU_API_KEY',
    notes: '生数 Vidu',
  },
];

function envPresent(name) {
  const v = (process.env[name] || '').trim();
  if (!v) return false;
  if (name === 'OPENAI_API_KEY' && v.toLowerCase() === 'ollama') return false;
  return true;
}

function profileAvailable(def) {
  if (!envPresent(def.apiKeyEnv)) return false;
  if (Array.isArray(def.extraEnv)) {
    return def.extraEnv.every(envPresent);
  }
  return true;
}

function toCapabilities(modalities) {
  return (modalities || []).map(id => ({
    id,
    label: CAPABILITY_LABELS[id] || id,
  }));
}

function listMediaProfiles() {
  return MEDIA_CATALOG.map(def => ({
    id: def.id,
    label: def.label,
    provider: def.provider,
    model: def.model,
    available: profileAvailable(def),
    modalities: [ ...def.modalities ],
    capabilities: toCapabilities(def.modalities),
    generate_ready: !!def.generateReady,
    notes: def.notes || '',
  }));
}

function getMediaDef(id) {
  return MEDIA_CATALOG.find(d => d.id === id) || null;
}

function getPlatformDefaultMediaProfileId(appSettings) {
  const fromEnv = (process.env.MEDIA_DEFAULT_PROFILE || appSettings?.media?.defaultProfileId || '').trim();
  if (fromEnv && MEDIA_CATALOG.some(d => d.id === fromEnv)) return fromEnv;

  const imageReady = MEDIA_CATALOG.find(d => d.generateReady && d.modalities.includes('image') && profileAvailable(d));
  if (imageReady) return imageReady.id;

  const anyImage = MEDIA_CATALOG.find(d => d.modalities.includes('image') && profileAvailable(d));
  if (anyImage) return anyImage.id;

  const anyAvail = MEDIA_CATALOG.find(d => profileAvailable(d));
  if (anyAvail) return anyAvail.id;

  return MEDIA_CATALOG[0].id;
}

function resolveMediaProfile(profileId, appSettings) {
  const id = (profileId || '').trim() || getPlatformDefaultMediaProfileId(appSettings);
  const def = getMediaDef(id) || getMediaDef(getPlatformDefaultMediaProfileId(appSettings));
  return {
    profileId: def.id,
    label: def.label,
    provider: def.provider,
    model: def.model,
    modalities: [ ...def.modalities ],
    generateReady: !!def.generateReady,
    defaultSize: def.defaultSize || '1024x1024',
    baseUrl: (def.baseUrl || '').replace(/\/$/, ''),
    apiKey: (process.env[def.apiKeyEnv] || '').trim(),
    apiKeyEnv: def.apiKeyEnv,
    notes: def.notes || '',
  };
}

module.exports = {
  MEDIA_CATALOG,
  CAPABILITY_LABELS,
  listMediaProfiles,
  profileAvailable,
  getMediaDef,
  getPlatformDefaultMediaProfileId,
  resolveMediaProfile,
};
