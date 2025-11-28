/**
 * API Service - Communication with Python backend
 * 
 * Handles REST API calls and WebSocket connections for real-time updates.
 */

const API_BASE = 'http://localhost:5000/api'

// Note: We use HTTP polling instead of WebSocket because Flask's dev server
// doesn't handle WebSocket upgrades properly. This works fine for our use case.

// Types
export interface Device {
  name?: string
  connected: boolean
  connection_method: 'network' | 'usb'
  ip: string | null
  port: number | null
  last_rx: number
  serial_port: string | null
  firmware_version: string | null
  telemetry: Record<string, string | number>
  definition?: DeviceDefinition
}

export interface DeviceDefinition {
  name: string
  path?: string
  commands: Record<string, CommandDefinition>
  telemetry_schema: Record<string, TelemetryField>
  events: Record<string, EventDefinition>
  warnings: Record<string, WarningDefinition>
  reports: Record<string, ReportDefinition>
  views: Record<string, ViewDefinition>
  config: Record<string, unknown>
}

export interface CommandDefinition {
  device: string
  target: string
  description: string
  params: CommandParam[]
  returns: string[]
}

export interface CommandParam {
  parameter: string
  type: string
  unit?: string
  optional?: boolean
  default?: unknown
  help?: string
  enum?: string[]
}

export interface TelemetryField {
  type: string
  default?: unknown
  unit?: string
  precision?: number
  gui_var?: string
  help?: string
  map?: Record<string, string>
}

export interface EventDefinition {
  device: string
  description: string
}

export interface WarningDefinition {
  severity: string
  description: string
}

export interface ReportDefinition {
  description: string
  output_format: string
}

export interface ViewDefinition {
  label: string
  type: string
}

export interface SerialPort {
  port: string
  description: string
}

export interface LogMessage {
  type: 'info' | 'sent' | 'received' | 'error' | 'warning' | 'success'
  message: string
  timestamp: string
}

// ============================================================================
// REST API Functions
// ============================================================================

export async function healthCheck(): Promise<{ status: string, timestamp: number }> {
  const response = await fetch(`${API_BASE}/health`)
  if (!response.ok) throw new Error('Backend not available')
  return response.json()
}

export async function fetchDevices(): Promise<Record<string, Device>> {
  const response = await fetch(`${API_BASE}/devices`)
  if (!response.ok) throw new Error('Failed to fetch devices')
  return response.json()
}

export async function fetchDevice(deviceName: string): Promise<Device> {
  const response = await fetch(`${API_BASE}/devices/${deviceName}`)
  if (!response.ok) throw new Error(`Failed to fetch device: ${deviceName}`)
  return response.json()
}

export async function sendCommand(
  deviceName: string, 
  command: string
): Promise<{ success: boolean, error?: string }> {
  const response = await fetch(`${API_BASE}/devices/${deviceName}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command })
  })
  return response.json()
}

export async function triggerDiscovery(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/devices/discover`, {
    method: 'POST'
  })
  return response.json()
}

export async function fetchDefinitions(): Promise<Record<string, DeviceDefinition>> {
  const response = await fetch(`${API_BASE}/definitions`)
  if (!response.ok) throw new Error('Failed to fetch definitions')
  return response.json()
}

export async function fetchDeviceDefinition(deviceName: string): Promise<DeviceDefinition> {
  const response = await fetch(`${API_BASE}/definitions/${deviceName}`)
  if (!response.ok) throw new Error(`Failed to fetch definition: ${deviceName}`)
  return response.json()
}

export async function getDevicePaths(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/config/device_paths`)
  if (!response.ok) throw new Error('Failed to fetch device paths')
  return response.json()
}

export async function setDevicePaths(paths: string[]): Promise<{ success: boolean, devices: string[] }> {
  const response = await fetch(`${API_BASE}/config/device_paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths })
  })
  if (!response.ok) throw new Error('Failed to set device paths')
  return response.json()
}

