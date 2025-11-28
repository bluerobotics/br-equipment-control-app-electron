"""
BR Equipment Control App - Electron Backend Server

This Flask-SocketIO server provides the bridge between the Electron frontend
and the device communication layer. It replicates all functionality from the
original Python/Tkinter app's communication modules.

Key Features:
- UDP network communication with devices (port 6272)
- USB serial communication (9600 baud)
- Device discovery and connection monitoring
- Telemetry parsing based on device definitions
- WebSocket real-time updates to frontend
"""

import os
import sys
import json
import socket
import threading
import time
import logging
from pathlib import Path
from collections import deque
from datetime import datetime

# Flask and SocketIO
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit

# Serial communication
try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False
    print("[WARNING] pyserial not installed - USB serial communication disabled")

# ============================================================================
# Configuration
# ============================================================================

# Network constants
CLEARCORE_PORT = 8888  # Devices listen on this port
CLIENT_PORT = 6272     # We bind to this port to receive responses
BROADCAST_IP = '192.168.1.255'

# Timing constants
HEARTBEAT_INTERVAL = 0.5
DISCOVERY_INTERVAL = 2.0
TIMEOUT_THRESHOLD = 3.0
USB_TIMEOUT_THRESHOLD = 6.0  # Longer timeout for USB

# Serial constants
SERIAL_BAUD_RATE = 9600
SERIAL_TIMEOUT = 0.1

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================================
# Flask App Setup
# ============================================================================

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ============================================================================
# Global State
# ============================================================================

# Thread-safe locks
state_lock = threading.Lock()
socket_lock = threading.Lock()
serial_lock = threading.Lock()

# Device state: device_name -> {connected, ip, port, last_rx, connection_method, serial_port, telemetry, definition}
devices_state = {}

# Device definitions: device_name -> {commands, telemetry_schema, events, ...}
device_definitions = {}

# Device paths (configured by frontend)
device_paths = []

# Log buffer for terminal display
log_buffer = deque(maxlen=1000)

# Serial connections: port_name -> {serial, thread, device_key}
serial_connections = {}

# UDP socket (initialized lazily)
udp_socket = None
udp_socket_bound = False

# ============================================================================
# Helper Functions
# ============================================================================

def safe_float(s, default_val=0.0):
    """Convert string to float, handling malformed data."""
    try:
        return float(str(s).strip().rstrip('.'))
    except (ValueError, TypeError):
        return default_val

def log_message(message, msg_type='info'):
    """Add a message to the log buffer and emit to frontend."""
    timestamp = datetime.now().strftime('%H:%M:%S')
    log_entry = {'timestamp': timestamp, 'message': message, 'type': msg_type}
    log_buffer.append(log_entry)
    socketio.emit('log', log_entry)
    logger.info(message)

def emit_device_update(device_name=None):
    """Emit device state update to frontend."""
    with state_lock:
        if device_name:
            if device_name in devices_state:
                socketio.emit('device_update', {device_name: devices_state[device_name]})
        else:
            socketio.emit('devices', dict(devices_state))

def emit_telemetry(device_name, telemetry_data):
    """Emit telemetry data to frontend."""
    socketio.emit('telemetry', {'device': device_name, 'data': telemetry_data})

# ============================================================================
# Device Definition Loading
# ============================================================================

