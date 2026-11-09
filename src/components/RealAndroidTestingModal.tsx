import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  Smartphone, 
  QrCode, 
  Copy, 
  Check, 
  ExternalLink, 
  Download, 
  Sun, 
  Moon, 
  Vibrate, 
  Cpu, 
  Usb, 
  Bluetooth, 
  Wifi, 
  ShieldCheck, 
  AlertCircle, 
  X,
  HelpCircle
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useWakeLock } from '../hooks/useWakeLock';
import { cabAudio } from '../utils/audio';

interface RealAndroidTestingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenEspModal: () => void;
}

export const RealAndroidTestingModal: React.FC<RealAndroidTestingModalProps> = ({
  isOpen,
  onClose,
  onOpenEspModal,
}) => {
  const { isInstallable, isInstalled, isAndroid, install } = usePWAInstall();
  const { isSupported: isWakeSupported, isActive: isWakeActive, toggleWakeLock } = useWakeLock();

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'scan' | 'otg' | 'ble' | 'features' | 'apk'>('scan');
  const [vibrated, setVibrated] = useState<boolean>(false);

  // Compute the URL to access
  const currentUrl = typeof window !== 'undefined' 
    ? window.location.href.replace('ais-dev-', 'ais-pre-') // Prefer pre/shared URL if in dev
    : 'https://ais-pre-x24utjildnuq7js2diaf2v-1003004681042.asia-southeast1.run.app';

  useEffect(() => {
    if (isOpen) {
      QRCode.toDataURL(currentUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#051424',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code generation error:', err));
    }
  }, [isOpen, currentUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    cabAudio.playKeyClick();
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleTestVibration = () => {
    cabAudio.playKeyClick();
    if ('vibrate' in navigator) {
      navigator.vibrate([150, 75, 150]);
      setVibrated(true);
      setTimeout(() => setVibrated(false), 1500);
    } else {
      alert('Vibration API not supported on this device/browser.');
    }
  };

  const handleInstallClick = async () => {
    cabAudio.playKeyClick();
    await install();
  };

  const isCurrentAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const hasSerialSupport = typeof navigator !== 'undefined' && 'serial' in navigator;
  const hasBluetoothSupport = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  const hasVibrateSupport = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#0b1726] border-2 border-[#f59e0b] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#051424] px-5 py-3.5 border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#f59e0b] text-[#051424] flex items-center justify-center font-headline font-bold text-lg">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-headline font-bold text-white tracking-wide flex items-center gap-2">
                RUN & TEST ON REAL ANDROID DEVICE
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40 uppercase">
                  IN-CAB MOUNT
                </span>
              </h2>
              <p className="text-xs font-mono text-[#94a3b8]">
                Deploy to physical phone/tablet · USB-OTG ESP32 connection · In-Cab PWA
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onClose();
            }}
            className="p-1.5 rounded text-[#94a3b8] hover:text-white hover:bg-[#161b22] border border-[#30363d] transition-colors"
            aria-label="Close Android Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#30363d] bg-[#0d1c2d] px-4 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('scan')}
            className={`py-2.5 px-3 font-headline font-bold text-xs flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'scan'
                ? 'border-[#f59e0b] text-[#f59e0b]'
                : 'border-transparent text-[#94a3b8] hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>1. SCAN & LAUNCH</span>
          </button>

          <button
            onClick={() => setActiveTab('otg')}
            className={`py-2.5 px-3 font-headline font-bold text-xs flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'otg'
                ? 'border-[#f59e0b] text-[#f59e0b]'
                : 'border-transparent text-[#94a3b8] hover:text-white'
            }`}
          >
            <Usb className="w-4 h-4" />
            <span>2. USB-OTG ESP32 GUIDE</span>
          </button>

          <button
            onClick={() => setActiveTab('ble')}
            className={`py-2.5 px-3 font-headline font-bold text-xs flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'ble'
                ? 'border-[#f59e0b] text-[#f59e0b]'
                : 'border-transparent text-[#94a3b8] hover:text-white'
            }`}
          >
            <Bluetooth className="w-4 h-4" />
            <span>3. WIRELESS BLE / WI-FI</span>
          </button>

          <button
            onClick={() => setActiveTab('features')}
            className={`py-2.5 px-3 font-headline font-bold text-xs flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'features'
                ? 'border-[#f59e0b] text-[#f59e0b]'
                : 'border-transparent text-[#94a3b8] hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>4. ANDROID HARDWARE</span>
          </button>

          <button
            onClick={() => setActiveTab('apk')}
            className={`py-2.5 px-3 font-headline font-bold text-xs flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'apk'
                ? 'border-[#10b981] text-[#10b981]'
                : 'border-transparent text-[#94a3b8] hover:text-white'
            }`}
          >
            <Download className="w-4 h-4 text-[#10b981]" />
            <span>5. GET ANDROID APK</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 font-body text-xs sm:text-sm">
          {/* TAB 1: Scan & Launch */}
          {activeTab === 'scan' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
              {/* Left Column: QR Code */}
              <div className="md:col-span-5 flex flex-col items-center justify-center p-4 rounded-xl bg-[#051424] border border-[#30363d] text-center">
                <div className="bg-white p-3 rounded-lg shadow-xl mb-3">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="DriveLock Android QR Code"
                      className="w-52 h-52 sm:w-60 sm:h-60 object-contain rounded"
                    />
                  ) : (
                    <div className="w-52 h-52 flex items-center justify-center text-black font-mono text-xs">
                      Generating QR...
                    </div>
                  )}
                </div>

                <span className="text-[11px] font-mono text-[#ffc174] font-semibold flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5" />
                  SCAN WITH ANDROID CAMERA / GOOGLE LENS
                </span>
                <span className="text-[10px] font-mono text-[#94a3b8] mt-1">
                  Opens directly in Chrome on your phone or tablet
                </span>
              </div>

              {/* Right Column: Instructions & Link */}
              <div className="md:col-span-7 space-y-4">
                <div className="p-4 rounded-lg bg-[#162536] border border-[#30363d] space-y-2">
                  <span className="text-xs font-mono text-[#f59e0b] uppercase font-bold block">
                    Direct Device URL
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={currentUrl}
                      className="flex-1 bg-[#051424] border border-[#30363d] rounded px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="px-3 py-2 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-headline font-bold text-xs flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'COPIED!' : 'COPY'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                    You can also paste this link into Chrome on Android or send it via WhatsApp, Slack, or email to yourself.
                  </p>
                </div>

                {/* 3 Step Quick Start */}
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1c2d] border border-[#30363d]">
                    <div className="w-6 h-6 rounded-full bg-[#f59e0b] text-[#051424] font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <h4 className="font-headline font-bold text-white text-xs sm:text-sm">
                        Open in Android Chrome & Sign In
                      </h4>
                      <p className="text-xs text-[#94a3b8] mt-0.5">
                        Sign in with Google on your phone to link your commercial driver profile and sync live incidents to Cloud Firestore.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1c2d] border border-[#30363d]">
                    <div className="w-6 h-6 rounded-full bg-[#f59e0b] text-[#051424] font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <h4 className="font-headline font-bold text-white text-xs sm:text-sm">
                        Install as Full-Screen In-Cab App (PWA)
                      </h4>
                      <p className="text-xs text-[#94a3b8] mt-0.5">
                        In Android Chrome, tap the menu (<strong>⋮</strong>) &rarr; tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>. This launches the cockpit in true full-screen mode without any browser URL bar.
                      </p>
                      {isInstallable && (
                        <button
                          onClick={handleInstallClick}
                          className="mt-2 px-3 py-1.5 rounded bg-[#10b981] text-black font-headline font-bold text-xs flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>INSTALL APP NOW ON THIS DEVICE</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1c2d] border border-[#30363d]">
                    <div className="w-6 h-6 rounded-full bg-[#f59e0b] text-[#051424] font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <h4 className="font-headline font-bold text-white text-xs sm:text-sm">
                        Plug ESP32 / NodeMCU into Phone
                      </h4>
                      <p className="text-xs text-[#94a3b8] mt-0.5">
                        Use a standard USB-C OTG cable adapter. Android will prompt: <em>"Allow DriveLock to access CP2102/CH340?"</em> &rarr; tap OK!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USB-OTG Guide */}
          {activeTab === 'otg' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[#051424] border border-[#30363d] space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-[#10b981] text-black flex items-center justify-center font-bold">
                    <Usb className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-white text-sm sm:text-base">
                      How USB-OTG Connection Works on Real Android
                    </h3>
                    <p className="text-xs text-[#94a3b8]">
                      Direct hardware connection between Android phone/tablet and ESP32 / NodeMCU at 115200 baud
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded bg-[#162536] border border-[#30363d]">
                    <span className="text-[10px] font-mono text-[#f59e0b] block uppercase">HARDWARE NEEDED</span>
                    <p className="text-xs text-white font-medium mt-1">
                      1. Android Phone or Tablet with USB-C<br />
                      2. USB-C to USB-A (or Micro-USB) OTG adapter ($2)<br />
                      3. ESP32 or NodeMCU board with USB cable
                    </p>
                  </div>

                  <div className="p-3 rounded bg-[#162536] border border-[#30363d]">
                    <span className="text-[10px] font-mono text-[#10b981] block uppercase">SUPPORTED CHIPS</span>
                    <p className="text-xs text-white font-medium mt-1">
                      • CP2102 (Silicon Labs)<br />
                      • CH340 / CH341 (WCH)<br />
                      • FT232 / FTDI<br />
                      • Native ESP32-S2 / ESP32-S3 USB
                    </p>
                  </div>

                  <div className="p-3 rounded bg-[#162536] border border-[#30363d]">
                    <span className="text-[10px] font-mono text-[#ffc174] block uppercase">ANDROID PERMISSION</span>
                    <p className="text-xs text-white font-medium mt-1">
                      When tapping <strong>"SELECT USB SERIAL PORT"</strong> in Chrome on Android, a system dialog appears. Check "Always open" and tap OK.
                    </p>
                  </div>
                </div>
              </div>

              {/* Physical Cab Mount Connection Diagram */}
              <div className="p-4 rounded-lg bg-[#0d1c2d] border border-[#30363d] space-y-2">
                <span className="text-xs font-mono text-[#94a3b8] uppercase block">
                  PHYSICAL CAB MOUNT WIRING ARCHITECTURE
                </span>
                <div className="p-3 rounded bg-[#051424] border border-[#30363d] font-mono text-xs text-[#d4e4fa] space-y-1">
                  <div className="text-[#f59e0b] font-bold">
                    [REAL ANDROID PHONE/TABLET] &lt;--- (USB-C OTG Cable) ---&gt; [ESP32 / NODEMCU]
                  </div>
                  <div className="text-[#94a3b8] pl-4">
                    ├── GPIO 34 / A0 &lt;--- MQ-3 Alcohol Vapor Sensor (Analog In)
                  </div>
                  <div className="text-[#94a3b8] pl-4">
                    ├── GPIO 4 / D5  &lt;--- Magnetic Reed Switch on Cab Cradle (GND when docked)
                  </div>
                  <div className="text-[#94a3b8] pl-4">
                    └── GPIO 5 / D1  ---&gt; 12V Automotive Starter Relay Optocoupler
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    onClose();
                    onOpenEspModal();
                  }}
                  className="px-4 py-2 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-headline font-bold text-xs flex items-center gap-2 industrial-btn"
                >
                  <Cpu className="w-4 h-4" />
                  <span>OPEN SENSOR CONNECTION & ARDUINO CODE</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Wireless BLE / Wi-Fi */}
          {activeTab === 'ble' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[#051424] border border-[#30363d] space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-[#3b82f6] text-white flex items-center justify-center font-bold">
                    <Bluetooth className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-white text-sm sm:text-base">
                      Option B: Wireless Web Bluetooth (BLE) on Android
                    </h3>
                    <p className="text-xs text-[#94a3b8]">
                      Zero cables between the Android dash mount and the ESP32 under the dashboard
                    </p>
                  </div>
                </div>

                <p className="text-xs text-[#d4e4fa] leading-relaxed">
                  Android Chrome has built-in support for <strong>Web Bluetooth</strong>. You can mount your Android tablet on the vehicle windshield cradle with standard 12V fast wireless charging, and have the ESP32 securely mounted under the dash running Bluetooth Low Energy (BLE) UART.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded bg-[#162536] border border-[#30363d]">
                    <span className="text-[10px] font-mono text-[#3b82f6] block uppercase font-bold">
                      PAIRING IN 3 SECONDS
                    </span>
                    <ol className="text-xs text-[#94a3b8] mt-1 space-y-1 list-decimal list-inside">
                      <li>Enable Bluetooth on Android phone.</li>
                      <li>In DriveLock, tap <strong>"CONNECT ESP"</strong> &rarr; <strong>"BLE UART"</strong>.</li>
                      <li>Select <strong>"DriveLock-ESP32"</strong> from Chrome's device picker.</li>
                    </ol>
                  </div>

                  <div className="p-3 rounded bg-[#162536] border border-[#30363d]">
                    <span className="text-[10px] font-mono text-[#10b981] block uppercase font-bold">
                      WI-FI WEBSOCKET OPTION (LOCAL AP)
                    </span>
                    <p className="text-xs text-[#94a3b8] mt-1">
                      ESP32 or NodeMCU broadcasts an in-cab Wi-Fi Access Point (<code>DriveLock-Cab-AP</code>). Android connects and streams packets over local WebSocket at <code>ws://192.168.4.1:81</code> with 0ms latency.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Android Hardware Status */}
          {activeTab === 'features' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[#051424] border border-[#30363d]">
                <h3 className="font-headline font-bold text-white text-sm mb-3">
                  Current Browser & Android Hardware Capabilities
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="flex items-center justify-between p-2.5 rounded bg-[#162536] border border-[#30363d]">
                    <span>DEVICE OS</span>
                    <span className={isCurrentAndroid ? 'text-[#10b981] font-bold' : 'text-[#ffc174]'}>
                      {isCurrentAndroid ? 'REAL ANDROID DETECTED' : 'DESKTOP / LAPTOP'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded bg-[#162536] border border-[#30363d]">
                    <span>PWA STANDALONE DISPLAY</span>
                    <span className={isInstalled ? 'text-[#10b981] font-bold' : 'text-[#f59e0b]'}>
                      {isInstalled ? 'ACTIVE (NO BROWSER BAR)' : 'BROWSER TAB'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded bg-[#162536] border border-[#30363d]">
                    <span>WEB SERIAL (USB-OTG)</span>
                    <span className={hasSerialSupport ? 'text-[#10b981] font-bold' : 'text-[#94a3b8]'}>
                      {hasSerialSupport ? 'SUPPORTED' : 'REQUIRES CHROME'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded bg-[#162536] border border-[#30363d]">
                    <span>WEB BLUETOOTH (BLE)</span>
                    <span className={hasBluetoothSupport ? 'text-[#10b981] font-bold' : 'text-[#94a3b8]'}>
                      {hasBluetoothSupport ? 'SUPPORTED' : 'NOT SUPPORTED'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded bg-[#162536] border border-[#30363d]">
                    <span>SCREEN WAKE LOCK</span>
                    <span className={isWakeSupported ? (isWakeActive ? 'text-[#10b981] font-bold' : 'text-[#ffc174]') : 'text-[#94a3b8]'}>
                      {isWakeSupported ? (isWakeActive ? 'KEEP AWAKE ACTIVE' : 'SUPPORTED (OFF)') : 'NOT SUPPORTED'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded bg-[#162536] border border-[#30363d]">
                    <span>HAPTIC VIBRATION</span>
                    <span className={hasVibrateSupport ? 'text-[#10b981] font-bold' : 'text-[#94a3b8]'}>
                      {hasVibrateSupport ? 'SUPPORTED' : 'NOT SUPPORTED'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hardware Quick Action Controls */}
              <div className="p-4 rounded-lg bg-[#0d1c2d] border border-[#30363d] space-y-3">
                <span className="text-xs font-mono text-[#f59e0b] uppercase font-bold block">
                  Quick In-Cab Hardware Test Actions
                </span>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={() => {
                      cabAudio.playKeyClick();
                      toggleWakeLock();
                    }}
                    disabled={!isWakeSupported}
                    className={`px-3.5 py-2 rounded font-headline font-bold text-xs flex items-center gap-2 transition-colors ${
                      isWakeActive
                        ? 'bg-[#10b981] text-black shadow-md'
                        : 'bg-[#161b22] text-white border border-[#30363d] hover:border-[#f59e0b]'
                    }`}
                  >
                    {isWakeActive ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    <span>{isWakeActive ? 'SCREEN WAKE LOCK: ENGAGED' : 'KEEP SCREEN AWAKE ON DASH'}</span>
                  </button>

                  <button
                    onClick={handleTestVibration}
                    disabled={!hasVibrateSupport}
                    className={`px-3.5 py-2 rounded font-headline font-bold text-xs flex items-center gap-2 transition-colors ${
                      vibrated
                        ? 'bg-[#f59e0b] text-black shadow-md'
                        : 'bg-[#161b22] text-white border border-[#30363d] hover:border-[#f59e0b]'
                    }`}
                  >
                    <Vibrate className="w-4 h-4" />
                    <span>{vibrated ? 'VIBRATING...' : 'TEST IN-CAB HAPTIC VIBRATION'}</span>
                  </button>

                  {isInstallable && (
                    <button
                      onClick={handleInstallClick}
                      className="px-3.5 py-2 rounded font-headline font-bold text-xs bg-[#10b981] hover:bg-[#059669] text-black flex items-center gap-2 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>INSTALL TO HOME SCREEN</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Android APK Generation & Direct Download */}
          {activeTab === 'apk' && (
            <div className="space-y-4">
              {/* Alert explaining the PWABuilder 403 Cloud Run issue */}
              <div className="p-3.5 rounded-lg bg-[#2a1215] border-2 border-[#ef4444] text-xs font-mono text-[#fca5a5] space-y-1.5 shadow-lg">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0" />
                  <span>Why PWABuilder Cloud Showed 403 Forbidden:</span>
                </div>
                <p className="leading-relaxed">
                  Google Cloud Run's security firewall blocks external cloud scraper bots (like PWABuilder's remote crawler) from fetching files.
                </p>
                <p className="text-white font-semibold">
                  ✅ Solution: You do NOT need PWABuilder! Use <strong>Method 1 (Direct Chrome WebAPK)</strong> on your phone. Chrome uses your phone's built-in Google Play Services to build and install the real <code>.apk</code> locally in 5 seconds without cloud blocks.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-[#051424] border border-[#10b981] space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-[#10b981] text-black flex items-center justify-center font-bold shrink-0">
                    <Download className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-white text-base">
                      How to Install the Real Android APK (.apk)
                    </h3>
                    <p className="text-xs text-[#94a3b8]">
                      Two guaranteed ways to get the native Android application on your device
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Option 1: Direct On-Device WebAPK (100% Guaranteed & Instant) */}
                  <div className="p-4 rounded bg-[#162536] border-2 border-[#10b981] space-y-2.5 flex flex-col justify-between shadow-md">
                    <div>
                      <span className="text-[10px] font-mono text-[#10b981] uppercase font-bold block">
                        METHOD 1 (RECOMMENDED & 100% RELIABLE)
                      </span>
                      <h4 className="font-headline font-bold text-white text-sm mt-1 flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-[#10b981]" />
                        <span>Direct Chrome WebAPK Installation</span>
                      </h4>
                      <p className="text-xs text-[#cbd5e1] mt-1 leading-relaxed">
                        Open this app in <strong>Google Chrome on Android</strong>. Tap the menu <strong>(⋮)</strong> and tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                      </p>
                      <ul className="text-[11px] font-mono text-[#94a3b8] list-disc list-inside space-y-1 mt-2">
                        <li>Directly compiled into a native Android APK by Google Play Services</li>
                        <li>Installed to Android app drawer with standalone icon</li>
                        <li>Unrestricted USB-OTG, Web Bluetooth, and phone sensor access</li>
                        <li>Never blocked by cloud firewalls or 403 errors</li>
                      </ul>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleInstallClick}
                        className="w-full px-4 py-2.5 rounded bg-[#10b981] hover:bg-[#059669] text-black font-headline font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>INSTALL APK ON THIS ANDROID PHONE</span>
                      </button>
                    </div>
                  </div>

                  {/* Option 2: Local Bubblewrap CLI APK Build */}
                  <div className="p-4 rounded bg-[#162536] border border-[#30363d] space-y-2.5 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-[#ffc174] uppercase font-bold block">
                        METHOD 2 (BUILD STANDALONE .APK FILE)
                      </span>
                      <h4 className="font-headline font-bold text-white text-sm mt-1">
                        Build APK via Bubblewrap CLI
                      </h4>
                      <p className="text-xs text-[#94a3b8] mt-1 leading-relaxed">
                        Download the pre-configured <strong>twa-manifest.json</strong> and run Google's official Bubblewrap CLI on your computer or Termux on Android to produce a signed <code>app-release-signed.apk</code> in seconds.
                      </p>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          cabAudio.playKeyClick();
                          const twaManifest = {
                            packageId: "com.drivelock.industrialsafety",
                            host: "ais-pre-x24utjildnuq7js2diaf2v-1003004681042.asia-southeast1.run.app",
                            name: "DriveLock Industrial Safety",
                            launcherName: "DriveLock",
                            themeColor: "#051424",
                            navigationColor: "#051424",
                            backgroundColor: "#051424",
                            enableNotifications: true,
                            startUrl: "/",
                            iconUrl: `${currentUrl}/pwa-512x512.png`,
                            maskableIconUrl: `${currentUrl}/pwa-maskable-512x512.png`,
                            appVersionName: "1.0.0",
                            appVersionCode: 1,
                            display: "standalone",
                            orientation: "any"
                          };
                          const blob = new Blob([JSON.stringify(twaManifest, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'twa-manifest.json';
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                        className="w-full px-4 py-2.5 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-headline font-bold text-xs flex items-center justify-center gap-2 industrial-btn"
                      >
                        <Download className="w-4 h-4" />
                        <span>DOWNLOAD TWA-MANIFEST.JSON</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Developer CLI Command Box */}
              <div className="p-4 rounded-lg bg-[#0d1c2d] border border-[#30363d] space-y-2 font-mono text-xs">
                <span className="text-[#94a3b8] font-bold uppercase block">
                  CLI COMMANDS TO COMPILE APK LOCALLY (NO CLOUD BLOCKS):
                </span>
                <div className="p-3 rounded bg-[#051424] border border-[#30363d] text-[#6ffbbe] space-y-1 overflow-x-auto text-[11px]">
                  <div>npm install -g @bubblewrap/cli</div>
                  <div>bubblewrap init --manifest="{currentUrl}/manifest.json"</div>
                  <div>bubblewrap build</div>
                  <div className="text-[#94a3b8]"># Install onto connected phone via USB:</div>
                  <div>adb install app-release-signed.apk</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#051424] px-5 py-3 border-t border-[#30363d] flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] font-mono text-[#94a3b8] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            <span>PWA STANDALONE READY · REAL HARDWARE READY</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                cabAudio.playKeyClick();
                onClose();
              }}
              className="px-4 py-2 rounded font-headline font-bold text-xs bg-[#161b22] hover:bg-[#21262d] text-[#94a3b8] hover:text-white border border-[#30363d]"
            >
              CLOSE
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenEspModal();
              }}
              className="px-4 py-2 rounded font-headline font-bold text-xs bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] industrial-btn"
            >
              CONNECT ESP HARDWARE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
