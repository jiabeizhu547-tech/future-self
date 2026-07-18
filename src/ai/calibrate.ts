// 校准模块：路径标记"想要/不想要"后，反推当下可调项 + 早期信号命中次数。
// 分两步：1) 本地统计信号命中（数字可信、无延迟）；2) AI 生成微调建议 / 预警信号定义。
// 传输层走 ai/client.ts（云函数优先 → 直连回退）。

import { callDeepSeek, extractContent, getApiKey } from '@/ai/client';
import { getEnrichmentMap } from '@/services/storage';
import {
  Adjustment,
  CalibrationInsight,
  EarlySignalDef,
  Enrichment,
  FuturePath,
  SignalHit,
  SignalDirection,
  Stance,
} from '@/types/models';
import { nowMs } from '@/utils/date';

const MODEL_CHAT = 'deepseek-chat';

/* ---------- 本地信号匹配 ---------- */

function splitKeywords(s: string): string[] {
  // 按中文/英文分隔符拆词
  return s
    .split(/[、，,\s/｜|]+/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 2);
}

function matchSignals(path: FuturePath, enrichments: Record<string, Enrichment>): SignalHit[] {
  const driverWords = path.drivers.flatMap((d) => splitKeywords(d));

  const hitMap = new Map<string, { direction: SignalDirection; count: number; entries: string[] }>();

  for (const [entryId, en] of Object.entries(enrichments)) {
    for (const sig of en.signals) {
      // 看信号文本和路径推动因素是否有词重叠
      const matched = driverWords.some(
        (kw) => sig.text.includes(kw) || kw.includes(sig.text),
      );
      if (matched) {
        const cur = hitMap.get(sig.text);
        if (cur) {
          cur.count++;
          if (!cur.entries.includes(entryId)) cur.entries.push(entryId);
        } else {
          hitMap.set(sig.text, {
            direction: sig.direction,
            count: 1,
            entries: [entryId],
          });
        }
      }
    }
  }

  const hits: SignalHit[] = [];
  for (const [text, info] of hitMap) {
    hits.push({
      signal: text,
      direction: info.direction,
      count: info.count,
      example_entry_ids: info.entries.slice(0, 3),
    });
  }
  hits.sort((a, b) => b.count - a.count);

  // 如果没有关键词匹配，把全部非 neutral 信号作为背景上下文
  if (hits.length === 0) {
    const fallback = new Map<string, { direction: SignalDirection; count: number; entries: string[] }>();
    for (const [entryId, en] of Object.entries(enrichments)) {
      for (const sig of en.signals) {
        if (sig.direction === 'neutral') continue;
        const cur = fallback.get(sig.text);
        if (cur) {
          cur.count++;
          if (!cur.entries.includes(entryId)) cur.entries.push(entryId);
        } else {
          fallback.set(sig.text, {
            direction: sig.direction,
            count: 1,
            entries: [entryId],
          });
        }
      }
    }
    for (const [text, info] of fallback) {
      hits.push({
        signal: text,
        direction: info.direction,
        count: info.count,
        example_entry_ids: info.entries.slice(0, 3),
      });
    }
    hits.sort((a, b) => b.count - a.count);
  }

  return hits.slice(0, 8);
}

/* ---------- AI 校准调用 ---------- */

function buildSystem(stance: Stance): string {
  const base =
    '你是一个擅长人生教练与决策分析的心理咨询师。用户刚看完一条 AI 推演出的人生路径，并把它标记为';

  if (stance === 'want') {
    return (
      base +
      '"想要"。\n\n请帮用户想清楚：要让这条路更可能发生，现在——在日常生活里——可以微调哪些事？\n\n要求：\n- 给 2~4 条具体的微调建议（adjustments），每条有 what（做什么）、why（为什么这个动作有用）、difficulty（easy/medium/hard）\n- 建议要具体到日常动作，不要空泛的"多努力""多注意"\n- early_signal_defs 留空数组\n- summary 一句话收束\n\n严格只输出 JSON，不要 Markdown 围栏。'
    );
  }

  // dont_want
  return (
    base +
    '"不想要"。\n\n请帮用户定义：这条不想要的路，它的早期预警信号是什么样的？未来在生活里观察到什么苗头就该警惕？\n\n要求：\n- 给 2~4 条早期信号定义（early_signal_defs），每条有 signal（具体可观测的苗头描述）和 interpretation（为什么这个信号指向这条不想要的路）\n- 信号要具体可观测，不要空泛的"情绪不好"\n- adjustments 留空数组\n- summary 一句话收束\n\n严格只输出 JSON，不要 Markdown 围栏。'
  );
}

