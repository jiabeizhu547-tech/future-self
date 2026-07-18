// 领域模型类型(小程序版)。id 用字符串(本地生成,无自增)。

export type Stance = 'want' | 'dont_want' | 'neutral';

/** 一条日志记录 */
export interface Entry {
  id: string;
  created_at: number; // Unix 毫秒
  updated_at: number;
  day: string; // 本地日期 YYYY-MM-DD
  content: string;
  mood: number | null; // 情绪 -2..2
  anxiety: number | null; // 焦虑 0..10
  deleted: number; // 0/1 软删除
}

export interface NewEntry {
  content: string;
  mood?: number | null;
  anxiety?: number | null;
}

export interface EntryPatch {
  content?: string;
  mood?: number | null;
  anxiety?: number | null;
}

export type SignalDirection = 'toward_wanted' | 'toward_unwanted' | 'neutral';

export interface Signal {
  text: string;
  direction: SignalDirection;
}

/** AI 富化结果 */
export interface Enrichment {
  entry_id: string;
  valence: number | null; // -1..1
  anxiety_ai: number | null; // 0..10
  energy: number | null; // 0..1
  topics: string[];
  people: string[];
  signals: Signal[];
  summary: string;
  model: string;
  created_at: number;
}

/** 推演出的一条未来路径 */
export interface FuturePath {
  title: string; // 路径名
  narrative: string; // 这条路会怎么展开
  drivers: string[]; // 当下推动这条路的因素
  seed_entry_ids: string[]; // 来源记录 id(可点回追溯)
  valence_guess: number | null; // 这条路大致好坏 -1..1
}

/* ---------- 校准 ---------- */

export interface SignalHit {
  signal: string;
  direction: SignalDirection;
  count: number;
  example_entry_ids: string[];
}

export interface Adjustment {
  what: string;
  why: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface EarlySignalDef {
  signal: string;
  interpretation: string;
}

export interface CalibrationInsight {
  projection_id: string;
  path_index: number;
  stance: Stance;
  signal_hits: SignalHit[];
  adjustments: Adjustment[];
  early_signal_defs: EarlySignalDef[];
  summary: string;
  created_at: number;
}

/** 一次人生推演 */
export interface Projection {
  id: string;
  created_at: number;
  horizon_years: number; // 5 或 10
  window_start: string; // 覆盖记录最早 day
  window_end: string; // 最晚 day
  entry_count: number; // 参与推演的记录数
  model: string;
  summary: string; // 一句话总览
  paths: FuturePath[];
  stances: Record<number, Stance>; // path 下标 -> 想要/不想要/中立
}
