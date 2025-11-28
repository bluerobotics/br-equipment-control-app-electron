import { 
  Cpu, 
  Wifi, 
  WifiOff, 
  Usb, 
  ChevronRight, 
  ChevronDown,
  RefreshCw,
  Loader2,
  Settings2
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { triggerDiscovery, sendCommand, listSerialPorts, connectSerial, disconnectSerial, fetchDevices } from '../../services/api'

export function DevicesView() {
  const { 
    devices, 
    selectedDevice, 
    selectDevice, 
    addTerminalMessage,
    backendConnected,
    setDevice
  } = useAppStore()
  
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showConnectionDialog, setShowConnectionDialog] = useState<string | null>(null)
  const [serialPorts, setSerialPorts] = useState<{port: string, description: string}[]>([])
  const [selectedPort, setSelectedPort] = useState<string>('')

  // Refresh devices from backend
  const refreshDevices = async () => {
    try {
      const backendDevices = await fetchDevices()
      for (const [name, device] of Object.entries(backendDevices)) {
        setDevice(name, {
          connected: device.connected,
          connectionMethod: device.connection_method,
          ip: device.ip || undefined,
          port: device.port || undefined,
          serialPort: device.serial_port || undefined,
          firmwareVersion: device.firmware_version || undefined,
          telemetry: device.telemetry || {}
        })
      }
    } catch (error) {
      console.error('Failed to refresh devices:', error)
    }
  }

  const toggleExpanded = (deviceName: string) => {
    const newExpanded = new Set(expandedDevices)
    if (newExpanded.has(deviceName)) {
      newExpanded.delete(deviceName)
    } else {
      newExpanded.add(deviceName)
    }
    setExpandedDevices(newExpanded)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    addTerminalMessage({ type: 'info', message: 'Scanning for devices...' })
    
    try {
      await triggerDiscovery()
      addTerminalMessage({ type: 'info', message: 'Discovery broadcast sent' })
    } catch (error) {
      addTerminalMessage({ type: 'error', message: 'Failed to trigger discovery' })
    }
    
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  const handleSendCommand = async (deviceName: string, command: string) => {
    addTerminalMessage({ type: 'sent', message: command, device: deviceName })
    try {
      const result = await sendCommand(deviceName, command)
      if (!result.success) {
        addTerminalMessage({ 
          type: 'error', 
          message: result.error || 'Command failed', 
          device: deviceName 
        })
      }
    } catch (error) {
      addTerminalMessage({ type: 'error', message: 'Failed to send command', device: deviceName })
    }
  }

  const openConnectionDialog = async (deviceName: string) => {
    setShowConnectionDialog(deviceName)
    try {
      const ports = await listSerialPorts()
      setSerialPorts(ports)
      // Pre-select current port if USB is configured
      const device = devices[deviceName]
      if (device?.serialPort) {
        setSelectedPort(device.serialPort)
      } else if (ports.length > 0) {
        setSelectedPort(ports[0].port)
      }
    } catch (error) {
      addTerminalMessage({ type: 'error', message: 'Failed to list serial ports' })
    }
  }

  const handleConnectUSB = async (deviceName: string) => {
    if (!selectedPort) {
      addTerminalMessage({ type: 'error', message: 'No port selected' })
      return
    }
    
    addTerminalMessage({ type: 'info', message: `Connecting ${deviceName} to ${selectedPort}...` })
    try {
      const result = await connectSerial(selectedPort, deviceName)
      if (result.success) {
        addTerminalMessage({ type: 'success', message: `USB connection started on ${selectedPort}` })
        // Refresh device state immediately after connection change
        await refreshDevices()
      } else {
        addTerminalMessage({ type: 'error', message: 'Failed to connect via USB' })
      }
    } catch (error) {
      addTerminalMessage({ type: 'error', message: 'USB connection error' })
    }
    setShowConnectionDialog(null)
  }

  const handleDisconnectUSB = async (deviceName: string) => {
    const device = devices[deviceName]
    if (device?.serialPort) {
      try {
        await disconnectSerial(device.serialPort)
        addTerminalMessage({ type: 'info', message: `Disconnected USB from ${device.serialPort}` })
        // Refresh device state immediately after disconnection
        await refreshDevices()
      } catch (error) {
        addTerminalMessage({ type: 'error', message: 'Failed to disconnect USB' })
      }
    }
    setShowConnectionDialog(null)
  }

  const deviceList = useMemo(() => Object.values(devices), [devices])
  const connectedCount = useMemo(() => 
    deviceList.filter(d => d.connected).length, 
    [deviceList]
  )

  // Get formatted telemetry values
  const getDisplayTelemetry = (device: typeof deviceList[0]) => {
    const telemetry = device.telemetry || {}
    const displayed: Record<string, string> = {}
    
    for (const [key, value] of Object.entries(telemetry)) {
      if (telemetry[`${key}_formatted`]) continue
      const formattedKey = key.replace('_formatted', '')
      if (key.endsWith('_formatted')) {
        displayed[formattedKey] = String(value)
      } else if (!telemetry[`${key}_formatted`]) {
        displayed[key] = String(value)
      }
    }
    
    return displayed
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-vsc-border">
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || !backendConnected}
          className={`p-1.5 rounded hover:bg-vsc-highlight text-vsc-fg-dim hover:text-vsc-fg transition-colors ${
            !backendConnected ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          title="Refresh Devices"
        >
          {isRefreshing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
        </button>
        <span className="text-xs text-vsc-fg-muted ml-auto">
          {connectedCount}/{deviceList.length} connected
        </span>
      </div>

      {/* Device list */}
      <div className="flex-1 overflow-auto py-1">
        {deviceList.length === 0 ? (
          <div className="px-4 py-8 text-center text-vsc-fg-dim text-sm">
            <Cpu size={32} className="mx-auto mb-2 opacity-50" />
            <p>No devices configured</p>
            <p className="text-xs mt-1 text-vsc-fg-muted">
              {backendConnected 
                ? 'Waiting for device paths to be set...'
                : 'Connecting to backend...'}
            </p>
          </div>
        ) : (
          deviceList.map((device) => {
            const isExpanded = expandedDevices.has(device.name)
            const isSelected = selectedDevice === device.name
            const displayTelemetry = getDisplayTelemetry(device)

            return (
              <div key={device.name}>
                {/* Device header */}
                <div
                  className={`tree-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    selectDevice(device.name)
                    toggleExpanded(device.name)
                  }}
                >
                  {/* Expand icon */}
                  <span className="w-4 flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown size={16} className="text-vsc-fg-dim" />
                    ) : (
                      <ChevronRight size={16} className="text-vsc-fg-dim" />
                    )}
                  </span>

                  {/* Device icon */}
                  <Cpu size={16} className={`mr-2 flex-shrink-0 ${
                    device.connected ? 'text-vsc-type' : 'text-vsc-fg-muted'
                  }`} />

                  {/* Device name */}
                  <span className={`flex-1 truncate capitalize ${
                    device.connected ? 'text-vsc-fg' : 'text-vsc-fg-dim'
                  }`}>
                    {device.name}
                  </span>

                  {/* Connection status indicators */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* USB indicator */}
                    <Usb 
                      size={14} 
                      className={`${
                        device.connectionMethod === 'usb' && device.connected
                          ? 'text-green-400' 
                          : device.serialPort
                            ? 'text-yellow-500'
                            : 'text-vsc-fg-muted opacity-30'
                      }`}
                      title={
                        device.connectionMethod === 'usb' && device.connected
                          ? `USB Connected: ${device.serialPort}`
                          : device.serialPort
                            ? `USB Configured: ${device.serialPort} (disconnected)`
                            : 'USB not configured'
                      }
                    />
                    
                    {/* Network indicator */}
                    {device.connectionMethod === 'network' && device.connected ? (
                      <Wifi 
                        size={14} 
                        className="text-green-400"
                        title={`Network Connected: ${device.ip}`}
                      />
                    ) : (
                      <WifiOff 
                        size={14} 
                        className="text-vsc-fg-muted opacity-30"
                        title="Network not connected"
                      />
                    )}
                    
                    {/* Settings button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openConnectionDialog(device.name)
                      }}
                      className="p-0.5 rounded hover:bg-vsc-highlight text-vsc-fg-dim hover:text-vsc-fg"
                      title="Connection Settings"
                    >
                      <Settings2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="text-xs">
                    {/* Connection info */}
                    <div 
                      className="tree-item text-vsc-fg-muted" 
                      style={{ '--indent-level': 1 } as React.CSSProperties}
                    >
                      {device.connected ? (
                        <>
                          {device.connectionMethod === 'usb' 
                            ? `USB: ${device.serialPort || 'Connected'}` 
                            : `IP: ${device.ip || 'Unknown'}:${device.port || 8888}`
                          }
                          {device.firmwareVersion && (
                            <span className="ml-2 text-vsc-fg-dim">
                              (FW {device.firmwareVersion})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="italic">Searching...</span>
                      )}
                    </div>

                    {/* Telemetry values */}
                    {device.connected && Object.keys(displayTelemetry).length > 0 && (
                      <>
                        <div 
                          className="tree-item text-vsc-fg-muted font-medium mt-1"
                          style={{ '--indent-level': 1 } as React.CSSProperties}
                        >
                          Telemetry
                        </div>
                        {Object.entries(displayTelemetry).slice(0, 8).map(([key, value]) => (
                          <div 
                            key={key} 
                            className="tree-item"
                            style={{ '--indent-level': 2 } as React.CSSProperties}
                          >
                            <span className="text-vsc-variable">{key}:</span>
                            <span className="ml-2 text-vsc-string">{value}</span>
                          </div>
                        ))}
                        {Object.keys(displayTelemetry).length > 8 && (
                          <div 
                            className="tree-item text-vsc-fg-muted italic"
                            style={{ '--indent-level': 2 } as React.CSSProperties}
                          >
                            +{Object.keys(displayTelemetry).length - 8} more...
                          </div>
                        )}
                      </>
                    )}

                    {/* Quick actions */}
                    {device.connected && (
                      <div 
                        className="flex gap-1 px-2 py-1 mt-1"
                        style={{ marginLeft: 'calc(var(--tree-indent) * 1)' }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSendCommand(device.name, 'reset')
                          }}
                          className="px-2 py-0.5 text-xs bg-vsc-button hover:bg-vsc-button-hover rounded"
                        >
                          Reset
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSendCommand(device.name, 'home')
                          }}
                          className="px-2 py-0.5 text-xs bg-vsc-button hover:bg-vsc-button-hover rounded"
                        >
                          Home
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Connection Settings Dialog */}
      {showConnectionDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-vsc-bg border border-vsc-border rounded-lg shadow-xl w-96 max-w-[90vw]">
            <div className="px-4 py-3 border-b border-vsc-border">
              <h3 className="text-sm font-medium text-vsc-fg capitalize">
                {showConnectionDialog} - Connection Settings
              </h3>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Current status */}
              <div className="text-xs">
                <div className="text-vsc-fg-dim mb-2">Current Status:</div>
                <div className="flex items-center gap-2">
                  {devices[showConnectionDialog]?.connected ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      <span className="text-green-400">
                        Connected via {devices[showConnectionDialog]?.connectionMethod?.toUpperCase()}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-vsc-fg-muted" />
                      <span className="text-vsc-fg-muted">Disconnected</span>
                    </>
                  )}
                </div>
              </div>

              {/* USB Connection */}
              <div>
                <div className="text-xs text-vsc-fg-dim mb-2 flex items-center gap-2">
                  <Usb size={14} />
                  USB Connection
                </div>
                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-vsc-input border border-vsc-border rounded"
                >
                  <option value="">Select COM Port...</option>
                  {serialPorts.map(p => (
                    <option key={p.port} value={p.port}>
                      {p.port} - {p.description}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleConnectUSB(showConnectionDialog)}
                    disabled={!selectedPort}
                    className="flex-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                  >
                    Connect USB
                  </button>
                  {devices[showConnectionDialog]?.connectionMethod === 'usb' && (
                    <button
                      onClick={() => handleDisconnectUSB(showConnectionDialog)}
                      className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 rounded"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {/* Network info */}
              <div>
                <div className="text-xs text-vsc-fg-dim mb-2 flex items-center gap-2">
                  <Wifi size={14} />
                  Network Connection
                </div>
                <div className="text-xs text-vsc-fg-muted p-2 bg-vsc-input/30 rounded">
                  {devices[showConnectionDialog]?.connectionMethod === 'network' && devices[showConnectionDialog]?.connected ? (
                    <span className="text-green-400">
                      Connected to {devices[showConnectionDialog]?.ip}:{devices[showConnectionDialog]?.port}
                    </span>
                  ) : (
                    <>
                      Network devices are discovered automatically via UDP broadcast.
                      <br />
                      Ensure device is on network 192.168.1.x
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-vsc-border flex justify-end gap-2">
              <button
                onClick={async () => {
                  const ports = await listSerialPorts()
                  setSerialPorts(ports)
                }}
                className="px-3 py-1.5 text-xs bg-vsc-button hover:bg-vsc-button-hover rounded"
              >
                Refresh Ports
              </button>
              <button
                onClick={() => setShowConnectionDialog(null)}
                className="px-3 py-1.5 text-xs bg-vsc-button hover:bg-vsc-button-hover rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status footer */}
      <div className="px-3 py-2 border-t border-vsc-border text-xs text-vsc-fg-dim">
        {!backendConnected ? (
          <span className="text-vsc-warning">⚠ Backend disconnected</span>
        ) : connectedCount === 0 ? (
          <span className="text-vsc-fg-muted">Searching for devices...</span>
        ) : (
          <span className="text-vsc-success">
            ● {connectedCount} device{connectedCount !== 1 ? 's' : ''} online
          </span>
        )}
      </div>
    </div>
  )
}
