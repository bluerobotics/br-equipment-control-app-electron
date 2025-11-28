import { useAppStore } from '../stores/appStore'
import { DevicesView } from './sidebar/DevicesView'
import { ScriptsView } from './sidebar/ScriptsView'
import { CommandsView } from './sidebar/CommandsView'
import { SettingsView } from './sidebar/SettingsView'

export function Sidebar() {
  const { activeView, sidebarWidth } = useAppStore()

  const renderView = () => {
    switch (activeView) {
      case 'devices':
        return <DevicesView />
      case 'scripts':
        return <ScriptsView />
      case 'commands':
        return <CommandsView />
      case 'settings':
        return <SettingsView />
      default:
        return <DevicesView />
    }
  }

  const getTitle = () => {
    switch (activeView) {
      case 'devices':
        return 'DEVICES'
      case 'scripts':
        return 'SCRIPTS'
      case 'commands':
        return 'COMMAND REFERENCE'
      case 'settings':
        return 'SETTINGS'
      default:
        return ''
    }
  }

  return (
    <div 
      className="bg-vsc-sidebar flex flex-col overflow-hidden"
      style={{ width: sidebarWidth }}
    >
      {/* Header */}
      <div className="h-9 flex items-center px-4 text-[11px] font-semibold text-vsc-fg-dim tracking-wide">
        {getTitle()}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {renderView()}
      </div>
    </div>
  )
}

