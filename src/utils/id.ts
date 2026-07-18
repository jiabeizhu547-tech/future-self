// 生成本地唯一 id(时间戳 + 随机后缀)。

export function genId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
