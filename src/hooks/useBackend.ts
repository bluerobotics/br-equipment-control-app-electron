/**
 * useBackend Hook - Connects backend to app state
 * 
 * Handles WebSocket connection, device path configuration, and state sync.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { 
  fetchDevices,
  fetchDefinitions,
  setDevicePaths,
  wsManager,
  onDeviceUpdate,
  onSingleDeviceUpdate,
  onTelemetry,
  onLog,
  onStatusMessage,
  onRecovery,
  type LogMessage,
  type Device,
  type DeviceDefinition
} from '../services/api'

// Default device paths to add if no devices are loaded
// These will be saved to the persistent config on first use
const DEFAULT_DEVICE_PATHS = [
  'C:/Users/emill/Documents/GitHub/pressboi'
]

export function useBackend() {
  const { 
    setDevice,
    setDevices,
    setDefinitions,
    updateTelemetry, 
    addTerminalMessage,
    setStatusMessage,
    setBackendConnected
  } = useAppStore()
  
  const pollIntervalRef = useRef<number | null>(null)
  const isConnectedRef = useRef(false)
  const initCompleteRef = useRef(false)

  // Handle log message from backend
  const handleLog = useCallback((log: LogMessage) => {
    addTerminalMessage({
      type: log.type || 'info',
      message: log.message
    })
  }, [addTerminalMessage])

  // Handle full device state update
  const handleDevicesUpdate = useCallback((devices: Record<string, Device>) => {
    // Convert backend device format to store format
    const storeDevices: Record<string, {
      connected: boolean
      connectionMethod: 'network' | 'usb'
      ip?: string
      port?: number
      serialPort?: string
      firmwareVersion?: string
      telemetry: Record<string, string | number>
      definition?: DeviceDefinition
    }> = {}
    
    for (const [name, device] of Object.entries(devices)) {
      storeDevices[name] = {
        connected: device.connected,
        connectionMethod: device.connection_method,
        ip: device.ip || undefined,
        port: device.port || undefined,
        serialPort: device.serial_port || undefined,
        firmwareVersion: device.firmware_version || undefined,
        telemetry: device.telemetry || {},
        definition: device.definition
      }
    }
    
    setDevices(storeDevices)
    
    if (!isConnectedRef.current) {
      isConnectedRef.current = true
      setBackendConnected(true)
      setStatusMessage('Connected to backend')
    }
  }, [setDevices, setBackendConnected, setStatusMessage])

  // Handle single device update
  const handleSingleDeviceUpdate = useCallback((data: Record<string, Device>) => {
    for (const [name, device] of Object.entries(data)) {
      setDevice(name, {
        connected: device.connected,
        connectionMethod: device.connection_method,
        ip: device.ip || undefined,
        port: device.port || undefined,
        serialPort: device.serial_port || undefined,
        firmwareVersion: device.firmware_version || undefined,
        telemetry: device.telemetry || {}
      })
      
      // Log connection changes
      if (device.connected) {
        const location = device.connection_method === 'usb' 
          ? device.serial_port 
          : device.ip
        addTerminalMessage({
          type: 'success',
          message: `${name}: Connected via ${device.connection_method} on ${location}`,
          device: name
        })
      }
    }
  }, [setDevice, addTerminalMessage])

  // Handle telemetry update
  const handleTelemetry = useCallback((data: { device: string, data: Record<string, unknown> }) => {
    updateTelemetry(data.device, data.data as Record<string, string | number>)
  }, [updateTelemetry])

  // Handle status message (DONE, ERROR, INFO, etc.)
  const handleStatusMessage = useCallback((data: { device?: string, source?: string, message: string }) => {
    const msgUpper = data.message.toUpperCase()
    const type = msgUpper.includes('ERROR') ? 'error' 
               : msgUpper.includes('DONE') ? 'success' 
               : msgUpper.includes('INFO') ? 'info'
               : 'received'
    
    addTerminalMessage({
      type,
      message: data.message,
      device: data.device
    })
  }, [addTerminalMessage])

  // Handle recovery warning
  const handleRecovery = useCallback((data: { device?: string, source?: string, message: string }) => {
    addTerminalMessage({
      type: 'error',
      message: `⚠️ RECOVERY: ${data.message}`,
      device: data.device
    })
    // TODO: Show modal warning dialog
  }, [addTerminalMessage])

  // Poll devices as fallback
  const pollDevices = useCallback(async () => {
    try {
      const devices = await fetchDevices()
      handleDevicesUpdate(devices)
    } catch (error) {
      if (isConnectedRef.current) {
        isConnectedRef.current = false
        setBackendConnected(false)
        setStatusMessage('Backend disconnected')
        addTerminalMessage({
          type: 'error',
          message: 'Lost connection to backend server'
        })
      }
    }
  }, [handleDevicesUpdate, setBackendConnected, setStatusMessage, addTerminalMessage])

  // Load device definitions
  const loadDefinitions = useCallback(async () => {
    try {
      const definitions = await fetchDefinitions()
      setDefinitions(definitions)
      addTerminalMessage({
        type: 'info',
        message: `Loaded definitions for: ${Object.keys(definitions).join(', ')}`
      })
    } catch (error) {
      console.error('Failed to load definitions:', error)
    }
  }, [setDefinitions, addTerminalMessage])

  // Initialize backend connection
  useEffect(() => {
    if (initCompleteRef.current) return
    initCompleteRef.current = true

    const init = async () => {
      addTerminalMessage({
        type: 'info',
        message: 'BR Equipment Control App - Electron Edition'
      })
      addTerminalMessage({
        type: 'info',
        message: '=' .repeat(50)
      })
      addTerminalMessage({
        type: 'info',
        message: 'Connecting to backend server...'
      })

      // Set up event handlers
      const cleanups = [
        onDeviceUpdate(handleDevicesUpdate),
        onSingleDeviceUpdate(handleSingleDeviceUpdate),
        onTelemetry(handleTelemetry),
        onStatusMessage(handleStatusMessage),
        onRecovery(handleRecovery),
        onLog(handleLog)
      ]

      // Try WebSocket connection
      try {
        await wsManager.connect()
        addTerminalMessage({
          type: 'success',
          message: 'WebSocket connected'
        })
        setStatusMessage('Connected (WebSocket)')
        setBackendConnected(true)
      } catch {
        addTerminalMessage({
          type: 'warning',
          message: 'WebSocket failed, falling back to polling'
        })
      }

      // Load definitions first to see if devices are already configured
      await loadDefinitions()
      
      // Initial poll to get current device state
      await pollDevices()
      
      // Initial poll to get current device state (backend loads saved paths on startup)
      await pollDevices()
      
      // Load definitions 
      await loadDefinitions()
      
      // Check if we need to add default device paths
      // The backend will load saved paths on startup, so we only need to add
      // default paths if no devices are loaded
      const currentDevices = useAppStore.getState().devices
      if (Object.keys(currentDevices).length === 0) {
        addTerminalMessage({
          type: 'info',
          message: 'No saved devices found, adding default paths...'
        })
        try {
          const result = await setDevicePaths(DEFAULT_DEVICE_PATHS)
          if (result.devices && result.devices.length > 0) {
            addTerminalMessage({
              type: 'success',
              message: `Loaded devices: ${result.devices.join(', ')}`
            })
            // Reload definitions after adding paths
            await loadDefinitions()
            await pollDevices()
          } else {
            addTerminalMessage({
              type: 'warning',
              message: 'No devices found in default paths'
            })
          }
        } catch (error) {
          addTerminalMessage({
            type: 'error',
            message: `Failed to add device paths: ${error}`
          })
        }
      } else {
        addTerminalMessage({
          type: 'success',
          message: `Loaded ${Object.keys(currentDevices).length} saved device(s)`
        })
      }
      
      // Start polling as fallback/supplement
      pollIntervalRef.current = window.setInterval(pollDevices, 2000)

      // Store cleanup
      return () => {
        cleanups.forEach(cleanup => cleanup())
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
        }
        wsManager.disconnect()
      }
    }

    const cleanupPromise = init()
    
    return () => {
      cleanupPromise.then(cleanup => cleanup?.())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { pollDevices, loadDefinitions }
}
