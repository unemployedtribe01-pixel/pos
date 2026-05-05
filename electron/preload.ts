import { contextBridge } from 'electron'

/** Minimal preload — app runs unchanged in renderer; extend here only if needed. */
contextBridge.exposeInMainWorld('billbElectron', {
  isElectron: true as const,
})
