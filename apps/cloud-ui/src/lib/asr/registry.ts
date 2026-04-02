import { ASR_PROVIDER_IDS, type ASRProvider } from './types'

export type ASRTransport =
  | 'openai-compatible'
  | 'qwen-chat-completions'
  | 'deepgram-native'
  | 'volcengine-asr'

export interface ASRProviderConfig {
  id: ASRProvider
  label: string
  docsUrl: string
  transport: ASRTransport
  transcribeEndpoint: string
  verifyEndpoint: string
  responseFormat: 'verbose_json' | 'chat' | 'json'
}

const ASR_PROVIDER_REGISTRY: Readonly<Record<ASRProvider, ASRProviderConfig>> = {
  groq: {
    id: 'groq',
    label: 'Groq',
    docsUrl: 'https://console.groq.com/docs/rate-limits',
    transport: 'openai-compatible',
    transcribeEndpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    verifyEndpoint: 'https://api.groq.com/openai/v1/models',
    responseFormat: 'verbose_json',
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen',
    docsUrl: 'https://www.alibabacloud.com/help/en/model-studio/',
    transport: 'qwen-chat-completions',
    transcribeEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    verifyEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    responseFormat: 'chat',
  },
  deepgram: {
    id: 'deepgram',
    label: 'Deepgram',
    docsUrl: 'https://developers.deepgram.com/docs/models-languages-overview',
    transport: 'deepgram-native',
    transcribeEndpoint: 'https://api.deepgram.com/v1/listen',
    verifyEndpoint: 'https://api.deepgram.com/v1/projects',
    responseFormat: 'json',
  },
  volcengine: {
    id: 'volcengine',
    label: 'Volcengine',
    docsUrl: 'https://www.volcengine.com/docs/6561/80818',
    transport: 'volcengine-asr',
    transcribeEndpoint: 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash',
    verifyEndpoint: 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash',
    responseFormat: 'json',
  },
}

const ASR_PROVIDER_MODEL_REGISTRY: Readonly<Record<ASRProvider, readonly string[]>> = {
  groq: ['whisper-large-v3-turbo', 'whisper-large-v3'],
  qwen: ['qwen3-asr-flash', 'qwen3-asr-flash-us'],
  deepgram: ['nova-3', 'nova-2', 'nova', 'base', 'whisper'],
  volcengine: ['bigmodel'],
}

export const ASR_CONFIG_ERROR = {
  UNCONFIGURED_PROVIDER: 'unconfigured_provider',
  UNCONFIGURED_MODEL: 'unconfigured_model',
  INVALID_PROVIDER_MODEL_PAIR: 'invalid_provider_model_pair',
} as const
export type AsrConfigErrorCode = (typeof ASR_CONFIG_ERROR)[keyof typeof ASR_CONFIG_ERROR]

export type AsrProviderModelSelectionInput = {
  asrProvider?: string | null
  asrModel?: string | null
}

function trimValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isAsrProvider(value: string): value is ASRProvider {
  return ASR_PROVIDER_IDS.includes(value as ASRProvider)
}

export function getAsrModelsForProvider(provider: string | null | undefined): readonly string[] {
  const normalized = trimValue(provider)
  if (!isAsrProvider(normalized)) return []
  return ASR_PROVIDER_MODEL_REGISTRY[normalized]
}

export function isAsrModelSupportedForProvider(
  provider: string | null | undefined,
  model: string | null | undefined
): boolean {
  const normalizedProvider = trimValue(provider)
  const normalizedModel = trimValue(model)
  if (!isAsrProvider(normalizedProvider) || !normalizedModel) return false
  return getAsrModelsForProvider(normalizedProvider).includes(normalizedModel)
}

export function resolveAsrEffectiveModel(input: AsrProviderModelSelectionInput): string {
  return trimValue(input.asrModel)
}

export function validateAsrProviderModelSelection(input: AsrProviderModelSelectionInput):
  | { ok: true; provider: ASRProvider; model: string }
  | {
      ok: false
      code: AsrConfigErrorCode
    } {
  const provider = trimValue(input.asrProvider)
  if (!provider || !isAsrProvider(provider)) {
    return { ok: false, code: ASR_CONFIG_ERROR.UNCONFIGURED_PROVIDER }
  }

  const model = trimValue(input.asrModel)
  if (!model) {
    return { ok: false, code: ASR_CONFIG_ERROR.UNCONFIGURED_MODEL }
  }
  if (!isAsrModelSupportedForProvider(provider, model)) {
    return { ok: false, code: ASR_CONFIG_ERROR.INVALID_PROVIDER_MODEL_PAIR }
  }
  return { ok: true, provider, model }
}

export function getAsrProviderConfig(provider: ASRProvider): ASRProviderConfig {
  return ASR_PROVIDER_REGISTRY[provider]
}
