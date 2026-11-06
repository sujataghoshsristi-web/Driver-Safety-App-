import React, { useState, useRef, useEffect } from 'react';
import { AlertOctagon, PhoneCall, ShieldAlert, XCircle, BellRing } from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';

interface EmergencySosButtonProps {
  telemetry: TelemetryData;
  onTriggerSos: () => void;
  onCancelSos: () => void;
}

export const EmergencySosButton: React.FC<EmergencySosButtonProps> = ({
  telemetry,
  onTriggerSos,
  onCancelSos,
}) => {
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const holdIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const HOLD_DURATION_MS = 1500; // 1.5 seconds hold-to-activate

  const startHold = () => {
    if (telemetry.sosActive) return;
    setIsHolding(true);
    startTimeRef.current = Date.now();
    cabAudio.playKeyClick();

    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);

    holdIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        setIsHolding(false);
        setHoldProgress(0);
        cabAudio.playEmergencyAlarm();
        onTriggerSos();
      }
    }, 30);
  };

  const cancelHold = () => {
    if (telemetry.sosActive) return;
    setIsHolding(false);
    setHoldProgress(0);
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    };
  }, []);

  return (
    <div className="w-full">
      {telemetry.sosActive ? (
        /* Emergency Active Banner & Cancel False Alarm */
        <div className="p-4 rounded bg-[#93000a] border-4 border-white text-white shadow-2xl animate-pulse">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded bg-white text-[#93000a] flex items-center justify-center font-bold">
                <BellRing className="w-7 h-7 animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-white text-[#93000a] px-2 py-0.5 rounded uppercase">
                    SOS DISPATCH BEACON ACTIVE
                  </span>
                  <span className="font-mono text-xs text-white">
                    GPS: {telemetry.gps.latitude.toFixed(4)}, {telemetry.gps.longitude.toFixed(4)}
                  </span>
                </div>
                <h3 className="font-headline font-bold text-xl sm:text-2xl mt-1">
                  DISPATCH NOTIFIED · EMERGENCY UNITS EN ROUTE
                </h3>
                <p className="text-xs font-body text-white/90">
                  Ignition automatically cut. Real-time telemetry broadcasting to Fleet HQ.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => {
                  cabAudio.playEmergencyAlarm();
                }}
                className="flex-1 sm:flex-none h-14 px-4 rounded bg-white/20 hover:bg-white/30 text-white border border-white font-mono text-xs font-bold"
              >
                SIREN ON
              </button>

              <button
                onClick={() => {
                  cabAudio.playKeyClick();
                  onCancelSos();
                }}
                className="flex-1 sm:flex-none h-14 px-6 rounded bg-white text-[#93000a] hover:bg-slate-100 font-headline font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap shadow-lg"
              >
                <XCircle className="w-5 h-5 text-[#93000a]" />
                <span>CANCEL SOS (STAND DOWN)</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Distinctive Full-Width Minimum 72px SOS Button */
        <div className="relative w-full">
          <button
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            onTouchCancel={cancelHold}
            className="relative w-full min-h-[72px] sm:min-h-[76px] rounded bg-[#ef4444] hover:bg-[#dc2626] active:bg-[#b91c1c] text-white border-4 border-white font-headline font-bold text-lg sm:text-xl tracking-wider uppercase transition-transform flex items-center justify-between px-6 shadow-[0_4px_24px_rgba(239,68,68,0.4)] overflow-hidden select-none cursor-pointer"
            aria-label="Emergency SOS button (Hold for 1.5 seconds to trigger)"
          >
            {/* Visual Fill progress bar for the 1.5s hold */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-[#b91c1c] opacity-80 pointer-events-none transition-all duration-75"
              style={{ width: `${holdProgress}%` }}
            />

            <div className="relative z-10 flex items-center gap-3">
              <AlertOctagon className="w-8 h-8 text-white shrink-0" />
              <div className="text-left">
                <span className="block leading-none text-xl sm:text-2xl font-extrabold tracking-tight">
                  EMERGENCY SOS
                </span>
                <span className="block text-[11px] font-mono tracking-normal text-white/90 uppercase mt-0.5 font-normal">
                  {isHolding
                    ? `HOLD FIRM: ${Math.round(holdProgress)}% (PREVENTING FALSE CAB TRIGGERS)`
                    : 'HOLD 1.5 SECONDS TO BROADCAST MAYDAY TO DISPATCH'}
                </span>
              </div>
            </div>

            <div className="relative z-10 hidden sm:flex items-center gap-2 font-mono text-xs bg-black/30 px-3 py-1.5 rounded border border-white/40">
              <PhoneCall className="w-4 h-4 text-white" />
              <span>911 / HQ BEACON</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
