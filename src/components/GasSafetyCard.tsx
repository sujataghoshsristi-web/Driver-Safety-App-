import React from 'react';
import { 
  Flame, 
  AlertTriangle, 
  Sliders, 
  Wind, 
  CheckCircle2, 
  BellRing, 
  ShieldAlert, 
  Cpu, 
  AlertOctagon 
} from 'lucide-react';
import { GasSafetyState } from '../types/telemetry';
import { cabAudio } from '../utils/audio';

interface GasSafetyCardProps {
  gas: GasSafetyState;
  onUpdateThreshold: (newThreshold: number) => void;
  onAcknowledgeWarning: () => void;
  onSimulateLeak: () => void;
  onVentilate: () => void;
  onOpenRemediationModal: () => void;
}

export const GasSafetyCard: React.FC<GasSafetyCardProps> = ({
  gas,
  onUpdateThreshold,
  onAcknowledgeWarning,
  onSimulateLeak,
  onVentilate,
  onOpenRemediationModal,
}) => {
  const isOverThreshold = gas.ppm > gas.thresholdPpm;
  const isLockout = gas.isLockoutActive || gas.warningsCount >= gas.maxWarningsLimit;

  return (
    <div
      className={`rounded-lg border-2 transition-all p-4 ${
        isLockout
          ? 'bg-[#211116] border-[#ef4444] shadow-[0_0_20px_rgba(239,68,68,0.25)]'
          : isOverThreshold
          ? 'bg-[#261c12] border-[#f59e0b] shadow-[0_0_15px_rgba(245,158,11,0.2)]'
          : 'bg-[#161b22] border-[#30363d]'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded flex items-center justify-center font-bold shrink-0 ${
              isLockout
                ? 'bg-[#ef4444] text-white animate-pulse'
                : isOverThreshold
                ? 'bg-[#f59e0b] text-[#051424]'
                : 'bg-[#1c2b3c] text-[#ffc174]'
            }`}
          >
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-headline font-bold text-white text-sm sm:text-base">
                MQ-9 GAS & CO TELEMETRY
              </h3>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                  isLockout
                    ? 'bg-[#ef4444] text-white'
                    : isOverThreshold
                    ? 'bg-[#f59e0b] text-black animate-pulse'
                    : 'bg-[#10b981]/20 text-[#10b981]'
                }`}
              >
                {isLockout
                  ? 'IMMOBILIZED (5/5)'
                  : isOverThreshold
                  ? 'LEAK DETECTED'
                  : 'SAFE ENVELOPE'}
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#94a3b8]">
              Target Gases: Carbon Monoxide (CO), Methane (CH4), LPG, Exhaust Fumes
            </p>
          </div>
        </div>

        {/* Warnings Counter Badge (0/5) */}
        <div className="text-right">
          <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">
            WARNINGS IGNORED
          </span>
          <div className="flex items-center gap-1 justify-end mt-0.5">
            {[1, 2, 3, 4, 5].map((idx) => (
              <span
                key={idx}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  idx <= gas.warningsCount
                    ? idx >= 5
                      ? 'bg-[#ef4444] animate-ping'
                      : 'bg-[#f59e0b]'
                    : 'bg-[#30363d]'
                }`}
                title={`Warning ${idx} of 5`}
              />
            ))}
            <span
              className={`text-xs font-mono font-bold ml-1.5 ${
                gas.warningsCount >= 5
                  ? 'text-[#ef4444]'
                  : gas.warningsCount > 0
                  ? 'text-[#f59e0b]'
                  : 'text-[#94a3b8]'
              }`}
            >
              {gas.warningsCount}/5
            </span>
          </div>
        </div>
      </div>

      {/* Main Metric & Threshold Section */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-3">
        {/* Sensor Live PPM Output */}
        <div className="sm:col-span-5 p-3 rounded bg-[#0d1c2d] border border-[#30363d] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-[#94a3b8]">
            <span>LIVE CONCENTRATION</span>
            <span>RAW ADC: {gas.rawAdc}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`font-mono text-3xl font-extrabold tabular-nums ${
                isLockout
                  ? 'text-[#ef4444]'
                  : isOverThreshold
                  ? 'text-[#f59e0b]'
                  : 'text-[#10b981]'
              }`}
            >
              {gas.ppm}
            </span>
            <span className="text-xs font-mono text-[#94a3b8]">PPM</span>
          </div>
          <div className="text-[11px] font-mono mt-1 text-[#94a3b8]">
            {gas.ppm <= 25
              ? 'Ambient normal air'
              : gas.ppm <= gas.thresholdPpm
              ? 'Elevated baseline (within limit)'
              : 'CRITICAL LEAK THRESHOLD EXCEEDED'}
          </div>
        </div>

        {/* Adjustable Threshold Slider */}
        <div className="sm:col-span-7 p-3 rounded bg-[#0d1c2d] border border-[#30363d] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#94a3b8] flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-[#f59e0b]" />
              ADJUSTABLE SAFETY THRESHOLD:
            </span>
            <span className="text-[#f59e0b] font-bold text-sm">
              {gas.thresholdPpm} PPM
            </span>
          </div>

          <div className="my-2">
            <input
              type="range"
              min={20}
              max={150}
              step={5}
              value={gas.thresholdPpm}
              onChange={(e) => onUpdateThreshold(Number(e.target.value))}
              className="w-full h-2 bg-[#21262d] rounded-lg appearance-none cursor-pointer accent-[#f59e0b]"
            />
          </div>

          <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
            <button
              onClick={() => onUpdateThreshold(30)}
              className={`px-2 py-0.5 rounded border ${
                gas.thresholdPpm === 30
                  ? 'bg-[#f59e0b] text-black font-bold border-[#f59e0b]'
                  : 'bg-[#161b22] text-[#94a3b8] border-[#30363d] hover:text-white'
              }`}
            >
              30 PPM (Hazmat)
            </button>
            <button
              onClick={() => onUpdateThreshold(50)}
              className={`px-2 py-0.5 rounded border ${
                gas.thresholdPpm === 50
                  ? 'bg-[#f59e0b] text-black font-bold border-[#f59e0b]'
                  : 'bg-[#161b22] text-[#94a3b8] border-[#30363d] hover:text-white'
              }`}
            >
              50 PPM (OSHA Std)
            </button>
            <button
              onClick={() => onUpdateThreshold(80)}
              className={`px-2 py-0.5 rounded border ${
                gas.thresholdPpm === 80
                  ? 'bg-[#f59e0b] text-black font-bold border-[#f59e0b]'
                  : 'bg-[#161b22] text-[#94a3b8] border-[#30363d] hover:text-white'
              }`}
            >
              80 PPM (Heavy Diesel)
            </button>
          </div>
        </div>
      </div>

      {/* Warning Alert Banner (When Over Threshold) */}
      {isOverThreshold && !isLockout && (
        <div className="p-3 rounded bg-[#f59e0b]/15 border border-[#f59e0b] mb-3 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-[#f59e0b] animate-bounce shrink-0" />
            <div>
              <span className="font-headline font-bold text-white text-xs block">
                GAS LEAK WARNING: {gas.ppm} PPM EXCEEDS {gas.thresholdPpm} PPM THRESHOLD
              </span>
              <span className="text-[11px] font-mono text-[#ffddb8]">
                Driver must address gas leak. Ignoring 5 warnings triggers vehicle lockout ({5 - gas.warningsCount} remaining).
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onAcknowledgeWarning();
            }}
            className="px-3 py-1.5 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-headline font-bold text-xs flex items-center gap-1.5 shrink-0"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>ACKNOWLEDGE / IGNORE</span>
          </button>
        </div>
      )}

      {/* Lockout Triggered Banner */}
      {isLockout && (
        <div className="p-3 rounded bg-[#ef4444]/20 border border-[#ef4444] mb-3 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-5 h-5 text-[#ef4444] animate-pulse shrink-0" />
            <div>
              <span className="font-headline font-bold text-white text-xs block">
                VEHICLE IMMOBILIZED: 5 GAS WARNINGS UNADDRESSED
              </span>
              <span className="text-[11px] font-mono text-[#ffdad6]">
                Ignition relay cut off. Complete mandatory cabin ventilation checklist to re-arm.
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onOpenRemediationModal();
            }}
            className="px-4 py-2 rounded bg-[#ef4444] hover:bg-[#dc2626] text-white font-headline font-bold text-xs flex items-center gap-1.5 shrink-0"
          >
            <span>FIX PROBLEM & CLEAR LOCKOUT</span>
          </button>
        </div>
      )}

      {/* Simulator Controls for Quick Testing */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#30363d] text-xs font-mono">
        <span className="text-[#94a3b8]">TEST SIMULATOR:</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              onSimulateLeak();
            }}
            className="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#f59e0b]/20 hover:text-[#f59e0b] border border-[#30363d] text-[#ffc174] transition-colors"
            title="Increase gas PPM above threshold to trigger warning"
          >
            + SPIKE LEAK (+30 PPM)
          </button>

          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              onVentilate();
            }}
            className="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#10b981]/20 hover:text-[#10b981] border border-[#30363d] text-[#10b981] transition-colors"
            title="Ventilate cab and lower PPM below threshold"
          >
            <Wind className="w-3.5 h-3.5 inline mr-1" />
            VENTILATE CAB (-30 PPM)
          </button>

          {isLockout && (
            <button
              type="button"
              onClick={() => {
                cabAudio.playKeyClick();
                onOpenRemediationModal();
              }}
              className="px-2.5 py-1 rounded bg-[#ef4444] text-white font-bold"
            >
              RESOLVE LOCKOUT
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
