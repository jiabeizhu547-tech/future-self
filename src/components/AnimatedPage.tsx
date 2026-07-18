import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

/* 页面入场动画变体 */
const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease: [0.65, 0, 0.35, 1] },
  },
}

export function AnimatedPage({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial={false}
      animate="animate"
    >
      {children}
    </motion.div>
  )
}
