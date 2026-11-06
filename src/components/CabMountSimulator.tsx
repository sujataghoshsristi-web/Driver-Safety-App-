import React from 'react';
import { 
  Sliders, 
  Smartphone, 
  AlertTriangle, 
  Zap, 
  ShieldAlert, 
  RefreshCw, 
  Flame, 
  Activity,
  ArrowRight,
  Radio
} from 'lucide-react';
import { TelemetryData, SafetyStatus } from '../types/telemetry';
import { cabAudio } from '../utils/audio';

interface CabMountSimulatorProps {
  telemetry: TelemetryData;
  onToggleDock: () => void;
  onSimulateImpact: () => void;
  onSimulateOverSpeed: () => void;
  onSimulateObdDisconnect: () => void;
  onLoadPreset: (preset: 'cold_start' | 'highway_safe' | 'distraction' | 'collision') => void;
}

export const CabMountSimulator: React.FC<CabMountSimulatorProps> = ({
  telemetry,
  onToggleDock,
  onSimulateImpact,
  onSimulateOverSpeed,
  onSimulateObdDisconnect,
  onLoadPreset,
}) => {
  return (
    <div className="bg-[#122131] border border-[#30363d] rounded p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#30363d] pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#f59e0b]" />
          <h4 className="font-headline font-bold text-white text-sm">
            Road Hazard & In-Cab Telemetry Simulator
          </h4>
        </div>
        <span className="text-[11px] font-mono text-[#94a3b8]">
          TEST HARNESS: EVALUATE FAIL-SAFE LOGIC & HARDWARE SENSORS
        </span>
      </div>

      {/* Preset Buttons */}
      <div>
        <span className="text-xs font-mono text-[#94a3b8] block mb-2">
          OPERATIONAL STATE PRESETS:
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onLoadPreset('cold_start');
            }}
            className="p-2.5 rounded bg-[#161b22] hover:bg-[#1c2b3c] border border-[#f59e0b]/50 text-left transition-colors"
          >
            <div className="font-mono text-xs font-bold text-[#f59e0b]">1. COLD START</div>
            <div className="text-[11px] text-[#94a3b8]">Immobilized · Undocked</div>
          </button>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onLoadPreset('highway_safe');
            }}
            className="p-2.5 rounded bg-[#161b22] hover:bg-[#1c2b3c] border border-[#10b981]/50 text-left transition-colors"
          >
            <div className="font-mono text-xs font-bold text-[#10b981]">2. SAFE CRUISE</div>
            <div className="text-[11px] text-[#94a3b8]">Docked · 50 km/h · Green</div>
          </button>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onLoadPreset('distraction');
            }}
            className="p-2.5 rounded bg-[#161b22] hover:bg-[#1c2b3c] border border-[#f59e0b] text-left transition-colors"
          >
            <div className="font-mono text-xs font-bold text-[#f59e0b]">3. PHONE UNDOCKED</div>
            <div className="text-[11px] text-[#94a3b8]">Distraction Warning</div>
          </button>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onLoadPreset('collision');
            }}
            className="p-2.5 rounded bg-[#161b22] hover:bg-[#1c2b3c] border border-[#ef4444] text-left transition-colors"
          >
            <div className="font-mono text-xs font-bold text-[#ef4444]">4. HARD COLLISION</div>
            <div className="text-[11px] text-[#94a3b8]">3.8G Impact · SOS Auto</div>
          </button>
        </div>
      </div>

      {/* Individual Trigger Actions */}
      <div className="pt-2 border-t border-[#30363d] flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-mono text-[#94a3b8]">INTERACTIVE SENSOR TRIGGERS:</span>
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Dock */}
          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onToggleDock();
            }}
            className="px-3 py-1.5 rounded font-mono text-xs font-bold bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] flex items-center gap-1.5"
          >
            <Smartphone className="w-3.5 h-3.5 text-[#ffc174]" />
            <span>{telemetry.dockLocked ? 'Simulate Undock Phone' : 'Simulate Dock Phone'}</span>
          </button>

          {/* Simulate Over-Speed */}
          <button
            onClick={() => {
              cabAudio.playWarningBuzzer();
              onSimulateOverSpeed();
            }}
            className="px-3 py-1.5 rounded font-mono text-xs font-bold bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 text-[#f59e0b]" />
            <span>Spike Speed (75 km/h)</span>
          </button>

          {/* Simulate Pothole / Shock */}
          <button
            onClick={() => {
              cabAudio.playWarningBuzzer();
              onSimulateImpact();
            }}
            className="px-3 py-1.5 rounded font-mono text-xs font-bold bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-[#ff938c]" />
            <span>Pothole Impact (1.6G)</span>
          </button>

          {/* Simulate OBD Disconnect */}
          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onSimulateObdDisconnect();
            }}
            className="px-3 py-1.5 rounded font-mono text-xs font-bold bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] flex items-center gap-1.5"
          >
            <Radio className="w-3.5 h-3.5 text-[#94a3b8]" />
            <span>{telemetry.obdConnected ? 'Cut OBD Cable' : 'Reconnect OBD'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
