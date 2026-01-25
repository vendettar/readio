import { AnimatePresence, motion } from 'framer-motion'
import React from 'react'
import { cn } from '@/lib/utils'

interface AnimatedListProps {
  children: React.ReactNode
  className?: string
  delay?: number
  staggerDelay?: number
  enableLayout?: boolean
}

export function AnimatedList({
  children,
  className,
  delay = 0,
  staggerDelay = 0.05,
  enableLayout = false,
}: AnimatedListProps) {
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

  const item = {
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
        {React.Children.map(children, (child, index) => {
          if (!React.isValidElement(child)) return null
          return (
            <motion.div
              key={child.key ?? index}
              variants={item}
              layout={enableLayout ? true : undefined}
            >
              {child}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </motion.div>
  )
}
