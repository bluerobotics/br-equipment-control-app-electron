import { 
  Cpu, 
  FileCode, 
  ListTree, 
  Settings,
  Play,
  Square
} from 'lucide-react'
import { useAppStore, type ActivityView } from '../stores/appStore'

interface ActivityBarIconProps {
  icon: React.ReactNode
  view: ActivityView
  tooltip: string
}

function ActivityBarIcon({ icon, view, tooltip }: ActivityBarIconProps) {
  const { activeView, setActiveView, sidebarVisible, toggleSidebar } = useAppStore()
  const isActive = activeView === view && sidebarVisible

  const handleClick = () => {
    if (activeView === view && sidebarVisible) {
      toggleSidebar()
    } else {
      setActiveView(view)
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`activity-bar-icon ${isActive ? 'active' : ''}`}
      title={tooltip}
    >
      {icon}
    </button>
  )
}

export function ActivityBar() {
  const { script, setScriptRunning, addTerminalMessage } = useAppStore()

  const handleRunScript = () => {
    if (script.running) {
      // Stop script
      setScriptRunning(false)
      addTerminalMessage({ type: 'warning', message: '⏹ Script stopped by user' })
    } else {
      // Run script
      setScriptRunning(true)
      addTerminalMessage({ type: 'success', message: '▶ Running script...' })
    }
  }

  return (
    <div className="w-12 bg-vsc-activitybar flex flex-col items-center border-r border-vsc-border">
      {/* Top icons */}
      <div className="flex flex-col">
        <ActivityBarIcon
          icon={<Cpu size={24} />}
          view="devices"
          tooltip="Devices"
        />
        <ActivityBarIcon
          icon={<FileCode size={24} />}
          view="scripts"
          tooltip="Scripts"
        />
        <ActivityBarIcon
          icon={<ListTree size={24} />}
          view="commands"
          tooltip="Command Reference"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Run/Stop button */}
      <button
        onClick={handleRunScript}
        className={`w-12 h-12 flex items-center justify-center transition-colors ${
          script.running 
            ? 'text-vsc-error hover:bg-vsc-error/20' 
            : 'text-vsc-success hover:bg-vsc-success/20'
        }`}
        title={script.running ? 'Stop Script (Shift+F5)' : 'Run Script (F5)'}
      >
        {script.running ? <Square size={24} /> : <Play size={24} />}
      </button>

      {/* Bottom icons */}
      <div className="flex flex-col mb-2">
        <ActivityBarIcon
          icon={<Settings size={24} />}
          view="settings"
          tooltip="Settings"
        />
      </div>
    </div>
  )
}

