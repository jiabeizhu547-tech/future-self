// 本地存储服务(基于小程序 Storage)。Phase 0 数据只在本设备。
// 之后接入云开发时,可在此层替换为云数据库读写,页面无需改动。

import Taro from '@tarojs/taro';

import { CalibrationInsight, Enrichment, Entry, EntryPatch, NewEntry, Projection, Signal, SignalDirection, Stance } from '@/types/models';
import { nowMs, toDayString } from '@/utils/date';
import { genId } from '@/utils/id';

const ENTRIES_KEY = 'entries';
const ENRICH_KEY = 'enrichments';
const PROJECTIONS_KEY = 'projections';

function readEntries(): Entry[] {
  const v = Taro.getStorageSync(ENTRIES_KEY);
  return Array.isArray(v) ? (v as Entry[]) : [];
}

function writeEntries(list: Entry[]): void {
  Taro.setStorageSync(ENTRIES_KEY, list);
}

function readEnrichments(): Record<string, Enrichment> {
  const v = Taro.getStorageSync(ENRICH_KEY);
  return v && typeof v === 'object' ? (v as Record<string, Enrichment>) : {};
}

function writeEnrichments(map: Record<string, Enrichment>): void {
  Taro.setStorageSync(ENRICH_KEY, map);
}

/** 全部记录,按时间倒序(不含已删除)。 */
export function listEntries(): Entry[] {
  return readEntries()
    .filter((e) => !e.deleted)
    .sort((a, b) => b.created_at - a.created_at);
}

/** 新建一条记录。 */
export function createEntry(input: NewEntry): Entry {
  const ts = nowMs();
  const entry: Entry = {
    id: genId(),
    created_at: ts,
    updated_at: ts,
    day: toDayString(ts),
    content: input.content.trim(),
    mood: input.mood ?? null,
    anxiety: input.anxiety ?? null,
    deleted: 0,
  };
  const list = readEntries();
  list.push(entry);
  writeEntries(list);
  return entry;
}

export function getEntry(id: string): Entry | null {
  const e = readEntries().find((x) => x.id === id && !x.deleted);
  return e ?? null;
}

export function updateEntry(id: string, patch: EntryPatch): void {
  const list = readEntries();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const e = list[idx];
  if (patch.content !== undefined) e.content = patch.content.trim();
  if (patch.mood !== undefined) e.mood = patch.mood;
  if (patch.anxiety !== undefined) e.anxiety = patch.anxiety;
  e.updated_at = nowMs();
  list[idx] = e;
  writeEntries(list);
}

export function softDeleteEntry(id: string): void {
  const list = readEntries();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return;
  list[idx].deleted = 1;
  list[idx].updated_at = nowMs();
  writeEntries(list);
}

export function countEntries(): number {
  return readEntries().filter((e) => !e.deleted).length;
}

/* ---------- 富化(AI 分析结果)---------- */

export function getEnrichment(entryId: string): Enrichment | null {
  return readEnrichments()[entryId] ?? null;
}

export function getEnrichmentMap(): Record<string, Enrichment> {
  return readEnrichments();
}

export function saveEnrichment(en: Enrichment): void {
  const map = readEnrichments();
  map[en.entry_id] = en;
  writeEnrichments(map);
}

/* ---------- 人生推演 ---------- */

function readProjections(): Projection[] {
  const v = Taro.getStorageSync(PROJECTIONS_KEY);
  return Array.isArray(v) ? (v as Projection[]) : [];
}

function writeProjections(list: Projection[]): void {
  Taro.setStorageSync(PROJECTIONS_KEY, list);
}

/** 全部推演,最新在前。 */
export function listProjections(): Projection[] {
  return readProjections().sort((a, b) => b.created_at - a.created_at);
}

export function getProjection(id: string): Projection | null {
  return readProjections().find((p) => p.id === id) ?? null;
}

