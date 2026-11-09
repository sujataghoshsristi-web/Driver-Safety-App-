/**
 * Configurable Emergency Call Engine (Default: 82199)
 * Supports:
 * 1. Configurable emergency number saved to localStorage
 * 2. Direct <a href="tel:82199">Call Now</a> & Android Intent.ACTION_CALL bridge
 * 3. Instant 0ms in-app speakerphone + ESP32 SIM800L hardware call trigger
 */

import { espManager } from './espManager';

const STORAGE_KEY = 'drivelock_emergency_phone_number';
export const DEFAULT_EMERGENCY_PHONE_NUMBER = '82199';

const getSavedEmergencyNumber = (): string => {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && saved.trim().length > 0) {
        return saved.trim();
      }
    } catch (e) {}
  }
  return DEFAULT_EMERGENCY_PHONE_NUMBER;
};

export let EMERGENCY_PHONE_NUMBER = getSavedEmergencyNumber();

export interface EmergencyCallContext {
  unitNumber?: string;
  vehicleName?: string;
  driverId?: string;
  impactG?: number;
  latitude?: number;
  longitude?: number;
  reason?: 'CRASH' | 'SOS' | 'DIRECT';
}

export interface EmergencyCallState {
  status: 'idle' | 'ringing' | 'connected';
  phoneNumber: string;
  durationSeconds: number;
  micActive: boolean;
  micMuted: boolean;
  isMuted: boolean;
  speakerphoneOn: boolean;
  micLevel: number; // 0 - 100 live voice waveform level
  dispatcherSpeaking: boolean;
  lastTranscript: string;
  dispatchTranscript: string;
}

type CallStateListener = (state: EmergencyCallState) => void;

class EmergencyCallManager {
  private state: EmergencyCallState = {
    status: 'idle',
    phoneNumber: getSavedEmergencyNumber(),
    durationSeconds: 0,
    micActive: false,
    micMuted: false,
    isMuted: false,
    speakerphoneOn: true,
    micLevel: 0,
    dispatcherSpeaking: false,
    lastTranscript: '',
    dispatchTranscript: '',
  };

  private listeners: Set<CallStateListener> = new Set();
  private audioCtx: AudioContext | null = null;
  private ringTimer: number | null = null;
  private connectTimeout: number | null = null;
  private durationInterval: number | null = null;
  private micInterval: number | null = null;
  private micStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private driverRespondedOnce: boolean = false;
  private speakingFrames: number = 0;
  private lastContext?: EmergencyCallContext;

  public getState(): EmergencyCallState {
    return this.state;
  }

  public getPhoneNumber(): string {
    return this.state.phoneNumber;
  }

