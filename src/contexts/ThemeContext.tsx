import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { listEntries } from '@/services/storage'
import { getCachedBg, generateTodayBg, hasTodayBg, hasImgApiKey, type BgData, type BgStatus } from '@/services/backgroundGen'

/* ---------- 情绪类型 ---------- */

export type MoodType = 'warm' | 'calm' | 'deep' | 'amber'

export const MOOD_META: Record<MoodType, { label: string; color: string; glow: string }> = {
  warm:  { label: '积极·兴奋', color: '#ff9500', glow: 'rgba(255,149,0,0.2)' },
  calm:  { label: '平静·专注', color: '#007aff', glow: 'rgba(0,122,255,0.2)' },
  deep:  { label: '沉思·内省', color: '#af52de', glow: 'rgba(175,82,222,0.2)' },
  amber: { label: '焦虑·紧张', color: '#ff9f0a', glow: 'rgba(255,159,10,0.2)' },
}

/* ---------- 上下文 ---------- */

interface ThemeCtx {
  mood: MoodType
  color: string
  glow: string
  /** 手动覆盖（「我的」设置） */
  override: MoodType | null
  setOverride: (m: MoodType | null) => void
  /** AI 底图 */
  bgData: BgData | null
  bgStatus: BgStatus
  /** 手动生成底图 */
  generateBg: (force?: boolean) => void
}

const ThemeContext = createContext<ThemeCtx>({
  mood: 'calm',
  color: '#007aff',
  glow: 'rgba(0,122,255,0.2)',
  override: null,
  setOverride: () => {},
  bgData: null,
  bgStatus: { type: 'idle' },
  generateBg: () => {},
})

export function useTheme() { return useContext(ThemeContext) }

/* ---------- 分析函数 ---------- */

function analyzeMood(): MoodType {
  const entries = listEntries().slice(0, 20)
  if (entries.length === 0) return 'calm'

  let moodSum = 0
  let anxietySum = 0
  let moodCount = 0
  let anxietyCount = 0

  for (const e of entries) {
    if (e.mood != null) { moodSum += e.mood; moodCount++ }
    if (e.anxiety != null) { anxietySum += e.anxiety; anxietyCount++ }
  }

  const avgMood = moodCount > 0 ? moodSum / moodCount : 0
  const avgAnxiety = anxietyCount > 0 ? anxietySum / anxietyCount : 5

  if (avgAnxiety >= 6) return 'amber'
  if (avgMood >= 0.8) return 'warm'
  if (avgMood <= -0.5) return 'deep'
  return 'calm'
}

/* ---------- Provider ---------- */

/** 同步设置 CSS 变量到 :root，首次渲染前执行 */
function applyCssVars(active: MoodType, bgUrl: string | null) {
  const { color, glow } = MOOD_META[active]
  const html = document.documentElement
  html.style.setProperty('--mood-color', color)
  html.style.setProperty('--mood-glow', glow)
  html.style.setProperty('--mood-type', active)
  html.dataset.mood = active
  if (bgUrl) {
    html.style.setProperty('--bg-image', `url(${bgUrl})`)
    document.getElementById('root')?.classList.add('has-bg')
  } else {
    html.style.setProperty('--bg-image', 'none')
    document.getElementById('root')?.classList.remove('has-bg')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const cachedBg = getCachedBg()

  // 初始 mood 和背景状态 同步计算出，直接 apply CSS vars
  const [mood, setMood] = useState<MoodType>(() => {
    const m = analyzeMood()
    applyCssVars(m, cachedBg?.url ?? null)
    return m
  })

  const [override, setOverride] = useState<MoodType | null>(null)
  const [bgData, setBgData] = useState<BgData | null>(cachedBg)
  const [bgStatus, setBgStatus] = useState<BgStatus>(
    cachedBg && hasTodayBg()
      ? { type: 'done', data: cachedBg }
      : { type: 'idle' }
  )

  // 页面加载时自动生成底图（如果今天还没生成且用户有生图 API Key）
  useEffect(() => {
    if (!hasImgApiKey() || hasTodayBg()) return
    // 延迟执行，避免阻塞首屏渲染
    const timer = setTimeout(() => {
      generateBg()
    }, 3000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 封装 generateBg
  const generateBg = async (force = false) => {
    setBgStatus({ type: 'generating', message: '正在提交…' })
    const result = await generateTodayBg(force)
    setBgStatus(result)
    if (result.type === 'done') {
      setBgData(result.data)
    }
  }

  // 情绪分析
  useEffect(() => {
    const update = () => setMood(analyzeMood())
    update()
    window.addEventListener('storage', update)
    const timer = setInterval(update, 30_000)
    return () => {
      window.removeEventListener('storage', update)
      clearInterval(timer)
    }
  }, [])

  const active: MoodType = override ?? mood
  const { color, glow } = MOOD_META[active]

  // CSS 变量在 render 阶段同步设置，避免首帧闪烁
  applyCssVars(active, bgData?.url ?? null)

  return (
    <ThemeContext.Provider value={{ mood: active, color, glow, override, setOverride, bgData, bgStatus, generateBg }}>
      {children}
    </ThemeContext.Provider>
  )
}
