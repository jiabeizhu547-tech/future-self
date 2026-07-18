import { Fragment, useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { calibratePath } from '@/ai/calibrate';
import { getCalibration, getEntry, getProjection, saveCalibration, setPathStance } from '@/services/storage';
import { CalibrationInsight, FuturePath, Stance } from '@/types/models';
import { formatDayLabel, nowMs } from '@/utils/date';
import { GlassCard } from '@/components/GlassCard';
import { AnimatedPage } from '@/components/AnimatedPage';

import './index.scss';

function valenceTag(v: number | null): { text: string; color: string } {
  if (v == null) return { text: '', color: '#8a8f99' };
  if (v >= 0.3) return { text: '偏想要', color: '#10b981' };
  if (v <= -0.3) return { text: '需警惕', color: '#ef4444' };
  return { text: '中性', color: '#8a8f99' };
}

const STANCE_LABEL: Record<Stance, string> = {
  want: '想要',
  dont_want: '不想要',
  neutral: '说不好',
};

const STANCE_COLOR: Record<Stance, string> = {
  want: '#10b981',
  dont_want: '#ef4444',
  neutral: '#9ca3af',
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '容易',
  medium: '中等',
  hard: '需努力',
};

export default function ProjectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const proj = id ? getProjection(id) : null;

  const [calibMap, setCalibMap] = useState<
    Record<number, CalibrationInsight | 'loading' | null>
  >(() => {
    if (!proj) return {};
    const loaded: Record<number, CalibrationInsight | null> = {};
    proj.paths.forEach((_, i) => {
      const cached = getCalibration(proj.id, i);
      if (cached) loaded[i] = cached;
    });
    return loaded;
  });

  async function handleStance(pathIndex: number, stance: Stance) {
    if (!proj) return;

    const cur = proj.stances?.[pathIndex];
    const next: Stance = cur === stance ? 'neutral' : stance;

    setPathStance(proj.id, pathIndex, next);
    refresh();

    if (next === 'neutral') {
      const insight: CalibrationInsight = {
        projection_id: proj.id,
        path_index: pathIndex,
        stance: 'neutral',
        signal_hits: [],
        adjustments: [],
        early_signal_defs: [],
        summary: '',
        created_at: nowMs(),
      };
      saveCalibration(insight);
      setCalibMap((prev) => ({ ...prev, [pathIndex]: insight }));
      return;
    }

    setCalibMap((prev) => ({ ...prev, [pathIndex]: 'loading' }));

    try {
      const insight = await calibratePath(proj.paths[pathIndex], pathIndex, next, proj.id);
      saveCalibration(insight);
      setCalibMap((prev) => ({ ...prev, [pathIndex]: insight }));
    } catch (e: any) {
      console.error('[proj] calibrate error:', e);
      setCalibMap((prev) => ({
        ...prev,
        [pathIndex]: {
          projection_id: proj.id,
          path_index: pathIndex,
          stance: next,
          signal_hits: [],
          adjustments: [],
          early_signal_defs: [],
          summary: '校准分析失败：' + (e.message || '未知错误'),
          created_at: nowMs(),
        },
      }));
    }
  }

  function openSeed(entryId: string) {
    const e = getEntry(entryId);
    if (!e) return;
    navigate('/detail/' + entryId);
  }

  if (!proj) {
    return (
      <AnimatedPage>
        <div className="page">
          <div className="empty">没找到这次推演。</div>
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <div className="page">
        {/* 页面头部 */}
        <div className="glass-header">
          <div className="flex items-center gap-sm">
            <button className="btn glass-btn-ghost glass-btn-sm" onClick={() => navigate(-1)}>
              ← 返回
            </button>
            <h1>推演详情</h1>
          </div>
        </div>

        {/* 摘要卡片 */}
        <GlassCard>
          <div className="head-card">
            <span className="head-horizon">
              {proj.horizon_years} 年后 · {proj.paths.length} 条可能
            </span>
            {proj.summary ? <span className="head-summary">{proj.summary}</span> : null}
            <span className="head-meta">
              基于 {proj.window_start} ~ {proj.window_end} 的 {proj.entry_count} 条记录
            </span>
          </div>
        </GlassCard>

        {/* 路径卡 */}
        {proj.paths.map((p: FuturePath, i: number) => {
          const vt = valenceTag(p.valence_guess);
          const stance: Stance = proj.stances?.[i] ?? 'neutral';
          const calib = calibMap[i];
          const isLast = i === proj.paths.length - 1;

          return (
            <Fragment key={i}>
              <GlassCard delay={i * 0.05}>
                {/* 卡片头部 */}
                <div className="glass-card-header">
                  <span className="glass-card-title">{p.title}</span>
                  {vt.text ? <span className="glass-chip">{vt.text}</span> : null}
                </div>

                {p.narrative ? <div className="glass-muted">{p.narrative}</div> : null}

                {/* 驱动因素 */}
                {p.drivers.length > 0 ? (
                  <div className="mt-md">
                    <div className="glass-muted">推动因素</div>
                    {p.drivers.map((d, di) => (
                      <div className="glass-muted" key={di}>
                        · {d}
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* 来源记录 */}
                {p.seed_entry_ids.length > 0 ? (
                  <div className="mt-md">
                    <div className="glass-muted">来自这些记录:</div>
                    <div className="flex flex-wrap gap-sm mt-sm">
                      {p.seed_entry_ids.map((sid) => {
                        const e = getEntry(sid);
                        return (
                          <span
                            className="glass-chip glass-chip-primary"
                            key={sid}
                            onClick={() => openSeed(sid)}
                          >
                            {e ? formatDayLabel(e.day) : '已删除'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* 立场按钮 — 使用 glass-btn-sm + glass-btn-ghost，表现如 chips */}
                <div className="flex gap-sm items-center mt-md">
                  {(['want', 'dont_want', 'neutral'] as Stance[]).map((s) => {
                    const isActive = stance === s;
                    return (
                      <button
                        key={s}
                        className="btn glass-btn-sm glass-btn-ghost"
                        style={
                          isActive
                            ? {
                                backgroundColor: STANCE_COLOR[s],
                                color: '#fff',
                              }
                            : {}
                        }
                        onClick={() => handleStance(i, s)}
                      >
                        {isActive ? '✓ ' : ''}
                        {STANCE_LABEL[s]}
                      </button>
                    );
                  })}
                </div>

                {/* 校准洞察 */}
                {calib && calib !== 'loading' ? (
                  <GlassCard delay={0.1} className="mt-md">
                    {/* 校准头部 */}
                    <div className="glass-card-header">
                      <span className="glass-card-title">校准分析</span>
                      <span
                        className="glass-chip"
                        style={{
                          backgroundColor: STANCE_COLOR[calib.stance] + '18',
                          color: STANCE_COLOR[calib.stance],
                        }}
                      >
                        {STANCE_LABEL[calib.stance]}
                      </span>
                    </div>

                    {/* 信号扫描 */}
                    {calib.signal_hits.length > 0 ? (
                      <div className="mb-sm">
                        <div className="glass-muted">
                          🔍 信号扫描（{calib.signal_hits.length} 个）
                        </div>
                        <div className="flex flex-wrap gap-sm mt-sm">
                          {calib.signal_hits.map((h, hi) => {
                            const isWanted = h.direction === 'toward_wanted';
                            const isUnwanted = h.direction === 'toward_unwanted';
                            return (
                              <span
                                className={`glass-chip ${isWanted ? 'glass-chip-success' : ''} ${isUnwanted ? 'glass-chip-danger' : ''}`}
                                key={hi}
                                onClick={() => {
                                  if (h.example_entry_ids[0]) openSeed(h.example_entry_ids[0]);
                                }}
                              >
                                {isWanted ? '↗' : isUnwanted ? '↘' : '·'}
                                {' '}
                                {h.signal} ×{h.count}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="mb-sm">
                        <div className="glass-muted">🔍 信号扫描</div>
                        <div className="glass-muted mt-sm">
                          近期记录中尚未发现明显匹配信号。
                        </div>
                      </div>
                    )}

                    {/* 微调建议 */}
                    {calib.adjustments.length > 0 ? (
                      <div className="mb-sm">
                        <div className="glass-muted">🎯 微调建议</div>
                        {calib.adjustments.map((a, ai) => (
                          <div className="glass-card glass-card-compact mt-sm" key={ai}>
                            <div className="flex items-center justify-between">
                              <span style={{ fontWeight: 600 }}>{a.what}</span>
                              <span
                                className={`glass-chip ${a.difficulty === 'easy' ? 'glass-chip-success' : ''} ${a.difficulty === 'hard' ? 'glass-chip-danger' : ''} ${a.difficulty === 'medium' ? 'chip-warning' : ''}`}
                              >
                                {DIFFICULTY_LABEL[a.difficulty]}
                              </span>
                            </div>
                            {a.why ? (
                              <div className="glass-muted mt-sm">{a.why}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* 早期预警信号 */}
                    {calib.early_signal_defs.length > 0 ? (
                      <div className="mb-sm">
                        <div className="glass-muted">⚠️ 早期预警信号</div>
                        {calib.early_signal_defs.map((w, wi) => (
                          <div className="glass-card glass-card-compact mt-sm" key={wi}>
                            <span style={{ fontWeight: 600 }}>
                              ⚡ {w.signal}
                            </span>
                            {w.interpretation ? (
                              <div className="glass-muted mt-sm">
                                {w.interpretation}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* 总结 */}
                    {calib.summary ? (
                      <div
                        className="glass-muted mt-sm"
                        style={{
                          paddingTop: 'var(--space-md)',
                          borderTop: '1px solid var(--c-border-light)',
                        }}
                      >
                        {calib.summary}
                      </div>
                    ) : null}
                  </GlassCard>
                ) : null}

                {/* 加载状态 */}
                {calib === 'loading' ? (
                  <div className="empty mt-md">正在分析校准…</div>
                ) : null}
              </GlassCard>

              {!isLast ? <div className="glass-divider" /> : null}
            </Fragment>
          );
        })}

        <div className="glass-muted mt-md" style={{ whiteSpace: 'pre-line' }}>
          标记「想要」→ 反推当下可微调的事。
          {'\n'}
          标记「不想要」→ 识别该警惕的早期信号。
        </div>
      </div>
    </AnimatedPage>
  );
}