def load_device_definitions():
    """Load device definitions from configured paths."""
    global device_definitions, devices_state
    
    log_message("[SYSTEM] Loading device definitions...")
    
    with state_lock:
        device_definitions.clear()
        # Don't clear devices_state completely - preserve connection info
        
    for device_path in device_paths:
        if not os.path.isdir(device_path):
            log_message(f"[SYSTEM] Device path not found: {device_path}")
            continue
        
        # Find definition folder
        definition_path = os.path.join(device_path, 'definition')
        if not os.path.isdir(definition_path):
            # Check if root contains definition files
            if os.path.exists(os.path.join(device_path, 'config.json')) or \
               os.path.exists(os.path.join(device_path, 'commands.json')):
                definition_path = device_path
            else:
                log_message(f"[SYSTEM] No definition folder found at: {device_path}")
                continue
        
        # Read device name from config.json
        device_name = None
        config_path = os.path.join(definition_path, 'config.json')
        config_data = {}
        
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config_data = json.load(f)
                    device_name = config_data.get('device_name') or config_data.get('name')
            except Exception as e:
                log_message(f"[ERROR] Failed to read config.json: {e}")
        
        # Fallback to folder name
        if not device_name:
            device_name = os.path.basename(device_path)
        
        # Load definition files
        definition = {
            'name': device_name,
            'path': definition_path,
            'config': config_data,
            'commands': {},
            'telemetry_schema': {},
            'events': {},
            'warnings': {},
            'reports': {},
            'views': {}
        }
        
        # Load commands.json
        commands_path = os.path.join(definition_path, 'commands.json')
        if os.path.exists(commands_path):
            try:
                with open(commands_path, 'r', encoding='utf-8') as f:
                    definition['commands'] = json.load(f)
            except Exception as e:
                log_message(f"[ERROR] Failed to load commands.json for {device_name}: {e}")
        
        # Load telemetry.json
        telemetry_path = os.path.join(definition_path, 'telemetry.json')
        if os.path.exists(telemetry_path):
            try:
                with open(telemetry_path, 'r', encoding='utf-8') as f:
                    definition['telemetry_schema'] = json.load(f)
            except Exception as e:
                log_message(f"[ERROR] Failed to load telemetry.json for {device_name}: {e}")
        
        # Load events.json
        events_path = os.path.join(definition_path, 'events.json')
        if os.path.exists(events_path):
            try:
                with open(events_path, 'r', encoding='utf-8') as f:
                    definition['events'] = json.load(f)
            except Exception as e:
                log_message(f"[ERROR] Failed to load events.json for {device_name}: {e}")
        
        # Load warnings.json
        warnings_path = os.path.join(definition_path, 'warnings.json')
        if os.path.exists(warnings_path):
            try:
                with open(warnings_path, 'r', encoding='utf-8') as f:
                    definition['warnings'] = json.load(f)
            except Exception as e:
                log_message(f"[ERROR] Failed to load warnings.json for {device_name}: {e}")
        
        # Load reports.json
        reports_path = os.path.join(definition_path, 'reports.json')
        if os.path.exists(reports_path):
            try:
                with open(reports_path, 'r', encoding='utf-8') as f:
                    definition['reports'] = json.load(f)
            except Exception as e:
                log_message(f"[ERROR] Failed to load reports.json for {device_name}: {e}")
        
        # Load views.json
        views_path = os.path.join(definition_path, 'views.json')
        if os.path.exists(views_path):
            try:
                with open(views_path, 'r', encoding='utf-8') as f:
                    definition['views'] = json.load(f)
            except Exception as e:
                log_message(f"[ERROR] Failed to load views.json for {device_name}: {e}")
        
        with state_lock:
            device_definitions[device_name] = definition
            
            # Initialize device state if not exists
            if device_name not in devices_state:
                devices_state[device_name] = {
                    'connected': False,
                    'ip': None,
                    'port': CLEARCORE_PORT,
                    'last_rx': 0,
                    'connection_method': 'network',
                    'serial_port': None,
                    'telemetry': {},
                    'firmware_version': None
                }
            
            # Attach definition reference
            devices_state[device_name]['definition'] = definition
        
        log_message(f"[SYSTEM] Loaded device: {device_name}")
    
    emit_device_update()

# ============================================================================
# App Config Persistence (device paths, connection settings)
# ============================================================================

def get_config_dir():
    """Get path to config directory."""
    config_dir = Path.home() / '.br_equipment_control'
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir

def get_config_path():
    """Get path to connection config file."""
    return get_config_dir() / 'connections.json'

def get_device_paths_config_path():
    """Get path to device paths config file."""
    return get_config_dir() / 'device_paths.json'

def load_connection_configs():
    """Load saved connection configurations."""
    config_path = get_config_path()
    if not config_path.exists():
        return {}
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading connection config: {e}")
        return {}

def save_connection_config(device_name, connection_method, serial_port=None):
    """Save connection configuration for a device."""
    configs = load_connection_configs()
    configs[device_name] = {
        'connection_method': connection_method,
        'serial_port': serial_port
    }
    try:
        with open(get_config_path(), 'w') as f:
            json.dump(configs, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving connection config: {e}")

def apply_saved_connection_configs():
    """Apply saved connection configurations to device state."""
    configs = load_connection_configs()
    with state_lock:
        for device_name, config in configs.items():
            if device_name in devices_state:
                devices_state[device_name]['connection_method'] = config.get('connection_method', 'network')
                devices_state[device_name]['serial_port'] = config.get('serial_port')

def load_saved_device_paths():
    """Load saved device paths from config file."""
    config_path = get_device_paths_config_path()
    if not config_path.exists():
        return []
    try:
        with open(config_path, 'r') as f:
            data = json.load(f)
            return data.get('paths', [])
    except Exception as e:
        logger.error(f"Error loading device paths: {e}")
        return []

def save_device_paths(paths):
    """Save device paths to config file."""
    try:
        with open(get_device_paths_config_path(), 'w') as f:
            json.dump({'paths': paths}, f, indent=2)
        log_message(f"[SYSTEM] Saved device paths to config")
    except Exception as e:
        logger.error(f"Error saving device paths: {e}")

# ============================================================================
# UDP Network Communication
# ============================================================================

# Track if we've already logged the UDP error
udp_init_attempted = False

def init_udp_socket():
    """Initialize the UDP socket - matching original Python app exactly."""
    global udp_socket, udp_socket_bound, udp_init_attempted
    
    if udp_socket_bound:
        return True
    
    if udp_init_attempted:
        return False  # Already tried and failed, don't spam logs
    
    udp_init_attempted = True
    
    try:
        # Match original Python app socket setup exactly (network.py lines 37-44)
        udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp_socket.bind(('', CLIENT_PORT))  # Bind FIRST (like original)
        udp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)  # Then set broadcast
        udp_socket.settimeout(0.1)
        udp_socket_bound = True
        log_message(f"[SYSTEM] UDP socket bound to port {CLIENT_PORT}")
        return True
    except OSError as e:
        log_message(f"[WARNING] Could not bind UDP port {CLIENT_PORT}: {e}")
        log_message(f"[WARNING] Network device discovery disabled. USB connections still work.")
        return False

