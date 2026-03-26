import { cn } from '@/lib/utils'

interface CircularProgressProps {
  progress: number
  size?: number
  strokeWidth?: number
  className?: string
  title?: string
}

export function CircularProgress({
  progress,
  size = 18,
  strokeWidth = 2,
  className,
  title = 'Progress',
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('transform -rotate-90', className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle
        className="text-muted-foreground/30"
        strokeWidth={strokeWidth}
        stroke="currentColor"
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        className="text-primary transition-all duration-300 ease-in-out"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        stroke="currentColor"
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
    </svg>
  )
}
