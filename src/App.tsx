/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Gauge, 
  Cpu, 
  ClipboardList, 
  Sliders, 
  ShieldAlert, 
  ShieldCheck, 
  Lock, 
  Unlock,
  AlertTriangle,
  Radio,
  PhoneCall,
  Smartphone
} from 'lucide-react';
import { TelemetryData, IncidentEvent, SafetyStatus, EspSensorPacket, FleetVehicle } from './types/telemetry';
import { cabAudio } from './utils/audio';
import { espManager } from './utils/espManager';
import { useAuth } from './context/AuthContext';
import { db } from './lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { PersistentHardwareBar } from './components/PersistentHardwareBar';
import { GlanceableCockpit } from './components/GlanceableCockpit';
import { PreShiftVerificationModal } from './components/PreShiftVerificationModal';
import { EmergencySosButton } from './components/EmergencySosButton';
import { FleetDiagnosticsView } from './components/FleetDiagnosticsView';
import { ShiftLogView } from './components/ShiftLogView';
import { CabMountSimulator } from './components/CabMountSimulator';
import { EspHardwareModal } from './components/EspHardwareModal';
import { DriverLoginScreen } from './components/DriverLoginScreen';
import { RealAndroidTestingModal } from './components/RealAndroidTestingModal';
import { VehicleSelectorModal } from './components/VehicleSelectorModal';
import { GasRemediationModal } from './components/GasRemediationModal';
import { GasSafetyCard } from './components/GasSafetyCard';
import { PhoneSensorsCard } from './components/PhoneSensorsCard';
import { CrashEmergencyModal } from './components/CrashEmergencyModal';
import { phoneSensors, INITIAL_PHONE_SENSORS_STATE } from './utils/phoneSensorsManager';
import { EMERGENCY_PHONE_NUMBER, callEmergencyNumber, emergencyCallManager } from './utils/emergencyDialer';
import { FLEET_VEHICLES } from './data/fleetVehicles';

const INITIAL_TELEMETRY: TelemetryData = {
  speedKmh: 0, // Real stationary baseline
  speedLimitKmh: FLEET_VEHICLES[0].governorLimitKmh,
  rpm: 850, // Idle RPM
  batteryVoltage: 13.8,
  coolantTempC: 88,
  fuelPercent: 78,
  throttlePercent: 0,
  oilPressurePsi: 45,
  odometerKm: 38492.4,
  tripKm: 0.0,
  gForce: {
    x: 0.04,
    y: 0.08,
    z: 1.02,
    peak: 1.05,
  },
  gps: {
    locked: true,
    satellites: 14,
    accuracyM: 1.2,
    latitude: 37.7749,
    longitude: -122.4194,
    altitudeM: 18,
    speedKnots: 22.7,
  },
  obdConnected: true,
  dockLocked: true,
  dockVoltage: 5.0,
  seatbeltBuckled: true,
  interlock: {
    status: 'passed',
    bacPercent: 0.00,
    lastTestTimestamp: '07:15 AM',
    driverPinVerified: true,
  },
  gas: {
    ppm: 18,
    thresholdPpm: FLEET_VEHICLES[0].gasWarningThresholdPpm,
    rawAdc: 240,
    warningsCount: 0,
    maxWarningsLimit: 5,
    isLockoutActive: false,
    remediationRequired: false,
    lastWarningTimestamp: null,
    status: 'safe',
  },
  selectedVehicle: FLEET_VEHICLES[0],
  safetyStatus: 'OPERATIONAL_READY',
  ignitionRelayClosed: true,
  sosActive: false,
  sosTimer: 0,
  shiftStartTime: '07:00 AM',
  driverId: 'DRV-8492',
  cabUnitId: FLEET_VEHICLES[0].unitNumber,
  esp: {
    isConnected: false,
    connectionType: null,
    deviceType: 'esp32',
    baudRate: 115200,
    packetsReceived: 0,
    rawLogs: [],
  },
  phoneSensors: INITIAL_PHONE_SENSORS_STATE,
};

const INITIAL_EVENTS: IncidentEvent[] = [
  {
    id: 'evt-101',
    timestamp: '07:00:12 AM',
    title: 'Pre-Shift Verification Passed',
    severity: 'info',
    code: 'INT-PASS',
    description: 'Driver DRV-8492 breathalyzer 0.00% BAC authenticated. PIN validated.',
  },
  {
    id: 'evt-102',
    timestamp: '07:00:15 AM',
    title: 'Hardware Magnetic Dock Engaged',
    severity: 'info',
    code: 'DCK-LOK',
    description: 'In-cab dashboard cradle NFC handshake verified. Handset secured.',
  },
  {
    id: 'evt-103',
    timestamp: '07:00:18 AM',
    title: 'Ignition Starter Relay Armed',
    severity: 'info',
    code: 'RLY-ARM',
    description: 'Engine immobilizer disengaged. Powertrain ignition circuit closed.',
  },
  {
    id: 'evt-104',
    timestamp: '07:22:45 AM',
    title: 'Speed Governor Advisory',
    severity: 'warning',
    code: 'SPD-LIM',
    description: 'Vehicle approached 58 km/h in 60 km/h commercial transit corridor.',
    telemetrySnapshot: {
      speedKmh: 58,
      location: 'Route 101 N Mile 4',
    },
  },
];

