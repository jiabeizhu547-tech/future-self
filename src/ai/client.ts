// 统一 AI 调用层(Web/Electron 版)。
// 默认使用 DeepSeek API（platform.deepseek.com），也支持自定义 OpenAI 兼容 API 地址。
// API Key 存储在 localStorage 中。

/* ---------- 本地 Key ---------- */

const KEY_STORE = 'deepseek_key';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

export function getApiKey(): string {
  try {
    const v = localStorage.getItem(KEY_STORE);
    return typeof v === 'string' ? v.trim() : '';
  } catch { return ''; }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function setApiKey(k: string): void {
  localStorage.setItem(KEY_STORE, k.trim());
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY_STORE);
}

/* ---------- API 地址管理（可选自定义，默认 DeepSeek） ---------- */

const API_URL_STORE = 'ai_api_url';

/** 获取 API 地址：用户自定义优先，否则使用默认 DeepSeek 地址。 */
export function getApiBaseUrl(): string {
  try {
    const v = localStorage.getItem(API_URL_STORE);
    if (typeof v === 'string' && v.trim()) return v.trim();
  } catch { /* ignore */ }
  return DEEPSEEK_URL;
}

export function setApiBaseUrl(url: string): void {
  localStorage.setItem(API_URL_STORE, url.trim());
}

export function clearApiBaseUrl(): void {
  localStorage.removeItem(API_URL_STORE);
}

export function hasCustomApiBaseUrl(): boolean {
  try {
    const v = localStorage.getItem(API_URL_STORE);
    return typeof v === 'string' && v.trim().length > 0;
  } catch { return false; }
}

/* ---------- 调用结果类型 ---------- */

export interface CloudAIResult {
  ok: true;
  data: Record<string, unknown>;
}

export interface CloudAIError {
  ok: false;
  message: string;
}

/* ---------- 直连 DeepSeek（或自定义 API） ---------- */

async function callDirectDeepSeek(
  key: string,
  url: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<CloudAIResult | CloudAIError> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'DeepSeek Key 无效或未授权' };
    }
    if (res.status === 429) {
      return { ok: false, message: '请求过于频繁，稍后再试' };
    }
    if (res.status >= 500) {
      return { ok: false, message: 'AI 服务暂时不可用（' + res.status + '）' };
    }
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, message: '请求失败 ' + res.status };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (e: any) {
    const msg = e?.message || e?.name || '';
    if (e?.name === 'AbortError') {
      return { ok: false, message: '请求超时，请检查网络' };
    }
    return { ok: false, message: msg || '网络连接失败' };
  } finally {
    clearTimeout(timer);
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
 * 调用 AI（默认 DeepSeek，支持自定义 API 地址）。
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

  const key = getApiKey();
  if (!key) return { ok: false, message: '还没设置 DeepSeek Key，去「我的」里填一下。' };

  const url = getApiBaseUrl();
  let lastMsg = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await callDirectDeepSeek(key, url, payload, timeoutMs);
    if (r.ok) return r;
    lastMsg = r.message;
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
