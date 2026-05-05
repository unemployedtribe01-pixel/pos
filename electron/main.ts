import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Bill-B POS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    void win.loadURL('http://127.0.0.1:5173/')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (isDev && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
        return { action: 'allow' }
      }
      if (parsed.protocol === 'file:') return { action: 'allow' }
      void shell.openExternal(url)
      return { action: 'deny' }
    } catch {
      return { action: 'deny' }
    }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isDev && (url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:'))) return
    if (url.startsWith('file:')) return
    event.preventDefault()
    void shell.openExternal(url)
  })
}

void app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
