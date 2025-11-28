import { useEffect, useState } from 'react'
import { useAppStore } from './stores/appStore'
import { useBackend } from './hooks/useBackend'
import { TitleBar } from './components/TitleBar'
import { ActivityBar } from './components/ActivityBar'
import { Sidebar } from './components/Sidebar'
import { EditorArea } from './components/EditorArea'
import { Panel } from './components/Panel'
import { StatusBar } from './components/StatusBar'

function App() {
  const { 
    sidebarVisible, 
    sidebarWidth,
    panelVisible, 
    panelHeight,
    setSidebarWidth,
    setPanelHeight,
    addTerminalMessage,
    toggleSidebar,
    togglePanel
  } = useAppStore()

  // Connect to backend
  useBackend()

  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [isResizingPanel, setIsResizingPanel] = useState(false)

  // Handle sidebar resize
  const handleSidebarMouseDown = () => {
    setIsResizingSidebar(true)
  }

  // Handle panel resize
  const handlePanelMouseDown = () => {
    setIsResizingPanel(true)
  }

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = e.clientX - 48 // Account for activity bar
        setSidebarWidth(newWidth)
      }
      if (isResizingPanel) {
        const newHeight = window.innerHeight - e.clientY - 22 // Account for status bar
        setPanelHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      setIsResizingSidebar(false)
      setIsResizingPanel(false)
    }

    if (isResizingSidebar || isResizingPanel) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = isResizingSidebar ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingSidebar, isResizingPanel, setSidebarWidth, setPanelHeight])

  // Listen for menu events
  useEffect(() => {
    if (!window.electronAPI) return

    const cleanup = window.electronAPI.onMenuEvent((event) => {
      switch (event) {
        case 'menu:toggle-sidebar':
          toggleSidebar()
          break
        case 'menu:toggle-terminal':
          togglePanel()
          break
        // Add more menu handlers as we build features
      }
    })

    return cleanup
  }, [toggleSidebar, togglePanel])

  // Listen for Python backend messages
  useEffect(() => {
    if (!window.electronAPI) return

    const cleanupStdout = window.electronAPI.onPythonStdout((message) => {
      addTerminalMessage({ type: 'info', message: `[Python] ${message}` })
    })

    const cleanupStderr = window.electronAPI.onPythonStderr((message) => {
      addTerminalMessage({ type: 'error', message: `[Python Error] ${message}` })
    })

    return () => {
      cleanupStdout()
      cleanupStderr()
    }
  }, [addTerminalMessage])

  // Add welcome message on mount
  useEffect(() => {
    addTerminalMessage({
      type: 'info',
      message: '═══════════════════════════════════════════════════════'
    })
    addTerminalMessage({
      type: 'info',
      message: '  BR Equipment Control App - Electron Edition'
    })
    addTerminalMessage({
      type: 'info',
      message: '═══════════════════════════════════════════════════════'
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen flex flex-col bg-vsc-bg overflow-hidden">
      {/* Custom Title Bar */}
      <TitleBar />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar */}
        <ActivityBar />

        {/* Sidebar */}
        {sidebarVisible && (
          <>
            <Sidebar />
            {/* Sidebar resize handle */}
            <div
              className="resize-handle resize-handle-horizontal bg-vsc-border"
              onMouseDown={handleSidebarMouseDown}
              style={{ width: 4 }}
            />
          </>
        )}

        {/* Editor + Panel Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor */}
          <EditorArea />

          {/* Panel resize handle */}
          {panelVisible && (
            <div
              className="resize-handle resize-handle-vertical bg-vsc-border"
              onMouseDown={handlePanelMouseDown}
              style={{ height: 4 }}
            />
          )}

          {/* Panel (Terminal) */}
          {panelVisible && <Panel />}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  )
}

export default App

