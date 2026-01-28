/// <reference types="vite/client" />

interface Window {
  __READIO_TEST__?: {
    router: any
    queryClient: any
    db: any
    rawDb: any
    clearAppData: () => Promise<void>
  }
}

// SVG module declarations
declare module '*.svg' {
  const content: string
  export default content
}
