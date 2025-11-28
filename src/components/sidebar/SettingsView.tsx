import { 
  Monitor, 
  Palette, 
  Keyboard,
  Info,
  ExternalLink
} from 'lucide-react'

export function SettingsView() {
  return (
    <div className="flex flex-col h-full">
      {/* Settings sections */}
      <div className="flex-1 overflow-auto py-2">
        {/* Appearance */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Palette size={14} className="text-vsc-accent" />
            Appearance
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-vsc-fg-dim">Theme</span>
              <select className="text-xs">
                <option>Dark+ (default)</option>
                <option>Light+</option>
                <option>Monokai</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-vsc-fg-dim">Font Size</span>
              <select className="text-xs">
                <option>11</option>
                <option>12</option>
                <option selected>13</option>
                <option>14</option>
                <option>15</option>
              </select>
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="px-3 py-2 border-t border-vsc-border">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Monitor size={14} className="text-vsc-accent" />
            Editor
          </div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center justify-between">
              <span className="text-vsc-fg-dim">Word Wrap</span>
              <input type="checkbox" className="accent-vsc-accent" />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-vsc-fg-dim">Line Numbers</span>
              <input type="checkbox" defaultChecked className="accent-vsc-accent" />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-vsc-fg-dim">Minimap</span>
              <input type="checkbox" defaultChecked className="accent-vsc-accent" />
            </label>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="px-3 py-2 border-t border-vsc-border">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Keyboard size={14} className="text-vsc-accent" />
            Keyboard Shortcuts
          </div>
          <div className="space-y-1 text-xs text-vsc-fg-dim">
            <div className="flex justify-between">
              <span>Run Script</span>
              <kbd className="px-1.5 py-0.5 bg-vsc-input rounded">F5</kbd>
            </div>
            <div className="flex justify-between">
              <span>Stop Script</span>
              <kbd className="px-1.5 py-0.5 bg-vsc-input rounded">Shift+F5</kbd>
            </div>
            <div className="flex justify-between">
              <span>Toggle Terminal</span>
              <kbd className="px-1.5 py-0.5 bg-vsc-input rounded">Ctrl+`</kbd>
            </div>
            <div className="flex justify-between">
              <span>Toggle Sidebar</span>
              <kbd className="px-1.5 py-0.5 bg-vsc-input rounded">Ctrl+B</kbd>
            </div>
            <div className="flex justify-between">
              <span>Find</span>
              <kbd className="px-1.5 py-0.5 bg-vsc-input rounded">Ctrl+F</kbd>
            </div>
            <div className="flex justify-between">
              <span>Replace</span>
              <kbd className="px-1.5 py-0.5 bg-vsc-input rounded">Ctrl+H</kbd>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="px-3 py-2 border-t border-vsc-border">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Info size={14} className="text-vsc-accent" />
            About
          </div>
          <div className="space-y-2 text-sm text-vsc-fg-dim">
            <div className="flex justify-between">
              <span>Version</span>
              <span>1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span>Electron</span>
              <span>34.0.0</span>
            </div>
            <a 
              href="https://github.com/bluerobotics/br-equipment-control-app"
              className="flex items-center gap-1 text-vsc-accent hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Repository
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

