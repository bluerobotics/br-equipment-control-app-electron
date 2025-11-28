import { 
  FileCode, 
  FolderOpen, 
  Clock,
  File
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export function ScriptsView() {
  const { script, recentFiles, addTerminalMessage } = useAppStore()

  const handleOpenFile = () => {
    addTerminalMessage({ type: 'info', message: 'Open file dialog would appear here' })
    // TODO: Implement file open dialog
  }

  const handleRecentFile = (filePath: string) => {
    addTerminalMessage({ type: 'info', message: `Would open: ${filePath}` })
    // TODO: Load the file
  }

  return (
    <div className="flex flex-col h-full">
      {/* Current file */}
      {script.path && (
        <div className="px-3 py-2 border-b border-vsc-border">
          <div className="text-xs text-vsc-fg-dim mb-1">CURRENT FILE</div>
          <div className="flex items-center gap-2 text-sm">
            <FileCode size={14} className="text-vsc-keyword flex-shrink-0" />
            <span className="truncate">{script.path.split(/[/\\]/).pop()}</span>
            {script.modified && (
              <span className="text-vsc-warning">●</span>
            )}
          </div>
          <div className="text-xs text-vsc-fg-muted truncate mt-1">
            {script.path}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-3 border-b border-vsc-border">
        <button
          onClick={handleOpenFile}
          className="w-full flex items-center gap-2 px-3 py-2 bg-vsc-accent hover:bg-vsc-accent-hover text-white rounded text-sm"
        >
          <FolderOpen size={14} />
          Open Script...
        </button>
      </div>

      {/* Recent files */}
      <div className="flex-1 overflow-auto">
        <div className="px-3 py-2 text-xs text-vsc-fg-dim flex items-center gap-1">
          <Clock size={12} />
          RECENT FILES
        </div>

        {recentFiles.length === 0 ? (
          <div className="px-4 py-4 text-center text-vsc-fg-dim text-sm">
            <File size={24} className="mx-auto mb-2 opacity-50" />
            <p>No recent files</p>
          </div>
        ) : (
          <div className="py-1">
            {recentFiles.map((filePath, index) => (
              <div
                key={index}
                className="tree-item cursor-pointer"
                onClick={() => handleRecentFile(filePath)}
              >
                <FileCode size={14} className="mr-2 text-vsc-keyword flex-shrink-0" />
                <span className="truncate">{filePath.split(/[/\\]/).pop()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Keyboard shortcut hints */}
      <div className="px-3 py-2 border-t border-vsc-border text-xs text-vsc-fg-dim space-y-1">
        <div className="flex justify-between">
          <span>Open</span>
          <kbd className="px-1 bg-vsc-input rounded">Ctrl+O</kbd>
        </div>
        <div className="flex justify-between">
          <span>Save</span>
          <kbd className="px-1 bg-vsc-input rounded">Ctrl+S</kbd>
        </div>
        <div className="flex justify-between">
          <span>Run</span>
          <kbd className="px-1 bg-vsc-input rounded">F5</kbd>
        </div>
      </div>
    </div>
  )
}

