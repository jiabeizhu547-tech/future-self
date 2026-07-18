import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  delay?: number
  className?: string
  onClick?: () => void
  style?: React.CSSProperties
  // 直接使用 react-ios-liquid-glass 组件包装
  glass?: boolean
}

export function GlassCard({ children, delay = 0, className = '', style, onClick }: Props) {
  return (
    <motion.div
      className={`glass-card${className ? ' ' + className : ''}`}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      style={style}
    >
      {children}
    </motion.div>
  )
}
