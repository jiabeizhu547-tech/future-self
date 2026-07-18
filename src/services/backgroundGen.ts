/**
 * AI 底图生成服务
 * 使用异步图片 API 生成 APP 底图
 */

import { nowMs, toDayString } from '@/utils/date';

/* ---------- 常量 ---------- */

const STORAGE_KEY = 'fs_bg_data';
const IMG_KEY_STORE = 'fs_bg_api_key';
const IMG_SUBMIT_URL_STORE = 'fs_img_submit_url';
const IMG_POLL_URL_STORE = 'fs_img_poll_url';
const POLL_INTERVAL = 3000;   // 轮询间隔 3s
const POLL_TIMEOUT = 120_000; // 最多等 2 分钟

/* ---------- 类型 ---------- */

export interface BgData {
  /** 生成日期 YYYY-MM-DD */
  day: string;
  /** 图片 URL */
  url: string;
  /** 任务 ID */
  taskId: string;
  /** 生成时间戳 */
  createdAt: number;
  /** 情绪类型（生成时的主题色） */
  mood: string;
  /** 从日记提取的关键词（供展示） */
  keywords: string[];
  /** 描述语（供展示） */
  description: string;
}

export type BgStatus =
  | { type: 'idle' }
  | { type: 'generating'; message: string }
  | { type: 'done'; data: BgData }
  | { type: 'error'; message: string };

/* ---------- Prompt 设计（个性化） ---------- */

/**
 * 构建底图 prompt：将日记原文传给生图 AI，附加统一风格指引。
 * 不手写场景映射，让 AI 自己理解日记内容去构图。
 */
export function buildBgPrompt(mood: string, diaryContent: string): { prompt: string; description: string } {
  const moodColor: Record<string, string> = {
    warm:  'warm amber and soft orange tones',
    calm:  'cool blue and soft teal tones',
    deep:  'soft lavender and muted violet tones',
    amber: 'warm golden and pale caramel tones',
  };

  const colorGuide = moodColor[mood] || 'neutral soft tones';

  // 截取日记原文（限制长度以免超出 token）
  const content = diaryContent.length > 800 ? diaryContent.slice(0, 800) + '…' : diaryContent;

  const prompt =
    `Generate a mobile app background image that evokes the atmosphere of the following diary entry.\n` +
    `---\n${content}\n---\n` +
    `Style requirements (always follow these):\n` +
    `- Viewed through frosted glass or a rain-speckled window, soft focus, gentle blur\n` +
    `- Color palette: ${colorGuide}\n` +
    `- Dreamy, atmospheric, photographic but heavily blurred\n` +
    `- 16:9 panoramic aspect ratio, low contrast, muted colors\n` +
    `- No text, no typography, no people, no recognizable faces, no logos\n` +
    `- Feel like a blurred memory or distant impression, not a sharp photograph`;

  // 取日记前 60 字做 UI 描述
  const preview = content.replace(/\s+/g, ' ').slice(0, 60);
  const description = `基于你最近的日记：${preview}${content.length > 60 ? '…' : ''}`;

  return { prompt, description };
}

/* ---------- 存储 ---------- */

function readBgData(): BgData | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

