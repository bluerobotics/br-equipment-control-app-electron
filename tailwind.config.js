/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // VS Code Dark+ theme colors
        'vsc': {
          // Backgrounds
          'bg': '#1e1e1e',
          'bg-dark': '#181818',
          'bg-darker': '#141414',
          'sidebar': '#252526',
          'sidebar-dark': '#1f1f1f',
          'activitybar': '#181818',
          'editor': '#1e1e1e',
          'panel': '#181818',
          'input': '#3c3c3c',
          'dropdown': '#3c3c3c',
          
          // Borders
          'border': '#3c3c3c',
          'border-light': '#464646',
          
          // Text
          'fg': '#cccccc',
          'fg-dim': '#858585',
          'fg-muted': '#6e6e6e',
          
          // Accents
          'accent': '#0078d4',
          'accent-hover': '#1f8ad2',
          'selection': '#264f78',
          'highlight': '#add6ff26',
          
          // Semantic colors
          'success': '#4ec9b0',
          'warning': '#dcdcaa',
          'error': '#f14c4c',
          'info': '#75beff',
          
          // Syntax colors
          'keyword': '#569cd6',
          'string': '#ce9178',
          'number': '#b5cea8',
          'comment': '#6a9955',
          'function': '#dcdcaa',
          'variable': '#9cdcfe',
          'type': '#4ec9b0',
          'operator': '#d4d4d4',
        }
      },
      fontFamily: {
        'mono': ['Cascadia Code', 'Consolas', 'Monaco', 'Courier New', 'monospace'],
        'sans': ['Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      fontSize: {
        'xxs': '10px',
        'xs': '11px',
        'sm': '12px',
        'base': '13px',
        'lg': '14px',
        'xl': '16px',
      },
      spacing: {
        'activitybar': '48px',
        'sidebar': '280px',
        'panel': '200px',
      }
    },
  },
  plugins: [],
}

