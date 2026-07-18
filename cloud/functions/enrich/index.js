// 云函数 enrich:把一条日志记录发给 DeepSeek,富化成结构化情绪/主题信号。
// DeepSeek Key 存在云函数环境变量 DEEPSEEK_KEY 里,前端永远拿不到。
// 端到端逻辑照搬 Expo 版 src/ai/{prompts,client,json,enrichEntry}.ts,永不抛异常,统一返回 { ok, data|error }。

const https = require('https');

const DEEPSEEK_HOST = 'api.deepseek.com';
const DEEPSEEK_PATH = '/chat/completions';
const MODEL_CHAT = 'deepseek-chat';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;

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

const DIRECTIONS = ['toward_wanted', 'toward_unwanted', 'neutral'];

// ---------- 稳健 JSON 解析(照搬 src/ai/json.ts) ----------

function extractJsonObject(text) {
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
  } catch (e) {
    return null;
  }
}

function numOrNull(v, min, max) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function intOrNull(v, min, max) {
  const n = numOrNull(v, min, max);
  return n === null ? null : Math.round(n);
}

function strArray(v, maxItems, maxLen) {
  maxLen = maxLen || 20;
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim().slice(0, maxLen);
    if (s && out.indexOf(s) === -1) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function coerceSignals(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const text = typeof item.text === 'string' ? item.text.trim().slice(0, 60) : '';
    if (!text) continue;
    const dir = DIRECTIONS.indexOf(item.direction) !== -1 ? item.direction : 'neutral';
    out.push({ text, direction: dir });
    if (out.length >= 6) break;
  }
  return out;
}

// ---------- DeepSeek 调用(https + 超时 + 退避重试,照搬 src/ai/client.ts) ----------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt) {
  return 500 * Math.pow(2, attempt);
}

// 单次请求:resolve({ status, text });网络/超时错误 reject(Error with .kind)
function requestOnce(key, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        host: DEEPSEEK_HOST,
        path: DEEPSEEK_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + key,
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, text: body }));
      }
    );
    req.on('timeout', () => {
      req.destroy(Object.assign(new Error('请求超时'), { kind: 'timeout' }));
    });
    req.on('error', (e) => {
      if (!e.kind) e.kind = 'network';
      reject(e);
    });
    req.write(data);
    req.end();
  });
}

// 返回 { ok:true, value } (assistant 文本) 或 { ok:false, error:{kind,message} }
async function chat(key, content) {
  const payload = {
    model: MODEL_CHAT,
    messages: [
      { role: 'system', content: ENRICH_SYSTEM },
      { role: 'user', content: '请分析这条日志记录:\n"""\n' + content + '\n"""' },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
    max_tokens: 600,
  };

  let lastErr = { kind: 'unknown', message: '未知错误' };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await requestOnce(key, payload);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: { kind: 'auth', message: 'DeepSeek Key 无效或未授权' } };
      }
      if (res.status === 429) {
        lastErr = { kind: 'rate_limit', message: '请求过于频繁' };
        if (attempt < MAX_RETRIES) await sleep(backoffMs(attempt));
        continue;
      }
      if (res.status >= 500) {
        lastErr = { kind: 'server', message: '服务端错误 ' + res.status };
        if (attempt < MAX_RETRIES) await sleep(backoffMs(attempt));
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, error: { kind: 'unknown', message: '请求失败 ' + res.status + ' ' + res.text.slice(0, 120) } };
      }
      let parsed;
      try {
        parsed = JSON.parse(res.text);
      } catch (e) {
        return { ok: false, error: { kind: 'bad_json', message: 'DeepSeek 响应非 JSON' } };
      }
      const contentOut = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
      if (typeof contentOut !== 'string' || !contentOut.trim()) {
        return { ok: false, error: { kind: 'bad_json', message: '模型未返回内容' } };
      }
      return { ok: true, value: contentOut };
    } catch (e) {
      lastErr = { kind: e.kind || 'network', message: e.message || '网络连接失败' };
      if (attempt < MAX_RETRIES) await sleep(backoffMs(attempt));
      continue;
    }
  }
  return { ok: false, error: lastErr };
}

// ---------- 入口 ----------

exports.main = async (event) => {
  const content = event && typeof event.content === 'string' ? event.content.trim() : '';
  if (!content) {
    return { ok: false, error: { kind: 'unknown', message: '记录内容为空' } };
  }

  const key = process.env.DEEPSEEK_KEY;
  if (!key) {
    return { ok: false, error: { kind: 'no_key', message: '云函数未配置 DEEPSEEK_KEY 环境变量' } };
  }

  const res = await chat(key, content);
  if (!res.ok) return res;

  const parsed = extractJsonObject(res.value);
  if (!parsed) {
    return { ok: false, error: { kind: 'bad_json', message: 'AI 返回格式无法解析' } };
  }

  // 返回富化字段;前端补上 entry_id 与 created_at 后存本地/云库
  return {
    ok: true,
    data: {
      valence: numOrNull(parsed.valence, -1, 1),
      anxiety_ai: intOrNull(parsed.anxiety, 0, 10),
      energy: numOrNull(parsed.energy, 0, 1),
      topics: strArray(parsed.topics, 4),
      people: strArray(parsed.people, 8),
      signals: coerceSignals(parsed.signals),
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 60) : '',
      model: MODEL_CHAT,
    },
  };
};
