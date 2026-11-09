import React, { useEffect, useState } from 'react';
import { 
  AlertOctagon, 
  PhoneCall, 
  MapPin, 
  XCircle, 
  Volume2,
  Mic,
  MicOff,
  Radio,
  Copy,
  Check
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';
import {
  EMERGENCY_PHONE_NUMBER,
  callEmergencyNumber,
  emergencyCallManager,
  EmergencyCallState,
} from '../utils/emergencyDialer';

interface CrashEmergencyModalProps {
  isOpen: boolean;
  telemetry: TelemetryData;
  impactG: number;
  onCancelCrash: () => void;
}

export const CrashEmergencyModal: React.FC<CrashEmergencyModalProps> = ({
  isOpen,
  telemetry,
  impactG,
  onCancelCrash,
}) => {
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [callState, setCallState] = useState<EmergencyCallState>(emergencyCallManager.getState());

  useEffect(() => {
    const unsub = emergencyCallManager.subscribe(setCallState);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Auto-trigger emergency call to configured number
      callEmergencyNumber(emergencyCallManager.getPhoneNumber(), {
        unitNumber: telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId,
        impactG,
        latitude: telemetry.gps.latitude,
        longitude: telemetry.gps.longitude,
        reason: 'CRASH',
      });
      cabAudio.playEmergencyAlarm();
      if ('vibrate' in navigator) {
        navigator.vibrate([500, 150, 500, 150, 1000]);
      }

      const timer = setInterval(() => {
        setSecondsElapsed((s) => s + 1);
      }, 1000);

      return () => clearInterval(timer);
    } else {
      setSecondsElapsed(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const coordsString = `LAT ${telemetry.gps.latitude.toFixed(6)}, LON ${telemetry.gps.longitude.toFixed(6)}`;

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60).toString().padStart(2, '0');
    const secs = (sec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleCopyCoords = () => {
    cabAudio.playKeyClick();
    navigator.clipboard.writeText(coordsString);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const activePhone = callState.phoneNumber || '82199';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-xl bg-[#1b0507] border-4 border-[#ef4444] rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.7)] overflow-hidden flex flex-col">
        {/* Urgent Header */}
        <div className="bg-[#93000a] text-white p-4 sm:p-5 text-center space-y-1.5 border-b-2 border-white/20">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white text-[#93000a] shadow-xl animate-bounce">
            <AlertOctagon className="w-9 h-9 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[11px] font-mono px-3 py-0.5 rounded-full bg-black/40 text-[#4edea3] font-bold tracking-widest uppercase inline-block mb-1">
              INSTANT AUTO-CALL TRIGGERED · {activePhone}
            </span>
            <h1 className="text-xl sm:text-3xl font-headline font-extrabold text-white tracking-tight">
              CRASH DETECTED — CALLING {activePhone}
            </h1>
            <p className="text-xs sm:text-sm font-mono text-red-100">
              Impact shock of <strong className="text-white underline">{impactG.toFixed(2)}G</strong> registered on cab accelerometer
            </p>
          </div>
        </div>

        {/* Direct <a href="tel:82199">Call Now</a> & Live Speakerphone Panel */}
        <div className="p-3.5 sm:p-6 space-y-3.5 font-body">
          {/* Direct <a href="tel:82199">Call Now</a> Anchor Button */}
          <a
            href={`tel:${activePhone}`}
            onClick={() => cabAudio.playKeyClick()}
            className="w-full min-h-[60px] px-5 py-3.5 rounded-xl bg-[#10b981] hover:bg-[#059669] text-black font-headline font-extrabold text-lg sm:text-xl flex items-center justify-center gap-3 shadow-2xl transition-all cursor-pointer select-none active:scale-95"
          >
            <PhoneCall className="w-6 h-6 text-black fill-black" />
            <span>Call Now ({activePhone})</span>
          </a>

          <div className="p-3.5 sm:p-4 rounded-xl bg-[#071a12] border-2 border-[#10b981] shadow-[0_0_25px_rgba(16,185,129,0.25)] space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-[#10b981] text-black flex items-center justify-center shadow-md">
                  <PhoneCall className="w-5 h-5 fill-black text-black animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#10b981] animate-ping" />
                    <span className="font-mono text-xs font-extrabold uppercase tracking-wider text-[#10b981]">
                      LIVE CONNECTED TO {activePhone} · SPEAKERPHONE ON
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-[#94a3b8]">
                    Instant 0ms two-way audio + tel:{activePhone} active
                  </p>
                </div>
              </div>

              <div className="px-3 py-1 rounded bg-black/60 border border-[#10b981]/40 font-mono text-sm font-extrabold text-[#10b981]">
                LIVE · {formatDuration(callState.durationSeconds)}
              </div>
            </div>

            {/* Live Microphone & Speaker Audio Level Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#94a3b8]">
                <span className="flex items-center gap-1 text-[#4edea3]">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  {callState.isMuted
                    ? 'CAB MICROPHONE MUTED'
                    : 'CAB HANDS-FREE MIC & SPEAKERPHONE LIVE'}
                </span>
                <span>VOICE LEVEL: {callState.isMuted ? 0 : Math.max(18, callState.micLevel)}%</span>
              </div>
              <div className="w-full h-2.5 bg-black/70 rounded-full overflow-hidden border border-[#10b981]/30 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-[#10b981] via-[#34d399] to-[#f59e0b] rounded-full transition-all duration-75"
                  style={{
                    width: `${callState.isMuted ? 0 : Math.max(22, callState.micLevel)}%`,
                  }}
                />
              </div>
            </div>

            {/* Live Dispatch Voice Transcript */}
            <div className="p-2.5 rounded-lg bg-black/60 border border-[#10b981]/30 font-mono text-xs text-[#d4e4fa] flex items-start gap-2">
              <Volume2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5 animate-pulse" />
              <div className=" leading-relaxed">
                <span className="text-[#10b981] font-bold uppercase block text-[10px]">
                  {activePhone} CENTRAL DISPATCH OPERATOR (SPEAKERPHONE):
                </span>
                <span>"{callState.dispatchTranscript}"</span>
              </div>
            </div>

            {/* Hands-free Call Controls (Mute Mic / Re-broadcast) */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  cabAudio.playKeyClick();
                  emergencyCallManager.toggleMute();
                }}
                className={`flex-1 py-2.5 px-3 rounded-lg font-headline font-bold text-xs flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                  callState.isMuted
                    ? 'bg-[#ef4444]/20 border-[#ef4444] text-[#ff938c]'
                    : 'bg-[#10b981]/20 border-[#10b981]/50 text-white hover:bg-[#10b981]/30'
                }`}
              >
                {callState.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-[#10b981]" />}
                <span>{callState.isMuted ? 'UNMUTE CAB MIC' : 'MIC LIVE (MUTE)'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  cabAudio.playKeyClick();
                  emergencyCallManager.reannounceDispatch();
                }}
                className="flex-1 py-2.5 px-3 rounded-lg bg-[#162737] hover:bg-[#1c3347] text-[#ffc174] border border-[#f59e0b]/40 font-headline font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Volume2 className="w-4 h-4 text-[#f59e0b]" />
                <span>REPEAT GPS VOICE</span>
              </button>
            </div>
          </div>

          {/* Vehicle and GPS telemetry for dispatcher */}
          <div className="p-4 rounded-xl bg-[#0a0203] border border-[#ef4444]/40 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-[#94a3b8] border-b border-white/10 pb-2">
              <span className="text-white font-bold">INCIDENT LOCATION & UNIT DATA</span>
              <span className="text-[#ff938c]">ELAPSED: {secondsElapsed}s</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-slate-200">
              <div className="bg-[#1b0507] p-2 rounded border border-[#ef4444]/30">
                <span className="text-[10px] text-[#94a3b8] block">VEHICLE ASSET:</span>
                <span className="font-bold text-white">{telemetry.selectedVehicle?.name || 'Commercial Unit'}</span>
                <span className="text-[#ffc174] block">{telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId}</span>
              </div>

              <div className="bg-[#1b0507] p-2 rounded border border-[#ef4444]/30">
                <span className="text-[10px] text-[#94a3b8] block">DRIVER ID:</span>
                <span className="font-bold text-white">{telemetry.driverId}</span>
                <span className="text-[#4edea3] block">RELAY: CUT (SAFE)</span>
              </div>
            </div>

            {/* GPS with 1-click copy */}
            <div className="bg-[#1b0507] p-2.5 rounded border border-[#ef4444]/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <MapPin className="w-4 h-4 text-[#ef4444] shrink-0" />
                <span className="text-white font-bold truncate">{coordsString}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyCoords}
                className="px-2.5 py-1 rounded bg-[#2a080c] hover:bg-[#3f0c12] text-[#ffc174] border border-[#ef4444]/40 shrink-0 flex items-center gap-1 transition-colors"
              >
                {copiedCoords ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCoords ? 'COPIED' : 'COPY GPS'}</span>
              </button>
            </div>
          </div>

          {/* Stand Down / Cancel False Alarm */}
          <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[11px] font-mono text-[#94a3b8]">
              If this was a false shock trigger or pothole impact:
            </span>

            <button
              type="button"
              onClick={() => {
                cabAudio.playSuccessChime();
                emergencyCallManager.endCall();
                onCancelCrash();
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-headline font-bold text-xs flex items-center justify-center gap-2 border border-[#30363d] transition-colors cursor-pointer"
            >
              <XCircle className="w-4 h-4 text-[#94a3b8]" />
              <span>END CALL · DRIVER OK</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