def send_udp_message(device_name, message):
    """Send a UDP message to a specific device."""
    global udp_socket
    
    if not udp_socket_bound:
        if not init_udp_socket():
            return False
    
    with state_lock:
        device = devices_state.get(device_name)
        if not device:
            log_message(f"[ERROR] Unknown device: {device_name}")
            return False
        
        if device.get('connection_method') == 'usb':
            # Route to serial instead
            serial_port = device.get('serial_port')
            if serial_port:
                return send_serial_command(serial_port, message)
            else:
                log_message(f"[ERROR] No serial port configured for {device_name}")
                return False
        
        device_ip = device.get('ip')
        device_port = device.get('port', CLEARCORE_PORT)
    
    if not device_ip:
        log_message(f"[ERROR] Cannot send to {device_name}: IP unknown")
        return False
    
    try:
        with socket_lock:
            udp_socket.sendto(message.encode(), (device_ip, device_port))
        log_message(f"[CMD SENT to {device_name.upper()}]: {message}")
        return True
    except Exception as e:
        log_message(f"[ERROR] Failed to send to {device_name}: {e}")
        return False

# Track discovery count for periodic logging
discovery_count = 0

def discover_devices():
    """Send a single discovery broadcast to find devices."""
    global udp_socket, discovery_count
    
    if not udp_socket_bound:
        if not init_udp_socket():
            return
    
    discovery_count += 1
    msg = f"DISCOVER_DEVICE PORT={CLIENT_PORT}"
    
    try:
        with socket_lock:
            # Broadcast to network devices
            udp_socket.sendto(msg.encode(), (BROADCAST_IP, CLEARCORE_PORT))
            
            # Also send to localhost simulators
            for port_offset in range(4):
                try:
                    udp_socket.sendto(msg.encode(), ('127.0.0.1', CLEARCORE_PORT + port_offset))
                except:
                    pass
        
        # Log every broadcast with details
        connected_count = sum(1 for d in devices_state.values() if d.get('connected'))
        log_message(f"[DISCOVERY #{discovery_count}] → {BROADCAST_IP}:{CLEARCORE_PORT} | {connected_count} device(s) online")
        
    except Exception as e:
        log_message(f"[DISCOVERY] Broadcast error: {e}")

def discovery_loop():
    """Continuous discovery broadcast loop."""
    # Wait for socket to initialize
    time.sleep(1)
    
    if not udp_socket_bound:
        logger.info("Discovery loop disabled - UDP socket not bound")
        return
    
    log_message(f"[SYSTEM] Discovery loop started - broadcasting every {DISCOVERY_INTERVAL}s")
    
    while True:
        discover_devices()
        time.sleep(DISCOVERY_INTERVAL)

def parse_telemetry(msg, device_name):
    """
    Parse telemetry message based on device schema.
    Returns dict of parsed values.
    """
    parsed = {}
    
    with state_lock:
        definition = device_definitions.get(device_name, {})
        schema = definition.get('telemetry_schema', {})
    
    try:
        # Extract payload: DEVICE_TELEM: key=value;key=value or key:value,key:value
        prefix = f"{device_name.upper()}_TELEM:"
        if prefix.lower() not in msg.lower():
            return parsed
        
        payload_start = msg.lower().find(prefix.lower()) + len(prefix)
        payload = msg[payload_start:].strip()
        
        # Parse based on format
        if ';' in payload and '=' in payload:
            # New format: key=value;key=value
            parts = dict(item.split('=', 1) for item in payload.split(';') if '=' in item)
        else:
            # Legacy format: key:value,key:value
            parts = dict(item.split(':', 1) for item in payload.split(',') if ':' in item)
        
        # Process each key-value pair
        for key, value in parts.items():
            key = key.strip()
            value = value.strip()
            
            if key in schema:
                details = schema[key]
                
                # Store raw value
                parsed[key] = value
                
                # Format for display
                formatted_value = value
                
                # Handle enum mapping
                if 'map' in details:
                    if value in details['map']:
                        formatted_value = details['map'][value]
                
                # Handle numeric formatting
                elif details.get('type') in ['float', 'int']:
                    try:
                        num_value = safe_float(value)
                        
                        if 'multiplier' in details:
                            num_value *= details['multiplier']
                        
                        precision = details.get('precision')
                        unit = details.get('unit', '')
                        
                        if precision is not None:
                            formatted_value = f"{num_value:.{precision}f}"
                        else:
                            formatted_value = f"{num_value}"
                        
                        if unit:
                            formatted_value = f"{formatted_value} {unit}"
                    except:
                        pass
                
                parsed[f"{key}_formatted"] = formatted_value
            else:
                # Unknown key, store as-is
                parsed[key] = value
    
    except Exception as e:
        logger.error(f"Telemetry parse error for {device_name}: {e}")
    
    return parsed

