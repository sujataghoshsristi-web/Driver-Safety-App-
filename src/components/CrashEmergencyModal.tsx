import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  PhoneCall,
  PhoneIncoming,
  XCircle,
  Mic,
  MicOff,
  Radio,
  Smartphone,
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';
import {
  callEmergencyNumber,
  emergencyCallManager,
  EmergencyCallState,
} from '../utils/emergencyDialer';
import { LiveCallLocationMap } from './LiveCallLocationMap';

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
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [callState, setCallState] = useState<EmergencyCallState>(emergencyCallManager.getState());

  useEffect(() => {
    const unsub = emergencyCallManager.subscribe(setCallState);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Auto-trigger real two-way Internet voice call + live Phone GPS stream to Laptop
      callEmergencyNumber(emergencyCallManager.getPhoneNumber(), {
        unitNumber: telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId,
        driverId: telemetry.driverId,
        impactG,
        knockCount: telemetry.hardwareSensors.knockCount,
        speedKmh: telemetry.speedKmh,
        accuracy: telemetry.gps.accuracyM,
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

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60).toString().padStart(2, '0');
    const secs = (sec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const activePhone = callState.phoneNumber || '82199';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl bg-[#1b0507] border-4 border-[#ef4444] rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.7)] overflow-hidden flex flex-col my-auto">
        {/* Urgent Header */}
        <div className="bg-[#93000a] text-white p-3.5 sm:p-5 text-center space-y-1 border-b-2 border-white/20">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white text-[#93000a] shadow-xl animate-bounce">
            <AlertOctagon className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[11px] font-mono px-3 py-0.5 rounded-full bg-black/40 text-[#4edea3] font-bold tracking-widest uppercase inline-block mb-1">
              {callState.peerConnected
                ? `PHONE ↔ LAPTOP REAL 2-WAY VOICE + LIVE MAP CONNECTED · ${activePhone}`
                : `CALLING LAPTOP VIA INTERNET SERVER (2 IPs) · ${activePhone}`}
            </span>
            <h1 className="text-lg sm:text-2xl font-headline font-extrabold text-white tracking-tight">
              EMERGENCY CALLING LAPTOP ({activePhone}) + LIVE GPS MAP
            </h1>
            <p className="text-xs font-mono text-red-100">
              4-Knock / Sensor Crash Trigger (<strong className="text-white underline">{impactG.toFixed(2)}G</strong>) · Elapsed: {secondsElapsed}s
            </p>
          </div>
        </div>

        {/* Real Two-Way Live Voice + Live Phone Location Map Panel */}
        <div className="p-3.5 sm:p-5 space-y-3 font-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                cabAudio.playSuccessChime();
                emergencyCallManager.answerIncomingCall(activePhone);
              }}
              className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#38bdf8] hover:bg-[#0284c7] text-[#051424] font-headline font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-2xl transition-all cursor-pointer select-none active:scale-95"
            >
              <PhoneIncoming className="w-4 h-4 text-[#051424] shrink-0" />
              <span>ANSWER ON LAPTOP ({activePhone})</span>
            </button>

            <a
              href={`tel:${activePhone}`}
              onClick={() => {
                cabAudio.playKeyClick();
                emergencyCallManager.dialCellularSimCall(activePhone);
              }}
              className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#10b981] hover:bg-[#059669] text-black font-headline font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-2xl transition-all cursor-pointer select-none active:scale-95"
            >
              <Smartphone className="w-4 h-4 text-black shrink-0" />
              <span>DIAL REAL SIM CALL ({activePhone})</span>
            </a>
          </div>

          <div className="p-3 rounded-xl bg-[#071a12] border-2 border-[#10b981] shadow-[0_0_25px_rgba(16,185,129,0.25)] space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-[#10b981] text-black flex items-center justify-center shadow-md">
                  <PhoneCall className="w-4 h-4 fill-black text-black animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#10b981] animate-ping" />
                    <span className="font-mono text-xs font-extrabold uppercase tracking-wider text-[#10b981]">
                      {callState.peerConnected
                        ? `PHONE ↔ LAPTOP VOICE CONNECTED (${activePhone})`
                        : `RINGING LAPTOP OVER INTERNET (${activePhone})`}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-[#94a3b8]">
                    {callState.peerConnected
                      ? 'Talk on Laptop or Phone — real two-way microphone & speaker audio is live!'
                      : 'Open app on your Laptop and click "ANSWER ON LAPTOP" (or enable Laptop Auto-Answer)'}
                  </p>
                </div>
              </div>

              <div className="px-3 py-1 rounded bg-black/60 border border-[#10b981]/40 font-mono text-xs font-extrabold text-[#10b981]">
                {callState.peerConnected ? `LIVE · ${formatDuration(callState.durationSeconds)}` : 'RINGING...'}
              </div>
            </div>

            {/* Real Two-Way Microphone & Remote Speaker Audio Level Bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1 bg-black/50 p-2 rounded-lg border border-[#10b981]/30">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#94a3b8]">
                  <span className="flex items-center gap-1 text-[#4edea3]">
                    <Mic className="w-3.5 h-3.5 animate-pulse" />
                    {callState.isMuted ? 'YOUR MIC MUTED' : 'YOUR LIVE MICROPHONE'}
                  </span>
                  <span>{callState.isMuted ? 0 : callState.micLevel}%</span>
                </div>
                <div className="w-full h-2 bg-black/70 rounded-full overflow-hidden border border-[#10b981]/30 p-0.5">
                  <div
                    className="h-full bg-[#10b981] rounded-full transition-all duration-75"
                    style={{
                      width: `${callState.isMuted ? 0 : callState.micLevel}%`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1 bg-black/50 p-2 rounded-lg border border-[#38bdf8]/30">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#94a3b8]">
                  <span className="flex items-center gap-1 text-[#38bdf8]">
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    OTHER DEVICE VOICE (SPEAKER)
                  </span>
                  <span>{callState.peerConnected ? `${callState.remoteVoiceLevel}%` : 'WAITING'}</span>
                </div>
                <div className="w-full h-2 bg-black/70 rounded-full overflow-hidden border border-[#38bdf8]/30 p-0.5">
                  <div
                    className="h-full bg-[#38bdf8] rounded-full transition-all duration-75"
                    style={{
                      width: `${callState.remoteVoiceLevel}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Mute Mic Button */}
            <button
              type="button"
              onClick={() => {
                cabAudio.playKeyClick();
                emergencyCallManager.toggleMute();
              }}
              className={`w-full py-2 px-3 rounded-lg font-headline font-bold text-xs flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                callState.isMuted
                  ? 'bg-[#ef4444]/20 border-[#ef4444] text-[#ff938c]'
                  : 'bg-[#10b981]/20 border-[#10b981]/50 text-white hover:bg-[#10b981]/30'
              }`}
            >
              {callState.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-[#10b981]" />}
              <span>{callState.isMuted ? 'UNMUTE YOUR MIC' : 'YOUR MIC LIVE (TAP TO MUTE)'}</span>
            </button>
          </div>

          {/* Interactive Real-Time Phone GPS Location Map */}
          <LiveCallLocationMap
            callState={callState}
            fallbackLatitude={telemetry.gps.latitude}
            fallbackLongitude={telemetry.gps.longitude}
            fallbackUnit={telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId}
          />

          {/* Stand Down / Cancel Call */}
          <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-[#94a3b8]">
              End emergency call &amp; reset knock counter:
            </span>

            <button
              type="button"
              onClick={() => {
                cabAudio.playSuccessChime();
                emergencyCallManager.endCall();
                onCancelCrash();
              }}
              className="w-full sm:w-auto px-5 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white font-headline font-bold text-xs flex items-center justify-center gap-2 border border-[#30363d] transition-colors cursor-pointer"
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
