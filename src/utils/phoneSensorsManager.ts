import { PhoneSensorsState } from '../types/telemetry';

export const INITIAL_PHONE_SENSORS_STATE: PhoneSensorsState = {
  isActive: true,
  permissionsGranted: {
    motion: true,
    orientation: true,
    geolocation: false,
    audio: false,
  },
  accel: {
    x: 0,
    y: 0,
    z: 9.81,
    gx: 0.00,
    gy: 0.00,
    gz: 1.00,
    totalG: 1.00,
    peakG: 1.00,
  },
  gyro: {
    alpha: 0,
    beta: 0,
    gamma: 0,
  },
  orientation: {
    compassHeading: 0,
    pitchInclineDeg: 0,
    rollBankDeg: 0,
  },
  gps: {
    active: true,
    latitude: 37.7749,
    longitude: -122.4194,
    altitudeM: null,
    speedKmh: 0,
    headingDeg: 0,
    accuracyM: 2.5,
  },
  sound: {
    active: false,
    decibelsDb: 38,
    peakDecibelsDb: 40,
    noiseCategory: 'quiet',
  },
  battery: {
    supported: false,
    levelPercent: 100,
    isCharging: true,
  },
  network: {
    online: true,
    effectiveType: '4g',
    downlinkMbps: 25,
    rttMs: 35,
  },
  ambientLight: {
    supported: false,
    lux: 350,
    mode: 'day',
  },
  haptics: {
    supported: typeof navigator !== 'undefined' && 'vibrate' in navigator,
    lastTriggered: null,
  },
  wakeLock: {
    supported: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    active: false,
  },
};

type PhoneSensorsListener = (state: PhoneSensorsState) => void;
type CrashCallback = (impactG: number) => void;
export type FastSpeedListener = (data: {
  speedKmh: number;
  rpm: number;
  gx: number;
  gy: number;
  gz: number;
  peakG: number;
}) => void;

class PhoneSensorsManager {
  private state: PhoneSensorsState = { ...INITIAL_PHONE_SENSORS_STATE };
  private listeners: Set<PhoneSensorsListener> = new Set();
  private speedListeners: Set<FastSpeedListener> = new Set();
  private crashListeners: Set<CrashCallback> = new Set();
  private geoWatchId: number | null = null;
  private audioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private audioInterval: number | null = null;
  private wakeLockSentinel: any = null;
  private lightSensor: any = null;

  // High-frequency 60FPS GPS + IMU Sensor Fusion state for zero-lag speedometer
  private lastGpsFix: { lat: number; lon: number; time: number; speedMs: number } | null = null;
  private gpsSpeedMs: number = 0;
  private imuSpeedMs: number = 0;
  private fusedSpeedMs: number = 0;
  private gravX: number = 0;
  private gravY: number = 0;
  private gravZ: number = 9.80665;
  private gravInitialized: boolean = false;
  private lastMotionTimestamp: number = 0;
  private lastCrashTriggerTime: number = 0;
  private emitScheduled: boolean = false;
  private lastEmitTime: number = 0;
  private lastSpeedEmitTime: number = 0;
  private simulatedSpeedHoldUntil: number = 0;

  constructor() {
    this.initStaticSensors();
  }

  /**
   * Injects a target velocity into the 60FPS sensor pipeline (used when testing Over-Speed or Presets)
   * so idle stationary sensors do not immediately overwrite the test velocity.
   */
  public injectSimulatedSpeed(speedKmh: number, holdMs: number = 5500) {
    this.imuSpeedMs = speedKmh / 3.6;
    this.fusedSpeedMs = Math.max(this.gpsSpeedMs, this.imuSpeedMs);
    this.simulatedSpeedHoldUntil = Date.now() + holdMs;
    this.state.gps = {
      ...this.state.gps,
      active: true,
      speedKmh: Math.round(speedKmh),
    };
    this.lastSpeedEmitTime = 0;
    this.emitFastSpeed();
    this.emit(true);
  }

  public getState(): PhoneSensorsState {
    return this.state;
  }