function extractJson(text: string): Record<string, unknown> | null {
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

function coerceAdjustments(v: unknown): Adjustment[] {
  if (!Array.isArray(v)) return [];
  const out: Adjustment[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const what = typeof o.what === 'string' ? o.what.trim().slice(0, 80) : '';
    const why = typeof o.why === 'string' ? o.why.trim().slice(0, 120) : '';
    const d = o.difficulty;
    const difficulty: Adjustment['difficulty'] =
      d === 'easy' || d === 'medium' || d === 'hard' ? d : 'medium';
    if (what) out.push({ what, why, difficulty });
    if (out.length >= 4) break;
  }
  return out;
}

function coerceEarlySignalDefs(v: unknown): EarlySignalDef[] {
  if (!Array.isArray(v)) return [];
  const out: EarlySignalDef[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const signal = typeof o.signal === 'string' ? o.signal.trim().slice(0, 80) : '';
    const interpretation =
      typeof o.interpretation === 'string' ? o.interpretation.trim().slice(0, 120) : '';
    if (signal) out.push({ signal, interpretation });
    if (out.length >= 4) break;
  }
  return out;
}

/* ---------- 对外主入口 ---------- */

export async function calibratePath(
  path: FuturePath,
  pathIndex: number,
  stance: Stance,
  projectionId: string,
): Promise<CalibrationInsight> {
  // 1) 本地信号匹配（即刻完成）
  const enMap = getEnrichmentMap();
  const signalHits = matchSignals(path, enMap);

  // 2) 中立直接返回
  if (stance === 'neutral') {
    return {
      projection_id: projectionId,
      path_index: pathIndex,
      stance,
      signal_hits: signalHits,
      adjustments: [],
      early_signal_defs: [],
      summary:
        signalHits.length > 0
          ? `扫描到 ${signalHits.length} 个相关信号，标记为"说不好"。`
          : '已标记为"说不好"。记更多记录后信号会更清晰。',
      created_at: nowMs(),
    };
  }

  // 3) 没有 Key（且无云函数）只给信号扫描
  const key = getApiKey();
  if (!key) {
    return {
      projection_id: projectionId,
      path_index: pathIndex,
      stance,
      signal_hits: signalHits,
      adjustments: [],
      early_signal_defs: [],
      summary: '还没设置 DeepSeek Key，无法生成校准建议。信号扫描结果如上。',
      created_at: nowMs(),
    };
  }

  // 4) 构建 prompt，调 AI
  const signalSummary =
    signalHits.length > 0
      ? signalHits
          .map((h) => `${h.direction === 'toward_wanted' ? '↗' : '↘'}${h.signal}（出现${h.count}次）`)
          .join('；')
      : '（暂无匹配信号）';

  const user =
    `【路径标题】${path.title}\n【路径叙事】${path.narrative}\n【驱动因素】${path.drivers.join('、')}\n【相关信号】${signalSummary}\n\n请根据以上信息给出${stance === 'want' ? '微调建议' : '早期预警信号定义'}。`;

  const result = await callDeepSeek({
    model: MODEL_CHAT,
    system: buildSystem(stance),
    user,
    temperature: 0.6,
    response_format: { type: 'json_object' },
    max_tokens: 800,
    timeoutMs: 25000,
    maxRetries: 1,
  });

  if (!result.ok) {
    return {
      projection_id: projectionId,
      path_index: pathIndex,
      stance,
      signal_hits: signalHits,
      adjustments: [],
      early_signal_defs: [],
      summary: 'AI 校准失败：' + result.message,
      created_at: nowMs(),
    };
  }

  const rawContent = extractContent(result.data);
  if (!rawContent) {
    return {
      projection_id: projectionId,
      path_index: pathIndex,
      stance,
      signal_hits: signalHits,
      adjustments: [],
      early_signal_defs: [],
      summary: 'AI 校准失败：模型未返回内容',
      created_at: nowMs(),
    };
  }

  const parsed = extractJson(rawContent);
  if (!parsed) {
    return {
      projection_id: projectionId,
      path_index: pathIndex,
      stance,
      signal_hits: signalHits,
      adjustments: [],
      early_signal_defs: [],
      summary: 'AI 校准失败：返回格式无法解析',
      created_at: nowMs(),
    };
  }

  const adjustments = stance === 'want' ? coerceAdjustments(parsed.adjustments) : [];
  const earlySignalDefs =
    stance === 'dont_want' ? coerceEarlySignalDefs(parsed.early_signal_defs) : [];
  const summary =
    typeof parsed.summary === 'string'
      ? parsed.summary.trim().slice(0, 80)
      : '校准分析完成。';

  return {
    projection_id: projectionId,
    path_index: pathIndex,
    stance,
    signal_hits: signalHits,
    adjustments,
    early_signal_defs: earlySignalDefs,
    summary,
    created_at: nowMs(),
  };
}

/** 出错时给用户看的人话。 */
export function describeCalibrateError(e: any): string {
  if (e?.message) return e.message;
  return '校准分析失败，请重试。';
}