def handle_network_message(msg, source_ip):
    """Handle an incoming network message."""
    
    # Discovery response
    if msg.startswith("DISCOVERY_RESPONSE:"):
        try:
            parts = msg.split()
            device_key = None
            device_port = CLEARCORE_PORT
            device_fw = None
            
            for part in parts[1:]:
                if "=" in part:
                    key, value = part.split("=", 1)
                    if key == "DEVICE_ID":
                        device_key = value.lower()
                    elif key == "PORT":
                        device_port = int(value)
                    elif key in ("FW", "FIRMWARE", "VERSION"):
                        device_fw = value
            
            if device_key:
                with state_lock:
                    if device_key in devices_state:
                        device = devices_state[device_key]
                        
                        # Skip if configured for USB
                        if device.get('connection_method') == 'usb':
                            return
                        
                        was_connected = device.get('connected', False)
                        device['connected'] = True
                        device['ip'] = source_ip
                        device['port'] = device_port
                        device['last_rx'] = time.time()
                        if device_fw:
                            device['firmware_version'] = device_fw
                        
                        if not was_connected:
                            log_message(f"[SYSTEM] {device_key}: Connected via Ethernet on {source_ip}")
                
                emit_device_update(device_key)
        
        except Exception as e:
            logger.error(f"Discovery response parse error: {e}")
        return
    
    # Telemetry
    if "_TELEM:" in msg:
        try:
            device_key = msg.split("_TELEM:")[0].lower()
            
            with state_lock:
                if device_key in devices_state:
                    device = devices_state[device_key]
                    
                    # Skip if configured for USB
                    if device.get('connection_method') == 'usb':
                        return
                    
                    was_connected = device.get('connected', False)
                    device['connected'] = True
                    device['ip'] = source_ip
                    device['last_rx'] = time.time()
                    
                    if not was_connected:
                        log_message(f"[SYSTEM] {device_key}: Connected via Ethernet on {source_ip}")
            
            # Parse telemetry
            parsed = parse_telemetry(msg, device_key)
            if parsed:
                with state_lock:
                    if device_key in devices_state:
                        devices_state[device_key]['telemetry'].update(parsed)
                emit_telemetry(device_key, parsed)
            
            emit_device_update(device_key)

        except Exception as e:
            logger.error(f"Telemetry processing error: {e}")
        return
    
    # Recovery messages
    if "_RECOVERY:" in msg or msg.startswith("RECOVERY:"):
        log_message(f"[RECOVERY @{source_ip}]: {msg}")
        socketio.emit('recovery', {'source': source_ip, 'message': msg})
        return
    
    # NVM dump
    if msg.startswith("NVMDUMP:"):
        log_message(f"[STATUS @{source_ip}]: {msg}")
        try:
            _, device_key, payload = msg.split(":", 2)
            socketio.emit('nvm_dump', {'device': device_key.lower(), 'data': payload})
        except ValueError:
            pass
        return
    
    # Status messages (INFO, DONE, ERROR)
    if msg.startswith(("INFO:", "DONE:", "ERROR:")):
        log_message(f"[STATUS @{source_ip}]: {msg}")
        socketio.emit('status_message', {'source': source_ip, 'message': msg})
        
        # Update last_rx for matching device
        with state_lock:
            for device_name, device in devices_state.items():
                if device.get('ip') == source_ip:
                    device['last_rx'] = time.time()
                    break
        return
    
    # Device-specific status (e.g., PRESSBOI_DONE:)
    for device_name in list(devices_state.keys()):
        prefix = device_name.upper() + "_"
        if msg.startswith(prefix):
            log_message(f"[STATUS @{source_ip}]: {msg}")
            with state_lock:
                if device_name in devices_state:
                    devices_state[device_name]['last_rx'] = time.time()
            socketio.emit('status_message', {'device': device_name, 'message': msg})
            return
    
    # Unhandled
    log_message(f"[UNHANDLED @{source_ip}]: {msg}")

