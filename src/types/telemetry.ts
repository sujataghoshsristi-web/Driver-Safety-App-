export type SafetyStatus = 
  | 'IMMOBILIZED'        // Ignition locked: phone undocked or interlock pending (Amber)
  | 'OPERATIONAL_READY'  // All invariants secure: docked, 0.00% BAC, speed within limit (Green)
  | 'RESTRICTED_GOVERNOR'// Speed limit exceeded or temporary override active (Amber/Steel)
  | 'EMERGENCY_CRITICAL';// Hard collision or SOS distress triggered (Crimson)

export type BreathalyzerStatus = 'untested' | 'in_progress' | 'passed' | 'failed';

export interface TelemetryData {
  speedKmh: number;
  speedLimitKmh: number;
  rpm: number;
  batteryVoltage: number;
  coolantTempC: number;
  fuelPercent: number;
  throttlePercent: number;
  oilPressurePsi: number;
  odometerKm: number;
  tripKm: number;
  gForce: {
    x: number; // Lateral G (swerving)
    y: number; // Longitudinal G (braking/acceleration)
    z: number; // Vertical G (road bumps/potholes)
    peak: number;
  };
  gps: {
    locked: boolean;
    satellites: number;
    accuracyM: number;
    latitude: number;
    longitude: number;
    altitudeM: number;
    speedKnots: number;
  };
  obdConnected: boolean;
  dockLocked: boolean;
  dockVoltage: number;
  seatbeltBuckled: boolean;
  interlock: {
    status: BreathalyzerStatus;
    bacPercent: number;
    lastTestTimestamp: string | null;
    driverPinVerified: boolean;
  };
  safetyStatus: SafetyStatus;
  ignitionRelayClosed: boolean;
  sosActive: boolean;
  sosTimer: number; // Countdown seconds if active
  shiftStartTime: string;
  driverId: string;
  cabUnitId: string;
}

export interface IncidentEvent {
  id: string;
  timestamp: string;
  title: string;
  severity: 'info' | 'warning' | 'emergency';
  code: string;
  description: string;
  telemetrySnapshot?: {
    speedKmh: number;
    location: string;
  };
}
