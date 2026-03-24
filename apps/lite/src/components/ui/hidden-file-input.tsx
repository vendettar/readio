import * as React from 'react'

import { cn } from '@/lib/utils'

const HiddenFileInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'>
>(({ className, ...props }, ref) => {
  return <input ref={ref} type="file" className={cn('hidden', className)} {...props} />
})

HiddenFileInput.displayName = 'HiddenFileInput'

export { HiddenFileInput }
