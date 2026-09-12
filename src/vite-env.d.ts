/// <reference types="vite/client" />

declare module '@tauri-apps/plugin-opener' {
  export function openPath(path: string): Promise<void>
}

declare module '*.svg?url' {
  const src: string
  export default src
}
