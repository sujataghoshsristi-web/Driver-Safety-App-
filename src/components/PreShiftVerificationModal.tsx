import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  Smartphone, 
  Wind, 
  KeyRound, 
  CheckSquare, 
  Square, 
  Delete, 
  Unlock,
  AlertCircle
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';

interface PreShiftVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: TelemetryData;
  onCompleteVerification: (driverPin: string, bac: number) => void;
  onToggleDock: () => void;
  onOpenEspModal: () => void;
}

export const PreShiftVerificationModal: React.FC<PreShiftVerificationModalProps> = ({
  isOpen,
  onClose,
  telemetry,
  onCompleteVerification,
  onToggleDock,
  onOpenEspModal,
}) => {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [pin, setPin] = useState<string>('');
  const [isBlowing, setIsBlowing] = useState<boolean>(false);
  const [blowProgress, setBlowProgress] = useState<number>(0);
  const [testedBac, setTestedBac] = useState<number | null>(
    telemetry.interlock.status === 'passed' ? 0.00 : null
  );
  const [simulateFailBac, setSimulateFailBac] = useState<boolean>(false);
  const [checks, setChecks] = useState<{
    tires: boolean;
    brakes: boolean;
    mirrors: boolean;
    emergencyKit: boolean;
  }>({
    tires: true,
    brakes: true,
    mirrors: true,
    emergencyKit: true,
  });
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isOpen) return null;

  // Keypad press handler
  const handleKeypadPress = (val: string) => {
    cabAudio.playKeyClick();
    setErrorMessage('');
    if (val === 'CLEAR') {
      setPin('');
      return;
    }
    if (val === 'DEL') {
      setPin((prev) => prev.slice(0, -1));
      return;
    }
    if (pin.length < 6) {
      setPin((prev) => prev + val);
    }
  };

  // Breathalyzer Blow test simulation
  const handleStartBlow = () => {
    cabAudio.playKeyClick();
    setIsBlowing(true);
    setBlowProgress(0);
    setErrorMessage('');

    let current = 0;
    const interval = setInterval(() => {
      current += 20;
      setBlowProgress(current);
      if (current >= 100) {
        clearInterval(interval);
        setIsBlowing(false);
        const resultBac = simulateFailBac ? 0.04 : 0.00;
        setTestedBac(resultBac);
        if (resultBac === 0.00) {
          cabAudio.playSuccessChime();
        } else {
          cabAudio.playWarningBuzzer();
        }
      }
    }, 300);
  };

  // Submit complete verification
  const handleFinalSubmit = () => {
    if (pin.length < 4) {
      cabAudio.playWarningBuzzer();
      setErrorMessage('PIN must be at least 4 digits (e.g. 8492)');
      return;
    }

    if (testedBac !== 0.00) {
      cabAudio.playWarningBuzzer();
      setErrorMessage('Breathalyzer must read 0.00% BAC before ignition can unlock');
      return;
    }

    cabAudio.playRelaySolenoid(true);
    cabAudio.playSuccessChime();
    onCompleteVerification(pin, testedBac);
    onClose();
  };

  const allChecksPassed = Object.values(checks).every(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0d1c2d] border-2 border-[#30363d] rounded-lg shadow-2xl overflow-hidden my-auto">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#161b22] border-b border-[#30363d]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#f59e0b] text-[#051424] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold text-white tracking-tight">
                Pre-Shift Industrial Sign-Off & Interlock
              </h3>
              <p className="text-xs font-mono text-[#94a3b8]">
                STEP {activeStep} OF 4 · DRIVER ID: {telemetry.driverId}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onClose();
            }}
            className="p-2 text-[#94a3b8] hover:text-white rounded border border-[#30363d] bg-[#21262d]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Indicators */}
        <div className="grid grid-cols-4 border-b border-[#30363d] text-center font-mono text-xs">
          {[
            { num: 1, label: '1. DOCK' },
            { num: 2, label: '2. BREATH' },
            { num: 3, label: '3. CHECKS' },
            { num: 4, label: '4. PIN' },
          ].map((s) => (
            <button
              key={s.num}
              onClick={() => {
                cabAudio.playKeyClick();
                setActiveStep(s.num as 1 | 2 | 3 | 4);
              }}
              className={`py-2.5 px-1 border-r last:border-r-0 border-[#30363d] transition-colors ${
                activeStep === s.num
                  ? 'bg-[#1c2b3c] text-[#f59e0b] font-bold border-b-2 border-b-[#f59e0b]'
                  : 'bg-[#161b22] text-[#94a3b8] hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* STEP 1: Handset Dock Clamp Verification */}
          {activeStep === 1 && (
            <div className="space-y-4">
              <div className="p-4 rounded bg-[#161b22] border border-[#30363d]">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-8 h-8 text-[#f59e0b]" />
                  <div>
                    <h4 className="font-headline font-bold text-white text-base">
                      Hardware Dock & In-Cab Lock
                    </h4>
                    <p className="text-xs text-[#94a3b8] mt-0.5">
                      The device must remain securely docked into the authorized vehicle magnetic dash cradle to prevent distracted driving.
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#30363d] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#94a3b8]">ESP TELEMETRY LINK:</span>
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        telemetry.esp.isConnected
                          ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                          : 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]'
                      }`}
                    >
                      {telemetry.esp.isConnected
                        ? `${telemetry.esp.deviceType.toUpperCase()} ONLINE`
                        : 'NOT CONNECTED'}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      cabAudio.playKeyClick();
                      onOpenEspModal();
                    }}
                    className="text-xs font-mono px-3 py-1 rounded bg-[#1c2b3c] hover:bg-[#273647] text-[#ffc174] border border-[#f59e0b]/50"
                  >
                    {telemetry.esp.isConnected ? 'Configure ESP Settings' : 'Connect ESP32 / NodeMCU'}
                  </button>
                </div>

                <div className="mt-3 pt-3 border-t border-[#30363d] flex items-center justify-between">
                  <span className="text-xs font-mono text-[#94a3b8]">DOCK SENSOR STATUS:</span>
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      telemetry.dockLocked
                        ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                        : 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]'
                    }`}
                  >
                    {telemetry.dockLocked ? 'VERIFIED LOCKED' : 'DISCONNECTED'}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center gap-3">
                <button
                  onClick={() => {
                    cabAudio.playRelaySolenoid(!telemetry.dockLocked);
                    onToggleDock();
                  }}
                  className={`flex-1 h-14 rounded font-headline font-bold text-base industrial-btn flex items-center justify-center gap-2 ${
                    telemetry.dockLocked
                      ? 'bg-[#21262d] text-white border border-[#30363d] hover:bg-[#1c2b3c]'
                      : 'bg-[#f59e0b] text-[#0d1117] hover:bg-[#d97706]'
                  }`}
                >
                  <Smartphone className="w-5 h-5" />
                  <span>{telemetry.dockLocked ? 'Simulate Undock Phone' : 'Secure Into Dock Mount'}</span>
                </button>

                <button
                  disabled={!telemetry.dockLocked}
                  onClick={() => {
                    cabAudio.playKeyClick();
                    setActiveStep(2);
                  }}
                  className="h-14 px-6 rounded font-headline font-bold text-base bg-[#10b981] hover:bg-[#059669] disabled:opacity-40 disabled:cursor-not-allowed text-[#0d1117] industrial-btn whitespace-nowrap"
                >
                  Next: Breathalyzer →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Alcohol Breathalyzer Interlock Test */}
          {activeStep === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded bg-[#161b22] border border-[#30363d]">
                <div className="flex items-center gap-3">
                  <Wind className="w-8 h-8 text-[#4edea3]" />
                  <div>
                    <h4 className="font-headline font-bold text-white text-base">
                      Alcohol Interlock Calibration & Breath Test
                    </h4>
                    <p className="text-xs text-[#94a3b8] mt-0.5">
                      Hold the blow test button for 3 seconds into the in-cab breath sensor mouthpiece. Threshold: 0.00% BAC.
                    </p>
                  </div>
                </div>

                {/* Sensor Progress or Result */}
                <div className="mt-5 p-4 rounded bg-[#0d1c2d] border border-[#30363d] text-center">
                  {isBlowing ? (
                    <div className="space-y-2">
                      <span className="font-mono text-sm text-[#f59e0b] animate-pulse">
                        SENSING AIRFLOW... HOLD BREATH ({blowProgress}%)
                      </span>
                      <div className="w-full bg-[#21262d] h-3 rounded-full overflow-hidden">
                        <div
                          className="bg-[#f59e0b] h-full transition-all duration-200"
                          style={{ width: `${blowProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : testedBac !== null ? (
                    <div>
                      <span className="text-xs font-mono text-[#94a3b8] block">TEST RESULT:</span>
                      <span
                        className={`font-mono text-3xl font-extrabold ${
                          testedBac === 0.00 ? 'text-[#10b981]' : 'text-[#ef4444]'
                        }`}
                      >
                        BAC {testedBac.toFixed(2)}% {testedBac === 0.00 ? 'PASS' : 'FAIL'}
                      </span>
                      <p className="text-xs font-mono text-[#94a3b8] mt-1">
                        {testedBac === 0.00
                          ? 'Zero blood alcohol detected. Sensor signature authenticated.'
                          : 'BAC exceeds zero tolerance limit. Ignition locked out.'}
                      </p>
                    </div>
                  ) : (
                    <span className="font-mono text-sm text-[#94a3b8]">
                      Awaiting breath sample from driver...
                    </span>
                  )}
                </div>

                {/* Option to test fail condition */}
                <div className="mt-3 flex items-center justify-between text-xs font-mono text-[#94a3b8]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simulateFailBac}
                      onChange={(e) => setSimulateFailBac(e.target.checked)}
                      className="rounded accent-[#f59e0b]"
                    />
                    <span>Simulate Failed Test (0.04% BAC Lockout)</span>
                  </label>

                  {testedBac !== null && (
                    <button
                      onClick={() => setTestedBac(null)}
                      className="underline hover:text-white"
                    >
                      Retest
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center gap-3">
                <button
                  disabled={isBlowing}
                  onClick={handleStartBlow}
                  className="flex-1 h-14 rounded font-headline font-bold text-base bg-[#f59e0b] hover:bg-[#d97706] text-[#0d1117] industrial-btn flex items-center justify-center gap-2"
                >
                  <Wind className="w-5 h-5" />
                  <span>{isBlowing ? 'ANALYZING...' : 'BLOW INTO SENSOR (3 SEC)'}</span>
                </button>

                <button
                  disabled={testedBac !== 0.00}
                  onClick={() => {
                    cabAudio.playKeyClick();
                    setActiveStep(3);
                  }}
                  className="h-14 px-6 rounded font-headline font-bold text-base bg-[#10b981] hover:bg-[#059669] disabled:opacity-40 disabled:cursor-not-allowed text-[#0d1117] industrial-btn whitespace-nowrap"
                >
                  Next: Checklist →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Vehicle Walkaround Inspection Checklist */}
          {activeStep === 3 && (
            <div className="space-y-4">
              <div className="p-4 rounded bg-[#161b22] border border-[#30363d]">
                <h4 className="font-headline font-bold text-white text-base mb-1">
                  Pre-Trip Safety & Walkaround Verification
                </h4>
                <p className="text-xs text-[#94a3b8] mb-4">
                  Confirm physical vehicle invariants in compliance with commercial transit protocols.
                </p>

                <div className="space-y-2.5">
                  {[
                    { key: 'tires' as const, label: 'Tire Pressure & Tread Depth Inspection' },
                    { key: 'brakes' as const, label: 'Air Brake Line Pressure & Parking Brake' },
                    { key: 'mirrors' as const, label: 'Blind Spot Mirrors & Windshield Visibility' },
                    { key: 'emergencyKit' as const, label: 'Emergency Triangles & Fire Extinguisher Present' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        cabAudio.playKeyClick();
                        setChecks((prev) => ({ ...prev, [item.key]: !prev[item.key] }));
                      }}
                      className="w-full flex items-center justify-between p-3 rounded bg-[#0d1c2d] border border-[#30363d] hover:bg-[#1c2b3c] transition-colors text-left"
                    >
                      <span className="text-sm font-body text-white">{item.label}</span>
                      {checks[item.key] ? (
                        <CheckSquare className="w-5 h-5 text-[#10b981]" />
                      ) : (
                        <Square className="w-5 h-5 text-[#94a3b8]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center gap-3">
                <button
                  onClick={() => {
                    cabAudio.playKeyClick();
                    setActiveStep(2);
                  }}
                  className="h-14 px-5 rounded font-headline font-bold text-sm bg-[#21262d] text-white border border-[#30363d]"
                >
                  ← Back
                </button>

                <button
                  disabled={!allChecksPassed}
                  onClick={() => {
                    cabAudio.playKeyClick();
                    setActiveStep(4);
                  }}
                  className="flex-1 h-14 rounded font-headline font-bold text-base bg-[#10b981] hover:bg-[#059669] disabled:opacity-40 disabled:cursor-not-allowed text-[#0d1117] industrial-btn whitespace-nowrap"
                >
                  Next: Enter Driver PIN →
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Oversized 64x64px Industrial PIN Keypad */}
          {activeStep === 4 && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-xs font-mono text-[#94a3b8] uppercase mb-1">
                  <KeyRound className="w-4 h-4 text-[#f59e0b]" />
                  <span>AUTHORIZATION PIN (DEFAULT: 8492)</span>
                </div>

                {/* PIN Display Digits */}
                <div className="inline-flex items-center justify-center gap-2 p-3 rounded bg-[#161b22] border-2 border-[#30363d] min-w-[240px]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-7 h-9 rounded flex items-center justify-center font-mono text-xl font-bold ${
                        pin[i]
                          ? 'bg-[#1c2b3c] text-[#f59e0b] border border-[#f59e0b]'
                          : 'bg-[#0d1c2d] text-slate-600 border border-[#30363d]'
                      }`}
                    >
                      {pin[i] ? '●' : '·'}
                    </div>
                  ))}
                </div>

                {errorMessage && (
                  <div className="flex items-center justify-center gap-1.5 text-xs font-mono text-[#ef4444] mt-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              {/* Oversized 64px x 64px Industrial Keypad Grid */}
              <div className="max-w-xs mx-auto grid grid-cols-3 gap-2.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLEAR', '0', 'DEL'].map((key) => {
                  const isDel = key === 'DEL';
                  const isClear = key === 'CLEAR';

                  return (
                    <button
                      key={key}
                      onClick={() => handleKeypadPress(key)}
                      className={`min-w-[64px] min-h-[64px] rounded font-mono font-bold text-xl industrial-btn flex items-center justify-center transition-all ${
                        isDel || isClear
                          ? 'bg-[#21262d] hover:bg-[#1c2b3c] text-[#94a3b8] text-xs border border-[#30363d]'
                          : 'bg-[#161b22] hover:bg-[#1c2b3c] text-white text-2xl border border-[#30363d] active:border-[#f59e0b]'
                      }`}
                    >
                      {isDel ? <Delete className="w-5 h-5" /> : key}
                    </button>
                  );
                })}
              </div>

              {/* Unlock Action Button */}
              <div className="pt-2">
                <button
                  onClick={handleFinalSubmit}
                  className="w-full h-16 rounded font-headline font-bold text-lg bg-[#10b981] hover:bg-[#059669] text-[#0d1117] industrial-btn flex items-center justify-center gap-2 shadow-lg"
                >
                  <Unlock className="w-6 h-6" />
                  <span>ARM IGNITION & UNLOCK ENGINE</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
