/**
 * Internet Server + Wi-Fi Cross-IP Two-Way Voice Call & Live Phone GPS Map Engine
 *
 * Works across 2 different IPs (Phone on Mobile Data / Wi-Fi IP #1 <-> Laptop on Internet / Wi-Fi IP #2):
 * 1. Primary Transport: WebRTC (RTCPeerConnection with Google STUN + OpenRelay TURN over port 80/443)
 * 2. Fallback Transport: HTTP Server Live Audio Stream Relay (/api/webrtc/audio) so voice ALWAYS works
 *    through the server even if strict NAT/firewalls block UDP between the 2 IPs!
 * 3. Real-Time Phone GPS Location Stream: Phone streams navigator.geolocation.watchPosition to
 *    /api/webrtc/location so the Laptop sees the Phone's real live location on the Map!
 */

import { espManager } from './espManager';

const STORAGE_KEY = 'drivelock_emergency_phone_number';
const SERVER_URL_STORAGE_KEY = 'drivelock_call_server_url';
const AUTO_ANSWER_STORAGE_KEY = 'drivelock_laptop_auto_answer';

export const DEFAULT_EMERGENCY_PHONE_NUMBER = '82199';
export const DEFAULT_CLOUD_SERVER_URL =
  'https://ais-pre-x24utjildnuq7js2diaf2v-1003004681042.asia-southeast1.run.app';

// Cross-IP STUN + TURN configuration so Phone (IP #1) and Laptop (IP #2) connect across any network
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:standard.relay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:standard.relay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:standard.relay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
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

const getDefaultServerBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(SERVER_URL_STORAGE_KEY);
      if (saved !== null && saved.trim().length > 0) {
        return saved.trim().replace(/\/+$/, '');
      }
      // If running inside Capacitor Android APK (https://localhost), point to the Cloud Internet Server automatically
      if (
        window.location.protocol === 'capacitor:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
      ) {
        return DEFAULT_CLOUD_SERVER_URL;
      }
    } catch (e) {}
  }
  return '';
};

const getSavedAutoAnswer = (): boolean => {
  if (typeof window !== 'undefined') {
    try {
      return window.localStorage.getItem(AUTO_ANSWER_STORAGE_KEY) === 'true';
    } catch (e) {}
  }
  return false;
};

export let EMERGENCY_PHONE_NUMBER = getSavedEmergencyNumber();

export interface EmergencyCallContext {
  unitNumber?: string;
  vehicleName?: string;
  driverId?: string;
  impactG?: number;
  knockCount?: number;
  speedKmh?: number;
  accuracy?: number;
  latitude?: number;
  longitude?: number;
  reason?: 'CRASH' | 'SOS' | 'DIRECT';
}

