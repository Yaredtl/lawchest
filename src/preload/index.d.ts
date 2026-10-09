export interface LawChestBridge {
  call: (channel: string, ...args: unknown[]) => Promise<unknown>
  pathForFile: (file: File) => string
}

declare global {
  interface Window {
    lawchest: LawChestBridge
  }
}
