import { create } from 'zustand'
import { DeviceDefinition } from '../services/api'

// Activity bar views
export type ActivityView = 'devices' | 'scripts' | 'commands' | 'settings'

// Panel tabs
export type PanelTab = 'terminal' | 'output' | 'problems'

// Device connection state
export interface DeviceState {
  name: string
  connected: boolean
  connectionMethod: 'network' | 'usb' | null
  ip?: string
  port?: number
  serialPort?: string
  firmwareVersion?: string
  telemetry: Record<string, string | number>
  lastSeen?: number
  definition?: DeviceDefinition
}

// Script state
export interface ScriptState {
  path: string | null
  content: string
  modified: boolean
  running: boolean
  currentLine: number | null
}

// Terminal message
export interface TerminalMessage {
  id: string
  timestamp: Date
  type: 'info' | 'sent' | 'received' | 'error' | 'warning' | 'success'
  device?: string
  message: string
}

// App store interface
interface AppState {
  // Layout
  sidebarVisible: boolean
  sidebarWidth: number
  panelVisible: boolean
  panelHeight: number
  activeView: ActivityView
  activePanelTab: PanelTab
  
  // Backend connection
  backendConnected: boolean
  
  // Devices
  devices: Record<string, DeviceState>
  definitions: Record<string, DeviceDefinition>
  selectedDevice: string | null
  
  // Script
  script: ScriptState
  recentFiles: string[]
  
  // Terminal
  terminalMessages: TerminalMessage[]
  
  // Status
  statusMessage: string
  
  // Actions - Layout
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  togglePanel: () => void
  setPanelHeight: (height: number) => void
  setActiveView: (view: ActivityView) => void
  setActivePanelTab: (tab: PanelTab) => void
  
  // Actions - Backend
  setBackendConnected: (connected: boolean) => void
  
  // Actions - Devices
  setDevices: (devices: Record<string, Partial<DeviceState>>) => void
  setDevice: (name: string, state: Partial<DeviceState>) => void
  selectDevice: (name: string | null) => void
  updateTelemetry: (device: string, telemetry: Record<string, string | number>) => void
  setDefinitions: (definitions: Record<string, DeviceDefinition>) => void
  
  // Actions - Script
  setScriptContent: (content: string) => void
  setScriptPath: (path: string | null) => void
  setScriptModified: (modified: boolean) => void
  setScriptRunning: (running: boolean) => void
  setCurrentLine: (line: number | null) => void
  
  // Actions - Terminal
  addTerminalMessage: (message: Omit<TerminalMessage, 'id' | 'timestamp'>) => void
  clearTerminal: () => void
  
  // Actions - Status
  setStatusMessage: (message: string) => void
}

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9)

// Create the store
export const useAppStore = create<AppState>((set) => ({
  // Initial state - Layout
  sidebarVisible: true,
  sidebarWidth: 280,
  panelVisible: true,
  panelHeight: 200,
  activeView: 'devices',
  activePanelTab: 'terminal',
  
  // Initial state - Backend
  backendConnected: false,
  
  // Initial state - Devices
  devices: {},
  definitions: {},
  selectedDevice: null,
  
  // Initial state - Script
  script: {
    path: null,
    content: '# BR Equipment Control Script\n# Write your automation script here\n\n',
    modified: false,
    running: false,
    currentLine: null
  },
  recentFiles: [],
  
  // Initial state - Terminal
  terminalMessages: [],
  
  // Initial state - Status
  statusMessage: 'Ready',
  
  // Actions - Layout
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(500, width)) }),
  togglePanel: () => set((state) => ({ panelVisible: !state.panelVisible })),
  setPanelHeight: (height) => set({ panelHeight: Math.max(100, Math.min(500, height)) }),
  setActiveView: (view) => set({ activeView: view, sidebarVisible: true }),
  setActivePanelTab: (tab) => set({ activePanelTab: tab, panelVisible: true }),
  
  // Actions - Backend
  setBackendConnected: (connected) => set({ backendConnected: connected }),
  
  // Actions - Devices
  setDevices: (devices) => set((prev) => {
    const newDevices: Record<string, DeviceState> = {}
    for (const [name, state] of Object.entries(devices)) {
      newDevices[name] = {
        ...prev.devices[name],
        name,
        connected: false,
        connectionMethod: null,
        telemetry: {},
        ...state
      } as DeviceState
    }
    return { devices: newDevices }
  }),
  
  setDevice: (name, state) => set((prev) => ({
    devices: {
      ...prev.devices,
      [name]: {
        name,
        connected: false,
        connectionMethod: null,
        telemetry: {},
        ...prev.devices[name],
        ...state
      } as DeviceState
    }
  })),
  
  selectDevice: (name) => set({ selectedDevice: name }),
  
  updateTelemetry: (device, telemetry) => set((prev) => {
    if (!prev.devices[device]) return prev
    return {
      devices: {
        ...prev.devices,
        [device]: {
          ...prev.devices[device],
          telemetry: {
            ...prev.devices[device].telemetry,
            ...telemetry
          },
          lastSeen: Date.now()
        }
      }
    }
  }),
  
  setDefinitions: (definitions) => set({ definitions }),
  
  // Actions - Script
  setScriptContent: (content) => set((state) => ({
    script: { ...state.script, content, modified: true }
  })),
  setScriptPath: (path) => set((state) => ({
    script: { ...state.script, path, modified: false }
  })),
  setScriptModified: (modified) => set((state) => ({
    script: { ...state.script, modified }
  })),
  setScriptRunning: (running) => set((state) => ({
    script: { ...state.script, running }
  })),
  setCurrentLine: (line) => set((state) => ({
    script: { ...state.script, currentLine: line }
  })),
  
  // Actions - Terminal
  addTerminalMessage: (message) => set((state) => ({
    terminalMessages: [
      ...state.terminalMessages,
      {
        ...message,
        id: generateId(),
        timestamp: new Date()
      }
    ].slice(-1000) // Keep last 1000 messages
  })),
  clearTerminal: () => set({ terminalMessages: [] }),
  
  // Actions - Status
  setStatusMessage: (message) => set({ statusMessage: message })
}))
