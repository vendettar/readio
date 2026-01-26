import { motion } from 'framer-motion'

/**
 * Boot Loader component shown during initial app data hydration
 */
export function BootLoader() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center"
    >
      <div className="relative flex flex-col items-center">
        {/* Breathing Logo - Strict Spec: Opacity 0.5 <-> 1 only */}
        <motion.img
          src="/readio.svg"
          alt="Readio Logo"
          className="w-24 h-24"
          animate={{
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 2.0,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>
    </motion.div>
  )
}
