// 日期/时间工具,基于设备本地时区。

export function nowMs(): number {
  return Date.now();
}

/** 毫秒时间戳 → 本地日期字符串 YYYY-MM-DD */
export function toDayString(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayString(): string {
  return toDayString(nowMs());
}

/** 格式化为 HH:mm */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** day 字符串 → 友好标签:今天 / 昨天 / M月D日 周X */
export function formatDayLabel(day: string): string {
  const today = todayString();
  if (day === today) return '今天';

  const yesterday = toDayString(nowMs() - 24 * 60 * 60 * 1000);
  if (day === yesterday) return '昨天';

  const parts = day.split('-').map((n) => parseInt(n, 10));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const date = new Date(y, m - 1, d);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const wd = weekdays[date.getDay()];
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return sameYear ? `${m}月${d}日 ${wd}` : `${y}年${m}月${d}日 ${wd}`;
}
