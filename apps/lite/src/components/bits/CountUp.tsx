import { motion, useSpring, useTransform } from 'framer-motion'
import { useEffect } from 'react'

interface CountUpProps {
  to: number
  from?: number
  className?: string
  precision?: number
}

export function CountUp({ to, from = 0, className, precision = 0 }: CountUpProps) {
  const count = useSpring(from, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  })

  const rounded = useTransform(count, (latest) => latest.toFixed(precision))

  useEffect(() => {
    count.set(to)
  }, [to, count])

  return <motion.span className={className}>{rounded}</motion.span>
}
