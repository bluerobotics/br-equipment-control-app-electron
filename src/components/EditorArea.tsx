import { useRef, useState, useCallback } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { useAppStore } from '../stores/appStore'
import { FileCode, X, Circle, Play, Square, Save, FolderOpen, FileText, RotateCcw, StepForward } from 'lucide-react'
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
  const [singleBlockMode, setSingleBlockMode] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pauseResolverRef = useRef<(() => void) | null>(null)
  const decorationsRef = useRef<string[]>([])

  // Get connected devices
  const connectedDevices = Object.entries(devices)
    .filter(([_, d]) => d.connected)
    .map(([name]) => name)

  // Reset all connected devices
  const handleReset = useCallback(async () => {
    // Stop any running script
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Clear state
    setIsRunning(false)
    setIsPaused(false)
    setScriptRunning(false)
    setCurrentLine(null)
    clearHighlight()
    pauseResolverRef.current = null
    
    if (connectedDevices.length === 0) {
      addTerminalMessage({ type: 'info', message: '🔄 Reset - cleared script state' })
      return
    }
    
    addTerminalMessage({ type: 'info', message: '🔄 Sending reset to all devices...' })
    
    for (const deviceName of connectedDevices) {
      try {
        await sendCommand(deviceName, 'reset')
        addTerminalMessage({ type: 'sent', message: 'reset', device: deviceName })
      } catch (err) {
        addTerminalMessage({ type: 'error', message: `Reset failed: ${err}`, device: deviceName })
      }
    }
  }, [connectedDevices, addTerminalMessage, clearHighlight, setScriptRunning, setCurrentLine])

  // Continue execution after single block pause
  const continueExecution = useCallback(() => {
    if (pauseResolverRef.current) {
      pauseResolverRef.current()
      pauseResolverRef.current = null
      setIsPaused(false)
    }
  }, [])

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
    
    // Add new decoration - subtle left border highlight
    decorationsRef.current = editor.deltaDecorations([], [
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: 'current-line-decoration',
          className: 'current-line-highlight',
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
    if (isRunning && !isPaused) return
    
    // If paused in single block mode, continue
    if (isPaused) {
      continueExecution()
      return
    }
    
    if (connectedDevices.length === 0) {
      addTerminalMessage({ type: 'error', message: 'No device connected' })
      return
    }
    
    setIsRunning(true)
    setScriptRunning(true)
    abortControllerRef.current = new AbortController()
    
    const lines = script.content.split('\n')
    const mode = singleBlockMode ? 'SINGLE BLOCK' : 'CONTINUOUS'
    addTerminalMessage({ type: 'info', message: `▶ Script started (${mode} mode)` })
    
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
        
        let executedCommand = false
        
        if (line.startsWith('wait ')) {
          // Wait command: wait <seconds>
          const seconds = parseFloat(line.substring(5))
          if (!isNaN(seconds)) {
            addTerminalMessage({ type: 'info', message: `⏳ Waiting ${seconds}s...`, device: 'script' })
            await new Promise(resolve => setTimeout(resolve, seconds * 1000))
          }
          executedCommand = true
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
            executedCommand = true
            
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
        
        // In single block mode, pause after each command
        if (singleBlockMode && executedCommand && i < lines.length - 1) {
          setIsPaused(true)
          addTerminalMessage({ type: 'info', message: '⏸ Paused - Click Run to continue', device: 'script' })
          
          // Wait for user to click Run again
          await new Promise<void>((resolve) => {
            pauseResolverRef.current = resolve
          })
          
          // Check if stopped while paused
          if (abortControllerRef.current?.signal.aborted) {
            addTerminalMessage({ type: 'warning', message: '⏹ Script stopped by user' })
            break
          }
        }
      }
      
      if (!abortControllerRef.current?.signal.aborted) {
        addTerminalMessage({ type: 'success', message: '✓ Script completed' })
      }
    } catch (err) {
      addTerminalMessage({ type: 'error', message: `Script error: ${err}` })
    } finally {
      setIsRunning(false)
      setIsPaused(false)
      setScriptRunning(false)
      setCurrentLine(null)
      clearHighlight()
      abortControllerRef.current = null
      pauseResolverRef.current = null
    }
  }, [script.content, connectedDevices, isRunning, isPaused, singleBlockMode, highlightLine, clearHighlight, addTerminalMessage, setScriptRunning, setCurrentLine, continueExecution])

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
        {!isRunning || isPaused ? (
          <button
            onClick={runScript}
            disabled={connectedDevices.length === 0}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium"
            title={connectedDevices.length === 0 ? "No device connected" : isPaused ? "Continue (F5)" : "Run script (F5)"}
          >
            <Play size={14} />
            {isPaused ? 'Continue' : 'Run'}
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
        
        {isRunning && !isPaused && (
          <button
            onClick={stopScript}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs font-medium"
            title="Stop script"
          >
            <Square size={14} />
          </button>
        )}
        
        <div className="w-px h-5 bg-vsc-border mx-1" />
        
        {/* Single Block Mode Toggle */}
        <button
          onClick={() => setSingleBlockMode(!singleBlockMode)}
          disabled={isRunning}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            singleBlockMode 
              ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
              : 'bg-vsc-bg hover:bg-vsc-highlight text-vsc-fg-dim hover:text-vsc-fg border border-vsc-border'
          } disabled:opacity-50`}
          title="Single Block Mode - pause after each command"
        >
          <StepForward size={14} />
          Single Block
        </button>
        
        <div className="w-px h-5 bg-vsc-border mx-1" />
        
        {/* Reset Button */}
        <button
          onClick={handleReset}
          disabled={connectedDevices.length === 0}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium"
          title="Reset all connected devices"
        >
          <RotateCcw size={14} />
          Reset
        </button>
        
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
        {isRunning && isPaused && (
          <span className="text-xs text-yellow-400 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-yellow-400 rounded-full" />
            Paused at line {script.currentLine || '...'}
          </span>
        )}
        
        {isRunning && !isPaused && (
          <span className="text-xs text-green-400 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
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

