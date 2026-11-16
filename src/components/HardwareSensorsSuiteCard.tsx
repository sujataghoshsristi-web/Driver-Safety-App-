import React, { useState, useEffect } from 'react';
import {
  Flame,
  Hammer,
  Wine,
  CheckCircle2,
  Cpu,
  PhoneCall,
  RotateCcw,
  Sliders,
  Zap,
  Usb,
  ExternalLink,
  Terminal,
  AlertTriangle,
  PlugZap,
} from 'lucide-react';
import { HardwareSensorsSuiteState } from '../types/telemetry';
import { emergencyCallManager } from '../utils/emergencyDialer';
import { espManager } from '../utils/espManager';

interface HardwareSensorsSuiteCardProps {
  sensors: HardwareSensorsSuiteState;
  espConnected: boolean;
  ignitionRelayClosed: boolean;
  onUpdateAlcoholLimit: (newLimit: number) => void;
  onSimulateAlcoholSpike: () => void;
  onResetAlcohol: () => void;
  onUpdateKnockSensitivity: (sens: 'low' | 'medium' | 'high') => void;
  onSimulateKnock: (isHardCrash: boolean) => void;
  onResetKnocks: () => void;
  onSimulateFlame: () => void;
  onResetFlame: () => void;
  onOpenEspModal: () => void;
}

