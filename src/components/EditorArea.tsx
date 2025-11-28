import { useRef, useEffect } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { useAppStore } from '../stores/appStore'
import { FileCode, X, Circle } from 'lucide-react'
import type { editor } from 'monaco-editor'

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
  const { script, setScriptContent, setScriptModified } = useAppStore()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    
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

  // Get filename from path
  const fileName = script.path 
    ? script.path.split(/[/\\]/).pop() 
    : 'Untitled.breq'

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-vsc-editor">
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

