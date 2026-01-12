/// <reference types="vite/client" />

// SVG module declarations
declare module '*.svg' {
    const content: string;
    export default content;
}
