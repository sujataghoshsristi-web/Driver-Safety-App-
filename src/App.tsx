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
  PhoneCall
} from 'lucide-react';
import { TelemetryData, IncidentEvent, SafetyStatus } from './types/telemetry';
import { cabAudio } from './utils/audio';
import { PersistentHardwareBar } from './components/PersistentHardwareBar';
import { GlanceableCockpit } from './components/GlanceableCockpit';
import { PreShiftVerificationModal } from './components/PreShiftVerificationModal';
import { EmergencySosButton } from './components/EmergencySosButton';
import { FleetDiagnosticsView } from './components/FleetDiagnosticsView';
import { ShiftLogView } from './components/ShiftLogView';
import { CabMountSimulator } from './components/CabMountSimulator';

const INITIAL_TELEMETRY: TelemetryData = {
  speedKmh: 42,
  speedLimitKmh: 60,
  rpm: 1680,
  batteryVoltage: 13.8,
  coolantTempC: 88,
  fuelPercent: 78,
  throttlePercent: 32,
  oilPressurePsi: 45,
  odometerKm: 38492.4,
  tripKm: 18.6,
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
  safetyStatus: 'OPERATIONAL_READY',
  ignitionRelayClosed: true,
  sosActive: false,
  sosTimer: 0,
  shiftStartTime: '07:00 AM',
  driverId: 'DRV-8492',
  cabUnitId: '408',
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
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [events, setEvents] = useState<IncidentEvent[]>(INITIAL_EVENTS);
  const [activeTab, setActiveTab] = useState<'cockpit' | 'diagnostics' | 'logs' | 'simulator'>('cockpit');
  const [viewLayout, setViewLayout] = useState<'phone' | 'tablet' | 'full'>('full');
  const [isPreShiftOpen, setIsPreShiftOpen] = useState<boolean>(false);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isCruiseActive, setIsCruiseActive] = useState<boolean>(false);
  const [activeDtc, setActiveDtc] = useState<{ code: string; desc: string } | null>(null);

  // Background simulation tick: update slight road telemetry, GPS, and speed adjustments
  useEffect(() => {
    const timer = setInterval(() => {
      setTelemetry((prev) => {
        // If engine immobilized or emergency, speed drops to 0
        if (prev.safetyStatus === 'IMMOBILIZED' || prev.safetyStatus === 'EMERGENCY_CRITICAL') {
          return {
            ...prev,
            speedKmh: Math.max(0, prev.speedKmh - 6),
            rpm: prev.speedKmh > 0 ? Math.max(600, prev.rpm - 150) : 0,
            ignitionRelayClosed: false,
          };
        }

        // Small alternator voltage jitter (13.75 - 13.85V)
        const newVolt = 13.75 + Math.random() * 0.12;

        // If cruise is active, maintain around speed limit
        let newSpeed = prev.speedKmh;
        if (isCruiseActive) {
          const target = prev.speedLimitKmh - 5;
          newSpeed = prev.speedKmh + (target > prev.speedKmh ? 1 : target < prev.speedKmh ? -1 : 0);
        }

        // Calculate RPM proportional to speed
        const newRpm = newSpeed > 0 ? Math.round(850 + newSpeed * 22) : 750;

        // Slight GPS increment along route
        const newLat = prev.gps.latitude + (newSpeed > 0 ? 0.00004 : 0);
        const newLon = prev.gps.longitude + (newSpeed > 0 ? 0.00002 : 0);
        const newTrip = prev.tripKm + (newSpeed > 0 ? 0.008 : 0);

        return {
          ...prev,
          speedKmh: newSpeed,
          rpm: newRpm,
          batteryVoltage: Number(newVolt.toFixed(2)),
          tripKm: Number(newTrip.toFixed(2)),
          gps: {
            ...prev.gps,
            latitude: newLat,
            longitude: newLon,
          },
          gForce: {
            x: Number(((Math.random() - 0.5) * 0.08).toFixed(2)),
            y: Number(((Math.random() - 0.5) * 0.06).toFixed(2)),
            z: Number((0.98 + Math.random() * 0.08).toFixed(2)),
            peak: prev.gForce.peak,
          },
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isCruiseActive]);

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
    setTelemetry((prev) => {
      logEvent(
        'EMERGENCY SOS DISPATCH TRIGGERED',
        'emergency',
        'SOS-ALARM',
        'In-cab emergency button engaged (1.5s hold verified). Central dispatch and emergency units alerted.'
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
    setTelemetry((prev) => {
      const g = isCollision ? 3.85 : 1.62;
      const severity = isCollision ? 'emergency' : 'warning';
      const code = isCollision ? 'COL-IMPACT' : 'ROUGH-TERRAIN';
      const title = isCollision ? 'CRITICAL HIGH-G COLLISION DETECTED' : 'Rough Road / Pothole Shock Event';

      cabAudio.playEmergencyAlarm();
      logEvent(
        title,
        severity,
        code,
        `Accelerometer registered ${g}G shock vector on cab axis.`
      );

      return {
        ...prev,
        gForce: {
          ...prev.gForce,
          peak: g,
        },
        sosActive: isCollision ? true : prev.sosActive,
        safetyStatus: isCollision ? 'EMERGENCY_CRITICAL' : prev.safetyStatus,
        speedKmh: isCollision ? 0 : prev.speedKmh,
        ignitionRelayClosed: isCollision ? false : prev.ignitionRelayClosed,
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
      setTelemetry((prev) => ({
        ...prev,
        speedKmh: 52,
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
      }));
      logEvent('Preset: Highway Safe', 'info', 'PST-SAFE', 'Safe operational envelope active.');
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

  // Reset simulator
  const handleResetSimulation = () => {
    cabAudio.playSuccessChime();
    setTelemetry(INITIAL_TELEMETRY);
    setActiveDtc(null);
    logEvent('Simulator Reset', 'info', 'SIM-RST', 'All cab instruments reset to standard safe baseline.');
  };

  return (
    <div className="min-h-screen bg-[#051424] text-[#d4e4fa] flex flex-col font-body antialiased hud-grid">
      {/* 1. Persistent Top Tier Hardware Telemetry Bar */}
      <PersistentHardwareBar
        telemetry={telemetry}
        viewLayout={viewLayout}
        onLayoutChange={setViewLayout}
        isAudioMuted={isAudioMuted}
        onToggleAudio={handleToggleAudio}
        onOpenPreShift={() => setIsPreShiftOpen(true)}
        onResetSimulation={handleResetSimulation}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 flex flex-col">
        {/* Navigation Tabs (Single line, functional buttons) */}
        <div className="flex items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto pb-1 border-b border-[#30363d]">
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

        {/* Viewport Frame Adapters: Phone vs Tablet vs Full */}
        <div
          className={`mx-auto w-full transition-all duration-300 ${
            viewLayout === 'phone'
              ? 'max-w-md bg-[#0d1117] border-4 border-[#30363d] rounded-2xl p-4 shadow-2xl relative my-2 pb-24'
              : viewLayout === 'tablet'
              ? 'max-w-5xl bg-[#0d1117] border-4 border-[#30363d] rounded-xl p-5 shadow-2xl relative my-2'
              : 'max-w-7xl'
          }`}
        >
          {/* Frame Label if simulated */}
          {viewLayout !== 'full' && (
            <div className="mb-3 pb-2 border-b border-[#30363d] flex items-center justify-between text-xs font-mono text-[#94a3b8]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                {viewLayout === 'phone'
                  ? '📱 MOUNTED SMARTPHONE VIEW (1-COLUMN FLUID)'
                  : '📟 7"–10" RUGGED IN-VEHICLE TABLET (2-COLUMN 60/40 SPLIT)'}
              </span>
              <button
                onClick={() => setViewLayout('full')}
                className="underline hover:text-white"
              >
                Expand View
              </button>
            </div>
          )}

          {/* If Landscape Tablet Mode: 2-column asymmetric layout (60% state telemetry on left, 40% interaction controls & emergency actions on right) */}
          {viewLayout === 'tablet' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* 60% Left Zone: Telemetry, State & Instrumentation */}
              <div className="lg:col-span-7 space-y-4">
                {activeTab === 'cockpit' && (
                  <GlanceableCockpit
                    telemetry={telemetry}
                    onAccelerate={handleAccelerate}
                    onBrake={handleBrake}
                    onToggleDock={handleToggleDock}
                    onOpenPreShift={() => setIsPreShiftOpen(true)}
                    onToggleCruise={() => setIsCruiseActive(!isCruiseActive)}
                    isCruiseActive={isCruiseActive}
                  />
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
                    onSimulateOverSpeed={() => {
                      setTelemetry((p) => ({ ...p, speedKmh: 75, safetyStatus: 'RESTRICTED_GOVERNOR' }));
                      logEvent('High Speed Spike', 'warning', 'SPD-SPIKE', 'Speed peaked at 75 km/h.');
                    }}
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
                    onSimulateOverSpeed={() => {
                      setTelemetry((p) => ({ ...p, speedKmh: 75, safetyStatus: 'RESTRICTED_GOVERNOR' }));
                      logEvent('High Speed Spike', 'warning', 'SPD-SPIKE', 'Speed peaked at 75 km/h.');
                    }}
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
            /* Portrait Phone or Standard Wide Desktop Layout */
            <div className="space-y-4">
              {activeTab === 'cockpit' && (
                <>
                  <GlanceableCockpit
                    telemetry={telemetry}
                    onAccelerate={handleAccelerate}
                    onBrake={handleBrake}
                    onToggleDock={handleToggleDock}
                    onOpenPreShift={() => setIsPreShiftOpen(true)}
                    onToggleCruise={() => setIsCruiseActive(!isCruiseActive)}
                    isCruiseActive={isCruiseActive}
                  />

                  {/* Bottom Emergency SOS Action Container */}
                  <div className="mt-6 pt-3">
                    <EmergencySosButton
                      telemetry={telemetry}
                      onTriggerSos={handleTriggerSos}
                      onCancelSos={handleCancelSos}
                    />
                  </div>
                </>
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
                  onSimulateOverSpeed={() => {
                    setTelemetry((p) => ({ ...p, speedKmh: 75, safetyStatus: 'RESTRICTED_GOVERNOR' }));
                    logEvent('High Speed Spike', 'warning', 'SPD-SPIKE', 'Speed peaked at 75 km/h.');
                  }}
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
      />

      {/* Industrial Footer */}
      <footer className="border-t border-[#30363d] bg-[#0d1c2d] py-3 px-4 text-center text-xs font-mono text-[#94a3b8] mt-auto">
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