  public subscribe(listener: PhoneSensorsListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Direct 60FPS ultra-low-latency subscription exclusively for the Speedometer dial
   * Bypasses full App.tsx re-renders so the speedometer has zero lag on mobile phones.
   */
  public subscribeSpeed(listener: FastSpeedListener): () => void {
    this.speedListeners.add(listener);
    const speedKmh = this.state.gps.speedKmh;
    listener({
      speedKmh,
      rpm: speedKmh > 0 ? Math.round(850 + speedKmh * 30) : 850,
      gx: this.state.accel.gx,
      gy: this.state.accel.gy,
      gz: this.state.accel.gz,
      peakG: this.state.accel.peakG,
    });
    return () => {
      this.speedListeners.delete(listener);
    };
  }

  private emitFastSpeed() {
    const now = performance.now();
    if (now - this.lastSpeedEmitTime < 16) return; // 60 FPS cap
    this.lastSpeedEmitTime = now;

    const speedKmh = this.state.gps.speedKmh;
    const payload = {
      speedKmh,
      rpm: speedKmh > 0 ? Math.round(850 + speedKmh * 30) : 850,
      gx: this.state.accel.gx,
      gy: this.state.accel.gy,
      gz: this.state.accel.gz,
      peakG: this.state.accel.peakG,
    };
    this.speedListeners.forEach((fn) => fn(payload));
  }

  public onCrashDetected(cb: CrashCallback): () => void {
    this.crashListeners.add(cb);
    return () => {
      this.crashListeners.delete(cb);
    };
  }

  /**
   * Coalesced emitter for full App state (~4-5 Hz so App.tsx never lags the phone CPU)
   */
  private emit(forceImmediate: boolean = false) {
    const now = performance.now();
    if (forceImmediate || now - this.lastEmitTime >= 220) {
      this.lastEmitTime = now;
      this.emitScheduled = false;
      const snapshot = { ...this.state };
      this.listeners.forEach((fn) => fn(snapshot));
      return;
    }

    if (!this.emitScheduled) {
      this.emitScheduled = true;
      window.setTimeout(() => {
        this.lastEmitTime = performance.now();
        this.emitScheduled = false;
        const snapshot = { ...this.state };
        this.listeners.forEach((fn) => fn(snapshot));
      }, 220);
    }
  }

  /**
   * Initializes static APIs and immediately starts GPS + Android Motion/Orientation sensors
   */
  private initStaticSensors() {
    if (typeof window === 'undefined') return;

    // 1. Battery Telemetry
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.updateBattery(battery);
        battery.addEventListener('levelchange', () => this.updateBattery(battery));
        battery.addEventListener('chargingchange', () => this.updateBattery(battery));
      }).catch(() => {
        this.state.battery.supported = false;
      });
    }

    // 2. Cellular Network Information
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn) {
      this.updateNetwork(conn);
      conn.addEventListener('change', () => this.updateNetwork(conn));
    }

    window.addEventListener('online', () => {
      this.state.network.online = true;
      this.emit(true);
    });
    window.addEventListener('offline', () => {
      this.state.network.online = false;
      this.emit(true);
    });

    // 3. Auto-start real GPS + IMU tracking immediately on load
    this.startGpsTracking();
    if (typeof (DeviceMotionEvent as any)?.requestPermission !== 'function') {
      window.addEventListener('devicemotion', this.handleDeviceMotion, { passive: true });
    }
    if (typeof (DeviceOrientationEvent as any)?.requestPermission !== 'function') {
      window.addEventListener('deviceorientation', this.handleDeviceOrientation, { passive: true });
    }
  }

  private updateBattery(battery: any) {
    this.state.battery = {
      supported: true,
      levelPercent: Math.round(battery.level * 100),
      isCharging: battery.charging,
    };
    this.emit();
  }

  private updateNetwork(conn: any) {
    this.state.network = {
      online: navigator.onLine,
      effectiveType: conn.effectiveType || '4g',
      downlinkMbps: conn.downlink || 20,
      rttMs: conn.rtt || 40,
    };
    this.emit();
  }

  /**
   * Arm all active phone hardware sensors (Accelerometer, Gyro, Compass, GPS, Mic, Wake Lock)
   */
  public async armAllSensors(): Promise<boolean> {
    this.state.isActive = true;

    await this.startMotionSensors();
    await this.startOrientationSensors();
    this.startGpsTracking();
    await this.startMicrophoneSoundMeter();
    await this.requestWakeLock();
    this.startAmbientLightSensor();

    this.emit(true);
    return true;
  }

  /**
   * Stop active streaming sensors
   */
  public stopAllSensors() {
    this.state.isActive = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.handleDeviceMotion);
      window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
    }

    if (this.audioInterval) {
      window.clearInterval(this.audioInterval);
      this.audioInterval = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.state.sound.active = false;

    if (this.wakeLockSentinel) {
      this.wakeLockSentinel.release().catch(() => {});
      this.wakeLockSentinel = null;
      this.state.wakeLock.active = false;
    }

    if (this.lightSensor) {
      try {
        this.lightSensor.stop();
      } catch (e) {}
      this.lightSensor = null;
    }

    this.emit(true);
  }

  /**
   * Accelerometer & Gyroscope
   */
  private async startMotionSensors() {
    if (typeof window === 'undefined') return;

    if (typeof (DeviceMotionEvent as any)?.requestPermission === 'function') {
      try {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response === 'granted') {
          this.state.permissionsGranted.motion = true;
          window.addEventListener('devicemotion', this.handleDeviceMotion, { passive: true });
        }
      } catch (err) {
        console.warn('DeviceMotion permission error:', err);
      }
    } else {
      this.state.permissionsGranted.motion = true;
      window.addEventListener('devicemotion', this.handleDeviceMotion, { passive: true });
    }
  }

  private handleDeviceMotion = (e: DeviceMotionEvent) => {
    const now = performance.now();
    const dtSec = this.lastMotionTimestamp > 0 ? Math.min(0.15, (now - this.lastMotionTimestamp) / 1000) : 0.016;
    this.lastMotionTimestamp = now;

    const accGravity = e.accelerationIncludingGravity || e.acceleration;
    let hpLinearMag = 0;

    if (accGravity) {
      const x = accGravity.x ?? 0;
      const y = accGravity.y ?? 0;
      const z = accGravity.z ?? 9.80665;

      // High-pass gravity filter so phones without a hardware gyroscope still get 60Hz linear acceleration
      if (!this.gravInitialized) {
        this.gravX = x;
        this.gravY = y;
        this.gravZ = z;
        this.gravInitialized = true;
      } else {
        this.gravX = 0.82 * this.gravX + 0.18 * x;
        this.gravY = 0.82 * this.gravY + 0.18 * y;
        this.gravZ = 0.82 * this.gravZ + 0.18 * z;
      }

      const linX = x - this.gravX;
      const linY = y - this.gravY;
      const linZ = z - this.gravZ;
      hpLinearMag = Math.sqrt(linX * linX + linY * linY + linZ * linZ);

      const gx = Number((x / 9.80665).toFixed(2));
      const gy = Number((y / 9.80665).toFixed(2));
      const gz = Number((z / 9.80665).toFixed(2));
      const totalG = Number(Math.sqrt(gx * gx + gy * gy + gz * gz).toFixed(2));
      const peakG = Math.max(this.state.accel.peakG, totalG);

      this.state.accel = {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        z: Number(z.toFixed(2)),
        gx,
        gy,
        gz,
        totalG,
        peakG,
      };

      // REAL HARD COLLISION DETECTION:
      // If impact shock exceeds 3.0G on the phone accelerometer
      if (totalG >= 3.0 && Date.now() - this.lastCrashTriggerTime > 6000) {
        this.lastCrashTriggerTime = Date.now();
        this.crashListeners.forEach((cb) => cb(totalG));
      }
    }

    // Instant 60Hz IMU + GPS Complementary Velocity Filter (works on 100% of phones)
    const linearAcc = e.acceleration;
    const hwLinearMag = linearAcc
      ? Math.sqrt((linearAcc.x ?? 0) ** 2 + (linearAcc.y ?? 0) ** 2 + (linearAcc.z ?? 0) ** 2)
      : 0;
    const netDynamicAcc = Math.max(hwLinearMag, hpLinearMag);

    // Deadband of 0.26 m/s^2 filters out idle table noise while responding within 16ms to real movement
    if (netDynamicAcc > 0.26) {
      const gain = netDynamicAcc > 1.5 ? 4.2 : 2.6;
      this.imuSpeedMs = Math.min(35, this.imuSpeedMs + (netDynamicAcc - 0.2) * dtSec * gain);
    } else if (Date.now() > this.simulatedSpeedHoldUntil) {
      // Smooth natural coasting decay when motion stops (unless holding a simulated high-speed test)
      this.imuSpeedMs = this.imuSpeedMs * 0.92;
      if (this.imuSpeedMs < 0.18) this.imuSpeedMs = 0;
    }

    this.fusedSpeedMs = Math.max(this.gpsSpeedMs, this.imuSpeedMs);
    const instantKmh = Math.round(this.fusedSpeedMs * 3.6);

    if (instantKmh !== this.state.gps.speedKmh) {
      this.state.gps = {
        ...this.state.gps,
        active: true,
        speedKmh: instantKmh,
      };
    }

    if (e.rotationRate) {
      this.state.gyro = {
        alpha: Number((e.rotationRate.alpha ?? 0).toFixed(1)),
        beta: Number((e.rotationRate.beta ?? 0).toFixed(1)),
        gamma: Number((e.rotationRate.gamma ?? 0).toFixed(1)),
      };
    }

    // Always emit 60FPS speed directly to the Speedometer dial with zero lag
    this.emitFastSpeed();
    this.emit();
  };

  /**
   * Device Orientation (Compass, Pitch, Roll)
   */
  private async startOrientationSensors() {
    if (typeof window === 'undefined') return;

    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          this.state.permissionsGranted.orientation = true;
          window.addEventListener('deviceorientation', this.handleDeviceOrientation, { passive: true });
        }
      } catch (err) {
        console.warn('DeviceOrientation permission error:', err);
      }
    } else {
      this.state.permissionsGranted.orientation = true;
      window.addEventListener('deviceorientation', this.handleDeviceOrientation, { passive: true });
    }
  }

  private handleDeviceOrientation = (e: DeviceOrientationEvent) => {
    const compassHeading = Math.round(e.alpha ?? 0);
    const pitchInclineDeg = Number((e.beta ?? 0).toFixed(1));
    const rollBankDeg = Number((e.gamma ?? 0).toFixed(1));

    this.state.orientation = {
      compassHeading,
      pitchInclineDeg,
      rollBankDeg,
    };
    this.emit();
  };

  /**
   * Continuous Real Hardware GPS Tracking with zero-cache (maximumAge: 0)
   */
  public startGpsTracking() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (this.geoWatchId !== null) return;

    this.geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = pos.coords;
        const now = Date.now();
        let gpsSpeedMs = 0;

        // 1. Primary: Direct Doppler velocity from hardware GPS chip (m/s)
        if (coords.speed !== null && !isNaN(coords.speed) && coords.speed >= 0) {
          gpsSpeedMs = coords.speed < 0.3 ? 0 : coords.speed;
        } else if (this.lastGpsFix) {
          // 2. Fallback: High-precision Haversine delta distance over delta time
          const dtSec = (now - this.lastGpsFix.time) / 1000;
          if (dtSec > 0.2 && dtSec < 12) {
            const distMeters = this.calculateDistanceMeters(
              this.lastGpsFix.lat,
              this.lastGpsFix.lon,
              coords.latitude,
              coords.longitude
            );
            const minMoveThreshold = Math.max(1.2, (coords.accuracy || 5) * 0.2);
            if (distMeters > minMoveThreshold) {
              gpsSpeedMs = distMeters / dtSec;
            } else {
              gpsSpeedMs = 0;
            }
          }
        }

        this.gpsSpeedMs = gpsSpeedMs;
        // Blend GPS velocity with high-frequency IMU velocity so a delayed 0 from GPS never stalls active movement
        if (gpsSpeedMs > 0) {
          this.imuSpeedMs = gpsSpeedMs;
        }
        this.fusedSpeedMs = Math.max(this.gpsSpeedMs, this.imuSpeedMs);
        const speedKmh = Math.max(0, Math.round(this.fusedSpeedMs * 3.6));

        this.lastGpsFix = {
          lat: coords.latitude,
          lon: coords.longitude,
          time: now,
          speedMs: gpsSpeedMs,
        };

        this.state.permissionsGranted.geolocation = true;
        this.state.gps = {
          active: true,
          latitude: Number(coords.latitude.toFixed(6)),
          longitude: Number(coords.longitude.toFixed(6)),
          altitudeM: coords.altitude !== null ? Math.round(coords.altitude) : null,
          speedKmh,
          headingDeg:
            coords.heading !== null && !isNaN(coords.heading)
              ? Math.round(coords.heading)
              : this.state.orientation.compassHeading,
          accuracyM: Number(coords.accuracy.toFixed(1)),
        };

        this.emitFastSpeed();
        this.emit(true);
      },
      (err) => {
        console.warn('GPS location tracking notice:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0, // Never use stale cached GPS fixes
        timeout: 5000,
      }
    );
  }

  private calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Cabin Ambient Noise (Microphone Decibel Meter)
   */
  public async startMicrophoneSoundMeter(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioStream = stream;
      this.state.permissionsGranted.audio = true;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 256;
      source.connect(this.audioAnalyser);

      const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
      this.state.sound.active = true;

      this.audioInterval = window.setInterval(() => {
        if (!this.audioAnalyser) return;
        this.audioAnalyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;

        const decibelsDb = Math.round(35 + (avg / 255) * 75);
        const peakDecibelsDb = Math.max(this.state.sound.peakDecibelsDb, decibelsDb);

        let noiseCategory: 'quiet' | 'moderate' | 'loud' | 'hazard_spike' = 'quiet';
        if (decibelsDb > 95) noiseCategory = 'hazard_spike';
        else if (decibelsDb > 78) noiseCategory = 'loud';
        else if (decibelsDb > 55) noiseCategory = 'moderate';

        this.state.sound = {
          active: true,
          decibelsDb,
          peakDecibelsDb,
          noiseCategory,
        };
        this.emit();
      }, 150);

      this.emit(true);
      return true;
    } catch (err) {
      console.warn('Microphone permission for sound meter denied:', err);
      return false;
    }
  }

  /**
   * Ambient Light Sensor
   */
  private startAmbientLightSensor() {
    if (typeof window === 'undefined') return;

    if ('AmbientLightSensor' in window) {
      try {
        const sensor = new (window as any).AmbientLightSensor();
        sensor.addEventListener('reading', () => {
          const lux = Math.round(sensor.illuminance);
          this.state.ambientLight = {
            supported: true,
            lux,
            mode: lux < 80 ? 'night_tunnel' : 'day',
          };
          this.emit();
        });
        sensor.start();
        this.lightSensor = sensor;
      } catch (err) {
        this.state.ambientLight.supported = false;
      }
    }
  }

  /**
   * Screen Wake Lock API
   */
  public async requestWakeLock(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }

    try {
      this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      this.state.wakeLock.active = true;
      this.wakeLockSentinel.addEventListener('release', () => {
        this.state.wakeLock.active = false;
        this.emit(true);
      });
      this.emit(true);
      return true;
    } catch (err) {
      console.warn('Screen WakeLock error:', err);
      return false;
    }
  }

  /**
   * Haptic Vibration Triggers
   */
  public triggerHaptic(pattern: number[] | number = [100, 50, 100]) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
        this.state.haptics.lastTriggered = new Date().toLocaleTimeString();
        this.emit(true);
      } catch (e) {}
    }
  }
}

export const phoneSensors = new PhoneSensorsManager();
