/**
 * Real Two-Way Live Voice Call Engine + Native Android Cellular Bridge (Default: 82199)
 * - ZERO fake speechSynthesis / TTS voices!
 * - Real Two-Way WebRTC Live Audio Call (RTCPeerConnection + getUserMedia):
 *   Caller (Cab Driver) and Callee (Other Person / Emergency Contact on another phone or laptop)
 *   hear each other's real live microphone voice in real time.
 * - Real Native Android Cellular Call (Intent.ACTION_CALL via window.Android.callNow + tel: carrier dialer).
 */

import { espManager } from './espManager';

const STORAGE_KEY = 'drivelock_emergency_phone_number';
export const DEFAULT_EMERGENCY_PHONE_NUMBER = '82199';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

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

export interface PlaceImmediateCallPayload {
  functionCall: {
    name: 'place_immediate_call';
    args: {
      target: string;
    };
  };
  resolvedPhoneNumber?: string;
  contactName?: string | null;
  androidIntentJava?: string;
}

export interface EmergencyCallState {
  status: 'idle' | 'ringing' | 'connected';
  role: 'caller' | 'callee' | 'none';
  phoneNumber: string;
  durationSeconds: number;
  micActive: boolean;
  micMuted: boolean;
  isMuted: boolean;
  speakerphoneOn: boolean;
  micLevel: number; // 0 - 100 local microphone level
  remoteVoiceLevel: number; // 0 - 100 other person's live voice level
  peerConnected: boolean; // true when WebRTC 2-way voice stream with other person is live
  incomingCallAvailable: boolean; // true when another device is ringing this number right now
  incomingCallerInfo: string;
  dispatcherSpeaking: boolean;
  lastTranscript: string;
  dispatchTranscript: string;
  lastFunctionCall?: PlaceImmediateCallPayload | null;
}

type CallStateListener = (state: EmergencyCallState) => void;

class EmergencyCallManager {
  private state: EmergencyCallState = {
    status: 'idle',
    role: 'none',
    phoneNumber: getSavedEmergencyNumber(),
    durationSeconds: 0,
    micActive: false,
    micMuted: false,
    isMuted: false,
    speakerphoneOn: true,
    micLevel: 0,
    remoteVoiceLevel: 0,
    peerConnected: false,
    incomingCallAvailable: false,
    incomingCallerInfo: '',
    dispatcherSpeaking: false,
    lastTranscript: '',
    dispatchTranscript: '',
    lastFunctionCall: null,
  };

  private listeners: Set<CallStateListener> = new Set();
  private audioCtx: AudioContext | null = null;
  private ringTimer: number | null = null;
  private durationInterval: number | null = null;
  private meterInterval: number | null = null;
  private signalPollInterval: number | null = null;
  private incomingWatchInterval: number | null = null;

  private micStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private remoteAnalyser: AnalyserNode | null = null;
  private addedCandidateCount: number = 0;
  private lastContext?: EmergencyCallContext;

  constructor() {
    if (typeof window !== 'undefined') {
      // Background watcher so a 2nd device (phone/laptop) sees incoming calls immediately
      this.incomingWatchInterval = window.setInterval(() => {
        this.checkForIncomingCall();
      }, 1500);
    }
  }

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

