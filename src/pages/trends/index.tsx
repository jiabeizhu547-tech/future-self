import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell,
} from 'recharts';

import { buildTrend, TrendSummary, DayPoint } from '@/utils/aggregate';
import { AnimatedPage } from '@/components/AnimatedPage';
import { GlassCard } from '@/components/GlassCard';
import { useTheme, MOOD_META } from '@/contexts/ThemeContext';

function shortDay(day: string): string {
  const p = day.split('-');
  return `${parseInt(p[1], 10)}/${parseInt(p[2], 10)}`;
}

function deltaText(delta: number | null): string {
  if (delta == null) return '—';
  return delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
}

function formatNum(v: number | null): string {
  if (v == null) return '—';
  return v.toFixed(1);
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e8e8e8',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {p.value != null ? Number(p.value).toFixed(1) : '—'}
        </div>
      ))}
    </div>
  );
};

export default function Trends() {
  const navigate = useNavigate();
  const theme = useTheme();
  const moodMeta = MOOD_META[theme.mood];
  const [data, setData] = useState<TrendSummary | null>(null);

  useEffect(() => {
    setData(buildTrend());
  }, []);

  if (!data || data.totalEntries === 0) {
    return (
      <AnimatedPage>
        <div className="page">
          <div className="empty">
            <div className="empty-icon"
              style={{
                background: `linear-gradient(135deg, ${moodMeta.color}22, transparent)`,
                borderRadius: '50%',
                width: 80,
                height: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-xl)',
              }}
            >📊</div>
            <p>还没有可分析的记录。先去首页记几条，这里就会长出曲线。</p>
          </div>
        </div>
      </AnimatedPage>
    );
  }

  const { days } = data;

  return (
    <AnimatedPage>
      <div className="page">
        {/* 页面头部 */}
        <div className="glass-header">
          <h1>趋势分析</h1>
        </div>

        {/* 概览卡片 */}
        <GlassCard
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a' }}>
              {data.totalEntries}
            </div>
            <div style={{ fontSize: 12, color: '#8a8f99', marginTop: 2 }}>
              条记录
            </div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a' }}>
              {data.daysTracked}
            </div>
            <div style={{ fontSize: 12, color: '#8a8f99', marginTop: 2 }}>
              天
            </div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a' }}>
              {formatNum(data.avgAnxiety)}
            </div>
            <div style={{ fontSize: 12, color: '#8a8f99', marginTop: 2 }}>
              平均焦虑
            </div>
          </div>
        </GlassCard>

        {/* 焦虑对比 */}
        <GlassCard>
          <div className="glass-card-header">
            <div className="glass-card-title">焦虑变化</div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              gap: 16,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#8a8f99' }}>更早</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>
                {formatNum(data.earlierAnxiety)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#8a8f99' }}>近期</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>
                {formatNum(data.recentAnxiety)}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color:
                  data.anxietyDelta == null
                    ? '#8a8f99'
                    : data.anxietyDelta <= 0
                      ? '#34c759'
                      : '#ff3b30',
              }}
            >
              <span style={{ fontSize: 20 }}>
                {data.anxietyDelta == null
                  ? '—'
                  : data.anxietyDelta <= 0
                    ? '↓'
                    : '↑'}
              </span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>
                {deltaText(data.anxietyDelta)}
              </span>
            </div>
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: '#8a8f99',
              textAlign: 'center',
            }}
          >
            {data.anxietyDelta == null
              ? '记录还不多，多记几天就能看出焦虑的走向。'
              : data.anxietyDelta <= -0.5
                ? '近期焦虑下降，状态在往好走'
                : data.anxietyDelta >= 0.5
                  ? '近期焦虑上升，记得给自己松口气'
                  : '近期焦虑比较平稳'}
          </div>
        </GlassCard>

        {/* 焦虑趋势图 */}
        <GlassCard>
          <div className="glass-card-header">
            <div className="glass-card-title">焦虑趋势</div>
          </div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <LineChart
                data={days}
                margin={{ top: 4, right: 4, bottom: 4, left: -20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="day"
                  tickFormatter={shortDay}
                  tick={{ fontSize: 11, fill: '#8a8f99' }}
                  axisLine={{ stroke: '#e8e8e8' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 10]}
                  tick={{ fontSize: 11, fill: '#8a8f99' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  y={data.avgAnxiety ?? undefined}
                  stroke="#c8ccd2"
                  strokeDasharray="4 4"
                  label={{
                    value: '平均',
                    position: 'insideTopRight',
                    fontSize: 10,
                    fill: '#8a8f99',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="anxiety"
                  name="焦虑"
                  stroke="#ff9500"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#ff9500', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#ff9500' }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 16,
              marginTop: 8,
              fontSize: 11,
              color: '#8a8f99',
            }}
          >
            <span>柱高 = 焦虑 (0–10)</span>
          </div>
        </GlassCard>

        {/* 情绪效价趋势 */}
        <GlassCard>
          <div className="glass-card-header">
            <div className="glass-card-title">情绪效价</div>
          </div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart
                data={days}
                margin={{ top: 4, right: 4, bottom: 4, left: -20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="day"
                  tickFormatter={shortDay}
                  tick={{ fontSize: 11, fill: '#8a8f99' }}
                  axisLine={{ stroke: '#e8e8e8' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[-1, 1]}
                  tick={{ fontSize: 11, fill: '#8a8f99' }}
                  axisLine={false}
                  tickLine={false}
                  ticks={[-1, -0.5, 0, 0.5, 1]}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#e0e0e0" />
                <Bar
                  dataKey="valence"
                  name="效价"
                  radius={[3, 3, 0, 0]}
                >
                  {days.map((entry: DayPoint, index: number) => {
                    const v = entry.valence;
                    let color = '#a0a4ab';
                    if (v != null) {
                      if (v >= 0.15) color = '#34c759';
                      else if (v <= -0.2) color = '#ff9500';
                    }
                    return <Cell key={index} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 16,
              marginTop: 8,
              fontSize: 11,
              color: '#8a8f99',
              flexWrap: 'wrap',
            }}
          >
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#34c759',
                  marginRight: 4,
                }}
              />{' '}
              情绪好
            </span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#a0a4ab',
                  marginRight: 4,
                }}
              />{' '}
              平稳
            </span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#ff9500',
                  marginRight: 4,
                }}
              />{' '}
              低落
            </span>
          </div>
        </GlassCard>

        {/* 高频主题 */}
        {data.topTopics.length > 0 && (
          <GlassCard>
            <div className="glass-card-header">
              <div className="glass-card-title">高频主题</div>
            </div>
            <div className="flex flex-wrap gap-sm">
              {data.topTopics.map((t) => (
                <span className="glass-chip glass-chip-primary" key={t.topic}>
                  {t.topic} · {t.count}
                </span>
              ))}
            </div>
          </GlassCard>
        )}

        {/* 苗头信号 */}
        {data.signals.length > 0 && (
          <GlassCard>
            <div className="glass-card-header">
              <div className="glass-card-title">信号苗头</div>
            </div>
            <p className="glass-muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
              这些是 AI 从你最近的记录里读出的、可能影响未来走向的念头。点一条能回到当时那篇。
            </p>
            {data.signals.map((s) => (
              <div
                key={`${s.entryId}-${s.text}`}
                onClick={() => navigate(`/detail/${s.entryId}`)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  padding: '10px 0',
                  borderTop: '1px solid #f0f1f3',
                  cursor: 'pointer',
                }}
              >
                <span
                  className={
                    s.direction === 'toward_wanted'
                      ? 'glass-chip glass-chip-success'
                      : 'glass-chip glass-chip-danger'
                  }
                  style={{ marginRight: 10, flexShrink: 0 }}
                >
                  {s.direction === 'toward_wanted' ? '↗ 想靠近' : '↘ 想警惕'}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: '#2a2d33',
                    lineHeight: 1.5,
                  }}
                >
                  {s.text}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 11,
                    color: '#b0b4bb',
                    marginLeft: 8,
                  }}
                >
                  {shortDay(s.day)}
                </span>
              </div>
            ))}
          </GlassCard>
        )}
      </div>
    </AnimatedPage>
  );
}
