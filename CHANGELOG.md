# Changelog

All notable changes to the BR Equipment Control App (Electron Edition) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-11-28

### Added
- Initial Electron + React + TypeScript application scaffold
- VS Code-inspired dark theme UI with activity bar, sidebar, and panel layout
- Device discovery via UDP broadcast (port 8888) with automatic connection
- USB serial communication support with COM port selection
- Real-time telemetry display in device tree view
- Terminal panel with message logging (sent, received, errors, info)
- Command Reference panel with dynamic loading from device definitions
- Python backend server (Flask-SocketIO) bridging frontend to device communication
- Device definition loading from external paths (e.g., pressboi repository)
- Connection settings dialog for switching between USB and Network modes
- Persistent device paths and connection configurations
- Single instance lock to prevent multiple app windows
- Custom launcher scripts (launch.bat, launch-silent.vbs)

### Technical Details
- Electron 34.0.0 with Vite build system
- React 19 with Zustand state management
- TailwindCSS for styling with CSS variables for theming
- Monaco Editor integration (prepared for script editing)
- xterm.js terminal emulator (prepared for terminal features)
- Python backend with Flask-SocketIO for WebSocket communication
- HTTP polling fallback for reliable state synchronization

### Known Issues
- Script editor (Monaco) not yet fully implemented
- Telemetry graphs not yet implemented
- Data logging/CSV export not yet implemented