def udp_receive_loop():
    """Main UDP receive loop."""
    global udp_socket
    
    # Wait for socket initialization attempt
    time.sleep(0.5)
    
    if not udp_socket_bound:
        # Don't log error here - init_udp_socket already logged it
        logger.info("UDP receive loop disabled - socket not bound")
        return
    
    log_message("[SYSTEM] UDP receive loop started")
    log_message(f"[SYSTEM] Listening for UDP packets on port {CLIENT_PORT}")
    
    while True:
        try:
            data, addr = udp_socket.recvfrom(1024)
            msg = data.decode('utf-8', errors='replace').strip()
            source_ip = addr[0]
            source_port = addr[1]
            
            # Only log non-telemetry packets (telemetry is too frequent)
            if "_TELEM:" not in msg:
                log_message(f"[UDP RX] From {source_ip}:{source_port} → {msg[:100]}")
            
            handle_network_message(msg, source_ip)
            
        except socket.timeout:
            continue
        except Exception as e:
            if isinstance(e, OSError) and e.errno in (10054, 10053, 10057):
                # Connection errors when devices offline - ignore
                continue
            logger.error(f"UDP receive error: {e}")

def connection_monitor_loop():
    """Monitor device connections for timeouts."""
    while True:
        now = time.time()
        
        with state_lock:
            for device_name, device in list(devices_state.items()):
                if not device.get('connected'):
                    continue
                
                connection_method = device.get('connection_method', 'network')
                timeout = USB_TIMEOUT_THRESHOLD if connection_method == 'usb' else TIMEOUT_THRESHOLD
                
                last_rx = device.get('last_rx', 0)
                if last_rx > 0 and (now - last_rx) > timeout:
                    device['connected'] = False
                    device['ip'] = None
                    log_message(f"[SYSTEM] {device_name}: Disconnected (timeout)")
                    emit_device_update(device_name)
        
        time.sleep(HEARTBEAT_INTERVAL)

# ============================================================================
# USB Serial Communication
# ============================================================================

def list_serial_ports():
    """List available serial ports."""
    if not SERIAL_AVAILABLE:
        return []
    
    ports = serial.tools.list_ports.comports()
    return [{'port': p.device, 'description': p.description} for p in ports]

def detect_device_on_port(port_name, timeout=2.0):
    """
    Detect device type on a serial port by listening for messages.
    Returns device_name if detected, None otherwise.
    """
    if not SERIAL_AVAILABLE:
        return None
    
    try:
        ser = serial.Serial(port_name, SERIAL_BAUD_RATE, timeout=SERIAL_TIMEOUT)
        start_time = time.time()
        
        # Build identifier map from device configs
        identifier_map = {}
        with state_lock:
            for device_name, definition in device_definitions.items():
                config = definition.get('config', {})
                usb_ids = config.get('usb_identifiers', [])
                for identifier in usb_ids:
                    identifier_map[identifier.upper()] = device_name
        
        while time.time() - start_time < timeout:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip().upper()
                
                for identifier, device_name in identifier_map.items():
                    if identifier in line:
                        ser.close()
                        return device_name
            
            time.sleep(0.1)
        
        ser.close()
        return None
    except Exception as e:
        logger.error(f"Error detecting device on {port_name}: {e}")
        return None

def send_serial_command(port_name, command):
    """Send a command via serial port."""
    if not SERIAL_AVAILABLE:
        return False
    
    try:
        with serial_lock:
            if port_name in serial_connections:
                conn = serial_connections[port_name]
                if 'serial' in conn and conn['serial'].is_open:
                    conn['serial'].write((command + '\n').encode('utf-8'))
                    conn['serial'].flush()
                    log_message(f"[CMD SENT to {conn['device_key'].upper()} via USB]: {command}")
                    return True
        
        # Try opening temporarily
        ser = serial.Serial(port_name, SERIAL_BAUD_RATE, timeout=SERIAL_TIMEOUT)
        ser.write((command + '\n').encode('utf-8'))
        ser.close()
        return True
    except Exception as e:
        logger.error(f"Serial send error on {port_name}: {e}")
        return False

