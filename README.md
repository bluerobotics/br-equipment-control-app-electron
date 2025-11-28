# BR Equipment Control App - Electron Edition

A modern VS Code-style desktop application for controlling BR manufacturing equipment.

## Tech Stack

- **Electron** - Desktop framework (same as VS Code)
- **React 19** - UI framework with TypeScript
- **Monaco Editor** - Code editor (same as VS Code)
- **xterm.js** - Terminal emulator (same as VS Code)
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **Zustand** - State management

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Python 3.8+ (for backend)

### Install Dependencies

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

This will:
1. Start the Vite dev server
2. Launch Electron
3. Start the Python backend

### Build for Production

```bash
npm run build
```

## Project Structure

```
├── electron/           # Electron main process
│   ├── main.ts        # Main process entry
│   └── preload.ts     # Preload script (IPC bridge)
├── src/               # React application
│   ├── components/    # UI components
│   ├── stores/        # Zustand state stores
│   ├── types/         # TypeScript types
│   ├── App.tsx        # Main app component
│   └── main.tsx       # React entry point
├── backend/           # Python backend
│   └── server.py      # Device communication server
└── assets/            # Icons and images
```

## Features

- [ ] VS Code-style UI layout
- [ ] Monaco code editor with .breq syntax highlighting
- [ ] Terminal panel for logging
- [ ] Device management sidebar
- [ ] Command reference panel
- [ ] Script execution
- [ ] USB/Network device communication
- [ ] Data logging to CSV
- [ ] Report generation

## License

MIT
