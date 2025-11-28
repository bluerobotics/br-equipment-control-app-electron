import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  isDev: () => ipcRenderer.invoke('app:is-dev'),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // Menu events
  onMenuEvent: (callback: (event: string) => void) => {
    const events = [
      'menu:new-file',
      'menu:open-file',
      'menu:save-file',
      'menu:save-file-as',
      'menu:find',
      'menu:replace',
      'menu:run-script',
      'menu:stop-script',
      'menu:validate-script',
      'menu:toggle-terminal',
      'menu:toggle-sidebar',
      'menu:about'
    ]
    
    events.forEach(event => {
      ipcRenderer.on(event, () => callback(event))
    })

    // Return cleanup function
    return () => {
      events.forEach(event => {
        ipcRenderer.removeAllListeners(event)
      })
    }
  },

  // Python backend communication
  onPythonStdout: (callback: (message: string) => void) => {
    ipcRenderer.on('python:stdout', (_, message) => callback(message))
    return () => ipcRenderer.removeAllListeners('python:stdout')
  },
  onPythonStderr: (callback: (message: string) => void) => {
    ipcRenderer.on('python:stderr', (_, message) => callback(message))
    return () => ipcRenderer.removeAllListeners('python:stderr')
  },

  // File dialogs (to be implemented)
  showOpenDialog: async (options: Electron.OpenDialogOptions) => {
    return ipcRenderer.invoke('dialog:open', options)
  },
  showSaveDialog: async (options: Electron.SaveDialogOptions) => {
    return ipcRenderer.invoke('dialog:save', options)
  }
})

// Type declarations for TypeScript
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>
      isDev: () => Promise<boolean>
      minimize: () => void
      maximize: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
      onMenuEvent: (callback: (event: string) => void) => () => void
      onPythonStdout: (callback: (message: string) => void) => () => void
      onPythonStderr: (callback: (message: string) => void) => () => void
      showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
      showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
    }
  }
}