def handle_serial_message(device_key, message):
    """Handle message received from serial port."""
    msg = message.strip()
    if not msg:
        return
    
    # Update connection state
    with state_lock:
        if device_key in devices_state:
            device = devices_state[device_key]
            was_connected = device.get('connected', False)
            device['connected'] = True
            device['last_rx'] = time.time()
            device['connection_method'] = 'usb'  # Ensure USB mode is set
            
            if not was_connected:
                serial_port = device.get('serial_port', 'USB')
                log_message(f"[SYSTEM] {device_key}: Connected via USB on {serial_port}")
    
    # Emit update outside the lock to avoid potential deadlock
    if device_key in devices_state:
        emit_device_update(device_key)
    
    # Discovery response
    if msg.startswith("DISCOVERY_RESPONSE:"):
        try:
            parts = msg.split()
            for part in parts[1:]:
                if "=" in part:
                    key, value = part.split("=", 1)
                    if key in ("FW", "FIRMWARE", "VERSION"):
                        with state_lock:
                            if device_key in devices_state:
                                devices_state[device_key]['firmware_version'] = value
                        break
        except Exception as e:
            logger.error(f"USB discovery parse error: {e}")
        return
    
    # Telemetry
    if "_TELEM:" in msg:
        parsed = parse_telemetry(msg, device_key)
        if parsed:
            with state_lock:
                if device_key in devices_state:
                    devices_state[device_key]['telemetry'].update(parsed)
            emit_telemetry(device_key, parsed)
        return
    
    # Recovery
    if "_RECOVERY:" in msg or msg.startswith("RECOVERY:"):
        log_message(f"[RECOVERY via USB]: {msg}")
        socketio.emit('recovery', {'device': device_key, 'message': msg})
        return
    
    # NVM dump
    if msg.startswith("NVMDUMP:"):
        log_message(f"[STATUS via USB]: {msg}")
        try:
            _, dev_key, payload = msg.split(":", 2)
            socketio.emit('nvm_dump', {'device': dev_key.lower(), 'data': payload})
        except ValueError:
            pass
        return
    
    # Status messages
    if msg.startswith(("INFO:", "DONE:", "ERROR:")) or \
       msg.startswith(device_key.upper() + "_"):
        log_message(f"[STATUS via USB]: {msg}")
        socketio.emit('status_message', {'device': device_key, 'message': msg})
        return
    
    # Unhandled
    log_message(f"[UNHANDLED via USB]: {msg}")

def serial_listener_thread(port_name, device_key):
    """Background thread for serial port listening."""
    if not SERIAL_AVAILABLE:
        return
    
    try:
        ser = serial.Serial(port_name, SERIAL_BAUD_RATE, timeout=SERIAL_TIMEOUT)
        
        # Reset and flush
        ser.dtr = False
        ser.rts = False
        time.sleep(0.1)
        ser.dtr = True
        ser.rts = True
        time.sleep(0.2)
        ser.reset_input_buffer()
        ser.reset_output_buffer()
        
        # Drain stale data
        ser.timeout = 0.01
        start_drain = time.time()
        bytes_drained = 0
        while time.time() - start_drain < 2.0:
            if ser.in_waiting > 0:
                chunk = ser.read(ser.in_waiting)
                bytes_drained += len(chunk)
            else:
                break
        
        if bytes_drained > 0:
            logger.info(f"Drained {bytes_drained} stale bytes from {port_name}")
        
        ser.timeout = SERIAL_TIMEOUT
        ser.reset_input_buffer()
        
        log_message(f"[SYSTEM] Serial connected to {device_key} on {port_name}")
        
        # Store serial object
        with serial_lock:
            if port_name in serial_connections:
                serial_connections[port_name]['serial'] = ser
        
        # Chunk reassembly buffer
        chunk_buffer = []
        
        while True:
            with serial_lock:
                if port_name not in serial_connections:
                    break
            
            try:
                if not ser.is_open:
                    break
                
                while ser.in_waiting > 0:
                    line = ser.readline().decode('utf-8', errors='ignore').strip()
                    if line:
                        # Handle chunked messages
                        if line.startswith("CHUNK_"):
                            try:
                                header_end = line.index(":")
                                header = line[6:header_end]
                                chunk_num, total_chunks = map(int, header.split("/"))
                                data = line[header_end + 1:]
                                
                                chunk_buffer.append((chunk_num, total_chunks, data))
                                
                                if len(chunk_buffer) == total_chunks:
                                    chunk_buffer.sort(key=lambda x: x[0])
                                    full_message = ''.join([c[2] for c in chunk_buffer])
                                    chunk_buffer.clear()
                                    handle_serial_message(device_key, full_message)
                                elif len(chunk_buffer) > total_chunks:
                                    chunk_buffer.clear()
                            except:
                                pass
                        else:
                            handle_serial_message(device_key, line)
                
                time.sleep(0.01)
                
            except Exception as e:
                logger.error(f"Serial read error on {port_name}: {e}")
                break
        
        # Cleanup
        try:
            ser.close()
        except:
            pass
        
        log_message(f"[SYSTEM] Serial disconnected from {device_key} on {port_name}")
        
        with state_lock:
            if device_key in devices_state:
                devices_state[device_key]['connected'] = False
        
        emit_device_update(device_key)
        
    except Exception as e:
        logger.error(f"Serial connection error on {port_name}: {e}")
    
    finally:
        with serial_lock:
            if port_name in serial_connections:
                del serial_connections[port_name]

