import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Cpu, 
  Smartphone, 
  ShieldCheck, 
  Volume2, 
  VolumeX, 
  PhoneCall,
  RotateCcw,
  Truck,
  Flame,
  LogOut,
  Settings,
  Check,
  X
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';
import { FleetUserProfile } from '../context/AuthContext';
import {
  DEFAULT_EMERGENCY_PHONE_NUMBER,
  emergencyCallManager,
  EmergencyCallState,
} from '../utils/emergencyDialer';

interface PersistentHardwareBarProps {
  telemetry: TelemetryData;
  viewLayout: 'phone' | 'tablet' | 'full';
  onLayoutChange: (layout: 'phone' | 'tablet' | 'full') => void;
  isAudioMuted: boolean;
  onToggleAudio: () => void;
  onOpenPreShift: () => void;
  onOpenEspModal: () => void;
  onOpenAndroidModal: () => void;
  onOpenVehicleSelector: () => void;
  onOpenGasRemediation?: () => void;
  onResetSimulation: () => void;
  userProfile?: FleetUserProfile | null;
  onLogout?: () => void;
}

export const PersistentHardwareBar: React.FC<PersistentHardwareBarProps> = ({
  telemetry,
  isAudioMuted,
  onToggleAudio,
  onOpenPreShift,
  onOpenEspModal,
  onOpenAndroidModal,
  onOpenVehicleSelector,
  onOpenGasRemediation,
  onResetSimulation,
  userProfile,
  onLogout,
}) => {
  const [callState, setCallState] = useState<EmergencyCallState>(emergencyCallManager.getState());
  const [isConfigNumberOpen, setIsConfigNumberOpen] = useState<boolean>(false);
  const [numberInput, setNumberInput] = useState<string>(emergencyCallManager.getPhoneNumber());

  useEffect(() => {
    const unsub = emergencyCallManager.subscribe((state) => {
      setCallState(state);
      setNumberInput(state.phoneNumber);
    });
    return () => unsub();
  }, []);

  const handleSaveEmergencyNumber = (e: React.FormEvent) => {
    e.preventDefault();
    cabAudio.playSuccessChime();
    emergencyCallManager.setPhoneNumber(numberInput);
    setIsConfigNumberOpen(false);
  };

  const activePhone = callState.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;

  return (
    <header className="relative z-30 bg-[#0d1c2d] border-b border-[#30363d] px-3 sm:px-5 pt-2.5 pb-2.5 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-col gap-2.5">
        {/* ROW 1: Brand + Direct <a href="tel:82199">Call Now</a> + Configure Number */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Left: Brand & Active Unit */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-[#f59e0b] text-[#051424] flex items-center justify-center font-headline font-bold text-base shadow-sm shrink-0">
              DL
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-headline font-bold text-white text-base tracking-tight">
                  DriveLock
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#161b22] text-[#ffc174] border border-[#30363d] font-bold">
                  {telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Direct Call Now (<a href="tel:82199">Call Now</a>) + Configure Number Button */}
          <div className="flex items-center gap-2">
            {/* Exact <a href="tel:82199">Call Now</a> link */}
            <a
              href={`tel:${activePhone}`}
              onClick={() => {
                cabAudio.playKeyClick();
                emergencyCallManager.triggerNativeTelCall(activePhone);
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] active:bg-[#b91c1c] text-white font-headline font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow-md transition-transform active:scale-95 select-none cursor-pointer"
            >
              <PhoneCall className="w-4 h-4 fill-white shrink-0" />
              <span>Call Now ({activePhone})</span>
            </a>

            {/* Configure Emergency Number Button */}
            <button
              type="button"
              onClick={() => {
                cabAudio.playKeyClick();
                setNumberInput(activePhone);
                setIsConfigNumberOpen(!isConfigNumberOpen);
              }}
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#1c2b3c] hover:bg-[#273647] text-[#38bdf8] border border-[#38bdf8]/50 font-headline font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              title="Configure Emergency Phone Number"
            >
              <Settings className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
              <span>SET #</span>
            </button>

            {/* Audio Mute */}
            <button
              type="button"
              onClick={onToggleAudio}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#30363d] transition-colors cursor-pointer ${
                isAudioMuted
                  ? 'bg-[#161b22] text-[#94a3b8]'
                  : 'bg-[#1c2b3c] text-[#f59e0b] border-[#f59e0b]/40'
              }`}
              title={isAudioMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Reset */}
            <button
              type="button"
              onClick={onResetSimulation}
              className="min-h-[38px] px-2.5 py-1.5 text-[#94a3b8] hover:text-white rounded-lg border border-[#30363d] bg-[#161b22] cursor-pointer"
              title="Reset Simulator"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Sign Out */}
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

        {/* INLINE CONFIGURE EMERGENCY NUMBER PANEL (Opens when SET # is tapped) */}
        {isConfigNumberOpen && (
          <form
            onSubmit={handleSaveEmergencyNumber}
            className="p-3 rounded-xl bg-[#161b22] border-2 border-[#38bdf8] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shadow-xl"
          >
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-[#38bdf8] shrink-0" />
              <span className="text-xs font-headline font-bold text-white">
                CONFIGURE EMERGENCY CALL NUMBER:
              </span>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-md">
              <input
                type="tel"
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value)}
                placeholder="Enter emergency number (e.g. 82199, 112, 911)"
                className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-white font-mono text-sm font-bold focus:outline-none focus:border-[#38bdf8]"
              />
              <button
                type="submit"
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#10b981] hover:bg-[#059669] text-black font-headline font-extrabold text-xs flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Check className="w-4 h-4" />
                <span>SAVE</span>
              </button>
              <button
                type="button"
                onClick={() => setIsConfigNumberOpen(false)}
                className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[#21262d] text-[#94a3b8] hover:text-white text-xs cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* ROW 2: Clean 4-Button Grid on Phone (Zero Overlapping, Large Touch Targets) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* 1. Select Vehicle (Auto / Cab / Bus / Van) */}
          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              onOpenVehicleSelector();
            }}
            className="min-h-[42px] px-3 py-2 rounded-lg bg-[#1c2b3c] hover:bg-[#273647] active:bg-[#314357] text-[#ffc174] border border-[#f59e0b]/50 font-headline font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Truck className="w-4 h-4 text-[#f59e0b] shrink-0" />
            <span className="truncate">
              VEHICLE: {telemetry.selectedVehicle?.category?.toUpperCase() || 'AUTO'}
            </span>
          </button>

          {/* 2. ESP32 / NodeMCU Hardware Link */}
          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              onOpenEspModal();
            }}
            className={`min-h-[42px] px-3 py-2 rounded-lg font-headline font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer border ${
              telemetry.esp.isConnected
                ? 'bg-[#161b22] border-[#10b981] text-[#10b981]'
                : 'bg-[#1c2b3c] border-[#f59e0b]/50 text-[#f59e0b]'
            }`}
          >
            <Cpu className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {telemetry.esp.isConnected ? 'ESP32: CONNECTED' : 'CONNECT ESP32'}
            </span>
          </button>

          {/* 3. Pre-Shift Breathalyzer & PIN */}
          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              onOpenPreShift();
            }}
            className={`min-h-[42px] px-3 py-2 rounded-lg font-headline font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer border ${
              telemetry.interlock.status === 'passed'
                ? 'bg-[#161b22] border-[#10b981]/50 text-[#10b981]'
                : 'bg-[#1c2b3c] border-[#30363d] text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-[#ffc174] shrink-0" />
            <span className="truncate">
              {telemetry.interlock.status === 'passed' ? 'BAC 0.00% PASS' : 'PRE-SHIFT PIN'}
            </span>
          </button>

          {/* 4. MQ-9 Gas Status / Android Guide */}
          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              if ((telemetry.gas.warningsCount >= 5 || telemetry.gas.isLockoutActive) && onOpenGasRemediation) {
                onOpenGasRemediation();
              } else {
                onOpenAndroidModal();
              }
            }}
            className={`min-h-[42px] px-3 py-2 rounded-lg font-headline font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer border ${
              telemetry.gas.warningsCount >= 5 || telemetry.gas.isLockoutActive
                ? 'bg-[#211116] border-[#ef4444] text-[#ef4444] animate-pulse'
                : 'bg-[#161b22] border-[#10b981]/40 text-[#10b981]'
            }`}
          >
            {telemetry.gas.warningsCount > 0 ? (
              <>
                <Flame className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  MQ-9: {telemetry.gas.ppm} PPM ({telemetry.gas.warningsCount}/5)
                </span>
              </>
            ) : (
              <>
                <Smartphone className="w-4 h-4 shrink-0" />
                <span className="truncate">ANDROID APK / QR</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
