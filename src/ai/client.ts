// 统一 AI 调用层。
// 优先级：云函数(deepseek-proxy) > 直连 DeepSeek(读取本地 Key)。
// 云函数部署后 Key 不下发到客户端；没部署云函数时自动回退直连，开发/自用阶段不受影响。

import Taro from '@tarojs/taro';

/* ---------- 本地 Key（回退用，待云函数部署后可移除）---------- */

const KEY_STORE = 'deepseek_key';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

export function getApiKey(): string {
  const v = Taro.getStorageSync(KEY_STORE);
  return typeof v === 'string' ? v.trim() : '';
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function setApiKey(k: string): void {
  Taro.setStorageSync(KEY_STORE, k.trim());
}

export function clearApiKey(): void {
  Taro.removeStorageSync(KEY_STORE);
}

/* ---------- 云函数可用性 ---------- */

let cloudCheckDone = false;
let cloudAvailable = false;

export function isCloudAvailable(): boolean {
  return cloudAvailable;
}

/** 检测云函数是否部署。结果缓存，只查一次。 */
export async function checkCloudReady(): Promise<boolean> {
  if (cloudCheckDone) return cloudAvailable;
  try {
    const res = await Taro.cloud.callFunction({
      name: 'deepseek',
      data: { _ping: true },
    });
    cloudAvailable = res && res.result && (res.result as any).ok !== undefined;
  } catch {
    cloudAvailable = false;
  }
  cloudCheckDone = true;
  return cloudAvailable;
}

/* ---------- 云函数调用 ---------- */

export interface CloudAIResult {
  ok: true;
  data: Record<string, unknown>;
}

export interface CloudAIError {
  ok: false;
  message: string;
}

async function callCloud(payload: Record<string, unknown>): Promise<CloudAIResult | CloudAIError> {
  try {
    const res = await Taro.cloud.callFunction({
      name: 'deepseek',
      data: payload,
    });
    const result = res.result as any;
    if (result && result.ok) {
      return { ok: true, data: result.data };
    }
    return { ok: false, message: result?.message || '云函数返回未知错误' };
  } catch (e: any) {
    return { ok: false, message: e?.errMsg || '云函数调用失败' };
  }
}

/* ---------- 直连回退 ---------- */

async function callDirectDeepSeek(
  key: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<CloudAIResult | CloudAIError> {
  try {
    const res = await Taro.request({
      url: DEEPSEEK_URL,
      method: 'POST',
      timeout: timeoutMs,
      header: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      data: payload,
    });
    const status = res.statusCode;
    if (status === 401 || status === 403) {
      return { ok: false, message: 'DeepSeek Key 无效或未授权' };
    }
    if (status === 429) {
      return { ok: false, message: '请求过于频繁，稍后再试' };
    }
    if (status && status >= 500) {
      return { ok: false, message: 'DeepSeek 服务暂时不可用（' + status + '）' };
    }
    if (status && (status < 200 || status >= 300)) {
      return { ok: false, message: '请求失败 ' + status };
    }
    const data = res.data as any;
    return { ok: true, data };
  } catch (e: any) {
    const msg = e?.errMsg || '';
    return { ok: false, message: msg || '网络连接失败' };
  }
}

/* ---------- 统一入口 ---------- */

export interface CallParams {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  response_format?: { type: 'json_object' };
  max_tokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 调用 DeepSeek，自动选择云函数或直连。
 * 返回 { ok, data } 或 { ok, message }。
 */
export async function callDeepSeek(params: CallParams): Promise<CloudAIResult | CloudAIError> {
  const {
    model,
    system,
    user,
    temperature = 0.7,
    response_format,
    max_tokens = 1024,
    timeoutMs = 25000,
    maxRetries = 1,
  } = params;

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens,
  };
  if (response_format) {
    payload.response_format = response_format;
  }

  // 1) 尝试云函数
  if (cloudAvailable || await checkCloudReady()) {
    const r = await callCloud(payload);
    if (r.ok) return r;
    // 云函数失败不回退直连——key 不在客户端时回退也没用
    return r;
  }

  // 2) 回退直连
  const key = getApiKey();
  if (!key) return { ok: false, message: '还没设置 DeepSeek Key，去「我的」里填一下。' };

  let lastMsg = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await callDirectDeepSeek(key, payload, timeoutMs);
    if (r.ok) return r;
    lastMsg = r.message;
    // 认证错误不重试
    if (r.message.includes('Key 无效') || r.message.includes('未授权')) break;
    if (attempt < maxRetries) await sleep(800 * Math.pow(2, attempt));
  }

  return { ok: false, message: lastMsg };
}

/**
 * 从 AI 原始返回中提取文本内容。
 */
export function extractContent(data: Record<string, unknown>): string | null {
  const choices = data?.choices as any;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : null;
}
