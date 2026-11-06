import React, { useState } from 'react';
import { 
  Cpu, 
  Activity, 
  Wrench, 
  CheckCircle2, 
  AlertTriangle, 
  Zap, 
  HardDrive,
  RefreshCw
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';

interface FleetDiagnosticsViewProps {
  telemetry: TelemetryData;
  onSimulateDtc: (code: string, description: string) => void;
  onClearDtc: () => void;
  activeDtc: { code: string; desc: string } | null;
}

export const FleetDiagnosticsView: React.FC<FleetDiagnosticsViewProps> = ({
  telemetry,
  onSimulateDtc,
  onClearDtc,
  activeDtc,
}) => {
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = () => {
    cabAudio.playKeyClick();
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      cabAudio.playSuccessChime();
    }, 800);
  };

  return (
    <div className="space-y-4">
      {/* Diagnostics Top Bar */}
      <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-[#1c2b3c] border border-[#30363d] flex items-center justify-center text-[#ffc174]">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-headline font-bold text-white">
              OBD-II CAN-Bus Live Diagnostics & PIDs
            </h3>
            <p className="text-xs font-mono text-[#94a3b8]">
              PROTOCOL: ISO 15765-4 (CAN 11/500) · VEHICLE VIN: 1FTFW1ED5KFA89201
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="px-4 py-2 rounded font-mono text-xs font-bold bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'POLLING ECU...' : 'QUERY CAN-BUS'}</span>
          </button>
        </div>
      </div>

      {/* 3-Axis Gyro & In-Cab Accelerometer (Impact / Rough Terrain Detection) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-[#161b22] border border-[#30363d] rounded p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#94a3b8]">X: LATERAL G (SWERVE)</span>
            <Activity className="w-4 h-4 text-[#4edea3]" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-white tabular-nums">
            {telemetry.gForce.x >= 0 ? `+${telemetry.gForce.x.toFixed(2)}` : telemetry.gForce.x.toFixed(2)} G
          </div>
          <div className="text-[11px] font-mono text-[#94a3b8] mt-1">
            Threshold: ±0.45 G safe
          </div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#94a3b8]">Y: LONGITUDINAL G (BRAKE)</span>
            <Activity className="w-4 h-4 text-[#f59e0b]" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-white tabular-nums">
            {telemetry.gForce.y >= 0 ? `+${telemetry.gForce.y.toFixed(2)}` : telemetry.gForce.y.toFixed(2)} G
          </div>
          <div className="text-[11px] font-mono text-[#94a3b8] mt-1">
            {telemetry.gForce.y < -0.5 ? 'HARSH BRAKING TRIGGERED' : 'Normal Deceleration'}
          </div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#94a3b8]">Z: VERTICAL G (POTHOLES)</span>
            <Activity className="w-4 h-4 text-[#ff938c]" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-white tabular-nums">
            {telemetry.gForce.z.toFixed(2)} G
          </div>
          <div className="text-[11px] font-mono text-[#94a3b8] mt-1">
            {telemetry.gForce.z > 1.3 ? 'POTHOLE / ROUGH ROAD DETECTED' : 'Suspension Smooth'}
          </div>
        </div>
      </div>

      {/* Live PID Table & Electrical Circuit Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PID Data Stream */}
        <div className="bg-[#161b22] border border-[#30363d] rounded p-4">
          <div className="text-xs font-mono font-semibold text-[#94a3b8] uppercase mb-3 flex items-center justify-between">
            <span>REAL-TIME ECU PARAMETER IDENTIFIERS (PIDs)</span>
            <span className="text-[#10b981]">10 HZ REFRESH</span>
          </div>

          <div className="space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-[#0d1c2d] border border-[#30363d]">
              <span className="text-[#94a3b8]">0x0C · ENGINE RPM</span>
              <span className="text-white font-bold">{telemetry.rpm} RPM</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-[#0d1c2d] border border-[#30363d]">
              <span className="text-[#94a3b8]">0x0D · VEHICLE SPEED</span>
              <span className="text-white font-bold">{telemetry.speedKmh} KM/H</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-[#0d1c2d] border border-[#30363d]">
              <span className="text-[#94a3b8]">0x05 · ENGINE COOLANT TEMP</span>
              <span className="text-white font-bold">{telemetry.coolantTempC}°C</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-[#0d1c2d] border border-[#30363d]">
              <span className="text-[#94a3b8]">0x11 · THROTTLE POSITION</span>
              <span className="text-white font-bold">{telemetry.throttlePercent}%</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-[#0d1c2d] border border-[#30363d]">
              <span className="text-[#94a3b8]">0x2F · FUEL TANK LEVEL INPUT</span>
              <span className="text-white font-bold">{telemetry.fuelPercent}%</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-[#0d1c2d] border border-[#30363d]">
              <span className="text-[#94a3b8]">0x42 · CONTROL MODULE VOLTAGE</span>
              <span className="text-white font-bold">{telemetry.batteryVoltage.toFixed(2)} V</span>
            </div>
          </div>
        </div>

        {/* Diagnostic Trouble Codes (DTC) Box */}
        <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-semibold text-[#94a3b8] uppercase">
                DIAGNOSTIC TROUBLE CODES (DTC)
              </span>
              <span
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                  activeDtc
                    ? 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]'
                    : 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                }`}
              >
                {activeDtc ? '1 FAULT DETECTED' : '0 FAULTS · SYSTEM OK'}
              </span>
            </div>

            {activeDtc ? (
              <div className="p-3 rounded bg-[#21262d] border border-[#ef4444] text-xs font-mono space-y-1">
                <div className="flex items-center gap-2 text-[#ef4444] font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{activeDtc.code}</span>
                </div>
                <div className="text-white font-medium">{activeDtc.desc}</div>
                <div className="text-[11px] text-[#94a3b8] pt-1">
                  Freeze Frame stored. OBD-II MIL lamp illuminated.
                </div>
              </div>
            ) : (
              <div className="p-4 rounded bg-[#0d1c2d] border border-[#30363d] text-center font-mono text-xs text-[#94a3b8]">
                <CheckCircle2 className="w-8 h-8 text-[#10b981] mx-auto mb-2" />
                <span>ALL POWERTRAIN & CHASSIS SYSTEMS NOMINAL</span>
              </div>
            )}
          </div>

          {/* DTC Simulation Controls */}
          <div className="mt-4 pt-3 border-t border-[#30363d] flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-mono text-[#94a3b8]">TEST DTC TRIGGER:</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  cabAudio.playWarningBuzzer();
                  onSimulateDtc('P0500', 'Vehicle Speed Sensor (VSS) Intermittent Signal');
                }}
                className="px-2.5 py-1 text-xs font-mono rounded bg-[#21262d] hover:bg-[#1c2b3c] text-white border border-[#30363d]"
              >
                Simulate P0500
              </button>

              <button
                onClick={() => {
                  cabAudio.playWarningBuzzer();
                  onSimulateDtc('P0128', 'Coolant Thermostat Below Regulating Temperature');
                }}
                className="px-2.5 py-1 text-xs font-mono rounded bg-[#21262d] hover:bg-[#1c2b3c] text-white border border-[#30363d]"
              >
                Simulate P0128
              </button>

              {activeDtc && (
                <button
                  onClick={() => {
                    cabAudio.playSuccessChime();
                    onClearDtc();
                  }}
                  className="px-2.5 py-1 text-xs font-mono rounded bg-[#10b981] text-[#0d1117] font-bold"
                >
                  Clear Codes
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
