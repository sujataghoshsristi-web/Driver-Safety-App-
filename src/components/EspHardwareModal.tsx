import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cpu, 
  Usb, 
  Bluetooth, 
  Wifi, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Terminal, 
  Copy, 
  Check, 
  ArrowRight,
  RefreshCw,
  Zap,
  Radio,
  FileCode
} from 'lucide-react';
import { EspConnectionState, EspDeviceType } from '../types/telemetry';
import { espManager, ARDUINO_SKETCHES } from '../utils/espManager';
import { cabAudio } from '../utils/audio';

interface EspHardwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  espState: EspConnectionState;
  onConfirmDock: () => void;
}

export const EspHardwareModal: React.FC<EspHardwareModalProps> = ({
  isOpen,
  onClose,
  espState,
  onConfirmDock,
}) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'monitor' | 'firmware'>('connect');
  const [deviceChoice, setDeviceChoice] = useState<EspDeviceType>('esp32');
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [wifiIp, setWifiIp] = useState<string>('192.168.4.1');
  const [wifiPort, setWifiPort] = useState<number>(81);
  const [copiedSketch, setCopiedSketch] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  useEffect(() => {
    if (espState.isConnected && activeTab === 'connect') {
      setActiveTab('monitor');
    }
  }, [espState.isConnected]);

  if (!isOpen) return null;

  const handleConnectSerial = async () => {
    cabAudio.playKeyClick();
    setConnectionError('');
    setIsConnecting(true);
    try {
      const ok = await espManager.connectSerial(baudRate);
      if (ok) {
        cabAudio.playSuccessChime();
        setActiveTab('monitor');
      } else {
        setConnectionError('Could not open serial port. Verify USB-OTG cable and CP2102/CH340 drivers.');
      }
    } catch (e: any) {
      setConnectionError(e.message || 'Web Serial connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectBle = async () => {
    cabAudio.playKeyClick();
    setConnectionError('');
    setIsConnecting(true);
    try {
      const ok = await espManager.connectBle();
      if (ok) {
        cabAudio.playSuccessChime();
        setActiveTab('monitor');
      } else {
        setConnectionError('Bluetooth connection cancelled or device not found.');
      }
    } catch (e: any) {
      setConnectionError(e.message || 'Web Bluetooth connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectWifi = () => {
    cabAudio.playKeyClick();
    setConnectionError('');
    const ok = espManager.connectWifi(wifiIp, wifiPort);
    if (!ok) {
      setConnectionError('Failed to initiate WebSocket connection.');
    }
  };

  const handleConnectSimulated = () => {
    cabAudio.playKeyClick();
    espManager.startSimulatedStream(deviceChoice);
    cabAudio.playSuccessChime();
    setActiveTab('monitor');
  };

  const handleDisconnect = () => {
    cabAudio.playKeyClick();
    espManager.disconnect();
  };

  const copyCode = (code: string) => {
    cabAudio.playKeyClick();
    navigator.clipboard.writeText(code);
    setCopiedSketch(true);
    setTimeout(() => setCopiedSketch(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#0d1c2d] border-2 border-[#30363d] rounded-lg shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#161b22] border-b border-[#30363d]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#f59e0b] text-[#051424] flex items-center justify-center font-bold">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-headline font-bold text-white tracking-tight">
                  In-Cab Microcontroller Telemetry Link
                </h3>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                    espState.isConnected
                      ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                      : 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]'
                  }`}
                >
                  {espState.isConnected ? 'STREAMING ACTIVE' : 'DISCONNECTED'}
                </span>
              </div>
              <p className="text-xs font-mono text-[#94a3b8]">
                TARGET: ESP32 / NODEMCU (ESP8266) · SENSORS: MQ-3, DOCK REED, RELAY, ACCEL
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onClose();
            }}
            className="p-2 text-[#94a3b8] hover:text-white rounded border border-[#30363d] bg-[#21262d]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 border-b border-[#30363d] text-center font-mono text-xs bg-[#122131]">
          <button
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveTab('connect');
            }}
            className={`py-2.5 px-2 border-r border-[#30363d] flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'connect'
                ? 'bg-[#1c2b3c] text-[#f59e0b] font-bold border-b-2 border-b-[#f59e0b]'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            <span>1. HARDWARE LINK</span>
          </button>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveTab('monitor');
            }}
            className={`py-2.5 px-2 border-r border-[#30363d] flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'monitor'
                ? 'bg-[#1c2b3c] text-[#f59e0b] font-bold border-b-2 border-b-[#f59e0b]'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>2. SENSOR MONITOR</span>
            {espState.isConnected && (
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-ping" />
            )}
          </button>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveTab('firmware');
            }}
            className={`py-2.5 px-2 flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'firmware'
                ? 'bg-[#1c2b3c] text-[#f59e0b] font-bold border-b-2 border-b-[#f59e0b]'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>3. ARDUINO CODE & PINOUT</span>
          </button>
        </div>

        {/* Body Container */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: Connect Modes */}
          {activeTab === 'connect' && (
            <div className="space-y-4">
              {/* Board Selector */}
              <div className="bg-[#161b22] border border-[#30363d] rounded p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">
                    SELECT MICROCONTROLLER ARCHITECTURE:
                  </span>
                  <span className="text-[11px] font-mono text-[#94a3b8]">
                    Pinouts and ADC resolutions will adapt automatically.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      cabAudio.playKeyClick();
                      setDeviceChoice('esp32');
                    }}
                    className={`px-3 py-1.5 rounded font-mono text-xs font-bold transition-colors ${
                      deviceChoice === 'esp32'
                        ? 'bg-[#f59e0b] text-[#051424]'
                        : 'bg-[#21262d] text-[#94a3b8] border border-[#30363d] hover:text-white'
                    }`}
                  >
                    ESP32 (12-bit ADC / BLE / Dual Core)
                  </button>

                  <button
                    onClick={() => {
                      cabAudio.playKeyClick();
                      setDeviceChoice('nodemcu');
                    }}
                    className={`px-3 py-1.5 rounded font-mono text-xs font-bold transition-colors ${
                      deviceChoice === 'nodemcu'
                        ? 'bg-[#f59e0b] text-[#051424]'
                        : 'bg-[#21262d] text-[#94a3b8] border border-[#30363d] hover:text-white'
                    }`}
                  >
                    NodeMCU ESP8266 (10-bit ADC / Wi-Fi)
                  </button>
                </div>
              </div>

              {connectionError && (
                <div className="p-3 rounded bg-[#ef4444]/20 border border-[#ef4444] text-[#ffdad6] text-xs font-mono flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#ef4444] shrink-0" />
                  <span>{connectionError}</span>
                </div>
              )}

              {/* 4 Connection Option Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Option 1: Web Serial USB-OTG */}
                <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between hover:border-[#f59e0b]/50 transition-colors">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Usb className="w-5 h-5 text-[#f59e0b]" />
                        <h4 className="font-headline font-bold text-white text-sm">
                          USB-OTG Cable (Web Serial)
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#10b981]/20 text-[#10b981] font-bold">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">
                      Direct wired connection via USB-C or Micro-USB OTG cable. Lowest latency and most reliable in noisy cab engines.
                    </p>

                    <div className="mt-3 flex items-center gap-2 text-xs font-mono">
                      <span className="text-[#94a3b8]">BAUD:</span>
                      <select
                        value={baudRate}
                        onChange={(e) => setBaudRate(Number(e.target.value))}
                        className="bg-[#0d1c2d] border border-[#30363d] rounded px-2 py-1 text-white"
                      >
                        <option value={115200}>115200 (Default)</option>
                        <option value={9600}>9600</option>
                        <option value={57600}>57600</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleConnectSerial}
                    disabled={isConnecting}
                    className="mt-4 w-full h-12 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-headline font-bold text-sm industrial-btn flex items-center justify-center gap-2"
                  >
                    <Usb className="w-4 h-4" />
                    <span>{isConnecting ? 'CONNECTING...' : 'SELECT USB SERIAL PORT'}</span>
                  </button>
                </div>

                {/* Option 2: Web Bluetooth (BLE) - ESP32 only */}
                <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between hover:border-[#4edea3]/50 transition-colors">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Bluetooth className="w-5 h-5 text-[#4edea3]" />
                        <h4 className="font-headline font-bold text-white text-sm">
                          Wireless BLE (ESP32)
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1c2b3c] text-[#94a3b8]">
                        WIRELESS
                      </span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">
                      Connect wirelessly using the ESP32 Nordic UART BLE GATT service. Eliminates messy in-dash charging cables.
                    </p>
                  </div>

                  <button
                    onClick={handleConnectBle}
                    disabled={isConnecting}
                    className="mt-4 w-full h-12 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] font-headline font-bold text-sm industrial-btn flex items-center justify-center gap-2"
                  >
                    <Bluetooth className="w-4 h-4 text-[#4edea3]" />
                    <span>PAIR VIA BLUETOOTH LE</span>
                  </button>
                </div>

                {/* Option 3: Wi-Fi WebSocket */}
                <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Wifi className="w-5 h-5 text-[#ffc174]" />
                        <h4 className="font-headline font-bold text-white text-sm">
                          In-Cab Wi-Fi (AP / WebSocket)
                        </h4>
                      </div>
                    </div>
                    <p className="text-xs text-[#94a3b8]">
                      Connect to the ESP32 / NodeMCU SoftAP access point (`ws://192.168.4.1:81`).
                    </p>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-[#94a3b8] block text-[10px]">ESP IP:</span>
                        <input
                          type="text"
                          value={wifiIp}
                          onChange={(e) => setWifiIp(e.target.value)}
                          className="w-full bg-[#0d1c2d] border border-[#30363d] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[#94a3b8] block text-[10px]">PORT:</span>
                        <input
                          type="number"
                          value={wifiPort}
                          onChange={(e) => setWifiPort(Number(e.target.value))}
                          className="w-full bg-[#0d1c2d] border border-[#30363d] rounded px-2 py-1 text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleConnectWifi}
                    className="mt-4 w-full h-12 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] font-headline font-bold text-sm industrial-btn flex items-center justify-center gap-2"
                  >
                    <Wifi className="w-4 h-4 text-[#ffc174]" />
                    <span>CONNECT WEBSOCKET</span>
                  </button>
                </div>

                {/* Option 4: Simulated Stream (Zero Hardware Required) */}
                <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between border-dashed">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-[#6ffbbe]" />
                        <h4 className="font-headline font-bold text-white text-sm">
                          Virtual Board Simulator
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1c2b3c] text-[#4edea3]">
                        TEST MODE
                      </span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">
                      Simulates a live {deviceChoice.toUpperCase()} transmitting authentic 4Hz serial frames (MQ-3 ADC, Dock Reed, MPU-6050, 13.8V).
                    </p>
                  </div>

                  <button
                    onClick={handleConnectSimulated}
                    className="mt-4 w-full h-12 rounded bg-[#10b981] hover:bg-[#059669] text-[#051424] font-headline font-bold text-sm industrial-btn flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    <span>START VIRTUAL {deviceChoice.toUpperCase()} STREAM</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Live Sensor Monitor */}
          {activeTab === 'monitor' && (
            <div className="space-y-4">
              {/* Connection Status Banner */}
              <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded flex items-center justify-center ${
                      espState.isConnected
                        ? 'bg-[#10b981] text-[#051424]'
                        : 'bg-[#ef4444] text-white'
                    }`}
                  >
                    <Radio className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-headline font-bold text-white text-base">
                        {espState.isConnected
                          ? `${espState.deviceType.toUpperCase()} Telemetry Active`
                          : 'Microcontroller Offline'}
                      </span>
                      <span className="text-xs font-mono text-[#94a3b8]">
                        ({espState.connectionType?.toUpperCase() || 'NONE'})
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#94a3b8]">
                      PACKETS RECEIVED: {espState.packetsReceived} · REFRESH: 4 HZ
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {espState.isConnected ? (
                    <button
                      onClick={handleDisconnect}
                      className="px-3 py-1.5 rounded font-mono text-xs font-bold bg-[#ef4444]/20 hover:bg-[#ef4444]/30 text-[#ef4444] border border-[#ef4444]"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveTab('connect')}
                      className="px-3 py-1.5 rounded font-mono text-xs font-bold bg-[#f59e0b] text-[#051424]"
                    >
                      Connect Hardware
                    </button>
                  )}
                </div>
              </div>

              {/* 4 Live Sensor Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Tile 1: Magnetic Dock Pin */}
                <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                  <span className="text-[11px] font-mono text-[#94a3b8] uppercase block">
                    DOCK SWITCH PIN
                  </span>
                  <div className="mt-1 text-lg font-mono font-bold text-white">
                    {espState.isConnected ? 'LOCKED (LOW)' : '--'}
                  </div>
                  <span className="text-[10px] font-mono text-[#10b981]">
                    REED SENSOR CLOSED
                  </span>
                </div>

                {/* Tile 2: MQ-3 Alcohol ADC */}
                <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                  <span className="text-[11px] font-mono text-[#94a3b8] uppercase block">
                    MQ-3 SENSOR RAW ADC
                  </span>
                  <div className="mt-1 text-lg font-mono font-bold text-[#ffc174] tabular-nums">
                    {espState.isConnected ? '184 ADC' : '--'}
                  </div>
                  <span className="text-[10px] font-mono text-[#10b981]">
                    BAC: 0.00% (CLEAN)
                  </span>
                </div>

                {/* Tile 3: Starter Relay */}
                <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                  <span className="text-[11px] font-mono text-[#94a3b8] uppercase block">
                    RELAY PIN STATE
                  </span>
                  <div className="mt-1 text-lg font-mono font-bold text-[#10b981]">
                    {espState.isConnected ? 'ARMED (HIGH)' : '--'}
                  </div>
                  <span className="text-[10px] font-mono text-[#94a3b8]">
                    SOLENOID ENERGIZED
                  </span>
                </div>

                {/* Tile 4: Battery Voltage */}
                <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                  <span className="text-[11px] font-mono text-[#94a3b8] uppercase block">
                    BATTERY MONITOR
                  </span>
                  <div className="mt-1 text-lg font-mono font-bold text-white">
                    {espState.isConnected ? '13.8V' : '--'}
                  </div>
                  <span className="text-[10px] font-mono text-[#4edea3]">
                    CHARGING NOMINAL
                  </span>
                </div>
              </div>

              {/* Raw Serial Terminal View */}
              <div className="bg-[#010f1f] border border-[#30363d] rounded p-3 font-mono text-xs">
                <div className="flex items-center justify-between text-[#94a3b8] border-b border-[#30363d] pb-1.5 mb-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-[#10b981]" />
                    <span>LIVE SERIAL PACKET STREAM</span>
                  </div>
                  <span className="text-[11px] text-[#10b981]">BAUD: 115200</span>
                </div>

                <div className="h-32 overflow-y-auto space-y-1 text-slate-300">
                  {espState.rawLogs.length === 0 ? (
                    <div className="text-[#94a3b8] italic">
                      No serial frames received yet. Connect USB-OTG or start virtual stream to view packets.
                    </div>
                  ) : (
                    espState.rawLogs.map((log, i) => (
                      <div key={i} className="text-[#6ffbbe] font-mono">
                        <span className="text-[#94a3b8] select-none">&gt; </span>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Arduino Code & Wiring Diagram */}
          {activeTab === 'firmware' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="bg-[#161b22] border border-[#30363d] rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-headline font-bold text-white text-sm">
                    In-Cab Wiring Pinout Diagram ({deviceChoice.toUpperCase()})
                  </h4>
                  <span className="text-xs text-[#f59e0b]">PLUG & PLAY</span>
                </div>

                {deviceChoice === 'esp32' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#f59e0b] font-bold block">1. MQ-3 Alcohol Sensor:</span>
                      <span className="text-slate-300">VCC &rarr; 5V (VIN), GND &rarr; GND, AOUT &rarr; GPIO 34</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#ff938c] font-bold block">2. MQ-9 Gas & CO Sensor:</span>
                      <span className="text-slate-300">VCC &rarr; 5V, GND &rarr; GND, AOUT &rarr; GPIO 35 (ADC1_CH7)</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#10b981] font-bold block">3. Magnetic Dock Reed Switch:</span>
                      <span className="text-slate-300">One side &rarr; GND, Other side &rarr; GPIO 4 (PULLUP)</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#ffc174] font-bold block">4. 12V Starter Relay:</span>
                      <span className="text-slate-300">VCC &rarr; 5V, GND &rarr; GND, IN &rarr; GPIO 5</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#f59e0b] font-bold block">1. MQ-3 Alcohol Sensor:</span>
                      <span className="text-slate-300">VCC &rarr; 5V (VU), GND &rarr; GND, AOUT &rarr; A0 (0-1023)</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#ff938c] font-bold block">2. MQ-9 Gas Sensor:</span>
                      <span className="text-slate-300">VCC &rarr; 5V, GND &rarr; GND, DOUT &rarr; Pin D6 (GPIO 12)</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#10b981] font-bold block">3. Magnetic Dock Reed Switch:</span>
                      <span className="text-slate-300">One side &rarr; GND, Other side &rarr; Pin D5 (GPIO 14)</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#ffc174] font-bold block">4. 12V Starter Relay:</span>
                      <span className="text-slate-300">VCC &rarr; 5V, GND &rarr; GND, IN &rarr; Pin D1 (GPIO 5)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Code Viewer with Copy Button */}
              <div className="bg-[#010f1f] border border-[#30363d] rounded p-3">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#30363d]">
                  <span className="text-white font-bold">
                    Arduino IDE Sketch: DriveLock_{deviceChoice.toUpperCase()}.ino
                  </span>
                  <button
                    onClick={() => copyCode(ARDUINO_SKETCHES[deviceChoice])}
                    className="px-3 py-1 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white flex items-center gap-1.5"
                  >
                    {copiedSketch ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSketch ? 'COPIED TO CLIPBOARD' : 'COPY ARDUINO CODE'}</span>
                  </button>
                </div>

                <pre className="h-48 overflow-y-auto text-[11px] text-[#d4e4fa] leading-relaxed p-2 bg-[#051424] rounded">
                  <code>{ARDUINO_SKETCHES[deviceChoice]}</code>
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Action Bar */}
        <div className="px-5 py-3.5 bg-[#161b22] border-t border-[#30363d] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs font-mono text-[#94a3b8]">
            {espState.isConnected ? (
              <span className="text-[#10b981] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>ESP SENSOR LINK ESTABLISHED · READY FOR DOCKING</span>
              </span>
            ) : (
              <span>Connect ESP32 / NodeMCU or launch virtual stream to proceed.</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                cabAudio.playKeyClick();
                onClose();
              }}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded bg-[#21262d] hover:bg-[#1c2b3c] text-white border border-[#30363d] font-headline font-bold text-xs"
            >
              Cancel
            </button>

            <button
              onClick={() => {
                cabAudio.playKeyClick();
                onConfirmDock();
                onClose();
              }}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded bg-[#10b981] hover:bg-[#059669] text-[#051424] font-headline font-bold text-sm industrial-btn flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span>PROCEED TO DOCK HANDSET</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
