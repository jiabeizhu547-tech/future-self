import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'

const NAV_ITEMS = [
  {
    id: 'home',
    label: '首页',
    path: '/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: 'trends',
    label: '趋势',
    path: '/trends',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    id: 'future',
    label: '推演',
    path: '/future',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="6" x2="12" y2="12" />
        <line x1="12" y1="12" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    id: 'me',
    label: '我的',
    path: '/me',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
]

const HIDE_NAV_PATHS = ['/detail/', '/projection/']

/** 弹性弹簧配置 */
const springConfig = { type: 'spring' as const, stiffness: 520, damping: 32, mass: 0.6 }

export default function NavBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [pillLeft, setPillLeft] = useState(0)
  const [pillWidth, setPillWidth] = useState(0)
  const navRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])

  const activeIdx = (() => {
    if (location.pathname === '/') return 0
    if (location.pathname.startsWith('/trends')) return 1
    if (location.pathname.startsWith('/future')) return 2
    if (location.pathname.startsWith('/me')) return 3
    return 0
  })()

  // 更新 pill 位置
  useEffect(() => {
    const btn = btnRefs.current[activeIdx]
    if (btn) {
      const navRect = navRef.current?.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      if (navRect) {
        setPillLeft(btnRect.left - navRect.left)
        setPillWidth(btnRect.width)
      }
    }
  }, [activeIdx])

  // 详情页和推演详情页隐藏底部导航（必须放在所有 hook 之后）
  if (HIDE_NAV_PATHS.some((p) => location.pathname.startsWith(p))) {
    return null
  }

  return (
    <nav
      ref={navRef}
      className="glass-bottom-nav"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(94%, 440px)',
        zIndex: 100,
      }}
    >
      {/* 玻璃背景容器 */}
      <div className="glass-bottom-bg" />
      {/* 弹簧 pill */}
      <motion.div
        className="glass-bottom-pill"
        animate={{ left: pillLeft, width: pillWidth }}
        transition={springConfig}
      />
      {/* 按钮 */}
      {NAV_ITEMS.map((item, i) => {
        const isActive = i === activeIdx
        return (
          <button
            key={item.id}
            ref={(el) => { btnRefs.current[i] = el }}
            className="glass-bottom-btn"
            onClick={() => navigate(item.path)}
            style={{ color: isActive ? 'var(--c-primary)' : 'var(--c-text-muted)' }}
          >
            <span className="glass-bottom-icon" style={{ opacity: isActive ? 1 : 0.5 }}>
              {item.icon}
            </span>
            <motion.span
              className="glass-bottom-label"
              animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 4 }}
              transition={{ duration: 0.15 }}
            >
              {item.label}
            </motion.span>
          </button>
        )
      })}
    </nav>
  )
}
