import React, { useState } from 'react';
import { 
  Smartphone, 
  Compass, 
  Activity, 
  Mic, 
  BatteryCharging, 
  Battery, 
  Wifi, 
  Sun, 
  Moon, 
  Vibrate, 
  Lock, 
  Radio, 
  Check, 
  Zap,
  Gauge,
  Navigation,
  Volume2,
  ShieldCheck,
  RefreshCw,
  Power
} from 'lucide-react';
import { PhoneSensorsState } from '../types/telemetry';
import { phoneSensors } from '../utils/phoneSensorsManager';
import { cabAudio } from '../utils/audio';

interface PhoneSensorsCardProps {
  sensors: PhoneSensorsState;
  onSyncGpsSpeed?: (speedKmh: number) => void;
}

export const PhoneSensorsCard: React.FC<PhoneSensorsCardProps> = ({
  sensors,
  onSyncGpsSpeed,
}) => {
  const [isArming, setIsArming] = useState(false);
  const [hapticFeedbackTriggered, setHapticFeedbackTriggered] = useState(false);

  const handleArmSensors = async () => {
    cabAudio.playKeyClick();
    setIsArming(true);
    try {
      await phoneSensors.armAllSensors();
      cabAudio.playSuccessChime();
    } catch (err) {
      console.warn('Sensors activation failed:', err);
    } finally {
      setIsArming(false);
    }
  };

  const handleTestVibrate = () => {
    cabAudio.playKeyClick();
    phoneSensors.triggerHaptic([150, 80, 200, 80, 300]);
    setHapticFeedbackTriggered(true);
    setTimeout(() => setHapticFeedbackTriggered(false), 1500);
  };

  const getCompassDirection = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  return (
    <div className="bg-[#0b1726] border-2 border-[#38bdf8]/40 rounded-xl p-4 sm:p-5 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#30363d] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#38bdf8] text-[#051424] flex items-center justify-center font-headline font-bold text-lg shadow-md">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-headline font-bold text-white text-base tracking-wide">
                PHONE HARDWARE SENSORS SUITE
              </h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                sensors.isActive
                  ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30 animate-pulse'
                  : 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30'
              }`}>
                {sensors.isActive ? 'LIVE STREAMING' : 'STANDBY (TAP TO ARM)'}
              </span>
            </div>
            <p className="text-xs font-mono text-[#94a3b8]">
              Taps directly into phone Accelerometer, Gyroscope, Compass, GPS, Mic dB Meter, Battery & Haptics
            </p>
          </div>
        </div>

        {/* Arm Button */}
        <div>
          {!sensors.isActive ? (
            <button
              type="button"
              onClick={handleArmSensors}
              disabled={isArming}
              className="px-4 py-2 rounded-lg font-headline font-bold text-xs bg-[#38bdf8] hover:bg-[#60a5fa] text-[#051424] shadow-md flex items-center gap-2 transition-all cursor-pointer"
            >
              <Power className="w-4 h-4" />
              <span>{isArming ? 'REQUESTING ACCESS...' : 'ARM ALL PHONE SENSORS'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#10b981] flex items-center gap-1.5 bg-[#051424] px-3 py-1.5 rounded border border-[#10b981]/40">
                <Check className="w-4 h-4 stroke-[3]" />
                <span>10 SENSORS ACTIVE</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  cabAudio.playKeyClick();
                  phoneSensors.stopAllSensors();
                }}
                className="px-2.5 py-1.5 rounded text-xs font-mono bg-[#161b22] hover:bg-[#21262d] text-[#94a3b8] hover:text-white border border-[#30363d]"
              >
                STOP
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Grid of 6 High-Fidelity Sensor Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* 1. 3-Axis Accelerometer & Total G-Force */}
        <div className="bg-[#122131] border border-[#30363d] rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#94a3b8]">
            <span className="flex items-center gap-1.5 text-white font-bold">
              <Activity className="w-4 h-4 text-[#ff938c]" />
              ACCELEROMETER (3-AXIS G)
            </span>
            <span className="text-[10px] text-[#ffc174]">PEAK: {sensors.accel.peakG.toFixed(2)}G</span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              {sensors.accel.totalG.toFixed(2)} <span className="text-xs text-[#94a3b8]">G</span>
            </span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
              sensors.accel.totalG > 2.5
                ? 'bg-[#ef4444] text-white'
                : sensors.accel.totalG > 1.3
                ? 'bg-[#f59e0b] text-black'
                : 'bg-[#10b981]/20 text-[#10b981]'
            }`}>
              {sensors.accel.totalG > 2.5 ? 'CRASH IMPACT' : sensors.accel.totalG > 1.3 ? 'HARSH MOVEMENT' : 'NORMAL G'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono text-xs">
            <div className="bg-[#051424] p-1.5 rounded border border-[#30363d]">
              <div className="text-[10px] text-[#94a3b8]">LATERAL X</div>
              <div className="text-white font-bold">{sensors.accel.gx > 0 ? `+${sensors.accel.gx}` : sensors.accel.gx}G</div>
            </div>
            <div className="bg-[#051424] p-1.5 rounded border border-[#30363d]">
              <div className="text-[10px] text-[#94a3b8]">LONGIT Y</div>
              <div className="text-white font-bold">{sensors.accel.gy > 0 ? `+${sensors.accel.gy}` : sensors.accel.gy}G</div>
            </div>
            <div className="bg-[#051424] p-1.5 rounded border border-[#30363d]">
              <div className="text-[10px] text-[#94a3b8]">VERTICAL Z</div>
              <div className="text-white font-bold">{sensors.accel.gz > 0 ? `+${sensors.accel.gz}` : sensors.accel.gz}G</div>
            </div>
          </div>
        </div>

        {/* 2. Compass & Road Inclinometer */}
        <div className="bg-[#122131] border border-[#30363d] rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#94a3b8]">
            <span className="flex items-center gap-1.5 text-white font-bold">
              <Compass className="w-4 h-4 text-[#38bdf8]" />
              COMPASS & INCLINOMETER
            </span>
            <span className="text-[10px] text-[#38bdf8] font-bold">
              {sensors.orientation.compassHeading}° {getCompassDirection(sensors.orientation.compassHeading)}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              {sensors.orientation.pitchInclineDeg > 0 ? `+${sensors.orientation.pitchInclineDeg}` : sensors.orientation.pitchInclineDeg}°
              <span className="text-xs text-[#94a3b8] ml-1">GRADE</span>
            </span>
            <span className="text-xs font-mono text-[#cbd5e1]">
              BANK: {sensors.orientation.rollBankDeg > 0 ? `+${sensors.orientation.rollBankDeg}` : sensors.orientation.rollBankDeg}°
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1 text-center font-mono text-xs">
            <div className="bg-[#051424] p-1.5 rounded border border-[#30363d]">
              <div className="text-[10px] text-[#94a3b8]">PITCH SLOPE</div>
              <div className="text-white font-bold">
                {Math.abs(sensors.orientation.pitchInclineDeg) < 2 ? 'LEVEL' : sensors.orientation.pitchInclineDeg > 0 ? 'UPHILL' : 'DOWNHILL'}
              </div>
            </div>
            <div className="bg-[#051424] p-1.5 rounded border border-[#30363d]">
              <div className="text-[10px] text-[#94a3b8]">GYRO YAW RATE</div>
              <div className="text-[#38bdf8] font-bold">{sensors.gyro.alpha} °/s</div>
            </div>
          </div>
        </div>

        {/* 3. Hardware GPS Live Speed & Coordinates */}
        <div className="bg-[#122131] border border-[#30363d] rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#94a3b8]">
            <span className="flex items-center gap-1.5 text-white font-bold">
              <Navigation className="w-4 h-4 text-[#10b981]" />
              HARDWARE GPS RECEIVER
            </span>
            <span className={`text-[10px] font-bold ${sensors.gps.active ? 'text-[#10b981]' : 'text-[#f59e0b]'}`}>
              {sensors.gps.active ? `ACC: ±${sensors.gps.accuracyM}m` : 'ACQUIRING'}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div>
              <span className="text-2xl font-mono font-bold text-white tracking-tight">
                {sensors.gps.speedKmh} <span className="text-xs text-[#94a3b8]">KM/H</span>
              </span>
              <span className="text-[10px] font-mono text-[#94a3b8] block">
                GPS GROUND VELOCITY
              </span>
            </div>
            {onSyncGpsSpeed && sensors.gps.active && (
              <button
                type="button"
                onClick={() => onSyncGpsSpeed(sensors.gps.speedKmh)}
                className="px-2 py-1 rounded text-[10px] font-mono bg-[#1c2b3c] hover:bg-[#273647] text-[#10b981] border border-[#10b981]/40"
              >
                SYNC SPEED
              </button>
            )}
          </div>

          <div className="bg-[#051424] p-1.5 rounded border border-[#30363d] text-[11px] font-mono text-[#94a3b8] flex justify-between">
            <span>LAT: {sensors.gps.latitude.toFixed(4)}</span>
            <span>LON: {sensors.gps.longitude.toFixed(4)}</span>
            {sensors.gps.altitudeM !== null && <span>ALT: {sensors.gps.altitudeM}m</span>}
          </div>
        </div>

        {/* 4. In-Cabin Microphone Sound & Decibel Meter */}
        <div className="bg-[#122131] border border-[#30363d] rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#94a3b8]">
            <span className="flex items-center gap-1.5 text-white font-bold">
              <Mic className="w-4 h-4 text-[#f59e0b]" />
              CABIN NOISE DECIBEL METER
            </span>
            <span className="text-[10px] text-[#ffc174]">PEAK: {sensors.sound.peakDecibelsDb} dB</span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              {sensors.sound.decibelsDb} <span className="text-xs text-[#94a3b8]">dBA SPL</span>
            </span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
              sensors.sound.noiseCategory === 'hazard_spike'
                ? 'bg-[#ef4444] text-white'
                : sensors.sound.noiseCategory === 'loud'
                ? 'bg-[#f59e0b] text-black'
                : 'bg-[#10b981]/20 text-[#10b981]'
            }`}>
              {sensors.sound.noiseCategory.replace('_', ' ')}
            </span>
          </div>

          {/* Sound Level Progress Bar */}
          <div className="space-y-1">
            <div className="h-2 w-full bg-[#051424] rounded-full overflow-hidden border border-[#30363d]">
              <div
                className={`h-full transition-all duration-150 ${
                  sensors.sound.decibelsDb > 90
                    ? 'bg-[#ef4444]'
                    : sensors.sound.decibelsDb > 75
                    ? 'bg-[#f59e0b]'
                    : 'bg-[#10b981]'
                }`}
                style={{ width: `${Math.min(100, Math.max(10, ((sensors.sound.decibelsDb - 30) / 80) * 100))}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] font-mono text-[#64748b]">
              <span>35 dB (Quiet)</span>
              <span>75 dB (Traffic)</span>
              <span>100+ dB (Crash/Horn)</span>
            </div>
          </div>
        </div>

        {/* 5. Battery & Vehicle Dock Power Telemetry */}
        <div className="bg-[#122131] border border-[#30363d] rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#94a3b8]">
            <span className="flex items-center gap-1.5 text-white font-bold">
              {sensors.battery.isCharging ? (
                <BatteryCharging className="w-4 h-4 text-[#10b981]" />
              ) : (
                <Battery className="w-4 h-4 text-[#f59e0b]" />
              )}
              BATTERY & CRADLE VOLTAGE
            </span>
            <span className="text-[10px] text-[#10b981]">5.0V USB DOCK</span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              {sensors.battery.levelPercent}%
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold flex items-center gap-1 ${
              sensors.battery.isCharging
                ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40'
                : 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/40'
            }`}>
              <Zap className="w-3 h-3" />
              <span>{sensors.battery.isCharging ? 'DOCK POWERED' : 'ON BATTERY'}</span>
            </span>
          </div>

          <div className="bg-[#051424] p-1.5 rounded border border-[#30363d] text-[11px] font-mono text-[#cbd5e1] flex items-center justify-between">
            <span>NETWORK: {sensors.network.effectiveType.toUpperCase()} ({sensors.network.downlinkMbps} Mbps)</span>
            <span>PING: {sensors.network.rttMs}ms</span>
          </div>
        </div>

        {/* 6. Haptic Vibration & Screen Wake Lock */}
        <div className="bg-[#122131] border border-[#30363d] rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#94a3b8]">
            <span className="flex items-center gap-1.5 text-white font-bold">
              <Vibrate className="w-4 h-4 text-[#a78bfa]" />
              HAPTICS & WAKE LOCK
            </span>
            <span className="text-[10px] text-[#10b981] font-bold">ACTIVE</span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-xs font-mono text-[#cbd5e1] space-y-0.5">
              <div className="text-white font-bold flex items-center gap-1">
                <Lock className="w-3 h-3 text-[#10b981]" />
                <span>SCREEN WAKE LOCK ON</span>
              </div>
              <div className="text-[10px] text-[#94a3b8]">
                Display stays on during driving
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestVibrate}
              className={`px-3 py-1.5 rounded font-headline font-bold text-xs transition-all flex items-center gap-1.5 ${
                hapticFeedbackTriggered
                  ? 'bg-[#a78bfa] text-black shadow-lg scale-105'
                  : 'bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d]'
              }`}
            >
              <Vibrate className="w-3.5 h-3.5" />
              <span>{hapticFeedbackTriggered ? 'VIBRATING...' : 'TEST HAPTIC'}</span>
            </button>
          </div>

          <div className="bg-[#051424] p-1.5 rounded border border-[#30363d] text-[11px] font-mono text-[#94a3b8] flex justify-between">
            <span>LUX: {sensors.ambientLight.lux} lx ({sensors.ambientLight.mode.toUpperCase()})</span>
            <span>HAPTIC: {sensors.haptics.supported ? 'HARDWARE READY' : 'SIMULATED'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