def connect_serial_device(port_name, device_key):
    """Connect to a device on a serial port."""
    if not SERIAL_AVAILABLE:
        log_message(f"[ERROR] pyserial not available - cannot connect USB")
        return False
    
    with serial_lock:
        if port_name in serial_connections:
            log_message(f"[INFO] {device_key}: Already connected to {port_name}")
            return True  # Already connected
        
        # Update device state BEFORE starting thread
        with state_lock:
            if device_key in devices_state:
                devices_state[device_key]['serial_port'] = port_name
                devices_state[device_key]['connection_method'] = 'usb'
                devices_state[device_key]['connected'] = False  # Will be set True when data received
                devices_state[device_key]['ip'] = None  # Clear network IP
        
        log_message(f"[SYSTEM] {device_key}: Switching to USB mode on {port_name}")
        
        # Emit update immediately so frontend sees the change
        emit_device_update(device_key)
        
        # Start listener thread
        thread = threading.Thread(
            target=serial_listener_thread,
            args=(port_name, device_key),
            daemon=True
        )
        thread.start()
        
        serial_connections[port_name] = {
            'device_key': device_key,
            'thread': thread,
            'port': port_name
        }
        
        # Save config
        save_connection_config(device_key, 'usb', port_name)
        
        return True

def disconnect_serial_device(port_name):
    """Disconnect from a serial port."""
    with serial_lock:
        if port_name in serial_connections:
            device_key = serial_connections[port_name].get('device_key')
            del serial_connections[port_name]
            
            # Update device state
            if device_key:
                with state_lock:
                    if device_key in devices_state:
                        devices_state[device_key]['connected'] = False
                log_message(f"[SYSTEM] {device_key}: USB disconnected from {port_name}")
                emit_device_update(device_key)
            
            return True
    return False

def switch_to_network(device_key):
    """Switch a device from USB to network connection mode."""
    with state_lock:
        if device_key not in devices_state:
            return False
        
        device = devices_state[device_key]
        old_method = device.get('connection_method', 'network')
        serial_port = device.get('serial_port')
        
        # Disconnect USB if connected
        if serial_port and serial_port in serial_connections:
            disconnect_serial_device(serial_port)
        
        # Reset to network mode
        device['connection_method'] = 'network'
        device['serial_port'] = None
        device['connected'] = False  # Will reconnect via network discovery
        
        # Save config
        save_connection_config(device_key, 'network', None)
        
        log_message(f"[SYSTEM] {device_key}: Switched from {old_method} to network mode")
    
    emit_device_update(device_key)
    return True

# ============================================================================
# REST API Endpoints
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'timestamp': time.time()})

@app.route('/api/devices', methods=['GET'])
def get_devices():
    """Get all devices and their states."""
    with state_lock:
        return jsonify(dict(devices_state))

@app.route('/api/devices/<device_name>', methods=['GET'])
def get_device(device_name):
    """Get a specific device's state."""
    with state_lock:
        if device_name not in devices_state:
            return jsonify({'error': 'Device not found'}), 404
        return jsonify(devices_state[device_name])

@app.route('/api/devices/<device_name>/send', methods=['POST'])
def send_command(device_name):
    """Send a command to a device."""
    data = request.get_json()
    command = data.get('command', '')
    
    if not command:
        return jsonify({'error': 'No command provided'}), 400
    
    with state_lock:
        if device_name not in devices_state:
            return jsonify({'error': 'Device not found'}), 404
        
        device = devices_state[device_name]
        connection_method = device.get('connection_method', 'network')
    
    if connection_method == 'usb':
        serial_port = device.get('serial_port')
        if serial_port:
            success = send_serial_command(serial_port, command)
        else:
            return jsonify({'error': 'No serial port configured'}), 400
    else:
        success = send_udp_message(device_name, command)
    
    return jsonify({'success': success})

@app.route('/api/devices/discover', methods=['POST'])
def trigger_discovery():
    """Trigger device discovery."""
    discover_devices()
    return jsonify({'success': True})

@app.route('/api/definitions', methods=['GET'])
def get_definitions():
    """Get all device definitions."""
    with state_lock:
        result = {}
        for name, definition in device_definitions.items():
            result[name] = {
                'name': definition.get('name'),
                'commands': definition.get('commands', {}),
                'telemetry_schema': definition.get('telemetry_schema', {}),
                'events': definition.get('events', {}),
                'warnings': definition.get('warnings', {}),
                'reports': definition.get('reports', {}),
                'views': definition.get('views', {}),
                'config': definition.get('config', {})
            }
        return jsonify(result)

@app.route('/api/definitions/<device_name>', methods=['GET'])
def get_device_definition(device_name):
    """Get definition for a specific device."""
    with state_lock:
        if device_name not in device_definitions:
            return jsonify({'error': 'Device not found'}), 404
        
        definition = device_definitions[device_name]
    return jsonify({
            'name': definition.get('name'),
            'commands': definition.get('commands', {}),
            'telemetry_schema': definition.get('telemetry_schema', {}),
            'events': definition.get('events', {}),
            'warnings': definition.get('warnings', {}),
            'reports': definition.get('reports', {}),
            'views': definition.get('views', {}),
            'config': definition.get('config', {})
        })

