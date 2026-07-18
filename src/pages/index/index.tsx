import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { createEntry, listEntries } from '@/services/storage'
import { enrichEntry, hasApiKey } from '@/ai/enrich'
import { Entry } from '@/types/models'
import { formatDayLabel, formatTime } from '@/utils/date'
import { AnimatedPage } from '@/components/AnimatedPage'
import { GlassCard } from '@/components/GlassCard'
import { useTheme, MOOD_META } from '@/contexts/ThemeContext'

/* ---------- 常量 ---------- */

const MOOD_EMOJIS = ['😡', '🙁', '😐', '🙂', '😄']
const MOOD_VALUES = [-2, -1, 0, 1, 2]

/* ---------- 工具 ---------- */

interface DaySection {
  day: string
  entries: Entry[]
}

function groupByDay(list: Entry[]): DaySection[] {
  const map: Record<string, Entry[]> = {}
  const order: string[] = []
  for (const e of list) {
    if (!map[e.day]) {
      map[e.day] = []
      order.push(e.day)
    }
    map[e.day].push(e)
  }
  return order.map((day) => ({ day, entries: map[day] }))
}

/** 动态问候语 + 子标题 */
function getGreeting(): { title: string; subtitle: string } {
  const h = new Date().getHours()
  if (h < 6) return { title: '夜深了', subtitle: '还有什么在心头？写下来，明天会不一样。' }
  if (h < 9) return { title: '早上好', subtitle: '新的一天，此刻你在想什么？' }
  if (h < 12) return { title: '上午好', subtitle: '捕捉此刻的念头，让它们不再飘散。' }
  if (h < 14) return { title: '中午好', subtitle: '午间的思绪，也许藏着今天的答案。' }
  if (h < 18) return { title: '下午好', subtitle: '写下来，把今天的感受收进时间之镜。' }
  if (h < 21) return { title: '傍晚好', subtitle: '一天将尽，回顾此刻最真实的感受。' }
  return { title: '晚上好', subtitle: '把今天的思绪倒进时间之镜，看看会流向哪里。' }
}

/* ---------- 首页组件 ---------- */

