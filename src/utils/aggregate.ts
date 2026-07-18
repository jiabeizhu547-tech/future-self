// 趋势聚合:把本地记录 + AI 富化按天汇总,算出焦虑/情绪曲线点、趋势变化、高频主题、信号计数。
// 全部本地计算,不联网、不花钱。

import { getEnrichmentMap, listEntries } from '@/services/storage';

/** 一天的汇总点 */
export interface DayPoint {
  day: string; // YYYY-MM-DD
  count: number;
  anxiety: number | null; // 0..10(优先用户手标,否则 AI)
  valence: number | null; // -1..1(优先 AI,否则由心情映射)
}

export interface TopicCount {
  topic: string;
  count: number;
}

/** AI 从某条记录里读出的一个"苗头" */
export interface SignalItem {
  text: string;
  direction: 'toward_wanted' | 'toward_unwanted';
  day: string;
  entryId: string;
}

export interface TrendSummary {
  days: DayPoint[]; // 按时间升序,只含有记录的天
  totalEntries: number;
  daysTracked: number;
  avgAnxiety: number | null;
  recentAnxiety: number | null; // 最近若干活跃天
  earlierAnxiety: number | null; // 更早的天
  anxietyDelta: number | null; // recent - earlier(正=变焦虑)
  topTopics: TopicCount[];
  signals: SignalItem[]; // 具体苗头,最近的在前
  towardWanted: number;
  towardUnwanted: number;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
}

/** 读取全部数据,汇总成趋势。 */
export function buildTrend(): TrendSummary {
  const entries = listEntries(); // 新→旧
  const enMap = getEnrichmentMap();

  // 按天分组
  const byDay: Record<string, string[]> = {}; // day -> entryIds
  const dayOrder: string[] = [];
  for (const e of entries) {
    if (!byDay[e.day]) {
      byDay[e.day] = [];
      dayOrder.push(e.day);
    }
    byDay[e.day].push(e.id);
  }

  const entryMap: Record<string, (typeof entries)[number]> = {};
  for (const e of entries) entryMap[e.id] = e;

  const days: DayPoint[] = dayOrder
    .slice()
    .sort() // YYYY-MM-DD 字符串升序 = 时间升序
    .map((day) => {
      const ids = byDay[day];
      const anxVals: number[] = [];
      const valVals: number[] = [];
      for (const id of ids) {
        const e = entryMap[id];
        const en = enMap[id];
        // 焦虑:手标优先,否则 AI
        if (e.anxiety !== null && e.anxiety !== undefined) anxVals.push(e.anxiety);
        else if (en && en.anxiety_ai != null) anxVals.push(en.anxiety_ai);
        // 情绪效价:AI 优先,否则由手标心情(-2..2)映射到 -1..1
        if (en && en.valence != null) valVals.push(en.valence);
        else if (e.mood !== null && e.mood !== undefined) valVals.push(e.mood / 2);
      }
      return { day, count: ids.length, anxiety: avg(anxVals), valence: avg(valVals) };
    });

  // 焦虑总体 & 近期 vs 更早
  const anxDays = days.filter((d) => d.anxiety != null) as (DayPoint & { anxiety: number })[];
  const avgAnxiety = avg(anxDays.map((d) => d.anxiety));

  const recentN = Math.min(3, Math.ceil(anxDays.length / 2));
  const recentSlice = anxDays.slice(anxDays.length - recentN);
  const earlierSlice = anxDays.slice(0, anxDays.length - recentN);
  const recentAnxiety = avg(recentSlice.map((d) => d.anxiety));
  const earlierAnxiety = avg(earlierSlice.map((d) => d.anxiety));
  const anxietyDelta =
    recentAnxiety != null && earlierAnxiety != null ? recentAnxiety - earlierAnxiety : null;

  // 高频主题 + 具体信号(苗头)
  const topicMap: Record<string, number> = {};
  const signals: SignalItem[] = [];
  const seenSignal = new Set<string>();
  let towardWanted = 0;
  let towardUnwanted = 0;
  for (const e of entries) {
    // entries 为 新→旧,所以先遇到的即最近的
    const en = enMap[e.id];
    if (!en) continue;
    for (const t of en.topics) topicMap[t] = (topicMap[t] || 0) + 1;
    for (const s of en.signals) {
      if (s.direction === 'toward_wanted') towardWanted++;
      else if (s.direction === 'toward_unwanted') towardUnwanted++;
      else continue; // neutral 不入列表
      const text = (s.text || '').trim();
      if (!text) continue;
      const dedupeKey = text.toLowerCase();
      if (seenSignal.has(dedupeKey)) continue;
      seenSignal.add(dedupeKey);
      signals.push({ text, direction: s.direction, day: e.day, entryId: e.id });
    }
  }
  const topTopics: TopicCount[] = Object.keys(topicMap)
    .map((topic) => ({ topic, count: topicMap[topic] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    days,
    totalEntries: entries.length,
    daysTracked: dayOrder.length,
    avgAnxiety,
    recentAnxiety,
    earlierAnxiety,
    anxietyDelta,
    topTopics,
    signals: signals.slice(0, 12),
    towardWanted,
    towardUnwanted,
  };
}
