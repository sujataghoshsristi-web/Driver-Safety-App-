import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Mic,
  MicOff,
  Radio,
  MapPin,
  Settings,
  Check,
  X,
  Smartphone,
  Laptop,
  LogOut,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import {
  DEFAULT_EMERGENCY_PHONE_NUMBER,
  callEmergencyNumber,
  emergencyCallManager,
  EmergencyCallState,
} from '../utils/emergencyDialer';
import { cabAudio } from '../utils/audio';
import { LiveCallLocationMap } from './LiveCallLocationMap';
import { FleetUserProfile } from '../context/AuthContext';

interface LaptopControlRoomViewProps {
  telemetry: TelemetryData;
  isAudioMuted: boolean;
  onToggleAudio: () => void;
  onSwitchToPhoneDocker: () => void;
  userProfile?: FleetUserProfile | null;
  onLogout?: () => void;
}

export const LaptopControlRoomView: React.FC<LaptopControlRoomViewProps> = ({
  telemetry,
  isAudioMuted,
  onToggleAudio,
  onSwitchToPhoneDocker,
  userProfile,
  onLogout,
}) => {
  const [callState, setCallState] = useState<EmergencyCallState>(emergencyCallManager.getState());
  const [isEditingNumber, setIsEditingNumber] = useState(false);
  const [numberInput, setNumberInput] = useState(emergencyCallManager.getPhoneNumber());

  useEffect(() => {
    const unsub = emergencyCallManager.subscribe((state) => {
      setCallState(state);
      setNumberInput(state.phoneNumber);
    });
    return () => unsub();
  }, []);

  const activePhone = callState.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;
  const isCallActive = callState.status === 'ringing' || callState.status === 'connected';
  const liveLoc = callState.remoteLocation;
  const lat = liveLoc?.latitude || telemetry.gps.latitude || 37.7749;
  const lon = liveLoc?.longitude || telemetry.gps.longitude || -122.4194;
  const unitId = liveLoc?.unitNumber || telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId;
  const driverId = liveLoc?.driverId || telemetry.driverId;

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
    <div className="min-h-screen bg-[#051424] text-[#d4e4fa] flex flex-col font-body antialiased hud-grid">
      {/* Control Room Header Bar */}
      <header className="bg-[#0d1c2d] border-b-2 border-[#38bdf8]/40 px-4 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#38bdf8] text-[#051424] flex items-center justify-center font-headline font-extrabold text-lg shadow">
              <Laptop className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-headline font-extrabold text-white text-base sm:text-xl tracking-tight uppercase">
                  DriveLock Control Room (Laptop Dispatch)
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#10b981]/20 text-[#10b981] border border-[#10b981] font-bold">
                  LINE: {activePhone}
                </span>
              </div>
              <p className="text-xs font-mono text-[#94a3b8]">
                2-IP INTERNET VOICE RECEIVER &amp; REAL-TIME CAB PHONE GPS TRACKING CONSOLE
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Auto-Answer Toggle */}
            <button
              type="button"
              onClick={() => {
                cabAudio.playKeyClick();
                emergencyCallManager.setAutoAnswerOnLaptop(!callState.autoAnswerOnLaptop);
              }}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg font-headline font-bold text-xs flex items-center gap-1.5 cursor-pointer border ${
                callState.autoAnswerOnLaptop
                  ? 'bg-[#10b981] text-black border-white font-extrabold'
                  : 'bg-[#161b22] text-[#94a3b8] border-[#30363d] hover:text-white'
              }`}
            >
              <PhoneIncoming className="w-3.5 h-3.5" />
              <span>AUTO-ANSWER: {callState.autoAnswerOnLaptop ? 'ON' : 'OFF'}</span>
            </button>

            {/* Set Emergency Line Number */}
            <button
              type="button"
              onClick={() => {
                cabAudio.playKeyClick();
                setNumberInput(activePhone);
                setIsEditingNumber(!isEditingNumber);
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#1c2b3c] hover:bg-[#273647] text-[#38bdf8] border border-[#38bdf8]/50 font-headline font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>SET LINE # ({activePhone})</span>
            </button>

            {/* Audio Mute */}
            <button
              type="button"
              onClick={onToggleAudio}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#30363d] cursor-pointer ${
                isAudioMuted ? 'bg-[#161b22] text-[#94a3b8]' : 'bg-[#1c2b3c] text-[#f59e0b]'
              }`}
              title="Toggle Control Room Chimes"
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Switch to Phone In-Cab Docker View */}
            <button
              type="button"
              onClick={onSwitchToPhoneDocker}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#161b22] hover:bg-[#21262d] text-[#ffc174] border border-[#f59e0b]/50 font-headline font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              title="Switch to Phone In-Cab Docker UI"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>PHONE CAB DOCKER UI</span>
            </button>

            {userProfile && onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="min-h-[38px] px-2.5 py-1.5 text-[#94a3b8] hover:text-[#ef4444] rounded-lg border border-[#30363d] bg-[#161b22] cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Inline Emergency Number Configurator */}
        {isEditingNumber && (
          <form
            onSubmit={handleSaveNumber}
            className="max-w-7xl mx-auto mt-3 p-3 rounded-xl bg-[#161b22] border-2 border-[#38bdf8] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2"
          >
            <span className="text-xs font-headline font-bold text-white flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-[#38bdf8]" />
              <span>SET CONTROL ROOM EMERGENCY LINE NUMBER (MUST MATCH PHONE):</span>
            </span>
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <input
                type="tel"
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value)}
                placeholder="e.g. 82199"
                className="flex-1 min-h-[38px] px-3 py-1 rounded-lg bg-[#0d1117] border border-[#30363d] text-white font-mono text-sm font-bold"
              />
              <button
                type="submit"
                className="min-h-[38px] px-3.5 py-1 rounded-lg bg-[#10b981] text-black font-headline font-extrabold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>SAVE</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditingNumber(false)}
                className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[#21262d] text-[#94a3b8] hover:text-white text-xs cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </header>

      {/* Main Control Room Workspace: Voice Call Console + Live Phone GPS Map */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4">
        {/* 1. Incoming Call Alert Banner (When Phone Rings Control Room) */}
        {callState.incomingCallAvailable && callState.status === 'idle' && (
          <div className="p-5 rounded-2xl bg-[#064e3b] border-4 border-[#10b981] text-white shadow-[0_0_40px_rgba(16,185,129,0.6)] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#10b981] text-black flex items-center justify-center shrink-0 animate-bounce">
                <PhoneIncoming className="w-8 h-8" />
              </div>
              <div>
                <span className="font-mono text-xs font-extrabold bg-[#10b981] text-black px-2.5 py-0.5 rounded uppercase">
                  INCOMING EMERGENCY CALL FROM CAB PHONE ({activePhone})
                </span>
                <h2 className="font-headline font-extrabold text-xl sm:text-2xl mt-1">
                  {callState.incomingCallerInfo || `Cab Unit ${unitId} Calling Control Room`}
                </h2>
                <p className="text-xs sm:text-sm text-emerald-100 font-mono">
                  LIVE PHONE GPS: LAT {lat.toFixed(6)}, LON {lon.toFixed(6)} · Click Answer to talk to the Phone from this Laptop!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                cabAudio.playSuccessChime();
                emergencyCallManager.answerIncomingCall(activePhone);
              }}
              className="w-full sm:w-auto min-h-[56px] px-7 py-3 rounded-xl bg-[#10b981] hover:bg-[#34d399] text-black font-headline font-extrabold text-base flex items-center justify-center gap-2.5 shadow-2xl cursor-pointer animate-pulse"
            >
              <PhoneCall className="w-6 h-6 fill-black" />
              <span>ANSWER PHONE CALL &amp; TALK LIVE</span>
            </button>
          </div>
        )}

        {/* 2. Two-Way Voice Call Console Card */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border-2 transition-all shadow-xl ${
            isCallActive
              ? 'bg-[#071a12] border-[#10b981] shadow-[0_0_30px_rgba(16,185,129,0.3)]'
              : 'bg-[#0d1c2d] border-[#30363d]'
          }`}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  isCallActive
                    ? 'bg-[#10b981] text-black animate-pulse'
                    : 'bg-[#162a40] text-[#38bdf8] border border-[#38bdf8]/40'
                }`}
              >
                <PhoneCall className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded uppercase ${
                      callState.peerConnected
                        ? 'bg-[#10b981] text-black'
                        : isCallActive
                        ? 'bg-[#f59e0b] text-black'
                        : 'bg-[#162a40] text-[#38bdf8]'
                    }`}
                  >
                    {callState.peerConnected
                      ? `LIVE TWO-WAY VOICE CONNECTED · ${formatDuration(callState.durationSeconds)}`
                      : isCallActive
                      ? `CONNECTING TO CAB PHONE (${activePhone})...`
                      : `CONTROL ROOM STANDBY · LISTENING ON LINE ${activePhone}`}
                  </span>
                  <span className="font-mono text-xs text-[#94a3b8]">
                    UNIT: <strong className="text-white">{unitId}</strong> · DRIVER:{' '}
                    <strong className="text-white">{driverId}</strong>
                  </span>
                </div>
                <h2 className="font-headline font-bold text-lg sm:text-xl text-white mt-1">
                  {callState.peerConnected
                    ? `Speaking Live with Cab Phone (${activePhone})`
                    : isCallActive
                    ? `Ringing Cab Phone (${activePhone}) over Internet Server...`
                    : `Ready to Receive Emergency Call from Cab Phone (4 Knocks / Crash / SOS)`}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
              {!isCallActive ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      cabAudio.playSuccessChime();
                      emergencyCallManager.answerIncomingCall(activePhone);
                    }}
                    className="flex-1 sm:flex-none min-h-[46px] px-4 py-2 rounded-xl bg-[#10b981] hover:bg-[#059669] text-black font-headline font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    <PhoneIncoming className="w-4 h-4" />
                    <span>ANSWER INCOMING ({activePhone})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      cabAudio.playKeyClick();
                      callEmergencyNumber(activePhone, {
                        unitNumber: unitId,
                        driverId,
                        latitude: lat,
                        longitude: lon,
                        reason: 'DIRECT',
                      });
                    }}
                    className="flex-1 sm:flex-none min-h-[46px] px-4 py-2 rounded-xl bg-[#38bdf8] hover:bg-[#0284c7] text-[#051424] font-headline font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>CALL CAB PHONE ({activePhone})</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      cabAudio.playKeyClick();
                      emergencyCallManager.toggleMute();
                    }}
                    className={`flex-1 sm:flex-none min-h-[46px] px-4 py-2 rounded-xl font-headline font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer border ${
                      callState.isMuted
                        ? 'bg-[#ef4444]/20 border-[#ef4444] text-[#ff938c]'
                        : 'bg-[#10b981]/20 border-[#10b981] text-white'
                    }`}
                  >
                    {callState.isMuted ? (
                      <MicOff className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4 text-[#10b981]" />
                    )}
                    <span>{callState.isMuted ? 'UNMUTE LAPTOP MIC' : 'LAPTOP MIC LIVE'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      cabAudio.playKeyClick();
                      emergencyCallManager.endCall();
                    }}
                    className="flex-1 sm:flex-none min-h-[46px] px-5 py-2 rounded-xl bg-[#ef4444] hover:bg-[#dc2626] text-white font-headline font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>END CALL</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Two-Way Audio Level Meters (Always visible so Control Room Operator sees mic & speaker levels) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-3 border-t border-white/10 font-mono text-xs">
            <div className="bg-black/40 p-3 rounded-xl border border-white/10">
              <div className="flex justify-between mb-1.5">
                <span className="text-[#4edea3] flex items-center gap-1.5 font-bold">
                  <Mic className="w-4 h-4" /> LAPTOP CONTROL ROOM MICROPHONE:
                </span>
                <span>{callState.isMuted ? 'MUTED' : `${callState.micLevel}%`}</span>
              </div>
              <div className="w-full h-2.5 bg-black/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#10b981] transition-all duration-75"
                  style={{ width: `${callState.isMuted ? 0 : callState.micLevel}%` }}
                />
              </div>
            </div>

            <div className="bg-black/40 p-3 rounded-xl border border-white/10">
              <div className="flex justify-between mb-1.5">
                <span className="text-[#38bdf8] flex items-center gap-1.5 font-bold">
                  <Radio className="w-4 h-4" /> CAB PHONE VOICE (SPEAKER OUTPUT):
                </span>
                <span>
                  {callState.peerConnected
                    ? `${callState.remoteVoiceLevel}% LIVE`
                    : isCallActive
                    ? 'RINGING...'
                    : 'STANDBY'}
                </span>
              </div>
              <div className="w-full h-2.5 bg-black/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#38bdf8] transition-all duration-75"
                  style={{ width: `${callState.remoteVoiceLevel}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Real-Time Cab Phone GPS Location Map (Primary Control Room Display) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#ef4444]" />
              <span className="text-xs font-headline font-bold uppercase tracking-wider text-white">
                REAL-TIME CAB PHONE LOCATION MAP (UPDATED VIA INTERNET SERVER)
              </span>
            </div>
            <span className="text-xs font-mono text-[#38bdf8]">
              LAT: {lat.toFixed(6)} · LON: {lon.toFixed(6)}
            </span>
          </div>

          <LiveCallLocationMap
            callState={callState}
            fallbackLatitude={telemetry.gps.latitude}
            fallbackLongitude={telemetry.gps.longitude}
            fallbackUnit={unitId}
          />
        </div>
      </main>
    </div>
  );
};
