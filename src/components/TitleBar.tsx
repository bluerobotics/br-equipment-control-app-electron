import { useState, useEffect } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [platform, setPlatform] = useState<string>('win32')

  useEffect(() => {
    // Get platform
    window.electronAPI?.getPlatform().then(setPlatform)
    
    // Check initial maximized state
    window.electronAPI?.isMaximized().then(setIsMaximized)
  }, [])

  const handleMinimize = () => window.electronAPI?.minimize()
  const handleMaximize = () => {
    window.electronAPI?.maximize()
    window.electronAPI?.isMaximized().then(setIsMaximized)
  }
  const handleClose = () => window.electronAPI?.close()

  // On macOS, use native titlebar
  if (platform === 'darwin') {
    return (
      <div className="h-8 bg-vsc-activitybar flex items-center justify-center titlebar-drag-region">
        <span className="text-xs text-vsc-fg-dim">BR Equipment Control</span>
      </div>
    )
  }

  return (
    <div className="h-8 bg-vsc-activitybar flex items-center titlebar-drag-region select-none">
      {/* App icon & title */}
      <div className="flex items-center gap-2 px-3">
        <div className="w-4 h-4 bg-vsc-accent rounded-sm flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">BR</span>
        </div>
        <span className="text-xs text-vsc-fg-dim">BR Equipment Control</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Window controls */}
      <div className="flex titlebar-no-drag">
        <button
          onClick={handleMinimize}
          className="w-12 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
          title="Minimize"
        >
          <Minus size={16} className="text-vsc-fg" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <Copy size={14} className="text-vsc-fg" />
          ) : (
            <Square size={14} className="text-vsc-fg" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-8 flex items-center justify-center hover:bg-red-600 transition-colors"
          title="Close"
        >
          <X size={16} className="text-vsc-fg" />
        </button>
      </div>
    </div>
  )
}

