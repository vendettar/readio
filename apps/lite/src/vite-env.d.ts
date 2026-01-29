/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// SVG module declarations
declare module '*.svg' {
  const content: string
  export default content
}
