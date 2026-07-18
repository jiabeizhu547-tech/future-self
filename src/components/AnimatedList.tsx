import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
}

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
}

interface Props {
  children: ReactNode
  className?: string
}

export function AnimatedList({ children, className }: Props) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  )
}

AnimatedList.Item = function AnimatedListItem({ children }: { children: ReactNode }) {
  return <motion.div variants={item}>{children}</motion.div>
}
