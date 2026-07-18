import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { enrichEntry, hasApiKey } from '@/ai/enrich';
import { getEnrichment, getEntry, softDeleteEntry, updateEntry } from '@/services/storage';
import { Enrichment, Entry, SignalDirection } from '@/types/models';
import { formatDayLabel, formatTime } from '@/utils/date';
import { GlassCard } from '@/components/GlassCard';

const MOOD_EMOJI = ['😡', '🙁', '😐', '🙂', '😄'];
const MOOD_VALUES = [-2, -1, 0, 1, 2];

const DIR_COLOR: Record<SignalDirection, string> = {
  toward_wanted: '#34c759',
  toward_unwanted: '#ff3b30',
  neutral: '#8a8f99',
};
const DIR_LABEL: Record<SignalDirection, string> = {
  toward_wanted: '↗ 想要',
  toward_unwanted: '↘ 警惕',
  neutral: '· 中性',
};

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [entry, setEntry] = useState<Entry | null>(null);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<number>(0);
  const [anxiety, setAnxiety] = useState(3);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    console.log('[Detail] id from useParams:', id);
    if (!id) return;
    const e = getEntry(id);
    console.log('[Detail] entry found:', !!e);
    setEntry(e);
    setEnrichment(getEnrichment(id));
    if (e) {
      setContent(e.content);
      setMood(e.mood ?? 0);
      setAnxiety(e.anxiety ?? 3);
    }
  }, [id]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  function handleSave() {
    if (!id) return;
    if (!content.trim()) return;
    updateEntry(id, {
      content,
      mood,
      anxiety,
    });
    navigate(-1);
  }

  function handleDelete() {
    if (!id) return;
    const ok = confirm('删除这条记录？\n删除后不再显示，也不参与将来的趋势与推演。');
    if (ok) {
      softDeleteEntry(id);
      navigate(-1);
    }
  }

  async function handleAnalyze() {
    if (!id || analyzing) return;
    if (!hasApiKey()) {
      alert('还没设置 DeepSeek Key。去「我的」里填一次 Key，就能让 AI 分析这条记录。');
      return;
    }
    setAnalyzing(true);
    const res = await enrichEntry(id);
    setAnalyzing(false);
    if (res.ok) {
      setEnrichment(res.enrichment);
    } else {
      alert('分析失败，可稍后重试。');
    }
  }

  if (!entry) {
    return (
      <div className="page">
        <span className="glass-muted">记录不存在或已删除。</span>
      </div>
    );
  }

  return (
    <div className="page">
        {/* 页面头部 */}
        <div className="glass-header">
          <button className="glass-btn-ghost" onClick={() => navigate(-1)}>
            ← 返回
          </button>
          <h1>编辑记录</h1>
          <div style={{ width: 60 }} />
        </div>

        {/* 日期 */}
        <div className="glass-muted" style={{ marginBottom: 12 }}>
          {formatDayLabel(entry.day)} {formatTime(entry.created_at)}
          {entry.updated_at !== entry.created_at && (
            <span style={{ marginLeft: 8, fontSize: 12 }}>
              (编辑于 {formatTime(entry.updated_at)})
            </span>
          )}
        </div>

        {/* 内容编辑区 */}
        <GlassCard>
          <textarea
            ref={textareaRef}
            className="glass-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="编辑这条记录…"
            style={{ minHeight: 160 }}
          />
        </GlassCard>

        {/* 心情选择器 */}
        <GlassCard delay={0.05}>
          <div className="mood-selector">
            {MOOD_EMOJI.map((emoji, i) => (
              <button
                key={MOOD_VALUES[i]}
                className={`glass-mood-btn${mood === MOOD_VALUES[i] ? ' selected' : ''}`}
                onClick={() => setMood(MOOD_VALUES[i])}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="glass-slider-row">
            <label>焦虑</label>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={anxiety}
              onChange={(e) => setAnxiety(Number(e.target.value))}
            />
            <span className="slider-value">{anxiety}/10</span>
          </div>
        </GlassCard>

        {/* 保存按钮 */}
        <button className="glass-btn-hero" onClick={handleSave}>
          保存修改
        </button>

        {/* 分析按钮 */}
        <div style={{ marginTop: 8 }}>
          <button
            className="glass-btn-hero"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? '分析中…' : enrichment ? '重新分析' : '✨ 分析这条'}
          </button>
        </div>

        {/* AI 富化结果 */}
        {enrichment ? (
          <GlassCard delay={0.1}>
            <div className="glass-card-header">
              <span className="glass-card-title">AI 分析</span>
            </div>

            {enrichment.summary ? (
              <div className="glass-muted" style={{ marginBottom: 12, fontSize: 15, lineHeight: 1.5 }}>
                🧭 {enrichment.summary}
              </div>
            ) : null}

            {/* 指标 */}
            <div className="glass-muted" style={{ marginBottom: 12 }}>
              效价 {fmtSigned(enrichment.valence)} · 焦虑{' '}
              {enrichment.anxiety_ai != null ? `${enrichment.anxiety_ai}/10` : '—'} · 精力{' '}
              {enrichment.energy != null ? enrichment.energy.toFixed(1) : '—'}
            </div>

            {/* 主题 */}
            {enrichment.topics.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {enrichment.topics.map((t) => (
                  <span className="glass-chip glass-chip-primary" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            ) : null}

            {/* 人物 */}
            {enrichment.people.length > 0 ? (
              <div className="glass-muted" style={{ marginBottom: 10 }}>
                👤 {enrichment.people.join('、')}
              </div>
            ) : null}

            {/* 信号 */}
            {enrichment.signals.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  marginTop: 6,
                }}
              >
                <span
                  className={`glass-chip ${s.direction === 'toward_wanted' ? 'glass-chip-success' : s.direction === 'toward_unwanted' ? 'glass-chip-danger' : ''}`}
                >
                  {DIR_LABEL[s.direction]}
                </span>
                <span className="glass-muted" style={{ flex: 1 }}>
                  {s.text}
                </span>
              </div>
            ))}
          </GlassCard>
        ) : null}

        {/* 删除 */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <button className="glass-btn-danger" onClick={handleDelete}>
            删除这条
          </button>
        </div>
      </div>
  );
}

function fmtSigned(v: number | null): string {
  if (v == null) return '—';
  return v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
}