export function saveProjection(p: Projection): void {
  const list = readProjections();
  const idx = list.findIndex((x) => x.id === p.id);
  if (idx >= 0) list[idx] = p;
  else list.push(p);
  writeProjections(list);
}

export function deleteProjection(id: string): void {
  writeProjections(readProjections().filter((p) => p.id !== id));
}

/** 给某条推演的某条路径打标(想要/不想要/中立)。 */
export function setPathStance(projectionId: string, pathIndex: number, stance: Stance): void {
  const list = readProjections();
  const idx = list.findIndex((p) => p.id === projectionId);
  if (idx < 0) return;
  const p = list[idx];
  if (!p.stances) p.stances = {};
  p.stances[pathIndex] = stance;
  list[idx] = p;
  writeProjections(list);
}

/* ---------- 校准洞察 ---------- */

const CALIBRATION_KEY = 'calibrations';

function readCalibrations(): Record<string, CalibrationInsight> {
  const v = Taro.getStorageSync(CALIBRATION_KEY);
  return v && typeof v === 'object' ? (v as Record<string, CalibrationInsight>) : {};
}

function writeCalibrations(map: Record<string, CalibrationInsight>): void {
  Taro.setStorageSync(CALIBRATION_KEY, map);
}

/** 校准 key = projection_id + '|' + path_index */
function calibKey(projectionId: string, pathIndex: number): string {
  return projectionId + '|' + pathIndex;
}

export function getCalibration(projectionId: string, pathIndex: number): CalibrationInsight | null {
  return readCalibrations()[calibKey(projectionId, pathIndex)] ?? null;
}

export function saveCalibration(c: CalibrationInsight): void {
  const map = readCalibrations();
  map[calibKey(c.projection_id, c.path_index)] = c;
  writeCalibrations(map);
}

/* ---------- 导出(备份到剪贴板/文件)---------- */

/**
 * 把本地全部数据导出成 JSON 文本。
 * 包含：记录、AI 富化、人生推演、校准洞察。
 * 格式与 importFromJson 对齐，可原样重新导入。
 */
export function exportToJson(): string {
  const entries = readEntries().filter((e) => !e.deleted);
  const enMap = readEnrichments();
  const rows = entries
    .sort((a, b) => a.created_at - b.created_at)
    .map((e) => {
      const en = enMap[e.id];
      return {
        created_at: e.created_at,
        updated_at: e.updated_at,
        day: e.day,
        content: e.content,
        mood: e.mood,
        anxiety: e.anxiety,
        enrichment: en
          ? {
              valence: en.valence,
              anxiety_ai: en.anxiety_ai,
              energy: en.energy,
              topics: en.topics,
              people: en.people,
              signals: en.signals,
              summary: en.summary,
              model: en.model,
              created_at: en.created_at,
            }
          : undefined,
      };
    });

  const projections = readProjections();

  const calibrations = readCalibrations();

  return JSON.stringify({
    version: 2,
    exported_at: nowMs(),
    entries: rows,
    projections,
    calibrations,
  });
}

/** 不含 entries 的纯数据导出（用于导入时的投影+校准合并）。 */
export function exportProjectionsOnly(): string {
  return JSON.stringify({
    version: 2,
    exported_at: nowMs(),
    entries: [],
    projections: readProjections(),
    calibrations: readCalibrations(),
  });
}

/* ---------- 导入(从旧版 JSON 备份迁移)---------- */

export interface ImportResult {
  imported: number;
  skipped: number;
  error?: string;
  projImported?: number;
  projSkipped?: number;
  calibImported?: number;
  calibSkipped?: number;
}

const DIRS: SignalDirection[] = ['toward_wanted', 'toward_unwanted', 'neutral'];

function coerceSignals(v: unknown): Signal[] {
  if (!Array.isArray(v)) return [];
  const out: Signal[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (!text) continue;
    const dir = DIRS.includes(o.direction as SignalDirection)
      ? (o.direction as SignalDirection)
      : 'neutral';
    out.push({ text, direction: dir });
  }
  return out;
}

function coerceStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

/**
 * 从导出的 JSON 文本导入全部数据(记录 + AI 富化 + 推演 + 校准)。
 * 按 (created_at + 内容) 去重，重复的跳过，粘贴多次也安全。
 * 推演和校准直接合并（按 id 去重，已存在的跳过）。
 */
export function importFromJson(jsonText: string): ImportResult {
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return { imported: 0, skipped: 0, error: '这不是有效的 JSON 文本，请重新复制完整内容。' };
  }
  const rows = data && Array.isArray(data.entries) ? data.entries : null;
  if (!rows) {
    return { imported: 0, skipped: 0, error: '没找到记录(entries)，这可能不是导出文件。' };
  }

  const list = readEntries();
  const enMap = readEnrichments();
  const seen = new Set(list.map((e) => e.created_at + '|' + e.content));

  let imported = 0;
  let skipped = 0;

  for (const raw of rows) {
    if (!raw || typeof raw.content !== 'string' || !raw.content.trim()) {
      skipped++;
      continue;
    }
    const created_at = typeof raw.created_at === 'number' ? raw.created_at : nowMs();
    const sig = created_at + '|' + raw.content;
    if (seen.has(sig)) {
      skipped++;
      continue;
    }
    seen.add(sig);

    const id = genId();
    list.push({
      id,
      created_at,
      updated_at: typeof raw.updated_at === 'number' ? raw.updated_at : created_at,
      day: typeof raw.day === 'string' ? raw.day : toDayString(created_at),
      content: raw.content.trim(),
      mood: typeof raw.mood === 'number' ? raw.mood : null,
      anxiety: typeof raw.anxiety === 'number' ? raw.anxiety : null,
      deleted: 0,
    });

    const en = raw.enrichment;
    if (en && typeof en === 'object') {
      enMap[id] = {
        entry_id: id,
        valence: typeof en.valence === 'number' ? en.valence : null,
        anxiety_ai: typeof en.anxiety_ai === 'number' ? en.anxiety_ai : null,
        energy: typeof en.energy === 'number' ? en.energy : null,
        topics: coerceStrArray(en.topics),
        people: coerceStrArray(en.people),
        signals: coerceSignals(en.signals),
        summary: typeof en.summary === 'string' ? en.summary : '',
        model: typeof en.model === 'string' ? en.model : '',
        created_at: typeof en.created_at === 'number' ? en.created_at : created_at,
      };
    }
    imported++;
  }

  writeEntries(list);
  writeEnrichments(enMap);

  // ---- 导入推演 ----
  let projImported = 0;
  let projSkipped = 0;
  if (Array.isArray(data.projections)) {
    const existProj = readProjections();
    const existIds = new Set(existProj.map((p) => p.id));
    for (const raw of data.projections) {
      if (!raw || typeof raw.id !== 'string') { projSkipped++; continue; }
      if (existIds.has(raw.id)) { projSkipped++; continue; }
      existProj.push(raw as Projection);
      existIds.add(raw.id);
      projImported++;
    }
    writeProjections(existProj);
  }

  // ---- 导入校准 ----
  let calibImported = 0;
  let calibSkipped = 0;
  if (data.calibrations && typeof data.calibrations === 'object') {
    const existCalib = readCalibrations();
    const calibEntries = Object.entries(data.calibrations) as [string, any][];
    for (const [k, v] of calibEntries) {
      if (!v || typeof v !== 'object') { calibSkipped++; continue; }
      if (existCalib[k]) { calibSkipped++; continue; }
      existCalib[k] = v as CalibrationInsight;
      calibImported++;
    }
    writeCalibrations(existCalib);
  }

  return {
    imported,
    skipped,
    projImported: projImported || undefined,
    projSkipped: projSkipped || undefined,
    calibImported: calibImported || undefined,
    calibSkipped: calibSkipped || undefined,
  };
}
