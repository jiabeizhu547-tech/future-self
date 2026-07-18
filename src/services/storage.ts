// 本地存储服务(基于 localStorage)。所有数据只在本设备。
// 与小程序版 API 完全一致，底层由 Taro.storage 迁移为 localStorage。

import { CalibrationInsight, Enrichment, Entry, EntryPatch, NewEntry, Projection, Signal, SignalDirection } from '@/types/models';
import { nowMs, toDayString } from '@/utils/date';
import { genId } from '@/utils/id';

const ENTRIES_KEY = 'fs_entries';
const ENRICH_KEY = 'fs_enrichments';
const PROJECTIONS_KEY = 'fs_projections';
const CALIBRATION_KEY = 'fs_calibrations';

function readEntries(): Entry[] {
  try {
    const v = localStorage.getItem(ENTRIES_KEY);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}

function writeEntries(list: Entry[]): void {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(list));
}

function readEnrichments(): Record<string, Enrichment> {
  try {
    const v = localStorage.getItem(ENRICH_KEY);
    return v ? JSON.parse(v) : {};
  } catch { return {}; }
}

function writeEnrichments(map: Record<string, Enrichment>): void {
  localStorage.setItem(ENRICH_KEY, JSON.stringify(map));
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
  try {
    const v = localStorage.getItem(PROJECTIONS_KEY);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}

function writeProjections(list: Projection[]): void {
  localStorage.setItem(PROJECTIONS_KEY, JSON.stringify(list));
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
export function setPathStance(projectionId: string, pathIndex: number, stance: 'want' | 'dont_want' | 'neutral'): void {
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

function readCalibrations(): Record<string, CalibrationInsight> {
  try {
    const v = localStorage.getItem(CALIBRATION_KEY);
    return v ? JSON.parse(v) : {};
  } catch { return {}; }
}

function writeCalibrations(map: Record<string, CalibrationInsight>): void {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(map));
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

/* ---------- 导出(备份)---------- */

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

export function exportProjectionsOnly(): string {
  return JSON.stringify({
    version: 2,
    exported_at: nowMs(),
    entries: [],
    projections: readProjections(),
    calibrations: readCalibrations(),
  });
}

/* ---------- 导入(从 JSON 备份恢复)---------- */

export interface ImportResult {
  imported: number;
  skipped: number;
  error?: string;
  projImported?: number;
  projSkipped?: number;
  calibImported?: number;
  calibSkipped?: number;
}

const DIRS: Signal['direction'][] = ['toward_wanted', 'toward_unwanted', 'neutral'];

function coerceSignals(v: unknown): Signal[] {
  if (!Array.isArray(v)) return [];
  const out: Signal[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (!text) continue;
    const dir = DIRS.includes(o.direction as Signal['direction'])
      ? (o.direction as Signal['direction'])
      : 'neutral';
    out.push({ text, direction: dir });
  }
  return out;
}

function coerceStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

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
