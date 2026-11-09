export type SafetyStatus = 
  | 'IMMOBILIZED'        // Ignition locked: phone undocked or interlock pending (Amber)
  | 'OPERATIONAL_READY'  // All invariants secure: docked, 0.00% BAC, speed within limit (Green)
  | 'RESTRICTED_GOVERNOR'// Speed limit exceeded or temporary override active (Amber/Steel)
  | 'EMERGENCY_CRITICAL' // Hard collision or SOS distress triggered (Crimson)
  | 'GAS_HAZARD_LOCKOUT';// MQ-9 Gas/CO leak limit exceeded 5 times - ignition cut (Crimson/Amber)

export type BreathalyzerStatus = 'untested' | 'in_progress' | 'passed' | 'failed';

export type EspConnectionType = 'serial' | 'ble' | 'wifi' | 'simulated';
export type EspDeviceType = 'esp32' | 'nodemcu';

export interface EspSensorPacket {
  dock: boolean;
  bac: number;
  rawAdc?: number;
  gasPpm?: number;      // MQ-9 Carbon Monoxide & Flammable Gas in PPM
  rawGasAdc?: number;   // Raw ADC from MQ-9 (0-4095 or 0-1023)
  speed?: number;
  rpm?: number;
  gx?: number;
  gy?: number;
  gz?: number;
  volt?: number;
  relayState?: boolean;
  timestamp?: string;
}

export interface EspConnectionState {
  isConnected: boolean;
  connectionType: EspConnectionType | null;
  deviceType: EspDeviceType;
  portName?: string;
  baudRate: number;
  ipAddress?: string;
  packetsReceived: number;
  lastPacketTime?: string;
  rawLogs: string[];
  lastRawPacket?: string;
}

export interface FleetVehicle {
  id: string;
  unitNumber: string;
  name: string;
  type: 'Auto-Rickshaw (3-Wheeler)' | 'Cab / Taxi' | 'City / School Bus' | 'Intercity Coach Bus' | 'Van / Shuttle' | 'Commercial Truck';
  category: 'auto' | 'cab' | 'bus' | 'van' | 'truck';
  vin: string;
  fuelType: 'CNG (Gas)' | 'LPG' | 'Petrol' | 'Diesel' | 'Electric EV';
  passengerCapacity: number;
  governorLimitKmh: number;
  gasWarningThresholdPpm: number;
  plateNumber: string;
  assignedDepot: string;
}

export interface GasSafetyState {
  ppm: number;
  thresholdPpm: number;        // User-adjustable threshold (e.g., 20 - 250 PPM)
  rawAdc: number;
  warningsCount: number;       // Number of warnings ignored (0 to 5)
  maxWarningsLimit: number;    // 5 warnings before hard vehicle lockout
  isLockoutActive: boolean;    // When warningsCount >= 5, starter relay is locked
  remediationRequired: boolean;// Requires driver/supervisor ventilation & sensor re-test
  lastWarningTimestamp: string | null;
  status: 'safe' | 'warning' | 'lockout';
}

export interface PhoneSensorsState {
  isActive: boolean;
  permissionsGranted: {
    motion: boolean;
    orientation: boolean;
    geolocation: boolean;
    audio: boolean;
  };
  // 1. Accelerometer & 3-Axis G-Force
  accel: {
    x: number;
    y: number;
    z: number;
    gx: number;
    gy: number;
    gz: number;
    totalG: number;
    peakG: number;
  };
  // 2. Gyroscope (deg/s)
  gyro: {
    alpha: number; // Yaw rate
    beta: number;  // Pitch rate
    gamma: number; // Roll rate
  };
  // 3. Compass Heading & Road Inclinometer (deg)
  orientation: {
    compassHeading: number; // 0 - 360 deg
    pitchInclineDeg: number;// -180 to 180 deg (grade slope)
    rollBankDeg: number;    // -90 to 90 deg (road banking)
  };
  // 4. Real Phone GPS
  gps: {
    active: boolean;
    latitude: number;
    longitude: number;
    altitudeM: number | null;
    speedKmh: number;
    headingDeg: number | null;
    accuracyM: number | null;
  };
  // 5. In-Cabin Ambient Sound & Decibel Meter
  sound: {
    active: boolean;
    decibelsDb: number;
    peakDecibelsDb: number;
    noiseCategory: 'quiet' | 'moderate' | 'loud' | 'hazard_spike';
  };
  // 6. Phone Battery & Vehicle Dock Power
  battery: {
    supported: boolean;
    levelPercent: number;
    isCharging: boolean; // Indicates 5V cradle charging
  };
  // 7. Cellular Network
  network: {
    online: boolean;
    effectiveType: string;
    downlinkMbps: number;
    rttMs: number;
  };
  // 8. Ambient Light (Lux)
  ambientLight: {
    supported: boolean;
    lux: number;
    mode: 'day' | 'night_tunnel';
  };
  // 9. Hardware Haptics
  haptics: {
    supported: boolean;
    lastTriggered: string | null;
  };
  // 10. Screen Wake Lock
  wakeLock: {
    supported: boolean;
    active: boolean;
  };
}

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
  gas: GasSafetyState;         // MQ-9 Gas / Carbon Monoxide Safety Subsystem
  selectedVehicle: FleetVehicle; // Active Fleet Vehicle Profile
  safetyStatus: SafetyStatus;
  ignitionRelayClosed: boolean;
  sosActive: boolean;
  sosTimer: number; // Countdown seconds if active
  shiftStartTime: string;
  driverId: string;
  cabUnitId: string;
  esp: EspConnectionState;
  phoneSensors: PhoneSensorsState; // Live Phone Hardware Sensors Suite
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