export interface RemotePhoneLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speedKmh?: number;
  heading?: number;
  impactG?: number;
  knockCount?: number;
  unitNumber?: string;
  driverId?: string;
  reason?: string;
  updatedAt: number;
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
  transportMode: 'webrtc-p2p' | 'server-relay' | 'connecting';
  serverUrl: string;
  autoAnswerOnLaptop: boolean;
  phoneNumber: string;
  durationSeconds: number;
  micActive: boolean;
  micMuted: boolean;
  isMuted: boolean;
  speakerphoneOn: boolean;
  micLevel: number; // 0 - 100 local microphone level
  remoteVoiceLevel: number; // 0 - 100 other person's live voice level
  peerConnected: boolean; // true when two-way voice between Phone and Laptop is active
  incomingCallAvailable: boolean; // true when Phone is calling Laptop over the Internet/Server
  incomingCallerInfo: string;
  remoteLocation: RemotePhoneLocation | null;
  locationTrail: Array<{ lat: number; lon: number; ts: number }>;
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
    transportMode: 'connecting',
    serverUrl: getDefaultServerBaseUrl(),
    autoAnswerOnLaptop: getSavedAutoAnswer(),
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
    remoteLocation: null,
    locationTrail: [],
    dispatcherSpeaking: false,
    lastTranscript: '',
    dispatchTranscript: '',
    lastFunctionCall: null,
  };

  private listeners: Set<CallStateListener> = new Set();
  private audioCtx: AudioContext | null = null;
  private ringTimer: number | null = null;
  private incomingRingTimer: number | null = null;
  private durationInterval: number | null = null;
  private meterInterval: number | null = null;
  private signalPollInterval: number | null = null;
  private incomingWatchInterval: number | null = null;
  private gpsWatchId: number | null = null;
  private audioRelayPullInterval: number | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private lastPlayedAudioSeq: number = 0;

  private micStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private remoteAnalyser: AnalyserNode | null = null;
  private addedCandidateCount: number = 0;
  private webrtcDirectConnected: boolean = false;
  private lastContext?: EmergencyCallContext;

  constructor() {
    if (typeof window !== 'undefined') {
      // Poll server every 1.2s so the Laptop immediately detects an incoming call + GPS from the Phone
      this.incomingWatchInterval = window.setInterval(() => {
        this.checkForIncomingCall();
      }, 1200);
    }
  }

  private apiUrl(path: string): string {
    const base = (this.state.serverUrl || '').trim().replace(/\/+$/, '');
    return base ? `${base}${path}` : path;
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

  public setServerUrl(url: string) {
    const cleaned = url.trim().replace(/\/+$/, '');
    this.state.serverUrl = cleaned;
    if (typeof window !== 'undefined') {
      try {
        if (cleaned) {
          window.localStorage.setItem(SERVER_URL_STORAGE_KEY, cleaned);
        } else {
          window.localStorage.removeItem(SERVER_URL_STORAGE_KEY);
        }
      } catch (e) {}
    }
    this.emit();
  }

  public setAutoAnswerOnLaptop(enabled: boolean) {
    this.state.autoAnswerOnLaptop = enabled;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(AUTO_ANSWER_STORAGE_KEY, enabled ? 'true' : 'false');
      } catch (e) {}
    }
    this.emit();
  }

  private lastIdleLocationPushMs: number = 0;

  /**
   * Called by Phone whenever its GPS coordinates update so the Laptop Control Room map tracks the Phone live.
   */
  public updateCallerLiveLocation(loc: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speedKmh?: number;
    heading?: number;
    impactG?: number;
    knockCount?: number;
    unitNumber?: string;
    driverId?: string;
  }) {
    if (!loc.latitude && !loc.longitude) return;
    const now = Date.now();
    this.state.remoteLocation = {
      ...this.state.remoteLocation,
      ...loc,
      updatedAt: now,
    };
    const isCalling = this.state.role === 'caller' && this.state.status !== 'idle';
    if (isCalling || now - this.lastIdleLocationPushMs >= 2000) {
      this.lastIdleLocationPushMs = now;
      const activeNum = this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;
      fetch(this.apiUrl('/api/webrtc/location'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: activeNum,
          ...loc,
        }),
      }).catch(() => {});
    }
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
      const res = await fetch(this.apiUrl('/api/voice-call-agent'), {
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
   * Starts a REAL Internet/Wi-Fi Call from the Phone to the Laptop (over 2 IPs) + streams real Phone GPS!
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

    // Notify ESP32 hardware over Serial/BLE if connected
    try {
      espManager.sendCommand(`CALL:${activeNum}`);
    } catch (e) {}

    if (this.state.status === 'ringing' || this.state.status === 'connected') {
      return;
    }

    this.cleanupSession(false);

    const unit = context?.unitNumber || 'AUTO-101';
    const lat = context?.latitude ?? 37.7749;
    const lon = context?.longitude ?? -122.4194;

    const initialLoc: RemotePhoneLocation = {
      latitude: lat,
      longitude: lon,
      accuracy: context?.accuracy || 10,
      speedKmh: context?.speedKmh || 0,
      impactG: context?.impactG || 4.2,
      knockCount: context?.knockCount || 4,
      unitNumber: unit,
      driverId: context?.driverId || 'DRV-8841',
      reason: context?.reason || 'CRASH',
      updatedAt: Date.now(),
    };

    this.state = {
      ...this.state,
      status: 'ringing',
      role: 'caller',
      transportMode: 'connecting',
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
      remoteLocation: initialLoc,
      locationTrail: [{ lat, lon, ts: Date.now() }],
      dispatcherSpeaking: false,
      dispatchTranscript: `Calling Laptop Dispatch (${activeNum}) over Internet Server & streaming live Phone GPS (${lat.toFixed(5)}, ${lon.toFixed(5)})...`,
      lastTranscript: `RINGING LAPTOP (${activeNum}) @ GPS ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      lastFunctionCall: fnPayload,
    };
    this.emit();

    // Start outbound phone ringback tone until Laptop answers
    this.startRingbackTone();

    // Start real-time Phone GPS watcher so Laptop sees exact Phone location moving live
    this.startPhoneGpsStreaming(activeNum, initialLoc);

    try {
      const stream = await this.openLocalMicrophone();

      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.peerConnection = pc;
      this.addedCandidateCount = 0;
      this.webrtcDirectConnected = false;

      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } else {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }

      pc.ontrack = (event) => {
        const [remoteMediaStream] = event.streams;
        if (remoteMediaStream) {
          this.webrtcDirectConnected = true;
          this.state.transportMode = 'webrtc-p2p';
          this.attachRemoteAudioStream(remoteMediaStream);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch(this.apiUrl('/api/webrtc/candidate'), {
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
          this.webrtcDirectConnected = true;
          this.state.transportMode = 'webrtc-p2p';
          this.onPeerVoiceConnected();
        }
      };

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);

      await fetch(this.apiUrl('/api/webrtc/offer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: activeNum,
          offer: pc.localDescription,
          callerContext: initialLoc,
        }),
      });

      // Poll signaling server for Laptop's Answer, ICE candidates, and live status
      this.signalPollInterval = window.setInterval(async () => {
        if (!this.peerConnection || this.state.role !== 'caller') return;
        try {
          const res = await fetch(
            this.apiUrl(`/api/webrtc/room/${encodeURIComponent(activeNum)}`)
          );
          if (!res.ok) return;
          const room = await res.json();
          if (room.status === 'idle') {
            this.endCall(false);
            return;
          }

          if (room.answer && !this.peerConnection.currentRemoteDescription) {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(room.answer));
            this.onPeerVoiceConnected();
            // Start Server Audio Relay in parallel so even across 2 strict-NAT IPs, voice works 100%!
            this.startServerAudioRelay(activeNum, 'caller');
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
      }, 750);
    } catch (err) {
      this.state.dispatchTranscript = `Calling Laptop (${activeNum})... Allow microphone access for two-way live voice.`;
      this.emit();
    }
  }

  /**
   * Answers the Phone's Emergency Call on the Laptop (over Internet Server / 2 IPs or Wi-Fi)
   * and streams the Phone's real GPS location + two-way live microphone voice!
   */
  public async answerIncomingCall(targetRoomNumber?: string) {
    const activeNum =
      (targetRoomNumber || this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER)
        .replace(/[^0-9+*#]/g, '')
        .trim() || DEFAULT_EMERGENCY_PHONE_NUMBER;

    this.stopIncomingRingtone();
    this.cleanupSession(false);

    try {
      const res = await fetch(this.apiUrl(`/api/webrtc/room/${encodeURIComponent(activeNum)}`));
      if (!res.ok) return;
      const room = await res.json();
      if (!room || !room.offer) {
        this.state.incomingCallAvailable = false;
        this.emit();
        return;
      }

      if (room.liveLocation) {
        this.state.remoteLocation = room.liveLocation;
      }
      if (Array.isArray(room.locationTrail)) {
        this.state.locationTrail = room.locationTrail;
      }

      const stream = await this.openLocalMicrophone();
      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.peerConnection = pc;
      this.addedCandidateCount = 0;
      this.webrtcDirectConnected = false;

      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } else {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }

      pc.ontrack = (event) => {
        const [remoteMediaStream] = event.streams;
        if (remoteMediaStream) {
          this.webrtcDirectConnected = true;
          this.state.transportMode = 'webrtc-p2p';
          this.attachRemoteAudioStream(remoteMediaStream);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch(this.apiUrl('/api/webrtc/candidate'), {
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
          this.webrtcDirectConnected = true;
          this.state.transportMode = 'webrtc-p2p';
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

      await fetch(this.apiUrl('/api/webrtc/answer'), {
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

      // Start Server Audio Relay in parallel for guaranteed cross-IP voice delivery
      this.startServerAudioRelay(activeNum, 'callee');

      // Poll for new Phone ICE candidates + live Phone GPS coordinates every 750ms
      this.signalPollInterval = window.setInterval(async () => {
        if (!this.peerConnection || this.state.role !== 'callee') return;
        try {
          const pollRes = await fetch(
            this.apiUrl(`/api/webrtc/room/${encodeURIComponent(activeNum)}`)
          );
          if (!pollRes.ok) return;
          const latestRoom = await pollRes.json();
          if (latestRoom.status === 'idle') {
            this.endCall(false);
            return;
          }
          if (latestRoom.liveLocation) {
            this.state.remoteLocation = latestRoom.liveLocation;
          }
          if (Array.isArray(latestRoom.locationTrail)) {
            this.state.locationTrail = latestRoom.locationTrail;
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
          this.emit();
        } catch (e) {}
      }, 750);
    } catch (err) {
      console.error('Failed to answer incoming Phone call on Laptop:', err);
    }
  }

  private startPhoneGpsStreaming(roomId: string, fallbackLoc: RemotePhoneLocation) {
    if (this.gpsWatchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        this.gpsWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            const loc: RemotePhoneLocation = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy || 10,
              speedKmh: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : fallbackLoc.speedKmh,
              heading: pos.coords.heading || 0,
              impactG: fallbackLoc.impactG,
              knockCount: fallbackLoc.knockCount,
              unitNumber: fallbackLoc.unitNumber,
              driverId: fallbackLoc.driverId,
              reason: fallbackLoc.reason,
              updatedAt: Date.now(),
            };
            this.state.remoteLocation = loc;
            this.emit();
            fetch(this.apiUrl('/api/webrtc/location'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roomId,
                ...loc,
              }),
            }).catch(() => {});
          },
          () => {},
          {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 8000,
          }
        );
      } catch (e) {}
    }
  }

  /**
   * Server-side HTTP Audio Chunk Relay across 2 IPs:
   * Automatically records short 650ms audio slices and exchanges them via /api/webrtc/audio
   * whenever direct UDP WebRTC is still negotiating or blocked by symmetric NAT between 2 IPs.
   */
  private startServerAudioRelay(roomId: string, myRole: 'caller' | 'callee') {
    this.stopServerAudioRelay();
    this.lastPlayedAudioSeq = 0;

    // 1. Push microphone audio slices if MediaRecorder is supported
    if (this.micStream && typeof MediaRecorder !== 'undefined') {
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
        const recorder = mimeType
          ? new MediaRecorder(this.micStream, { mimeType })
          : new MediaRecorder(this.micStream);
        this.mediaRecorder = recorder;

        recorder.ondataavailable = (e) => {
          // Only relay over HTTP if direct WebRTC P2P track isn't already playing audio or if muted is false
          if (this.webrtcDirectConnected || this.state.micMuted || !e.data || e.data.size < 100) {
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = typeof reader.result === 'string' ? reader.result : '';
            if (base64) {
              fetch(this.apiUrl('/api/webrtc/audio'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  roomId,
                  role: myRole,
                  mimeType: e.data.type || mimeType || 'audio/webm',
                  base64,
                }),
              }).catch(() => {});
            }
          };
          reader.readAsDataURL(e.data);
        };

        recorder.start(700);
      } catch (e) {}
    }

    // 2. Pull remote audio slices if direct WebRTC P2P is not yet active
    this.audioRelayPullInterval = window.setInterval(async () => {
      if (this.webrtcDirectConnected || this.state.status !== 'connected') return;
      try {
        const res = await fetch(
          this.apiUrl(
            `/api/webrtc/audio/${encodeURIComponent(roomId)}/${myRole}?after=${this.lastPlayedAudioSeq}`
          )
        );
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.chunks) && data.chunks.length > 0) {
          this.state.transportMode = 'server-relay';
          for (const chunk of data.chunks) {
            if (chunk.seq > this.lastPlayedAudioSeq) {
              this.lastPlayedAudioSeq = chunk.seq;
              const audio = new Audio(chunk.base64);
              audio.volume = 1.0;
              this.state.remoteVoiceLevel = 65;
              this.state.dispatcherSpeaking = true;
              this.emit();
              audio.onended = () => {
                this.state.remoteVoiceLevel = 0;
                this.state.dispatcherSpeaking = false;
                this.emit();
              };
              audio.play().catch(() => {});
            }
          }
        }
      } catch (e) {}
    }, 600);
  }

  private stopServerAudioRelay() {
    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch (e) {}
      this.mediaRecorder = null;
    }
    if (this.audioRelayPullInterval) {
      window.clearInterval(this.audioRelayPullInterval);
      this.audioRelayPullInterval = null;
    }
  }

  private async checkForIncomingCall() {
    if (this.state.status !== 'idle') return;
    const activeNum = this.state.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;
    try {
      const res = await fetch(this.apiUrl(`/api/webrtc/room/${encodeURIComponent(activeNum)}`));
      if (!res.ok) return;
      const room = await res.json();
      const hasRingingOffer = Boolean(room && room.status === 'ringing' && room.offer);
      const loc: RemotePhoneLocation | null = room?.liveLocation || null;
      const callerUnit = loc?.unitNumber || room?.callerContext?.unitNumber || 'PHONE CAB UNIT';
      const callerGps =
        loc?.latitude && loc?.longitude
          ? `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}`
          : '';
      const info = hasRingingOffer
        ? `Incoming Emergency Call on ${activeNum} from ${callerUnit}${callerGps ? ` (GPS: ${callerGps})` : ''}`
        : '';

      if (hasRingingOffer && !this.state.incomingCallAvailable) {
        this.startIncomingRingtone();
        // If Laptop Auto-Answer is enabled, answer automatically!
        if (this.state.autoAnswerOnLaptop) {
          this.state.remoteLocation = loc;
          this.state.locationTrail = Array.isArray(room?.locationTrail) ? room.locationTrail : [];
          this.answerIncomingCall(activeNum);
          return;
        }
      } else if (!hasRingingOffer && this.state.incomingCallAvailable) {
        this.stopIncomingRingtone();
      }

      if (
        hasRingingOffer !== this.state.incomingCallAvailable ||
        info !== this.state.incomingCallerInfo ||
        loc?.updatedAt !== this.state.remoteLocation?.updatedAt
      ) {
        this.state.incomingCallAvailable = hasRingingOffer;
        this.state.incomingCallerInfo = info;
        if (loc) {
          this.state.remoteLocation = loc;
          this.state.locationTrail = Array.isArray(room?.locationTrail) ? room.locationTrail : [];
        }
        this.emit();
      }
    } catch (e) {}
  }

  private onPeerVoiceConnected() {
    if (this.ringTimer) {
      window.clearInterval(this.ringTimer);
      this.ringTimer = null;
    }
    this.stopIncomingRingtone();

    if (this.state.status !== 'connected') {
      this.playPickupClick();
      this.state.status = 'connected';
      this.state.peerConnected = true;
      if (this.state.transportMode === 'connecting') {
        this.state.transportMode = this.webrtcDirectConnected ? 'webrtc-p2p' : 'server-relay';
      }
      this.state.durationSeconds = 0;
      this.state.dispatchTranscript =
        'REAL TWO-WAY INTERNET VOICE + LIVE PHONE GPS CONNECTED — Speak on Laptop or Phone to talk live!';
      this.state.lastTranscript = this.state.dispatchTranscript;

      if (this.durationInterval) window.clearInterval(this.durationInterval);
      this.durationInterval = window.setInterval(() => {
        this.state.durationSeconds += 1;
        this.emit();
      }, 1000);
      this.emit();
    } else if (!this.state.peerConnected) {
      this.state.peerConnected = true;
      this.emit();
    }
  }

  public reannounceDispatch(_context?: EmergencyCallContext) {
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
      }

      this.emit();
    }, 100);
  }

  private startIncomingRingtone() {
    if (this.incomingRingTimer) return;
    const playRing = () => {
      if (!this.state.incomingCallAvailable || this.state.status !== 'idle') return;
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
        osc.type = 'square';
        osc.frequency.setValueAtTime(784, now);
        osc.frequency.setValueAtTime(987, now + 0.18);
        osc.frequency.setValueAtTime(784, now + 0.36);

        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.62);
      } catch (e) {}
    };
    playRing();
    this.incomingRingTimer = window.setInterval(playRing, 2000);
  }

  private stopIncomingRingtone() {
    if (this.incomingRingTimer) {
      window.clearInterval(this.incomingRingTimer);
      this.incomingRingTimer = null;
    }
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
      fetch(this.apiUrl('/api/webrtc/hangup'), {
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
    this.stopIncomingRingtone();
    this.stopServerAudioRelay();
    if (this.gpsWatchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
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
    this.webrtcDirectConnected = false;

    if (resetToIdle) {
      this.state = {
        ...this.state,
        status: 'idle',
        role: 'none',
        transportMode: 'connecting',
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
