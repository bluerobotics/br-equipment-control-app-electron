import { useRef, useEffect, useState } from 'react'
import { 
  Terminal as TerminalIcon, 
  FileText, 
  AlertCircle,
  Trash2,
  Copy,
  ChevronDown,
  Send
} from 'lucide-react'
import { useAppStore, type PanelTab } from '../stores/appStore'
import { sendCommand } from '../services/api'

interface PanelTabButtonProps {
  tab: PanelTab
  icon: React.ReactNode
  label: string
  count?: number
}

function PanelTabButton({ tab, icon, label, count }: PanelTabButtonProps) {
  const { activePanelTab, setActivePanelTab } = useAppStore()
  const isActive = activePanelTab === tab

  return (
    <button
      onClick={() => setActivePanelTab(tab)}
      className={`flex items-center gap-1.5 px-3 h-full text-xs uppercase tracking-wide transition-colors ${
        isActive 
          ? 'text-vsc-fg border-t border-vsc-accent' 
          : 'text-vsc-fg-dim hover:text-vsc-fg'
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-vsc-accent text-white">
          {count}
        </span>
      )}
    </button>
  )
}

function TerminalContent() {
  const { terminalMessages, clearTerminal, addTerminalMessage, devices, selectedDevice } = useAppStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  // Get list of connected devices for the dropdown
  const connectedDevices = Object.entries(devices)
    .filter(([_, d]) => d.connected)
    .map(([name]) => name)
  
  // Target device - use selected or first connected
  const [targetDevice, setTargetDevice] = useState<string>('')
  
  useEffect(() => {
    if (!targetDevice && connectedDevices.length > 0) {
      setTargetDevice(selectedDevice || connectedDevices[0])
    }
  }, [connectedDevices, selectedDevice, targetDevice])

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [terminalMessages])

  const handleSendCommand = async (command: string) => {
    if (!command.trim()) return
    
    const device = targetDevice || connectedDevices[0]
    if (!device) {
      addTerminalMessage({ type: 'error', message: 'No device connected' })
      return
    }
    
    // Add to history
    setCommandHistory(prev => [...prev.filter(c => c !== command), command].slice(-50))
    setHistoryIndex(-1)
    
    // Log the sent command
    addTerminalMessage({ type: 'sent', message: command, device })
    
    try {
      const result = await sendCommand(device, command)
      if (!result.success) {
        addTerminalMessage({ 
          type: 'error', 
          message: result.error || 'Command failed', 
          device 
        })
      }
    } catch (error) {
      addTerminalMessage({ type: 'error', message: `Failed to send: ${error}`, device })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const command = inputRef.current?.value.trim()
      if (command) {
        handleSendCommand(command)
        inputRef.current!.value = ''
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex
        setHistoryIndex(newIndex)
        if (inputRef.current) {
          inputRef.current.value = commandHistory[commandHistory.length - 1 - newIndex] || ''
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        if (inputRef.current) {
          inputRef.current.value = commandHistory[commandHistory.length - 1 - newIndex] || ''
        }
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        if (inputRef.current) {
          inputRef.current.value = ''
        }
      }
    }
  }

  const copyTerminal = () => {
    const text = terminalMessages.map(m => m.message).join('\n')
    navigator.clipboard.writeText(text)
    addTerminalMessage({ type: 'info', message: 'Terminal output copied to clipboard' })
  }

  const getMessageColor = (type: string) => {
    switch (type) {
      case 'error': return 'text-vsc-error'
      case 'warning': return 'text-vsc-warning'
      case 'success': return 'text-vsc-success'
      case 'sent': return 'text-vsc-accent'
      case 'received': return 'text-vsc-variable'
      default: return 'text-vsc-fg'
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-vsc-border">
        <button
          onClick={clearTerminal}
          className="p-1 rounded hover:bg-vsc-highlight text-vsc-fg-dim hover:text-vsc-fg"
          title="Clear Terminal"
        >
          <Trash2 size={14} />
        </button>
        <button
          onClick={copyTerminal}
          className="p-1 rounded hover:bg-vsc-highlight text-vsc-fg-dim hover:text-vsc-fg"
          title="Copy Terminal Output"
        >
          <Copy size={14} />
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto font-mono text-xs p-2 bg-vsc-bg-darker"
      >
        {terminalMessages.map((msg) => (
          <div key={msg.id} className="flex gap-2 py-0.5 hover:bg-vsc-highlight">
            <span className="text-vsc-fg-muted select-none">
              [{formatTime(msg.timestamp)}]
            </span>
            {msg.device && (
              <span className="text-vsc-type select-none">
                [{msg.device}]
              </span>
            )}
            <span className={getMessageColor(msg.type)}>
              {msg.message}
            </span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center border-t border-vsc-border bg-vsc-bg-darker">
        {/* Device selector */}
        {connectedDevices.length > 0 && (
          <select
            value={targetDevice}
            onChange={(e) => setTargetDevice(e.target.value)}
            className="h-full px-2 py-1 text-xs bg-vsc-bg border-r border-vsc-border text-vsc-fg outline-none cursor-pointer"
            title="Target device"
          >
            {connectedDevices.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
        <span className="px-2 text-vsc-accent text-xs font-mono">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          onKeyDown={handleKeyDown}
          placeholder={connectedDevices.length > 0 ? "Enter command... (↑↓ for history)" : "No device connected"}
          disabled={connectedDevices.length === 0}
          className="flex-1 bg-transparent border-none outline-none text-xs font-mono py-1.5 text-vsc-fg placeholder:text-vsc-fg-muted disabled:opacity-50"
        />
        <button
          onClick={() => {
            const command = inputRef.current?.value.trim()
            if (command) {
              handleSendCommand(command)
              inputRef.current!.value = ''
            }
          }}
          disabled={connectedDevices.length === 0}
          className="px-2 py-1 text-vsc-fg-dim hover:text-vsc-accent disabled:opacity-30"
          title="Send command"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

function OutputContent() {
  return (
    <div className="flex-1 flex items-center justify-center text-vsc-fg-dim text-sm">
      <FileText size={32} className="mr-2 opacity-50" />
      Output will appear here
    </div>
  )
}

function ProblemsContent() {
  return (
    <div className="flex-1 flex items-center justify-center text-vsc-fg-dim text-sm">
      <AlertCircle size={32} className="mr-2 opacity-50" />
      No problems detected
    </div>
  )
}

export function Panel() {
  const { panelHeight, activePanelTab, togglePanel } = useAppStore()

  return (
    <div 
      className="bg-vsc-panel flex flex-col overflow-hidden border-t border-vsc-border"
      style={{ height: panelHeight }}
    >
      {/* Tab bar */}
      <div className="h-9 flex items-center border-b border-vsc-border">
        <PanelTabButton 
          tab="terminal" 
          icon={<TerminalIcon size={14} />} 
          label="Terminal" 
        />
        <PanelTabButton 
          tab="output" 
          icon={<FileText size={14} />} 
          label="Output" 
        />
        <PanelTabButton 
          tab="problems" 
          icon={<AlertCircle size={14} />} 
          label="Problems" 
          count={0}
        />
        
        {/* Spacer */}
        <div className="flex-1" />
        
        {/* Close button */}
        <button
          onClick={togglePanel}
          className="p-2 text-vsc-fg-dim hover:text-vsc-fg"
          title="Close Panel"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activePanelTab === 'terminal' && <TerminalContent />}
        {activePanelTab === 'output' && <OutputContent />}
        {activePanelTab === 'problems' && <ProblemsContent />}
      </div>
    </div>
  )
}

