import React, { useState } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Wind, 
  RotateCcw, 
  CheckCircle2, 
  Lock, 
  Unlock, 
  Flame, 
  KeyRound,
  FileCheck2
} from 'lucide-react';
import { GasSafetyState } from '../types/telemetry';
import { cabAudio } from '../utils/audio';

interface GasRemediationModalProps {
  isOpen: boolean;
  gasState: GasSafetyState;
  onVentilateAndFix: () => void;
  onCompleteRemediation: (supervisorPin: string) => void;
}

export const GasRemediationModal: React.FC<GasRemediationModalProps> = ({
  isOpen,
  gasState,
  onVentilateAndFix,
  onCompleteRemediation,
}) => {
  const [pin, setPin] = useState<string>('');
  const [stepVentilated, setStepVentilated] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  if (!isOpen) return null;

  const isBelowThreshold = gasState.ppm <= gasState.thresholdPpm;

  const handleVentilate = () => {
    cabAudio.playKeyClick();
    onVentilateAndFix();
    setStepVentilated(true);
  };

  const handleClearLockout = () => {
    if (!isBelowThreshold) {
      cabAudio.playWarningBuzzer();
      setErrorMsg(`Cannot clear lockout: Gas level (${gasState.ppm} PPM) is still above safe threshold (${gasState.thresholdPpm} PPM). Ventilate cab first!`);
      return;
    }

    if (pin.length < 4) {
      cabAudio.playWarningBuzzer();
      setErrorMsg('Enter at least a 4-digit driver or supervisor clearance PIN.');
      return;
    }

    cabAudio.playRelaySolenoid(true);
    onCompleteRemediation(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-xl bg-[#0b1726] border-4 border-[#ef4444] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-pulse-border">
        {/* Urgent Header */}
        <div className="bg-[#ef4444] text-white px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-black text-[#ef4444] flex items-center justify-center shrink-0">
            <Flame className="w-6 h-6 animate-bounce" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-headline font-extrabold uppercase tracking-wider">
              CRITICAL GAS HAZARD LOCKOUT — 5 WARNINGS IGNORED
            </h2>
            <p className="text-xs font-mono text-white/90">
              POWERTRAIN IMMOBILIZED · STARTER RELAY CUT-OFF · MANDATORY CAB INSPECTION
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 font-body text-xs sm:text-sm">
          {/* Status Box */}
          <div className="p-4 rounded-lg bg-[#161b22] border border-[#ef4444] flex items-center justify-between">
            <div>
              <span className="text-xs font-mono text-[#94a3b8] uppercase block">
                MQ-9 SENSOR READOUT (CARBON MONOXIDE / COMBUSTIBLE GAS)
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl font-mono font-bold ${isBelowThreshold ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  {gasState.ppm} PPM
                </span>
                <span className="text-xs font-mono text-[#94a3b8]">
                  / SAFE THRESHOLD: {gasState.thresholdPpm} PPM
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-mono text-[#ef4444] font-bold uppercase block">
                WARNINGS IGNORED
              </span>
              <span className="text-2xl font-mono font-bold text-[#ef4444]">
                {gasState.warningsCount} / {gasState.maxWarningsLimit}
              </span>
            </div>
          </div>

          <p className="text-xs text-[#d4e4fa] leading-relaxed">
            Five consecutive MQ-9 gas leak warnings were unaddressed while vehicle operation was attempted. To prevent driver asphyxiation, Carbon Monoxide poisoning, or hazardous flammable combustion, the engine immobilizer has been permanently tripped.
          </p>

          {/* Remediation Checklist */}
          <div className="space-y-2 p-3.5 rounded-lg bg-[#051424] border border-[#30363d]">
            <span className="text-xs font-mono text-[#f59e0b] uppercase font-bold block">
              MANDATORY RESOLUTION PROCEDURE:
            </span>

            <div className="flex items-center justify-between p-2 rounded bg-[#161b22]">
              <span className="text-xs text-white">
                1. Inspect exhaust manifold seals and gas tanks for physical leaks
              </span>
              <span className="text-[#10b981] text-xs font-mono font-bold">VERIFIED</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-[#161b22]">
              <div>
                <span className="text-xs text-white block">
                  2. Aerate and ventilate cab to purge gas fumes
                </span>
                <span className="text-[11px] font-mono text-[#94a3b8]">
                  Status: {isBelowThreshold ? 'PURGE COMPLETED (< SAFE THRESHOLD)' : 'AWAITING PURGE'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleVentilate}
                className="px-3 py-1.5 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-headline font-bold text-xs flex items-center gap-1.5 shrink-0"
              >
                <Wind className="w-4 h-4" />
                <span>VENTILATE CAB & RE-TEST</span>
              </button>
            </div>
          </div>

          {/* Supervisor / Driver Sign-off */}
          <div className="space-y-2 pt-1">
            <label className="text-xs font-mono text-[#94a3b8] block uppercase">
              3. ENTER SAFETY CLEARANCE PIN TO RESET INTERLOCK:
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                maxLength={8}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Enter 4-digit PIN (e.g. 1234 or 8492)"
                className="flex-1 bg-[#161b22] border border-[#30363d] focus:border-[#f59e0b] rounded px-3 py-2 text-sm font-mono text-white tracking-widest text-center focus:outline-none"
              />
            </div>

            {errorMsg && (
              <div className="p-2 rounded bg-[#ef4444]/20 border border-[#ef4444] text-[#ef4444] text-xs font-mono">
                {errorMsg}
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="bg-[#051424] px-5 py-4 border-t border-[#30363d] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] font-mono text-[#94a3b8]">
            SAFETY AUDIT EVENT WILL BE TIMESTAMPED IN FIRESTORE
          </div>

          <button
            onClick={handleClearLockout}
            className={`w-full sm:w-auto px-6 py-2.5 rounded font-headline font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              isBelowThreshold && pin.length >= 4
                ? 'bg-[#10b981] hover:bg-[#059669] text-black shadow-lg cursor-pointer'
                : 'bg-[#21262d] text-[#64748b] border border-[#30363d] cursor-not-allowed'
            }`}
          >
            <Unlock className="w-4 h-4" />
            <span>RE-ARM IGNITION STARTER RELAY</span>
          </button>
        </div>
      </div>
    </div>
  );
};
