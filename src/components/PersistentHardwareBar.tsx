import React from 'react';
import { 
  Radio, 
  Cpu, 
  Smartphone, 
  ShieldCheck, 
  Volume2, 
  VolumeX, 
  Monitor, 
  Tablet, 
  PhoneCall,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';

interface PersistentHardwareBarProps {
  telemetry: TelemetryData;
  viewLayout: 'phone' | 'tablet' | 'full';
  onLayoutChange: (layout: 'phone' | 'tablet' | 'full') => void;
  isAudioMuted: boolean;
  onToggleAudio: () => void;
  onOpenPreShift: () => void;
  onResetSimulation: () => void;
}

export const PersistentHardwareBar: React.FC<PersistentHardwareBarProps> = ({
  telemetry,
  viewLayout,
  onLayoutChange,
  isAudioMuted,
  onToggleAudio,
  onOpenPreShift,
  onResetSimulation,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#0d1c2d] border-b border-[#30363d] px-3 sm:px-5 py-2.5 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Cab Unit Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-[#f59e0b] text-[#051424] flex items-center justify-center font-headline font-bold text-base shadow-sm">
              DL
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-headline font-bold text-white text-base tracking-tight whitespace-nowrap">
                  DriveLock
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#1c2b3c] text-[#ffc174] border border-[#a08e7a]/40">
                  CAB #{telemetry.cabUnitId}
                </span>
              </div>
              <div className="text-[11px] font-mono text-[#94a3b8] flex items-center gap-2">
                <span>{telemetry.driverId}</span>
                <span>·</span>
                <span className="text-[#4edea3]">SHIFT: {telemetry.shiftStartTime}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Hardware Status Badges (JetBrains Mono 12px uppercase + 8px pulsing LED) */}
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2.5">
          {/* GPS Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                telemetry.gps.locked ? 'bg-[#10b981]' : 'bg-[#f59e0b] animate-pulse'
              }`}
            />
            <Radio className="w-3.5 h-3.5 text-[#94a3b8]" />
            <span className="text-white hidden xs:inline">GPS:</span>
            <span className={telemetry.gps.locked ? 'text-[#10b981]' : 'text-[#f59e0b]'}>
              {telemetry.gps.locked ? `${telemetry.gps.satellites} SATS` : 'ACQUIRING'}
            </span>
          </div>

          {/* OBD-II CAN-Bus Link */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                telemetry.obdConnected ? 'bg-[#10b981]' : 'bg-[#ef4444] animate-pulse'
              }`}
            />
            <Cpu className="w-3.5 h-3.5 text-[#94a3b8]" />
            <span className="text-white hidden xs:inline">OBD-II:</span>
            <span className={telemetry.obdConnected ? 'text-[#10b981]' : 'text-[#ef4444]'}>
              {telemetry.obdConnected ? `${telemetry.batteryVoltage.toFixed(1)}V` : 'DISCONNECTED'}
            </span>
          </div>

          {/* Magnetic Dock Status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${
              telemetry.dockLocked
                ? 'bg-[#161b22] border border-[#10b981]/50 text-[#10b981]'
                : 'bg-[#21262d] border border-[#f59e0b] text-[#f59e0b] animate-pulse'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                telemetry.dockLocked ? 'bg-[#10b981]' : 'bg-[#f59e0b]'
              }`}
            />
            <Smartphone className="w-3.5 h-3.5" />
            <span className="font-semibold">
              {telemetry.dockLocked ? 'DOCK: LOCKED' : 'DOCK: UNDOCKED'}
            </span>
          </div>

          {/* Alcohol Breathalyzer Interlock Badge */}
          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onOpenPreShift();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all ${
              telemetry.interlock.status === 'passed'
                ? 'bg-[#161b22] border border-[#10b981]/40 text-[#10b981] hover:border-[#10b981]'
                : telemetry.interlock.status === 'failed'
                ? 'bg-[#21262d] border border-[#ef4444] text-[#ef4444]'
                : 'bg-[#21262d] border border-[#f59e0b] text-[#f59e0b] hover:bg-[#1c2b3c]'
            }`}
            title="Click to view/execute Driver Verification & Breathalyzer Test"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>BAC:</span>
            <span className="font-bold">
              {telemetry.interlock.status === 'passed'
                ? '0.00% PASS'
                : telemetry.interlock.status === 'failed'
                ? `${telemetry.interlock.bacPercent.toFixed(2)}% FAIL`
                : 'TEST REQ'}
            </span>
          </button>
        </div>

        {/* Right Zone: Controls (Form factor switcher, Audio, Reset) */}
        <div className="flex items-center gap-2">
          {/* Viewport Form Factor Toggle */}
          <div className="flex items-center bg-[#161b22] p-0.5 rounded border border-[#30363d] text-xs">
            <button
              onClick={() => onLayoutChange('phone')}
              className={`px-2 py-1 rounded font-mono flex items-center gap-1 transition-colors ${
                viewLayout === 'phone'
                  ? 'bg-[#f59e0b] text-[#051424] font-bold'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
              title="Portrait Phone In-Cab Mount"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Dash Mount</span>
            </button>

            <button
              onClick={() => onLayoutChange('tablet')}
              className={`px-2 py-1 rounded font-mono flex items-center gap-1 transition-colors ${
                viewLayout === 'tablet'
                  ? 'bg-[#f59e0b] text-[#051424] font-bold'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
              title="7-10 Inch In-Cab Rugged Tablet"
            >
              <Tablet className="w-3.5 h-3.5" />
              <span className="hidden md:inline">7"–10" Tablet</span>
            </button>

            <button
              onClick={() => onLayoutChange('full')}
              className={`px-2 py-1 rounded font-mono flex items-center gap-1 transition-colors ${
                viewLayout === 'full'
                  ? 'bg-[#f59e0b] text-[#051424] font-bold'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
              title="Wide Fleet Console"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Wide Console</span>
            </button>
          </div>

          {/* Audio Annunciator Mute Button */}
          <button
            onClick={onToggleAudio}
            className={`p-1.5 rounded border border-[#30363d] transition-colors ${
              isAudioMuted
                ? 'bg-[#161b22] text-[#94a3b8] hover:text-white'
                : 'bg-[#1c2b3c] text-[#f59e0b] border-[#f59e0b]/40'
            }`}
            title={isAudioMuted ? 'Unmute In-Cab Audio Alerts' : 'Mute Audio Alerts'}
            aria-label="Toggle Cab Audio"
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Quick Pre-shift Launch */}
          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onOpenPreShift();
            }}
            className="px-2.5 py-1 text-xs font-headline font-semibold bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] rounded flex items-center gap-1.5 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#ffc174]" />
            <span className="hidden sm:inline">Pre-Shift Sign-Off</span>
          </button>

          {/* Reset simulation */}
          <button
            onClick={onResetSimulation}
            className="p-1.5 text-[#94a3b8] hover:text-white rounded border border-[#30363d] bg-[#161b22] hover:bg-[#1c2b3c] transition-colors"
            title="Reset Simulator to Default Safe Driving State"
            aria-label="Reset simulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
