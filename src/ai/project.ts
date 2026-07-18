// 人生推演：把最近的记录 + AI 富化压成摘要，让模型外推出多条 5/10 年后的可能路径。
// 传输层走 ai/client.ts（云函数优先 → 直连回退）。

import { callDeepSeek, extractContent, getApiKey } from '@/ai/client';
import { getEnrichmentMap, listEntries, saveProjection } from '@/services/storage';
import { FuturePath, Projection } from '@/types/models';
import { nowMs } from '@/utils/date';
import { genId } from '@/utils/id';

const MODEL_CHAT = 'deepseek-chat';
const MAX_ENTRIES = 40;
const MAX_CONTENT_LEN = 80;

function projectSystem(years: number): string {
  return `你是一位擅长人生轨迹推演的分析师。用户会给你一份「最近的私人日志摘要」(按时间排列,每条前面有编号 [n])。请基于这些真实记录里透露的状态、选择、情绪和苗头,外推出这个人 ${years} 年后几种**可能**的人生路径。

要求:
- 推演必须**扎根于给定记录**,不要凭空编造与记录无关的情节。
- 给出 3 条路径,覆盖一个谱系:一条「顺其自然/大概率」、一条「更好的可能(若强化某些积极苗头)」、一条「需要警惕的下行(若某些消极苗头持续)」。
- 每条路径要具体、有画面感,但保持克制、不夸张、不算命。
- 每条路径标注它主要基于哪几条记录(用编号)。

严格只输出一个 JSON 对象,不要任何解释、前后缀或 Markdown 围栏。字段:
{
  "summary": "一句话总览此人最近的人生态势(30字内)",
  "paths": [
    {
      "title": "这条路的简短名字(10字内)",
      "narrative": "${years}年后大致会怎样,以及是什么把他带到这里(120字内)",
      "drivers": ["当下推动这条路的 2-4 个关键因素"],
      "seed_refs": [1, 3],
      "valence_guess": 0.5
    }
  ]
}
其中 seed_refs 是记录编号数组;valence_guess 是这条路的大致好坏,-1(很不想要)到 1(很想要)。只输出这个 JSON 对象。`;
}

/* ---------- 构建摘要(编号 -> entryId 映射) ---------- */

interface Digest {
  text: string;
  refToId: Record<number, string>;
  entryCount: number;
  windowStart: string;
  windowEnd: string;
}

function buildDigest(): Digest | null {
  const all = listEntries(); // 新→旧
  if (all.length === 0) return null;
  const enMap = getEnrichmentMap();

  const recent = all.slice(0, MAX_ENTRIES); // 最近若干条
  const chrono = recent.slice().reverse(); // 转为 旧→新,读起来像成长线

  const lines: string[] = [];
  const refToId: Record<number, string> = {};
  chrono.forEach((e, i) => {
    const n = i + 1;
    refToId[n] = e.id;
    const en = enMap[e.id];
    const parts: string[] = [`[${n}] ${e.day}`];
    const anx = e.anxiety ?? en?.anxiety_ai ?? null;
    if (anx != null) parts.push(`焦虑${anx}`);
    if (en && en.topics.length > 0) parts.push(`主题:${en.topics.join('、')}`);
    // 优先用 AI 摘要,否则截断原文
    const body = en && en.summary ? en.summary : e.content;
    parts.push((body || '').replace(/\s+/g, ' ').slice(0, MAX_CONTENT_LEN));
    // 带上信号苗头(推演的关键原料)
    if (en && en.signals.length > 0) {
      const sig = en.signals
        .filter((s) => s.direction !== 'neutral')
        .map((s) => (s.direction === 'toward_wanted' ? '↗' : '↘') + s.text)
        .join(' ');
      if (sig) parts.push(`信号:${sig}`);
    }
    lines.push(parts.join(' | '));
  });

  return {
    text: lines.join('\n'),
    refToId,
    entryCount: chrono.length,
    windowStart: chrono[0].day,
    windowEnd: chrono[chrono.length - 1].day,
  };
}

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

function strArray(v: unknown, maxItems: number, maxLen = 40): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim().slice(0, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function numOrNull(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function coercePaths(v: unknown, refToId: Record<number, string>): FuturePath[] {
  if (!Array.isArray(v)) return [];
  const out: FuturePath[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 30) : '';
    const narrative = typeof o.narrative === 'string' ? o.narrative.trim().slice(0, 400) : '';
    if (!title && !narrative) continue;
    // seed_refs(编号)-> entryId
    const seedIds: string[] = [];
    if (Array.isArray(o.seed_refs)) {
      for (const r of o.seed_refs) {
        const n = typeof r === 'number' ? r : Number(r);
        if (Number.isFinite(n) && refToId[n] && seedIds.indexOf(refToId[n]) === -1) {
          seedIds.push(refToId[n]);
        }
      }
    }
    out.push({
      title: title || '一种可能',
      narrative,
      drivers: strArray(o.drivers, 4),
      seed_entry_ids: seedIds,
      valence_guess: numOrNull(o.valence_guess, -1, 1),
    });
    if (out.length >= 5) break;
  }
  return out;
}

/* ---------- 对外:生成一次推演并存下 ---------- */

const MIN_ENTRIES = 3;

export async function projectFutures(horizonYears: number): Promise<ProjectResult> {
  const digest = buildDigest();
  if (!digest) return { ok: false, error: { kind: 'no_data', message: '还没有记录' } };
  if (digest.entryCount < MIN_ENTRIES) {
    return { ok: false, error: { kind: 'too_few', message: '记录太少' } };
  }

  const user =
    `以下是最近 ${digest.entryCount} 条日志摘要(时间从早到晚):\n"""\n` +
    digest.text +
    `\n"""\n请据此推演 ${horizonYears} 年后的可能路径。`;

  const result = await callDeepSeek({
    model: MODEL_CHAT,
    system: projectSystem(horizonYears),
    user,
    temperature: 0.8,
    response_format: { type: 'json_object' },
    max_tokens: 1800,
    timeoutMs: 40000,
    maxRetries: 2,
  });

  if (!result.ok) {
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

  const paths = coercePaths(parsed.paths, digest.refToId);
  if (paths.length === 0) {
    return { ok: false, error: { kind: 'bad_json', message: 'AI 没给出有效路径,重试一下' } };
  }

  const projection: Projection = {
    id: genId(),
    created_at: nowMs(),
    horizon_years: horizonYears,
    window_start: digest.windowStart,
    window_end: digest.windowEnd,
    entry_count: digest.entryCount,
    model: MODEL_CHAT,
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 60) : '',
    paths,
    stances: {},
  };
  saveProjection(projection);
  return { ok: true, projection };
}

/** 出错时给用户看的人话。 */
export function describeProjectError(err: ProjectErr): string {
  switch (err.kind) {
    case 'no_key':
      return '还没设置 DeepSeek Key,去「我的」里填一下。';
    case 'no_data':
      return '还没有记录,先去首页记几条吧。';
    case 'too_few':
      return '记录还太少,先多记几天(至少 3 条),推演才有依据。';
    case 'auth':
      return 'DeepSeek Key 无效,请到「我的」里检查更换。';
    case 'rate_limit':
      return '请求太频繁了,过一会儿再试。';
    case 'timeout':
      return '推演比较久,这次超时了,再试一次通常就好。';
    case 'network':
      return '连不上 DeepSeek,请检查网络(开发者工具需勾选「不校验合法域名」)。';
    case 'bad_json':
      return 'AI 这次返回格式不对,重试一下通常就好。';
    default:
      return '推演失败:' + err.message;
  }
}
