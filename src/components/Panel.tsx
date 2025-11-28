import { useRef, useEffect } from 'react'
import { 
  Terminal as TerminalIcon, 
  FileText, 
  AlertCircle,
  Trash2,
  Copy,
  ChevronDown
} from 'lucide-react'
import { useAppStore, type PanelTab } from '../stores/appStore'

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
  const { terminalMessages, clearTerminal, addTerminalMessage } = useAppStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [terminalMessages])

  const handleCommand = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const command = inputRef.current?.value.trim()
      if (command) {
        addTerminalMessage({ type: 'sent', message: `> ${command}` })
        // TODO: Send command to device
        inputRef.current!.value = ''
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
        <span className="px-2 text-vsc-accent text-xs font-mono">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          onKeyDown={handleCommand}
          placeholder="Enter command..."
          className="flex-1 bg-transparent border-none outline-none text-xs font-mono py-1.5 text-vsc-fg placeholder:text-vsc-fg-muted"
        />
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

