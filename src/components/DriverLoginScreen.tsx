import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Cpu, 
  Radio, 
  Smartphone, 
  UserCheck, 
  LogIn, 
  AlertCircle,
  Truck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cabAudio } from '../utils/audio';

export const DriverLoginScreen: React.FC = () => {
  const { loginWithGoogle, loginDemoDriver, isLoading } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setErrorMsg(err.message || 'Google sign-in was interrupted. You may also use In-Cab Test Mode below.');
    }
  };

  return (
    <div className="min-h-screen bg-[#051424] text-[#d4e4fa] flex flex-col justify-center items-center p-4 hud-grid">
      <div className="w-full max-w-lg bg-[#0d1c2d] border-2 border-[#30363d] rounded-lg shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Brand Lockup */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-lg bg-[#f59e0b] text-[#051424] flex items-center justify-center font-headline font-bold text-2xl mx-auto shadow-md">
            DL
          </div>
          <h1 className="text-2xl sm:text-3xl font-headline font-bold text-white tracking-tight">
            DriveLock Industrial Safety
          </h1>
          <p className="text-xs font-mono text-[#ffc174] uppercase tracking-wider">
            COMMERCIAL IN-CAB IMMOBILIZER & TELEMETRY OS
          </p>
          <div className="text-xs font-body text-[#94a3b8] max-w-sm mx-auto">
            Mission-critical operator authentication. Verify driver credentials to arm powertrain and access real-time vehicle instrumentation.
          </div>
        </div>

        {/* Security Invariant Highlights */}
        <div className="bg-[#161b22] border border-[#30363d] rounded p-4 space-y-2.5 text-xs font-mono">
          <span className="text-[#94a3b8] block uppercase text-[11px] font-bold">
            PRE-IGNITION SAFETY REQUIREMENTS:
          </span>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            <span>Driver Google Identity authenticated</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
            <span>ESP32 / NodeMCU sensor link connected</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
            <span>Handset clamped in magnetic dash dock</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-[#4edea3]" />
            <span>0.00% BAC alcohol interlock verified</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded bg-[#ef4444]/20 border border-[#ef4444] text-[#ffdad6] text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Primary Action: Google Login */}
        <div className="space-y-3">
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full h-16 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#051424] font-headline font-bold text-base industrial-btn flex items-center justify-center gap-3 shadow-lg"
          >
            {/* Google G SVG */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#051424"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#051424"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#051424"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#051424"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isLoading ? 'AUTHENTICATING...' : 'SIGN IN WITH GOOGLE'}</span>
          </button>

          {/* Quick Demo Operator Sign-in */}
          <button
            onClick={loginDemoDriver}
            className="w-full h-12 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] font-headline font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <Truck className="w-4 h-4 text-[#ffc174]" />
            <span>CONTINUE AS DEMO DRIVER (CAB #408)</span>
          </button>
        </div>

        {/* Footer Security Note */}
        <div className="pt-2 text-center text-[11px] font-mono text-[#94a3b8] border-t border-[#30363d]">
          FLEET ENCRYPTION: TLS 1.3 · ZERO-TRUST ABAC FIRESTORE RULES
        </div>
      </div>
    </div>
  );
};