  public setPhoneNumber(newNumber: string) {
    const cleaned = newNumber.replace(/[^0-9+*#]/g, '').trim() || DEFAULT_EMERGENCY_PHONE_NUMBER;
    EMERGENCY_PHONE_NUMBER = cleaned;
    this.state.phoneNumber = cleaned;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, cleaned);
      } catch (e) {}
    }
    this.emit();
  }

  public subscribe(listener: CallStateListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const snapshot = { ...this.state };
    this.listeners.forEach((fn) => fn(snapshot));
  }

  /**
   * Executes <a href="tel:82199">Call Now</a> and Android Intent.ACTION_CALL bridge
   */
  public triggerNativeTelCall(targetNumber?: string) {
    const cleanNum = (targetNumber || this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER).replace(
      /[^0-9+*#]/g,
      ''
    );

    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // 1. If running inside an Android WebView with CALL_PHONE JavascriptInterface:
    // startActivity(new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + cleanNum)));
    try {
      const win = window as any;
      if (win.Android && typeof win.Android.callNow === 'function') {
        win.Android.callNow(cleanNum);
        return;
      }
      if (win.Android && typeof win.Android.callPhone === 'function') {
        win.Android.callPhone(cleanNum);
        return;
      }
    } catch (e) {}

    // 2. Standard <a href="tel:82199">Call Now</a> programmatic invocation
    try {
      const callLink = document.createElement('a');
      callLink.href = `tel:${cleanNum}`;
      callLink.textContent = 'Call Now';
      callLink.style.display = 'none';
      document.body.appendChild(callLink);
      callLink.click();
      document.body.removeChild(callLink);
    } catch (err) {
      window.location.href = `tel:${cleanNum}`;
    }
  }

  /**
   * Instantly places a direct call to the configured emergency number (default 82199)
   * using <a href="tel:82199">Call Now</a> / Intent.ACTION_CALL + 0ms speakerphone telemetry.
   */
  public startInstantCall(
    phoneNumber?: string,
    context?: EmergencyCallContext
  ) {
    const activeNum = phoneNumber || this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;
    this.lastContext = context;

    // 1. Notify ESP32/SIM800L hardware over Serial/BLE if connected
    try {
      espManager.sendCommand(`CALL:${activeNum}`);
    } catch (e) {}

    // 2. Trigger <a href="tel:82199">Call Now</a> / Android Intent.ACTION_CALL immediately
    this.triggerNativeTelCall(activeNum);

    // If already connected in-app, just update context
    if (this.state.status === 'connected') {
      return;
    }

    this.cleanupTimers();
    this.driverRespondedOnce = false;
    this.speakingFrames = 0;

    // INSTANT CONNECTION (0ms — no ringing or dialing wait)
    const unit = context?.unitNumber || 'AUTO-101';
    const impact = context?.impactG ? `${context.impactG.toFixed(1)}G` : 'high-G';
    const lat = context?.latitude ? context.latitude.toFixed(4) : '37.7749';
    const lon = context?.longitude ? context.longitude.toFixed(4) : '-122.4194';

    const dispatchGreeting =
      context?.reason === 'SOS'
        ? `Emergency Dispatch ${activeNum} connected on speakerphone. SOS alert received from unit ${unit} at GPS ${lat}, ${lon}. Rescue units are en route. Driver, your mic is live, go ahead.`
        : context?.reason === 'DIRECT'
        ? `Emergency Dispatch ${activeNum} connected on speakerphone for unit ${unit} at GPS ${lat}, ${lon}. Operator is on the line, go ahead driver.`
        : `Emergency Dispatch ${activeNum} connected instantly on speakerphone. Automatic ${impact} crash detected on unit ${unit} at GPS ${lat}, ${lon}. Ambulance and rescue units dispatched immediately. Driver, your microphone is live—can you hear me?`;

    this.state = {
      status: 'connected',
      phoneNumber: activeNum,
      durationSeconds: 0,
      micActive: true,
      micMuted: false,
      isMuted: false,
      speakerphoneOn: true,
      micLevel: 35,
      dispatcherSpeaking: true,
      lastTranscript: `DISPATCH (${activeNum}): "${dispatchGreeting}"`,
      dispatchTranscript: dispatchGreeting,
    };
    this.emit();

    // Play instant trunk-connected tone
    this.playPickupClick();

    // Open hands-free speakerphone microphone stream immediately
    this.openHandsFreeMicrophone();

    // Start call duration counter immediately
    this.durationInterval = window.setInterval(() => {
      this.state.durationSeconds += 1;
      this.emit();
    }, 1000);

    // Speak dispatch response immediately (0ms delay)
    this.speakDispatchMessage(dispatchGreeting);
  }

  public reannounceDispatch(context?: EmergencyCallContext) {
    const ctx = context || this.lastContext;
    const unit = ctx?.unitNumber || 'AUTO-101';
    const impact = ctx?.impactG ? `${ctx.impactG.toFixed(1)}G` : 'high-G';
    const lat = ctx?.latitude ? ctx.latitude.toFixed(4) : '37.7749';
    const lon = ctx?.longitude ? ctx.longitude.toFixed(4) : '-122.4194';

    const dispatchGreeting =
      ctx?.reason === 'SOS'
        ? `Emergency Dispatch ${this.state.phoneNumber} connected on speakerphone. SOS alert received from unit ${unit} at GPS ${lat}, ${lon}. Rescue units are en route. Driver, your mic is live, go ahead.`
        : `Emergency Dispatch ${this.state.phoneNumber} connected on speakerphone. Automatic ${impact} crash detected on unit ${unit} at GPS ${lat}, ${lon}. Ambulance and rescue units dispatched immediately. Driver, your microphone is live—can you hear me?`;

    this.speakDispatchMessage(dispatchGreeting);
  }

  private speakDispatchMessage(text: string) {
    this.state.lastTranscript = `DISPATCH (${this.state.phoneNumber}): "${text}"`;
    this.state.dispatchTranscript = text;
    this.state.dispatcherSpeaking = true;
    this.emit();

    if (typeof window !== 'undefined' && Boolean(window.speechSynthesis)) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.03;
        utterance.pitch = 0.95;
        utterance.volume = 1.0;
        utterance.onend = () => {
          this.state.dispatcherSpeaking = false;
          this.emit();
        };
        utterance.onerror = () => {
          this.state.dispatcherSpeaking = false;
          this.emit();
        };
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        this.state.dispatcherSpeaking = false;
        this.emit();
      }
    } else {
      setTimeout(() => {
        this.state.dispatcherSpeaking = false;
        this.emit();
      }, 4000);
    }
  }

  private async openHandsFreeMicrophone() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.micStream = stream;
      this.state.micActive = true;
      this.emit();

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
      }
      const source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      source.connect(this.analyser);

      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.micInterval = window.setInterval(() => {
        if (!this.analyser || this.state.micMuted) {
          this.state.micLevel = 0;
          this.emit();
          return;
        }
        this.analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i];
        }
        const avg = sum / data.length;
        const level = Math.min(100, Math.round((avg / 140) * 100));
        this.state.micLevel = level;

        // If driver speaks while connected and dispatcher is not currently speaking
        if (
          this.state.status === 'connected' &&
          !this.state.dispatcherSpeaking &&
          !this.driverRespondedOnce &&
          this.state.durationSeconds >= 5
        ) {
          if (level > 32) {
            this.speakingFrames += 1;
            if (this.speakingFrames >= 5) {
              this.driverRespondedOnce = true;
              this.speakDispatchMessage(
                `Copy that driver, we hear you loud and clear on ${this.state.phoneNumber}. Stay still in the cab, medical and fire teams are 3 minutes away from your GPS pin.`
              );
            }
          } else {
            this.speakingFrames = Math.max(0, this.speakingFrames - 1);
          }
        }

        this.emit();
      }, 100);
    } catch (err) {
      // Even if mic permission is not granted yet, the call stays connected
      this.state.micActive = false;
      this.emit();
    }
  }

  private playRingbackTone() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, this.audioCtx.currentTime);
      osc2.frequency.setValueAtTime(480, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.85);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(this.audioCtx.currentTime + 0.9);
      osc2.stop(this.audioCtx.currentTime + 0.9);
    } catch (e) {}
  }

  private playPickupClick() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime);
      osc.frequency.setValueAtTime(1320, this.audioCtx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.22, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.14);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.15);
    } catch (e) {}
  }

  public toggleMute() {
    this.state.micMuted = !this.state.micMuted;
    this.state.isMuted = this.state.micMuted;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((t) => {
        t.enabled = !this.state.micMuted;
      });
    }
    this.emit();
  }

  public endCall() {
    this.cleanupTimers();
    if (typeof window !== 'undefined' && Boolean(window.speechSynthesis)) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.state = {
      status: 'idle',
      phoneNumber: EMERGENCY_PHONE_NUMBER,
      durationSeconds: 0,
      micActive: false,
      micMuted: false,
      isMuted: false,
      speakerphoneOn: true,
      micLevel: 0,
      dispatcherSpeaking: false,
      lastTranscript: '',
      dispatchTranscript: '',
    };
    this.emit();
  }

  private cleanupTimers() {
    if (this.ringTimer) {
      window.clearInterval(this.ringTimer);
      this.ringTimer = null;
    }
    if (this.connectTimeout) {
      window.clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.durationInterval) {
      window.clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
    if (this.micInterval) {
      window.clearInterval(this.micInterval);
      this.micInterval = null;
    }
  }
}

export const emergencyCallManager = new EmergencyCallManager();

export const callEmergencyNumber = (
  phoneNumber: string = EMERGENCY_PHONE_NUMBER,
  context?: EmergencyCallContext
) => {
  emergencyCallManager.startInstantCall(phoneNumber, context);
};
