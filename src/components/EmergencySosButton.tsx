import React, { useState, useRef, useEffect } from 'react';
import { AlertOctagon, PhoneCall, XCircle, BellRing, Settings, Check, X } from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';
import {
  DEFAULT_EMERGENCY_PHONE_NUMBER,
  callEmergencyNumber,
  emergencyCallManager,
  EmergencyCallState,
} from '../utils/emergencyDialer';

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
  const [callState, setCallState] = useState<EmergencyCallState>(emergencyCallManager.getState());
  const [isEditingNumber, setIsEditingNumber] = useState<boolean>(false);
  const [numberInput, setNumberInput] = useState<string>(emergencyCallManager.getPhoneNumber());
  const holdIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const HOLD_DURATION_MS = 1500; // 1.5 seconds hold-to-activate

  useEffect(() => {
    const unsub = emergencyCallManager.subscribe((state) => {
      setCallState(state);
      setNumberInput(state.phoneNumber);
    });
    return () => unsub();
  }, []);

  const activePhone = callState.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;

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
        callEmergencyNumber(activePhone, {
          unitNumber: telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId,
          latitude: telemetry.gps.latitude,
          longitude: telemetry.gps.longitude,
          reason: 'SOS',
        });
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

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60).toString().padStart(2, '0');
    const secs = (sec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleSaveNumber = (e: React.FormEvent) => {
    e.preventDefault();
    cabAudio.playSuccessChime();
    emergencyCallManager.setPhoneNumber(numberInput);
    setIsEditingNumber(false);
  };

  return (
    <div className="w-full space-y-2">
      {/* Inline Emergency Number Configurator */}
      {isEditingNumber && (
        <form
          onSubmit={handleSaveNumber}
          className="p-3 rounded-xl bg-[#161b22] border-2 border-[#38bdf8] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-xl"
        >
          <span className="text-xs font-headline font-bold text-white flex items-center gap-1.5">
            <Settings className="w-4 h-4 text-[#38bdf8]" />
            <span>SET EMERGENCY CALL NUMBER:</span>
          </span>
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <input
              type="tel"
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              placeholder="e.g. 82199"
              className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-white font-mono text-sm font-bold focus:outline-none focus:border-[#38bdf8]"
            />
            <button
              type="submit"
              className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#10b981] text-black font-headline font-extrabold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>SAVE</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditingNumber(false)}
              className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[#21262d] text-[#94a3b8] hover:text-white text-xs cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {telemetry.sosActive ? (
        /* Emergency Active Banner & Direct <a href="tel:82199">Call Now</a> */
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#93000a] border-2 sm:border-4 border-white text-white shadow-2xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-white text-[#93000a] flex items-center justify-center font-bold shrink-0">
                <BellRing className="w-6 h-6 sm:w-7 sm:h-7 animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold bg-[#10b981] text-black px-2 py-0.5 rounded uppercase">
                    CALLING {activePhone} · {formatDuration(callState.durationSeconds)}
                  </span>
                  <span className="font-mono text-xs text-white">
                    GPS: {telemetry.gps.latitude.toFixed(4)}, {telemetry.gps.longitude.toFixed(4)}
                  </span>
                </div>
                <h3 className="font-headline font-bold text-lg sm:text-2xl mt-0.5">
                  EMERGENCY CALL ACTIVE ({activePhone})
                </h3>
                <p className="text-xs font-body text-white/90 line-clamp-2">
                  {callState.dispatchTranscript ||
                    'Emergency call initiated via Intent.ACTION_CALL / tel:'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
              {/* Exact <a href="tel:82199">Call Now</a> link requested by user */}
              <a
                href={`tel:${activePhone}`}
                onClick={() => cabAudio.playKeyClick()}
                className="flex-1 sm:flex-none h-12 sm:h-14 px-5 rounded-lg bg-[#10b981] hover:bg-[#059669] text-black font-headline font-extrabold text-sm flex items-center justify-center gap-2 whitespace-nowrap shadow-xl transition-transform active:scale-95 cursor-pointer"
              >
                <PhoneCall className="w-5 h-5 fill-black text-black" />
                <span>Call Now ({activePhone})</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  cabAudio.playKeyClick();
                  emergencyCallManager.endCall();
                  onCancelSos();
                }}
                className="flex-1 sm:flex-none h-12 sm:h-14 px-4 rounded-lg bg-white text-[#93000a] hover:bg-slate-100 font-headline font-bold text-xs sm:text-sm flex items-center justify-center gap-2 whitespace-nowrap shadow-lg cursor-pointer"
              >
                <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-[#93000a]" />
                <span>CANCEL SOS</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Distinctive Full-Width SOS Button + Direct Call Now + Configure Number */
        <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full">
          <button
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            onTouchCancel={cancelHold}
            className="relative flex-1 min-h-[64px] sm:min-h-[72px] rounded-xl bg-[#ef4444] hover:bg-[#dc2626] active:bg-[#b91c1c] text-white border-2 border-white font-headline font-bold text-base sm:text-xl tracking-wider uppercase transition-transform flex items-center justify-between px-4 sm:px-6 shadow-[0_4px_24px_rgba(239,68,68,0.4)] overflow-hidden select-none cursor-pointer"
            aria-label="Emergency SOS button (Hold for 1.5 seconds to trigger)"
          >
            <div
              className="absolute left-0 top-0 bottom-0 bg-[#b91c1c] opacity-80 pointer-events-none transition-all duration-75"
              style={{ width: `${holdProgress}%` }}
            />

            <div className="relative z-10 flex items-center gap-2.5 sm:gap-3">
              <AlertOctagon className="w-7 h-7 sm:w-8 sm:h-8 text-white shrink-0" />
              <div className="text-left">
                <span className="block leading-none text-base sm:text-2xl font-extrabold tracking-tight">
                  EMERGENCY SOS · CALL {activePhone}
                </span>
                <span className="block text-[10px] sm:text-[11px] font-mono tracking-normal text-white/90 uppercase mt-0.5 font-normal">
                  {isHolding
                    ? `HOLD FIRM: ${Math.round(holdProgress)}%`
                    : `HOLD 1.5s OR TAP 'CALL NOW' TO DIAL ${activePhone}`}
                </span>
              </div>
            </div>
          </button>

          {/* Direct <a href="tel:82199">Call Now</a> & Configure Number buttons */}
          <div className="flex items-stretch gap-2">
            <a
              href={`tel:${activePhone}`}
              onClick={() => {
                cabAudio.playKeyClick();
                emergencyCallManager.triggerNativeTelCall(activePhone);
              }}
              className="flex-1 sm:flex-none min-h-[52px] px-4 rounded-xl bg-[#10b981] hover:bg-[#059669] text-black font-headline font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer whitespace-nowrap"
            >
              <PhoneCall className="w-4 h-4 fill-black text-black shrink-0" />
              <span>Call Now ({activePhone})</span>
            </a>

            <button
              type="button"
              onClick={() => {
                cabAudio.playKeyClick();
                setNumberInput(activePhone);
                setIsEditingNumber(!isEditingNumber);
              }}
              className="min-h-[52px] px-3.5 rounded-xl bg-[#1c2b3c] hover:bg-[#273647] text-[#38bdf8] border-2 border-[#38bdf8]/60 font-headline font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Configure Emergency Phone Number"
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>SET NUMBER</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
