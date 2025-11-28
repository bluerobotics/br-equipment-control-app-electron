import { 
  ChevronRight, 
  ChevronDown, 
  Terminal,
  Variable,
  Cpu,
  Search,
  AlertCircle,
  BookOpen
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { CommandParam } from '../../services/api'

export function CommandsView() {
  const { 
    definitions, 
    addTerminalMessage, 
    setScriptContent, 
    script,
    devices 
  } = useAppStore()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  // Filter commands based on search
  const filteredDefinitions = useMemo(() => {
    if (!searchQuery.trim()) return definitions
    
    const query = searchQuery.toLowerCase()
    const filtered: typeof definitions = {}
    
    for (const [deviceName, def] of Object.entries(definitions)) {
      const matchingCommands: typeof def.commands = {}
      const matchingTelemetry: typeof def.telemetry_schema = {}
      
      // Filter commands
      for (const [cmdName, cmd] of Object.entries(def.commands || {})) {
        if (cmdName.toLowerCase().includes(query) || 
            cmd.description?.toLowerCase().includes(query)) {
          matchingCommands[cmdName] = cmd
        }
      }
      
      // Filter telemetry
      for (const [varName, schema] of Object.entries(def.telemetry_schema || {})) {
        if (varName.toLowerCase().includes(query) ||
            schema.help?.toLowerCase().includes(query)) {
          matchingTelemetry[varName] = schema
        }
      }
      
      // Include device if it has matching items or device name matches
      if (Object.keys(matchingCommands).length > 0 || 
          Object.keys(matchingTelemetry).length > 0 ||
          deviceName.toLowerCase().includes(query)) {
        filtered[deviceName] = {
          ...def,
          commands: Object.keys(matchingCommands).length > 0 ? matchingCommands : def.commands,
          telemetry_schema: Object.keys(matchingTelemetry).length > 0 ? matchingTelemetry : def.telemetry_schema
        }
      }
    }
    
    return filtered
  }, [definitions, searchQuery])

  const insertCommand = (device: string, command: string, params: CommandParam[]) => {
    // Build command string with parameter placeholders
    const requiredParams = params.filter(p => !p.optional)
    const paramStr = requiredParams.length > 0 
      ? ' ' + requiredParams.map(p => `<${p.parameter}>`).join(' ')
      : ''
    const commandStr = `${device}.${command}${paramStr}`
    
    // Insert at cursor or append
    const newContent = script.content + (script.content.endsWith('\n') ? '' : '\n') + commandStr + '\n'
    setScriptContent(newContent)
    
    addTerminalMessage({ type: 'info', message: `Inserted: ${commandStr}` })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    addTerminalMessage({ type: 'info', message: `Copied: ${text}` })
  }

  const hasDefinitions = Object.keys(definitions).length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2 border-b border-vsc-border">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-vsc-fg-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search commands & variables..."
            className="w-full pl-7 pr-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* Command tree */}
      <div className="flex-1 overflow-auto py-1">
        {!hasDefinitions ? (
          <div className="px-4 py-8 text-center text-vsc-fg-dim text-sm">
            <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
            <p>No command definitions loaded</p>
            <p className="text-xs mt-1 text-vsc-fg-muted">
              Add a device to see available commands
            </p>
          </div>
        ) : Object.keys(filteredDefinitions).length === 0 ? (
          <div className="px-4 py-8 text-center text-vsc-fg-dim text-sm">
            <Search size={32} className="mx-auto mb-2 opacity-50" />
            <p>No matches found</p>
            <p className="text-xs mt-1 text-vsc-fg-muted">
              Try a different search term
            </p>
          </div>
        ) : (
          Object.entries(filteredDefinitions).map(([deviceName, def]) => {
            const isExpanded = expandedSections.has(deviceName)
            const isCommandsExpanded = expandedSections.has(`${deviceName}-commands`)
            const isVariablesExpanded = expandedSections.has(`${deviceName}-variables`)
            const isWarningsExpanded = expandedSections.has(`${deviceName}-warnings`)
            
            const commands = def.commands || {}
            const telemetry = def.telemetry_schema || {}
            const warnings = def.warnings || {}
            const device = devices[deviceName]

            return (
              <div key={deviceName}>
                {/* Device header */}
                <div
                  className="tree-item font-medium"
                  onClick={() => toggleSection(deviceName)}
                >
                  <span className="w-4 flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown size={16} className="text-vsc-fg-dim" />
                    ) : (
                      <ChevronRight size={16} className="text-vsc-fg-dim" />
                    )}
                  </span>
                  <Cpu size={16} className={`mr-2 ${device?.connected ? 'text-vsc-type' : 'text-vsc-fg-muted'}`} />
                  <span className={`capitalize ${device?.connected ? 'text-vsc-type' : 'text-vsc-fg-dim'}`}>
                    {deviceName}
                  </span>
                  {device?.connected && (
                    <span className="ml-2 w-2 h-2 rounded-full bg-vsc-success" title="Connected" />
                  )}
                </div>

                {isExpanded && (
                  <>
                    {/* Commands section */}
                    {Object.keys(commands).length > 0 && (
                      <>
                        <div
                          className="tree-item"
                          style={{ '--indent-level': 1 } as React.CSSProperties}
                          onClick={() => toggleSection(`${deviceName}-commands`)}
                        >
                          <span className="w-4 flex-shrink-0">
                            {isCommandsExpanded ? (
                              <ChevronDown size={14} className="text-vsc-fg-dim" />
                            ) : (
                              <ChevronRight size={14} className="text-vsc-fg-dim" />
                            )}
                          </span>
                          <Terminal size={14} className="mr-2 text-vsc-keyword" />
                          <span className="text-vsc-fg-dim">Commands</span>
                          <span className="ml-auto text-xs text-vsc-fg-muted">
                            {Object.keys(commands).length}
                          </span>
                        </div>

                        {isCommandsExpanded && Object.entries(commands).map(([cmdName, cmd]) => (
                          <div
                            key={cmdName}
                            className="tree-item group cursor-pointer"
                            style={{ '--indent-level': 2 } as React.CSSProperties}
                            onClick={() => insertCommand(deviceName, cmdName, cmd.params || [])}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              copyToClipboard(`${deviceName}.${cmdName}`)
                            }}
                            title={cmd.description}
                          >
                            <span className="text-vsc-function">{cmdName}</span>
                            {cmd.params && cmd.params.length > 0 && (
                              <span className="ml-1 text-vsc-fg-muted text-xs">
                                ({cmd.params.filter(p => !p.optional).map(p => p.parameter).join(', ')})
                              </span>
                            )}
                          </div>
                        ))}
                      </>
                    )}

                    {/* Variables/Telemetry section */}
                    {Object.keys(telemetry).length > 0 && (
                      <>
                        <div
                          className="tree-item"
                          style={{ '--indent-level': 1 } as React.CSSProperties}
                          onClick={() => toggleSection(`${deviceName}-variables`)}
                        >
                          <span className="w-4 flex-shrink-0">
                            {isVariablesExpanded ? (
                              <ChevronDown size={14} className="text-vsc-fg-dim" />
                            ) : (
                              <ChevronRight size={14} className="text-vsc-fg-dim" />
                            )}
                          </span>
                          <Variable size={14} className="mr-2 text-vsc-variable" />
                          <span className="text-vsc-fg-dim">Variables</span>
                          <span className="ml-auto text-xs text-vsc-fg-muted">
                            {Object.keys(telemetry).length}
                          </span>
                        </div>

                        {isVariablesExpanded && Object.entries(telemetry).map(([varName, schema]) => (
                          <div
                            key={varName}
                            className="tree-item cursor-pointer"
                            style={{ '--indent-level': 2 } as React.CSSProperties}
                            onClick={() => copyToClipboard(`${deviceName}.${varName}`)}
                            title={schema.help}
                          >
                            <span className="text-vsc-variable">{varName}</span>
                            <span className="ml-1 text-vsc-fg-muted text-xs">
                              : {schema.type}
                              {schema.unit && ` (${schema.unit})`}
                            </span>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Warnings section */}
                    {Object.keys(warnings).length > 0 && (
                      <>
                        <div
                          className="tree-item"
                          style={{ '--indent-level': 1 } as React.CSSProperties}
                          onClick={() => toggleSection(`${deviceName}-warnings`)}
                        >
                          <span className="w-4 flex-shrink-0">
                            {isWarningsExpanded ? (
                              <ChevronDown size={14} className="text-vsc-fg-dim" />
                            ) : (
                              <ChevronRight size={14} className="text-vsc-fg-dim" />
                            )}
                          </span>
                          <AlertCircle size={14} className="mr-2 text-vsc-warning" />
                          <span className="text-vsc-fg-dim">Warnings</span>
                          <span className="ml-auto text-xs text-vsc-fg-muted">
                            {Object.keys(warnings).length}
                          </span>
                        </div>

                        {isWarningsExpanded && Object.entries(warnings).map(([warnName, warn]) => (
                          <div
                            key={warnName}
                            className="tree-item"
                            style={{ '--indent-level': 2 } as React.CSSProperties}
                            title={warn.description}
                          >
                            <span className="text-vsc-warning">{warnName}</span>
                            <span className="ml-1 text-vsc-fg-muted text-xs">
                              [{warn.severity}]
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Help footer */}
      <div className="px-3 py-2 border-t border-vsc-border text-xs text-vsc-fg-dim">
        <p>Click command to insert • Right-click to copy</p>
      </div>
    </div>
  )
}
