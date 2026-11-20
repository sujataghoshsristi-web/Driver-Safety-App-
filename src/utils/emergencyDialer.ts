/**
 * Internet Server + Global Cross-IP WSS + WebRTC Two-Way Voice Call & Live Phone GPS Map Engine
 *
 * Works across ANY 2 different IPs (Phone on Mobile Data / Wi-Fi IP #1 <-> Laptop on Internet / Wi-Fi IP #2)
 * and across ANY app URLs (ais-dev, ais-pre, Android APK, GitHub build, localhost):
 * 1. Global Real-Time WSS Voice & GPS Bus (crossIpVoiceBus over MQTT-over-WSS ports 8084/8884)
 * 2. Express HTTP Server Live Audio & GPS Relay (/api/webrtc/audio & /api/webrtc/location)
 * 3. Direct WebRTC P2P + TURN (STUN + OpenRelay TURN over port 80/443 TCP & UDP)
 */

import { espManager } from './espManager';
import { crossIpVoiceBus, CrossIpBusPacket } from './crossIpVoiceBus';

const STORAGE_KEY = 'drivelock_emergency_phone_number';
const SERVER_URL_STORAGE_KEY = 'drivelock_call_server_url';
const AUTO_ANSWER_STORAGE_KEY = 'drivelock_laptop_auto_answer';

export const GLOBAL_DISPATCH_ROOM = 'DRIVELOCK_DISPATCH';
export const DEFAULT_EMERGENCY_PHONE_NUMBER = 'DISPATCH';
export const DEFAULT_CLOUD_SERVER_URL =
  'https://ais-pre-x24utjildnuq7js2diaf2v-1003004681042.asia-southeast1.run.app';

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
  return DEFAULT_EMERGENCY_PHONE_NUMBER;
};

const getDefaultServerBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(SERVER_URL_STORAGE_KEY);
      if (saved !== null && saved.trim().length > 0) {
        return saved.trim().replace(/\/+$/, '');
      }
      const isNativeApk =
        window.location.protocol === 'capacitor:' ||
        Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
        (window.location.hostname === 'localhost' &&
          !window.location.port &&
          /Android/i.test(navigator.userAgent || ''));
      if (isNativeApk) {
        return DEFAULT_CLOUD_SERVER_URL;
      }
    } catch (e) {}
  }
  return '';
};

const getSavedAutoAnswer = (): boolean => {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(AUTO_ANSWER_STORAGE_KEY);
      if (saved === 'false') return false;
      if (saved === 'true') return true;
      const ua = navigator.userAgent || '';
      if (!/Android|iPhone|iPod|Mobile/i.test(ua)) {
        return true;
      }
    } catch (e) {}
  }
  return false;
};