  private ensureRemoteAudioElement(): HTMLAudioElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.remoteAudioEl) {
      const el = document.createElement('audio');
      el.autoplay = true;
      (el as any).playsInline = true;
      el.style.display = 'none';
      document.body.appendChild(el);
      this.remoteAudioEl = el;
    }
    return this.remoteAudioEl;
  }

  /**
   * Executes direct Android APK Intent.ACTION_CALL bridge if running inside the Capacitor Android app.
   */
  public triggerNativeAndroidBridgeIfAvailable(
    targetNumber?: string,
    fnPayload?: PlaceImmediateCallPayload
  ): boolean {
    const cleanNum = (targetNumber || this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER).replace(
      /[^0-9+*#]/g,
      ''
    );

    if (typeof window === 'undefined') return false;

    const payload: PlaceImmediateCallPayload = fnPayload || {
      functionCall: {
        name: 'place_immediate_call',
        args: {
          target: cleanNum,
        },
      },
      resolvedPhoneNumber: cleanNum,
      androidIntentJava: `startActivity(new Intent(Intent.ACTION_CALL, Uri.parse("tel:${cleanNum}")));`,
    };

    try {
      const win = window as any;
      if (win.Android && typeof win.Android.placeImmediateCall === 'function') {
        win.Android.placeImmediateCall(JSON.stringify(payload));
        return true;
      }
      if (win.Android && typeof win.Android.callNow === 'function') {
        win.Android.callNow(cleanNum);
        return true;
      }
      if (win.Android && typeof win.Android.callPhone === 'function') {
        win.Android.callPhone(cleanNum);
        return true;
      }
    } catch (e) {}

    return false;
  }

  /**
   * Dials the real cellular phone carrier (SIM call) on mobile devices or Android APK.
   */
  public dialCellularSimCall(targetNumber?: string) {
    const cleanNum = (targetNumber || this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER).replace(
      /[^0-9+*#]/g,
      ''
    );
    if (this.triggerNativeAndroidBridgeIfAvailable(cleanNum)) {
      return;
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const a = document.createElement('a');
      a.href = `tel:${cleanNum}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  public async executeVoiceCommandCall(
    utterance: string,
    context?: EmergencyCallContext
  ): Promise<PlaceImmediateCallPayload> {
    const defaultNum = this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;
    try {
      const res = await fetch('/api/voice-call-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: utterance,
          defaultEmergencyNumber: defaultNum,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PlaceImmediateCallPayload = await res.json();
      const targetNum = data.resolvedPhoneNumber || data.functionCall?.args?.target || defaultNum;
      this.state.lastFunctionCall = data;
      await this.startInstantCall(targetNum, context, data);
      return data;
    } catch (e) {
      const match = utterance.match(/[+0-9][0-9\-\s().+*#]{1,20}/);
      const extracted = match ? match[0].replace(/[^0-9+*#]/g, '') : defaultNum;
      const fallbackPayload: PlaceImmediateCallPayload = {
        functionCall: {
          name: 'place_immediate_call',
          args: {
            target: extracted,
          },
        },
        resolvedPhoneNumber: extracted,
        androidIntentJava: `startActivity(new Intent(Intent.ACTION_CALL, Uri.parse("tel:${extracted}")));`,
      };
      this.state.lastFunctionCall = fallbackPayload;
      await this.startInstantCall(extracted, context, fallbackPayload);
      return fallbackPayload;
    }
  }

  /**
   * Starts a REAL Two-Way Live WebRTC Voice Call (Driver -> Other Person) + triggers Android/GSM call.
   * NO fake TTS voice is ever played.
   */
  public async startInstantCall(
    phoneNumber?: string,
    context?: EmergencyCallContext,
    explicitPayload?: PlaceImmediateCallPayload
  ) {
    const activeNum =
      (phoneNumber || this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER)
        .replace(/[^0-9+*#]/g, '')
        .trim() || DEFAULT_EMERGENCY_PHONE_NUMBER;

    this.lastContext = context;

    const fnPayload: PlaceImmediateCallPayload = explicitPayload || {
      functionCall: {
        name: 'place_immediate_call',
        args: {
          target: activeNum,
        },
      },
      resolvedPhoneNumber: activeNum,
      androidIntentJava: `startActivity(new Intent(Intent.ACTION_CALL, Uri.parse("tel:${activeNum}")));`,
    };
    this.state.lastFunctionCall = fnPayload;

    // 1. Notify ESP32/SIM800L GSM hardware over Serial/BLE if connected
    try {
      espManager.sendCommand(`CALL:${activeNum}`);
    } catch (e) {}

    // 2. If running inside native Android APK, place real cellular call via Intent.ACTION_CALL
    this.triggerNativeAndroidBridgeIfAvailable(activeNum, fnPayload);

    // If already calling or connected as caller, keep current session alive
    if (this.state.status === 'ringing' || this.state.status === 'connected') {
      return;
    }

    this.cleanupSession(false);

    const unit = context?.unitNumber || 'AUTO-101';
    const lat = context?.latitude ? context.latitude.toFixed(4) : '37.7749';
    const lon = context?.longitude ? context.longitude.toFixed(4) : '-122.4194';

    this.state = {
      ...this.state,
      status: 'ringing',
      role: 'caller',
      phoneNumber: activeNum,
      durationSeconds: 0,
      micActive: false,
      micMuted: false,
      isMuted: false,
      speakerphoneOn: true,
      micLevel: 0,
      remoteVoiceLevel: 0,
      peerConnected: false,
      incomingCallAvailable: false,
      dispatcherSpeaking: false,
      dispatchTranscript: `Ringing ${activeNum}... Open this app on another phone/laptop and tap "ANSWER LIVE CALL (${activeNum})" to talk two-way with real voice, or tap "DIAL SIM CELLULAR CALL" for carrier phone call.`,
      lastTranscript: `RINGING ${activeNum} (Unit ${unit} @ GPS ${lat}, ${lon})`,
      lastFunctionCall: fnPayload,
    };
    this.emit();

    // Start realistic phone ringback tone while waiting for the other person to pick up
    this.startRingbackTone();

    try {
      // 3. Open real microphone stream
      const stream = await this.openLocalMicrophone();

      // 4. Create WebRTC PeerConnection as Caller
      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.peerConnection = pc;
      this.addedCandidateCount = 0;

      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } else {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }

      pc.ontrack = (event) => {
        const [remoteMediaStream] = event.streams;
        if (remoteMediaStream) {
          this.attachRemoteAudioStream(remoteMediaStream);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch('/api/webrtc/candidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: activeNum,
              role: 'caller',
              candidate: event.candidate.toJSON(),
            }),
          }).catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          this.onPeerVoiceConnected();
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          this.state.dispatchTranscript = `Other person on ${activeNum} disconnected.`;
          this.emit();
        }
      };

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);

      await fetch('/api/webrtc/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: activeNum,
          offer: pc.localDescription,
          callerContext: {
            unitNumber: unit,
            latitude: lat,
            longitude: lon,
            reason: context?.reason || 'CRASH',
          },
        }),
      });

      // Poll signaling server for the other person's Answer & ICE candidates
      this.signalPollInterval = window.setInterval(async () => {
        if (!this.peerConnection || this.state.role !== 'caller') return;
        try {
          const res = await fetch(`/api/webrtc/room/${encodeURIComponent(activeNum)}`);
          if (!res.ok) return;
          const room = await res.json();
          if (room.status === 'idle') {
            // Remote party hung up
            this.endCall(false);
            return;
          }

          if (room.answer && !this.peerConnection.currentRemoteDescription) {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(room.answer));
            this.onPeerVoiceConnected();
          }

          if (
            this.peerConnection.currentRemoteDescription &&
            Array.isArray(room.calleeCandidates)
          ) {
            while (this.addedCandidateCount < room.calleeCandidates.length) {
              const cand = room.calleeCandidates[this.addedCandidateCount];
              this.addedCandidateCount++;
              try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {}
            }
          }
        } catch (e) {}
      }, 800);
    } catch (err) {
      this.state.dispatchTranscript = `Calling ${activeNum}... Allow microphone access for two-way WebRTC voice or tap "DIAL SIM CELLULAR CALL".`;
      this.emit();
    }
  }

  /**
   * Answers an incoming WebRTC Voice Call as the Other Person (Emergency Contact / Dispatcher).
   * Connects both microphones & speakers so both people hear each other live!
   */
  public async answerIncomingCall(targetRoomNumber?: string) {
    const activeNum =
      (targetRoomNumber || this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER)
        .replace(/[^0-9+*#]/g, '')
        .trim() || DEFAULT_EMERGENCY_PHONE_NUMBER;

    this.cleanupSession(false);

    try {
      const res = await fetch(`/api/webrtc/room/${encodeURIComponent(activeNum)}`);
      if (!res.ok) return;
      const room = await res.json();
      if (!room || !room.offer) {
        this.state.incomingCallAvailable = false;
        this.emit();
        return;
      }

      const stream = await this.openLocalMicrophone();
      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.peerConnection = pc;
      this.addedCandidateCount = 0;

      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } else {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }

      pc.ontrack = (event) => {
        const [remoteMediaStream] = event.streams;
        if (remoteMediaStream) {
          this.attachRemoteAudioStream(remoteMediaStream);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch('/api/webrtc/candidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: activeNum,
              role: 'callee',
              candidate: event.candidate.toJSON(),
            }),
          }).catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          this.onPeerVoiceConnected();
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(room.offer));

      if (Array.isArray(room.callerCandidates)) {
        for (const cand of room.callerCandidates) {
          this.addedCandidateCount++;
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {}
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch('/api/webrtc/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: activeNum,
          answer: pc.localDescription,
        }),
      });

      this.state.role = 'callee';
      this.state.incomingCallAvailable = false;
      this.onPeerVoiceConnected();

      // Poll for any new caller ICE candidates or hangup
      this.signalPollInterval = window.setInterval(async () => {
        if (!this.peerConnection || this.state.role !== 'callee') return;
        try {
          const pollRes = await fetch(`/api/webrtc/room/${encodeURIComponent(activeNum)}`);
          if (!pollRes.ok) return;
          const latestRoom = await pollRes.json();
          if (latestRoom.status === 'idle') {
            this.endCall(false);
            return;
          }
          if (Array.isArray(latestRoom.callerCandidates)) {
            while (this.addedCandidateCount < latestRoom.callerCandidates.length) {
              const cand = latestRoom.callerCandidates[this.addedCandidateCount];
              this.addedCandidateCount++;
              try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {}
            }
          }
        } catch (e) {}
      }, 800);
    } catch (err) {
      console.error('Failed to answer WebRTC voice call:', err);
    }
  }

  private async checkForIncomingCall() {
    if (this.state.status !== 'idle') return;
    const activeNum = this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;
    try {
      const res = await fetch(`/api/webrtc/room/${encodeURIComponent(activeNum)}`);
      if (!res.ok) return;
      const room = await res.json();
      const hasRingingOffer = Boolean(room && room.status === 'ringing' && room.offer);
      const callerUnit = room?.callerContext?.unitNumber || 'CAB UNIT';
      const callerGps =
        room?.callerContext?.latitude && room?.callerContext?.longitude
          ? `${room.callerContext.latitude}, ${room.callerContext.longitude}`
          : '';
      const info = hasRingingOffer
        ? `Incoming Emergency Call on ${activeNum} from ${callerUnit}${callerGps ? ` (GPS: ${callerGps})` : ''}`
        : '';

      if (
        hasRingingOffer !== this.state.incomingCallAvailable ||
        info !== this.state.incomingCallerInfo
      ) {
        this.state.incomingCallAvailable = hasRingingOffer;
        this.state.incomingCallerInfo = info;
        this.emit();
      }
    } catch (e) {}
  }

  private onPeerVoiceConnected() {
    if (this.ringTimer) {
      window.clearInterval(this.ringTimer);
      this.ringTimer = null;
    }

    if (this.state.status !== 'connected') {
      this.playPickupClick();
      this.state.status = 'connected';
      this.state.peerConnected = true;
      this.state.durationSeconds = 0;
      this.state.dispatchTranscript =
        'REAL TWO-WAY LIVE VOICE CONNECTED — Speak now! You can hear the other person and they can hear you in real time.';
      this.state.lastTranscript = this.state.dispatchTranscript;

      if (this.durationInterval) window.clearInterval(this.durationInterval);
      this.durationInterval = window.setInterval(() => {
        this.state.durationSeconds += 1;
        this.emit();
      }, 1000);
      this.emit();
    } else if (!this.state.peerConnected) {
      this.state.peerConnected = true;
      this.state.dispatchTranscript =
        'REAL TWO-WAY LIVE VOICE CONNECTED — Speak now! You can hear the other person and they can hear you in real time.';
      this.emit();
    }
  }

  public reannounceDispatch(_context?: EmergencyCallContext) {
    // Instead of fake speechSynthesis, dial cellular SIM call if user taps this button
    this.dialCellularSimCall(this.state.phoneNumber);
  }

  private async openLocalMicrophone(): Promise<MediaStream | null> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
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
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume().catch(() => {});
      }

      const source = this.audioCtx.createMediaStreamSource(stream);
      this.localAnalyser = this.audioCtx.createAnalyser();
      this.localAnalyser.fftSize = 128;
      source.connect(this.localAnalyser);

      this.startAudioLevelMeters();
      return stream;
    } catch (err) {
      this.state.micActive = false;
      this.emit();
      return null;
    }
  }

  private attachRemoteAudioStream(remoteMediaStream: MediaStream) {
    this.remoteStream = remoteMediaStream;
    const audioEl = this.ensureRemoteAudioElement();
    if (audioEl) {
      audioEl.srcObject = remoteMediaStream;
      audioEl.muted = false;
      audioEl.volume = 1.0;
      audioEl.play().catch(() => {});
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      const remoteSource = this.audioCtx.createMediaStreamSource(remoteMediaStream);
      this.remoteAnalyser = this.audioCtx.createAnalyser();
      this.remoteAnalyser.fftSize = 128;
      remoteSource.connect(this.remoteAnalyser);
      this.startAudioLevelMeters();
    } catch (e) {}
  }

  private startAudioLevelMeters() {
    if (this.meterInterval) {
      window.clearInterval(this.meterInterval);
    }

    const localData = new Uint8Array(64);
    const remoteData = new Uint8Array(64);

    this.meterInterval = window.setInterval(() => {
      if (this.localAnalyser && !this.state.micMuted) {
        this.localAnalyser.getByteFrequencyData(localData);
        let sum = 0;
        for (let i = 0; i < localData.length; i++) sum += localData[i];
        const avg = sum / localData.length;
        this.state.micLevel = Math.min(100, Math.round((avg / 120) * 100));
      } else {
        this.state.micLevel = 0;
      }

      if (this.remoteAnalyser) {
        this.remoteAnalyser.getByteFrequencyData(remoteData);
        let rSum = 0;
        for (let i = 0; i < remoteData.length; i++) rSum += remoteData[i];
        const rAvg = rSum / remoteData.length;
        this.state.remoteVoiceLevel = Math.min(100, Math.round((rAvg / 120) * 100));
        this.state.dispatcherSpeaking = this.state.remoteVoiceLevel > 12;
      } else {
        this.state.remoteVoiceLevel = 0;
        this.state.dispatcherSpeaking = false;
      }

      this.emit();
    }, 100);
  }

  private startRingbackTone() {
    if (this.ringTimer) {
      window.clearInterval(this.ringTimer);
    }
    const playBurst = () => {
      if (this.state.status !== 'ringing') return;
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!this.audioCtx || this.audioCtx.state === 'closed') {
          this.audioCtx = new AudioContextClass();
        }
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        const now = this.audioCtx.currentTime;
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.15);
        osc2.stop(now + 1.15);
      } catch (e) {}
    };

    playBurst();
    this.ringTimer = window.setInterval(playBurst, 3000);
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

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.08);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
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

  public endCall(notifyServer: boolean = true) {
    const activeNum = this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;
    if (notifyServer) {
      fetch('/api/webrtc/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: activeNum }),
      }).catch(() => {});
    }
    this.cleanupSession(true);
  }

  private cleanupSession(resetToIdle: boolean) {
    if (this.ringTimer) {
      window.clearInterval(this.ringTimer);
      this.ringTimer = null;
    }
    if (this.durationInterval) {
      window.clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
    if (this.meterInterval) {
      window.clearInterval(this.meterInterval);
      this.meterInterval = null;
    }
    if (this.signalPollInterval) {
      window.clearInterval(this.signalPollInterval);
      this.signalPollInterval = null;
    }
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = null;
    }
    this.localAnalyser = null;
    this.remoteAnalyser = null;

    if (resetToIdle) {
      this.state = {
        status: 'idle',
        role: 'none',
        phoneNumber: EMERGENCY_PHONE_NUMBER,
        durationSeconds: 0,
        micActive: false,
        micMuted: false,
        isMuted: false,
        speakerphoneOn: true,
        micLevel: 0,
        remoteVoiceLevel: 0,
        peerConnected: false,
        incomingCallAvailable: false,
        incomingCallerInfo: '',
        dispatcherSpeaking: false,
        lastTranscript: '',
        dispatchTranscript: '',
      };
      this.emit();
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