export async function listSerialPorts(): Promise<SerialPort[]> {
  const response = await fetch(`${API_BASE}/serial/ports`)
  if (!response.ok) throw new Error('Failed to list serial ports')
  return response.json()
}

export async function connectSerial(port: string, device: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/serial/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port, device })
  })
  return response.json()
}

export async function disconnectSerial(port: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/serial/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port })
  })
  return response.json()
}

export async function detectSerialDevice(port: string): Promise<{ device: string | null }> {
  const response = await fetch(`${API_BASE}/serial/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port })
  })
  return response.json()
}

export async function fetchLogs(): Promise<LogMessage[]> {
  const response = await fetch(`${API_BASE}/logs`)
  if (!response.ok) throw new Error('Failed to fetch logs')
  return response.json()
}

export async function clearLogs(): Promise<void> {
  await fetch(`${API_BASE}/logs/clear`, { method: 'POST' })
}

// ============================================================================
// Event Manager (HTTP Polling based - no WebSocket needed)
// ============================================================================
// Flask's dev server doesn't support WebSocket properly, so we use HTTP polling
// which is already implemented via the pollDevices() function in useBackend.

type MessageHandler = (data: unknown) => void

class EventManager {
  private handlers: Map<string, Set<MessageHandler>> = new Map()
  
  // No-op connect since we use HTTP polling
  connect(): Promise<void> {
    console.log('[EventManager] Using HTTP polling for backend communication')
    return Promise.resolve()
  }

  disconnect() {
    // No-op
  }

  // These are no longer used since we use REST API for commands
  send(_event: string, _data: unknown) {
    console.warn('[EventManager] send() called but we use REST API instead')
  }

  on(event: string, handler: MessageHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return () => this.off(event, handler)
  }

  off(event: string, handler: MessageHandler) {
    this.handlers.get(event)?.delete(handler)
  }

  // Called by polling to emit events
  emit(event: string, data: unknown) {
    this.handlers.get(event)?.forEach(handler => {
      try {
        handler(data)
      } catch (e) {
        console.error(`[EventManager] Handler error for ${event}:`, e)
      }
    })
  }
  
  get isOpen(): boolean {
    return true // Always "open" since we use HTTP polling
  }
}

// Export singleton instance
export const wsManager = new EventManager()

// ============================================================================
// WebSocket Event Handlers
// ============================================================================

export function onDeviceUpdate(handler: (data: Record<string, Device>) => void) {
  return wsManager.on('devices', handler as MessageHandler)
}

export function onSingleDeviceUpdate(handler: (data: Record<string, Device>) => void) {
  return wsManager.on('device_update', handler as MessageHandler)
}

export function onTelemetry(handler: (data: { device: string, data: Record<string, unknown> }) => void) {
  return wsManager.on('telemetry', handler as MessageHandler)
}

export function onLog(handler: (data: LogMessage) => void) {
  return wsManager.on('log', handler as MessageHandler)
}

export function onStatusMessage(handler: (data: { device?: string, source?: string, message: string }) => void) {
  return wsManager.on('status_message', handler as MessageHandler)
}

export function onRecovery(handler: (data: { device?: string, source?: string, message: string }) => void) {
  return wsManager.on('recovery', handler as MessageHandler)
}

export function onNvmDump(handler: (data: { device: string, data: string }) => void) {
  return wsManager.on('nvm_dump', handler as MessageHandler)
}

export function onDevicePathsUpdated(handler: (data: { devices: string[] }) => void) {
  return wsManager.on('device_paths_updated', handler as MessageHandler)
}

// ============================================================================
// WebSocket Commands
// ============================================================================

export function wsSendCommand(device: string, command: string) {
  wsManager.send('send_command', { device, command })
}

export function wsSetDevicePaths(paths: string[]) {
  wsManager.send('set_device_paths', { paths })
}
