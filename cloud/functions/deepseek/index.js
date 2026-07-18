// 云函数：代理 DeepSeek API 调用
// API Key 存在服务端环境变量或 config.json 的 env 字段中，不会下发到客户端。

const https = require('https');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const DEEPSEEK_URL = 'api.deepseek.com';
const PATH = '/chat/completions';
const TIMEOUT_MS = 30000;

/**
 * 从云函数环境读取 Key（优先级：环境变量 > config.json env > 兜底）
 */
function getApiKey() {
  // 1) 优先：云开发控制台设置的环境变量 DEEPSEEK_API_KEY（最安全，推荐）
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  // 2) 兜底：从 config.json 读取（把 config.example.json 复制为 config.json 并填入真实 Key）
  try {
    const cfg = require('./config.json');
    if (cfg && cfg.env && cfg.env.DEEPSEEK_API_KEY && !cfg.env.DEEPSEEK_API_KEY.startsWith('sk-你的')) {
      return cfg.env.DEEPSEEK_API_KEY;
    }
  } catch (_) {
    // config.json 不存在，忽略
  }
  return null;
}

function makeRequest(payload, key) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: DEEPSEEK_URL,
        path: PATH,
        method: 'POST',
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 401 || res.statusCode === 403) {
            resolve({ ok: false, message: 'Key 无效或已过期' });
            return;
          }
          if (res.statusCode === 429) {
            resolve({ ok: false, message: '请求太频繁，稍后再试' });
            return;
          }
          if (res.statusCode && res.statusCode >= 500) {
            resolve({ ok: false, message: 'DeepSeek 服务暂时不可用（' + res.statusCode + '）' });
            return;
          }
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            resolve({ ok: false, message: '请求失败 ' + res.statusCode });
            return;
          }
          try {
            resolve({ ok: true, data: JSON.parse(data) });
          } catch (_) {
            resolve({ ok: false, message: 'AI 返回无法解析' });
          }
        });
      },
    );
    req.on('error', (e) => {
      resolve({ ok: false, message: '网络错误：' + (e.message || '') });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, message: '请求超时' });
    });
    req.write(body);
    req.end();
  });
}

exports.main = async (event) => {
  const key = getApiKey();
  if (!key) {
    return { ok: false, message: '云函数尚未配置 API Key，请在 cloud/functions/deepseek/config.json 中填写' };
  }

  const { model, messages, temperature, response_format, max_tokens } = event;

  if (!model || !messages || !Array.isArray(messages)) {
    return { ok: false, message: '参数不完整：需要 model 和 messages' };
  }

  const payload = {
    model: model || 'deepseek-chat',
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.7,
    max_tokens: typeof max_tokens === 'number' ? Math.min(max_tokens, 4096) : 1024,
  };

  if (response_format) {
    payload.response_format = response_format;
  }

  return makeRequest(payload, key);
};
