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
  Zap,
  Radio,
  FileCode,
  ExternalLink
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
  const [deviceChoice, setDeviceChoice] = useState<EspDeviceType>('esp32s3');
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [wifiIp, setWifiIp] = useState<string>('192.168.4.1');
  const [wifiPort, setWifiPort] = useState<number>(80);
  const [copiedSketch, setCopiedSketch] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

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
        setConnectionError('No USB serial/OTG port selected. Make sure your USB-OTG cable is connected.');
      }
    } catch (e: any) {
      const msg = e.message || 'USB connection failed';
      if (msg.toLowerCase().includes('permissions policy') || msg.toLowerCase().includes('disallowed')) {
        setConnectionError(
          'Browser iframe blocked USB access. Tap "OPEN DIRECT URL" below to use USB-OTG & Bluetooth directly in Chrome.'
        );
      } else {
        setConnectionError(msg);
      }
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
      const msg = e.message || 'Web Bluetooth connection failed';
      if (msg.toLowerCase().includes('permissions policy') || msg.toLowerCase().includes('disallowed')) {
        setConnectionError(
          'Browser iframe blocked Bluetooth access. Tap "OPEN DIRECT URL" below to pair with "DriveLock-S3".'
        );
      } else {
        setConnectionError(msg);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectWifi = () => {
    cabAudio.playKeyClick();
    setConnectionError('');
    const ok = espManager.connectWifi(wifiIp, wifiPort);
    if (ok) {
      cabAudio.playSuccessChime();
      setActiveTab('monitor');
    } else {
      setConnectionError('Failed to initiate Wi-Fi connection.');
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

  const boardLabel =
    deviceChoice === 'esp32s3'
      ? 'ESP32-S3'
      : deviceChoice === 'esp32'
      ? 'Classic ESP32'
      : 'NodeMCU ESP8266';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-6 bg-black/85 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#0d1c2d] border-2 border-[#30363d] rounded-lg shadow-2xl overflow-hidden my-auto flex flex-col max-h-[94vh]">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-[#161b22] border-b border-[#30363d]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#f59e0b] text-[#051424] flex items-center justify-center font-bold shrink-0">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-lg font-headline font-bold text-white tracking-tight">
                  ESP32-S3 Hardware Link (USB · BLE · Wi-Fi)
                </h3>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                    espState.isConnected
                      ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                      : 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]'
                  }`}
                >
                  {espState.isConnected ? 'STREAMING ACTIVE' : 'DISCONNECTED'}
                </span>
              </div>
              <p className="text-[11px] font-mono text-[#94a3b8]">
                ESP32-S3 PINS: MQ-3 (GPIO 4) · MQ-9 (GPIO 5) · KNOCK (GPIO 13) · FLAME (GPIO 14 &amp; 6)
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
            <span>1. CONNECT</span>
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
            <span>2. MONITOR</span>
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
            <span>3. ESP32-S3 CODE</span>
          </button>
        </div>

        {/* Body Container */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: Connect Modes */}
          {activeTab === 'connect' && (
            <div className="space-y-4">
              {/* Step 1 Banner: Flash ESP32-S3 Code */}
              <div className="p-3 rounded bg-[#1c2b3c] border border-[#f59e0b]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs font-mono text-[#d4e4fa]">
                  <span className="text-[#f59e0b] font-bold">ESP32-S3 READY: </span>
                  Get the dedicated <span className="text-white font-bold">ESP32-S3 Sketch</span> in Tab 3 (uses ADC1{' '}
                  <span className="text-[#4edea3]">GPIO 4, 5, 6</span> &amp; Digital{' '}
                  <span className="text-[#38bdf8]">GPIO 13, 14, 12</span> + BLE <span className="text-white">"DriveLock-S3"</span> + Wi-Fi <span className="text-white">"DriveLock-ESP"</span>).
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('firmware')}
                  className="px-3 py-1.5 rounded bg-[#f59e0b] text-[#051424] font-headline font-bold text-xs shrink-0"
                >
                  VIEW ESP32-S3 CODE
                </button>
              </div>

              {/* Direct Standalone Tab Link if inside Preview Iframe */}
              {isInIframe && (
                <div className="p-2.5 rounded bg-[#161b22] border border-[#38bdf8]/50 flex items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-[#94a3b8]">
                    Using USB-OTG or Bluetooth on phone? Open outside preview frame:
                  </span>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded bg-[#38bdf8] text-[#051424] font-bold flex items-center gap-1 shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>OPEN DIRECT URL</span>
                  </a>
                </div>
              )}

              {/* Board Selector */}
              <div className="bg-[#161b22] border border-[#30363d] rounded p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-mono font-bold text-white block">
                    SELECT BOARD ARCHITECTURE:
                  </span>
                  <span className="text-[11px] font-mono text-[#94a3b8]">
                    ESP32-S3 uses GPIO 4, 5, 6 (ADC1) &amp; GPIO 12, 13, 14.
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => {
                      cabAudio.playKeyClick();
                      setDeviceChoice('esp32s3');
                    }}
                    className={`px-3 py-1.5 rounded font-mono text-xs font-bold transition-colors ${
                      deviceChoice === 'esp32s3'
                        ? 'bg-[#f59e0b] text-[#051424]'
                        : 'bg-[#21262d] text-[#94a3b8] border border-[#30363d] hover:text-white'
                    }`}
                  >
                    ESP32-S3 (Recommended)
                  </button>

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
                    Classic ESP32
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
                    NodeMCU ESP8266
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
                {/* Option 1: USB-OTG (Web Serial + Android WebUSB) */}
                <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between hover:border-[#f59e0b]/50 transition-colors">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Usb className="w-5 h-5 text-[#f59e0b]" />
                        <h4 className="font-headline font-bold text-white text-sm">
                          1. USB-C OTG Cable (ESP32-S3 USB / UART)
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#10b981]/20 text-[#10b981] font-bold">
                        WIRED OTG
                      </span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">
                      Plug ESP32-S3 into your phone via USB-C OTG. Supports both the ESP32-S3 Native <span className="text-white font-mono">USB</span> port (CDC) and <span className="text-white font-mono">UART</span> port (CH343/CP2102).
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
                    className="mt-4 w-full h-11 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-headline font-bold text-xs sm:text-sm industrial-btn flex items-center justify-center gap-2"
                  >
                    <Usb className="w-4 h-4" />
                    <span>{isConnecting ? 'OPENING USB...' : 'CONNECT USB-OTG PORT'}</span>
                  </button>
                </div>

                {/* Option 2: Web Bluetooth (BLE) */}
                <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between hover:border-[#4edea3]/50 transition-colors">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Bluetooth className="w-5 h-5 text-[#4edea3]" />
                        <h4 className="font-headline font-bold text-white text-sm">
                          2. Bluetooth LE ("DriveLock-S3")
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1c2b3c] text-[#4edea3]">
                        ESP32-S3 BLE 5.0
                      </span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">
                      Pairs wirelessly with <span className="text-white font-mono">DriveLock-S3</span> using ESP32-S3 Bluetooth 5.0 LE. Turn on phone Bluetooth &amp; Location, then tap below.
                    </p>
                  </div>

                  <button
                    onClick={handleConnectBle}
                    disabled={isConnecting}
                    className="mt-4 w-full h-11 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#4edea3]/50 font-headline font-bold text-xs sm:text-sm industrial-btn flex items-center justify-center gap-2"
                  >
                    <Bluetooth className="w-4 h-4 text-[#4edea3]" />
                    <span>PAIR BLUETOOTH ("DriveLock-S3")</span>
                  </button>
                </div>

                {/* Option 3: Wi-Fi Hotspot ("DriveLock-ESP") */}
                <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Wifi className="w-5 h-5 text-[#ffc174]" />
                        <h4 className="font-headline font-bold text-white text-sm">
                          3. Wi-Fi AP ("DriveLock-ESP")
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1c2b3c] text-[#ffc174]">
                        PASS: 12345678
                      </span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">
                      Connect phone Wi-Fi to <span className="text-white font-mono">DriveLock-ESP</span> (Password: <span className="text-white font-mono">12345678</span>). Polls <span className="text-white font-mono">http://192.168.4.1/telemetry</span> on Port 80.
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
                        <span className="text-[#94a3b8] block text-[10px]">PORT (80=HTTP):</span>
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
                    className="mt-4 w-full h-11 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#ffc174]/50 font-headline font-bold text-xs sm:text-sm industrial-btn flex items-center justify-center gap-2"
                  >
                    <Wifi className="w-4 h-4 text-[#ffc174]" />
                    <span>CONNECT WI-FI ({wifiIp}:{wifiPort})</span>
                  </button>
                </div>

                {/* Option 4: Simulated Stream (Zero Hardware Required) */}
                <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between border-dashed">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-[#6ffbbe]" />
                        <h4 className="font-headline font-bold text-white text-sm">
                          4. Virtual {boardLabel} Simulator
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1c2b3c] text-[#4edea3]">
                        INSTANT TEST
                      </span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">
                      Simulates a live {boardLabel} streaming 4Hz JSON frames for MQ-3 Alcohol, KY-031 Knock/Tap, KY-026 Flame, and MQ-9 Gas.
                    </p>
                  </div>

                  <button
                    onClick={handleConnectSimulated}
                    className="mt-4 w-full h-11 rounded bg-[#10b981] hover:bg-[#059669] text-[#051424] font-headline font-bold text-xs sm:text-sm industrial-btn flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    <span>START VIRTUAL {boardLabel.toUpperCase()}</span>
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
                          ? `${boardLabel} Telemetry Active`
                          : 'Microcontroller Offline'}
                      </span>
                      <span className="text-xs font-mono text-[#94a3b8]">
                        ({espState.connectionType?.toUpperCase() || 'NONE'})
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#94a3b8]">
                      PACKETS RECEIVED: {espState.packetsReceived} · RATE: 4 HZ
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {espState.isConnected && (
                    <>
                      <button
                        type="button"
                        onClick={() => espManager.sendCommand('RELAY:1')}
                        className="px-2.5 py-1.5 rounded font-mono text-xs font-bold bg-[#10b981]/20 text-[#10b981] border border-[#10b981]"
                      >
                        RELAY ON
                      </button>
                      <button
                        type="button"
                        onClick={() => espManager.sendCommand('RELAY:0')}
                        className="px-2.5 py-1.5 rounded font-mono text-xs font-bold bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]"
                      >
                        RELAY OFF
                      </button>
                    </>
                  )}
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
                <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                  <span className="text-[11px] font-mono text-[#94a3b8] uppercase block">
                    1. MQ-3 ALCOHOL
                  </span>
                  <div className="mt-1 text-lg font-mono font-bold text-[#ffc174] tabular-nums">
                    {espState.isConnected ? 'ACTIVE' : '--'}
                  </div>
                  <span className="text-[10px] font-mono text-[#10b981]">
                    S3: GPIO 4 (ADC1)
                  </span>
                </div>

                <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                  <span className="text-[11px] font-mono text-[#94a3b8] uppercase block">
                    2. KNOCK / TAP (KY-031)
                  </span>
                  <div className="mt-1 text-lg font-mono font-bold text-[#38bdf8]">
                    {espState.isConnected ? 'ARMED' : '--'}
                  </div>
                  <span className="text-[10px] font-mono text-[#10b981]">
                    S3: GPIO 13
                  </span>
                </div>

                <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                  <span className="text-[11px] font-mono text-[#94a3b8] uppercase block">
                    3. FLAME (KY-026)
                  </span>
                  <div className="mt-1 text-lg font-mono font-bold text-[#10b981]">
                    {espState.isConnected ? 'MONITORING' : '--'}
                  </div>
                  <span className="text-[10px] font-mono text-[#94a3b8]">
                    S3: GPIO 14 &amp; GPIO 6
                  </span>
                </div>

                <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                  <span className="text-[11px] font-mono text-[#94a3b8] uppercase block">
                    4. MQ-9 GAS &amp; RELAY
                  </span>
                  <div className="mt-1 text-lg font-mono font-bold text-white">
                    {espState.isConnected ? 'ONLINE' : '--'}
                  </div>
                  <span className="text-[10px] font-mono text-[#4edea3]">
                    S3: GPIO 5 &amp; GPIO 12
                  </span>
                </div>
              </div>

              {/* Raw Serial Terminal View */}
              <div className="bg-[#010f1f] border border-[#30363d] rounded p-3 font-mono text-xs">
                <div className="flex items-center justify-between text-[#94a3b8] border-b border-[#30363d] pb-1.5 mb-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-[#10b981]" />
                    <span>LIVE PACKET STREAM (USB / BLE / WI-FI)</span>
                  </div>
                  <span className="text-[11px] text-[#10b981]">BAUD: 115200</span>
                </div>

                <div className="h-36 overflow-y-auto space-y-1 text-slate-300">
                  {espState.rawLogs.length === 0 ? (
                    <div className="text-[#94a3b8] italic">
                      No packets received yet. Connect via USB-OTG, Bluetooth ("DriveLock-S3"), Wi-Fi ("DriveLock-ESP"), or start Virtual Stream.
                    </div>
                  ) : (
                    espState.rawLogs.map((log, i) => (
                      <div key={i} className="text-[#6ffbbe] font-mono break-all">
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
              {/* Board switcher inside Tab 3 */}
              <div className="flex items-center justify-between gap-2 flex-wrap bg-[#161b22] p-2.5 rounded border border-[#30363d]">
                <span className="text-white font-bold">SELECT BOARD SKETCH:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDeviceChoice('esp32s3')}
                    className={`px-3 py-1 rounded font-bold ${
                      deviceChoice === 'esp32s3'
                        ? 'bg-[#f59e0b] text-[#051424]'
                        : 'bg-[#0d1c2d] text-[#94a3b8] border border-[#30363d]'
                    }`}
                  >
                    ESP32-S3
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeviceChoice('esp32')}
                    className={`px-3 py-1 rounded font-bold ${
                      deviceChoice === 'esp32'
                        ? 'bg-[#f59e0b] text-[#051424]'
                        : 'bg-[#0d1c2d] text-[#94a3b8] border border-[#30363d]'
                    }`}
                  >
                    Classic ESP32
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeviceChoice('nodemcu')}
                    className={`px-3 py-1 rounded font-bold ${
                      deviceChoice === 'nodemcu'
                        ? 'bg-[#f59e0b] text-[#051424]'
                        : 'bg-[#0d1c2d] text-[#94a3b8] border border-[#30363d]'
                    }`}
                  >
                    NodeMCU
                  </button>
                </div>
              </div>

              {deviceChoice === 'esp32s3' && (
                <div className="p-3 rounded bg-[#1c2b3c] border border-[#38bdf8] text-[#d4e4fa] space-y-1">
                  <div className="text-[#38bdf8] font-bold">
                    IMPORTANT ARDUINO IDE SETTINGS FOR ESP32-S3:
                  </div>
                  <div>
                    1. Tools &rarr; Board: <span className="text-white font-bold">"ESP32S3 Dev Module"</span>
                  </div>
                  <div>
                    2. Tools &rarr; USB CDC On Boot: <span className="text-[#10b981] font-bold">"Enabled"</span> (Required for USB-C serial output!)
                  </div>
                  <div>
                    3. Tools &rarr; Partition Scheme: <span className="text-[#ffc174] font-bold">"Huge APP (3MB No OTA/1MB SPIFFS)"</span> (Required so Wi-Fi + BLE fit!)
                  </div>
                </div>
              )}

              <div className="bg-[#161b22] border border-[#30363d] rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-headline font-bold text-white text-sm">
                    Wiring Pinout Diagram ({boardLabel} — NO REED SWITCH)
                  </h4>
                  <span className="text-xs text-[#10b981] font-bold">USB + BLE + WI-FI</span>
                </div>

                {deviceChoice === 'esp32s3' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#f59e0b] font-bold block">1. MQ-3 Alcohol Sensor:</span>
                      <span className="text-slate-300">VCC &rarr; 5V, GND &rarr; GND, AOUT &rarr; <strong className="text-white">GPIO 4</strong> (ADC1_CH3)</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#ff938c] font-bold block">2. MQ-9 Gas &amp; CO Sensor:</span>
                      <span className="text-slate-300">VCC &rarr; 5V, GND &rarr; GND, AOUT &rarr; <strong className="text-white">GPIO 5</strong> (ADC1_CH4)</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#38bdf8] font-bold block">3. Knock / Tap Sensor (KY-031):</span>
                      <span className="text-slate-300">VCC &rarr; 3.3V/5V, GND &rarr; GND, DOUT (S) &rarr; <strong className="text-white">GPIO 13</strong></span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#ef4444] font-bold block">4. Flame Sensor (KY-026 IR):</span>
                      <span className="text-slate-300">VCC &rarr; 3.3V/5V, GND &rarr; GND, DOUT &rarr; <strong className="text-white">GPIO 14</strong>, AOUT &rarr; <strong className="text-white">GPIO 6</strong></span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d] sm:col-span-2">
                      <span className="text-[#ffc174] font-bold block">5. 12V Starter Immobilizer Relay:</span>
                      <span className="text-slate-300">VCC &rarr; 5V, GND &rarr; GND, IN &rarr; <strong className="text-white">GPIO 12</strong> (HIGH = Armed, LOW = Cut-Off)</span>
                    </div>
                  </div>
                ) : deviceChoice === 'esp32' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#f59e0b] font-bold block">1. MQ-3 Alcohol Sensor:</span>
                      <span className="text-slate-300">VCC &rarr; 5V (VIN), GND &rarr; GND, AOUT &rarr; GPIO 34</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#38bdf8] font-bold block">2. Knock / Tap Sensor (KY-031):</span>
                      <span className="text-slate-300">VCC &rarr; 3.3V/5V, GND &rarr; GND, DOUT (S) &rarr; GPIO 27</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#ef4444] font-bold block">3. Flame Sensor (KY-026 IR):</span>
                      <span className="text-slate-300">VCC &rarr; 3.3V/5V, GND &rarr; GND, DOUT &rarr; GPIO 26, AOUT &rarr; GPIO 32</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#ff938c] font-bold block">4. MQ-9 Gas &amp; CO Sensor:</span>
                      <span className="text-slate-300">VCC &rarr; 5V, GND &rarr; GND, AOUT &rarr; GPIO 35</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d] sm:col-span-2">
                      <span className="text-[#ffc174] font-bold block">5. 12V Starter Immobilizer Relay:</span>
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
                      <span className="text-[#38bdf8] font-bold block">2. Knock / Tap Sensor (KY-031):</span>
                      <span className="text-slate-300">VCC &rarr; 3.3V, GND &rarr; GND, DOUT (S) &rarr; Pin D2 (GPIO 4)</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#ef4444] font-bold block">3. Flame Sensor (KY-026 IR):</span>
                      <span className="text-slate-300">VCC &rarr; 3.3V, GND &rarr; GND, DOUT &rarr; Pin D7 (GPIO 13)</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d]">
                      <span className="text-[#ff938c] font-bold block">4. MQ-9 Gas Sensor:</span>
                      <span className="text-slate-300">VCC &rarr; 5V, GND &rarr; GND, DOUT &rarr; Pin D6 (GPIO 12)</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#0d1c2d] border border-[#30363d] sm:col-span-2">
                      <span className="text-[#ffc174] font-bold block">5. 12V Starter Immobilizer Relay:</span>
                      <span className="text-slate-300">VCC &rarr; 5V, GND &rarr; GND, IN &rarr; Pin D1 (GPIO 5)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Code Viewer with Copy Button */}
              <div className="bg-[#010f1f] border border-[#30363d] rounded p-3">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#30363d]">
                  <span className="text-white font-bold">
                    Arduino IDE Sketch: DriveLock_{deviceChoice.toUpperCase()}_AllInOne.ino
                  </span>
                  <button
                    onClick={() => copyCode(ARDUINO_SKETCHES[deviceChoice])}
                    className="px-3 py-1.5 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-bold flex items-center gap-1.5"
                  >
                    {copiedSketch ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSketch ? 'COPIED TO CLIPBOARD!' : 'COPY ESP32-S3 CODE'}</span>
                  </button>
                </div>

                <pre className="h-56 overflow-y-auto text-[11px] text-[#d4e4fa] leading-relaxed p-2.5 bg-[#051424] rounded">
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
                <span>ESP32-S3 SENSOR LINK ACTIVE · STREAMING TO COCKPIT</span>
              </span>
            ) : (
              <span>Flash the ESP32-S3 sketch in Tab 3, then connect via USB-C, BLE ("DriveLock-S3"), or Wi-Fi.</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                cabAudio.playKeyClick();
                onConfirmDock();
                onClose();
              }}
              className="w-full sm:w-auto px-6 py-2.5 rounded bg-[#10b981] hover:bg-[#059669] text-[#051424] font-headline font-bold text-sm industrial-btn flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span>RETURN TO COCKPIT</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
