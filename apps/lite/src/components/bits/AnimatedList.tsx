import { AnimatePresence, motion } from 'framer-motion'
import type React from 'react'
import { cn } from '@/lib/utils'

interface AnimatedListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  getKey: (item: T, index: number) => React.Key
  className?: string
  delay?: number
  staggerDelay?: number
  enableLayout?: boolean
}

export function AnimatedList<T>({
  items,
  renderItem,
  getKey,
  className,
  delay = 0,
  staggerDelay = 0.05,
  enableLayout = false,
}: AnimatedListProps<T>) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: delay,
      },
    },
  } as const

  const itemVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 30,
      },
    },
  } as const

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={cn('flex flex-col', className)}
    >
      <AnimatePresence mode="popLayout">
        {items.map((data, index) => (
          <motion.div
            key={getKey(data, index)}
            variants={itemVariants}
            layout={enableLayout ? true : undefined}
          >
            {renderItem(data, index)}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
