import { useRef, useState, useCallback } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { useAppStore } from '../stores/appStore'
import { FileCode, X, Circle, Play, Square, Save, FolderOpen, FileText } from 'lucide-react'
import type { editor } from 'monaco-editor'
import { sendCommand } from '../services/api'

// Define custom language for .breq scripts
const BREQ_LANGUAGE_ID = 'breq'

const registerBreqLanguage = (monaco: typeof import('monaco-editor')) => {
  // Register the language
  monaco.languages.register({ id: BREQ_LANGUAGE_ID })

  // Define syntax highlighting
  monaco.languages.setMonarchTokensProvider(BREQ_LANGUAGE_ID, {
    keywords: [
      'wait', 'wait_for', 'cycle', 'if', 'throw',
      'queue_for_logging', 'unqueue_for_logging', 
      'start_logging', 'stop_logging'
    ],
    
    operators: ['>', '<', '>=', '<=', '==', '!=', '+', '-', '*', '/'],

    tokenizer: {
      root: [
        // Comments
        [/#.*$/, 'comment'],
        
        // Device.command pattern
        [/[a-zA-Z_]\w*(?=\.)/, 'type.identifier'], // Device name (before dot)
        [/\.([a-zA-Z_]\w*)/, 'function'], // Command name (after dot)
        
        // Keywords
        [/\b(wait|wait_for|cycle|if|throw|queue_for_logging|unqueue_for_logging|start_logging|stop_logging)\b/, 'keyword'],
        
        // Numbers
        [/\b\d+\.?\d*\b/, 'number'],
        
        // Strings
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        
        // Operators
        [/[><=!+\-*/]+/, 'operator'],
        
        // Variables in wait_for conditions
        [/\b[a-zA-Z_]\w*\.[a-zA-Z_]\w*\b/, 'variable'],
        
        // Identifiers
        [/[a-zA-Z_]\w*/, 'identifier'],
      ]
    }
  })

  // Define theme colors for breq
  monaco.editor.defineTheme('breq-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: '569CD6' },
      { token: 'type.identifier', foreground: '4EC9B0' }, // Device name
      { token: 'function', foreground: 'DCDCAA' }, // Command
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'operator', foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editor.selectionBackground': '#264f78',
      'editor.lineHighlightBackground': '#2a2d2e',
      'editorCursor.foreground': '#aeafad',
      'editor.wordHighlightBackground': '#575757b8',
    }
  })
}

