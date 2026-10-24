'use strict';

const { readProductionSource } = require('../_shared/productionSource');
const { parseVoiceStep } = require('./lib/parseStep');

module.exports = {
  name: 'cartoon-voice-skill',
  project: 'cartoon',
  version: '0.1.0',
  description: '按台词和已登记音色给出时间轴，不返回音频',
  scheme: 'loop',
  routes: [
    {
      path: '/api/skills/cartoon-voice/invoke',
      method: 'POST',
      description: '配音时间轴',
      requiresAuth: false,
    },
  ],
  dbTables: [],
  memoryConfig: { enabled: false },
  config: {
    llmDefaultProfile: 'ollama-qwen',
    actionDefaults: { POST: 'draft_timeline' },
    loop: {
      maxSteps: 1,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      temperature: 0.2,
      maxTokens: 2048,
      localMaxTokens: 2048,
      llmTimeoutMs: 180000,
      localLlmTimeoutMs: 180000,
      parseStepOutput: parseVoiceStep,
      jsonSchemaHint: '{"done":true,"continue":false,"thinking":"","reply":"","summary":"","cues":[{"shot_id":"","text":"","start_ms":0,"end_ms":1000,"voice_key":""}]}',
      userContextFields: [ 'shots', 'voice_key', 'voice_lang', 'speaker_name', 'speech_rate', 'emotion', 'model_profile', 'package_id', 'package_version', 'copy_block_id', 'content_type' ],
      initialState: { thinking: '', reply: '', summary: '', cues: [] },
      stateMerge: {
        thinking: 'replace',
        reply: 'replace',
        summary: 'replace',
        cues: 'replace',
      },
    },
  },
  callbacks: {
    async beforeExecute(ctx, params) {
      const source = readProductionSource(params);
      const voiceKey = String(params.voice_key || params.voice?.voice_key || '').trim();
      if (!voiceKey) {
        const err = new Error('需要音色标识');
        err.status = 400;
        throw err;
      }
      const shots = Array.isArray(params.shots) ? params.shots : [];
      if (!shots.length) {
        const err = new Error('需要镜头');
        err.status = 400;
        throw err;
      }
      const voice = params.voice && typeof params.voice === 'object' ? params.voice : params;
      return {
        ...params,
        ...source,
        action: 'draft_timeline',
        topic: '配音时间轴',
        voice_key: voiceKey,
        voice_lang: String(voice.voice_lang || ''),
        speaker_name: String(voice.speaker_name || ''),
        speech_rate: String(voice.speech_rate || ''),
        emotion: String(voice.emotion || ''),
        model_profile: String(params.model_profile || ''),
        shots: shots.slice(0, 12).map(item => ({
          id: item.id,
          dialogue: String(item.dialogue || '').slice(0, 200),
          duration_ms: Number(item.duration_ms) > 0 ? Number(item.duration_ms) : 3000,
          emotion: String(item.emotion || ''),
        })),
      };
    },
  },
};
