import { useCallback, useEffect, useRef, useState } from 'react';

import { clearApiKey, getApiKey, hasApiKey, setApiKey, getApiBaseUrl, setApiBaseUrl, clearApiBaseUrl, hasCustomApiBaseUrl } from '@/ai/client';
import { countEntries, exportToJson, importFromJson, ImportResult } from '@/services/storage';
import {
  hasImgApiKey, getImgApiKey, setImgApiKey, clearImgApiKey,
  getImgSubmitUrl, setImgSubmitUrl, clearImgSubmitUrl, hasImgSubmitUrl,
  getImgPollUrl, setImgPollUrl, clearImgPollUrl, hasImgPollUrl,
} from '@/services/backgroundGen';
import { AnimatedPage } from '@/components/AnimatedPage';
import { GlassCard } from '@/components/GlassCard';
import { useTheme, MOOD_META, type MoodType } from '@/contexts/ThemeContext';

const APP_VERSION = 'v1.0.0';

const MOOD_OPTIONS: { key: MoodType; label: string }[] = [
  { key: 'warm', label: '积极·兴奋' },
  { key: 'calm', label: '平静·专注' },
  { key: 'deep', label: '沉思·内省' },
  { key: 'amber', label: '焦虑·紧张' },
];

function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

export default function Me() {
  const [entryCount, setEntryCount] = useState(0);
  const [currentKey, setCurrentKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [showKeyEditor, setShowKeyEditor] = useState(!hasApiKey());
  const [imgKeyInput, setImgKeyInput] = useState('');
  const [showImgKeyEditor, setShowImgKeyEditor] = useState(!hasImgApiKey());
  const [apiUrlInput, setApiUrlInput] = useState('');
  const [showApiUrlEditor, setShowApiUrlEditor] = useState(false);
  const [imgSubmitUrlInput, setImgSubmitUrlInput] = useState('');
  const [showImgSubmitUrlEditor, setShowImgSubmitUrlEditor] = useState(!hasImgSubmitUrl());
  const [imgPollUrlInput, setImgPollUrlInput] = useState('');
  const [showImgPollUrlEditor, setShowImgPollUrlEditor] = useState(!hasImgPollUrl());
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { mood, override, setOverride, bgData, bgStatus, generateBg } = useTheme();
  const imgKeySet = hasImgApiKey();

  const refresh = useCallback(() => {
    setEntryCount(countEntries());
    setCurrentKey(getApiKey());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleSaveKey() {
    const k = keyInput.trim();
    if (!k) return;
    setApiKey(k);
    setKeyInput('');
    setShowKeyEditor(false);
    setCurrentKey(k);
  }

  function handleClearKey() {
    if (!window.confirm('确定移除 DeepSeek Key？移除后新记录不再自动分析，已有的分析结果仍保留。')) return;
    clearApiKey();
    setCurrentKey('');
    setShowKeyEditor(true);
  }

  function handleExport() {
    const json = exportToJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `未来的我-备份-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const result = importFromJson(text);
      setImportResult(result);
      if (!result.error) {
        setEntryCount(countEntries());
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleImportClick() {
    fileRef.current?.click();
  }

  const keySet = currentKey.length > 0;
  const moodMeta = MOOD_META[mood];

  return (
    <AnimatedPage>
      <div className="page">
        {/* ====== 页面头部 ====== */}
        <div className="glass-header">
          <div>
            <h1>我的</h1>
            <span className="subtitle">未来的我 {APP_VERSION}</span>
          </div>
        </div>

        {/* ====== 情绪主题设置 ====== */}
        <GlassCard className="glass-card-mood">
          <div className="glass-card-header">
            <span className="glass-card-title">情绪主题</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                color: moodMeta.color,
                fontWeight: 500,
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: moodMeta.color,
                boxShadow: `0 0 8px ${moodMeta.glow}`,
                display: 'inline-block',
              }} />
              {override ? '手动' : '自动'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {MOOD_OPTIONS.map((opt) => {
              const isActive = (override ?? mood) === opt.key;
              const c = MOOD_META[opt.key].color;
              return (
                <button
                  key={opt.key}
                  onClick={() => setOverride(isActive ? null : opt.key)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--r-md)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'center',
                    border: `1.5px solid ${isActive ? c : 'var(--glass-border)'}`,
                    background: isActive ? `${c}18` : 'var(--glass-bg)',
                    color: isActive ? c : 'var(--c-text-secondary)',
                    backdropFilter: 'blur(8px)',
                    cursor: 'pointer',
                    transition: 'all var(--dur-fast)',
                  }}
                >
                  {opt.label}
                  {isActive && !override ? ' ↻' : ''}
                  {isActive && override ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            {override
              ? `手动设为「${MOOD_META[override].label}」。再次点击当前选中项可恢复自动模式。`
              : `自动模式 — 基于最近日记的情绪分析。当前基调：${moodMeta.label}`}
          </p>
        </GlassCard>

        {/* ====== 每日底图 ====== */}
        <GlassCard>
          <div className="glass-card-header">
            <span className="glass-card-title">每日底图</span>
            {bgData && (
              <span className="glass-chip glass-chip-primary">今日已生成</span>
            )}
          </div>

          {bgStatus.type === 'generating' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 14, color: 'var(--c-text-secondary)', marginBottom: 8 }}>
                {bgStatus.message}
              </div>
              <div style={{
                width: 24, height: 24, border: '2px solid var(--mood-color, var(--c-primary))',
                borderTopColor: 'transparent', borderRadius: '50%',
                margin: '0 auto',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : bgStatus.type === 'error' ? (
            <div>
              <p style={{ fontSize: 13, color: 'var(--c-danger)', marginBottom: 8, lineHeight: 1.5 }}>
                {bgStatus.message}
              </p>
              <button className="glass-btn-ghost glass-btn-sm" onClick={() => generateBg(true)}>
                重试
              </button>
            </div>
          ) : bgData ? (
            <div>
              {/* 缩略图 */}
              <div style={{
                width: '100%', height: 140, borderRadius: 'var(--r-md)',
                background: `url(${bgData.url}) center / cover no-repeat`,
                marginBottom: 10, position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent 60%)',
                }} />
                <span style={{
                  position: 'absolute', bottom: 6, right: 8,
                  fontSize: 11, color: 'rgba(255,255,255,0.8)',
                  background: 'rgba(0,0,0,0.4)', padding: '2px 8px',
                  borderRadius: 10,
                }}>
                  {bgData.day}
                </span>
              </div>

              {/* 描述 + 关键词 */}
              {bgData.description && (
                <p style={{ fontSize: 13, color: 'var(--c-text-secondary)', marginBottom: 6, lineHeight: 1.5 }}>
                  {bgData.description}
                </p>
              )}
              {bgData.keywords && bgData.keywords.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {bgData.keywords.map((kw) => (
                    <span key={kw} className="glass-chip" style={{ fontSize: 11 }}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                底图基于你最近的日记内容生成，每天自动刷新。
              </p>
              <button className="glass-btn-ghost glass-btn-sm" onClick={() => generateBg(true)}>
                重新生成
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: 'var(--c-text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                AI 每天读取你的日记，提取关键词，生成独一无二的底图。
                {!imgKeySet ? ' 先设置下方底图 API 的地址和 Key 即可开始生成。' : ''}
              </p>
              {imgKeySet ? (
                <button className="glass-btn-hero" onClick={() => generateBg()}
                  style={{ fontSize: 13, padding: 10 }}>
                  生成今日底图 — 基于你的日记
                </button>
              ) : null}
            </div>
          )}
        </GlassCard>

        {/* ====== 数据统计 ====== */}
        <GlassCard>
          <div className="glass-card-header">
            <span className="glass-card-title">数据统计</span>
          </div>
          <p style={{ color: 'var(--c-text)', fontSize: 15 }}>
            共 <strong style={{ color: 'var(--mood-color, var(--c-primary))' }}>{entryCount}</strong> 条日记记录
          </p>
        </GlassCard>

        {/* ====== DeepSeek API ====== */}
        <GlassCard>
          <div className="glass-card-header">
            <span className="glass-card-title">DeepSeek API</span>
            <span className={`glass-chip ${keySet ? 'glass-chip-primary' : 'glass-chip-warning'}`}>
              {keySet ? '已设置' : '未设置'}
            </span>
          </div>

          <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
            在 <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-primary)' }}>platform.deepseek.com</a> 注册获取 API Key。
          </p>

          {keySet && !showKeyEditor ? (
            <>
              <p style={{ fontFamily: 'monospace', fontSize: 14, marginBottom: 8, color: 'var(--c-text-secondary)', wordBreak: 'break-all' }}>
                {maskKey(currentKey)}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="glass-btn-ghost glass-btn-sm"
                  onClick={() => {
                    setShowKeyEditor(true);
                    setKeyInput(currentKey);
                  }}
                >
                  更换
                </button>
                <button className="glass-btn-danger glass-btn-sm" onClick={handleClearKey}>
                  移除
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                className="glass-input"
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="粘贴 DeepSeek API Key (sk-...)"
                style={{ marginBottom: keySet ? 8 : 0, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="glass-btn-hero"
                  onClick={handleSaveKey}
                  style={{ flex: 1 }}
                >
                  保存
                </button>
                {keySet && (
                  <button
                    className="glass-btn-ghost"
                    onClick={() => {
                      setShowKeyEditor(false);
                      setKeyInput('');
                    }}
                  >
                    取消
                  </button>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                API Key 只存在你设备本地，不会上传。
              </p>
            </>
          )}

          {/* 自定义 API 地址（高级） */}
          <div style={{ marginTop: 12, borderTop: '1px solid var(--glass-border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--c-text-secondary)' }}>自定义 API 地址</span>
              {hasCustomApiBaseUrl() && (
                <span className="glass-chip" style={{ fontSize: 11 }}>已设置</span>
              )}
            </div>
            {showApiUrlEditor ? (
              <>
                <input
                  className="glass-input"
                  type="text"
                  value={apiUrlInput}
                  onChange={(e) => setApiUrlInput(e.target.value)}
                  placeholder="https://api.deepseek.com/chat/completions"
                  style={{ marginBottom: 8, boxSizing: 'border-box', fontSize: 13 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="glass-btn-ghost glass-btn-sm"
                    onClick={() => {
                      const v = apiUrlInput.trim();
                      if (v) setApiBaseUrl(v); else clearApiBaseUrl();
                      setShowApiUrlEditor(false);
                    }}
                  >
                    保存
                  </button>
                  <button
                    className="glass-btn-ghost glass-btn-sm"
                    onClick={() => {
                      setShowApiUrlEditor(false);
                      setApiUrlInput('');
                    }}
                  >
                    取消
                  </button>
                </div>
              </>
            ) : (
              <button
                className="glass-btn-ghost glass-btn-sm"
                onClick={() => {
                  setApiUrlInput(getApiBaseUrl());
                  setShowApiUrlEditor(true);
                }}
              >
                {hasCustomApiBaseUrl() ? '修改' : '设置'}
              </button>
            )}
            <p style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              留空则默认使用 DeepSeek 官方地址。填入其他 OpenAI 兼容 API 地址可切换供应商。
            </p>
          </div>
        </GlassCard>

        {/* ====== 底图 API ====== */}
        <GlassCard>
          <div className="glass-card-header">
            <span className="glass-card-title">底图 API</span>
            <span className={`glass-chip ${imgKeySet ? 'glass-chip-primary' : 'glass-chip-warning'}`}>
              {imgKeySet ? '已设置' : '未设置'}
            </span>
          </div>

          {/* 提交任务 URL */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--c-text-secondary)' }}>提交任务 URL</span>
              {hasImgSubmitUrl() && <span className="glass-chip" style={{ fontSize: 10 }}>已设置</span>}
            </div>
            {showImgSubmitUrlEditor ? (
              <>
                <input
                  className="glass-input"
                  type="text"
                  value={imgSubmitUrlInput}
                  onChange={(e) => setImgSubmitUrlInput(e.target.value)}
                  placeholder="https://api.example.com/v1/images/generations"
                  style={{ marginBottom: 6, boxSizing: 'border-box', fontSize: 12 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="glass-btn-ghost glass-btn-sm" onClick={() => {
                    const v = imgSubmitUrlInput.trim();
                    if (v) setImgSubmitUrl(v); else clearImgSubmitUrl();
                    setShowImgSubmitUrlEditor(false);
                  }}>保存</button>
                  <button className="glass-btn-ghost glass-btn-sm" onClick={() => {
                    setShowImgSubmitUrlEditor(false);
                    setImgSubmitUrlInput('');
                  }}>取消</button>
                </div>
              </>
            ) : (
              <button className="glass-btn-ghost glass-btn-sm" onClick={() => {
                setImgSubmitUrlInput(getImgSubmitUrl());
                setShowImgSubmitUrlEditor(true);
              }}>
                {hasImgSubmitUrl() ? '修改' : '设置'}
              </button>
            )}
          </div>

          {/* 查询任务 URL 模板 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--c-text-secondary)' }}>查询任务 URL（taskId 占位）</span>
              {hasImgPollUrl() && <span className="glass-chip" style={{ fontSize: 10 }}>已设置</span>}
            </div>
            {showImgPollUrlEditor ? (
              <>
                <input
                  className="glass-input"
                  type="text"
                  value={imgPollUrlInput}
                  onChange={(e) => setImgPollUrlInput(e.target.value)}
                  placeholder="https://api.example.com/v1/tasks/TASK_ID_HERE"
                  style={{ marginBottom: 6, boxSizing: 'border-box', fontSize: 12 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="glass-btn-ghost glass-btn-sm" onClick={() => {
                    const v = imgPollUrlInput.trim();
                    if (v) setImgPollUrl(v); else clearImgPollUrl();
                    setShowImgPollUrlEditor(false);
                  }}>保存</button>
                  <button className="glass-btn-ghost glass-btn-sm" onClick={() => {
                    setShowImgPollUrlEditor(false);
                    setImgPollUrlInput('');
                  }}>取消</button>
                </div>
              </>
            ) : (
              <button className="glass-btn-ghost glass-btn-sm" onClick={() => {
                setImgPollUrlInput(getImgPollUrl());
                setShowImgPollUrlEditor(true);
              }}>
                {hasImgPollUrl() ? '修改' : '设置'}
              </button>
            )}
          </div>

          {imgKeySet && !showImgKeyEditor ? (
            <>
              <p style={{
                fontFamily: 'monospace', fontSize: 13, marginBottom: 8,
                color: 'var(--c-text-secondary)', wordBreak: 'break-all',
              }}>
                {maskKey(getImgApiKey())}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="glass-btn-ghost glass-btn-sm"
                  onClick={() => {
                    setShowImgKeyEditor(true);
                    setImgKeyInput(getImgApiKey());
                  }}
                >
                  更换
                </button>
                <button
                  className="glass-btn-danger glass-btn-sm"
                  onClick={() => {
                    if (!window.confirm('移除底图 API Key？移除后无法生成底图。')) return;
                    clearImgApiKey();
                    setShowImgKeyEditor(true);
                    setImgKeyInput('');
                  }}
                >
                  移除
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                className="glass-input"
                type="text"
                value={imgKeyInput}
                onChange={(e) => setImgKeyInput(e.target.value)}
                placeholder="粘贴你的 API Key"
                style={{ marginBottom: imgKeySet ? 8 : 0, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="glass-btn-hero"
                  onClick={() => {
                    const k = imgKeyInput.trim();
                    if (!k) return;
                    setImgApiKey(k);
                    setImgKeyInput('');
                    setShowImgKeyEditor(false);
                  }}
                  style={{ flex: 1 }}
                >
                  保存
                </button>
                {imgKeySet && (
                  <button
                    className="glass-btn-ghost"
                    onClick={() => {
                      setShowImgKeyEditor(false);
                      setImgKeyInput('');
                    }}
                  >
                    取消
                  </button>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                API Key 只存在你设备本地，不会上传。
              </p>
            </>
          )}
        </GlassCard>

        {/* ====== 数据备份 ====== */}
        <GlassCard>
          <div className="glass-card-header">
            <span className="glass-card-title">数据备份</span>
          </div>
          <p style={{ color: 'var(--c-text-secondary)', fontSize: 14, marginBottom: 12, lineHeight: 1.5 }}>
            将所有日记和 AI 分析结果导出为 JSON 文件，便于备份或迁移。
          </p>
          <button className="glass-btn-hero" onClick={handleExport}>
            导出备份
          </button>
        </GlassCard>

        {/* ====== 导入备份 ====== */}
        <GlassCard>
          <div className="glass-card-header">
            <span className="glass-card-title">导入备份</span>
          </div>
          <p style={{ color: 'var(--c-text-secondary)', fontSize: 14, marginBottom: 12, lineHeight: 1.5 }}>
            选择之前导出的 JSON 备份文件进行恢复。重复的记录会自动跳过。
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          <button className="glass-btn-ghost" onClick={handleImportClick}>
            选择文件
          </button>
          {importResult && (
            <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
              {importResult.error ? (
                <p style={{ color: 'var(--c-danger)' }}>{importResult.error}</p>
              ) : (
                <>
                  <p style={{ color: 'var(--c-success)', fontWeight: 500 }}>导入完成</p>
                  <p style={{ color: 'var(--c-text-secondary)', fontSize: 13 }}>
                    新增 {importResult.imported} 条记录
                    {importResult.skipped ? `，跳过 ${importResult.skipped} 条重复` : ''}
                    {importResult.projImported
                      ? `，导入 ${importResult.projImported} 次推演`
                      : ''}
                    {importResult.calibImported
                      ? `，导入 ${importResult.calibImported} 条校准`
                      : ''}
                  </p>
                </>
              )}
            </div>
          )}
        </GlassCard>

        {/* ====== 关于 ====== */}
        <GlassCard>
          <div className="glass-card-header">
            <span className="glass-card-title">关于</span>
          </div>
          <p style={{ color: 'var(--c-text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
            版本：{APP_VERSION}
            <br />
            技术栈：React 18 + TypeScript + Framer Motion
            <br />
            设计语言：Liquid Glass (iOS 26)
          </p>
        </GlassCard>
      </div>
    </AnimatedPage>
  );
}
