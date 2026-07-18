import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { deleteProjection, listProjections } from '@/services/storage';
import { Projection } from '@/types/models';
import { toDayString } from '@/utils/date';
import { AnimatedPage } from '@/components/AnimatedPage';
import { GlassCard } from '@/components/GlassCard';
import { useTheme, MOOD_META } from '@/contexts/ThemeContext';

import './index.scss';

export default function Future() {
  const navigate = useNavigate();
  const theme = useTheme();
  const moodMeta = MOOD_META[theme.mood];
  const [projections, setProjections] = useState<Projection[]>([]);

  const load = useCallback(() => {
    setProjections(listProjections());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (confirm('确定删除这条推演记录？')) {
        deleteProjection(id);
        load();
      }
    },
    [load],
  );

  return (
    <AnimatedPage>
      <div className="page">
        {/* 页面头部 */}
        <div className="glass-header">
          <div>
            <h1>人生推演</h1>
            <div className="subtitle">AI 基于你的日记推演出的未来人生路径</div>
          </div>
        </div>

        {/* 创建入口 */}
        <GlassCard className="glass-card-mood">
          <div className="intro-title">🔮 未来推演</div>
          <div className="intro-text">
            让 AI 基于你的记录，推演出几条 5 年 / 10 年后可能的人生路径。
          </div>
          <button
            className="glass-btn-hero"
            onClick={() => navigate('/')}
            style={{ marginTop: 16 }}
          >
            去写日记
          </button>
          <span className="glass-muted" style={{ display: 'block', marginTop: 10, fontSize: 13 }}>
            先写日记，积累足够记录后再来推演
          </span>
        </GlassCard>

        {/* 推演列表 */}
        {projections.length === 0 ? (
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
            >🔮</div>
            <p>还没有推演记录。</p>
            <p className="mt-sm" style={{ color: 'var(--c-text-secondary)' }}>
              先坚持写日记，再回来让 AI 帮你看见未来的可能。
            </p>
          </div>
        ) : (
          <div>
            <div className="hist">
              <span className="hist-title">过往推演</span>
              {[...projections].reverse().map((p) => {
                const stances = Object.values(p.stances ?? {});
                const wantCount = stances.filter((s) => s === 'want').length;
                const dontCount = stances.filter((s) => s === 'dont_want').length;

                return (
                  <div key={p.id}>
                    <GlassCard
                      onClick={() => navigate(`/projection/${p.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="proj-head">
                        <span className="glass-chip glass-chip-primary">
                          {p.horizon_years}年推演
                        </span>
                        <span className="glass-muted">{toDayString(p.created_at)}</span>
                      </div>

                      {p.summary ? (
                        <span className="proj-summary">{p.summary}</span>
                      ) : null}

                      <div className="proj-meta" style={{ marginBottom: 6 }}>
                        {p.window_start} ~ {p.window_end} · 共 {p.paths.length} 条路径 ·
                        基于 {p.entry_count} 条记录
                      </div>

                      {/* 立场汇总 */}
                      {(wantCount > 0 || dontCount > 0) ? (
                        <div className="flex items-center gap-sm" style={{ marginBottom: 8 }}>
                          {wantCount > 0 ? (
                            <span className="glass-chip glass-chip-success">
                              想要 ×{wantCount}
                            </span>
                          ) : null}
                          {dontCount > 0 ? (
                            <span className="glass-chip glass-chip-danger">
                              不想要 ×{dontCount}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {/* 删除按钮 */}
                      <button
                        className="glass-btn-ghost glass-btn-sm"
                        onClick={(e) => handleDelete(e, p.id)}
                      >
                        删除
                      </button>
                    </GlassCard>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}