export const HardwareSensorsSuiteCard: React.FC<HardwareSensorsSuiteCardProps> = ({
  sensors,
  espConnected,
  ignitionRelayClosed,
  onUpdateAlcoholLimit,
  onSimulateAlcoholSpike,
  onResetAlcohol,
  onUpdateKnockSensitivity,
  onSimulateKnock,
  onResetKnocks,
  onSimulateFlame,
  onResetFlame,
  onOpenEspModal,
}) => {
  const emergencyNumber = emergencyCallManager.getPhoneNumber();
  const isAlcoholViolated = sensors.alcoholBac > sensors.alcoholLimitBac;

  const [lastRawPacket, setLastRawPacket] = useState<string>('');
  const [packetsReceived, setPacketsReceived] = useState<number>(0);
  const [usbStatusMsg, setUsbStatusMsg] = useState<string | null>(null);
  const [isConnectingUsb, setIsConnectingUsb] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    const unsubStatus = espManager.subscribeStatus((connected, message) => {
      if (!connected && message) {
        setUsbStatusMsg(message);
      } else if (connected) {
        setUsbStatusMsg(null);
      }
    });

    const unsubPacket = espManager.subscribePacket((_packet, rawLine) => {
      setLastRawPacket(rawLine);
      setPacketsReceived((prev) => prev + 1);
    });

    return () => {
      unsubStatus();
      unsubPacket();
    };
  }, []);

  const handleDirectUsbConnect = async () => {
    if (espConnected || espManager.isConnected) {
      await espManager.disconnect();
      setUsbStatusMsg('Disconnected from ESP32-S3.');
      return;
    }
    setIsConnectingUsb(true);
    setUsbStatusMsg(null);
    try {
      await espManager.connectSerial(115200);
      setUsbStatusMsg(null);
    } catch (err: any) {
      setUsbStatusMsg(err?.message || 'Could not open COM port. Close Arduino IDE Serial Monitor and try again.');
    } finally {
      setIsConnectingUsb(false);
    }
  };

  return (
    <div className="bg-[#122131] border-2 border-[#30363d] rounded-lg p-3.5 sm:p-4 shadow-lg">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 mb-3 border-b border-[#30363d]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded bg-[#f59e0b]/20 border border-[#f59e0b] text-[#f59e0b] flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-headline font-bold text-white uppercase tracking-tight">
                3-Sensor Hardware Safety Suite (Alcohol · Knock/Tap · Flame)
              </h3>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                  espConnected
                    ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                    : 'bg-[#ef4444]/20 text-[#ffc174] border border-[#f59e0b]/60'
                }`}
              >
                {espConnected
                  ? `ESP32-S3 LIVE (${packetsReceived} PKTS)`
                  : 'USB / BLE NOT LINKED YET'}
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#94a3b8]">
              ESP32-S3 PINOUT: MQ-3 Alcohol (GPIO 4) · Knock/Tap (GPIO 13) · Flame (GPIO 14 &amp; GPIO 6) · MQ-9 Gas (GPIO 5)
            </p>
          </div>
        </div>

        {/* Direct Laptop USB Connect + Code Modal Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleDirectUsbConnect}
            disabled={isConnectingUsb}
            className={`px-3 py-1.5 rounded font-headline font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer ${
              espConnected
                ? 'bg-[#10b981] hover:bg-[#059669] text-[#051424]'
                : 'bg-[#38bdf8] hover:bg-[#0284c7] text-[#051424] shadow-[0_0_15px_rgba(56,189,248,0.35)]'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            <span>
              {isConnectingUsb
                ? 'OPENING COM PORT...'
                : espConnected
                ? 'USB CONNECTED (CLICK TO UNLINK)'
                : '1-CLICK CONNECT USB (COM PORT)'}
            </span>
          </button>

          {isInIframe && !espConnected && (
            <a
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-headline font-bold text-xs flex items-center justify-center gap-1 shrink-0"
              title="Chrome blocks Web Serial inside preview iframes. Open in a full tab to connect USB COM port."
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>OPEN IN NEW TAB FOR USB</span>
            </a>
          )}

          <button
            type="button"
            onClick={onOpenEspModal}
            className="px-3 py-1.5 rounded bg-[#1c2b3c] hover:bg-[#273647] text-[#ffc174] border border-[#f59e0b]/50 font-headline font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>ESP32-S3 CODE &amp; WIRING</span>
          </button>
        </div>
      </div>

      {/* Live Laptop USB Serial Monitor & Troubleshooting Bar */}
      <div className="mb-3 p-2.5 rounded bg-[#051424] border border-[#30363d] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className={`w-4 h-4 shrink-0 ${espConnected ? 'text-[#10b981]' : 'text-[#38bdf8]'}`} />
          <div className="font-mono text-[11px] truncate">
            {espConnected ? (
              <span className="text-[#10b981]">
                LIVE STREAM (ESP32-S3):{' '}
                <span className="text-white font-bold">
                  {lastRawPacket || 'Connected! Waiting for first serial line (115200 baud)...'}
                </span>
              </span>
            ) : (
              <span className="text-[#94a3b8]">
                <strong className="text-[#38bdf8]">LAPTOP USB GUIDE:</strong> 1) Close Arduino IDE Serial Monitor · 2) Click{' '}
                <strong className="text-white">&quot;1-CLICK CONNECT USB (COM PORT)&quot;</strong> above · 3) Tap sensor on{' '}
                <strong className="text-[#ffc174]">GPIO 13</strong>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {espConnected && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/40">
              RX: {packetsReceived} LINES
            </span>
          )}
          <button
            type="button"
            onClick={onOpenEspModal}
            className="text-[10px] font-mono text-[#38bdf8] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <PlugZap className="w-3 h-3" />
            <span>{espConnected ? 'Open Full Serial Console' : 'Connect via Wi-Fi / BLE'}</span>
          </button>
        </div>
      </div>

      {/* USB Error Banner if Port is Busy or Blocked by Iframe */}
      {usbStatusMsg && !espConnected && (
        <div className="mb-3 p-2.5 rounded bg-[#3b0a14] border border-[#ef4444] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-[#fecdd3]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#ef4444] shrink-0" />
            <span>{usbStatusMsg}</span>
          </div>
          {isInIframe && (
            <a
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded bg-[#ef4444] text-white font-headline font-bold text-[11px] flex items-center gap-1 shrink-0 self-start sm:self-auto"
            >
              <ExternalLink className="w-3 h-3" />
              <span>POP OUT TO FULL TAB</span>
            </a>
          )}
        </div>
      )}

      {/* All-Sensor Crash Detection Fusion Verdict Banner */}
      {(() => {
        const isCrashHappened =
          sensors.lastKnockType === 'crash_impact' ||
          sensors.flameDetected ||
          (sensors.knockDetected && isAlcoholViolated);
        const activeCount =
          (sensors.knockDetected ? 1 : 0) +
          (sensors.flameDetected ? 1 : 0) +
          (isAlcoholViolated ? 1 : 0);

        return (
          <div
            className={`mb-3 p-3 rounded-lg border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all ${
              isCrashHappened
                ? 'bg-[#3b0a14] border-[#ef4444] shadow-[0_0_25px_rgba(239,68,68,0.45)]'
                : sensors.knockDetected || isAlcoholViolated
                ? 'bg-[#2e200a] border-[#f59e0b]'
                : 'bg-[#091929] border-[#1e3a5f]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded flex items-center justify-center shrink-0 font-bold ${
                  isCrashHappened
                    ? 'bg-[#ef4444] text-white animate-bounce'
                    : sensors.knockDetected || isAlcoholViolated
                    ? 'bg-[#f59e0b] text-[#051424]'
                    : 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/50'
                }`}
              >
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-headline font-extrabold text-white uppercase tracking-wide">
                    ALL-SENSOR CRASH FUSION VERDICT:
                  </span>
                  <span
                    className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded uppercase ${
                      isCrashHappened
                        ? 'bg-[#ef4444] text-white animate-pulse'
                        : sensors.knockDetected
                        ? 'bg-[#f59e0b] text-[#051424]'
                        : 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                    }`}
                  >
                    {isCrashHappened
                      ? '🚨 CRASH DETECTED (EMERGENCY CALLING)'
                      : sensors.knockDetected
                      ? '⚠️ CHASSIS TAP DETECTED (TAP AGAIN OR +SENSOR = CRASH)'
                      : '✅ NO CRASH (ALL SENSORS SAFE)'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-[#94a3b8] mt-0.5">
                  ACTIVE SENSORS ({activeCount}/3):{' '}
                  <span className={sensors.knockDetected ? 'text-[#f59e0b] font-bold' : 'text-[#10b981]'}>
                    [Knock/Tap: {sensors.knockDetected ? 'TRIGGERED' : 'CLEAR'}]
                  </span>{' '}
                  ·{' '}
                  <span className={sensors.flameDetected ? 'text-[#ef4444] font-bold' : 'text-[#10b981]'}>
                    [Fire/Flame: {sensors.flameDetected ? 'FIRE!' : `SAFE (${sensors.flameRawAdc} ADC)`}]
                  </span>{' '}
                  ·{' '}
                  <span className={isAlcoholViolated ? 'text-[#ef4444] font-bold' : 'text-[#10b981]'}>
                    [Alcohol: {isAlcoholViolated ? 'HIGH BAC' : '0.00%'}]
                  </span>
                </p>
              </div>
            </div>

            {isCrashHappened && (
              <button
                type="button"
                onClick={() => {
                  onResetKnocks();
                  onResetFlame();
                }}
                className="px-3 py-1.5 rounded bg-white hover:bg-gray-200 text-[#051424] font-headline font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>CLEAR CRASH &amp; FIRE</span>
              </button>
            )}
          </div>
        );
      })()}

      {/* 3 Sensor Modules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 1. ALCOHOL SENSOR (MQ-3) */}
        <div
          className={`rounded-lg p-3.5 border-2 flex flex-col justify-between transition-all ${
            isAlcoholViolated
              ? 'bg-[#3b0a14] border-[#ef4444]'
              : 'bg-[#0d1c2d] border-[#30363d]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded flex items-center justify-center ${
                    isAlcoholViolated
                      ? 'bg-[#ef4444] text-white animate-pulse'
                      : 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/50'
                  }`}
                >
                  <Wine className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-headline font-bold text-white block uppercase">
                    1. Alcohol Sensor (MQ-3)
                  </span>
                  <span className="text-[10px] font-mono text-[#94a3b8] block">
                    ESP32-S3 GPIO 4 (ADC1) · ESP32 GPIO 34
                  </span>
                </div>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                  isAlcoholViolated
                    ? 'bg-[#ef4444] text-white'
                    : 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                }`}
              >
                {isAlcoholViolated ? 'LOCKOUT' : '0.00% PASS'}
              </span>
            </div>

            {/* Live BAC & Raw ADC Readout */}
            <div className="my-2 p-2.5 rounded bg-[#051424] border border-[#30363d] flex items-baseline justify-between">
              <div>
                <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">
                  BLOOD ALCOHOL (BAC)
                </span>
                <span
                  className={`text-2xl font-mono font-extrabold tabular-nums ${
                    isAlcoholViolated ? 'text-[#ef4444]' : 'text-[#10b981]'
                  }`}
                >
                  {sensors.alcoholBac.toFixed(3)}%
                </span>
              </div>
              <div className="text-right font-mono">
                <span className="text-[10px] text-[#94a3b8] block">
                  LIMIT: {sensors.alcoholLimitBac.toFixed(2)}%
                </span>
                <span className="text-xs text-[#ffc174]">
                  ADC: {sensors.alcoholRawAdc}
                </span>
              </div>
            </div>

            {/* Adjustable Alcohol Threshold Slider */}
            <div className="mb-3 bg-[#161b22] p-2 rounded border border-[#30363d]">
              <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                <span className="text-[#94a3b8] flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-[#f59e0b]" />
                  BAC LOCKOUT LIMIT:
                </span>
                <span className="text-[#f59e0b] font-bold">
                  {sensors.alcoholLimitBac.toFixed(2)}% BAC
                </span>
              </div>
              <input
                type="range"
                min={0.01}
                max={0.08}
                step={0.01}
                value={sensors.alcoholLimitBac}
                onChange={(e) => onUpdateAlcoholLimit(parseFloat(e.target.value))}
                className="w-full accent-[#f59e0b] cursor-pointer h-1.5 bg-[#051424] rounded"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onSimulateAlcoholSpike}
              className="min-h-[38px] px-2.5 py-1.5 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-headline font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              <Wine className="w-3.5 h-3.5" />
              <span>TEST ALCOHOL</span>
            </button>
            <button
              type="button"
              onClick={onResetAlcohol}
              className="min-h-[38px] px-2.5 py-1.5 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] font-headline font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#10b981]" />
              <span>CLEAN AIR</span>
            </button>
          </div>
        </div>

        {/* 2. KNOCK / TAP SENSOR (KY-031 / SW-420) */}
        <div
          className={`rounded-lg p-3.5 border-2 flex flex-col justify-between transition-all ${
            sensors.lastKnockType === 'crash_impact'
              ? 'bg-[#3b0a14] border-[#ef4444] shadow-[0_0_25px_rgba(239,68,68,0.45)]'
              : sensors.knockDetected
              ? 'bg-[#2e200a] border-[#f59e0b] shadow-[0_0_20px_rgba(245,158,11,0.4)]'
              : 'bg-[#0d1c2d] border-[#30363d]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded flex items-center justify-center ${
                    sensors.lastKnockType === 'crash_impact'
                      ? 'bg-[#ef4444] text-white animate-bounce'
                      : sensors.knockDetected
                      ? 'bg-[#f59e0b] text-[#051424] animate-bounce'
                      : 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50'
                  }`}
                >
                  <Hammer className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-headline font-bold text-white block uppercase">
                    2. Knock / Tap Sensor (KY-031)
                  </span>
                  <span className="text-[10px] font-mono text-[#94a3b8] block">
                    ESP32-S3 GPIO 13 · Auto-Edge Interrupt
                  </span>
                </div>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                  sensors.lastKnockType === 'crash_impact'
                    ? 'bg-[#ef4444] text-white animate-pulse'
                    : sensors.knockDetected
                    ? 'bg-[#f59e0b] text-[#051424] animate-pulse'
                    : 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                }`}
              >
                {sensors.lastKnockType === 'crash_impact'
                  ? 'HARD IMPACT'
                  : sensors.knockDetected
                  ? 'TAP DETECTED!'
                  : 'ARMED'}
              </span>
            </div>

            {/* Knock Counter & State */}
            <div className="my-2 p-2.5 rounded bg-[#051424] border border-[#30363d] flex items-baseline justify-between">
              <div>
                <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">
                  KNOCK / TAP PULSES
                </span>
                <span
                  className={`text-2xl font-mono font-extrabold tabular-nums ${
                    sensors.knockDetected ? 'text-[#f59e0b]' : 'text-white'
                  }`}
                >
                  {sensors.knockCount}{' '}
                  <span className="text-xs font-normal text-[#94a3b8]">TAPS</span>
                </span>
              </div>
              <div className="text-right font-mono">
                <span
                  className={`text-[10px] font-bold block uppercase ${
                    sensors.knockDetected ? 'text-[#f59e0b]' : 'text-[#38bdf8]'
                  }`}
                >
                  {sensors.knockDetected
                    ? '⚡ PULSE ACTIVE'
                    : `LAST: ${sensors.lastKnockType === 'none' ? 'NONE' : sensors.lastKnockType.toUpperCase()}`}
                </span>
                <span className="text-[10px] text-[#94a3b8] block">
                  {sensors.lastKnockTimestamp || 'READY FOR TAP'}
                </span>
              </div>
            </div>

            {/* Sensitivity Selector */}
            <div className="mb-3 bg-[#161b22] p-2 rounded border border-[#30363d] flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#94a3b8]">
                TAP MODE ({sensors.knockSensitivity === 'high' ? 'CALLS SOS' : 'COUNTS TAPS'}):
              </span>
              <div className="flex items-center gap-1">
                {(['low', 'medium', 'high'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => onUpdateKnockSensitivity(lvl)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase cursor-pointer ${
                      sensors.knockSensitivity === lvl
                        ? 'bg-[#38bdf8] text-[#051424]'
                        : 'bg-[#0d1c2d] text-[#94a3b8] border border-[#30363d]'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => onSimulateKnock(false)}
              className="min-h-[38px] px-2 py-1.5 rounded bg-[#38bdf8] hover:bg-[#0284c7] text-[#051424] font-headline font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
            >
              <Hammer className="w-3.5 h-3.5" />
              <span>TAP</span>
            </button>
            <button
              type="button"
              onClick={() => onSimulateKnock(true)}
              className="min-h-[38px] px-2 py-1.5 rounded bg-[#ef4444] hover:bg-[#dc2626] text-white font-headline font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>CRASH KNOCK</span>
            </button>
            <button
              type="button"
              onClick={onResetKnocks}
              className="min-h-[38px] px-2 py-1.5 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] font-headline font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>ZERO</span>
            </button>
          </div>
        </div>

        {/* 3. FLAME / FIRE SENSOR (KY-026 IR DETECTOR) */}
        <div
          className={`rounded-lg p-3.5 border-2 flex flex-col justify-between transition-all ${
            sensors.flameDetected
              ? 'bg-[#3b0a14] border-[#ef4444] shadow-[0_0_25px_rgba(239,68,68,0.4)]'
              : 'bg-[#0d1c2d] border-[#30363d]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded flex items-center justify-center ${
                    sensors.flameDetected
                      ? 'bg-[#ef4444] text-white animate-ping'
                      : 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/50'
                  }`}
                >
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-headline font-bold text-white block uppercase">
                    3. Flame Sensor (KY-026 IR)
                  </span>
                  <span className="text-[10px] font-mono text-[#94a3b8] block">
                    ESP32-S3 GPIO 14 &amp; GPIO 6 · ESP32 GPIO 26
                  </span>
                </div>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                  sensors.flameDetected
                    ? 'bg-[#ef4444] text-white animate-pulse'
                    : 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                }`}
              >
                {sensors.flameDetected ? 'FIRE EMERGENCY' : 'NO FLAME'}
              </span>
            </div>

            {/* Live Flame IR Status */}
            <div className="my-2 p-2.5 rounded bg-[#051424] border border-[#30363d] flex items-baseline justify-between">
              <div>
                <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">
                  ENGINE / CABIN IR SPECTRUM
                </span>
                <span
                  className={`text-xl font-mono font-extrabold uppercase ${
                    sensors.flameDetected ? 'text-[#ef4444]' : 'text-[#10b981]'
                  }`}
                >
                  {sensors.flameDetected ? 'FLAME DETECTED!' : 'SAFE (CLEAR)'}
                </span>
              </div>
              <div className="text-right font-mono">
                <span className="text-[10px] text-[#94a3b8] block">
                  IR ADC: {sensors.flameRawAdc}
                </span>
                <span
                  className={`text-[10px] font-bold block ${
                    ignitionRelayClosed ? 'text-[#10b981]' : 'text-[#ef4444]'
                  }`}
                >
                  FUEL RELAY: {ignitionRelayClosed ? 'ON' : 'CUT-OFF'}
                </span>
              </div>
            </div>

            {/* Automatic Emergency Action Info */}
            <div className="mb-3 bg-[#161b22] p-2 rounded border border-[#30363d] flex items-center justify-between text-[10px] font-mono">
              <span className="text-[#94a3b8]">
                FIRE ACTION: CUT RELAY + CALL {emergencyNumber}
              </span>
              <a
                href={`tel:${emergencyNumber}`}
                className="text-[#ef4444] hover:underline font-bold flex items-center gap-1"
              >
                <PhoneCall className="w-3 h-3" />
                <span>Call Now</span>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onSimulateFlame}
              className="min-h-[38px] px-2.5 py-1.5 rounded bg-[#ef4444] hover:bg-[#dc2626] text-white font-headline font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>TEST FLAME ALERT</span>
            </button>
            <button
              type="button"
              onClick={onResetFlame}
              className="min-h-[38px] px-2.5 py-1.5 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] font-headline font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" />
              <span>RESET FIRE</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
