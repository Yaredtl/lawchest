export interface LawChestBridge {
  call: (channel: string, ...args: unknown[]) => Promise<unknown>
  pathForFile: (file: File) => string
  on: (channel: string, cb: (payload: unknown) => void) => () => void
}

declare global {
  interface Window {
    lawchest: LawChestBridge
  }
}
