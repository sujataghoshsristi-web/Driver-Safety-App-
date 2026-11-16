import React, { useState, useRef, useEffect } from 'react';
import {
  AlertOctagon,
  PhoneCall,
  PhoneIncoming,
  XCircle,
  BellRing,
  Settings,
  Check,
  X,
  Mic,
  MicOff,
  Radio,
  Smartphone,
  Laptop,
  MapPin,
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';
import {
  DEFAULT_EMERGENCY_PHONE_NUMBER,
  callEmergencyNumber,
  emergencyCallManager,
  EmergencyCallState,
} from '../utils/emergencyDialer';
import { LiveCallLocationMap } from './LiveCallLocationMap';

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

  const HOLD_DURATION_MS = 1200;

  useEffect(() => {
    const unsub = emergencyCallManager.subscribe((state) => {
      setCallState(state);
      setNumberInput(state.phoneNumber);
    });
    return () => unsub();
  }, []);

  const activePhone = callState.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;

  const triggerInstantSosCall = () => {
    cabAudio.playEmergencyAlarm();
    callEmergencyNumber(activePhone, {
      unitNumber: telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId,
      driverId: telemetry.driverId,
      speedKmh: telemetry.speedKmh,
      accuracy: telemetry.gps.accuracyM,
      latitude: telemetry.gps.latitude,
      longitude: telemetry.gps.longitude,
      reason: 'SOS',
    });
    onTriggerSos();
  };

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
        triggerInstantSosCall();
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

  const isCallActive =
    telemetry.sosActive || callState.status === 'ringing' || callState.status === 'connected';

  return (
    <div className="w-full space-y-2.5">
      {/* Incoming Call on Laptop from Phone (Over Internet Server / 2 IPs) + Real Location Map */}
      {callState.incomingCallAvailable && callState.status === 'idle' && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#064e3b] border-2 sm:border-4 border-[#10b981] text-white shadow-[0_0_35px_rgba(16,185,129,0.6)] space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#10b981] text-black flex items-center justify-center shrink-0 animate-bounce">
                <PhoneIncoming className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] font-bold bg-[#10b981] text-black px-2 py-0.5 rounded uppercase">
                    INCOMING PHONE EMERGENCY CALL VIA INTERNET SERVER ({activePhone})
                  </span>
                  {callState.remoteLocation && (
                    <span className="font-mono text-[10px] font-bold bg-black/50 text-[#38bdf8] px-2 py-0.5 rounded flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#ef4444]" />
                      GPS: {callState.remoteLocation.latitude.toFixed(5)},{' '}
                      {callState.remoteLocation.longitude.toFixed(5)}
                    </span>
                  )}
                </div>
                <h3 className="font-headline font-extrabold text-base sm:text-xl mt-0.5">
                  {callState.incomingCallerInfo || `Phone Calling Laptop on Line ${activePhone}`}
                </h3>
                <p className="text-xs text-emerald-100">
                  Click Answer below to talk to the Phone using your Laptop microphone &amp; view its live location on the map!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                cabAudio.playSuccessChime();
                emergencyCallManager.answerIncomingCall(activePhone);
              }}
              className="w-full sm:w-auto min-h-[52px] px-6 py-3 rounded-xl bg-[#10b981] hover:bg-[#34d399] text-black font-headline font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-2xl cursor-pointer animate-pulse"
            >
              <PhoneCall className="w-5 h-5 fill-black" />
              <span>ANSWER PHONE CALL ON LAPTOP ({activePhone})</span>
            </button>
          </div>

          {/* Live Map Preview even while ringing! */}
          <LiveCallLocationMap
            callState={callState}
            fallbackLatitude={telemetry.gps.latitude}
            fallbackLongitude={telemetry.gps.longitude}
            fallbackUnit={telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId}
          />
        </div>
      )}

      {/* Inline Emergency Number Configurator */}
      {isEditingNumber && (
        <form
          onSubmit={handleSaveNumber}
          className="p-3 rounded-xl bg-[#161b22] border-2 border-[#38bdf8] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-xl"
        >
          <span className="text-xs font-headline font-bold text-white flex items-center gap-1.5">
            <Settings className="w-4 h-4 text-[#38bdf8]" />
            <span>SET EMERGENCY CALL NUMBER / CHANNEL ID:</span>
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

      {isCallActive ? (
        /* Active Two-Way Voice Call + Real-Time Phone GPS Location Map */
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#93000a] border-2 sm:border-4 border-white text-white shadow-2xl space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-[#10b981] text-black flex items-center justify-center font-bold shrink-0">
                <BellRing className="w-6 h-6 sm:w-7 sm:h-7 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold bg-[#10b981] text-black px-2 py-0.5 rounded uppercase">
                    {callState.peerConnected
                      ? `PHONE ↔ LAPTOP 2-WAY VOICE LIVE (${activePhone}) · ${formatDuration(callState.durationSeconds)}`
                      : `CALLING LAPTOP OVER INTERNET SERVER (${activePhone})`}
                  </span>
                  <span className="font-mono text-xs bg-black/40 px-2 py-0.5 rounded text-[#38bdf8]">
                    {callState.role === 'callee' ? 'LAPTOP DISPATCH MODE' : 'PHONE CALLER MODE'}
                  </span>
                </div>
                <h3 className="font-headline font-bold text-lg sm:text-2xl mt-0.5">
                  {callState.peerConnected
                    ? `LIVE VOICE CONNECTED (${activePhone}) — SPEAK NOW`
                    : `RINGING LAPTOP (${activePhone}) — CLICK "ANSWER" ON LAPTOP`}
                </h3>
                <p className="text-xs font-body text-white/90">
                  {callState.dispatchTranscript}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              <button
                type="button"
                onClick={() => {
                  cabAudio.playKeyClick();
                  emergencyCallManager.toggleMute();
                }}
                className="flex-1 sm:flex-none h-11 px-3.5 rounded-lg bg-black/50 hover:bg-black/70 text-white border border-white/40 font-headline font-bold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                {callState.isMuted ? (
                  <MicOff className="w-4 h-4 text-[#ff938c]" />
                ) : (
                  <Mic className="w-4 h-4 text-[#10b981]" />
                )}
                <span>{callState.isMuted ? 'UNMUTE MIC' : 'MIC LIVE'}</span>
              </button>

              <a
                href={`tel:${activePhone}`}
                onClick={() => emergencyCallManager.dialCellularSimCall(activePhone)}
                className="flex-1 sm:flex-none h-11 px-3.5 rounded-lg bg-[#10b981] hover:bg-[#059669] text-black font-headline font-extrabold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xl cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-black" />
                <span>SIM CALL ({activePhone})</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  cabAudio.playKeyClick();
                  emergencyCallManager.endCall();
                  onCancelSos();
                }}
                className="flex-1 sm:flex-none h-11 px-3.5 rounded-lg bg-white text-[#93000a] hover:bg-slate-100 font-headline font-bold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shadow-lg cursor-pointer"
              >
                <XCircle className="w-4 h-4 text-[#93000a]" />
                <span>END CALL</span>
              </button>
            </div>
          </div>

          {/* Two-Way Live Voice Meters (Your Mic + Remote Speaker Voice) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-white/20 text-[11px] font-mono">
            <div className="bg-black/40 p-2 rounded border border-white/15">
              <div className="flex justify-between mb-1">
                <span className="text-[#4edea3] flex items-center gap-1">
                  <Mic className="w-3.5 h-3.5" /> YOUR MICROPHONE ({callState.role === 'callee' ? 'LAPTOP' : 'PHONE'}):
                </span>
                <span>{callState.isMuted ? 'MUTED' : `${callState.micLevel}%`}</span>
              </div>
              <div className="w-full h-2 bg-black/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#10b981] transition-all duration-75"
                  style={{ width: `${callState.isMuted ? 0 : callState.micLevel}%` }}
                />
              </div>
            </div>

            <div className="bg-black/40 p-2 rounded border border-white/15">
              <div className="flex justify-between mb-1">
                <span className="text-[#38bdf8] flex items-center gap-1">
                  <Radio className="w-3.5 h-3.5" /> {callState.role === 'callee' ? 'PHONE' : 'LAPTOP'} VOICE (SPEAKER):
                </span>
                <span>
                  {callState.peerConnected ? `${callState.remoteVoiceLevel}% LIVE` : 'RINGING...'}
                </span>
              </div>
              <div className="w-full h-2 bg-black/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#38bdf8] transition-all duration-75"
                  style={{ width: `${callState.remoteVoiceLevel}%` }}
                />
              </div>
            </div>
          </div>

          {/* Real-Time Phone GPS Location Map right inside the Active Call Banner */}
          <LiveCallLocationMap
            callState={callState}
            fallbackLatitude={telemetry.gps.latitude}
            fallbackLongitude={telemetry.gps.longitude}
            fallbackUnit={telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId}
          />
        </div>
      ) : (
        /* Full-Width SOS Button + Call Now + Laptop Answer / Auto-Answer + Configure Number */
        <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full">
          <button
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            onTouchCancel={cancelHold}
            className="relative flex-1 min-h-[64px] sm:min-h-[72px] rounded-xl bg-[#ef4444] hover:bg-[#dc2626] active:bg-[#b91c1c] text-white border-2 border-white font-headline font-bold text-base sm:text-xl tracking-wider uppercase transition-transform flex items-center justify-between px-4 sm:px-6 shadow-[0_4px_24px_rgba(239,68,68,0.4)] overflow-hidden select-none cursor-pointer"
            aria-label="Emergency SOS button"
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
                    ? `CALLING LAPTOP + STREAMING GPS: ${Math.round(holdProgress)}%`
                    : `4 KNOCKS OR TAP 'CALL NOW' → CALLS LAPTOP OVER INTERNET (2 IPs) + LIVE MAP`}
                </span>
              </div>
            </div>
          </button>

          {/* Call Now, Laptop Answer / Auto-Answer & Configure Number buttons */}
          <div className="flex items-stretch gap-2 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={triggerInstantSosCall}
              className="flex-1 sm:flex-none min-h-[52px] px-4 rounded-xl bg-[#10b981] hover:bg-[#059669] active:scale-95 text-black font-headline font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer whitespace-nowrap"
            >
              <PhoneCall className="w-4 h-4 fill-black text-black shrink-0" />
              <span>Call Now ({activePhone})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                cabAudio.playSuccessChime();
                emergencyCallManager.answerIncomingCall(activePhone);
              }}
              className="flex-1 sm:flex-none min-h-[52px] px-3.5 rounded-xl bg-[#0f2942] hover:bg-[#163a5c] text-[#38bdf8] border-2 border-[#38bdf8] font-headline font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Click on Laptop to answer incoming Phone call and view live Phone GPS Map"
            >
              <PhoneIncoming className="w-4 h-4 shrink-0" />
              <span>ANSWER ON LAPTOP</span>
            </button>

            <button
              type="button"
              onClick={() => {
                cabAudio.playKeyClick();
                emergencyCallManager.setAutoAnswerOnLaptop(!callState.autoAnswerOnLaptop);
              }}
              className={`min-h-[52px] px-3 rounded-xl font-headline font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap border-2 ${
                callState.autoAnswerOnLaptop
                  ? 'bg-[#10b981] text-black border-white'
                  : 'bg-[#161b22] text-[#94a3b8] border-[#30363d] hover:text-white'
              }`}
              title="When enabled on your Laptop, incoming calls from the Phone auto-connect with live voice & GPS map!"
            >
              <Laptop className="w-4 h-4 shrink-0" />
              <span>{callState.autoAnswerOnLaptop ? 'LAPTOP AUTO-ANSWER: ON' : 'LAPTOP AUTO-ANSWER'}</span>
            </button>

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