export default function Index() {
  const navigate = useNavigate()
  const theme = useTheme()
  const moodMeta = MOOD_META[theme.mood]
  const [pulsing, setPulsing] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pulseTimer = useRef<ReturnType<typeof setTimeout>>()

  /* 表单状态 */
  const [content, setContent] = useState('')
  const [showMeta, setShowMeta] = useState(false)
  const [mood, setMood] = useState(0)
  const [anxiety, setAnxiety] = useState(3)

  /* 列表状态 */
  const [sections, setSections] = useState<DaySection[]>([])

  const refresh = useCallback(() => {
    setSections(groupByDay(listEntries()))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /* 微光脉冲：聚焦时启动，失焦时停止 */
  const handleFocus = useCallback(() => {
    setPulsing(true)
    if (pulseTimer.current) clearTimeout(pulseTimer.current)
  }, [])

  const handleBlur = useCallback(() => {
    // 延迟关闭，让动画自然过渡
    pulseTimer.current = setTimeout(() => setPulsing(false), 600)
  }, [])

  useEffect(() => {
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current)
    }
  }, [])

  function handleSave() {
    const text = content.trim()
    if (!text) return
    const entry = createEntry({
      content: text,
      mood: showMeta ? mood : null,
      anxiety: showMeta ? anxiety : null,
    })
    setContent('')
    setShowMeta(false)
    setMood(0)
    setAnxiety(3)
    refresh()
    // 保存后异步调用 AI 分析（不 await，不阻塞 UI）
    if (hasApiKey()) {
      enrichEntry(entry.id)
    }
    // 触发情绪主题重新计算
    window.dispatchEvent(new Event('storage'))
  }

  const canSave = content.trim().length > 0
  const greeting = getGreeting()

  return (
    <AnimatedPage>
      <div className="page">
        {/* ====== 动态问候 + 情绪折射色 ====== */}
        <div className="glass-header" style={{ border: 'none' }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {greeting.title}
              {/* 情绪折射色指示器 */}
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: moodMeta.color,
                  boxShadow: `0 0 12px ${moodMeta.color}66`,
                  transition: 'all var(--dur-slow)',
                }}
                title={`当前情绪基调: ${moodMeta.label}`}
              />
            </h1>
            <span className="subtitle">{greeting.subtitle}</span>
          </div>
        </div>

        {/* ====== 超透玻璃输入区 (Utility Glass) ====== */}
        <GlassCard className="glass-card-mood" style={{ padding: 'var(--space-xl)' }}>
          <textarea
            ref={inputRef}
            className={`glass-input-utility${pulsing ? ' pulsing' : ''}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="今天的一个想法、感受、观察，见了谁、什么状态…"
            rows={4}
          />

          {showMeta ? (
            <div style={{ marginTop: 16 }}>
              {/* 情绪选择 */}
              <div className="glass-mood-selector">
                {MOOD_VALUES.map((val) => (
                  <button
                    key={val}
                    className={`glass-mood-btn${mood === val ? ' selected' : ''}`}
                    onClick={() => setMood(val)}
                  >
                    {MOOD_EMOJIS[val + 2]}
                  </button>
                ))}
              </div>

              {/* 焦虑滑块 */}
              <div className="glass-slider-row" style={{ marginTop: 12 }}>
                <label>焦虑</label>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={anxiety}
                  onChange={(e) => setAnxiety(Number(e.target.value))}
                />
                <span className="slider-value">{anxiety}</span>
              </div>

              <span
                style={{ display: 'inline-block', marginTop: 8, fontSize: 13, color: 'var(--c-text-muted)', cursor: 'pointer' }}
                onClick={() => setShowMeta(false)}
              >
                收起心情标记
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <span
                style={{ fontSize: 13, color: 'var(--c-text-muted)', cursor: 'pointer' }}
                onClick={() => setShowMeta(true)}
              >
                ＋ 标记心情 / 焦虑（可选）
              </span>
            </div>
          )}

          <button
            className="glass-btn-hero"
            disabled={!canSave}
            onClick={handleSave}
            style={{
              marginTop: 16,
              background: canSave ? `linear-gradient(135deg, ${moodMeta.color}, ${moodMeta.color}cc)` : undefined,
              boxShadow: canSave ? `0 4px 16px ${moodMeta.glow}` : undefined,
            }}
          >
            记下来 — 存入时间之镜
          </button>
        </GlassCard>

        {/* ====== 记录列表 ====== */}
        {sections.length === 0 ? (
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
            >
              📝
            </div>
            <h3>时间之镜还是空的</h3>
            <p>在上面写下第一条记录，看看它会流向怎样的未来。</p>
          </div>
        ) : (
          <div>
            {sections.map((sec) => (
              <div key={sec.day}>
                <div
                  className="flex items-center justify-between"
                  style={{ padding: '12px 4px 8px' }}
                >
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)' }}>
                    {formatDayLabel(sec.day)}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>
                    {sec.entries.length} 条记录
                  </span>
                </div>

                {sec.entries.map((e, i) => (
                  <GlassCard
                    key={e.id}
                    delay={i * 0.03}
                    onClick={() => navigate(`/detail/${e.id}`)}
                    style={{ cursor: 'pointer', marginBottom: 10 }}
                  >
                    <div className="entry-date">
                      {formatTime(e.created_at)}
                      {e.mood !== null && (
                        <span style={{ marginLeft: 6 }}>{MOOD_EMOJIS[e.mood + 2]}</span>
                      )}
                    </div>
                    <div className="entry-content">{e.content}</div>
                    {(e.mood !== null || e.anxiety !== null) && (
                      <div className="entry-meta" style={{ marginTop: 8 }}>
                        {e.anxiety !== null && (
                          <span className="glass-chip" style={{ fontSize: 11 }}>
                            焦虑 {e.anxiety}/10
                          </span>
                        )}
                      </div>
                    )}
                  </GlassCard>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
