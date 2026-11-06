import React from 'react';
import { 
  Lock, 
  CheckCircle2, 
  AlertOctagon, 
  Gauge, 
  Zap, 
  Fuel, 
  Thermometer, 
  Activity,
  ArrowUp,
  ArrowDown,
  Anchor,
  Compass
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';

interface GlanceableCockpitProps {
  telemetry: TelemetryData;
  onAccelerate: () => void;
  onBrake: () => void;
  onToggleDock: () => void;
  onOpenPreShift: () => void;
  onToggleCruise: () => void;
  isCruiseActive: boolean;
}

export const GlanceableCockpit: React.FC<GlanceableCockpitProps> = ({
  telemetry,
  onAccelerate,
  onBrake,
  onToggleDock,
  onOpenPreShift,
  onToggleCruise,
  isCruiseActive,
}) => {
  const isImmobilized = telemetry.safetyStatus === 'IMMOBILIZED';
  const isSafeReady = telemetry.safetyStatus === 'OPERATIONAL_READY';
  const isRestricted = telemetry.safetyStatus === 'RESTRICTED_GOVERNOR';
  const isEmergency = telemetry.safetyStatus === 'EMERGENCY_CRITICAL';

  // Calculate speed percentage relative to limit or max 120kmh
  const speedPercentage = Math.min(100, Math.round((telemetry.speedKmh / 120) * 100));
  const isOverSpeed = telemetry.speedKmh > telemetry.speedLimitKmh;

  return (
    <div className="space-y-4">
      {/* 1. Large-Format Glanceable State Annunciator */}
      <div
        className={`p-5 rounded transition-all duration-200 border-2 ${
          isEmergency
            ? 'bg-[#21262d] border-[#ef4444] text-[#ffdad6] shadow-[0_0_20px_rgba(239,68,68,0.25)]'
            : isImmobilized
            ? 'bg-[#161b22] border-[#f59e0b] text-[#ffddb8]'
            : isRestricted
            ? 'bg-[#1c2b3c] border-[#f59e0b] text-[#ffddb8]'
            : 'bg-[#122131] border-[#10b981] text-[#6ffbbe]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded shrink-0 flex items-center justify-center ${
                isEmergency
                  ? 'bg-[#ef4444] text-white'
                  : isImmobilized
                  ? 'bg-[#f59e0b] text-[#0d1117]'
                  : isRestricted
                  ? 'bg-[#d97706] text-[#0d1117]'
                  : 'bg-[#10b981] text-[#0d1117]'
              }`}
            >
              {isEmergency ? (
                <AlertOctagon className="w-8 h-8 animate-bounce" />
              ) : isImmobilized ? (
                <Lock className="w-8 h-8" />
              ) : isRestricted ? (
                <AlertOctagon className="w-8 h-8" />
              ) : (
                <CheckCircle2 className="w-8 h-8" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#94a3b8]">
                  OPERATIONAL STATE
                </span>
                <span
                  className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                    telemetry.ignitionRelayClosed
                      ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40'
                      : 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/40'
                  }`}
                >
                  {telemetry.ignitionRelayClosed ? 'RELAY CLOSED · ARMED' : 'IGNITION CUT-OFF · OPEN'}
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-headline font-bold text-white tracking-tight mt-0.5">
                {isEmergency
                  ? 'CRITICAL INCIDENT / SOS DISPATCH'
                  : isImmobilized
                  ? 'ENGINE IMMOBILIZED'
                  : isRestricted
                  ? 'RESTRICTED SPEED GOVERNOR'
                  : 'SAFE OPERATIONAL ENVELOPE'}
              </h2>

              <p className="text-sm font-body text-[#d4e4fa] mt-1">
                {isEmergency
                  ? 'Catastrophic event or manual distress triggered. Ignition locked out.'
                  : isImmobilized
                  ? !telemetry.dockLocked
                    ? 'Handset undocked: Mount phone in verified cab dock to arm ignition.'
                    : telemetry.interlock.status !== 'passed'
                    ? 'Pre-shift verification required: Complete 0.00% breathalyzer & PIN test.'
                    : 'Ignition relay open. Awaiting dispatch clearance.'
                  : isRestricted
                  ? 'Speed limit exceeded or restricted zone active. Speed capped at 60 km/h.'
                  : 'Device docked · Interlock passed 0.00% BAC · Speed within threshold.'}
              </p>
            </div>
          </div>

          {/* Quick Context Action Button */}
          <div className="shrink-0 flex items-center gap-2">
            {isImmobilized ? (
              <button
                onClick={() => {
                  cabAudio.playKeyClick();
                  if (!telemetry.dockLocked) {
                    onToggleDock();
                  } else {
                    onOpenPreShift();
                  }
                }}
                className="w-full sm:w-auto h-14 px-6 rounded font-headline font-bold text-base bg-[#f59e0b] hover:bg-[#d97706] text-[#0d1117] industrial-btn flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {!telemetry.dockLocked ? (
                  <>
                    <Anchor className="w-5 h-5" />
                    <span>CLAMP TO DOCK</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    <span>UNLOCK IGNITION</span>
                  </>
                )}
              </button>
            ) : (
              <div className="text-right font-mono text-xs text-[#94a3b8] hidden sm:block">
                <div>DISPATCH LINK: ENCRYPTED</div>
                <div className="text-[#10b981] font-semibold">ALL SENSORS NORMAL</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Speedometer & Instrument Telemetry Cluster */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Speedometer Center Dial (7 Cols on desktop) */}
        <div className="lg:col-span-7 bg-[#161b22] border border-[#30363d] rounded p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[#30363d] pb-3 mb-4">
            <div>
              <span className="text-xs font-mono font-semibold text-[#94a3b8] uppercase tracking-wider block">
                PRIMARY VEHICLE READOUT
              </span>
              <span className="text-sm font-headline font-bold text-white">
                OBD-II SPEEDOMETER & TACH
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#94a3b8]">LIMIT:</span>
              <span className="px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] font-mono text-xs font-bold text-[#f59e0b]">
                {telemetry.speedLimitKmh} KM/H
              </span>
              {isOverSpeed && (
                <span className="px-2 py-0.5 rounded bg-[#ef4444] text-white text-[11px] font-mono font-bold animate-pulse">
                  GOVERNOR
                </span>
              )}
            </div>
          </div>

          {/* Speed Display */}
          <div className="py-2 flex flex-col items-center justify-center">
            {/* SVG Arc Gauge */}
            <div className="relative w-64 h-36 flex items-end justify-center">
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
                {/* Active Speed Colored Arc */}
                <path
                  d="M 20 105 A 80 80 0 0 1 180 105"
                  fill="none"
                  stroke={isOverSpeed ? '#ef4444' : isImmobilized ? '#f59e0b' : '#10b981'}
                  strokeWidth="14"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * speedPercentage) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-300 ease-out"
                />
              </svg>

              {/* Central Speed Value */}
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 text-center">
                <span className="font-mono text-5xl sm:text-6xl font-extrabold text-white tracking-tighter tabular-nums leading-none">
                  {telemetry.speedKmh}
                </span>
                <span className="text-xs font-mono font-semibold text-[#94a3b8] tracking-widest uppercase mt-1">
                  KM / H
                </span>
              </div>
            </div>

            {/* Tachometer RPM Bar */}
            <div className="w-full max-w-md mt-4 px-2">
              <div className="flex justify-between text-[11px] font-mono text-[#94a3b8] mb-1">
                <span>TACH: {telemetry.rpm} RPM</span>
                <span className={telemetry.rpm > 3500 ? 'text-[#ef4444] font-bold' : ''}>
                  MAX: 5000 RPM
                </span>
              </div>
              <div className="w-full bg-[#21262d] h-2.5 rounded-sm overflow-hidden border border-[#30363d]">
                <div
                  className={`h-full transition-all duration-150 ${
                    telemetry.rpm > 3500 ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'
                  }`}
                  style={{ width: `${Math.min(100, (telemetry.rpm / 5000) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Real-time driving controls for simulation */}
          <div className="mt-5 pt-3 border-t border-[#30363d] flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-mono text-[#94a3b8]">IN-CAB CONTROLS:</span>
            <div className="flex items-center gap-2">
              <button
                disabled={isImmobilized || isEmergency}
                onClick={onAccelerate}
                className="min-h-[48px] px-4 py-2 rounded bg-[#10b981] hover:bg-[#059669] disabled:opacity-40 disabled:cursor-not-allowed text-[#0d1117] font-headline font-bold text-sm industrial-btn flex items-center gap-1.5"
              >
                <ArrowUp className="w-4 h-4" />
                <span>THROTTLE +</span>
              </button>

              <button
                disabled={telemetry.speedKmh <= 0}
                onClick={onBrake}
                className="min-h-[48px] px-4 py-2 rounded bg-[#21262d] hover:bg-[#1c2b3c] border border-[#ef4444]/60 text-white font-headline font-bold text-sm industrial-btn flex items-center gap-1.5"
              >
                <ArrowDown className="w-4 h-4 text-[#ef4444]" />
                <span>BRAKE -</span>
              </button>

              <button
                disabled={isImmobilized}
                onClick={onToggleCruise}
                className={`min-h-[48px] px-3.5 py-2 rounded font-mono text-xs font-bold border transition-colors industrial-btn flex items-center gap-1 ${
                  isCruiseActive
                    ? 'bg-[#1c2b3c] text-[#ffc174] border-[#f59e0b]'
                    : 'bg-[#161b22] text-[#94a3b8] border-[#30363d] hover:text-white'
                }`}
              >
                <span>CRUISE</span>
                <span>{isCruiseActive ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Telemetry Metric Cards Grid (5 Cols on desktop) */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-3">
          {/* Metric 1: Battery / Alternator Voltage */}
          <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#94a3b8] uppercase">
                ALT VOLTAGE
              </span>
              <Zap className="w-4 h-4 text-[#f59e0b]" />
            </div>
            <div className="mt-2">
              <span className="font-mono text-2xl font-bold text-white tabular-nums">
                {telemetry.batteryVoltage.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-[#94a3b8] ml-1">V DC</span>
            </div>
            <div className="text-[11px] font-mono text-[#4edea3] mt-1">
              NORMAL (13.6 - 14.4V)
            </div>
          </div>

          {/* Metric 2: Engine Coolant Temp */}
          <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#94a3b8] uppercase">
                COOLANT
              </span>
              <Thermometer className="w-4 h-4 text-[#4edea3]" />
            </div>
            <div className="mt-2">
              <span className="font-mono text-2xl font-bold text-white tabular-nums">
                {telemetry.coolantTempC}
              </span>
              <span className="text-xs font-mono text-[#94a3b8] ml-1">°C</span>
            </div>
            <div className="text-[11px] font-mono text-[#94a3b8] mt-1">
              NOMINAL OP RANGE
            </div>
          </div>

          {/* Metric 3: Fuel Level */}
          <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#94a3b8] uppercase">
                FUEL TANK
              </span>
              <Fuel className="w-4 h-4 text-[#ffc174]" />
            </div>
            <div className="mt-2">
              <span className="font-mono text-2xl font-bold text-white tabular-nums">
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

          {/* Metric 4: Trip / G-Force Vector */}
          <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#94a3b8] uppercase">
                PEAK G-FORCE
              </span>
              <Activity className="w-4 h-4 text-[#ff938c]" />
            </div>
            <div className="mt-2">
              <span className="font-mono text-2xl font-bold text-white tabular-nums">
                {telemetry.gForce.peak.toFixed(2)}
              </span>
              <span className="text-xs font-mono text-[#94a3b8] ml-1">G</span>
            </div>
            <div className="text-[11px] font-mono text-[#94a3b8] mt-1">
              {telemetry.gForce.peak > 1.2 ? 'HARSH ROAD IMPACT' : 'SMOOTH STABLE'}
            </div>
          </div>

          {/* Metric 5 & 6 Full width row: Shift Trip Distance & GPS Coords */}
          <div className="col-span-2 bg-[#161b22] border border-[#30363d] rounded p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Compass className="w-5 h-5 text-[#94a3b8]" />
              <div>
                <span className="text-[11px] font-mono text-[#94a3b8] block">
                  TRIP DISTANCE / GPS FIX
                </span>
                <span className="text-sm font-mono font-bold text-white">
                  {telemetry.tripKm.toFixed(1)} KM · LAT {telemetry.gps.latitude.toFixed(4)}, LON {telemetry.gps.longitude.toFixed(4)}
                </span>
              </div>
            </div>
            <div className="text-right font-mono text-xs text-[#4edea3]">
              ACCURACY ±{telemetry.gps.accuracyM}M
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