function writeBgData(data: BgData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** 获取缓存底图（如果有且是今天的） */
export function getCachedBg(): BgData | null {
  const data = readBgData();
  if (!data) return null;
  if (data.day !== toDayString(nowMs())) return null;
  return data;
}

/** 检查今天是否已经生成过 */
export function hasTodayBg(): boolean {
  return getCachedBg() !== null;
}

/* ---------- API Key 管理 ---------- */

export function getImgApiKey(): string {
  try {
    const v = localStorage.getItem(IMG_KEY_STORE);
    if (typeof v === 'string' && v.trim()) return v.trim();
  } catch { /* ignore */ }
  return '';
}

export function setImgApiKey(k: string): void {
  localStorage.setItem(IMG_KEY_STORE, k.trim());
}

export function clearImgApiKey(): void {
  localStorage.removeItem(IMG_KEY_STORE);
}

export function hasImgApiKey(): boolean {
  return getImgApiKey().length > 0;
}

/* ---------- 生图 API 地址管理（用户自填，完整 URL，不拼接路径） ---------- */

/* 提交任务 URL（完整地址，如 https://api.example.com/v1/images/generations） */
export function getImgSubmitUrl(): string {
  try {
    const v = localStorage.getItem(IMG_SUBMIT_URL_STORE);
    if (typeof v === 'string' && v.trim()) return v.trim();
  } catch { /* ignore */ }
  return '';
}

export function setImgSubmitUrl(url: string): void {
  localStorage.setItem(IMG_SUBMIT_URL_STORE, url.trim());
}

export function clearImgSubmitUrl(): void {
  localStorage.removeItem(IMG_SUBMIT_URL_STORE);
}

export function hasImgSubmitUrl(): boolean {
  return getImgSubmitUrl().length > 0;
}

/* 查询任务 URL 模板（用 {taskId} 占位，如 https://api.example.com/v1/tasks/{taskId}） */
export function getImgPollUrl(): string {
  try {
    const v = localStorage.getItem(IMG_POLL_URL_STORE);
    if (typeof v === 'string' && v.trim()) return v.trim();
  } catch { /* ignore */ }
  return '';
}

export function setImgPollUrl(url: string): void {
  localStorage.setItem(IMG_POLL_URL_STORE, url.trim());
}

export function clearImgPollUrl(): void {
  localStorage.removeItem(IMG_POLL_URL_STORE);
}

export function hasImgPollUrl(): boolean {
  return getImgPollUrl().length > 0;
}

/* ---------- API 调用 ---------- */

type AsyncTaskResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

/**
 * 提交异步图片生成任务
 */
async function submitAsyncTask(prompt: string): Promise<{ taskId: string } | { error: string }> {
  const key = getImgApiKey();
  if (!key) return { error: '还没设置生图 API Key，去「我的」里填一下。' };

  const submitUrl = getImgSubmitUrl();
  if (!submitUrl) return { error: '还没设置生图提交 URL，去「我的」里填一下。' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000); // 20s 超时

  try {
    const res = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt,
        n: 1,
        size: '16:9',
        resolution: '1k',
        quality: 'high',
        reasoning_effort: 'medium',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: `提交失败 (${res.status}): ${text.slice(0, 100)}` };
    }

    const data = await res.json();
    if (!data.id) return { error: '返回缺少 task id' };
    return { taskId: data.id };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { error: '提交超时（20s），请检查网络或 API 地址是否正确' };
    }
    if (e instanceof TypeError && e.message.includes('Failed to fetch')) {
      return { error: '网络请求失败，可能是跨域(CORS)问题。试试用 Electron 或关掉浏览器安全策略。' };
    }
    return { error: `提交出错：${e?.message || '未知错误'}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 轮询任务状态直到完成
 */
async function pollTask(taskId: string): Promise<AsyncTaskResult> {
  const key = getImgApiKey();
  if (!key) return { ok: false, message: '生图 API Key 已丢失' };

  const pollTemplate = getImgPollUrl();
  if (!pollTemplate) return { ok: false, message: '还没设置生图查询 URL，去「我的」里填一下。' };

  const pollUrl = pollTemplate.replace('{taskId}', encodeURIComponent(taskId));

  const deadline = Date.now() + POLL_TIMEOUT;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const controller = new AbortController();
    const pollTimer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${key}` },
        signal: controller.signal,
      });

      if (!res.ok) {
        return { ok: false, message: `查询任务失败 (${res.status})` };
      }

      const data = await res.json();
      const status: string = data.status || '';

      if (status === 'succeeded') {
        const url: string | undefined = data.response?.data?.[0]?.url;
        if (!url) return { ok: false, message: '任务完成但未返回图片 URL' };

        // 立即下载图片并转为 blob URL（避免远程 URL 过期后图片消失）
        const localUrl = await downloadAndCacheImage(url);
        return { ok: true, url: localUrl };
      }

      if (status === 'failed') {
        return { ok: false, message: data.error || '图片生成失败' };
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // 单次轮询超时，继续下一轮
        continue;
      }
      return { ok: false, message: `轮询出错：${e?.message || '网络错误'}` };
    } finally {
      clearTimeout(pollTimer);
    }
  }

  return { ok: false, message: '生成超时（2分钟），请稍后重试' };
}