export let EMERGENCY_PHONE_NUMBER = DEFAULT_EMERGENCY_PHONE_NUMBER;

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
  micLevel: number;
  remoteVoiceLevel: number;
  peerConnected: boolean;
  incomingCallAvailable: boolean;
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
    phoneNumber: DEFAULT_EMERGENCY_PHONE_NUMBER,
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

  private readonly senderId: string = crossIpVoiceBus.getSenderId();
  private listeners: Set<CallStateListener> = new Set();
  private audioCtx: AudioContext | null = null;
  private masterSpeakerGain: GainNode | null = null;
  private ringTimer: number | null = null;
  private incomingRingTimer: number | null = null;
  private durationInterval: number | null = null;
  private meterInterval: number | null = null;
  private signalPollInterval: number | null = null;
  private incomingWatchInterval: number | null = null;
  private gpsWatchId: number | null = null;
  private audioRelayPullInterval: number | null = null;
  private pcmProcessorNode: ScriptProcessorNode | null = null;
  private pcmSourceNode: MediaStreamAudioSourceNode | null = null;
  private pcmZeroGainNode: GainNode | null = null;
  private sampleAccumulator: number[] = [];
  private httpPendingPackets: Array<{
    packetId: string;
    pcm16: string;
    role: 'caller' | 'callee';
  }> = [];
  private scriptProcessorActive: boolean = false;
  private micOpenTimeMs: number = 0;
  private lastScriptProcessorMs: number = 0;
  private lastPlayedAudioSeq: number = 0;
  private nextPlayTime: number = 0;
  private lastRelayVoiceTimestamp: number = 0;
  private lastWssAudioMs: number = 0;
  private isPullingAudio: boolean = false;
  private isPostingAudio: boolean = false;
  private isStartingOrAnswering: boolean = false;
  private isPrewarmingMic: boolean = false;
  private deviceMode: 'phone' | 'laptop' = 'phone';
  private lastCallInitiatedByMeAt: number = 0;
  private playedPacketIds: Set<string> = new Set();

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
      const ua = navigator.userAgent || '';
      const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';
      if (!/Android|iPhone|iPod|Mobile/i.test(ua) && /Win|Mac|Linux x86|CrOS/i.test(platform)) {
        this.deviceMode = 'laptop';
      }

      crossIpVoiceBus.setRoomId(GLOBAL_DISPATCH_ROOM);
      crossIpVoiceBus.subscribe((packet) => {
        this.handleCrossIpPacket(packet);
      });

      const unlockAudio = () => {
        try {
          const ctx = this.ensureAudioContext();
          if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          if (this.deviceMode === 'laptop' && !this.micStream && !this.isPrewarmingMic) {
            this.prewarmMicrophone().catch(() => {});
          }
        } catch (e) {}
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });

      this.incomingWatchInterval = window.setInterval(() => {
        this.checkForIncomingCall();
      }, 750);
    }
  }

  public setDeviceMode(mode: 'phone' | 'laptop') {
    this.deviceMode = mode;
    if (mode === 'phone' && this.state.incomingCallAvailable) {
      this.stopIncomingRingtone();
      this.state.incomingCallAvailable = false;
      this.state.incomingCallerInfo = '';
      this.emit();
    } else if (mode === 'laptop') {
      this.prewarmMicrophone().catch(() => {});
    }
  }

  public async prewarmMicrophone(): Promise<MediaStream | null> {
    if (this.micStream && this.micStream.getAudioTracks().some((t) => t.readyState === 'live')) {
      const ctx = this.ensureAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return this.micStream;
    }
    if (this.isPrewarmingMic) return null;
    this.isPrewarmingMic = true;
    try {
      return await this.openLocalMicrophone();
    } finally {
      this.isPrewarmingMic = false;
    }
  }

  private rememberPlayedPacket(packetId?: string): boolean {
    if (!packetId) return false;
    if (this.playedPacketIds.has(packetId)) return true;
    this.playedPacketIds.add(packetId);
    if (this.playedPacketIds.size > 500) {
      const oldest = this.playedPacketIds.values().next().value;
      if (oldest) this.playedPacketIds.delete(oldest);
    }
    return false;
  }

  private apiUrl(path: string): string {
    const base = (this.state.serverUrl || '').trim().replace(/\/+$/, '');
    return base ? `${base}${path}` : path;
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
        this.masterSpeakerGain = null;
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (!this.masterSpeakerGain && this.audioCtx) {
        this.masterSpeakerGain = this.audioCtx.createGain();
        this.masterSpeakerGain.gain.value = 1.85;
        this.masterSpeakerGain.connect(this.audioCtx.destination);
      }
      return this.audioCtx;
    } catch (e) {
      return null;
    }
  }

  /**
   * Handles real-time packets arriving over the Global Cross-IP WSS Bus (MQTT-over-WSS)
   */
  private handleCrossIpPacket(packet: CrossIpBusPacket) {
    if (!packet || packet.senderId === this.senderId) return;

    if (packet.location && (packet.location.latitude || packet.location.longitude)) {
      this.state.remoteLocation = packet.location;
      const lastPt = this.state.locationTrail[this.state.locationTrail.length - 1];
      if (
        !lastPt ||
        Math.abs(lastPt.lat - packet.location.latitude) > 0.00002 ||
        Math.abs(lastPt.lon - packet.location.longitude) > 0.00002
      ) {
        this.state.locationTrail = [
          ...this.state.locationTrail,
          {
            lat: packet.location.latitude,
            lon: packet.location.longitude,
            ts: Date.now(),
          },
        ].slice(-40);
      }
    }

    if (packet.type === 'hangup') {
      if (this.state.status !== 'idle') {
        this.endCall(false);
      } else if (this.state.incomingCallAvailable) {
        this.stopIncomingRingtone();
        this.state.incomingCallAvailable = false;
        this.state.incomingCallerInfo = '';
        this.emit();
      }
      return;
    }

    if (packet.type === 'ring') {
      if (this.state.status === 'ringing' || this.state.status === 'connected') {
        this.onPeerVoiceConnected();
        crossIpVoiceBus.publish({
          type: 'answer',
          role: 'callee',
        });
        return;
      }

      // Never show Incoming Call popup on the Phone Cab Docker or the device that just initiated the call
      if (
        this.deviceMode === 'phone' ||
        Date.now() - this.lastCallInitiatedByMeAt < 12000
      ) {
        return;
      }

      const loc = packet.location || this.state.remoteLocation;
      const callerUnit = loc?.unitNumber || 'PHONE CAB UNIT';
      const callerGps =
        loc?.latitude && loc?.longitude
          ? `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}`
          : '';
      this.state.incomingCallerInfo = `Incoming Emergency Call from ${callerUnit}${
        callerGps ? ` (GPS: ${callerGps})` : ''
      }`;
      if (!this.state.incomingCallAvailable) {
        this.state.incomingCallAvailable = true;
        this.startIncomingRingtone();
        if (this.state.autoAnswerOnLaptop) {
          this.answerIncomingCall();
          return;
        }
      }
      this.emit();
      return;
    }

    if (packet.type === 'answer') {
      if (this.state.status === 'ringing') {
        this.onPeerVoiceConnected();
      }
      return;
    }

    if (packet.type === 'audio' && packet.pcm16) {
      this.lastWssAudioMs = Date.now();
      if (this.state.status === 'ringing') {
        this.onPeerVoiceConnected();
        crossIpVoiceBus.publish({
          type: 'answer',
          role: 'callee',
        });
      } else if (
        this.state.status === 'idle' &&
        this.deviceMode === 'laptop' &&
        Date.now() - this.lastCallInitiatedByMeAt >= 12000
      ) {
        if (this.state.autoAnswerOnLaptop) {
          this.answerIncomingCall();
        } else if (!this.state.incomingCallAvailable) {
          this.state.incomingCallAvailable = true;
          this.state.incomingCallerInfo =
            'Incoming Live Emergency Voice — Click Answer to Talk!';
          this.startIncomingRingtone();
          this.emit();
        }
      }

      if (this.state.status === 'connected' || this.state.status === 'ringing') {
        if (!this.rememberPlayedPacket(packet.id)) {
          this.playIncomingPcm16(packet.pcm16, packet.sampleRate || 8000);
        }
      }
    }
  }

  public getState(): EmergencyCallState {
    return this.state;
  }

  public getPhoneNumber(): string {
    return DEFAULT_EMERGENCY_PHONE_NUMBER;
  }

  public setPhoneNumber(_newNumber: string) {
    // Universal dispatch room used automatically — no number matching required
    this.state.phoneNumber = DEFAULT_EMERGENCY_PHONE_NUMBER;
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
    const updatedLoc: RemotePhoneLocation = {
      ...this.state.remoteLocation,
      ...loc,
      updatedAt: now,
    };
    this.state.remoteLocation = updatedLoc;

    const isCalling = this.state.status !== 'idle';
    if (isCalling || now - this.lastIdleLocationPushMs >= 2000) {
      this.lastIdleLocationPushMs = now;
      crossIpVoiceBus.publish({
        type: 'gps',
        role: this.state.role === 'callee' ? 'callee' : 'caller',
        location: updatedLoc,
      });
      fetch(this.apiUrl('/api/webrtc/location'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: GLOBAL_DISPATCH_ROOM,
          senderId: this.senderId,
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
    _targetNumber?: string,
    _fnPayload?: PlaceImmediateCallPayload
  ): boolean {
    return false;
  }

  public dialCellularSimCall(_targetNumber?: string) {
    // SIM card calls removed; use 2-way internet voice dispatch directly
    if (this.state.status === 'idle') {
      this.startInstantCall(GLOBAL_DISPATCH_ROOM, this.lastContext);
    }
  }

  public async executeVoiceCommandCall(
    utterance: string,
    context?: EmergencyCallContext
  ): Promise<PlaceImmediateCallPayload> {
    const defaultNum = DEFAULT_EMERGENCY_PHONE_NUMBER;
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
      this.state.lastFunctionCall = data;
      await this.startInstantCall(GLOBAL_DISPATCH_ROOM, context, data);
      return data;
    } catch (e) {
      const fallbackPayload: PlaceImmediateCallPayload = {
        functionCall: {
          name: 'place_immediate_call',
          args: {
            target: 'Emergency Dispatch',
          },
        },
        resolvedPhoneNumber: defaultNum,
      };
      this.state.lastFunctionCall = fallbackPayload;
      await this.startInstantCall(GLOBAL_DISPATCH_ROOM, context, fallbackPayload);
      return fallbackPayload;
    }
  }

  /**
   * Starts a REAL Internet/Wi-Fi Call across 2 IPs + streams real Phone GPS & 2-way voice immediately!
   */
  public async startInstantCall(
    _phoneNumber?: string,
    context?: EmergencyCallContext,
    explicitPayload?: PlaceImmediateCallPayload,
    skipRoomCheck: boolean = false
  ): Promise<void> {
    if (
      this.isStartingOrAnswering ||
      this.state.status === 'ringing' ||
      this.state.status === 'connected'
    ) {
      return;
    }

    if (!skipRoomCheck && this.state.incomingCallAvailable) {
      return this.answerIncomingCall(GLOBAL_DISPATCH_ROOM, true);
    }

    this.isStartingOrAnswering = true;
    try {
      this.ensureAudioContext();
      this.lastContext = context;

      const fnPayload: PlaceImmediateCallPayload = explicitPayload || {
        functionCall: {
          name: 'place_immediate_call',
          args: {
            target: 'DISPATCH',
          },
        },
        resolvedPhoneNumber: DEFAULT_EMERGENCY_PHONE_NUMBER,
      };
      this.state.lastFunctionCall = fnPayload;

      try {
        espManager.sendCommand('CALL:DISPATCH');
      } catch (e) {}

      this.cleanupSession(false);

      const unit = context?.unitNumber || 'AUTO-101';
      const lat = context?.latitude ?? this.state.remoteLocation?.latitude ?? 37.7749;
      const lon = context?.longitude ?? this.state.remoteLocation?.longitude ?? -122.4194;

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

      // Set status = 'ringing' SYNCHRONOUSLY before any await so concurrent calls cannot re-enter!
      this.lastCallInitiatedByMeAt = Date.now();
      this.stopIncomingRingtone();
      this.state = {
        ...this.state,
        status: 'ringing',
        role: 'caller',
        transportMode: 'server-relay',
        phoneNumber: DEFAULT_EMERGENCY_PHONE_NUMBER,
        durationSeconds: 0,
        micActive: Boolean(this.micStream),
        micMuted: false,
        isMuted: false,
        speakerphoneOn: true,
        micLevel: 0,
        remoteVoiceLevel: 0,
        peerConnected: false,
        incomingCallAvailable: false,
        incomingCallerInfo: '',
        remoteLocation: initialLoc,
        locationTrail: [{ lat, lon, ts: Date.now() }],
        dispatcherSpeaking: false,
        dispatchTranscript: `Calling Control Room over Cross-IP Server & streaming live GPS (${lat.toFixed(5)}, ${lon.toFixed(5)})...`,
        lastTranscript: `RINGING CONTROL ROOM @ GPS ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        lastFunctionCall: fnPayload,
      };
      this.emit();

      // Broadcast ring packet over Global Cross-IP WSS Bus immediately
      crossIpVoiceBus.publish({
        type: 'ring',
        role: 'caller',
        location: initialLoc,
      });

      this.startRingbackTone();
      this.startPhoneGpsStreaming(GLOBAL_DISPATCH_ROOM, initialLoc);

      const stream = await this.openLocalMicrophone();

      // Start 2-way audio relay IMMEDIATELY
      this.startServerAudioRelay(GLOBAL_DISPATCH_ROOM, 'caller', 0);

      let localOffer: RTCSessionDescriptionInit | null = null;
      try {
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
            fetch(this.apiUrl('/api/webrtc/candidate'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roomId: GLOBAL_DISPATCH_ROOM,
                role: 'caller',
                candidate: event.candidate.toJSON(),
              }),
            }).catch(() => {});
          }
        };

        pc.oniceconnectionstatechange = () => {
          const iceState = pc.iceConnectionState;
          if (iceState === 'connected' || iceState === 'completed') {
            this.onPeerVoiceConnected();
          }
        };

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
        });
        await pc.setLocalDescription(offer);
        localOffer = pc.localDescription;
      } catch (e) {
        localOffer = { type: 'offer', sdp: '' };
      }

      try {
        const offerRes = await fetch(this.apiUrl('/api/webrtc/offer'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: GLOBAL_DISPATCH_ROOM,
            senderId: this.senderId,
            offer: localOffer || { type: 'offer', sdp: '' },
            callerContext: initialLoc,
          }),
        });
        if (offerRes.ok) {
          const offerData = await offerRes.json();
          if (offerData?.room?.status === 'connected') {
            this.onPeerVoiceConnected();
          }
        }
      } catch (e) {}

      // Poll signaling server & broadcast WSS ring heartbeat until connected
      this.signalPollInterval = window.setInterval(async () => {
        if (this.state.status === 'idle') return;

        if (this.state.status === 'ringing') {
          crossIpVoiceBus.publish({
            type: 'ring',
            role: 'caller',
            location: this.state.remoteLocation || initialLoc,
          });
        }

        try {
          const res = await fetch(
            this.apiUrl(`/api/webrtc/room/${GLOBAL_DISPATCH_ROOM}`)
          );
          if (!res.ok) return;
          const room = await res.json();

          if (room.liveLocation && room.liveLocation.updatedAt) {
            this.state.remoteLocation = room.liveLocation;
          }

          const isAnswered = room.status === 'connected' || Boolean(room.answer);
          if (isAnswered) {
            if (
              this.peerConnection &&
              room.answer &&
              room.answer.sdp &&
              !this.peerConnection.currentRemoteDescription
            ) {
              try {
                await this.peerConnection.setRemoteDescription(
                  new RTCSessionDescription(room.answer)
                );
              } catch (e) {}
            }
            if (this.state.status !== 'connected') {
              this.onPeerVoiceConnected();
            }
          }

          if (
            this.peerConnection &&
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
      }, 700);
    } finally {
      this.isStartingOrAnswering = false;
    }
  }

  /**
   * Answers the Emergency Call on Laptop or Phone across any 2 IPs and starts 2-way voice immediately!
   */
  public async answerIncomingCall(
    _targetRoomNumber?: string,
    _skipFallbackStart: boolean = false
  ): Promise<void> {
    if (this.isStartingOrAnswering || this.state.status === 'connected') {
      return;
    }

    // If we were already ringing as caller, simply transition to connected without tearing down mic!
    if (this.state.status === 'ringing') {
      this.onPeerVoiceConnected();
      crossIpVoiceBus.publish({
        type: 'answer',
        role: 'callee',
      });
      fetch(this.apiUrl('/api/webrtc/answer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: GLOBAL_DISPATCH_ROOM,
          senderId: this.senderId,
          answer: { type: 'answer', sdp: '' },
        }),
      }).catch(() => {});
      return;
    }

    this.isStartingOrAnswering = true;
    try {
      this.ensureAudioContext();
      this.stopIncomingRingtone();
      this.cleanupSession(false);

      // Mark status = 'connected' SYNCHRONOUSLY before any await to prevent re-entrancy!
      this.state.role = 'callee';
      this.state.incomingCallAvailable = false;
      this.onPeerVoiceConnected();

      // Immediately notify caller over Global WSS Bus that we answered!
      crossIpVoiceBus.publish({
        type: 'answer',
        role: 'callee',
      });

      const stream = await this.openLocalMicrophone();

      let room: any = null;
      try {
        const res = await fetch(this.apiUrl(`/api/webrtc/room/${GLOBAL_DISPATCH_ROOM}`));
        if (res.ok) {
          room = await res.json();
        }
      } catch (e) {}

      if (room?.liveLocation) {
        this.state.remoteLocation = room.liveLocation;
      }
      if (Array.isArray(room?.locationTrail) && room.locationTrail.length > 0) {
        this.state.locationTrail = room.locationTrail;
      }

      let localAnswer: RTCSessionDescriptionInit | null = null;

      if (room?.offer && room.offer.sdp) {
        try {
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
              fetch(this.apiUrl('/api/webrtc/candidate'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  roomId: GLOBAL_DISPATCH_ROOM,
                  role: 'callee',
                  candidate: event.candidate.toJSON(),
                }),
              }).catch(() => {});
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
          localAnswer = pc.localDescription;
        } catch (e) {
          localAnswer = { type: 'answer', sdp: '' };
        }
      } else {
        localAnswer = { type: 'answer', sdp: '' };
      }

      fetch(this.apiUrl('/api/webrtc/answer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: GLOBAL_DISPATCH_ROOM,
          senderId: this.senderId,
          answer: localAnswer || { type: 'answer', sdp: '' },
        }),
      }).catch(() => {});

      // Start 2-Way Voice Streaming immediately
      this.startServerAudioRelay(
        GLOBAL_DISPATCH_ROOM,
        'callee',
        Math.max(0, (Number(room?.latestAudioSeq) || 0) - 2)
      );

      this.signalPollInterval = window.setInterval(async () => {
        if (this.state.status === 'idle') return;
        try {
          const pollRes = await fetch(
            this.apiUrl(`/api/webrtc/room/${GLOBAL_DISPATCH_ROOM}`)
          );
          if (!pollRes.ok) return;
          const latestRoom = await pollRes.json();
          if (latestRoom.liveLocation) {
            this.state.remoteLocation = latestRoom.liveLocation;
          }
          if (Array.isArray(latestRoom.locationTrail) && latestRoom.locationTrail.length > 0) {
            this.state.locationTrail = latestRoom.locationTrail;
          }
          if (
            this.peerConnection &&
            this.peerConnection.currentRemoteDescription &&
            Array.isArray(latestRoom.callerCandidates)
          ) {
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
      }, 700);
    } finally {
      this.isStartingOrAnswering = false;
    }
  }

  private startPhoneGpsStreaming(_roomId: string, fallbackLoc: RemotePhoneLocation) {
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

            crossIpVoiceBus.publish({
              type: 'gps',
              role: this.state.role === 'callee' ? 'callee' : 'caller',
              location: loc,
            });

            fetch(this.apiUrl('/api/webrtc/location'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roomId: GLOBAL_DISPATCH_ROOM,
                senderId: this.senderId,
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

  private encodeInt16ToBase64(int16: Int16Array): string {
    const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + chunkSize))
      );
    }
    return window.btoa(binary);
  }

  private decodeBase64ToFloat32WithAgc(b64: string): Float32Array {
    const binary = window.atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, sampleCount);
    const float32 = new Float32Array(sampleCount);

    let maxAbs = 0;
    for (let i = 0; i < sampleCount; i++) {
      const v = int16[i] / 32768.0;
      float32[i] = v;
      const a = Math.abs(v);
      if (a > maxAbs) maxAbs = a;
    }

    // Automatic Gain Control (AGC): boost speech up to 6.0x with soft-clipping
    const gain = maxAbs > 0.005 ? Math.min(6.0, Math.max(1.6, 0.88 / maxAbs)) : 1.8;
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = Math.tanh(float32[i] * gain);
    }
    return float32;
  }

  private playWavFallback(floatSamples: Float32Array, sampleRate: number) {
    try {
      const numSamples = floatSamples.length;
      const buffer = new ArrayBuffer(44 + numSamples * 2);
      const view = new DataView(buffer);
      const writeStr = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      };
      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + numSamples * 2, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, 'data');
      view.setUint32(40, numSamples * 2, true);
      let offset = 44;
      for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, floatSamples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const wavAudio = new Audio(`data:audio/wav;base64,${window.btoa(binary)}`);
      wavAudio.volume = 1.0;
      wavAudio.play().catch(() => {});
    } catch (e) {}
  }

  /**
   * Plays an incoming PCM16 audio chunk at native AudioContext sampleRate for 100% compatibility
   * on Android WebView, Mobile Chrome, Safari, and Desktop browsers.
   */
  private playIncomingPcm16(pcm16Base64: string, chunkSampleRate: number = 8000) {
    try {
      const floatSamples = this.decodeBase64ToFloat32WithAgc(pcm16Base64);
      if (floatSamples.length === 0) return;

      let sumSq = 0;
      for (let i = 0; i < floatSamples.length; i++) {
        sumSq += floatSamples[i] * floatSamples[i];
      }
      const rms = Math.sqrt(sumSq / floatSamples.length);
      const voiceLvl = Math.min(100, Math.round(rms * 240));

      this.lastRelayVoiceTimestamp = Date.now();
      this.state.remoteVoiceLevel = voiceLvl;
      this.state.dispatcherSpeaking = voiceLvl > 8;
      this.state.transportMode = 'server-relay';
      this.emit();

      if (this.remoteAudioEl) {
        this.remoteAudioEl.muted = true;
      }

      if (!this.state.speakerphoneOn) return;

      const playCtx = this.ensureAudioContext();
      if (!playCtx || playCtx.state !== 'running') {
        if (playCtx && playCtx.state === 'suspended') {
          playCtx.resume().catch(() => {});
        }
        this.playWavFallback(floatSamples, chunkSampleRate || 8000);
        return;
      }

      // Resample to native playCtx.sampleRate in JS so mobile WebViews never fail on 8kHz buffers
      const nativeSr = playCtx.sampleRate || 48000;
      const srcSr = chunkSampleRate || 8000;
      const outLen = Math.max(1, Math.round((floatSamples.length * nativeSr) / srcSr));
      const audioBuffer = playCtx.createBuffer(1, outLen, nativeSr);
      const outChannel = audioBuffer.getChannelData(0);

      const step = (floatSamples.length - 1) / Math.max(1, outLen - 1);
      for (let i = 0; i < outLen; i++) {
        const pos = i * step;
        const idx = Math.floor(pos);
        const frac = pos - idx;
        const s0 = floatSamples[idx] ?? 0;
        const s1 = floatSamples[Math.min(floatSamples.length - 1, idx + 1)] ?? s0;
        outChannel[i] = s0 + (s1 - s0) * frac;
      }

      // 24-sample micro-fade at edges to prevent clicks when resyncing
      const fadeSamples = Math.min(24, Math.floor(outLen / 8));
      for (let i = 0; i < fadeSamples; i++) {
        const g = i / fadeSamples;
        outChannel[i] *= g;
        outChannel[outLen - 1 - i] *= g;
      }

      const bufferSource = playCtx.createBufferSource();
      bufferSource.buffer = audioBuffer;
      if (this.masterSpeakerGain) {
        bufferSource.connect(this.masterSpeakerGain);
      } else {
        bufferSource.connect(playCtx.destination);
      }

      const nowTime = playCtx.currentTime;
      if (this.nextPlayTime < nowTime) {
        this.nextPlayTime = nowTime + 0.035;
      } else if (this.nextPlayTime > nowTime + 0.32) {
        this.nextPlayTime = nowTime + 0.05;
      }
      bufferSource.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
    } catch (e) {}
  }

  private flushHttpAudioQueue() {
    if (this.isPostingAudio || this.httpPendingPackets.length === 0) return;
    if (this.state.status === 'idle' || this.state.micMuted) {
      this.httpPendingPackets = [];
      return;
    }

    // Keep at most 6 packets (~720ms) in HTTP fallback queue so HTTP never lags behind real time
    if (this.httpPendingPackets.length > 6) {
      this.httpPendingPackets = this.httpPendingPackets.slice(-4);
    }

    const pkt = this.httpPendingPackets.shift()!;
    this.isPostingAudio = true;
    fetch(this.apiUrl('/api/webrtc/audio'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: GLOBAL_DISPATCH_ROOM,
        packetId: pkt.packetId,
        senderId: this.senderId,
        role: pkt.role,
        mimeType: 'audio/pcm;rate=8000',
        pcm16: pkt.pcm16,
        sampleRate: 8000,
      }),
    })
      .catch(() => {})
      .finally(() => {
        this.isPostingAudio = false;
        if (this.httpPendingPackets.length > 0) {
          this.flushHttpAudioQueue();
        }
      });
  }

  /**
   * Downsamples raw float microphone samples to 8000 Hz Int16 PCM and transmits over BOTH
   * the Global Cross-IP WSS Bus and the Express /api/webrtc/audio endpoint using the SAME packetId.
   */
  private ingestLocalMicSamples(inputData: Float32Array, inputSampleRate: number) {
    if (this.state.status === 'idle' || this.state.micMuted) {
      this.sampleAccumulator = [];
      this.httpPendingPackets = [];
      return;
    }

    const targetSampleRate = 8000;
    const ratio = Math.max(1, inputSampleRate / targetSampleRate);
    const outLength = Math.max(1, Math.floor(inputData.length / ratio));

    for (let i = 0; i < outLength; i++) {
      const idx = Math.min(inputData.length - 1, Math.floor(i * ratio));
      const boosted = Math.tanh(inputData[idx] * 1.9);
      this.sampleAccumulator.push(
        boosted < 0 ? Math.round(boosted * 0x8000) : Math.round(boosted * 0x7fff)
      );
    }

    // Flush every 960 samples (120ms at 8000 Hz) for ultra-low latency
    while (this.sampleAccumulator.length >= 960) {
      const slice = this.sampleAccumulator.splice(0, 960);
      const int16Packet = new Int16Array(slice);
      const pcm16Base64 = this.encodeInt16ToBase64(int16Packet);
      const myRole = this.state.role === 'callee' ? 'callee' : 'caller';
      const packetId = `${this.senderId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      this.rememberPlayedPacket(packetId);

      // 1. Instant Global Cross-IP WSS Bus broadcast
      crossIpVoiceBus.publish({
        id: packetId,
        type: 'audio',
        role: myRole,
        pcm16: pcm16Base64,
        sampleRate: targetSampleRate,
      });

      // 2. Queue into HTTP + Server-to-Server WSS bridge with the EXACT SAME packetId
      this.httpPendingPackets.push({
        packetId,
        pcm16: pcm16Base64,
        role: myRole,
      });
      this.flushHttpAudioQueue();
    }
  }

  private startServerAudioRelay(
    _roomId: string,
    myRole: 'caller' | 'callee',
    initialSeq: number = 0
  ) {
    if (this.audioRelayPullInterval) {
      window.clearInterval(this.audioRelayPullInterval);
      this.audioRelayPullInterval = null;
    }
    this.lastPlayedAudioSeq = initialSeq;
    this.nextPlayTime = 0;
    this.isPullingAudio = false;

    // Continuously poll Express server for remote audio packets; deduplicate by packetId
    this.audioRelayPullInterval = window.setInterval(async () => {
      if (this.state.status === 'idle' || this.isPullingAudio) return;

      this.isPullingAudio = true;
      try {
        const res = await fetch(
          this.apiUrl(
            `/api/webrtc/audio/${GLOBAL_DISPATCH_ROOM}/${myRole}?after=${
              this.lastPlayedAudioSeq
            }&senderId=${encodeURIComponent(this.senderId)}`
          )
        );
        if (!res.ok) {
          this.isPullingAudio = false;
          return;
        }
        const data = await res.json();
        if (Array.isArray(data.chunks) && data.chunks.length > 0) {
          if (this.state.status === 'ringing') {
            this.onPeerVoiceConnected();
          }
          const chunksToPlay =
            data.chunks.length > 5 ? data.chunks.slice(data.chunks.length - 4) : data.chunks;

          for (const chunk of chunksToPlay) {
            if (chunk.seq > this.lastPlayedAudioSeq) {
              this.lastPlayedAudioSeq = chunk.seq;
              if (chunk.pcm16 && !this.rememberPlayedPacket(chunk.packetId)) {
                this.playIncomingPcm16(chunk.pcm16, Number(chunk.sampleRate) || 8000);
              }
            }
          }
        }
      } catch (e) {
      } finally {
        this.isPullingAudio = false;
      }
    }, 110);
  }

  private stopServerAudioRelay() {
    if (this.deviceMode !== 'laptop') {
      if (this.pcmProcessorNode) {
        try {
          this.pcmProcessorNode.onaudioprocess = null;
          this.pcmProcessorNode.disconnect();
        } catch (e) {}
        this.pcmProcessorNode = null;
      }
      if (this.pcmSourceNode) {
        try {
          this.pcmSourceNode.disconnect();
        } catch (e) {}
        this.pcmSourceNode = null;
      }
      if (this.pcmZeroGainNode) {
        try {
          this.pcmZeroGainNode.disconnect();
        } catch (e) {}
        this.pcmZeroGainNode = null;
      }
      this.scriptProcessorActive = false;
    }
    if (this.audioRelayPullInterval) {
      window.clearInterval(this.audioRelayPullInterval);
      this.audioRelayPullInterval = null;
    }
    this.sampleAccumulator = [];
    this.httpPendingPackets = [];
    this.isPullingAudio = false;
    this.isPostingAudio = false;
    this.nextPlayTime = 0;
  }

  private async checkForIncomingCall() {
    if (this.state.status !== 'idle' || this.isStartingOrAnswering) return;
    if (this.deviceMode === 'phone' || Date.now() - this.lastCallInitiatedByMeAt < 12000) {
      return;
    }
    try {
      const res = await fetch(this.apiUrl(`/api/webrtc/room/${GLOBAL_DISPATCH_ROOM}`));
      if (!res.ok) return;
      const room = await res.json();
      const hasRingingOffer = Boolean(
        room &&
          (room.status === 'ringing' || room.status === 'connected') &&
          room.callerSenderId !== this.senderId &&
          (room.offer || room.latestAudioSeq > 0)
      );
      const loc: RemotePhoneLocation | null = room?.liveLocation || null;
      const callerUnit = loc?.unitNumber || room?.callerContext?.unitNumber || 'PHONE CAB UNIT';
      const callerGps =
        loc?.latitude && loc?.longitude
          ? `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}`
          : '';
      const info = hasRingingOffer
        ? `Incoming Emergency Call from ${callerUnit}${callerGps ? ` (GPS: ${callerGps})` : ''}`
        : '';

      if (hasRingingOffer && !this.state.incomingCallAvailable) {
        this.startIncomingRingtone();
        if (this.state.autoAnswerOnLaptop) {
          this.state.remoteLocation = loc;
          this.state.locationTrail = Array.isArray(room?.locationTrail) ? room.locationTrail : [];
          this.answerIncomingCall();
          return;
        }
      }

      if (hasRingingOffer) {
        this.state.incomingCallAvailable = true;
        this.state.incomingCallerInfo = info;
        if (loc) {
          this.state.remoteLocation = loc;
          this.state.locationTrail = Array.isArray(room?.locationTrail) ? room.locationTrail : [];
        }
        this.emit();
      } else if (loc && loc.updatedAt !== this.state.remoteLocation?.updatedAt) {
        this.state.remoteLocation = loc;
        this.state.locationTrail = Array.isArray(room?.locationTrail) ? room.locationTrail : [];
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
      this.state.transportMode = 'server-relay';
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
    if (this.state.status === 'idle') {
      this.startInstantCall(GLOBAL_DISPATCH_ROOM, _context);
    }
  }

  /**
   * Opens local microphone and builds a single continuous WebAudio capture chain:
   * micSourceNode -> localAnalyser -> pcmProcessorNode -> pcmZeroGainNode (0.0001) -> ctx.destination
   * Reuses pre-warmed mic stream if already live for 0ms instant activation on Laptop Control Room.
   */
  private async openLocalMicrophone(): Promise<MediaStream | null> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }

    const ctx = this.ensureAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    let stream: MediaStream | null = this.micStream;
    const hasLiveTrack =
      stream && stream.getAudioTracks().some((t) => t.readyState === 'live');

    if (!hasLiveTrack) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (firstErr) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (secondErr) {
          this.state.micActive = false;
          this.emit();
          return null;
        }
      }
    }

    this.micStream = stream;
    this.state.micActive = true;
    this.micOpenTimeMs = Date.now();
    this.emit();

    if (ctx && stream && (!this.pcmProcessorNode || !this.localAnalyser)) {
      try {
        if (this.pcmProcessorNode) {
          try {
            this.pcmProcessorNode.onaudioprocess = null;
            this.pcmProcessorNode.disconnect();
          } catch (e) {}
        }
        if (this.pcmSourceNode) {
          try {
            this.pcmSourceNode.disconnect();
          } catch (e) {}
        }
        if (this.pcmZeroGainNode) {
          try {
            this.pcmZeroGainNode.disconnect();
          } catch (e) {}
        }

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;

        const processor = ctx.createScriptProcessor(2048, 1, 1);
        const silentGain = ctx.createGain();
        silentGain.gain.value = 0.0001;

        this.pcmSourceNode = source;
        this.localAnalyser = analyser;
        this.pcmProcessorNode = processor;
        this.pcmZeroGainNode = silentGain;
        this.sampleAccumulator = [];
        this.scriptProcessorActive = false;

        processor.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);
          if (!inputData || inputData.length === 0) return;
          if (!this.scriptProcessorActive) {
            for (let i = 0; i < inputData.length; i += 8) {
              if (Math.abs(inputData[i]) > 0.00001) {
                this.scriptProcessorActive = true;
                break;
              }
            }
          }
          if (this.scriptProcessorActive) {
            this.lastScriptProcessorMs = Date.now();
            this.ingestLocalMicSamples(inputData, ctx.sampleRate || 48000);
          }
        };

        source.connect(analyser);
        analyser.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(ctx.destination);
      } catch (e) {}
    }

    this.startAudioLevelMeters();
    return stream;
  }

  private attachRemoteAudioStream(remoteMediaStream: MediaStream) {
    this.remoteStream = remoteMediaStream;
    const audioEl = this.ensureRemoteAudioElement();
    if (audioEl) {
      audioEl.srcObject = remoteMediaStream;
      audioEl.muted = Date.now() - this.lastRelayVoiceTimestamp < 2000;
      audioEl.volume = 1.0;
      audioEl.play().catch(() => {});
    }

    try {
      const ctx = this.ensureAudioContext();
      if (ctx) {
        const remoteSource = ctx.createMediaStreamSource(remoteMediaStream);
        this.remoteAnalyser = ctx.createAnalyser();
        this.remoteAnalyser.fftSize = 256;
        remoteSource.connect(this.remoteAnalyser);
        this.startAudioLevelMeters();
      }
    } catch (e) {}
  }

  private startAudioLevelMeters() {
    if (this.meterInterval) {
      window.clearInterval(this.meterInterval);
    }

    const localFreqData = new Uint8Array(64);
    const localTimeData = new Float32Array(2048);
    const remoteFreqData = new Uint8Array(64);

    this.meterInterval = window.setInterval(() => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      if (this.localAnalyser && !this.state.micMuted) {
        this.localAnalyser.getByteFrequencyData(localFreqData);
        let sum = 0;
        for (let i = 0; i < localFreqData.length; i++) sum += localFreqData[i];
        const avg = sum / localFreqData.length;
        this.state.micLevel = Math.min(100, Math.round((avg / 110) * 100));

        // Failsafe ONLY when ScriptProcessorNode has never fired on this browser (> 650ms after mic open)
        if (
          this.state.status !== 'idle' &&
          !this.scriptProcessorActive &&
          Date.now() - this.micOpenTimeMs > 650
        ) {
          this.localAnalyser.getFloatTimeDomainData(localTimeData);
          this.ingestLocalMicSamples(localTimeData, 20480);
        }
      } else {
        this.state.micLevel = 0;
      }

      const relayActiveRecently = Date.now() - this.lastRelayVoiceTimestamp < 1500;
      if (this.remoteAudioEl) {
        this.remoteAudioEl.muted = relayActiveRecently;
      }

      let webrtcHasVoice = false;
      if (!relayActiveRecently && this.remoteAnalyser) {
        this.remoteAnalyser.getByteFrequencyData(remoteFreqData);
        let rSum = 0;
        for (let i = 0; i < remoteFreqData.length; i++) rSum += remoteFreqData[i];
        const rAvg = rSum / remoteFreqData.length;
        const iceState = this.peerConnection?.iceConnectionState;
        if (rAvg > 8 && (iceState === 'connected' || iceState === 'completed')) {
          webrtcHasVoice = true;
          this.state.transportMode = 'webrtc-p2p';
          this.state.remoteVoiceLevel = Math.min(100, Math.round((rAvg / 120) * 100));
          this.state.dispatcherSpeaking = this.state.remoteVoiceLevel > 12;
        }
      }

      if (!webrtcHasVoice && Date.now() - this.lastRelayVoiceTimestamp > 380) {
        this.state.remoteVoiceLevel = Math.max(0, Math.round(this.state.remoteVoiceLevel * 0.55));
        if (this.state.remoteVoiceLevel < 8) {
          this.state.remoteVoiceLevel = 0;
          this.state.dispatcherSpeaking = false;
        }
      }

      this.emit();
    }, 100);
  }

  private startIncomingRingtone() {
    if (this.incomingRingTimer) return;
    const playRing = () => {
      if (!this.state.incomingCallAvailable || this.state.status !== 'idle') return;
      try {
        const ctx = this.ensureAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(784, now);
        osc.frequency.setValueAtTime(987, now + 0.18);
        osc.frequency.setValueAtTime(784, now + 0.36);

        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);
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
        const ctx = this.ensureAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.05);
        osc2.stop(now + 1.05);
      } catch (e) {}
    };

    playBurst();
    this.ringTimer = window.setInterval(playBurst, 3000);
  }

  private playPickupClick() {
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.08);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

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
    if (notifyServer) {
      crossIpVoiceBus.publish({
        type: 'hangup',
        role: this.state.role === 'callee' ? 'callee' : 'caller',
      });
      fetch(this.apiUrl('/api/webrtc/hangup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: GLOBAL_DISPATCH_ROOM, senderId: this.senderId }),
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
    if (this.deviceMode !== 'laptop') {
      if (this.meterInterval) {
        window.clearInterval(this.meterInterval);
        this.meterInterval = null;
      }
      if (this.micStream) {
        this.micStream.getTracks().forEach((t) => t.stop());
        this.micStream = null;
      }
      this.localAnalyser = null;
    }
    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = null;
    }
    this.remoteAnalyser = null;

    if (resetToIdle) {
      const keepMic =
        this.deviceMode === 'laptop' &&
        Boolean(this.micStream?.getAudioTracks().some((t) => t.readyState === 'live'));
      this.state = {
        ...this.state,
        status: 'idle',
        role: 'none',
        transportMode: 'connecting',
        phoneNumber: EMERGENCY_PHONE_NUMBER,
        durationSeconds: 0,
        micActive: keepMic,
        micMuted: false,
        isMuted: false,
        speakerphoneOn: true,
        micLevel: keepMic ? this.state.micLevel : 0,
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
