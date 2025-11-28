import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { spawn, spawnSync, ChildProcess } from 'child_process'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

// ES Module compatibility - create __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Note: electron-squirrel-startup is used for Windows installer handling
// It will be added as a dependency when building for production

let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Single instance lock - prevent multiple windows
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...')
  app.quit()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#181818',
      symbolColor: '#cccccc',
      height: 32
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false // Show when ready to prevent flash
  })

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    // Dev tools can be opened manually with Ctrl+Shift+I or F12
  })

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Clean up on close
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Create application menu
  createAppMenu()
}

function createAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Script',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-file')
        },
        {
          label: 'Open Script...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-file')
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save-file')
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu:save-file-as')
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow?.webContents.send('menu:find')
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow?.webContents.send('menu:replace')
        }
      ]
    },
    {
      label: 'Script',
      submenu: [
        {
          label: 'Run Script',
          accelerator: 'F5',
          click: () => mainWindow?.webContents.send('menu:run-script')
        },
        {
          label: 'Stop Script',
          accelerator: 'Shift+F5',
          click: () => mainWindow?.webContents.send('menu:stop-script')
        },
        { type: 'separator' },
        {
          label: 'Validate Script',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => mainWindow?.webContents.send('menu:validate-script')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Terminal',
          accelerator: 'CmdOrCtrl+`',
          click: () => mainWindow?.webContents.send('menu:toggle-terminal')
        },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('menu:toggle-sidebar')
        },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Cmd+Alt+I' : 'Ctrl+Shift+I',
          role: 'toggleDevTools'
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/bluerobotics/br-equipment-control-app')
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/bluerobotics/br-equipment-control-app/issues')
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => mainWindow?.webContents.send('menu:about')
        }
      ]
    }
  ]

  // macOS specific menu
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { label: 'About', role: 'about' },
        { type: 'separator' },
        { label: 'Services', role: 'services' },
        { type: 'separator' },
        { label: 'Hide', accelerator: 'Cmd+H', role: 'hide' },
        { label: 'Hide Others', accelerator: 'Cmd+Alt+H', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Cmd+Q', role: 'quit' }
      ]
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// Start Python backend
function startPythonBackend() {
  console.log('🐍 Starting Python backend...')

  const pythonExecutable = os.platform() === 'win32' ? 'python' : 'python3'
  const backendPath = isDev 
    ? path.join(__dirname, '../backend/server.py')
    : path.join(process.resourcesPath, 'backend/server.py')

  pythonProcess = spawn(pythonExecutable, [backendPath], {
    cwd: path.dirname(backendPath),
    shell: os.platform() === 'win32'
  })

  pythonProcess.stdout?.on('data', (data) => {
    const message = data.toString().trim()
    console.log(`[Python]: ${message}`)
    mainWindow?.webContents.send('python:stdout', message)
  })

  pythonProcess.stderr?.on('data', (data) => {
    const message = data.toString().trim()
    // Note: Python's logging module outputs to stderr by default, so this is normal output
    console.log(`[Python]: ${message}`)
    mainWindow?.webContents.send('python:stderr', message)
  })

  pythonProcess.on('exit', (code) => {
    console.log(`Python process exited with code ${code}`)
    pythonProcess = null
  })

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python backend:', err)
  })
}

// Kill Python backend
function killPythonBackend() {
  console.log('🔪 Terminating Python backend...')
  
  if (pythonProcess && pythonProcess.pid) {
    const pid = pythonProcess.pid
    
    if (os.platform() === 'win32') {
      // Use spawnSync to wait for kill to complete
      // /T kills child processes, /F forces termination
      spawnSync('taskkill', ['/pid', pid.toString(), '/f', '/t'], { stdio: 'ignore' })
    } else {
      pythonProcess.kill('SIGTERM')
    }
    pythonProcess = null
  }
  
  // Also kill any orphaned Python processes running our backend (backup)
  if (os.platform() === 'win32') {
    // Kill any python processes that might be running server.py
    spawnSync('taskkill', ['/f', '/im', 'python.exe', '/fi', 'WINDOWTITLE eq *server.py*'], { stdio: 'ignore' })
    spawnSync('taskkill', ['/f', '/im', 'python3.exe'], { stdio: 'ignore' })
    spawnSync('taskkill', ['/f', '/im', 'python3.13.exe'], { stdio: 'ignore' })
  }
}

// IPC Handlers
ipcMain.handle('app:get-version', () => app.getVersion())
ipcMain.handle('app:get-platform', () => process.platform)
ipcMain.handle('app:is-dev', () => isDev)

// Window controls (for custom titlebar)
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized())

// Handle second instance - focus existing window instead of opening new one
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// App lifecycle
app.whenReady().then(() => {
  createWindow()
  startPythonBackend()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  killPythonBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  killPythonBackend()
})

app.on('before-quit', () => {
  killPythonBackend()
})

// Handle Ctrl+C in terminal
process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...')
  killPythonBackend()
  app.quit()
})

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  killPythonBackend()
  app.quit()
})