/**
 * 下载远程图片并转成本地可用的 URL（dataURL / blobURL）
 * 优先用 dataURL（可存 localStorage 持久化）
 */
const _blobCache = new Map<string, string>();

async function downloadAndCacheImage(remoteUrl: string): Promise<string> {
  // 检查是否已经下载过
  const cached = _blobCache.get(remoteUrl);
  if (cached) return cached;

  try {
    const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();

    // 转成 dataURL 以便持久化
    const dataUrl = await blobToDataURL(blob);
    _blobCache.set(remoteUrl, dataUrl);
    return dataUrl;
  } catch {
    // 下载失败则退回远程 URL（可能还能用一会儿）
    return remoteUrl;
  }
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* ---------- 回调类型 ---------- */

type OnStatusChange = (status: BgStatus) => void;

let _onStatus: OnStatusChange | null = null;

export function setBgStatusListener(fn: OnStatusChange | null) {
  _onStatus = fn;
}

function emitStatus(s: BgStatus) {
  _onStatus?.(s);
}

/* ---------- 主入口：生成今天的新底图 ---------- */

/**
 * 生成今天的 APP 底图。
 * 如果今天已有缓存，直接返回缓存。
 * @param force 强制重新生成
 */
export async function generateTodayBg(force = false): Promise<BgStatus> {
  // 检查缓存
  if (!force) {
    const cached = getCachedBg();
    if (cached) {
      const status: BgStatus = { type: 'done', data: cached };
      emitStatus(status);
      return status;
    }
  }

  emitStatus({ type: 'generating', message: '正在读取最近的日记…' });

  // 分析日记内容和情绪
  const analysis = analyzeRecentEntries();
  const { mood, contents } = analysis;

  // 拼接日记原文传给生图 AI
  const diaryText = contents.join('\n---\n');
  emitStatus({ type: 'generating', message: '正在根据你的日记内容构思底图…' });

  const { prompt, description } = buildBgPrompt(mood, diaryText);

  // 提交任务
  const submit = await submitAsyncTask(prompt);
  if ('error' in submit) {
    const s: BgStatus = { type: 'error', message: submit.error };
    emitStatus(s);
    return s;
  }

  emitStatus({ type: 'generating', message: 'AI 正在根据你的想法绘制底图…' });

  // 轮询
  const result = await pollTask(submit.taskId);
  if (!result.ok) {
    const s: BgStatus = { type: 'error', message: result.message };
    emitStatus(s);
    return s;
  }

  // 保存
  const bgData: BgData = {
    day: toDayString(nowMs()),
    url: result.url,
    taskId: submit.taskId,
    createdAt: nowMs(),
    mood,
    keywords: [],
    description,
  };
  writeBgData(bgData);

  const done: BgStatus = { type: 'done', data: bgData };
  emitStatus(done);
  return done;
}

/* ---------- 工具：获取最近情绪 + 日记内容 ---------- */

function analyzeRecentEntries(): { mood: string; contents: string[] } {
  try {
    const entries = JSON.parse(localStorage.getItem('fs_entries') || '[]') as any[];
    const recent = entries.filter((e: any) => !e.deleted).slice(0, 20);
    if (recent.length === 0) return { mood: 'calm', contents: [] };

    let moodSum = 0, anxietySum = 0;
    let moodC = 0, anxietyC = 0;
    const contents: string[] = [];

    for (const e of recent) {
      if (e.mood != null) { moodSum += e.mood; moodC++; }
      if (e.anxiety != null) { anxietySum += e.anxiety; anxietyC++; }
      if (e.content && typeof e.content === 'string' && e.content.trim()) {
        contents.push(e.content.trim());
      }
    }

    // 情绪判定
    const avgMood = moodC > 0 ? moodSum / moodC : 0;
    const avgAnxiety = anxietyC > 0 ? anxietySum / anxietyC : 5;
    let moodType: string;
    if (avgAnxiety >= 6) moodType = 'amber';
    else if (avgMood >= 0.8) moodType = 'warm';
    else if (avgMood <= -0.5) moodType = 'deep';
    else moodType = 'calm';

    return { mood: moodType, contents };
  } catch {
    return { mood: 'calm', contents: [] };
  }
}