export function EditorArea() {
  const { 
    script, 
    setScriptContent, 
    setScriptModified,
    setScriptRunning,
    setCurrentLine,
    devices,
    addTerminalMessage
  } = useAppStore()
  
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const decorationsRef = useRef<string[]>([])

  // Get connected devices
  const connectedDevices = Object.entries(devices)
    .filter(([_, d]) => d.connected)
    .map(([name]) => name)

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    
    // Register our custom language
    registerBreqLanguage(monaco)
    
    // Set the theme
    monaco.editor.setTheme('breq-dark')
    
    // Configure editor
    editor.updateOptions({
      fontSize: 13,
      fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
      minimap: { enabled: true },
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      wordWrap: 'off',
      folding: true,
      glyphMargin: true,
      lineDecorationsWidth: 10,
      lineNumbersMinChars: 4,
    })
  }

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setScriptContent(value)
    }
  }

  // Highlight current line being executed
  const highlightLine = useCallback((lineNumber: number) => {
    if (!editorRef.current || !monacoRef.current) return
    
    const monaco = monacoRef.current
    const editor = editorRef.current
    
    // Clear previous decorations
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [])
    
    // Add new decoration
    decorationsRef.current = editor.deltaDecorations([], [
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'bg-yellow-500/20',
          glyphMarginClassName: 'bg-yellow-500 rounded-full',
        }
      }
    ])
    
    // Scroll to line
    editor.revealLineInCenter(lineNumber)
  }, [])

  // Clear line highlighting
  const clearHighlight = useCallback(() => {
    if (!editorRef.current) return
    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [])
  }, [])

  // Parse and run script
  const runScript = useCallback(async () => {
    if (isRunning) return
    if (connectedDevices.length === 0) {
      addTerminalMessage({ type: 'error', message: 'No device connected' })
      return
    }
    
    setIsRunning(true)
    setScriptRunning(true)
    abortControllerRef.current = new AbortController()
    
    const lines = script.content.split('\n')
    addTerminalMessage({ type: 'info', message: '▶ Script started' })
    
    try {
      for (let i = 0; i < lines.length; i++) {
        // Check if aborted
        if (abortControllerRef.current?.signal.aborted) {
          addTerminalMessage({ type: 'warning', message: '⏹ Script stopped by user' })
          break
        }
        
        const line = lines[i].trim()
        const lineNum = i + 1
        
        // Skip empty lines and comments
        if (!line || line.startsWith('#')) {
          continue
        }
        
        // Highlight current line
        highlightLine(lineNum)
        setCurrentLine(lineNum)
        
        // Parse the command
        // Format: device.command param1 param2 ...
        // Or: wait 1.5
        // Or: wait_for device.variable > 10
        
        if (line.startsWith('wait ')) {
          // Wait command: wait <seconds>
          const seconds = parseFloat(line.substring(5))
          if (!isNaN(seconds)) {
            addTerminalMessage({ type: 'info', message: `⏳ Waiting ${seconds}s...`, device: 'script' })
            await new Promise(resolve => setTimeout(resolve, seconds * 1000))
          }
        } else if (line.includes('.')) {
          // Device command: device.command params
          const dotIndex = line.indexOf('.')
          const spaceIndex = line.indexOf(' ', dotIndex)
          
          const deviceName = line.substring(0, dotIndex)
          const commandPart = spaceIndex > 0 
            ? line.substring(dotIndex + 1, spaceIndex)
            : line.substring(dotIndex + 1)
          const params = spaceIndex > 0 ? line.substring(spaceIndex + 1) : ''
          
          const fullCommand = params ? `${commandPart} ${params}` : commandPart
          
          // Check if device is connected
          if (!connectedDevices.includes(deviceName)) {
            addTerminalMessage({ 
              type: 'error', 
              message: `Device '${deviceName}' not connected`,
              device: 'script'
            })
            break
          }
          
          addTerminalMessage({ type: 'sent', message: fullCommand, device: deviceName })
          
          try {
            const result = await sendCommand(deviceName, fullCommand)
            if (!result.success) {
              addTerminalMessage({ 
                type: 'error', 
                message: result.error || 'Command failed',
                device: deviceName
              })
              // Don't break on error, continue script
            }
            
            // Small delay between commands
            await new Promise(resolve => setTimeout(resolve, 100))
          } catch (err) {
            addTerminalMessage({ 
              type: 'error', 
              message: `Failed to send command: ${err}`,
              device: deviceName
            })
          }
        } else {
          addTerminalMessage({ 
            type: 'warning', 
            message: `Unknown command format: ${line}`,
            device: 'script'
          })
        }
      }
      
      if (!abortControllerRef.current?.signal.aborted) {
        addTerminalMessage({ type: 'success', message: '✓ Script completed' })
      }
    } catch (err) {
      addTerminalMessage({ type: 'error', message: `Script error: ${err}` })
    } finally {
      setIsRunning(false)
      setScriptRunning(false)
      setCurrentLine(null)
      clearHighlight()
      abortControllerRef.current = null
    }
  }, [script.content, connectedDevices, isRunning, highlightLine, clearHighlight, addTerminalMessage, setScriptRunning, setCurrentLine])

  // Stop script execution
  const stopScript = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  // Get filename from path
  const fileName = script.path 
    ? script.path.split(/[/\\]/).pop() 
    : 'Untitled.breq'

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-vsc-editor">
      {/* Toolbar */}
      <div className="h-10 bg-vsc-bg-dark flex items-center px-2 border-b border-vsc-border gap-1">
        {/* Run/Stop buttons */}
        {!isRunning ? (
          <button
            onClick={runScript}
            disabled={connectedDevices.length === 0}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium"
            title={connectedDevices.length === 0 ? "No device connected" : "Run script (F5)"}
          >
            <Play size={14} />
            Run
          </button>
        ) : (
          <button
            onClick={stopScript}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
            title="Stop script"
          >
            <Square size={14} />
            Stop
          </button>
        )}
        
        <div className="w-px h-5 bg-vsc-border mx-1" />
        
        {/* File operations */}
        <button
          className="p-1.5 rounded hover:bg-vsc-highlight text-vsc-fg-dim hover:text-vsc-fg"
          title="New script"
        >
          <FileText size={16} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-vsc-highlight text-vsc-fg-dim hover:text-vsc-fg"
          title="Open script"
        >
          <FolderOpen size={16} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-vsc-highlight text-vsc-fg-dim hover:text-vsc-fg"
          title="Save script (Ctrl+S)"
        >
          <Save size={16} />
        </button>
        
        <div className="flex-1" />
        
        {/* Status */}
        {isRunning && (
          <span className="text-xs text-yellow-400 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            Running line {script.currentLine || '...'}
          </span>
        )}
        
        {connectedDevices.length === 0 && !isRunning && (
          <span className="text-xs text-vsc-fg-muted">
            No device connected
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="h-9 bg-vsc-bg-dark flex items-center border-b border-vsc-border">
        {/* Tab */}
        <div className="flex items-center h-full px-3 bg-vsc-editor border-r border-vsc-border gap-2">
          <FileCode size={14} className="text-vsc-keyword" />
          <span className="text-sm">{fileName}</span>
          {script.modified ? (
            <Circle size={8} className="text-vsc-fg fill-current" />
          ) : (
            <button className="p-0.5 rounded hover:bg-vsc-highlight opacity-0 group-hover:opacity-100">
              <X size={14} className="text-vsc-fg-dim" />
            </button>
          )}
        </div>
        
        {/* Empty space */}
        <div className="flex-1 bg-vsc-bg-dark" />
      </div>

      {/* Breadcrumb */}
      <div className="h-6 bg-vsc-editor flex items-center px-3 text-xs text-vsc-fg-dim border-b border-vsc-border">
        <span>scripts</span>
        <span className="mx-1">/</span>
        <span className="text-vsc-fg">{fileName}</span>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          defaultLanguage={BREQ_LANGUAGE_ID}
          value={script.content}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          theme="breq-dark"
          options={{
            fontSize: 13,
            fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
            minimap: { enabled: true },
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
          loading={
            <div className="flex items-center justify-center h-full text-vsc-fg-dim">
              Loading editor...
            </div>
          }
        />
      </div>
    </div>
  )
}