export default function App() {
  const { currentUser, userProfile, isAuthReady, logout } = useAuth();
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [events, setEvents] = useState<IncidentEvent[]>(INITIAL_EVENTS);
  const [activeTab, setActiveTab] = useState<'cockpit' | 'phoneSensors' | 'esp' | 'diagnostics' | 'logs' | 'simulator'>('cockpit');
  const [viewLayout, setViewLayout] = useState<'phone' | 'tablet' | 'full'>('full');
  const [isPreShiftOpen, setIsPreShiftOpen] = useState<boolean>(false);
  const [isEspModalOpen, setIsEspModalOpen] = useState<boolean>(false);
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState<boolean>(false);
  const [isVehicleSelectorOpen, setIsVehicleSelectorOpen] = useState<boolean>(false);
  const [isGasRemediationOpen, setIsGasRemediationOpen] = useState<boolean>(false);
  const [isCrashModalOpen, setIsCrashModalOpen] = useState<boolean>(false);
  const [crashImpactG, setCrashImpactG] = useState<number>(3.85);
  const [isRealGpsSpeed, setIsRealGpsSpeed] = useState<boolean>(true);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isCruiseActive, setIsCruiseActive] = useState<boolean>(false);
  const [activeDtc, setActiveDtc] = useState<{ code: string; desc: string } | null>(null);

  // Sync authenticated driver info into vehicle telemetry
  useEffect(() => {
    if (userProfile) {
      setTelemetry((prev) => ({
        ...prev,
        driverId: userProfile.driverId,
        cabUnitId: userProfile.cabUnitId,
      }));
    }
  }, [userProfile]);

  // Subscribe to live Phone Hardware Sensors (Accelerometer, Gyro, Compass, GPS, Mic dB, Battery)
  useEffect(() => {
    const unsubSensors = phoneSensors.subscribe((sensorState) => {
      setTelemetry((prev) => {
        // If phone sensors active, synchronize physical G-force
        const updatedGForce = sensorState.isActive ? {
          x: sensorState.accel.gx,
          y: sensorState.accel.gy,
          z: sensorState.accel.gz,
          peak: sensorState.accel.peakG,
        } : prev.gForce;

        // When in Real GPS Speed mode:
        // Reads direct GPS speed (0 if stationary, actual speed when moving in vehicle)
        const updatedSpeed = isRealGpsSpeed && sensorState.gps.active
          ? sensorState.gps.speedKmh
          : prev.speedKmh;

        const updatedRpm = updatedSpeed > 0
          ? Math.round(850 + updatedSpeed * 30)
          : (prev.dockLocked && prev.interlock.status === 'passed' ? 850 : 0);

        const updatedThrottle = updatedSpeed > 0
          ? Math.min(100, Math.round((updatedSpeed / (prev.speedLimitKmh || 60)) * 70))
          : 0;

        return {
          ...prev,
          phoneSensors: sensorState,
          gForce: updatedGForce,
          speedKmh: updatedSpeed,
          rpm: updatedRpm,
          throttlePercent: updatedThrottle,
          dockVoltage: sensorState.battery.isCharging ? 5.0 : prev.dockVoltage,
          gps: {
            ...prev.gps,
            locked: sensorState.gps.active,
            latitude: sensorState.gps.latitude || prev.gps.latitude,
            longitude: sensorState.gps.longitude || prev.gps.longitude,
            accuracyM: sensorState.gps.accuracyM || prev.gps.accuracyM,
          },
        };
      });
    });

    return () => unsubSensors();
  }, [isRealGpsSpeed]);

  // Handle Crash Detection and immediate call to configured emergency number
  const handleCrashDetected = (impactG: number) => {
    const activeNum = emergencyCallManager.getPhoneNumber();
    cabAudio.playEmergencyAlarm();
    setCrashImpactG(impactG);
    setIsCrashModalOpen(true);
    setTelemetry((prev) => {
      callEmergencyNumber(activeNum, {
        unitNumber: prev.selectedVehicle?.unitNumber || prev.cabUnitId,
        impactG,
        latitude: prev.gps.latitude,
        longitude: prev.gps.longitude,
        reason: 'CRASH',
      });
      logEvent(
        `PHYSICAL COLLISION DETECTED — CALLING ${activeNum}`,
        'emergency',
        'CRASH-SHOCK',
        `Physical accelerometer registered ${impactG.toFixed(2)}G impact. Emergency call to ${activeNum} placed.`
      );
      return {
        ...prev,
        gForce: {
          ...prev.gForce,
          peak: impactG,
        },
        sosActive: true,
        safetyStatus: 'EMERGENCY_CRITICAL',
        speedKmh: 0,
        ignitionRelayClosed: false,
      };
    });
  };

  // Subscribe to real physical accelerometer collision shocks (> 3.0G)
  useEffect(() => {
    const unsubCrash = phoneSensors.onCrashDetected((impactG) => {
      handleCrashDetected(impactG);
    });
    return () => unsubCrash();
  }, []);

  // Subscribe to real-time ESP32 & NodeMCU sensor packets
  useEffect(() => {
    const unsubPacket = espManager.subscribePacket((packet: EspSensorPacket, rawLine: string) => {
      setTelemetry((prev) => {
        const isDocked = packet.dock;
        const bac = packet.bac;
        const wasUndocked = !prev.dockLocked && isDocked;
        const wasDocked = prev.dockLocked && !isDocked;

        let safety = prev.safetyStatus;
        let relay = prev.ignitionRelayClosed;

        if (wasDocked) {
          safety = 'IMMOBILIZED';
          relay = false;
          cabAudio.playWarningBuzzer();
          logEvent('ESP Sensor: Handset Undocked', 'warning', 'ESP-DCK-OFF', 'Physical dock reed switch disconnected.');
        } else if (wasUndocked) {
          cabAudio.playRelaySolenoid(true);
          safety = prev.interlock.status === 'passed' && !prev.gas.isLockoutActive ? 'OPERATIONAL_READY' : 'IMMOBILIZED';
          relay = prev.interlock.status === 'passed' && !prev.gas.isLockoutActive;
          logEvent('ESP Sensor: Handset Docked', 'info', 'ESP-DCK-ON', 'Physical dock reed switch verified in cradle.');
        }

        let interlockState = prev.interlock;
        if (bac > 0.03) {
          interlockState = {
            ...prev.interlock,
            status: 'failed',
            bacPercent: bac,
          };
          safety = 'IMMOBILIZED';
          relay = false;
          cabAudio.playWarningBuzzer();
          logEvent('ESP Sensor: High Alcohol Vapor Detected', 'emergency', 'ESP-MQ3-FAIL', `MQ-3 detected BAC ${bac.toFixed(2)}%. Ignition locked.`);
        }

        // Process MQ-9 Gas Sensor Data from ESP32 / NodeMCU
        let gasState = prev.gas;
        if (packet.gasPpm !== undefined) {
          const newPpm = Math.round(packet.gasPpm);
          const isOver = newPpm > gasState.thresholdPpm;
          let newWarnings = gasState.warningsCount;
          let lockout = gasState.isLockoutActive;

          if (isOver && gasState.status !== 'warning' && !lockout) {
            newWarnings = gasState.warningsCount + 1;
            cabAudio.playWarningBuzzer();
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            logEvent(
              'MQ-9 Gas Leak Detected',
              'warning',
              'ESP-GAS-WARN',
              `Gas level reached ${newPpm} PPM (Exceeds ${gasState.thresholdPpm} PPM threshold). Warning ${newWarnings}/5.`
            );

            if (newWarnings >= gasState.maxWarningsLimit) {
              lockout = true;
              safety = 'GAS_HAZARD_LOCKOUT';
              relay = false;
              cabAudio.playEmergencyAlarm();
              setIsGasRemediationOpen(true);
              logEvent(
                'CRITICAL: 5 Gas Leak Warnings Ignored — Powertrain Lockout',
                'emergency',
                'GAS-LOCKOUT-MAX',
                'Ignition cut off after 5 unaddressed gas warnings. Mandatory cabin ventilation required.'
              );
            }
          }

          gasState = {
            ...gasState,
            ppm: newPpm,
            rawAdc: packet.rawGasAdc ?? gasState.rawAdc,
            warningsCount: newWarnings,
            isLockoutActive: lockout,
            status: lockout ? 'lockout' : isOver ? 'warning' : 'safe',
          };
        }

        const newLogs = [rawLine, ...prev.esp.rawLogs].slice(0, 25);

        return {
          ...prev,
          dockLocked: isDocked,
          interlock: interlockState,
          gas: gasState,
          safetyStatus: safety,
          ignitionRelayClosed: relay,
          batteryVoltage: packet.volt !== undefined ? packet.volt : prev.batteryVoltage,
          rpm: packet.rpm !== undefined ? packet.rpm : prev.rpm,
          speedKmh: packet.speed !== undefined ? packet.speed : prev.speedKmh,
          gForce: {
            x: packet.gx !== undefined ? packet.gx : prev.gForce.x,
            y: packet.gy !== undefined ? packet.gy : prev.gForce.y,
            z: packet.gz !== undefined ? packet.gz : prev.gForce.z,
            peak: prev.gForce.peak,
          },
          esp: {
            ...prev.esp,
            isConnected: true,
            connectionType: espManager.connectionType,
            deviceType: espManager.deviceType,
            packetsReceived: prev.esp.packetsReceived + 1,
            lastPacketTime: new Date().toLocaleTimeString(),
            rawLogs: newLogs,
            lastRawPacket: rawLine,
          },
        };
      });
    });

    const unsubStatus = espManager.subscribeStatus((connected, message) => {
      setTelemetry((prev) => ({
        ...prev,
        esp: {
          ...prev.esp,
          isConnected: connected,
          connectionType: espManager.connectionType,
          deviceType: espManager.deviceType,
        },
      }));
      logEvent(
        connected ? 'ESP Microcontroller Connected' : 'ESP Microcontroller Disconnected',
        connected ? 'info' : 'warning',
        connected ? 'ESP-LINK-UP' : 'ESP-LINK-DOWN',
        message
      );
    });

    return () => {
      unsubPacket();
      unsubStatus();
    };
  }, []);

  // Lightweight 2s odometer/trip accumulator (never overwrites real GPS speed, G-force, or coordinates)
  useEffect(() => {
    const timer = setInterval(() => {
      setTelemetry((prev) => {
        if (prev.safetyStatus === 'IMMOBILIZED' || prev.safetyStatus === 'EMERGENCY_CRITICAL' || prev.safetyStatus === 'GAS_HAZARD_LOCKOUT') {
          if (prev.ignitionRelayClosed) {
            return {
              ...prev,
              ignitionRelayClosed: false,
            };
          }
          return prev;
        }

        if (prev.speedKmh <= 0) return prev;

        // Accumulate real trip distance: km = (km/h) * (2s / 3600s)
        const deltaKm = (prev.speedKmh * 2) / 3600;
        return {
          ...prev,
          tripKm: Number((prev.tripKm + deltaKm).toFixed(2)),
          odometerKm: Number((prev.odometerKm + deltaKm).toFixed(1)),
        };
      });
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  // Audio mute sync
  const handleToggleAudio = () => {
    cabAudio.playKeyClick();
    setIsAudioMuted((prev) => {
      const next = !prev;
      cabAudio.isMuted = next;
      return next;
    });
  };

  // Accelerate
  const handleAccelerate = () => {
    cabAudio.playKeyClick();
    setTelemetry((prev) => {
      const nextSpeed = Math.min(115, prev.speedKmh + 6);
      const isOver = nextSpeed > prev.speedLimitKmh;

      if (isOver && prev.safetyStatus !== 'RESTRICTED_GOVERNOR') {
        cabAudio.playWarningBuzzer();
        logEvent('Speed Threshold Exceeded', 'warning', 'SPD-GOV', `Vehicle at ${nextSpeed} km/h exceeding ${prev.speedLimitKmh} km/h limit.`);
      }

      return {
        ...prev,
        speedKmh: nextSpeed,
        rpm: Math.min(4800, prev.rpm + 320),
        safetyStatus: isOver ? 'RESTRICTED_GOVERNOR' : 'OPERATIONAL_READY',
      };
    });
  };

  // Brake
  const handleBrake = () => {
    cabAudio.playKeyClick();
    setTelemetry((prev) => {
      const nextSpeed = Math.max(0, prev.speedKmh - 10);
      return {
        ...prev,
        speedKmh: nextSpeed,
        rpm: Math.max(750, prev.rpm - 400),
        safetyStatus: nextSpeed <= prev.speedLimitKmh && prev.dockLocked && prev.interlock.status === 'passed'
          ? 'OPERATIONAL_READY'
          : prev.safetyStatus,
      };
    });
  };

  // Toggle Magnetic Dock Mount
  const handleToggleDock = () => {
    setTelemetry((prev) => {
      const newDock = !prev.dockLocked;

      if (!newDock) {
        // Handset undocked while in cab
        cabAudio.playWarningBuzzer();
        logEvent(
          'Handset Removed From Dock',
          'warning',
          'DCK-WARN',
          'Phone unlatched while transit active. Ignition cut-off initiated to prevent distracted driving.'
        );

        return {
          ...prev,
          dockLocked: false,
          safetyStatus: 'IMMOBILIZED',
          ignitionRelayClosed: false,
          speedKmh: Math.max(0, prev.speedKmh - 15),
        };
      } else {
        // Handset docked
        cabAudio.playRelaySolenoid(true);
        logEvent(
          'Handset Secured In Dock',
          'info',
          'DCK-LOK',
          'NFC hardware lock verified on cab dashboard mount.'
        );

        const canUnlock = prev.interlock.status === 'passed';

        return {
          ...prev,
          dockLocked: true,
          safetyStatus: canUnlock ? 'OPERATIONAL_READY' : 'IMMOBILIZED',
          ignitionRelayClosed: canUnlock,
        };
      }
    });
  };

  // Log Event
  const logEvent = (
    title: string,
    severity: 'info' | 'warning' | 'emergency',
    code: string,
    description: string
  ) => {
    const newEvt: IncidentEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      title,
      severity,
      code,
      description,
      telemetrySnapshot: {
        speedKmh: telemetry.speedKmh,
        location: `LAT ${telemetry.gps.latitude.toFixed(4)}, LON ${telemetry.gps.longitude.toFixed(4)}`,
      },
    };
    setEvents((prev) => [newEvt, ...prev]);

    // Persist to Firestore if user is authenticated
    if (currentUser) {
      addDoc(collection(db, 'incidents'), {
        ...newEvt,
        userId: currentUser.uid,
        cabUnitId: telemetry.cabUnitId,
      }).catch((err) => {
        console.warn('Incident Firestore sync:', err);
      });
    }
  };

  // Complete Pre-Shift Verification
  const handleCompleteVerification = (driverPin: string, bac: number) => {
    setTelemetry((prev) => {
      logEvent(
        'Driver Pre-Shift Verification Complete',
        'info',
        'INT-PASS',
        `Driver PIN ${driverPin} authenticated. Breathalyzer verified at ${bac.toFixed(2)}% BAC.`
      );

      return {
        ...prev,
        interlock: {
          status: 'passed',
          bacPercent: bac,
          lastTestTimestamp: new Date().toLocaleTimeString(),
          driverPinVerified: true,
        },
        safetyStatus: prev.dockLocked ? 'OPERATIONAL_READY' : 'IMMOBILIZED',
        ignitionRelayClosed: prev.dockLocked,
      };
    });
  };

  // Emergency SOS Trigger
  const handleTriggerSos = () => {
    const activeNum = emergencyCallManager.getPhoneNumber();
    cabAudio.playEmergencyAlarm();
    setTelemetry((prev) => {
      callEmergencyNumber(activeNum, {
        unitNumber: prev.selectedVehicle?.unitNumber || prev.cabUnitId,
        latitude: prev.gps.latitude,
        longitude: prev.gps.longitude,
        reason: 'SOS',
      });
      logEvent(
        `EMERGENCY SOS DISPATCH TRIGGERED — CALLING ${activeNum}`,
        'emergency',
        'SOS-ALARM',
        `In-cab emergency button engaged. Emergency call to ${activeNum} placed.`
      );

      return {
        ...prev,
        sosActive: true,
        safetyStatus: 'EMERGENCY_CRITICAL',
        ignitionRelayClosed: false,
        speedKmh: 0,
        rpm: 0,
      };
    });
  };

  // Cancel SOS
  const handleCancelSos = () => {
    cabAudio.playSuccessChime();
    emergencyCallManager.endCall();
    setTelemetry((prev) => {
      logEvent(
        'Emergency SOS Cancelled',
        'info',
        'SOS-CANCEL',
        'Driver cancelled emergency dispatch alarm. Stand down signal transmitted.'
      );

      return {
        ...prev,
        sosActive: false,
        safetyStatus: prev.dockLocked && prev.interlock.status === 'passed' ? 'OPERATIONAL_READY' : 'IMMOBILIZED',
        ignitionRelayClosed: prev.dockLocked && prev.interlock.status === 'passed',
      };
    });
  };

  // Simulate Hard Impact / Pothole
  const handleSimulateImpact = (isCollision: boolean = false) => {
    const g = isCollision ? 3.85 : 1.62;
    if (isCollision) {
      handleCrashDetected(g);
      return;
    }

    setTelemetry((prev) => {
      cabAudio.playWarningBuzzer();
      logEvent(
        'Rough Road / Pothole Shock Event',
        'warning',
        'ROUGH-TERRAIN',
        `Accelerometer registered ${g}G shock vector on cab axis.`
      );

      return {
        ...prev,
        gForce: {
          ...prev.gForce,
          peak: g,
        },
      };
    });
  };

  // Simulate Governor Over-Speed Event
  const handleSimulateOverSpeed = () => {
    cabAudio.playWarningBuzzer();
    setTelemetry((p) => {
      const spikedSpeed = p.speedLimitKmh + 15;
      logEvent(
        'Speed Governor Limit Exceeded',
        'warning',
        'SPD-GOV',
        `Speed accelerated to ${spikedSpeed} km/h, exceeding ${p.selectedVehicle?.name || 'unit'} governor limit (${p.speedLimitKmh} km/h).`
      );
      return {
        ...p,
        speedKmh: spikedSpeed,
        safetyStatus: 'RESTRICTED_GOVERNOR',
      };
    });
  };

  // Presets
  const handleLoadPreset = (preset: 'cold_start' | 'highway_safe' | 'distraction' | 'collision') => {
    if (preset === 'cold_start') {
      cabAudio.playRelaySolenoid(false);
      setTelemetry((prev) => ({
        ...prev,
        speedKmh: 0,
        rpm: 0,
        dockLocked: false,
        safetyStatus: 'IMMOBILIZED',
        ignitionRelayClosed: false,
        interlock: {
          ...prev.interlock,
          status: 'untested',
          bacPercent: 0,
          driverPinVerified: false,
        },
        sosActive: false,
      }));
      logEvent('Preset: Cold Start', 'warning', 'PST-COLD', 'Engine cold start. Awaiting dock & breath interlock.');
    } else if (preset === 'highway_safe') {
      cabAudio.playRelaySolenoid(true);
      setTelemetry((prev) => {
        const safeCruiseSpeed = Math.min(prev.speedLimitKmh - 5, 50);
        return {
          ...prev,
          speedKmh: Math.max(25, safeCruiseSpeed),
          rpm: 1950,
          dockLocked: true,
          safetyStatus: 'OPERATIONAL_READY',
          ignitionRelayClosed: true,
          interlock: {
            ...prev.interlock,
            status: 'passed',
            bacPercent: 0.00,
            driverPinVerified: true,
          },
          sosActive: false,
        };
      });
      logEvent('Preset: Safe Cruise', 'info', 'PST-SAFE', 'Safe operational envelope active within vehicle governor limit.');
    } else if (preset === 'distraction') {
      cabAudio.playWarningBuzzer();
      setTelemetry((prev) => ({
        ...prev,
        speedKmh: 35,
        rpm: 1400,
        dockLocked: false,
        safetyStatus: 'IMMOBILIZED',
        ignitionRelayClosed: false,
        sosActive: false,
      }));
      logEvent('Preset: Distracted Driving', 'warning', 'PST-DIST', 'Phone undocked while moving. Engine throttled.');
    } else if (preset === 'collision') {
      handleSimulateImpact(true);
    }
  };

  // Confirm Dock from ESP modal
  const handleConfirmDockWithEsp = () => {
    setTelemetry((prev) => {
      cabAudio.playRelaySolenoid(true);
      logEvent(
        'Handset Secured via ESP In-Cab Dock',
        'info',
        'ESP-DCK-OK',
        'ESP32 / NodeMCU confirmed phone docked in cradle.'
      );
      const canUnlock = prev.interlock.status === 'passed';
      return {
        ...prev,
        dockLocked: true,
        safetyStatus: canUnlock ? 'OPERATIONAL_READY' : 'IMMOBILIZED',
        ignitionRelayClosed: canUnlock,
      };
    });
  };

  // Update Gas Threshold
  const handleUpdateGasThreshold = (newThreshold: number) => {
    cabAudio.playKeyClick();
    setTelemetry((prev) => {
      const isOver = prev.gas.ppm > newThreshold;
      return {
        ...prev,
        gas: {
          ...prev.gas,
          thresholdPpm: newThreshold,
          status: prev.gas.isLockoutActive ? 'lockout' : isOver ? 'warning' : 'safe',
        },
      };
    });
    logEvent(
      'MQ-9 Gas Safety Threshold Adjusted',
      'info',
      'GAS-THR-ADJ',
      `Hazard warning threshold calibrated to ${newThreshold} PPM.`
    );
  };

  // Acknowledge gas warning (increments warnings count and trips lockout if >= 5)
  const handleAcknowledgeGasWarning = () => {
    cabAudio.playKeyClick();
    setTelemetry((prev) => {
      const nextWarnings = prev.gas.warningsCount + 1;
      const isTripped = nextWarnings >= prev.gas.maxWarningsLimit;

      if (isTripped) {
        cabAudio.playEmergencyAlarm();
        if ('vibrate' in navigator) navigator.vibrate([300, 150, 300, 150, 500]);
        setIsGasRemediationOpen(true);
        logEvent(
          'CRITICAL: 5 GAS WARNINGS UNADDRESSED — POWERTRAIN LOCKOUT TRIPPED',
          'emergency',
          'GAS-LOCKOUT-MAX',
          'Vehicle operation locked out after 5 unaddressed MQ-9 gas hazard warnings. Mandatory cab ventilation required.'
        );
      } else {
        cabAudio.playWarningBuzzer();
        logEvent(
          `Gas Hazard Warning Acknowledged (${nextWarnings}/5)`,
          'warning',
          'GAS-WARN-ACK',
          `Warning ${nextWarnings} of 5 registered for elevated gas/CO concentration (${prev.gas.ppm} PPM).`
        );
      }

      return {
        ...prev,
        gas: {
          ...prev.gas,
          warningsCount: nextWarnings,
          isLockoutActive: isTripped,
          remediationRequired: isTripped,
          status: isTripped ? 'lockout' : 'warning',
        },
        safetyStatus: isTripped ? 'GAS_HAZARD_LOCKOUT' : prev.safetyStatus,
        ignitionRelayClosed: isTripped ? false : prev.ignitionRelayClosed,
        speedKmh: isTripped ? 0 : prev.speedKmh,
        rpm: isTripped ? 0 : prev.rpm,
      };
    });
  };

  // Simulate Gas Leak (+35 PPM)
  const handleSimulateGasLeak = () => {
    cabAudio.playKeyClick();
    setTelemetry((prev) => {
      const nextPpm = prev.gas.ppm + 35;
      const isOver = nextPpm > prev.gas.thresholdPpm;
      const nextWarnings = isOver ? prev.gas.warningsCount + 1 : prev.gas.warningsCount;
      const isTripped = nextWarnings >= prev.gas.maxWarningsLimit;

      if (isTripped) {
        cabAudio.playEmergencyAlarm();
        if ('vibrate' in navigator) navigator.vibrate([300, 150, 300, 150, 500]);
        setIsGasRemediationOpen(true);
        logEvent(
          'CRITICAL: 5 GAS WARNINGS UNADDRESSED — POWERTRAIN LOCKOUT TRIPPED',
          'emergency',
          'GAS-LOCKOUT-MAX',
          'Vehicle operation locked out after 5 unaddressed MQ-9 gas hazard warnings.'
        );
      } else if (isOver) {
        cabAudio.playWarningBuzzer();
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        logEvent(
          'MQ-9 Gas Concentration Spike Detected',
          'warning',
          'GAS-SPIKE',
          `Gas / Carbon Monoxide spiked to ${nextPpm} PPM (Exceeds ${prev.gas.thresholdPpm} PPM threshold). Warning ${nextWarnings}/5.`
        );
      }

      return {
        ...prev,
        gas: {
          ...prev.gas,
          ppm: nextPpm,
          rawAdc: Math.min(4095, prev.gas.rawAdc + 300),
          warningsCount: nextWarnings,
          isLockoutActive: isTripped,
          remediationRequired: isTripped,
          status: isTripped ? 'lockout' : isOver ? 'warning' : 'safe',
        },
        safetyStatus: isTripped ? 'GAS_HAZARD_LOCKOUT' : prev.safetyStatus,
        ignitionRelayClosed: isTripped ? false : prev.ignitionRelayClosed,
        speedKmh: isTripped ? 0 : prev.speedKmh,
        rpm: isTripped ? 0 : prev.rpm,
      };
    });
  };

  // Ventilate cab / purge fumes
  const handleVentilateCab = () => {
    cabAudio.playSuccessChime();
    setTelemetry((prev) => ({
      ...prev,
      gas: {
        ...prev.gas,
        ppm: 18,
        rawAdc: 210,
        status: prev.gas.isLockoutActive ? 'lockout' : 'safe',
      },
    }));
    logEvent('Cab Aerated & Fumes Purged', 'info', 'GAS-PURGE', 'Cabin ventilation active. Gas concentration returned to clean baseline 18 PPM.');
  };

  // Complete remediation and reset interlock
  const handleCompleteGasRemediation = (supervisorPin: string) => {
    cabAudio.playRelaySolenoid(true);
    setIsGasRemediationOpen(false);
    setTelemetry((prev) => {
      const canArm = prev.dockLocked && prev.interlock.status === 'passed';
      logEvent(
        'Gas Hazard Remediation Certified',
        'info',
        'GAS-CLEAR-OK',
        `Cabin inspection signed off with PIN ${supervisorPin}. Warnings counter reset to 0/5. Immobilizer cleared.`
      );
      return {
        ...prev,
        gas: {
          ...prev.gas,
          warningsCount: 0,
          isLockoutActive: false,
          remediationRequired: false,
          status: 'safe',
        },
        safetyStatus: canArm ? 'OPERATIONAL_READY' : 'IMMOBILIZED',
        ignitionRelayClosed: canArm,
      };
    });
  };

  // Vehicle Selection handler
  const handleSelectVehicle = (vehicle: FleetVehicle) => {
    cabAudio.playKeyClick();
    setTelemetry((prev) => {
      logEvent(
        'Fleet Vehicle Profile Assigned',
        'info',
        'VEH-ASSIGN',
        `Vehicle switched to ${vehicle.name} (${vehicle.unitNumber}). Governor: ${vehicle.governorLimitKmh} km/h, Gas threshold: ${vehicle.gasWarningThresholdPpm} PPM.`
      );
      return {
        ...prev,
        selectedVehicle: vehicle,
        cabUnitId: vehicle.unitNumber,
        speedLimitKmh: vehicle.governorLimitKmh,
        gas: {
          ...prev.gas,
          thresholdPpm: vehicle.gasWarningThresholdPpm,
        },
      };
    });
  };

  // Reset simulator
  const handleResetSimulation = () => {
    cabAudio.playSuccessChime();
    setTelemetry(INITIAL_TELEMETRY);
    setActiveDtc(null);
    logEvent('Simulator Reset', 'info', 'SIM-RST', 'All cab instruments reset to standard safe baseline.');
  };

  // Auth readiness gate
  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#051424] text-[#d4e4fa] flex flex-col items-center justify-center p-4 hud-grid">
        <div className="w-12 h-12 rounded-lg bg-[#f59e0b] text-[#051424] flex items-center justify-center font-headline font-bold text-xl animate-pulse mb-3 shadow-lg">
          DL
        </div>
        <div className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">
          INITIALIZING DRIVELOCK SECURITY SUBSYSTEM...
        </div>
      </div>
    );
  }

  // Driver authentication gate
  if (!currentUser && !userProfile) {
    return <DriverLoginScreen />;
  }

  return (
    <div className="min-h-[100dvh] bg-[#051424] text-[#d4e4fa] flex flex-col font-body antialiased hud-grid pb-16 sm:pb-0">
      {/* 1. Persistent Top Tier Hardware Telemetry Bar */}
      <PersistentHardwareBar
        telemetry={telemetry}
        viewLayout={viewLayout}
        onLayoutChange={setViewLayout}
        isAudioMuted={isAudioMuted}
        onToggleAudio={handleToggleAudio}
        onOpenPreShift={() => setIsPreShiftOpen(true)}
        onOpenEspModal={() => setIsEspModalOpen(true)}
        onOpenAndroidModal={() => setIsAndroidModalOpen(true)}
        onOpenVehicleSelector={() => setIsVehicleSelectorOpen(true)}
        onOpenGasRemediation={() => setIsGasRemediationOpen(true)}
        onResetSimulation={handleResetSimulation}
        userProfile={userProfile}
        onLogout={logout}
      />

      {/* Main Viewport Container (Edge-to-Edge Full Screen on Phone) */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-5 flex flex-col">
        {/* Desktop/Tablet Navigation Tabs (Hidden on Mobile Phone — Mobile uses Fixed Bottom Nav) */}
        <div className="hidden sm:flex items-center gap-2 mb-4 overflow-x-auto pb-1 border-b border-[#30363d]">
          <button
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveTab('cockpit');
            }}
            className={`min-h-[44px] px-4 py-2 rounded text-xs sm:text-sm font-headline font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'cockpit'
                ? 'bg-[#f59e0b] text-[#051424] shadow-sm'
                : 'bg-[#161b22] text-[#94a3b8] hover:text-white border border-[#30363d]'
            }`}
          >
            <Gauge className="w-4 h-4" />
            <span>CAB HUD & COCKPIT</span>
          </button>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveTab('phoneSensors');
            }}
            className={`min-h-[44px] px-4 py-2 rounded text-xs sm:text-sm font-headline font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'phoneSensors'
                ? 'bg-[#38bdf8] text-[#051424] shadow-sm'
                : 'bg-[#161b22] text-[#94a3b8] hover:text-white border border-[#30363d]'
            }`}
          >
            <Smartphone className="w-4 h-4 text-[#38bdf8]" />
            <span>PHONE SENSORS</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
              telemetry.phoneSensors.isActive ? 'bg-[#10b981] text-black' : 'bg-[#21262d] text-[#38bdf8]'
            }`}>
              {telemetry.phoneSensors.isActive ? '10 LIVE' : '10 SENSORS'}
            </span>
          </button>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveTab('esp');
            }}
            className={`min-h-[44px] px-4 py-2 rounded text-xs sm:text-sm font-headline font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'esp'
                ? 'bg-[#f59e0b] text-[#051424] shadow-sm'
                : 'bg-[#161b22] text-[#94a3b8] hover:text-white border border-[#30363d]'
            }`}
          >
            <Cpu className="w-4 h-4 text-[#ffc174]" />
            <span>ESP32 / NODEMCU SENSORS</span>
            {telemetry.esp.isConnected ? (
              <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#21262d] text-[#f59e0b] border border-[#f59e0b]">
                CONNECT
              </span>
            )}
          </button>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveTab('diagnostics');
            }}
            className={`min-h-[44px] px-4 py-2 rounded text-xs sm:text-sm font-headline font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'diagnostics'
                ? 'bg-[#f59e0b] text-[#051424] shadow-sm'
                : 'bg-[#161b22] text-[#94a3b8] hover:text-white border border-[#30363d]'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>CAN-BUS & DIAGNOSTICS</span>
            {activeDtc && (
              <span className="w-2 h-2 rounded-full bg-[#ef4444] animate-ping" />
            )}
          </button>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveTab('logs');
            }}
            className={`min-h-[44px] px-4 py-2 rounded text-xs sm:text-sm font-headline font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'logs'
                ? 'bg-[#f59e0b] text-[#051424] shadow-sm'
                : 'bg-[#161b22] text-[#94a3b8] hover:text-white border border-[#30363d]'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>INCIDENT LOGS</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#0d1c2d] text-[#ffc174] border border-[#30363d]">
              {events.length}
            </span>
          </button>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveTab('simulator');
            }}
            className={`min-h-[44px] px-4 py-2 rounded text-xs sm:text-sm font-headline font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'simulator'
                ? 'bg-[#f59e0b] text-[#051424] shadow-sm'
                : 'bg-[#161b22] text-[#94a3b8] hover:text-white border border-[#30363d]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>HAZARD SIMULATOR</span>
          </button>
        </div>

        {/* Viewport Frame Adapters: Full-Screen Edge-to-Edge on Phone */}
        <div
          className={`mx-auto w-full transition-all duration-200 ${
            viewLayout === 'phone'
              ? 'max-w-md w-full'
              : viewLayout === 'tablet'
              ? 'max-w-5xl bg-[#0d1117] border-2 border-[#30363d] rounded-xl p-4 shadow-2xl relative my-1'
              : 'max-w-7xl'
          }`}
        >
          {/* If Landscape Tablet Mode: 2-column asymmetric layout */}
          {viewLayout === 'tablet' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* 60% Left Zone: Telemetry, State & Instrumentation */}
              <div className="lg:col-span-7 space-y-4">
                {activeTab === 'cockpit' && (
                  <div className="space-y-4">
                    <GlanceableCockpit
                      telemetry={telemetry}
                      onAccelerate={handleAccelerate}
                      onBrake={handleBrake}
                      onToggleDock={handleToggleDock}
                      onOpenPreShift={() => setIsPreShiftOpen(true)}
                      onOpenEspModal={() => setIsEspModalOpen(true)}
                      onToggleCruise={() => setIsCruiseActive(!isCruiseActive)}
                      isCruiseActive={isCruiseActive}
                    />

                    {/* MQ-9 Gas Safety Control & Threshold Card */}
                    <GasSafetyCard
                      gas={telemetry.gas}
                      onUpdateThreshold={handleUpdateGasThreshold}
                      onAcknowledgeWarning={handleAcknowledgeGasWarning}
                      onSimulateLeak={handleSimulateGasLeak}
                      onVentilate={handleVentilateCab}
                      onOpenRemediationModal={() => setIsGasRemediationOpen(true)}
                    />

                    {/* Phone Hardware Sensors Live Card */}
                    <PhoneSensorsCard
                      sensors={telemetry.phoneSensors}
                      onSyncGpsSpeed={(speed) => {
                        setTelemetry((p) => ({ ...p, speedKmh: speed }));
                        logEvent('GPS Velocity Synchronized', 'info', 'GPS-SYNC', `Cockpit speedometer synced to hardware GPS ground speed (${speed} km/h).`);
                      }}
                    />
                  </div>
                )}
                {activeTab === 'phoneSensors' && (
                  <div className="space-y-4">
                    <PhoneSensorsCard
                      sensors={telemetry.phoneSensors}
                      onSyncGpsSpeed={(speed) => {
                        setTelemetry((p) => ({ ...p, speedKmh: speed }));
                        logEvent('GPS Velocity Synchronized', 'info', 'GPS-SYNC', `Cockpit speedometer synced to hardware GPS ground speed (${speed} km/h).`);
                      }}
                    />
                  </div>
                )}
                {activeTab === 'esp' && (
                  <div className="space-y-4">
                    <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-[#f59e0b] text-[#051424] flex items-center justify-center font-bold">
                          <Cpu className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-base font-headline font-bold text-white">
                            ESP32 / NodeMCU In-Cab Telemetry Hub
                          </h3>
                          <p className="text-xs font-mono text-[#94a3b8]">
                            STATUS: {telemetry.esp.isConnected ? 'STREAMING ACTIVE (4HZ)' : 'OFFLINE'} · SENSORS: MQ-3, REED, RELAY
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          cabAudio.playKeyClick();
                          setIsEspModalOpen(true);
                        }}
                        className="px-4 py-2 rounded font-headline font-bold text-xs bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] industrial-btn"
                      >
                        {telemetry.esp.isConnected ? 'CONFIGURE SENSORS' : 'CONNECT HARDWARE'}
                      </button>
                    </div>

                    {/* Sensor summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                        <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">DOCK SWITCH</span>
                        <span className="text-base font-mono font-bold text-white">
                          {telemetry.dockLocked ? 'LOCKED' : 'UNDOCKED'}
                        </span>
                      </div>
                      <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                        <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">MQ-3 ALCOHOL</span>
                        <span className="text-base font-mono font-bold text-[#10b981]">
                          BAC {telemetry.interlock.bacPercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                        <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">RELAY OUTPUT</span>
                        <span className="text-base font-mono font-bold text-[#ffc174]">
                          {telemetry.ignitionRelayClosed ? 'CLOSED (ARMED)' : 'OPEN (CUT-OFF)'}
                        </span>
                      </div>
                      <div className="p-3 rounded bg-[#161b22] border border-[#30363d]">
                        <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">PACKETS RECVD</span>
                        <span className="text-base font-mono font-bold text-white">
                          {telemetry.esp.packetsReceived}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'diagnostics' && (
                  <FleetDiagnosticsView
                    telemetry={telemetry}
                    onSimulateDtc={(code, desc) => setActiveDtc({ code, desc })}
                    onClearDtc={() => setActiveDtc(null)}
                    activeDtc={activeDtc}
                  />
                )}
                {activeTab === 'logs' && (
                  <ShiftLogView
                    events={events}
                    driverId={telemetry.driverId}
                    cabUnitId={telemetry.cabUnitId}
                    onClearLogs={() => setEvents([])}
                  />
                )}
                {activeTab === 'simulator' && (
                  <CabMountSimulator
                    telemetry={telemetry}
                    onToggleDock={handleToggleDock}
                    onSimulateImpact={() => handleSimulateImpact(false)}
                    onSimulateOverSpeed={handleSimulateOverSpeed}
                    onSimulateObdDisconnect={() => {
                      setTelemetry((p) => ({ ...p, obdConnected: !p.obdConnected }));
                    }}
                    onLoadPreset={handleLoadPreset}
                  />
                )}
              </div>

              {/* 40% Right Zone: Pinned Action Controls & Emergency Actions */}
              <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Driver Invariant Card */}
                  <div className="bg-[#161b22] border border-[#30363d] rounded p-4">
                    <span className="text-xs font-mono font-bold text-[#94a3b8] uppercase block mb-2">
                      CAB INVARIANTS STATUS
                    </span>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between p-2 rounded bg-[#0d1c2d] border border-[#30363d]">
                        <span>DOCK MOUNT</span>
                        <span className={telemetry.dockLocked ? 'text-[#10b981] font-bold' : 'text-[#f59e0b] font-bold'}>
                          {telemetry.dockLocked ? 'LOCKED & CLAMPED' : 'UNDOCKED'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-[#0d1c2d] border border-[#30363d]">
                        <span>ALCOHOL INTERLOCK</span>
                        <span className={telemetry.interlock.status === 'passed' ? 'text-[#10b981] font-bold' : 'text-[#ef4444] font-bold'}>
                          {telemetry.interlock.status === 'passed' ? '0.00% PASS' : 'VERIFICATION REQ'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-[#0d1c2d] border border-[#30363d]">
                        <span>IGNITION STARTER</span>
                        <span className={telemetry.ignitionRelayClosed ? 'text-[#10b981] font-bold' : 'text-[#ef4444] font-bold'}>
                          {telemetry.ignitionRelayClosed ? 'ARMED' : 'CUT-OFF'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <button
                        onClick={() => {
                          cabAudio.playKeyClick();
                          setIsPreShiftOpen(true);
                        }}
                        className="w-full h-12 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] font-headline font-bold text-xs flex items-center justify-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#ffc174]" />
                        <span>PRE-SHIFT VERIFICATION KEYPAD</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Road Simulator */}
                  <CabMountSimulator
                    telemetry={telemetry}
                    onToggleDock={handleToggleDock}
                    onSimulateImpact={() => handleSimulateImpact(false)}
                    onSimulateOverSpeed={handleSimulateOverSpeed}
                    onSimulateObdDisconnect={() => {
                      setTelemetry((p) => ({ ...p, obdConnected: !p.obdConnected }));
                    }}
                    onLoadPreset={handleLoadPreset}
                  />
                </div>

                {/* Bottom Pinned Emergency SOS */}
                <div className="pt-4 border-t border-[#30363d]">
                  <EmergencySosButton
                    telemetry={telemetry}
                    onTriggerSos={handleTriggerSos}
                    onCancelSos={handleCancelSos}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Portrait Full-Screen Phone or Standard Wide Desktop Layout */
            <div className="space-y-3 sm:space-y-4">
              {activeTab === 'cockpit' && (
                <>
                  <GlanceableCockpit
                    telemetry={telemetry}
                    onAccelerate={handleAccelerate}
                    onBrake={handleBrake}
                    onToggleDock={handleToggleDock}
                    onOpenPreShift={() => setIsPreShiftOpen(true)}
                    onOpenEspModal={() => setIsEspModalOpen(true)}
                    onToggleCruise={() => setIsCruiseActive(!isCruiseActive)}
                    isCruiseActive={isCruiseActive}
                  />

                  {/* Immediate Emergency SOS Action directly below Speedometer for Full-Screen Phone */}
                  <EmergencySosButton
                    telemetry={telemetry}
                    onTriggerSos={handleTriggerSos}
                    onCancelSos={handleCancelSos}
                  />

                  {/* MQ-9 Gas & Carbon Monoxide Safety Subsystem */}
                  <GasSafetyCard
                    gas={telemetry.gas}
                    onUpdateThreshold={handleUpdateGasThreshold}
                    onAcknowledgeWarning={handleAcknowledgeGasWarning}
                    onSimulateLeak={handleSimulateGasLeak}
                    onVentilate={handleVentilateCab}
                    onOpenRemediationModal={() => setIsGasRemediationOpen(true)}
                  />

                  {/* Phone Hardware Sensors Live Suite */}
                  <PhoneSensorsCard
                    sensors={telemetry.phoneSensors}
                    onSyncGpsSpeed={(speed) => {
                      setTelemetry((p) => ({ ...p, speedKmh: speed }));
                      logEvent('GPS Velocity Synchronized', 'info', 'GPS-SYNC', `Cockpit speedometer synced to hardware GPS ground speed (${speed} km/h).`);
                    }}
                  />
                </>
              )}

              {activeTab === 'phoneSensors' && (
                <div className="space-y-4">
                  <PhoneSensorsCard
                    sensors={telemetry.phoneSensors}
                    onSyncGpsSpeed={(speed) => {
                      setTelemetry((p) => ({ ...p, speedKmh: speed }));
                      logEvent('GPS Velocity Synchronized', 'info', 'GPS-SYNC', `Cockpit speedometer synced to hardware GPS ground speed (${speed} km/h).`);
                    }}
                  />
                </div>
              )}

              {activeTab === 'esp' && (
                <div className="space-y-4">
                  <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-[#f59e0b] text-[#051424] flex items-center justify-center font-bold">
                        <Cpu className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-headline font-bold text-white">
                            ESP32 & NodeMCU (ESP8266) In-Cab Hardware Center
                          </h3>
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                              telemetry.esp.isConnected
                                ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                                : 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]'
                            }`}
                          >
                            {telemetry.esp.isConnected ? 'STREAMING ACTIVE' : 'OFFLINE'}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-[#94a3b8]">
                          BAUD: 115200 · PROTOCOL: JSON SERIAL OVER USB-OTG / BLE / WI-FI
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          cabAudio.playKeyClick();
                          setIsEspModalOpen(true);
                        }}
                        className="px-4 py-2 rounded font-headline font-bold text-xs bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] industrial-btn"
                      >
                        {telemetry.esp.isConnected ? 'CONFIGURE SENSORS & PINOUT' : 'CONNECT ESP HARDWARE'}
                      </button>
                    </div>
                  </div>

                  {/* Live Sensor Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded bg-[#161b22] border border-[#30363d]">
                      <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">DOCK REED SWITCH</span>
                      <span className={`text-lg font-mono font-bold ${telemetry.dockLocked ? 'text-[#10b981]' : 'text-[#f59e0b]'}`}>
                        {telemetry.dockLocked ? 'LOCKED (PIN LOW)' : 'UNDOCKED'}
                      </span>
                      <span className="text-[10px] font-mono text-[#94a3b8] block mt-1">
                        GPIO 4 / D5
                      </span>
                    </div>

                    <div className="p-3.5 rounded bg-[#161b22] border border-[#30363d]">
                      <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">MQ-3 ALCOHOL VAPOR</span>
                      <span className={`text-lg font-mono font-bold ${telemetry.interlock.status === 'passed' ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        {telemetry.interlock.bacPercent.toFixed(2)}% BAC
                      </span>
                      <span className="text-[10px] font-mono text-[#94a3b8] block mt-1">
                        GPIO 34 / A0 ADC
                      </span>
                    </div>

                    <div className="p-3.5 rounded bg-[#161b22] border border-[#30363d]">
                      <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">12V STARTER RELAY</span>
                      <span className={`text-lg font-mono font-bold ${telemetry.ignitionRelayClosed ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        {telemetry.ignitionRelayClosed ? 'ARMED (HIGH)' : 'CUT-OFF (LOW)'}
                      </span>
                      <span className="text-[10px] font-mono text-[#94a3b8] block mt-1">
                        GPIO 5 / D1
                      </span>
                    </div>

                    <div className="p-3.5 rounded bg-[#161b22] border border-[#30363d]">
                      <span className="text-[10px] font-mono text-[#94a3b8] uppercase block">PACKETS RECEIVED</span>
                      <span className="text-lg font-mono font-bold text-white tabular-nums">
                        {telemetry.esp.packetsReceived}
                      </span>
                      <span className="text-[10px] font-mono text-[#4edea3] block mt-1">
                        RATE: 4 HZ
                      </span>
                    </div>
                  </div>

                  {/* Raw packet viewer */}
                  <div className="bg-[#010f1f] border border-[#30363d] rounded p-4 font-mono text-xs">
                    <div className="flex items-center justify-between text-[#94a3b8] border-b border-[#30363d] pb-2 mb-2">
                      <span className="text-white font-bold">REAL-TIME SERIAL CONSOLE LOGS</span>
                      <button
                        onClick={() => {
                          cabAudio.playKeyClick();
                          setIsEspModalOpen(true);
                        }}
                        className="text-[#f59e0b] underline"
                      >
                        Open Serial Tools & Code
                      </button>
                    </div>

                    <div className="h-40 overflow-y-auto space-y-1 text-slate-300">
                      {telemetry.esp.rawLogs.length === 0 ? (
                        <div className="text-[#94a3b8] italic">
                          No packets received. Connect your ESP32 or NodeMCU via USB-OTG, BLE, or click 'Connect ESP Hardware' to launch the virtual stream.
                        </div>
                      ) : (
                        telemetry.esp.rawLogs.map((log, i) => (
                          <div key={i} className="text-[#6ffbbe]">
                            <span className="text-[#94a3b8] select-none">&gt; </span>
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'diagnostics' && (
                <FleetDiagnosticsView
                  telemetry={telemetry}
                  onSimulateDtc={(code, desc) => setActiveDtc({ code, desc })}
                  onClearDtc={() => setActiveDtc(null)}
                  activeDtc={activeDtc}
                />
              )}

              {activeTab === 'logs' && (
                <ShiftLogView
                  events={events}
                  driverId={telemetry.driverId}
                  cabUnitId={telemetry.cabUnitId}
                  onClearLogs={() => setEvents([])}
                />
              )}

              {activeTab === 'simulator' && (
                <CabMountSimulator
                  telemetry={telemetry}
                  onToggleDock={handleToggleDock}
                  onSimulateImpact={() => handleSimulateImpact(false)}
                  onSimulateOverSpeed={handleSimulateOverSpeed}
                  onSimulateObdDisconnect={() => {
                    setTelemetry((p) => ({ ...p, obdConnected: !p.obdConnected }));
                  }}
                  onLoadPreset={handleLoadPreset}
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Pre-Shift Verification Modal (Oversized 64px Keypad + Breath Blow Simulator) */}
      <PreShiftVerificationModal
        isOpen={isPreShiftOpen}
        onClose={() => setIsPreShiftOpen(false)}
        telemetry={telemetry}
        onCompleteVerification={handleCompleteVerification}
        onToggleDock={handleToggleDock}
        onOpenEspModal={() => setIsEspModalOpen(true)}
      />

      {/* ESP32 & NodeMCU Hardware Connection & Sensor Reader Modal */}
      <EspHardwareModal
        isOpen={isEspModalOpen}
        onClose={() => setIsEspModalOpen(false)}
        espState={telemetry.esp}
        onConfirmDock={handleConfirmDockWithEsp}
      />

      {/* Real Android In-Cab Device Testing & Guide Modal */}
      <RealAndroidTestingModal
        isOpen={isAndroidModalOpen}
        onClose={() => setIsAndroidModalOpen(false)}
        onOpenEspModal={() => setIsEspModalOpen(true)}
      />

      {/* Commercial Fleet Vehicle Selector Modal */}
      <VehicleSelectorModal
        isOpen={isVehicleSelectorOpen}
        onClose={() => setIsVehicleSelectorOpen(false)}
        selectedVehicle={telemetry.selectedVehicle}
        onSelectVehicle={handleSelectVehicle}
      />

      {/* Mandatory Gas Hazard Lockout Remediation Modal */}
      <GasRemediationModal
        isOpen={isGasRemediationOpen}
        gasState={telemetry.gas}
        onVentilateAndFix={handleVentilateCab}
        onCompleteRemediation={handleCompleteGasRemediation}
      />

      {/* Automatic Crash & High-G Collision Modal (Auto-Dials 82199) */}
      <CrashEmergencyModal
        isOpen={isCrashModalOpen}
        telemetry={telemetry}
        impactG={crashImpactG}
        onCancelCrash={() => {
          setIsCrashModalOpen(false);
          handleCancelSos();
        }}
      />

      {/* Fixed Bottom Thumb Navigation Bar for Full-Screen Mobile Phones */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0d1c2d]/95 backdrop-blur border-t border-[#30363d] grid grid-cols-6 px-1 py-1 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <button
          type="button"
          onClick={() => {
            cabAudio.playKeyClick();
            setActiveTab('cockpit');
          }}
          className={`flex flex-col items-center justify-center py-1.5 rounded transition-colors ${
            activeTab === 'cockpit' ? 'text-[#f59e0b] bg-[#1c2b3c]' : 'text-[#94a3b8]'
          }`}
        >
          <Gauge className="w-4 h-4" />
          <span className="text-[9px] font-headline font-bold mt-0.5">COCKPIT</span>
        </button>

        <button
          type="button"
          onClick={() => {
            cabAudio.playKeyClick();
            setActiveTab('phoneSensors');
          }}
          className={`flex flex-col items-center justify-center py-1.5 rounded transition-colors ${
            activeTab === 'phoneSensors' ? 'text-[#38bdf8] bg-[#1c2b3c]' : 'text-[#94a3b8]'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span className="text-[9px] font-headline font-bold mt-0.5">SENSORS</span>
        </button>

        <button
          type="button"
          onClick={() => {
            cabAudio.playKeyClick();
            setActiveTab('esp');
          }}
          className={`flex flex-col items-center justify-center py-1.5 rounded transition-colors ${
            activeTab === 'esp' ? 'text-[#f59e0b] bg-[#1c2b3c]' : 'text-[#94a3b8]'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span className="text-[9px] font-headline font-bold mt-0.5">ESP32</span>
        </button>

        <button
          type="button"
          onClick={() => {
            cabAudio.playKeyClick();
            setActiveTab('diagnostics');
          }}
          className={`flex flex-col items-center justify-center py-1.5 rounded transition-colors ${
            activeTab === 'diagnostics' ? 'text-[#f59e0b] bg-[#1c2b3c]' : 'text-[#94a3b8]'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span className="text-[9px] font-headline font-bold mt-0.5">CAN-BUS</span>
        </button>

        <button
          type="button"
          onClick={() => {
            cabAudio.playKeyClick();
            setActiveTab('logs');
          }}
          className={`flex flex-col items-center justify-center py-1.5 rounded transition-colors ${
            activeTab === 'logs' ? 'text-[#f59e0b] bg-[#1c2b3c]' : 'text-[#94a3b8]'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span className="text-[9px] font-headline font-bold mt-0.5">LOGS</span>
        </button>

        <button
          type="button"
          onClick={() => {
            cabAudio.playKeyClick();
            setActiveTab('simulator');
          }}
          className={`flex flex-col items-center justify-center py-1.5 rounded transition-colors ${
            activeTab === 'simulator' ? 'text-[#f59e0b] bg-[#1c2b3c]' : 'text-[#94a3b8]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span className="text-[9px] font-headline font-bold mt-0.5">SIM</span>
        </button>
      </nav>

      {/* Industrial Footer (Desktop only to save vertical phone screen space) */}
      <footer className="hidden sm:block border-t border-[#30363d] bg-[#0d1c2d] py-3 px-4 text-center text-xs font-mono text-[#94a3b8] mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            DRIVELOCK INDUSTRIAL SAFETY OS v2.4 · OBD-II CAN-BUS LINK ARMED
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#10b981]">SYSTEM INVARIANTS: OK</span>
            <span>·</span>
            <span>FAIL-SAFE RELAY ACTIVE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
