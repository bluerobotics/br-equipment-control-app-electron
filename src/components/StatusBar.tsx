import { 
  GitBranch, 
  Wifi, 
  WifiOff,
  Bell,
  AlertCircle,
  CheckCircle,
  Play,
  Square,
  Server,
  ServerOff
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'

export function StatusBar() {
  const { 
    statusMessage, 
    devices,
    backendConnected,
    script,
    addTerminalMessage 
  } = useAppStore()

  // Count connected devices
  const connectedDevices = Object.values(devices).filter(d => d.connected).length
  const totalDevices = Object.keys(devices).length

  // Script status
  const scriptStatus = script.running ? 'Running' : script.modified ? 'Modified' : 'Ready'
  const scriptStatusColor = script.running 
    ? 'text-vsc-success' 
    : script.modified 
      ? 'text-yellow-400' 
      : 'text-white/60'

  return (
    <div className="h-[22px] bg-vsc-accent flex items-center justify-between text-white text-xs select-none">
      {/* Left side */}
      <div className="flex items-center h-full">
        {/* Branch indicator (cosmetic) */}
        <div className="statusbar-item">
          <GitBranch size={12} />
          <span>main</span>
        </div>

        {/* Sync indicator (cosmetic) */}
        <div className="statusbar-item">
          <CheckCircle size={12} />
        </div>

        {/* Problems count */}
        <div className="statusbar-item">
          <AlertCircle size={12} />
          <span>0</span>
        </div>
      </div>

      {/* Center - Status message */}
      <div className="flex items-center gap-2 px-4">
        {backendConnected ? (
          <Server size={12} className="text-green-400" />
        ) : (
          <ServerOff size={12} className="text-red-400" />
        )}
        <span>{statusMessage}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center h-full">
        {/* Script status */}
        <div className={`statusbar-item ${scriptStatusColor}`}>
          {script.running ? <Play size={12} /> : <Square size={12} />}
          <span>{scriptStatus}</span>
        </div>

        {/* Device connection status */}
        <div 
          className="statusbar-item cursor-pointer"
          onClick={() => addTerminalMessage({ 
            type: 'info', 
            message: `Devices: ${connectedDevices}/${totalDevices} connected` 
          })}
        >
          {connectedDevices > 0 ? (
            <Wifi size={12} className="text-green-400" />
          ) : (
            <WifiOff size={12} className="opacity-50" />
          )}
          <span>
            {totalDevices > 0 
              ? `${connectedDevices}/${totalDevices}` 
              : 'No devices'
            }
          </span>
        </div>

        {/* Line/Column indicator */}
        <div className="statusbar-item">
          <span>Ln 1, Col 1</span>
        </div>

        {/* Language */}
        <div className="statusbar-item">
          <span>BREQ</span>
        </div>

        {/* Notifications */}
        <div className="statusbar-item">
          <Bell size={12} />
        </div>
      </div>
    </div>
  )
}
