// 日志富化：把一条记录发给 DeepSeek，返回结构化情绪/信号。
// 传输层走 ai/client.ts（云函数优先 → 直连回退），Key 管理也统一到 client.ts。

import Taro from '@tarojs/taro';

import { callDeepSeek, extractContent, getApiKey } from '@/ai/client';
import { getEntry, saveEnrichment } from '@/services/storage';
import { Enrichment, Signal, SignalDirection } from '@/types/models';
import { nowMs } from '@/utils/date';

// 重新导出 Key 管理函数，保持向后兼容
export { clearApiKey, getApiKey, hasApiKey, setApiKey } from '@/ai/client';

const MODEL_CHAT = 'deepseek-chat';

const ENRICH_SYSTEM = `你是一个私人生活日志的分析助手。用户会给你一段中文日志记录(可能很短、很琐碎)。请把它富化成结构化的情绪与主题信号。

严格只输出一个 JSON 对象,不要输出任何解释、前后缀或 Markdown 围栏。字段如下:
- "valence": 数字,-1 到 1,情绪效价(负数=负面,0=中性,正数=正面)。
- "anxiety": 整数,0 到 10,这条记录透露出的焦虑程度(完全看不出填 0)。
- "energy": 数字,0 到 1,精力/动力水平。
- "topics": 字符串数组,1-4 个简短中文主题词(如 "工作"、"感情"、"健康"、"学习"、"人际"、"自我怀疑"、"金钱")。
- "people": 字符串数组,提到的人物(用原文称呼,如 "老王"、"妈妈");没有就空数组。
- "signals": 对象数组,每个形如 {"text": 简短信号描述, "direction": "toward_wanted" 或 "toward_unwanted" 或 "neutral"}。信号指记录里透露的、可能影响未来人生走向的苗头(例:持续加班=toward_unwanted;开始规律锻炼=toward_wanted)。没有明显信号就空数组。
- "summary": 一句话中文摘要,不超过 30 字。

只输出这个 JSON 对象。`;

const DIRECTIONS: SignalDirection[] = ['toward_wanted', 'toward_unwanted', 'neutral'];

/* ---------- 稳健 JSON 解析 ---------- */

function extractJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(s.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function numOrNull(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function intOrNull(v: unknown, min: number, max: number): number | null {
  const n = numOrNull(v, min, max);
  return n === null ? null : Math.round(n);
}

function strArray(v: unknown, maxItems: number, maxLen = 20): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim().slice(0, maxLen);
    if (s && out.indexOf(s) === -1) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function coerceSignals(v: unknown): Signal[] {
  if (!Array.isArray(v)) return [];
  const out: Signal[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const text = typeof o.text === 'string' ? o.text.trim().slice(0, 60) : '';
    if (!text) continue;
    const dir = DIRECTIONS.indexOf(o.direction as SignalDirection) !== -1
      ? (o.direction as SignalDirection)
      : 'neutral';
    out.push({ text, direction: dir });
    if (out.length >= 6) break;
  }
  return out;
}

/* ---------- 对外:分析一条记录并存下富化结果 ---------- */

export interface EnrichErr {
  kind: string;
  message: string;
}
export type EnrichResult =
  | { ok: true; enrichment: Enrichment }
  | { ok: false; error: EnrichErr };

export async function enrichEntry(entryId: string): Promise<EnrichResult> {
  const entry = getEntry(entryId);
  if (!entry) return { ok: false, error: { kind: 'not_found', message: '记录不存在' } };

  const result = await callDeepSeek({
    model: MODEL_CHAT,
    system: ENRICH_SYSTEM,
    user: '请分析这条日志记录:\n"""\n' + entry.content + '\n"""',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    max_tokens: 600,
    timeoutMs: 20000,
    maxRetries: 2,
  });

  if (!result.ok) {
    // 把消息映射到 kind
    const msg = result.message;
    let kind = 'unknown';
    if (msg.includes('还没设置') || msg.includes('Key')) kind = 'no_key';
    else if (msg.includes('Key 无效') || msg.includes('未授权')) kind = 'auth';
    else if (msg.includes('频繁')) kind = 'rate_limit';
    else if (msg.includes('超时')) kind = 'timeout';
    else if (msg.includes('网络')) kind = 'network';
    else if (msg.includes('格式') || msg.includes('返回')) kind = 'bad_json';
    return { ok: false, error: { kind, message: msg } };
  }

  const content = extractContent(result.data);
  if (!content) return { ok: false, error: { kind: 'bad_json', message: '模型未返回内容' } };

  const parsed = extractJsonObject(content);
  if (!parsed) return { ok: false, error: { kind: 'bad_json', message: 'AI 返回格式无法解析' } };

  const enrichment: Enrichment = {
    entry_id: entryId,
    valence: numOrNull(parsed.valence, -1, 1),
    anxiety_ai: intOrNull(parsed.anxiety, 0, 10),
    energy: numOrNull(parsed.energy, 0, 1),
    topics: strArray(parsed.topics, 4),
    people: strArray(parsed.people, 8),
    signals: coerceSignals(parsed.signals),
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 60) : '',
    model: MODEL_CHAT,
    created_at: nowMs(),
  };
  saveEnrichment(enrichment);
  return { ok: true, enrichment };
}

/** 供出错时给用户看的人话。 */
export function describeEnrichError(err: EnrichErr): string {
  switch (err.kind) {
    case 'no_key':
      return '还没设置 DeepSeek Key，去「我的」里填一下。';
    case 'auth':
      return 'DeepSeek Key 无效，请到「我的」里检查更换。';
    case 'rate_limit':
      return '请求太频繁了，过一会儿再试。';
    case 'timeout':
      return '网络超时，请检查网络后重试。';
    case 'network':
      return '连不上 DeepSeek，请检查网络。';
    case 'bad_json':
      return 'AI 这次返回格式不对，重试一下通常就好。';
    default:
      return '分析失败：' + err.message;
  }
}
