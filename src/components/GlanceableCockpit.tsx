import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  CheckCircle2, 
  AlertOctagon, 
  Gauge, 
  Zap, 
  Fuel, 
  Thermometer, 
  Activity,
  Anchor,
  Compass,
  Cpu
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';
import { phoneSensors } from '../utils/phoneSensorsManager';

interface GlanceableCockpitProps {
  telemetry: TelemetryData;
  onAccelerate: () => void;
  onBrake: () => void;
  onToggleDock: () => void;
  onOpenPreShift: () => void;
  onOpenEspModal: () => void;
  onToggleCruise: () => void;
  isCruiseActive: boolean;
  isRealGpsSpeed?: boolean;
  onToggleGpsSpeed?: () => void;
  onSimulateOverSpeed?: () => void;
}

export const GlanceableCockpit: React.FC<GlanceableCockpitProps> = ({
  telemetry,
  onToggleDock,
  onOpenPreShift,
  onOpenEspModal,
  isRealGpsSpeed = true,
  onSimulateOverSpeed,
}) => {
  // Direct 60FPS hardware velocity state so the speedometer dial never waits on full App re-renders
  const [fastVelocity, setFastVelocity] = useState({
    speedKmh: telemetry.speedKmh,
    rpm: telemetry.rpm,
    peakG: telemetry.gForce.peak,
  });

  useEffect(() => {
    if (!isRealGpsSpeed) return;
    const unsub = phoneSensors.subscribeSpeed((data) => {
      setFastVelocity({
        speedKmh: data.speedKmh,
        rpm: data.rpm,
        peakG: Math.max(data.peakG, telemetry.gForce.peak),
      });
    });
    return () => unsub();
  }, [isRealGpsSpeed, telemetry.gForce.peak]);

  // Use the highest of direct 60FPS sensor speed or simulator override speed
  const liveSpeedKmh = Math.max(fastVelocity.speedKmh, telemetry.speedKmh);
  const liveRpm = liveSpeedKmh > 0 ? Math.round(850 + liveSpeedKmh * 30) : telemetry.rpm;
  const livePeakG = Math.max(fastVelocity.peakG, telemetry.gForce.peak);

  const isImmobilized = telemetry.safetyStatus === 'IMMOBILIZED';
  const isGasLockout = telemetry.safetyStatus === 'GAS_HAZARD_LOCKOUT' || telemetry.gas?.isLockoutActive;
  const isRestricted = telemetry.safetyStatus === 'RESTRICTED_GOVERNOR';
  const isEmergency = telemetry.safetyStatus === 'EMERGENCY_CRITICAL';

  // Calculate speed percentage relative to max 120kmh
  const speedPercentage = Math.min(100, Math.round((liveSpeedKmh / 120) * 100));
  const isOverSpeed = liveSpeedKmh > telemetry.speedLimitKmh;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 1. Compact Glanceable State Annunciator (Optimized for Phone Full-Screen) */}
      <div
        className={`p-3 sm:p-5 rounded-lg border-2 ${
          isEmergency || isGasLockout
            ? 'bg-[#21262d] border-[#ef4444] text-[#ffdad6] shadow-[0_0_20px_rgba(239,68,68,0.25)]'
            : isImmobilized
            ? 'bg-[#161b22] border-[#f59e0b] text-[#ffddb8]'
            : isRestricted
            ? 'bg-[#1c2b3c] border-[#f59e0b] text-[#ffddb8]'
            : 'bg-[#122131] border-[#10b981] text-[#6ffbbe]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-11 h-11 sm:w-14 sm:h-14 rounded-lg shrink-0 flex items-center justify-center ${
                isEmergency || isGasLockout
                  ? 'bg-[#ef4444] text-white'
                  : isImmobilized
                  ? 'bg-[#f59e0b] text-[#0d1117]'
                  : isRestricted
                  ? 'bg-[#d97706] text-[#0d1117]'
                  : 'bg-[#10b981] text-[#0d1117]'
              }`}
            >
              {isEmergency || isGasLockout ? (
                <AlertOctagon className="w-6 h-6 sm:w-8 sm:h-8 animate-bounce" />
              ) : isImmobilized ? (
                <Lock className="w-6 h-6 sm:w-8 sm:h-8" />
              ) : isRestricted ? (
                <AlertOctagon className="w-6 h-6 sm:w-8 sm:h-8" />
              ) : (
                <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] sm:text-xs font-mono font-semibold uppercase tracking-wider text-[#94a3b8]">
                  OPERATIONAL STATE
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                    telemetry.ignitionRelayClosed
                      ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40'
                      : 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/40'
                  }`}
                >
                  {telemetry.ignitionRelayClosed ? 'RELAY ARMED' : 'IGNITION CUT-OFF'}
                </span>
              </div>

              <h2 className="text-lg sm:text-3xl font-headline font-bold text-white tracking-tight mt-0.5 leading-tight">
                {isEmergency
                  ? 'CRITICAL INCIDENT / SOS DISPATCH'
                  : isGasLockout
                  ? 'GAS HAZARD LOCKOUT — 5 WARNINGS'
                  : isImmobilized
                  ? 'ENGINE IMMOBILIZED'
                  : isRestricted
                  ? 'RESTRICTED SPEED GOVERNOR'
                  : 'SAFE OPERATIONAL ENVELOPE'}
              </h2>

              <p className="text-xs sm:text-sm font-body text-[#d4e4fa] mt-0.5 line-clamp-2 sm:line-clamp-none">
                {isEmergency
                  ? 'Emergency call to 82199 connected. Ignition locked out.'
                  : isGasLockout
                  ? `MQ-9 detected ${telemetry.gas.ppm} PPM gas leak. Ventilate cab to unlock.`
                  : isImmobilized
                  ? !telemetry.dockLocked
                    ? 'Mount phone in cab dock or link ESP32 to arm ignition.'
                    : 'Complete 0.00% breathalyzer & PIN verification to start.'
                  : isRestricted
                  ? `Speed capped at ${telemetry.speedLimitKmh} km/h governor limit.`
                  : 'Device docked · Interlock 0.00% BAC · Speed within threshold.'}
              </p>
            </div>
          </div>

          {/* Quick Context Action Buttons */}
          <div className="shrink-0 flex items-center gap-2">
            {isImmobilized ? (
              <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-2 w-full sm:w-auto">
                {!telemetry.dockLocked && !telemetry.esp.isConnected && (
                  <button
                    onClick={() => {
                      cabAudio.playKeyClick();
                      onOpenEspModal();
                    }}
                    className="h-11 sm:h-14 px-3 sm:px-5 rounded font-headline font-bold text-xs sm:text-sm bg-[#1c2b3c] hover:bg-[#273647] text-[#ffc174] border-2 border-[#f59e0b] industrial-btn flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-[#f59e0b] shrink-0" />
                    <span>LINK ESP32</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    cabAudio.playKeyClick();
                    if (!telemetry.dockLocked) {
                      if (!telemetry.esp.isConnected) {
                        onOpenEspModal();
                      } else {
                        onToggleDock();
                      }
                    } else {
                      onOpenPreShift();
                    }
                  }}
                  className={`h-11 sm:h-14 px-4 sm:px-6 rounded font-headline font-bold text-xs sm:text-base bg-[#f59e0b] hover:bg-[#d97706] text-[#0d1117] industrial-btn flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    !telemetry.dockLocked && !telemetry.esp.isConnected ? '' : 'col-span-2'
                  }`}
                >
                  {!telemetry.dockLocked ? (
                    <>
                      <Anchor className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      <span>{!telemetry.esp.isConnected ? 'DOCK / ESP' : 'CLAMP DOCK'}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      <span>UNLOCK IGNITION</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="text-right font-mono text-xs text-[#94a3b8] hidden sm:block">
                <div>DISPATCH LINK: ENCRYPTED</div>
                <div className="text-[#10b981] font-semibold">
                  {telemetry.esp.isConnected ? 'ESP SENSORS STREAMING' : 'ALL SENSORS NORMAL'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Zero-Lag 60FPS Speedometer & Instrument Telemetry Cluster */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        {/* Speedometer Center Dial (7 Cols on desktop) */}
        <div className="lg:col-span-7 bg-[#161b22] border border-[#30363d] rounded-lg p-3.5 sm:p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[#30363d] pb-2.5 mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-headline font-bold text-white uppercase tracking-wide">
                LIVE SPEEDOMETER
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold flex items-center gap-1 bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-ping" />
                <span>60FPS INSTANT</span>
              </span>
            </div>
            
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono text-[#94a3b8]">LIMIT:</span>
              <span className="px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] font-mono text-xs font-bold text-[#f59e0b]">
                {telemetry.speedLimitKmh} KM/H
              </span>
              {isOverSpeed ? (
                <span className="px-2 py-0.5 rounded bg-[#ef4444] text-white text-[10px] font-mono font-bold animate-pulse">
                  OVER LIMIT (RECORDED)
                </span>
              ) : (
                onSimulateOverSpeed && (
                  <button
                    type="button"
                    onClick={onSimulateOverSpeed}
                    className="px-2 py-0.5 rounded bg-[#ef4444]/20 hover:bg-[#ef4444]/30 border border-[#ef4444]/50 text-[#ff938c] text-[10px] font-mono font-bold cursor-pointer active:scale-95"
                    title="Test High-Speed Violation Incident Recording"
                  >
                    TEST HIGH-SPEED
                  </button>
                )
              )}
            </div>
          </div>

          {/* Zero-Latency Speed Display */}
          <div className="py-1 flex flex-col items-center justify-center">
            {/* SVG Arc Gauge (Zero CSS Transition Lag) */}
            <div className="relative w-56 h-32 sm:w-64 sm:h-36 flex items-end justify-center">
              <svg viewBox="0 0 200 115" className="w-full h-full overflow-visible">
                {/* Background Arc */}
                <path
                  d="M 20 105 A 80 80 0 0 1 180 105"
                  fill="none"
                  stroke="#21262d"
                  strokeWidth="14"
                  strokeLinecap="round"
                />
                {/* Speed Limit Marker Tick */}
                <path
                  d="M 20 105 A 80 80 0 0 1 180 105"
                  fill="none"
                  stroke="#38485c"
                  strokeWidth="14"
                  strokeDasharray="251.2"
                  strokeDashoffset="125"
                  strokeLinecap="round"
                />
                {/* Active Speed Colored Arc — Zero transition lag (updates every 16ms frame) */}
                <path
                  d="M 20 105 A 80 80 0 0 1 180 105"
                  fill="none"
                  stroke={isOverSpeed ? '#ef4444' : isImmobilized ? '#f59e0b' : '#10b981'}
                  strokeWidth="14"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * speedPercentage) / 100}
                  strokeLinecap="round"
                />
              </svg>

              {/* Central Speed Value */}
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-0.5 text-center">
                <span className="font-mono text-5xl sm:text-6xl font-extrabold text-white tracking-tighter tabular-nums leading-none">
                  {liveSpeedKmh}
                </span>
                <span className="text-[11px] font-mono font-semibold text-[#94a3b8] tracking-widest uppercase mt-0.5">
                  KM / H
                </span>
                <span className="text-[10px] font-mono text-[#4edea3]">
                  {liveSpeedKmh === 0
                    ? 'STATIONARY · 60HZ IMU + GPS READY'
                    : `LIVE VELOCITY · ±${telemetry.gps.accuracyM || 1.5}M`}
                </span>
              </div>
            </div>

            {/* Tachometer RPM Bar (Zero lag) */}
            <div className="w-full max-w-md mt-3 px-1">
              <div className="flex justify-between text-[11px] font-mono text-[#94a3b8] mb-1">
                <span>TACH: {liveRpm} RPM</span>
                <span className={liveRpm > 3500 ? 'text-[#ef4444] font-bold' : ''}>
                  MAX: 5000 RPM
                </span>
              </div>
              <div className="w-full bg-[#21262d] h-2 rounded-sm overflow-hidden border border-[#30363d]">
                <div
                  className={`h-full ${liveRpm > 3500 ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`}
                  style={{ width: `${Math.min(100, (liveRpm / 5000) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Live Sensor Source Telemetry Footer */}
          <div className="mt-3 pt-2.5 border-t border-[#30363d] flex items-center justify-between gap-2 text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-[#94a3b8] truncate">
              <Gauge className="w-3.5 h-3.5 text-[#10b981] shrink-0" />
              <span className="text-white font-bold truncate">
                {telemetry.esp.isConnected ? 'ESP32 + 60HZ IMU' : 'GPS DOPPLER + 60HZ IMU'}
              </span>
            </div>
            <div className="text-[#38bdf8] shrink-0">
              {telemetry.gps.latitude.toFixed(4)}, {telemetry.gps.longitude.toFixed(4)}
            </div>
          </div>
        </div>

        {/* Telemetry Metric Cards Grid (2x2 compact grid for mobile full-screen) */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-2.5 sm:gap-3">
          {/* Metric 1: Battery / Alternator Voltage */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold text-[#94a3b8] uppercase">
                ALT VOLTAGE
              </span>
              <Zap className="w-3.5 h-3.5 text-[#f59e0b]" />
            </div>
            <div className="mt-1">
              <span className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
                {telemetry.batteryVoltage.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-[#94a3b8] ml-1">V</span>
            </div>
            <div className="text-[10px] font-mono text-[#4edea3] mt-0.5">
              NORMAL (13.8V)
            </div>
          </div>

          {/* Metric 2: Engine Coolant Temp */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold text-[#94a3b8] uppercase">
                COOLANT
              </span>
              <Thermometer className="w-3.5 h-3.5 text-[#4edea3]" />
            </div>
            <div className="mt-1">
              <span className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
                {telemetry.coolantTempC}
              </span>
              <span className="text-xs font-mono text-[#94a3b8] ml-1">°C</span>
            </div>
            <div className="text-[10px] font-mono text-[#94a3b8] mt-0.5">
              NOMINAL OP
            </div>
          </div>

          {/* Metric 3: Fuel Level */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold text-[#94a3b8] uppercase">
                FUEL TANK
              </span>
              <Fuel className="w-3.5 h-3.5 text-[#ffc174]" />
            </div>
            <div className="mt-1">
              <span className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
                {telemetry.fuelPercent}
              </span>
              <span className="text-xs font-mono text-[#94a3b8] ml-1">%</span>
            </div>
            <div className="w-full bg-[#21262d] h-1.5 rounded-sm overflow-hidden mt-1">
              <div
                className="bg-[#10b981] h-full"
                style={{ width: `${telemetry.fuelPercent}%` }}
              />
            </div>
          </div>

          {/* Metric 4: Peak G-Force Vector */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold text-[#94a3b8] uppercase">
                PEAK G-FORCE
              </span>
              <Activity className="w-3.5 h-3.5 text-[#ff938c]" />
            </div>
            <div className="mt-1">
              <span className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
                {livePeakG.toFixed(2)}
              </span>
              <span className="text-xs font-mono text-[#94a3b8] ml-1">G</span>
            </div>
            <div className="text-[10px] font-mono text-[#94a3b8] mt-0.5">
              {livePeakG >= 3.0 ? 'CRASH SHOCK' : 'CRASH > 3.0G'}
            </div>
          </div>

          {/* Metric 5 Full width row: Trip Distance & Orientation */}
          <div className="col-span-2 bg-[#161b22] border border-[#30363d] rounded-lg p-2.5 sm:p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Compass className="w-4 h-4 text-[#38bdf8] shrink-0" />
              <div className="truncate">
                <span className="text-xs font-mono font-bold text-white flex items-center gap-2 truncate">
                  <span>{telemetry.tripKm.toFixed(1)} KM</span>
                  <span>·</span>
                  <span className="text-[#38bdf8]">
                    HDG {telemetry.phoneSensors?.orientation.compassHeading ?? 0}°
                  </span>
                  <span>·</span>
                  <span className="text-[#ffc174]">
                    GRADE {telemetry.phoneSensors?.orientation.pitchInclineDeg ?? 0}°
                  </span>
                </span>
              </div>
            </div>
            <div className="text-right font-mono text-[11px] text-[#4edea3] shrink-0">
              ±{telemetry.gps.accuracyM || 2.5}M
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