@app.route('/api/serial/ports', methods=['GET'])
def get_serial_ports():
    """List available serial ports."""
    return jsonify(list_serial_ports())

@app.route('/api/serial/connect', methods=['POST'])
def connect_serial():
    """Connect to a serial port."""
    data = request.get_json()
    port_name = data.get('port')
    device_key = data.get('device')
    
    if not port_name or not device_key:
        return jsonify({'error': 'Port and device required'}), 400
    
    success = connect_serial_device(port_name, device_key)
    return jsonify({'success': success})

@app.route('/api/serial/disconnect', methods=['POST'])
def disconnect_serial():
    """Disconnect from a serial port."""
    data = request.get_json()
    port_name = data.get('port')
    
    if not port_name:
        return jsonify({'error': 'Port required'}), 400
    
    success = disconnect_serial_device(port_name)
    return jsonify({'success': success})

@app.route('/api/devices/<device_name>/use_network', methods=['POST'])
def use_network(device_name):
    """Switch a device to network connection mode."""
    success = switch_to_network(device_name)
    return jsonify({'success': success})

@app.route('/api/serial/detect', methods=['POST'])
def detect_serial_device():
    """Detect device type on a serial port."""
    data = request.get_json()
    port_name = data.get('port')
    
    if not port_name:
        return jsonify({'error': 'Port required'}), 400
    
    device_name = detect_device_on_port(port_name)
    return jsonify({'device': device_name})

@app.route('/api/config/device_paths', methods=['GET'])
def get_device_paths():
    """Get configured device paths."""
    return jsonify(device_paths)

@app.route('/api/config/device_paths', methods=['POST'])
def set_device_paths():
    """Set device paths and reload definitions."""
    global device_paths
    data = request.get_json()
    paths = data.get('paths', [])
    
    device_paths = paths
    save_device_paths(paths)  # Persist to disk
    load_device_definitions()
    apply_saved_connection_configs()
    
    return jsonify({'success': True, 'devices': list(device_definitions.keys())})

@app.route('/api/logs', methods=['GET'])
def get_logs():
    """Get recent log messages."""
    return jsonify(list(log_buffer))

@app.route('/api/logs/clear', methods=['POST'])
def clear_logs():
    """Clear log buffer."""
    log_buffer.clear()
    return jsonify({'success': True})

# ============================================================================
# WebSocket Events
# ============================================================================

@socketio.on('connect')
def handle_connect():
    """Handle client connection."""
    logger.info("Client connected")
    emit_device_update()

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection."""
    logger.info("Client disconnected")

@socketio.on('send_command')
def handle_send_command(data):
    """Handle command from frontend."""
    device_name = data.get('device')
    command = data.get('command')
    
    if not device_name or not command:
        emit('error', {'message': 'Device and command required'})
        return
    
    with state_lock:
        if device_name not in devices_state:
            emit('error', {'message': f'Unknown device: {device_name}'})
            return
        
        device = devices_state[device_name]
        connection_method = device.get('connection_method', 'network')
    
    if connection_method == 'usb':
        serial_port = device.get('serial_port')
        if serial_port:
            success = send_serial_command(serial_port, command)
        else:
            emit('error', {'message': 'No serial port configured'})
            return
    else:
        success = send_udp_message(device_name, command)
    
    emit('command_result', {'success': success, 'device': device_name, 'command': command})

@socketio.on('set_device_paths')
def handle_set_device_paths(data):
    """Handle device paths configuration."""
    global device_paths
    paths = data.get('paths', [])
    
    device_paths = paths
    load_device_definitions()
    apply_saved_connection_configs()
    
    emit('device_paths_updated', {'devices': list(device_definitions.keys())})
    emit_device_update()

# ============================================================================
# Main Entry Point
# ============================================================================

def start_background_threads():
    """Start all background threads."""
    # Try to initialize UDP socket first
    init_udp_socket()
    
    # UDP receive loop (will check if socket is bound)
    threading.Thread(target=udp_receive_loop, daemon=True).start()
    
    # Discovery loop (will check if socket is bound)
    threading.Thread(target=discovery_loop, daemon=True).start()
    
    # Connection monitor
    threading.Thread(target=connection_monitor_loop, daemon=True).start()

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("BR Equipment Control App - Electron Edition")
    logger.info("=" * 60)
    
    # Load saved device paths on startup
    saved_paths = load_saved_device_paths()
    if saved_paths:
        device_paths.extend(saved_paths)
        logger.info(f"Loaded {len(saved_paths)} saved device path(s)")
        load_device_definitions()
        apply_saved_connection_configs()
    else:
        logger.info("No saved device paths found")
    
    # Start background threads
    start_background_threads()
    
    # Run Flask-SocketIO server
    socketio.run(app, host='127.0.0.1', port=5000, debug=False, allow_unsafe_werkzeug=True)
